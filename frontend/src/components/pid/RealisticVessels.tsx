import React, { memo } from 'react';
import { EquipmentState } from '../../types';
import { HoverPayload } from './RealisticEquipment';
import {
  FilterVisualMode,
  RawWaterPalette,
  isEquipmentRunning,
} from './processAnimation';

interface VesselInteractionProps {
  id: string;
  eq?: EquipmentState;
  x: number;
  y: number;
  title: string;
  detail: string;
  onSelect: (id: string) => void;
  onHover: (info: HoverPayload | null) => void;
}

function clickableVesselProps({ id, eq, x, y, title, detail, onSelect, onHover }: VesselInteractionProps) {
  return {
    className: 'hmi-interactive',
    style: { cursor: 'pointer' },
    tabIndex: 0,
    role: 'button' as const,
    'aria-label': `${id} ${eq?.name || title} ${eq?.state || ''}`,
    onClick: () => onSelect(id),
    onKeyDown: (e: React.KeyboardEvent<SVGGElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(id);
      }
    },
    onMouseEnter: () =>
      onHover({
        x,
        y,
        title: `${id} — ${eq?.name || title}`,
        detail,
        hint: 'Click to view details / control',
      }),
    onMouseLeave: () => onHover(null),
  };
}

function AnimatedWaterWave({
  x,
  y,
  width,
  strokeColor,
  animate,
}: {
  x: number;
  y: number;
  width: number;
  strokeColor: string;
  animate: boolean;
}) {
  const segs = Math.ceil(width / 28) + 2;
  let d = `M ${x} ${y}`;
  for (let i = 0; i < segs; i++) {
    const sx = x + i * 28;
    d += ` Q ${sx + 7} ${y - 2.5}, ${sx + 14} ${y} T ${sx + 28} ${y}`;
  }
  return (
    <path
      d={d}
      fill="none"
      stroke={strokeColor}
      strokeWidth={1.8}
      opacity={0.85}
      className={animate ? 'hmi-wave-slide' : undefined}
    />
  );
}

export interface IntakeSumpVesselProps {
  x: number;
  y: number;
  width: number;
  height: number;
  levelRatio: number;
  palette: RawWaterPalette;
  isFlowing: boolean;
  animationsEnabled: boolean;
}

export const IntakeSumpVessel: React.FC<IntakeSumpVesselProps> = memo(
  ({ x, y, width, height, levelRatio, palette, isFlowing, animationsEnabled }) => {
    const innerX = x + 6;
    const innerY = y + 6;
    const innerW = width - 12;
    const innerH = height - 12;
    const waterH = Math.max(0, innerH * levelRatio);
    const waterTop = innerY + innerH - waterH;
    const animate = animationsEnabled && isFlowing;

    return (
      <g>
        <defs>
          <clipPath id="clip-intake-sump">
            <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={2} />
          </clipPath>
          <linearGradient id="grad-intake-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.top} />
            <stop offset="100%" stopColor={palette.bottom} />
          </linearGradient>
        </defs>

        {/* Concrete sump basin walls */}
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={3}
          fill="var(--hmi-concrete-fill)"
          stroke="var(--hmi-concrete-stroke)"
          strokeWidth={1.5}
        />
        <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={2} fill="#0b131e" />

        {/* Dynamic raw water volume */}
        <g clipPath="url(#clip-intake-sump)">
          {waterH > 0 && (
            <>
              <rect x={innerX} y={waterTop} width={innerW} height={waterH} fill="url(#grad-intake-water)" />
              <AnimatedWaterWave
                x={innerX - 6}
                y={waterTop + 1}
                width={innerW + 24}
                strokeColor={palette.surface}
                animate={animate}
              />
              {/* Floating sediment particles when turbid */}
              {[0.25, 0.55, 0.78].map((rx, idx) => (
                <circle
                  key={idx}
                  cx={innerX + innerW * rx}
                  cy={waterTop + waterH * (0.35 + idx * 0.18)}
                  r={palette.isHighTurbidity ? 2.2 : 1.3}
                  fill={palette.isHighTurbidity ? '#d6b084' : '#7dd3fc'}
                  opacity={0.45}
                />
              ))}
            </>
          )}
          {/* Inclined bar screen rack on intake side */}
          <line x1={innerX + 12} y1={innerY + 6} x2={innerX + 24} y2={innerY + innerH - 2} stroke="#94a3b8" strokeWidth={2.2} />
          {[0.22, 0.38, 0.54, 0.7, 0.86].map((r, i) => (
            <line
              key={i}
              x1={innerX + 12 + r * 11 - 3}
              y1={innerY + 6 + r * (innerH - 8)}
              x2={innerX + 12 + r * 11 + 3}
              y2={innerY + 6 + r * (innerH - 8)}
              stroke="#cbd5e1"
              strokeWidth={1.3}
            />
          ))}
        </g>

        {/* Vessel label */}
        <rect x={x + 4} y={y + height - 19} width={width - 8} height={14} rx={2} fill="rgba(2, 6, 23, 0.78)" />
        <text x={x + width / 2} y={y + height - 9.5} textAnchor="middle" fill="#e2e8f0" fontSize={6.8} fontFamily="var(--mono)" fontWeight="bold">
          INTAKE SUMP
        </text>
      </g>
    );
  }
);

