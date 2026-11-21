import React, { memo } from 'react';
import { TagState } from '../../types';
import { HoverPayload } from './RealisticEquipment';
import { computeGaugeAngleDeg } from './processAnimation';

export interface SensorBaseProps {
  x: number;
  y: number;
  tag: string;
  label: string;
  tagState?: TagState;
  color: string;
  formattedValue: string;
  onHover: (info: HoverPayload | null) => void;
}

function sensorHoverProps(props: SensorBaseProps) {
  const { x, y, tag, label, tagState, formattedValue, onHover } = props;
  return {
    style: { cursor: 'help' },
    onMouseEnter: () =>
      onHover({
        x,
        y: y - 24,
        title: `${label} [${tag}]`,
        detail: tagState
          ? `Value: ${formattedValue} | Quality: ${tagState.quality} | Addr: ${tagState.source_address}`
          : 'Unconfigured tag',
      }),
    onMouseLeave: () => onHover(null),
  };
}

function SensorReadoutBox({
  label,
  tag,
  formattedValue,
  color,
  width = 84,
  height = 38,
}: {
  label: string;
  tag: string;
  formattedValue: string;
  color: string;
  width?: number;
  height?: number;
}) {
  const halfW = width / 2;
  return (
    <g>
      <rect
        x={-halfW}
        y={-height / 2}
        width={width}
        height={height}
        rx={4}
        fill="var(--hmi-sensor-body)"
        stroke={color === 'var(--pid-value-fg)' ? 'var(--hmi-sensor-stroke)' : color}
        strokeWidth={1.2}
      />
      <text
        x={0}
        y={-height / 2 + 10.5}
        textAnchor="middle"
        fill="var(--pid-label)"
        fontSize={7.6}
        fontFamily="var(--sans)"
        fontWeight="700"
      >
        {label}
      </text>
      <rect
        x={-halfW + 4}
        y={-height / 2 + 13}
        width={width - 8}
        height={13.5}
        rx={2}
        fill="var(--hmi-lcd-bg)"
        stroke="var(--hmi-lcd-border)"
        strokeWidth={0.7}
      />
      <text
        x={0}
        y={-height / 2 + 22.8}
        textAnchor="middle"
        fill={color}
        fontSize={8.2}
        fontFamily="var(--mono)"
        fontWeight="bold"
      >
        {formattedValue}
      </text>
      <text
        x={0}
        y={height / 2 - 2.5}
        textAnchor="middle"
        fill="var(--pid-muted)"
        fontSize={6.5}
        fontFamily="var(--mono)"
      >
        {tag}
      </text>
    </g>
  );
}

export interface InlineFlowmeterProps extends SensorBaseProps {
  pipeX?: number;
  pipeY?: number;
  verticalPipe?: boolean;
}

export const InlineFlowmeter: React.FC<InlineFlowmeterProps> = memo((props) => {
  const { x, y, pipeX, pipeY, verticalPipe = false, color } = props;
  const hasPipe = pipeX !== undefined && pipeY !== undefined;

  return (
    <g {...sensorHoverProps(props)}>
      {/* Physical flanged magnetic flowmeter spool mounted directly on the pipe */}
      {hasPipe && (
        <g>
          <line
            x1={pipeX}
            y1={pipeY}
            x2={x}
            y2={y}
            stroke="var(--hmi-metal-light)"
            strokeWidth={1.6}
            strokeDasharray="2,1.5"
          />
          <g transform={`translate(${pipeX},${pipeY}) rotate(${verticalPipe ? 90 : 0})`}>
            <rect x={-9} y={-8} width={3} height={16} rx={0.8} fill="var(--hmi-metal-light)" stroke="var(--hmi-pipe-outer)" strokeWidth={0.8} />
            <rect x={6} y={-8} width={3} height={16} rx={0.8} fill="var(--hmi-metal-light)" stroke="var(--hmi-pipe-outer)" strokeWidth={0.8} />
            <rect x={-6} y={-7} width={12} height={14} rx={2} fill="#1d4ed8" stroke="#93c5fd" strokeWidth={1} />
            <circle cx={0} cy={0} r={3.2} fill="#0f172a" stroke={color} strokeWidth={0.9} />
          </g>
        </g>
      )}

      <g transform={`translate(${x},${y})`}>
        <SensorReadoutBox
          label={props.label}
          tag={props.tag}
          formattedValue={props.formattedValue}
          color={color}
          width={86}
          height={40}
        />
      </g>
    </g>
  );
});

