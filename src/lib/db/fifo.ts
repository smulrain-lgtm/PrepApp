import type { Batch } from '../model/types';

/** Earliest best-before first; undated batches last; ties by id for stability. */
export function fifoOrder(a: Batch, b: Batch): number {
  if (a.bestBefore === b.bestBefore) return a._id.localeCompare(b._id);
  if (a.bestBefore === null) return 1;
  if (b.bestBefore === null) return -1;
  return a.bestBefore.localeCompare(b.bestBefore);
}
