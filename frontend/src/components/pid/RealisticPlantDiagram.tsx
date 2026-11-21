import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { AlarmRecord, EquipmentState, ProcessAreaConfig, TagState } from '../../types';
import {
  ActuatedValve25D,
  AirBlower25D,
  CentrifugalPump25D,
  DosingPump25D,
  FlocAgitator25D,
  HoverPayload,
  ManualValve25D,
  RapidMixer25D,
} from './RealisticEquipment';
import { RealisticPipe } from './RealisticPipes';
import {
  DiffPressureTransmitter,
  ImmersedAnalyzerProbe,
  InlineFlowmeter,
  PressureGauge,
  UltrasonicLevelSensor,
} from './RealisticSensors';
import {
  ChemicalTankVessel,
  ClarifierVessel,
  ClearWaterTankVessel,
  ContactBasinVessel,
  DualMediaFilterVessel,
  FlocBasinVessel,
  IntakeSumpVessel,
  RapidMixVessel,
  SludgeTankVessel,
} from './RealisticVessels';
import {
  FlowVisualState,
  computeFilterVisualMode,
  computeFlowVisual,
  computeLevelRatio,
  computeMixerDurationSec,
  computeRawWaterPalette,
  getValveOpenPct,
  isEquipmentRunning,
  isValveOpen,
  numericTagValue,
} from './processAnimation';

export interface RealisticPlantDiagramProps {
  tags: TagState[];
  equipment: EquipmentState[];
  alarms: AlarmRecord[];
  processAreas: Record<string, ProcessAreaConfig>;
  animationsEnabled: boolean;
  zoom: number;
  pan: { x: number; y: number };
  onSelectEquipment: (eq: EquipmentState) => void;
}

const STOPPED_FLOW: FlowVisualState = { active: false, durationSec: null, intensity: 0 };

