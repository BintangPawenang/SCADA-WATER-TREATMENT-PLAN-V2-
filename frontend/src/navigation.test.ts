import { describe, expect, it } from 'vitest';
import {
  NAV_GROUPS,
  TabKey,
  filterNavGroups,
  getNavItemMeta,
  getUserInitials,
} from './components/navigation/navConfig';

describe('SCADA navigation metadata and search filtering', () => {
  it('covers all 10 SCADA tabs with unique keys and descriptive metadata', () => {
    const expectedTabs: TabKey[] = [
      'pid',
      'areas',
      'equipment',
      'alarms',
      'historian',
      'quality',
      'kpis',
      'reports',
      'tags',
      'admin',
    ];
    const items = NAV_GROUPS.flatMap((g) => g.items);
    const keys = items.map((i) => i.key);

    expect(new Set(keys).size).toBe(expectedTabs.length);
    for (const tab of expectedTabs) {
      expect(keys).toContain(tab);
    }
    for (const item of items) {
      expect(item.title.trim().length).toBeGreaterThan(0);
      expect(item.subtitle.trim().length).toBeGreaterThan(0);
      expect(item.keywords.length).toBeGreaterThan(0);
    }
  });

  it('matches plain-language synonyms, case-insensitively with relevance ranking', () => {
    const phMatches = filterNavGroups(NAV_GROUPS, '  PH ').flatMap((g) => g.items.map((i) => i.key));
    expect(phMatches[0]).toBe('quality');

    const chartMatches = filterNavGroups(NAV_GROUPS, 'chart').flatMap((g) => g.items.map((i) => i.key));
    expect(chartMatches[0]).toBe('historian');

    const pdfMatches = filterNavGroups(NAV_GROUPS, 'PDF').flatMap((g) => g.items.map((i) => i.key));
    expect(pdfMatches[0]).toBe('reports');

    const pumpMatches = filterNavGroups(NAV_GROUPS, 'pump').flatMap((g) => g.items.map((i) => i.key));
    expect(pumpMatches).toContain('pid');
    expect(pumpMatches).toContain('equipment');

    const modbusMatches = filterNavGroups(NAV_GROUPS, 'modbus').flatMap((g) => g.items.map((i) => i.key));
    expect(modbusMatches[0]).toBe('tags');
  });

  it('returns empty group list when search query matches nothing', () => {
    const result = filterNavGroups(NAV_GROUPS, 'zzzzz-no-match');
    expect(result).toEqual([]);
  });

  it('preserves alarm badge count and critical state during filtering', () => {
    const allFiltered = filterNavGroups(NAV_GROUPS, '', { activeCount: 7, unackCount: 3 });
    const alarmItemAll = allFiltered.flatMap((g) => g.items).find((i) => i.key === 'alarms');
    expect(alarmItemAll?.badge).toBe(7);
    expect(alarmItemAll?.crit).toBe(true);

    const searched = filterNavGroups(NAV_GROUPS, 'alarm', { activeCount: 4, unackCount: 0 });
    const alarmItemSearched = searched.flatMap((g) => g.items).find((i) => i.key === 'alarms');
    expect(alarmItemSearched?.badge).toBe(4);
    expect(alarmItemSearched?.crit).toBe(false);
  });

  it('resolves active page metadata and user initials cleanly', () => {
    const meta = getNavItemMeta('historian');
    expect(meta.groupLabel).toBe('Quality & Analytics');
    expect(meta.item.title).toBe('Trends & History');

    expect(getUserInitials('Control Room Operator')).toBe('CO');
    expect(getUserInitials('Admin')).toBe('AD');
    expect(getUserInitials('   ')).toBe('U');
    expect(getUserInitials('')).toBe('U');
  });
});
