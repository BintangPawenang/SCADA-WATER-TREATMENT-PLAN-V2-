import React, { memo } from 'react';
import { EquipmentState } from '../../types';
import { isEquipmentRunning } from './processAnimation';

export interface HoverPayload {
  x: number;
  y: number;
  title: string;
  detail: string;
  hint?: string;
}

export interface RealisticEqBaseProps {
  x: number;
  y: number;
  id: string;
  eq?: EquipmentState;
  statusColor: string;
  isAlarmed: boolean;
  animationsEnabled: boolean;
  onSelect: (id: string) => void;
  onHover: (info: HoverPayload | null) => void;
}

function getLedColor(eq: EquipmentState | undefined, statusColor: string, isAlarmed: boolean): string {
  if (isAlarmed || eq?.state === 'FAULT' || eq?.state === 'TRAVEL_FAULT' || eq?.state === 'COMM_LOSS') {
    return '#ef4444';
  }
  if (
    eq?.state === 'MAINTENANCE' ||
    eq?.state === 'STARTING' ||
    eq?.state === 'STOPPING' ||
    eq?.state === 'OPENING' ||
    eq?.state === 'CLOSING'
  ) {
    return '#f59e0b';
  }
  if (eq?.state === 'RUNNING' || eq?.state === 'OPEN' || eq?.state === 'IN_SERVICE') {
    return '#22c55e';
  }
  return statusColor;
}

function eqInteractionProps(
  id: string,
  eq: EquipmentState | undefined,
  x: number,
  y: number,
  subtitle: string,
  extraDetail: string,
  onSelect: (id: string) => void,
  onHover: (info: HoverPayload | null) => void
) {
  return {
    className: 'hmi-interactive',
    style: { cursor: 'pointer' },
    tabIndex: 0,
    role: 'button' as const,
    'aria-label': `${id} ${eq?.name || subtitle} ${eq?.state || ''}`,
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
        y: y - 34,
        title: `${id} — ${eq?.name || subtitle}`,
        detail: `State: ${eq?.state || 'N/A'} | Mode: ${eq?.control_mode || 'N/A'}${extraDetail}`,
        hint: 'Click to open control faceplate',
      }),
    onMouseLeave: () => onHover(null),
  };
}

