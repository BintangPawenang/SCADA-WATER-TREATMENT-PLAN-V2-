from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import Header, HTTPException, status

from .database import Database
from .models import Role, UserInfo


def _load_or_create_secret() -> str:
    env_sec = os.environ.get("WTP_SCADA_SECRET")
    if env_sec:
        return env_sec
    secret_file = os.path.join("data", ".scada_secret")
    os.makedirs("data", exist_ok=True)
    if os.path.exists(secret_file):
        with open(secret_file, "r", encoding="utf-8") as f:
            val = f.read().strip()
            if len(val) >= 32:
                return val
    val = secrets.token_hex(32)
    with open(secret_file, "w", encoding="utf-8") as f:
        f.write(val)
    return val


TOKEN_SECRET = _load_or_create_secret()
TOKEN_TTL_HOURS = 12
LOGIN_MAX_FAILURES = 5
LOGIN_WINDOW_SEC = 300.0
LOGIN_LOCKOUT_SEC = 120.0

ROLE_PERMISSIONS: dict[Role, set[str]] = {
    Role.ADMINISTRATOR: {
        "view",
        "ack_alarm",
        "shelve_alarm",
        "control",
        "lab_entry",
        "maintenance",
        "configure_plant",
        "configure_limits",
        "manage_users",
        "export_reports",
        "view_audit",
    },
    Role.SUPERVISOR: {
        "view",
        "ack_alarm",
        "shelve_alarm",
        "control",
        "lab_entry",
        "maintenance",
        "configure_limits",
        "export_reports",
        "view_audit",
    },
    Role.OPERATOR: {
        "view",
        "ack_alarm",
        "control",
        "lab_entry",
        "export_reports",
    },
    Role.ENGINEER: {
        "view",
        "ack_alarm",
        "configure_plant",
        "configure_limits",
        "export_reports",
        "view_audit",
    },
    Role.MAINTENANCE: {
        "view",
        "ack_alarm",
        "maintenance",
        "export_reports",
    },
    Role.VIEWER: {
        "view",
        "export_reports",
    },
}


def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return base64.b64encode(dk).decode("ascii"), salt


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    computed, _ = hash_password(password, salt)
    return hmac.compare_digest(computed, stored_hash)


