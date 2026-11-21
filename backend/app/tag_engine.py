from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Optional

from .models import AlarmLimits, DataQuality, DataType, ScalingConfig, TagDefinition, TagState


class TagEngine:
    def __init__(self) -> None:
        self._tags: dict[str, TagState] = {}

    def register_tags(self, definitions: list[TagDefinition]) -> None:
        for d in definitions:
            self._tags[d.tag_name] = TagState(**d.model_dump())

    def apply_overrides(self, overrides: dict[str, dict[str, Any]]) -> None:
        """Applies externalized tag/driver/scaling/alarm mappings from tags_config.yaml."""
        for tag_name, cfg in overrides.items():
            tag = self._tags.get(tag_name)
            if not tag:
                continue
            if "driver_id" in cfg:
                tag.driver_id = str(cfg["driver_id"])
            if "source_address" in cfg:
                tag.source_address = str(cfg["source_address"])
            if "namur_ne43_check" in cfg:
                tag.namur_ne43_check = bool(cfg["namur_ne43_check"])
            if "min_setpoint" in cfg:
                tag.min_setpoint = cfg["min_setpoint"]
            if "max_setpoint" in cfg:
                tag.max_setpoint = cfg["max_setpoint"]
            if "scaling" in cfg and isinstance(cfg["scaling"], dict):
                tag.scaling = ScalingConfig(**{**tag.scaling.model_dump(), **cfg["scaling"]})
            if "alarm_limits" in cfg and isinstance(cfg["alarm_limits"], dict):
                tag.alarm_limits = AlarmLimits(**{**tag.alarm_limits.model_dump(), **cfg["alarm_limits"]})

    def sync_alarm_limits(
        self,
        tag_name: str,
        hh: Optional[float] = None,
        h: Optional[float] = None,
        l: Optional[float] = None,
        ll: Optional[float] = None,
    ) -> None:
        tag = self._tags.get(tag_name)
        if not tag:
            return
        if hh is not None:
            tag.alarm_limits.hh = hh
        tag.alarm_limits.h = h
        tag.alarm_limits.l = l
        if ll is not None:
            tag.alarm_limits.ll = ll

    def get_tag(self, tag_name: str) -> Optional[TagState]:
        return self._tags.get(tag_name)

    def all_tags(self, enabled_areas: Optional[set[str]] = None) -> list[TagState]:
        if enabled_areas is None:
            return list(self._tags.values())
        return [t for t in self._tags.values() if t.process_area in enabled_areas]

    def _validate_and_scale(self, tag: TagState, raw_value: Any) -> tuple[Any, DataQuality]:
        if raw_value is None:
            return None, DataQuality.BAD

        try:
            if tag.data_type == DataType.BOOL:
                return bool(raw_value), DataQuality.GOOD
            if tag.data_type == DataType.STRING:
                return str(raw_value), DataQuality.GOOD
            if tag.data_type == DataType.INT:
                val = int(round(float(raw_value)))
            else:
                val = float(raw_value)
                if math.isnan(val) or math.isinf(val):
                    return None, DataQuality.BAD
        except (TypeError, ValueError):
            return None, DataQuality.BAD

        if tag.scaling.enabled and tag.data_type in (DataType.FLOAT, DataType.INT):
            raw_span = tag.scaling.raw_max - tag.scaling.raw_min
            if raw_span == 0:
                return None, DataQuality.UNCERTAIN
            # NAMUR NE43 under-range / over-range transmitter fault check (e.g., <3.6mA or >21mA equivalent)
            if tag.namur_ne43_check:
                lo_raw = min(tag.scaling.raw_min, tag.scaling.raw_max) - abs(raw_span) * 0.05
                hi_raw = max(tag.scaling.raw_min, tag.scaling.raw_max) + abs(raw_span) * 0.05
                if float(val) < lo_raw or float(val) > hi_raw:
                    return None, DataQuality.BAD

            ratio = (float(val) - tag.scaling.raw_min) / raw_span
            scaled = tag.scaling.eng_min + ratio * (tag.scaling.eng_max - tag.scaling.eng_min)
            if tag.scaling.clamp:
                lo = min(tag.scaling.eng_min, tag.scaling.eng_max)
                hi = max(tag.scaling.eng_min, tag.scaling.eng_max)
                scaled = max(lo, min(hi, scaled))
            val = int(round(scaled)) if tag.data_type == DataType.INT else round(scaled, 4)
        elif tag.data_type == DataType.FLOAT:
            val = round(float(val), 3)

        return val, DataQuality.GOOD

    def update_tag(
        self,
        tag_name: str,
        raw_value: Any,
        quality: DataQuality = DataQuality.GOOD,
        timestamp: Optional[datetime] = None,
    ) -> Optional[TagState]:
        tag = self._tags.get(tag_name)
        if not tag:
            return None

        now = timestamp or datetime.now(timezone.utc)
        if quality in (DataQuality.BAD, DataQuality.COMM_FAILURE):
            tag.quality = quality
            tag.timestamp = now
            return tag

        val, calc_quality = self._validate_and_scale(tag, raw_value)
        tag.raw_value = raw_value
        tag.value = val
        tag.timestamp = now
        if calc_quality != DataQuality.GOOD:
            tag.quality = calc_quality
        else:
            tag.quality = quality
            if quality == DataQuality.GOOD:
                tag.last_good_timestamp = now
        return tag

    def mark_driver_failure(self, driver_id: str) -> None:
        now = datetime.now(timezone.utc)
        for tag in self._tags.values():
            if tag.driver_id == driver_id:
                tag.quality = DataQuality.COMM_FAILURE
                tag.timestamp = now

    def evaluate_staleness(self, now: Optional[datetime] = None) -> list[str]:
        now = now or datetime.now(timezone.utc)
        stale_tags: list[str] = []
        for tag in self._tags.values():
            if tag.quality == DataQuality.COMM_FAILURE:
                continue
            if tag.timestamp is None:
                tag.quality = DataQuality.BAD
                continue
            age = (now - tag.timestamp).total_seconds()
            if age > tag.stale_after_sec:
                if tag.quality != DataQuality.STALE:
                    tag.quality = DataQuality.STALE
                stale_tags.append(tag.tag_name)
        return stale_tags
