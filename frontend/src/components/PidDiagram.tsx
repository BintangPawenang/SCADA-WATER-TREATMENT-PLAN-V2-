import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlarmRecord, EquipmentState, ProcessAreaConfig, TagState } from '../types';
import { RealisticPlantDiagram } from './pid/RealisticPlantDiagram';

interface PidDiagramProps {
  tags: TagState[];
  equipment: EquipmentState[];
  alarms: AlarmRecord[];
  processAreas: Record<string, ProcessAreaConfig>;
  onSelectEquipment: (eq: EquipmentState) => void;
}

interface HoverPayload {
  x: number;
  y: number;
  title: string;
  detail: string;
}

interface InstrumentBubbleProps {
  x: number;
  y: number;
  tag: string;
  label: string;
  tagState?: TagState;
  color: string;
  formattedValue: string;
  onHover: (info: HoverPayload | null) => void;
}

const InstrumentBubble = memo<InstrumentBubbleProps>(({
  x,
  y,
  tag,
  label,
  tagState,
  color,
  formattedValue,
  onHover,
}) => {
  const [prefix, rest = ''] = tag.split('-', 2);
  const [loopNum, suffix] = rest.split('_', 2);
  const bubbleTop = suffix ? `${prefix}:${suffix.slice(0, 3)}` : prefix;
  return (
    <g
      transform={`translate(${x},${y})`}
      style={{ cursor: 'pointer' }}
      onMouseEnter={() =>
        onHover({
          x,
          y: y - 30,
          title: `${tag} (${label})`,
          detail: tagState
            ? `Val: ${formattedValue} | Quality: ${tagState.quality} | Addr: ${tagState.source_address}`
            : 'Unconfigured',
        })
      }
      onMouseLeave={() => onHover(null)}
    >
      <circle cx={0} cy={0} r={15} fill="var(--pid-vessel-bg)" stroke={color} strokeWidth={1.5} />
      <line x1={-15} y1={0} x2={15} y2={0} stroke={color} strokeWidth={0.8} />
      <text x={0} y={-3} textAnchor="middle" fill="var(--pid-label)" fontSize={6.5} fontFamily="monospace" fontWeight="bold">
        {bubbleTop}
      </text>
      <text x={0} y={9} textAnchor="middle" fill="var(--pid-muted)" fontSize={7} fontFamily="monospace">
        {loopNum}
      </text>
      <rect x={-36} y={18} width={72} height={14} rx={2} fill="var(--pid-value-bg)" stroke="var(--pid-zone-stroke)" strokeWidth={0.8} />
      <text x={0} y={28} textAnchor="middle" fill={color} fontSize={8.2} fontFamily="monospace" fontWeight="bold">
        {formattedValue}
      </text>
    </g>
  );
});

interface EquipmentSymbolProps {
  x: number;
  y: number;
  id: string;
  eq?: EquipmentState;
  color: string;
  isAlarmed: boolean;
  onSelect: (id: string) => void;
  onHover: (info: HoverPayload | null) => void;
}

const PumpSymbol = memo<EquipmentSymbolProps>(({ x, y, id, eq, color, isAlarmed, onSelect, onHover }) => (
  <g
    transform={`translate(${x},${y})`}
    style={{ cursor: 'pointer' }}
    tabIndex={0}
    role="button"
    aria-label={`${id} ${eq?.name || ''} ${eq?.state || ''}`}
    onClick={() => onSelect(id)}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(id); }}
    onMouseEnter={() =>
      onHover({
        x,
        y: y - 28,
        title: `${id} - ${eq?.name || ''}`,
        detail: `State: ${eq?.state || 'N/A'} | Mode: ${eq?.control_mode || 'N/A'} | Runtime: ${eq?.runtime_hours.toFixed(1) || 0}h`,
      })
    }
    onMouseLeave={() => onHover(null)}
  >
    <circle cx={0} cy={0} r={15} fill="var(--pid-vessel-bg)" stroke={color} strokeWidth={2.2} />
    <polygon points="-6,9 11,0 -6,-9" fill={color} opacity={0.85} />
    {isAlarmed && (
      <circle cx={0} cy={0} r={20} fill="none" stroke="var(--badge-crit-fg)" strokeWidth={1.6} strokeDasharray="3,2" />
    )}
    <text x={0} y={26} textAnchor="middle" fill="var(--pid-label)" fontSize={8.5} fontFamily="monospace" fontWeight="bold">
      {id}
    </text>
    <text x={0} y={36} textAnchor="middle" fill={color} fontSize={7.5} fontFamily="monospace">
      {eq?.state || '--'}
    </text>
  </g>
));

