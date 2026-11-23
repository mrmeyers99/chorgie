# Chorgie — Product Requirements Document

> **Version:** 1.0 · **Status:** Draft · **Last updated:** 2026-07-19

---

## 1. Overview

**Chorgie** is a household chore-management app built for families. Parents (admins) define chores and reward amounts; kids view their available chores, mark them done, and track their earned balance. When a payout cycle ends the admin marks balances as paid, archiving the history for future reporting.

The product is intentionally simple in scope for the MVP: no push notifications, no external payment integrations, no gamification beyond balance tracking.

---

## 2. Goals & Non-Goals

### Goals
- Give households a single, lightweight place to assign, track, and reward chores.
- Keep personal household data private — the server stores only ciphertext; all encryption/decryption happens client-side.
- Support chores with ad-hoc or recurring cadences.
- Make the kid UX dead-simple (tap your avatar → see your chores → tap done).
- Give parents a PIN-protected admin mode to manage everything without exposing admin controls to kids.

### Non-Goals (MVP)
- Push / email notifications
- External payment integrations (Venmo, PayPal, CSV export)
- Gamification (badges, streaks, leaderboards)
- Multi-household / shared chores
- Native mobile app (web-only MVP)

---

## 3. Users & Roles

| Role | Description |
|------|-------------|
| **Household Admin (Parent)** | The sole authenticated user for a household. Registers the household with an email + password, manages chore definitions, kids' profiles, and payouts. Accesses admin features via PIN-protected admin mode. |
| **Super Admin (Operator)** | An ordinary Household Admin whose user row has `is_super_admin = true`. In addition to managing their own household, can view a read-only list of every household in the app (see §6.10). The flag can only be set directly in the database — there is no API or UI to grant it. |
| **Kid** | Has no user account or password. Represented only as a kid profile. Taps their avatar on the household screen, views assigned/available chores, marks them done, and sees their balance. |

> **Design note:** One admin per household (MVP). Kids are profiles, not users — no login, no password, no session of their own. Households and users are kept as separate tables for future-proofing (e.g. multi-admin support post-MVP).

---

## 4. Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Stack | Separate Node.js API + React SPA (Vite) | Clean separation; SPA can own client-side crypto |
| Database | PostgreSQL on Render | Simple, managed, relational |
| Auth | Email/password (JWT) | Familiar, low friction for MVP |
| Encryption | Client-side E2E | Server stores ciphertext; server cannot read household chore content |
| Design system | Corgi-themed | Dog-themed, playful, family-friendly |

---

## 5. Encryption Model

All **household-specific user-generated content** (chore names, descriptions, kid display names) is encrypted client-side before being sent to the API and decrypted client-side after retrieval.

### Key derivation
1. On household registration the client derives a symmetric **household encryption key (HEK)** from the admin's password using **PBKDF2** (or Argon2id) + a random salt stored server-side.
2. On login, the client re-derives the same HEK from the entered password plus the salt fetched from `GET /household`, since kids share the admin's already-logged-in browser tab with no login of their own.
3. The HEK (a non-extractable key) is persisted in IndexedDB on the client so it survives a page reload, rather than a plain in-memory variable that would be wiped and strand a valid session with undecryptable content; raw key material never leaves the browser's crypto boundary and is never written to `localStorage`.
4. Each encrypted field uses **AES-256-GCM** with a random per-field IV stored alongside the ciphertext.

### What is stored in plaintext on the server
- Household ID, timezone, currency code
- Admin user ID, email address (for auth), password hash
- Chore IDs, reward amounts, recurrence type, recurrence interval (day count), due-date timestamps (derived by the client), completion timestamps
- Kid-submitted chore request IDs, requested/approved amounts, status (pending/approved/rejected), and submitted/resolved timestamps
- Archived payout IDs and timestamps

### What is stored encrypted
- Chore name, description
- Name of a kid-submitted chore request (what the kid says they did)
- Kid display name (the label shown on their avatar)
- Any free-text notes on a payout cycle

> **Note:** the recurrence *rule* is not encrypted — for this app it's just a day-count integer (`recurrence_interval_days`), and the server needs to read it in plaintext to compute `next_available_at` during chore completion (a kid-triggered, concurrency-sensitive operation that must stay server-trusted). There's no textual content in it worth protecting.

