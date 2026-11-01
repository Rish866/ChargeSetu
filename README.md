# ChargeSetu — EV charging station finder for India (pilot)

A mobile-first web app, installable as a PWA, that helps EV drivers find existing charging stations
across India. Charge point operators (CPOs) submit and manage their own listings, and admins review
every submission before it goes live.

> **What this is not:** we don't own or install chargers, and there is **no live availability, no
> bookings and no payments.** A listing doesn't imply a partnership with the operator. The UI says
> this wherever it matters (for example, "Availability not connected").

> ⚠️ **Sample data is fictional.** Every bundled station, operator, network, phone number and price is
> made up and labelled **"Demo data"**. Coordinates point to real neighbourhoods only so the map
> looks realistic. Remove the samples before launch (see the [pilot checklist](docs/PILOT_CHECKLIST.md)).

- **Live pilot:** https://chargesetu.vercel.app
- **Before launching with real operators:** read [docs/PILOT_CHECKLIST.md](docs/PILOT_CHECKLIST.md)

---

## Features

**Drivers (no account needed)**
- **Home (`/`):** search, "Stations near me", popular areas, recently verified stations
- **Directory (`/stations`):**
  - List and map views.
  - One-tap quick filters: Verified only, CCS2, Type 2, Fast 50 kW+, 2W/3W.
  - Full filters: city, connector, power, network, verified only.
  - Filters live in the URL, so searches can be shared, and the search form works without JavaScript.
- **Station details (`/stations/[id]`):** connectors, kW, tariff, hours, amenities, contact details, photos,
  directions (Google Maps and OpenStreetMap), and freshness ("Verified 20 days ago"). Listings verified more
  than 180 days ago show a warning.
- **Prices (₹)** are shown **only for verified stations**. Unverified tariffs are clearly marked
  "Price not yet verified".
- **Report a problem (`/report`):** report wrong or outdated information.
- **Information pages:** `/about` (how verification works), `/contact` (contact and data requests),
  `/privacy` and `/terms` (drafts that need a lawyer's review).

**Operators**
- Sign-up collects the company name and a business phone, validated as an Indian number.
- `/operator` (dashboard), `/operator/stations/new`, `/operator/stations/[id]/edit`.
- Every submission **and every edit** goes back to `pending_review`. Operators can never publish or
  verify their own listings, and rejected listings show the reviewer's reason.

**Admins (`/admin`, `/admin/stations/[id]`)**
- **Pending queue:** each card shows who submitted the station, its contact details and photo links. Admins can
  approve, approve & verify, or reject with a reason.
- **Listings:** verify or remove verification, deactivate or re-publish, and edit any station.
- **Reports:** resolve or dismiss user reports.
- **Operator accounts:** a list for checking that a company is genuine before trusting it.
- **Counts:** published, verified, pending, rejected/inactive, operators, open reports.

**Accounts:** email and password sign-up with email confirmation, sign-in, sign-out, forgot password
(reset by email), and a required Terms/Privacy consent checkbox at sign-up.

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions, Cache Components) |
| Language / UI | TypeScript, Tailwind CSS v4, Lucide icons |
| Data and auth | Supabase (Postgres, Auth, Row Level Security) via `@supabase/ssr` |
| Validation | Zod v4, run on the server for every form |
| Maps | Leaflet + OpenStreetMap tiles (no API key). The list view always works. |
| Tests | Vitest (unit tests, plus database security tests in PGlite), Playwright + axe-core (browser and accessibility) |

## Quick start on your computer (demo mode)

Requires Node.js 20.9+ (22 recommended).

```bash
npm install
npm run dev            # http://localhost:3000
```

With no Supabase settings, the app uses fictional in-memory data and a **role picker** on `/login`
(driver, operator or admin). The picker works **only in local development**. On a deployed site it is
switched off unless you set `ALLOW_DEMO_ROLES=true`, so a site deployed without a database can't hand
out admin access.

## Scripts

```bash
npm run dev               # dev server
npm run build && npm start
npm run lint              # ESLint
npm run typecheck         # route types + tsc
npm test                  # unit tests + database security tests (no setup needed)
npm run check             # lint + typecheck + tests
npm run e2e               # build, start, run browser + accessibility tests (demo mode)
                          #   first time only: npx playwright install chromium
npm run smoke             # (after build) HTTP-check the main routes
npm run db:seed:generate  # regenerate supabase/seed.sql from demo-seed.ts
```

GitHub Actions (`.github/workflows/ci.yml`) runs lint, types, tests, the build and the browser tests
on every pull request. No secrets are used.

## Connecting Supabase

Already done for the live pilot. To set up a new project:

1. Create a project at supabase.com. Choose the **Mumbai (ap-south-1)** region if you want data
   hosted in India.
2. In **SQL Editor**, run each file in `supabase/migrations/` **in filename order**:
   - `20261031000000_initial_schema.sql`
   - `20261101000000_pilot_hardening.sql`
   - `20261102000000_station_leads.sql`
