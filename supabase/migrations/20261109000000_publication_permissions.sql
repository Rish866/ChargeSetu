-- =============================================================================
-- ChargeSetu — per-source publication permissions + OpenStreetMap publishing
--
--  1. source_publication_permissions: whether stations from a data source may be
--     public, and the legal basis. Enforced by a trigger on every insert/update,
--     so not even an admin can publish BEE-derived stations until permission is
--     recorded here. OSM is allowed (ODbL 1.0, attribution + share-alike).
--  2. stations.source_notes: facts quoted from the source (access, fee, …).
--  3. Import / bulk-status functions accept the trusted operations context
--     (direct database connection used by the "Production database" GitHub
--     workflow) as well as signed-in admins, take opening hours and source notes,
--     and respect the permissions table.
-- Idempotent and additive: safe to run more than once. Nothing is deleted.
-- =============================================================================

create table if not exists public.source_publication_permissions (
  source          text primary key check (char_length(source) <= 40),
  publish_allowed boolean not null,
  basis           text not null check (char_length(basis) between 5 and 500),
  updated_at      timestamptz not null default now()
);
alter table public.source_publication_permissions enable row level security;
drop policy if exists "source_publication_permissions: public read" on public.source_publication_permissions;
create policy "source_publication_permissions: public read" on public.source_publication_permissions
  for select to anon, authenticated using (true);
revoke insert, update, delete on public.source_publication_permissions from anon, authenticated;
grant select on public.source_publication_permissions to anon, authenticated;

insert into public.source_publication_permissions (source, publish_allowed, basis) values
  ('bee', false, 'BEE has published no reuse licence for its station list. Blocked until written permission from BEE is obtained and recorded here.'),
  ('osm', true,  'OpenStreetMap data, ODbL 1.0: attribution shown on every station page; the derived database is offered under ODbL (data/osm in the public repository).')
on conflict (source) do nothing;

alter table public.stations add column if not exists source_notes text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stations_source_notes_len') then
    alter table public.stations add constraint stations_source_notes_len check (source_notes is null or char_length(source_notes) <= 500);
  end if;
end $$;

-- Trusted operations context: a direct database connection as the database owner
-- (never an API request from the website, which always runs as anon/authenticated).
create or replace function public.is_ops_context()
returns boolean language sql stable set search_path = ''
as $$ select not public.is_end_user_request() and current_user in ('postgres', 'supabase_admin') $$;
-- Callable by everyone (the import functions run as the caller); it simply returns false for API users.
grant execute on function public.is_ops_context() to anon, authenticated;

create or replace function public.source_publish_allowed(p_source text)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select p.publish_allowed from public.source_publication_permissions p where p.source = p_source), true) $$;
grant execute on function public.source_publish_allowed(text) to anon, authenticated;

create or replace function public.enforce_source_publication()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and not public.source_publish_allowed(new.source::text) then
    raise exception 'Publishing % stations is not permitted: %', new.source,
      (select p.basis from public.source_publication_permissions p where p.source = new.source::text)
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists stations_enforce_source_publication on public.stations;
create trigger stations_enforce_source_publication before insert or update of status on public.stations
  for each row execute function public.enforce_source_publication();

