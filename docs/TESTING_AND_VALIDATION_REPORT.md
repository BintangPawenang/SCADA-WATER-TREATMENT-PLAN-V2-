# WTP SCADA — Testing & Validation Report

## 1. Automated Backend Verification (`pytest`)
Executed via `backend\.venv\Scripts\python.exe -m pytest -v`:
- `test_tag_scaling_and_staleness`: Verifies 4–20 mA linear scaling (`12000` raw -> `2.5` m), `GOOD` quality assignment, staleness detection (`STALE` after `stale_after_sec`), and `COMM_FAILURE` propagation on driver failure.
- `test_alarm_ack_does_not_clear_active_alarm`: Verifies ISA-18.2 alarm lifecycle—acknowledging an active alarm transitions it to `ACK_ACTIVE` (`active=True`) and only transitions to `NORMAL` when the process condition clears.
- `test_secret_redaction`: Verifies `redact_driver_config()` masks PLC passwords/tokens before any API response.
- `test_api_auth_rbac_control_reports`: Verifies:
  - `/api/health` and PBKDF2/HMAC authentication
  - RBAC enforcement (`Viewer` receives `403` on control commands)
  - Critical command confirmation enforcement (`confirmed=False` returns `400`)
  - `SIMULATION` mode command execution (`200 ACCEPTED`, `simulated=True`)
  - `DEMO` mode control block (`403 DEMO_MODE_CONTROL_BLOCKED`)
  - Analytics missing-data handling (`specific_energy_consumption` returns `INSUFFICIENT_DATA` when `EIT-701` is uninstrumented)
  - Real PDF (`%PDF` header) and CSV report generation.
- `test_malformed_token_and_rate_limit`: Verifies malformed tokens return `401` and login rate limiting returns `429` after 5 consecutive failures.
- `test_historian_5m_buckets_and_retention`: Verifies 5-minute (`5M`) epoch bucket aggregation and retention cleanup (`enforce_retention()`).
- `test_command_discrepancy_and_batch_alarms`: Verifies command discrepancy detection (`Fail to START` after timeout) and batch tag alarm evaluation.
- `test_comm_loss_clears_ghost_running_and_suppresses_alarm_flood`: Verifies equipment enters `COMM_LOSS` (never staying `RUNNING`) on comm failure and driver-level alarm suppression raises 1 master alarm rather than flooding per-tag alarms.
- `test_namur_ne43_nan_guard_and_time_weighted_analytics`: Verifies `NaN` & NAMUR NE43 under-range `BAD` quality detection and unbiased trapezoidal time-weighted flow averaging.
- `test_setpoint_bounds_permissives_and_wq_sync`: Verifies setpoint min/max enforcement, soft permissive rejection when `XV-101` is `CLOSED`, and immediate sync of Water Quality alarm limits to `TagEngine`.

## 2. Frontend Build & Unit Verification
- `tsc -b && vite build`: TypeScript strict compilation and production bundle build (`0` errors).
- `vitest run`: Frontend auth token storage unit tests.

## 3. Simulation vs. Real Integration Boundaries
- **Verified Live**: FastAPI + WebSocket telemetry engine, SQLite WAL historian, ISA-18.2 alarm engine, RBAC & audit logging, PDF/CSV reporting, and synthetic WTP physics simulator (`SimulationDriver`).
- **Commissioning Required for Live Plant**: `ModbusTCPDriver` (`pymodbus`) is implemented and ready for register mapping (`HR:`/`IR:`/`CO:`). `MODBUS_RTU_GATEWAY`, `OPC_UA`, `MQTT`, and `REST_API` drivers are implemented as configurable adapters (`PlaceholderExternalDriver`) requiring site-specific endpoints, certificates, and register/topic maps during site commissioning.
