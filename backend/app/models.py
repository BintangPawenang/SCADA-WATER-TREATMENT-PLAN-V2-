from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Literal, Optional
from pydantic import BaseModel, Field, field_validator


class OperatingMode(str, Enum):
    PRODUCTION = "PRODUCTION"
    SIMULATION = "SIMULATION"
    DEMO = "DEMO"


class DataQuality(str, Enum):
    GOOD = "GOOD"
    UNCERTAIN = "UNCERTAIN"
    BAD = "BAD"
    STALE = "STALE"
    COMM_FAILURE = "COMM_FAILURE"


class DataType(str, Enum):
    FLOAT = "FLOAT"
    INT = "INT"
    BOOL = "BOOL"
    STRING = "STRING"


class TagPermission(str, Enum):
    READ_ONLY = "READ_ONLY"
    READ_WRITE = "READ_WRITE"


class ScalingConfig(BaseModel):
    enabled: bool = False
    raw_min: float = 0.0
    raw_max: float = 100.0
    eng_min: float = 0.0
    eng_max: float = 100.0
    clamp: bool = True


class AlarmLimits(BaseModel):
    hh: Optional[float] = None
    h: Optional[float] = None
    l: Optional[float] = None
    ll: Optional[float] = None
    deadband: float = 0.0
    on_delay_sec: float = 0.0
    priority_hh: int = 1
    priority_h: int = 2
    priority_l: int = 2
    priority_ll: int = 1


class TagDefinition(BaseModel):
    tag_name: str
    description: str
    process_area: str
    engineering_unit: str = ""
    data_type: DataType = DataType.FLOAT
    driver_id: str
    source_address: str = "UNCONFIGURED_ADDRESS"
    scaling: ScalingConfig = Field(default_factory=ScalingConfig)
    permissions: TagPermission = TagPermission.READ_ONLY
    alarm_limits: AlarmLimits = Field(default_factory=AlarmLimits)
    min_setpoint: Optional[float] = None
    max_setpoint: Optional[float] = None
    namur_ne43_check: bool = False
    stale_after_sec: float = 15.0
    simulated: bool = False


class TagState(TagDefinition):
    value: Any = None
    raw_value: Any = None
    quality: DataQuality = DataQuality.BAD
    timestamp: Optional[datetime] = None
    last_good_timestamp: Optional[datetime] = None


class DriverStatus(BaseModel):
    id: str
    name: str
    protocol: str
    enabled: bool
    connected: bool
    simulated: bool = False
    last_poll: Optional[datetime] = None
    last_error: Optional[str] = None
    error_count: int = 0
    reconnect_attempts: int = 0
    poll_interval_ms: int = 1000
    timeout_ms: int = 3000
    stale_after_sec: float = 15.0
    description: str = ""


class EquipmentCategory(str, Enum):
    PUMP = "PUMP"
    MOTOR = "MOTOR"
    MIXER = "MIXER"
    BLOWER = "BLOWER"
    DOSING_PUMP = "DOSING_PUMP"
    CONTROL_VALVE = "CONTROL_VALVE"
    ISOLATION_VALVE = "ISOLATION_VALVE"
    MANUAL_VALVE = "MANUAL_VALVE"
    FILTER = "FILTER"
    TANK = "TANK"
    CLARIFIER = "CLARIFIER"


class ControlMode(str, Enum):
    LOCAL = "LOCAL"
    REMOTE = "REMOTE"
    MANUAL = "MANUAL"
    AUTO = "AUTO"


class EquipmentDefinition(BaseModel):
    id: str
    tag: str
    name: str
    category: EquipmentCategory
    process_area: str
    controllable: bool = False
    allowed_states: list[str]
    associated_tags: list[str] = Field(default_factory=list)
    command_tag: Optional[str] = None
    mode_tag: Optional[str] = None
    setpoint_tag: Optional[str] = None
    feedback_tag: Optional[str] = None
    fault_tag: Optional[str] = None


class EquipmentState(EquipmentDefinition):
    state: str = "UNKNOWN"
    control_mode: ControlMode = ControlMode.LOCAL
    runtime_hours: float = 0.0
    start_count: int = 0
    stop_count: int = 0
    last_state_change: Optional[datetime] = None
    active_alarm_count: int = 0
    command_pending: Optional[str] = None
    command_ack_status: Optional[str] = None
    maintenance_note: Optional[str] = None


class AlarmCategory(str, Enum):
    HIGH_HIGH = "HIGH_HIGH"
    HIGH = "HIGH"
    LOW = "LOW"
    LOW_LOW = "LOW_LOW"
    EQUIPMENT_FAULT = "EQUIPMENT_FAULT"
    COMM_FAILURE = "COMM_FAILURE"
    PROCESS_DEVIATION = "PROCESS_DEVIATION"
    INSTRUMENT_FAULT = "INSTRUMENT_FAULT"
    MAINTENANCE_WARNING = "MAINTENANCE_WARNING"


class AlarmLifecycleState(str, Enum):
    UNACK_ACTIVE = "UNACK_ACTIVE"
    ACK_ACTIVE = "ACK_ACTIVE"
    UNACK_CLEARED = "UNACK_CLEARED"
    NORMAL = "NORMAL"
    SHELVED = "SHELVED"


class AlarmRecord(BaseModel):
    id: int
    source: str
    process_area: str
    category: AlarmCategory
    priority: int  # 1=Critical, 2=High, 3=Medium, 4=Low
    description: str
    state: AlarmLifecycleState
    active: bool
    acknowledged: bool
    shelved: bool = False
    shelved_until: Optional[datetime] = None
    shelve_reason: Optional[str] = None
    ack_user: Optional[str] = None
    ack_time: Optional[datetime] = None
    raised_at: datetime
    cleared_at: Optional[datetime] = None
    value_at_raise: Optional[str] = None


class EventRecord(BaseModel):
    id: int
    timestamp: datetime
    event_type: str
    source: str
    actor: str
    description: str
    severity: str = "INFO"


class Role(str, Enum):
    ADMINISTRATOR = "Administrator"
    SUPERVISOR = "Supervisor"
    OPERATOR = "Operator"
    ENGINEER = "Engineer"
    MAINTENANCE = "Maintenance"
    VIEWER = "Viewer"


class UserInfo(BaseModel):
    username: str
    full_name: str
    role: Role
    enabled: bool = True
    created_at: datetime
    last_login: Optional[datetime] = None


class CommandRequest(BaseModel):
    equipment_id: str
    action: Literal["START", "STOP", "OPEN", "CLOSE", "SET_MODE", "SET_SETPOINT", "START_BACKWASH"]
    value: Optional[Any] = None
    confirmed: bool = False
    reason: Optional[str] = None


class CommandResult(BaseModel):
    command_id: str
    equipment_id: str
    action: str
    command_ack: str  # ACCEPTED | REJECTED | TIMEOUT | BLOCKED_DEMO
    feedback_state: str
    message: str
    timestamp: datetime
    simulated: bool = False


class LabResultCreate(BaseModel):
    parameter: Annotated[str, Field(min_length=1)]
    value: float
    unit: Annotated[str, Field(min_length=1)]
    sample_id: Annotated[str, Field(min_length=1)]
    sample_point: Annotated[str, Field(min_length=1)]
    notes: Optional[str] = None
    sampled_at: Optional[datetime] = None

    @field_validator("parameter", "unit", "sample_id", "sample_point")
    @classmethod
    def _must_not_be_blank(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Field cannot be empty or whitespace")
        return s
