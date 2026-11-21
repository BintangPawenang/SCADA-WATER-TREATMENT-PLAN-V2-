import { EquipmentState, TagState } from '../../types';

export interface FlowVisualState {
  active: boolean;
  durationSec: number | null;
  intensity: number;
}

export interface FilterVisualMode {
  isFiltering: boolean;
  isAirScour: boolean;
  isBackwashWater: boolean;
  isRinse: boolean;
  isFault: boolean;
  statusLabel: string;
}

export interface RawWaterPalette {
  top: string;
  bottom: string;
  surface: string;
  isHighTurbidity: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function numericTagValue(tag?: TagState): number | null {
  if (!tag || tag.quality !== 'GOOD' || typeof tag.value !== 'number' || !Number.isFinite(tag.value)) {
    return null;
  }
  return tag.value;
}

export function isEquipmentRunning(eq?: EquipmentState): boolean {
  if (!eq) return false;
  return eq.state === 'RUNNING' || eq.state === 'IN_SERVICE';
}

export function getValveOpenPct(eq?: EquipmentState, posTag?: TagState): number {
  const pos = numericTagValue(posTag);
  if (pos !== null) {
    return Math.round(clamp(pos, 0, 100));
  }
  if (!eq) return 0;
  if (eq.state === 'OPEN') return 100;
  if (eq.state === 'OPENING' || eq.state === 'CLOSING' || eq.state === 'THROTTLED') return 50;
  return 0;
}

export function isValveOpen(eq?: EquipmentState, posTag?: TagState): boolean {
  return getValveOpenPct(eq, posTag) > 2;
}

export function computeLevelRatio(tag: TagState | undefined, maxScale: number): number {
  const val = numericTagValue(tag);
  if (val === null || maxScale <= 0) return 0;
  return clamp(val / maxScale, 0.06, 0.96);
}

export function computeFlowVisual(
  flowTag: TagState | undefined,
  maxFlow: number,
  options?: {
    minThreshold?: number;
    gateOpen?: boolean;
    minDurationSec?: number;
    maxDurationSec?: number;
  }
): FlowVisualState {
  const minThreshold = options?.minThreshold ?? 0.5;
  const gateOpen = options?.gateOpen ?? true;
  const minDurationSec = options?.minDurationSec ?? 0.45;
  const maxDurationSec = options?.maxDurationSec ?? 2.8;

  if (!gateOpen || maxFlow <= 0) {
    return { active: false, durationSec: null, intensity: 0 };
  }

  const val = numericTagValue(flowTag);
  if (val === null || val <= minThreshold) {
    return { active: false, durationSec: null, intensity: 0 };
  }

  const intensity = clamp(val / maxFlow, 0.05, 1);
  const durationSec = Number((maxDurationSec - intensity * (maxDurationSec - minDurationSec)).toFixed(2));
  return {
    active: true,
    durationSec: clamp(durationSec, minDurationSec, maxDurationSec),
    intensity,
  };
}

export function computeMixerDurationSec(
  eq: EquipmentState | undefined,
  rpmTag?: TagState,
  defaultRpm = 24
): number | null {
  if (!isEquipmentRunning(eq)) return null;
  const liveRpm = numericTagValue(rpmTag);
  const rpm = liveRpm !== null ? liveRpm : defaultRpm;
  if (rpm <= 0 || !Number.isFinite(rpm)) return null;
  return Number(clamp(50 / rpm, 0.32, 4.5).toFixed(2));
}

export function computeGaugeAngleDeg(tag: TagState | undefined, minVal: number, maxVal: number): number {
  const val = numericTagValue(tag);
  if (val === null || maxVal <= minVal) return -125;
  const ratio = clamp((val - minVal) / (maxVal - minVal), 0, 1);
  return Math.round((-125 + ratio * 250) * 10) / 10;
}

export function computeRawWaterPalette(turbTag?: TagState): RawWaterPalette {
  const turb = numericTagValue(turbTag);
  const isHighTurbidity = turb !== null && turb > 80;
  if (isHighTurbidity) {
    return {
      top: '#7c5832',
      bottom: '#49311a',
      surface: '#9d7447',
      isHighTurbidity: true,
    };
  }
  return {
    top: '#2a6f7d',
    bottom: '#163f4b',
    surface: '#4595a3',
    isHighTurbidity: false,
  };
}

export function computeFilterVisualMode(
  fltEq?: EquipmentState,
  blwEq?: EquipmentState,
  bwPumpEq?: EquipmentState,
  fltFlowTag?: TagState
): FilterVisualMode {
  const st = fltEq?.state ?? 'UNKNOWN';
  const isFault = st === 'FAULT' || st === 'COMM_LOSS' || st === 'OUT_OF_SERVICE' || st === 'MAINTENANCE';
  const isAirScour = st === 'BACKWASH_AIR_SCOUR' || isEquipmentRunning(blwEq);
  const isBackwashWater = st === 'BACKWASH_WATER' || isEquipmentRunning(bwPumpEq);
  const isRinse = st === 'RINSE';

  const flowVal = numericTagValue(fltFlowTag);
  const hasFlow = fltFlowTag === undefined ? true : flowVal !== null && flowVal > 5;
  const isFiltering = !isFault && !isAirScour && !isBackwashWater && !isRinse && st === 'IN_SERVICE' && hasFlow;

  let statusLabel = st.replace(/_/g, ' ');
  if (isAirScour) statusLabel = 'AIR SCOUR';
  else if (isBackwashWater) statusLabel = 'BACKWASH';
  else if (isRinse) statusLabel = 'RINSE';
  else if (st === 'IN_SERVICE') statusLabel = 'IN SERVICE';

  return {
    isFiltering,
    isAirScour,
    isBackwashWater,
    isRinse,
    isFault,
    statusLabel,
  };
}