interface ZoneCardDef {
  key: string;
  step: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const ZONE_CARDS: ZoneCardDef[] = [
  { key: 'raw_water_intake', step: '1', title: 'RAW WATER INTAKE', x: 14, y: 14, w: 290, h: 472 },
  { key: 'coagulation', step: '2', title: 'COAGULATION', x: 312, y: 14, w: 190, h: 472 },
  { key: 'flocculation', step: '3', title: 'FLOCCULATION', x: 510, y: 14, w: 214, h: 472 },
  { key: 'sedimentation', step: '4', title: 'SEDIMENTATION', x: 732, y: 14, w: 220, h: 472 },
  { key: 'filtration', step: '5', title: 'FILTRATION', x: 960, y: 14, w: 258, h: 472 },
  { key: 'disinfection', step: '6', title: 'DISINFECTION', x: 1226, y: 14, w: 208, h: 472 },
  { key: 'clear_water_storage', step: '7', title: 'CLEAR WATER & DIST.', x: 1442, y: 14, w: 224, h: 472 },
  { key: 'sludge_handling', step: '8', title: 'SLUDGE HANDLING', x: 732, y: 498, w: 702, h: 248 },
];

export const RealisticPlantDiagram: React.FC<RealisticPlantDiagramProps> = memo(
  ({ tags, equipment, alarms, processAreas, animationsEnabled, zoom, pan, onSelectEquipment }) => {
    const [hoverInfo, setHoverInfo] = useState<HoverPayload | null>(null);

    const tagMap = useMemo(() => new Map(tags.map((t) => [t.tag_name, t])), [tags]);
    const eqMap = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);
    const alarmedSources = useMemo(
      () => new Set(alarms.filter((a) => a.active).map((a) => a.source)),
      [alarms]
    );

    const eqMapRef = useRef(eqMap);
    eqMapRef.current = eqMap;

    const clickEq = useCallback(
      (id: string) => {
        const eq = eqMapRef.current.get(id);
        if (eq) onSelectEquipment(eq);
      },
      [onSelectEquipment]
    );

    const isAreaOn = (key: string) => processAreas[key]?.enabled ?? false;
    const areaAnim = (key: string) => animationsEnabled && isAreaOn(key);

    const fmtTag = (name: string, decimals = 2) => {
      const t = tagMap.get(name);
      if (!t) return '--';
      if (t.quality !== 'GOOD') return t.quality;
      if (typeof t.value === 'number') {
        const num = decimals === 0 ? Math.round(t.value).toString() : t.value.toFixed(decimals);
        return t.engineering_unit ? `${num} ${t.engineering_unit}` : num;
      }
      return `${String(t.value)} ${t.engineering_unit}`.trim();
    };

    const tagColor = (name: string) => {
      const t = tagMap.get(name);
      if (!t || t.quality === 'BAD' || t.quality === 'COMM_FAILURE') return 'var(--badge-crit-fg)';
      if (t.quality === 'STALE') return 'var(--badge-stale-fg)';
      if (t.quality === 'UNCERTAIN') return 'var(--badge-warn-fg)';
      if (alarmedSources.has(name)) return 'var(--badge-crit-fg)';
      return 'var(--pid-value-fg)';
    };

    const eqColor = (id: string) => {
      const eq = eqMap.get(id);
      if (!eq) return 'var(--pid-stopped)';
      if (
        alarmedSources.has(id) ||
        eq.state === 'FAULT' ||
        eq.state === 'TRAVEL_FAULT' ||
        eq.state === 'COMM_LOSS'
      ) {
        return 'var(--badge-crit-fg)';
      }
      if (
        eq.state === 'MAINTENANCE' ||
        eq.state === 'STARTING' ||
        eq.state === 'STOPPING' ||
        eq.state === 'OPENING' ||
        eq.state === 'CLOSING' ||
        eq.state.startsWith('BACKWASH') ||
        eq.state === 'RINSE'
      ) {
        return 'var(--badge-warn-fg)';
      }
      if (eq.state === 'RUNNING' || eq.state === 'OPEN' || eq.state === 'IN_SERVICE') {
        return '#22c55e';
      }
      return 'var(--pid-stopped)';
    };

    const commonEqProps = (x: number, y: number, id: string, areaKey: string) => ({
      x,
      y,
      id,
      eq: eqMap.get(id),
      statusColor: eqColor(id),
      isAlarmed: alarmedSources.has(id),
      animationsEnabled: areaAnim(areaKey),
      onSelect: clickEq,
      onHover: setHoverInfo,
    });

    const sensorProps = (x: number, y: number, tag: string, label: string, decimals = 2) => ({
      x,
      y,
      tag,
      label,
      tagState: tagMap.get(tag),
      color: tagColor(tag),
      formattedValue: fmtTag(tag, decimals),
      onHover: setHoverInfo,
    });

    // Live process computations
    const rawPalette = computeRawWaterPalette(tagMap.get('AIT-102_TURB'));
    const xv101Open = isValveOpen(eqMap.get('XV-101'));
    const pmp101Run = isEquipmentRunning(eqMap.get('PMP-101'));
    const pmp102Run = isEquipmentRunning(eqMap.get('PMP-102'));
    const intakeFlow = computeFlowVisual(tagMap.get('FIT-101'), 1400, { gateOpen: xv101Open && isAreaOn('raw_water_intake') });
    const intakeSuctionFlow = computeFlowVisual(tagMap.get('FIT-101'), 1400, {
      gateOpen: (pmp101Run || pmp102Run) && isAreaOn('raw_water_intake'),
    });
    const pmp101Flow = computeFlowVisual(tagMap.get('FIT-101'), 920, {
      gateOpen: pmp101Run && xv101Open && isAreaOn('raw_water_intake'),
    });
    const pmp102Flow = computeFlowVisual(tagMap.get('FIT-101'), 920, {
      gateOpen: pmp102Run && xv101Open && isAreaOn('raw_water_intake'),
    });

    const coagFlow = computeFlowVisual(tagMap.get('FIT-201'), 120, {
      minThreshold: 0.2,
      gateOpen: isEquipmentRunning(eqMap.get('PMP-201')) && isAreaOn('coagulation'),
      minDurationSec: 0.55,
      maxDurationSec: 2.4,
    });

    const mxr201Dur = areaAnim('coagulation')
      ? computeMixerDurationSec(eqMap.get('MXR-201'), undefined, 140)
      : null;
    const mxr301Dur = areaAnim('flocculation')
      ? computeMixerDurationSec(eqMap.get('MXR-301'), tagMap.get('MXR-301_SPD'), 28)
      : null;
    const mxr302Dur = areaAnim('flocculation')
      ? computeMixerDurationSec(eqMap.get('MXR-302'), tagMap.get('MXR-302_SPD'), 18)
      : null;

    const filterMode = computeFilterVisualMode(
      eqMap.get('FLT-501'),
      eqMap.get('BLW-501'),
      eqMap.get('PMP-501'),
      tagMap.get('FIT-501')
    );

    const fltInletFlow: FlowVisualState =
      intakeFlow.active && !filterMode.isBackwashWater && !filterMode.isAirScour && isAreaOn('filtration')
        ? intakeFlow
        : STOPPED_FLOW;

    const fltOutFlow = computeFlowVisual(tagMap.get('FIT-501'), 1400, {
      gateOpen: filterMode.isFiltering && isAreaOn('filtration'),
    });

    const bwWaterFlow: FlowVisualState =
      filterMode.isBackwashWater && isAreaOn('filtration')
        ? { active: true, durationSec: 0.9, intensity: 0.85 }
        : STOPPED_FLOW;

    const airScourFlow: FlowVisualState =
      filterMode.isAirScour && isAreaOn('filtration')
        ? { active: true, durationSec: 0.85, intensity: 0.9 }
        : STOPPED_FLOW;

    const cl2Flow = computeFlowVisual(tagMap.get('FIT-601'), 60, {
      minThreshold: 0.2,
      gateOpen: isEquipmentRunning(eqMap.get('PMP-601')) && isAreaOn('disinfection'),
      minDurationSec: 0.55,
      maxDurationSec: 2.4,
    });

    const fcv701Pos = getValveOpenPct(eqMap.get('FCV-701'), tagMap.get('FCV-701_POS'));
    const fcv701Open = isValveOpen(eqMap.get('FCV-701'), tagMap.get('FCV-701_POS'));
    const distFlow = computeFlowVisual(tagMap.get('FIT-701'), 1300, {
      gateOpen: fcv701Open && isAreaOn('clear_water_storage'),
    });
    const pmp701Flow = computeFlowVisual(tagMap.get('FIT-701'), 900, {
      gateOpen: isEquipmentRunning(eqMap.get('PMP-701')) && fcv701Open && isAreaOn('clear_water_storage'),
    });
    const pmp702Flow = computeFlowVisual(tagMap.get('FIT-701'), 900, {
      gateOpen: isEquipmentRunning(eqMap.get('PMP-702')) && fcv701Open && isAreaOn('clear_water_storage'),
    });

    const desludgeRun = isEquipmentRunning(eqMap.get('PMP-401')) && isAreaOn('sedimentation');
    const desludgeFlow: FlowVisualState = desludgeRun
      ? { active: true, durationSec: 1.5, intensity: 0.7 }
      : STOPPED_FLOW;

    const sludgeXferFlow = computeFlowVisual(tagMap.get('FIT-801'), 60, {
      minThreshold: 0.2,
      gateOpen: isEquipmentRunning(eqMap.get('PMP-801')) && isAreaOn('sludge_handling'),
      minDurationSec: 0.75,
      maxDurationSec: 2.4,
    });

    const lvl101 = computeLevelRatio(tagMap.get('LIT-101'), 5);
    const lvl201 = computeLevelRatio(tagMap.get('LIT-201'), 100);
    const lvl401 = computeLevelRatio(tagMap.get('LIT-401'), 5);
    const lvl601 = computeLevelRatio(tagMap.get('LIT-601'), 5);
    const lvl602 = computeLevelRatio(tagMap.get('LIT-602'), 100);
    const lvl701 = computeLevelRatio(tagMap.get('LIT-701'), 6);
    const lvl801 = computeLevelRatio(tagMap.get('LIT-801'), 100);

    const mxr301Rpm = numericTagValue(tagMap.get('MXR-301_SPD'));
    const mxr302Rpm = numericTagValue(tagMap.get('MXR-302_SPD'));

    return (
      <svg
        viewBox="0 0 1680 760"
        width="100%"
        height="100%"
        className={animationsEnabled ? undefined : 'hmi-paused'}
        style={{ background: 'var(--hmi-canvas-bg)' }}
      >
        <defs>
          {/* Subtle engineering dot-grid pattern */}
          <pattern id="hmi-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="0.9" fill="var(--hmi-grid-dot)" opacity="0.65" />
          </pattern>

          {/* Metallic 3D shading gradients */}
          <linearGradient id="hmi-metal-v" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--hmi-metal-light)" />
            <stop offset="50%" stopColor="var(--hmi-metal-mid)" />
            <stop offset="100%" stopColor="var(--hmi-metal-dark)" />
          </linearGradient>
          <linearGradient id="hmi-metal-h" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--hmi-metal-dark)" />
            <stop offset="35%" stopColor="var(--hmi-metal-light)" />
            <stop offset="100%" stopColor="var(--hmi-metal-dark)" />
          </linearGradient>

