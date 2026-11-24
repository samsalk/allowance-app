# Salkinomics - Family Allowance Tracker

A web-based allowance tracking application that helps families teach kids about money management using the three-bucket system: Save, Spend, and Share.

## Features

### Core Functionality

**Three-Bucket System**
- **Save (💰)**: For future goals and long-term savings
- **Spend (🛍️)**: For fun purchases and immediate wants
- **Share (❤️)**: For helping others and charitable giving

**Age-Based Allowance**
- Automatic weekly allowance: $1 per year of age
- Smart distribution across all three buckets
- Rotating remainder allocation to ensure fairness
- Age automatically updates on birthdays

**Dual Dashboard System**
- **Kids Dashboard**: Kid-friendly view showing balances, goals, and next allowance date
- **Parent Dashboard**: Full administrative controls for managing family finances

### Key Features

**Goal Tracking**
- Set savings goals for each child
- Visual progress bars with color-coded completion status
- Automatic celebration when goals are reached
- Optional goal management (set, edit, or remove)

**Transaction Management**
- Record money additions and spending
- Automatic weekly allowance distribution
- Comprehensive transaction history with filtering
- CSV export for record-keeping
- Undo last allowance feature

**Smart Catch-Up System**
- Detects missed weekly allowances
- Shows specific weeks that were missed
- Selective catch-up: choose which weeks to apply per child
- Automatic or manual catch-up options

**Family Management**
- Edit kid profiles (name, age, birthday)
- Automatic age calculation from birthdays
- Support for multiple children
- Individual balance tracking per child

**Data Management**
- Stored server-side (a private Vercel Blob), synced across every device you log into
- Manual backup/export to JSON
- Transaction history with search and filters

## Getting Started

