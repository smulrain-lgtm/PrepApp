/**
 * Readiness engine: how many days the household's stock would last, which
 * category runs out first, and what is missing. Pure functions only: no
 * database, no clock (pass `today`), so every rule is unit-tested.
 *
 * Readiness days = the lowest days of cover across the critical metrics.
 * Days for a metric = usable stock ÷ daily demand.
 */
import { addDays, addMonths } from './model/dates';
import { isIndoor, METRIC_INFO } from './model/constants';
import type { Batch, ChecklistItem, IsoDate, Item, Metric, Movement, Settings } from './model/types';

export type ExpiryStatus = 'expired' | 'use_soon' | 'ok' | 'no_date';

/** A batch's quantity is the sum of its movements. */
export function batchQuantities(movements: Movement[]): Map<string, number> {
  const qty = new Map<string, number>();
  for (const m of movements) {
    if (m.deleted) continue;
    qty.set(m.batchId, (qty.get(m.batchId) ?? 0) + m.delta);
  }
  return qty;
}

export function expiryStatus(
  bestBefore: IsoDate | null,
  today: IsoDate,
  warningMonths: number,
): ExpiryStatus {
  if (!bestBefore) return 'no_date';
  if (bestBefore < today) return 'expired';
  if (bestBefore <= addMonths(today, warningMonths)) return 'use_soon';
  return 'ok';
}

export type ExclusionReason = 'not_counted' | 'expired' | 'use_soon' | 'not_indoors' | 'freezing';

/** Why a batch does not count towards readiness, or null when it does. */
export function exclusionReason(
  item: Item,
  batch: Batch,
  settings: Settings,
  today: IsoDate,
): ExclusionReason | null {
  if (!item.countsTowardReadiness || item.perUnit.metric === 'none') return 'not_counted';
  const status = expiryStatus(batch.bestBefore, today, settings.warningMonths);
  if (settings.considerExpiry && status === 'expired') return 'expired';
  if (settings.useSoonAtRisk && status === 'use_soon') return 'use_soon';
  const indoor = isIndoor(item.location);
  if (settings.indoorOnly && !indoor) return 'not_indoors';
  if (settings.freezing && item.freezeSensitive && !indoor) return 'freezing';
  return null;
}

/** Amount of each metric the household needs per day. */
export function dailyDemand(settings: Settings): Record<Exclude<Metric, 'none'>, number> {
  const { people, pets, dailyNeeds } = settings;
  return {
    water_l: people * dailyNeeds.waterLPerPerson + pets.reduce((s, p) => s + p.waterLPerDay, 0),
    kcal: people * dailyNeeds.kcalPerPerson,
    pet_food_g: pets.reduce((s, p) => s + p.foodGPerDay, 0),
    fuel_g: people * dailyNeeds.gasGPerPerson,
    // Medicine and lighting items are recorded directly in household-days of cover.
    med_days: people > 0 ? 1 : 0,
    light_days: people > 0 ? 1 : 0,
  };
}

export interface MetricResult {
  metric: Exclude<Metric, 'none'>;
  label: string;
  unit: string;
  /** Usable stock, in the metric's unit. */
  stock: number;
  dailyDemand: number;
  /** Days of cover; null when nothing is needed (e.g. pet food with no pets). */
  days: number | null;
  /** Stock needed to reach the target, in the metric's unit (0 when met). */
  shortfall: number;
  critical: boolean;
}

export type Band = 'red' | 'amber' | 'green';

export interface ExpiryCounts {
  /** Units (packs, bottles...) already past their date. */
  expired: number;
  /** Units expiring within 30 days. */
  within30Days: number;
  /** Units expiring within the warning window (default 6 months). */
  withinWarning: number;
  /** Units with no date recorded. */
  noDate: number;
}

export interface ReadinessResult {
  metrics: MetricResult[];
  /** Lowest days across the critical metrics that have a demand. */
  readinessDays: number;
  /** readinessDays ÷ target, capped at 1. */
  readinessFraction: number;
  band: Band;
  /** The critical metric that runs out first (ties: display order, Water first). */
  limiting: Exclude<Metric, 'none'> | null;
  targetDays: number;
  expiry: ExpiryCounts;
}

export interface ReadinessInput {
  settings: Settings;
  items: Item[];
  batches: Batch[];
  movements: Movement[];
}

