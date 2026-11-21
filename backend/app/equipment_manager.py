from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from .database import Database
from .models import (
    ControlMode,
    DataQuality,
    EquipmentCategory,
    EquipmentDefinition,
    EquipmentState,
)
from .tag_engine import TagEngine


class EquipmentManager:
    def __init__(self, db: Database, definitions: list[EquipmentDefinition]) -> None:
        self.db = db
        self._equipment: dict[str, EquipmentState] = {}
        self._last_tick: datetime = datetime.now(timezone.utc)
        self._pending_expectations: dict[str, tuple[str, str, datetime]] = {}
        self._load_definitions(definitions)

    def register_command_expectation(
        self, equipment_id: str, action: str, expected_state: str, timeout_sec: float = 10.0
    ) -> None:
        deadline = datetime.now(timezone.utc) + timedelta(seconds=timeout_sec)
        self._pending_expectations[equipment_id] = (action, expected_state, deadline)

    def _load_definitions(self, definitions: list[EquipmentDefinition]) -> None:
        with self.db.connect() as conn:
            for d in definitions:
                row = conn.execute(
                    "SELECT * FROM equipment_runtime WHERE equipment_id = ?", (d.id,)
                ).fetchone()
                if row:
                    rt_hours = float(row["runtime_hours"])
                    starts = int(row["start_count"])
                    stops = int(row["stop_count"])
                    last_chg = datetime.fromisoformat(row["last_state_change"]) if row["last_state_change"] else None
                    note = row["maintenance_note"]
                else:
                    rt_hours, starts, stops, last_chg, note = 0.0, 0, 0, None, None
                    conn.execute(
                        """
                        INSERT INTO equipment_runtime (equipment_id, runtime_hours, start_count, stop_count)
                        VALUES (?, 0.0, 0, 0)
                        """,
                        (d.id,),
                    )

                default_state = d.allowed_states[0] if d.allowed_states else "UNKNOWN"
                self._equipment[d.id] = EquipmentState(
                    **d.model_dump(),
                    state=default_state,
                    control_mode=ControlMode.REMOTE if d.controllable else ControlMode.LOCAL,
                    runtime_hours=rt_hours,
                    start_count=starts,
                    stop_count=stops,
                    last_state_change=last_chg,
                    maintenance_note=note,
                )

    def get(self, equipment_id: str) -> Optional[EquipmentState]:
        return self._equipment.get(equipment_id)

    def list_all(self, enabled_areas: Optional[set[str]] = None) -> list[EquipmentState]:
        if enabled_areas is None:
            return list(self._equipment.values())
        return [e for e in self._equipment.values() if e.process_area in enabled_areas]

    def sync_from_tags(self, tag_engine: TagEngine, active_alarm_counts: dict[str, int]) -> list[tuple[str, str, str]]:
        now = datetime.now(timezone.utc)
        dt_hours = max(0.0, (now - self._last_tick).total_seconds() / 3600.0)
        self._last_tick = now
        discrepancies: list[tuple[str, str, str]] = []

        updates: list[tuple[float, int, int, str, str, str]] = []
        for eq in self._equipment.values():
            eq.active_alarm_count = active_alarm_counts.get(eq.id, 0)

            if eq.mode_tag:
                mtag = tag_engine.get_tag(eq.mode_tag)
                if mtag and mtag.quality == DataQuality.GOOD and mtag.value in ControlMode._value2member_map_:
                    eq.control_mode = ControlMode(mtag.value)

            # Check fault tag first
            fault_active = False
            if eq.fault_tag:
                ftag = tag_engine.get_tag(eq.fault_tag)
                if ftag and ftag.quality == DataQuality.GOOD and bool(ftag.value):
                    fault_active = True

            prev_state = eq.state
            new_state = prev_state

            if eq.state == "MAINTENANCE":
                new_state = "MAINTENANCE"
                self._pending_expectations.pop(eq.id, None)
            elif fault_active:
                new_state = "TRAVEL_FAULT" if eq.category in (EquipmentCategory.CONTROL_VALVE, EquipmentCategory.ISOLATION_VALVE) else "FAULT"
                self._pending_expectations.pop(eq.id, None)
            elif eq.feedback_tag:
                fb = tag_engine.get_tag(eq.feedback_tag)
                if fb and fb.quality in (DataQuality.COMM_FAILURE, DataQuality.BAD, DataQuality.STALE):
                    new_state = "COMM_LOSS"
                    self._pending_expectations.pop(eq.id, None)
                elif fb and fb.quality == DataQuality.GOOD:
                    if eq.category in (
                        EquipmentCategory.PUMP,
                        EquipmentCategory.MOTOR,
                        EquipmentCategory.MIXER,
                        EquipmentCategory.BLOWER,
                        EquipmentCategory.DOSING_PUMP,
                    ):
                        new_state = "RUNNING" if bool(fb.value) else "STOPPED"
                    elif eq.category == EquipmentCategory.CLARIFIER:
                        new_state = "IN_SERVICE" if bool(fb.value) else "FAULT"
                    elif eq.category in (
                        EquipmentCategory.ISOLATION_VALVE,
                        EquipmentCategory.MANUAL_VALVE,
                        EquipmentCategory.FILTER,
                    ):
                        val_str = str(fb.value)
                        if val_str in eq.allowed_states:
                            new_state = val_str
            elif eq.category == EquipmentCategory.CONTROL_VALVE and eq.setpoint_tag:
                sptag = tag_engine.get_tag(eq.setpoint_tag)
                if sptag and sptag.quality in (DataQuality.COMM_FAILURE, DataQuality.BAD, DataQuality.STALE):
                    new_state = "COMM_LOSS"
                elif sptag and sptag.quality == DataQuality.GOOD and sptag.value is not None:
                    new_state = "OPEN" if float(sptag.value) > 2.0 else "CLOSED"
            elif eq.category == EquipmentCategory.TANK:
                new_state = "IN_SERVICE"

            # Transitional state & command discrepancy check
            exp = self._pending_expectations.get(eq.id)
            if exp is not None:
                action, expected_state, deadline = exp
                if new_state == expected_state:
                    self._pending_expectations.pop(eq.id, None)
                    eq.command_pending = None
                elif now > deadline:
                    self._pending_expectations.pop(eq.id, None)
                    eq.command_pending = None
                    discrepancies.append(
                        (eq.id, eq.process_area, f"Command discrepancy on {eq.id}: Fail to {action} (expected {expected_state}, actual {new_state})")
                    )
                else:
                    trans_map = {"START": "STARTING", "STOP": "STOPPING", "OPEN": "OPENING", "CLOSE": "CLOSING"}
                    trans_state = trans_map.get(action)
                    if trans_state and trans_state in eq.allowed_states:
                        new_state = trans_state

            if new_state in ("RUNNING", "IN_SERVICE"):
                eq.runtime_hours = round(eq.runtime_hours + dt_hours, 4)

            if new_state != prev_state:
                if new_state == "RUNNING":
                    eq.start_count += 1
                elif prev_state == "RUNNING" and new_state == "STOPPED":
                    eq.stop_count += 1
                eq.state = new_state
                eq.last_state_change = now
                if eq.id not in self._pending_expectations:
                    eq.command_pending = None
                updates.append(
                    (eq.runtime_hours, eq.start_count, eq.stop_count, eq.state, now.isoformat(), eq.id)
                )
            elif new_state in ("RUNNING", "IN_SERVICE") and dt_hours > 0:
                updates.append(
                    (
                        eq.runtime_hours,
                        eq.start_count,
                        eq.stop_count,
                        eq.state,
                        (eq.last_state_change or now).isoformat(),
                        eq.id,
                    )
                )

        if updates:
            with self.db.connect() as conn:
                conn.executemany(
                    """
                    UPDATE equipment_runtime
                    SET runtime_hours = ?, start_count = ?, stop_count = ?, last_state = ?, last_state_change = ?
                    WHERE equipment_id = ?
                    """,
                    updates,
                )
        return discrepancies

    def set_maintenance(self, equipment_id: str, enable: bool, note: str, actor: str) -> EquipmentState:
        eq = self._equipment.get(equipment_id)
        if not eq:
            raise KeyError(f"Equipment {equipment_id} not found")
        now = datetime.now(timezone.utc)
        eq.state = "MAINTENANCE" if enable else eq.allowed_states[0]
        eq.maintenance_note = note
        eq.last_state_change = now
        with self.db.connect() as conn:
            conn.execute(
                "UPDATE equipment_runtime SET last_state = ?, last_state_change = ?, maintenance_note = ? WHERE equipment_id = ?",
                (eq.state, now.isoformat(), note, equipment_id),
            )
            conn.execute(
                "INSERT INTO maintenance_logs (equipment_id, timestamp, actor, entry_type, description) VALUES (?, ?, ?, ?, ?)",
                (equipment_id, now.isoformat(), actor, "MAINTENANCE_MODE" if enable else "RETURN_TO_SERVICE", note),
            )
        return eq

    def get_maintenance_logs(self, equipment_id: Optional[str] = None, limit: int = 100) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            if equipment_id:
                rows = conn.execute(
                    "SELECT * FROM maintenance_logs WHERE equipment_id = ? ORDER BY id DESC LIMIT ?",
                    (equipment_id, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM maintenance_logs ORDER BY id DESC LIMIT ?", (limit,)
                ).fetchall()
            return [dict(r) for r in rows]