def create_token(username: str, role: Role) -> str:
    payload = {
        "sub": username,
        "role": role.value,
        "exp": (datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS)).isoformat(),
    }
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    sig = hmac.new(TOKEN_SECRET.encode("utf-8"), raw.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def decode_token(token: str) -> dict[str, Any]:
    try:
        raw, sig = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format") from exc

    expected = hmac.new(TOKEN_SECRET.encode("utf-8"), raw.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token signature")

    try:
        payload = json.loads(base64.urlsafe_b64decode(raw.encode("ascii")).decode("utf-8"))
        exp = datetime.fromisoformat(payload["exp"])
        if "sub" not in payload or "role" not in payload:
            raise ValueError("Missing claims")
    except (binascii.Error, json.JSONDecodeError, UnicodeDecodeError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed token payload") from exc

    if datetime.now(timezone.utc) > exp:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    return payload


class AuthService:
    def __init__(self, db: Database) -> None:
        self.db = db
        self._failed_attempts: dict[str, list[float]] = {}
        self._locked_until: dict[str, float] = {}
        self._seed_default_users()

    def _seed_default_users(self) -> None:
        defaults = [
            ("admin", "System Administrator", Role.ADMINISTRATOR, "Admin@WTP2026!"),
            ("supervisor", "Plant Shift Supervisor", Role.SUPERVISOR, "Super@WTP2026!"),
            ("operator", "Control Room Operator", Role.OPERATOR, "Oper@WTP2026!"),
            ("engineer", "Automation Engineer", Role.ENGINEER, "Eng@WTP2026!"),
            ("maint", "Maintenance Technician", Role.MAINTENANCE, "Maint@WTP2026!"),
            ("viewer", "Read-Only Observer", Role.VIEWER, "Viewer@WTP2026!"),
        ]
        now = datetime.now(timezone.utc).isoformat()
        with self.db.connect() as conn:
            count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            if count == 0:
                for username, full_name, role, pwd in defaults:
                    pw_hash, salt = hash_password(pwd)
                    conn.execute(
                        """
                        INSERT INTO users (username, full_name, role, password_hash, salt, enabled, created_at)
                        VALUES (?, ?, ?, ?, ?, 1, ?)
                        """,
                        (username, full_name, role.value, pw_hash, salt, now),
                    )

    def authenticate(self, username: str, password: str, client_ip: str = "local") -> tuple[str, UserInfo]:
        throttle_key = f"{username}:{client_ip}"
        now_mono = time.monotonic()
        locked_until = self._locked_until.get(throttle_key, 0.0)
        if now_mono < locked_until:
            remaining = int(locked_until - now_mono) + 1
            self.record_audit(username, "UNKNOWN", "LOGIN", "AUTH", "LOCKED", f"Rate limited ({remaining}s remaining)")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Try again in {remaining}s.",
            )

        deny_reason: Optional[str] = None
        deny_role = "UNKNOWN"
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
            if not row or not row["enabled"]:
                deny_reason = "Invalid or disabled account"
            elif not verify_password(password, row["password_hash"], row["salt"]):
                deny_role = row["role"]
                deny_reason = "Incorrect password"
            else:
                now = datetime.now(timezone.utc).isoformat()
                conn.execute("UPDATE users SET last_login = ? WHERE username = ?", (now, username))
                role = Role(row["role"])
                token = create_token(username, role)
                user = UserInfo(
                    username=row["username"],
                    full_name=row["full_name"],
                    role=role,
                    enabled=bool(row["enabled"]),
                    created_at=datetime.fromisoformat(row["created_at"]),
                    last_login=datetime.fromisoformat(now),
                )
        if deny_reason:
            recent = [t for t in self._failed_attempts.get(throttle_key, []) if now_mono - t <= LOGIN_WINDOW_SEC]
            recent.append(now_mono)
            self._failed_attempts[throttle_key] = recent
            if len(recent) >= LOGIN_MAX_FAILURES:
                self._locked_until[throttle_key] = now_mono + LOGIN_LOCKOUT_SEC
                self._failed_attempts.pop(throttle_key, None)
            self.record_audit(username, deny_role, "LOGIN", "AUTH", "DENIED", deny_reason)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        self._failed_attempts.pop(throttle_key, None)
        self._locked_until.pop(throttle_key, None)
        self.record_audit(username, user.role.value, "LOGIN", "AUTH", "SUCCESS", "User authenticated")
        return token, user

    def get_user(self, username: str) -> Optional[UserInfo]:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
            if not row or not row["enabled"]:
                return None
            return UserInfo(
                username=row["username"],
                full_name=row["full_name"],
                role=Role(row["role"]),
                enabled=bool(row["enabled"]),
                created_at=datetime.fromisoformat(row["created_at"]),
                last_login=datetime.fromisoformat(row["last_login"]) if row["last_login"] else None,
            )

    def list_users(self) -> list[UserInfo]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM users ORDER BY username").fetchall()
            return [
                UserInfo(
                    username=r["username"],
                    full_name=r["full_name"],
                    role=Role(r["role"]),
                    enabled=bool(r["enabled"]),
                    created_at=datetime.fromisoformat(r["created_at"]),
                    last_login=datetime.fromisoformat(r["last_login"]) if r["last_login"] else None,
                )
                for r in rows
            ]

    def create_user(self, username: str, full_name: str, role: Role, password: str, actor: str) -> UserInfo:
        if len(password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        now = datetime.now(timezone.utc).isoformat()
        pw_hash, salt = hash_password(password)
        with self.db.connect() as conn:
            exists = conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
            if exists:
                raise HTTPException(status_code=409, detail="Username already exists")
            conn.execute(
                """
                INSERT INTO users (username, full_name, role, password_hash, salt, enabled, created_at)
                VALUES (?, ?, ?, ?, ?, 1, ?)
                """,
                (username, full_name, role.value, pw_hash, salt, now),
            )
        self.record_audit(actor, "Administrator", "CREATE_USER", username, "SUCCESS", f"Role={role.value}")
        return self.get_user(username)  # type: ignore

    def update_user_status(self, username: str, enabled: bool, actor: str) -> UserInfo:
        with self.db.connect() as conn:
            conn.execute("UPDATE users SET enabled = ? WHERE username = ?", (1 if enabled else 0, username))
        self.record_audit(actor, "Administrator", "UPDATE_USER", username, "SUCCESS", f"enabled={enabled}")
        with self.db.connect() as conn:
            r = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
            if not r:
                raise HTTPException(status_code=404, detail="User not found")
            return UserInfo(
                username=r["username"],
                full_name=r["full_name"],
                role=Role(r["role"]),
                enabled=bool(r["enabled"]),
                created_at=datetime.fromisoformat(r["created_at"]),
                last_login=datetime.fromisoformat(r["last_login"]) if r["last_login"] else None,
            )

    def record_audit(
        self,
        username: str,
        role: str,
        action: str,
        target: str,
        result: str,
        details: str = "",
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self.db.connect() as conn:
            conn.execute(
                """
                INSERT INTO audit_logs (timestamp, username, role, action, target, result, details)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (now, username, role, action, target, result, details),
            )

    def get_audit_logs(self, limit: int = 200) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]


def has_permission(role: Role, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, set())


def redact_driver_config(driver_dict: dict[str, Any]) -> dict[str, Any]:
    """Never expose PLC credentials, passwords, tokens, or sensitive connection details to frontend."""
    sensitive_keys = {"password", "secret", "token", "api_key", "private_key", "cert_password", "username"}
    return {k: ("***REDACTED***" if k.lower() in sensitive_keys else v) for k, v in driver_dict.items()}
