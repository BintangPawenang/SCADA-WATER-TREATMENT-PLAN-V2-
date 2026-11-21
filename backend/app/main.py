from __future__ import annotations

import asyncio
import contextlib
import os
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from .alarm_engine import AlarmEngine
from .analytics import AnalyticsEngine
from .auth import AuthService, decode_token, has_permission, redact_driver_config
from .config_loader import PlantConfigManager
from .control_service import ControlService
from .database import Database
from .drivers import DriverBase, SimulationDriver, create_driver
from .equipment_manager import EquipmentManager
from .historian import Historian
from .models import AlarmCategory, CommandRequest, LabResultCreate, OperatingMode, Role, UserInfo
from .plant_topology import build_default_equipment, build_default_tags
from .reporting import ReportService
from .tag_engine import TagEngine
from .water_quality import WaterQualityService


class ScadaRuntime:
    def __init__(self, config_path: Optional[str] = None, db_path: Optional[str] = None) -> None:
        self.config = PlantConfigManager(config_path)
        resolved_db = db_path or self.config.historian_config.get("db_path", "data/scada.db")
        self.db = Database(resolved_db)
        self.auth = AuthService(self.db)
        self.tag_engine = TagEngine()
        self.alarm_engine = AlarmEngine(self.db)

        is_sim = self.config.operating_mode in (OperatingMode.SIMULATION, OperatingMode.DEMO)
        driver_id = "sim_wtp" if is_sim else "plc_intake_modbus"
        self.tag_engine.register_tags(build_default_tags(driver_id=driver_id, simulated=is_sim))
        if not is_sim and self.config.tag_overrides:
            self.tag_engine.apply_overrides(self.config.tag_overrides)

        self.equipment_mgr = EquipmentManager(self.db, build_default_equipment())
        self.drivers: dict[str, DriverBase] = {
            d["id"]: create_driver(d) for d in self.config.drivers
        }
        self.historian = Historian(
            self.db, retention_days=int(self.config.historian_config.get("retention_days", 90))
        )
        self.analytics = AnalyticsEngine(self.db, self.tag_engine, self.equipment_mgr)
        self.water_quality = WaterQualityService(self.db, self.config, self.tag_engine)
        self.control = ControlService(
            self.config, self.tag_engine, self.equipment_mgr, self.drivers, self.alarm_engine, self.auth
        )
        self.reporting = ReportService(
            self.config, self.analytics, self.equipment_mgr, self.alarm_engine, self.water_quality
        )
        self.ws_clients: set[WebSocket] = set()
        self._last_hist_ts = 0.0
        self._last_retention_ts = 0.0
        self._watchdog_counter = 0

    def enabled_areas(self) -> set[str]:
        return {k for k, v in self.config.process_areas.items() if v.get("enabled", False)}

    def _sync_step_db(self, enabled: set[str], offline_drivers: set[str], enabled_drivers: set[str]) -> None:
        self.tag_engine.evaluate_staleness()
        active_tags = self.tag_engine.all_tags(enabled)
        self.alarm_engine.evaluate_tags(
            active_tags,
            offline_drivers=offline_drivers,
            all_enabled_drivers=enabled_drivers,
        )

        active_alarms = self.alarm_engine.get_active_alarms(include_unack_cleared=False)
        alarm_counts: dict[str, int] = {}
        for a in active_alarms:
            alarm_counts[a.source] = alarm_counts.get(a.source, 0) + 1

        discrepancies = self.equipment_mgr.sync_from_tags(self.tag_engine, alarm_counts)
        for eq_id, area, msg in discrepancies:
            self.alarm_engine.raise_or_clear(
                source=eq_id,
                process_area=area,
                category=AlarmCategory.EQUIPMENT_FAULT,
                priority=1,
                description=msg,
                condition_active=True,
                value_str="CMD_TIMEOUT",
            )
            self.alarm_engine.log_event("COMMAND_DISCREPANCY", eq_id, "SYSTEM", msg, severity="ERROR")

        now_s = datetime.now(timezone.utc).timestamp()
        interval = float(self.config.historian_config.get("sampling_interval_sec", 5))
        if now_s - self._last_hist_ts >= interval:
            self.historian.record_snapshot(active_tags)
            self._last_hist_ts = now_s

        if now_s - self._last_retention_ts >= 3600.0:
            self.historian.enforce_retention()
            self._last_retention_ts = now_s

    async def step_once(self) -> None:
        enabled = self.enabled_areas()
        offline_drivers: set[str] = set()
        enabled_drivers: set[str] = set()
        self._watchdog_counter = (self._watchdog_counter + 1) % 65535

        for drv_id, drv in self.drivers.items():
            if not drv.enabled:
                continue
            enabled_drivers.add(drv_id)
            if not drv.connected and drv.can_attempt_reconnect():
                await drv.connect()
            if not drv.connected:
                offline_drivers.add(drv_id)
                self.tag_engine.mark_driver_failure(drv_id)
                continue

            if self._watchdog_counter % 5 == 0:
                await drv.write_watchdog(self._watchdog_counter)

            tag_addrs = {
                t.tag_name: t.source_address
                for t in self.tag_engine.all_tags(enabled)
                if t.driver_id == drv_id
            }
            if not tag_addrs:
                continue
            try:
                updates = await drv.poll(tag_addrs)
                for tag_name, (val, qual) in updates.items():
                    self.tag_engine.update_tag(tag_name, val, qual)
            except Exception as exc:
                drv.connected = False
                drv.error_count += 1
                drv.schedule_reconnect_backoff()
                drv.last_error = str(exc)
                offline_drivers.add(drv_id)
                self.tag_engine.mark_driver_failure(drv_id)
                await asyncio.to_thread(
                    self.alarm_engine.log_event, "DRIVER_ERROR", drv_id, "SYSTEM", str(exc), "ERROR"
                )

        await asyncio.to_thread(self._sync_step_db, enabled, offline_drivers, enabled_drivers)

    def build_telemetry_payload(self) -> dict[str, Any]:
        enabled = self.enabled_areas()
        tags = self.tag_engine.all_tags(enabled)
        alarms = self.alarm_engine.get_active_alarms(include_unack_cleared=True)
        equipment = self.equipment_mgr.list_all(enabled)
        return {
            "frame_type": "FULL",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "plant_name": self.config.plant_name,
            "operating_mode": self.config.operating_mode.value,
            "tags": [t.model_dump(mode="json") for t in tags],
            "equipment": [e.model_dump(mode="json") for e in equipment],
            "alarms": [a.model_dump(mode="json") for a in alarms],
            "drivers": [d.get_status().model_dump(mode="json") for d in self.drivers.values()],
        }

    def build_telemetry_delta_payload(self) -> dict[str, Any]:
        """Lightweight 1Hz WebSocket payload omitting unchanging static tag metadata."""
        enabled = self.enabled_areas()
        tags = self.tag_engine.all_tags(enabled)
        alarms = self.alarm_engine.get_active_alarms(include_unack_cleared=True)
        equipment = self.equipment_mgr.list_all(enabled)
        return {
            "frame_type": "TICK",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "operating_mode": self.config.operating_mode.value,
            "tags": [
                {
                    "tag_name": t.tag_name,
                    "value": t.value,
                    "quality": t.quality.value,
                    "timestamp": t.timestamp.isoformat() if t.timestamp else None,
                    "last_good_timestamp": t.last_good_timestamp.isoformat() if t.last_good_timestamp else None,
                }
                for t in tags
            ],
            "equipment": [e.model_dump(mode="json") for e in equipment],
            "alarms": [a.model_dump(mode="json") for a in alarms],
            "drivers": [d.get_status().model_dump(mode="json") for d in self.drivers.values()],
        }


