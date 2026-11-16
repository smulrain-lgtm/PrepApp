/**
 * Scenarios: the same store judged for a different situation. They change how
 * the figure is worked out for viewing only; the saved settings are untouched.
 * Our water already counts stored water only (taps assumed off) and Home
 * already assumes no mains power, so there is no "no water" or "power cut"
 * scenario; "garage lost" covers this household's main risk.
 */
import type { Settings } from './model/types';

export type Scenario = 'home' | 'garage_lost' | 'go_bag';

export const SCENARIOS: { id: Scenario; label: string; description: string }[] = [
  {
    id: 'home',
    label: 'Home',
    description: 'Staying at home without mains power: water, food, cooking gas and lighting all count.',
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
      return withPower(settings);
    case 'garage_lost':
      return { ...withPower(settings), indoorOnly: true };
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

/**
 * Power is a home requirement (1.3 folded the old Power cut scenario into
 * Home): lighting always counts, even on records saved before it did.
 */
export function withPower(settings: Settings): Settings {
  if (settings.criticalMetrics.includes('light_days')) return settings;
  return { ...settings, criticalMetrics: [...settings.criticalMetrics, 'light_days'] };
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
