import { describe, expect, it } from 'vitest';
import seedJson from '../seed/seed.json';
import { csvCell, inventoryCsv } from './inventory-csv';
import { snapshotFromDocs } from './model/snapshot';
import type { AnyDoc } from './model/types';
import { computeReadiness } from './readiness';
import { rotationRows } from './rotation';
import { buildShoppingList, shoppingCount, shoppingText } from './shopping';

const TODAY = '2026-11-16';
const snap = snapshotFromDocs(seedJson as AnyDoc[]);
const readiness = computeReadiness(snap, TODAY);

describe('shopping list', () => {
  const list = buildShoppingList(snap, readiness);

  it('gathers shortfalls, Need lines and planned purchases', () => {
    expect(list.shortfalls.map((s) => s.label)).toEqual([
      'Water',
      'Food calories',
      'Pet food',
      'Cooking fuel',
    ]);
    expect(list.shortfalls[0].amount).toBe('42 L');
    expect(list.need).toHaveLength(52);
    expect(list.check).toHaveLength(6); // gas, dry fuel, paraffin, first aid, prescriptions, warm layers
    expect(list.toBuy).toHaveLength(24);
    expect(shoppingCount(list)).toBe(4 + 52 + 24);
  });

  it('writes plain text for the share sheet', () => {
    const text = shoppingText(list, TODAY, 3);
    expect(text).toContain('PrepApp shopping list – 16 Nov 2026');
    expect(text).toContain('- Water: 42 L more');
    expect(text).toContain('- Head torches – 3 per person');
    expect(text).toContain('Planned food:');
    expect(text).toContain('To check at home:');
  });
});

describe('rotation', () => {
  it('lists every batch in stock, soonest first, undated last', () => {
    const rows = rotationRows(snap, TODAY);
    expect(rows).toHaveLength(38);
    expect(rows[0].batch.bestBefore).toBe('1996-08-25');
    expect(rows.at(-1)!.batch.bestBefore).toBeNull();
    const dated = rows.filter((r) => r.batch.bestBefore).map((r) => r.batch.bestBefore!);
    expect(dated).toEqual([...dated].sort());
  });
});

describe('inventory CSV', () => {
  it('escapes cells', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
  });

  it('has a row per batch and no medical or contact data', () => {
    const csv = inventoryCsv(snap, TODAY);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // byte-order mark, so Excel reads £ and dashes
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'Item,Category,Sub-category,Location,Best before,Status,Quantity,Unit,Counts as,Per unit,Supplier,Notes',
    );
    expect(lines).toHaveLength(1 + 38);
    expect(csv).toContain(
      'Hot Chocolate,Food – Drinks,Drink,Garage,2027-04-01,Use soon,6,pack,Food calories,100 kcal,MOD,',
    );
    expect(csv).not.toMatch(/National Gas|Medicines and doses/);
  });
});
