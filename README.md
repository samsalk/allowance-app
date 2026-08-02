# Save, Spend, Share - Family Allowance Tracker

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
- Local storage with automatic backup
- Data corruption recovery system
- Manual backup/export to JSON
- Transaction history with search and filters

## Getting Started

This app is hosted: a static frontend (this repo, served as-is, no build step) talking to a [Supabase](https://supabase.com) project for storage and auth, with a scheduled GitHub Action applying weekly allowance so it doesn't depend on anyone opening the app on the right day.

### One-time setup

1. **Create a Supabase project** (free tier is fine) at supabase.com.
2. **Run the schema**: paste `supabase/migrations/0001_family_data.sql` into the Supabase SQL editor and run it. This creates the single `family_data` table (holding the whole app's state as one JSON document) with Row Level Security restricted to authenticated requests only.
3. **Create the shared family login**: in the Supabase dashboard, Authentication → Users → Add user. Use any email (doesn't need to be real/reachable) and a 6-8 character password -- that password *is* the family PIN everyone uses to unlock the app.
4. **Fill in `config.js`** with your project's URL and anon public key (Project Settings → API), and the email from step 3.
5. **Migrate existing data**, if coming from an older localStorage-based copy of this app: use that copy's "Backup Data" button to export a JSON file, then run `python3 scripts/generate-migration-sql.py <the-backup-file>.json` and paste the printed SQL into the Supabase SQL editor. Starting fresh instead? Skip this -- the setup wizard in-app handles it.
6. **Deploy the frontend**: connect this repo to Cloudflare Pages or Netlify for auto-deploy on push -- no build command needed, it's served as static files.
7. **Set up the weekly allowance job**: add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API -- keep this one secret, unlike the anon key) as GitHub Actions repo secrets, so `.github/workflows/weekly-allowance.yml` can run. Trigger it once manually (Actions tab → Weekly Allowance → Run workflow) to confirm it works before trusting the schedule.

### Local development

Serve the repo root with any static file server (e.g. `python3 -m http.server`) and open it at `http://localhost:<port>` -- not as a `file://` path, since Supabase auth needs a real origin. Point `config.js` at a Supabase project (a separate test project is recommended over your real family data while developing).

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
- TailwindCSS for styling (CDN)
- [Supabase](https://supabase.com) (Postgres + Auth) via `@supabase/supabase-js` (CDN) for storage and the shared login
- A GitHub Actions scheduled workflow for reliably applying weekly allowance server-side

### Data Storage
- All app state (`kids`, `settings`, `transactions`) lives as a single JSON document in one row of a `family_data` table in Postgres -- see `supabase/migrations/0001_family_data.sql`
- Row Level Security requires a real authenticated session for any read or write; the frontend's anon key alone cannot access the data
- Saves use optimistic concurrency (a `version` column): if two devices save near-simultaneously, the second one is told to reload and retry rather than silently overwriting the first
- A read-only copy is cached in the browser's `localStorage` for instant paint on load, but Supabase is always the source of truth
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

The app's in-memory state (and the `data` column of the `family_data` table in Supabase) uses the following shape -- unchanged from the original localStorage-only version:

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

- The app is protected by a single shared family login (a PIN, which is really the password for one shared Supabase Auth account) -- there's no meaningful reason to have separate parent/kid accounts for this app, but that also means anyone with the PIN has full access
- Data lives in your own Supabase project's Postgres database, not a third-party service you don't control
- Row Level Security rejects any request without a valid session, so the frontend's publicly-visible anon key cannot be used to read or write data on its own
- The Supabase `service_role` key (full access, bypasses the above) is used only by the local migration script and the GitHub Actions weekly-allowance job, via a repo secret -- it's never shipped to the browser or committed to the repo
- Manual export to JSON remains available for your own backups

## Contributing

This is a personal/family project. Feel free to fork and customize for your own needs!

## License

This project is open source and available for personal use.

## Support

For issues or questions, please open an issue on the GitHub repository.

---

**Built with love for teaching kids about financial responsibility** 💰🛍️❤️