### Key rotation (post-MVP)
Not in scope for v1 — admin password change will require re-encryption of all household data in a future version.

---

## 6. Feature Requirements

### 6.1 Household Registration & Auth

- A new user registers with **email + password** to create a household.
- JWT-based session; access token short-lived (15 min), refresh token long-lived (30 days), stored in an `httpOnly` cookie.
- Single household per account for MVP.

### 6.2 Admin Mode

- From any screen the admin can tap **"Enter Admin Mode"** and supply their PIN (4–8 digits, set during onboarding).
- Admin mode is valid for **10 minutes** from last action; a countdown is shown.
- The admin can tap **"Exit Admin Mode"** at any time to leave immediately.
- Admin PIN is stored as a **bcrypt hash** server-side (the PIN itself is not household-encrypted content).

### 6.3 Kid Profiles

- Admin creates kid profiles with a **display name** and selects an avatar (corgi avatar set).
- Kids are listed on the home screen as large tap targets.
- Tapping a kid profile switches the view to that kid's dashboard — no PIN, no password.
- Profiles can be reordered, edited, or deactivated by the admin.

### 6.4 Chore Definitions

- Admins create chore definitions with:
  - Name (encrypted)
  - Description (optional, encrypted)
  - Reward amount (decimal, stored in household currency)
  - Recurrence type: **ad-hoc**, **recurring**, or **always available**
    - **Ad-hoc:** becomes inactive after completion and remains visible in admin controls so it can be reactivated later.
    - **Recurring:** reappears after the configured repeat interval (in days).
    - **Always available:** stays active and immediately available again after completion — no cooldown, no manual reactivation needed.
  - Assigned-to: one kid, multiple kids, or "any kid"
- Recurring chores store their repeat interval as a plaintext day count (`recurrence_interval_days`) — see §6.5 for how it's used to compute availability, and §8 for the override-availability endpoint that lets an admin bypass it, and the skip endpoint that lets an admin advance it (the inverse: for when the admin did the chore themselves and doesn't want it sitting due/overdue for a kid to tap and get paid for).

### 6.5 Chore Completion

- A kid sees chores assigned to them (or to "any kid") that are currently due. For a **recurring** chore that's become due, the dashboard shows how many days it's been overdue (days elapsed since `next_available_at`), if any.
- If a chore has a description, the kid can tap its name to expand/collapse the description inline; chores without one show no expand affordance.
- The kid dashboard displays an **"Upcoming Chores"** section showing recurring chores that are not yet available, sorted by when they will next become available. These chores are greyed out and not clickable.
- Tapping **"Done!"** triggers an optimistic update and sends a completion record to the API.
- **For recurring chores:** when marked complete, the server calculates and stores the `next_available_at` timestamp based on the recurrence interval.
- **Concurrency handling:** if another kid (or the same kid on another device) already marked the chore done, the API returns a `409 Conflict` and the client shows a friendly "Oops, someone already did this one!" message and refreshes.
- Completed one-time chores move to a "Done today" section and no longer appear in the available list.
- Completed ad-hoc chores move to a "Done today" section, then become inactive until an admin reactivates them.
- Completed always-available chores remain active and available immediately — they are not deactivated and have no next-available delay.
- A kid can **undo** a completion (tap **"Undo"** on a "Done today" chore) to un-mark it, returning it to the available list. This is intended for accidental taps; undo is blocked once the completion has been marked paid.

### 6.6 Balance Tracking

- Each kid has a running **balance**: a ledger value incremented by the reward amount whenever a chore is completed (or by the approved amount when an admin approves a kid-submitted chore request — see §6.9), and decremented by the amount of each payout made to that kid.
- Balances are displayed on the kid dashboard and the admin overview.
- Household admin configures the **currency symbol / code** (default: USD / $).

### 6.7 Mark Paid

