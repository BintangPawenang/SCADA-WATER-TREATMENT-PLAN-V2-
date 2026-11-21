from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.alarm_engine import AlarmEngine
from app.analytics import AnalyticsEngine
from app.auth import AuthService, decode_token, redact_driver_config
from app.database import Database
from app.equipment_manager import EquipmentManager
from app.historian import Historian
from app.main import app, runtime
from app.models import (
    AlarmCategory,
    AlarmLifecycleState,
    AlarmLimits,
    DataQuality,
    DataType,
    EquipmentCategory,
    EquipmentDefinition,
    OperatingMode,
    ScalingConfig,
    TagDefinition,
)
from app.tag_engine import TagEngine
from fastapi import HTTPException


def test_tag_scaling_and_staleness(tmp_path: Path):
    eng = TagEngine()
    eng.register_tags([
        TagDefinition(
            tag_name="LIT-TEST",
            description="Test Level",
            process_area="raw_water_intake",
            engineering_unit="m",
            data_type=DataType.FLOAT,
            driver_id="plc_1",
            scaling=ScalingConfig(enabled=True, raw_min=4000, raw_max=20000, eng_min=0.0, eng_max=5.0, clamp=True),
            stale_after_sec=10.0,
        )
    ])
    ts = datetime.now(timezone.utc)
    t = eng.update_tag("LIT-TEST", 12000, DataQuality.GOOD, timestamp=ts)
    assert t is not None
    assert t.value == pytest.approx(2.5, rel=1e-3)
    assert t.quality == DataQuality.GOOD

    # Evaluate staleness 15s later
    stale = eng.evaluate_staleness(now=ts + timedelta(seconds=15))
    assert "LIT-TEST" in stale
    assert eng.get_tag("LIT-TEST").quality == DataQuality.STALE

    # Mark driver failure
    eng.mark_driver_failure("plc_1")
    assert eng.get_tag("LIT-TEST").quality == DataQuality.COMM_FAILURE


def test_alarm_ack_does_not_clear_active_alarm(tmp_path: Path):
    db = Database(str(tmp_path / "test_alarm.db"))
    ae = AlarmEngine(db)

    ae.raise_or_clear(
        source="FIT-101",
        process_area="raw_water_intake",
        category=AlarmCategory.HIGH,
        priority=2,
        description="High flow",
        condition_active=True,
        value_str="1300 m3/h",
    )
    active = ae.get_active_alarms()
    assert len(active) == 1
    aid = active[0].id
    assert active[0].state == AlarmLifecycleState.UNACK_ACTIVE

    # Acknowledge while still active -> MUST remain active (ACK_ACTIVE)
    acked = ae.acknowledge_alarm(aid, "operator")
    assert acked.acknowledged is True
    assert acked.active is True
    assert acked.state == AlarmLifecycleState.ACK_ACTIVE

    # Now condition clears -> transitions to NORMAL
    ae.raise_or_clear(
        source="FIT-101",
        process_area="raw_water_intake",
        category=AlarmCategory.HIGH,
        priority=2,
        description="Normal",
        condition_active=False,
    )
    assert len(ae.get_active_alarms()) == 0


def test_secret_redaction():
    redacted = redact_driver_config({"id": "opc", "host": "10.0.0.1", "password": "secret-plc-password", "token": "abc"})
    assert redacted["password"] == "***REDACTED***"
    assert redacted["token"] == "***REDACTED***"
    assert redacted["host"] == "10.0.0.1"


