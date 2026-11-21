import React, { useCallback, useEffect, useState } from 'react';
import { apiDownload, apiFetch } from '../api';
import { PEN_COLORS, PenSeries, TrendChart, TrendSample } from '../components/TrendChart';
import { TagState } from '../types';

interface HistorianViewProps {
  tags: TagState[];
}

export const HistorianView: React.FC<HistorianViewProps> = ({ tags }) => {
  const numericTags = tags.filter((t) => t.data_type === 'FLOAT' || t.data_type === 'INT');
  const [selectedTags, setSelectedTags] = useState<string[]>(['FIT-101']);
  const [tagToAdd, setTagToAdd] = useState('FIT-701');
  const [hours, setHours] = useState(1);
  const [bucket, setBucket] = useState('RAW');
  const [pens, setPens] = useState<PenSeries[]>([]);
  const [truncated, setTruncated] = useState(false);

  const loadTrends = useCallback(async () => {
    let anyTruncated = false;
    const results = await Promise.all(
      selectedTags.map(async (tag, idx) => {
        const res = await apiFetch<{ samples: TrendSample[]; truncated?: boolean }>(
          `/api/historian/query?tag_name=${encodeURIComponent(tag)}&hours=${hours}&bucket=${bucket}`
        );
        if (res.truncated) anyTruncated = true;
        const unit = tags.find((t) => t.tag_name === tag)?.engineering_unit || '';
        return {
          tag,
          unit,
          color: PEN_COLORS[idx % PEN_COLORS.length],
          samples: res.samples,
        };
      })
    );
    setTruncated(anyTruncated);
    setPens(results);
  }, [selectedTags, hours, bucket, tags]);

  useEffect(() => {
    loadTrends().catch(() => {});
  }, [loadTrends]);

  const addPen = () => {
    if (selectedTags.includes(tagToAdd) || selectedTags.length >= 4) return;
    setSelectedTags((prev) => [...prev, tagToAdd]);
  };

  const removePen = (tag: string) => {
    if (selectedTags.length <= 1) return;
    setSelectedTags((prev) => prev.filter((t) => t !== tag));
  };

  return (
    <>
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="toolbar">
          <select value={tagToAdd} onChange={(e) => setTagToAdd(e.target.value)}>
            {numericTags.map((t) => (
              <option key={t.tag_name} value={t.tag_name}>
                {t.tag_name} — {t.description}
              </option>
            ))}
          </select>
          <button className="btn" onClick={addPen} disabled={selectedTags.length >= 4 || selectedTags.includes(tagToAdd)}>
            Add Pen (Max 4)
          </button>
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            <option value={1}>Last 1 Hour</option>
            <option value={6}>Last 6 Hours</option>
            <option value={24}>Last 24 Hours</option>
          </select>
          <select value={bucket} onChange={(e) => setBucket(e.target.value)}>
            <option value="RAW">Raw Samples</option>
            <option value="1M">1-Minute Avg (Min/Max Band)</option>
            <option value="5M">5-Minute Avg (Min/Max Band)</option>
            <option value="1H">1-Hour Avg (Min/Max Band)</option>
          </select>
          <button className="btn btn-primary" onClick={loadTrends}>Query Trend</button>
          <button
            className="btn"
            onClick={() =>
              apiDownload(
                `/api/historian/export?tags=${encodeURIComponent(selectedTags.join(','))}&hours=${hours}`,
                `historian_export.csv`
              )
            }
          >
            Export CSV
          </button>
        </div>

        <div className="toolbar">
          {selectedTags.map((t, idx) => (
            <span
              key={t}
              className="badge mono"
              style={{ borderColor: PEN_COLORS[idx % PEN_COLORS.length], color: PEN_COLORS[idx % PEN_COLORS.length] }}
            >
              {t}{' '}
              {selectedTags.length > 1 && (
                <button
                  onClick={() => removePen(t)}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0 2px' }}
                  aria-label={`Remove pen ${t}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>

        {truncated && (
          <div className="status-warn" style={{ fontSize: 12 }}>
            Warning: Query reached 2,000 sample limit and was truncated. Switch bucket to 1M, 5M, or 1H aggregation for full time-range coverage.
          </div>
        )}
      </div>

      <TrendChart pens={pens} />
    </>
  );
};
