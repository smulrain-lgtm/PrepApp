import { describe, expect, it } from 'vitest';
import seedJson from '../seed/seed.json';
import { csvCell, inventoryCsv } from './inventory-csv';
import { snapshotFromDocs } from './model/snapshot';
import type { AnyDoc } from './model/types';
import { rotationRows } from './rotation';
import { buildShoppingList, shoppingCount, shoppingText } from './shopping';

const TODAY = '2026-11-16';
const snap = snapshotFromDocs(seedJson as AnyDoc[]);

describe('shopping list', () => {
  const list = buildShoppingList(snap);

  it('holds the household’s entries and the Check lines, not shortfalls or Need lines', () => {
    expect(list.check).toHaveLength(6); // gas, dry fuel, paraffin, first aid, prescriptions, warm layers
    expect(list.toBuy).toHaveLength(24);
    expect(list).not.toHaveProperty('shortfalls');
    expect(list).not.toHaveProperty('need');
    expect(shoppingCount(list)).toBe(24);
  });

  it('writes plain text for the share sheet', () => {
    const text = shoppingText(list, TODAY);
    expect(text).toContain('PrepApp shopping list – 16 Nov 2026');
    expect(text).toContain('On the shopping list:');
    expect(text).toContain('- Rolled porridge oats');
    expect(text).toContain('To check at home:');
    expect(text).not.toContain('42 L more');
    expect(text).not.toContain('Head torches');
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
      'Item,Category,Sub-category,Location,Best before,Status,Quantity,Unit,Counts as,Per unit,Supplier,Notes,' +
        'Barcode,Pack size,kcal per 100,Protein per 100 (g),Fat per 100 (g),Carbohydrate per 100 (g),Salt per 100 (g)',
    );
    expect(lines).toHaveLength(1 + 38);
    expect(csv).toContain(
      'Hot Chocolate,Food – Drinks,Drink,Garage,2027-04-01,Use soon,6,pack,Food calories,100 kcal,MOD,',
    );
    expect(csv).not.toMatch(/National Gas|Medicines and doses/);
  });
});
