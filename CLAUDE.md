# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## PRD

The PRD lives at `docs/PRD.md`. Keep it current as requirements evolve: whenever a feature is added, changed, or removed, update the relevant section of the PRD to reflect the new reality before considering the task complete.

The data model lives in `README.md` (a mermaid ER diagram), not in the PRD — PRD §8 just points there. **Whenever a migration is added, changed, or removed in `api/migrations/*.js`, update the ER diagram in `README.md` to match** (tables, columns, FKs, relationships) before considering the task complete. Treat it the same as the PRD: schema drift between the migrations and the diagram is a bug.

**Known PRD drift** — the implementation has diverged from the PRD in ways not yet reconciled:
- PRD §8/§9 historically described a `chore_instances` table with client-computed due dates and per-instance optimistic locking (`version`). That was never built. Completions are tracked directly in `chore_completions`, and the API surface is `POST /chores/:id/complete` (not the PRD's `/chores/:id/instances/:instanceId/complete`). There's also no "undo completion" endpoint despite PRD §6.5 describing one.
- `POST /chores/:id/override-availability` (admin-only, lets an admin reopen a `recurring` chore early by setting `next_available_at = NOW()`) isn't listed in the PRD §9 API surface.

## Repository structure

npm workspaces monorepo:
- `api/` — Express 5 + TypeScript REST API
- `web/` — React 19 + Vite SPA (JavaScript, not TypeScript)
- `docs/PRD.md` — product spec (see drift notes above)

## Commands

Run from repo root to target both workspaces, or `cd api`/`cd web` first to target one.

```bash
npm run lint --workspaces     # eslint, both workspaces
npm run build --workspaces    # tsc (api) / vite build (web)
npm run test --workspaces     # vitest run, both workspaces
```

Single test file / single test (from `api/` or `web/`):
```bash
npx vitest run test/chores.test.ts
npx vitest run test/chores.test.ts -t "test name substring"
```

API-specific:
```bash
npm run dev --workspace api          # tsx watch, no build step needed
npm run migrate:up --workspace api   # node-pg-migrate, requires DATABASE_URL
npm run migrate:down --workspace api
```

Web-specific:
```bash
npm run dev --workspace web      # vite dev server
npm run preview --workspace web  # serve the production build
```

A root `husky` pre-commit hook runs `lint-staged`, which auto-formats staged `.ts`/`.jsx`/`.yml`/`.yaml` files with Prettier. Requires Node 24+ (see `Dockerfile`).

### Local full-stack dev (Docker)

```bash
docker compose up --build
```
Requires a root `.env` with `POSTGRES_USER`, `POSTGRES_PASSWORD`, `JWT_SECRET` (see README.md for the one-liner to generate it). Web on :5173, API on :3000, Postgres on :5432. API container runs migrations on startup. `docker compose down -v` resets the DB.

CI (`.github/workflows/ci.yml`) runs lint → build → test separately for `api` and `web` on every push/PR to `main`, with no services — API tests don't need a live Postgres because the DB layer is mocked (see below).

### Manual UI verification (Playwright)

Ad-hoc Playwright smoke tests live under `web/scripts/verify-*/` — standalone scripts that drive a real browser against a running dev stack, each with its own `package.json`/lockfile (with `playwright` as a dependency) deliberately kept out of the `web` workspace so `npm ci` in CI never triggers Playwright's browser download. E.g. `web/scripts/verify-e2e-encryption/` registers a household, creates a kid and a recurring chore, and asserts the raw API response for `enc_*` fields is ciphertext (not the plaintext string) while the UI still renders the decrypted value — including after a full page reload, which is the real test of whether the household key survived (it's persisted in IndexedDB, not a bare in-memory variable).

```bash
cd web/scripts/verify-e2e-encryption
npm install
npx playwright install chromium   # one-time browser download
WEB_URL=http://localhost:5173 API_URL=http://localhost:3000 node verify.mjs
```

Requires the API + web dev server already running (e.g. `docker compose up`) and the web server's origin to match the API's `CORS_ORIGIN` (default `http://localhost:5173`). Screenshots land in `web/scripts/verify-*/screenshots/` (gitignored). These scripts register throw-away test data and do not clean it up — point them at a disposable dev database, or delete the rows manually afterward if you're pointed at shared data.

## API architecture (`api/src`)

