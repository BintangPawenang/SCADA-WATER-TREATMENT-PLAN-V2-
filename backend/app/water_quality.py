from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from .config_loader import PlantConfigManager
from .database import Database
from .models import DataQuality, LabResultCreate
from .tag_engine import TagEngine


class WaterQualityService:
    def __init__(self, db: Database, config: PlantConfigManager, tag_engine: TagEngine) -> None:
        self.db = db
        self.config = config
        self.tag_engine = tag_engine
        self.sync_limits_to_tag_engine()

    def sync_limits_to_tag_engine(self) -> None:
        """Synchronizes configured Water Quality alarm_low/alarm_high into TagEngine alarm_limits."""
        params_cfg = self.config.water_quality_limits.get("parameters", {})
        for tag_name, lim in params_cfg.items():
            self.tag_engine.sync_alarm_limits(
                tag_name,
                h=lim.get("alarm_high"),
                l=lim.get("alarm_low"),
            )

    def get_online_parameters(self, enabled_areas: Optional[set[str]] = None) -> dict[str, Any]:
        wq_cfg = self.config.water_quality_limits
        params_cfg = wq_cfg.get("parameters", {})
        items: list[dict[str, Any]] = []

        for tag_name, lim in params_cfg.items():
            tag = self.tag_engine.get_tag(tag_name)
            if not tag:
                continue
            if enabled_areas is not None and tag.process_area not in enabled_areas:
                continue

            status = "UNKNOWN"
            if tag.quality != DataQuality.GOOD or tag.value is None:
                status = tag.quality.value
            else:
                val = float(tag.value)
                al_hi = lim.get("alarm_high")
                al_lo = lim.get("alarm_low")
                op_hi = lim.get("max_op")
                op_lo = lim.get("min_op")
                if (al_hi is not None and val >= al_hi) or (al_lo is not None and val <= al_lo):
                    status = "ALARM"
                elif (op_hi is not None and val > op_hi) or (op_lo is not None and val < op_lo):
                    status = "OUT_OF_SPEC"
                else:
                    status = "NORMAL"

            items.append({
                "tag_name": tag_name,
                "name": lim.get("name", tag.description),
                "process_area": tag.process_area,
                "value": tag.value,
                "unit": lim.get("unit", tag.engineering_unit),
                "quality": tag.quality.value,
                "timestamp": tag.timestamp.isoformat() if tag.timestamp else None,
                "min_op": lim.get("min_op"),
                "max_op": lim.get("max_op"),
                "alarm_low": lim.get("alarm_low"),
                "alarm_high": lim.get("alarm_high"),
                "status": status,
                "simulated": tag.simulated,
            })

        return {
            "specification_source": wq_cfg.get("specification_source", "Configurable"),
            "parameters": items,
        }

    def add_lab_result(self, payload: LabResultCreate, analyst: str) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        sampled_at = (payload.sampled_at or now).isoformat()
        with self.db.connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO lab_results (parameter, value, unit, sample_id, sample_point, analyst, sampled_at, entered_at, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.parameter,
                    payload.value,
                    payload.unit,
                    payload.sample_id,
                    payload.sample_point,
                    analyst,
                    sampled_at,
                    now.isoformat(),
                    payload.notes,
                ),
            )
            rid = cur.lastrowid
            row = conn.execute("SELECT * FROM lab_results WHERE id = ?", (rid,)).fetchone()
            return dict(row)

    def list_lab_results(self, limit: int = 100) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM lab_results ORDER BY sampled_at DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]