export function band(fraction: number): Band {
  if (fraction >= 1) return 'green';
  if (fraction >= 0.5) return 'amber';
  return 'red';
}

export function computeReadiness(input: ReadinessInput, today: IsoDate): ReadinessResult {
  const { settings } = input;
  const qty = batchQuantities(input.movements);
  const items = new Map(input.items.filter((i) => !i.deleted).map((i) => [i._id, i]));
  const demand = dailyDemand(settings);

  const stock = new Map<Metric, number>();
  const expiry: ExpiryCounts = { expired: 0, within30Days: 0, withinWarning: 0, noDate: 0 };
  const in30 = addDays(today, 30);

  for (const batch of input.batches) {
    if (batch.deleted) continue;
    const item = items.get(batch.itemId);
    if (!item) continue;
    const units = qty.get(batch._id) ?? 0;
    if (units <= 0) continue;

    const status = expiryStatus(batch.bestBefore, today, settings.warningMonths);
    if (status === 'expired') expiry.expired += units;
    else if (status === 'no_date') expiry.noDate += units;
    else {
      if (batch.bestBefore! <= in30) expiry.within30Days += units;
      if (status === 'use_soon') expiry.withinWarning += units;
    }

    if (exclusionReason(item, batch, settings, today) !== null) continue;
    const { metric, amount } = item.perUnit;
    stock.set(metric, (stock.get(metric) ?? 0) + units * amount);
  }

  const metrics: MetricResult[] = METRIC_INFO.map(({ id, label, unit }) => {
    const metric = id as Exclude<Metric, 'none'>;
    const have = stock.get(metric) ?? 0;
    const need = demand[metric];
    return {
      metric,
      label,
      unit,
      stock: have,
      dailyDemand: need,
      days: need > 0 ? have / need : null,
      shortfall: Math.max(0, settings.targetDays * need - have),
      critical: settings.criticalMetrics.includes(metric),
    };
  });

  let limiting: MetricResult | null = null;
  for (const m of metrics) {
    if (!m.critical || m.days === null) continue;
    // Strictly lower wins, so ties keep display order (Water first).
    if (limiting === null || m.days < limiting.days!) limiting = m;
  }

  const readinessDays = limiting?.days ?? 0;
  const readinessFraction = settings.targetDays > 0 ? Math.min(readinessDays / settings.targetDays, 1) : 0;

  return {
    metrics,
    readinessDays,
    readinessFraction,
    band: band(readinessFraction),
    limiting: limiting?.metric ?? null,
    targetDays: settings.targetDays,
    expiry,
  };
}

/** A checklist line's target for the current scenario. */
export function scaledTarget(item: ChecklistItem, settings: Settings): number {
  const { amount, scaleBy } = item.target;
  const { people, pets, targetDays: days, dailyNeeds } = settings;
  switch (scaleBy) {
    case 'fixed':
      return amount;
    case 'people':
      return amount * people;
    case 'pets':
      return amount * pets.length;
    case 'days':
      return amount * days;
    case 'people_days':
      return amount * people * days;
    case 'water':
      return (people * dailyNeeds.waterLPerPerson + pets.reduce((s, p) => s + p.waterLPerDay, 0)) * days;
    case 'pet_food':
      return pets.reduce((s, p) => s + p.foodGPerDay, 0) * days;
  }
}

export interface ChecklistSummary {
  total: number;
  have: number;
  /** Lines marked Need or Check, with their scaled targets. */
  gaps: { item: ChecklistItem; target: number }[];
  /** Lines whose recurring check is overdue. */
  dueChecks: ChecklistItem[];
}

export function summariseChecklist(
  lines: ChecklistItem[],
  settings: Settings,
  today: IsoDate,
): ChecklistSummary {
  const live = lines.filter((l) => !l.deleted);
  const gaps = live
    .filter((l) => l.status !== 'have')
    .map((item) => ({ item, target: scaledTarget(item, settings) }));
  const dueChecks = live.filter(
    (l) =>
      l.checkIntervalDays != null && (!l.lastChecked || addDays(l.lastChecked, l.checkIntervalDays) <= today),
  );
  return { total: live.length, have: live.filter((l) => l.status === 'have').length, gaps, dueChecks };
}
