import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiDownload, apiFetch, connectTelemetryStream, getStoredToken, setStoredToken } from './api';
import { EquipmentFaceplate } from './components/EquipmentFaceplate';
import { LoginView } from './components/LoginView';
import { PidDiagram } from './components/PidDiagram';
import { TabKey, getNavItemMeta, getUserInitials } from './components/navigation/navConfig';
import { NavIcon } from './components/navigation/NavIcons';
import { ScadaSidebar, ThemeSwitcher } from './components/navigation/ScadaNavigation';
import {
  AlarmRecord,
  DriverStatus,
  EquipmentState,
  KpiItem,
  OperatingMode,
  ProcessAreaConfig,
  TagState,
  UserInfo,
} from './types';
import { AdminView } from './views/AdminView';
import { AlarmsView } from './views/AlarmsView';
import { EquipmentView } from './views/EquipmentView';
import { HistorianView } from './views/HistorianView';
import { WaterQualityView } from './views/WaterQualityView';

const REPORT_DESCRIPTIONS: Record<string, string> = {
  daily_production: '24-hour raw water intake, treated production volume, water recovery, and chemical consumption.',
  weekly_production: '7-day production totals, recovery ratio, and chemical efficiency summary.',
  monthly_production: '30-day plant production performance and volumetric KPIs.',
  water_quality: 'Snapshot of online water quality analyzers vs. configured operational and alarm thresholds.',
  chemical_consumption: 'Coagulant and chlorine dosing consumption normalized per cubic meter treated.',
  equipment_runtime: 'Cumulative operating hours, start/stop counts, and active state for all plant assets.',
  alarm_history: 'Chronological ISA-18.2 alarm record including raise/clear timestamps and acknowledgments.',
  downtime: 'Assets currently in FAULT, TRAVEL_FAULT, MAINTENANCE, or OUT_OF_SERVICE states.',
  maintenance: 'Operator and maintenance technician lockout and return-to-service work logs.',
  energy_consumption: 'Specific energy consumption KPI (requires instrumented power meter tag EIT-701).',
};