- Admin selects a kid and taps **"Mark Paid"** to record a payment for that kid.
- Each payout is **per kid** — kids can be paid on completely independent schedules, and payments can be **partial**: the admin enters any amount greater than $0 and no more than the kid's current balance.
- The entered amount is recorded as a new payout ledger entry and subtracted from the kid's balance. Payouts are not tied to any specific completed chore — completed chores remain a separate historical log, independent of what's been paid.
- The admin can optionally add a **note** to the payout (e.g., "cash", "bank transfer", or "cash for chores + $5 bonus") before confirming.
- Payment history is retained and viewable per kid as a single paginated ledger that interleaves payouts with completed chores and approved kid-submitted chores (tagged "Extra", dated by when the admin approved them) in reverse-chronological order, with a "Load more" control to page further back.

### 6.8 Timezone & Locale

- During onboarding the admin selects the **household timezone** from an IANA timezone list.
- All due-date computations on the client use this timezone (start-of-day semantics: a chore due "Monday" is due at 00:00:00 household time on Monday).
- Currency and timezone can be changed later in household settings.

### 6.9 Kid-Submitted Chores (Chore Requests)

- From the kid dashboard, with their avatar selected, a kid taps **"+ I did something else"** to log a chore that isn't on their list. They enter:
  - What they did (required, encrypted like other chore names)
  - How much they think it's worth (optional; leaving it blank means "a grown-up decides")
