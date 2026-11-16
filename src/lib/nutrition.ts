/**
 * Label figures: pack size and nutrition per 100 g / 100 ml, and the calories
 * per unit they give (pack size × kcal per 100 g ÷ 100).
 */
import type { Item, Nutrition, PackSize, PackUnit } from './model/types';

export const NUTRIENTS: { key: keyof Nutrition; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Energy', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'carbs', label: 'Carbohydrate', unit: 'g' },
  { key: 'salt', label: 'Salt', unit: 'g' },
];

/** A finite, non-negative number, or undefined. Accepts form values (strings, null). */
export function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Round to one decimal place (kcal to whole numbers). */
function tidy(key: keyof Nutrition, value: number): number {
  return key === 'kcal' ? Math.round(value) : Math.round(value * 10) / 10;
}

/** Clean nutrition: drops blanks, rounds; undefined when nothing is left. */
export function cleanNutrition(input: Record<string, unknown> | undefined): Nutrition | undefined {
  if (!input) return undefined;
  const out: Nutrition = {};
  for (const { key } of NUTRIENTS) {
    const n = num(input[key]);
    if (n !== undefined) out[key] = tidy(key, n);
  }
  return Object.keys(out).length ? out : undefined;
}

export function cleanPackSize(amount: unknown, unit: PackUnit): PackSize | undefined {
  const n = num(amount);
  return n ? { amount: n, unit } : undefined;
}

/** Calories in one unit from the label, or null without both figures. */
export function kcalPerUnit(packSize: PackSize | undefined, nutrition: Nutrition | undefined): number | null {
  if (!packSize?.amount || nutrition?.kcal === undefined) return null;
  return Math.round((packSize.amount * nutrition.kcal) / 100);
}

/** True when the item's calories come from its label. */
export function caloriesFromLabel(item: Item): boolean {
  return item.perUnit.metric === 'kcal' && kcalPerUnit(item.packSize, item.nutrition) !== null;
}

/**
 * Read a pack size as printed, e.g. "400 g", "1.5kg", "500ml", "2 L",
 * "4 x 125 g" (multipacks are totalled). Null when it cannot be read.
 */
export function parsePackSize(text: string | undefined | null): PackSize | null {
  if (!text) return null;
  const m = text
    .toLowerCase()
    .replace(',', '.')
    .match(/(?:(\d+)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(kg|g|gr|grams?|ml|cl|l|litres?|liters?)\b/);
  if (!m) return null;
  const count = m[1] ? Number(m[1]) : 1;
  const value = Number(m[2]) * count;
  const unit = m[3];
  if (unit === 'kg') return { amount: value * 1000, unit: 'g' };
  if (unit.startsWith('g')) return { amount: value, unit: 'g' };
  if (unit === 'ml') return { amount: value, unit: 'ml' };
  if (unit === 'cl') return { amount: value * 10, unit: 'ml' };
  return { amount: value * 1000, unit: 'ml' };
}

/** "400 g", "1.5 kg", "2 L" for display. */
export function formatPackSize(size: PackSize | undefined): string {
  if (!size) return '';
  const big = size.amount >= 1000;
  const n = big ? size.amount / 1000 : size.amount;
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
  if (size.unit === 'g') return `${text} ${big ? 'kg' : 'g'}`;
  return `${text} ${big ? 'L' : 'ml'}`;
}