const MixerSymbol = memo<EquipmentSymbolProps>(({ x, y, id, eq, color, isAlarmed, onSelect, onHover }) => (
  <g
    transform={`translate(${x},${y})`}
    style={{ cursor: 'pointer' }}
    tabIndex={0}
    role="button"
    aria-label={`${id} ${eq?.name || ''} ${eq?.state || ''}`}
    onClick={() => onSelect(id)}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(id); }}
    onMouseEnter={() =>
      onHover({
        x,
        y: y - 28,
        title: `${id} (Mixer) - ${eq?.name || ''}`,
        detail: `State: ${eq?.state || 'N/A'} | Runtime: ${eq?.runtime_hours.toFixed(1) || 0}h`,
      })
    }
    onMouseLeave={() => onHover(null)}
  >
    <rect x={-9} y={-22} width={18} height={11} rx={2} fill="var(--pid-vessel-bg)" stroke={color} strokeWidth={1.8} />
    <text x={0} y={-14} textAnchor="middle" fill={color} fontSize={7} fontFamily="monospace" fontWeight="bold">M</text>
    <line x1={0} y1={-11} x2={0} y2={14} stroke={color} strokeWidth={2} />
    <ellipse cx={-7} cy={14} rx={7} ry={3} fill="none" stroke={color} strokeWidth={1.8} />
    <ellipse cx={7} cy={14} rx={7} ry={3} fill="none" stroke={color} strokeWidth={1.8} />
    {isAlarmed && (
      <circle cx={0} cy={0} r={22} fill="none" stroke="var(--badge-crit-fg)" strokeWidth={1.6} strokeDasharray="3,2" />
    )}
    <text x={0} y={29} textAnchor="middle" fill="var(--pid-label)" fontSize={8} fontFamily="monospace" fontWeight="bold">
      {id}
    </text>
    <text x={0} y={39} textAnchor="middle" fill={color} fontSize={7} fontFamily="monospace">
      {eq?.state || '--'}
    </text>
  </g>
));

const BlowerSymbol = memo<EquipmentSymbolProps>(({ x, y, id, eq, color, isAlarmed, onSelect, onHover }) => (
  <g
    transform={`translate(${x},${y})`}
    style={{ cursor: 'pointer' }}
    tabIndex={0}
    role="button"
    aria-label={`${id} ${eq?.name || ''} ${eq?.state || ''}`}
    onClick={() => onSelect(id)}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(id); }}
    onMouseEnter={() =>
      onHover({
        x,
        y: y - 28,
        title: `${id} (Air Blower) - ${eq?.name || ''}`,
        detail: `State: ${eq?.state || 'N/A'} | Runtime: ${eq?.runtime_hours.toFixed(1) || 0}h`,
      })
    }
    onMouseLeave={() => onHover(null)}
  >
    <circle cx={0} cy={0} r={15} fill="var(--pid-vessel-bg)" stroke={color} strokeWidth={2.2} />
    <line x1={-10} y1={-10} x2={12} y2={-4} stroke={color} strokeWidth={1.6} />
    <line x1={-10} y1={10} x2={12} y2={4} stroke={color} strokeWidth={1.6} />
    {isAlarmed && (
      <circle cx={0} cy={0} r={20} fill="none" stroke="var(--badge-crit-fg)" strokeWidth={1.6} strokeDasharray="3,2" />
    )}
    <text x={0} y={26} textAnchor="middle" fill="var(--pid-label)" fontSize={8.5} fontFamily="monospace" fontWeight="bold">
      {id}
    </text>
    <text x={0} y={36} textAnchor="middle" fill={color} fontSize={7.5} fontFamily="monospace">
      {eq?.state || '--'}
    </text>
  </g>
));

interface ValveSymbolProps extends EquipmentSymbolProps {
  actuated?: boolean;
}