export interface RapidMixVesselProps {
  x: number;
  y: number;
  width: number;
  height: number;
  coagDosingActive: boolean;
  mixerRunning: boolean;
  animationsEnabled: boolean;
}

export const RapidMixVessel: React.FC<RapidMixVesselProps> = memo(
  ({ x, y, width, height, coagDosingActive, mixerRunning, animationsEnabled }) => {
    const innerX = x + 5;
    const innerY = y + 5;
    const innerW = width - 10;
    const innerH = height - 10;
    const waterTop = innerY + 14;
    const animate = animationsEnabled && mixerRunning;

    return (
      <g>
        <defs>
          <clipPath id="clip-rapid-mix">
            <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={2} />
          </clipPath>
        </defs>

        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={3}
          fill="var(--hmi-concrete-fill)"
          stroke="var(--hmi-concrete-stroke)"
          strokeWidth={1.5}
        />
        <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={2} fill="#0b131e" />

        <g clipPath="url(#clip-rapid-mix)">
          <rect x={innerX} y={waterTop} width={innerW} height={innerY + innerH - waterTop} fill="url(#hmi-water-coag)" />
          <AnimatedWaterWave
            x={innerX - 6}
            y={waterTop}
            width={innerW + 24}
            strokeColor="#67e8f9"
            animate={animate}
          />
          {/* Wall baffles for rapid mixing */}
          <rect x={innerX} y={waterTop + 14} width={6} height={36} fill="var(--hmi-concrete-fill)" />
          <rect x={innerX + innerW - 6} y={waterTop + 14} width={6} height={36} fill="var(--hmi-concrete-fill)" />

          {/* Coagulant dispersion plume when dosing pump is active */}
          {coagDosingActive && (
            <ellipse
              cx={innerX + innerW / 2}
              cy={waterTop + 12}
              rx={22}
              ry={9}
              fill="#f59e0b"
              opacity={0.32}
              className={animate ? 'hmi-vortex-pulse' : undefined}
            />
          )}
        </g>

        <rect x={x + 12} y={y + height - 17} width={width - 24} height={13} rx={2} fill="rgba(2, 6, 23, 0.72)" />
        <text x={x + width / 2} y={y + height - 8} textAnchor="middle" fill="#e2e8f0" fontSize={7.5} fontFamily="var(--mono)" fontWeight="bold">
          RAPID MIX
        </text>
      </g>
    );
  }
);

export interface ChemicalTankVesselProps {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  label: string;
  levelRatio: number;
  levelPctText: string;
  fillGradientId: string;
  fluidAccent: string;
  eq?: EquipmentState;
  statusColor: string;
  onSelect?: (id: string) => void;
  onHover: (info: HoverPayload | null) => void;
}

export const ChemicalTankVessel: React.FC<ChemicalTankVesselProps> = memo(
  ({
    x,
    y,
    width,
    height,
    id,
    label,
    levelRatio,
    levelPctText,
    fillGradientId,
    fluidAccent,
    eq,
    statusColor,
    onSelect,
    onHover,
  }) => {
    const bodyY = y + 10;
    const bodyH = height - 14;
    const innerX = x + 5;
    const innerY = bodyY + 5;
    const innerW = width - 10;
    const innerH = bodyH - 8;
    const fillH = innerH * levelRatio;
    const fillTop = innerY + innerH - fillH;
    const clipId = `clip-chem-${id}`;

    const interactionProps =
      eq && onSelect
        ? clickableVesselProps({
            id,
            eq,
            x: x + width / 2,
            y,
            title: label,
            detail: `State: ${eq.state} | Level: ${levelPctText}`,
            onSelect,
            onHover,
          })
        : {
            style: { cursor: 'default' },
            onMouseEnter: () =>
              onHover({
                x: x + width / 2,
                y,
                title: `${id} — ${label}`,
                detail: `Level: ${levelPctText}`,
              }),
            onMouseLeave: () => onHover(null),
          };

    return (
      <g {...interactionProps}>
        <defs>
          <clipPath id={clipId}>
            <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={3} />
          </clipPath>
        </defs>

        {/* Domed HDPE tank roof + top fill port */}
        <path
          d={`M ${x + 4},${bodyY} Q ${x + width / 2},${y - 4} ${x + width - 4},${bodyY} Z`}
          fill="var(--hmi-metal-mid)"
          stroke={eq ? statusColor : 'var(--hmi-metal-stroke)'}
          strokeWidth={1.3}
        />
        <rect x={x + width / 2 - 5} y={y - 3} width={10} height={5} rx={1} fill="var(--hmi-metal-light)" />

        {/* Ribbed HDPE tank body */}
        <rect
          x={x}
          y={bodyY}
          width={width}
          height={bodyH}
          rx={4}
          fill="var(--hmi-concrete-dark)"
          stroke={eq ? statusColor : 'var(--hmi-metal-stroke)'}
          strokeWidth={1.4}
        />
        <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={3} fill="#0b131e" />

        {/* Chemical fill level */}
        <g clipPath={`url(#${clipId})`}>
          {fillH > 0 && (
            <>
              <rect x={innerX} y={fillTop} width={innerW} height={fillH} fill={`url(#${fillGradientId})`} />
              <line x1={innerX} y1={fillTop} x2={innerX + innerW} y2={fillTop} stroke={fluidAccent} strokeWidth={2} />
            </>
          )}
          {/* Structural ribs */}
          {[0.32, 0.65].map((r, i) => (
            <line
              key={i}
              x1={x}
              y1={bodyY + bodyH * r}
              x2={x + width}
              y2={bodyY + bodyH * r}
              stroke="rgba(148, 163, 184, 0.25)"
              strokeWidth={2}
            />
          ))}
        </g>

        {/* Sight glass graduation ticks on left edge */}
        {[0.25, 0.5, 0.75].map((r, i) => (
          <line
            key={i}
            x1={innerX + 2}
            y1={innerY + innerH * r}
            x2={innerX + 8}
            y2={innerY + innerH * r}
            stroke="rgba(226, 232, 240, 0.55)"
            strokeWidth={1}
          />
        ))}

        {/* Labels */}
        <rect x={x + 4} y={bodyY + 8} width={width - 8} height={24} rx={2} fill="rgba(2, 6, 23, 0.78)" />
        <text x={x + width / 2} y={bodyY + 19} textAnchor="middle" fill="#e2e8f0" fontSize={7.4} fontFamily="var(--mono)" fontWeight="bold">
          {label}
        </text>
        <text x={x + width / 2} y={bodyY + 29} textAnchor="middle" fill={fluidAccent} fontSize={7.5} fontFamily="var(--mono)" fontWeight="bold">
          {levelPctText}
        </text>
      </g>
    );
  }
);

