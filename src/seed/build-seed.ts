/**
 * Builds the app's first-run data (seed.json) from the household workbook's
 * CSV exports in docs/seed-source/. Pure: CSV text in, documents out.
 *
 * Run `npm run seed` after the workbook changes; tests check the counts.
 */
import {
  DEFAULT_KCAL,
  DEFAULT_SETTINGS,
  BUILT_IN_LISTS,
  INGREDIENTS_CATEGORY,
  SUSPECT_DATE_BEFORE,
} from '../lib/model/constants.ts';
import type {
  AnyDoc,
  Batch,
  Category,
  ChecklistItem,
  ChecklistSection,
  ChecklistStatus,
  Contact,
  Item,
  Metric,
  Movement,
  Purchase,
  ScaleBy,
  Settings,
} from '../lib/model/types.ts';
import { parseCsv, slug, tableAfter } from './csv.ts';

/** All seed documents carry the snapshot date. */
export const SEED_TIME = '2026-11-15T00:00:00.000Z';

export interface SeedSources {
  checklistCsv: string;
  foodStoreCsv: string;
  shoppingListCsv: string;
}

// --- Inventory categories ------------------------------------------------------

const CATEGORIES: [string, string, string, Metric][] = [
  // id, name, icon, default metric
  ['water', 'Water', 'droplet', 'water_l'],
  ['food-mains', 'Food – Main meals', 'bowl', 'kcal'],
  ['food-sides', 'Food – Sides', 'bowl', 'kcal'],
  ['food-desserts', 'Food – Desserts', 'cake', 'kcal'],
  ['food-snacks', 'Food – Snacks', 'cookie', 'kcal'],
  ['food-drinks', 'Food – Drinks', 'cup', 'kcal'],
  ['pet-food', 'Pet food', 'paw', 'pet_food_g'],
  ['cooking-fuel', 'Cooking & fuel', 'flame', 'fuel_g'],
  ['power-light', 'Power & light', 'bulb', 'light_days'],
  ['safety-first-aid', 'Safety & first aid', 'cross', 'med_days'],
  ['hygiene', 'Hygiene & sanitation', 'soap', 'none'],
  ['warmth', 'Warmth & shelter', 'blanket', 'none'],
  ['documents-money', 'Documents & money', 'folder', 'none'],
  ['garage-storage', 'Garage storage', 'box', 'none'],
];

/** Food Store sheet category → inventory category and sub-category. */
const FOOD_CATEGORY: Record<string, { categoryId: string; subCategory: string }> = {
  'Main Meals': { categoryId: 'category:food-mains', subCategory: 'Main meal' },
  Sides: { categoryId: 'category:food-sides', subCategory: 'Side' },
  Desserts: { categoryId: 'category:food-desserts', subCategory: 'Dessert' },
  Snacks: { categoryId: 'category:food-snacks', subCategory: 'Snack' },
  Drinks: { categoryId: 'category:food-drinks', subCategory: 'Drink' },
};

// --- Checklist targets -------------------------------------------------------------
// Every target is a number (editable in the app). Ranges take the upper figure;
// "–" = 1; "Set for 3" = 1 per person; "3 days' supply" = 1 per day.

interface TargetRule {
  amount: number;
  unit: string;
  scaleBy: ScaleBy;
  intervalDays?: number;
}

