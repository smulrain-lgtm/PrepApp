/**
 * JSON backup: every document in the database, without PouchDB revision ids.
 * Restoring replaces all data on the device with the backup's.
 */
import type { AnyDoc, DocType, IsoDateTime } from './model/types';

export const BACKUP_FORMAT = 1;

export interface Backup {
  app: 'prepapp';
  format: number;
  exportedAt: IsoDateTime;
  appVersion: string;
  device: string;
  docs: AnyDoc[];
}

const DOC_TYPES: DocType[] = [
  'settings',
  'category',
  'item',
  'batch',
  'movement',
  'checklistSection',
  'checklistItem',
  'contact',
  'infoNote',
  'purchase',
  'list',
];

export function stripRevs(docs: AnyDoc[]): AnyDoc[] {
  return docs.map((doc) => {
    const copy = { ...doc } as AnyDoc & { _rev?: string; _conflicts?: unknown };
    delete copy._rev;
    delete copy._conflicts;
    return copy;
  });
}

export function createBackup(
  docs: AnyDoc[],
  meta: { exportedAt: IsoDateTime; appVersion: string; device: string },
): Backup {
  return { app: 'prepapp', format: BACKUP_FORMAT, ...meta, docs: stripRevs(docs) };
}

export function backupFileName(exportedAt: IsoDateTime): string {
  return `prepapp-backup-${exportedAt.slice(0, 10)}.json`;
}

export class BackupError extends Error {}

/** Parse and check a backup file. Throws BackupError with a readable message. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('This file is not valid JSON.');
  }
  const b = data as Partial<Backup>;
  if (!b || typeof b !== 'object' || b.app !== 'prepapp') {
    throw new BackupError('This is not a PrepApp backup file.');
  }
  if (typeof b.format !== 'number' || b.format > BACKUP_FORMAT) {
    throw new BackupError('This backup was made by a newer version of PrepApp. Update the app first.');
  }
  if (!Array.isArray(b.docs)) throw new BackupError('The backup has no data in it.');

  const ids = new Set<string>();
  for (const doc of b.docs as Partial<AnyDoc>[]) {
    if (!doc || typeof doc._id !== 'string' || !DOC_TYPES.includes(doc.type as DocType)) {
      throw new BackupError('The backup contains a record PrepApp does not recognise.');
    }
    if (ids.has(doc._id)) throw new BackupError(`The backup contains "${doc._id}" twice.`);
    ids.add(doc._id);
  }
  if (!ids.has('settings')) throw new BackupError('The backup is missing its settings.');

  return {
    app: 'prepapp',
    format: b.format,
    exportedAt: String(b.exportedAt ?? ''),
    appVersion: String(b.appVersion ?? ''),
    device: String(b.device ?? ''),
    docs: stripRevs(b.docs as AnyDoc[]),
  };
}