export interface FlocBasinVesselProps {
  x: number;
  y: number;
  width: number;
  height: number;
  stage1Running: boolean;
  stage2Running: boolean;
  isFlowing: boolean;
  animationsEnabled: boolean;
}

export const FlocBasinVessel: React.FC<FlocBasinVesselProps> = memo(
  ({ x, y, width, height, stage1Running, stage2Running, isFlowing, animationsEnabled }) => {
    const innerX = x + 6;
    const innerY = y + 6;
    const innerW = width - 12;
    const innerH = height - 12;
    const waterTop = innerY + 14;
    const midX = x + width / 2;

    const flocCluster = (cx: number, cy: number, active: boolean, delay: string) => (
      <g
        transform={`translate(${cx},${cy})`}
        className={active && animationsEnabled ? 'hmi-floc-swirl' : undefined}
        style={active && animationsEnabled ? { animationDuration: '3.2s', animationDelay: delay } : undefined}
      >
        <circle cx={0} cy={0} r={2.2} fill="#e2e8f0" opacity={0.55} />
        <circle cx={6} cy={4} r={1.8} fill="#cbd5e1" opacity={0.5} />
        <circle cx={-5} cy={6} r={1.5} fill="#bae6fd" opacity={0.5} />
      </g>
    );

    return (
      <g>
        <defs>
          <clipPath id="clip-floc-basin">
            <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={2} />
          </clipPath>
        </defs>

        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={3}
          fill="var(--hmi-concrete-fill)"
          stroke="var(--hmi-concrete-stroke)"
          strokeWidth={1.6}
        />
        <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={2} fill="#0b131e" />

        <g clipPath="url(#clip-floc-basin)">
          <rect x={innerX} y={waterTop} width={innerW} height={innerY + innerH - waterTop} fill="url(#hmi-water-floc)" />
          <AnimatedWaterWave
            x={innerX - 6}
            y={waterTop}
            width={innerW + 24}
            strokeColor="#7dd3fc"
            animate={animationsEnabled && (isFlowing || stage1Running || stage2Running)}
          />

          {/* Center concrete underflow baffle wall */}
          <rect
            x={midX - 3}
            y={innerY}
            width={6}
            height={innerH - 24}
            fill="var(--hmi-concrete-fill)"
            stroke="var(--hmi-concrete-stroke)"
            strokeWidth={0.9}
          />
          {/* Underflow passage arrow */}
          {isFlowing && (
            <path
              d={`M ${midX - 18},${innerY + innerH - 12} Q ${midX},${innerY + innerH - 6} ${midX + 18},${innerY + innerH - 12}`}
              fill="none"
              stroke="#bae6fd"
              strokeWidth={1.8}
              strokeDasharray="4,4"
              className={animationsEnabled ? 'hmi-flow-dash' : undefined}
              style={animationsEnabled ? { animationDuration: '1.8s' } : undefined}
            />
          )}

          {/* Circulating floc particles in stage 1 and stage 2 */}
          {flocCluster(innerX + 26, waterTop + 34, stage1Running, '0s')}
          {flocCluster(innerX + 62, waterTop + 62, stage1Running, '-1.4s')}
          {flocCluster(midX + 26, waterTop + 36, stage2Running, '-0.7s')}
          {flocCluster(midX + 64, waterTop + 66, stage2Running, '-2.1s')}
        </g>

        <text x={innerX + innerW * 0.25} y={y + height - 10} textAnchor="middle" fill="#e2e8f0" fontSize={7.5} fontFamily="var(--mono)" opacity={0.85}>
          STAGE 1
        </text>
        <text x={innerX + innerW * 0.75} y={y + height - 10} textAnchor="middle" fill="#e2e8f0" fontSize={7.5} fontFamily="var(--mono)" opacity={0.85}>
          STAGE 2
        </text>
      </g>
    );
  }
);