const CHECKLIST_TARGETS: Record<string, TargetRule> = {
  // 1. Water — 4 L per person per day plus 1 L per dog per day (42 L at the defaults).
  'Drinking & cooking water': { amount: 0, unit: 'L', scaleBy: 'water' },
  'Bottled water kept indoors': { amount: 6, unit: '× 2 L bottles', scaleBy: 'fixed' },
  'Collapsible water carriers': { amount: 2, unit: '× 10 L carriers', scaleBy: 'fixed' },
  'Water filter + purification tablets': { amount: 1, unit: 'filter + tablets', scaleBy: 'fixed' },
  // 2. Food
  'Backpacking meals – lunch & dinner': { amount: 2, unit: 'meals', scaleBy: 'people_days' },
  'Breakfasts – porridge pots / sachets, granola': { amount: 1, unit: 'servings', scaleBy: 'people_days' },
  'Tinned protein – tuna, chicken, ham, beans, chilli': { amount: 1, unit: 'tins', scaleBy: 'people_days' },
  'Tinned soup & vegetables': { amount: 1, unit: 'tins', scaleBy: 'people_days' },
  'Tinned or dried fruit': { amount: 6, unit: 'tins / packs', scaleBy: 'fixed' },
  'Snacks – cereal bars, nuts, trail mix, chocolate': { amount: 2, unit: 'snacks', scaleBy: 'people_days' },
  'Crackers, oatcakes or long-life wraps': { amount: 3, unit: 'packs', scaleBy: 'fixed' },
  'Peanut butter / spreads': { amount: 1, unit: 'large jar', scaleBy: 'fixed' },
  'UHT or powdered milk': { amount: 3, unit: 'L UHT (or 1 tub powder)', scaleBy: 'fixed' },
  'Hot drinks – tea, coffee, hot chocolate, sugar': { amount: 1, unit: "days' supply", scaleBy: 'days' },
  'Oral rehydration sachets': { amount: 12, unit: 'sachets', scaleBy: 'fixed' },
  'Seasoning – salt, pepper, stock cubes, sauce sachets': { amount: 1, unit: 'kit', scaleBy: 'fixed' },
  'Comfort food / treats': { amount: 3, unit: 'treats', scaleBy: 'fixed' },
  'Dog food & treats (both dogs)': { amount: 0, unit: 'g dry food', scaleBy: 'pet_food' },
  // 3. Cooking & fuel
  'Gas stove': { amount: 1, unit: 'stove', scaleBy: 'fixed' },
  'Gas canisters': { amount: 4, unit: '× 230 g canisters', scaleBy: 'fixed' },
  'Wood stoves': { amount: 3, unit: 'stoves', scaleBy: 'fixed' },
  'Dry fuel, kindling, firelighters': { amount: 1, unit: 'bag of each', scaleBy: 'fixed' },
  'Lighters + storm-proof matches': { amount: 3, unit: 'lighters + 1 box matches', scaleBy: 'fixed' },
  'Manual tin openers': { amount: 2, unit: 'openers', scaleBy: 'fixed' },
  'Pans, cutlery, mugs, plates': { amount: 1, unit: 'set per person', scaleBy: 'people' },
  'Washing-up liquid, scourer, tea towel': { amount: 1, unit: 'of each', scaleBy: 'fixed' },
  'Foil, zip-lock bags, kitchen roll': { amount: 1, unit: 'of each', scaleBy: 'fixed' },
  // 4. Power & light
  'Portable solar panels': { amount: 1, unit: 'set', scaleBy: 'fixed', intervalDays: 91 },
  'Battery packs / power banks': { amount: 1, unit: 'set', scaleBy: 'fixed', intervalDays: 91 },
  'Electric lanterns': { amount: 1, unit: 'set', scaleBy: 'fixed' },
  'Paraffin lamps + paraffin': { amount: 4, unit: 'L paraffin', scaleBy: 'fixed' },
  'Head torches': { amount: 1, unit: 'per person', scaleBy: 'people' },
  'Spare batteries (AA / AAA)': { amount: 24, unit: 'batteries', scaleBy: 'fixed' },
  'Wind-up or battery DAB/FM radio': { amount: 1, unit: 'radio', scaleBy: 'fixed' },
  'Charging cables for every phone/device': { amount: 1, unit: 'set', scaleBy: 'fixed' },
  'Portable power station': { amount: 1, unit: 'unit', scaleBy: 'fixed', intervalDays: 91 },
  // 5. Safety & first aid
  'Battery carbon monoxide alarm': { amount: 2, unit: 'alarms', scaleBy: 'fixed' },
  'Fire extinguisher + fire blanket': { amount: 1, unit: 'of each', scaleBy: 'fixed' },
  'First aid kit': { amount: 1, unit: 'comprehensive kit', scaleBy: 'fixed', intervalDays: 182 },
  'Prescription medicines': { amount: 5, unit: 'days per person (minimum)', scaleBy: 'fixed' },
  'Painkillers, antihistamines, diarrhoea relief': { amount: 1, unit: 'pack of each', scaleBy: 'fixed' },
  'Multi-tool, duct tape, cable ties, work gloves': { amount: 1, unit: 'of each', scaleBy: 'fixed' },
  Whistle: { amount: 1, unit: 'whistle', scaleBy: 'fixed' },
  'Stopcock key / know shut-offs for gas, water, electricity': { amount: 1, unit: 'key', scaleBy: 'fixed' },
  'Dust masks (FFP2/FFP3)': { amount: 2, unit: 'per person', scaleBy: 'people' },
  'Spare glasses / contact lenses': { amount: 1, unit: 'set per wearer', scaleBy: 'fixed' },
  // 6. Hygiene & sanitation
  'Toilet roll': { amount: 6, unit: 'rolls', scaleBy: 'fixed' },
  'Wet wipes': { amount: 3, unit: 'packs', scaleBy: 'fixed' },
  'Hand sanitiser': { amount: 2, unit: 'bottles', scaleBy: 'fixed' },
  'Heavy-duty bin bags': { amount: 20, unit: 'bags', scaleBy: 'fixed' },
  'Emergency toilet – lidded bucket, liners, cat litter': { amount: 1, unit: 'kit', scaleBy: 'fixed' },
  'Toothbrushes, toothpaste, sanitary products': { amount: 1, unit: "days' supply each", scaleBy: 'days' },
  'Disinfectant / bleach': { amount: 1, unit: 'bottle', scaleBy: 'fixed' },
  // 7. Warmth & shelter
  'Sleeping bags & mats': { amount: 1, unit: 'per person', scaleBy: 'people' },
  'Foil emergency blankets': { amount: 1, unit: 'per person', scaleBy: 'people' },
  'Warm layers, hats, gloves, waterproofs': { amount: 1, unit: 'set per person', scaleBy: 'people' },
  'Tarp / plastic sheeting + tape': { amount: 1, unit: 'tarp', scaleBy: 'fixed' },
  // 8. Documents & money
  'Cash – coins and small notes': { amount: 200, unit: '£', scaleBy: 'fixed' },
  'Copies of key documents (waterproof wallet)': { amount: 1, unit: 'set', scaleBy: 'fixed' },
  'Printed contact list + local paper map': { amount: 1, unit: 'of each', scaleBy: 'fixed' },
  'Grab bag per person': { amount: 1, unit: 'per person', scaleBy: 'people' },
  'Written list of medication names & doses': { amount: 1, unit: 'per person', scaleBy: 'people' },
  'Household emergency plan': { amount: 1, unit: 'plan', scaleBy: 'fixed' },
  'Priority Services Register – check eligibility': { amount: 1, unit: 'check', scaleBy: 'fixed' },
  // 9. Garage storage
  'Lidded plastic crates (rodent-proof)': { amount: 6, unit: 'crates', scaleBy: 'fixed' },
  'Min/max thermometer': { amount: 1, unit: 'thermometer', scaleBy: 'fixed' },
  'Moisture absorbers / silica gel': { amount: 4, unit: 'absorbers', scaleBy: 'fixed' },
  'Inventory with best-before dates': { amount: 1, unit: 'inventory', scaleBy: 'fixed', intervalDays: 182 },
};