export const CentrifugalPump25D: React.FC<RealisticEqBaseProps> = memo(
  ({ x, y, id, eq, statusColor, isAlarmed, animationsEnabled, onSelect, onHover }) => {
    const running = isEquipmentRunning(eq);
    const animate = running && animationsEnabled;
    const led = getLedColor(eq, statusColor, isAlarmed);

    return (
      <g
        transform={`translate(${x},${y})`}
        {...eqInteractionProps(
          id,
          eq,
          x,
          y,
          'Centrifugal Pump',
          ` | Runtime: ${eq?.runtime_hours.toFixed(1) ?? '0.0'}h`,
          onSelect,
          onHover
        )}
      >
        {/* Invisible hit box for easy clicking */}
        <rect x={-30} y={-24} width={60} height={60} fill="transparent" />

        {/* Baseplate skid */}
        <rect
          x={-26}
          y={13}
          width={52}
          height={6}
          rx={1.5}
          fill="var(--hmi-metal-dark)"
          stroke="var(--hmi-metal-stroke)"
          strokeWidth={1}
        />

        {/* TEFC Electric Motor on right side */}
        <rect
          x={5}
          y={-12}
          width={21}
          height={23}
          rx={2.5}
          fill="url(#hmi-metal-v)"
          stroke="var(--hmi-metal-stroke)"
          strokeWidth={1.2}
        />
        {/* Motor cooling fins */}
        {[-7, -3, 1, 5, 9].map((fy) => (
          <line key={fy} x1={8} y1={fy} x2={23} y2={fy} stroke="var(--hmi-metal-dark)" strokeWidth={1.1} />
        ))}
        {/* Motor terminal box + LED */}
        <rect
          x={10}
          y={-17}
          width={10}
          height={5}
          rx={1}
          fill="var(--hmi-metal-mid)"
          stroke="var(--hmi-metal-stroke)"
          strokeWidth={0.9}
        />
        <circle cx={21} cy={-8} r={2.6} fill={led} stroke="#0f172a" strokeWidth={0.7} />

        {/* Shaft coupling */}
        <rect x={1} y={-4} width={5} height={8} fill="var(--hmi-metal-light)" stroke="var(--hmi-metal-stroke)" strokeWidth={0.8} />

        {/* Suction (left) & discharge (right) nozzle collars for seamless inline piping */}
        <rect x={-28} y={-5} width={6} height={10} rx={1} fill="var(--hmi-metal-mid)" stroke="var(--hmi-metal-stroke)" strokeWidth={1} />
        <rect x={22} y={-5} width={6} height={10} rx={1} fill="var(--hmi-metal-mid)" stroke="var(--hmi-metal-stroke)" strokeWidth={1} />
        <path
          d="M -8,-14 L 18,-14 Q 24,-14 24,-5"
          fill="none"
          stroke="var(--hmi-metal-mid)"
          strokeWidth={5.5}
          strokeLinecap="round"
        />
        <rect x={-13} y={-18} width={10} height={5} rx={1} fill="var(--hmi-metal-mid)" stroke="var(--hmi-metal-stroke)" strokeWidth={0.9} />

        {/* Volute pump casing */}
        <circle
          cx={-8}
          cy={0}
          r={14.5}
          fill="url(#hmi-metal-v)"
          stroke={isAlarmed ? '#ef4444' : running ? '#38bdf8' : 'var(--hmi-metal-stroke)'}
          strokeWidth={isAlarmed ? 2 : 1.5}
        />

        {/* Cutaway glass window showing impeller */}
        <circle cx={-8} cy={0} r={10.2} fill="#071521" stroke="var(--hmi-metal-light)" strokeWidth={1} />
        <g transform="translate(-8, 0)">
          <g
            className={animate ? 'hmi-spin' : undefined}
            style={animate ? { animationDuration: '0.55s' } : undefined}
          >
            <circle cx={0} cy={0} r={9.5} fill="transparent" stroke="none" pointerEvents="none" />
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <path
                key={deg}
                d="M 0,0 Q 4,-2 8.2,-4.5"
                fill="none"
                stroke={running ? '#38bdf8' : '#64748b'}
                strokeWidth={2}
                strokeLinecap="round"
                transform={`rotate(${deg})`}
              />
            ))}
            <circle cx={0} cy={0} r={2.6} fill="var(--hmi-metal-light)" stroke="#0f172a" strokeWidth={0.8} />
          </g>
        </g>

        {isAlarmed && (
          <circle
            cx={-8}
            cy={0}
            r={18}
            fill="none"
            stroke="#ef4444"
            strokeWidth={1.8}
            strokeDasharray="4,2"
            className={animationsEnabled ? 'hmi-alarm-ring' : undefined}
          />
        )}

        {/* Tag & state label pill */}
        <rect
          x={-27}
          y={21}
          width={54}
          height={15}
          rx={3}
          fill="var(--hmi-card-bg)"
          stroke={isAlarmed ? '#ef4444' : 'var(--hmi-card-border)'}
          strokeWidth={1}
        />
        <text x={0} y={31.5} textAnchor="middle" fill="var(--pid-label)" fontSize={8.5} fontFamily="var(--mono)" fontWeight="bold">
          {id}
        </text>
      </g>
    );
  }
);

export interface DosingPump25DProps extends RealisticEqBaseProps {
  fluidColor?: string;
  labelSide?: 'left' | 'right';
}