export interface ClarifierVesselProps {
  x: number;
  y: number;
  width: number;
  height: number;
  eq?: EquipmentState;
  statusColor: string;
  isAlarmed: boolean;
  levelRatio: number;
  isFlowing: boolean;
  animationsEnabled: boolean;
  onSelect: (id: string) => void;
  onHover: (info: HoverPayload | null) => void;
}

export const ClarifierVessel: React.FC<ClarifierVesselProps> = memo(
  ({ x, y, width, height, eq, statusColor, isAlarmed, levelRatio, isFlowing, animationsEnabled, onSelect, onHover }) => {
    const cx = x + width / 2;
    const cylBottom = y + Math.round(height * 0.62);
    const coneBottomY = y + height;
    const innerLeft = x + 7;
    const innerRight = x + width - 7;
    const innerTop = y + 6;
    const innerConeL = cx - 18;
    const innerConeR = cx + 18;
    const innerBottomY = coneBottomY - 6;

    const waterSpan = innerBottomY - (innerTop + 14);
    const waterTop = innerBottomY - waterSpan * Math.max(0.25, levelRatio);
    const scraperRunning = isEquipmentRunning(eq);
    const animateScraper = scraperRunning && animationsEnabled;
    const animateSettling = isFlowing && animationsEnabled;

    const outerPoly = `${x},${y} ${x + width},${y} ${x + width},${cylBottom} ${cx + 22},${coneBottomY} ${cx - 22},${coneBottomY} ${x},${cylBottom}`;
    const innerPoly = `${innerLeft},${innerTop} ${innerRight},${innerTop} ${innerRight},${cylBottom} ${innerConeR},${innerBottomY} ${innerConeL},${innerBottomY} ${innerLeft},${cylBottom}`;

    return (
      <g
        {...clickableVesselProps({
          id: 'CLR-401',
          eq,
          x: cx,
          y,
          title: 'Gravity Clarifier & Scraper',
          detail: `State: ${eq?.state || 'N/A'} | Runtime: ${eq?.runtime_hours.toFixed(1) ?? '0.0'}h`,
          onSelect,
          onHover,
        })}
      >
        <defs>
          <clipPath id="clip-clarifier-inner">
            <polygon points={innerPoly} />
          </clipPath>
        </defs>

        {/* Concrete clarifier shell */}
        <polygon
          points={outerPoly}
          fill="var(--hmi-concrete-fill)"
          stroke={isAlarmed ? '#ef4444' : statusColor}
          strokeWidth={isAlarmed ? 2 : 1.6}
        />
        <polygon points={innerPoly} fill="#0a121d" />

        <g clipPath="url(#clip-clarifier-inner)">
          {/* Clarified water fill */}
          <rect x={innerLeft} y={waterTop} width={innerRight - innerLeft} height={innerBottomY - waterTop} fill="url(#hmi-water-clarifier)" />
          <AnimatedWaterWave
            x={innerLeft - 6}
            y={waterTop}
            width={innerRight - innerLeft + 24}
            strokeColor="#7dd3fc"
            animate={animationsEnabled && isFlowing}
          />

          {/* Sludge blanket in bottom hopper cone */}
          <path
            d={`M ${innerLeft + 18},${cylBottom + 18} Q ${cx},${cylBottom + 12} ${innerRight - 18},${cylBottom + 18} L ${innerConeR},${innerBottomY} L ${innerConeL},${innerBottomY} Z`}
            fill="#4c3829"
            opacity={0.92}
          />

          {/* Falling floc particles settling toward sludge blanket */}
          {isFlowing &&
            [-54, -36, 36, 54].map((dx, i) => (
              <circle
                key={i}
                cx={cx + dx}
                cy={waterTop + 18 + (i % 2) * 12}
                r={1.7}
                fill="#d6ccc2"
                className={animateSettling ? 'hmi-floc-settle' : undefined}
                style={animateSettling ? { animationDuration: `${3.6 + i * 0.45}s`, animationDelay: `${-i * 0.9}s` } : undefined}
              />
            ))}

          {/* Peripheral overflow launder troughs */}
          <rect x={innerLeft} y={innerTop + 10} width={16} height={11} fill="#1e293b" stroke="#64748b" strokeWidth={0.9} />
          <rect x={innerRight - 16} y={innerTop + 10} width={16} height={11} fill="#1e293b" stroke="#64748b" strokeWidth={0.9} />

          {/* Central influent feedwell drum */}
          <rect x={cx - 17} y={innerTop + 8} width={34} height={46} fill="rgba(15, 23, 42, 0.68)" stroke="#94a3b8" strokeWidth={1.3} />

          {/* Rotating scraper shaft + angled bottom truss blades */}
          <line x1={cx} y1={innerTop} x2={cx} y2={innerBottomY - 6} stroke="#cbd5e1" strokeWidth={3} />
          <g transform={`translate(${cx}, ${cylBottom + 18})`}>
            <g className={animateScraper ? 'hmi-scraper-sweep' : undefined}>
              <circle cx={0} cy={0} r={58} fill="transparent" stroke="none" pointerEvents="none" />
              <line x1={-56} y1={-12} x2={-14} y2={16} stroke="#e2e8f0" strokeWidth={2.2} />
              <line x1={56} y1={-12} x2={14} y2={16} stroke="#e2e8f0" strokeWidth={2.2} />
              <line x1={-52} y1={-4} x2={52} y2={-4} stroke="#94a3b8" strokeWidth={1.3} strokeDasharray="4,3" />
              <polygon points="-56,-12 -46,-12 -48,-4 -56,-5" fill="#cbd5e1" />
              <polygon points="56,-12 46,-12 48,-4 56,-5" fill="#94a3b8" />
            </g>
          </g>
        </g>

        {/* Overhead bridge truss & drive motor */}
        <rect x={x + 12} y={y - 5} width={width - 24} height={7} rx={1.5} fill="var(--hmi-metal-mid)" stroke="var(--hmi-metal-stroke)" strokeWidth={1} />
        <rect
          x={cx - 11}
          y={y - 20}
          width={22}
          height={16}
          rx={2}
          fill="url(#hmi-metal-h)"
          stroke={scraperRunning ? '#22c55e' : 'var(--hmi-metal-stroke)'}
          strokeWidth={1.2}
        />
        <circle cx={cx + 7} cy={y - 14} r={2.3} fill={scraperRunning ? '#22c55e' : '#ef4444'} />

        {/* Tag pill */}
        <rect x={cx - 32} y={y + 22} width={64} height={15} rx={3} fill="rgba(2, 6, 23, 0.8)" stroke="var(--hmi-card-border)" strokeWidth={0.8} />
        <text x={cx} y={y + 32.5} textAnchor="middle" fill="#e2e8f0" fontSize={8} fontFamily="var(--mono)" fontWeight="bold">
          CLR-401
        </text>
      </g>
    );
  }
);