def test_api_auth_rbac_control_reports():
    with TestClient(app) as client:

        # Health
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "OK"

        # Login as viewer
        r_view = client.post("/api/auth/login", json={"username": "viewer", "password": "Viewer@WTP2026!"})
        assert r_view.status_code == 200
        viewer_tok = r_view.json()["access_token"]

        # Viewer cannot send control command
        r_cmd = client.post(
            "/api/control/command",
            headers={"Authorization": f"Bearer {viewer_tok}"},
            json={"equipment_id": "PMP-102", "action": "START", "confirmed": True},
        )
        assert r_cmd.status_code == 403

        # Login as operator
        r_op = client.post("/api/auth/login", json={"username": "operator", "password": "Oper@WTP2026!"})
        assert r_op.status_code == 200
        op_tok = r_op.json()["access_token"]

        # Unconfirmed critical command rejected
        r_unconf = client.post(
            "/api/control/command",
            headers={"Authorization": f"Bearer {op_tok}"},
            json={"equipment_id": "PMP-102", "action": "START", "confirmed": False},
        )
        assert r_unconf.status_code == 400

        # Confirmed command succeeds in SIMULATION mode
        r_ok = client.post(
            "/api/control/command",
            headers={"Authorization": f"Bearer {op_tok}"},
            json={"equipment_id": "PMP-102", "action": "START", "confirmed": True},
        )
        assert r_ok.status_code == 200
        assert r_ok.json()["command_ack"] == "ACCEPTED"
        assert r_ok.json()["simulated"] is True

        # DEMO mode blocks control
        orig_mode = runtime.config.data["plant"]["operating_mode"]
        try:
            runtime.config.data["plant"]["operating_mode"] = OperatingMode.DEMO.value
            r_demo = client.post(
                "/api/control/command",
                headers={"Authorization": f"Bearer {op_tok}"},
                json={"equipment_id": "PMP-102", "action": "STOP", "confirmed": True},
            )
            assert r_demo.status_code == 403
            assert "DEMO_MODE_CONTROL_BLOCKED" in r_demo.json()["detail"]
        finally:
            runtime.config.data["plant"]["operating_mode"] = orig_mode

        # Analytics: uninstrumented energy meter returns INSUFFICIENT_DATA
        r_kpi = client.get("/api/analytics/kpis?hours=24", headers={"Authorization": f"Bearer {op_tok}"})
        assert r_kpi.status_code == 200
        energy_kpi = [k for k in r_kpi.json()["kpis"] if k["id"] == "specific_energy_consumption"][0]
        assert energy_kpi["status"] == "INSUFFICIENT_DATA"
        assert energy_kpi["value"] is None

        # PDF & CSV Reports
        r_pdf = client.get("/api/reports/daily_production?format=pdf", headers={"Authorization": f"Bearer {op_tok}"})
        assert r_pdf.status_code == 200
        assert r_pdf.headers["content-type"] == "application/pdf"
        assert r_pdf.content.startswith(b"%PDF")

        r_csv = client.get("/api/reports/equipment_runtime?format=csv", headers={"Authorization": f"Bearer {op_tok}"})
        assert r_csv.status_code == 200
        assert "PMP-101" in r_csv.text

        # Simulation fault injection works in SIMULATION and blocked in DEMO
        r_sim_flt = client.post(
            "/api/simulation/fault",
            headers={"Authorization": f"Bearer {op_tok}"},
            json={"fault_type": "RAW_TURB_SPIKE", "active": True},
        )
        assert r_sim_flt.status_code == 200
        client.post(
            "/api/simulation/fault",
            headers={"Authorization": f"Bearer {op_tok}"},
            json={"fault_type": "RAW_TURB_SPIKE", "active": False},
        )


def test_malformed_token_and_rate_limit(tmp_path: Path):
    with pytest.raises(HTTPException) as exc:
        decode_token("not.valid")
    assert exc.value.status_code == 401

    db = Database(str(tmp_path / "auth_test.db"))
    auth = AuthService(db)
    for _ in range(5):
        with pytest.raises(HTTPException) as err:
            auth.authenticate("operator", "WrongPassword!", client_ip="10.0.0.99")
        assert err.value.status_code == 401

    with pytest.raises(HTTPException) as locked:
        auth.authenticate("operator", "Oper@WTP2026!", client_ip="10.0.0.99")
    assert locked.value.status_code == 429