3. (Optional) Run `supabase/seed.sql` to load fictional demo stations.
4. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` and
   `NEXT_PUBLIC_SUPPORT_EMAIL` (see `.env.example`).
5. In **Authentication → URL Configuration**, set the Site URL and add
   `https://<your-domain>/auth/callback` as a redirect URL.
6. Make yourself admin. Sign up on the site, then run:
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

## Importing station leads (CSV)

A **lead** is a candidate station from a directory, article or operator site. Leads usually lack
data a station needs before drivers can rely on it (coordinates, hours, tariff), so they live in
the admin-only `station_leads` table, not in `stations`. Missing values stay empty and are never
guessed.

**CSV columns:** `station_name, operator, address, city, state, connector_types, power_kw,
tariff_inr_per_kwh, access_status, source_url, verification_status, notes`. Separate multiple
values with `;` (for example `CCS2; Type 2` and `60; 30`).

1. Run the `20261102000000_station_leads.sql` migration once.
2. Get the **Session pooler** connection string from Supabase (**Connect** → **Session pooler**).
   If your password contains `@`, write it as `%40`. Keep this string out of git and out of Vercel.
3. Run a dry run first. It writes nothing:
   ```bash
   DATABASE_URL='postgresql://...' npm run leads:import -- data/imports/your-file.csv
   ```
4. Then run the real import:
   ```bash
   DATABASE_URL='postgresql://...' npm run leads:import -- data/imports/your-file.csv --apply
   ```

**What the import guarantees:**
- **Safe to rerun:** rows already imported are skipped (matched on name + address).
- **Rejected rows** (missing name, address, city, state or a valid source link) are listed and not saved.
- **Every lead** is `pending_review` and `unverified`.
- **The `stations` table is never modified.** The script checks this and rolls back if it changes.

**Reviewing leads:** open **Admin → Review leads** (`/admin/leads`).
- **Review:** confirm the details with the operator or on site, then fill in the confirmed coordinates,
  area, hours and connector count. This creates a station in the normal **pending review** queue, where
  you approve it as usual.
- **Reject** or **Mark as duplicate:** for leads that aren't public or real.

## Deploying (Vercel)

1. Import the GitHub repo in Vercel.
2. Add the environment variables from `.env.example`.
3. Deploy. Vercel redeploys automatically whenever `main` changes.

Environment variable changes only take effect after a **Redeploy**.

## Security model

| Who | Can |
|---|---|
| Anyone | Read **published** stations. File an `open` report on a published station (max 5 per station per hour). |
| Customer | The same as anyone. |
| Operator | Read and edit **their own** stations. Create stations for their own company only. |
| Admin | Everything: moderate, verify, read reports and operators. Admins are promoted only in SQL. |

**Enforced in the database (RLS policies and triggers):**
- Any non-admin write is forced to `pending_review` and `unverified`.
- `operator_id`, `slug` and timestamps are locked on such writes.
- Users can change only their own `full_name`, never their role.
- Sign-up can only create `customer` or `operator` accounts.
- Photo links must be `https://`.
- Report emails are format-checked.
- Reports are rate-limited per station.

**Enforced in the app:**
- Every server action authorises the user first, and admin data is never sent to non-admins.
- All input is validated with Zod, and redirects are limited to same-site paths.
- Auth errors are generic, so the forms can't be used to find out who has an account.
- Public forms have a honeypot and a minimum fill-time check.
- Security headers are sent (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS).
- The service-role key is never used.

**Known gaps:**
- There is no Content-Security-Policy yet.
- There is no CAPTCHA on sign-up or report forms. Supabase supports hCaptcha and Turnstile under
  Authentication → Attack Protection.
- Photos are external links shown only after admin approval. There are no uploads.

Both migrations are covered by `tests/db/rls.test.ts`.

## Project structure

```
src/app/            pages, server actions (actions/), auth callback, sitemap, robots, manifest, icons
src/components/     ui/ (design system), layout/, stations/, forms/, admin/, auth/, legal/
src/lib/            validation/ (Zod), stations/ (search, moderation rules), data/ (demo + Supabase stores),
                    auth/, supabase/, i18n/ (English; add hi/mr), india.ts (phone, freshness), abuse.ts
supabase/           migrations/ (schema, RLS, triggers), seed.sql (fictional demo data)
tests/db/           database security tests      e2e/   browser tests
docs/               PILOT_CHECKLIST.md
```

## Adding Hindi or Marathi

Copy `src/lib/i18n/en.ts` to `hi.ts` or `mr.ts`, translate the values, and register the file in
`src/lib/i18n/index.ts`. Some page text (the legal pages and some labels) is still written directly in
components and would need moving into the dictionary.

## Known limitations

- No live availability, bookings or payments. These need real operator integrations, e.g. OCPI.
- Missing station pages show "Station not found" with `noindex`, but return HTTP 200, because the page
  starts streaming before the lookup finishes.
- Search and distance sorting run in app code over up to 500 rows. At national scale, move to Postgres
  full-text search and PostGIS.
- An operator's edit to a published station hides it until an admin re-approves it.
- Users can't delete their own accounts from the app. Deletion requests go to the support email and an
  admin removes the account in Supabase (**Authentication → Users**).