export interface DualMediaFilterVesselProps {
  x: number;
  y: number;
  width: number;
  height: number;
  eq?: EquipmentState;
  statusColor: string;
  isAlarmed: boolean;
  mode: FilterVisualMode;
  animationsEnabled: boolean;
  onSelect: (id: string) => void;
  onHover: (info: HoverPayload | null) => void;
}

export const DualMediaFilterVessel: React.FC<DualMediaFilterVesselProps> = memo(
  ({ x, y, width, height, eq, statusColor, isAlarmed, mode, animationsEnabled, onSelect, onHover }) => {
    const innerX = x + 7;
    const innerY = y + 6;
    const innerW = width - 14;
    const innerH = height - 12;
    const cx = x + width / 2;

    const waterY = innerY + 10;
    const anthY = innerY + 46;
    const sandY = innerY + 78;
    const gravelY = innerY + 110;
    const plenumY = innerY + 126;

    const bubbleXs = [-72, -56, -40, -24, -10, 8, 22, 38, 52, 68, -64, -16, 16, 60];

    const statePillColor = mode.isFault
      ? '#ef4444'
      : mode.isAirScour || mode.isBackwashWater || mode.isRinse
        ? '#f59e0b'
        : '#22c55e';

    return (
      <g
        {...clickableVesselProps({
          id: 'FLT-501',
          eq,
          x: cx,
          y,
          title: 'Dual-Media Gravity Filter',
          detail: `State: ${eq?.state || 'N/A'} | Mode: ${eq?.control_mode || 'N/A'}`,
          onSelect,
          onHover,
        })}
      >
        <defs>
          <clipPath id="clip-filter-inner">
            <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={2} />
          </clipPath>
        </defs>

        {/* Concrete filter box */}
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={3}
          fill="var(--hmi-concrete-fill)"
          stroke={isAlarmed ? '#ef4444' : statusColor}
          strokeWidth={isAlarmed ? 2 : 1.7}
        />
        <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={2} fill="#0a121d" />

        <g clipPath="url(#clip-filter-inner)">
          {/* Supernatant water above media */}
          <rect x={innerX} y={waterY} width={innerW} height={anthY - waterY} fill="url(#hmi-water-clarifier)" />
          <AnimatedWaterWave
            x={innerX - 6}
            y={waterY}
            width={innerW + 24}
            strokeColor="#7dd3fc"
            animate={animationsEnabled && (mode.isFiltering || mode.isBackwashWater || mode.isAirScour || mode.isRinse)}
          />

          {/* Washwater collection trough */}
          <path
            d={`M ${cx - 56},${waterY + 2} L ${cx + 56},${waterY + 2} L ${cx + 50},${waterY + 13} L ${cx - 50},${waterY + 13} Z`}
            fill="#1e293b"
            stroke="#94a3b8"
            strokeWidth={1.1}
          />
          <text x={cx} y={waterY + 10.5} textAnchor="middle" fill="#cbd5e1" fontSize={6.5} fontFamily="var(--mono)">
            BACKWASH TROUGH
          </text>

          {/* Media Bed 1: Anthracite Coal */}
          <rect x={innerX} y={anthY} width={innerW} height={sandY - anthY} fill="url(#hmi-pat-anthracite)" />
          <rect x={innerX} y={anthY} width={innerW} height={sandY - anthY} fill="rgba(15, 23, 42, 0.35)" />

          {/* Media Bed 2: Silica Sand */}
          <rect x={innerX} y={sandY} width={innerW} height={gravelY - sandY} fill="url(#hmi-pat-sand)" />

          {/* Media Bed 3: Support Gravel & Underdrain Nozzles */}
          <rect x={innerX} y={gravelY} width={innerW} height={plenumY - gravelY} fill="url(#hmi-pat-gravel)" />
          <line x1={innerX} y1={plenumY} x2={innerX + innerW} y2={plenumY} stroke="#94a3b8" strokeWidth={2} />
          {[-72, -48, -24, 0, 24, 48, 72].map((dx) => (
            <rect key={dx} x={cx + dx - 3} y={plenumY - 4} width={6} height={4} rx={1} fill="#cbd5e1" />
          ))}

          {/* Filtered effluent underdrain plenum */}
          <rect x={innerX} y={plenumY + 1} width={innerW} height={innerY + innerH - plenumY - 1} fill="url(#hmi-water-clean)" />

          {/* Layer labels on left */}
          <text x={innerX + 6} y={anthY + 12} fill="#e2e8f0" fontSize={6.8} fontFamily="var(--mono)" opacity={0.9}>
            ANTHRACITE
          </text>
          <text x={innerX + 6} y={sandY + 12} fill="#0f172a" fontSize={6.8} fontFamily="var(--mono)" fontWeight="bold" opacity={0.88}>
            SILICA SAND
          </text>
          <text x={innerX + 6} y={gravelY + 11} fill="#f8fafc" fontSize={6.5} fontFamily="var(--mono)" opacity={0.85}>
            GRAVEL / NOZZLES
          </text>

          {/* PROCESS ANIMATION 1: Normal filtration percolation downward */}
          {(mode.isFiltering || mode.isRinse) &&
            [-64, -36, -10, 18, 46, 72].map((dx, i) => (
              <line
                key={i}
                x1={cx + dx}
                y1={waterY + 16}
                x2={cx + dx}
                y2={plenumY + 8}
                stroke={mode.isRinse ? '#bae6fd' : '#38bdf8'}
                strokeWidth={2}
                strokeDasharray="5 13"
                opacity={0.78}
                className={animationsEnabled ? 'hmi-seep-down' : undefined}
                style={animationsEnabled ? { animationDuration: mode.isRinse ? '2.4s' : '1.5s', animationDelay: `${-i * 0.28}s` } : undefined}
              />
            ))}

          {/* PROCESS ANIMATION 2: Air Scour rising bubbles */}
          {mode.isAirScour &&
            bubbleXs.map((dx, i) => (
              <circle
                key={i}
                cx={cx + dx}
                cy={plenumY - 2}
                r={i % 3 === 0 ? 3.2 : 2.3}
                fill="#e0f2fe"
                stroke="#38bdf8"
                strokeWidth={0.7}
                className={animationsEnabled ? 'hmi-bubble-rise' : undefined}
                style={
                  animationsEnabled
                    ? {
                        animationDuration: `${1.05 + (i % 4) * 0.22}s`,
                        animationDelay: `${-(i * 0.17).toFixed(2)}s`,
                      }
                    : undefined
                }
              />
            ))}

          {/* PROCESS ANIMATION 3: Backwash water rushing upward */}
          {mode.isBackwashWater &&
            [-68, -44, -20, 4, 28, 52, 74].map((dx, i) => (
              <line
                key={i}
                x1={cx + dx}
                y1={plenumY + 6}
                x2={cx + dx}
                y2={waterY + 14}
                stroke="#bae6fd"
                strokeWidth={2.5}
                strokeDasharray="7 15"
                opacity={0.9}
                className={animationsEnabled ? 'hmi-wash-up' : undefined}
                style={animationsEnabled ? { animationDelay: `${-i * 0.14}s` } : undefined}
              />
            ))}
        </g>

        {/* Top status & tag header */}
        <rect x={x + 8} y={y - 12} width={width - 16} height={16} rx={3} fill="var(--hmi-card-bg)" stroke={statePillColor} strokeWidth={1.1} />
        <text x={x + 16} y={y - 1} fill="var(--pid-label)" fontSize={8} fontFamily="var(--mono)" fontWeight="bold">
          FLT-501
        </text>
        <text x={x + width - 16} y={y - 1} textAnchor="end" fill={statePillColor} fontSize={7.8} fontFamily="var(--mono)" fontWeight="bold">
          {mode.statusLabel}
        </text>
      </g>
    );
  }
);