export const DosingPump25D: React.FC<DosingPump25DProps> = memo(
  ({ x, y, id, eq, statusColor, isAlarmed, animationsEnabled, fluidColor = '#f59e0b', labelSide = 'right', onSelect, onHover }) => {
    const running = isEquipmentRunning(eq);
    const animate = running && animationsEnabled;
    const led = getLedColor(eq, statusColor, isAlarmed);
    const labelX = labelSide === 'right' ? 35 : -35;

    return (
      <g
        transform={`translate(${x},${y})`}
        {...eqInteractionProps(
          id,
          eq,
          x,
          y,
          'Chemical Dosing Pump',
          ` | Runtime: ${eq?.runtime_hours.toFixed(1) ?? '0.0'}h`,
          onSelect,
          onHover
        )}
      >
        <rect x={-26} y={-22} width={86} height={44} fill="transparent" />

        {/* Vertical check-valve fittings inline with chemical pipe */}
        <rect x={-4} y={-19} width={8} height={6} rx={1} fill="var(--hmi-metal-mid)" stroke="var(--hmi-metal-stroke)" strokeWidth={0.9} />
        <rect x={-4} y={13} width={8} height={6} rx={1} fill="var(--hmi-metal-mid)" stroke="var(--hmi-metal-stroke)" strokeWidth={0.9} />

        {/* Pump motor block on left */}
        <rect
          x={-21}
          y={-11}
          width={15}
          height={22}
          rx={2}
          fill="url(#hmi-metal-v)"
          stroke={isAlarmed ? '#ef4444' : 'var(--hmi-metal-stroke)'}
          strokeWidth={1.1}
        />
        <circle cx={-13.5} cy={-5} r={2.5} fill={led} stroke="#0f172a" strokeWidth={0.7} />

        {/* Diaphragm metering head on centerline */}
        <rect
          x={-6}
          y={-13}
          width={14}
          height={26}
          rx={2}
          fill="var(--hmi-metal-dark)"
          stroke={running ? fluidColor : 'var(--hmi-metal-stroke)'}
          strokeWidth={1.3}
        />
        {/* Pulsing diaphragm chamber window */}
        <rect x={-3} y={-8} width={8} height={16} rx={1.5} fill="#07111e" stroke="var(--hmi-metal-stroke)" strokeWidth={0.7} />
        <rect
          x={-1.5}
          y={-4}
          width={5}
          height={6}
          rx={1}
          fill={running ? fluidColor : '#475569'}
          className={animate ? 'hmi-dosing-pulse' : undefined}
        />

        {isAlarmed && (
          <circle
            cx={-2}
            cy={0}
            r={20}
            fill="none"
            stroke="#ef4444"
            strokeWidth={1.6}
            strokeDasharray="3,2"
            className={animationsEnabled ? 'hmi-alarm-ring' : undefined}
          />
        )}

        {/* Tag & state badge */}
        <g transform={`translate(${labelX}, 0)`}>
          <rect
            x={-26}
            y={-13}
            width={52}
            height={26}
            rx={3}
            fill="var(--hmi-card-bg)"
            stroke={isAlarmed ? '#ef4444' : 'var(--hmi-card-border)'}
            strokeWidth={1}
          />
          <text x={0} y={-2} textAnchor="middle" fill="var(--pid-label)" fontSize={8} fontFamily="var(--mono)" fontWeight="bold">
            {id}
          </text>
          <text x={0} y={9} textAnchor="middle" fill={led} fontSize={7} fontFamily="var(--mono)" fontWeight="bold">
            {eq?.state || '--'}
          </text>
        </g>
      </g>
    );
  }
);

