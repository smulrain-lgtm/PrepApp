import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it } from 'vitest';
import seedJson from '../seed/seed.json';
import { BackupError, backupFileName, createBackup, parseBackup } from './backup';
import { Repository } from './db/repository';
import type { AnyDoc } from './model/types';
import { computeReadiness } from './readiness';

PouchDB.plugin(memory);

let n = 0;
const repo = (device = 'test') =>
  new Repository(new PouchDB<AnyDoc>(`backup-${++n}-${Date.now()}`, { adapter: 'memory' }), {
    deviceName: device,
  });

const meta = { exportedAt: '2026-11-15T10:00:00.000Z', appVersion: '0.2.0', device: 'iPhone' };

describe('backup', () => {
  it('round-trips: export, restore elsewhere, identical readiness', async () => {
    const a = repo('iphone');
    await a.seedIfEmpty(seedJson as AnyDoc[]);
    await a.takeStock('item:hot-chocolate', 2, 'used');
    await a.addStock('item:just-nuts', '2028-01-01', 3);

    const text = JSON.stringify(createBackup(await a.exportDocs(), meta));
    const restored = parseBackup(text);

    const b = repo('ipad');
    await b.importDocs(restored.docs);

    const today = '2026-11-15';
    expect(computeReadiness(await b.loadSnapshot(), today)).toEqual(
      computeReadiness(await a.loadSnapshot(), today),
    );
    expect((await b.loadSnapshot()).movements).toHaveLength((await a.loadSnapshot()).movements.length);
  });

  it('strips revision ids so the backup restores into any database', () => {
    const backup = createBackup(
      [{ _id: 'settings', _rev: '3-abc', type: 'settings' } as unknown as AnyDoc],
      meta,
    );
    expect(backup.docs[0]).not.toHaveProperty('_rev');
  });

  it('names the file by date', () => {
    expect(backupFileName(meta.exportedAt)).toBe('prepapp-backup-2026-11-15.json');
  });

  it.each([
    ['not json', 'This file is not valid JSON.'],
    ['{"app":"other"}', 'This is not a PrepApp backup file.'],
    [
      '{"app":"prepapp","format":99,"docs":[]}',
      'This backup was made by a newer version of PrepApp. Update the app first.',
    ],
    ['{"app":"prepapp","format":1}', 'The backup has no data in it.'],
    [
      '{"app":"prepapp","format":1,"docs":[{"_id":"x","type":"weird"}]}',
      'The backup contains a record PrepApp does not recognise.',
    ],
    [
      '{"app":"prepapp","format":1,"docs":[{"_id":"item:a","type":"item"}]}',
      'The backup is missing its settings.',
    ],
  ])('rejects %s', (text, message) => {
    expect(() => parseBackup(text)).toThrow(BackupError);
    expect(() => parseBackup(text)).toThrow(message);
  });

  it('rejects duplicate records', () => {
    const docs = [
      { _id: 'settings', type: 'settings' },
      { _id: 'item:a', type: 'item' },
      { _id: 'item:a', type: 'item' },
    ];
    expect(() => parseBackup(JSON.stringify({ app: 'prepapp', format: 1, docs }))).toThrow('twice');
  });
});
