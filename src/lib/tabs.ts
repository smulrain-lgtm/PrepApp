export type TabId = 'dashboard' | 'inventory' | 'lists' | 'rotation' | 'checklist' | 'info' | 'settings';

export interface Tab {
  id: TabId;
  label: string;
  /** SVG path data on a 24×24 grid, drawn as a stroke. */
  icon: string;
  /** Which stage of the build brings the screen to life. */
  stage: number;
}

export const tabs: Tab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M4 13a8 8 0 1 1 16 0M12 13l4-4M3 17h18', stage: 2 },
  { id: 'inventory', label: 'Inventory', icon: 'M4 7h16v13H4zM4 7l2-3h12l2 3M9 11h6', stage: 2 },
  {
    id: 'lists',
    label: 'Lists',
    icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
    stage: 5,
  },
  {
    id: 'rotation',
    label: 'Rotation',
    icon: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5M12 8v4l3 2',
    stage: 5,
  },
  {
    id: 'checklist',
    label: 'Checklist',
    icon: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
    stage: 3,
  },
  { id: 'info', label: 'Info', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5', stage: 3 },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'M4 6h9m4 0h3M4 12h3m4 0h9M4 18h11m4 0h1M15 4v4M9 10v4M17 16v4',
    stage: 0,
  },
];

export function isTabId(value: string): value is TabId {
  return tabs.some((t) => t.id === value);
}
