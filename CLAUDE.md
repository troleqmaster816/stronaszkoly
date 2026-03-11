# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Vite SPA dev server at http://localhost:5173
npm run server       # Express API server at http://localhost:8787
npm run dev:full     # Both concurrently (recommended)

# Build & production
npm run build        # tsc -b && vite build → dist/
npm run start        # NODE_ENV=production node server/server.js

# Quality
npm run lint         # ESLint (add -- --fix to autofix)
npm run build        # also validates TypeScript

# Tests
npm run test:e2e                         # Playwright (auto-starts dev:full)
npx playwright test tests/e2e/foo.spec.ts  # single test file
E2E_BASE_URL=https://szkola.tkch.eu npx playwright test  # against production

# API docs
npm run docs:ui      # Swagger UI via Express at /docs
npm run docs:lint    # Spectral validation of public/openapi.v1.draft.yaml
```

## Architecture

### Frontend (SPA)
React 19 + TypeScript + Vite + Tailwind CSS. Entry: `src/main.tsx`. Routes:
- `/` → `Hub.tsx` — homepage with news, links, admin panel
- `/plan[/:entity]` → `TimetableViewer.tsx`
- `/frekwencja` → `FrekwencjaPage.tsx`
- `/harmonogram` → `harmonogram.tsx`
- `/statut` → `statut.tsx`

Feature code lives in `src/features/<feature>/` with subdirs `components/`, `hooks/`, `lib/`, `state/`. Features: `attendance`, `auth`, `news`, `timetable`. Shared UI components go in `src/components/ui/`. Path alias `@` maps to `src/`.

### Backend (Express)
`server/server.js` creates config and app. `server/app/createApp.js` wires all middleware and mounts the `/v1` router. All stores (`dbStore`, `sessionStore`, `timetableStore`, `jobsStore`, `hubBackgroundStore`) are created there and injected as `deps` into route factories.

API routes: `server/routes/v1/` (one file per domain). When adding endpoints, also update `docs/API.md` and `public/openapi.v1.draft.yaml`, then run `npm run docs:lint`.

Legacy `/api/*` endpoints return HTTP 410 — only `/v1/*` is active.

### Data stores
- `server/data.json` — runtime DB: users, API keys, attendance, approvals (gitignored, flat JSON, atomic write)
- `public/timetable_data.json` — timetable populated by Python scraper scripts in `server/scripts/`
- `public/articles.json` — news articles
- `public/overrides.json` — subject/teacher name overrides (gitignored)
- `public/openapi.v1.draft.yaml` — OpenAPI spec

### Authentication
Two modes: session cookie (`auth` httpOnly) + CSRF token (`csrf` cookie, must echo as `X-CSRF-Token` header for mutations), or Bearer API key (`Authorization: Bearer sk_...`). Admin login requires both `ADMIN_USER` and `ADMIN_PASS` env vars set.

### Vite proxy
In dev, Vite proxies `/v1`, `/api`, and `/docs` to `http://localhost:8787`, so all requests go through `localhost:5173`.

## Coding conventions
- TypeScript, ES modules, 2-space indent, **no semicolons**
- Functional React components in `PascalCase.tsx`; hooks as `useFoo.ts`
- No `any`; strictly typed props
- Dark theme: `zinc`/`neutral` base; semantic colors: `emerald` (success), `amber`/`yellow` (warn), `red` (error), `blue` (info)
- Modals/drawers share a consistent overlay pattern: `fixed inset-0 bg-black/...` + `rounded-2xl border border-zinc-800 bg-zinc-900`
- Components >300 lines: split helpers to `src/features/<feature>/lib/` and sub-components to `src/features/<feature>/components/`

## Commit style
Conventional Commits: `feat|fix|chore|docs|refactor|security(scope): summary`

## Production deployment
Managed by systemd `szkola.service`. Rollout:
```bash
npm run build
sudo systemctl restart szkola.service
sudo systemctl status --no-pager szkola.service
```
Domain: `https://szkola.tkch.eu` → reverse proxy → `http://127.0.0.1:8787`

## MCP / Playwright testing note
Prefer `https://szkola.tkch.eu` over `http://localhost:8787` for Playwright MCP tests — localhost CORS config can produce misleading errors that don't occur on the domain.
