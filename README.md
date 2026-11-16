# PrepApp

An offline-first household emergency preparedness app: supplies, stock rotation, what is missing, and how many days the household could last. It is a Progressive Web App installed from Safari, with an optional sync server on a Raspberry Pi at home.

- **App:** https://smulrain-lgtm.github.io/PrepApp/
- **Build brief and staged plan:** kept in the project's Claude doc (_Emergency Preparedness App — Build Brief_).
- **Seed data source:** [`docs/seed-source/`](docs/seed-source/README.md)
- **Sync server setup:** [`server/README.md`](server/README.md)

## Install on iPhone or iPad

1. Open https://smulrain-lgtm.github.io/PrepApp/ in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open PrepApp from the Home Screen once while online. The badge _Works offline_ appears when it is cached; from then on it launches with no network.

Known iOS limits:

- The Home Screen app has **its own storage**, separate from Safari tabs. Use the installed app, not a Safari tab.
- iOS gives web apps **no background time**: sync happens when the app is open.
- Sync works at home, or away over OpenVPN. The app itself works anywhere, offline.

## Build status

| Stage | Scope                                                            | Status      |
| ----- | ---------------------------------------------------------------- | ----------- |
| 0     | Scaffold, CI, GitHub Pages, installable offline shell, Pi server | Done        |
| 1     | Data model and readiness engine                                  | Done        |
| 2     | Local MVP: dashboard, inventory, settings, JSON backup           | Done        |
| 3     | Checklist and emergency information                              | Done        |
| 4     | Sync with the Pi                                                 | Not started |
| 5     | Polish and release                                               | Not started |

**Stage 0 gate:** on an iPhone, the app installs from GitHub Pages, launches in airplane mode, and _Settings → Test connection_ reaches the Pi at home.

## Development

Requires Node 22.

```sh
npm install
npm run dev        # local dev server
npm run lint       # ESLint + Prettier
npm run check      # Svelte and TypeScript type checks
npm test           # unit tests (Vitest)
npm run build      # production build into dist/
npx playwright test  # end-to-end tests against the built app (incl. offline launch)
```

Pushes to `main` are tested and deployed to GitHub Pages by `.github/workflows/ci.yml`. Other branches are tested only.

The app lives under `/PrepApp/`. Do not change that path or move the app to another address: each address keeps its own data on the device.

## Layout

```
src/            app (Svelte 5 + TypeScript)
  lib/          logic, unit-tested (*.test.ts)
  views/        screens
tests/e2e/      Playwright tests
public/icons/   app icons (regenerate with npm run icons)
server/         Raspberry Pi: Caddy + CouchDB (docker compose)
docs/           seed source data
```

No credentials or secrets belong in this repository: the sync login is entered in the app and stored on the device, and the server's secrets live in `server/.env` on the Pi only.
