/**
 * Links between the checklist, the household's medicines and the inventory:
 * how much stock backs a checklist line or a medicine, the checklist status
 * that stock gives, and the Food box (meals counted from the inventory).
 */
import { FOOD_SECTION_ID, MEAL_CATEGORY, MEAL_CHECKLIST_LINES, MEAL_TYPES } from './model/constants';
import type {
  ChecklistItem,
  ChecklistStatus,
  IsoDate,
  Item,
  MealType,
  Medication,
  Person,
  Settings,
  Snapshot,
} from './model/types';
import { exclusionReason, scaledTarget, settledQuantities, type Band } from './readiness';

/** Units in stock per item (every live batch, dated or not). */
export function itemTotals(snap: Snapshot): Map<string, number> {
  const qty = settledQuantities(snap.movements, snap.batches);
  const totals = new Map<string, number>();
  for (const b of snap.batches) {
    if (b.deleted) continue;
    const n = qty.get(b._id) ?? 0;
    if (n > 0) totals.set(b.itemId, (totals.get(b.itemId) ?? 0) + n);
  }
  return totals;
}

/** True for lines the Food box replaces. */
export function isMealLine(line: ChecklistItem): boolean {
  return line.sectionId === FOOD_SECTION_ID && MEAL_CHECKLIST_LINES.includes(line.name);
}

/**
 * Stock of the linked items in the line's own terms: litres for drinking
 * water, grams for pet food, otherwise units (alarms, torches, kits…).
 */
export function linkedAmount(
  line: ChecklistItem,
  items: Map<string, Item>,
  totals: Map<string, number>,
): number {
  let sum = 0;
  for (const id of line.itemIds ?? []) {
    const item = items.get(id);
    if (!item || item.deleted) continue;
    const units = totals.get(id) ?? 0;
    if (line.target.scaleBy === 'water') {
      if (item.perUnit.metric === 'water_l') sum += units * item.perUnit.amount;
    } else if (line.target.scaleBy === 'pet_food') {
      if (item.perUnit.metric === 'pet_food_g') sum += units * item.perUnit.amount;
    } else sum += units;
  }
  return sum;
}

/** Status given by linked stock: Have at the target, Check when some, Need when none. */
export function statusFromStock(amount: number, target: number): ChecklistStatus {
  if (amount > 0 && amount >= target) return 'have';
  return amount > 0 ? 'check' : 'need';
}

export interface LineLink {
  amount: number;
  target: number;
}

/**
 * The checklist as it should be shown and counted: live lines, without the
 * ones the Food box replaces, with linked lines' status set by their stock.
 */
export function resolveChecklist(snap: Snapshot): { lines: ChecklistItem[]; links: Map<string, LineLink> } {
  const items = new Map(snap.items.map((i) => [i._id, i]));
  const totals = itemTotals(snap);
  const links = new Map<string, LineLink>();
  const lines = snap.checklistItems
    .filter((l) => !l.deleted && !isMealLine(l))
    .map((line) => {
      if (!line.itemIds?.some((id) => items.get(id) && !items.get(id)!.deleted)) return line;
      const amount = linkedAmount(line, items, totals);
      const target = scaledTarget(line, snap.settings);
      links.set(line._id, { amount, target });
      const status = statusFromStock(amount, target);
      return status === line.status ? line : { ...line, status };
    });
  return { lines, links };
}

// --- Essentials -----------------------------------------------------------------------

export interface EssentialsSummary {
  have: number;
  total: number;
  /** Essential lines not yet Have, in checklist order. */
  missing: ChecklistItem[];
}

/** Checklist lines ticked Essential: how many are Have (pass resolved lines). */
export function essentialsSummary(lines: ChecklistItem[]): EssentialsSummary {
  const essential = lines.filter((l) => l.essential && !l.deleted);
  const missing = essential.filter((l) => l.status !== 'have');
  return { have: essential.length - missing.length, total: essential.length, missing };
}

