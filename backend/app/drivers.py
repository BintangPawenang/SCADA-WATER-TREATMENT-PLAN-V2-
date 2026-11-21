from __future__ import annotations

import asyncio
import logging
import math
import random
import struct
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from .models import DataQuality, DriverStatus

logger = logging.getLogger("wtp_scada.drivers")


class DriverBase(ABC):
    def __init__(self, config: dict[str, Any]) -> None:
        self.id: str = config["id"]
        self.name: str = config.get("name", self.id)
        self.protocol: str = config.get("protocol", "UNKNOWN")
        self.enabled: bool = bool(config.get("enabled", False))
        self.poll_interval_ms: int = int(config.get("poll_interval_ms", 1000))
        self.timeout_ms: int = int(config.get("timeout_ms", 3000))
        self.stale_after_sec: float = float(config.get("stale_after_sec", 15.0))
        self.watchdog_address: Optional[str] = config.get("watchdog_address")
        self.description: str = config.get("description", "")
        self.simulated: bool = self.protocol == "SIMULATION"

        self.connected: bool = False
        self.last_poll: Optional[datetime] = None
        self.last_error: Optional[str] = None
        self.error_count: int = 0
        self.reconnect_attempts: int = 0
        self._next_reconnect_at: Optional[datetime] = None

    def can_attempt_reconnect(self, now: Optional[datetime] = None) -> bool:
        if not self.enabled or self.connected:
            return False
        if self._next_reconnect_at is None:
            return True
        return (now or datetime.now(timezone.utc)) >= self._next_reconnect_at

    def schedule_reconnect_backoff(self) -> None:
        self.reconnect_attempts += 1
        delay = min(30, 2 ** min(self.reconnect_attempts, 4))
        self._next_reconnect_at = datetime.now(timezone.utc) + timedelta(seconds=delay)

    def reset_reconnect_backoff(self) -> None:
        self.reconnect_attempts = 0
        self._next_reconnect_at = None

    async def write_watchdog(self, counter: int) -> bool:
        if not self.watchdog_address or not self.connected:
            return False
        if self.watchdog_address.startswith("UNCONFIGURED://"):
            return False
        return await self.write_tag(self.watchdog_address, counter)

    def get_status(self) -> DriverStatus:
        return DriverStatus(
            id=self.id,
            name=self.name,
            protocol=self.protocol,
            enabled=self.enabled,
            connected=self.connected,
            simulated=self.simulated,
            last_poll=self.last_poll,
            last_error=self.last_error,
            error_count=self.error_count,
            reconnect_attempts=self.reconnect_attempts,
            poll_interval_ms=self.poll_interval_ms,
            timeout_ms=self.timeout_ms,
            stale_after_sec=self.stale_after_sec,
            description=self.description,
        )

    @abstractmethod
    async def connect(self) -> bool:
        ...

    @abstractmethod
    async def disconnect(self) -> None:
        ...

    @abstractmethod
    async def poll(self, tag_addresses: dict[str, str]) -> dict[str, tuple[Any, DataQuality]]:
        ...

    @abstractmethod
    async def write_tag(self, address: str, value: Any) -> bool:
        ...


