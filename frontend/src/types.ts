export type DataQuality = 'GOOD' | 'UNCERTAIN' | 'BAD' | 'STALE' | 'COMM_FAILURE';

export type OperatingMode = 'PRODUCTION' | 'SIMULATION' | 'DEMO';

export type Role =
  | 'Administrator'
  | 'Supervisor'
  | 'Operator'
  | 'Engineer'
  | 'Maintenance'
  | 'Viewer';

export interface UserInfo {
  username: string;
  full_name: string;
  role: Role;
  enabled: boolean;
  created_at: string;
  last_login?: string | null;
}

export interface TagState {
  tag_name: string;
  description: string;
  process_area: string;
  engineering_unit: string;
  data_type: 'FLOAT' | 'INT' | 'BOOL' | 'STRING';
  driver_id: string;
  source_address: string;
  permissions: 'READ_ONLY' | 'READ_WRITE';
  value: number | boolean | string | null;
  raw_value: unknown;
  quality: DataQuality;
  timestamp: string | null;
  last_good_timestamp?: string | null;
  min_setpoint?: number | null;
  max_setpoint?: number | null;
  stale_after_sec: number;
  simulated: boolean;
}

export interface EquipmentState {
  id: string;
  tag: string;
  name: string;
  category: string;
  process_area: string;
  controllable: boolean;
  allowed_states: string[];
  associated_tags: string[];
  command_tag?: string | null;
  mode_tag?: string | null;
  setpoint_tag?: string | null;
  feedback_tag?: string | null;
  fault_tag?: string | null;
  state: string;
  control_mode: string;
  runtime_hours: number;
  start_count: number;
  stop_count: number;
  last_state_change?: string | null;
  active_alarm_count: number;
  command_pending?: string | null;
  command_ack_status?: string | null;
  maintenance_note?: string | null;
}

export interface AlarmRecord {
  id: number;
  source: string;
  process_area: string;
  category: string;
  priority: number;
  description: string;
  state: 'UNACK_ACTIVE' | 'ACK_ACTIVE' | 'UNACK_CLEARED' | 'NORMAL' | 'SHELVED';
  active: boolean;
  acknowledged: boolean;
  shelved: boolean;
  shelved_until?: string | null;
  shelve_reason?: string | null;
  ack_user?: string | null;
  ack_time?: string | null;
  raised_at: string;
  cleared_at?: string | null;
  value_at_raise?: string | null;
}

export interface EventRecord {
  id: number;
  timestamp: string;
  event_type: string;
  source: string;
  actor: string;
  description: string;
  severity: string;
}

export interface DriverStatus {
  id: string;
  name: string;
  protocol: string;
  enabled: boolean;
  connected: boolean;
  simulated: boolean;
  last_poll?: string | null;
  last_error?: string | null;
  error_count: number;
  reconnect_attempts: number;
  poll_interval_ms: number;
  timeout_ms: number;
  stale_after_sec: number;
  description: string;
}

export interface ProcessAreaConfig {
  name: string;
  code: string;
  enabled: boolean;
  description: string;
}

export interface KpiItem {
  id: string;
  name: string;
  value: number | null;
  unit: string;
  formula: string;
  interval_hours: number;
  sources: string[];
  completeness_pct: number;
  status: 'AVAILABLE' | 'INSUFFICIENT_DATA';
  missing_reason?: string | null;
}

export interface WaterQualityParam {
  tag_name: string;
  name: string;
  process_area: string;
  value: number | null;
  unit: string;
  quality: DataQuality;
  timestamp: string | null;
  min_op: number | null;
  max_op: number | null;
  alarm_low: number | null;
  alarm_high: number | null;
  status: string;
  simulated: boolean;
}
