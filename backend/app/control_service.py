from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status

from .alarm_engine import AlarmEngine
from .auth import AuthService, has_permission
from .config_loader import PlantConfigManager
from .drivers import DriverBase
from .equipment_manager import EquipmentManager
from .models import (
    CommandRequest,
    CommandResult,
    ControlMode,
    DataQuality,
    OperatingMode,
    UserInfo,
)
from .tag_engine import TagEngine


class ControlService:
    def __init__(
        self,
        config: PlantConfigManager,
        tag_engine: TagEngine,
        equipment_mgr: EquipmentManager,
        drivers: dict[str, DriverBase],
        alarm_engine: AlarmEngine,
        auth_service: AuthService,
    ) -> None:
        self.config = config
        self.tag_engine = tag_engine
        self.equipment_mgr = equipment_mgr
        self.drivers = drivers
        self.alarm_engine = alarm_engine
        self.auth_service = auth_service
        self._in_flight: set[str] = set()

    async def execute_command(self, req: CommandRequest, user: UserInfo) -> CommandResult:
        cmd_id = str(uuid.uuid4())[:8]
        now = datetime.now(timezone.utc)

        # 1. Server-side RBAC
        if not has_permission(user.role, "control"):
            self.auth_service.record_audit(
                user.username, user.role.value, f"CMD_{req.action}", req.equipment_id, "DENIED", "Insufficient role"
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role not authorized for supervisory control")

        # 2. Demo mode safety block
        op_mode = self.config.operating_mode
        if op_mode == OperatingMode.DEMO:
            self.auth_service.record_audit(
                user.username, user.role.value, f"CMD_{req.action}", req.equipment_id, "BLOCKED_DEMO", "Control disabled in DEMO mode"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="DEMO_MODE_CONTROL_BLOCKED: Supervisory control commands are disabled in Demo mode.",
            )

        if op_mode == OperatingMode.SIMULATION and not self.config.sim_control_enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Simulation control is disabled in plant configuration.",
            )

        # 3. Equipment validation
        eq = self.equipment_mgr.get(req.equipment_id)
        if not eq:
            raise HTTPException(status_code=404, detail=f"Equipment {req.equipment_id} not found")

        if not self.config.is_area_enabled(eq.process_area):
            raise HTTPException(status_code=400, detail=f"Process area {eq.process_area} is disabled")

        if not eq.controllable:
            raise HTTPException(status_code=400, detail=f"{eq.id} is not controllable from SCADA")

        if eq.state in ("MAINTENANCE", "FAULT", "TRAVEL_FAULT", "COMM_LOSS"):
            self.auth_service.record_audit(
                user.username, user.role.value, f"CMD_{req.action}", eq.id, "REJECTED", f"Equipment in {eq.state}"
            )
            raise HTTPException(status_code=409, detail=f"Command rejected: {eq.id} is in {eq.state} state")

        if req.action != "SET_MODE" and eq.control_mode == ControlMode.LOCAL:
            raise HTTPException(status_code=409, detail=f"Command rejected: {eq.id} is in LOCAL mode (PLC/field control only)")

        # Soft SCADA permissive checks (PLC retains ultimate hard interlocks)
        self._check_permissives(eq.id, req.action)

        # 4. Critical command confirmation
        if req.action in ("START", "STOP", "OPEN", "CLOSE", "START_BACKWASH") and not req.confirmed:
            raise HTTPException(status_code=400, detail="Explicit operator confirmation required for critical command")

        # 5. Prevent conflicting concurrent commands
        if eq.id in self._in_flight:
            raise HTTPException(status_code=409, detail=f"Conflicting command already in progress for {eq.id}")

        # Determine target tag & value
        target_tag_name: str | None = None
        write_val: Any = None
        if req.action in ("START", "OPEN", "START_BACKWASH"):
            target_tag_name = eq.command_tag
            write_val = True
        elif req.action in ("STOP", "CLOSE"):
            target_tag_name = eq.command_tag
            write_val = False
        elif req.action == "SET_MODE":
            target_tag_name = eq.mode_tag
            if req.value not in (ControlMode.REMOTE.value, ControlMode.AUTO.value, ControlMode.MANUAL.value):
                raise HTTPException(status_code=400, detail="Invalid control mode")
            write_val = req.value
        elif req.action == "SET_SETPOINT":
            target_tag_name = eq.setpoint_tag
            if req.value is None:
                raise HTTPException(status_code=400, detail="Setpoint value required")
            try:
                write_val = float(req.value)
            except (TypeError, ValueError) as exc:
                raise HTTPException(status_code=400, detail="Setpoint must be numeric") from exc

        if not target_tag_name:
            raise HTTPException(status_code=400, detail=f"No PLC interface tag configured for {req.action} on {eq.id}")

        tag = self.tag_engine.get_tag(target_tag_name)
        if not tag:
            raise HTTPException(status_code=404, detail=f"Target tag {target_tag_name} not found")

        if req.action == "SET_SETPOINT":
            if tag.min_setpoint is not None and write_val < tag.min_setpoint:
                raise HTTPException(
                    status_code=400,
                    detail=f"Setpoint {write_val} below minimum permitted {tag.min_setpoint} {tag.engineering_unit}",
                )
            if tag.max_setpoint is not None and write_val > tag.max_setpoint:
                raise HTTPException(
                    status_code=400,
                    detail=f"Setpoint {write_val} exceeds maximum permitted {tag.max_setpoint} {tag.engineering_unit}",
                )

        driver = self.drivers.get(tag.driver_id)
        if not driver or not driver.enabled or not driver.connected:
            self.auth_service.record_audit(
                user.username, user.role.value, f"CMD_{req.action}", eq.id, "FAILED_COMM", f"Driver {tag.driver_id} offline"
            )
            raise HTTPException(status_code=503, detail=f"Communication unavailable for driver {tag.driver_id}")

        # Safety boundary: never allow SIMULATION mode to write to a non-simulation driver
        if op_mode == OperatingMode.SIMULATION and not driver.simulated:
            raise HTTPException(status_code=403, detail="Safety block: SIMULATION mode cannot write to real PLC drivers")

        self._in_flight.add(eq.id)
        eq.command_pending = req.action
        try:
            ok = await asyncio.wait_for(
                driver.write_tag(tag.source_address, write_val),
                timeout=max(1.0, driver.timeout_ms / 1000.0),
            )
            ack = "ACCEPTED" if ok else "REJECTED"
            if ok and req.action in ("START", "STOP", "OPEN", "CLOSE"):
                expected_map = {"START": "RUNNING", "STOP": "STOPPED", "OPEN": "OPEN", "CLOSE": "CLOSED"}
                self.equipment_mgr.register_command_expectation(eq.id, req.action, expected_map[req.action], timeout_sec=10.0)
            else:
                eq.command_pending = None
            msg = f"Command {req.action} {ack.lower()} by {'simulator' if driver.simulated else 'PLC'}"
            eq.command_ack_status = f"{req.action}:{ack}"
            self.auth_service.record_audit(
                user.username, user.role.value, f"CMD_{req.action}", eq.id, ack, f"value={write_val} sim={driver.simulated}"
            )
            self.alarm_engine.log_event(
                "SUPERVISORY_COMMAND",
                eq.id,
                user.username,
                f"{req.action} ({write_val}) -> {ack} [{'SIMULATION' if driver.simulated else 'PLC'}]",
            )
            return CommandResult(
                command_id=cmd_id,
                equipment_id=eq.id,
                action=req.action,
                command_ack=ack,
                feedback_state=eq.state,
                message=msg,
                timestamp=now,
                simulated=driver.simulated,
            )
        except asyncio.TimeoutError:
            eq.command_ack_status = f"{req.action}:TIMEOUT"
            self.auth_service.record_audit(
                user.username, user.role.value, f"CMD_{req.action}", eq.id, "TIMEOUT", "Driver write timed out"
            )
            raise HTTPException(status_code=504, detail=f"Command timeout waiting for {tag.driver_id}")
        finally:
            self._in_flight.discard(eq.id)

    def _check_permissives(self, equipment_id: str, action: str) -> None:
        """Evaluates SCADA-visible process permissives before issuing supervisory commands."""
        if equipment_id in ("PMP-101", "PMP-102") and action == "START":
            xv = self.equipment_mgr.get("XV-101")
            if xv and xv.state == "CLOSED":
                raise HTTPException(status_code=409, detail="Permissive not met: Intake isolation valve XV-101 is CLOSED")
            lit = self.tag_engine.get_tag("LIT-101")
            if lit and lit.quality == DataQuality.GOOD and isinstance(lit.value, (int, float)) and lit.value <= 0.8:
                raise HTTPException(status_code=409, detail="Permissive not met: Intake sump level LIT-101 at Low-Low")

        if equipment_id == "FLT-501" and action == "START_BACKWASH":
            for dep in ("PMP-501", "BLW-501"):
                deq = self.equipment_mgr.get(dep)
                if deq and deq.state in ("FAULT", "MAINTENANCE", "COMM_LOSS"):
                    raise HTTPException(status_code=409, detail=f"Permissive not met: Backwash auxiliary {dep} is in {deq.state}")

        if equipment_id in ("PMP-701", "PMP-702") and action == "START":
            lit = self.tag_engine.get_tag("LIT-701")
            if lit and lit.quality == DataQuality.GOOD and isinstance(lit.value, (int, float)) and lit.value <= 1.2:
                raise HTTPException(status_code=409, detail="Permissive not met: Clear water reservoir LIT-701 at Low-Low")
