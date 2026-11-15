import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import seedJson from './seed.json';
import { buildSeed } from './build-seed';
import { batchQuantities, expiryStatus } from '../lib/readiness';
import type { AnyDoc, Batch, ChecklistItem, Item, Movement } from '../lib/model/types';

const read = (name: string) =>
  readFileSync(new URL(`../../docs/seed-source/${name}`, import.meta.url), 'utf8');
const docs = buildSeed({
  checklistCsv: read('checklist.csv'),
  foodStoreCsv: read('food-store.csv'),
  shoppingListCsv: read('shopping-list.csv'),
});
const ofType = <T extends AnyDoc>(type: T['type']) => docs.filter((d) => d.type === type) as T[];

describe('seed built from the household workbook', () => {
  it('matches the committed seed.json (run `npm run seed` after changing the workbook)', () => {
    expect(seedJson).toEqual(docs);
  });

  it('has 53 packs in 38 batches across 30 products', () => {
    const qty = batchQuantities(ofType<Movement>('movement'));
    const total = [...qty.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(53);
    expect(ofType<Batch>('batch')).toHaveLength(38);
    expect(ofType<Item>('item')).toHaveLength(30);
  });

  it('has 18 expired packs and 3 undated packs on 15 Nov 2026', () => {
    const qty = batchQuantities(ofType<Movement>('movement'));
    const count = (status: string) =>
      ofType<Batch>('batch')
        .filter((b) => expiryStatus(b.bestBefore, '2026-11-15', 6) === status)
        .reduce((s, b) => s + (qty.get(b._id) ?? 0), 0);
    expect(count('expired')).toBe(18);
    expect(count('no_date')).toBe(3);
    expect(count('use_soon')).toBe(23);
  });

  it('merges repeated products into batches (9 hot chocolates in 4 batches)', () => {
    const hotChoc = ofType<Batch>('batch').filter((b) => b.itemId === 'item:hot-chocolate');
    expect(hotChoc.map((b) => b.bestBefore)).toEqual([
      '2026-10-01',
      '2026-12-01',
      '2027-02-01',
      '2027-04-01',
    ]);
    const qty = batchQuantities(ofType<Movement>('movement'));
    expect(qty.get('batch:hot-chocolate:2027-04-01')).toBe(6);
  });

  it('flags dates before 2005 for checking', () => {
    const flagged = ofType<Batch>('batch').filter((b) => b.note === 'Check printed date');
    expect(flagged.map((b) => b.bestBefore).sort()).toEqual([
      '1996-08-25',
      '2001-01-01',
      '2001-12-13',
      '2001-12-13',
      '2002-08-15',
    ]);
  });

  it('loads the checklist: 9 sections, 68 lines, wood stoves split out', () => {
    expect(ofType('checklistSection')).toHaveLength(9);
    const lines = ofType<ChecklistItem>('checklistItem');
    expect(lines).toHaveLength(68);
    const stoves = lines.find((l) => l.name === 'Wood stoves')!;
    expect(stoves.status).toBe('have');
    expect(stoves.target.amount).toBe(3);
    expect(lines.find((l) => l.name === 'Dry fuel, kindling, firelighters')!.status).toBe('check');
    expect(lines.find((l) => l.name === 'First aid kit')!.checkIntervalDays).toBe(182);
  });

  it('loads 24 planned purchases and the UK contacts', () => {
    expect(ofType('purchase')).toHaveLength(24);
    const names = ofType<{ type: 'contact'; name: string } & AnyDoc>('contact').map((c) => c.name);
    expect(names).toContain('National Gas emergency');
  });
});
