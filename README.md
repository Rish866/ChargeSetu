# ChargeSetu — EV charging station finder for India (MVP)

A mobile-first web app (installable as a PWA) that helps EV drivers find existing charging
stations across India. Charge point operators (CPOs) submit and manage their own listings, and
admins review every submission before it goes live.

> **What this is not:** we don't own or install chargers, and there is no live availability, no
> bookings and no payments. The UI says so wherever it matters (e.g. "Availability not connected").
> The name "ChargeSetu" is a placeholder.

> ⚠️ **All bundled data is fictional.** Every station, operator, network, address, phone number and
> price in the demo data is made up, and each is labelled **"Demo data"** in the UI. The coordinates
> point to real neighbourhoods only so the map looks realistic. There are no real chargers there.

---

## Features

**Drivers (no account needed)**
- `/`: search, "Stations near me" (browser geolocation), popular areas, recently verified stations
- `/stations`: directory with **list/map toggle** and filters for city, connector, power and network.
  Filters live in the URL, so a search can be shared or bookmarked. The form works without JavaScript.
- `/stations/[id]`: details page (accepts an id or a slug) with connectors, kW, price, hours,
  amenities, contact, photos, verification status, last-updated date, Google Maps / OSM directions
- `/about`: how verification works and what each label means
- `/report`: report wrong or outdated info (honeypot spam guard)

**Operators**: `/operator` (dashboard), `/operator/stations/new`, `/operator/stations/[id]/edit`
- Every submission **and every edit** goes to `pending_review`. Operators can never publish or verify.
- Rejected listings show the reviewer's reason.

**Admins**: `/admin`, `/admin/stations/[id]`
- Pending queue: approve, approve & verify, or reject with a reason
- Mark verified or unverified, deactivate or re-publish, edit any station
- Review user reports (resolve or dismiss)
- Counts for stations, operators and open reports

**Prices** are in INR (₹) and are **shown to drivers only once a station is verified.**

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions, Cache Components / Partial Prerendering) |
| Language / UI | TypeScript, Tailwind CSS v4, Lucide icons |
| Data & auth | Supabase (Postgres + Auth + Row Level Security) via `@supabase/ssr` |
| Validation | Zod v4, run on the server for every submission |
| Maps | Leaflet + react-leaflet + OpenStreetMap tiles (no API key). The list view always works. |
| Tests | Vitest |

Notes on choices:
- **No service-role key.** The app only uses the public anon key. Permissions are enforced by RLS
  policies and a moderation trigger in Postgres, plus explicit role checks in every server action.
- **Map markers use Leaflet `CircleMarker`s**, so no marker image assets or bundler tweaks are needed.
  If the map script fails to load, an error boundary shows a notice and the list still renders.
- **Photos are https URLs**, not uploads. Uploads would need Supabase Storage, which is a planned step.
- **Next.js 16 Cache Components** are on (the `create-next-app` default). Every page that reads
  request data (search params, cookies, the session) renders inside `<Suspense>` with a skeleton
  fallback, so the static shell loads instantly.

## Quick start (demo mode, no setup)

Requires **Node.js 20.9+** (Node 22 recommended).

```bash
npm install
npm run dev            # http://localhost:3000
```

With no environment variables set, the app runs in **demo mode**:
- It uses an in-memory store seeded from `src/lib/data/demo-seed.ts`. Changes last until the server
  restarts and are not shared between serverless instances.
- `/login` shows a **role picker** (driver, operator or admin) so you can try every flow. This picker
  is **not secure**. It turns off automatically once Supabase is configured.
- A banner on every page says the data is fictional.

Try this: sign in as the **operator** → submit a station → sign in as the **admin** → approve and
verify it → it now appears on `/stations` with its price.

## Scripts

```bash
npm run dev               # dev server
npm run build && npm start
npm run lint              # ESLint (next/core-web-vitals + TypeScript)
npm run typecheck         # next typegen + tsc
npm test                  # Vitest unit tests
npm run check             # lint + typecheck + tests
npm run smoke             # (after build) start server and HTTP-check main routes
npm run db:seed:generate  # regenerate supabase/seed.sql from demo-seed.ts
```

## Enabling the real database and authentication (Supabase)

1. **Create a project** at [supabase.com](https://supabase.com).
2. **Run the migration.** In the dashboard, open *SQL Editor*, paste the contents of
   `supabase/migrations/20261031000000_initial_schema.sql` and run it.
   Or, with the [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase link` then `supabase db push`.
3. **(Optional) Load the demo data.** Run `supabase/seed.sql`. These rows are `source = 'demo'` and
   labelled in the UI. Remove them before launch with `delete from public.stations where source = 'demo';`.
4. **Configure env vars:** `cp .env.example .env.local`, then set `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from *Project Settings → API*) and `NEXT_PUBLIC_SITE_URL`.
5. **Auth settings:** under *Authentication → URL Configuration*, set the Site URL and add
   `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback`) as redirect URLs.
   Email/password sign-in is used, and email confirmation is supported via `/auth/callback`.
6. **Restart** `npm run dev`. The demo banner and role picker disappear, and `/login` shows real
   sign-in and sign-up.
