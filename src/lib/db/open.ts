/** Opens the on-device database (IndexedDB) in the browser. */
import PouchDB from 'pouchdb-core';
import idb from 'pouchdb-adapter-idb';
import http from 'pouchdb-adapter-http';
import replication from 'pouchdb-replication';
import type { AnyDoc } from '../model/types';

// idb: this device's database. http + replication: sync with CouchDB on the Pi.
PouchDB.plugin(idb).plugin(http).plugin(replication);

export const LOCAL_DB_NAME = 'prepapp';

export function openLocalDb(name = LOCAL_DB_NAME): PouchDB.Database<AnyDoc> {
  return new PouchDB<AnyDoc>(name, { adapter: 'idb', auto_compaction: true });
}
