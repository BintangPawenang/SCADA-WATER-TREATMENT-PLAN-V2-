import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { Modal } from '../components/Modal';
import { Role, WaterQualityParam } from '../types';

interface WaterQualityViewProps {
  userRole: Role;
}

export const WaterQualityView: React.FC<WaterQualityViewProps> = ({ userRole }) => {
  const [spec, setSpec] = useState('');
  const [params, setParams] = useState<WaterQualityParam[]>([]);
  const [labResults, setLabResults] = useState<Array<Record<string, unknown>>>([]);
  const [labForm, setLabForm] = useState({
    parameter: 'Turbidity',
    value: '',
    unit: 'NTU',
    sample_id: '',
    sample_point: 'Clearwell',
    notes: '',
  });
  const [editing, setEditing] = useState<WaterQualityParam | null>(null);
  const [limitDraft, setLimitDraft] = useState({ min_op: '', max_op: '', alarm_low: '', alarm_high: '' });
  const [msg, setMsg] = useState<string | null>(null);

  const canLab = ['Administrator', 'Supervisor', 'Operator'].includes(userRole);
  const canEditLimits = ['Administrator', 'Supervisor', 'Engineer'].includes(userRole);

  const loadAll = useCallback(async () => {
    const [onl, lab] = await Promise.all([
      apiFetch<{ specification_source: string; parameters: WaterQualityParam[] }>('/api/water-quality/online'),
      apiFetch<Array<Record<string, unknown>>>('/api/water-quality/lab'),
    ]);
    setSpec(onl.specification_source);
    setParams(onl.parameters);
    setLabResults(lab);
  }, []);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  const openEdit = (p: WaterQualityParam) => {
    setEditing(p);
    setLimitDraft({
      min_op: p.min_op !== null ? String(p.min_op) : '',
      max_op: p.max_op !== null ? String(p.max_op) : '',
      alarm_low: p.alarm_low !== null ? String(p.alarm_low) : '',
      alarm_high: p.alarm_high !== null ? String(p.alarm_high) : '',
    });
  };

  const saveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const toNumOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
    await apiFetch(`/api/water-quality/limits/${encodeURIComponent(editing.tag_name)}`, {
      method: 'PUT',
      body: JSON.stringify({
        min_op: toNumOrNull(limitDraft.min_op),
        max_op: toNumOrNull(limitDraft.max_op),
        alarm_low: toNumOrNull(limitDraft.alarm_low),
        alarm_high: toNumOrNull(limitDraft.alarm_high),
      }),
    });
    setMsg(`Updated limits for ${editing.tag_name}`);
    setEditing(null);
    loadAll();
  };

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Online Water Quality Analyzers</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{spec}</span>
        </div>
        {msg && <div className="status-ok" style={{ fontSize: 12, marginBottom: 8 }}>{msg}</div>}
        <div className="table-scroll">
          <table className="scada-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Parameter</th>
                <th className="num">Value</th>
                <th>Unit</th>
                <th>Operating Range</th>
                <th>Alarm Thresholds</th>
                <th>Quality</th>
                <th>Status</th>
                {canEditLimits && <th>Config</th>}
              </tr>
            </thead>
            <tbody>
              {params.length === 0 ? (
                <tr>
                  <td colSpan={canEditLimits ? 9 : 8} className="empty-state">
                    No water quality analyzers enabled in active process areas.
                  </td>
                </tr>
              ) : (
                params.map((p) => (
                  <tr key={p.tag_name}>
                    <td className="mono">{p.tag_name}</td>
                    <td>{p.name}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{p.value !== null ? p.value.toFixed(2) : '--'}</td>
                    <td className="mono">{p.unit}</td>
                    <td className="mono">{p.min_op ?? '-'} to {p.max_op ?? '-'}</td>
                    <td className="mono">LL:{p.alarm_low ?? '-'} / HH:{p.alarm_high ?? '-'}</td>
                    <td><span className={`badge q-${p.quality}`}>{p.quality}</span></td>
                    <td><span className={`badge st-${p.status}`}>{p.status}</span></td>
                    {canEditLimits && (
                      <td>
                        <button className="btn btn-sm" onClick={() => openEdit(p)}>Edit Limits</button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Laboratory Sample Entry &amp; Log</span>
        </div>
        {canLab && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiFetch('/api/water-quality/lab', {
                method: 'POST',
                body: JSON.stringify({ ...labForm, value: Number(labForm.value) }),
              });
              setLabForm({ ...labForm, value: '', sample_id: '', notes: '' });
              loadAll();
            }}
            className="toolbar"
            style={{ marginBottom: 12 }}
          >
            <input placeholder="Sample ID" value={labForm.sample_id} onChange={(e) => setLabForm({ ...labForm, sample_id: e.target.value })} required />
            <input placeholder="Parameter" value={labForm.parameter} onChange={(e) => setLabForm({ ...labForm, parameter: e.target.value })} required />
            <input type="number" step="any" placeholder="Value" value={labForm.value} onChange={(e) => setLabForm({ ...labForm, value: e.target.value })} required />
            <input placeholder="Unit" value={labForm.unit} onChange={(e) => setLabForm({ ...labForm, unit: e.target.value })} required />
            <input placeholder="Sample Point" value={labForm.sample_point} onChange={(e) => setLabForm({ ...labForm, sample_point: e.target.value })} required />
            <button className="btn btn-primary" type="submit">Record Lab Result</button>
          </form>
        )}
        <div className="table-scroll">
          <table className="scada-table">
            <thead>
              <tr>
                <th>Sample ID</th>
                <th>Parameter</th>
                <th className="num">Value</th>
                <th>Unit</th>
                <th>Point</th>
                <th>Analyst</th>
                <th>Sampled At (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {labResults.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-state">No laboratory sample results recorded yet.</td>
                </tr>
              ) : (
                labResults.map((r) => (
                  <tr key={String(r.id)}>
                    <td className="mono">{String(r.sample_id)}</td>
                    <td>{String(r.parameter)}</td>
                    <td className="num">{String(r.value)}</td>
                    <td className="mono">{String(r.unit)}</td>
                    <td>{String(r.sample_point)}</td>
                    <td className="mono">{String(r.analyst)}</td>
                    <td className="mono">{String(r.sampled_at).slice(0, 19)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title={`Edit Limits — ${editing.tag_name} (${editing.unit})`}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={saveLimits}>
            <div className="grid-2">
              <label>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Min Operating</div>
                <input type="number" step="any" value={limitDraft.min_op} onChange={(e) => setLimitDraft({ ...limitDraft, min_op: e.target.value })} style={{ width: '100%' }} />
              </label>
              <label>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Max Operating</div>
                <input type="number" step="any" value={limitDraft.max_op} onChange={(e) => setLimitDraft({ ...limitDraft, max_op: e.target.value })} style={{ width: '100%' }} />
              </label>
              <label>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Alarm Low</div>
                <input type="number" step="any" value={limitDraft.alarm_low} onChange={(e) => setLimitDraft({ ...limitDraft, alarm_low: e.target.value })} style={{ width: '100%' }} />
              </label>
              <label>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Alarm High</div>
                <input type="number" step="any" value={limitDraft.alarm_high} onChange={(e) => setLimitDraft({ ...limitDraft, alarm_high: e.target.value })} style={{ width: '100%' }} />
              </label>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }}>Save Approved Limits</button>
          </form>
        </Modal>
      )}
    </>
  );
};