export const App: React.FC = () => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [tab, setTab] = useState<TabKey>('pid');
  const [navOpen, setNavOpen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsRetryAttempt, setWsRetryAttempt] = useState(0);

  const [plantName, setPlantName] = useState('Water Treatment Plant SCADA');
  const [operatingMode, setOperatingMode] = useState<OperatingMode>('SIMULATION');
  const [processAreas, setProcessAreas] = useState<Record<string, ProcessAreaConfig>>({});
  const [tags, setTags] = useState<TagState[]>([]);
  const [equipment, setEquipment] = useState<EquipmentState[]>([]);
  const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverStatus[]>([]);
  const [selectedEqId, setSelectedEqId] = useState<string | null>(null);

  const [tagFilter, setTagFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('ALL');
  const [kpis, setKpis] = useState<KpiItem[]>([]);
  const [kpiHours, setKpiHours] = useState(24);
  const [reportType, setReportType] = useState('daily_production');
  const [reportPreview, setReportPreview] = useState<{ columns: string[]; rows: string[][]; title: string } | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const loadOverview = useCallback(async () => {
    const ov = await apiFetch<{
      plant_name: string;
      operating_mode: OperatingMode;
      process_areas: Record<string, ProcessAreaConfig>;
      tags: TagState[];
      equipment: EquipmentState[];
      alarms: AlarmRecord[];
      drivers: DriverStatus[];
    }>('/api/plant/overview');
    setPlantName(ov.plant_name);
    setOperatingMode(ov.operating_mode);
    setProcessAreas(ov.process_areas);
    setTags(ov.tags);
    setEquipment(ov.equipment);
    setAlarms(ov.alarms);
    setDrivers(ov.drivers);
  }, []);

  useEffect(() => {
    const tok = getStoredToken();
    if (!tok) return;
    apiFetch<UserInfo>('/api/auth/me')
      .then((u) => {
        setUser(u);
        return loadOverview();
      })
      .catch(() => {
        setStoredToken(null);
      });
  }, [loadOverview]);

  useEffect(() => {
    if (!user) return;
    const tok = getStoredToken();
    if (!tok) return;
    const sub = connectTelemetryStream(
      tok,
      (payload: unknown) => {
        const p = payload as {
          frame_type?: 'FULL' | 'TICK';
          operating_mode?: OperatingMode;
          tags?: Partial<TagState>[];
          equipment?: EquipmentState[];
          alarms?: AlarmRecord[];
          drivers?: DriverStatus[];
        };
        if (p.operating_mode) setOperatingMode(p.operating_mode);
        if (p.tags) {
          if (p.frame_type === 'TICK') {
            const patchMap = new Map(p.tags.map((t) => [t.tag_name, t]));
            setTags((prev) =>
              prev.length === 0
                ? prev
                : prev.map((existing) => {
                    const patch = patchMap.get(existing.tag_name);
                    return patch ? { ...existing, ...patch } : existing;
                  })
            );
          } else {
            setTags(p.tags as TagState[]);
          }
        }
        if (p.equipment) setEquipment(p.equipment);
        if (p.alarms) setAlarms(p.alarms);
        if (p.drivers) setDrivers(p.drivers);
      },
      (connected, attempt) => {
        setWsConnected(connected);
        setWsRetryAttempt(attempt);
      }
    );
    return () => sub.close();
  }, [user]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const loadKpis = useCallback(async () => {
    const res = await apiFetch<{ kpis: KpiItem[] }>(`/api/analytics/kpis?hours=${kpiHours}`);
    setKpis(res.kpis);
  }, [kpiHours]);

  useEffect(() => {
    if (user && tab === 'kpis') {
      loadKpis().catch(() => {});
    }
  }, [tab, user, loadKpis]);

  const handleLogout = () => {
    setStoredToken(null);
    setUser(null);
  };

  const selectedEq = useMemo(
    () => equipment.find((e) => e.id === selectedEqId) || null,
    [equipment, selectedEqId]
  );

  const unackCount = alarms.filter((a) => !a.acknowledged).length;
  const activeCount = alarms.filter((a) => a.active).length;
  const activePageMeta = useMemo(() => getNavItemMeta(tab), [tab]);

  if (!user) {
    return (
      <LoginView
        onSuccess={(tok, u) => {
          setStoredToken(tok);
          setUser(u);
          loadOverview().catch(() => {});
        }}
      />
    );
  }

  return (
    <div className="scada-shell">
      <header className="top-bar">
        <div className="top-bar-left">
          <button
            type="button"
            className="btn nav-toggle"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            style={{ gap: 6 }}
          >
            <NavIcon name="menu" size={15} />
            <span>Menu</span>
          </button>
          <span className="plant-title" title={plantName}>{plantName}</span>
          <span className={`mode-badge mode-${operatingMode}`}>{operatingMode} MODE</span>
          <span className={`mono ${wsConnected ? 'header-ok' : 'header-err'}`} style={{ fontSize: 11 }}>
            {wsConnected ? 'WS: LIVE' : `WS: RETRY (${wsRetryAttempt})`}
          </span>
        </div>
        <div className="top-bar-right">
          <ThemeSwitcher theme={theme} onChange={setTheme} variant="header" />
          <span className="top-bar-sep" aria-hidden="true" />
          <div className="user-chip" title={`${user.full_name} (${user.role})`}>
            <span className="user-avatar" aria-hidden="true">{getUserInitials(user.full_name)}</span>
            <span className="user-chip-name">{user.full_name}</span>
            <span className="user-role-tag">{user.role}</span>
          </div>
          <button
            type="button"
            className="btn btn-signout"
            onClick={handleLogout}
            aria-label="Sign out of SCADA session"
          >
            <NavIcon name="logout" size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <div className={`alarm-banner ${unackCount > 0 ? 'has-unack' : ''}`}>
        <div className="toolbar" style={{ gap: 12 }}>
          <span className="mono" style={{ fontWeight: 700 }}>
            ALARMS: {activeCount} ACTIVE | {unackCount} UNACKNOWLEDGED
          </span>
          {alarms[0] && (
            <span className="mono" style={{ color: 'var(--text-primary)' }}>
              Latest: [P{alarms[0].priority}] {alarms[0].source} — {alarms[0].description}
            </span>
          )}
        </div>
        <button className="btn btn-sm" onClick={() => setTab('alarms')}>Open Alarm Summary</button>
      </div>

      <div className="main-body">
        <div className={`nav-backdrop ${navOpen ? 'open' : ''}`} onClick={() => setNavOpen(false)} />
        <ScadaSidebar
          activeTab={tab}
          onSelectTab={setTab}
          navOpen={navOpen}
          onCloseNav={() => setNavOpen(false)}
          activeAlarmCount={activeCount}
          unackAlarmCount={unackCount}
          theme={theme}
          onChangeTheme={setTheme}
          user={user}
          onLogout={handleLogout}
        />

        <main className="content-area">
          <div className="page-context-bar">
            <span className="page-context-icon">
              <NavIcon name={activePageMeta.item.icon} size={15} />
            </span>
            <span className="page-context-group">{activePageMeta.groupLabel}</span>
            <NavIcon name="chevronRight" size={13} className="page-context-sep" />
            <span className="page-context-title">{activePageMeta.item.title}</span>
            <span className="page-context-sub">— {activePageMeta.item.subtitle}</span>
          </div>

          {tab === 'pid' && (
            <>
              <div className="grid-4">
                {[
                  { tag: 'FIT-101', label: 'Raw Water Intake Flow', dest: 'historian' as TabKey },
                  { tag: 'AIT-501_TURB', label: 'Filtered Turbidity', dest: 'quality' as TabKey },
                  { tag: 'AIT-601_CL2', label: 'Free Residual Cl2', dest: 'quality' as TabKey },
                  { tag: 'FIT-701', label: 'Distribution Flow', dest: 'historian' as TabKey },
                ].map(({ tag, label, dest }) => {
                  const t = tags.find((x) => x.tag_name === tag);
                  const valText = !t
                    ? '--'
                    : t.quality !== 'GOOD'
                      ? t.quality
                      : typeof t.value === 'number'
                        ? t.value.toFixed(2)
                        : String(t.value);
                  return (
                    <div
                      key={tag}
                      className="kpi-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => setTab(dest)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTab(dest); }}
                    >
                      <div className="kpi-card-top">
                        <span className="kpi-card-label">{label}</span>
                        <span className={`badge q-${t?.quality || 'BAD'}`}>{t?.quality || 'N/A'}</span>
                      </div>
                      <div className="kpi-card-val">
                        {valText}
                        {t?.quality === 'GOOD' && t.engineering_unit && (
                          <span className="kpi-card-unit">{t.engineering_unit}</span>
                        )}
                      </div>
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                        Tag: {tag}
                      </div>
                    </div>
                  );
                })}
              </div>
              <PidDiagram
                tags={tags}
                equipment={equipment}
                alarms={alarms}
                processAreas={processAreas}
                onSelectEquipment={(eq) => setSelectedEqId(eq.id)}
              />
            </>
          )}

          {tab === 'areas' && (
            <div className="grid-2">
              {Object.entries(processAreas).map(([key, cfg]) => {
                const areaTags = tags.filter((t) => t.process_area === key);
                return (
                  <div key={key} className="panel" style={{ opacity: cfg.enabled ? 1 : 0.6 }}>
                    <div className="panel-header">
                      <span className="panel-title">{cfg.code}. {cfg.name}</span>
                      <span className={`badge ${cfg.enabled ? 'st-IN_SERVICE' : 'st-OFFLINE'}`}>
                        {cfg.enabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 8 }}>{cfg.description}</div>
                    {cfg.enabled ? (
                      <>
                        <div className="table-scroll">
                          <table className="scada-table">
                            <thead>
                              <tr>
                                <th>Tag</th>
                                <th>Description</th>
                                <th className="num">Value</th>
                                <th>Quality</th>
                              </tr>
                            </thead>
                            <tbody>
                              {areaTags.slice(0, 8).map((t) => (
                                <tr key={t.tag_name}>
                                  <td className="mono">{t.tag_name}</td>
                                  <td>{t.description}</td>
                                  <td className="num">
                                    {t.quality === 'GOOD' ? `${t.value} ${t.engineering_unit}` : t.quality}
                                  </td>
                                  <td><span className={`badge q-${t.quality}`}>{t.quality}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Showing {Math.min(8, areaTags.length)} of {areaTags.length} tags
                          </span>
                          <button
                            className="btn btn-sm"
                            onClick={() => {
                              setAreaFilter(key);
                              setTab('tags');
                            }}
                          >
                            View All in Tag Browser
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="empty-state">Unit not configured for this plant.</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'tags' && (
            <>
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">Communication Drivers</span>
                </div>
                <div className="table-scroll">
                  <table className="scada-table">
                    <thead>
                      <tr>
                        <th>Driver ID</th>
                        <th>Protocol</th>
                        <th>Enabled</th>
                        <th>Connected</th>
                        <th className="num">Errors</th>
                        <th>Last Error / Note</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drivers.map((d) => (
                        <tr key={d.id}>
                          <td className="mono">{d.id}</td>
                          <td className="mono">{d.protocol} {d.simulated ? '(SIM)' : ''}</td>
                          <td>{d.enabled ? 'YES' : 'NO'}</td>
                          <td><span className={`badge ${d.connected ? 'st-IN_SERVICE' : 'st-FAULT'}`}>{d.connected ? 'CONNECTED' : 'OFFLINE'}</span></td>
                          <td className="num">{d.error_count}</td>
                          <td style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{d.last_error || d.description}</td>
                          <td>
                            <button
                              className="btn btn-sm"
                              disabled={!['Administrator', 'Engineer'].includes(user.role)}
                              onClick={() => apiFetch(`/api/drivers/${d.id}/reconnect`, { method: 'POST' }).then(loadOverview)}
                            >
                              Reconnect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">Real-Time Tag Browser ({tags.length})</span>
                  <div className="toolbar">
                    <input placeholder="Filter tag or description..." value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} />
                    <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
                      <option value="ALL">All Areas</option>
                      {Object.entries(processAreas).map(([k, v]) => (
                        <option key={k} value={k}>{v.code}. {v.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="scada-table">
                    <thead>
                      <tr>
                        <th>Tag Name</th>
                        <th>Description</th>
                        <th>Area</th>
                        <th className="num">Value</th>
                        <th>Unit</th>
                        <th>Quality</th>
                        <th>Last Good (UTC)</th>
                        <th>Source Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tags
                        .filter((t) => areaFilter === 'ALL' || t.process_area === areaFilter)
                        .filter(
                          (t) =>
                            !tagFilter ||
                            t.tag_name.toLowerCase().includes(tagFilter.toLowerCase()) ||
                            t.description.toLowerCase().includes(tagFilter.toLowerCase())
                        )
                        .map((t) => (
                          <tr key={t.tag_name}>
                            <td className="mono" style={{ fontWeight: 600 }}>{t.tag_name}</td>
                            <td>{t.description}</td>
                            <td className="mono">{t.process_area}</td>
                            <td className="num">{t.quality === 'GOOD' ? String(t.value) : '--'}</td>
                            <td className="mono">{t.engineering_unit}</td>
                            <td><span className={`badge q-${t.quality}`}>{t.quality}</span></td>
                            <td className="mono">{t.last_good_timestamp ? t.last_good_timestamp.slice(0, 19) : '-'}</td>
                            <td className="mono" style={{ color: 'var(--text-muted)' }}>{t.source_address}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {tab === 'equipment' && (
            <EquipmentView equipment={equipment} onSelectEquipment={(eq) => setSelectedEqId(eq.id)} />
          )}

          {tab === 'alarms' && (
            <AlarmsView alarms={alarms} userRole={user.role} onRefresh={loadOverview} />
          )}

          {tab === 'historian' && <HistorianView tags={tags} />}

          {tab === 'quality' && <WaterQualityView userRole={user.role} />}

          {tab === 'kpis' && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Process Analytics &amp; KPIs</span>
                <div className="toolbar">
                  <select value={kpiHours} onChange={(e) => setKpiHours(Number(e.target.value))}>
                    <option value={1}>1 Hour</option>
                    <option value={24}>24 Hours</option>
                    <option value={168}>7 Days</option>
                  </select>
                  <button className="btn btn-primary" onClick={loadKpis}>Recalculate</button>
                </div>
              </div>
              <div className="grid-2">
                {kpis.map((k) => (
                  <div key={k.id} className="panel" style={{ background: 'var(--bg-panel-alt)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <strong>{k.name}</strong>
                      <span className={`badge st-${k.status}`}>{k.status}</span>
                    </div>
                    <div className="mono" style={{ fontSize: 20, fontWeight: 700, margin: '6px 0' }}>
                      {k.value !== null ? `${k.value} ${k.unit}` : 'INSUFFICIENT DATA'}
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Formula: {k.formula}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Sources: {k.sources.join(', ')} | Completeness: {k.completeness_pct}%
                    </div>
                    {k.missing_reason && (
                      <div className="status-err" style={{ fontSize: 11, marginTop: 4 }}>{k.missing_reason}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'reports' && (
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Plant Reporting &amp; Export</span>
                <div className="toolbar">
                  <select value={reportType} onChange={(e) => { setReportType(e.target.value); setReportPreview(null); }}>
                    <option value="daily_production">Daily Production</option>
                    <option value="weekly_production">Weekly Production</option>
                    <option value="monthly_production">Monthly Production</option>
                    <option value="water_quality">Water Quality</option>
                    <option value="chemical_consumption">Chemical Consumption</option>
                    <option value="equipment_runtime">Equipment Runtime</option>
                    <option value="alarm_history">Alarm History</option>
                    <option value="downtime">Downtime &amp; Faults</option>
                    <option value="maintenance">Maintenance Logs</option>
                    <option value="energy_consumption">Energy Consumption</option>
                  </select>
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      apiFetch<{ columns: string[]; rows: string[][]; title: string }>(`/api/reports/${reportType}?format=json`).then(
                        setReportPreview
                      )
                    }
                  >
                    Preview
                  </button>
                  <button className="btn" onClick={() => apiDownload(`/api/reports/${reportType}?format=csv`, `${reportType}.csv`)}>
                    Download CSV
                  </button>
                  <button className="btn btn-warn" onClick={() => apiDownload(`/api/reports/${reportType}?format=pdf`, `${reportType}.pdf`)}>
                    Download PDF
                  </button>
                </div>
              </div>
              {reportPreview ? (
                <div className="table-scroll">
                  <table className="scada-table">
                    <thead>
                      <tr>{reportPreview.columns.map((c) => <th key={c}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {reportPreview.rows.length === 0 ? (
                        <tr>
                          <td colSpan={reportPreview.columns.length} className="empty-state">
                            No records available for this reporting period.
                          </td>
                        </tr>
                      ) : (
                        reportPreview.rows.map((r, i) => (
                          <tr key={i}>{r.map((cell, j) => <td key={j} className="mono">{cell}</td>)}</tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="panel" style={{ background: 'var(--bg-panel-alt)' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    {reportType.replace(/_/g, ' ').toUpperCase()}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>
                    {REPORT_DESCRIPTIONS[reportType]}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11.5, marginTop: 8 }}>
                    Click <strong>Preview</strong> to inspect tabular data, or export directly to <strong>CSV</strong> / <strong>PDF</strong> with reporting metadata and timestamps.
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'admin' && (
            <AdminView
              user={user}
              operatingMode={operatingMode}
              processAreas={processAreas}
              onRefreshOverview={loadOverview}
            />
          )}
        </main>
      </div>

      {selectedEq && (
        <EquipmentFaceplate
          equipment={selectedEq}
          tags={tags}
          userRole={user.role}
          operatingMode={operatingMode}
          onClose={() => setSelectedEqId(null)}
          onRefresh={loadOverview}
        />
      )}
    </div>
  );
};