class SimulationDriver(DriverBase):
    """
    Synthetic Water Treatment Plant process physics simulator.
    Clearly labeled as SIMULATION; never represents live plant telemetry.
    """

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._tick = 0
        self._rng = random.Random(42)
        self._state: dict[str, Any] = {
            "PMP-101_RUN": True,
            "PMP-101_FLT": False,
            "PMP-101_MODE": "REMOTE",
            "PMP-102_RUN": False,
            "PMP-102_FLT": False,
            "PMP-102_MODE": "REMOTE",
            "XV-101_STS": "OPEN",
            "XV-101_MODE": "REMOTE",
            "PMP-201_RUN": True,
            "PMP-201_SP": 38.0,
            "PMP-201_FLT": False,
            "PMP-201_MODE": "REMOTE",
            "MXR-201_RUN": True,
            "MXR-201_FLT": False,
            "MXR-201_MODE": "REMOTE",
            "MXR-301_RUN": True,
            "MXR-301_SPD": 28.0,
            "MXR-301_FLT": False,
            "MXR-301_MODE": "REMOTE",
            "MXR-302_RUN": True,
            "MXR-302_SPD": 18.0,
            "MXR-302_FLT": False,
            "MXR-302_MODE": "REMOTE",
            "CLR-401_RUN": True,
            "CLR-401_FLT": False,
            "PMP-401_RUN": False,
            "PMP-401_FLT": False,
            "PMP-401_MODE": "REMOTE",
            "FLT-501_STS": "IN_SERVICE",
            "FLT-501_MODE": "REMOTE",
            "PMP-501_RUN": False,
            "PMP-501_FLT": False,
            "PMP-501_MODE": "REMOTE",
            "BLW-501_RUN": False,
            "BLW-501_FLT": False,
            "BLW-501_MODE": "REMOTE",
            "XV-501_STS": "CLOSED",
            "PMP-601_RUN": True,
            "PMP-601_SP": 16.5,
            "PMP-601_FLT": False,
            "PMP-601_MODE": "REMOTE",
            "PMP-701_RUN": True,
            "PMP-701_FLT": False,
            "PMP-701_MODE": "REMOTE",
            "PMP-702_RUN": False,
            "PMP-702_FLT": False,
            "PMP-702_MODE": "REMOTE",
            "FCV-701_POS": 72.0,
            "FCV-701_MODE": "REMOTE",
            "PMP-801_RUN": False,
            "PMP-801_FLT": False,
            "PMP-801_MODE": "REMOTE",
            "MV-801_STS": "CLOSED",
            "SCADA_HEARTBEAT": 0,
            "SIM_TURB_SPIKE": False,
            "SIM_COMM_FAULT_TAG": None,
            # Continuous process variables
            "LIT-101": 3.25,
            "LIT-201": 74.0,
            "LIT-401": 3.65,
            "PDIT-501": 0.42,
            "LIT-601": 3.40,
            "LIT-602": 68.0,
            "LIT-701": 4.15,
            "LIT-801": 36.0,
        }
        self._backwash_timer = 0

    async def connect(self) -> bool:
        self.connected = True
        self.last_error = None
        return True

    async def disconnect(self) -> None:
        self.connected = False

    async def poll(self, tag_addresses: dict[str, str]) -> dict[str, tuple[Any, DataQuality]]:
        if not self.enabled:
            return {}
        self._tick += 1
        s = self._state
        noise = lambda amp: self._rng.uniform(-amp, amp)

        # Backwash sequence state machine if active
        if s["FLT-501_STS"] != "IN_SERVICE":
            self._backwash_timer += 1
            if self._backwash_timer <= 6:
                s["FLT-501_STS"] = "BACKWASH_AIR_SCOUR"
                s["BLW-501_RUN"] = True
                s["PMP-501_RUN"] = False
                s["XV-501_STS"] = "OPEN"
            elif self._backwash_timer <= 14:
                s["FLT-501_STS"] = "BACKWASH_WATER"
                s["BLW-501_RUN"] = False
                s["PMP-501_RUN"] = True
                s["PDIT-501"] = max(0.18, s["PDIT-501"] - 0.08)
            elif self._backwash_timer <= 18:
                s["FLT-501_STS"] = "RINSE"
                s["PMP-501_RUN"] = False
                s["XV-501_STS"] = "CLOSED"
            else:
                s["FLT-501_STS"] = "IN_SERVICE"
                self._backwash_timer = 0

        # Raw Water Intake physics
        active_intake_pumps = (1 if s["PMP-101_RUN"] else 0) + (1 if s["PMP-102_RUN"] else 0)
        valve_factor = 1.0 if s["XV-101_STS"] == "OPEN" else 0.0
        raw_flow = (460.0 * active_intake_pumps + 18.0 * math.sin(self._tick / 15.0) + noise(4.5)) * valve_factor
        raw_flow = max(0.0, raw_flow)
        intake_press = (2.15 * active_intake_pumps + noise(0.04)) if valve_factor > 0 else 0.1
        s["LIT-101"] = max(0.9, min(4.6, s["LIT-101"] + (0.002 if active_intake_pumps == 0 else -0.001) + noise(0.005)))

        # Raw water quality
        raw_ph = 7.35 + 0.08 * math.sin(self._tick / 40.0) + noise(0.03)
        raw_turb = (185.0 if s.get("SIM_TURB_SPIKE") else 24.5) + 3.2 * math.sin(self._tick / 25.0) + noise(0.8)

        # Coagulation
        coag_flow = (s["PMP-201_SP"] + noise(0.4)) if s["PMP-201_RUN"] and raw_flow > 10 else 0.0
        s["LIT-201"] = max(12.0, s["LIT-201"] - coag_flow * 0.0002)

        # Flocculation
        temp = 24.2 + 0.3 * math.sin(self._tick / 60.0) + noise(0.05)

        # Sedimentation
        s["LIT-401"] = max(2.2, min(4.3, s["LIT-401"] + (raw_flow - 450.0) * 0.00005 + noise(0.004)))
        clarifier_turb = max(1.1, min(6.5, (raw_turb * 0.11 if s["PMP-201_RUN"] else raw_turb * 0.45) + noise(0.12)))

        # Filtration
        if s["FLT-501_STS"] == "IN_SERVICE" and raw_flow > 10:
            s["PDIT-501"] = min(1.65, s["PDIT-501"] + 0.0004 + noise(0.001))
            flt_flow = raw_flow * 0.985 + noise(2.5)
        else:
            flt_flow = 0.0
        flt_in_p = 1.45 + noise(0.02) if flt_flow > 10 else 0.15
        flt_out_p = max(0.05, flt_in_p - s["PDIT-501"])
        flt_turb = max(0.08, min(1.5, clarifier_turb * 0.08 + noise(0.015))) if flt_flow > 10 else 0.15

        # Disinfection
        cl2_flow = (s["PMP-601_SP"] + noise(0.2)) if s["PMP-601_RUN"] and flt_flow > 10 else 0.0
        cl2_res = max(0.05, min(2.8, (cl2_flow / max(flt_flow, 1.0)) * 32.0 + noise(0.03))) if flt_flow > 10 else 0.4
        s["LIT-601"] = max(1.6, min(4.3, s["LIT-601"] + noise(0.004)))
        s["LIT-602"] = max(12.0, s["LIT-602"] - cl2_flow * 0.00025)

        # Clear water storage & distribution
        active_dist_pumps = (1 if s["PMP-701_RUN"] else 0) + (1 if s["PMP-702_RUN"] else 0)
        dist_flow = max(0.0, active_dist_pumps * 445.0 * (s["FCV-701_POS"] / 72.0) + noise(4.0))
        dist_press = (3.85 * active_dist_pumps + noise(0.05)) if dist_flow > 10 else 0.2
        s["LIT-701"] = max(1.4, min(5.5, s["LIT-701"] + (flt_flow - dist_flow) * 0.00008 + noise(0.003)))

        treated_ph = 7.18 + noise(0.02)
        treated_cond = 265.0 + noise(3.0)
        treated_tds = treated_cond * 0.64 + noise(1.5)

        # Sludge handling
        sludge_flow = (28.5 + noise(0.6)) if s["PMP-801_RUN"] else 0.0
        sludge_in = 0.015 if s["PMP-401_RUN"] else 0.002
        s["LIT-801"] = max(8.0, min(90.0, s["LIT-801"] + sludge_in - (0.04 if s["PMP-801_RUN"] else 0.0)))

        computed = {
            "FIT-101": raw_flow,
            "LIT-101": s["LIT-101"],
            "PIT-101": intake_press,
            "AIT-101_PH": raw_ph,
            "AIT-102_TURB": raw_turb,
            "PMP-101_RUN": s["PMP-101_RUN"],
            "PMP-101_FLT": s["PMP-101_FLT"],
            "PMP-101_MODE": s["PMP-101_MODE"],
            "PMP-102_RUN": s["PMP-102_RUN"],
            "PMP-102_FLT": s["PMP-102_FLT"],
            "PMP-102_MODE": s["PMP-102_MODE"],
            "XV-101_STS": s["XV-101_STS"],
            "XV-101_MODE": s["XV-101_MODE"],
            "FIT-201": coag_flow,
            "LIT-201": s["LIT-201"],
            "PMP-201_RUN": s["PMP-201_RUN"],
            "PMP-201_SP": s["PMP-201_SP"],
            "PMP-201_FLT": s["PMP-201_FLT"],
            "PMP-201_MODE": s["PMP-201_MODE"],
            "MXR-201_RUN": s["MXR-201_RUN"],
            "MXR-201_FLT": s["MXR-201_FLT"],
            "MXR-201_MODE": s["MXR-201_MODE"],
            "TIT-301_TEMP": temp,
            "MXR-301_RUN": s["MXR-301_RUN"],
            "MXR-301_SPD": s["MXR-301_SPD"],
            "MXR-301_FLT": s["MXR-301_FLT"],
            "MXR-301_MODE": s["MXR-301_MODE"],
            "MXR-302_RUN": s["MXR-302_RUN"],
            "MXR-302_SPD": s["MXR-302_SPD"],
            "MXR-302_FLT": s["MXR-302_FLT"],
            "MXR-302_MODE": s["MXR-302_MODE"],
            "LIT-401": s["LIT-401"],
            "AIT-401_TURB": clarifier_turb,
            "CLR-401_RUN": s["CLR-401_RUN"],
            "CLR-401_FLT": s["CLR-401_FLT"],
            "PMP-401_RUN": s["PMP-401_RUN"],
            "PMP-401_FLT": s["PMP-401_FLT"],
            "PMP-401_MODE": s["PMP-401_MODE"],
            "PIT-501": flt_in_p,
            "PIT-502": flt_out_p,
            "PDIT-501": s["PDIT-501"],
            "FIT-501": flt_flow,
            "AIT-501_TURB": flt_turb,
            "FLT-501_STS": s["FLT-501_STS"],
            "FLT-501_MODE": s["FLT-501_MODE"],
            "PMP-501_RUN": s["PMP-501_RUN"],
            "PMP-501_FLT": s["PMP-501_FLT"],
            "PMP-501_MODE": s["PMP-501_MODE"],
            "BLW-501_RUN": s["BLW-501_RUN"],
            "BLW-501_FLT": s["BLW-501_FLT"],
            "BLW-501_MODE": s["BLW-501_MODE"],
            "XV-501_STS": s["XV-501_STS"],
            "FIT-601": cl2_flow,
            "AIT-601_CL2": cl2_res,
            "LIT-601": s["LIT-601"],
            "LIT-602": s["LIT-602"],
            "PMP-601_RUN": s["PMP-601_RUN"],
            "PMP-601_SP": s["PMP-601_SP"],
            "PMP-601_FLT": s["PMP-601_FLT"],
            "PMP-601_MODE": s["PMP-601_MODE"],
            "LIT-701": s["LIT-701"],
            "FIT-701": dist_flow,
            "PIT-701": dist_press,
            "AIT-701_PH": treated_ph,
            "AIT-702_COND": treated_cond,
            "AIT-703_TDS": treated_tds,
            "PMP-701_RUN": s["PMP-701_RUN"],
            "PMP-701_FLT": s["PMP-701_FLT"],
            "PMP-701_MODE": s["PMP-701_MODE"],
            "PMP-702_RUN": s["PMP-702_RUN"],
            "PMP-702_FLT": s["PMP-702_FLT"],
            "PMP-702_MODE": s["PMP-702_MODE"],
            "FCV-701_POS": s["FCV-701_POS"],
            "FCV-701_MODE": s["FCV-701_MODE"],
            "LIT-801": s["LIT-801"],
            "FIT-801": sludge_flow,
            "PMP-801_RUN": s["PMP-801_RUN"],
            "PMP-801_FLT": s["PMP-801_FLT"],
            "PMP-801_MODE": s["PMP-801_MODE"],
            "MV-801_STS": s["MV-801_STS"],
        }

        self.last_poll = datetime.now(timezone.utc)
        comm_fault_tag = s.get("SIM_COMM_FAULT_TAG")
        out: dict[str, tuple[Any, DataQuality]] = {}
        for tag in tag_addresses:
            if tag not in computed:
                continue
            if comm_fault_tag and tag == comm_fault_tag:
                out[tag] = (None, DataQuality.COMM_FAILURE)
            else:
                out[tag] = (computed[tag], DataQuality.GOOD)
        return out

    def inject_fault(self, fault_type: str, active: bool) -> str:
        if fault_type == "PMP-101_TRIP":
            self._state["PMP-101_FLT"] = active
            if active:
                self._state["PMP-101_RUN"] = False
            return f"PMP-101 trip {'activated' if active else 'cleared'}"
        if fault_type == "RAW_TURB_SPIKE":
            self._state["SIM_TURB_SPIKE"] = active
            return f"Raw turbidity spike {'activated' if active else 'cleared'}"
        if fault_type == "FIT-101_COMM_LOSS":
            self._state["SIM_COMM_FAULT_TAG"] = "FIT-101" if active else None
            return f"FIT-101 simulated comm loss {'activated' if active else 'cleared'}"
        raise ValueError(f"Unknown simulation fault type: {fault_type}")

    async def write_tag(self, address: str, value: Any) -> bool:
        tag_name = address.replace("SIM://", "")
        if tag_name.endswith("_CMD"):
            base = tag_name[:-4]
            if base == "XV-101":
                self._state["XV-101_STS"] = "OPEN" if bool(value) else "CLOSED"
                return True
            if base == "FLT-501_BW":
                if bool(value) and self._state["FLT-501_STS"] == "IN_SERVICE":
                    self._state["FLT-501_STS"] = "BACKWASH_AIR_SCOUR"
                    self._backwash_timer = 0
                return True
            run_key = f"{base}_RUN"
            if run_key in self._state:
                self._state[run_key] = bool(value)
                return True
        if tag_name in self._state:
            self._state[tag_name] = value
            return True
        return False