runtime = ScadaRuntime()


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    for drv in runtime.drivers.values():
        if drv.enabled:
            await drv.connect()
    await runtime.step_once()

    async def loop():
        while True:
            try:
                await runtime.step_once()
                if runtime.ws_clients:
                    payload = runtime.build_telemetry_delta_payload()
                    dead: list[WebSocket] = []
                    for ws in list(runtime.ws_clients):
                        try:
                            await ws.send_json(payload)
                        except Exception:
                            dead.append(ws)
                    for ws in dead:
                        runtime.ws_clients.discard(ws)
            except Exception as exc:
                runtime.alarm_engine.log_event("SCADA_LOOP_ERROR", "KERNEL", "SYSTEM", str(exc), severity="ERROR")
            await asyncio.sleep(1.0)

    task = asyncio.create_task(loop())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        for drv in runtime.drivers.values():
            await drv.disconnect()


_raw_origins = os.environ.get("WTP_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app = FastAPI(title="WTP Industrial SCADA API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def get_current_user(authorization: Optional[str] = Header(default=None)) -> UserInfo:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_token(token)
    user = runtime.auth.get_user(payload["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User disabled or missing")
    return user


def require_perm(perm: str):
    def _dep(user: UserInfo = Depends(get_current_user)) -> UserInfo:
        if not has_permission(user.role, perm):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing permission: {perm}")
        return user
    return _dep


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class ShelveRequest(BaseModel):
    duration_minutes: int = Field(default=30, ge=1, le=1440)
    reason: str = Field(min_length=1)

    @field_validator("reason")
    @classmethod
    def _reason_non_empty(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Reason cannot be empty")
        return s


class MaintenanceRequest(BaseModel):
    enable: bool
    note: str = Field(min_length=1)

    @field_validator("note")
    @classmethod
    def _note_non_empty(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Maintenance note cannot be empty")
        return s


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=1)
    full_name: str = Field(min_length=1)
    role: Role
    password: str = Field(min_length=8)


class AreaToggleRequest(BaseModel):
    enabled: bool


class SimFaultRequest(BaseModel):
    fault_type: str
    active: bool


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "OK",
        "plant_name": runtime.config.plant_name,
        "operating_mode": runtime.config.operating_mode.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/auth/login")
def login(req: LoginRequest, request: Request) -> dict[str, Any]:
    client_ip = request.client.host if request.client else "unknown"
    token, user = runtime.auth.authenticate(req.username, req.password, client_ip=client_ip)
    return {"access_token": token, "token_type": "bearer", "user": user.model_dump(mode="json")}


@app.post("/api/simulation/fault")
def inject_simulation_fault(req: SimFaultRequest, user: UserInfo = Depends(require_perm("control"))) -> dict[str, Any]:
    if runtime.config.operating_mode != OperatingMode.SIMULATION:
        raise HTTPException(status_code=403, detail="Fault injection is only permitted in SIMULATION mode")
    sim_drv = runtime.drivers.get("sim_wtp")
    if not isinstance(sim_drv, SimulationDriver):
        raise HTTPException(status_code=404, detail="Simulation driver not active")
    try:
        msg = sim_drv.inject_fault(req.fault_type, req.active)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    runtime.auth.record_audit(user.username, user.role.value, "SIM_FAULT_INJECT", req.fault_type, "SUCCESS", msg)
    runtime.alarm_engine.log_event("SIMULATION_FAULT", req.fault_type, user.username, msg, severity="WARNING")
    return {"status": "OK", "message": msg, "simulated": True}


@app.get("/api/auth/me")
def me(user: UserInfo = Depends(get_current_user)) -> dict[str, Any]:
    return user.model_dump(mode="json")


@app.get("/api/plant/overview")
def plant_overview(user: UserInfo = Depends(require_perm("view"))) -> dict[str, Any]:
    return {
        "plant_name": runtime.config.plant_name,
        "plant_id": runtime.config.plant_id,
        "operating_mode": runtime.config.operating_mode.value,
        "sim_control_enabled": runtime.config.sim_control_enabled,
        "process_areas": runtime.config.process_areas,
        **runtime.build_telemetry_payload(),
    }


@app.get("/api/tags")
def list_tags(
    area: Optional[str] = None,
    user: UserInfo = Depends(require_perm("view")),
) -> list[dict[str, Any]]:
    enabled = runtime.enabled_areas()
    tags = runtime.tag_engine.all_tags(enabled)
    if area:
        tags = [t for t in tags if t.process_area == area]
    return [t.model_dump(mode="json") for t in tags]


@app.get("/api/drivers")
def list_drivers(user: UserInfo = Depends(require_perm("view"))) -> dict[str, Any]:
    return {
        "statuses": [d.get_status().model_dump(mode="json") for d in runtime.drivers.values()],
        "configs": [redact_driver_config(cfg) for cfg in runtime.config.drivers],
    }


@app.post("/api/drivers/{driver_id}/reconnect")
async def reconnect_driver(driver_id: str, user: UserInfo = Depends(require_perm("configure_plant"))) -> dict[str, Any]:
    drv = runtime.drivers.get(driver_id)
    if not drv:
        raise HTTPException(status_code=404, detail="Driver not found")
    await drv.disconnect()
    ok = await drv.connect()
    runtime.auth.record_audit(user.username, user.role.value, "DRIVER_RECONNECT", driver_id, "SUCCESS" if ok else "FAILED")
    return drv.get_status().model_dump(mode="json")


@app.get("/api/equipment")
def list_equipment(
    area: Optional[str] = None,
    user: UserInfo = Depends(require_perm("view")),
) -> list[dict[str, Any]]:
    eqs = runtime.equipment_mgr.list_all(runtime.enabled_areas())
    if area:
        eqs = [e for e in eqs if e.process_area == area]
    return [e.model_dump(mode="json") for e in eqs]


@app.post("/api/equipment/{equipment_id}/maintenance")
def toggle_maintenance(
    equipment_id: str,
    req: MaintenanceRequest,
    user: UserInfo = Depends(require_perm("maintenance")),
) -> dict[str, Any]:
    try:
        eq = runtime.equipment_mgr.set_maintenance(equipment_id, req.enable, req.note, user.username)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    runtime.auth.record_audit(user.username, user.role.value, "MAINTENANCE_MODE", equipment_id, "SUCCESS", req.note)
    runtime.alarm_engine.log_event("MAINTENANCE", equipment_id, user.username, f"enable={req.enable}: {req.note}")
    return eq.model_dump(mode="json")


@app.get("/api/equipment/maintenance/logs")
def maintenance_logs(
    equipment_id: Optional[str] = None,
    user: UserInfo = Depends(require_perm("view")),
) -> list[dict[str, Any]]:
    return runtime.equipment_mgr.get_maintenance_logs(equipment_id)


@app.post("/api/control/command")
async def send_command(req: CommandRequest, user: UserInfo = Depends(get_current_user)) -> dict[str, Any]:
    res = await runtime.control.execute_command(req, user)
    return res.model_dump(mode="json")


@app.get("/api/alarms/active")
def active_alarms(user: UserInfo = Depends(require_perm("view"))) -> list[dict[str, Any]]:
    return [a.model_dump(mode="json") for a in runtime.alarm_engine.get_active_alarms(include_unack_cleared=True)]


@app.get("/api/alarms/history")
def alarm_history(limit: int = 300, user: UserInfo = Depends(require_perm("view"))) -> list[dict[str, Any]]:
    return [a.model_dump(mode="json") for a in runtime.alarm_engine.get_alarm_history(limit)]


class BulkAckRequest(BaseModel):
    alarm_ids: list[int]


@app.post("/api/alarms/ack-bulk")
def ack_alarms_bulk(req: BulkAckRequest, user: UserInfo = Depends(require_perm("ack_alarm"))) -> dict[str, Any]:
    count = runtime.alarm_engine.acknowledge_bulk(req.alarm_ids, user.username)
    runtime.auth.record_audit(user.username, user.role.value, "ACK_ALARM_BULK", f"count={count}", "SUCCESS")
    return {"acknowledged_count": count}


@app.post("/api/alarms/{alarm_id}/ack")
def ack_alarm(alarm_id: int, user: UserInfo = Depends(require_perm("ack_alarm"))) -> dict[str, Any]:
    try:
        rec = runtime.alarm_engine.acknowledge_alarm(alarm_id, user.username)
        runtime.auth.record_audit(user.username, user.role.value, "ACK_ALARM", str(alarm_id), "SUCCESS")
        return rec.model_dump(mode="json")
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/alarms/{alarm_id}/shelve")
def shelve_alarm(
    alarm_id: int,
    req: ShelveRequest,
    user: UserInfo = Depends(require_perm("shelve_alarm")),
) -> dict[str, Any]:
    try:
        rec = runtime.alarm_engine.shelve_alarm(alarm_id, user.username, req.duration_minutes, req.reason)
        runtime.auth.record_audit(user.username, user.role.value, "SHELVE_ALARM", str(alarm_id), "SUCCESS", req.reason)
        return rec.model_dump(mode="json")
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/events")
def list_events(limit: int = 200, user: UserInfo = Depends(require_perm("view"))) -> list[dict[str, Any]]:
    return [e.model_dump(mode="json") for e in runtime.alarm_engine.get_events(limit)]


@app.get("/api/historian/query")
def query_historian(
    tag_name: str,
    hours: float = Query(1.0, gt=0, le=720),
    bucket: Literal["RAW", "1M", "5M", "1H"] = "RAW",
    user: UserInfo = Depends(require_perm("view")),
) -> dict[str, Any]:
    end = datetime.now(timezone.utc)
    start = datetime.fromtimestamp(end.timestamp() - hours * 3600.0, tz=timezone.utc)
    res = runtime.historian.query_with_meta(tag_name, start=start, end=end, bucket=bucket)
    return {"tag_name": tag_name, "bucket": bucket, **res}


@app.get("/api/historian/export")
def export_historian_csv(
    tags: str = Query(..., description="Comma-separated tag names"),
    hours: float = Query(24.0, gt=0, le=720),
    user: UserInfo = Depends(require_perm("export_reports")),
) -> Response:
    end = datetime.now(timezone.utc)
    start = datetime.fromtimestamp(end.timestamp() - hours * 3600.0, tz=timezone.utc)
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    csv_text = runtime.historian.export_csv(tag_list, start=start, end=end)
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=historian_{end.strftime('%Y%m%d_%H%M')}.csv"},
    )


@app.get("/api/analytics/kpis")
def get_kpis(
    hours: float = Query(24.0, gt=0, le=720),
    user: UserInfo = Depends(require_perm("view")),
) -> dict[str, Any]:
    return runtime.analytics.compute_kpis(hours=hours, enabled_areas=runtime.enabled_areas())


@app.get("/api/water-quality/online")
def wq_online(user: UserInfo = Depends(require_perm("view"))) -> dict[str, Any]:
    return runtime.water_quality.get_online_parameters(runtime.enabled_areas())


@app.put("/api/water-quality/limits/{tag_name}")
def update_wq_limit(
    tag_name: str,
    limits: dict[str, Any],
    user: UserInfo = Depends(require_perm("configure_limits")),
) -> dict[str, Any]:
    try:
        updated = runtime.config.update_water_quality_limit(tag_name, limits)
        runtime.water_quality.sync_limits_to_tag_engine()
        runtime.auth.record_audit(user.username, user.role.value, "UPDATE_WQ_LIMIT", tag_name, "SUCCESS", str(limits))
        return updated
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/water-quality/lab")
def list_lab_results(user: UserInfo = Depends(require_perm("view"))) -> list[dict[str, Any]]:
    return runtime.water_quality.list_lab_results()


@app.post("/api/water-quality/lab")
def create_lab_result(
    payload: LabResultCreate,
    user: UserInfo = Depends(require_perm("lab_entry")),
) -> dict[str, Any]:
    res = runtime.water_quality.add_lab_result(payload, user.username)
    runtime.auth.record_audit(user.username, user.role.value, "LAB_ENTRY", payload.sample_id, "SUCCESS", payload.parameter)
    return res


@app.get("/api/reports/{report_type}")
def generate_report(
    report_type: str,
    format: Literal["json", "csv", "pdf"] = "json",
    days: int = Query(1, ge=1, le=365),
    user: UserInfo = Depends(require_perm("export_reports")),
):
    end = datetime.now(timezone.utc)
    start = datetime.fromtimestamp(end.timestamp() - max(1, days) * 86400.0, tz=timezone.utc)
    try:
        data = runtime.reporting.build_report_data(report_type, start=start, end=end)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if format == "csv":
        return Response(
            content=runtime.reporting.to_csv(data),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={report_type}.csv"},
        )
    if format == "pdf":
        return Response(
            content=runtime.reporting.to_pdf(data),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={report_type}.pdf"},
        )
    return data


@app.put("/api/config/process-areas/{area_key}")
def toggle_process_area(
    area_key: str,
    req: AreaToggleRequest,
    user: UserInfo = Depends(require_perm("configure_plant")),
) -> dict[str, Any]:
    try:
        res = runtime.config.set_area_enabled(area_key, req.enabled)
        runtime.auth.record_audit(user.username, user.role.value, "TOGGLE_AREA", area_key, "SUCCESS", f"enabled={req.enabled}")
        return res
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/admin/users")
def admin_list_users(user: UserInfo = Depends(require_perm("manage_users"))) -> list[dict[str, Any]]:
    return [u.model_dump(mode="json") for u in runtime.auth.list_users()]


@app.post("/api/admin/users")
def admin_create_user(req: CreateUserRequest, user: UserInfo = Depends(require_perm("manage_users"))) -> dict[str, Any]:
    created = runtime.auth.create_user(req.username, req.full_name, req.role, req.password, user.username)
    return created.model_dump(mode="json")


@app.put("/api/admin/users/{username}/status")
def admin_toggle_user(
    username: str,
    req: AreaToggleRequest,
    user: UserInfo = Depends(require_perm("manage_users")),
) -> dict[str, Any]:
    updated = runtime.auth.update_user_status(username, req.enabled, user.username)
    return updated.model_dump(mode="json")


@app.get("/api/admin/audit")
def admin_audit_logs(limit: int = 200, user: UserInfo = Depends(require_perm("view_audit"))) -> list[dict[str, Any]]:
    return runtime.auth.get_audit_logs(limit)


@app.websocket("/ws/telemetry")
async def ws_telemetry(websocket: WebSocket, token: Optional[str] = Query(default=None)):
    if not token:
        await websocket.close(code=4401)
        return
    try:
        payload = decode_token(token)
        if not runtime.auth.get_user(payload["sub"]):
            await websocket.close(code=4401)
            return
    except HTTPException:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    runtime.ws_clients.add(websocket)
    try:
        await websocket.send_json(runtime.build_telemetry_payload())
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        runtime.ws_clients.discard(websocket)
    except Exception:
        runtime.ws_clients.discard(websocket)