/** The sheet's one wood-stove line becomes two (the household owns 3 stoves). */
const SPLIT_LINES: Record<string, { name: string; status: ChecklistStatus; notes?: string }[]> = {
  'Wood stove + dry fuel, kindling, firelighters': [
    { name: 'Wood stoves', status: 'have' },
    { name: 'Dry fuel, kindling, firelighters', status: 'check', notes: 'Keep fuel off the floor and dry.' },
  ],
};

const STATUS: Record<string, ChecklistStatus> = { Have: 'have', Check: 'check', Need: 'need' };

// --- Contacts (UK) ---------------------------------------------------------------------

const CONTACTS: [string, string, string[], string?][] = [
  ['Emergency services', 'Police, fire, ambulance, coastguard', ['999', '112']],
  ['Police (non-emergency)', 'Police', ['101']],
  ['NHS 111', 'Urgent medical advice', ['111']],
  ['Power cut', 'Electricity network operator', ['105']],
  ['National Gas emergency', 'Gas leak or smell of gas', ['0800 111 999']],
  ['Water supplier', 'Water supply and leaks', [], 'Add the supplier and its emergency number.'],
  ['GP surgery', 'Doctor', [], 'Add the surgery number.'],
  ['School', 'School', [], 'Add the school office number.'],
  ['Neighbours', 'Neighbour', [], 'Swap numbers with neighbours.'],
  ['Home insurer', 'Insurance claims', [], 'Add the policy number and claims line.'],
  ['Vet', 'Vet', [], 'Add the practice and out-of-hours numbers.'],
];

// --- Builder ---------------------------------------------------------------------

function base<T extends AnyDoc['type']>(type: T, id: string) {
  return { _id: id, type, updatedAt: SEED_TIME } as const;
}