export interface PressureGaugeProps extends SensorBaseProps {
  minVal: number;
  maxVal: number;
  tapX?: number;
  tapY?: number;
}

export const PressureGauge: React.FC<PressureGaugeProps> = memo((props) => {
  const { x, y, minVal, maxVal, tapX, tapY, tagState, color, label, tag, formattedValue } = props;
  const angle = computeGaugeAngleDeg(tagState, minVal, maxVal);
  const hasTap = tapX !== undefined && tapY !== undefined;

  return (
    <g {...sensorHoverProps(props)}>
      {hasTap && (
        <g>
          <line x1={tapX} y1={tapY} x2={x} y2={y + 18} stroke="var(--hmi-metal-light)" strokeWidth={1.5} />
          <circle cx={tapX} cy={tapY} r={2.5} fill="var(--hmi-metal-light)" stroke="var(--hmi-pipe-outer)" strokeWidth={0.8} />
        </g>
      )}

      <g transform={`translate(${x},${y})`}>
        {/* Analog brass/stainless gauge bezel */}
        <circle cx={0} cy={-6} r={17} fill="var(--hmi-metal-mid)" stroke="var(--hmi-metal-stroke)" strokeWidth={1.3} />
        <circle cx={0} cy={-6} r={14} fill="var(--hmi-dial-face)" stroke="var(--hmi-dial-tick)" strokeWidth={0.8} />

        {/* Dial arc ticks */}
        {[-120, -60, 0, 60, 120].map((deg) => (
          <line
            key={deg}
            x1={0}
            y1={-18.5}
            x2={0}
            y2={-15.5}
            stroke={deg >= 110 ? '#dc2626' : 'var(--hmi-dial-tick)'}
            strokeWidth={1.4}
            transform={`translate(0,-6) rotate(${deg}) translate(0,6)`}
          />
        ))}

        {/* Rotating gauge needle centered at dial center (0, -6) */}
        <g transform={`translate(0,-6) rotate(${angle})`}>
          <polygon points="-1.4,3 0,-11.5 1.4,3" fill="#dc2626" />
          <circle cx={0} cy={0} r={2.3} fill="#0f172a" />
        </g>

        {/* Compact digital readout + plain English label below dial */}
        <rect
          x={-40}
          y={13}
          width={80}
          height={29}
          rx={3}
          fill="var(--hmi-sensor-body)"
          stroke={color === 'var(--pid-value-fg)' ? 'var(--hmi-sensor-stroke)' : color}
          strokeWidth={1.1}
        />
        <text x={0} y={22.5} textAnchor="middle" fill="var(--pid-label)" fontSize={7.2} fontFamily="var(--sans)" fontWeight="700">
          {label}
        </text>
        <text x={0} y={32} textAnchor="middle" fill={color} fontSize={7.8} fontFamily="var(--mono)" fontWeight="bold">
          {formattedValue}
        </text>
        <text x={0} y={39.5} textAnchor="middle" fill="var(--pid-muted)" fontSize={6.2} fontFamily="var(--mono)">
          {tag}
        </text>
      </g>
    </g>
  );
});

export interface DiffPressureTransmitterProps extends SensorBaseProps {
  highTap: { x: number; y: number };
  lowTap: { x: number; y: number };
}

