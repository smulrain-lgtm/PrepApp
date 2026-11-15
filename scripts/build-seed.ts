// Regenerates src/seed/seed.json from docs/seed-source/*.csv.
// Run with: npm run seed
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSeed } from '../src/seed/build-seed.ts';

const read = (name: string) => readFileSync(new URL(`../docs/seed-source/${name}`, import.meta.url), 'utf8');

const docs = buildSeed({
  checklistCsv: read('checklist.csv'),
  foodStoreCsv: read('food-store.csv'),
  shoppingListCsv: read('shopping-list.csv'),
});

const counts: Record<string, number> = {};
for (const d of docs) counts[d.type] = (counts[d.type] ?? 0) + 1;

writeFileSync(new URL('../src/seed/seed.json', import.meta.url), JSON.stringify(docs, null, 2) + '\n');
console.log('Wrote src/seed/seed.json', counts);
