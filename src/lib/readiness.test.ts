import { describe, expect, it } from 'vitest';
import seedJson from '../seed/seed.json';
import { snapshotFromDocs } from './model/snapshot';
import { MEDICINE_ESSENTIALS } from './model/constants';
import { applyScenario } from './scenario';
import {
  band,
  dateFactor,
  medicineEssentials,
  pastDateRule,
  computeReadiness,
  dailyDemand,
  expiryStatus,
  exclusionReason,
  scaledTarget,
  summariseChecklist,
  type ReadinessInput,
} from './readiness';
import type { AnyDoc, Batch, Item, Metric, Movement, Settings } from './model/types';

const TODAY = '2026-11-15';
const seed = snapshotFromDocs(seedJson as AnyDoc[]);

function input(overrides: Partial<Settings> = {}, extra: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    settings: { ...seed.settings, ...overrides },
    items: [...seed.items, ...(extra.items ?? [])],
    batches: [...seed.batches, ...(extra.batches ?? [])],
    movements: [...seed.movements, ...(extra.movements ?? [])],
  };
}

const metric = (r: ReturnType<typeof computeReadiness>, id: string) =>
  r.metrics.find((m) => m.metric === id)!;

// --- Fixtures for stock that is not in the seed ----------------------------------

function stock(id: string, partial: Partial<Item>, units: number, bestBefore: string | null = '2030-01-01') {
  const item: Item = {
    _id: `item:${id}`,
    type: 'item',
    updatedAt: TODAY,
    name: id,
    categoryId: 'category:water',
    unit: 'unit',
    perUnit: { metric: 'water_l', amount: 1 },
    location: 'garage',
    countsTowardReadiness: true,
    freezeSensitive: false,
    ...partial,
  };
  const batch: Batch = {
    _id: `batch:${id}`,
    type: 'batch',
    updatedAt: TODAY,
    itemId: item._id,
    bestBefore,
    addedAt: TODAY,
  };
  const movement: Movement = {
    _id: `movement:${id}`,
    type: 'movement',
    updatedAt: TODAY,
    batchId: batch._id,
    delta: units,
    reason: 'added',
    at: TODAY,
    by: 'test',
  };
  return { items: [item], batches: [batch], movements: [movement] };
}

function merge(...parts: Partial<ReadinessInput>[]): Partial<ReadinessInput> {
  return {
    items: parts.flatMap((p) => p.items ?? []),
    batches: parts.flatMap((p) => p.batches ?? []),
    movements: parts.flatMap((p) => p.movements ?? []),
  };
}

const garageWater = stock(
  'garage-water',
  { perUnit: { metric: 'water_l', amount: 10 }, freezeSensitive: true },
  4,
);
const indoorWater = stock(
  'indoor-water',
  { perUnit: { metric: 'water_l', amount: 2 }, location: 'indoors' },
  6,
);
const butane = stock(
  'butane',
  { categoryId: 'category:cooking-fuel', perUnit: { metric: 'fuel_g', amount: 230 }, freezeSensitive: true },
  2,
);
const winterMix = stock(
  'winter-mix',
  { categoryId: 'category:cooking-fuel', perUnit: { metric: 'fuel_g', amount: 230 } },
  4,
);

// --- Stage 1 gate ----------------------------------------------------------------