export const DiffPressureTransmitter: React.FC<DiffPressureTransmitterProps> = memo((props) => {
  const { x, y, highTap, lowTap, color } = props;
  const routeY = y + 52;
  return (
    <g {...sensorHoverProps(props)}>
      {/* Twin impulse tubing lines routed cleanly above vessel header */}
      <path
        d={`M ${highTap.x},${highTap.y} L ${highTap.x},${routeY} L ${x - 16},${routeY} L ${x - 16},${y}`}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={1.3}
        strokeDasharray="3,2"
      />
      <path
        d={`M ${lowTap.x},${lowTap.y} L ${lowTap.x},${routeY} L ${x + 16},${routeY} L ${x + 16},${y}`}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={1.3}
        strokeDasharray="3,2"
      />
      <circle cx={highTap.x} cy={highTap.y} r={2.3} fill="#38bdf8" />
      <circle cx={lowTap.x} cy={lowTap.y} r={2.3} fill="#38bdf8" />

      <g transform={`translate(${x},${y})`}>
        <SensorReadoutBox
          label={props.label}
          tag={props.tag}
          formattedValue={props.formattedValue}
          color={color}
          width={84}
          height={40}
        />
      </g>
    </g>
  );
});

export interface UltrasonicLevelSensorProps extends SensorBaseProps {
  mountX?: number;
  mountY?: number;
}

export const UltrasonicLevelSensor: React.FC<UltrasonicLevelSensorProps> = memo((props) => {
  const { x, y, mountX, mountY, color } = props;
  const hasMount = mountX !== undefined && mountY !== undefined;

  return (
    <g {...sensorHoverProps(props)}>
      {hasMount && (
        <g>
          <line x1={x} y1={y + 20} x2={mountX} y2={mountY} stroke="var(--hmi-metal-light)" strokeWidth={1.2} strokeDasharray="2,2" />
          {/* Ultrasonic transducer cone on vessel top */}
          <rect x={mountX - 5} y={mountY - 6} width={10} height={6} rx={1} fill="var(--hmi-metal-light)" stroke="var(--hmi-pipe-outer)" strokeWidth={0.8} />
          <path d={`M ${mountX - 4},${mountY + 4} Q ${mountX},${mountY + 7} ${mountX + 4},${mountY + 4}`} fill="none" stroke="#38bdf8" strokeWidth={1} opacity={0.75} />
          <path d={`M ${mountX - 6},${mountY + 8} Q ${mountX},${mountY + 12} ${mountX + 6},${mountY + 8}`} fill="none" stroke="#38bdf8" strokeWidth={1} opacity={0.45} />
        </g>
      )}
      <g transform={`translate(${x},${y})`}>
        <SensorReadoutBox
          label={props.label}
          tag={props.tag}
          formattedValue={props.formattedValue}
          color={color}
          width={84}
          height={39}
        />
      </g>
    </g>
  );
});

export interface ImmersedAnalyzerProbeProps extends SensorBaseProps {
  probeX?: number;
  probeY?: number;
  badgeText: string;
  accentColor?: string;
}

export const ImmersedAnalyzerProbe: React.FC<ImmersedAnalyzerProbeProps> = memo((props) => {
  const { x, y, probeX, probeY, badgeText, accentColor = '#38bdf8', color } = props;
  const hasProbe = probeX !== undefined && probeY !== undefined;

  return (
    <g {...sensorHoverProps(props)}>
      {hasProbe && (
        <g>
          <line x1={x} y1={y} x2={probeX} y2={probeY} stroke="#94a3b8" strokeWidth={1.6} />
          <rect x={probeX - 2.5} y={probeY - 5} width={5} height={10} rx={2} fill={accentColor} stroke="#0f172a" strokeWidth={0.8} />
        </g>
      )}
      <g transform={`translate(${x},${y})`}>
        <SensorReadoutBox
          label={props.label}
          tag={props.tag}
          formattedValue={props.formattedValue}
          color={color}
          width={86}
          height={40}
        />
        {/* Tiny parameter pill on top-left corner */}
        <rect x={-42} y={-25} width={24} height={11} rx={2} fill={accentColor} />
        <text x={-30} y={-17} textAnchor="middle" fill="#0f172a" fontSize={6.8} fontFamily="var(--mono)" fontWeight="bold">
          {badgeText}
        </text>
      </g>
    </g>
  );
});
