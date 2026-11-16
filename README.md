# PrepApp

An offline-first household emergency preparedness app. It tracks emergency supplies and stock rotation, shows what is missing, and works out how many days the household could last. It replaces the provisions spreadsheet and checklist.

- **App:** https://smulrain-lgtm.github.io/PrepApp/
- **Full project record** (decisions, architecture, data model, build history, runbook): [`docs/PROJECT.md`](docs/PROJECT.md)
- **Sync server on the Pi:** [`server/README.md`](server/README.md)
- **Starting data:** [`docs/seed-source/`](docs/seed-source/README.md) (the household workbook, 15 Nov 2026)
- **Build brief, review and staged plan:** the project's Claude doc, _Emergency Preparedness App — Build Brief_
- **Current version:** 1.2.0 (Settings → About shows the version on each device)

## Install on iPhone or iPad

1. Open https://smulrain-lgtm.github.io/PrepApp/ in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open PrepApp from the Home Screen once while online. When the **Works offline** badge appears it is cached, and from then on it opens with no network.
4. **Settings → Backup and data:** give the device a name (e.g. "Simon's iPhone"). It is recorded on each stock change.
5. **Settings → Sync with the Pi:** see [Sync](#sync) below.

On a Mac, open the same address in Safari and use **File → Add to Dock**.

**Updates:** when a new version is published the app shows _A new version of PrepApp is ready — Reload_. Settings → About shows the version.

## Using it

| Screen        | What it is for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dashboard** | "Your store lasts N days" with a ruler to your long-term goal, what runs out first with a **Restock** button, colour tiles per category (water, food, pet food, cooking gas) and medicine essentials covered. Scenario switcher: **Home / Power cut / Garage lost / Go bag**. A note explains when the figure goes down. Below: expiry counts (tap to see them), the shopping list, checks due, checklist progress.                                                                                                            |
| **Inventory** | Every item grouped by category, with search and filters (category, sub-category, location, status). **−1** uses the oldest pack, **+1** adds one to the newest batch. Tap an item for its batches (best-before dates), to add a batch, edit it or delete it. **+ Add** beside each category heading adds a new item already in that category. **Scan** reads a barcode with the camera (or type the number) and fills in the name, pack size and nutrition from Open Food Facts. **Rotation** lists every batch, oldest first. |
| **Checklist** | The equipment and provisions checklist. Targets scale with people, pets and days. Tap a status to cycle Need → Check → Have; tap a line for notes, the target and recurring checks (**Checked today**).                                                                                                                                                                                                                                                                                                                        |
| **Info**      | Contacts (tap to call or text), household plan, shut-offs with photos, grab bags, documents index, the PIN-locked medical list, quick guides, and a one-page **Print / Save as PDF** sheet.                                                                                                                                                                                                                                                                                                                                    |
| **Settings**  | Cards: **Your store** (target, long-term goal, food past its best-before, use soon, indoor only, freezing, warning window), **Household** (people, pets, daily needs), **Categories** (add, rename, reorder and delete categories; edit each one's sub-categories), **Sync with the Pi**, **Backup and data**, **About** (version and _How it's calculated_).                                                                                                                                                                  |

How readiness is worked out: for each category, usable stock ÷ what the household needs per day. The lowest of those is the readiness figure; days are rounded down. Medicines are not counted in days: the dashboard shows how many medicine essentials on the checklist are marked Have. Calories per pack come from the label when the pack size and kcal per 100 g are filled in (pack size × kcal ÷ 100, entered by hand or by scanning the barcode); otherwise they are estimates by type (main meal 500, side 300, dessert 350, snack 200, drink 100 kcal). Protein, fat, carbohydrate and salt per 100 g are recorded too. Food past its best-before can be not counted, tapered over a year, or still counted (Settings → Your store). The full method, with sources, is in the app under _How is this worked out?_

## Sync

Each device keeps a full copy of the data and works with no network. When sync is on, devices exchange changes through CouchDB on the Raspberry Pi.

1. Set up the Pi: [`server/README.md`](server/README.md).
2. On each device: **Settings → Sync with the Pi** — address `https://prep.mulras.uk`, database `prepapp`, user `household`, the sync password. **Save**, **Test connection**, then turn on **Sync this device**.
3. The badge at the top of every screen shows **Synced 14:32**, **Syncing…**, **Offline** or **Sync error**. Tap it for details.

Good to know:

- **Sync runs while the app is open.** iOS gives web apps no background time, so a device catches up each time PrepApp is opened.
- **Home network only.** Away from home, connect OpenVPN first.
- **Stock never conflicts.** Each −1 / +1 is its own record, so the same item used on two devices offline adds up correctly.
- **Edits to the same record on two devices** (a contact, a setting, a checklist line): the newest edit is kept on both; the other is listed under _Edited on two devices_ in the sync settings.

## Backups

- **Export backup (JSON)** (Settings → Backup and data) saves everything, including the medical list and photos. On iPhone it opens the share sheet: save to Files or AirDrop it. Keep it private.
- **Import backup** replaces the data on that device. With sync on, the household's data on the Pi then flows back in, so a restore merges with it.
- **Export inventory (CSV)** is the inventory only, for Numbers or Excel.
- The Pi's CouchDB data is in `server/data/couchdb/` if you want a server-side copy too.

## Privacy

- The medical list is behind a PIN set on each device. The PIN is a soft lock against a casual look, not encryption.
- The sync password is stored on each device and only sent to the Pi over HTTPS. The Pi is reachable on the home network and over OpenVPN only.
- No credentials or personal data are in this repository. The household's starting inventory and checklist are (`docs/seed-source/`).
- **Barcode look-ups** send only the barcode number to Open Food Facts (`world.openfoodfacts.org`). Nothing else leaves the device, and the camera picture is never stored or sent.

## Known iOS limits

- No background sync (see above), and no push notifications for expiry dates.
- The Home Screen app has **its own storage**, separate from Safari tabs: use the installed app.
- The app lives at `/PrepApp/` on GitHub Pages. Do not move it to another address: each address keeps its own data on the device.
- **Scanning** asks for the camera the first time. If it was refused, allow it again in Settings → Apps → Safari → Camera (or the website settings in Safari). Typing the number under the barcode always works.
- **Looking up a barcode needs the internet.** Offline, the barcode is kept on the new item and the details are typed in by hand.

## Build status

| Stage | Scope                                                                | Status |
| ----- | -------------------------------------------------------------------- | ------ |
| 0     | Scaffold, CI, GitHub Pages, installable offline shell, Pi server     | Done   |
| 1     | Data model and readiness engine                                      | Done   |
| 2     | Local MVP: dashboard, inventory, settings, JSON backup               | Done   |
| 3     | Checklist and emergency information                                  | Done   |
| 4     | Sync with the Pi                                                     | Done   |
| 5     | Shopping list, rotation, due checks, CSV, iPad layout, accessibility | Done   |

| Version | Released    | What changed                                                                                                                                                     |
| ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0.0   | 16 Nov 2026 | All five stages complete                                                                                                                                         |
| 1.0.1   | 16 Nov 2026 | **+ Add** beside each inventory category                                                                                                                         |
| 1.1.0   | 16 Nov 2026 | Dashboard redesign, scenarios, long-term goal, past-date taper rule, medicine essentials, Settings cards, method page                                            |
| 1.2.0   | 16 Nov 2026 | Barcode scanning (Open Food Facts), nutrition per 100 g and calories from the label, **Food – Ingredients** category, Settings → Categories, sub-category filter |

Next, from the review of the Provision app ([`docs/PROJECT.md` §16](docs/PROJECT.md#16-proposed-roadmap-from-the-provision-review)):

- **1.2.x** — done in 1.2.0: calories from the label and nutrition. Still to do: "frozen or chilled" and "goes with food" flags, people by age, water allowance and treatment, fuel from cooking energy.
- **1.3** — Restock tab (what closes the gap first), Calendar tab and `.ics` export, go bag as a second kit, quick adding (Common items, Type a list). Barcode scanning was brought forward into 1.2.0.

## Development

Requires Node 22.

```sh
npm install
npm run dev          # local dev server
npm run lint         # ESLint + Prettier
npm run check        # Svelte and TypeScript type checks
npm test             # unit tests (Vitest): readiness, seed, sync, conflicts, backup…
npm run build        # production build into dist/
npx playwright test  # end-to-end tests against the built app (offline launch, sync, accessibility…)
npm run seed         # rebuild src/seed/seed.json after changing docs/seed-source/
```

Pushes to `main` are tested and deployed to GitHub Pages by `.github/workflows/ci.yml`; other branches are tested only. The end-to-end sync tests run against `tests/couchsim`, an in-memory CouchDB stand-in.

```
src/
  lib/          logic (unit-tested): readiness, repository, sync, conflicts, backup, views
  views/        screens; views/info/ for the emergency information screens
  components/   shared UI (sheet, stepper, toggle, badges, photo)
  seed/         seed builder and seed.json
tests/e2e/      Playwright tests;  tests/couchsim/ test sync server
server/         Raspberry Pi: Caddy + CouchDB (docker compose)
docs/           PROJECT.md (full project record), seed source data
```
