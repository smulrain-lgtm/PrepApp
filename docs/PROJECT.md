# PrepApp — project record

The complete reference for PrepApp: what it is for, every decision made, how it is built, how to run it, and what is left. Current to version 1.1.0 (16 Nov 2026). For day-to-day use, see the [README](../README.md); for the Pi, see [`server/README.md`](../server/README.md).

**Contents**

1. [Purpose](#1-purpose)
2. [Decisions](#2-decisions)
3. [Architecture](#3-architecture)
4. [Data model](#4-data-model)
5. [Readiness calculation](#5-readiness-calculation)
6. [Sync and conflicts](#6-sync-and-conflicts)
7. [Starting data](#7-starting-data)
8. [Features by screen](#8-features-by-screen)
9. [Build history](#9-build-history)
10. [Acceptance criteria](#10-acceptance-criteria)
11. [Testing](#11-testing)
12. [Operations runbook](#12-operations-runbook)
13. [Known limits](#13-known-limits)
14. [Future work](#14-future-work)
15. [Code map](#15-code-map)
16. [Proposed roadmap (from the Provision review)](#16-proposed-roadmap-from-the-provision-review)

---

## 1. Purpose

An offline-first household app that tracks emergency supplies and stock rotation, shows what is missing, and estimates how many days the household could last. It replaces the household's provisions spreadsheet and checklist.

| Item        | Value                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| Users       | 2–4 family members, each on their own Apple device (iPhone, iPad, Mac), sometimes editing at once      |
| Household   | 3 people, 2 dogs (Shiba Inu). Planning target 3 days; the goal is 3–5 days for 3–5 people              |
| Storage     | Most stock in a detached, uninsulated garage; medicines, first aid, documents and cash indoors         |
| Platform    | No Apple Developer account, so no App Store: a Progressive Web App installed with _Add to Home Screen_ |
| Conventions | UK English, metric units, dates as DD MMM YYYY, £                                                      |
| App         | https://smulrain-lgtm.github.io/PrepApp/                                                               |
| Repository  | `smulrain-lgtm/PrepApp` (public), deployed from `main`                                                 |
| Sync server | CouchDB behind Caddy on a Raspberry Pi at `https://prep.mulras.uk` (home network / OpenVPN only)       |

The original build brief, the review of it (18 findings) and the staged plan live in the project's Claude doc, _Emergency Preparedness App — Build Brief_ (tabs: the brief, and _Review and build plan_). This file supersedes them where they differ.

## 2. Decisions

All decisions taken during the review and build, with the reason.

| #   | Topic                | Decision                                                                                                                                                                | Why                                                                                          |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| D1  | App hosting          | GitHub Pages, repo made public (household inventory included)                                                                                                           | Free HTTPS, updates anywhere, CI deploys. Pages on a private repo needs a paid plan          |
| D2  | Front-end            | Svelte 5 + TypeScript + Vite                                                                                                                                            | Small bundle, simple reactivity                                                              |
| D3  | Pets                 | Per-pet dry food and water: smaller dog 120 g, other dog 80 g, 1 L water each                                                                                           | Household figures (80–120 g per dog; the smaller dog eats more)                              |
| D4  | Per-person overrides | Deferred; `people` is a count                                                                                                                                           | Not needed for v1                                                                            |
| D5  | Medical data         | Stored unencrypted, behind a per-device PIN (soft lock)                                                                                                                 | Server is home-network only                                                                  |
| D6  | Water sources        | Count stored water only (filter and tablets do not add days)                                                                                                            | Conservative                                                                                 |
| D7  | Pi certificate       | Own domain `mulras.uk` (Cloudflare DNS), Let's Encrypt via DNS challenge; Caddy's own CA as fallback                                                                    | No router ports opened; nothing to install on devices. TP-Link DDNS cannot do DNS challenges |
| D8  | Water target         | 42 L = people × days × 4 L + pets × days × 1 L                                                                                                                          | Include the dogs, matching the readiness figure                                              |
| —   | Network              | Home network only; remote use over the existing OpenVPN. No port forwarding                                                                                             | Simpler and more secure; external access can come later                                      |
| —   | Wood stoves          | 3 owned; checklist line split into _Wood stoves_ (Have) and _Dry fuel, kindling, firelighters_ (Check)                                                                  | Household answer                                                                             |
| —   | Text targets         | All targets numeric and editable: "Small kit"/"This sheet"/"–" = 1, "A few" = 3, ranges take the upper figure, "Set for 3" = 1 per person, "3 days' supply" = 1 per day | Household answer                                                                             |
| —   | Recurring checks     | Solar panels, power station, power banks every 3 months; first aid kit and inventory every 6 months                                                                     | From the sheet's notes plus the household's first aid request                                |
| —   | Readiness bars       | Water, food calories, pet food, cooking gas, medicines. Lighting shown via the checklist, not as days                                                                   | Lighting has no sensible days measure                                                        |
| —   | Gas                  | 77 g per person per day (one 230 g canister a day for 3 people)                                                                                                         | So fuel scales with people (finding 3)                                                       |
| —   | Checklist food lines | Manual Have/Check/Need, not derived from inventory                                                                                                                      | Simpler; readiness already uses inventory                                                    |
| —   | Lighthouse criterion | Replaced by a valid manifest + automated offline-launch tests                                                                                                           | Lighthouse removed its PWA category in v12 (2024)                                            |
| —   | Stage order          | Stage 3 (checklist and info) built before Stage 4 (sync)                                                                                                                | Household choice                                                                             |
| —   | Inventory Add button | `+ Add` beside each category heading, pre-selecting that category (v1.0.1)                                                                                              | Household request                                                                            |

## 3. Architecture

```
iPhone / iPad / Mac                         Raspberry Pi (192.168.68.150, home network)
┌──────────────────────────────┐            ┌────────────────────────────────────────────┐
│ PrepApp (static PWA from     │   HTTPS    │ Caddy :443                                  │
│ GitHub Pages, cached by a    │ ─────────▶ │  - Let's Encrypt cert for prep.mulras.uk    │
│ service worker)              │  (home or  │    via Cloudflare DNS challenge             │
│                              │  OpenVPN)  │  - CORS for https://smulrain-lgtm.github.io │
│ PouchDB (IndexedDB): the     │ ◀───────── │  - path allow-list: /, /_up, /prepapp[/*]   │
│ full dataset on every device │  live sync │ CouchDB 3 (Docker), 127.0.0.1:5984 only     │
└──────────────────────────────┘            └────────────────────────────────────────────┘
```

| Layer      | Choice                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Front end  | Vite 8, Svelte 5 (runes), TypeScript 6. No server-side code                                     |
| Offline    | `vite-plugin-pwa` (Workbox): precaches every asset; manifest with scope `/PrepApp/`             |
| Local data | `pouchdb-core` 9 + `pouchdb-adapter-idb`; `events` package needed so PouchDB runs in the bundle |
| Sync       | `pouchdb-replication` + `pouchdb-adapter-http`, live, retry with back-off                       |
| Server     | `couchdb:3` and a custom Caddy build (`caddy-dns/cloudflare`, `caddy-dns/porkbun`) in Docker    |
| Hosting    | GitHub Pages, deployed by GitHub Actions on every push to `main`                                |
| DNS        | `prep.mulras.uk` → A record 192.168.68.150, Cloudflare, DNS only (not proxied)                  |

Rules the build follows:

- Every calculation runs on the device. No backend beyond CouchDB.
- Nothing about the server is hard-coded: addresses, database, username and password are set in the app and kept in the device's `localStorage`.
- Stock is never stored as a number: it is the sum of append-only movement records (see §4).
- Every write goes through `src/lib/db/repository.ts`, and every write from the UI is queued in order by `src/lib/store.svelte.ts`, so rapid taps never race.
- The app's web address must never change (`/PrepApp/` on GitHub Pages): each address keeps its own data on the device.

## 4. Data model

One PouchDB database, one document per record. Ids are prefixed by type.

| Type               | Id pattern                          | Key fields                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings`         | `settings`                          | people, pets[] (name, kind, foodGPerDay, waterLPerDay), targetDays, goalDays (default 14), pastDateRule (exclude / taper / include; older records fall back to considerExpiry), considerExpiry, useSoonAtRisk, indoorOnly, freezing, warningMonths, dailyNeeds (waterLPerPerson 4, kcalPerPerson 2000, gasGPerPerson 77), criticalMetrics (default water, kcal, pet food, fuel) |
| `category`         | `category:<slug>`                   | name, icon, order, defaultMetric (14 inventory categories)                                                                                                                                                                                                                                                                                                                      |
| `item`             | `item:<slug>`                       | name, categoryId, subCategory, unit, perUnit {metric, amount, estimated}, location (garage / indoors / grab_bag / car), supplier, notes, countsTowardReadiness, freezeSensitive                                                                                                                                                                                                 |
| `batch`            | `batch:<item slug>:<date\|undated>` | itemId, bestBefore (date or null), addedAt, note. The id is deterministic, so the same pack added on two devices lands in one batch                                                                                                                                                                                                                                             |
| `movement`         | `movement:<ISO time>:<random>`      | batchId, delta (+/−), reason (added / used / discarded / restocked / correction), at, by (device name). Append-only, never edited or deleted                                                                                                                                                                                                                                    |
| `checklistSection` | `section:<slug>`                    | name, order (9 sections)                                                                                                                                                                                                                                                                                                                                                        |
| `checklistItem`    | `checklist:<nn>-<slug>`             | name, sectionId, order, target {amount, unit, scaleBy}, status (have / check / need), notes, lastChecked, checkIntervalDays                                                                                                                                                                                                                                                     |
| `contact`          | `contact:<slug>`                    | name, role, phones[], notes, priority                                                                                                                                                                                                                                                                                                                                           |
| `infoNote`         | `info:<section>:<slot>`             | section (plan / shutoffs / medical / documents / grabbag), title, body, locked, order, hasPhoto; photo stored as attachment `photo` (JPEG ≤ 1280 px)                                                                                                                                                                                                                            |
| `purchase`         | `purchase:<nn>-<slug>`              | name, category, quantity, fillsGap, shelfLife, status (to_buy / bought), notes, order                                                                                                                                                                                                                                                                                           |

Common to all: `updatedAt` (stamped on every save; decides conflicts) and `deleted` (soft delete: records are hidden, never removed, so another device's movements never point at a missing batch).

Metrics (`perUnit.metric`): `water_l`, `kcal`, `pet_food_g`, `fuel_g`, `med_days`, `light_days` (household-days of cover), `none` (equipment). Since 1.1, `med_days` never sets the readiness figure (medicines are shown as essentials covered), and `light_days` counts only in the Power cut scenario.

Locations: Indoors and Grab bag count as indoors; Garage and Car do not.

Checklist `scaleBy`: `fixed`, `people`, `pets`, `days`, `people_days`, `water` (people × 4 L + each pet's water, × days), `pet_food` (each pet's food × days).

Device-only data (never synced): sync settings and password (`localStorage prepapp.sync`), device name, PIN hash (salted SHA-256), last sync time, the chosen dashboard scenario (`prepapp.scenario`), the last readiness seen for the "why did it go down?" note (`prepapp.lastSeen`), and the conflict log (`_local/conflict-log`).

## 5. Readiness calculation

Pure functions in `src/lib/readiness.ts`, fully unit-tested.

1. **Quantities.** A batch's quantity is the sum of its movements. Overdraws are settled: if two devices each took the last pack of a batch offline, that batch reads 0 and the shortfall comes off the item's other batches, soonest best-before first.
2. **Usable batches.** Left out when: the item does not count; (go bag scenario) it is not in the grab bags; its date rule gives it nothing (see below); _Use soon at risk_ is ON and it expires within the warning window (default 6 months); _Indoor only_ is ON (or the Garage lost scenario) and it is not indoors; _Freezing_ is ON, the item can freeze and it is not indoors.
3. **Food past its best-before** (`pastDateRule`): _exclude_ — counts nothing from its date; _taper_ — counts in full until 6 months past the date, then less and less until nothing at 12 months; _include_ — counts in full.
4. **Stock per metric** = Σ quantity × perUnit.amount × date factor over usable batches.
5. **Daily demand:** water = people × 4 L + Σ pet water; kcal = people × 2,000; pet food = Σ pet food g; gas = people × 77 g; lighting = 1 day per day.
6. **Days** = stock ÷ demand (none when there is no demand, e.g. pet food with no pets).
7. **Readiness days** = the lowest days among the critical metrics (water, food, pet food, cooking gas; lighting too in a power cut; medicines never); ties go to display order (Water first). Readiness % = min(days ÷ target, 1): red below 50 %, amber to 99 %, green at 100 %. Days are rounded down for display, so readiness is never overstated. The long-term goal (default 14 days) is shown as a ruler; the target (default 3) sets the shortfalls and the colour.
8. **Shortfall** per metric = target days × demand − stock.
9. **Expiry counts** in units: expired, within 30 days (not yet expired), within the warning window, no date.
10. **Medicine essentials:** the checklist lines _First aid kit_, _Prescription medicines_, _Painkillers, antihistamines, diarrhoea relief_ and _Oral rehydration sachets_; covered when marked Have.

**Scenarios** (`src/lib/scenario.ts`, dashboard only, chosen per device): _Home_ — settings as saved; _Power cut_ — lighting becomes critical; _Garage lost_ — indoor stock only; _Go bag_ — grab-bag stock only, target and goal 3 days, water / food / pet food critical (eaten cold, no fuel). There is no "No water" scenario because stored water is already the only water counted.

**"Why did my number go down?"** (`src/lib/change-note.ts`): the dashboard remembers the Home figure it last showed on the device; when it drops it names the reasons: more people or pets, a changed date rule, packs passing their best-before, or otherwise stock used.

Calorie estimates when a pack has no figure: main meal 500, side 300, dessert 350, snack 200, drink 100, breakfast 400 kcal. Editable per item.

Worked example with the seed data on 15 Nov 2026: usable food 8,300 kcal = 1.38 days for 3 people (shown as 1.3); with past-date food still counted, 14,850 kcal = 2.475 days (shown as 2.4). Water is limiting at 0 L; water shortfall 42 L, rising to 66 L for 5 people and 110 L for 5 people over 5 days.

## 6. Sync and conflicts

- **When:** while the app is open. It starts on launch and restarts when the device comes back online or the app returns to the foreground. iOS gives web apps no background time.
- **How:** `src/lib/sync/sync.svelte.ts` tries each configured address in order (`/_up`, then a login check on the database), then runs live two-way replication with retry and back-off (max 60 s). Status: _Sync off_, _Syncing…_, _Synced HH:MM_, _Offline_ (with the reason), _Sync error_ (e.g. wrong password; no retry until settings change).
- **Stock never conflicts:** each −1/+1 is its own movement record. Two devices using the same item offline both count (acceptance criterion 5).
- **Editable records** (settings, items, checklist lines, contacts, notes): when versions conflict, the newest `updatedAt` wins on every device; the losing version is summarised in the device's conflict log (_Settings → Sync → Edited on two devices_). Identical copies (e.g. the same seed on two devices) are resolved silently. `src/lib/sync/conflicts.ts`.
- **Whole-record rule:** if one device changes people and another changes target days, the newer settings record wins whole.
- **Restore with sync on:** importing a backup replaces the device's data, then the Pi's data flows back in, so a restore merges with the household data.
- **Delete vs stock change:** a soft delete on one device and a movement on another both survive.

## 7. Starting data

Source: the household workbook _Emergency Provisions Checklist (3 Days, 3 People)_, snapshot of 15 Nov 2026, in [`docs/seed-source/`](seed-source/README.md) as the original `.xlsx` and one CSV per sheet. `npm run seed` rebuilds `src/seed/seed.json` (`src/seed/build-seed.ts`); a test fails if the committed seed differs from a fresh build.

| Record             | Count   | Notes                                                                                                                       |
| ------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Food packs         | 53      | 32 in date, 23 use within 6 months, 18 expired, 3 with no date (on 15 Nov 2026)                                             |
| Batches / products | 38 / 30 | Same product + date = one batch; dates before 2005 flagged "Check printed date"                                             |
| Checklist lines    | 68      | 67 from the sheet + the wood-stove split; 9 sections; 10 Have, 6 Check, 52 Need                                             |
| Planned purchases  | 24      | From the Shopping List sheet, status To buy                                                                                 |
| Contacts           | 11      | 999/112, 101, 111, 105, National Gas 0800 111 999, plus placeholders (water supplier, GP, school, neighbours, insurer, vet) |
| Pets               | 2       | "Dog 1 (smaller)" 120 g/day, "Dog 2" 80 g/day, 1 L water each — rename in Settings                                          |

The inventory holds food only, so water, pet food, gas and medicines start at 0 days until stock is added.

## 8. Features by screen

| Screen              | Features                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All screens         | Sync status badge (tap → sync settings), _Works offline_ badge, update prompt, notices after each action. iPhone: bottom tab bar. iPad/Mac: sidebar; detail sheets open as a pane beside the list from 1024 px                                                                                                                                                                                                                                                                                                                                                                              |
| Dashboard           | Scenario switcher (Home / Power cut / Garage lost / Go bag); "Your store lasts N days" with band word, ruler to the long-term goal with the target marked; "X runs out first" with **Restock**; colour tiles per critical category (icon, days, status line, have / need / short, Limiting tag) and a Medicines tile (essentials covered); "why did it go down?" note; link to _How it's calculated_; expiry tiles linking to the filtered inventory; shopping list card; checks due with **Checked**; checklist progress; scenario line. Two columns on wide screens                       |
| Inventory           | Grouped by category, every category shown with **+ Add** (pre-selects category and its measure); search; category / location / status filters; −1 (soonest best-before first) and +1 (latest batch); item sheet: batches with −/+/Discard, add a batch, edit details, delete; **Rotation** link                                                                                                                                                                                                                                                                                             |
| Rotation            | Every batch in stock, oldest first (expired and use-soon by default, or all), **Use now**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Shopping list       | Shortfalls to reach the target, planned food (tick Bought → **Add to inventory** pre-filled), checklist Need and Check lines; **Share list** as text                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Checklist           | 9 sections, targets scaled to the scenario with their working shown, tap status to cycle Need → Check → Have, filters (All / Need / Check / Have / Checks due), line sheet: target, scaling, notes, recurring check, **Checked today**, add / remove lines                                                                                                                                                                                                                                                                                                                                  |
| Info                | Contacts (tap to call, Text for mobiles, reorder, add/edit/delete); Household plan; Shut-offs with photos; Grab bags per person; Documents index; Medical list behind a 4–8 digit PIN (locks after 5 min or in the background); Quick guides (gas leak, CO, stoves and paraffin indoors, power cut, flooding, water); Print / Save as PDF (contacts, plan, shut-offs; never medical)                                                                                                                                                                                                        |
| Settings            | Cards opening pages. **Your store:** target days 1–14 (3/5/7 shortcuts), long-term goal (7/14/30/90/180/365), food past its best-before (not counted / taper / still counted), use soon at risk, indoor only, freezing, warning window. **Household:** people 1–10, pets, daily needs. **Sync with the Pi:** addresses, database, username, password, on/off, Save, Test connection, Sync now, conflict log. **Backup and data:** device name, Export backup (JSON, includes photos), Import backup, Export inventory (CSV), Reset to starting data. **About:** version, link to the method |
| How it's calculated | Every figure with its source and the household's current values; what counts as usable; scenarios; rounding and colours                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## 9. Build history

| Version | Stage | What was built                                                                                                                                                         | Problems found and fixed                                                                                                                                                                                                                                                                                                             |
| ------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1.x   | 0     | Scaffold, CI, GitHub Pages deploy, installable offline shell, connection test, Pi server (Caddy + CouchDB)                                                             | Pages deploy blocked by environment rules (fixed in GitHub settings). CouchDB would not start: its entrypoint chowns a read-only mounted config, so the config is now built into the image. iPhone test failed on a stored reply without CORS headers: the app now always asks afresh, and Caddy sends `Vary: Origin` and `no-store` |
| —       | 1     | Data model, readiness engine, PouchDB repository, seed from the workbook                                                                                               | PouchDB failed in the browser bundle (needs the `events` package)                                                                                                                                                                                                                                                                    |
| 0.2.0   | 2     | Dashboard, inventory with batches, settings controls, JSON backup                                                                                                      | Rapid taps lost increments and could overdraw a batch: all writes are now queued. The "Within 30 days" tile and its list disagreed: both now exclude expired stock                                                                                                                                                                   |
| 0.3.0   | 3     | Checklist screen; emergency info (contacts, plan, shut-offs with photos, grab bags, documents, PIN medical, guides, print sheet)                                       | A save from an out-of-date copy (two quick taps) was refused: saves now retry once with the latest revision                                                                                                                                                                                                                          |
| 0.4.0   | 4     | Live sync with the Pi, status badge, conflict resolver and log                                                                                                         | Two devices taking the last pack of the same batch offline showed one pack too many: overdraws are now settled across batches. Caddy blocked `GET /`, which PouchDB reads on connect: now allowed                                                                                                                                    |
| 1.0.0   | 5     | Shopping list with sharing, rotation view, due checks, inventory CSV, iPad landscape detail pane, accessibility scan, README                                           |                                                                                                                                                                                                                                                                                                                                      |
| 1.0.1   | —     | `+ Add` beside each inventory category, pre-selecting it; empty categories listed                                                                                      |                                                                                                                                                                                                                                                                                                                                      |
| 1.1.0   | 1.1   | Dashboard redesign, scenario switcher, long-term goal, past-date taper rule, medicine essentials, "why did it go down?" note, Settings cards, How it's calculated page | Medicines dropped out of the shopping shortfalls (now essentials on the checklist)                                                                                                                                                                                                                                                   |

## 10. Acceptance criteria

| #   | Criterion                                                                                                          | Status                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 1   | Installed from Safari, in airplane mode the app launches and every screen works                                    | Automated (offline launch, data offline, guides offline); Stage 0 check on iPhone passed                      |
| 2   | People 3 → 5 or days 3 → 5 updates readiness and shortfalls immediately                                            | Automated (unit + end-to-end)                                                                                 |
| 3   | Counting food past its best-before (was _Consider expiry dates_ OFF) raises food days (the 18 expired packs count) | Automated                                                                                                     |
| 4   | Different items edited offline on iPhone and iPad both appear on both after reconnecting                           | Automated (three-database unit test; two-browser end-to-end test)                                             |
| 5   | The same item used offline on both devices (−1 each) leaves the right net quantity                                 | Automated, including the last-pack-of-a-batch case                                                            |
| 6   | With seed data and defaults, the dashboard names Water as limiting (0 L)                                           | Automated                                                                                                     |
| 7   | Visual checks on iPhone SE / 15 / 15 Pro Max and iPad mini / iPad Pro, light and dark                              | Screenshots at iPhone and iPad sizes checked; real-device check by the household outstanding                  |
| 8   | ~~Lighthouse PWA check~~ → valid manifest + offline-launch tests; accessibility score                              | Manifest and offline tests automated; axe-core finds no serious/critical issues on any screen, light and dark |
| 9   | No credentials or personal data committed                                                                          | Met: secrets live in `server/.env` on the Pi and in each device's storage only                                |

## 11. Testing

| Suite                       | Command                                       | What it covers                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest), 88           | `npm test`                                    | Readiness rules and gate checks on the seed; seed counts; repository (FIFO, soft delete, stale saves); backup round-trip; inventory, checklist, shopping, rotation, CSV views; sync and conflicts across three in-memory databases; 1.1 rules (taper, scenarios, essentials, goal, change note)                                        |
| End-to-end (Playwright), 64 | `npx playwright test` (after `npm run build`) | Offline launch and manifest; dashboard, inventory, settings flows; export → re-import identity; rapid taps; checklist, contacts, plan, photos, PIN; two-browser sync through `tests/couchsim`; shopping, rotation, CSV, iPad pane; scenarios and goal; axe-core accessibility in light and dark on every main screen and settings page |
| Checks                      | `npm run lint`, `npm run check`               | ESLint + Prettier; Svelte and TypeScript                                                                                                                                                                                                                                                                                               |

CI (`.github/workflows/ci.yml`) runs all of these on every push and deploys `main` to GitHub Pages. End-to-end tests run at iPhone (390 × 844) and iPad (820 × 1180) sizes in Chromium; real Safari behaviour is checked on the household's devices.

`tests/couchsim/server.cjs` is an in-memory CouchDB stand-in (express-pouchdb) used only by tests. The Caddyfile was also checked with a locally built Caddy (`caddy validate`, CORS and path-filter checks against a mock CouchDB, and PouchDB replication through it).

## 12. Operations runbook

**Release a new app version:** commit to the working branch, push to `main`. CI tests and deploys; devices offer _Reload_. Bump `version` in `package.json` so Settings → About shows it.

**Pi first-time setup:** see [`server/README.md`](../server/README.md). Summary: 64-bit Raspberry Pi OS; Docker (`curl -fsSL https://get.docker.com | sh`, add user to `docker` group); clone the repo into the home directory; `cd ~/PrepApp/server && cp .env.example .env`; fill in the Cloudflare token (Edit zone DNS, `mulras.uk` only), email and two passwords (`openssl rand -base64 24`); `docker compose up -d --build`; wait for "certificate obtained successfully" in `docker compose logs -f caddy`; `./setup-couchdb.sh`; check `https://prep.mulras.uk/_up` shows `{"status":"ok"}`.

**Update the Pi after `server/` changes:**

```sh
cd ~/PrepApp && git pull && cd server && docker compose up -d --build caddy
```

**Troubleshooting**

| Symptom                                           | Check                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `setup-couchdb.sh`: CouchDB not answering         | `docker compose ps` (both _Up_?), `docker compose logs couchdb --tail 50`                                                |
| No certificate                                    | `docker compose logs caddy`; Cloudflare token scope; `DNS_PROVIDER=cloudflare` in `.env`                                 |
| `prep.mulras.uk` does not resolve at home         | Router DNS rebinding protection: allow `mulras.uk`, or use another resolver. Cloudflare record must be _DNS only_        |
| App says _Could not reach_                        | At home or on OpenVPN? Address exactly `https://prep.mulras.uk`? The message shows the address and the error iOS reports |
| App says _blocked the app from reading the reply_ | The Pi answered but the device blocked it: Safari content blockers, iCloud Private Relay, Lockdown Mode                  |
| _Sync error: rejected the username or password_   | Re-enter the sync password from `server/.env` (`COUCHDB_SYNC_PASSWORD`)                                                  |
| Data looks different on two devices               | Open both apps (sync only runs while open); tap the badge → _Sync now_                                                   |

**Backups:** JSON export from any device (everything, including photos and the medical list); the Pi's `server/data/couchdb/` folder.

**Fallback certificate:** set `DNS_PROVIDER=internal`, restart, and install Caddy's root certificate on each device (steps in `server/README.md`).

## 13. Known limits

- No background sync and no push notifications on iOS web apps; a device catches up when opened.
- The medical PIN is a soft lock per device, not encryption. JSON backups contain the medical list in plain text.
- Whole-record conflict rule: simultaneous edits to different fields of the same record keep only the newer record.
- The Home Screen app has its own storage, separate from Safari tabs.
- Calorie figures are estimates by type until edited per item.
- Lighting has a days bar only in the Power cut scenario.
- Scenarios change the dashboard only; the shopping list and inventory always use the Home view.
- The scenario is chosen per device, not synced.
- Seed data covers food only; water, gas, pet food and medicines must be added as stock.
- Pull-to-refresh to sync was not built (use the badge → _Sync now_).
- The repository is public, including the household's starting inventory and checklist.

## 14. Future work

The next releases (1.2 and 1.3) are set out in [§16](#16-proposed-roadmap-from-the-provision-review). From the brief's _Nice to have_ list, none started:

- Barcode scanning to add items.
- Photographing labels to record best-before dates.
- A readiness history graph.
- Calendar (`.ics`) export of expiry dates and checks.

Other candidates: external access without the VPN (DDNS with port forwarding, or Tailscale), field-level conflict merging for settings, linking checklist food lines to inventory stock, CSV export of the checklist.

## 15. Code map

```
src/
  App.svelte                 shell, routing (#/dashboard, #/inventory, #/checklist, #/info, #/settings[?s=page], #/shopping, #/rotation, #/method)
  lib/
    model/                   types.ts, constants.ts (locations, metrics, defaults, kcal), dates.ts, snapshot.ts
    readiness.ts             quantities (settled), usability, date factor, demand, days, shortfalls, essentials, checklist scaling
    scenario.ts              Home / Power cut / Garage lost / Go bag
    change-note.ts           "why did my number go down?"
    db/                      open.ts (PouchDB + plugins), repository.ts (all writes), fifo.ts
    sync/                    sync.svelte.ts (manager + status), conflicts.ts (resolver + log)
    store.svelte.ts          app state, write queue, sync wiring, backup/restore
    inventory-view.ts, checklist-view.ts, shopping.ts, rotation.ts, inventory-csv.ts, backup.ts
    sync-endpoint.ts         address validation and connection test
    device-settings.ts, pin.svelte.ts, photo.ts, guides.ts, info-templates.ts, format.ts, pwa.svelte.ts
  views/                     Dashboard, Inventory (+ ItemSheet), Rotation, Shopping, Method, Checklist (+ ChecklistSheet),
                             Settings (cards; ScenarioSettings = Your store / Household, SyncSettings, DataSettings),
                             info/ (Info, Contacts, Notes, NoteSheet, Medical, Guides, PrintSheet)
  components/                Sheet (modal or side pane), Stepper, Toggle, StatusBadge, SyncBadge, Photo
  seed/                      csv.ts, build-seed.ts, seed.json
scripts/                     build-seed.ts, make-icons.mjs
tests/e2e/                   shell, stage2, stage3, stage4 (sync), stage5 specs
tests/couchsim/              in-memory CouchDB stand-in for sync tests
server/                      docker-compose.yml, caddy/ (Dockerfile, Caddyfile), couchdb/ (Dockerfile, prepapp.ini),
                             setup-couchdb.sh, .env.example, README.md
docs/                        PROJECT.md (this file), seed-source/
```

## 16. Proposed roadmap (from the Provision review)

On 16 Nov 2026 we reviewed **Provision** (provisionapp.co.uk), a free UK emergency-store app: its website, its method page, its public web-app code, and screenshots of the signed-in app. These are ideas to adopt in our own way, not a copy: PrepApp keeps its own look, its private sync through the Pi, and no accounts.

### What Provision does that PrepApp does not (yet)

| Area            | Provision                                                                                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview        | One huge "Your store lasts N days", a ruler to a long-term goal ("47 days to go"), "Water runs out first → Restock", colour tiles per category with a status line, scenario switcher: Shelter at home / Power cut / No water / Go bag     |
| Goal            | 7, 14, 30, 90, 180 or 365 days; everything (readiness, shopping, "short") is measured against it                                                                                                                                          |
| People          | Age, sex, activity, needs (e.g. pregnancy) → kcal and water per person (UK SACN figures: adult ≈ 2,350 kcal, child ≈ 1,900; water 3.6 L adult, 2.7 L child); medicines recorded per person                                                |
| Pets            | Kind (dog, cat, small animal, bird) and weight → food and water; pets "alongside" (own count) or "counted in" (share water, can set the figure)                                                                                           |
| Store settings  | Ration: full or lean (80 %). Water allowance: drinking & cooking / +5 L washing / +12 L hygiene. Food past best-before: still counted in full for 6 months, tapering to nothing at 12 months, or not counted                              |
| Cooking & power | Cooking method (mains / all on stored fuel / half cooked / hot drinks only); fuel from cooking energy (0.6 MJ + 1.6 MJ per person a day at ~55 % stove efficiency); firewood on open fire vs stove; what must keep running in a power cut |
| Items           | Packs × size (g/ml) × kcal per 100 g, so calories come from the label; protein, fat, carbs, salt; "frozen or chilled — lost in a power cut"; "goes with food" (oils, sauces); which kit (home store or go bag)                            |
| Adding          | Barcode scan or type the barcode number (Open Food Facts fills name, size, nutrition); **Common items** quick picks; **Type a list** bulk entry; floating **+ Add** and **Scan a barcode**                                                |
| Go bag          | A second kit, kept apart and judged against 72 hours on foot, eaten cold; gear list ("Essential gear 0 of 15/18")                                                                                                                         |
| Restock         | Tabs per category; "N items close the gap — adds X days"; each suggestion shows days added; shopping style little & often / bulk / cheapest; packs sized to storage space; ordered baskets                                                |
| Calendar        | A tab listing every dated entry with Due badges; private calendar feed with reminders 30 / 60+14 / 90+30+7 days ahead                                                                                                                     |
| Notifications   | Met Office / Environment Agency warnings for your area; monthly "what goes out of date"; nudge after a month with nothing added                                                                                                           |
| Settings        | Grouped cards: plan, household, your store, cooking and power, shopping, this phone, your data, account, about                                                                                                                            |
| Trust           | A "how the figures are worked out" page with sources, reviewed by a dietitian; FAQ "why did my number go down?"                                                                                                                           |
| Onboarding      | "Three things to start" on an empty overview; a sample store                                                                                                                                                                              |

### Recommended releases

**1.1 — Dashboard and store settings** — **released as 1.1.0** (scenarios: Home / Power cut / Garage lost / Go bag)

1. Dashboard redesign: big headline number, ruler to the goal, **runs out first → Restock** button, colour-coded category tiles with icons and plain status lines ("47 days short", "Past your goal").
2. Scenario switcher on the dashboard: Home / Power cut / No water / Go bag, as presets over our existing switches.
3. Long-term goal (7–365 days, with presets) alongside the 3-day Be Ready minimum.
4. Medicines shown as "essentials covered" rather than days.
5. Best-before taper as a third expiry option (full for 6 months past the date, then tapering to 0 at 12 months).
6. Settings regrouped into cards with a "Your store" sub-page.
7. An in-app "How it's calculated" page with sources, and a "why did my number change?" note on the dashboard.

**1.2 — Better numbers**

8. Items record packs × size (g/ml) × kcal per 100 g; calories are calculated, replacing the per-type estimates when filled in. Optional protein, fat, carbs, salt.
9. Item flags: "frozen or chilled — lost in a power cut" and "goes with food" (does not count on its own).
10. People by age, sex, activity and needs (UK SACN figures), each with their medicines (structured, alongside the PIN-locked medical notes).
11. Water allowance (drinking & cooking / +5 L / +12 L) and water treatment (collected water only counts with a filter, tablets or fuel to boil).
12. Cooking method and fuel from cooking energy (MJ), including firewood stove vs open fire; power-cut "keep running" items.

**1.3 — Restock, calendar and quicker adding**

13. Restock tab: what closes the gap first, days each purchase adds, shopping style, sized to storage (garage = plenty of room). No affiliate links.
14. Calendar tab: every upcoming best-before and check, with an `.ics` export (and optionally a feed served by the Pi, which only refreshes at home or on the VPN).
15. Go bag as a second kit: Home store / Go bag switch on Inventory, each item assigned to a kit, judged against 72 hours eaten cold.
16. Faster adding: barcode scan or typed number (Open Food Facts, needs internet; iOS Safari needs a scanning library), **Common items** quick picks, **Type a list** bulk entry, floating **+ Add**.
17. Inventory polish: category chips instead of a dropdown, larger inline −/+ steppers, pack size shown beside the name.

**Later / maybe:** nutrition summary (protein etc.), a month-by-month budget plan, Met Office / Environment Agency warnings (needs internet and an API), a warmer visual refresh (a rounded typeface such as Plus Jakarta Sans, which is open-licensed).

**Not adopting:** accounts and server-held data (our Pi sync is private), shopping links that earn commission, household invites (sync already covers it).