const ValveSymbol = memo<ValveSymbolProps>(({ x, y, id, eq, color, actuated = true, onSelect, onHover }) => (
  <g
    transform={`translate(${x},${y})`}
    style={{ cursor: 'pointer' }}
    tabIndex={0}
    role="button"
    aria-label={`${id} ${eq?.name || ''} ${eq?.state || ''}`}
    onClick={() => onSelect(id)}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(id); }}
    onMouseEnter={() =>
      onHover({
        x,
        y: y - 24,
        title: `${id} - ${eq?.name || ''}`,
        detail: `State: ${eq?.state || 'N/A'} | Mode: ${eq?.control_mode || 'N/A'}`,
      })
    }
    onMouseLeave={() => onHover(null)}
  >
    <rect x={-18} y={-24} width={36} height={50} fill="transparent" />
    <polygon points="-12,-8 0,0 -12,8" fill={color} stroke="var(--pid-vessel-stroke)" strokeWidth={1} />
    <polygon points="12,-8 0,0 12,8" fill={color} stroke="var(--pid-vessel-stroke)" strokeWidth={1} />
    {actuated ? (
      <>
        <line x1={0} y1={0} x2={0} y2={-12} stroke="var(--pid-vessel-stroke)" strokeWidth={1.4} />
        <rect x={-7} y={-20} width={14} height={8} fill="var(--pid-vessel-bg)" stroke={color} strokeWidth={1.2} />
      </>
    ) : (
      <>
        <line x1={0} y1={0} x2={0} y2={-12} stroke="var(--pid-vessel-stroke)" strokeWidth={1.4} />
        <line x1={-8} y1={-12} x2={8} y2={-12} stroke="var(--pid-vessel-stroke)" strokeWidth={1.8} />
      </>
    )}
    <text x={0} y={20} textAnchor="middle" fill="var(--pid-label)" fontSize={8} fontFamily="monospace">
      {id}
    </text>
  </g>
));

