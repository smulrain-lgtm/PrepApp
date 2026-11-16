/**
 * Scenarios: the same store judged for a different situation. They change how
 * the figure is worked out for viewing only; the saved settings are untouched.
 * Our water already counts stored water only (taps assumed off), so there is no
 * separate "no water" scenario; "garage lost" covers this household's main risk.
 */
import type { Settings } from './model/types';

export type Scenario = 'home' | 'power_cut' | 'garage_lost' | 'go_bag';

export const SCENARIOS: { id: Scenario; label: string; description: string }[] = [
  { id: 'home', label: 'Home', description: 'Staying at home, with the settings as you set them.' },
  {
    id: 'power_cut',
    label: 'Power cut',
    description: 'No mains power: lighting counts too, alongside water, food and cooking gas.',
  },
  {
    id: 'garage_lost',
    label: 'Garage lost',
    description:
      'Only stock kept indoors and in the grab bags counts, as if the garage could not be reached.',
  },
  {
    id: 'go_bag',
    label: 'Go bag',
    description: 'Leaving home: only what is in the grab bags, judged against 72 hours, eaten cold.',
  },
];

export function applyScenario(settings: Settings, scenario: Scenario): Settings {
  switch (scenario) {
    case 'home':
      return settings;
    case 'power_cut':
      return {
        ...settings,
        criticalMetrics: [...new Set([...settings.criticalMetrics, 'light_days' as const])],
      };
    case 'garage_lost':
      return { ...settings, indoorOnly: true };
    case 'go_bag':
      return {
        ...settings,
        onlyLocation: 'grab_bag',
        targetDays: 3,
        goalDays: 3,
        // Eaten cold: no cooking fuel. Water and food for people (and pets, if any).
        criticalMetrics: ['water_l', 'kcal', 'pet_food_g'],
      };
  }
}

const KEY = 'prepapp.scenario';

export function loadScenario(): Scenario {
  try {
    const v = localStorage.getItem(KEY) as Scenario | null;
    return SCENARIOS.some((s) => s.id === v) ? v! : 'home';
  } catch {
    return 'home';
  }
}

export function saveScenario(s: Scenario): void {
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* per-device convenience only */
  }
}
