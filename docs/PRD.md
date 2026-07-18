# Chorgie — Product Requirements Document

> **Version:** 1.0 · **Status:** Draft · **Last updated:** 2026-07-18

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
2. The HEK is held only in memory (never persisted in `localStorage` without user consent).
3. Each encrypted field uses **AES-256-GCM** with a random per-field IV stored alongside the ciphertext.

### What is stored in plaintext on the server
- Household ID, timezone, currency code
- Admin user ID, email address (for auth), password hash
- Chore IDs, due-date timestamps (derived by the client), completion timestamps
- Archived payout IDs and timestamps

### What is stored encrypted
- Chore name, description, recurrence rule
- Kid display name (the label shown on their avatar)
- Any free-text notes on a payout cycle

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
- The client computes the next due date from the recurrence rule and timezone; only the computed `due_at` timestamp is stored server-side.

### 6.5 Chore Completion

- A kid sees chores assigned to them (or to "any kid") that are currently due.
- The kid dashboard displays an **"Upcoming Chores"** section showing recurring chores that are not yet available, sorted by when they will next become available. These chores are greyed out and not clickable.
- Tapping **"Done!"** triggers an optimistic update and sends a completion record to the API.
- **For recurring chores:** when marked complete, the server calculates and stores the `next_available_at` timestamp based on the recurrence interval.
- **Concurrency handling:** if another kid (or the same kid on another device) already marked the chore done, the API returns a `409 Conflict` and the client shows a friendly "Oops, someone already did this one!" message and refreshes.
- Completed one-time chores move to a "Done today" section and no longer appear in the available list.
- Completed ad-hoc chores move to a "Done today" section, then become inactive until an admin reactivates them.
- Completed always-available chores remain active and available immediately — they are not deactivated and have no next-available delay.
- A kid can **undo** a completion (tap **"Undo"** on a "Done today" chore) to un-mark it, returning it to the available list. This is intended for accidental taps; undo is blocked once the chore instance has been marked paid.

### 6.6 Balance Tracking

- Each kid has a running **unpaid balance** = sum of reward amounts for completed-but-not-yet-paid chores.
- Balances are displayed on the kid dashboard and the admin overview.
- Household admin configures the **currency symbol / code** (default: USD / $).

### 6.7 Mark Paid

- Admin selects a kid and taps **"Mark Paid"** to record a payout for that kid.
- Each payout is **per kid** — kids can be paid on completely independent schedules.
- All completed-but-unpaid `chore_instances` for that kid are stamped with `paid_at` and linked to the new payout record. The kid's unpaid balance resets to $0.
- The admin can optionally add a **note** to the payout (e.g., "cash", "bank transfer", or "cash for chores + $5 bonus") before confirming.
- Paid chore instances are hidden from the default balance view but retained for history.

### 6.8 Timezone & Locale

- During onboarding the admin selects the **household timezone** from an IANA timezone list.
- All due-date computations on the client use this timezone (start-of-day semantics: a chore due "Monday" is due at 00:00:00 household time on Monday).
- Currency and timezone can be changed later in household settings.

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

## 8. Data Model

See the data model diagram in `README.md`, which reflects the current schema (kept up to date alongside `api/migrations/*.js`).

---

## 9. API Surface (high-level)

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

GET    /chore_instances                              – list due/open chore instances for household
GET    /chore_instances/completed                    – completed instances for balance view

POST   /chores/:id/instances                         – client creates instance(s) for a chore definition's computed due dates
POST   /chores/:id/instances/:instanceId/complete    – mark done (kid); 409 on version mismatch
DELETE /chores/:id/instances/:instanceId/complete    – undo completion (kid); rejected if instance is already paid (paid_at is set)

GET    /kids/:id/balance       – unpaid balance for a kid

POST   /payouts                – mark a kid paid: stamps matching instances, creates payout record (admin)
GET    /payouts                – list payout history, optionally filtered by ?kid_id= (admin)
GET    /payouts/:id            – get a single payout with its chore instances (admin)
```

---

## 10. UX Flows (summary)

### Onboarding
1. Admin registers → household name, email, password, PIN, timezone, currency.
2. Admin creates kid profiles (name + corgi avatar).
3. Admin creates initial chore definitions.

### Daily kid flow
1. Home screen shows kid avatars.
2. Kid taps their avatar → sees their chore list and balance.
3. Kid taps "Done!" on a chore → balance updates, chore moves to done.

### Admin flow
1. Admin taps "Enter Admin Mode" → enters PIN → 10-min session begins.
2. Admin manages chores, kids, views balances.
3. Admin taps "Mark Paid" → selects kids → confirms → balances reset.
4. Admin taps "Exit Admin Mode" or session expires.

---

## 11. Design System

- **Theme:** Corgi-themed — warm earth tones (tan, rust, cream, forest green accents)
- **Typography:** Rounded, friendly sans-serif (e.g., Nunito or Poppins)
- **Icons/Avatars:** Illustrated corgi avatar set (8–10 variants)
- **Component library:** Custom built on top of Radix UI primitives + Tailwind CSS
- **Animations:** Subtle celebration animation (corgi wag) on chore completion

---

## 12. Milestones

| # | Milestone | Scope |
|---|-----------|-------|
| 1 | Repo scaffold | Monorepo, Node API skeleton, React+Vite SPA skeleton, CI pipeline |
| 2 | Auth & households | Registration, login, JWT, household settings, encryption key derivation |
| 3 | Kids & admin mode | Kid profiles, avatar selection, admin PIN + 10-min session |
| 4 | Chore definitions | CRUD, recurrence rules, E2E encryption of content |
| 5 | Chore instances & completion | Client-computed due dates, mark done, concurrency (409) |
| 6 | Balances & payouts | Balance display, mark paid, archive cycle |
| 7 | Design system | Corgi theme, component library, kid-friendly UX polish |
| 8 | Hardening & deploy | Render deploy config, security review, accessibility pass |