// --- Water box -------------------------------------------------------------------------

export interface WaterBox {
  /** Usable stored water, litres. */
  have: number;
  /** Litres for everyone (people and pets) for the target days. */
  target: number;
  perDay: number;
  band: Band;
}

/** Stored water against the target, from the readiness water figures. */
export function waterBox(stock: number, dailyDemand: number, targetDays: number): WaterBox {
  const target = Math.ceil(dailyDemand * targetDays);
  const band: Band = stock >= target ? 'green' : stock >= target / 2 ? 'amber' : 'red';
  return { have: stock, target, perDay: dailyDemand, band };
}

// --- Food box ------------------------------------------------------------------------

export interface MealCount {
  type: MealType;
  label: string;
  /** Usable servings in stock. */
  count: number;
  target: number;
  perDay: number;
  band: Band;
}

/** Which meal an item is, if any: a Breakfast sub-category first, then its food category. */
export function mealTypeOf(item: Item): MealType | null {
  if (item.subCategory?.toLowerCase().includes('breakfast')) return 'breakfast';
  return MEAL_CATEGORY[item.categoryId] ?? null;
}

export function mealsPerDay(settings: Settings, type: MealType): number {
  return settings.mealsPerDay?.[type] ?? MEAL_TYPES.find((m) => m.id === type)!.perDay;
}

/**
 * Meals in the inventory against people × days × meals a day. Counts usable
 * units only (the same rules as the readiness figure: dates, indoor only…).
 */
export function mealCounts(snap: Snapshot, settings: Settings, today: IsoDate): MealCount[] {
  const qty = settledQuantities(snap.movements, snap.batches);
  const items = new Map(snap.items.filter((i) => !i.deleted).map((i) => [i._id, i]));
  const counts = new Map<MealType, number>();
  for (const batch of snap.batches) {
    if (batch.deleted) continue;
    const item = items.get(batch.itemId);
    const type = item && mealTypeOf(item);
    if (!item || !type) continue;
    const n = qty.get(batch._id) ?? 0;
    if (n <= 0 || exclusionReason(item, batch, settings, today) !== null) continue;
    counts.set(type, (counts.get(type) ?? 0) + n);
  }
  return MEAL_TYPES.map(({ id, label }) => {
    const perDay = mealsPerDay(settings, id);
    const target = Math.ceil(perDay * settings.people * settings.targetDays);
    const count = counts.get(id) ?? 0;
    const band: Band = count >= target ? 'green' : count >= target / 2 ? 'amber' : 'red';
    return { type: id, label, count, target, perDay, band };
  });
}

// --- Medicines -------------------------------------------------------------------------

export interface MedicationCover {
  person: Person;
  medication: Medication;
  item: Item | undefined;
  /** Units in stock of the linked item (null when not linked). */
  stock: number | null;
  /** Days the stock lasts at the dose (null without a dose or a link). */
  days: number | null;
  band: Band;
}

/** Each person's medicines with the stock that covers them. */
export function medicationCover(snap: Snapshot, targetDays: number): MedicationCover[] {
  const items = new Map(snap.items.filter((i) => !i.deleted).map((i) => [i._id, i]));
  const totals = itemTotals(snap);
  return (snap.settings.members ?? []).flatMap((person) =>
    person.medications.map((medication) => {
      const item = medication.itemId ? items.get(medication.itemId) : undefined;
      const stock = item ? (totals.get(item._id) ?? 0) : null;
      const days = stock !== null && medication.dosePerDay ? stock / medication.dosePerDay : null;
      const band: Band =
        stock === null || stock === 0
          ? 'red'
          : days === null
            ? 'amber'
            : days >= targetDays
              ? 'green'
              : days >= targetDays / 2
                ? 'amber'
                : 'red';
      return { person, medication, item, stock, days, band };
    }),
  );
}
