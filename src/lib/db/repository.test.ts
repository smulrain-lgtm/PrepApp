import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../seed/seed.json';
import { batchQuantities, computeReadiness } from '../readiness';
import type { AnyDoc, Item } from '../model/types';
import { Repository } from './repository';

PouchDB.plugin(memory);

let counter = 0;
function newRepo(deviceName = 'test-device') {
  const db = new PouchDB<AnyDoc>(`test-${++counter}-${Date.now()}`, { adapter: 'memory' });
  let tick = 0;
  return new Repository(db, {
    deviceName,
    now: () => new Date(Date.UTC(2026, 10, 15, 12, 0, tick++)).toISOString(),
    randomId: () => String(tick).padStart(4, '0'),
  });
}

const seed = seedJson as AnyDoc[];

describe('Repository', () => {
  let repo: Repository;

  beforeEach(async () => {
    repo = newRepo();
    await repo.seedIfEmpty(seed);
  });

  it('seeds once and loads the same data back', async () => {
    expect(await repo.seedIfEmpty(seed)).toBe(false);
    const snap = await repo.loadSnapshot();
    expect(snap.items).toHaveLength(30);
    expect(snap.batches).toHaveLength(38);
    expect(snap.checklistItems).toHaveLength(68);
    expect(snap.settings.pets).toHaveLength(2);
    const total = [...batchQuantities(snap.movements).values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(53);
  });

  it('takes stock soonest-expiry first, across batches', async () => {
    // Hot chocolate: 1 × Oct 2026, 1 × Dec 2026, 1 × Feb 2027, 6 × Apr 2027.
    const result = await repo.takeStock('item:hot-chocolate', 3, 'used');
    expect(result).toMatchObject({ taken: 3, short: 0 });
    const stock = await repo.itemStock('item:hot-chocolate');
    expect(stock.map((s) => [s.batch.bestBefore, s.quantity])).toEqual([
      ['2026-10-01', 0],
      ['2026-12-01', 0],
      ['2027-02-01', 0],
      ['2027-04-01', 6],
    ]);
  });

  it('takes undated stock last and reports a shortfall', async () => {
    const result = await repo.takeStock('item:peanut-butter', 5, 'used');
    expect(result).toMatchObject({ taken: 3, short: 2 });
  });

  it('records each change as a new movement and never edits one', async () => {
    const before = (await repo.loadSnapshot()).movements.length;
    await repo.takeStock('item:biscuit-browns', 1, 'used');
    await repo.addStock('item:biscuit-browns', '2028-08-01', 2, 'restocked');
    const snap = await repo.loadSnapshot();
    expect(snap.movements.length).toBe(before + 2);
    expect(snap.movements.filter((m) => m.by === 'test-device').map((m) => m.delta)).toEqual([-1, 2]);
    await expect(repo.save(snap.movements[0])).rejects.toThrow(/append-only/);
  });

  it('adds stock to the matching batch, or a new one for a new date', async () => {
    await repo.addStock('item:just-nuts', '2027-05-01', 2);
    await repo.addStock('item:just-nuts', '2028-01-01', 1);
    const stock = await repo.itemStock('item:just-nuts');
    expect(stock.map((s) => [s.batch.bestBefore, s.quantity])).toEqual([
      ['2027-05-01', 4],
      ['2028-01-01', 1],
    ]);
  });

  it('soft-deletes: the item is kept but no longer counts', async () => {
    const kcal = async () =>
      computeReadiness(await repo.loadSnapshot(), '2026-11-15').metrics.find((m) => m.metric === 'kcal')!
        .stock;
    const before = await kcal();
    await repo.softDelete('item:pasta-bolognaise');
    const snap = await repo.loadSnapshot();
    expect(snap.items.find((i) => i._id === 'item:pasta-bolognaise')?.deleted).toBe(true);
    expect(await kcal()).toBe(before - 500);
  });

  it('stamps updatedAt on every save', async () => {
    const snap = await repo.loadSnapshot();
    const item = snap.items[0] as Item;
    const saved = await repo.save({ ...item, notes: 'moved to top shelf' });
    expect(saved.updatedAt).not.toBe(item.updatedAt);
    expect(saved._rev).not.toBe(item._rev);
  });

  it('a save from an out-of-date copy on this device still lands (newest wins)', async () => {
    const line = (await repo.loadSnapshot()).checklistItems[0];
    await repo.save({ ...line, status: 'check' });
    await repo.save({ ...line, status: 'have' }); // same stale _rev as the first save
    const after = (await repo.loadSnapshot()).checklistItems[0];
    expect(after.status).toBe('have');
  });

  it('two devices taking the same item both count (no lost update)', async () => {
    // Same database here; Stage 4 tests this across replicated databases.
    const other = new Repository(repo.db, { deviceName: 'ipad', now: () => '2026-11-15T13:00:00.000Z' });
    await repo.takeStock('item:chocolate-cake', 1, 'used');
    await other.takeStock('item:chocolate-cake', 1, 'used');
    const stock = await repo.itemStock('item:chocolate-cake');
    expect(stock.reduce((s, x) => s + x.quantity, 0)).toBe(0);
  });
});