export const PidDiagram: React.FC<PidDiagramProps> = memo(({
  tags,
  equipment,
  alarms,
  processAreas,
  onSelectEquipment,
}) => {
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [viewMode, setViewMode] = useState<'realistic' | 'schematic'>('realistic');
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [isa101Mode, setIsa101Mode] = useState(true);
  const dragStart = useRef({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverPayload | null>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      setZoom((z) => Math.max(0.5, Math.min(2.5, +(z + delta).toFixed(2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const tagMap = useMemo(() => new Map(tags.map((t) => [t.tag_name, t])), [tags]);
  const eqMap = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);
  const alarmedSources = useMemo(
    () => new Set(alarms.filter((a) => a.active).map((a) => a.source)),
    [alarms]
  );

  const isAreaOn = (key: string) => processAreas[key]?.enabled ?? false;

  const fmtTag = (name: string) => {
    const t = tagMap.get(name);
    if (!t) return '--';
    if (t.quality !== 'GOOD') return `${t.quality}`;
    if (typeof t.value === 'number') return `${t.value.toFixed(2)} ${t.engineering_unit}`;
    return `${String(t.value)} ${t.engineering_unit}`;
  };

  const levelPct = (tagName: string, maxScale: number): number => {
    const t = tagMap.get(tagName);
    if (!t || t.quality !== 'GOOD' || typeof t.value !== 'number') return 0;
    return Math.max(0.05, Math.min(0.95, t.value / maxScale));
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
    if (alarmedSources.has(id) || eq.state === 'FAULT' || eq.state === 'TRAVEL_FAULT' || eq.state === 'COMM_LOSS') {
      return 'var(--badge-crit-fg)';
    }
    if (eq.state === 'MAINTENANCE' || eq.state === 'STARTING' || eq.state === 'STOPPING' || eq.state === 'OPENING' || eq.state === 'CLOSING') {
      return 'var(--badge-warn-fg)';
    }
    if (eq.state === 'RUNNING' || eq.state === 'OPEN' || eq.state === 'IN_SERVICE') {
      return isa101Mode ? 'var(--pid-isa-running)' : 'var(--badge-good-fg)';
    }
    if (eq.state.startsWith('BACKWASH') || eq.state === 'RINSE') return 'var(--badge-warn-fg)';
    return 'var(--pid-stopped)';
  };

  const eqMapRef = useRef(eqMap);
  eqMapRef.current = eqMap;

  const clickEq = useCallback(
    (id: string) => {
      const eq = eqMapRef.current.get(id);
      if (eq) onSelectEquipment(eq);
    },
    [onSelectEquipment]
  );

  const lvl201 = levelPct('LIT-201', 100);
  const lvl401 = levelPct('LIT-401', 5);
  const lvl601 = levelPct('LIT-601', 5);
  const lvl701 = levelPct('LIT-701', 6);
  const lvl801 = levelPct('LIT-801', 100);

  const instProps = (x: number, y: number, tag: string, label: string): InstrumentBubbleProps => ({
    x,
    y,
    tag,
    label,
    tagState: tagMap.get(tag),
    color: tagColor(tag),
    formattedValue: fmtTag(tag),
    onHover: setHoverInfo,
  });

  const eqProps = (x: number, y: number, id: string): EquipmentSymbolProps => ({
    x,
    y,
    id,
    eq: eqMap.get(id),
    color: eqColor(id),
    isAlarmed: alarmedSources.has(id),
    onSelect: clickEq,
    onHover: setHoverInfo,
  });

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">
          {viewMode === 'realistic'
            ? 'Water Treatment Plant — Live Realistic Process HMI (Areas A–H)'
            : 'Industrial P&ID — Conventional Water Treatment Process (ISO 10628-2 / ISA-5.1)'}
        </span>
        <div className="toolbar">
          <div className="view-toggle-group" role="group" aria-label="Diagram Display Mode">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'realistic' ? 'active' : ''}`}
              onClick={() => {
                setViewMode('realistic');
                setZoom(1.0);
                setPan({ x: 0, y: 0 });
              }}
            >
              Realistic Plant
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'schematic' ? 'active' : ''}`}
              onClick={() => {
                setViewMode('schematic');
                setZoom(1.0);
                setPan({ x: 0, y: 0 });
              }}
            >
              Classic P&amp;ID
            </button>
          </div>
          {viewMode === 'realistic' ? (
            <button
              type="button"
              className={`btn ${animationsEnabled ? 'btn-primary' : ''}`}
              onClick={() => setAnimationsEnabled((v) => !v)}
              title="Pause or resume fluid and agitator animations"
            >
              {animationsEnabled ? 'Animations: ON' : 'Animations: PAUSED'}
            </button>
          ) : (
            <button
              type="button"
              className={`btn ${isa101Mode ? 'btn-primary' : ''}`}
              onClick={() => setIsa101Mode((v) => !v)}
              title="Toggle High-Performance HMI ISA-101 muted running palette"
            >
              {isa101Mode ? 'ISA-101 Palette: ON' : 'Classic Color: ON'}
            </button>
          )}
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Zoom: {Math.round(zoom * 100)}%
          </span>
          <button className="btn" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} aria-label="Zoom in">+</button>
          <button className="btn" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} aria-label="Zoom out">-</button>
          <button className="btn" onClick={() => { setZoom(1.0); setPan({ x: 0, y: 0 }); }}>Reset</button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`pid-viewport ${viewMode === 'realistic' ? 'realistic-mode' : ''}`}
        onMouseDown={(e) => {
          setDragging(true);
          dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        }}
        onMouseMove={(e) => {
          if (dragging) {
            setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
          }
        }}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
      >
        {viewMode === 'realistic' ? (
          <RealisticPlantDiagram
            tags={tags}
            equipment={equipment}
            alarms={alarms}
            processAreas={processAreas}
            animationsEnabled={animationsEnabled}
            zoom={zoom}
            pan={pan}
            onSelectEquipment={onSelectEquipment}
          />
        ) : (
        <svg viewBox="0 0 1400 560" width="100%" height="100%">
          <defs>
            <marker id="arrow-water" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#0284c7" />
            </marker>
            <marker id="arrow-chem" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#d97706" />
            </marker>
            <marker id="arrow-sludge" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#78716c" />
            </marker>
          </defs>

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* LAYER 1: STATIC ENGINEERING SYMBOLS & PIPING */}
            <g id="pid-static-engineering">
              {[
                { key: 'raw_water_intake', x: 15, y: 20, w: 230, h: 310, title: 'A. RAW WATER INTAKE' },
                { key: 'coagulation', x: 255, y: 20, w: 165, h: 310, title: 'B. COAGULATION' },
                { key: 'flocculation', x: 430, y: 20, w: 175, h: 310, title: 'C. FLOCCULATION' },
                { key: 'sedimentation', x: 615, y: 20, w: 205, h: 310, title: 'D. SEDIMENTATION' },
                { key: 'filtration', x: 830, y: 20, w: 205, h: 310, title: 'E. FILTRATION' },
                { key: 'disinfection', x: 1045, y: 20, w: 165, h: 310, title: 'F. DISINFECTION' },
                { key: 'clear_water_storage', x: 1220, y: 20, w: 165, h: 310, title: 'G. CLEAR WATER' },
                { key: 'sludge_handling', x: 615, y: 350, w: 420, h: 190, title: 'H. SLUDGE HANDLING' },
              ].map((z) => (
                <g key={z.key} opacity={isAreaOn(z.key) ? 1 : 0.25}>
                  <rect x={z.x} y={z.y} width={z.w} height={z.h} fill="none" stroke="var(--pid-zone-stroke)" strokeWidth={1} strokeDasharray="4,3" />
                  <text x={z.x + 8} y={z.y + 16} fill="var(--pid-muted)" fontSize={9.5} fontFamily="monospace" fontWeight="bold">
                    {z.title} {!isAreaOn(z.key) ? '(DISABLED)' : ''}
                  </text>
                </g>
              ))}

              <path d="M 28 160 L 45 160 M 45 125 L 45 205 M 45 125 L 110 125 M 45 205 L 110 205 M 110 125 L 110 205" stroke="#0284c7" strokeWidth={2.8} fill="none" />
              <path d="M 110 160 L 285 160" stroke="#0284c7" strokeWidth={3.5} fill="none" markerEnd="url(#arrow-water)" />
              <path d="M 285 160 L 455 160" stroke="#0284c7" strokeWidth={3.5} fill="none" markerEnd="url(#arrow-water)" />
              <path d="M 575 160 L 645 160" stroke="#0284c7" strokeWidth={3.5} fill="none" markerEnd="url(#arrow-water)" />
              <path d="M 790 160 L 860 160" stroke="#0284c7" strokeWidth={3.5} fill="none" markerEnd="url(#arrow-water)" />
              <path d="M 1000 160 L 1070 160" stroke="#0284c7" strokeWidth={3.5} fill="none" markerEnd="url(#arrow-water)" />
              <path d="M 1185 160 L 1245 160" stroke="#0284c7" strokeWidth={3.5} fill="none" markerEnd="url(#arrow-water)" />

              <path d="M 1295 205 L 1295 225 L 1250 225 L 1250 255 L 1370 255 M 1345 225 L 1345 255 M 1295 225 L 1345 225" stroke="#0284c7" strokeWidth={2.5} fill="none" />
              <path d="M 1345 160 L 1385 160" stroke="#0284c7" strokeWidth={3.5} fill="none" markerEnd="url(#arrow-water)" />

              <path d="M 875 210 L 875 285" stroke="#0284c7" strokeWidth={2} strokeDasharray="4,2" fill="none" />
              <path d="M 985 210 L 985 285" stroke="#94a3b8" strokeWidth={2} strokeDasharray="2,2" fill="none" />

              <text x={155} y={148} fill="var(--pid-value-fg)" fontSize={8} fontFamily="monospace">RW-101</text>
              <text x={390} y={148} fill="var(--pid-value-fg)" fontSize={8} fontFamily="monospace">COAG-201</text>
              <text x={595} y={148} fill="var(--pid-value-fg)" fontSize={8} fontFamily="monospace">FLOC-301</text>
              <text x={810} y={148} fill="var(--pid-value-fg)" fontSize={8} fontFamily="monospace">CLR-401</text>
              <text x={1020} y={148} fill="var(--pid-value-fg)" fontSize={8} fontFamily="monospace">FLT-501</text>
              <text x={1200} y={148} fill="var(--pid-value-fg)" fontSize={8} fontFamily="monospace">CL2-601</text>

              <path d="M 315 245 L 315 165" stroke="#d97706" strokeWidth={2.2} fill="none" markerEnd="url(#arrow-chem)" />
              <path d="M 1105 245 L 1105 165" stroke="#d97706" strokeWidth={2.2} fill="none" markerEnd="url(#arrow-chem)" />

              <path d="M 718 210 L 718 425 L 775 425" stroke="#78716c" strokeWidth={2.5} fill="none" markerEnd="url(#arrow-sludge)" />
              <path d="M 855 430 L 1015 430" stroke="#78716c" strokeWidth={2.5} fill="none" markerEnd="url(#arrow-sludge)" />

              <g style={{ cursor: 'pointer' }} onClick={() => clickEq('TNK-201')}>
                <rect x={275} y={245} width={50} height={60} fill="var(--pid-vessel-bg)" stroke={eqColor('TNK-201')} strokeWidth={1.6} />
                <rect x={276} y={245 + 60 * (1 - lvl201)} width={48} height={60 * lvl201} fill="var(--pid-chem-fill)" />
                <text x={300} y={278} textAnchor="middle" fill="var(--pid-label)" fontSize={8} fontFamily="monospace">TNK-201</text>
              </g>

              <rect x={455} y={120} width={120} height={80} fill="var(--pid-vessel-bg)" stroke="var(--pid-vessel-stroke)" strokeWidth={1.6} />
              <rect x={456} y={140} width={118} height={59} fill="var(--pid-water-fill)" />
              <text x={515} y={133} textAnchor="middle" fill="var(--pid-muted)" fontSize={8} fontFamily="monospace">FLOC BASIN</text>

              <g style={{ cursor: 'pointer' }} onClick={() => clickEq('CLR-401')}>
                <polygon points="645,120 790,120 770,210 665,210" fill="var(--pid-vessel-bg)" stroke={eqColor('CLR-401')} strokeWidth={1.6} />
                <rect x={665} y={120 + 88 * (1 - lvl401)} width={105} height={88 * lvl401} fill="var(--pid-water-fill)" />
                <line x1={718} y1={115} x2={718} y2={205} stroke="var(--pid-vessel-stroke)" strokeWidth={1.8} />
                <text x={718} y={145} textAnchor="middle" fill="var(--pid-label)" fontSize={8.5} fontFamily="monospace">CLR-401</text>
              </g>

              <g style={{ cursor: 'pointer' }} onClick={() => clickEq('FLT-501')}>
                <rect x={860} y={115} width={140} height={95} fill="var(--pid-vessel-bg)" stroke={eqColor('FLT-501')} strokeWidth={1.8} />
                <rect x={861} y={128} width={138} height={27} fill="var(--pid-water-fill)" />
                <line x1={860} y1={155} x2={1000} y2={155} stroke="var(--pid-vessel-stroke)" strokeDasharray="3,2" />
                <line x1={860} y1={180} x2={1000} y2={180} stroke="var(--pid-vessel-stroke)" strokeDasharray="3,2" />
                <text x={930} y={133} textAnchor="middle" fill="var(--pid-label)" fontSize={8.5} fontFamily="monospace">FLT-501</text>
                <text x={930} y={197} textAnchor="middle" fill={eqColor('FLT-501')} fontSize={7.5} fontFamily="monospace">
                  {eqMap.get('FLT-501')?.state || ''}
                </text>
              </g>

              <g style={{ cursor: 'pointer' }} onClick={() => clickEq('TNK-601')}>
                <rect x={1070} y={115} width={115} height={90} fill="var(--pid-vessel-bg)" stroke={eqColor('TNK-601')} strokeWidth={1.6} />
                <rect x={1071} y={115 + 89 * (1 - lvl601)} width={113} height={89 * lvl601} fill="var(--pid-water-fill)" />
                <text x={1127} y={135} textAnchor="middle" fill="var(--pid-label)" fontSize={8.5} fontFamily="monospace">TNK-601</text>
              </g>

              <g style={{ cursor: 'pointer' }} onClick={() => clickEq('TNK-701')}>
                <rect x={1245} y={110} width={100} height={95} fill="var(--pid-vessel-bg)" stroke={eqColor('TNK-701')} strokeWidth={1.8} />
                <rect x={1246} y={110 + 94 * (1 - lvl701)} width={98} height={94 * lvl701} fill="var(--pid-water-fill)" />
                <text x={1295} y={132} textAnchor="middle" fill="var(--pid-label)" fontSize={8.5} fontFamily="monospace">TNK-701</text>
              </g>

              <g style={{ cursor: 'pointer' }} onClick={() => clickEq('TNK-801')}>
                <rect x={775} y={390} width={80} height={75} fill="var(--pid-vessel-bg)" stroke={eqColor('TNK-801')} strokeWidth={1.6} />
                <rect x={776} y={390 + 74 * (1 - lvl801)} width={78} height={74 * lvl801} fill="var(--pid-sludge-fill)" />
                <text x={815} y={425} textAnchor="middle" fill="var(--pid-label)" fontSize={8.5} fontFamily="monospace">TNK-801</text>
              </g>
            </g>

            {/* LAYER 2: DYNAMIC SCADA OVERLAYS */}
            <g id="pid-dynamic-scada">
              {isAreaOn('raw_water_intake') && (
                <>
                  <PumpSymbol {...eqProps(75, 125, 'PMP-101')} />
                  <PumpSymbol {...eqProps(75, 205, 'PMP-102')} />
                  <ValveSymbol {...eqProps(155, 160, 'XV-101')} actuated={true} />
                  <InstrumentBubble {...instProps(205, 70, 'FIT-101', 'Inlet Flow')} />
                  <InstrumentBubble {...instProps(135, 70, 'AIT-101_PH', 'Raw Water pH')} />
                  <InstrumentBubble {...instProps(60, 272, 'AIT-102_TURB', 'Raw Turbidity')} />
                  <InstrumentBubble {...instProps(135, 272, 'LIT-101', 'Sump Level')} />
                  <InstrumentBubble {...instProps(212, 272, 'PIT-101', 'Intake Pressure')} />
                </>
              )}

              {isAreaOn('coagulation') && (
                <>
                  <PumpSymbol {...eqProps(315, 210, 'PMP-201')} />
                  <MixerSymbol {...eqProps(315, 130, 'MXR-201')} />
                  <InstrumentBubble {...instProps(380, 70, 'FIT-201', 'Coagulant Flow')} />
                  <InstrumentBubble {...instProps(380, 272, 'LIT-201', 'Coag Tank Lvl')} />
                </>
              )}

              {isAreaOn('flocculation') && (
                <>
                  <MixerSymbol {...eqProps(485, 162, 'MXR-301')} />
                  <MixerSymbol {...eqProps(545, 162, 'MXR-302')} />
                  <InstrumentBubble {...instProps(515, 70, 'TIT-301_TEMP', 'Water Temp')} />
                </>
              )}

              {isAreaOn('sedimentation') && (
                <>
                  <InstrumentBubble {...instProps(675, 70, 'LIT-401', 'Clarifier Lvl')} />
                  <InstrumentBubble {...instProps(760, 70, 'AIT-401_TURB', 'Clarifier Turb')} />
                  <PumpSymbol {...eqProps(718, 275, 'PMP-401')} />
                </>
              )}

              {isAreaOn('filtration') && (
                <>
                  <InstrumentBubble {...instProps(860, 70, 'PIT-501', 'Filter Inlet P')} />
                  <InstrumentBubble {...instProps(930, 70, 'PDIT-501', 'Filter dP')} />
                  <InstrumentBubble {...instProps(1000, 70, 'AIT-501_TURB', 'Filtered Turb')} />
                  <InstrumentBubble {...instProps(930, 240, 'FIT-501', 'Filter Flow')} />
                  <ValveSymbol {...eqProps(875, 230, 'XV-501')} actuated={true} />
                  <PumpSymbol {...eqProps(875, 285, 'PMP-501')} />
                  <BlowerSymbol {...eqProps(985, 285, 'BLW-501')} />
                </>
              )}

              {isAreaOn('disinfection') && (
                <>
                  <PumpSymbol {...eqProps(1105, 215, 'PMP-601')} />
                  <InstrumentBubble {...instProps(1080, 70, 'LIT-601', 'Contact Tank Lvl')} />
                  <InstrumentBubble {...instProps(1160, 70, 'AIT-601_CL2', 'Free Cl2')} />
                  <InstrumentBubble {...instProps(1170, 272, 'FIT-601', 'Cl2 Dosing')} />
                  <InstrumentBubble {...instProps(1090, 282, 'LIT-602', 'Cl2 Tank Lvl')} />
                </>
              )}

              {isAreaOn('clear_water_storage') && (
                <>
                  <InstrumentBubble {...instProps(1255, 62, 'LIT-701', 'Reservoir Lvl')} />
                  <InstrumentBubble {...instProps(1345, 62, 'AIT-701_PH', 'Treated pH')} />
                  <PumpSymbol {...eqProps(1265, 255, 'PMP-701')} />
                  <PumpSymbol {...eqProps(1340, 255, 'PMP-702')} />
                  <ValveSymbol {...eqProps(1358, 160, 'FCV-701')} actuated={true} />
                  <InstrumentBubble {...instProps(1260, 372, 'FIT-701', 'Dist Flow')} />
                  <InstrumentBubble {...instProps(1345, 372, 'PIT-701', 'Dist Pressure')} />
                </>
              )}

              {isAreaOn('sludge_handling') && (
                <>
                  <InstrumentBubble {...instProps(815, 495, 'LIT-801', 'Sludge Tank Lvl')} />
                  <PumpSymbol {...eqProps(915, 430, 'PMP-801')} />
                  <ValveSymbol {...eqProps(975, 430, 'MV-801')} actuated={false} />
                  <InstrumentBubble {...instProps(985, 495, 'FIT-801', 'Sludge Flow')} />
                </>
              )}

              {hoverInfo && (
                <g transform={`translate(${Math.min(1090, Math.max(10, hoverInfo.x - 100))},${Math.max(10, hoverInfo.y - 42)})`}>
                  <rect x={0} y={0} width={290} height={38} rx={3} fill="var(--pid-tooltip-bg)" stroke="var(--accent)" strokeWidth={1.2} />
                  <text x={8} y={14} fill="var(--pid-label)" fontSize={9.5} fontFamily="monospace" fontWeight="bold">
                    {hoverInfo.title}
                  </text>
                  <text x={8} y={28} fill="var(--pid-muted)" fontSize={8.5} fontFamily="monospace">
                    {hoverInfo.detail}
                  </text>
                </g>
              )}
            </g>
          </g>
        </svg>
        )}
      </div>

      {viewMode === 'realistic' ? (
        <div className="pid-legend">
          <span className="pid-legend-item"><span className="pid-swatch" style={{ background: '#1b6475' }} /> Raw Water</span>
          <span className="pid-legend-item"><span className="pid-swatch" style={{ background: '#0284c7' }} /> Treated / Clear Water</span>
          <span className="pid-legend-item"><span className="pid-swatch" style={{ background: '#f59e0b' }} /> Coagulant Dosing</span>
          <span className="pid-legend-item"><span className="pid-swatch" style={{ background: '#a3e635' }} /> Chlorine Dosing</span>
          <span className="pid-legend-item"><span className="pid-swatch" style={{ background: '#bae6fd', borderTop: '1px dashed #38bdf8' }} /> Air Scour</span>
          <span className="pid-legend-item"><span className="pid-swatch" style={{ background: '#6e5749' }} /> Sludge Line</span>
          <span className="pid-legend-item"><span className="pid-dot" style={{ background: '#22c55e' }} /> Running / Open</span>
          <span className="pid-legend-item"><span className="pid-dot" style={{ background: 'var(--badge-warn-fg)' }} /> Transition / Backwash / Maint</span>
          <span className="pid-legend-item"><span className="pid-dot" style={{ background: 'var(--badge-crit-fg)' }} /> Fault / Active Alarm</span>
          <span className="pid-legend-item"><span className="pid-dot" style={{ background: 'var(--pid-stopped)' }} /> Stopped / Closed</span>
        </div>
      ) : (
        <div className="pid-legend">
          <span className="pid-legend-item"><span className="pid-swatch" style={{ background: '#0284c7' }} /> Process Water</span>
          <span className="pid-legend-item"><span className="pid-swatch" style={{ background: '#d97706' }} /> Chemical Dosing</span>
          <span className="pid-legend-item"><span className="pid-swatch" style={{ background: '#78716c' }} /> Sludge Line</span>
          <span className="pid-legend-item"><span className="pid-swatch" style={{ background: '#94a3b8', borderTop: '1px dashed #94a3b8' }} /> Air Scour</span>
          <span className="pid-legend-item"><span className="pid-dot" style={{ background: isa101Mode ? 'var(--pid-isa-running)' : 'var(--badge-good-fg)' }} /> Running / In-Service</span>
          <span className="pid-legend-item"><span className="pid-dot" style={{ background: 'var(--badge-warn-fg)' }} /> Transition / Backwash / Maint</span>
          <span className="pid-legend-item"><span className="pid-dot" style={{ background: 'var(--badge-crit-fg)' }} /> Fault / Active Alarm</span>
          <span className="pid-legend-item"><span className="pid-dot" style={{ background: 'var(--badge-stale-fg)' }} /> Stale Data</span>
        </div>
      )}
    </div>
  );
});