This app is hosted on [Vercel](https://vercel.com): a static frontend (this repo, no build step), a few serverless functions in `api/` that gate and store the data, and a Vercel Schedule that applies the weekly allowance so it doesn't depend on anyone opening the app on the right day.

### One-time setup

1. **Create a Vercel project** from this repo (`vercel link`, or import it in the dashboard). Framework preset: Other, no build command.
2. **Create a private Blob store** (project → Storage → Create → Blob, access **Private** -- this can't be changed later) and connect it to the project for Production, Preview and Development. Auth is OIDC, so no token needs copying.
3. **Set the secrets** (never commit them):
   - `FAMILY_PIN` -- the shared PIN everyone uses to unlock the app (6+ digits recommended; wrong guesses are only slowed down, not rate limited)
   - `SESSION_SECRET` -- a long random string that signs the login cookie (`openssl rand -hex 32`)

   e.g. `openssl rand -hex 32 | vercel env add SESSION_SECRET production`
4. **Turn off Deployment Protection** for Production (Settings → Deployment Protection) so family members aren't asked to log in to Vercel first. The PIN is the real gate.
5. **Deploy** (`vercel deploy --prod`, or push to the git-connected branch). The weekly schedule in `vercel.json` registers automatically; check it with `vercel schedules list`.
6. **Existing data?** Use the in-app setup wizard to start fresh, or load an exported `{kids, settings, transactions}` JSON once with `scripts/import-data.js` (needs blob credentials locally; see the script's header).

### Local development

`npm install`, `vercel link`, `vercel env pull .env.local`, then `vercel dev`. A plain static server won't work because the app needs `/api/*`. Use a separate Vercel project/Blob store for experiments so you don't touch real family data.

### Setup Wizard

The app guides you through a 3-step setup process:

1. **Kids Info**: Enter names and birthdays for each child
2. **Starting Balances**: Set initial balances for Save, Spend, and Share buckets
3. **Savings Goals** (Optional): Set initial savings goals

## Usage

### For Parents

**Adding Weekly Allowance**
1. Navigate to Parent Dashboard
2. Click "Add Weekly Allowance"
3. Review the distribution preview
4. Confirm to apply to all kids

**Recording Transactions**
1. Select the child
2. Choose the bucket (Save, Spend, or Share)
3. Enter the amount and description
4. Click "Add Money" or "Record Spending"

**Managing Profiles**
1. Go to Family Management section
2. Click "Edit Profile" for any child
3. Update name, age, or birthday
4. Save changes

**Viewing History**
1. Click "View History" button
2. Use filters to find specific transactions
3. Export to CSV for external records

### For Kids

**Viewing Balances**
- See current amounts in all three buckets
- Check progress toward savings goals
- View countdown to next allowance
- See recent activity

## Technical Details

### Technology Stack
- Pure HTML5, CSS3, and JavaScript -- no build step, no bundler, no framework
- Custom design system in `styles.css` ("Comic Pop": bold outlines, flat colors, halftone texture), fonts via Google Fonts (Anton + Archivo Narrow). TailwindCSS (CDN) is still loaded for a handful of base utilities but isn't the primary styling layer.
- Node serverless functions in `api/` (login, session, data) on Vercel, with state in a private [Vercel Blob](https://vercel.com/docs/vercel-blob)
- A [Vercel Schedule](https://vercel.com/docs/schedules) (`vercel.json`) running `api/cron-allowance.mjs` weekly to apply allowance server-side

### Mobile-First UI
Built for phones first, not adapted from a desktop layout after the fact:
- The Transaction History filter/search screen is a drill-in view (not a popup) with a back link
- Goal editing and the weekly-allowance confirmation expand inline within the page instead of opening a dialog
- Adding a child, editing a profile, and reviewing missed allowances use full-screen sheets
- Every action that saves shows a loading state on its button (disabled + relabeled, e.g. "Saving…") while the network request is in flight

### Data Storage
- All app state (`kids`, `settings`, `transactions`) is a single JSON document stored as one private blob (`family-data.json`), read and written only through `/api/data`
- Every `/api/data` request needs a signed, HttpOnly session cookie issued by `/api/login` after the PIN is checked; the Blob credentials never reach the browser
- Saves use optimistic concurrency (the blob's ETag): if two devices save near-simultaneously, the second one is told to reload and retry rather than silently overwriting the first
- A read-only copy is cached in the browser's `localStorage` for instant paint on load, but the server is always the source of truth
- Manual export to JSON remains available via the Backup Data button

### Browser Compatibility
Works in all modern browsers that support:
- ES6 JavaScript (`async`/`await`, fetch)
- CSS Grid and Flexbox
- localStorage API (used only as a local cache, not required for the app to function)

## How Allowance Distribution Works

Each child receives $1 per year of age weekly. The amount is distributed as follows:

1. **Base Amount**: Divided by 3 and distributed evenly across Save, Spend, Share
2. **Remainder**: Any leftover dollars are distributed using a rotating system
   - Week 1: Extra goes to Save → Spend → Share (if needed)
   - Week 2: Extra goes to Spend → Share → Save (if needed)
   - Week 3: Extra goes to Share → Save → Spend (if needed)

**Example**: A 10-year-old child receives $10/week
- Each bucket gets: $3 base
- Remainder: $1 rotates to different buckets each week

**Example**: An 11-year-old child receives $11/week
- Each bucket gets: $3 base
- Remainder: $2
  - Week 1: Save gets $4, Spend gets $4, Share gets $3
  - Week 2: Spend gets $4, Share gets $4, Save gets $3
  - Week 3: Share gets $4, Save gets $4, Spend gets $3

## Data Structure

The app's in-memory state (and the stored blob) uses the following shape -- unchanged from the original localStorage-only version:

```javascript
{
  kids: [
    {
      id: timestamp,
      name: "Child Name",
      birthday: "YYYY-MM-DD",
      age: calculated_from_birthday,
      balances: {
        save: 0.00,
        spend: 0.00,
        share: 0.00
      },
      goal: {
        name: "Goal Name",
        target: 100.00
      }
    }
  ],
  settings: {
    allowanceDay: "sunday",
    lastAllowanceDate: "ISO_timestamp",
    rotationWeek: 1-3
  },
  transactions: [
    {
      id: timestamp,
      date: "ISO_timestamp",
      kidId: id,
      kidName: "Name",
      bucket: "save|spend|share|all",
      amount: 0.00,
      description: "Description",
      type: "allowance|deduction|manual_addition|goal_completed|birthday|profile_update"
    }
  ]
}
```

## Privacy & Security

- The app is protected by a single shared family PIN (checked server-side, exchanged for a signed cookie) -- there's no meaningful reason to have separate parent/kid accounts for this app, but that also means anyone with the PIN has full access. Failed attempts are delayed but not rate limited, so use a longer PIN.
- Data lives in a private Blob store in your own Vercel account, readable only by your project's functions
- The weekly job is a private function target: it has no public URL and nothing to authenticate
- Secrets (`FAMILY_PIN`, `SESSION_SECRET`) are Vercel environment variables, never committed or shipped to the browser
- Manual export to JSON remains available for your own backups

## Contributing

This is a personal/family project. Feel free to fork and customize for your own needs!

## License

This project is open source and available for personal use.

## Support

For issues or questions, please open an issue on the GitHub repository.

---

**Built with love for teaching kids about financial responsibility** 💰🛍️❤️