export function buildSeed(sources: SeedSources): AnyDoc[] {
  const docs: AnyDoc[] = [];

  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    updatedAt: SEED_TIME,
    people: 3,
    targetDays: 3,
    considerExpiry: true,
    pets: [
      { id: 'dog-1', name: 'Dog 1 (smaller)', kind: 'dog', foodGPerDay: 120, waterLPerDay: 1 },
      { id: 'dog-2', name: 'Dog 2', kind: 'dog', foodGPerDay: 80, waterLPerDay: 1 },
    ],
  };
  docs.push(settings);

  CATEGORIES.forEach(([id, name, icon, defaultMetric], order) => {
    const category: Category = { ...base('category', `category:${id}`), name, icon, order, defaultMetric };
    docs.push(category);
  });
  docs.push({ ...INGREDIENTS_CATEGORY });
  for (const list of BUILT_IN_LISTS) docs.push({ ...list });

  // Food Store: one row per pack. Same product = one item; same product + date = one batch.
  const packs = tableAfter(parseCsv(sources.foodStoreCsv), 'Item');
  const items = new Map<string, Item>();
  const batches = new Map<string, { batch: Batch; count: number }>();
  for (const row of packs) {
    const food = FOOD_CATEGORY[row.Category];
    if (!food) throw new Error(`Unknown food category "${row.Category}" for ${row.Item}`);
    const itemSlug = slug(row.Item);
    const itemId = `item:${itemSlug}`;
    if (!items.has(itemId)) {
      items.set(itemId, {
        ...base('item', itemId),
        name: row.Item,
        categoryId: food.categoryId,
        subCategory: food.subCategory,
        unit: 'pack',
        perUnit: { metric: 'kcal', amount: DEFAULT_KCAL[food.subCategory], estimated: true },
        location: 'garage',
        supplier: row.Supplier || undefined,
        notes:
          row.Notes && !/check the printed date|no date recorded/i.test(row.Notes) ? row.Notes : undefined,
        countsTowardReadiness: true,
        freezeSensitive: false,
      });
    }
    const bestBefore = row['Best before'] || null;
    const batchId = `batch:${itemSlug}:${bestBefore ?? 'undated'}`;
    const existing = batches.get(batchId);
    if (existing) existing.count++;
    else {
      let note: string | undefined;
      if (bestBefore && bestBefore < SUSPECT_DATE_BEFORE) note = 'Check printed date';
      else if (!bestBefore) note = 'No date recorded – check pack';
      batches.set(batchId, {
        batch: { ...base('batch', batchId), itemId, bestBefore, addedAt: SEED_TIME, note },
        count: 1,
      });
    }
  }
  docs.push(...items.values());
  for (const { batch, count } of batches.values()) {
    docs.push(batch);
    const movement: Movement = {
      ...base('movement', `movement:seed:${batch._id.slice('batch:'.length)}`),
      batchId: batch._id,
      delta: count,
      reason: 'added',
      at: SEED_TIME,
      by: 'seed',
    };
    docs.push(movement);
  }

  // Checklist: nine sections, one line per row (the wood-stove row splits in two).
  const lines = tableAfter(parseCsv(sources.checklistCsv), 'Category');
  const sections = new Map<string, ChecklistSection>();
  let order = 0;
  for (const row of lines) {
    const sectionName = row.Category.replace(/^\d+\.\s*/, '');
    const sectionId = `section:${slug(sectionName)}`;
    if (!sections.has(sectionId)) {
      sections.set(sectionId, {
        ...base('checklistSection', sectionId),
        name: sectionName,
        order: sections.size,
      });
    }
    const status = STATUS[row.Status];
    if (!status) throw new Error(`Unknown status "${row.Status}" for ${row.Item}`);
    const variants = SPLIT_LINES[row.Item] ?? [{ name: row.Item, status, notes: undefined }];
    for (const v of variants) {
      const rule = CHECKLIST_TARGETS[v.name];
      if (!rule) throw new Error(`No target rule for checklist line "${v.name}"`);
      order++;
      const line: ChecklistItem = {
        ...base('checklistItem', `checklist:${String(order).padStart(2, '0')}-${slug(v.name)}`),
        name: v.name,
        sectionId,
        order,
        target: { amount: rule.amount, unit: rule.unit, scaleBy: rule.scaleBy },
        status: v.status,
        notes: v.notes ?? (row.Notes || undefined),
        lastChecked: null,
        checkIntervalDays: rule.intervalDays ?? null,
      };
      docs.push(line);
    }
  }
  docs.push(...sections.values());

  CONTACTS.forEach(([name, role, phones, notes], priority) => {
    const contact: Contact = {
      ...base('contact', `contact:${slug(name)}`),
      name,
      role,
      phones,
      notes,
      priority,
    };
    docs.push(contact);
  });

  // Shopping List sheet: planned purchases.
  const toBuy = tableAfter(parseCsv(sources.shoppingListCsv), 'Category');
  toBuy.forEach((row, i) => {
    const purchase: Purchase = {
      ...base('purchase', `purchase:${String(i + 1).padStart(2, '0')}-${slug(row.Item).slice(0, 40)}`),
      name: row.Item,
      category: row.Category.replace(/^\d+\.\s*/, ''),
      quantity: row['Qty to buy'],
      fillsGap: row['Fills gap'] || undefined,
      shelfLife: row['Typical shelf life'] || undefined,
      status: row.Status === 'Bought' ? 'bought' : 'to_buy',
      notes: row.Notes || undefined,
      order: i + 1,
    };
    docs.push(purchase);
  });

  // JSON drops undefined fields; do it now so the output is stable.
  return JSON.parse(JSON.stringify(docs)) as AnyDoc[];
}
