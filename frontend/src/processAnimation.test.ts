import { describe, expect, it } from 'vitest';
import {
  computeFilterVisualMode,
  computeFlowVisual,
  computeGaugeAngleDeg,
  computeLevelRatio,
  computeMixerDurationSec,
  computeRawWaterPalette,
  getValveOpenPct,
  isEquipmentRunning,
  isValveOpen,
  numericTagValue,
} from './components/pid/processAnimation';
import { EquipmentState, TagState } from './types';

function makeTag(overrides: Partial<TagState> = {}): TagState {
  return {
    tag_name: 'TEST-101',
    description: 'Test Tag',
    process_area: 'raw_water_intake',
    engineering_unit: 'm3/h',
    data_type: 'FLOAT',
    driver_id: 'sim_wtp',
    source_address: 'SIM://TEST-101',
    permissions: 'READ_ONLY',
    value: 100,
    raw_value: 100,
    quality: 'GOOD',
    timestamp: '2026-11-21T00:00:00Z',
    stale_after_sec: 15,
    simulated: true,
    ...overrides,
  };
}

function makeEq(overrides: Partial<EquipmentState> = {}): EquipmentState {
  return {
    id: 'EQ-101',
    tag: 'EQ-101',
    name: 'Test Equipment',
    category: 'PUMP',
    process_area: 'raw_water_intake',
    controllable: true,
    allowed_states: ['STOPPED', 'RUNNING', 'FAULT'],
    associated_tags: [],
    state: 'RUNNING',
    control_mode: 'REMOTE',
    runtime_hours: 10,
    start_count: 1,
    stop_count: 0,
    active_alarm_count: 0,
    ...overrides,
  };
}

