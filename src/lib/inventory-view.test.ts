import { describe, expect, it } from 'vitest';
import seedJson from '../seed/seed.json';
import { buildItemRows, EMPTY_FILTER, groupByCategory, matchesFilter } from './inventory-view';
import { snapshotFromDocs } from './model/snapshot';
import type { AnyDoc } from './model/types';

const snap = snapshotFromDocs(seedJson as AnyDoc[]);
const rows = buildItemRows(snap, '2026-11-15');
const row = (id: string) => rows.find((r) => r.item._id === id)!;
const count = (f: Partial<typeof EMPTY_FILTER>) =>
  rows.filter((r) => matchesFilter(r, { ...EMPTY_FILTER, ...f })).length;

describe('inventory rows', () => {
  it('has one row per item with its total and soonest batch first', () => {
    expect(rows).toHaveLength(30);
    const hot = row('item:hot-chocolate');
    expect(hot.total).toBe(9);
    expect(hot.earliest).toBe('2026-10-01');
    expect(hot.batches.map((b) => b.quantity)).toEqual([1, 1, 1, 6]);
  });

  it('shows the most urgent status', () => {
    expect(row('item:hot-chocolate').status).toBe('expired');
    expect(row('item:pasta-bolognaise').status).toBe('ok');
    expect(row('item:just-nuts').status).toBe('use_soon');
    expect(row('item:peanut-butter').status).toBe('no_date');
  });

  it('explains why an expired batch does not count', () => {
    expect(row('item:hot-chocolate').batches[0].excluded).toBe('expired');
    expect(row('item:hot-chocolate').batches[3].excluded).toBeNull();
  });

  it('filters by status, matching any batch', () => {
    expect(count({ status: 'expired' })).toBe(16);
    expect(count({ status: 'soon30' })).toBe(2); // fruit flapjack, hot chocolate (1 Dec 2026)
    expect(count({ status: 'no_date' })).toBe(1);
  });

  it('filters by text, category and location', () => {
    expect(count({ query: 'mashed' })).toBe(5);
    expect(count({ query: 'IDAHOAN' })).toBe(5); // supplier, any case
    expect(count({ categoryId: 'category:food-drinks' })).toBe(1);
    expect(count({ location: 'indoors' })).toBe(0);
  });

  it('groups by category in category order, names A–Z', () => {
    const groups = groupByCategory(rows, snap.categories);
    expect(groups.map((g) => g.category?.name)).toEqual([
      'Food – Main meals',
      'Food – Sides',
      'Food – Desserts',
      'Food – Snacks',
      'Food – Drinks',
    ]);
    const all = groupByCategory(rows, snap.categories, true);
    expect(all).toHaveLength(14); // every category, so each has an Add button
    expect(all[0]).toMatchObject({ category: { name: 'Water' }, rows: [] });
    const names = groups[0].rows.map((r) => r.item.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
