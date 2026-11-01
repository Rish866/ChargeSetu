# ChargeSetu — pre-launch checklist for the first operator pilot

Tick each item before inviting a real charge point operator. Items marked **⚖️** need advice from a
qualified Indian lawyer or CA. Nothing in this repository is legal advice or a compliance
certification.

## 1. Accounts and access
- [ ] **Reset the Supabase database password** if it has ever been shared, e.g. in a chat:
      Project Settings → Database → Reset database password. The app doesn't use this password.
- [ ] Remove any temporary test accounts: Authentication → Users, search for `example.com`.
- [ ] Confirm that only the people who should be admins are, by running this in the SQL Editor:
      `select u.email from auth.users u join public.profiles p on p.id = u.id where p.role = 'admin';`
- [ ] Turn on two-factor authentication for your Supabase, Vercel and GitHub accounts.
- [ ] Optional, recommended before a public launch: enable a CAPTCHA (Supabase → Authentication →
      Attack Protection) to slow down fake sign-ups.

## 2. Data
- [ ] **Remove the fictional demo stations** (SQL Editor):
      `delete from public.stations where source = 'demo';`
- [ ] Add your real stations. Mark each one **Verified** only after you've confirmed it with the
      operator or on site.
- [ ] Decide how often listings are re-checked. The site warns drivers once a verification is more
      than 180 days old.
- [ ] Backups: check what your Supabase plan includes (Database → Backups). Free projects have limited
      or no downloadable backups. Before relying on real data, upgrade or export regularly (Database →
      Backups, or `pg_dump` with the database connection string).
- [ ] Write down how to restore: who does it, from which backup, and how long it may take.

## 3. Operator onboarding (manual process for the pilot)
- [ ] Before approving an operator's first station, confirm the company is real. Check the **Operator
      accounts** list in Admin and call the number on the company's own website, not only the
      number they typed.
- [ ] Check each submission: the pin matches the address (use the coordinates link), connector types
      and kW match the charger, and any photo links show this charger.
- [ ] Only use **Approve & verify** after you have independently confirmed the details, including the
      tariff. Otherwise use **Approve** (the price then stays hidden from drivers).
- [ ] Agree in writing with each pilot operator what you will show and how they report changes. ⚖️

## 4. Legal and privacy ⚖️
- [ ] Have a lawyer review and complete `/privacy` and `/terms` (legal entity name, address, retention
      periods, grievance officer, liability, jurisdiction). Consider the Digital Personal Data
      Protection Act, 2023 and the IT Act, 2000 and its rules.
- [ ] Ask whether hosting data outside India is acceptable for you. The current Supabase project is in
      London (eu-west-2) and Vercel serves globally.
- [ ] Decide who handles data correction and deletion requests, and how quickly.
- [ ] Ask a CA whether GST or other registrations apply to your business model.

## 5. Configuration (Vercel → Settings → Environment Variables, then Redeploy)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.
- [ ] `NEXT_PUBLIC_SITE_URL` is set to your live address, e.g. `https://chargesetu.vercel.app`.
- [ ] `NEXT_PUBLIC_SUPPORT_EMAIL` is set to an inbox someone checks.
- [ ] `ALLOW_DEMO_ROLES` is **not** set in Production.
- [ ] Map tiles: for more than light pilot traffic, create an account with a tile provider (MapTiler,
      Stadia Maps, Thunderforest…) and set `NEXT_PUBLIC_MAP_TILE_URL` and
      `NEXT_PUBLIC_MAP_ATTRIBUTION`. Restrict the key to your domain in the provider's dashboard.
- [ ] Supabase → Authentication → URL Configuration: the Site URL is your live address, and
      `https://<your-domain>/auth/callback` is in Redirect URLs.
- [ ] Email: Supabase's built-in email only sends a few messages per hour. For real users, set up
      custom SMTP (Authentication → Emails → SMTP settings) with a provider such as Resend, Brevo or
      Amazon SES.
- [ ] Optional: use your own domain (Vercel → Settings → Domains), then update `NEXT_PUBLIC_SITE_URL`
      and the Supabase URLs.

## 6. Final checks on the live site
- [ ] Sign up as a test operator with a real email you own, confirm the email, submit a station,
      approve it as admin, and see it appear publicly. Then delete the test account.
- [ ] Use "Forgot your password?" once to make sure reset emails arrive.
- [ ] Send a test report and resolve it.
- [ ] Open the site on a low-end Android phone over mobile data.
- [ ] GitHub → Actions: the latest CI run is green.