- `app.ts` — builds the Express app: CORS (credentialed, origin from `CORS_ORIGIN`), cookie parsing, three separate rate limiters (general/auth/admin), then mounts routers. `requireAuth` is applied per-router at mount time in `app.ts`, not inside each router file.
- `index.ts` — connects to Postgres, then starts listening. Kept separate from `app.ts` so tests can import `app` without opening a real DB connection or port.
- `db.ts` — lazily-constructed singleton `pg.Pool`; `pool` is a `Proxy` so it can be imported directly (`import { pool } from './db.js'`) while still deferring `Pool` construction (and the `DATABASE_URL` env check) until first use.
- `auth.ts` — all JWT concerns: issuing/verifying access tokens (15m), refresh tokens (30d, `httpOnly` cookie), and admin-mode tokens (10m, sent via `x-admin-mode-token` header, not a cookie). Three token *types* share one secret (`JWT_SECRET`) and are distinguished by a `type` claim (`refresh`/`admin`/unset-for-access) — each `verify*` function rejects the wrong type.
- `middleware/auth.ts` (`requireAuth`) — validates the `Authorization: Bearer` access token, populates `res.locals.auth = { userId, householdId }`.
- `middleware/admin.ts` (`requireAdminMode`) — layered on top of `requireAuth`; validates the `x-admin-mode-token` header matches the same user/household as the access token. Applied per-route (not per-router) in files like `routes/chores.ts`, since e.g. `GET /chores` needs only `requireAuth` but `POST /chores` also needs `requireAdminMode`.
- `middleware/csrf.ts` (`requireCsrf`) — double-submit cookie check (`x-csrf-token` header vs `csrfToken` cookie); used on the refresh/logout flow which relies on the httpOnly refresh cookie rather than a bearer token.
- `routes/*.ts` — each router does its own request validation with `zod` schemas defined at the top of the file, talks to Postgres directly via `pool.connect()` (no ORM/query builder, no repository layer), and wraps multi-statement writes in explicit `BEGIN`/`COMMIT`/`ROLLBACK`. All queries are scoped by `household_id` from `res.locals.auth` — there's no other tenant-isolation mechanism, so any new query must filter by it explicitly.
- Every route module is a fully self-contained `Router` with its own row types declared inline (e.g. `ChoreRow` in `chores.ts`) — there's no shared `types/` directory.

Chore recurrence (`routes/chores.ts`) has three `recurrence_type`s — `ad-hoc`, `recurring`, `always-available` — with different completion behavior:
- `ad-hoc`: `is_active` flips to `false` on completion; only an admin can reactivate it (via `PATCH /chores/:id`).
- `recurring`: `next_available_at` is computed and stored on completion (from the plaintext `recurrence_interval_days` column); the chore is unavailable until that timestamp passes. `POST /chores/:id/override-availability` lets an admin force it available immediately.
- `always-available`: stays active and immediately available again after completion, no cooldown.

Availability is checked in two places that must be kept in sync when this logic changes: `isChoreCurrentlyAvailable()` (JS, used inside the `POST /:id/complete` transaction with a `FOR UPDATE OF cd` row lock) and an equivalent SQL `CASE` in the `GET /chores` listing query.

### API tests

`api/test/*.test.ts` use `vitest` + `supertest` against the real `app` export, but `../src/db.js` is fully mocked with `vi.mock` (a single mock `pool.connect()`-returned client whose `.query` is a `vi.fn()`). Tests build JWTs by hand with `jsonwebtoken` using a hardcoded `process.env.JWT_SECRET`. No live database is used or needed.

## Web architecture (`web/src`)

- Plain JS + JSX (no TypeScript on the frontend), React 19, `react-router-dom` v7 for routing, CSS Modules (`*.module.css`) for component styles.
- Routes: `/` (kid-facing home — avatar picker + chore list, no admin controls), `/login`, `/register`, `/admin` (`AdminFamily.jsx` — manage kid profiles), `/chores` (`ChoreAdmin.jsx` — manage chore definitions), `/history` (`PaymentHistory.jsx`).
- `/admin` and `/chores` are both wrapped in `AdminLayout.jsx`, which owns the admin-mode PIN gate (blocks rendering its `children` until `sessionStorage.adminModeToken` is set) and the side nav between Family/Chores/Exit Admin. Admin-mode entry lives only in this layout, not on the home page.
- `lib/api.js` — the only place `fetch` is called. `request()` centralizes base URL (`VITE_API_URL`, default `http://localhost:3000`), JSON headers, `credentials: 'include'`, and error unwrapping from zod's `flatten()`-shaped error bodies. A 401 on any authenticated path triggers `handleExpiredSession()`, which clears `sessionStorage` and hard-redirects to `/login`.
- Auth/session state lives in `sessionStorage` (`accessToken`, `csrfToken`, `adminModeToken`, `userEmail`) — not React context or a state library. Any page that needs auth state reads `sessionStorage` directly.
- `lib/crypto.js` — `deriveHouseholdKey(password, existingEncSalt?)` (PBKDF2 → AES-GCM key; omit the salt to generate a fresh one at registration, pass the household's stored `enc_salt` to re-derive the same key at login), plus `encryptField`/`decryptField`/`safeDecryptField` for AES-256-GCM field-level encryption (envelope: `base64(iv[12 bytes] || ciphertext+tag)`, one column per field, no separate IV column). `lib/keyStore.js` persists the derived (non-extractable) key in IndexedDB — not a bare module variable — so it survives a page reload; kids use the same already-logged-in tab as the admin with no login of their own. All `enc_*` fields (`enc_name`, `enc_description`, `enc_display_name`, `enc_notes`) are genuinely encrypted end-to-end; pages decrypt them once in-place right after fetching (see `App.jsx`/`AdminFamily.jsx`/`ChoreAdmin.jsx`/`PaymentHistory.jsx`'s load functions) so render code just reads plaintext. `chore_definitions.recurrence_interval_days` is a plaintext integer (not `enc_`-prefixed) since the server needs it unencrypted to schedule `next_available_at`.
- Avatar assets live in `public/avatars/corgi-N.png`; the list of selectable IDs is defined wherever the avatar picker renders (currently `AdminFamily.jsx`) and must stay in sync with the files present in `public/avatars/` (and `dist/avatars/` after build).

## Data model

The current schema is diagrammed in `README.md` (mermaid ER diagram), sourced from `api/migrations/*.js` — not from the PRD. Update that diagram whenever migrations change (see PRD note above).