describe('Stage 1 gate (seed data, 15 Nov 2026)', () => {
  it('names Water as the limiting category with 0 L in stock', () => {
    const r = computeReadiness(input(), TODAY);
    expect(r.limiting).toBe('water_l');
    expect(metric(r, 'water_l').stock).toBe(0);
    expect(r.readinessDays).toBe(0);
    expect(r.band).toBe('red');
  });

  it('counts about 8,300 kcal of usable food: 1.4 days for 3 people', () => {
    const food = metric(computeReadiness(input(), TODAY), 'kcal');
    expect(food.stock).toBe(8300);
    expect(food.days).toBeCloseTo(1.383, 3);
  });

  it('raises food days when "Consider expiry dates" is OFF (the 18 expired packs count)', () => {
    const on = metric(computeReadiness(input(), TODAY), 'kcal');
    const off = metric(
      computeReadiness(input({ considerExpiry: false, pastDateRule: 'include' }), TODAY),
      'kcal',
    );
    expect(off.stock).toBe(14850);
    expect(off.days).toBeCloseTo(2.475, 3);
    expect(off.days!).toBeGreaterThan(on.days!);
  });

  it('lowers per-person days and raises shortfalls when people go from 3 to 5', () => {
    const three = computeReadiness(input(), TODAY);
    const five = computeReadiness(input({ people: 5 }), TODAY);
    expect(metric(five, 'kcal').days!).toBeLessThan(metric(three, 'kcal').days!);
    for (const id of ['water_l', 'kcal', 'fuel_g']) {
      expect(metric(five, id).shortfall).toBeGreaterThan(metric(three, id).shortfall);
    }
  });

  it('raises shortfalls when target days go from 3 to 5', () => {
    const three = computeReadiness(input(), TODAY);
    const five = computeReadiness(input({ targetDays: 5 }), TODAY);
    expect(metric(five, 'water_l').shortfall).toBe(70); // (3 × 4 L + 2 dogs × 1 L) × 5 days
    expect(metric(three, 'water_l').shortfall).toBe(42);
  });

  it('drops garage water and plain butane when "Freezing conditions" is ON', () => {
    const extra = merge(garageWater, indoorWater, butane, winterMix);
    const normal = computeReadiness(input({}, extra), TODAY);
    const frozen = computeReadiness(input({ freezing: true }, extra), TODAY);
    expect(metric(normal, 'water_l').stock).toBe(52); // 40 L garage + 12 L indoors
    expect(metric(frozen, 'water_l').stock).toBe(12); // indoors only
    expect(metric(normal, 'fuel_g').stock).toBe(1380); // 6 canisters
    expect(metric(frozen, 'fuel_g').stock).toBe(920); // winter-mix only
  });
});

// --- Rules -------------------------------------------------------------------------