def test_historian_5m_buckets_and_retention(tmp_path: Path):
    db = Database(str(tmp_path / "hist_test.db"))
    hist = Historian(db, retention_days=7)
    base = datetime(2026, 11, 20, 10, 0, 0, tzinfo=timezone.utc)

    with db.connect() as conn:
        conn.executemany(
            "INSERT INTO historian_samples (tag_name, timestamp, value, raw_value, quality, simulated) VALUES (?, ?, ?, ?, ?, ?)",
            [
                ("FIT-101", (base + timedelta(minutes=1)).isoformat(), 400.0, "400", "GOOD", 1),
                ("FIT-101", (base + timedelta(minutes=3)).isoformat(), 420.0, "420", "GOOD", 1),
                ("FIT-101", (base + timedelta(minutes=6)).isoformat(), 500.0, "500", "GOOD", 1),
                ("FIT-101", (base - timedelta(days=10)).isoformat(), 300.0, "300", "GOOD", 1),
            ],
        )

    buckets = hist.query("FIT-101", start=base, end=base + timedelta(minutes=15), bucket="5M")
    assert len(buckets) == 2
    assert buckets[0]["value"] == pytest.approx(410.0)
    assert buckets[1]["value"] == pytest.approx(500.0)

    deleted = hist.enforce_retention()
    assert deleted == 1


def test_command_discrepancy_and_batch_alarms(tmp_path: Path):
    db = Database(str(tmp_path / "eq_test.db"))
    eq_def = EquipmentDefinition(
        id="PMP-TEST",
        tag="PMP-TEST",
        name="Test Pump",
        category=EquipmentCategory.PUMP,
        process_area="raw_water_intake",
        controllable=True,
        allowed_states=["STOPPED", "STARTING", "RUNNING", "STOPPING", "FAULT"],
        feedback_tag="PMP-TEST_RUN",
    )
    mgr = EquipmentManager(db, [eq_def])
    eng = TagEngine()
    eng.register_tags([
        TagDefinition(
            tag_name="PMP-TEST_RUN",
            description="Test Pump FB",
            process_area="raw_water_intake",
            data_type=DataType.BOOL,
            driver_id="sim_wtp",
            alarm_limits=AlarmLimits(),
        ),
        TagDefinition(
            tag_name="FIT-TEST",
            description="Test Flow",
            process_area="raw_water_intake",
            engineering_unit="m3/h",
            data_type=DataType.FLOAT,
            driver_id="sim_wtp",
            alarm_limits=AlarmLimits(h=100.0, deadband=5.0, on_delay_sec=0.0),
        ),
    ])
    eng.update_tag("PMP-TEST_RUN", False, DataQuality.GOOD)
    eng.update_tag("FIT-TEST", 120.0, DataQuality.GOOD)

    # Register expectation already expired
    mgr.register_command_expectation("PMP-TEST", "START", "RUNNING", timeout_sec=-1.0)
    discrepancies = mgr.sync_from_tags(eng, {})
    assert len(discrepancies) == 1
    assert "Fail to START" in discrepancies[0][2]

    ae = AlarmEngine(db)
    ae.evaluate_tags(eng.all_tags())
    active = ae.get_active_alarms()
    assert len(active) == 1
    assert active[0].source == "FIT-TEST"


