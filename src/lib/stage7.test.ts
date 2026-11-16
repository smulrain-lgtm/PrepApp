/** 1.3: lists, recently used, rotation views, checklist links, Food box, medicines, units. */
import { describe, expect, it } from 'vitest';
import seedJson from '../seed/seed.json';
import { planUnits, unitsOf } from './categories';
import { countOf, entriesOn, groupEntries, inventoryHint, listIdOf, recentEntry } from './lists';
import { RECENT_LIST_ID, SHOPPING_LIST_ID } from './model/constants';
import { snapshotFromDocs } from './model/snapshot';
import type { AnyDoc, Batch, ChecklistItem, Item, Movement, Snapshot } from './model/types';
import { filterRotation, rotationRows } from './rotation';
import {
  essentialsSummary,
  isMealLine,
  mealCounts,
  medicationCover,
  resolveChecklist,
  statusFromStock,
  waterBox,
} from './stock-links';
import { matchesChecklistFilter } from './checklist-view';

const TODAY = '2026-11-16';
const seed = seedJson as AnyDoc[];
const snap = snapshotFromDocs(seed);

/** An item with one undated batch of `units`. */
function stocked(id: string, categoryId: string, units: number, extra: Partial<Item> = {}): AnyDoc[] {
  const item: Item = {
    _id: id,
    type: 'item',
    updatedAt: '',
    name: id.replace('item:', ''),
    categoryId,
    unit: 'item',
    perUnit: { metric: 'none', amount: 1 },
    location: 'indoors',
    countsTowardReadiness: true,
    freezeSensitive: false,
    ...extra,
  };
  const batch: Batch = {
    _id: `batch:${id}`,
    type: 'batch',
    itemId: id,
    bestBefore: null,
    addedAt: '',
    updatedAt: '',
  };
  const move: Movement = {
    _id: `movement:${id}`,
    type: 'movement',
    batchId: batch._id,
    delta: units,
    reason: 'added',
    at: '',
    by: 't',
    updatedAt: '',
  };
  return [item, batch, move];
}

describe('lists', () => {
  it('has the shopping list and Recently used, with old purchases on the shopping list', () => {
    expect(snap.lists.map((l) => l.name)).toEqual(['Shopping list', 'Recently used']);
    expect(listIdOf(snap.purchases[0])).toBe(SHOPPING_LIST_ID);
    expect(entriesOn(snap, SHOPPING_LIST_ID)).toHaveLength(24);
    expect(groupEntries(entriesOn(snap, SHOPPING_LIST_ID)).map((g) => g.category)).toContain('Breakfast');
  });

  it('Use now adds to Recently used, counting up for the same item', () => {
    const item = snap.items[0];
    const first = recentEntry(snap, item, undefined, '2026-11-16T10:00:00.000Z');
    expect(first).toMatchObject({
      listId: RECENT_LIST_ID,
      itemId: item._id,
      quantity: '1',
      status: 'to_buy',
    });
    const again = recentEntry(
      snapshotFromDocs([...seed, first]),
      item,
      undefined,
      '2026-11-16T10:01:00.000Z',
    );
    expect(again._id).toBe(first._id);
    expect(again.quantity).toBe('2');
  });

  it('reads counts and maps workbook categories to the inventory', () => {
    expect(countOf('3')).toBe(3);
    expect(countOf('1 large jar')).toBeNull();
    const oats = snap.purchases.find((p) => p.name === 'Rolled porridge oats')!;
    expect(inventoryHint(oats, snap.categories)).toEqual({
      categoryId: 'category:food-mains',
      subCategory: 'Breakfast',
    });
  });
});

describe('rotation views', () => {
  const rows = rotationRows(snap, TODAY);
  it('due, all dated batches, everything; food only or all items', () => {
    const torch = snapshotFromDocs([...seed, ...stocked('item:torch', 'category:power-light', 2)]);
    const all = rotationRows(torch, TODAY);
    const due = filterRotation(all, 'due', true, torch.categories);
    expect(due.every((r) => r.status === 'expired' || r.status === 'use_soon')).toBe(true);
    expect(filterRotation(all, 'dated', true, torch.categories).every((r) => r.batch.bestBefore)).toBe(true);
    expect(filterRotation(all, 'all', true, torch.categories)).toHaveLength(rows.length);
    expect(filterRotation(all, 'all', false, torch.categories)).toHaveLength(rows.length + 1);
    expect(filterRotation(all, 'dated', false, torch.categories)).toHaveLength(
      rows.filter((r) => r.batch.bestBefore).length,
    ); // the undated torch is left out
  });
});

