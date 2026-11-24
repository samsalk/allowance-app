# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Salkinomics (formerly "Save, Spend, Share") — a family allowance tracker where each kid's money is split into three buckets: Save, Spend, Share. Originally a localStorage-only static page; now hosted on Vercel (static frontend + serverless functions in `api/`) with state stored in a private Vercel Blob.

## Commands

No build step, no bundler, no test suite — plain HTML/CSS/JS served as static files, plus Node serverless functions in `api/`. `package.json` exists only for the `@vercel/blob` dependency.

- **Local dev**: `npm install`, `vercel link`, `vercel env pull .env.local`, then `vercel dev` (serves the static files and `api/` together). A plain `python3 -m http.server` no longer works — the app needs `/api/*`.
- **Syntax-check JS**: `node --check app.js` (and the files in `api/`, `lib/`).
- **Data import helper**: `node --env-file=.env.local scripts/import-data.js <backup.json>` loads an exported `{kids, settings, transactions}` JSON into the blob (refuses to overwrite existing data).

## Architecture

### Script load order matters (index.html)
Tailwind CDN → `allowance-logic.js` (defines the global `allowanceLogic` object) → `auth.js` (session/login) → `app.js` (everything else). Each later file depends on globals the earlier ones define.

### Data model: one JSON blob
The entire app state — `{ kids: [...], settings: {...}, transactions: [...] }` — is a single private Vercel Blob (`family-data.json`, see `lib/store.js`). The in-memory `appData` object in `app.js` has exactly this shape; `loadData()`/`saveData()` GET/PUT it via `/api/data`. A new field on a kid or transaction just needs to exist in the JS object.

Saves use optimistic concurrency: the blob's ETag is kept in `dataVersion` in `app.js`; `PUT /api/data` sends it back and the server writes with `ifMatch`, answering 409 on mismatch, at which point the client alerts and reloads rather than overwriting another device's edit. Reads use `useCache: false` so they never see a stale overwrite.

### Auth: one shared PIN, not per-user accounts
`POST /api/login` compares the PIN to the `FAMILY_PIN` env var and sets a signed HttpOnly cookie (`SESSION_SECRET`, `lib/session.js`). `/api/data` and `/api/session` reject requests without it. The Blob token never reaches the browser. There is no real rate limiting on PIN attempts (just a delay).

### Allowance math lives in one place, used by two runtimes
`allowance-logic.js` holds the pure functions for age-from-birthday and the weekly distribution rule (base amount = `floor(age/3)` per bucket, remainder distributed round-robin via a rotating `rotationWeek` counter that cycles 1→2→3→1). It works unmodified as both a browser `<script>` (attaches `window.allowanceLogic`) and a Node `require()`. `lastAllowanceDate` is stamped with the scheduled due instant (allowance day at `ALLOWANCE_HOUR_UTC`, kept in sync with the cron in `vercel.json`), never "now", so late/manual runs can't skip a week; `scheduledAllowancesBetween()` lists what's due. Both `app.js` (the live UI) and `lib/weekly-allowance.js` (the cron route) use it — never reimplement this math inline in either place.

### Weekly allowance is applied by a Vercel Schedule, not the client
`vercel.json` declares a static schedule `weekly-allowance` (Sundays 14:00 UTC; Hobby adds up to 15 min jitter, which is fine since lastAllowanceDate is stamped with the due instant) targeting the private function `api/cron-allowance.mjs` via `handleSchedule` from `@vercel/schedules`. A `function` target has no public URL, so there is no secret to check (the old Cron Jobs/`CRON_SECRET` approach is deprecated — don't reintroduce `crons`). Keep the schedule name stable; renaming resets its history. Runs aren't retried, but `dueDates()` pays every week since `lastAllowanceDate`, so a missed run is picked up next time. The handler reads the blob, applies all due weeks via `lib/weekly-allowance.js`, and writes with `ifMatch`, retrying on conflict. With more than one week due, the client's `checkAndAddWeeklyAllowance()` deliberately defers to the catch-up review screen instead of paying. Test with `vercel schedules invoke weekly-allowance`; history via `vercel schedules executions list weekly-allowance`.

### Mobile UI patterns — not everything is a modal
Designed mobile-first; different interaction types get deliberately different treatment (see `styles.css`, the "Comic Pop" design system: bold outlines, flat colors, halftone texture, hard offset shadows; fonts are Anton + Archivo Narrow via Google Fonts):
- **Transaction History** is a drill-in view, not a popup — `showTransactionHistory()`/`closeTransactionHistory()` hide the dashboards and nav and show a back-link, rather than toggling an overlay.
- **Goal Management** and **Allowance Confirmation** are inline expands within their parent card/section (see `editingGoalKidId` state in `app.js`), not dialogs.
- **Add Child**, **Edit Profile**, **Catch-Up Review** are full-screen "sheet" overlays (`.sheet-overlay`/`.sheet` classes).
- **Goal Celebration** is the one true modal takeover (`.celebration-overlay`), since it's a genuine interruption.

### Class-naming collision to watch for
Some class names serve double duty: they're visual-style hooks in the design system *and*, in unrelated markup, would-be JS `querySelector` hooks. `.kid-name`/`.goal-name` are styled heading classes (kid names, goal names on cards); the setup wizard's raw text `<input>` fields for entering a name use `.kid-name-input`/`.goal-name-input` specifically to avoid an input silently inheriting heading typography. When adding a new form field, check `styles.css` first rather than reusing a class that's already a display style elsewhere.

### Every mutating action goes through `withLoading`
Buttons that call an `async` mutating function are wired as `onclick="withLoading(this, 'Saving…', someAsyncFn)"` (helper defined in `app.js`) — it disables the button and swaps its label for the duration of the network round-trip. Saves are real network calls now, not instant `localStorage` writes; a button with no loading state will look unresponsive on a slow connection.

### Secrets
Vercel project env vars (never committed): `FAMILY_PIN`, `SESSION_SECRET` (long random string), plus `BLOB_STORE_ID`/`BLOB_WEBHOOK_PUBLIC_KEY` (added automatically when the private Blob store is connected; auth is OIDC, so no `BLOB_READ_WRITE_TOKEN` is needed on Vercel — locally, `vercel env pull` supplies a short-lived `VERCEL_OIDC_TOKEN`). The one store is shared by Production and Preview deployments. Set them via the Vercel dashboard or `vercel env add` yourself — don't pass them through chat/tooling.

## Deployment

Hosted on Vercel; pushes to `main` auto-deploy once the repo is connected to the Vercel project. No build step. Previously this ran on GitHub Pages + Supabase (free-tier pausing caused repeated failures), which is why those pieces and their workflows were removed.
