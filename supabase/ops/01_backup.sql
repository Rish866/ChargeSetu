-- =============================================================================
-- ChargeSetu — in-database backup taken BEFORE the nationwide migration.
-- Safe to run any number of times: each run creates a new schema
-- backup_YYYYMMDD_HH24MISS with a full copy of every table in `public`, plus a
-- _manifest table comparing row counts. Nothing in `public` is changed.
-- The backup schema is not exposed through the API (anon / authenticated have
-- no access). Supabase-managed `auth` users are not copied (Supabase manages them).
-- Restore one table:  insert into public.<t> select * from backup_<stamp>.<t>;
-- =============================================================================
do $$
declare
  s text := 'backup_' || to_char(clock_timestamp() at time zone 'Asia/Kolkata', 'YYYYMMDD_HH24MISS');
  t record;
  src bigint;
  dst bigint;
begin
  execute format('create schema %I', s);
  execute format('revoke all on schema %I from public', s);
  if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on schema %I from anon', s); end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on schema %I from authenticated', s); end if;
  execute format('create table %I._manifest (table_name text primary key, source_rows bigint, backup_rows bigint, taken_at timestamptz default now())', s);
  for t in select tablename from pg_tables where schemaname = 'public' order by tablename loop
    execute format('create table %I.%I as table public.%I', s, t.tablename, t.tablename);
    execute format('select count(*) from public.%I', t.tablename) into src;
    execute format('select count(*) from %I.%I', s, t.tablename) into dst;
    execute format('insert into %I._manifest (table_name, source_rows, backup_rows) values (%L, %s, %s)', s, t.tablename, src, dst);
    if src <> dst then raise exception 'Backup mismatch for %: % vs %', t.tablename, src, dst; end if;
  end loop;
  raise notice 'Backup complete in schema %', s;
end $$;

-- Show the newest backup's manifest (every row should have source_rows = backup_rows).
do $$
declare s text;
begin
  select nspname into s from pg_namespace where nspname like 'backup\_%' order by nspname desc limit 1;
  execute format('create or replace view pg_temp.latest_backup as select %L::text as backup_schema, * from %I._manifest', s, s);
end $$;
select * from pg_temp.latest_backup order by table_name;
