# Deploying the nationwide database changes (no passwords in chat)

There are two safe ways. **Never paste the database password or connection string into chat, an issue, a PR or a commit.**

## Option A — GitHub Actions (recommended, most automated)

The password lives only in an encrypted GitHub secret. The workflow `.github/workflows/db-deploy.yml` reads it, never prints it, and GitHub masks it in logs.

1. **Copy the connection string from Supabase**
   Supabase → your project → **Connect** (top bar) → **Connection string** → choose **Session pooler** → copy the URI.
   It looks like `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`.
   Replace `[YOUR-PASSWORD]` with your **new** database password. (Use the *pooler* string: GitHub's servers can't reach the direct `db.<ref>.supabase.co` address.)
2. **Store it as a secret**
   GitHub → `Rish866/ChargeSetu` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
   Name: `SUPABASE_DB_URL`. Value: the string from step 1. → **Add secret**.
3. *(Optional but recommended)* **Settings → Environments → production → Required reviewers → yourself.** Every database run then waits for your click.
4. The workflow can be started only after PR #6 is merged (GitHub only runs manual workflows from `main`). Then:
   **Actions → Production database → Run workflow**:
   * `check` — read-only: confirms the connection works and shows whether the migration is applied.
   * `migrate` with confirm text `APPLY NATIONWIDE MIGRATION` — takes a verified backup, applies the migration in a single transaction (rolled back automatically on any error), then runs 22 safety checks.
   Or tell Kiro "the secret is added" and it can start the run and read the result for you.

## Option B — Supabase SQL Editor (no secret needed)

Supabase → **SQL Editor** → **New query**, then run these files from the repository in order and check the result after each one:

1. `supabase/ops/01_backup.sql` → the result table lists every table; `source_rows` must equal `backup_rows` on every row.
2. `supabase/migrations/20261108000000_nationwide_expansion.sql` → "Success. No rows returned".
3. `supabase/ops/02_verify.sql` → every row must show `ok = true`.

## Backups

* `01_backup.sql` copies every `public` table into a new schema `backup_YYYYMMDD_HHMMSS` (India time) inside the same database, with a `_manifest` of row counts. It is not reachable through the website's API.
* Restore a table if ever needed: `insert into public.<table> select * from backup_<stamp>.<table>;` (or ask Kiro).
* The migration only **adds** things — no table, column or row is deleted — and the app works both before and after it (it falls back to the old behaviour when the new functions are missing), so code and database can be deployed in either order.
* Supabase's own platform backups depend on your plan; the in-database copy above does not.

## Was the old password really retired?

Supabase → **Project Settings → Database → Reset database password** replaces it immediately. After you add the new secret, the `check` run proves the new one works. Kiro does not hold and will not test the old password again.
