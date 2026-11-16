/* eslint-disable @typescript-eslint/no-require-imports */
// A small in-memory CouchDB stand-in for end-to-end sync tests (no auth).
// The real server is CouchDB 3 behind Caddy on the Pi (see server/).
const express = require('express');
const PouchDB = require('pouchdb-core')
  .plugin(require('pouchdb-adapter-memory'))
  .plugin(require('pouchdb-mapreduce'))
  .plugin(require('pouchdb-replication'));

const MemPouch = PouchDB.defaults({ adapter: 'memory' });
const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Origin');
    res.set('Vary', 'Origin');
  }
  res.set('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.get('/_up', (_req, res) => res.json({ status: 'ok' }));
app.use('/', require('express-pouchdb')(MemPouch, { mode: 'minimumForPouchDB', inMemoryConfig: true }));

const port = Number(process.env.PORT || 5998);
app.listen(port, () => console.log(`couchsim listening on ${port}`));