describe('processAnimation telemetry helpers', () => {
  it('numericTagValue validates GOOD quality and finite numeric values', () => {
    expect(numericTagValue(undefined)).toBeNull();
    expect(numericTagValue(makeTag({ value: 42.5, quality: 'GOOD' }))).toBe(42.5);
    expect(numericTagValue(makeTag({ value: 42.5, quality: 'BAD' }))).toBeNull();
    expect(numericTagValue(makeTag({ value: 42.5, quality: 'STALE' }))).toBeNull();
    expect(numericTagValue(makeTag({ value: 42.5, quality: 'COMM_FAILURE' }))).toBeNull();
    expect(numericTagValue(makeTag({ value: 42.5, quality: 'UNCERTAIN' }))).toBeNull();
    expect(numericTagValue(makeTag({ value: 'OPEN', quality: 'GOOD' }))).toBeNull();
    expect(numericTagValue(makeTag({ value: Number.NaN, quality: 'GOOD' }))).toBeNull();
  });

  it('isEquipmentRunning distinguishes RUNNING and IN_SERVICE from stopped/faulted states', () => {
    expect(isEquipmentRunning(undefined)).toBe(false);
    expect(isEquipmentRunning(makeEq({ state: 'RUNNING' }))).toBe(true);
    expect(isEquipmentRunning(makeEq({ state: 'IN_SERVICE' }))).toBe(true);
    expect(isEquipmentRunning(makeEq({ state: 'STOPPED' }))).toBe(false);
    expect(isEquipmentRunning(makeEq({ state: 'FAULT' }))).toBe(false);
    expect(isEquipmentRunning(makeEq({ state: 'MAINTENANCE' }))).toBe(false);
  });

  it('computeLevelRatio returns 0 for missing/non-GOOD and clamps [0.06, 0.96]', () => {
    expect(computeLevelRatio(undefined, 100)).toBe(0);
    expect(computeLevelRatio(makeTag({ value: 50, quality: 'BAD' }), 100)).toBe(0);
    expect(computeLevelRatio(makeTag({ value: 0, quality: 'GOOD' }), 100)).toBe(0.06);
    expect(computeLevelRatio(makeTag({ value: 120, quality: 'GOOD' }), 100)).toBe(0.96);
    expect(computeLevelRatio(makeTag({ value: 3, quality: 'GOOD' }), 6)).toBe(0.5);
  });

  it('computeFlowVisual scales animation speed proportionally and stops when gated/idle/faulted', () => {
    const stoppedGate = computeFlowVisual(makeTag({ value: 500 }), 1400, { gateOpen: false });
    expect(stoppedGate).toEqual({ active: false, durationSec: null, intensity: 0 });

    const commFail = computeFlowVisual(makeTag({ value: 500, quality: 'COMM_FAILURE' }), 1400);
    expect(commFail).toEqual({ active: false, durationSec: null, intensity: 0 });

    const zeroFlow = computeFlowVisual(makeTag({ value: 0 }), 1400);
    expect(zeroFlow).toEqual({ active: false, durationSec: null, intensity: 0 });

    const singlePump = computeFlowVisual(makeTag({ value: 460 }), 1400, {
      minDurationSec: 0.45,
      maxDurationSec: 2.8,
    });
    const dualPump = computeFlowVisual(makeTag({ value: 920 }), 1400, {
      minDurationSec: 0.45,
      maxDurationSec: 2.8,
    });
    const extremeFlow = computeFlowVisual(makeTag({ value: 2500 }), 1400, {
      minDurationSec: 0.45,
      maxDurationSec: 2.8,
    });

    expect(singlePump.active).toBe(true);
    expect(dualPump.active).toBe(true);
    expect(dualPump.durationSec!).toBeLessThan(singlePump.durationSec!);
    expect(extremeFlow.durationSec).toBe(0.45);
    expect(extremeFlow.intensity).toBe(1);
  });

  it('computeMixerDurationSec stops when STOPPED/FAULT/0 RPM and speeds up with higher RPM', () => {
    expect(computeMixerDurationSec(undefined)).toBeNull();
    expect(computeMixerDurationSec(makeEq({ state: 'STOPPED' }), makeTag({ value: 28 }))).toBeNull();
    expect(computeMixerDurationSec(makeEq({ state: 'FAULT' }), makeTag({ value: 28 }))).toBeNull();
    expect(computeMixerDurationSec(makeEq({ state: 'RUNNING' }), makeTag({ value: 0 }))).toBeNull();

    const slowDur = computeMixerDurationSec(makeEq({ state: 'RUNNING' }), makeTag({ value: 18 }));
    const fastDur = computeMixerDurationSec(makeEq({ state: 'RUNNING' }), makeTag({ value: 28 }));
    const extremeDur = computeMixerDurationSec(makeEq({ state: 'RUNNING' }), makeTag({ value: 500 }));
    const rapidMixDur = computeMixerDurationSec(makeEq({ state: 'RUNNING' }), undefined, 140);

    expect(slowDur).not.toBeNull();
    expect(fastDur).not.toBeNull();
    expect(fastDur!).toBeLessThan(slowDur!);
    expect(extremeDur).toBeGreaterThanOrEqual(0.32);
    expect(rapidMixDur).toBeGreaterThanOrEqual(0.32);
    expect(rapidMixDur!).toBeLessThan(fastDur!);
  });

  it('computeGaugeAngleDeg maps range to [-125, 125] and parks at -125 on bad quality', () => {
    expect(computeGaugeAngleDeg(undefined, 0, 6)).toBe(-125);
    expect(computeGaugeAngleDeg(makeTag({ value: 3, quality: 'BAD' }), 0, 6)).toBe(-125);
    expect(computeGaugeAngleDeg(makeTag({ value: 0 }), 0, 6)).toBe(-125);
    expect(computeGaugeAngleDeg(makeTag({ value: 3 }), 0, 6)).toBe(0);
    expect(computeGaugeAngleDeg(makeTag({ value: 6 }), 0, 6)).toBe(125);
    expect(computeGaugeAngleDeg(makeTag({ value: 10 }), 0, 6)).toBe(125);
  });

  it('computeRawWaterPalette darkens to muddy brown during turbidity spikes and handles bad data', () => {
    const normal = computeRawWaterPalette(makeTag({ value: 25 }));
    const spike = computeRawWaterPalette(makeTag({ value: 185 }));
    const bad = computeRawWaterPalette(makeTag({ value: 185, quality: 'BAD' }));

    expect(normal.isHighTurbidity).toBe(false);
    expect(spike.isHighTurbidity).toBe(true);
    expect(spike.top).not.toBe(normal.top);
    expect(bad.isHighTurbidity).toBe(false);
  });

  it('computeFilterVisualMode accurately tracks IN_SERVICE, backwash phases, rinse, and fault', () => {
    const inSvc = computeFilterVisualMode(
      makeEq({ state: 'IN_SERVICE' }),
      makeEq({ state: 'STOPPED' }),
      makeEq({ state: 'STOPPED' }),
      makeTag({ value: 450 })
    );
    expect(inSvc.isFiltering).toBe(true);
    expect(inSvc.isAirScour).toBe(false);
    expect(inSvc.isBackwashWater).toBe(false);

    const noFlow = computeFilterVisualMode(
      makeEq({ state: 'IN_SERVICE' }),
      makeEq({ state: 'STOPPED' }),
      makeEq({ state: 'STOPPED' }),
      makeTag({ value: 0 })
    );
    expect(noFlow.isFiltering).toBe(false);

    const airScour = computeFilterVisualMode(
      makeEq({ state: 'BACKWASH_AIR_SCOUR' }),
      makeEq({ state: 'RUNNING' }),
      makeEq({ state: 'STOPPED' }),
      makeTag({ value: 0 })
    );
    expect(airScour.isAirScour).toBe(true);
    expect(airScour.isFiltering).toBe(false);

    const bwWater = computeFilterVisualMode(
      makeEq({ state: 'BACKWASH_WATER' }),
      makeEq({ state: 'STOPPED' }),
      makeEq({ state: 'RUNNING' }),
      makeTag({ value: 0 })
    );
    expect(bwWater.isBackwashWater).toBe(true);
    expect(bwWater.isAirScour).toBe(false);
    expect(bwWater.isFiltering).toBe(false);

    const rinse = computeFilterVisualMode(makeEq({ state: 'RINSE' }));
    expect(rinse.isRinse).toBe(true);
    expect(rinse.isFiltering).toBe(false);

    const fault = computeFilterVisualMode(makeEq({ state: 'FAULT' }));
    expect(fault.isFault).toBe(true);
    expect(fault.isFiltering).toBe(false);
  });

  it('getValveOpenPct and isValveOpen handle discrete and modulating valves', () => {
    expect(getValveOpenPct(makeEq({ state: 'OPEN' }))).toBe(100);
    expect(getValveOpenPct(makeEq({ state: 'CLOSED' }))).toBe(0);
    expect(getValveOpenPct(makeEq({ state: 'OPENING' }))).toBe(50);
    expect(getValveOpenPct(makeEq({ state: 'THROTTLED' }))).toBe(50);
    expect(getValveOpenPct(makeEq({ state: 'OPEN' }), makeTag({ value: 72 }))).toBe(72);

    expect(isValveOpen(makeEq({ state: 'OPEN' }))).toBe(true);
    expect(isValveOpen(makeEq({ state: 'CLOSED' }))).toBe(false);
    expect(isValveOpen(makeEq({ state: 'OPEN' }), makeTag({ value: 0 }))).toBe(false);
    expect(isValveOpen(makeEq({ state: 'OPEN' }), makeTag({ value: 72 }))).toBe(true);
  });
});