export const AirBlower25D: React.FC<RealisticEqBaseProps> = memo(
  ({ x, y, id, eq, statusColor, isAlarmed, animationsEnabled, onSelect, onHover }) => {
    const running = isEquipmentRunning(eq);
    const animate = running && animationsEnabled;
    const led = getLedColor(eq, statusColor, isAlarmed);

    return (
      <g
        transform={`translate(${x},${y})`}
        {...eqInteractionProps(
          id,
          eq,
          x,
          y,
          'Air Scour Blower',
          ` | Runtime: ${eq?.runtime_hours.toFixed(1) ?? '0.0'}h`,
          onSelect,
          onHover
        )}
      >
        <rect x={-26} y={-22} width={52} height={60} fill="transparent" />

        {/* Acoustic skid base */}
        <rect x={-22} y={13} width={44} height={6} rx={1.5} fill="var(--hmi-metal-dark)" stroke="var(--hmi-metal-stroke)" strokeWidth={1} />

        {/* Air discharge neck going upward */}
        <rect x={-5} y={-22} width={10} height={8} fill="var(--hmi-metal-mid)" stroke="var(--hmi-metal-stroke)" strokeWidth={1} />

        {/* Blower spiral volute */}
        <circle
          cx={0}
          cy={0}
          r={15.5}
          fill="url(#hmi-metal-v)"
          stroke={isAlarmed ? '#ef4444' : running ? '#38bdf8' : 'var(--hmi-metal-stroke)'}
          strokeWidth={1.6}
        />
        <circle cx={0} cy={0} r={11.5} fill="#0b1523" stroke="var(--hmi-metal-light)" strokeWidth={1} />

        {/* 8-blade blower fan centered at (0,0) */}
        <g
          className={animate ? 'hmi-spin' : undefined}
          style={animate ? { animationDuration: '0.4s' } : undefined}
        >
          <circle cx={0} cy={0} r={10.5} fill="transparent" stroke="none" pointerEvents="none" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line
              key={deg}
              x1={0}
              y1={0}
              x2={9.5}
              y2={0}
              stroke={running ? '#bae6fd' : '#64748b'}
              strokeWidth={1.8}
              strokeLinecap="round"
              transform={`rotate(${deg})`}
            />
          ))}
          <circle cx={0} cy={0} r={3} fill="var(--hmi-metal-light)" />
        </g>

        {/* Status LED */}
        <circle cx={14} cy={-12} r={2.8} fill={led} stroke="#0f172a" strokeWidth={0.8} />

        {isAlarmed && (
          <circle
            cx={0}
            cy={0}
            r={19}
            fill="none"
            stroke="#ef4444"
            strokeWidth={1.8}
            strokeDasharray="3,2"
            className={animationsEnabled ? 'hmi-alarm-ring' : undefined}
          />
        )}

        <rect
          x={-27}
          y={21}
          width={54}
          height={15}
          rx={3}
          fill="var(--hmi-card-bg)"
          stroke={isAlarmed ? '#ef4444' : 'var(--hmi-card-border)'}
          strokeWidth={1}
        />
        <text x={0} y={31.5} textAnchor="middle" fill="var(--pid-label)" fontSize={8.5} fontFamily="var(--mono)" fontWeight="bold">
          {id}
        </text>
      </g>
    );
  }
);

export interface ActuatedValve25DProps extends RealisticEqBaseProps {
  orientation?: 'horizontal' | 'vertical';
  openPct: number;
  showPctBadge?: boolean;
}

