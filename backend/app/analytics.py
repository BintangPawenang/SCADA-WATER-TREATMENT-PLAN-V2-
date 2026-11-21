from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from .database import Database
from .equipment_manager import EquipmentManager
from .tag_engine import TagEngine


class AnalyticsEngine:
    def __init__(self, db: Database, tag_engine: TagEngine, equipment_mgr: EquipmentManager) -> None:
        self.db = db
        self.tag_engine = tag_engine
        self.equipment_mgr = equipment_mgr

    def _avg_good_samples(self, tag_name: str, start: datetime, end: datetime) -> tuple[Optional[float], int, int]:
        """
        Computes time-weighted trapezoidal average over GOOD samples so COV-compressed
        historian records remain unbiased across variable sampling intervals.
        Returns (time_weighted_avg, good_count, total_count).
        """
        with self.db.connect() as conn:
            rows = conn.execute(
                """
                SELECT timestamp, value, quality
                FROM historian_samples
                WHERE tag_name = ? AND timestamp >= ? AND timestamp <= ?
                ORDER BY timestamp ASC
                """,
                (tag_name, start.isoformat(), end.isoformat()),
            ).fetchall()

        tot_cnt = len(rows)
        good_pts = [
            (datetime.fromisoformat(r["timestamp"]).timestamp(), float(r["value"]))
            for r in rows
            if r["quality"] == "GOOD" and r["value"] is not None
        ]
        good_cnt = len(good_pts)
        if good_cnt == 0:
            return None, 0, tot_cnt
        if good_cnt == 1:
            return good_pts[0][1], good_cnt, tot_cnt

        area = 0.0
        total_dt = 0.0
        for i in range(len(good_pts) - 1):
            t0, v0 = good_pts[i]
            t1, v1 = good_pts[i + 1]
            dt = max(0.0, t1 - t0)
            if dt > 0:
                area += 0.5 * (v0 + v1) * dt
                total_dt += dt
        if total_dt <= 0.0:
            avg = sum(v for _, v in good_pts) / good_cnt
            return avg, good_cnt, tot_cnt
        return area / total_dt, good_cnt, tot_cnt

    def compute_kpis(self, hours: float = 24.0, enabled_areas: Optional[set[str]] = None) -> dict[str, Any]:
        end = datetime.now(timezone.utc)
        start = end - timedelta(hours=hours)
        kpis: list[dict[str, Any]] = []

        def area_ok(tag_name: str) -> bool:
            t = self.tag_engine.get_tag(tag_name)
            if not t:
                return False
            if enabled_areas is not None and t.process_area not in enabled_areas:
                return False
            return True

        # 1. Total Raw Water Intake
        raw_avg, raw_good, raw_tot = (
            self._avg_good_samples("FIT-101", start, end) if area_ok("FIT-101") else (None, 0, 0)
        )
        raw_vol = round(raw_avg * hours, 2) if raw_avg is not None else None
        kpis.append({
            "id": "total_raw_water_intake",
            "name": "Total Raw Water Intake",
            "value": raw_vol,
            "unit": "m3",
            "formula": "AVG(FIT-101 [m3/h]) * interval_hours",
            "interval_hours": hours,
            "sources": ["FIT-101"],
            "completeness_pct": round((raw_good / raw_tot) * 100, 1) if raw_tot else 0.0,
            "status": "AVAILABLE" if raw_vol is not None else "INSUFFICIENT_DATA",
            "missing_reason": None if raw_vol is not None else "FIT-101 not instrumented or no GOOD samples in interval",
        })

        # 2. Total Treated Water Production
        dist_avg, dist_good, dist_tot = (
            self._avg_good_samples("FIT-701", start, end) if area_ok("FIT-701") else (None, 0, 0)
        )
        dist_vol = round(dist_avg * hours, 2) if dist_avg is not None else None
        kpis.append({
            "id": "total_treated_water_production",
            "name": "Total Treated Water Production",
            "value": dist_vol,
            "unit": "m3",
            "formula": "AVG(FIT-701 [m3/h]) * interval_hours",
            "interval_hours": hours,
            "sources": ["FIT-701"],
            "completeness_pct": round((dist_good / dist_tot) * 100, 1) if dist_tot else 0.0,
            "status": "AVAILABLE" if dist_vol is not None else "INSUFFICIENT_DATA",
            "missing_reason": None if dist_vol is not None else "FIT-701 not instrumented or no GOOD samples in interval",
        })

        # 3. Water Recovery Rate
        recovery = (
            round((dist_vol / raw_vol) * 100.0, 2)
            if (dist_vol is not None and raw_vol is not None and raw_vol > 0)
            else None
        )
        kpis.append({
            "id": "water_recovery_rate",
            "name": "Water Recovery Rate",
            "value": recovery,
            "unit": "%",
            "formula": "(Treated Volume / Raw Intake Volume) * 100",
            "interval_hours": hours,
            "sources": ["FIT-101", "FIT-701"],
            "completeness_pct": min(
                round((raw_good / raw_tot) * 100, 1) if raw_tot else 0.0,
                round((dist_good / dist_tot) * 100, 1) if dist_tot else 0.0,
            ),
            "status": "AVAILABLE" if recovery is not None else "INSUFFICIENT_DATA",
            "missing_reason": None if recovery is not None else "Requires both FIT-101 and FIT-701 with positive flow",
        })

        # 4. Specific Coagulant Consumption
        coag_avg, coag_good, coag_tot = (
            self._avg_good_samples("FIT-201", start, end) if area_ok("FIT-201") else (None, 0, 0)
        )
        spec_coag = (
            round((coag_avg * hours) / raw_vol, 4)
            if (coag_avg is not None and raw_vol is not None and raw_vol > 0)
            else None
        )
        kpis.append({
            "id": "specific_coagulant_consumption",
            "name": "Specific Coagulant Consumption",
            "value": spec_coag,
            "unit": "L/m3",
            "formula": "(AVG(FIT-201 [L/h]) * hours) / Raw Intake Volume [m3]",
            "interval_hours": hours,
            "sources": ["FIT-201", "FIT-101"],
            "completeness_pct": round((coag_good / coag_tot) * 100, 1) if coag_tot else 0.0,
            "status": "AVAILABLE" if spec_coag is not None else "INSUFFICIENT_DATA",
            "missing_reason": None if spec_coag is not None else "Requires FIT-201 and FIT-101",
        })

        # 5. Specific Chlorine Consumption
        cl2_avg, cl2_good, cl2_tot = (
            self._avg_good_samples("FIT-601", start, end) if area_ok("FIT-601") else (None, 0, 0)
        )
        flt_avg, _, _ = self._avg_good_samples("FIT-501", start, end) if area_ok("FIT-501") else (None, 0, 0)
        spec_cl2 = (
            round((cl2_avg * hours) / (flt_avg * hours), 4)
            if (cl2_avg is not None and flt_avg is not None and flt_avg > 0)
            else None
        )
        kpis.append({
            "id": "specific_chlorine_consumption",
            "name": "Specific Chlorine Consumption",
            "value": spec_cl2,
            "unit": "L/m3",
            "formula": "(AVG(FIT-601 [L/h]) * hours) / (AVG(FIT-501 [m3/h]) * hours)",
            "interval_hours": hours,
            "sources": ["FIT-601", "FIT-501"],
            "completeness_pct": round((cl2_good / cl2_tot) * 100, 1) if cl2_tot else 0.0,
            "status": "AVAILABLE" if spec_cl2 is not None else "INSUFFICIENT_DATA",
            "missing_reason": None if spec_cl2 is not None else "Requires FIT-601 and FIT-501",
        })

        # 6. Filter Performance (Differential Pressure & Turbidity)
        dp_avg, dp_good, dp_tot = (
            self._avg_good_samples("PDIT-501", start, end) if area_ok("PDIT-501") else (None, 0, 0)
        )
        kpis.append({
            "id": "filter_differential_pressure_avg",
            "name": "Filter Avg Differential Pressure",
            "value": round(dp_avg, 3) if dp_avg is not None else None,
            "unit": "bar",
            "formula": "AVG(PDIT-501 [bar])",
            "interval_hours": hours,
            "sources": ["PDIT-501"],
            "completeness_pct": round((dp_good / dp_tot) * 100, 1) if dp_tot else 0.0,
            "status": "AVAILABLE" if dp_avg is not None else "INSUFFICIENT_DATA",
            "missing_reason": None if dp_avg is not None else "PDIT-501 not available",
        })

        # 7. Total Pump Operating Hours
        pumps = [e for e in self.equipment_mgr.list_all(enabled_areas) if "PUMP" in e.category.value]
        total_pump_hrs = round(sum(p.runtime_hours for p in pumps), 2)
        kpis.append({
            "id": "total_pump_runtime",
            "name": "Cumulative Pump Operating Hours",
            "value": total_pump_hrs,
            "unit": "h",
            "formula": "SUM(equipment.runtime_hours for active pump assets)",
            "interval_hours": hours,
            "sources": [p.id for p in pumps],
            "completeness_pct": 100.0 if pumps else 0.0,
            "status": "AVAILABLE" if pumps else "INSUFFICIENT_DATA",
            "missing_reason": None if pumps else "No pumps configured in enabled process areas",
        })

        # 8. Specific Energy Consumption (only if energy meter tag exists)
        energy_tag = self.tag_engine.get_tag("EIT-701")
        kpis.append({
            "id": "specific_energy_consumption",
            "name": "Specific Energy Consumption",
            "value": None if energy_tag is None else 0.0,
            "unit": "kWh/m3",
            "formula": "Total Metered Energy (EIT-701 [kWh]) / Treated Water Volume [m3]",
            "interval_hours": hours,
            "sources": ["EIT-701", "FIT-701"],
            "completeness_pct": 0.0,
            "status": "INSUFFICIENT_DATA",
            "missing_reason": "Power/Energy meter tag (EIT-701) is not instrumented in current plant configuration",
        })

        return {
            "generated_at": end.isoformat(),
            "interval_hours": hours,
            "kpis": kpis,
        }
