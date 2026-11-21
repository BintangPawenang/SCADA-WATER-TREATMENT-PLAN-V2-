from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml

from .models import OperatingMode


class PlantConfigManager:
    def __init__(self, config_path: str | None = None) -> None:
        if config_path is None:
            base = Path(__file__).resolve().parent.parent
            config_path = str(base / "config" / "plant_config.yaml")
        self.config_path = config_path
        self.data: dict[str, Any] = {}
        self.reload()

    def reload(self) -> None:
        if not os.path.exists(self.config_path):
            raise FileNotFoundError(f"Plant config not found: {self.config_path}")
        with open(self.config_path, "r", encoding="utf-8") as f:
            self.data = yaml.safe_load(f) or {}
        tags_cfg_path = Path(self.config_path).parent / "tags_config.yaml"
        if tags_cfg_path.exists():
            with open(tags_cfg_path, "r", encoding="utf-8") as tf:
                tdata = yaml.safe_load(tf) or {}
                self.tag_overrides: dict[str, dict[str, Any]] = tdata.get("production_tag_overrides", {}) or {}
        else:
            self.tag_overrides = {}

    def save(self) -> None:
        with open(self.config_path, "w", encoding="utf-8") as f:
            yaml.safe_dump(self.data, f, sort_keys=False, default_flow_style=False)

    @property
    def plant_name(self) -> str:
        return self.data.get("plant", {}).get("name", "WTP SCADA")

    @property
    def plant_id(self) -> str:
        return self.data.get("plant", {}).get("plant_id", "WTP-01")

    @property
    def operating_mode(self) -> OperatingMode:
        raw = self.data.get("plant", {}).get("operating_mode", "SIMULATION")
        return OperatingMode(raw)

    @property
    def sim_control_enabled(self) -> bool:
        return bool(self.data.get("plant", {}).get("sim_control_enabled", True))

    @property
    def historian_config(self) -> dict[str, Any]:
        return self.data.get("plant", {}).get("historian", {"sampling_interval_sec": 5, "retention_days": 90})

    @property
    def process_areas(self) -> dict[str, dict[str, Any]]:
        return self.data.get("process_areas", {})

    def is_area_enabled(self, area_key: str) -> bool:
        area = self.process_areas.get(area_key)
        if area is None:
            return False
        return bool(area.get("enabled", False))

    def set_area_enabled(self, area_key: str, enabled: bool) -> dict[str, Any]:
        if area_key not in self.process_areas:
            raise KeyError(f"Unknown process area: {area_key}")
        self.data["process_areas"][area_key]["enabled"] = bool(enabled)
        self.save()
        return self.data["process_areas"][area_key]

    @property
    def drivers(self) -> list[dict[str, Any]]:
        return self.data.get("drivers", [])

    @property
    def water_quality_limits(self) -> dict[str, Any]:
        return self.data.get("water_quality_limits", {"specification_source": "Unconfigured", "parameters": {}})

    def update_water_quality_limit(self, tag_name: str, limits: dict[str, Any]) -> dict[str, Any]:
        wq = self.data.setdefault("water_quality_limits", {}).setdefault("parameters", {})
        if tag_name not in wq:
            raise KeyError(f"Unknown water quality parameter: {tag_name}")
        wq[tag_name].update(limits)
        self.save()
        return wq[tag_name]
