/** Rotation view: every batch in stock, soonest best-before first. */
import { buildItemRows, type BatchRow } from './inventory-view';
import type { Category, IsoDate, Item, Snapshot } from './model/types';
import { fifoOrder } from './db/fifo';

export interface RotationRow extends BatchRow {
  item: Item;
}

export function rotationRows(snap: Snapshot, today: IsoDate): RotationRow[] {
  return buildItemRows(snap, today)
    .flatMap((r) => r.batches.map((b) => ({ ...b, item: r.item })))
    .sort((a, b) => fifoOrder(a.batch, b.batch) || a.item.name.localeCompare(b.item.name));
}

/** due: expired and use soon · dated: every batch with a date · all: everything. */
export type RotationView = 'due' | 'dated' | 'all';

/** Food: items in a food category, or counted as calories. */
export function isFood(item: Item, categories: Map<string, Category>): boolean {
  const cat = categories.get(item.categoryId);
  return (
    item.perUnit.metric === 'kcal' || !!cat?._id.startsWith('category:food-') || cat?.defaultMetric === 'kcal'
  );
}

export function filterRotation(
  rows: RotationRow[],
  view: RotationView,
  foodOnly: boolean,
  categories: Category[],
): RotationRow[] {
  const cats = new Map(categories.map((c) => [c._id, c]));
  return rows.filter((r) => {
    if (foodOnly && !isFood(r.item, cats)) return false;
    if (view === 'due') return r.status === 'expired' || r.status === 'use_soon';
    if (view === 'dated') return r.batch.bestBefore !== null;
    return true;
  });
}
