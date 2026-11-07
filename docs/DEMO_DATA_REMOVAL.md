# Removing the fictional demo stations safely

The database holds **17 fictional stations** loaded from `supabase/seed.sql` (every one has
`source = 'demo'` and a name ending in "(Demo)"). They were never real, and they are the only
stations currently visible on the live site.

**Do this only when at least one real station is ready to replace them.** If you remove the demo
stations first, the public directory will be empty.

## What deleting them affects (checked against the schema)
- `reports.station_id → stations ON DELETE CASCADE`: reports filed against a demo station are deleted
  with it. The 2 sample reports in the database are against demo stations.
- `station_leads.station_id → stations ON DELETE SET NULL`: leads are never deleted; no lead is linked to a
  demo station today.
- Demo stations have no owner (`operator_id` is empty), so no operator or user account is affected.

## Option A (recommended): hide them, which is reversible
Run in the Supabase **SQL Editor**. Step 1 is read-only.

```sql
-- 1. Look first. Expect 17 rows, all with "(Demo)" in the name.
select id, name, status, source from public.stations where source = 'demo' order by name;
-- Click "Export" > CSV on this result to keep a backup.

-- 2. Hide them from drivers (they stay in the database).
update public.stations set status = 'inactive' where source = 'demo' and status = 'published';
```

To bring them back: change `'inactive'` / `'published'` the other way round.

## Option B: delete them permanently
Only after taking the CSV backup in Option A, step 1. This stops with an error if anything looks wrong.

```sql
do $$
declare n integer;
begin
  select count(*) into n from public.stations where source = 'demo';
  if n <> 17 then raise exception 'Expected 17 demo stations, found %. Nothing was deleted.', n; end if;
  if exists (select 1 from public.stations where source = 'demo' and operator_id is not null) then
    raise exception 'A demo station has an owner. Nothing was deleted.';
  end if;
  delete from public.stations where source = 'demo';
end;
$$;
```

Afterwards, `select count(*) from public.stations where source = 'demo';` should return 0, and your real
stations and the 44 leads are untouched.
