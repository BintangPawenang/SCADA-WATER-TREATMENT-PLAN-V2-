from __future__ import annotations

from .models import (
    AlarmLimits,
    DataType,
    EquipmentCategory,
    EquipmentDefinition,
    ScalingConfig,
    TagDefinition,
    TagPermission,
)


def build_default_tags(driver_id: str = "sim_wtp", simulated: bool = True) -> list[TagDefinition]:
    addr_prefix = "SIM://" if simulated else "UNCONFIGURED://"

    def t(
        name: str,
        desc: str,
        area: str,
        unit: str = "",
        dtype: DataType = DataType.FLOAT,
        perm: TagPermission = TagPermission.READ_ONLY,
        hh: float | None = None,
        h: float | None = None,
        l: float | None = None,
        ll: float | None = None,
        deadband: float = 0.0,
        min_sp: float | None = None,
        max_sp: float | None = None,
    ) -> TagDefinition:
        return TagDefinition(
            tag_name=name,
            description=desc,
            process_area=area,
            engineering_unit=unit,
            data_type=dtype,
            driver_id=driver_id,
            source_address=f"{addr_prefix}{name}",
            scaling=ScalingConfig(enabled=False),
            permissions=perm,
            alarm_limits=AlarmLimits(hh=hh, h=h, l=l, ll=ll, deadband=deadband, on_delay_sec=2.0),
            min_setpoint=min_sp,
            max_setpoint=max_sp,
            stale_after_sec=15.0,
            simulated=simulated,
        )

    return [
        # A. Raw Water Intake
        t("FIT-101", "Raw Water Inlet Flow", "raw_water_intake", "m3/h", hh=1400.0, h=1250.0, l=200.0, ll=50.0, deadband=10.0),
        t("LIT-101", "Raw Water Intake Sump Level", "raw_water_intake", "m", hh=4.8, h=4.3, l=1.2, ll=0.8, deadband=0.05),
        t("PIT-101", "Intake Header Discharge Pressure", "raw_water_intake", "bar", hh=4.5, h=4.0, l=0.8, ll=0.4, deadband=0.05),
        t("AIT-101_PH", "Raw Water pH", "raw_water_intake", "pH", hh=9.0, h=8.5, l=6.0, ll=5.5, deadband=0.05),
        t("AIT-102_TURB", "Raw Water Turbidity", "raw_water_intake", "NTU", hh=250.0, h=150.0, deadband=2.0),
        t("PMP-101_RUN", "Intake Pump 1 Running", "raw_water_intake", "", DataType.BOOL),
        t("PMP-101_CMD", "Intake Pump 1 Command", "raw_water_intake", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("PMP-101_FLT", "Intake Pump 1 Fault", "raw_water_intake", "", DataType.BOOL),
        t("PMP-101_MODE", "Intake Pump 1 Mode", "raw_water_intake", "", DataType.STRING, TagPermission.READ_WRITE),
        t("PMP-102_RUN", "Intake Pump 2 Running", "raw_water_intake", "", DataType.BOOL),
        t("PMP-102_CMD", "Intake Pump 2 Command", "raw_water_intake", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("PMP-102_FLT", "Intake Pump 2 Fault", "raw_water_intake", "", DataType.BOOL),
        t("PMP-102_MODE", "Intake Pump 2 Mode", "raw_water_intake", "", DataType.STRING, TagPermission.READ_WRITE),
        t("XV-101_STS", "Raw Water Intake Isolation Valve Status", "raw_water_intake", "", DataType.STRING),
        t("XV-101_CMD", "Raw Water Intake Isolation Valve Command", "raw_water_intake", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("XV-101_MODE", "Raw Water Intake Isolation Valve Mode", "raw_water_intake", "", DataType.STRING, TagPermission.READ_WRITE),

        # B. Coagulation System
        t("FIT-201", "Coagulant Dosing Flow", "coagulation", "L/h", hh=120.0, h=95.0, l=5.0, ll=1.0, deadband=1.0),
        t("LIT-201", "Coagulant Storage Tank Level", "coagulation", "%", hh=95.0, h=90.0, l=20.0, ll=10.0, deadband=1.0),
        t("PMP-201_RUN", "Coagulant Dosing Pump 1 Running", "coagulation", "", DataType.BOOL),
        t("PMP-201_CMD", "Coagulant Dosing Pump 1 Command", "coagulation", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("PMP-201_SP", "Coagulant Dosing Pump 1 Flow Setpoint", "coagulation", "L/h", DataType.FLOAT, TagPermission.READ_WRITE, min_sp=0.0, max_sp=120.0),
        t("PMP-201_FLT", "Coagulant Dosing Pump 1 Fault", "coagulation", "", DataType.BOOL),
        t("PMP-201_MODE", "Coagulant Dosing Pump 1 Mode", "coagulation", "", DataType.STRING, TagPermission.READ_WRITE),
        t("MXR-201_RUN", "Rapid Flash Mixer Running", "coagulation", "", DataType.BOOL),
        t("MXR-201_CMD", "Rapid Flash Mixer Command", "coagulation", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("MXR-201_FLT", "Rapid Flash Mixer Fault", "coagulation", "", DataType.BOOL),
        t("MXR-201_MODE", "Rapid Flash Mixer Mode", "coagulation", "", DataType.STRING, TagPermission.READ_WRITE),

        # C. Flocculation System
        t("TIT-301_TEMP", "Process Water Temperature", "flocculation", "degC", hh=35.0, h=32.0, deadband=0.2),
        t("MXR-301_RUN", "Flocculator Mixer 1 Running", "flocculation", "", DataType.BOOL),
        t("MXR-301_CMD", "Flocculator Mixer 1 Command", "flocculation", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("MXR-301_SPD", "Flocculator Mixer 1 Speed", "flocculation", "RPM", DataType.FLOAT, TagPermission.READ_WRITE, min_sp=0.0, max_sp=60.0),
        t("MXR-301_FLT", "Flocculator Mixer 1 Fault", "flocculation", "", DataType.BOOL),
        t("MXR-301_MODE", "Flocculator Mixer 1 Mode", "flocculation", "", DataType.STRING, TagPermission.READ_WRITE),
        t("MXR-302_RUN", "Flocculator Mixer 2 Running", "flocculation", "", DataType.BOOL),
        t("MXR-302_CMD", "Flocculator Mixer 2 Command", "flocculation", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("MXR-302_SPD", "Flocculator Mixer 2 Speed", "flocculation", "RPM", DataType.FLOAT, TagPermission.READ_WRITE, min_sp=0.0, max_sp=60.0),
        t("MXR-302_FLT", "Flocculator Mixer 2 Fault", "flocculation", "", DataType.BOOL),
        t("MXR-302_MODE", "Flocculator Mixer 2 Mode", "flocculation", "", DataType.STRING, TagPermission.READ_WRITE),

        # D. Sedimentation / Clarification
        t("LIT-401", "Clarifier Water Level", "sedimentation", "m", hh=4.5, h=4.2, l=2.5, ll=2.0, deadband=0.05),
        t("AIT-401_TURB", "Clarifier Effluent Turbidity", "sedimentation", "NTU", hh=10.0, h=5.0, deadband=0.2),
        t("CLR-401_RUN", "Clarifier Scraper Running", "sedimentation", "", DataType.BOOL),
        t("CLR-401_FLT", "Clarifier Scraper Torque Fault", "sedimentation", "", DataType.BOOL),
        t("PMP-401_RUN", "Clarifier Sludge Withdrawal Pump Running", "sedimentation", "", DataType.BOOL),
        t("PMP-401_CMD", "Clarifier Sludge Withdrawal Pump Command", "sedimentation", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("PMP-401_FLT", "Clarifier Sludge Withdrawal Pump Fault", "sedimentation", "", DataType.BOOL),
        t("PMP-401_MODE", "Clarifier Sludge Pump Mode", "sedimentation", "", DataType.STRING, TagPermission.READ_WRITE),

        # E. Filtration System
        t("PIT-501", "Filter Inlet Header Pressure", "filtration", "bar", hh=2.5, h=2.0, deadband=0.03),
        t("PIT-502", "Filter Outlet Header Pressure", "filtration", "bar", l=0.2, deadband=0.03),
        t("PDIT-501", "Filter Differential Pressure", "filtration", "bar", hh=1.8, h=1.4, deadband=0.03),
        t("FIT-501", "Combined Filter Effluent Flow", "filtration", "m3/h", hh=1350.0, h=1200.0, l=150.0, deadband=10.0),
        t("AIT-501_TURB", "Filtered Water Turbidity", "filtration", "NTU", hh=1.0, h=0.5, deadband=0.02),
        t("FLT-501_STS", "Filter Unit 1 State", "filtration", "", DataType.STRING),
        t("FLT-501_BW_CMD", "Filter Unit 1 Backwash Command", "filtration", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("FLT-501_MODE", "Filter Unit 1 Mode", "filtration", "", DataType.STRING, TagPermission.READ_WRITE),
        t("PMP-501_RUN", "Backwash Pump Running", "filtration", "", DataType.BOOL),
        t("PMP-501_CMD", "Backwash Pump Command", "filtration", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("PMP-501_FLT", "Backwash Pump Fault", "filtration", "", DataType.BOOL),
        t("PMP-501_MODE", "Backwash Pump Mode", "filtration", "", DataType.STRING, TagPermission.READ_WRITE),
        t("BLW-501_RUN", "Air Scour Blower Running", "filtration", "", DataType.BOOL),
        t("BLW-501_CMD", "Air Scour Blower Command", "filtration", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("BLW-501_FLT", "Air Scour Blower Fault", "filtration", "", DataType.BOOL),
        t("BLW-501_MODE", "Air Scour Blower Mode", "filtration", "", DataType.STRING, TagPermission.READ_WRITE),
        t("XV-501_STS", "Filter Backwash Valve Status", "filtration", "", DataType.STRING),

        # F. Disinfection System
        t("FIT-601", "Chlorine Dosing Flow", "disinfection", "L/h", hh=60.0, h=45.0, l=2.0, ll=0.5, deadband=0.5),
        t("AIT-601_CL2", "Free Residual Chlorine", "disinfection", "mg/L", hh=3.0, h=2.0, l=0.5, ll=0.2, deadband=0.05),
        t("LIT-601", "Contact Tank Level", "disinfection", "m", hh=4.6, h=4.2, l=1.5, ll=1.0, deadband=0.05),
        t("LIT-602", "Chlorine Chemical Tank Level", "disinfection", "%", hh=95.0, h=90.0, l=20.0, ll=10.0, deadband=1.0),
        t("PMP-601_RUN", "Chlorine Dosing Pump 1 Running", "disinfection", "", DataType.BOOL),
        t("PMP-601_CMD", "Chlorine Dosing Pump 1 Command", "disinfection", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("PMP-601_SP", "Chlorine Dosing Pump 1 Setpoint", "disinfection", "L/h", DataType.FLOAT, TagPermission.READ_WRITE, min_sp=0.0, max_sp=60.0),
        t("PMP-601_FLT", "Chlorine Dosing Pump 1 Fault", "disinfection", "", DataType.BOOL),
        t("PMP-601_MODE", "Chlorine Dosing Pump 1 Mode", "disinfection", "", DataType.STRING, TagPermission.READ_WRITE),

        # G. Clear Water Storage & Distribution
        t("LIT-701", "Clear Water Reservoir Level", "clear_water_storage", "m", hh=5.8, h=5.3, l=1.8, ll=1.2, deadband=0.05),
        t("FIT-701", "Treated Water Distribution Flow", "clear_water_storage", "m3/h", hh=1300.0, h=1150.0, l=100.0, deadband=10.0),
        t("PIT-701", "Distribution Header Pressure", "clear_water_storage", "bar", hh=6.0, h=5.5, l=2.0, ll=1.5, deadband=0.05),
        t("AIT-701_PH", "Treated Water pH", "clear_water_storage", "pH", hh=8.8, h=8.5, l=6.5, ll=6.2, deadband=0.05),
        t("AIT-702_COND", "Treated Water Conductivity", "clear_water_storage", "uS/cm", hh=1000.0, h=800.0, deadband=5.0),
        t("AIT-703_TDS", "Treated Water TDS", "clear_water_storage", "mg/L", hh=650.0, h=500.0, deadband=5.0),
        t("PMP-701_RUN", "Distribution Pump 1 Running", "clear_water_storage", "", DataType.BOOL),
        t("PMP-701_CMD", "Distribution Pump 1 Command", "clear_water_storage", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("PMP-701_FLT", "Distribution Pump 1 Fault", "clear_water_storage", "", DataType.BOOL),
        t("PMP-701_MODE", "Distribution Pump 1 Mode", "clear_water_storage", "", DataType.STRING, TagPermission.READ_WRITE),
        t("PMP-702_RUN", "Distribution Pump 2 Running", "clear_water_storage", "", DataType.BOOL),
        t("PMP-702_CMD", "Distribution Pump 2 Command", "clear_water_storage", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("PMP-702_FLT", "Distribution Pump 2 Fault", "clear_water_storage", "", DataType.BOOL),
        t("PMP-702_MODE", "Distribution Pump 2 Mode", "clear_water_storage", "", DataType.STRING, TagPermission.READ_WRITE),
        t("FCV-701_POS", "Distribution Outlet Control Valve Position", "clear_water_storage", "%", DataType.FLOAT, TagPermission.READ_WRITE, min_sp=0.0, max_sp=100.0),
        t("FCV-701_MODE", "Distribution Outlet Control Valve Mode", "clear_water_storage", "", DataType.STRING, TagPermission.READ_WRITE),

        # H. Sludge Handling
        t("LIT-801", "Sludge Holding Tank Level", "sludge_handling", "%", hh=92.0, h=85.0, l=10.0, deadband=1.0),
        t("FIT-801", "Sludge Transfer Flow", "sludge_handling", "m3/h", hh=60.0, h=50.0, deadband=0.5),
        t("PMP-801_RUN", "Sludge Transfer Pump Running", "sludge_handling", "", DataType.BOOL),
        t("PMP-801_CMD", "Sludge Transfer Pump Command", "sludge_handling", "", DataType.BOOL, TagPermission.READ_WRITE),
        t("PMP-801_FLT", "Sludge Transfer Pump Fault", "sludge_handling", "", DataType.BOOL),
        t("PMP-801_MODE", "Sludge Transfer Pump Mode", "sludge_handling", "", DataType.STRING, TagPermission.READ_WRITE),
        t("MV-801_STS", "Sludge Drain Manual Valve Status", "sludge_handling", "", DataType.STRING),
    ]


ROTATING_STATES = ["STOPPED", "STARTING", "RUNNING", "STOPPING", "FAULT", "MAINTENANCE", "COMM_LOSS"]
ACTUATED_VALVE_STATES = ["CLOSED", "OPENING", "OPEN", "CLOSING", "TRAVEL_FAULT", "MAINTENANCE", "COMM_LOSS"]
MANUAL_VALVE_STATES = ["OPEN", "CLOSED", "THROTTLED", "MAINTENANCE", "COMM_LOSS"]
FILTER_STATES = ["IN_SERVICE", "STANDBY", "BACKWASH_AIR_SCOUR", "BACKWASH_WATER", "RINSE", "OUT_OF_SERVICE", "FAULT", "MAINTENANCE", "COMM_LOSS"]
TANK_STATES = ["IN_SERVICE", "BYPASSED", "DRAINING", "MAINTENANCE", "FAULT", "COMM_LOSS"]


def build_default_equipment() -> list[EquipmentDefinition]:
    return [
        # A. Raw Water Intake
        EquipmentDefinition(
            id="PMP-101", tag="PMP-101", name="Intake Pump 1", category=EquipmentCategory.PUMP,
            process_area="raw_water_intake", controllable=True, allowed_states=ROTATING_STATES,
            associated_tags=["FIT-101", "PIT-101", "LIT-101"], command_tag="PMP-101_CMD",
            mode_tag="PMP-101_MODE", feedback_tag="PMP-101_RUN", fault_tag="PMP-101_FLT",
        ),
        EquipmentDefinition(
            id="PMP-102", tag="PMP-102", name="Intake Pump 2 (Standby)", category=EquipmentCategory.PUMP,
            process_area="raw_water_intake", controllable=True, allowed_states=ROTATING_STATES,
            associated_tags=["FIT-101", "PIT-101", "LIT-101"], command_tag="PMP-102_CMD",
            mode_tag="PMP-102_MODE", feedback_tag="PMP-102_RUN", fault_tag="PMP-102_FLT",
        ),
        EquipmentDefinition(
            id="XV-101", tag="XV-101", name="Intake Isolation Valve", category=EquipmentCategory.ISOLATION_VALVE,
            process_area="raw_water_intake", controllable=True, allowed_states=ACTUATED_VALVE_STATES,
            associated_tags=["FIT-101"], command_tag="XV-101_CMD", mode_tag="XV-101_MODE", feedback_tag="XV-101_STS",
        ),

        # B. Coagulation
        EquipmentDefinition(
            id="TNK-201", tag="TNK-201", name="Coagulant Storage Tank", category=EquipmentCategory.TANK,
            process_area="coagulation", controllable=False, allowed_states=TANK_STATES,
            associated_tags=["LIT-201"],
        ),
        EquipmentDefinition(
            id="PMP-201", tag="PMP-201", name="Coagulant Dosing Pump 1", category=EquipmentCategory.DOSING_PUMP,
            process_area="coagulation", controllable=True, allowed_states=ROTATING_STATES,
            associated_tags=["FIT-201", "LIT-201"], command_tag="PMP-201_CMD",
            mode_tag="PMP-201_MODE", setpoint_tag="PMP-201_SP", feedback_tag="PMP-201_RUN", fault_tag="PMP-201_FLT",
        ),
        EquipmentDefinition(
            id="MXR-201", tag="MXR-201", name="Rapid Flash Mixer", category=EquipmentCategory.MIXER,
            process_area="coagulation", controllable=True, allowed_states=ROTATING_STATES,
            associated_tags=["FIT-201"], command_tag="MXR-201_CMD", mode_tag="MXR-201_MODE",
            feedback_tag="MXR-201_RUN", fault_tag="MXR-201_FLT",
        ),

        # C. Flocculation
        EquipmentDefinition(
            id="MXR-301", tag="MXR-301", name="Flocculator Mixer 1", category=EquipmentCategory.MIXER,
            process_area="flocculation", controllable=True, allowed_states=ROTATING_STATES,
            associated_tags=["MXR-301_SPD", "TIT-301_TEMP"], command_tag="MXR-301_CMD",
            mode_tag="MXR-301_MODE", setpoint_tag="MXR-301_SPD", feedback_tag="MXR-301_RUN", fault_tag="MXR-301_FLT",
        ),
        EquipmentDefinition(
            id="MXR-302", tag="MXR-302", name="Flocculator Mixer 2", category=EquipmentCategory.MIXER,
            process_area="flocculation", controllable=True, allowed_states=ROTATING_STATES,
            associated_tags=["MXR-302_SPD", "TIT-301_TEMP"], command_tag="MXR-302_CMD",
            mode_tag="MXR-302_MODE", setpoint_tag="MXR-302_SPD", feedback_tag="MXR-302_RUN", fault_tag="MXR-302_FLT",
        ),

        # D. Sedimentation / Clarification
        EquipmentDefinition(
            id="CLR-401", tag="CLR-401", name="Gravity Clarifier & Scraper", category=EquipmentCategory.CLARIFIER,
            process_area="sedimentation", controllable=False, allowed_states=TANK_STATES,
            associated_tags=["LIT-401", "AIT-401_TURB"], feedback_tag="CLR-401_RUN", fault_tag="CLR-401_FLT",
        ),
        EquipmentDefinition(
            id="PMP-401", tag="PMP-401", name="Clarifier Sludge Pump", category=EquipmentCategory.PUMP,
            process_area="sedimentation", controllable=True, allowed_states=ROTATING_STATES,
            associated_tags=["LIT-401"], command_tag="PMP-401_CMD", mode_tag="PMP-401_MODE",
            feedback_tag="PMP-401_RUN", fault_tag="PMP-401_FLT",
        ),

        # E. Filtration
        EquipmentDefinition(
            id="FLT-501", tag="FLT-501", name="Dual-Media Gravity Filter 1", category=EquipmentCategory.FILTER,
            process_area="filtration", controllable=True, allowed_states=FILTER_STATES,
            associated_tags=["PIT-501", "PIT-502", "PDIT-501", "FIT-501", "AIT-501_TURB"],
            command_tag="FLT-501_BW_CMD", mode_tag="FLT-501_MODE", feedback_tag="FLT-501_STS",
        ),
        EquipmentDefinition(
            id="PMP-501", tag="PMP-501", name="Filter Backwash Pump", category=EquipmentCategory.PUMP,
            process_area="filtration", controllable=True, allowed_states=ROTATING_STATES,
            associated_tags=["PDIT-501", "FIT-501"], command_tag="PMP-501_CMD", mode_tag="PMP-501_MODE",
            feedback_tag="PMP-501_RUN", fault_tag="PMP-501_FLT",
        ),
        EquipmentDefinition(
            id="BLW-501", tag="BLW-501", name="Air Scour Blower", category=EquipmentCategory.BLOWER,
            process_area="filtration", controllable=True, allowed_states=ROTATING_STATES,
            associated_tags=["PDIT-501"], command_tag="BLW-501_CMD", mode_tag="BLW-501_MODE",
            feedback_tag="BLW-501_RUN", fault_tag="BLW-501_FLT",
        ),
        EquipmentDefinition(
            id="XV-501", tag="XV-501", name="Backwash Isolation Valve", category=EquipmentCategory.ISOLATION_VALVE,
            process_area="filtration", controllable=False, allowed_states=ACTUATED_VALVE_STATES,
            associated_tags=["PDIT-501"], feedback_tag="XV-501_STS",
        ),

        # F. Disinfection
        EquipmentDefinition(
            id="TNK-601", tag="TNK-601", name="Chlorine Contact Basin", category=EquipmentCategory.TANK,
            process_area="disinfection", controllable=False, allowed_states=TANK_STATES,
            associated_tags=["LIT-601", "AIT-601_CL2"],
        ),
        EquipmentDefinition(
            id="PMP-601", tag="PMP-601", name="Chlorine Dosing Pump 1", category=EquipmentCategory.DOSING_PUMP,
            process_area="disinfection", controllable=True, allowed_states=ROTATING_STATES,
            associated_tags=["FIT-601", "AIT-601_CL2", "LIT-602"], command_tag="PMP-601_CMD",
            mode_tag="PMP-601_MODE", setpoint_tag="PMP-601_SP", feedback_tag="PMP-601_RUN", fault_tag="PMP-601_FLT",
        ),

        # G. Clear Water Storage & Distribution
        EquipmentDefinition(
            id="TNK-701", tag="TNK-701", name="Clear Water Reservoir", category=EquipmentCategory.TANK,
            process_area="clear_water_storage", controllable=False, allowed_states=TANK_STATES,
            associated_tags=["LIT-701", "AIT-701_PH", "AIT-702_COND", "AIT-703_TDS"],
        ),
        EquipmentDefinition(
            id="PMP-701", tag="PMP-701", name="Distribution Pump 1", category=EquipmentCategory.PUMP,
            process_area="clear_water_storage", controllable=True, allowed_states=ROTATING_STATES,
            associated_tags=["FIT-701", "PIT-701", "LIT-701"], command_tag="PMP-701_CMD",
            mode_tag="PMP-701_MODE", feedback_tag="PMP-701_RUN", fault_tag="PMP-701_FLT",
        ),
        EquipmentDefinition(
            id="PMP-702", tag="PMP-702", name="Distribution Pump 2 (Standby)", category=EquipmentCategory.PUMP,
            process_area="clear_water_storage", controllable=True, allowed_states=ROTATING_STATES,
            associated_tags=["FIT-701", "PIT-701", "LIT-701"], command_tag="PMP-702_CMD",
            mode_tag="PMP-702_MODE", feedback_tag="PMP-702_RUN", fault_tag="PMP-702_FLT",
        ),
        EquipmentDefinition(
            id="FCV-701", tag="FCV-701", name="Distribution Outlet Control Valve", category=EquipmentCategory.CONTROL_VALVE,
            process_area="clear_water_storage", controllable=True, allowed_states=ACTUATED_VALVE_STATES,
            associated_tags=["FIT-701", "PIT-701", "FCV-701_POS"], mode_tag="FCV-701_MODE", setpoint_tag="FCV-701_POS",
        ),

        # H. Sludge Handling
        EquipmentDefinition(
            id="TNK-801", tag="TNK-801", name="Sludge Holding Tank", category=EquipmentCategory.TANK,
            process_area="sludge_handling", controllable=False, allowed_states=TANK_STATES,
            associated_tags=["LIT-801"],
        ),
        EquipmentDefinition(
            id="PMP-801", tag="PMP-801", name="Sludge Transfer Pump", category=EquipmentCategory.PUMP,
            process_area="sludge_handling", controllable=True, allowed_states=ROTATING_STATES,
            associated_tags=["FIT-801", "LIT-801"], command_tag="PMP-801_CMD", mode_tag="PMP-801_MODE",
            feedback_tag="PMP-801_RUN", fault_tag="PMP-801_FLT",
        ),
        EquipmentDefinition(
            id="MV-801", tag="MV-801", name="Sludge Drain Manual Valve", category=EquipmentCategory.MANUAL_VALVE,
            process_area="sludge_handling", controllable=False, allowed_states=MANUAL_VALVE_STATES,
            associated_tags=["LIT-801"], feedback_tag="MV-801_STS",
        ),
    ]