- The request is created as **pending** and does **not** affect the kid's balance. Pending requests are listed on the kid's dashboard under **"Waiting for Approval"** until an admin resolves them.
- In Admin Mode, a **Requests** page (side nav, with a badge showing the number of pending requests) lists every pending request with the kid's name, when it was submitted, and the amount they asked for.
  - **Approve:** the admin can accept the requested amount or change it to any amount ≥ $0 (an amount is required when the kid didn't request one). The approved amount is credited to the kid's balance immediately and the entry appears in their payment history.
  - **Decline:** the request is marked rejected; no balance change and nothing is added to history.
- A request can only be resolved once — approving or declining an already-resolved request returns `409 Conflict`. Approval is blocked if the kid profile has since been deactivated.
- Submitting a request does not create a chore definition; if the admin wants it on the regular list going forward they add it on the Chores page as usual.

### 6.10 Super Admin Household Overview

- A super admin sees an extra **"Households"** item in the admin-mode side nav, linking to `/super-admin`. It is hidden for everyone else, and the page redirects non-super-admins to `/admin`.
- The page lists **every household** in the app, newest first, with: household ID, created date/time, time zone, and total number of chore completions (all time). A header summarises the household count and total completions.
- Access requires a valid access token **and** an admin-mode (PIN) token **and** `users.is_super_admin = true`; the flag is re-checked on every request so revoking it takes effect immediately.
- Read-only, and limited to plaintext metadata — no encrypted household content (kid names, chore names, notes) is exposed, and the server couldn't decrypt it anyway.
- `POST /auth/login`, `/auth/register` and `/auth/refresh` return `user.is_super_admin` so the client knows whether to show the nav item.

---

## 7. Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Security | All API routes require valid JWT except `/auth/*`. Admin routes additionally require admin-mode session token. |
| Privacy | Server-side data contains no readable household content (names, descriptions). |
| Performance | No performance requirement during MVP, especially since we'll be using the eco plan |
| Availability | Render service tier; no SLA target for MVP. |
| Accessibility | WCAG 2.1 AA target for kid-facing screens. |
| Browser support | Last 2 versions of Chrome, Firefox, Safari, Edge. |
| Code formatting | Git pre-commit hook (husky + lint-staged) auto-formats staged `.ts` and `.yml`/`.yaml` files with Prettier. Requires Node 24+. |

---

## 8. API Surface (high-level)

```
POST   /auth/register          – create household + admin user
POST   /auth/login             – issue JWT pair
POST   /auth/refresh           – rotate access token
POST   /auth/logout

POST   /admin/enter            – verify PIN, issue admin-mode token (10 min TTL)
POST   /admin/exit             – revoke admin-mode token

GET    /household              – get household settings (timezone, currency, salt)
PATCH  /household              – update settings (admin)

GET    /kids                   – list kid profiles
POST   /kids                   – create kid profile (admin)
PATCH  /kids/:id               – update kid profile (admin)

GET    /chores                 – list chore definitions
POST   /chores                 – create chore definition (admin)
PATCH  /chores/:id             – update chore definition (admin)
DELETE /chores/:id             – soft-delete (admin)

POST   /chores/:id/complete                – mark done (kid); 409 if the chore is not currently available
POST   /chores/:id/override-availability   – reopen a recurring chore early, bypassing next_available_at (admin)
POST   /chores/:id/skip                    – skip the current occurrence without a kid completing it; advances next_available_at by the recurrence interval, no reward paid (admin)
DELETE /chores/:id/complete                – undo completion (kid); rejected once the completion has been paid

GET    /kids/:id/balance       – current balance for a kid
GET    /kids/:id/history       – unified, cursor-paginated ledger (chore completions + approved chore requests + payouts) for a kid, ?limit=&cursor=

POST   /chore-requests                – kid logs an off-list chore with an optional requested_amount; created pending, no balance change (kid)
GET    /chore-requests                – list requests, ?status=pending|approved|rejected (default pending)&kid_id=
POST   /chore-requests/:id/approve    – approve with optional amount override (defaults to requested_amount; required if none); credits balance; 409 if already resolved (admin)
POST   /chore-requests/:id/reject     – decline; no balance change; 409 if already resolved (admin)

POST   /payouts                – record a payment of a given amount (≤ current balance) for a kid; decrements balance (admin)
GET    /payouts/:id            – get a single payout

GET    /super-admin/households – list all households (id, created_at, timezone, completion_count) (admin mode + super admin)
```

---

## 9. UX Flows (summary)

### Onboarding
1. Unauthenticated visitor lands on `/` → sees a public landing page describing the app, with "Log in" and "Create household" calls to action (no app data is loaded or requested here).
2. Admin registers → household name, email, password, PIN, timezone, currency.
3. Admin creates kid profiles (name + corgi avatar).
4. Admin creates initial chore definitions.

### Daily kid flow
1. Home screen shows kid avatars. The header greets the logged-in email based on the device's local time ("Good morning" 5:00–11:59, "Good afternoon" 12:00–16:59, "Good evening" otherwise).
2. Kid taps their avatar → sees their chore list and balance.
3. Kid taps "Done!" on a chore → balance updates, chore moves to done.
4. Kid did something not on the list → taps "+ I did something else", describes it, optionally suggests an amount → it shows as "Waiting for Approval" until an admin resolves it.

### Admin flow
1. Admin taps "Enter Admin Mode" → enters PIN → 10-min session begins.
2. Admin manages chores, kids, views balances.
3. Admin opens **Requests** (badge shows pending count) → approves each kid-submitted chore (optionally adjusting the amount) or declines it.
4. Admin taps "Mark Paid" on a kid → enters a payment amount (up to their current balance) → confirms → balance decrements by that amount.
5. Admin taps "Exit Admin Mode" or session expires.

---

## 10. Design System

- **Theme:** Corgi-themed — warm earth tones (tan, rust, cream, forest green accents)
- **Typography:** Rounded, friendly sans-serif (e.g., Nunito or Poppins)
- **Icons/Avatars:** Illustrated corgi avatar set (8–10 variants)
- **Component library:** Custom built on top of Radix UI primitives + Tailwind CSS
- **Animations:** Subtle celebration animation (corgi wag) on chore completion

---

## 11. Milestones

| # | Milestone | Scope |
|---|-----------|-------|
| 1 | Repo scaffold | Monorepo, Node API skeleton, React+Vite SPA skeleton, CI pipeline |
| 2 | Auth & households | Registration, login, JWT, household settings, encryption key derivation |
| 3 | Kids & admin mode | Kid profiles, avatar selection, admin PIN + 10-min session |
| 4 | Chore definitions | CRUD, recurrence rules, E2E encryption of content |
| 5 | Chore completion | Mark done, recurrence scheduling (`next_available_at`), concurrency (409) |
| 6 | Balances & payouts | Balance display, mark paid, archive cycle |
| 7 | Design system | Corgi theme, component library, kid-friendly UX polish |
| 8 | Hardening & deploy | Render deploy config, security review, accessibility pass |
