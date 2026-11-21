import React, { memo } from 'react';
import { FlowVisualState } from './processAnimation';

export type PipeFluidKind =
  | 'raw-water'
  | 'coag-water'
  | 'floc-water'
  | 'settled-water'
  | 'clean-water'
  | 'coagulant'
  | 'chlorine'
  | 'air'
  | 'sludge'
  | 'backwash';

export interface PipeSegmentProps {
  d: string;
  fluid: PipeFluidKind;
  flow: FlowVisualState;
  diameter?: number;
  animationsEnabled: boolean;
  rawTurbid?: boolean;
  showFlangesAt?: Array<{ x: number; y: number; vertical?: boolean }>;
  arrowAt?: { x: number; y: number; angleDeg: number };
}

interface FluidStyle {
  idleBore: string;
  activeBore: string;
  streamColor: string;
  streamClass: string;
  dashArray: string;
}

function getFluidStyle(fluid: PipeFluidKind, rawTurbid?: boolean): FluidStyle {
  if (fluid === 'raw-water') {
    return rawTurbid
      ? {
          idleBore: '#3b2b1a',
          activeBore: '#6e4b27',
          streamColor: '#c4955a',
          streamClass: 'hmi-flow-dash',
          dashArray: '10 14',
        }
      : {
          idleBore: '#163842',
          activeBore: '#1b6475',
          streamColor: '#67cde0',
          streamClass: 'hmi-flow-dash',
          dashArray: '10 14',
        };
  }

  switch (fluid) {
    case 'coag-water':
      return {
        idleBore: '#194352',
        activeBore: '#1b738f',
        streamColor: '#74dbf0',
        streamClass: 'hmi-flow-dash',
        dashArray: '10 14',
      };
    case 'floc-water':
      return {
        idleBore: '#1a4c63',
        activeBore: '#1680a6',
        streamColor: '#7fe2fa',
        streamClass: 'hmi-flow-dash',
        dashArray: '10 14',
      };
    case 'settled-water':
      return {
        idleBore: '#16587c',
        activeBore: '#0a8fc7',
        streamColor: '#8ce6ff',
        streamClass: 'hmi-flow-dash',
        dashArray: '10 14',
      };
    case 'clean-water':
    case 'backwash':
      return {
        idleBore: '#0f5c87',
        activeBore: '#0284c7',
        streamColor: '#bae6fd',
        streamClass: 'hmi-flow-dash',
        dashArray: '10 14',
      };
    case 'coagulant':
      return {
        idleBore: '#5c3a11',
        activeBore: '#b45309',
        streamColor: '#fcd34d',
        streamClass: 'hmi-flow-chem',
        dashArray: '4 14',
      };
    case 'chlorine':
      return {
        idleBore: '#3c4d14',
        activeBore: '#65a30d',
        streamColor: '#d9f99d',
        streamClass: 'hmi-flow-chem',
        dashArray: '4 14',
      };
    case 'air':
      return {
        idleBore: '#334155',
        activeBore: '#475569',
        streamColor: '#e0f2fe',
        streamClass: 'hmi-flow-air',
        dashArray: '3 17',
      };
    case 'sludge':
      return {
        idleBore: '#3c312b',
        activeBore: '#6e5749',
        streamColor: '#b5a295',
        streamClass: 'hmi-flow-dash',
        dashArray: '8 16',
      };
  }
}

export const RealisticPipe: React.FC<PipeSegmentProps> = memo(({
  d,
  fluid,
  flow,
  diameter = 10,
  animationsEnabled,
  rawTurbid = false,
  showFlangesAt,
  arrowAt,
}) => {
  const style = getFluidStyle(fluid, rawTurbid);
  const isFlowing = flow.active && flow.durationSec !== null;
  const shouldAnimate = isFlowing && animationsEnabled;
  const boreColor = isFlowing ? style.activeBore : style.idleBore;
  const streamWidth = Math.max(2.2, diameter * 0.44);

  return (
    <g>
      {/* 1. Metallic outer pipe casing / shadow */}
      <path
        d={d}
        fill="none"
        stroke="var(--hmi-pipe-outer)"
        strokeWidth={diameter + 4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 2. Pipe inner bore filled with fluid base */}
      <path
        d={d}
        fill="none"
        stroke={boreColor}
        strokeWidth={diameter}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 3. Animated fluid flow / droplets / bubbles */}
      {isFlowing && (
        <path
          d={d}
          fill="none"
          stroke={style.streamColor}
          strokeWidth={streamWidth}
          strokeDasharray={style.dashArray}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={shouldAnimate ? style.streamClass : undefined}
          style={
            shouldAnimate && flow.durationSec
              ? { animationDuration: `${flow.durationSec}s`, opacity: 0.92 }
              : { opacity: 0.55 }
          }
        />
      )}

      {/* 4. Top specular sheen for cylindrical 3D depth */}
      <path
        d={d}
        fill="none"
        stroke="var(--hmi-pipe-highlight)"
        strokeWidth={Math.max(1.2, diameter * 0.22)}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />

      {/* 5. Optional bolted flange collars */}
      {showFlangesAt?.map((fl, idx) => (
        <g key={idx} transform={`translate(${fl.x},${fl.y}) rotate(${fl.vertical ? 90 : 0})`}>
          <rect
            x={-2.5}
            y={-(diameter * 0.78)}
            width={5}
            height={diameter * 1.56}
            rx={1.2}
            fill="var(--hmi-metal-light)"
            stroke="var(--hmi-pipe-outer)"
            strokeWidth={1}
          />
          <circle cx={0} cy={-(diameter * 0.55)} r={1} fill="var(--hmi-pipe-outer)" />
          <circle cx={0} cy={diameter * 0.55} r={1} fill="var(--hmi-pipe-outer)" />
        </g>
      ))}

      {/* 6. Crisp directional flow indicator chevron */}
      {arrowAt && (
        <g transform={`translate(${arrowAt.x},${arrowAt.y}) rotate(${arrowAt.angleDeg})`}>
          <polygon
            points="-5,-4 5,0 -5,4 -2.5,0"
            fill={isFlowing ? style.streamColor : 'var(--hmi-metal-light)'}
            opacity={isFlowing ? 0.95 : 0.45}
            stroke="var(--hmi-pipe-outer)"
            strokeWidth={0.6}
          />
        </g>
      )}
    </g>
  );
});
