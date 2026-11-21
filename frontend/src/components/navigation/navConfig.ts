export type TabKey =
  | 'pid'
  | 'areas'
  | 'tags'
  | 'equipment'
  | 'alarms'
  | 'historian'
  | 'quality'
  | 'kpis'
  | 'reports'
  | 'admin';

export type NavIconName =
  | 'plant'
  | 'stages'
  | 'equipment'
  | 'alarms'
  | 'trends'
  | 'quality'
  | 'kpis'
  | 'reports'
  | 'sensors'
  | 'admin';

export interface NavItemDef {
  key: TabKey;
  title: string;
  subtitle: string;
  icon: NavIconName;
  keywords: string[];
}

export interface NavGroupDef {
  label: string;
  items: NavItemDef[];
}

export interface FilteredNavItem extends NavItemDef {
  badge?: number;
  crit?: boolean;
}

export interface FilteredNavGroup {
  label: string;
  items: FilteredNavItem[];
}

export const NAV_GROUPS: NavGroupDef[] = [
  {
    label: 'Plant Operations',
    items: [
      {
        key: 'pid',
        title: 'Plant Overview',
        subtitle: 'Interactive process & P&ID',
        icon: 'plant',
        keywords: ['pid', 'diagram', 'map', 'overview', 'plant', 'pump', 'tank', 'mixer', 'home', 'scada', 'process'],
      },
      {
        key: 'areas',
        title: 'Process Stages (A–H)',
        subtitle: 'All 8 treatment steps',
        icon: 'stages',
        keywords: ['areas', 'stages', 'intake', 'coagulation', 'flocculation', 'sedimentation', 'filtration', 'disinfection', 'sludge', 'steps'],
      },
      {
        key: 'equipment',
        title: 'Equipment Control',
        subtitle: 'Pumps, valves & mixers',
        icon: 'equipment',
        keywords: ['equipment', 'pump', 'valve', 'mixer', 'blower', 'motor', 'control', 'start', 'stop', 'maintenance'],
      },
      {
        key: 'alarms',
        title: 'Alarms & Events',
        subtitle: 'Active faults & alerts',
        icon: 'alarms',
        keywords: ['alarms', 'alerts', 'fault', 'warning', 'error', 'events', 'acknowledge', 'critical'],
      },
    ],
  },
  {
    label: 'Quality & Analytics',
    items: [
      {
        key: 'historian',
        title: 'Trends & History',
        subtitle: 'Live & past charts',
        icon: 'trends',
        keywords: ['historian', 'trend', 'chart', 'graph', 'history', 'time series', 'plot', 'log'],
      },
      {
        key: 'quality',
        title: 'Water Quality',
        subtitle: 'pH, turbidity & chlorine',
        icon: 'quality',
        keywords: ['quality', 'ph', 'turbidity', 'chlorine', 'cl2', 'tds', 'conductivity', 'water', 'lab'],
      },
      {
        key: 'kpis',
        title: 'Performance KPIs',
        subtitle: 'Recovery & efficiency',
        icon: 'kpis',
        keywords: ['kpi', 'analytics', 'efficiency', 'performance', 'metrics', 'production', 'recovery'],
      },
      {
        key: 'reports',
        title: 'Reports & Export',
        subtitle: 'Download CSV & PDF',
        icon: 'reports',
        keywords: ['reports', 'export', 'csv', 'pdf', 'download', 'daily', 'weekly', 'monthly', 'print'],
      },
    ],
  },
  {
    label: 'System & Engineering',
    items: [
      {
        key: 'tags',
        title: 'Sensors & Drivers',
        subtitle: 'Live tags & PLC links',
        icon: 'sensors',
        keywords: ['tags', 'sensors', 'drivers', 'plc', 'modbus', 'opcua', 'mqtt', 'telemetry', 'raw'],
      },
      {
        key: 'admin',
        title: 'Admin & Security',
        subtitle: 'Users, modes & faults',
        icon: 'admin',
        keywords: ['admin', 'security', 'users', 'roles', 'simulation', 'settings', 'config', 'fault'],
      },
    ],
  },
];

export function getNavItemMeta(key: TabKey): { groupLabel: string; item: NavItemDef } {
  for (const group of NAV_GROUPS) {
    const found = group.items.find((item) => item.key === key);
    if (found) {
      return { groupLabel: group.label, item: found };
    }
  }
  return { groupLabel: NAV_GROUPS[0].label, item: NAV_GROUPS[0].items[0] };
}

export function getUserInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function filterNavGroups(
  groups: NavGroupDef[],
  query: string,
  alarmBadge?: { activeCount: number; unackCount: number }
): FilteredNavGroup[] {
  const q = query.trim().toLowerCase();

  const scoreItem = (item: NavItemDef): number => {
    if (!q) return 1;
    const title = item.title.toLowerCase();
    const sub = item.subtitle.toLowerCase();
    const kws = item.keywords.map((k) => k.toLowerCase());

    if (title === q || kws.includes(q)) return 4;
    if (
      title.split(/\s+/).some((w) => w.startsWith(q)) ||
      sub.split(/\s+/).some((w) => w.startsWith(q)) ||
      kws.some((k) => k.startsWith(q))
    ) {
      return 3;
    }
    if (title.includes(q) || sub.includes(q) || item.key.toLowerCase().includes(q)) return 2;
    if (kws.some((k) => k.includes(q))) return 1;
    return 0;
  };

  const toFiltered = (item: NavItemDef): FilteredNavItem => {
    if (item.key === 'alarms' && alarmBadge) {
      return {
        ...item,
        badge: alarmBadge.activeCount,
        crit: alarmBadge.unackCount > 0,
      };
    }
    return { ...item };
  };

  if (!q) {
    return groups.map((group) => ({
      label: group.label,
      items: group.items.map(toFiltered),
    }));
  }

  return groups
    .map((group) => {
      const scored = group.items
        .map((item) => ({ item, score: scoreItem(item) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      const maxScore = scored.reduce((m, x) => Math.max(m, x.score), 0);
      return {
        label: group.label,
        maxScore,
        items: scored.map((x) => toFiltered(x.item)),
      };
    })
    .filter((g) => g.items.length > 0)
    .sort((a, b) => b.maxScore - a.maxScore)
    .map(({ label, items }) => ({ label, items }));
}
