# Water Treatment Plant SCADA — Engineering Configuration Guide

## 1. Operating Modes (`backend/config/plant_config.yaml`)
- **`SIMULATION`**: Runs the synthetic WTP physics simulator (`sim_wtp`). All tags carry `simulated: true`, and the HMI displays an explicit `SIMULATION MODE` banner. Supervisory commands only affect the isolated simulator and are blocked from touching any real PLC driver.
- **`DEMO`**: Read-only demonstration mode. All supervisory control commands are rejected server-side with `403 DEMO_MODE_CONTROL_BLOCKED`.
- **`PRODUCTION`**: Connects to site PLCs/RTUs via configured industrial drivers (`MODBUS_TCP`, `MODBUS_RTU_GATEWAY`, `OPC_UA`, `MQTT`, `REST_API`).

## 2. Configurable Process Areas (A–H)
Each area in `process_areas` can be enabled or disabled (`enabled: true | false`) in `plant_config.yaml` or via **Admin & Security** (`PUT /api/config/process-areas/{area_key}`):
- **A (`raw_water_intake`)**: Intake pumps, isolation valve, inlet flow/level/pressure, raw pH & turbidity.
- **B (`coagulation`)**: Coagulant tank, dosing pump, rapid flash mixer, dosing flow.
- **C (`flocculation`)**: Flocculation mixers, speed, process temperature.
- **D (`sedimentation`)**: Gravity clarifier, scraper, sludge withdrawal pump, effluent turbidity.
- **E (`filtration`)**: Dual-media filter, differential pressure, backwash pump, air scour blower, backwash valve.
- **F (`disinfection`)**: Chlorine dosing pump, contact tank, chemical tank, free residual chlorine.
- **G (`clear_water_storage`)**: Clear water reservoir, distribution pumps, outlet control valve, treated pH/conductivity/TDS.
- **H (`sludge_handling`)**: Sludge holding tank, sludge transfer pump, manual drain valve.

## 3. PLC / RTU Commissioning Checklist (Required Before `PRODUCTION`)
1. **Network & IP Addressing**: Replace placeholder IPs (`192.168.10.x`) in `plant_config.yaml` with verified site OT VLAN addresses.
2. **Tag Address Mapping (`backend/config/tags_config.yaml`)**: Configure per-tag `driver_id`, `source_address` (`HR:`, `HRF:`, `CO:`, `IR:`, OPC UA NodeId, or MQTT topic), `scaling`, `namur_ne43_check`, and `alarm_limits` in `production_tag_overrides` without editing Python code.
3. **Scaling & Limits**: Configure `raw_min`/`raw_max` -> `eng_min`/`eng_max` per instrument datasheet (e.g., 4–20 mA = 4000–20000 counts) and enable `namur_ne43_check: true` to flag `< 3.6 mA` / `> 21 mA` transmitter faults as `BAD`.
4. **Watchdog Heartbeat**: Configure `watchdog_address` per PLC driver in `plant_config.yaml` for SCADA↔PLC communication supervision.
5. **Water Quality Limits**: Update `water_quality_limits` in `plant_config.yaml` (or via UI for authorized roles; automatically synchronized with `TagEngine` alarm thresholds).
6. **Security (IEC 62443)**: Change all default initial setup passwords immediately, set `WTP_SCADA_SECRET` and `WTP_ALLOWED_ORIGINS` environment variables, and deploy behind a TLS reverse proxy.
