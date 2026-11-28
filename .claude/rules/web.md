---
paths:
  - "app/web/**"
  - "scripts/*.sh"
  - "wrangler.jsonc"
  - ".claude/skills/ship/**"
---

# Web app and release

The facts live in the public docs. Read the one you need. This file adds only what AI tools must not miss.

| Need | Read |
|---|---|
| What each control does | `docs/web-app.md` |
| The layout, the widget rule, the test ids and how to drive them | `DESIGN.md` |
| Browser tests, golden pictures, blessing | `docs/development/testing.md` |
| Build, deploy on push, headers, service worker, icons | `docs/development/release.md` |

- Browser tests run headless Chromium only. Never a visible window. Do not edit `src/` or
  `vite.config.ts` while a run is going.
- A new test id follows the patterns in `DESIGN.md`. Find a real id with `rg data-testid app/web/src`.
- Real photos stay in `.agents/web-photos/` (ignored).
- Cloudflare: Worker `atelier` on `atelier.stevanpavlovic.com`, account id pinned in
  `wrangler.jsonc`. Never another account. No helper runs `wrangler`. The Worker is static assets
  only: no Worker script, no `POST /share`.
- The Workers Build settings live only in the dashboard (Worker `atelier`, Settings, Builds):
  the build and deploy commands from `release.md`, preview builds off, build caching on, and the
  variable `PNPM_VERSION=12.9.1`.
- A new service worker takes over by itself (`skipWaiting`, the owner's choice on 2026-11-17).
  Keep it that way. A new file in `public/` is precached, so check its size.
- Say which commit is live (`/version.txt`) before you call a push deployed. `/ship` does it.