7. **Create your first admin.** Sign up normally, then run this in the SQL editor:
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
   No one can become an admin through the app. Signup only creates `customer` or `operator` accounts.

Operators register at `/login` by choosing "A charge point operator". This creates a linked
`operators` record. They can submit stations right away, and every submission waits for admin review.

## Data model

Defined in `supabase/migrations/…_initial_schema.sql`:

- **profiles**: `id` (FK `auth.users`), `full_name`, `role` (`customer`/`operator`/`admin`), `created_at`
- **operators**: `id`, `profile_id` (unique), `company_name`, `contact_email`, `contact_phone`, `created_at`
- **stations**: `id`, `operator_id` (nullable for admin-created records), `name`, `slug` (unique),
  `network`, `address`, `area`, `city`, `state`, `country` (default India), `latitude`, `longitude`,
  `connector_types[]`, `connector_count`, `power_kw`, `price`, `price_unit`, `opening_hours`,
  `amenities[]`, `contact_phone`, `contact_email`, `photo_urls[]`, `status`
  (`pending_review`/`published`/`rejected`/`inactive`), `verification_status`
  (`unverified`/`verified`), `source` (`operator`/`admin`/`community`/`demo`), `rejection_reason`,
  `last_verified_at`, `created_at`, `updated_at`
- **reports**: `id`, `station_id`, `reporter_email` (optional), `issue_type`, `description`,
  `status` (`open`/`resolved`/`dismissed`), `created_at`

Beyond the original spec, I added `network`, `contact_email`, `photo_urls` and `rejection_reason`,
because the UI needs them.

Indexes cover status, public city/network/power lookups, connector types (GIN), operator, verified
recency and report status.

### Security (enforced in the database)

| Who | Can |
|---|---|
| Anyone | Read **published** stations. Create an `open` report for a published station. |
| Operator | Read and edit **their own** stations. Insert stations for their own company only. |
| Admin | Everything above, plus read all stations and reports, moderate, and verify. |

- The `enforce_station_moderation` trigger forces every non-admin insert or update to `pending_review`
  and `unverified`, and locks `operator_id` and `slug`. Even a hand-crafted API call can't self-publish.
- Users can update only their own `full_name` (column-level grant), never their `role`.
- The app adds its own checks on top: every server action calls `authorize([...])` before doing
  anything, and pages render an "access denied" state on the server. Admin data is never sent to
  non-admins.

## Project structure

```
src/
  app/                    routes (pages, error/not-found, manifest, auth callback)
    actions/              server actions: auth, stations (operator), admin, reports
  components/
    ui/                   design system: Button, Badge, Card, Alert, form fields, skeletons
    layout/               header, desktop + mobile bottom nav, footer, demo banner
    stations/             station card, badges, filters, Leaflet map (+ loader/fallback)
    forms/                station form, report form, auth forms
    admin/ auth/          moderation buttons, access-denied state
  lib/
    validation/           Zod schemas (station, report, filters) + tests
    stations/             search/filter/distance logic and moderation rules + tests
    data/                 DataStore interface, demo (in-memory) and Supabase implementations
    auth/                 session (demo cookie or Supabase), safe redirects
    supabase/             server client, session refresh for proxy.ts
    i18n/                 UI strings (English). Add hi.ts / mr.ts for Hindi / Marathi.
  proxy.ts                refreshes Supabase auth cookies (Next 16's renamed middleware)
supabase/
  migrations/             schema, RLS, triggers
  seed.sql                fictional demo data (generated)
```

## Adding Hindi or Marathi

UI strings live in `src/lib/i18n/en.ts`. Copy it to `hi.ts` or `mr.ts`, translate the values, and
register the new file in `src/lib/i18n/index.ts`. TypeScript will flag any missing keys. The next
step after that is locale routing (e.g. `/hi/...`) or a language switcher stored in a cookie.

## Deployment (e.g. Vercel)

1. Push to GitHub and import the repo in Vercel. The framework is detected automatically.
2. Add the env vars from `.env.example`, setting `NEXT_PUBLIC_SITE_URL` to your production URL.
3. Add `https://<your-domain>/auth/callback` to Supabase's allowed redirect URLs.
4. For production traffic, switch `NEXT_PUBLIC_MAP_TILE_URL` to a commercial tile provider. The public
   OpenStreetMap tile servers have a [usage policy](https://operations.osmfoundation.org/policies/tiles/).

Any Node.js host works too: `npm run build && npm start`.

> If you deploy **without** Supabase, the site runs in demo mode and anyone can pick the admin role.
> That is fine for a preview, but not for real use.

## Known limitations and next steps

- No live availability, bookings or payments. These need real CPO integrations, e.g. OCPI.
- Photos are URLs only. Next step: Supabase Storage uploads with moderation.
- Free-text search and distance sorting run in app code over up to 500 filtered rows. For national
  scale, move to Postgres full-text search plus PostGIS `ST_DWithin`.
- An operator's edit to a published station hides it until it is re-approved. A future version could
  keep the live version visible while changes wait for review.
- Missing stations render the not-found UI with `noindex`, but return HTTP 200. That is a trait of
  streamed (partially prerendered) routes.
- No offline service worker yet. The app is installable through its web manifest.
- Report rate limiting is just a honeypot. Add CAPTCHA or rate limits before public launch.