export interface ContactBasinVesselProps {
  x: number;
  y: number;
  width: number;
  height: number;
  eq?: EquipmentState;
  statusColor: string;
  levelRatio: number;
  isFlowing: boolean;
  cl2DosingActive: boolean;
  animationsEnabled: boolean;
  onSelect: (id: string) => void;
  onHover: (info: HoverPayload | null) => void;
}

export const ContactBasinVessel: React.FC<ContactBasinVesselProps> = memo(
  ({ x, y, width, height, eq, statusColor, levelRatio, isFlowing, cl2DosingActive, animationsEnabled, onSelect, onHover }) => {
    const innerX = x + 6;
    const innerY = y + 6;
    const innerW = width - 12;
    const innerH = height - 12;
    const waterH = Math.max(innerH * 0.3, innerH * levelRatio);
    const waterTop = innerY + innerH - waterH;
    const animate = animationsEnabled && isFlowing;

    const b1X = innerX + Math.round(innerW * 0.28);
    const b2X = innerX + Math.round(innerW * 0.54);
    const b3X = innerX + Math.round(innerW * 0.78);

    const serpentinePath = `M ${innerX + 8},${waterTop + 14} L ${b1X - 10},${waterTop + 14} L ${b1X - 10},${innerY + innerH - 12} L ${b2X - 10},${innerY + innerH - 12} L ${b2X - 10},${waterTop + 16} L ${b3X - 10},${waterTop + 16} L ${b3X - 10},${innerY + innerH - 12} L ${innerX + innerW - 8},${innerY + innerH - 12}`;

    return (
      <g
        {...clickableVesselProps({
          id: 'TNK-601',
          eq,
          x: x + width / 2,
          y,
          title: 'Chlorine Contact Basin',
          detail: `State: ${eq?.state || 'IN_SERVICE'} | Serpentine Disinfection Contact`,
          onSelect,
          onHover,
        })}
      >
        <defs>
          <clipPath id="clip-contact-basin">
            <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={2} />
          </clipPath>
        </defs>

        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={3}
          fill="var(--hmi-concrete-fill)"
          stroke={statusColor}
          strokeWidth={1.6}
        />
        <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={2} fill="#0a121d" />

        <g clipPath="url(#clip-contact-basin)">
          <rect x={innerX} y={waterTop} width={innerW} height={waterH} fill="url(#hmi-water-clean)" />
          <AnimatedWaterWave
            x={innerX - 6}
            y={waterTop}
            width={innerW + 24}
            strokeColor="#bae6fd"
            animate={animate}
          />

          {/* Lime-yellow chlorine mixing cloud at inlet when dosing active */}
          {cl2DosingActive && (
            <ellipse
              cx={innerX + 20}
              cy={waterTop + 16}
              rx={16}
              ry={9}
              fill="#a3e635"
              opacity={0.3}
              className={animate ? 'hmi-vortex-pulse' : undefined}
            />
          )}

          {/* Alternating serpentine concrete baffle walls */}
          <rect x={b1X} y={innerY} width={5} height={innerH - 22} fill="var(--hmi-concrete-fill)" />
          <rect x={b2X} y={innerY + 22} width={5} height={innerH - 22} fill="var(--hmi-concrete-fill)" />
          <rect x={b3X} y={innerY} width={5} height={innerH - 22} fill="var(--hmi-concrete-fill)" />

          {/* Serpentine animated flow streamline */}
          {isFlowing && (
            <path
              d={serpentinePath}
              fill="none"
              stroke="#e0f2fe"
              strokeWidth={2.2}
              strokeDasharray="8 16"
              strokeLinejoin="round"
              opacity={0.85}
              className={animate ? 'hmi-flow-dash' : undefined}
              style={animate ? { animationDuration: '1.8s' } : undefined}
            />
          )}
        </g>

        <rect x={x + 14} y={y + height - 18} width={width - 28} height={13} rx={2} fill="rgba(2, 6, 23, 0.76)" />
        <text x={x + width / 2} y={y + height - 8.5} textAnchor="middle" fill="#e2e8f0" fontSize={7.5} fontFamily="var(--mono)" fontWeight="bold">
          TNK-601 CONTACT BASIN
        </text>
      </g>
    );
  }
);

