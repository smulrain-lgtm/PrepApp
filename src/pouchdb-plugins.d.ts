// PouchDB adapter packages ship without type declarations.
declare module 'pouchdb-adapter-idb' {
  const plugin: PouchDB.Plugin;
  export default plugin;
}

declare module 'pouchdb-adapter-memory' {
  const plugin: PouchDB.Plugin;
  export default plugin;
}
