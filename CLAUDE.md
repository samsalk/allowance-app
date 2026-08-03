# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Salkinomics (formerly "Save, Spend, Share") — a family allowance tracker where each kid's money is split into three buckets: Save, Spend, Share. Originally a localStorage-only static page; now a hosted app backed by Supabase. Live at https://samsalk.github.io/allowance-app/.

## Commands

No build step, no bundler, no package.json, no test suite — this is plain HTML/CSS/JS served as static files.

- **Local dev server**: `python3 -m http.server 8000` from the repo root, then open `http://localhost:8000`. Must be served over `http://`, not opened as a `file://` path — Supabase Auth needs a real origin.
- **Syntax-check JS**: `node --check app.js` (Node isn't a project dependency; only needed if available locally).
- **Weekly allowance script** (`scripts/apply-weekly-allowance.js`) needs `@supabase/supabase-js`, which isn't vendored in the repo — to run it locally, `npm install @supabase/supabase-js@2 --no-save` in a scratch directory first, then run it with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars set (the latter from Supabase dashboard → Project Settings → API — never commit it).
- **Data migration helper**: `python3 scripts/generate-migration-sql.py <backup.json>` — converts an old localStorage "Backup Data" export into a SQL statement for the Supabase SQL editor.

## Architecture

### Script load order matters (index.html)
Tailwind CDN → Supabase JS CDN → `config.js` (defines `supabaseClient`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `FAMILY_EMAIL`) → `allowance-logic.js` (defines the global `allowanceLogic` object) → `auth.js` (session/login) → `app.js` (everything else). Each later file depends on globals the earlier ones define.

### Data model: one JSON blob, not normalized tables
The entire app state — `{ kids: [...], settings: {...}, transactions: [...] }` — lives as a single `jsonb` value in one row of the `family_data` table in Postgres (`supabase/migrations/0001_family_data.sql`). The in-memory `appData` object in `app.js` has exactly this shape; `loadData()`/`saveData()` just read/write the whole blob. There's no per-table schema to keep in sync — a new field on a kid or transaction just needs to exist in the JS object.

Saves use optimistic concurrency (`dataVersion` in `app.js`): `saveData()` sends the row's last-known `version` and only succeeds if it still matches server-side; on mismatch it alerts the user and reloads rather than silently overwriting a concurrent edit from another device.

### Auth: one shared login, not per-user accounts
A single fixed Supabase Auth user (family email + password) backs the whole app; the password is presented to end users as a shared family PIN. Row Level Security on `family_data` requires `role = 'authenticated'` for all access — the anon key alone (necessarily public in `config.js`) cannot read or write anything on its own. **Gotcha**: tables created via the Supabase SQL editor (raw SQL) do *not* get the automatic role grants that tables created via the dashboard Table Editor get — `authenticated` and `service_role` both needed explicit `grant` statements, already present in the migration file. If a future table/migration mysteriously gets "permission denied" despite correct RLS policies and correct keys, check for a missing grant first.

### Allowance math lives in one place, used by two runtimes
`allowance-logic.js` holds the pure functions for age-from-birthday and the weekly distribution rule (base amount = `floor(age/3)` per bucket, remainder distributed round-robin via a rotating `rotationWeek` counter that cycles 1→2→3→1). It's written to work unmodified as both a browser `<script>` (attaches `window.allowanceLogic`) and a Node `require()` (CommonJS `module.exports`). Both `app.js` (the live UI) and `scripts/apply-weekly-allowance.js` (the cron job) import it — never reimplement this math inline in either place; it has to stay identical in both or the scheduled job and the UI will disagree.

### Weekly allowance is applied by a cron job, not the client
`.github/workflows/weekly-allowance.yml` runs `scripts/apply-weekly-allowance.js` on a schedule (Sundays 14:00 UTC) plus on-demand via `workflow_dispatch`. It authenticates with the `service_role` key (a GitHub Actions repo secret — bypasses RLS, must never be committed or appear in browser code) and applies the same version-checked update pattern as the client. Requires Node 22+ in the workflow — `@supabase/supabase-js` initializes a Realtime client that needs native `WebSocket` support Node 20 lacks. The client-side `checkAndAddWeeklyAllowance()` in `app.js` still exists as a fallback for whenever someone happens to open the app on the configured day, but the cron is the reliable path.

### Mobile UI patterns — not everything is a modal
Designed mobile-first; different interaction types get deliberately different treatment (see `styles.css`, the "Comic Pop" design system: bold outlines, flat colors, halftone texture, hard offset shadows; fonts are Anton + Archivo Narrow via Google Fonts):
- **Transaction History** is a drill-in view, not a popup — `showTransactionHistory()`/`closeTransactionHistory()` hide the dashboards and nav and show a back-link, rather than toggling an overlay.
- **Goal Management** and **Allowance Confirmation** are inline expands within their parent card/section (see `editingGoalKidId` state in `app.js`), not dialogs.
- **Add Child**, **Edit Profile**, **Catch-Up Review** are full-screen "sheet" overlays (`.sheet-overlay`/`.sheet` classes).
- **Goal Celebration** is the one true modal takeover (`.celebration-overlay`), since it's a genuine interruption.

### Class-naming collision to watch for
Some class names serve double duty: they're visual-style hooks in the design system *and*, in unrelated markup, would-be JS `querySelector` hooks. `.kid-name`/`.goal-name` are styled heading classes (kid names, goal names on cards); the setup wizard's raw text `<input>` fields for entering a name use `.kid-name-input`/`.goal-name-input` specifically to avoid an input silently inheriting heading typography. When adding a new form field, check `styles.css` first rather than reusing a class that's already a display style elsewhere.

### Every mutating action goes through `withLoading`
Buttons that call an `async` mutating function are wired as `onclick="withLoading(this, 'Saving…', someAsyncFn)"` (helper defined in `app.js`) — it disables the button and swaps its label for the duration of the Supabase round-trip. Saves are real network calls now, not instant `localStorage` writes; a button with no loading state will look unresponsive on a slow connection.

### Secrets
- `config.js` holds `SUPABASE_URL` and `SUPABASE_ANON_KEY` — **not secret**, safe to commit; security is enforced by RLS requiring an authenticated session, not by hiding these.
- The `service_role` key is the only real secret in this project. It lives solely as the `SUPABASE_SERVICE_ROLE_KEY` GitHub Actions repo secret, used by the cron workflow and manually when running the migration script locally. It must never be committed, logged, or transmitted through chat/tooling — any change involving it should be done by the user directly via `gh secret set` or the Supabase dashboard.

## Deployment

Static files served as-is via GitHub Pages (`main` branch, root), auto-deploys on push — no build step. The backend is a separate Supabase project (Postgres + Auth), not part of this repo's deploy process; schema changes go in `supabase/migrations/` and must be applied manually via the Supabase SQL editor (there's no migration-runner CLI wired up).