export const ActuatedValve25D: React.FC<ActuatedValve25DProps> = memo(
  ({ x, y, id, eq, statusColor, isAlarmed, animationsEnabled, orientation = 'horizontal', openPct, showPctBadge = false, onSelect, onHover }) => {
    const led = getLedColor(eq, statusColor, isAlarmed);
    const clampedPct = Math.max(0, Math.min(100, openPct));
    const isOpen = clampedPct > 2;
    // Gate plugs throat at 0% (height 12) and retracts completely upward at 100%
    const gateCoverage = ((100 - clampedPct) / 100) * 12;
    const isVertical = orientation === 'vertical';

    return (
      <g
        transform={`translate(${x},${y})`}
        {...eqInteractionProps(
          id,
          eq,
          x,
          y,
          'Motorized Valve',
          ` | Position: ${clampedPct}%`,
          onSelect,
          onHover
        )}
      >
        <rect x={-24} y={-32} width={48} height={58} fill="transparent" />

        <g transform={isVertical ? 'rotate(-90)' : undefined}>
          {/* Pipe flanges */}
          <rect x={-16} y={-8} width={4} height={16} rx={1} fill="var(--hmi-metal-light)" stroke="var(--hmi-pipe-outer)" strokeWidth={0.9} />
          <rect x={12} y={-8} width={4} height={16} rx={1} fill="var(--hmi-metal-light)" stroke="var(--hmi-pipe-outer)" strokeWidth={0.9} />

          {/* Cast iron valve body */}
          <polygon
            points="-12,-7 12,-7 12,7 -12,7"
            fill="url(#hmi-metal-v)"
            stroke="var(--hmi-metal-stroke)"
            strokeWidth={1.1}
          />

          {/* Cutaway throat showing live gate position */}
          <rect x={-6} y={-6} width={12} height={12} rx={1} fill={isOpen ? '#0284c7' : '#0f172a'} stroke="var(--hmi-metal-stroke)" strokeWidth={0.7} />
          {gateCoverage > 0.4 && (
            <rect
              x={-5.5}
              y={-6}
              width={11}
              height={gateCoverage}
              fill={isOpen ? '#f59e0b' : '#ef4444'}
              opacity={0.9}
            />
          )}

          {/* Valve bonnet + rising stem */}
          <rect x={-4} y={-14} width={8} height={7} fill="var(--hmi-metal-mid)" stroke="var(--hmi-metal-stroke)" strokeWidth={0.9} />
          <line
            x1={0}
            y1={-14}
            x2={0}
            y2={-22 - (clampedPct / 100) * 4}
            stroke="#e2e8f0"
            strokeWidth={2}
          />

          {/* Electric actuator housing */}
          <rect
            x={-11}
            y={-28}
            width={22}
            height={12}
            rx={2}
            fill="var(--hmi-sensor-body)"
            stroke={isAlarmed ? '#ef4444' : led}
            strokeWidth={1.4}
          />
          <circle cx={6} cy={-22} r={2.3} fill={led} />
          <rect x={-8} y={-24.5} width={10} height={5} rx={1} fill="var(--hmi-lcd-bg)" stroke="var(--hmi-lcd-border)" strokeWidth={0.7} />
        </g>

        {isAlarmed && (
          <circle
            cx={0}
            cy={0}
            r={22}
            fill="none"
            stroke="#ef4444"
            strokeWidth={1.6}
            strokeDasharray="3,2"
            className={animationsEnabled ? 'hmi-alarm-ring' : undefined}
          />
        )}

        {/* Upright Tag Pill */}
        <g transform={isVertical ? 'translate(26, 0)' : 'translate(0, 21)'}>
          <rect
            x={-24}
            y={-8}
            width={48}
            height={showPctBadge ? 24 : 15}
            rx={3}
            fill="var(--hmi-card-bg)"
            stroke={isAlarmed ? '#ef4444' : 'var(--hmi-card-border)'}
            strokeWidth={1}
          />
          <text x={0} y={2} textAnchor="middle" fill="var(--pid-label)" fontSize={8} fontFamily="var(--mono)" fontWeight="bold">
            {id}
          </text>
          {showPctBadge && (
            <text x={0} y={12} textAnchor="middle" fill={led} fontSize={7.5} fontFamily="var(--mono)" fontWeight="bold">
              {clampedPct}%
            </text>
          )}
        </g>
      </g>
    );
  }
);

export const ManualValve25D: React.FC<RealisticEqBaseProps> = memo(
  ({ x, y, id, eq, statusColor, isAlarmed, animationsEnabled, onSelect, onHover }) => {
    const isOpen = eq?.state === 'OPEN' || eq?.state === 'THROTTLED';
    const led = getLedColor(eq, statusColor, isAlarmed);

    return (
      <g
        transform={`translate(${x},${y})`}
        {...eqInteractionProps(id, eq, x, y, 'Manual Gate Valve', '', onSelect, onHover)}
      >
        <rect x={-22} y={-28} width={44} height={54} fill="transparent" />

        {/* Flanges & cast iron body */}
        <rect x={-14} y={-7} width={3.5} height={14} rx={1} fill="var(--hmi-metal-light)" stroke="var(--hmi-pipe-outer)" strokeWidth={0.9} />
        <rect x={10.5} y={-7} width={3.5} height={14} rx={1} fill="var(--hmi-metal-light)" stroke="var(--hmi-pipe-outer)" strokeWidth={0.9} />
        <rect x={-10.5} y={-6} width={21} height={12} rx={1.5} fill="url(#hmi-metal-v)" stroke="var(--hmi-metal-stroke)" strokeWidth={1.1} />

        {/* Gate throat indicator */}
        <rect x={-4} y={-5} width={8} height={10} fill={isOpen ? '#6e5749' : '#0f172a'} />
        {!isOpen && <rect x={-3.5} y={-5} width={7} height={10} fill="#ef4444" opacity={0.85} />}

        {/* Stem & classic red handwheel */}
        <line x1={0} y1={-6} x2={0} y2={-18} stroke="var(--hmi-metal-light)" strokeWidth={2.2} />
        <ellipse cx={0} cy={-19} rx={12} ry={3.8} fill="none" stroke="#dc2626" strokeWidth={2.6} />
        <line x1={-11} y1={-19} x2={11} y2={-19} stroke="#dc2626" strokeWidth={1.4} />
        <circle cx={0} cy={-19} r={2} fill="var(--hmi-metal-light)" />

        {isAlarmed && (
          <circle
            cx={0}
            cy={-4}
            r={20}
            fill="none"
            stroke="#ef4444"
            strokeWidth={1.6}
            strokeDasharray="3,2"
            className={animationsEnabled ? 'hmi-alarm-ring' : undefined}
          />
        )}

        <rect
          x={-25}
          y={13}
          width={50}
          height={23}
          rx={3}
          fill="var(--hmi-card-bg)"
          stroke="var(--hmi-card-border)"
          strokeWidth={1}
        />
        <text x={0} y={23} textAnchor="middle" fill="var(--pid-label)" fontSize={8} fontFamily="var(--mono)" fontWeight="bold">
          {id}
        </text>
        <text x={0} y={32.5} textAnchor="middle" fill={led} fontSize={7} fontFamily="var(--mono)" fontWeight="bold">
          {eq?.state || '--'}
        </text>
      </g>
    );
  }
);

