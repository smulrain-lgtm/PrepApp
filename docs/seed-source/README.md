# Seed source

Household snapshot of 15 Nov 2026, used to build `seed.json`.

- `Emergency Provisions Checklist.xlsx` — the original workbook.
- `checklist.csv` — equipment and provisions checklist (9 sections, 67 lines).
- `food-store.csv` — current food inventory: 53 packs, 38 batches (same product + best-before date), 30 products, 18 expired as of 15 Nov 2026.
- `shopping-list.csv` — food still to buy (status To buy / Bought).

The CSVs are plain exports of the workbook tabs (dates as YYYY-MM-DD) so changes show up in diffs.

## How the app uses it

`npm run seed` (`scripts/build-seed.ts` → `src/seed/build-seed.ts`) turns the CSVs into `src/seed/seed.json`, which each device loads the first time PrepApp opens (and again after **Reset to starting data**). A unit test fails if `seed.json` is out of date with the CSVs.

| Sheet         | Becomes                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Food Store    | 30 items and 38 batches (same product + date), with a stock movement per batch; calories estimated by type; dates before 2005 flagged "Check printed date"                |
| Checklist     | 9 sections, 68 lines (the wood-stove line is split into _Wood stoves_, Have, and _Dry fuel, kindling, firelighters_, Check). Every target is a number that can be edited   |
| Shopping List | 24 planned purchases, status To buy                                                                                                                                       |

The seed also sets the household defaults (3 people, two dogs at 120 g and 80 g of dry food a day, 3-day target, 14-day goal, past-date food not counted) and the UK emergency contacts. Full detail: [`docs/PROJECT.md` §7](../PROJECT.md#7-starting-data).
