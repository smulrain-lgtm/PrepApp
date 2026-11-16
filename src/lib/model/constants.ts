import type { Category, DailyNeeds, LocationId, Metric, Settings } from './types';

export interface LocationInfo {
  id: LocationId;
  name: string;
  /** Counts as indoors for the "indoor stock only" and "freezing" toggles. */
  indoor: boolean;
}

export const LOCATIONS: LocationInfo[] = [
  { id: 'indoors', name: 'Indoors', indoor: true },
  { id: 'grab_bag', name: 'Grab bag', indoor: true },
  { id: 'garage', name: 'Garage', indoor: false },
  { id: 'car', name: 'Car', indoor: false },
];

export function isIndoor(location: LocationId): boolean {
  return LOCATIONS.find((l) => l.id === location)?.indoor ?? false;
}

export interface MetricInfo {
  id: Metric;
  label: string;
  unit: string;
}

/** Display order = tie-break order when two metrics share the lowest days. */
export const METRIC_INFO: MetricInfo[] = [
  { id: 'water_l', label: 'Water', unit: 'L' },
  { id: 'kcal', label: 'Food calories', unit: 'kcal' },
  { id: 'pet_food_g', label: 'Pet food', unit: 'g' },
  { id: 'fuel_g', label: 'Cooking fuel', unit: 'g' },
  { id: 'med_days', label: 'Medicines', unit: 'days' },
  { id: 'light_days', label: 'Lighting', unit: 'days' },
];

export const DEFAULT_DAILY_NEEDS: DailyNeeds = {
  waterLPerPerson: 4,
  kcalPerPerson: 2000,
  // One 230 g canister a day for 3 people.
  gasGPerPerson: 77,
};

/** Calorie estimates per food sub-category, used when a pack has no figure. */
export const DEFAULT_KCAL: Record<string, number> = {
  'Main meal': 500,
  Side: 300,
  Dessert: 350,
  Snack: 200,
  Drink: 100,
  Breakfast: 400,
};

/**
 * Sub-categories each category offers until the household edits the list
 * (Settings → Categories). Keyed by category id.
 */
export const DEFAULT_SUBCATEGORIES: Record<string, string[]> = {
  'category:water': ['Bottled water', 'Stored in containers'],
  'category:food-mains': ['Main meal', 'Breakfast'],
  'category:food-sides': ['Side'],
  'category:food-desserts': ['Dessert'],
  'category:food-snacks': ['Snack'],
  'category:food-drinks': ['Drink'],
  'category:food-ingredients': [
    'Flour & baking',
    'Pasta, rice & grains',
    'Tins & jars',
    'Beans & pulses',
    'Oils & fats',
    'Sugar & sweeteners',
    'Sauces & condiments',
    'Herbs, spices & stock',
  ],
  'category:pet-food': ['Dry food', 'Wet food', 'Treats'],
  'category:cooking-fuel': ['Gas', 'Wood & firelighters', 'Paraffin', 'Stoves & kit'],
  'category:power-light': ['Batteries', 'Torches & lanterns', 'Power banks & solar'],
  'category:safety-first-aid': ['First aid', 'Medicines', 'Safety kit'],
  'category:hygiene': ['Washing', 'Toilet & waste', 'Cleaning'],
  'category:warmth': ['Bedding', 'Clothing', 'Shelter'],
  'category:documents-money': ['Documents', 'Cash'],
  'category:garage-storage': ['Containers', 'Tools'],
};

/**
 * Added in 1.2. Its order sits between Drinks (4) and Pet food (6), so devices
 * set up before it need no renumbering. A fixed `updatedAt` makes the record
 * identical on every device, so adding it on two devices never conflicts.
 */
export const INGREDIENTS_CATEGORY: Category = {
  _id: 'category:food-ingredients',
  type: 'category',
  updatedAt: '2026-11-16T00:00:00.000Z',
  name: 'Food – Ingredients',
  icon: 'flour',
  order: 5.5,
  defaultMetric: 'kcal',
};

/** Categories added after first release: written on start-up if a device lacks them. */
export const ADDED_CATEGORIES: Category[] = [INGREDIENTS_CATEGORY];

export const DEFAULT_SETTINGS: Omit<Settings, 'updatedAt'> = {
  _id: 'settings',
  type: 'settings',
  people: 3,
  pets: [],
  targetDays: 3,
  considerExpiry: true,
  useSoonAtRisk: false,
  indoorOnly: false,
  freezing: false,
  warningMonths: 6,
  dailyNeeds: DEFAULT_DAILY_NEEDS,
  // Medicines are shown as essentials covered, and lighting via the checklist
  // (it becomes critical in the power-cut scenario), so neither sets the days.
  criticalMetrics: ['water_l', 'kcal', 'pet_food_g', 'fuel_g'],
  goalDays: 14,
  pastDateRule: 'exclude',
};

export const GOAL_PRESETS = [7, 14, 30, 90, 180, 365];

/** Medicine essentials, matched by checklist line name; covered when marked Have. */
export const MEDICINE_ESSENTIALS = [
  'First aid kit',
  'Prescription medicines',
  'Painkillers, antihistamines, diarrhoea relief',
  'Oral rehydration sachets',
];

/** Dates before this are treated as suspect: "check printed date". */
export const SUSPECT_DATE_BEFORE = '2005-01-01';
