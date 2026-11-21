import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { EquipmentState } from '../types';

interface EquipmentViewProps {
  equipment: EquipmentState[];
  onSelectEquipment: (eq: EquipmentState) => void;
}

export const EquipmentView: React.FC<EquipmentViewProps> = ({ equipment, onSelectEquipment }) => {
  const [maintLogs, setMaintLogs] = useState<Array<Record<string, unknown>>>([]);
  const [filterEq, setFilterEq] = useState<string>('ALL');

  useEffect(() => {
    const q = filterEq === 'ALL' ? '' : `?equipment_id=${encodeURIComponent(filterEq)}`;
    apiFetch<Array<Record<string, unknown>>>(`/api/equipment/maintenance/logs${q}`)
      .then(setMaintLogs)
      .catch(() => {});
  }, [filterEq, equipment]);

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Equipment Monitoring &amp; Control Faceplates</span>
        </div>
        <div className="table-scroll">
          <table className="scada-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Name</th>
                <th>Category</th>
                <th>Area</th>
                <th>State</th>
                <th>Mode</th>
                <th className="num">Runtime</th>
                <th className="num">Starts / Stops</th>
                <th className="num">Alarms</th>
                <th className="actions">Faceplate</th>
              </tr>
            </thead>
            <tbody>
              {equipment.length === 0 ? (
                <tr>
                  <td colSpan={10} className="empty-state">No equipment configured in enabled process areas.</td>
                </tr>
              ) : (
                equipment.map((eq) => (
                  <tr key={eq.id}>
                    <td className="mono" style={{ fontWeight: 700 }}>{eq.tag}</td>
                    <td>{eq.name}</td>
                    <td className="mono">{eq.category}</td>
                    <td className="mono">{eq.process_area}</td>
                    <td><span className={`badge st-${eq.state}`}>{eq.state}</span></td>
                    <td className="mono">{eq.control_mode}</td>
                    <td className="num">{eq.runtime_hours.toFixed(2)} h</td>
                    <td className="num">{eq.start_count} / {eq.stop_count}</td>
                    <td className={`num ${eq.active_alarm_count > 0 ? 'status-err' : ''}`}>
                      {eq.active_alarm_count}
                    </td>
                    <td className="actions">
                      <button className="btn btn-sm btn-primary" onClick={() => onSelectEquipment(eq)}>Open</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Equipment Maintenance &amp; Lockout History</span>
          <select value={filterEq} onChange={(e) => setFilterEq(e.target.value)}>
            <option value="ALL">All Equipment</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>{e.id} — {e.name}</option>
            ))}
          </select>
        </div>
        <div className="table-scroll">
          <table className="scada-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Equipment</th>
                <th>Actor</th>
                <th>Entry Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {maintLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--text-muted)' }}>No maintenance log entries recorded.</td>
                </tr>
              ) : (
                maintLogs.map((m) => (
                  <tr key={String(m.id)}>
                    <td className="mono" style={{ fontSize: 11 }}>{String(m.timestamp).slice(0, 19)}</td>
                    <td className="mono">{String(m.equipment_id)}</td>
                    <td className="mono">{String(m.actor)}</td>
                    <td className="mono">{String(m.entry_type)}</td>
                    <td>{String(m.description)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};