describe('readiness rules', () => {
  it('computes daily demand including each dog', () => {
    expect(dailyDemand(seed.settings)).toMatchObject({
      water_l: 14, // 3 × 4 L + 2 × 1 L
      kcal: 6000,
      pet_food_g: 200, // 120 g + 80 g
      fuel_g: 231, // 3 × 77 g
      med_days: 1,
    });
  });

  it('classifies expiry against the warning window', () => {
    expect(expiryStatus(null, TODAY, 6)).toBe('no_date');
    expect(expiryStatus('2026-11-14', TODAY, 6)).toBe('expired');
    expect(expiryStatus('2026-11-15', TODAY, 6)).toBe('use_soon');
    expect(expiryStatus('2027-05-15', TODAY, 6)).toBe('use_soon');
    expect(expiryStatus('2027-05-16', TODAY, 6)).toBe('ok');
  });

  it('leaves out "use soon" stock only when that toggle is ON', () => {
    const before = metric(computeReadiness(input(), TODAY), 'kcal').stock;
    const atRisk = metric(computeReadiness(input({ useSoonAtRisk: true }), TODAY), 'kcal').stock;
    // 10 sides (3,000) + 8 drinks (800) + 5 snacks (1,000) expire by 15 May 2027.
    expect(before - atRisk).toBe(4800);
  });

  it('counts only indoor and grab-bag stock when "Indoor stock only" is ON', () => {
    const extra = merge(garageWater, indoorWater);
    const r = computeReadiness(input({ indoorOnly: true }, extra), TODAY);
    expect(metric(r, 'water_l').stock).toBe(12);
    expect(metric(r, 'kcal').stock).toBe(0); // all food is in the garage
  });

  it('ignores items marked not to count and soft-deleted items', () => {
    const notCounted = stock('spare', { countsTowardReadiness: false }, 100);
    const gone = stock('gone', { deleted: true }, 100);
    const r = computeReadiness(input({}, merge(notCounted, gone)), TODAY);
    expect(metric(r, 'water_l').stock).toBe(0);
  });

  it('reports pet food as not applicable with no pets', () => {
    const r = computeReadiness(input({ pets: [] }), TODAY);
    expect(metric(r, 'pet_food_g').days).toBeNull();
  });

  it('picks the lowest critical metric, breaking ties in display order', () => {
    const water = stock('w', { perUnit: { metric: 'water_l', amount: 12 } }, 2); // 24 L ÷ 12 L a day = 2 days
    const meds = stock(
      'm',
      { categoryId: 'category:safety-first-aid', perUnit: { metric: 'med_days', amount: 1 } },
      2,
    );
    const r = computeReadiness(
      input({ pets: [], criticalMetrics: ['water_l', 'med_days'] }, merge(water, meds)),
      TODAY,
    );
    expect(r.limiting).toBe('water_l');
    expect(r.readinessDays).toBe(2);
    expect(r.readinessFraction).toBeCloseTo(2 / 3);
    expect(r.band).toBe('amber');
  });

  it('bands: red below 50%, amber to 99%, green at 100%', () => {
    expect(band(0.49)).toBe('red');
    expect(band(0.5)).toBe('amber');
    expect(band(0.99)).toBe('amber');
    expect(band(1)).toBe('green');
  });

  it('counts expiry alerts by units', () => {
    const r = computeReadiness(input(), TODAY);
    expect(r.expiry.expired).toBe(18);
    expect(r.expiry.noDate).toBe(3);
    expect(r.expiry.withinWarning).toBe(23);
    expect(r.expiry.within30Days).toBe(2); // fruit flapjack + hot chocolate, 1 Dec 2026
  });

  it('explains why a batch is excluded', () => {
    const [item] = garageWater.items;
    const [batch] = garageWater.batches;
    expect(exclusionReason(item, batch, { ...seed.settings, freezing: true }, TODAY)).toBe('freezing');
    expect(exclusionReason(item, batch, { ...seed.settings, indoorOnly: true }, TODAY)).toBe('not_indoors');
    expect(exclusionReason(item, batch, seed.settings, TODAY)).toBeNull();
  });
});