-- ---------- import (admin UI or operations workflow) -------------------------
create or replace function public.import_stations_batch(p_rows jsonb, p_publish boolean, p_batch uuid)
returns table (inserted integer, skipped integer)
language plpgsql security invoker set search_path = ''
as $$
declare total integer; ins integer;
begin
  if not (public.is_admin() or public.is_ops_context()) then
    raise exception 'Only admins can import stations' using errcode = '42501';
  end if;
  total := jsonb_array_length(p_rows);
  if total > 1000 then raise exception 'Batch too large (max 1000 rows)' using errcode = '22023'; end if;

  with src as (
    select * from jsonb_to_recordset(p_rows) as x(
      source text, external_id text, name text, slug text, network text, address text, city text, district text, state text,
      latitude double precision, longitude double precision, connector_types text[], connector_count integer, power_kw numeric,
      vehicle_classes text[], opening_hours text, source_notes text, source_url text, source_attribution text, source_data_as_of date,
      last_evidence_check timestamptz, location_quality text, name_is_derived boolean, data_quality_score integer,
      merged_source_ids text[], eligibility text, points jsonb)
  ), new_stations as (
    insert into public.stations (
      operator_id, name, slug, network, address, area, city, district, state, latitude, longitude, connector_types, connector_count,
      power_kw, price, price_unit, opening_hours, amenities, status, verification_status, source, external_id, vehicle_classes,
      source_url, source_attribution, source_data_as_of, last_evidence_check, location_quality, name_is_derived, data_quality_score,
      merged_source_ids, import_batch_id, source_notes)
    select null, left(x.name, 120), x.slug, left(x.network, 80), x.address, null, x.city, x.district, x.state, x.latitude, x.longitude,
      coalesce(x.connector_types, '{}'), x.connector_count, x.power_kw, null, 'per_kwh', left(x.opening_hours, 120), '{}',
      case when p_publish and x.eligibility = 'B' and x.location_quality = 'ok' and public.source_publish_allowed(x.source)
           then 'published'::public.station_status else 'inactive'::public.station_status end,
      'unverified', x.source::public.station_source, x.external_id, coalesce(x.vehicle_classes, '{}'),
      x.source_url, x.source_attribution, x.source_data_as_of, x.last_evidence_check, x.location_quality, coalesce(x.name_is_derived, false),
      x.data_quality_score, coalesce(x.merged_source_ids, '{}'), p_batch, left(x.source_notes, 500)
    from src x
    on conflict (source, external_id) do nothing
    returning id, source::text as source, external_id
  ), pts as (
    insert into public.charging_points (station_id, standard, current, power_kw, connector_count, vehicle_classes)
    select n.id, p.standard, p.current, p.power_kw, p.connector_count, coalesce(p.vehicle_classes, '{}')
    from new_stations n join src x on x.source = n.source and x.external_id = n.external_id
    cross join lateral jsonb_to_recordset(coalesce(x.points, '[]'::jsonb)) as p(standard text, current text, power_kw numeric, connector_count integer, vehicle_classes text[])
    on conflict do nothing
    returning 1
  ), provenance as (
    insert into public.station_sources (station_id, source, source_record_id, source_url, data_as_of, import_batch_id)
    select n.id, n.source, n.external_id, x.source_url, x.source_data_as_of, p_batch
    from new_stations n join src x on x.source = n.source and x.external_id = n.external_id
    on conflict (source, source_record_id) do nothing
    returning 1
  ), merged as (
    insert into public.station_sources (station_id, source, source_record_id, source_url, data_as_of, import_batch_id, is_merged_record)
    select n.id, n.source, m.mid, x.source_url, x.source_data_as_of, p_batch, true
    from new_stations n join src x on x.source = n.source and x.external_id = n.external_id
    cross join lateral unnest(coalesce(x.merged_source_ids, '{}')) as m(mid)
    on conflict (source, source_record_id) do nothing
    returning 1
  )
  select count(*)::integer into ins from new_stations;

  return query select ins, total - ins;
end;
$$;
revoke execute on function public.import_stations_batch(jsonb, boolean, uuid) from public, anon;
grant execute on function public.import_stations_batch(jsonb, boolean, uuid) to authenticated;

-- ---------- bulk publish / hide ---------------------------------------------
create or replace function public.admin_bulk_set_status(
  p_source text, p_state text, p_from public.station_status, p_to public.station_status, p_limit integer default 2000)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare n integer;
begin
  if not (public.is_admin() or public.is_ops_context()) then
    raise exception 'Only admins can change station status in bulk' using errcode = '42501';
  end if;
  if p_to = 'published' and p_from <> 'inactive' then
    raise exception 'Only hidden (inactive) stations can be bulk-published' using errcode = '22023';
  end if;
  if p_to not in ('published', 'inactive') then
    raise exception 'Bulk status must be published or inactive' using errcode = '22023';
  end if;
  if p_to = 'published' and not public.source_publish_allowed(p_source) then
    raise exception 'Publishing % stations is not permitted: %', p_source,
      (select p.basis from public.source_publication_permissions p where p.source = p_source) using errcode = '42501';
  end if;
  with chunk as (
    select s.id from public.stations s
    where s.source::text = p_source and s.status = p_from
      and (p_state is null or s.state = p_state)
      and (p_to <> 'published' or s.location_quality = 'ok')
    order by s.id limit least(greatest(p_limit, 1), 5000)
  )
  update public.stations s set status = p_to from chunk where s.id = chunk.id;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.admin_bulk_set_status(text, text, public.station_status, public.station_status, integer) from public, anon;
grant execute on function public.admin_bulk_set_status(text, text, public.station_status, public.station_status, integer) to authenticated;