class ModbusTCPDriver(DriverBase):
    """Real Modbus TCP driver using pymodbus. Requires valid site register addresses."""

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self.host: str = config.get("host", "")
        self.port: int = int(config.get("port", 502))
        self.unit_id: int = int(config.get("unit_id", 1))
        self._client: Any = None

    async def connect(self) -> bool:
        if not self.enabled:
            return False
        try:
            from pymodbus.client import AsyncModbusTcpClient

            self._client = AsyncModbusTcpClient(
                host=self.host,
                port=self.port,
                timeout=self.timeout_ms / 1000.0,
            )
            ok = await self._client.connect()
            self.connected = bool(ok)
            if not ok:
                self.error_count += 1
                self.schedule_reconnect_backoff()
                self.last_error = f"Unable to connect to Modbus TCP {self.host}:{self.port}"
            else:
                self.last_error = None
                self.reset_reconnect_backoff()
            return self.connected
        except Exception as exc:
            self.connected = False
            self.error_count += 1
            self.schedule_reconnect_backoff()
            self.last_error = str(exc)
            return False

    async def disconnect(self) -> None:
        if self._client is not None:
            self._client.close()
        self.connected = False

    async def poll(self, tag_addresses: dict[str, str]) -> dict[str, tuple[Any, DataQuality]]:
        if not self.enabled:
            return {}
        if not self.connected:
            if self.can_attempt_reconnect():
                await self.connect()
        if not self.connected or self._client is None:
            return {tag: (None, DataQuality.COMM_FAILURE) for tag in tag_addresses}

        results: dict[str, tuple[Any, DataQuality]] = {}
        self.last_poll = datetime.now(timezone.utc)
        for tag, addr in tag_addresses.items():
            if addr.startswith("UNCONFIGURED://"):
                results[tag] = (None, DataQuality.BAD)
                continue
            try:
                # Formats: HR:100, HR_S16:100, HRF:100 (float32 BE), HRF_LE:100 (float32 word-swap), IR:100, IRF:100, CO:0
                kind, reg_str = addr.split(":", 1)
                reg = int(reg_str)
                if kind == "HR":
                    rr = await self._client.read_holding_registers(reg, count=1, device_id=self.unit_id)
                    results[tag] = (None, DataQuality.BAD) if rr.isError() else (rr.registers[0], DataQuality.GOOD)
                elif kind == "HR_S16":
                    rr = await self._client.read_holding_registers(reg, count=1, device_id=self.unit_id)
                    if rr.isError():
                        results[tag] = (None, DataQuality.BAD)
                    else:
                        val = struct.unpack(">h", struct.pack(">H", rr.registers[0]))[0]
                        results[tag] = (val, DataQuality.GOOD)
                elif kind in ("HRF", "HRF_LE"):
                    rr = await self._client.read_holding_registers(reg, count=2, device_id=self.unit_id)
                    if rr.isError():
                        results[tag] = (None, DataQuality.BAD)
                    else:
                        w0, w1 = (rr.registers[0], rr.registers[1]) if kind == "HRF" else (rr.registers[1], rr.registers[0])
                        val = struct.unpack(">f", struct.pack(">HH", w0, w1))[0]
                        if math.isnan(val) or math.isinf(val):
                            results[tag] = (None, DataQuality.BAD)
                        else:
                            results[tag] = (round(val, 4), DataQuality.GOOD)
                elif kind == "IR":
                    rr = await self._client.read_input_registers(reg, count=1, device_id=self.unit_id)
                    results[tag] = (None, DataQuality.BAD) if rr.isError() else (rr.registers[0], DataQuality.GOOD)
                elif kind == "IR_S16":
                    rr = await self._client.read_input_registers(reg, count=1, device_id=self.unit_id)
                    if rr.isError():
                        results[tag] = (None, DataQuality.BAD)
                    else:
                        val = struct.unpack(">h", struct.pack(">H", rr.registers[0]))[0]
                        results[tag] = (val, DataQuality.GOOD)
                elif kind in ("IRF", "IRF_LE"):
                    rr = await self._client.read_input_registers(reg, count=2, device_id=self.unit_id)
                    if rr.isError():
                        results[tag] = (None, DataQuality.BAD)
                    else:
                        w0, w1 = (rr.registers[0], rr.registers[1]) if kind == "IRF" else (rr.registers[1], rr.registers[0])
                        val = struct.unpack(">f", struct.pack(">HH", w0, w1))[0]
                        if math.isnan(val) or math.isinf(val):
                            results[tag] = (None, DataQuality.BAD)
                        else:
                            results[tag] = (round(val, 4), DataQuality.GOOD)
                elif kind == "CO":
                    rr = await self._client.read_coils(reg, count=1, device_id=self.unit_id)
                    results[tag] = (None, DataQuality.BAD) if rr.isError() else (bool(rr.bits[0]), DataQuality.GOOD)
                else:
                    results[tag] = (None, DataQuality.BAD)
            except Exception as exc:
                self.error_count += 1
                self.last_error = f"{tag}: {exc}"
                results[tag] = (None, DataQuality.COMM_FAILURE)
        return results

    async def write_tag(self, address: str, value: Any) -> bool:
        if not self.connected or self._client is None or address.startswith("UNCONFIGURED://"):
            return False
        kind, reg_str = address.split(":", 1)
        reg = int(reg_str)
        if kind == "CO":
            res = await self._client.write_coil(reg, bool(value), device_id=self.unit_id)
            return not res.isError()
        if kind in ("HR", "HR_S16"):
            raw = int(value) & 0xFFFF
            res = await self._client.write_register(reg, raw, device_id=self.unit_id)
            return not res.isError()
        if kind in ("HRF", "HRF_LE"):
            w0, w1 = struct.unpack(">HH", struct.pack(">f", float(value)))
            regs = [w0, w1] if kind == "HRF" else [w1, w0]
            res = await self._client.write_registers(reg, regs, device_id=self.unit_id)
            return not res.isError()
        return False


class PlaceholderExternalDriver(DriverBase):
    """
    Driver adapter for OPC UA, Modbus RTU Gateway, MQTT, and REST API.
    Requires site-specific endpoint/certificate/topic configuration before activation.
    """

    async def connect(self) -> bool:
        if not self.enabled:
            self.connected = False
            return False
        self.connected = False
        self.error_count += 1
        self.schedule_reconnect_backoff()
        self.last_error = f"{self.protocol} endpoint requires site commissioning & address mapping"
        return False

    async def disconnect(self) -> None:
        self.connected = False

    async def poll(self, tag_addresses: dict[str, str]) -> dict[str, tuple[Any, DataQuality]]:
        if not self.enabled:
            return {}
        self.last_poll = datetime.now(timezone.utc)
        return {tag: (None, DataQuality.COMM_FAILURE) for tag in tag_addresses}

    async def write_tag(self, address: str, value: Any) -> bool:
        return False


def create_driver(config: dict[str, Any]) -> DriverBase:
    proto = config.get("protocol", "")
    if proto == "SIMULATION":
        return SimulationDriver(config)
    if proto == "MODBUS_TCP":
        return ModbusTCPDriver(config)
    return PlaceholderExternalDriver(config)