          {/* Progressive water clarity gradients (Coag -> Floc -> Clarifier -> Clean -> Clear) */}
          <linearGradient id="hmi-water-coag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#26778a" />
            <stop offset="100%" stopColor="#164e5c" />
          </linearGradient>
          <linearGradient id="hmi-water-floc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2082a6" />
            <stop offset="100%" stopColor="#145670" />
          </linearGradient>
          <linearGradient id="hmi-water-clarifier" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#27a8de" />
            <stop offset="65%" stopColor="#157099" />
            <stop offset="100%" stopColor="#294c5b" />
          </linearGradient>
          <linearGradient id="hmi-water-clean" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
          <linearGradient id="hmi-water-clear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>

          {/* Chemical & Sludge liquid fills */}
          <linearGradient id="hmi-chem-coag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#92400e" />
          </linearGradient>
          <linearGradient id="hmi-chem-cl2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a3e635" />
            <stop offset="100%" stopColor="#4d7c0f" />
          </linearGradient>
          <linearGradient id="hmi-sludge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#785e4d" />
            <stop offset="100%" stopColor="#3f2e24" />
          </linearGradient>

          {/* Dual-Media Filter granular textures */}
          <pattern id="hmi-pat-anthracite" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="#27313d" />
            <circle cx="3" cy="3" r="1.6" fill="#475569" />
            <circle cx="9" cy="5" r="1.4" fill="#1e293b" />
            <circle cx="5" cy="9" r="1.5" fill="#334155" />
            <circle cx="10" cy="10" r="1.2" fill="#475569" />
          </pattern>
          <pattern id="hmi-pat-sand" width="10" height="10" patternUnits="userSpaceOnUse">
            <rect width="10" height="10" fill="#c9a978" />
            <circle cx="2" cy="2" r="0.9" fill="#9a7b4f" />
            <circle cx="7" cy="4" r="1.0" fill="#e2c799" />
            <circle cx="4" cy="8" r="0.9" fill="#a68657" />
            <circle cx="8" cy="8" r="0.8" fill="#8b6d43" />
          </pattern>
          <pattern id="hmi-pat-gravel" width="16" height="12" patternUnits="userSpaceOnUse">
            <rect width="16" height="12" fill="#52525b" />
            <ellipse cx="4" cy="4" rx="2.8" ry="2.0" fill="#71717a" />
            <ellipse cx="11" cy="3" rx="3.0" ry="1.8" fill="#3f3f46" />
            <ellipse cx="7" cy="9" rx="3.2" ry="2.1" fill="#a1a1aa" opacity="0.6" />
            <ellipse cx="14" cy="9" rx="2.4" ry="1.8" fill="#27272a" />
          </pattern>
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Background grid */}
          <rect x={0} y={0} width={1680} height={760} fill="url(#hmi-grid)" />

          {/* LAYER 1: PROCESS AREA CARDS */}
          {ZONE_CARDS.map((z) => {
            const enabled = isAreaOn(z.key);
            return (
              <g key={z.key} opacity={enabled ? 1 : 0.3}>
                <rect
                  x={z.x}
                  y={z.y}
                  width={z.w}
                  height={z.h}
                  rx={5}
                  fill="var(--hmi-zone-bg)"
                  stroke="var(--hmi-zone-border)"
                  strokeWidth={1.2}
                />
                <path
                  d={`M ${z.x},${z.y + 5} Q ${z.x},${z.y} ${z.x + 5},${z.y} L ${z.x + z.w - 5},${z.y} Q ${z.x + z.w},${z.y} ${z.x + z.w},${z.y + 5} L ${z.x + z.w},${z.y + 26} L ${z.x},${z.y + 26} Z`}
                  fill="var(--hmi-zone-header-bg)"
                />
                <line x1={z.x} y1={z.y + 26} x2={z.x + z.w} y2={z.y + 26} stroke="var(--hmi-zone-border)" strokeWidth={1} />
                <circle cx={z.x + 15} cy={z.y + 13} r={7.5} fill="var(--hmi-step-pill-bg)" />
                <text x={z.x + 15} y={z.y + 16.5} textAnchor="middle" fill="var(--hmi-step-pill-fg)" fontSize={8.5} fontFamily="var(--mono)" fontWeight="bold">
                  {z.step}
                </text>
                <text x={z.x + 28} y={z.y + 16.5} fill="var(--hmi-zone-title)" fontSize={9.5} fontFamily="var(--sans)" fontWeight="700" letterSpacing="0.4">
                  {z.title} {!enabled ? '(DISABLED)' : ''}
                </text>
              </g>
            );
          })}

          {/* LAYER 2: REALISTIC 3D SHADED PROCESS PIPING */}
          <g id="hmi-pipes-layer">
            {/* A: River Intake -> Sump -> Pump Suction & Discharge -> Rapid Mix */}
            <RealisticPipe
              d="M 14,205 L 34,205"
              fluid="raw-water"
              flow={intakeSuctionFlow}
              diameter={10}
              rawTurbid={rawPalette.isHighTurbidity}
              animationsEnabled={areaAnim('raw_water_intake')}
              arrowAt={{ x: 22, y: 205, angleDeg: 0 }}
            />
            <RealisticPipe
              d="M 98,245 L 116,245"
              fluid="raw-water"
              flow={intakeSuctionFlow}
              diameter={10}
              rawTurbid={rawPalette.isHighTurbidity}
              animationsEnabled={areaAnim('raw_water_intake')}
            />
            <RealisticPipe
              d="M 116,245 L 116,198 L 196,198 L 196,245"
              fluid="raw-water"
              flow={pmp101Flow}
              diameter={8}
              rawTurbid={rawPalette.isHighTurbidity}
              animationsEnabled={areaAnim('raw_water_intake')}
            />
            <RealisticPipe
              d="M 116,245 L 116,292 L 196,292 L 196,245"
              fluid="raw-water"
              flow={pmp102Flow}
              diameter={8}
              rawTurbid={rawPalette.isHighTurbidity}
              animationsEnabled={areaAnim('raw_water_intake')}
            />
            <RealisticPipe
              d="M 196,245 L 326,245"
              fluid="raw-water"
              flow={intakeFlow}
              diameter={10}
              rawTurbid={rawPalette.isHighTurbidity}
              animationsEnabled={areaAnim('raw_water_intake')}
              showFlangesAt={[{ x: 304, y: 245 }]}
              arrowAt={{ x: 304, y: 245, angleDeg: 0 }}
            />

            {/* B: Coagulant chemical dosing pipe (behind main header into Rapid Mix top) */}
            <RealisticPipe
              d="M 390,418 L 428,418 L 428,176 L 404,176 L 404,202"
              fluid="coagulant"
              flow={coagFlow}
              diameter={5}
              animationsEnabled={areaAnim('coagulation')}
              arrowAt={{ x: 428, y: 274, angleDeg: -90 }}
            />

            {/* B -> C: Rapid Mix to Flocculation Basin */}
            <RealisticPipe
              d="M 420,245 L 526,245"
              fluid="coag-water"
              flow={intakeFlow}
              diameter={10}
              animationsEnabled={areaAnim('coagulation') && areaAnim('flocculation')}
              showFlangesAt={[{ x: 506, y: 245 }]}
              arrowAt={{ x: 506, y: 245, angleDeg: 0 }}
            />

            {/* C -> D: Flocculation Basin to Gravity Clarifier */}
            <RealisticPipe
              d="M 708,245 L 748,245"
              fluid="floc-water"
              flow={intakeFlow}
              diameter={10}
              animationsEnabled={areaAnim('flocculation') && areaAnim('sedimentation')}
              showFlangesAt={[{ x: 728, y: 245 }]}
              arrowAt={{ x: 728, y: 245, angleDeg: 0 }}
            />

            {/* D -> E: Clarifier Overflow Launder to Filter Top */}
            <RealisticPipe
              d="M 944,206 L 986,206"
              fluid="settled-water"
              flow={fltInletFlow}
              diameter={10}
              animationsEnabled={areaAnim('sedimentation') && areaAnim('filtration')}
              showFlangesAt={[{ x: 964, y: 206 }]}
              arrowAt={{ x: 964, y: 206, angleDeg: 0 }}
            />

            {/* E: Filter Backwash Water & Air Scour Lines */}
            <RealisticPipe
              d="M 1110,422 L 1024,422 L 1024,312"
              fluid="backwash"
              flow={bwWaterFlow}
              diameter={7}
              animationsEnabled={areaAnim('filtration')}
              arrowAt={{ x: 1024, y: 392, angleDeg: -90 }}
            />
            <RealisticPipe
              d="M 1168,402 L 1168,312"
              fluid="air"
              flow={airScourFlow}
              diameter={6}
              animationsEnabled={areaAnim('filtration')}
              arrowAt={{ x: 1168, y: 342, angleDeg: -90 }}
            />

            {/* E -> F: Filtered Underdrain Effluent to Contact Basin */}
            <RealisticPipe
              d="M 1180,304 L 1202,304 L 1202,245 L 1242,245"
              fluid="clean-water"
              flow={fltOutFlow}
              diameter={10}
              animationsEnabled={areaAnim('filtration') && areaAnim('disinfection')}
              showFlangesAt={[{ x: 1222, y: 245 }]}
              arrowAt={{ x: 1222, y: 245, angleDeg: 0 }}
            />

            {/* F: Chlorine chemical dosing pipe */}
            <RealisticPipe
              d="M 1300,414 L 1330,414 L 1330,174 L 1264,174 L 1264,200"
              fluid="chlorine"
              flow={cl2Flow}
              diameter={5}
              animationsEnabled={areaAnim('disinfection')}
              arrowAt={{ x: 1330, y: 280, angleDeg: -90 }}
            />

            {/* F -> G: Contact Basin to Clear Water Reservoir */}
            <RealisticPipe
              d="M 1418,245 L 1456,245"
              fluid="clean-water"
              flow={fltOutFlow}
              diameter={10}
              animationsEnabled={areaAnim('disinfection') && areaAnim('clear_water_storage')}
              showFlangesAt={[{ x: 1438, y: 245 }]}
              arrowAt={{ x: 1438, y: 245, angleDeg: 0 }}
            />

            {/* G: Clear Water Reservoir -> High-Lift Distribution Pumps -> FCV-701 -> City */}
            <RealisticPipe
              d="M 1513,302 L 1513,332 L 1474,332 L 1474,356 L 1486,356"
              fluid="clean-water"
              flow={pmp701Flow}
              diameter={8}
              animationsEnabled={areaAnim('clear_water_storage')}
            />
            <RealisticPipe
              d="M 1513,332 L 1474,332 L 1474,424 L 1486,424"
              fluid="clean-water"
              flow={pmp702Flow}
              diameter={8}
              animationsEnabled={areaAnim('clear_water_storage')}
            />
            <RealisticPipe
              d="M 1538,356 L 1596,356 L 1596,245"
              fluid="clean-water"
              flow={pmp701Flow}
              diameter={8}
              animationsEnabled={areaAnim('clear_water_storage')}
            />
            <RealisticPipe
              d="M 1538,424 L 1596,424 L 1596,245"
              fluid="clean-water"
              flow={pmp702Flow}
              diameter={8}
              animationsEnabled={areaAnim('clear_water_storage')}
            />
            <RealisticPipe
              d="M 1596,245 L 1662,245"
              fluid="clean-water"
              flow={distFlow}
              diameter={10}
              animationsEnabled={areaAnim('clear_water_storage')}
              arrowAt={{ x: 1654, y: 245, angleDeg: 0 }}
            />

            {/* D -> H: Clarifier Sludge Cone -> PMP-401 -> Sludge Holding Tank TNK-801 */}
            <RealisticPipe
              d="M 846,328 L 846,362 L 802,362 L 802,404 L 896,404 L 896,540"
              fluid="sludge"
              flow={desludgeFlow}
              diameter={8}
              animationsEnabled={areaAnim('sedimentation') && areaAnim('sludge_handling')}
              arrowAt={{ x: 896, y: 492, angleDeg: 90 }}
            />

            {/* H: Sludge Holding Tank -> PMP-801 -> MV-801 -> Dewatering */}
            <RealisticPipe
              d="M 926,658 L 926,692 L 1034,692 L 1034,612 L 1344,612"
              fluid="sludge"
              flow={sludgeXferFlow}
              diameter={8}
              animationsEnabled={areaAnim('sludge_handling')}
              arrowAt={{ x: 1334, y: 612, angleDeg: 0 }}
            />
          </g>

          {/* LAYER 3: CUTAWAY VESSELS & PROCESS BASINS */}
          <g id="hmi-vessels-layer">
            <g opacity={isAreaOn('raw_water_intake') ? 1 : 0.3}>
              <IntakeSumpVessel
                x={26}
                y={165}
                width={74}
                height={155}
                levelRatio={lvl101}
                palette={rawPalette}
                isFlowing={intakeSuctionFlow.active}
                animationsEnabled={areaAnim('raw_water_intake')}
              />
            </g>

            <g opacity={isAreaOn('coagulation') ? 1 : 0.3}>
              <RapidMixVessel
                x={326}
                y={186}
                width={94}
                height={108}
                coagDosingActive={coagFlow.active}
                mixerRunning={isEquipmentRunning(eqMap.get('MXR-201'))}
                animationsEnabled={areaAnim('coagulation')}
              />
              <ChemicalTankVessel
                x={326}
                y={344}
                width={64}
                height={104}
                id="TNK-201"
                label="COAG TANK"
                levelRatio={lvl201}
                levelPctText={fmtTag('LIT-201', 0)}
                fillGradientId="hmi-chem-coag"
                fluidAccent="#fbbf24"
                eq={eqMap.get('TNK-201')}
                statusColor={eqColor('TNK-201')}
                onSelect={clickEq}
                onHover={setHoverInfo}
              />
            </g>

            <g opacity={isAreaOn('flocculation') ? 1 : 0.3}>
              <FlocBasinVessel
                x={526}
                y={180}
                width={182}
                height={134}
                stage1Running={isEquipmentRunning(eqMap.get('MXR-301'))}
                stage2Running={isEquipmentRunning(eqMap.get('MXR-302'))}
                isFlowing={intakeFlow.active}
                animationsEnabled={areaAnim('flocculation')}
              />
            </g>

            <g opacity={isAreaOn('sedimentation') ? 1 : 0.3}>
              <ClarifierVessel
                x={748}
                y={176}
                width={196}
                height={152}
                eq={eqMap.get('CLR-401')}
                statusColor={eqColor('CLR-401')}
                isAlarmed={alarmedSources.has('CLR-401')}
                levelRatio={lvl401}
                isFlowing={intakeFlow.active}
                animationsEnabled={areaAnim('sedimentation')}
                onSelect={clickEq}
                onHover={setHoverInfo}
              />
            </g>

            <g opacity={isAreaOn('filtration') ? 1 : 0.3}>
              <DualMediaFilterVessel
                x={974}
                y={172}
                width={206}
                height={140}
                eq={eqMap.get('FLT-501')}
                statusColor={eqColor('FLT-501')}
                isAlarmed={alarmedSources.has('FLT-501')}
                mode={filterMode}
                animationsEnabled={areaAnim('filtration')}
                onSelect={clickEq}
                onHover={setHoverInfo}
              />
            </g>

            <g opacity={isAreaOn('disinfection') ? 1 : 0.3}>
              <ContactBasinVessel
                x={1242}
                y={178}
                width={176}
                height={132}
                eq={eqMap.get('TNK-601')}
                statusColor={eqColor('TNK-601')}
                levelRatio={lvl601}
                isFlowing={fltOutFlow.active}
                cl2DosingActive={cl2Flow.active}
                animationsEnabled={areaAnim('disinfection')}
                onSelect={clickEq}
                onHover={setHoverInfo}
              />
              <ChemicalTankVessel
                x={1242}
                y={344}
                width={58}
                height={102}
                id="LIT-602"
                label="CL2 TANK"
                levelRatio={lvl602}
                levelPctText={fmtTag('LIT-602', 0)}
                fillGradientId="hmi-chem-cl2"
                fluidAccent="#bef264"
                statusColor="var(--hmi-metal-stroke)"
                onHover={setHoverInfo}
              />
            </g>

            <g opacity={isAreaOn('clear_water_storage') ? 1 : 0.3}>
              <ClearWaterTankVessel
                x={1456}
                y={166}
                width={114}
                height={136}
                eq={eqMap.get('TNK-701')}
                statusColor={eqColor('TNK-701')}
                levelRatio={lvl701}
                isFlowing={fltOutFlow.active || distFlow.active}
                animationsEnabled={areaAnim('clear_water_storage')}
                onSelect={clickEq}
                onHover={setHoverInfo}
              />
            </g>

            <g opacity={isAreaOn('sludge_handling') ? 1 : 0.3}>
              <SludgeTankVessel
                x={870}
                y={540}
                width={112}
                height={132}
                eq={eqMap.get('TNK-801')}
                statusColor={eqColor('TNK-801')}
                levelRatio={lvl801}
                levelPctText={fmtTag('LIT-801', 0)}
                isFlowing={desludgeFlow.active || sludgeXferFlow.active}
                animationsEnabled={areaAnim('sludge_handling')}
                onSelect={clickEq}
                onHover={setHoverInfo}
              />
            </g>
          </g>

          {/* LAYER 4: ROTATING / ACTUATED EQUIPMENT */}
          <g id="hmi-equipment-layer">
            {isAreaOn('raw_water_intake') && (
              <>
                <CentrifugalPump25D {...commonEqProps(154, 198, 'PMP-101', 'raw_water_intake')} />
                <CentrifugalPump25D {...commonEqProps(154, 292, 'PMP-102', 'raw_water_intake')} />
                <ActuatedValve25D
                  {...commonEqProps(234, 245, 'XV-101', 'raw_water_intake')}
                  openPct={getValveOpenPct(eqMap.get('XV-101'))}
                />
              </>
            )}

            {isAreaOn('coagulation') && (
              <>
                <DosingPump25D
                  {...commonEqProps(428, 360, 'PMP-201', 'coagulation')}
                  fluidColor="#f59e0b"
                  labelSide="right"
                />
                <RapidMixer25D
                  {...commonEqProps(373, 184, 'MXR-201', 'coagulation')}
                  shaftLength={78}
                  durationSec={mxr201Dur}
                />
              </>
            )}

            {isAreaOn('flocculation') && (
              <>
                <FlocAgitator25D
                  {...commonEqProps(572, 180, 'MXR-301', 'flocculation')}
                  shaftLength={104}
                  durationSec={mxr301Dur}
                  rpm={mxr301Rpm}
                />
                <FlocAgitator25D
                  {...commonEqProps(662, 180, 'MXR-302', 'flocculation')}
                  shaftLength={104}
                  durationSec={mxr302Dur}
                  rpm={mxr302Rpm}
                />
              </>
            )}

            {isAreaOn('sedimentation') && (
              <CentrifugalPump25D {...commonEqProps(846, 404, 'PMP-401', 'sedimentation')} />
            )}

            {isAreaOn('filtration') && (
              <>
                <ActuatedValve25D
                  {...commonEqProps(1024, 354, 'XV-501', 'filtration')}
                  orientation="vertical"
                  openPct={getValveOpenPct(eqMap.get('XV-501'))}
                />
                <CentrifugalPump25D {...commonEqProps(1078, 422, 'PMP-501', 'filtration')} />
                <AirBlower25D {...commonEqProps(1168, 422, 'BLW-501', 'filtration')} />
              </>
            )}

            {isAreaOn('disinfection') && (
              <DosingPump25D
                {...commonEqProps(1330, 392, 'PMP-601', 'disinfection')}
                fluidColor="#a3e635"
                labelSide="right"
              />
            )}

            {isAreaOn('clear_water_storage') && (
              <>
                <CentrifugalPump25D {...commonEqProps(1512, 356, 'PMP-701', 'clear_water_storage')} />
                <CentrifugalPump25D {...commonEqProps(1512, 424, 'PMP-702', 'clear_water_storage')} />
                <ActuatedValve25D
                  {...commonEqProps(1624, 245, 'FCV-701', 'clear_water_storage')}
                  openPct={fcv701Pos}
                  showPctBadge={true}
                />
                <text x={1624} y={288} textAnchor="middle" fill="var(--pid-muted)" fontSize={7.2} fontFamily="var(--mono)">
                  TO CITY
                </text>
              </>
            )}

            {isAreaOn('sludge_handling') && (
              <>
                <CentrifugalPump25D {...commonEqProps(1074, 612, 'PMP-801', 'sludge_handling')} />
                <ManualValve25D {...commonEqProps(1174, 612, 'MV-801', 'sludge_handling')} />
                <text x={1354} y={596} fill="var(--pid-muted)" fontSize={7.5} fontFamily="var(--mono)" fontWeight="bold">
                  TO DEWATERING
                </text>
              </>
            )}
          </g>

          {/* LAYER 5: REAL FIELD SENSORS & PROCESS CONTEXT */}
          <g id="hmi-sensors-layer">
            {isAreaOn('raw_water_intake') && (
              <>
                <UltrasonicLevelSensor {...sensorProps(63, 90, 'LIT-101', 'Sump Level')} mountX={63} mountY={165} />
                <ImmersedAnalyzerProbe
                  {...sensorProps(156, 90, 'AIT-101_PH', 'Raw Water pH')}
                  probeX={206}
                  probeY={245}
                  badgeText="pH"
                  accentColor="#38bdf8"
                />
                <InlineFlowmeter
                  {...sensorProps(250, 90, 'FIT-101', 'Inlet Flow', 1)}
                  pipeX={274}
                  pipeY={245}
                />
                <ImmersedAnalyzerProbe
                  {...sensorProps(63, 396, 'AIT-102_TURB', 'Raw Turbidity', 1)}
                  probeX={63}
                  probeY={302}
                  badgeText="NTU"
                  accentColor={rawPalette.isHighTurbidity ? '#f59e0b' : '#38bdf8'}
                />
                <PressureGauge
                  {...sensorProps(238, 396, 'PIT-101', 'Intake Press')}
                  minVal={0}
                  maxVal={5}
                  tapX={206}
                  tapY={245}
                />
              </>
            )}

            {isAreaOn('coagulation') && (
              <>
                <InlineFlowmeter
                  {...sensorProps(454, 90, 'FIT-201', 'Coag Flow', 1)}
                  pipeX={428}
                  pipeY={292}
                  verticalPipe={true}
                />
                <UltrasonicLevelSensor
                  {...sensorProps(452, 444, 'LIT-201', 'Coag Tank', 0)}
                  mountX={358}
                  mountY={344}
                />
              </>
            )}

            {isAreaOn('flocculation') && (
              <>
                <ImmersedAnalyzerProbe
                  {...sensorProps(617, 82, 'TIT-301_TEMP', 'Water Temp', 1)}
                  probeX={617}
                  probeY={216}
                  badgeText="°C"
                  accentColor="#fb923c"
                />
                <rect
                  x={526}
                  y={350}
                  width={182}
                  height={98}
                  rx={4}
                  fill="var(--hmi-card-bg)"
                  stroke="var(--hmi-card-border)"
                  strokeWidth={1}
                />
                <text x={617} y={371} textAnchor="middle" fill="var(--pid-label)" fontSize={8.5} fontFamily="var(--sans)" fontWeight="700">
                  Slow Agitation Stage
                </text>
                <text x={617} y={388} textAnchor="middle" fill="var(--pid-muted)" fontSize={7.8} fontFamily="var(--sans)">
                  Paddles bind micro-flocs gently
                </text>
                <text x={617} y={402} textAnchor="middle" fill="var(--pid-muted)" fontSize={7.8} fontFamily="var(--sans)">
                  without shearing before settling.
                </text>
                <text x={617} y={428} textAnchor="middle" fill="var(--pid-value-fg)" fontSize={8} fontFamily="var(--mono)" fontWeight="bold">
                  Stage 1: {mxr301Rpm !== null ? `${mxr301Rpm.toFixed(0)} RPM` : '--'} | Stage 2: {mxr302Rpm !== null ? `${mxr302Rpm.toFixed(0)} RPM` : '--'}
                </text>
              </>
            )}

            {isAreaOn('sedimentation') && (
              <>
                <UltrasonicLevelSensor
                  {...sensorProps(784, 90, 'LIT-401', 'Clarifier Lvl')}
                  mountX={784}
                  mountY={176}
                />
                <ImmersedAnalyzerProbe
                  {...sensorProps(898, 90, 'AIT-401_TURB', 'Clarifier Turb')}
                  probeX={920}
                  probeY={198}
                  badgeText="NTU"
                  accentColor="#38bdf8"
                />
              </>
            )}

            {isAreaOn('filtration') && (
              <>
                <PressureGauge
                  {...sensorProps(1000, 92, 'PIT-501', 'Filter In P')}
                  minVal={0}
                  maxVal={2.5}
                  tapX={966}
                  tapY={206}
                />
                <DiffPressureTransmitter
                  {...sensorProps(1088, 90, 'PDIT-501', 'Filter dP')}
                  highTap={{ x: 978, y: 206 }}
                  lowTap={{ x: 1186, y: 304 }}
                />
                <ImmersedAnalyzerProbe
                  {...sensorProps(1174, 90, 'AIT-501_TURB', 'Filtered Turb')}
                  probeX={1192}
                  probeY={304}
                  badgeText="NTU"
                  accentColor="#22c55e"
                />
                <InlineFlowmeter
                  {...sensorProps(1110, 352, 'FIT-501', 'Filter Flow', 1)}
                  pipeX={1202}
                  pipeY={278}
                  verticalPipe={true}
                />
              </>
            )}

            {isAreaOn('disinfection') && (
              <>
                <UltrasonicLevelSensor
                  {...sensorProps(1278, 90, 'LIT-601', 'Contact Lvl')}
                  mountX={1278}
                  mountY={178}
                />
                <ImmersedAnalyzerProbe
                  {...sensorProps(1382, 90, 'AIT-601_CL2', 'Free Cl2')}
                  probeX={1402}
                  probeY={232}
                  badgeText="Cl2"
                  accentColor="#a3e635"
                />
                <InlineFlowmeter
                  {...sensorProps(1382, 336, 'FIT-601', 'Cl2 Dosing', 1)}
                  pipeX={1330}
                  pipeY={336}
                  verticalPipe={true}
                />
                <UltrasonicLevelSensor
                  {...sensorProps(1382, 448, 'LIT-602', 'Cl2 Tank', 0)}
                  mountX={1271}
                  mountY={344}
                />
              </>
            )}

            {isAreaOn('clear_water_storage') && (
              <>
                <UltrasonicLevelSensor
                  {...sensorProps(1494, 90, 'LIT-701', 'Reservoir Lvl')}
                  mountX={1494}
                  mountY={152}
                />
                <ImmersedAnalyzerProbe
                  {...sensorProps(1612, 90, 'AIT-701_PH', 'Treated pH')}
                  probeX={1554}
                  probeY={210}
                  badgeText="pH"
                  accentColor="#22c55e"
                />
                <PressureGauge
                  {...sensorProps(1612, 344, 'PIT-701', 'Dist Press')}
                  minVal={0}
                  maxVal={7}
                  tapX={1596}
                  tapY={292}
                />
                <InlineFlowmeter
                  {...sensorProps(1612, 444, 'FIT-701', 'Dist Flow', 1)}
                  pipeX={1596}
                  pipeY={390}
                  verticalPipe={true}
                />
              </>
            )}

            {isAreaOn('sludge_handling') && (
              <>
                <UltrasonicLevelSensor
                  {...sensorProps(796, 608, 'LIT-801', 'Sludge Tank', 0)}
                  mountX={874}
                  mountY={548}
                />
                <InlineFlowmeter
                  {...sensorProps(1264, 554, 'FIT-801', 'Sludge Flow', 1)}
                  pipeX={1264}
                  pipeY={612}
                />
              </>
            )}
          </g>

          {/* BOTTOM-LEFT PANEL: LIVE WATER CLARITY PROGRESSION & OVERVIEW */}
          <g id="hmi-clarity-summary">
            <rect
              x={14}
              y={498}
              width={710}
              height={248}
              rx={5}
              fill="var(--hmi-zone-bg)"
              stroke="var(--hmi-zone-border)"
              strokeWidth={1.2}
            />
            <path
              d="M 14,503 Q 14,498 19,498 L 719,498 Q 724,498 724,503 L 724,524 L 14,524 Z"
              fill="var(--hmi-zone-header-bg)"
            />
            <line x1={14} y1={524} x2={724} y2={524} stroke="var(--hmi-zone-border)" strokeWidth={1} />
            <text x={26} y={514.5} fill="var(--hmi-zone-title)" fontSize={9.8} fontFamily="var(--sans)" fontWeight="700" letterSpacing="0.4">
              LIVE WATER CLARITY PROGRESSION &amp; PROCESS SUMMARY
            </text>

            {[
              {
                step: 'STAGE A',
                title: 'Raw Water',
                colorTop: rawPalette.top,
                colorBot: rawPalette.bottom,
                metric1: `Turb: ${fmtTag('AIT-102_TURB', 1)}`,
                metric2: `pH: ${fmtTag('AIT-101_PH', 2)}`,
                x: 28,
              },
              {
                step: 'STAGE D',
                title: 'After Clarifier',
                colorTop: '#2491bf',
                colorBot: '#155c7d',
                metric1: `Turb: ${fmtTag('AIT-401_TURB', 2)}`,
                metric2: `CLR-401: ${eqMap.get('CLR-401')?.state || '--'}`,
                x: 202,
              },
              {
                step: 'STAGE E',
                title: 'After Filter',
                colorTop: '#38bdf8',
                colorBot: '#0284c7',
                metric1: `Turb: ${fmtTag('AIT-501_TURB', 2)}`,
                metric2: `FLT-501: ${filterMode.statusLabel}`,
                x: 376,
              },
              {
                step: 'STAGE G',
                title: 'Potable Output',
                colorTop: '#7dd3fc',
                colorBot: '#0369a1',
                metric1: `Cl2: ${fmtTag('AIT-601_CL2', 2)}`,
                metric2: `pH: ${fmtTag('AIT-701_PH', 2)}`,
                x: 550,
              },
            ].map((card, i) => (
              <g key={card.step}>
                <rect
                  x={card.x}
                  y={538}
                  width={158}
                  height={118}
                  rx={4}
                  fill="var(--hmi-card-bg)"
                  stroke="var(--hmi-card-border)"
                  strokeWidth={1}
                />
                {/* Beaker visual */}
                <defs>
                  <linearGradient id={`clarity-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={card.colorTop} />
                    <stop offset="100%" stopColor={card.colorBot} />
                  </linearGradient>
                </defs>
                <rect x={card.x + 12} y={548} width={134} height={42} rx={3} fill={`url(#clarity-grad-${i})`} stroke="var(--hmi-metal-stroke)" strokeWidth={1} />
                <text x={card.x + 20} y={563} fill="#f8fafc" fontSize={7.5} fontFamily="var(--mono)" fontWeight="bold">
                  {card.step}
                </text>
                <text x={card.x + 20} y={578} fill="#ffffff" fontSize={9.5} fontFamily="var(--sans)" fontWeight="700">
                  {card.title}
                </text>
                <text x={card.x + 12} y={612} fill="var(--pid-value-fg)" fontSize={8.5} fontFamily="var(--mono)" fontWeight="bold">
                  {card.metric1}
                </text>
                <text x={card.x + 12} y={632} fill="var(--pid-muted)" fontSize={8} fontFamily="var(--mono)">
                  {card.metric2}
                </text>
                {i < 3 && (
                  <polygon
                    points={`${card.x + 162},593 ${card.x + 170},597 ${card.x + 162},601`}
                    fill="var(--accent)"
                  />
                )}
              </g>
            ))}

            {/* Key live status strip */}
            <rect x={28} y={668} width={680} height={34} rx={4} fill="var(--hmi-card-bg)" stroke="var(--hmi-card-border)" strokeWidth={1} />
            <text x={42} y={689} fill="var(--pid-label)" fontSize={8.5} fontFamily="var(--mono)">
              Intake Flow: <tspan fill="var(--pid-value-fg)" fontWeight="bold">{fmtTag('FIT-101', 1)}</tspan>
              {'  |  '}Rapid Mix (MXR-201): <tspan fill={eqColor('MXR-201')} fontWeight="bold">{eqMap.get('MXR-201')?.state || '--'}</tspan>
              {'  |  '}Dist Flow: <tspan fill="var(--pid-value-fg)" fontWeight="bold">{fmtTag('FIT-701', 1)}</tspan>
              {'  |  '}FCV-701: <tspan fill="#22c55e" fontWeight="bold">{fcv701Pos}%</tspan>
            </text>

            {/* Interactive help tip */}
            <text x={369} y={726} textAnchor="middle" fill="var(--pid-muted)" fontSize={8.5} fontFamily="var(--sans)">
              Interactive Tip: Click any pump, mixer, blower, valve, filter, or tank to open its live control faceplate.
            </text>
          </g>

          {/* BOTTOM-RIGHT PANEL: TREATED WATER QUALITY SUMMARY */}
          <g id="hmi-treated-quality">
            <rect
              x={1442}
              y={498}
              width={224}
              height={248}
              rx={5}
              fill="var(--hmi-zone-bg)"
              stroke="var(--hmi-zone-border)"
              strokeWidth={1.2}
            />
            <path
              d="M 1442,503 Q 1442,498 1447,498 L 1661,498 Q 1666,498 1666,503 L 1666,524 L 1442,524 Z"
              fill="var(--hmi-zone-header-bg)"
            />
            <line x1={1442} y1={524} x2={1666} y2={524} stroke="var(--hmi-zone-border)" strokeWidth={1} />
            <text x={1454} y={514.5} fill="var(--hmi-zone-title)" fontSize={9.5} fontFamily="var(--sans)" fontWeight="700" letterSpacing="0.4">
              TREATED WATER QUALITY
            </text>

            {[
              { tag: 'AIT-701_PH', label: 'Treated Water pH', y: 536, dec: 2 },
              { tag: 'AIT-702_COND', label: 'Conductivity', y: 586, dec: 0 },
              { tag: 'AIT-703_TDS', label: 'Total Dissolved Solids', y: 636, dec: 0 },
              { tag: 'AIT-601_CL2', label: 'Free Residual Chlorine', y: 686, dec: 2 },
            ].map((item) => (
              <g key={item.tag}>
                <rect
                  x={1454}
                  y={item.y}
                  width={200}
                  height={42}
                  rx={4}
                  fill="var(--hmi-card-bg)"
                  stroke="var(--hmi-card-border)"
                  strokeWidth={1}
                />
                <text x={1464} y={item.y + 16} fill="var(--pid-label)" fontSize={8.2} fontFamily="var(--sans)" fontWeight="700">
                  {item.label}
                </text>
                <text x={1464} y={item.y + 31} fill="var(--pid-muted)" fontSize={7} fontFamily="var(--mono)">
                  {item.tag}
                </text>
                <text x={1644} y={item.y + 26} textAnchor="end" fill={tagColor(item.tag)} fontSize={10.5} fontFamily="var(--mono)" fontWeight="bold">
                  {fmtTag(item.tag, item.dec)}
                </text>
              </g>
            ))}
          </g>

          {/* HOVER TOOLTIP CARD (clamped cleanly inside 1680x760) */}
          {hoverInfo && (
            <g
              transform={`translate(${Math.min(1340, Math.max(16, hoverInfo.x - 140))},${Math.min(688, Math.max(16, hoverInfo.y - 52))})`}
              pointerEvents="none"
            >
              <rect
                x={0}
                y={0}
                width={324}
                height={hoverInfo.hint ? 52 : 38}
                rx={4}
                fill="var(--pid-tooltip-bg)"
                stroke="var(--accent)"
                strokeWidth={1.3}
              />
              <text x={10} y={15} fill="var(--pid-label)" fontSize={9.5} fontFamily="var(--mono)" fontWeight="bold">
                {hoverInfo.title}
              </text>
              <text x={10} y={29} fill="var(--pid-muted)" fontSize={8.2} fontFamily="var(--mono)">
                {hoverInfo.detail}
              </text>
              {hoverInfo.hint && (
                <text x={10} y={43} fill="var(--accent)" fontSize={8} fontFamily="var(--sans)" fontWeight="600">
                  {hoverInfo.hint}
                </text>
              )}
            </g>
          )}
        </g>
      </svg>
    );
  }
);