def test_comm_loss_clears_ghost_running_and_suppresses_alarm_flood(tmp_path: Path):
    db = Database(str(tmp_path / "ghost_test.db"))
    eq_def = EquipmentDefinition(
        id="PMP-GHOST",
        tag="PMP-GHOST",
        name="Ghost Test Pump",
        category=EquipmentCategory.PUMP,
        process_area="raw_water_intake",
        controllable=True,
        allowed_states=["STOPPED", "STARTING", "RUNNING", "STOPPING", "FAULT", "COMM_LOSS"],
        feedback_tag="PMP-GHOST_RUN",
    )
    mgr = EquipmentManager(db, [eq_def])
    eng = TagEngine()
    tags = [
        TagDefinition(
            tag_name="PMP-GHOST_RUN",
            description="Pump FB",
            process_area="raw_water_intake",
            data_type=DataType.BOOL,
            driver_id="plc_1",
        )
    ] + [
        TagDefinition(
            tag_name=f"FIT-{i}",
            description=f"Flow {i}",
            process_area="raw_water_intake",
            data_type=DataType.FLOAT,
            driver_id="plc_1",
        )
        for i in range(10)
    ]
    eng.register_tags(tags)
    eng.update_tag("PMP-GHOST_RUN", True, DataQuality.GOOD)
    mgr.sync_from_tags(eng, {})
    assert mgr.get("PMP-GHOST").state == "RUNNING"

    # Simulate driver disconnect -> equipment MUST transition to COMM_LOSS (not stay RUNNING)
    eng.mark_driver_failure("plc_1")
    mgr.sync_from_tags(eng, {})
    assert mgr.get("PMP-GHOST").state == "COMM_LOSS"

    # AlarmEngine must raise 1 master alarm on plc_1 and suppress the 11 downstream tag alarms
    ae = AlarmEngine(db)
    ae.evaluate_tags(eng.all_tags(), offline_drivers={"plc_1"}, all_enabled_drivers={"plc_1"})
    active = ae.get_active_alarms()
    assert len(active) == 1
    assert active[0].source == "plc_1"
    assert active[0].category == AlarmCategory.COMM_FAILURE


def test_namur_ne43_nan_guard_and_time_weighted_analytics(tmp_path: Path):
    eng = TagEngine()
    eng.register_tags([
        TagDefinition(
            tag_name="FIT-420",
            description="4-20mA Flow",
            process_area="raw_water_intake",
            engineering_unit="m3/h",
            data_type=DataType.FLOAT,
            driver_id="plc_1",
            scaling=ScalingConfig(enabled=True, raw_min=4000, raw_max=20000, eng_min=0.0, eng_max=1000.0, clamp=True),
            namur_ne43_check=True,
        )
    ])
    # NaN must yield BAD
    t_nan = eng.update_tag("FIT-420", float("nan"), DataQuality.GOOD)
    assert t_nan.quality == DataQuality.BAD

    # < 3.2mA (e.g., 2000 counts) under-range NE43 must yield BAD
    t_under = eng.update_tag("FIT-420", 2000.0, DataQuality.GOOD)
    assert t_under.quality == DataQuality.BAD

    # Time-weighted integration test: 100 m3/h held 50 min + 200 m3/h for 10 min
    db = Database(str(tmp_path / "tw_test.db"))
    mgr = EquipmentManager(db, [])
    analytics = AnalyticsEngine(db, eng, mgr)
    t0 = datetime(2026, 11, 20, 8, 0, 0, tzinfo=timezone.utc)
    with db.connect() as conn:
        conn.executemany(
            "INSERT INTO historian_samples (tag_name, timestamp, value, raw_value, quality, simulated) VALUES (?, ?, ?, ?, ?, ?)",
            [
                ("FIT-420", t0.isoformat(), 100.0, "100", "GOOD", 1),
                ("FIT-420", (t0 + timedelta(minutes=50)).isoformat(), 100.0, "100", "GOOD", 1),
                ("FIT-420", (t0 + timedelta(minutes=60)).isoformat(), 200.0, "200", "GOOD", 1),
            ],
        )
    avg, good_cnt, _ = analytics._avg_good_samples("FIT-420", t0, t0 + timedelta(minutes=60))
    assert good_cnt == 3
    # Area = 100*50 + 150*10 = 6500; / 60 = 108.33 (whereas arithmetic avg would be 133.33!)
    assert avg == pytest.approx(108.3333, rel=1e-3)


