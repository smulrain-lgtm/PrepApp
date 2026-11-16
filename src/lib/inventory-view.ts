/** View model for the Inventory screen: one row per item, with its live batches. */
import { addDays } from './model/dates';
import type { Batch, Category, IsoDate, Item, LocationId, Snapshot } from './model/types';
import {
  settledQuantities,
  exclusionReason,
  expiryStatus,
  type ExclusionReason,
  type ExpiryStatus,
} from './readiness';
import { fifoOrder } from './db/fifo';

export interface BatchRow {
  batch: Batch;
  quantity: number;
  status: ExpiryStatus;
  /** Why this batch is not counted towards readiness, if it isn't. */
  excluded: ExclusionReason | null;
}

export type ItemStatus = ExpiryStatus | 'empty';

export interface ItemRow {
  item: Item;
  category: Category | undefined;
  /** Batches with stock, soonest expiry first. */
  batches: BatchRow[];
  total: number;
  /** Earliest best-before among batches with stock. */
  earliest: IsoDate | null;
  /** The most urgent status among batches with stock. */
  status: ItemStatus;
  /** True when any batch with stock expires in the next 30 days (not already expired). */
  within30Days: boolean;
}

const URGENCY: ExpiryStatus[] = ['expired', 'use_soon', 'ok', 'no_date'];

export function buildItemRows(snap: Snapshot, today: IsoDate): ItemRow[] {
  const qty = settledQuantities(snap.movements, snap.batches);
  const categories = new Map(snap.categories.map((c) => [c._id, c]));
  const byItem = new Map<string, Batch[]>();
  for (const b of snap.batches) {
    if (b.deleted) continue;
    const list = byItem.get(b.itemId) ?? [];
    list.push(b);
    byItem.set(b.itemId, list);
  }
  const in30 = addDays(today, 30);

  return snap.items
    .filter((item) => !item.deleted)
    .map((item) => {
      const batches = (byItem.get(item._id) ?? [])
        .map((batch) => ({ batch, quantity: qty.get(batch._id) ?? 0 }))
        .filter((b) => b.quantity > 0)
        .sort((a, b) => fifoOrder(a.batch, b.batch))
        .map(({ batch, quantity }): BatchRow => ({
          batch,
          quantity,
          status: expiryStatus(batch.bestBefore, today, snap.settings.warningMonths),
          excluded: exclusionReason(item, batch, snap.settings, today),
        }));
      const statuses = new Set(batches.map((b) => b.status));
      const status: ItemStatus = URGENCY.find((s) => statuses.has(s)) ?? 'empty';
      const dated = batches.map((b) => b.batch.bestBefore).filter((d): d is IsoDate => d !== null);
      return {
        item,
        category: categories.get(item.categoryId),
        batches,
        total: batches.reduce((s, b) => s + b.quantity, 0),
        earliest: dated.length ? dated[0] : null,
        status,
        within30Days: batches.some(
          (b) => b.status !== 'expired' && b.batch.bestBefore !== null && b.batch.bestBefore <= in30,
        ),
      };
    });
}

export type StatusFilter = 'all' | 'expired' | 'soon30' | 'use_soon' | 'no_date' | 'ok' | 'empty';

export interface InventoryFilter {
  query: string;
  categoryId: string;
  location: LocationId | '';
  status: StatusFilter;
}

export const EMPTY_FILTER: InventoryFilter = { query: '', categoryId: '', location: '', status: 'all' };

export function matchesFilter(row: ItemRow, f: InventoryFilter): boolean {
  if (f.categoryId && row.item.categoryId !== f.categoryId) return false;
  if (f.location && row.item.location !== f.location) return false;
  const q = f.query.trim().toLowerCase();
  if (q) {
    const hay = [row.item.name, row.item.subCategory, row.item.supplier, row.item.notes, row.category?.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  switch (f.status) {
    case 'all':
      return true;
    case 'soon30':
      return row.within30Days;
    case 'empty':
      return row.status === 'empty';
    default:
      return row.batches.some((b) => b.status === f.status);
  }
}

export interface CategoryGroup {
  category: Category | undefined;
  rows: ItemRow[];
}

/**
 * Rows grouped by category, in category order, names A–Z.
 * With `includeEmpty`, categories with no items are listed too, so each has
 * its own Add button (used when no filter is on).
 */
export function groupByCategory(
  rows: ItemRow[],
  categories: Category[],
  includeEmpty = false,
): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  for (const category of categories.filter((c) => !c.deleted)) {
    const inCat = rows.filter((r) => r.item.categoryId === category._id);
    if (inCat.length || includeEmpty)
      groups.push({ category, rows: inCat.sort((a, b) => a.item.name.localeCompare(b.item.name)) });
  }
  const known = new Set(categories.map((c) => c._id));
  const other = rows.filter((r) => !known.has(r.item.categoryId));
  if (other.length) groups.push({ category: undefined, rows: other });
  return groups;
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  expired: 'Expired',
  use_soon: 'Use soon',
  ok: 'OK',
  no_date: 'No date',
  empty: 'None in stock',
};

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  not_counted: 'Not counted towards readiness',
  expired: 'Not counted: expired',
  use_soon: 'Not counted: use soon is treated as at risk',
  not_indoors: 'Not counted: indoor stock only',
  freezing: 'Not counted: may freeze outdoors',
  not_in_kit: 'Not counted: not in the grab bags',
};
