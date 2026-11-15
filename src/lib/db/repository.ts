/**
 * The only code that writes to PouchDB. Screens call these methods; the
 * readiness engine reads the Snapshot they return.
 *
 * Rules: stock changes are new `movement` documents (never edits); deletes are
 * soft; every write stamps `updatedAt`.
 */
import { batchQuantities } from '../readiness';
import { snapshotFromDocs } from '../model/snapshot';
import type { AnyDoc, Batch, IsoDate, Movement, MovementReason, Snapshot } from '../model/types';

export type Db = PouchDB.Database<AnyDoc>;

export interface RepositoryOptions {
  /** Shown on each movement as "by", e.g. "Simon's iPhone". */
  deviceName: string;
  /** Clock, injectable for tests. */
  now?: () => string;
  /** Random id part, injectable for tests. */
  randomId?: () => string;
}

export interface TakeResult {
  /** Units actually taken. */
  taken: number;
  /** Units asked for but not in stock. */
  short: number;
  movements: Movement[];
}

/** Earliest best-before first; undated batches last; ties by id for stability. */
export function fifoOrder(a: Batch, b: Batch): number {
  if (a.bestBefore === b.bestBefore) return a._id.localeCompare(b._id);
  if (a.bestBefore === null) return 1;
  if (b.bestBefore === null) return -1;
  return a.bestBefore.localeCompare(b.bestBefore);
}

export class Repository {
  private readonly now: () => string;
  private readonly randomId: () => string;

  constructor(
    readonly db: Db,
    private readonly options: RepositoryOptions,
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.randomId = options.randomId ?? (() => crypto.randomUUID().slice(0, 8));
  }

  /** Load the seed on first run. Returns true when it wrote anything. */
  async seedIfEmpty(seed: AnyDoc[]): Promise<boolean> {
    try {
      await this.db.get('settings');
      return false;
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
    }
    const results = await this.db.bulkDocs(seed);
    const failed = results.filter((r) => 'error' in r && r.error);
    if (failed.length) throw new Error(`Seeding failed for ${failed.length} documents`);
    return true;
  }

  async loadSnapshot(): Promise<Snapshot> {
    const all = await this.db.allDocs({ include_docs: true });
    const docs = all.rows.map((r) => r.doc).filter((d): d is PouchDB.Core.ExistingDocument<AnyDoc> => !!d);
    return snapshotFromDocs(docs as AnyDoc[]);
  }

  /** Create or update an editable record (not movements). */
  async save<T extends AnyDoc>(doc: T): Promise<T> {
    if (doc.type === 'movement') throw new Error('Movements are append-only: use recordMovement');
    const next = { ...doc, updatedAt: this.now() };
    if (!next._rev) {
      try {
        next._rev = (await this.db.get(doc._id))._rev;
      } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
      }
    }
    const res = (await this.db.put(next as AnyDoc)) as PouchDB.Core.Response;
    return { ...next, _rev: res.rev };
  }

  /** Hide a record everywhere without removing it (other devices may still refer to it). */
  async softDelete(id: string): Promise<void> {
    const doc = await this.db.get(id);
    if (doc.type === 'movement') throw new Error('Movements cannot be deleted; record a correction');
    await this.db.put({ ...doc, deleted: true, updatedAt: this.now() });
  }

  async recordMovement(batchId: string, delta: number, reason: MovementReason): Promise<Movement> {
    if (!Number.isFinite(delta) || delta === 0) throw new Error('A movement needs a non-zero quantity');
    const at = this.now();
    const movement: Movement = {
      _id: `movement:${at}:${this.randomId()}`,
      type: 'movement',
      batchId,
      delta,
      reason,
      at,
      by: this.options.deviceName,
      updatedAt: at,
    };
    await this.db.put(movement);
    return movement;
  }

  /**
   * Add stock. Batches are keyed by item + date, so the same pack added on two
   * devices lands in one batch and the quantities add up.
   */
  async addStock(
    itemId: string,
    bestBefore: IsoDate | null,
    quantity: number,
    reason: 'added' | 'restocked' = 'added',
  ): Promise<Batch> {
    if (!(quantity > 0)) throw new Error('Quantity must be more than zero');
    const batchId = `batch:${itemId.replace(/^item:/, '')}:${bestBefore ?? 'undated'}`;
    let batch: Batch;
    try {
      const existing = (await this.db.get(batchId)) as Batch;
      batch = existing.deleted ? await this.save({ ...existing, deleted: false }) : existing;
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
      batch = await this.save<Batch>({
        _id: batchId,
        type: 'batch',
        itemId,
        bestBefore,
        addedAt: this.now(),
        updatedAt: this.now(),
      });
    }
    await this.recordMovement(batch._id, quantity, reason);
    return batch;
  }

  /** Take units from an item, soonest best-before first (first-expiry, first-out). */
  async takeStock(itemId: string, quantity: number, reason: 'used' | 'discarded'): Promise<TakeResult> {
    if (!(quantity > 0)) throw new Error('Quantity must be more than zero');
    const snap = await this.loadSnapshot();
    const qty = batchQuantities(snap.movements);
    const batches = snap.batches
      .filter((b) => b.itemId === itemId && !b.deleted && (qty.get(b._id) ?? 0) > 0)
      .sort(fifoOrder);

    let remaining = quantity;
    const movements: Movement[] = [];
    for (const batch of batches) {
      if (remaining === 0) break;
      const take = Math.min(remaining, qty.get(batch._id) ?? 0);
      movements.push(await this.recordMovement(batch._id, -take, reason));
      remaining -= take;
    }
    return { taken: quantity - remaining, short: remaining, movements };
  }

  /** Current quantity of each live batch of an item. */
  async itemStock(itemId: string): Promise<{ batch: Batch; quantity: number }[]> {
    const snap = await this.loadSnapshot();
    const qty = batchQuantities(snap.movements);
    return snap.batches
      .filter((b) => b.itemId === itemId && !b.deleted)
      .sort(fifoOrder)
      .map((batch) => ({ batch, quantity: qty.get(batch._id) ?? 0 }));
  }
}