describe('checklist linked to the inventory', () => {
  const alarmLine = snap.checklistItems.find((l) => l.name === 'Battery carbon monoxide alarm')!;

  it('takes its status from the linked stock: Need, Check, Have', () => {
    expect(statusFromStock(0, 2)).toBe('need');
    expect(statusFromStock(1, 2)).toBe('check');
    expect(statusFromStock(2, 2)).toBe('have');
    const withLinks = (units: number): Snapshot => {
      const line: ChecklistItem = { ...alarmLine, itemIds: ['item:co-alarm-a', 'item:co-alarm-b'] };
      return snapshotFromDocs([
        ...seed.filter((d) => d._id !== alarmLine._id),
        line,
        ...stocked('item:co-alarm-a', 'category:safety-first-aid', units),
        ...stocked('item:co-alarm-b', 'category:safety-first-aid', 0),
      ]);
    };
    const one = resolveChecklist(withLinks(1));
    expect(one.lines.find((l) => l._id === alarmLine._id)!.status).toBe('check');
    expect(one.links.get(alarmLine._id)).toEqual({ amount: 1, target: 2 });
    expect(resolveChecklist(withLinks(2)).lines.find((l) => l._id === alarmLine._id)!.status).toBe('have');
  });

  it('counts water lines in litres', () => {
    const water = snap.checklistItems.find((l) => l.name === 'Drinking & cooking water')!;
    const docs = [
      ...seed.filter((d) => d._id !== water._id),
      { ...water, itemIds: ['item:bottles'] },
      ...stocked('item:bottles', 'category:water', 21, { perUnit: { metric: 'water_l', amount: 2 } }),
    ];
    const r = resolveChecklist(snapshotFromDocs(docs as AnyDoc[]));
    expect(r.links.get(water._id)).toEqual({ amount: 42, target: 42 });
    expect(r.lines.find((l) => l._id === water._id)!.status).toBe('have');
  });

  it('leaves out the lines the Food box replaces', () => {
    const r = resolveChecklist(snap);
    expect(snap.checklistItems.filter(isMealLine)).toHaveLength(3);
    expect(r.lines).toHaveLength(65);
  });
});

describe('Food box', () => {
  it('counts meals against people × days × meals a day', () => {
    const meals = mealCounts(snap, snap.settings, '2026-11-15');
    const by = Object.fromEntries(meals.map((m) => [m.type, m]));
    expect(by.breakfast.target).toBe(9); // 3 people × 3 days × 1
    expect(by.main.target).toBe(18); // × 2
    expect(by.side).toMatchObject({ count: 12, target: 9, band: 'green' });
    expect(by.breakfast.band).toBe('red');
    const custom = mealCounts(snap, { ...snap.settings, mealsPerDay: { main: 1 } }, '2026-11-15');
    expect(custom.find((m) => m.type === 'main')!.target).toBe(9);
  });

  it('counts a Breakfast sub-category as breakfast, whatever the category', () => {
    const docs = [
      ...seed,
      ...stocked('item:porridge', 'category:food-mains', 4, {
        subCategory: 'Breakfast',
        perUnit: { metric: 'kcal', amount: 400 },
      }),
    ];
    const meals = mealCounts(snapshotFromDocs(docs), snap.settings, '2026-11-15');
    expect(meals.find((m) => m.type === 'breakfast')!.count).toBe(4);
  });
});

describe('medicines per person', () => {
  it('shows the stock and days of each person’s medicine', () => {
    const docs = [
      ...seed.filter((d) => d.type !== 'settings'),
      {
        ...snap.settings,
        members: [
          {
            id: 'p1',
            name: 'Sam',
            age: 40,
            medications: [
              { id: 'm1', name: 'Levothyroxine', dosePerDay: 1, itemId: 'item:levo' },
              { id: 'm2', name: 'Inhaler', dosePerDay: null, itemId: null },
            ],
          },
        ],
      },
      ...stocked('item:levo', 'category:safety-first-aid', 2),
    ];
    const cover = medicationCover(snapshotFromDocs(docs as AnyDoc[]), 3);
    expect(cover[0]).toMatchObject({ stock: 2, days: 2, band: 'amber' });
    expect(cover[1]).toMatchObject({ stock: null, band: 'red' });
  });
});

describe('category units', () => {
  it('offers the category’s units plus any in use, and renames follow through', () => {
    const mains = snap.categories.find((c) => c._id === 'category:food-mains')!;
    expect(unitsOf(mains, snap.items)).toEqual(['pack', 'pouch', 'tin']);
    const plan = planUnits('category:food-mains', [{ original: 'pack', name: 'meal' }], snap.items);
    expect(plan.list).toEqual(['meal']);
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items.every((i) => i.unit === 'meal')).toBe(true);
    // Removing a unit leaves it on the items that use it.
    expect(planUnits('category:food-mains', [{ original: null, name: 'tin' }], snap.items).items).toEqual([]);
  });
});

describe('1.3.1: essentials and the water box', () => {
  it('counts lines ticked Essential, Have against all', () => {
    const lines = snap.checklistItems.slice(0, 4).map((l, i) => ({
      ...l,
      essential: i < 3,
      status: i === 0 ? ('have' as const) : ('need' as const),
    }));
    const e = essentialsSummary(lines);
    expect(e).toMatchObject({ have: 1, total: 3 });
    expect(e.missing.map((l) => l._id)).toEqual([lines[1]._id, lines[2]._id]);
    expect(essentialsSummary(snap.checklistItems)).toMatchObject({ have: 0, total: 0 });
    expect(matchesChecklistFilter(lines[0], 'essential', TODAY)).toBe(true);
    expect(matchesChecklistFilter(lines[3], 'essential', TODAY)).toBe(false);
  });

  it('judges stored water against litres for everyone for the target days', () => {
    // 3 people × 4 L + 2 dogs × 1 L = 14 L a day; 3 days = 42 L.
    expect(waterBox(0, 14, 3)).toMatchObject({ target: 42, band: 'red' });
    expect(waterBox(21, 14, 3).band).toBe('amber');
    expect(waterBox(42, 14, 3).band).toBe('green');
  });
});
