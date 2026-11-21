import React, { useMemo, useState } from 'react';

export interface TrendSample {
  timestamp: string;
  value: number | null;
  min_value?: number | null;
  max_value?: number | null;
  quality: string;
}

export interface PenSeries {
  tag: string;
  unit: string;
  color: string;
  samples: TrendSample[];
}

interface TrendChartProps {
  pens: PenSeries[];
}

export const PEN_COLORS = ['#38bdf8', '#fbbf24', '#4ade80', '#c084fc'];

export const TrendChart: React.FC<TrendChartProps> = ({ pens }) => {
  const width = 860;
  const height = 270;
  const pad = { top: 20, right: 24, bottom: 36, left: 62 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const [hoverX, setHoverX] = useState<number | null>(null);

  const chartModel = useMemo(() => {
    const activePens = pens.filter((p) => p.samples.some((s) => s.value !== null && Number.isFinite(s.value)));
    if (activePens.length === 0) return null;

    let minTs = Infinity;
    let maxTs = -Infinity;

    const penStats = activePens.map((p) => {
      const valid = p.samples
        .map((s) => ({ ...s, tsMs: Date.parse(s.timestamp) }))
        .filter((s) => s.value !== null && Number.isFinite(s.value) && Number.isFinite(s.tsMs));
      const vals = valid.map((s) => s.value as number);
      const mins = valid.map((s) => (typeof s.min_value === 'number' ? s.min_value : (s.value as number)));
      const maxs = valid.map((s) => (typeof s.max_value === 'number' ? s.max_value : (s.value as number)));
      for (const s of valid) {
        if (s.tsMs < minTs) minTs = s.tsMs;
        if (s.tsMs > maxTs) maxTs = s.tsMs;
      }
      let minV = Math.min(...mins);
      let maxV = Math.max(...maxs);
      if (minV === maxV) {
        minV -= 1;
        maxV += 1;
      }
      const hasEnvelope = valid.some((s) => typeof s.min_value === 'number' && typeof s.max_value === 'number');
      return { ...p, valid, minV, maxV, latest: vals[vals.length - 1], hasEnvelope };
    });

    if (!Number.isFinite(minTs) || !Number.isFinite(maxTs)) return null;
    if (maxTs === minTs) maxTs = minTs + 60_000;

    return { singlePen: penStats.length === 1, penStats, minTs, maxTs };
  }, [pens]);

  if (!chartModel) {
    return (
      <div className="panel empty-state" style={{ padding: 36 }}>
        No historical samples available for selected pen(s) in this time window.
      </div>
    );
  }

  const { singlePen, penStats, minTs, maxTs } = chartModel;

  const hoveredTs =
    hoverX !== null
      ? minTs + ((hoverX - pad.left) / plotW) * (maxTs - minTs)
      : null;

  const fmtTime = (ms: number) => new Date(ms).toISOString().slice(11, 19);

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">
          Historian Trend {singlePen ? `— ${penStats[0].tag} (${penStats[0].unit})` : '(Multi-Pen Time-Aligned % Span)'}
        </span>
        <div className="toolbar">
          {penStats.map((ps) => (
            <span key={ps.tag} className="mono" style={{ fontSize: 11, color: ps.color }}>
              ■ {ps.tag}: {ps.latest.toFixed(2)} {ps.unit} [Min {ps.minV.toFixed(2)} / Max {ps.maxV.toFixed(2)}]
            </span>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ maxHeight: 300, cursor: 'crosshair' }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const svgX = ((e.clientX - rect.left) / rect.width) * width;
          if (svgX >= pad.left && svgX <= width - pad.right) {
            setHoverX(svgX);
          } else {
            setHoverX(null);
          }
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        {/* Horizontal Y grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = pad.top + frac * plotH;
          const labelVal = singlePen
            ? (penStats[0].maxV - frac * (penStats[0].maxV - penStats[0].minV)).toFixed(2)
            : `${Math.round((1 - frac) * 100)}%`;
          return (
            <g key={frac}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="var(--border)" strokeDasharray="3,3" />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" fill="var(--text-muted)" fontSize={10} fontFamily="monospace">
                {labelVal}
              </text>
            </g>
          );
        })}

        {/* Vertical X time ticks (0%, 25%, 50%, 75%, 100%) */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const x = pad.left + frac * plotW;
          const tsLabel = fmtTime(minTs + frac * (maxTs - minTs));
          return (
            <g key={frac}>
              <line x1={x} y1={pad.top} x2={x} y2={pad.top + plotH} stroke="var(--border)" strokeDasharray="2,4" />
              <text x={x} y={height - 10} textAnchor="middle" fill="var(--text-muted)" fontSize={10} fontFamily="monospace">
                {tsLabel}
              </text>
            </g>
          );
        })}

        {/* Pens plotted by true timestamp with optional min-max envelope */}
        {penStats.map((ps) => {
          const pts = ps.valid
            .map((s) => {
              const x = pad.left + ((s.tsMs - minTs) / (maxTs - minTs)) * plotW;
              const norm = ((s.value as number) - ps.minV) / (ps.maxV - ps.minV);
              const y = pad.top + plotH - norm * plotH;
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');

          let envPoly: string | null = null;
          if (ps.hasEnvelope && ps.valid.length > 1) {
            const upper = ps.valid.map((s) => {
              const x = pad.left + ((s.tsMs - minTs) / (maxTs - minTs)) * plotW;
              const hi = typeof s.max_value === 'number' ? s.max_value : (s.value as number);
              const y = pad.top + plotH - ((hi - ps.minV) / (ps.maxV - ps.minV)) * plotH;
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            });
            const lower = [...ps.valid].reverse().map((s) => {
              const x = pad.left + ((s.tsMs - minTs) / (maxTs - minTs)) * plotW;
              const lo = typeof s.min_value === 'number' ? s.min_value : (s.value as number);
              const y = pad.top + plotH - ((lo - ps.minV) / (ps.maxV - ps.minV)) * plotH;
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            });
            envPoly = [...upper, ...lower].join(' ');
          }

          return (
            <g key={ps.tag}>
              {envPoly && <polygon fill={ps.color} opacity={0.14} points={envPoly} />}
              <polyline fill="none" stroke={ps.color} strokeWidth={2} points={pts} />
            </g>
          );
        })}

        {/* Interactive Crosshair */}
        {hoverX !== null && hoveredTs !== null && (
          <g>
            <line x1={hoverX} y1={pad.top} x2={hoverX} y2={pad.top + plotH} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3,2" />
            <g transform={`translate(${Math.min(width - 210, hoverX + 8)},${pad.top + 4})`}>
              <rect x={0} y={0} width={196} height={18 + penStats.length * 14} rx={2} fill="var(--pid-tooltip-bg)" stroke="var(--accent)" strokeWidth={1} />
              <text x={6} y={13} fill="var(--pid-label)" fontSize={9.5} fontFamily="monospace" fontWeight="bold">
                UTC {fmtTime(hoveredTs)}
              </text>
              {penStats.map((ps, i) => {
                let nearest = ps.valid[0];
                let bestDiff = Infinity;
                for (const s of ps.valid) {
                  const d = Math.abs(s.tsMs - hoveredTs);
                  if (d < bestDiff) {
                    bestDiff = d;
                    nearest = s;
                  }
                }
                return (
                  <text key={ps.tag} x={6} y={27 + i * 14} fill={ps.color} fontSize={9.5} fontFamily="monospace">
                    {ps.tag}: {(nearest.value as number).toFixed(2)} {ps.unit}
                  </text>
                );
              })}
            </g>
          </g>
        )}
      </svg>
    </div>
  );
};
