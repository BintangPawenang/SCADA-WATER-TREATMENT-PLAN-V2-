from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .alarm_engine import AlarmEngine
from .analytics import AnalyticsEngine
from .config_loader import PlantConfigManager
from .equipment_manager import EquipmentManager
from .water_quality import WaterQualityService


class ReportService:
    def __init__(
        self,
        config: PlantConfigManager,
        analytics: AnalyticsEngine,
        equipment_mgr: EquipmentManager,
        alarm_engine: AlarmEngine,
        water_quality: WaterQualityService,
    ) -> None:
        self.config = config
        self.analytics = analytics
        self.equipment_mgr = equipment_mgr
        self.alarm_engine = alarm_engine
        self.water_quality = water_quality

    def build_report_data(
        self,
        report_type: str,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> dict[str, Any]:
        end_dt = end or datetime.now(timezone.utc)
        if start is None:
            if report_type == "weekly_production":
                start_dt = end_dt - timedelta(days=7)
            elif report_type == "monthly_production":
                start_dt = end_dt - timedelta(days=30)
            else:
                start_dt = end_dt - timedelta(days=1)
        else:
            start_dt = start

        hours = max(1.0, (end_dt - start_dt).total_seconds() / 3600.0)
        enabled_areas = {k for k, v in self.config.process_areas.items() if v.get("enabled", False)}
        now = datetime.now(timezone.utc)

        meta = {
            "report_type": report_type,
            "plant_name": self.config.plant_name,
            "operating_mode": self.config.operating_mode.value,
            "period_start": start_dt.isoformat(),
            "period_end": end_dt.isoformat(),
            "generated_at": now.isoformat(),
        }

        if report_type in ("daily_production", "weekly_production", "monthly_production", "chemical_consumption", "energy_consumption"):
            kpi_res = self.analytics.compute_kpis(hours=hours, enabled_areas=enabled_areas)
            kpis = kpi_res["kpis"]
            if report_type == "chemical_consumption":
                kpis = [k for k in kpis if "coagulant" in k["id"] or "chlorine" in k["id"]]
            elif report_type == "energy_consumption":
                kpis = [k for k in kpis if "energy" in k["id"]]
            return {
                **meta,
                "title": report_type.replace("_", " ").title(),
                "columns": ["Metric", "Value", "Unit", "Formula", "Sources", "Status"],
                "rows": [
                    [
                        k["name"],
                        str(k["value"]) if k["value"] is not None else "N/A",
                        k["unit"],
                        k["formula"],
                        ", ".join(k["sources"]),
                        k["status"] if k["status"] == "AVAILABLE" else f"{k['status']} ({k['missing_reason']})",
                    ]
                    for k in kpis
                ],
            }

        if report_type == "water_quality":
            wq = self.water_quality.get_online_parameters(enabled_areas)
            return {
                **meta,
                "title": "Water Quality Summary Report",
                "columns": ["Tag", "Parameter", "Value", "Unit", "Op Range", "Quality", "Status"],
                "rows": [
                    [
                        p["tag_name"],
                        p["name"],
                        str(p["value"]) if p["value"] is not None else "N/A",
                        p["unit"],
                        f"{p['min_op']} - {p['max_op']}",
                        p["quality"],
                        p["status"],
                    ]
                    for p in wq["parameters"]
                ],
            }

        if report_type in ("equipment_runtime", "downtime"):
            eqs = self.equipment_mgr.list_all(enabled_areas)
            if report_type == "downtime":
                eqs = [e for e in eqs if e.state in ("FAULT", "TRAVEL_FAULT", "MAINTENANCE", "OUT_OF_SERVICE")]
            return {
                **meta,
                "title": "Equipment Runtime Report" if report_type == "equipment_runtime" else "Equipment Downtime & Faults Report",
                "columns": ["Tag", "Name", "Category", "Area", "State", "Mode", "Runtime (h)", "Starts", "Stops"],
                "rows": [
                    [
                        e.tag,
                        e.name,
                        e.category.value,
                        e.process_area,
                        e.state,
                        e.control_mode.value,
                        f"{e.runtime_hours:.2f}",
                        str(e.start_count),
                        str(e.stop_count),
                    ]
                    for e in eqs
                ],
            }

        if report_type == "alarm_history":
            alarms = [
                a for a in self.alarm_engine.get_alarm_history(500)
                if start_dt <= a.raised_at <= end_dt
            ]
            return {
                **meta,
                "title": "Alarm History Report",
                "columns": ["ID", "Raised At", "Source", "Category", "Priority", "State", "Description", "Ack By"],
                "rows": [
                    [
                        str(a.id),
                        a.raised_at.strftime("%Y-%m-%d %H:%M:%S"),
                        a.source,
                        a.category.value,
                        f"P{a.priority}",
                        a.state.value,
                        a.description,
                        a.ack_user or "-",
                    ]
                    for a in alarms
                ],
            }

        if report_type == "maintenance":
            logs = self.equipment_mgr.get_maintenance_logs(limit=300)
            return {
                **meta,
                "title": "Maintenance Log Report",
                "columns": ["ID", "Timestamp", "Equipment", "Actor", "Type", "Description"],
                "rows": [
                    [str(l["id"]), l["timestamp"], l["equipment_id"], l["actor"], l["entry_type"], l["description"]]
                    for l in logs
                ],
            }

        raise ValueError(f"Unsupported report type: {report_type}")

    def to_csv(self, report_data: dict[str, Any]) -> str:
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["# Plant", report_data["plant_name"]])
        writer.writerow(["# Mode", report_data["operating_mode"]])
        writer.writerow(["# Period", f"{report_data['period_start']} to {report_data['period_end']}"])
        writer.writerow(["# Generated", report_data["generated_at"]])
        writer.writerow(report_data["columns"])
        writer.writerows(report_data["rows"])
        return buf.getvalue()

    def to_pdf(self, report_data: dict[str, Any]) -> bytes:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=24, rightMargin=24, topMargin=24, bottomMargin=24)
        styles = getSampleStyleSheet()
        elements = [
            Paragraph(f"<b>{report_data['plant_name']} - {report_data['title']}</b>", styles["Title"]),
            Paragraph(
                f"Mode: <b>{report_data['operating_mode']}</b> | Period: {report_data['period_start']} to {report_data['period_end']} | Generated: {report_data['generated_at']}",
                styles["Normal"],
            ),
            Spacer(1, 12),
        ]

        table_data = [report_data["columns"]] + (report_data["rows"] or [["No records in selected period"] + [""] * (len(report_data["columns"]) - 1)])
        tbl = Table(table_data, repeatRows=1)
        tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            )
        )
        elements.append(tbl)
        doc.build(elements)
        return buf.getvalue()
