/**
 * The only code that writes to PouchDB. Screens call these methods; the
 * readiness engine reads the Snapshot they return.
 *
 * Rules: stock changes are new `movement` documents (never edits); deletes are
 * soft; every write stamps `updatedAt`.
 */
import { batchQuantities } from '../readiness';
import { snapshotFromDocs } from '../model/snapshot';
import { stripRevs } from '../backup';
import { fifoOrder } from './fifo';
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

export { fifoOrder };

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

  /** Load documents into an empty database (first run, or restoring a backup). */
  async importDocs(docs: AnyDoc[]): Promise<void> {
    const results = await this.db.bulkDocs(stripRevs(docs));
    const failed = results.filter((r) => 'error' in r && r.error);
    if (failed.length) throw new Error(`Could not write ${failed.length} of ${docs.length} records`);
  }

  /** Every document, without revision ids, for a JSON backup. */
  async exportDocs(): Promise<AnyDoc[]> {
    // attachments: true inlines photos as base64 so the backup is complete.
    const all = await this.db.allDocs({ include_docs: true, attachments: true });
    return stripRevs(all.rows.map((r) => r.doc).filter(Boolean) as AnyDoc[]);
  }

  /** Load the seed on first run. Returns true when it wrote anything. */
  async seedIfEmpty(seed: AnyDoc[]): Promise<boolean> {
    try {
      await this.db.get('settings');
      return false;
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
    }
    await this.importDocs(seed);
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
    try {
      const res = (await this.db.put(next as AnyDoc)) as PouchDB.Core.Response;
      return { ...next, _rev: res.rev };
    } catch (error) {
      // Saved from an out-of-date copy on this device (e.g. two quick taps):
      // this edit is the newest, so it wins. Cross-device conflicts are Stage 4's resolver.
      if ((error as { status?: number }).status !== 409) throw error;
      next._rev = (await this.db.get(doc._id))._rev;
      const res = (await this.db.put(next as AnyDoc)) as PouchDB.Core.Response;
      return { ...next, _rev: res.rev };
    }
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

  /**
   * The item list's +1: add to the batch with the latest best-before date
   * (the pack most like one just bought). Returns null when the item has no
   * batch yet, so the caller can ask for a date.
   */
  async addOneToLatest(itemId: string): Promise<Batch | null> {
    const snap = await this.loadSnapshot();
    const batches = snap.batches.filter((b) => b.itemId === itemId && !b.deleted).sort(fifoOrder);
    const dated = batches.filter((b) => b.bestBefore !== null);
    const latest = dated.length ? dated[dated.length - 1] : batches[0];
    if (!latest) return null;
    await this.recordMovement(latest._id, 1, 'added');
    return latest;
  }

  /** Store or replace a note's photo (a JPEG blob) as its `photo` attachment. */
  async putPhoto(noteId: string, photo: Blob): Promise<void> {
    const doc = await this.db.get(noteId);
    const res = await this.db.putAttachment(noteId, 'photo', doc._rev, photo, photo.type || 'image/jpeg');
    const updated = await this.db.get(noteId);
    await this.db.put({ ...updated, _rev: res.rev, hasPhoto: true, updatedAt: this.now() } as AnyDoc);
  }

  async removePhoto(noteId: string): Promise<void> {
    const doc = await this.db.get(noteId);
    const res = await this.db.removeAttachment(noteId, 'photo', doc._rev);
    const updated = await this.db.get(noteId);
    await this.db.put({ ...updated, _rev: res.rev, hasPhoto: false, updatedAt: this.now() } as AnyDoc);
  }

  async getPhoto(noteId: string): Promise<Blob | null> {
    try {
      return (await this.db.getAttachment(noteId, 'photo')) as Blob;
    } catch (error) {
      if ((error as { status?: number }).status === 404) return null;
      throw error;
    }
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
