/** Rotation view: every batch in stock, soonest best-before first. */
import { buildItemRows, type BatchRow } from './inventory-view';
import type { IsoDate, Item, Snapshot } from './model/types';
import { fifoOrder } from './db/fifo';

export interface RotationRow extends BatchRow {
  item: Item;
}

export function rotationRows(snap: Snapshot, today: IsoDate): RotationRow[] {
  return buildItemRows(snap, today)
    .flatMap((r) => r.batches.map((b) => ({ ...b, item: r.item })))
    .sort((a, b) => fifoOrder(a.batch, b.batch) || a.item.name.localeCompare(b.item.name));
}
