# PrepApp

An offline-first household emergency preparedness app. It tracks emergency supplies and stock rotation, shows what is missing, and works out how many days the household could last. It replaces the provisions spreadsheet and checklist.

- **App:** https://smulrain-lgtm.github.io/PrepApp/
- **Sync server on the Pi:** [`server/README.md`](server/README.md)
- **Starting data:** [`docs/seed-source/`](docs/seed-source/README.md) (the household workbook, 15 Nov 2026)
- **Build brief, review and staged plan:** the project's Claude doc, _Emergency Preparedness App — Build Brief_

## Install on iPhone or iPad

1. Open https://smulrain-lgtm.github.io/PrepApp/ in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open PrepApp from the Home Screen once while online. When the **Works offline** badge appears it is cached, and from then on it opens with no network.
4. **Settings → Backup and data:** give the device a name (e.g. "Simon's iPhone"). It is recorded on each stock change.
5. **Settings → Sync with the Pi:** see [Sync](#sync) below.

On a Mac, open the same address in Safari and use **File → Add to Dock**.

**Updates:** when a new version is published the app shows _A new version of PrepApp is ready — Reload_. Settings → About shows the version.

## Using it

| Screen        | What it is for                                                                                                                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard** | Days of readiness (red / amber / green), days for each category with the limiting one marked, expiry counts (tap to see them), the shopping list, checks that are due, checklist progress.                                                                      |
| **Inventory** | Every item grouped by category, with search and filters. **−1** uses the oldest pack, **+1** adds one to the newest batch. Tap an item for its batches (best-before dates), to add a batch, edit it or delete it. **Rotation** lists every batch, oldest first. |
| **Checklist** | The equipment and provisions checklist. Targets scale with people, pets and days. Tap a status to cycle Need → Check → Have; tap a line for notes, the target and recurring checks (**Checked today**).                                                         |
| **Info**      | Contacts (tap to call or text), household plan, shut-offs with photos, grab bags, documents index, the PIN-locked medical list, quick guides, and a one-page **Print / Save as PDF** sheet.                                                                     |
| **Settings**  | People, pets, target days, what counts (expiry dates, use soon, indoor only, freezing), daily needs, sync, backups.                                                                                                                                             |

How readiness is worked out: for each category, usable stock ÷ what the household needs per day. The lowest of those is the readiness figure. Calories per pack are estimates by type (main meal 500, side 300, dessert 350, snack 200, drink 100 kcal) until you enter the figure from the label.

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

## Known iOS limits

- No background sync (see above), and no push notifications for expiry dates.
- The Home Screen app has **its own storage**, separate from Safari tabs: use the installed app.
- The app lives at `/PrepApp/` on GitHub Pages. Do not move it to another address: each address keeps its own data on the device.

## Build status

| Stage | Scope                                                                | Status |
| ----- | -------------------------------------------------------------------- | ------ |
| 0     | Scaffold, CI, GitHub Pages, installable offline shell, Pi server     | Done   |
| 1     | Data model and readiness engine                                      | Done   |
| 2     | Local MVP: dashboard, inventory, settings, JSON backup               | Done   |
| 3     | Checklist and emergency information                                  | Done   |
| 4     | Sync with the Pi                                                     | Done   |
| 5     | Shopping list, rotation, due checks, CSV, iPad layout, accessibility | Done   |

Later (the brief's _Nice to have_): barcode scanning, label photos for dates, readiness history graph, calendar (.ics) export.

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
  components/   shared UI (sheet, stepper, toggle, gauge, badges)
  seed/         seed builder and seed.json
tests/e2e/      Playwright tests;  tests/couchsim/ test sync server
server/         Raspberry Pi: Caddy + CouchDB (docker compose)
docs/           seed source data
```
