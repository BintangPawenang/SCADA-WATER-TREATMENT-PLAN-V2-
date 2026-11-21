import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api';
import { Modal } from '../components/Modal';
import { AlarmRecord, EventRecord, Role } from '../types';

interface AlarmsViewProps {
  alarms: AlarmRecord[];
  userRole: Role;
  onRefresh: () => void;
}

export const AlarmsView: React.FC<AlarmsViewProps> = ({ alarms, userRole, onRefresh }) => {
  const [subTab, setSubTab] = useState<'active' | 'history' | 'events'>('active');
  const [alarmHistory, setAlarmHistory] = useState<AlarmRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [prioFilter, setPrioFilter] = useState<string>('ALL');
  const [areaFilter, setAreaFilter] = useState<string>('ALL');
  const [shelveTarget, setShelveTarget] = useState<AlarmRecord | null>(null);
  const [shelveMinutes, setShelveMinutes] = useState(30);
  const [shelveReason, setShelveReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const canAck = userRole !== 'Viewer';
  const canShelve = ['Administrator', 'Supervisor'].includes(userRole);

  useEffect(() => {
    apiFetch<AlarmRecord[]>('/api/alarms/history').then(setAlarmHistory).catch(() => {});
    apiFetch<EventRecord[]>('/api/events').then(setEvents).catch(() => {});
  }, [alarms.length, subTab]);

  const submitShelve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shelveTarget) return;
    setErr(null);
    try {
      await apiFetch(`/api/alarms/${shelveTarget.id}/shelve`, {
        method: 'POST',
        body: JSON.stringify({ duration_minutes: shelveMinutes, reason: shelveReason }),
      });
      setShelveTarget(null);
      setShelveReason('');
      onRefresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Shelve failed');
    }
  };

  const baseRows = subTab === 'active' ? alarms : alarmHistory;
  const uniqueAreas = useMemo(() => Array.from(new Set(baseRows.map((a) => a.process_area))).sort(), [baseRows]);
  const rows = useMemo(
    () =>
      baseRows.filter(
        (a) =>
          (prioFilter === 'ALL' || String(a.priority) === prioFilter) &&
          (areaFilter === 'ALL' || a.process_area === areaFilter)
      ),
    [baseRows, prioFilter, areaFilter]
  );

  const unackIds = useMemo(() => rows.filter((r) => !r.acknowledged).map((r) => r.id), [rows]);

  const ackVisible = async () => {
    if (unackIds.length === 0) return;
    await apiFetch('/api/alarms/ack-bulk', {
      method: 'POST',
      body: JSON.stringify({ alarm_ids: unackIds }),
    });
    onRefresh();
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">ISA-18.2 Alarm &amp; Event Management</span>
        <div className="toolbar">
          <button className={`btn ${subTab === 'active' ? 'btn-primary' : ''}`} onClick={() => setSubTab('active')}>
            Active ({alarms.length})
          </button>
          <button className={`btn ${subTab === 'history' ? 'btn-primary' : ''}`} onClick={() => setSubTab('history')}>
            Alarm History
          </button>
          <button className={`btn ${subTab === 'events' ? 'btn-primary' : ''}`} onClick={() => setSubTab('events')}>
            System Events
          </button>
        </div>
      </div>

      {subTab !== 'events' && (
        <div className="toolbar" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
          <div className="toolbar">
            <select value={prioFilter} onChange={(e) => setPrioFilter(e.target.value)} aria-label="Filter by priority">
              <option value="ALL">All Priorities</option>
              <option value="1">P1 — Critical</option>
              <option value="2">P2 — High</option>
              <option value="3">P3 — Medium</option>
              <option value="4">P4 — Low</option>
            </select>
            <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Filter by area">
              <option value="ALL">All Areas</option>
              {uniqueAreas.map((ar) => (
                <option key={ar} value={ar}>{ar}</option>
              ))}
            </select>
          </div>
          {canAck && unackIds.length > 0 && (
            <button className="btn btn-warn" onClick={ackVisible}>
              Acknowledge Visible ({unackIds.length})
            </button>
          )}
        </div>
      )}

      {err && <div className="status-err" style={{ marginBottom: 8 }}>{err}</div>}

      {subTab !== 'events' ? (
        <div className="table-scroll">
          <table className="scada-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>State</th>
                <th>Source</th>
                <th>Area</th>
                <th>Category</th>
                <th>Description</th>
                <th>Raised At (UTC)</th>
                <th>Ack / Shelve Info</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-state">
                    {subTab === 'active'
                      ? 'No active or unacknowledged alarms matching filter — Process operating within configured thresholds.'
                      : 'No historical alarms recorded matching filter.'}
                  </td>
                </tr>
              ) : (
                rows.map((a) => (
                  <tr key={a.id}>
                    <td><span className={`badge prio-${a.priority}`}>P{a.priority}</span></td>
                    <td>
                      <span className={`badge ${a.shelved ? 'st-MAINTENANCE' : a.active ? `prio-${a.priority}` : 'st-STOPPED'}`}>
                        {a.state}
                      </span>
                    </td>
                    <td className="mono">{a.source}</td>
                    <td className="mono">{a.process_area}</td>
                    <td className="mono">{a.category}</td>
                    <td>{a.description}</td>
                    <td className="mono">{a.raised_at.slice(0, 19)}</td>
                    <td className="mono">
                      {a.ack_user ? `Ack: ${a.ack_user}` : '-'}
                      {a.shelved ? ` | Shelved until ${a.shelved_until?.slice(11, 19)} (${a.shelve_reason})` : ''}
                    </td>
                    <td className="actions">
                      <div className="toolbar">
                        {!a.acknowledged && canAck && (
                          <button
                            className="btn btn-sm btn-warn"
                            onClick={() => apiFetch(`/api/alarms/${a.id}/ack`, { method: 'POST' }).then(onRefresh)}
                          >
                            Acknowledge
                          </button>
                        )}
                        {a.active && !a.shelved && canShelve && (
                          <button className="btn btn-sm" onClick={() => setShelveTarget(a)}>
                            Shelve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="scada-table">
            <thead>
              <tr>
                <th>Timestamp (UTC)</th>
                <th>Type</th>
                <th>Source</th>
                <th>Actor</th>
                <th>Severity</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-state">No system events recorded yet.</td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="mono">{ev.timestamp.slice(0, 19)}</td>
                    <td className="mono">{ev.event_type}</td>
                    <td className="mono">{ev.source}</td>
                    <td className="mono">{ev.actor}</td>
                    <td className="mono">{ev.severity}</td>
                    <td>{ev.description}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {shelveTarget && (
        <Modal
          title={`Shelve Alarm #${shelveTarget.id} (${shelveTarget.source})`}
          onClose={() => setShelveTarget(null)}
        >
          <form onSubmit={submitShelve} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Duration (minutes, max 1440)
              </div>
              <input
                type="number"
                min={1}
                max={1440}
                value={shelveMinutes}
                onChange={(e) => setShelveMinutes(Number(e.target.value))}
                style={{ width: '100%' }}
                required
              />
            </label>
            <label>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Engineering / Operational Justification
              </div>
              <input
                value={shelveReason}
                onChange={(e) => setShelveReason(e.target.value)}
                placeholder="e.g., Sensor calibration in progress"
                style={{ width: '100%' }}
                required
              />
            </label>
            <button type="submit" className="btn btn-warn">Confirm Shelve</button>
          </form>
        </Modal>
      )}
    </div>
  );
};
