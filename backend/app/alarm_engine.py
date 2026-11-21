from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from .database import Database
from .models import (
    AlarmCategory,
    AlarmLifecycleState,
    AlarmRecord,
    DataQuality,
    EventRecord,
    TagState,
)


class AlarmEngine:
    def __init__(self, db: Database) -> None:
        self.db = db
        self._pending_on_delay: dict[tuple[str, str], datetime] = {}

    def log_event(
        self,
        event_type: str,
        source: str,
        actor: str,
        description: str,
        severity: str = "INFO",
    ) -> EventRecord:
        now = datetime.now(timezone.utc)
        with self.db.connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO events (timestamp, event_type, source, actor, description, severity)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (now.isoformat(), event_type, source, actor, description, severity),
            )
            eid = cur.lastrowid
        return EventRecord(
            id=int(eid or 0),
            timestamp=now,
            event_type=event_type,
            source=source,
            actor=actor,
            description=description,
            severity=severity,
        )

    def get_events(self, limit: int = 200) -> list[EventRecord]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [
                EventRecord(
                    id=r["id"],
                    timestamp=datetime.fromisoformat(r["timestamp"]),
                    event_type=r["event_type"],
                    source=r["source"],
                    actor=r["actor"],
                    description=r["description"],
                    severity=r["severity"],
                )
                for r in rows
            ]

    def _row_to_alarm(self, r: Any) -> AlarmRecord:
        return AlarmRecord(
            id=r["id"],
            source=r["source"],
            process_area=r["process_area"],
            category=AlarmCategory(r["category"]),
            priority=r["priority"],
            description=r["description"],
            state=AlarmLifecycleState(r["state"]),
            active=bool(r["active"]),
            acknowledged=bool(r["acknowledged"]),
            shelved=bool(r["shelved"]),
            shelved_until=datetime.fromisoformat(r["shelved_until"]) if r["shelved_until"] else None,
            shelve_reason=r["shelve_reason"],
            ack_user=r["ack_user"],
            ack_time=datetime.fromisoformat(r["ack_time"]) if r["ack_time"] else None,
            raised_at=datetime.fromisoformat(r["raised_at"]),
            cleared_at=datetime.fromisoformat(r["cleared_at"]) if r["cleared_at"] else None,
            value_at_raise=r["value_at_raise"],
        )

    def get_active_alarms(self, include_unack_cleared: bool = True) -> list[AlarmRecord]:
        with self.db.connect() as conn:
            if include_unack_cleared:
                rows = conn.execute(
                    "SELECT * FROM alarms WHERE state != 'NORMAL' ORDER BY priority ASC, raised_at DESC"
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM alarms WHERE active = 1 ORDER BY priority ASC, raised_at DESC"
                ).fetchall()
            return [self._row_to_alarm(r) for r in rows]

    def get_alarm_history(self, limit: int = 300) -> list[AlarmRecord]:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM alarms ORDER BY raised_at DESC LIMIT ?", (limit,)
            ).fetchall()
            return [self._row_to_alarm(r) for r in rows]

    def raise_or_clear(
        self,
        source: str,
        process_area: str,
        category: AlarmCategory,
        priority: int,
        description: str,
        condition_active: bool,
        value_str: Optional[str] = None,
        on_delay_sec: float = 0.0,
    ) -> None:
        now = datetime.now(timezone.utc)
        key = (source, category.value)

        with self.db.connect() as conn:
            existing = conn.execute(
                """
                SELECT * FROM alarms
                WHERE source = ? AND category = ? AND active = 1
                ORDER BY id DESC LIMIT 1
                """,
                (source, category.value),
            ).fetchone()

            if existing and existing["shelved"] and existing["shelved_until"]:
                if now > datetime.fromisoformat(existing["shelved_until"]):
                    new_st = AlarmLifecycleState.ACK_ACTIVE.value if existing["acknowledged"] else AlarmLifecycleState.UNACK_ACTIVE.value
                    conn.execute(
                        "UPDATE alarms SET shelved = 0, shelved_until = NULL, shelve_reason = NULL, state = ? WHERE id = ?",
                        (new_st, existing["id"]),
                    )

            if condition_active:
                if existing:
                    self._pending_on_delay.pop(key, None)
                    return

                if on_delay_sec > 0:
                    first_seen = self._pending_on_delay.get(key)
                    if first_seen is None:
                        self._pending_on_delay[key] = now
                        return
                    if (now - first_seen).total_seconds() < on_delay_sec:
                        return
                    self._pending_on_delay.pop(key, None)

                conn.execute(
                    """
                    INSERT INTO alarms (
                        source, process_area, category, priority, description,
                        state, active, acknowledged, raised_at, value_at_raise
                    ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
                    """,
                    (
                        source,
                        process_area,
                        category.value,
                        priority,
                        description,
                        AlarmLifecycleState.UNACK_ACTIVE.value,
                        now.isoformat(),
                        value_str,
                    ),
                )
            else:
                self._pending_on_delay.pop(key, None)
                if existing:
                    new_state = (
                        AlarmLifecycleState.NORMAL.value
                        if existing["acknowledged"]
                        else AlarmLifecycleState.UNACK_CLEARED.value
                    )
                    conn.execute(
                        "UPDATE alarms SET active = 0, cleared_at = ?, state = ? WHERE id = ?",
                        (now.isoformat(), new_state, existing["id"]),
                    )

    def evaluate_tags(
        self,
        tags: list[TagState],
        offline_drivers: Optional[set[str]] = None,
        all_enabled_drivers: Optional[set[str]] = None,
    ) -> None:
        """
        Batch-evaluates all tags using a single SELECT and a single write transaction.
        Suppresses per-tag COMM_FAILURE floods when an entire driver/PLC is offline.
        """
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        offline_drv_set = offline_drivers or set()
        enabled_drv_set = all_enabled_drivers or set()

        with self.db.connect() as conn:
            active_rows = conn.execute("SELECT * FROM alarms WHERE active = 1").fetchall()

        active_map: dict[tuple[str, str], Any] = {}
        unshelve_updates: list[tuple[str, int]] = []
        for r in active_rows:
            active_map[(r["source"], r["category"])] = r
            if r["shelved"] and r["shelved_until"] and now > datetime.fromisoformat(r["shelved_until"]):
                restored_state = (
                    AlarmLifecycleState.ACK_ACTIVE.value
                    if r["acknowledged"]
                    else AlarmLifecycleState.UNACK_ACTIVE.value
                )
                unshelve_updates.append((restored_state, r["id"]))

        inserts: list[tuple[str, str, str, int, str, str, str, Optional[str]]] = []
        clears: list[tuple[str, str, int]] = []

        def check_cond(
            source: str,
            area: str,
            cat: AlarmCategory,
            prio: int,
            desc: str,
            cond_active: bool,
            val_str: Optional[str] = None,
            on_delay: float = 0.0,
        ) -> None:
            key = (source, cat.value)
            existing = active_map.get(key)
            if cond_active:
                if existing:
                    self._pending_on_delay.pop(key, None)
                    return
                if on_delay > 0:
                    first_seen = self._pending_on_delay.get(key)
                    if first_seen is None:
                        self._pending_on_delay[key] = now
                        return
                    if (now - first_seen).total_seconds() < on_delay:
                        return
                    self._pending_on_delay.pop(key, None)
                inserts.append(
                    (
                        source,
                        area,
                        cat.value,
                        prio,
                        desc,
                        AlarmLifecycleState.UNACK_ACTIVE.value,
                        now_iso,
                        val_str,
                    )
                )
            else:
                self._pending_on_delay.pop(key, None)
                if existing:
                    new_st = (
                        AlarmLifecycleState.NORMAL.value
                        if existing["acknowledged"]
                        else AlarmLifecycleState.UNACK_CLEARED.value
                    )
                    clears.append((now_iso, new_st, existing["id"]))

        # 1. Master driver-level communication alarms (prevents per-tag alarm flood on PLC disconnect)
        for drv_id in enabled_drv_set:
            is_down = drv_id in offline_drv_set
            check_cond(
                drv_id,
                "system",
                AlarmCategory.COMM_FAILURE,
                1,
                f"Driver/PLC communication lost on {drv_id} (downstream tag alarms suppressed)",
                is_down,
                "DRIVER_OFFLINE" if is_down else "ONLINE",
                0.0,
            )

        for tag in tags:
            if tag.driver_id in offline_drv_set:
                # Suppress per-tag comm flood while master driver alarm handles the outage
                check_cond(tag.tag_name, tag.process_area, AlarmCategory.COMM_FAILURE, 2, "", False)
                check_cond(tag.tag_name, tag.process_area, AlarmCategory.INSTRUMENT_FAULT, 3, "", False)
                continue

            if tag.quality == DataQuality.COMM_FAILURE:
                check_cond(
                    tag.tag_name,
                    tag.process_area,
                    AlarmCategory.COMM_FAILURE,
                    2,
                    f"Communication failure on {tag.tag_name} ({tag.description})",
                    True,
                    "COMM_FAILURE",
                    3.0,
                )
                continue
            check_cond(
                tag.tag_name,
                tag.process_area,
                AlarmCategory.COMM_FAILURE,
                2,
                f"Communication restored on {tag.tag_name}",
                False,
            )

            if tag.quality in (DataQuality.BAD, DataQuality.STALE):
                check_cond(
                    tag.tag_name,
                    tag.process_area,
                    AlarmCategory.INSTRUMENT_FAULT,
                    3,
                    f"Instrument quality {tag.quality.value} on {tag.tag_name}",
                    True,
                    tag.quality.value,
                    5.0,
                )
                continue
            check_cond(
                tag.tag_name,
                tag.process_area,
                AlarmCategory.INSTRUMENT_FAULT,
                3,
                f"Instrument quality normal on {tag.tag_name}",
                False,
            )

            if tag.tag_name.endswith("_FLT"):
                eq_id = tag.tag_name[:-4]
                check_cond(
                    eq_id,
                    tag.process_area,
                    AlarmCategory.EQUIPMENT_FAULT,
                    1,
                    f"Equipment fault active on {eq_id} ({tag.description})",
                    bool(tag.value),
                    str(tag.value),
                )
                continue

            if not isinstance(tag.value, (int, float)):
                continue
            val = float(tag.value)
            lim = tag.alarm_limits
            db = lim.deadband

            hh_active = lim.hh is not None and val >= lim.hh
            ll_active = lim.ll is not None and val <= lim.ll

            if lim.hh is not None:
                check_cond(
                    tag.tag_name,
                    tag.process_area,
                    AlarmCategory.HIGH_HIGH,
                    lim.priority_hh,
                    f"{tag.tag_name} High-High ({val:.2f} {tag.engineering_unit} >= {lim.hh})",
                    hh_active,
                    f"{val:.2f} {tag.engineering_unit}",
                    lim.on_delay_sec,
                )
            if lim.h is not None:
                active_h = (tag.tag_name, AlarmCategory.HIGH.value) in active_map
                cond_h = False if hh_active else (val >= lim.h if not active_h else val > (lim.h - db))
                check_cond(
                    tag.tag_name,
                    tag.process_area,
                    AlarmCategory.HIGH,
                    lim.priority_h,
                    f"{tag.tag_name} High ({val:.2f} {tag.engineering_unit} >= {lim.h})",
                    cond_h,
                    f"{val:.2f} {tag.engineering_unit}",
                    lim.on_delay_sec,
                )
            if lim.l is not None:
                active_l = (tag.tag_name, AlarmCategory.LOW.value) in active_map
                cond_l = False if ll_active else (val <= lim.l if not active_l else val < (lim.l + db))
                check_cond(
                    tag.tag_name,
                    tag.process_area,
                    AlarmCategory.LOW,
                    lim.priority_l,
                    f"{tag.tag_name} Low ({val:.2f} {tag.engineering_unit} <= {lim.l})",
                    cond_l,
                    f"{val:.2f} {tag.engineering_unit}",
                    lim.on_delay_sec,
                )
            if lim.ll is not None:
                check_cond(
                    tag.tag_name,
                    tag.process_area,
                    AlarmCategory.LOW_LOW,
                    lim.priority_ll,
                    f"{tag.tag_name} Low-Low ({val:.2f} {tag.engineering_unit} <= {lim.ll})",
                    ll_active,
                    f"{val:.2f} {tag.engineering_unit}",
                    lim.on_delay_sec,
                )

        if unshelve_updates or inserts or clears:
            with self.db.connect() as conn:
                if unshelve_updates:
                    conn.executemany(
                        "UPDATE alarms SET shelved = 0, shelved_until = NULL, shelve_reason = NULL, state = ? WHERE id = ?",
                        unshelve_updates,
                    )
                if inserts:
                    conn.executemany(
                        """
                        INSERT INTO alarms (
                            source, process_area, category, priority, description,
                            state, active, acknowledged, raised_at, value_at_raise
                        ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
                        """,
                        inserts,
                    )
                if clears:
                    conn.executemany(
                        "UPDATE alarms SET active = 0, cleared_at = ?, state = ? WHERE id = ?",
                        clears,
                    )

    def acknowledge_alarm(self, alarm_id: int, username: str) -> AlarmRecord:
        """Acknowledge an alarm. NEVER clears an active alarm."""
        now = datetime.now(timezone.utc)
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM alarms WHERE id = ?", (alarm_id,)).fetchone()
            if not row:
                raise KeyError(f"Alarm {alarm_id} not found")
            new_state = (
                AlarmLifecycleState.ACK_ACTIVE.value
                if row["active"]
                else AlarmLifecycleState.NORMAL.value
            )
            conn.execute(
                """
                UPDATE alarms
                SET acknowledged = 1, ack_user = ?, ack_time = ?, state = ?
                WHERE id = ?
                """,
                (username, now.isoformat(), new_state, alarm_id),
            )
            updated = conn.execute("SELECT * FROM alarms WHERE id = ?", (alarm_id,)).fetchone()
            rec = self._row_to_alarm(updated)
        self.log_event("ALARM_ACK", rec.source, username, f"Acknowledged alarm #{alarm_id}: {rec.description}")
        return rec

    def acknowledge_bulk(self, alarm_ids: list[int], username: str) -> int:
        if not alarm_ids:
            return 0
        now = datetime.now(timezone.utc).isoformat()
        count = 0
        with self.db.connect() as conn:
            for aid in alarm_ids:
                row = conn.execute("SELECT id, active FROM alarms WHERE id = ? AND acknowledged = 0", (aid,)).fetchone()
                if not row:
                    continue
                new_state = AlarmLifecycleState.ACK_ACTIVE.value if row["active"] else AlarmLifecycleState.NORMAL.value
                conn.execute(
                    "UPDATE alarms SET acknowledged = 1, ack_user = ?, ack_time = ?, state = ? WHERE id = ?",
                    (username, now, new_state, aid),
                )
                count += 1
        if count > 0:
            self.log_event("ALARM_ACK_BULK", "ALARM_SUMMARY", username, f"Bulk acknowledged {count} alarm(s)")
        return count

    def shelve_alarm(self, alarm_id: int, username: str, duration_minutes: int, reason: str) -> AlarmRecord:
        now = datetime.now(timezone.utc)
        until = now + timedelta(minutes=max(1, min(duration_minutes, 1440)))
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM alarms WHERE id = ?", (alarm_id,)).fetchone()
            if not row:
                raise KeyError(f"Alarm {alarm_id} not found")
            conn.execute(
                """
                UPDATE alarms
                SET shelved = 1, shelved_until = ?, shelve_reason = ?, state = ?
                WHERE id = ?
                """,
                (until.isoformat(), reason, AlarmLifecycleState.SHELVED.value, alarm_id),
            )
            updated = conn.execute("SELECT * FROM alarms WHERE id = ?", (alarm_id,)).fetchone()
            rec = self._row_to_alarm(updated)
        self.log_event(
            "ALARM_SHELVE",
            rec.source,
            username,
            f"Shelved alarm #{alarm_id} for {duration_minutes}m: {reason}",
            severity="WARNING",
        )
        return rec