export interface ClearWaterTankVesselProps {
  x: number;
  y: number;
  width: number;
  height: number;
  eq?: EquipmentState;
  statusColor: string;
  levelRatio: number;
  isFlowing: boolean;
  animationsEnabled: boolean;
  onSelect: (id: string) => void;
  onHover: (info: HoverPayload | null) => void;
}

export const ClearWaterTankVessel: React.FC<ClearWaterTankVesselProps> = memo(
  ({ x, y, width, height, eq, statusColor, levelRatio, isFlowing, animationsEnabled, onSelect, onHover }) => {
    const innerX = x + 8;
    const innerY = y + 8;
    const innerW = width - 16;
    const innerH = height - 14;
    const fillH = innerH * levelRatio;
    const fillTop = innerY + innerH - fillH;
    const cx = x + width / 2;

    return (
      <g
        {...clickableVesselProps({
          id: 'TNK-701',
          eq,
          x: cx,
          y,
          title: 'Clear Water Reservoir',
          detail: `State: ${eq?.state || 'IN_SERVICE'} | Treated Potable Storage`,
          onSelect,
          onHover,
        })}
      >
        <defs>
          <clipPath id="clip-clear-water">
            <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={3} />
          </clipPath>
        </defs>

        {/* Domed reservoir roof + vent */}
        <path
          d={`M ${x + 2},${y} Q ${cx},${y - 22} ${x + width - 2},${y} Z`}
          fill="var(--hmi-metal-mid)"
          stroke={statusColor}
          strokeWidth={1.5}
        />
        <path d={`M ${cx + 22},${y - 10} L ${cx + 22},${y - 18} L ${cx + 28},${y - 18}`} fill="none" stroke="var(--hmi-metal-light)" strokeWidth={2} />

        {/* Concrete / steel cylindrical tank shell */}
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={3}
          fill="var(--hmi-concrete-fill)"
          stroke={statusColor}
          strokeWidth={1.7}
        />

        {/* Cutaway inspection window */}
        <rect x={innerX} y={innerY} width={innerW} height={innerH} rx={3} fill="#071521" stroke="var(--hmi-metal-light)" strokeWidth={1} />

        <g clipPath="url(#clip-clear-water)">
          {fillH > 0 && (
            <>
              <rect x={innerX} y={fillTop} width={innerW} height={fillH} fill="url(#hmi-water-clear)" />
              <AnimatedWaterWave
                x={innerX - 6}
                y={fillTop}
                width={innerW + 24}
                strokeColor="#e0f2fe"
                animate={animationsEnabled && isFlowing}
              />
            </>
          )}
        </g>

        {/* Exterior steel maintenance ladder on left edge */}
        <line x1={x - 5} y1={y + 4} x2={x - 5} y2={y + height} stroke="var(--hmi-metal-light)" strokeWidth={1.4} />
        <line x1={x + 1} y1={y + 4} x2={x + 1} y2={y + height} stroke="var(--hmi-metal-light)" strokeWidth={1.4} />
        {[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((r, i) => (
          <line key={i} x1={x - 5} y1={y + height * r} x2={x + 1} y2={y + height * r} stroke="var(--hmi-metal-light)" strokeWidth={1.2} />
        ))}

        {/* Sight ticks */}
        {[0.25, 0.5, 0.75].map((r, i) => (
          <line
            key={i}
            x1={innerX + innerW - 9}
            y1={innerY + innerH * r}
            x2={innerX + innerW - 2}
            y2={innerY + innerH * r}
            stroke="rgba(226, 232, 240, 0.6)"
            strokeWidth={1}
          />
        ))}

        <rect x={x + 10} y={y + height - 20} width={width - 20} height={14} rx={2} fill="rgba(2, 6, 23, 0.76)" />
        <text x={cx} y={y + height - 10} textAnchor="middle" fill="#e2e8f0" fontSize={7.8} fontFamily="var(--mono)" fontWeight="bold">
          TNK-701 CLEAR
        </text>
      </g>
    );
  }
);

export interface SludgeTankVesselProps {
  x: number;
  y: number;
  width: number;
  height: number;
  eq?: EquipmentState;
  statusColor: string;
  levelRatio: number;
  levelPctText: string;
  isFlowing: boolean;
  animationsEnabled: boolean;
  onSelect: (id: string) => void;
  onHover: (info: HoverPayload | null) => void;
}

export const SludgeTankVessel: React.FC<SludgeTankVesselProps> = memo(
  ({ x, y, width, height, eq, statusColor, levelRatio, levelPctText, isFlowing, animationsEnabled, onSelect, onHover }) => {
    const cx = x + width / 2;
    const cylH = Math.round(height * 0.68);
    const cylBottom = y + cylH;
    const coneBottom = y + height - 14;
    const innerL = x + 6;
    const innerR = x + width - 6;
    const innerT = y + 6;
    const innerBottom = coneBottom - 5;
    const fillSpan = innerBottom - innerT;
    const fillTop = innerBottom - fillSpan * levelRatio;

    const outerPoly = `${x},${y} ${x + width},${y} ${x + width},${cylBottom} ${cx + 16},${coneBottom} ${cx - 16},${coneBottom} ${x},${cylBottom}`;
    const innerPoly = `${innerL},${innerT} ${innerR},${innerT} ${innerR},${cylBottom} ${cx + 12},${innerBottom} ${cx - 12},${innerBottom} ${innerL},${cylBottom}`;

    return (
      <g
        {...clickableVesselProps({
          id: 'TNK-801',
          eq,
          x: cx,
          y,
          title: 'Sludge Holding Tank',
          detail: `State: ${eq?.state || 'IN_SERVICE'} | Level: ${levelPctText}`,
          onSelect,
          onHover,
        })}
      >
        <defs>
          <clipPath id="clip-sludge-inner">
            <polygon points={innerPoly} />
          </clipPath>
        </defs>

        {/* Structural support legs */}
        <rect x={x + 8} y={cylBottom - 2} width={6} height={height - cylH + 2} fill="var(--hmi-metal-mid)" stroke="var(--hmi-metal-stroke)" strokeWidth={0.9} />
        <rect x={x + width - 14} y={cylBottom - 2} width={6} height={height - cylH + 2} fill="var(--hmi-metal-mid)" stroke="var(--hmi-metal-stroke)" strokeWidth={0.9} />
        <rect x={x + 3} y={y + height - 2} width={width - 6} height={4} rx={1} fill="var(--hmi-concrete-dark)" />

        {/* Conical steel tank shell */}
        <polygon points={outerPoly} fill="url(#hmi-metal-v)" stroke={statusColor} strokeWidth={1.6} />
        <polygon points={innerPoly} fill="#14110f" />

        <g clipPath="url(#clip-sludge-inner)">
          {levelRatio > 0 && (
            <>
              <rect x={innerL} y={fillTop} width={innerR - innerL} height={innerBottom - fillTop} fill="url(#hmi-sludge)" />
              <AnimatedWaterWave
                x={innerL - 6}
                y={fillTop}
                width={innerR - innerL + 24}
                strokeColor="#a8998e"
                animate={animationsEnabled && isFlowing}
              />
            </>
          )}
        </g>

        <rect x={x + 12} y={y + 10} width={width - 24} height={24} rx={2} fill="rgba(2, 6, 23, 0.78)" />
        <text x={cx} y={y + 21} textAnchor="middle" fill="#e2e8f0" fontSize={8} fontFamily="var(--mono)" fontWeight="bold">
          TNK-801
        </text>
        <text x={cx} y={y + 31} textAnchor="middle" fill="#d6ccc2" fontSize={7.5} fontFamily="var(--mono)" fontWeight="bold">
          {levelPctText}
        </text>
      </g>
    );
  }
);