export interface Agitator25DProps extends RealisticEqBaseProps {
  shaftLength: number;
  durationSec: number | null;
  rpm?: number | null;
}

export const RapidMixer25D: React.FC<Agitator25DProps> = memo(
  ({ x, y, id, eq, statusColor, isAlarmed, animationsEnabled, shaftLength, durationSec, onSelect, onHover }) => {
    const running = isEquipmentRunning(eq) && durationSec !== null;
    const animate = running && animationsEnabled;
    const led = getLedColor(eq, statusColor, isAlarmed);

    return (
      <g
        transform={`translate(${x},${y})`}
        {...eqInteractionProps(
          id,
          eq,
          x,
          y,
          'Rapid Flash Mixer',
          ` | Runtime: ${eq?.runtime_hours.toFixed(1) ?? '0.0'}h`,
          onSelect,
          onHover
        )}
      >
        <rect x={-26} y={-34} width={52} height={shaftLength + 54} fill="transparent" />

        {/* Overhead mounting bridge & pedestal */}
        <rect x={-16} y={-2} width={32} height={5} rx={1} fill="var(--hmi-metal-mid)" stroke="var(--hmi-metal-stroke)" strokeWidth={1} />

        {/* Vertical mixer motor */}
        <rect
          x={-11}
          y={-28}
          width={22}
          height={26}
          rx={3}
          fill="url(#hmi-metal-h)"
          stroke={isAlarmed ? '#ef4444' : running ? '#38bdf8' : 'var(--hmi-metal-stroke)'}
          strokeWidth={1.3}
        />
        {/* Cooling fins */}
        {[-6, -2, 2, 6].map((fx) => (
          <line key={fx} x1={fx} y1={-25} x2={fx} y2={-6} stroke="var(--hmi-metal-dark)" strokeWidth={1} />
        ))}
        <circle cx={7} cy={-22} r={2.6} fill={led} stroke="#0f172a" strokeWidth={0.7} />

        {/* Vertical stainless agitator shaft */}
        <line x1={0} y1={3} x2={0} y2={shaftLength} stroke="#cbd5e1" strokeWidth={3} />
        <line x1={-0.7} y1={3} x2={-0.7} y2={shaftLength} stroke="#ffffff" strokeWidth={0.8} opacity={0.6} />

        {/* Turbulence vortex rings around impeller when running */}
        {running && (
          <g transform={`translate(0, ${shaftLength})`}>
            <g className={animate ? 'hmi-vortex-pulse' : undefined}>
              <circle cx={0} cy={0} r={24} fill="transparent" stroke="none" pointerEvents="none" />
              <ellipse cx={0} cy={-8} rx={21} ry={5} fill="none" stroke="#bae6fd" strokeWidth={1.3} strokeDasharray="7,5" opacity={0.75} />
              <ellipse cx={0} cy={0} rx={24} ry={6.5} fill="none" stroke="#67e8f9" strokeWidth={1.5} strokeDasharray="9,6" opacity={0.8} />
              <ellipse cx={0} cy={9} rx={16} ry={4} fill="none" stroke="#bae6fd" strokeWidth={1.1} strokeDasharray="5,4" opacity={0.65} />
            </g>
          </g>
        )}

        {/* Dual-phase 3D perspective turbine blades centered at (0, shaftLength) */}
        <g transform={`translate(0, ${shaftLength})`}>
          <g
            className={animate ? 'hmi-agitator-spin' : undefined}
            style={animate && durationSec ? { animationDuration: `${durationSec}s` } : undefined}
          >
            <circle cx={0} cy={0} r={20} fill="transparent" stroke="none" pointerEvents="none" />
            <polygon points="-18,-5 -3,-2 -3,3 -18,5" fill="#e2e8f0" stroke="#334155" strokeWidth={0.9} />
            <polygon points="18,-5 3,-2 3,3 18,5" fill="#cbd5e1" stroke="#334155" strokeWidth={0.9} />
          </g>
          <g
            className={animate ? 'hmi-agitator-spin' : undefined}
            style={
              animate && durationSec
                ? { animationDuration: `${durationSec}s`, animationDelay: `${-(durationSec * 0.25).toFixed(2)}s` }
                : undefined
            }
          >
            <circle cx={0} cy={0} r={20} fill="transparent" stroke="none" pointerEvents="none" />
            <polygon points="-15,-4 -3,-1 -3,2 -15,4" fill="#94a3b8" stroke="#334155" strokeWidth={0.8} />
            <polygon points="15,-4 3,-1 3,2 15,4" fill="#cbd5e1" stroke="#334155" strokeWidth={0.8} />
          </g>
          <rect x={-3.5} y={-4} width={7} height={8} rx={1.5} fill="var(--hmi-metal-light)" stroke="#0f172a" strokeWidth={0.8} />
        </g>

        {isAlarmed && (
          <circle
            cx={0}
            cy={-15}
            r={18}
            fill="none"
            stroke="#ef4444"
            strokeWidth={1.6}
            strokeDasharray="3,2"
            className={animationsEnabled ? 'hmi-alarm-ring' : undefined}
          />
        )}

        {/* Tag pill above motor */}
        <rect x={-26} y={-46} width={52} height={15} rx={3} fill="var(--hmi-card-bg)" stroke={isAlarmed ? '#ef4444' : 'var(--hmi-card-border)'} strokeWidth={1} />
        <text x={0} y={-35.5} textAnchor="middle" fill="var(--pid-label)" fontSize={8} fontFamily="var(--mono)" fontWeight="bold">
          {id}
        </text>
      </g>
    );
  }
);

