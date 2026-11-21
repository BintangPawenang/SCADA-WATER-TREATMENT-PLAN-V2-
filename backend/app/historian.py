from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from .database import Database
from .models import DataQuality, TagState


class Historian:
    def __init__(
        self,
        db: Database,
        retention_days: int = 90,
        cov_deadband_ratio: float = 0.002,
        heartbeat_sec: float = 60.0,
    ) -> None:
        self.db = db
        self.retention_days = retention_days
        self.cov_deadband_ratio = cov_deadband_ratio
        self.heartbeat_sec = heartbeat_sec
        self._last_recorded: dict[str, tuple[Optional[float], str, str, float]] = {}

    def record_snapshot(self, tags: list[TagState], force: bool = False) -> int:
        now_dt = datetime.now(timezone.utc)
        now = now_dt.isoformat()
        now_ts = now_dt.timestamp()
        rows: list[tuple[str, str, Optional[float], str, str, int]] = []

        for t in tags:
            num_val: Optional[float] = None
            if isinstance(t.value, bool):
                num_val = 1.0 if t.value else 0.0
            elif isinstance(t.value, (int, float)):
                num_val = float(t.value)
            raw_str = str(t.value) if t.value is not None else ""
            qual_str = t.quality.value

            prev = self._last_recorded.get(t.tag_name)
            should_record = force or prev is None
            if not should_record and prev is not None:
                p_num, p_raw, p_qual, p_ts = prev
                if qual_str != p_qual or raw_str != p_raw and num_val is None:
                    should_record = True
                elif now_ts - p_ts >= self.heartbeat_sec:
                    should_record = True
                elif num_val is not None and p_num is not None:
                    tol = max(1e-4, abs(p_num) * self.cov_deadband_ratio)
                    if abs(num_val - p_num) >= tol:
                        should_record = True

            if should_record:
                ts_str = t.timestamp.isoformat() if t.timestamp else now
                rows.append((t.tag_name, ts_str, num_val, raw_str, qual_str, 1 if t.simulated else 0))
                self._last_recorded[t.tag_name] = (num_val, raw_str, qual_str, now_ts)

        if not rows:
            return 0
        with self.db.connect() as conn:
            conn.executemany(
                """
                INSERT INTO historian_samples (tag_name, timestamp, value, raw_value, quality, simulated)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
        return len(rows)

    def enforce_retention(self) -> int:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=self.retention_days)).isoformat()
        with self.db.connect() as conn:
            cur = conn.execute("DELETE FROM historian_samples WHERE timestamp < ?", (cutoff,))
            return cur.rowcount

    def query_with_meta(
        self,
        tag_name: str,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        bucket: str = "RAW",
        limit: int = 2000,
    ) -> dict[str, Any]:
        end_dt = end or datetime.now(timezone.utc)
        start_dt = start or (end_dt - timedelta(hours=1))
        fetch_limit = limit + 1

        with self.db.connect() as conn:
            if bucket == "RAW":
                rows = conn.execute(
                    """
                    SELECT timestamp, value, raw_value, quality, simulated
                    FROM historian_samples
                    WHERE tag_name = ? AND timestamp >= ? AND timestamp <= ?
                    ORDER BY timestamp ASC
                    LIMIT ?
                    """,
                    (tag_name, start_dt.isoformat(), end_dt.isoformat(), fetch_limit),
                ).fetchall()
                truncated = len(rows) > limit
                return {
                    "samples": [dict(r) for r in rows[:limit]],
                    "truncated": truncated,
                    "limit": limit,
                }

            bucket_sec_map = {"1M": 60, "5M": 300, "1H": 3600}
            bucket_sec = bucket_sec_map.get(bucket, 60)
            rows = conn.execute(
                f"""
                SELECT strftime('%Y-%m-%dT%H:%M:%SZ', (CAST(strftime('%s', timestamp) AS INTEGER) / {bucket_sec}) * {bucket_sec}, 'unixepoch') AS bucket_ts,
                       AVG(value) AS avg_value,
                       MIN(value) AS min_value,
                       MAX(value) AS max_value,
                       COUNT(value) AS sample_count,
                       MAX(simulated) AS simulated
                FROM historian_samples
                WHERE tag_name = ? AND timestamp >= ? AND timestamp <= ? AND quality = 'GOOD'
                GROUP BY (CAST(strftime('%s', timestamp) AS INTEGER) / {bucket_sec})
                ORDER BY bucket_ts ASC
                LIMIT ?
                """,
                (tag_name, start_dt.isoformat(), end_dt.isoformat(), fetch_limit),
            ).fetchall()
            truncated = len(rows) > limit
            samples = [
                {
                    "timestamp": r["bucket_ts"],
                    "value": round(r["avg_value"], 4) if r["avg_value"] is not None else None,
                    "min_value": round(r["min_value"], 4) if r["min_value"] is not None else None,
                    "max_value": round(r["max_value"], 4) if r["max_value"] is not None else None,
                    "sample_count": r["sample_count"],
                    "quality": DataQuality.GOOD.value,
                    "simulated": bool(r["simulated"]),
                }
                for r in rows[:limit]
            ]
            return {"samples": samples, "truncated": truncated, "limit": limit}

    def query(
        self,
        tag_name: str,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        bucket: str = "RAW",
        limit: int = 2000,
    ) -> list[dict[str, Any]]:
        return self.query_with_meta(tag_name, start=start, end=end, bucket=bucket, limit=limit)["samples"]

    def export_csv(self, tag_names: list[str], start: Optional[datetime], end: Optional[datetime]) -> str:
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["tag_name", "timestamp", "value", "raw_value", "quality", "simulated"])
        for tag in tag_names:
            samples = self.query(tag, start=start, end=end, bucket="RAW", limit=10000)
            for s in samples:
                writer.writerow([tag, s["timestamp"], s["value"], s["raw_value"], s["quality"], s["simulated"]])
        return buf.getvalue()