describe('release 1.1 rules', () => {
  it('tapers food past its best-before: full for 6 months, nothing after 12', () => {
    expect(dateFactor('2026-12-01', TODAY, 'taper')).toBe(1); // not yet past
    expect(dateFactor('2026-06-01', TODAY, 'taper')).toBe(1); // 5½ months past
    expect(dateFactor('2025-11-14', TODAY, 'taper')).toBe(0); // a year past
    const mid = dateFactor('2026-02-15', TODAY, 'taper'); // 9 months past
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
    expect(dateFactor('2020-01-01', TODAY, 'include')).toBe(1);
    expect(dateFactor('2026-11-14', TODAY, 'exclude')).toBe(0);
  });

  it('with the taper rule, recently expired food still counts', () => {
    const exclude = metric(computeReadiness(input({ pastDateRule: 'exclude' }), TODAY), 'kcal').stock;
    const taper = metric(computeReadiness(input({ pastDateRule: 'taper' }), TODAY), 'kcal').stock;
    const include = metric(computeReadiness(input({ pastDateRule: 'include' }), TODAY), 'kcal').stock;
    expect(exclude).toBe(8300);
    expect(include).toBe(14850);
    // Hot chocolate (Oct 2026) and the chocolate puddings (Nov 2026) are within 6 months: full.
    expect(taper).toBeGreaterThanOrEqual(8300 + 100 + 700);
    expect(taper).toBeLessThan(include);
  });

  it('older settings without the rule follow "Consider expiry dates"', () => {
    const old = { ...seed.settings, pastDateRule: undefined };
    expect(pastDateRule({ ...old, considerExpiry: true })).toBe('exclude');
    expect(pastDateRule({ ...old, considerExpiry: false })).toBe('include');
  });

  it('medicines never set the days figure, even in older settings', () => {
    const r = computeReadiness(input({ criticalMetrics: ['water_l', 'kcal', 'med_days'] }), TODAY);
    expect(metric(r, 'med_days').critical).toBe(false);
  });

  it('counts medicine essentials from the checklist', () => {
    const e = medicineEssentials(seed.checklistItems, MEDICINE_ESSENTIALS);
    expect(e).toEqual({
      covered: 0,
      total: 4,
      missing: [
        'First aid kit',
        'Prescription medicines',
        'Painkillers, antihistamines, diarrhoea relief',
        'Oral rehydration sachets',
      ],
    });
  });

  it('reports the goal, never below the target', () => {
    expect(computeReadiness(input({ goalDays: 30 }), TODAY).goalDays).toBe(30);
    expect(computeReadiness(input({ goalDays: 2, targetDays: 5 }), TODAY).goalDays).toBe(5);
  });

  it('scenarios: garage lost counts indoor stock only; go bag only grab bags, 3 days', () => {
    const extra = merge(garageWater, indoorWater);
    const lost = computeReadiness(
      { ...input({}, extra), settings: applyScenario(input().settings, 'garage_lost') },
      TODAY,
    );
    expect(metric(lost, 'water_l').stock).toBe(12);
    const bagWater = stock(
      'bag-water',
      { location: 'grab_bag', perUnit: { metric: 'water_l', amount: 1 } },
      3,
    );
    const bag = computeReadiness(
      { ...input({}, merge(extra, bagWater)), settings: applyScenario(input().settings, 'go_bag') },
      TODAY,
    );
    expect(metric(bag, 'water_l').stock).toBe(3);
    expect(metric(bag, 'kcal').stock).toBe(0);
    expect(bag.targetDays).toBe(3);
    expect(metric(bag, 'fuel_g').critical).toBe(false);
  });

  it('scenarios: power counts at home (lighting is critical), not in the go bag', () => {
    const home = computeReadiness({ ...input(), settings: applyScenario(input().settings, 'home') }, TODAY);
    expect(metric(home, 'light_days').critical).toBe(true);
    const old = { ...input().settings, criticalMetrics: ['water_l', 'kcal'] as Metric[] };
    expect(applyScenario(old, 'home').criticalMetrics).toContain('light_days');
    expect(applyScenario(old, 'garage_lost').criticalMetrics).toContain('light_days');
    expect(applyScenario(old, 'go_bag').criticalMetrics).not.toContain('light_days');
  });
});

describe('checklist', () => {
  const line = (name: string) => seed.checklistItems.find((l) => l.name === name)!;

  it('scales targets with the scenario', () => {
    expect(scaledTarget(line('Drinking & cooking water'), seed.settings)).toBe(42);
    expect(scaledTarget(line('Backpacking meals – lunch & dinner'), seed.settings)).toBe(18);
    expect(scaledTarget(line('Head torches'), seed.settings)).toBe(3);
    expect(scaledTarget(line('Dog food & treats (both dogs)'), seed.settings)).toBe(600);
    expect(scaledTarget(line('Gas canisters'), seed.settings)).toBe(4);

    const bigger = { ...seed.settings, people: 5, targetDays: 5 };
    expect(scaledTarget(line('Drinking & cooking water'), bigger)).toBe(110); // (20 + 2) × 5
    expect(scaledTarget(line('Backpacking meals – lunch & dinner'), bigger)).toBe(50);
  });

  it('summarises gaps and due checks', () => {
    const s = summariseChecklist(seed.checklistItems, seed.settings, TODAY);
    expect(s.total).toBe(68);
    expect(s.have).toBe(10); // the sheet's 9 Have lines + wood stoves
    expect(s.gaps).toHaveLength(58);
    // Never checked + has an interval = due: solar, power banks, power station, first aid kit, inventory.
    expect(s.dueChecks.map((l) => l.name)).toHaveLength(5);
  });
});
