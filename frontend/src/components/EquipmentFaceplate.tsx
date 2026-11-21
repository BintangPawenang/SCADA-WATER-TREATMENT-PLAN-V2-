import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { EquipmentState, OperatingMode, Role, TagState } from '../types';

interface FaceplateProps {
  equipment: EquipmentState;
  tags: TagState[];
  userRole: Role;
  operatingMode: OperatingMode;
  onClose: () => void;
  onRefresh: () => void;
}

export const EquipmentFaceplate: React.FC<FaceplateProps> = ({
  equipment,
  tags,
  userRole,
  operatingMode,
  onClose,
  onRefresh,
}) => {
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [spValue, setSpValue] = useState<string>('');
  const [maintNote, setMaintNote] = useState<string>(equipment.maintenance_note || '');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canControl = ['Administrator', 'Supervisor', 'Operator'].includes(userRole);
  const canMaint = ['Administrator', 'Supervisor', 'Maintenance'].includes(userRole);
  const assocTags = tags.filter((t) => equipment.associated_tags.includes(t.tag_name) || t.tag_name === equipment.setpoint_tag);
  const spTag = equipment.setpoint_tag ? tags.find((t) => t.tag_name === equipment.setpoint_tag) : undefined;

  const sendCommand = async (action: string, value?: unknown, confirmed = true) => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ command_ack: string; feedback_state: string; message: string; simulated: boolean }>(
        '/api/control/command',
        {
          method: 'POST',
          body: JSON.stringify({ equipment_id: equipment.id, action, value, confirmed }),
        }
      );
      setFeedback({
        type: 'ok',
        text: `ACK: ${res.command_ack} | Feedback: ${res.feedback_state}${res.simulated ? ' [SIMULATION]' : ''} — ${res.message}`,
      });
      setConfirmAction(null);
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Command failed' });
    } finally {
      setBusy(false);
    }
  };

  const toggleMaintenance = async (enable: boolean) => {
    setBusy(true);
    setFeedback(null);
    try {
      await apiFetch(`/api/equipment/${equipment.id}/maintenance`, {
        method: 'POST',
        body: JSON.stringify({ enable, note: maintNote || 'Operator maintenance toggle' }),
      });
      setFeedback({ type: 'ok', text: enable ? 'Placed in MAINTENANCE' : 'Returned to service' });
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="faceplate-overlay" role="dialog" aria-modal="false" aria-label={`${equipment.tag} Faceplate`}>
      <div className="panel-header">
        <div>
          <div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>{equipment.tag} — {equipment.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {equipment.category} | Area: {equipment.process_area}
          </div>
        </div>
        <button className="btn btn-sm" onClick={onClose}>Close</button>
      </div>

      <div className="grid-2" style={{ marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ACTUAL STATE</div>
          <span className={`badge st-${equipment.state}`}>{equipment.state}</span>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>CONTROL MODE</div>
          <span className="badge mono">{equipment.control_mode}</span>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>RUNTIME HOURS</div>
          <div className="mono">{equipment.runtime_hours.toFixed(2)} h</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>STARTS / STOPS</div>
          <div className="mono">{equipment.start_count} / {equipment.stop_count}</div>
        </div>
      </div>

      {equipment.command_ack_status && (
        <div style={{ fontSize: 11, marginBottom: 8, color: 'var(--text-secondary)' }}>
          Last Command Ack: <span className="mono">{equipment.command_ack_status}</span>
        </div>
      )}

      {assocTags.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-secondary)' }}>ASSOCIATED MEASUREMENTS</div>
          <table className="scada-table">
            <tbody>
              {assocTags.map((t) => (
                <tr key={t.tag_name}>
                  <td className="mono">{t.tag_name}</td>
                  <td className="mono">{t.quality === 'GOOD' ? `${t.value} ${t.engineering_unit}` : t.quality}</td>
                  <td><span className={`badge q-${t.quality}`}>{t.quality}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {equipment.controllable && canControl && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
            SUPERVISORY CONTROL {operatingMode === 'DEMO' ? '(BLOCKED IN DEMO MODE)' : operatingMode === 'SIMULATION' ? '(SIMULATION ONLY)' : ''}
          </div>
          {equipment.mode_tag && (
            <div className="toolbar" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Mode:</span>
              {(['REMOTE', 'AUTO', 'MANUAL'] as const).map((m) => (
                <button
                  key={m}
                  className={`btn btn-sm ${equipment.control_mode === m ? 'btn-primary' : ''}`}
                  disabled={busy || operatingMode === 'DEMO' || equipment.control_mode === 'LOCAL'}
                  onClick={() => sendCommand('SET_MODE', m, true)}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          <div className="toolbar">
            {equipment.category === 'FILTER' && equipment.command_tag ? (
              <button
                className="btn btn-warn"
                disabled={busy || operatingMode === 'DEMO'}
                onClick={() => setConfirmAction('START_BACKWASH')}
              >
                Start Backwash
              </button>
            ) : equipment.category.includes('VALVE') && equipment.command_tag ? (
              <>
                <button className="btn btn-primary" disabled={busy || operatingMode === 'DEMO'} onClick={() => setConfirmAction('OPEN')}>
                  Open Valve
                </button>
                <button className="btn btn-danger" disabled={busy || operatingMode === 'DEMO'} onClick={() => setConfirmAction('CLOSE')}>
                  Close Valve
                </button>
              </>
            ) : equipment.command_tag ? (
              <>
                <button className="btn btn-primary" disabled={busy || operatingMode === 'DEMO'} onClick={() => setConfirmAction('START')}>
                  Start
                </button>
                <button className="btn btn-danger" disabled={busy || operatingMode === 'DEMO'} onClick={() => setConfirmAction('STOP')}>
                  Stop
                </button>
              </>
            ) : null}
          </div>

          {equipment.setpoint_tag && (
            <div className="toolbar" style={{ marginTop: 8 }}>
              <input
                type="number"
                step="any"
                min={spTag?.min_setpoint ?? undefined}
                max={spTag?.max_setpoint ?? undefined}
                placeholder={
                  spTag && spTag.min_setpoint !== null && spTag.max_setpoint !== null
                    ? `SP (${spTag.min_setpoint}..${spTag.max_setpoint} ${spTag.engineering_unit})`
                    : 'New setpoint'
                }
                value={spValue}
                onChange={(e) => setSpValue(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="btn"
                disabled={busy || !spValue || operatingMode === 'DEMO'}
                onClick={() => sendCommand('SET_SETPOINT', Number(spValue), true)}
              >
                Set SP
              </button>
            </div>
          )}

          {confirmAction && (
            <div style={{ marginTop: 8, padding: 8, background: 'var(--warn-bg)', border: '1px solid var(--warn)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Confirm critical command: {confirmAction} on {equipment.tag}?
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-danger" disabled={busy} onClick={() => sendCommand(confirmAction, undefined, true)}>
                  Confirm Execute
                </button>
                <button className="btn" onClick={() => setConfirmAction(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {canMaint && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>MAINTENANCE LOCKOUT</div>
          <input
            type="text"
            placeholder="Maintenance reason / work order"
            value={maintNote}
            onChange={(e) => setMaintNote(e.target.value)}
            style={{ width: '100%', marginBottom: 6 }}
          />
          {equipment.state === 'MAINTENANCE' ? (
            <button className="btn btn-primary" disabled={busy} onClick={() => toggleMaintenance(false)}>
              Return to Service
            </button>
          ) : (
            <button className="btn btn-warn" disabled={busy} onClick={() => toggleMaintenance(true)}>
              Place in Maintenance
            </button>
          )}
        </div>
      )}

      {feedback && (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            fontSize: 11.5,
            background: feedback.type === 'ok' ? 'var(--good-bg)' : 'var(--crit-bg)',
            border: `1px solid ${feedback.type === 'ok' ? 'var(--good)' : 'var(--crit)'}`,
          }}
        >
          {feedback.text}
        </div>
      )}
    </aside>
  );
};