export const FlocAgitator25D: React.FC<Agitator25DProps> = memo(
  ({ x, y, id, eq, statusColor, isAlarmed, animationsEnabled, shaftLength, durationSec, rpm, onSelect, onHover }) => {
    const running = isEquipmentRunning(eq) && durationSec !== null;
    const animate = running && animationsEnabled;
    const led = getLedColor(eq, statusColor, isAlarmed);
    const tier1Y = Math.round(shaftLength * 0.44);
    const tier2Y = Math.round(shaftLength * 0.84);
    const rpmText = running && rpm !== null && rpm !== undefined ? `${Math.round(rpm)} RPM` : eq?.state || 'STOPPED';

    const renderPaddleTier = (ty: number, span: number, delayFactor: number) => (
      <g transform={`translate(0, ${ty})`}>
        <g
          className={animate ? 'hmi-agitator-spin' : undefined}
          style={
            animate && durationSec
              ? {
                  animationDuration: `${durationSec}s`,
                  animationDelay: delayFactor ? `${-(durationSec * delayFactor).toFixed(2)}s` : undefined,
                }
              : undefined
          }
        >
          <circle cx={0} cy={0} r={span + 2} fill="transparent" stroke="none" pointerEvents="none" />
          {/* Horizontal arm + vertical paddle blades */}
          <line x1={-span} y1={0} x2={span} y2={0} stroke="#cbd5e1" strokeWidth={2.2} />
          <rect x={-span} y={-7} width={5} height={14} rx={1} fill="#e2e8f0" stroke="#334155" strokeWidth={0.8} />
          <rect x={span - 5} y={-7} width={5} height={14} rx={1} fill="#94a3b8" stroke="#334155" strokeWidth={0.8} />
        </g>
        <g
          className={animate ? 'hmi-agitator-spin' : undefined}
          style={
            animate && durationSec
              ? {
                  animationDuration: `${durationSec}s`,
                  animationDelay: `${-(durationSec * (delayFactor + 0.25)).toFixed(2)}s`,
                }
              : undefined
          }
        >
          <circle cx={0} cy={0} r={span + 2} fill="transparent" stroke="none" pointerEvents="none" />
          <line x1={-(span - 4)} y1={0} x2={span - 4} y2={0} stroke="#94a3b8" strokeWidth={1.6} />
          <rect x={-(span - 4)} y={-5.5} width={4} height={11} rx={1} fill="#cbd5e1" stroke="#334155" strokeWidth={0.7} />
          <rect x={span - 8} y={-5.5} width={4} height={11} rx={1} fill="#64748b" stroke="#334155" strokeWidth={0.7} />
        </g>
        <circle cx={0} cy={0} r={3} fill="var(--hmi-metal-light)" stroke="#0f172a" strokeWidth={0.8} />
      </g>
    );

    return (
      <g
        transform={`translate(${x},${y})`}
        {...eqInteractionProps(
          id,
          eq,
          x,
          y,
          'Flocculator Agitator',
          ` | Speed: ${rpm !== null && rpm !== undefined ? `${rpm.toFixed(1)} RPM` : 'N/A'}`,
          onSelect,
          onHover
        )}
      >
        <rect x={-32} y={-44} width={64} height={shaftLength + 54} fill="transparent" />

        {/* Bridge gearmotor pedestal */}
        <rect x={-16} y={-3} width={32} height={6} rx={1} fill="var(--hmi-metal-mid)" stroke="var(--hmi-metal-stroke)" strokeWidth={1} />
        <rect
          x={-11}
          y={-22}
          width={22}
          height={19}
          rx={2.5}
          fill="url(#hmi-metal-h)"
          stroke={isAlarmed ? '#ef4444' : running ? '#38bdf8' : 'var(--hmi-metal-stroke)'}
          strokeWidth={1.3}
        />
        <circle cx={7} cy={-16} r={2.5} fill={led} stroke="#0f172a" strokeWidth={0.7} />

        {/* Vertical shaft */}
        <line x1={0} y1={3} x2={0} y2={shaftLength} stroke="#cbd5e1" strokeWidth={3} />

        {/* Two paddle tiers rotating in 3D perspective */}
        {renderPaddleTier(tier1Y, 24, 0)}
        {renderPaddleTier(tier2Y, 26, 0.12)}

        {isAlarmed && (
          <circle
            cx={0}
            cy={-12}
            r={18}
            fill="none"
            stroke="#ef4444"
            strokeWidth={1.6}
            strokeDasharray="3,2"
            className={animationsEnabled ? 'hmi-alarm-ring' : undefined}
          />
        )}

        {/* Tag + live RPM badge */}
        <rect
          x={-31}
          y={-49}
          width={62}
          height={24}
          rx={3}
          fill="var(--hmi-card-bg)"
          stroke={isAlarmed ? '#ef4444' : 'var(--hmi-card-border)'}
          strokeWidth={1}
        />
        <text x={0} y={-38.5} textAnchor="middle" fill="var(--pid-label)" fontSize={8} fontFamily="var(--mono)" fontWeight="bold">
          {id}
        </text>
        <text x={0} y={-28.5} textAnchor="middle" fill={running ? '#38bdf8' : 'var(--pid-muted)'} fontSize={7.5} fontFamily="var(--mono)" fontWeight="bold">
          {rpmText}
        </text>
      </g>
    );
  }
);
