/**
 * Conflict resolution. Stock never conflicts (movements are new records), so
 * conflicts only reach editable records: settings, items, checklist lines,
 * contacts, notes. Rule from the brief: the newest edit (`updatedAt`) wins and
 * the losing version is logged.
 *
 * Both devices may resolve the same conflict at once; they reach the same
 * content, and any conflict that creates is identical and resolved silently.
 */
import type { AnyDoc, IsoDateTime } from '../model/types';

type Doc = PouchDB.Core.ExistingDocument<AnyDoc> & PouchDB.Core.GetMeta;

export interface ConflictRecord {
  at: IsoDateTime;
  docId: string;
  type: string;
  /** A readable name for the record, e.g. the item or contact name. */
  label: string;
  kept: { updatedAt: string };
  discarded: { updatedAt: string; summary: string }[];
}

const LOG_ID = '_local/conflict-log';
const LOG_LIMIT = 50;

/** The document without PouchDB bookkeeping, for comparing versions. */
function content(doc: Doc): string {
  const copy: Record<string, unknown> = { ...doc };
  for (const key of Object.keys(copy))
    if (key.startsWith('_') && key !== '_id' && key !== '_deleted') delete copy[key];
  return JSON.stringify(copy, Object.keys(copy).sort());
}

function label(doc: Doc): string {
  const d = doc as unknown as Record<string, unknown>;
  return String(d.name ?? d.title ?? (doc.type === 'settings' ? 'Settings' : doc._id));
}

/** Short description of what differs in a losing version. */
function summarise(loser: Doc, winner: Doc): string {
  const a = loser as unknown as Record<string, unknown>;
  const b = winner as unknown as Record<string, unknown>;
  const changed = Object.keys({ ...a, ...b }).filter(
    (k) => !k.startsWith('_') && k !== 'updatedAt' && JSON.stringify(a[k]) !== JSON.stringify(b[k]),
  );
  return changed.length ? `differed in: ${changed.join(', ')}` : 'same content';
}

/**
 * Resolve one document's conflicts. Returns a record when versions really
 * differed (identical copies, e.g. the same seed on two devices, are not logged).
 */
export async function resolveConflicts(
  db: PouchDB.Database<AnyDoc>,
  docId: string,
  now: () => string = () => new Date().toISOString(),
): Promise<ConflictRecord | null> {
  const current = (await db.get(docId, { conflicts: true })) as Doc;
  const revs = current._conflicts ?? [];
  if (!revs.length) return null;
  const others = (await Promise.all(revs.map((rev) => db.get(docId, { rev })))) as Doc[];

  let winner = current;
  for (const other of others) {
    if ((other.updatedAt ?? '') > (winner.updatedAt ?? '')) winner = other;
  }

  const writes: object[] = [];
  if (winner !== current) {
    // Put the newest content on top of the current winning branch.
    const { _rev, _conflicts, ...rest } = winner;
    void _rev;
    void _conflicts;
    writes.push({ ...rest, _rev: current._rev });
  }
  for (const other of others) writes.push({ _id: docId, _rev: other._rev, _deleted: true });
  await db.bulkDocs(writes as AnyDoc[]);

  const losers = [current, ...others].filter((d) => d !== winner);
  const differing = losers.filter((d) => content(d) !== content(winner));
  if (!differing.length) return null;

  const record: ConflictRecord = {
    at: now(),
    docId,
    type: winner.type,
    label: label(winner),
    kept: { updatedAt: winner.updatedAt },
    discarded: differing.map((d) => ({ updatedAt: d.updatedAt, summary: summarise(d, winner) })),
  };
  await appendLog(db, record);
  return record;
}

/** Resolve every conflicted document (run when sync starts). */
export async function resolveAllConflicts(db: PouchDB.Database<AnyDoc>): Promise<ConflictRecord[]> {
  const all = await db.allDocs({ conflicts: true, include_docs: true });
  const ids = all.rows.filter((r) => (r.doc as Doc | undefined)?._conflicts?.length).map((r) => r.id);
  const records: ConflictRecord[] = [];
  for (const id of ids) {
    const r = await resolveConflicts(db, id);
    if (r) records.push(r);
  }
  return records;
}

async function appendLog(db: PouchDB.Database<AnyDoc>, record: ConflictRecord): Promise<void> {
  // _local documents stay on this device and are never synced.
  for (let attempt = 0; attempt < 3; attempt++) {
    let log: { _id: string; _rev?: string; entries: ConflictRecord[] };
    try {
      log = (await db.get(LOG_ID)) as unknown as typeof log;
    } catch {
      log = { _id: LOG_ID, entries: [] };
    }
    log.entries = [record, ...log.entries].slice(0, LOG_LIMIT);
    try {
      await db.put(log as unknown as AnyDoc);
      return;
    } catch (error) {
      if ((error as { status?: number }).status !== 409) throw error;
    }
  }
}

export async function readConflictLog(db: PouchDB.Database<AnyDoc>): Promise<ConflictRecord[]> {
  try {
    return ((await db.get(LOG_ID)) as unknown as { entries: ConflictRecord[] }).entries;
  } catch {
    return [];
  }
}
