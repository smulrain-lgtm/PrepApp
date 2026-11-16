/**
 * Lists: the shopping list, "Recently used" (filled by Use now on the Rotation
 * screen) and any lists the household makes. Each entry is a `purchase`
 * record; its `listId` says which list it is on.
 */
import { RECENT_LIST_ID, SHOPPING_LIST_ID } from './model/constants';
import type { Category, Item, ListDoc, Purchase, Snapshot } from './model/types';
import { slug } from '../seed/csv';

/** The list an entry is on (entries from before 1.3 are on the shopping list). */
export function listIdOf(p: Purchase): string {
  return p.listId ?? SHOPPING_LIST_ID;
}

export function liveLists(snap: Snapshot): ListDoc[] {
  return snap.lists.filter((l) => !l.deleted);
}

export function entriesOn(snap: Snapshot, listId: string): Purchase[] {
  return snap.purchases.filter((p) => !p.deleted && listIdOf(p) === listId);
}

export interface EntryGroup {
  category: string;
  entries: Purchase[];
}

/** Entries grouped by their category, in first-seen order ("Other" for none). */
export function groupEntries(entries: Purchase[]): EntryGroup[] {
  const groups = new Map<string, Purchase[]>();
  for (const e of entries) {
    const key = e.category?.trim() || 'Other';
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups].map(([category, list]) => ({ category, entries: list }));
}

/** Quantity as a number when it is one ("3"), else null ("1 large jar"). */
export function countOf(quantity: string): number | null {
  return /^\d+$/.test(quantity.trim()) ? Number(quantity.trim()) : null;
}

/** A new id for a list entry. */
export function newEntryId(name: string, now: string): string {
  return `purchase:${now.replace(/[^0-9]/g, '').slice(0, 17)}-${slug(name).slice(0, 30) || 'item'}`;
}

/** The entry to save for "Use now" on an item: one more on Recently used. */
export function recentEntry(
  snap: Snapshot,
  item: Item,
  category: Category | undefined,
  now: string,
): Purchase {
  const existing = entriesOn(snap, RECENT_LIST_ID).find(
    (p) => p.itemId === item._id && p.status === 'to_buy',
  );
  if (existing) {
    const n = countOf(existing.quantity);
    return { ...existing, quantity: String((n ?? 1) + 1) };
  }
  return {
    _id: newEntryId(item.name, now),
    type: 'purchase',
    updatedAt: now,
    listId: RECENT_LIST_ID,
    itemId: item._id,
    name: item.name,
    category: category?.name ?? '',
    quantity: '1',
    status: 'to_buy',
    order: Math.max(0, ...snap.purchases.map((p) => p.order)) + 1,
  };
}

/** Planned-purchase categories from the workbook → inventory category and sub-category. */
const PURCHASE_HINT: Record<string, { categoryId: string; subCategory?: string }> = {
  'ready meals': { categoryId: 'category:food-mains', subCategory: 'Main meal' },
  breakfast: { categoryId: 'category:food-mains', subCategory: 'Breakfast' },
  'staples to cook with': { categoryId: 'category:food-ingredients' },
  protein: { categoryId: 'category:food-ingredients', subCategory: 'Tins & jars' },
  snacks: { categoryId: 'category:food-snacks', subCategory: 'Snack' },
  drinks: { categoryId: 'category:food-drinks', subCategory: 'Drink' },
};

/** Where a bought entry most likely belongs in the inventory. */
export function inventoryHint(
  entry: Purchase,
  categories: Category[],
): { categoryId?: string; subCategory?: string } {
  const name = entry.category?.trim().toLowerCase() ?? '';
  const exact = categories.find((c) => !c.deleted && c.name.toLowerCase() === name);
  if (exact) return { categoryId: exact._id };
  return PURCHASE_HINT[name] ?? {};
}

/** Plain text of one list for the share sheet. */
export function listText(list: ListDoc, entries: Purchase[]): string {
  const out = [list.name];
  for (const g of groupEntries(entries.filter((e) => e.status === 'to_buy'))) {
    out.push('', `${g.category}:`);
    for (const e of g.entries) out.push(`- ${e.name}${e.quantity ? ` – ${e.quantity}` : ''}`);
  }
  if (out.length === 1) out.push('', 'Nothing on this list.');
  return out.join('\n');
}
