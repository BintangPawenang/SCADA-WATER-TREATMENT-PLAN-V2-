import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { OperatingMode, ProcessAreaConfig, Role, UserInfo } from '../types';

interface AdminViewProps {
  user: UserInfo;
  operatingMode: OperatingMode;
  processAreas: Record<string, ProcessAreaConfig>;
  onRefreshOverview: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  user,
  operatingMode,
  processAreas,
  onRefreshOverview,
}) => {
  const [usersList, setUsersList] = useState<UserInfo[]>([]);
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, unknown>>>([]);
  const [newUser, setNewUser] = useState({ username: '', full_name: '', role: 'Operator' as Role, password: '' });
  const [simFeedback, setSimFeedback] = useState<string | null>(null);

  const loadAdminData = useCallback(async () => {
    if (user.role === 'Administrator') {
      apiFetch<UserInfo[]>('/api/admin/users').then(setUsersList).catch(() => {});
    }
    if (['Administrator', 'Supervisor', 'Engineer'].includes(user.role)) {
      apiFetch<Array<Record<string, unknown>>>('/api/admin/audit').then(setAuditLogs).catch(() => {});
    }
  }, [user.role]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const injectSimFault = async (faultType: string, active: boolean) => {
    const res = await apiFetch<{ message: string }>('/api/simulation/fault', {
      method: 'POST',
      body: JSON.stringify({ fault_type: faultType, active }),
    });
    setSimFeedback(res.message);
    onRefreshOverview();
  };

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Configurable Process Areas (A–H)</span>
        </div>
        <div className="table-scroll">
          <table className="scada-table">
            <thead>
              <tr><th>Code</th><th>Process Area</th><th>Status</th><th>Toggle</th></tr>
            </thead>
            <tbody>
              {Object.entries(processAreas).map(([k, v]) => (
                <tr key={k}>
                  <td className="mono">{v.code}</td>
                  <td>{v.name}</td>
                  <td><span className={`badge ${v.enabled ? 'st-IN_SERVICE' : 'st-OFFLINE'}`}>{v.enabled ? 'ENABLED' : 'DISABLED'}</span></td>
                  <td>
                    <button
                      className="btn"
                      disabled={!['Administrator', 'Engineer'].includes(user.role)}
                      onClick={() =>
                        apiFetch(`/api/config/process-areas/${k}`, {
                          method: 'PUT',
                          body: JSON.stringify({ enabled: !v.enabled }),
                        }).then(onRefreshOverview)
                      }
                    >
                      {v.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {operatingMode === 'SIMULATION' && ['Administrator', 'Supervisor', 'Engineer', 'Operator'].includes(user.role) && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Simulation Fault Injection (Training &amp; Validation Only)</span>
          </div>
          <div className="toolbar">
            <button className="btn btn-danger" onClick={() => injectSimFault('PMP-101_TRIP', true)}>Trip PMP-101</button>
            <button className="btn" onClick={() => injectSimFault('PMP-101_TRIP', false)}>Reset PMP-101 Fault</button>
            <button className="btn btn-warn" onClick={() => injectSimFault('RAW_TURB_SPIKE', true)}>Raw Turbidity Spike</button>
            <button className="btn" onClick={() => injectSimFault('RAW_TURB_SPIKE', false)}>Reset Turbidity</button>
            <button className="btn btn-warn" onClick={() => injectSimFault('FIT-101_COMM_LOSS', true)}>FIT-101 Comm Loss</button>
            <button className="btn" onClick={() => injectSimFault('FIT-101_COMM_LOSS', false)}>Restore FIT-101 Comm</button>
          </div>
          {simFeedback && <div className="mono status-warn" style={{ marginTop: 8, fontSize: 12 }}>{simFeedback}</div>}
        </div>
      )}

      {user.role === 'Administrator' && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">User &amp; RBAC Management</span>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(newUser) });
              setNewUser({ username: '', full_name: '', role: 'Operator', password: '' });
              loadAdminData();
            }}
            style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}
          >
            <input placeholder="Username" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} required />
            <input placeholder="Full Name" value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} required />
            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })}>
              {['Administrator', 'Supervisor', 'Operator', 'Engineer', 'Maintenance', 'Viewer'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <input type="password" placeholder="Password (min 8)" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required />
            <button className="btn btn-primary" type="submit">Create User</button>
          </form>
          <div className="table-scroll">
            <table className="scada-table">
              <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {usersList.map((u) => (
                  <tr key={u.username}>
                    <td className="mono">{u.username}</td>
                    <td>{u.full_name}</td>
                    <td className="mono">{u.role}</td>
                    <td>
                      <span className={`badge ${u.enabled ? 'st-IN_SERVICE' : 'st-FAULT'}`}>
                        {u.enabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn"
                        disabled={u.username === user.username}
                        onClick={() =>
                          apiFetch(`/api/admin/users/${encodeURIComponent(u.username)}/status`, {
                            method: 'PUT',
                            body: JSON.stringify({ enabled: !u.enabled }),
                          }).then(loadAdminData)
                        }
                      >
                        {u.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {auditLogs.length > 0 && (
        <div className="panel">
          <div className="panel-header"><span className="panel-title">Cybersecurity Audit Log</span></div>
          <div className="table-scroll">
            <table className="scada-table">
              <thead><tr><th>Timestamp</th><th>User</th><th>Role</th><th>Action</th><th>Target</th><th>Result</th><th>Details</th></tr></thead>
              <tbody>
                {auditLogs.slice(0, 50).map((a) => (
                  <tr key={String(a.id)}>
                    <td className="mono" style={{ fontSize: 11 }}>{String(a.timestamp).slice(0, 19)}</td>
                    <td className="mono">{String(a.username)}</td>
                    <td className="mono">{String(a.role)}</td>
                    <td className="mono">{String(a.action)}</td>
                    <td className="mono">{String(a.target)}</td>
                    <td className="mono">{String(a.result)}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{String(a.details || '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};
