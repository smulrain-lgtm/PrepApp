/**
 * Sync behaviour, using three in-memory databases: an iPhone, an iPad and the
 * Pi's CouchDB in between. Each device is seeded on its own, as in real life.
 */
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import replication from 'pouchdb-replication';
import { beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../seed/seed.json';
import { Repository } from '../db/repository';
import type { AnyDoc, Contact } from '../model/types';
import { computeReadiness } from '../readiness';
import { readConflictLog, resolveAllConflicts } from './conflicts';

PouchDB.plugin(memory).plugin(replication);

let n = 0;
const newDb = (name: string) => new PouchDB<AnyDoc>(`${name}-${++n}-${Date.now()}`, { adapter: 'memory' });

function device(name: string, clock: { t: number }) {
  return new Repository(newDb(name), {
    deviceName: name,
    now: () => new Date(Date.UTC(2026, 10, 16, 12, 0, clock.t++)).toISOString(),
  });
}

/** One full round of sync for a device, then settle conflicts as the app does. */
async function syncDevice(repo: Repository, server: PouchDB.Database<AnyDoc>) {
  await repo.db.sync(server);
  await resolveAllConflicts(repo.db);
  await repo.db.sync(server); // send the resolution
}

async function syncAll(server: PouchDB.Database<AnyDoc>, ...devices: Repository[]) {
  // Twice round, so every device sees every other device's changes and resolutions.
  for (let i = 0; i < 2; i++) for (const d of devices) await syncDevice(d, server);
}

const qty = async (repo: Repository, itemId: string) =>
  (await repo.itemStock(itemId)).reduce((s, b) => s + b.quantity, 0);

describe('sync between two devices through the Pi', () => {
  const clock = { t: 0 };
  let iphone: Repository;
  let ipad: Repository;
  let server: PouchDB.Database<AnyDoc>;

  beforeEach(async () => {
    iphone = device('iPhone', clock);
    ipad = device('iPad', clock);
    server = newDb('pi');
    await iphone.seedIfEmpty(seedJson as AnyDoc[]);
    await ipad.seedIfEmpty(seedJson as AnyDoc[]);
    await syncAll(server, iphone, ipad);
  });

  it('starts identical: the separately seeded copies merge with nothing logged', async () => {
    expect(await readConflictLog(iphone.db)).toEqual([]);
    expect(await readConflictLog(ipad.db)).toEqual([]);
    const a = await iphone.loadSnapshot();
    const b = await ipad.loadSnapshot();
    expect(a.items).toHaveLength(30);
    expect(computeReadiness(b, '2026-11-16')).toEqual(computeReadiness(a, '2026-11-16'));
    const conflicted = await iphone.db.allDocs({ conflicts: true, include_docs: true });
    expect(conflicted.rows.filter((r) => (r.doc as { _conflicts?: string[] })._conflicts?.length)).toEqual(
      [],
    );
  });

  it('criterion 4: different items edited offline on each device both appear after reconnecting', async () => {
    // Offline: the iPhone uses a hot chocolate, the iPad adds a new water item.
    await iphone.takeStock('item:hot-chocolate', 1, 'used');
    await ipad.save({
      _id: 'item:bottled-water',
      type: 'item',
      updatedAt: '',
      name: 'Bottled water 2 L',
      categoryId: 'category:water',
      unit: 'bottle',
      perUnit: { metric: 'water_l', amount: 2 },
      location: 'indoors',
      countsTowardReadiness: true,
      freezeSensitive: false,
    });
    await ipad.addStock('item:bottled-water', '2030-01-01', 6);

    await syncAll(server, iphone, ipad);

    for (const repo of [iphone, ipad]) {
      expect(await qty(repo, 'item:hot-chocolate')).toBe(8);
      expect(await qty(repo, 'item:bottled-water')).toBe(6);
    }
    expect(await readConflictLog(iphone.db)).toEqual([]);
  });

  it('criterion 5: the same item used offline on both devices (−1 each) leaves the right total', async () => {
    expect(await qty(iphone, 'item:just-nuts')).toBe(2);
    await iphone.takeStock('item:just-nuts', 1, 'used');
    await ipad.takeStock('item:just-nuts', 1, 'used');
    await syncAll(server, iphone, ipad);
    expect(await qty(iphone, 'item:just-nuts')).toBe(0);
    expect(await qty(ipad, 'item:just-nuts')).toBe(0);
    const movements = (await iphone.loadSnapshot()).movements.filter((m) => m.reason === 'used');
    expect(movements.map((m) => m.by).sort()).toEqual(['iPad', 'iPhone']);
  });

  it('criterion 5 across batches: both devices take the last pack of the same batch', async () => {
    // Hot chocolate: 1 pack dated Oct 2026, then 1 + 1 + 6 in later batches = 9.
    await iphone.takeStock('item:hot-chocolate', 1, 'used');
    await ipad.takeStock('item:hot-chocolate', 1, 'used');
    await syncAll(server, iphone, ipad);
    for (const repo of [iphone, ipad]) {
      expect(await qty(repo, 'item:hot-chocolate')).toBe(7);
      const stock = await repo.itemStock('item:hot-chocolate');
      // The overdrawn oldest batch reads 0; the shortfall came off the next one.
      expect(stock.map((s) => s.quantity)).toEqual([0, 0, 1, 6]);
      const r = computeReadiness(await repo.loadSnapshot(), '2026-11-16');
      expect(r.expiry.withinWarning + r.expiry.expired).toBeGreaterThan(0);
    }
  });

  it('the same record edited on both devices: newest wins everywhere and the other is logged', async () => {
    const gp = (await iphone.loadSnapshot()).contacts.find((c) => c._id === 'contact:gp-surgery')!;
    await iphone.save({ ...gp, phones: ['01234 111111'] } as Contact); // earlier
    const gpOnIpad = (await ipad.loadSnapshot()).contacts.find((c) => c._id === 'contact:gp-surgery')!;
    await ipad.save({ ...gpOnIpad, phones: ['01234 222222'] } as Contact); // later: wins

    await syncAll(server, iphone, ipad);

    for (const repo of [iphone, ipad]) {
      const c = (await repo.loadSnapshot()).contacts.find((x) => x._id === 'contact:gp-surgery')!;
      expect(c.phones).toEqual(['01234 222222']);
      const doc = await repo.db.get('contact:gp-surgery', { conflicts: true });
      expect(doc._conflicts ?? []).toEqual([]);
    }
    const log = [...(await readConflictLog(iphone.db)), ...(await readConflictLog(ipad.db))];
    expect(log.length).toBeGreaterThan(0);
    expect(log[0]).toMatchObject({ docId: 'contact:gp-surgery', label: 'GP surgery' });
    expect(log[0].discarded[0].summary).toBe('differed in: phones');
  });

  it('settings changed on both devices: the newest change wins', async () => {
    const s1 = (await iphone.loadSnapshot()).settings;
    await iphone.save({ ...s1, people: 4 });
    const s2 = (await ipad.loadSnapshot()).settings;
    await ipad.save({ ...s2, targetDays: 5 }); // later
    await syncAll(server, iphone, ipad);
    for (const repo of [iphone, ipad]) {
      const s = (await repo.loadSnapshot()).settings;
      // Whole-record rule: the iPad's version wins, so people stays at 3.
      expect(s).toMatchObject({ people: 3, targetDays: 5 });
    }
  });

  it('a soft delete on one device and a stock change on the other both survive', async () => {
    await iphone.softDelete('item:biscuit-browns');
    await ipad.takeStock('item:biscuit-browns', 1, 'used');
    await syncAll(server, iphone, ipad);
    for (const repo of [iphone, ipad]) {
      const snap = await repo.loadSnapshot();
      expect(snap.items.find((i) => i._id === 'item:biscuit-browns')?.deleted).toBe(true);
      expect(await qty(repo, 'item:biscuit-browns')).toBe(2); // 3 − 1; the movement is kept
    }
  });
});
