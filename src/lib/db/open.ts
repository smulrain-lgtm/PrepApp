/** Opens the on-device database (IndexedDB) in the browser. */
import PouchDB from 'pouchdb-core';
import idb from 'pouchdb-adapter-idb';
import type { AnyDoc } from '../model/types';

PouchDB.plugin(idb);

export const LOCAL_DB_NAME = 'prepapp';

export function openLocalDb(name = LOCAL_DB_NAME): PouchDB.Database<AnyDoc> {
  return new PouchDB<AnyDoc>(name, { adapter: 'idb', auto_compaction: true });
}
