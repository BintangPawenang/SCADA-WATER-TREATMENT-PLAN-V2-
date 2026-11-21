import React, { useMemo, useState } from 'react';
import { UserInfo } from '../../types';
import {
  NAV_GROUPS,
  TabKey,
  filterNavGroups,
  getUserInitials,
} from './navConfig';
import { NavIcon } from './NavIcons';

export interface ThemeSwitcherProps {
  theme: 'dark' | 'light';
  onChange: (theme: 'dark' | 'light') => void;
  variant?: 'header' | 'sidebar';
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  theme,
  onChange,
  variant = 'header',
}) => {
  return (
    <div
      className={`theme-switch theme-switch-${variant}`}
      role="group"
      aria-label="Display theme"
    >
      <button
        type="button"
        className={`theme-switch-btn ${theme === 'dark' ? 'active-dark' : ''}`}
        aria-pressed={theme === 'dark'}
        onClick={() => onChange('dark')}
        title="Switch to Dark HMI theme"
      >
        <NavIcon name="moon" size={13} />
        <span>Dark</span>
      </button>
      <button
        type="button"
        className={`theme-switch-btn ${theme === 'light' ? 'active-light' : ''}`}
        aria-pressed={theme === 'light'}
        onClick={() => onChange('light')}
        title="Switch to Light HMI theme"
      >
        <NavIcon name="sun" size={13} />
        <span>Light</span>
      </button>
    </div>
  );
};

export interface ScadaSidebarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  navOpen: boolean;
  onCloseNav: () => void;
  activeAlarmCount: number;
  unackAlarmCount: number;
  theme: 'dark' | 'light';
  onChangeTheme: (theme: 'dark' | 'light') => void;
  user: UserInfo;
  onLogout: () => void;
}

export const ScadaSidebar: React.FC<ScadaSidebarProps> = ({
  activeTab,
  onSelectTab,
  navOpen,
  onCloseNav,
  activeAlarmCount,
  unackAlarmCount,
  theme,
  onChangeTheme,
  user,
  onLogout,
}) => {
  const [query, setQuery] = useState('');

  const filteredGroups = useMemo(
    () =>
      filterNavGroups(NAV_GROUPS, query, {
        activeCount: activeAlarmCount,
        unackCount: unackAlarmCount,
      }),
    [query, activeAlarmCount, unackAlarmCount]
  );

  const firstMatch = filteredGroups[0]?.items[0];
  const initials = getUserInitials(user.full_name);

  const handleSelect = (key: TabKey) => {
    onSelectTab(key);
    setQuery('');
    onCloseNav();
  };

  return (
    <nav
      className={`nav-rail ${navOpen ? 'open' : ''}`}
      aria-label="Primary SCADA Navigation"
    >
      <div className="nav-drawer-header">
        <span className="panel-title">Navigation</span>
        <button
          type="button"
          className="btn btn-sm"
          onClick={onCloseNav}
          aria-label="Close navigation menu"
          style={{ gap: 4 }}
        >
          <NavIcon name="close" size={13} />
          <span>Close</span>
        </button>
      </div>

      {/* Quick Page Finder */}
      <div className="nav-search-wrap">
        <div className="nav-search-box">
          <NavIcon name="search" size={14} className="nav-search-icon" />
          <input
            type="text"
            className="nav-search-input"
            placeholder="Find page (chart, pH, pump)..."
            aria-label="Find SCADA page"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && firstMatch) {
                e.preventDefault();
                handleSelect(firstMatch.key);
                setQuery('');
              } else if (e.key === 'Escape') {
                if (query) {
                  e.stopPropagation();
                  setQuery('');
                } else {
                  onCloseNav();
                }
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="nav-search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear page search"
              title="Clear search"
            >
              <NavIcon name="close" size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Navigation Groups */}
      <div className="nav-list">
        {filteredGroups.length === 0 ? (
          <div className="nav-empty-state">
            <div style={{ marginBottom: 8 }}>No page matching "{query.trim()}"</div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setQuery('')}
            >
              Show all pages
            </button>
          </div>
        ) : (
          filteredGroups.map((grp) => (
            <div key={grp.label} className="nav-group">
              <div className="nav-section-label">{grp.label}</div>
              {grp.items.map((item) => {
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`nav-item ${isActive ? 'active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => handleSelect(item.key)}
                  >
                    <span className="nav-icon-box">
                      <NavIcon name={item.icon} size={15} />
                    </span>
                    <span className="nav-item-text">
                      <span className="nav-item-title">{item.title}</span>
                      <span className="nav-item-sub">{item.subtitle}</span>
                    </span>
                    {item.badge !== undefined && (
                      <span className={`nav-pill ${item.crit ? 'crit' : ''}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Sticky Footer: Quick Appearance & Account Sign Out */}
      <div className="nav-footer">
        <div className="nav-footer-row">
          <span className="nav-footer-label">Appearance</span>
          <ThemeSwitcher
            theme={theme}
            onChange={onChangeTheme}
            variant="sidebar"
          />
        </div>

        <div className="nav-account-card">
          <div className="user-avatar" aria-hidden="true">
            {initials}
          </div>
          <div className="nav-account-meta">
            <div className="nav-account-name" title={user.full_name}>
              {user.full_name}
            </div>
            <div className="nav-account-role">{user.role}</div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-signout-sidebar"
          onClick={onLogout}
          aria-label="Sign out of SCADA session"
        >
          <NavIcon name="logout" size={14} />
          <span>Sign Out</span>
        </button>
      </div>
    </nav>
  );
};