def test_setpoint_bounds_permissives_and_wq_sync():
    with TestClient(app) as client:
        r_op = client.post("/api/auth/login", json={"username": "operator", "password": "Oper@WTP2026!"})
        op_tok = r_op.json()["access_token"]
        r_sup = client.post("/api/auth/login", json={"username": "supervisor", "password": "Super@WTP2026!"})
        sup_tok = r_sup.json()["access_token"]

        # Out-of-bounds setpoint rejected (FCV-701 max is 100%)
        r_bad_sp = client.post(
            "/api/control/command",
            headers={"Authorization": f"Bearer {op_tok}"},
            json={"equipment_id": "FCV-701", "action": "SET_SETPOINT", "value": 150.0, "confirmed": True},
        )
        assert r_bad_sp.status_code == 400

        # Valid setpoint accepted
        r_good_sp = client.post(
            "/api/control/command",
            headers={"Authorization": f"Bearer {op_tok}"},
            json={"equipment_id": "FCV-701", "action": "SET_SETPOINT", "value": 65.0, "confirmed": True},
        )
        assert r_good_sp.status_code == 200

        # Water quality limit syncs immediately to TagEngine
        r_wq = client.put(
            "/api/water-quality/limits/AIT-501_TURB",
            headers={"Authorization": f"Bearer {sup_tok}"},
            json={"alarm_high": 1.2},
        )
        assert r_wq.status_code == 200
        assert runtime.tag_engine.get_tag("AIT-501_TURB").alarm_limits.h == 1.2
        # Restore original limit
        client.put(
            "/api/water-quality/limits/AIT-501_TURB",
            headers={"Authorization": f"Bearer {sup_tok}"},
            json={"alarm_high": 1.0},
        )

        # Permissive check: closing XV-101 blocks starting PMP-102
        client.post(
            "/api/control/command",
            headers={"Authorization": f"Bearer {op_tok}"},
            json={"equipment_id": "PMP-102", "action": "STOP", "confirmed": True},
        )
        client.post(
            "/api/control/command",
            headers={"Authorization": f"Bearer {op_tok}"},
            json={"equipment_id": "XV-101", "action": "CLOSE", "confirmed": True},
        )
        import asyncio
        asyncio.run(runtime.step_once())
        r_perm = client.post(
            "/api/control/command",
            headers={"Authorization": f"Bearer {op_tok}"},
            json={"equipment_id": "PMP-102", "action": "START", "confirmed": True},
        )
        assert r_perm.status_code == 409
        assert "Permissive" in r_perm.json()["detail"]
        # Re-open XV-101
        client.post(
            "/api/control/command",
            headers={"Authorization": f"Bearer {op_tok}"},
            json={"equipment_id": "XV-101", "action": "OPEN", "confirmed": True},
        )

        # Strict API input validation (QA BUG-06)
        assert client.get("/api/historian/query?tag_name=FIT-101&bucket=INVALID", headers={"Authorization": f"Bearer {op_tok}"}).status_code == 422
        assert client.get("/api/analytics/kpis?hours=-5", headers={"Authorization": f"Bearer {op_tok}"}).status_code == 422
        assert client.get("/api/reports/daily_production?format=xlsx", headers={"Authorization": f"Bearer {op_tok}"}).status_code == 422
        assert client.post(
            "/api/water-quality/lab",
            headers={"Authorization": f"Bearer {op_tok}"},
            json={"parameter": " ", "value": 1.0, "unit": "pH", "sample_id": "S1", "sample_point": "CW"},
        ).status_code == 422
        assert client.post(
            "/api/equipment/PMP-102/maintenance",
            headers={"Authorization": f"Bearer {sup_tok}"},
            json={"enable": False, "note": "   "},
        ).status_code == 422

        # Lightweight WS delta frame smaller than full payload (QA BUG-07)
        import json
        full_sz = len(json.dumps(runtime.build_telemetry_payload()))
        tick_payload = runtime.build_telemetry_delta_payload()
        tick_sz = len(json.dumps(tick_payload))
        assert tick_payload["frame_type"] == "TICK"
        assert tick_sz < full_sz
