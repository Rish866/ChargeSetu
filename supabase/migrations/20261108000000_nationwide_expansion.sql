-- =============================================================================
-- ChargeSetu — nationwide expansion (additive; safe on an existing database)
--
--  1. Honest unknowns: power, connector count, hours and area may be NULL, and a
--     station may list no connector types. (Source lists such as BEE's do not
--     publish hours or tariffs; the product must not invent them.)
--  2. Provenance and freshness columns on stations (source, id, attribution, dates).
--  3. charging_points (per-connector detail), station_sources, import_batches,
--     station_claims — all with Row Level Security.
--  4. Indexes for state / vehicle / map-bounding-box queries at 30k+ stations.
--  5. Server-side search functions: nearby, map clusters, state stats, operators.
--  6. Atomic, idempotent bulk import function (admin only).
--
-- Existing rows, policies and triggers are preserved. Nothing is deleted.
-- =============================================================================

-- ---------- 0. Robustness: a reused connection may hold an EMPTY request setting
-- (not NULL); casting '' to jsonb would then fail. Treat empty as "no request".
create or replace function public.is_end_user_request()
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') in ('anon', 'authenticated');
$$;

-- ---------- 1. Allow honest unknowns ---------------------------------------
alter type public.station_source add value if not exists 'bee';
alter type public.station_source add value if not exists 'osm';

alter table public.stations alter column area drop not null;
alter table public.stations alter column connector_count drop not null;
alter table public.stations alter column power_kw drop not null;
alter table public.stations alter column opening_hours drop not null;

-- Replace the inline CHECKs that assumed complete operator-submitted data.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.stations'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%cardinality(connector_types)%'
        or pg_get_constraintdef(oid) ilike '%char_length(address)%'
        or pg_get_constraintdef(oid) ilike '%connector_count%'
        or pg_get_constraintdef(oid) ilike '%power_kw%')
  loop
    execute format('alter table public.stations drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.stations
  add constraint stations_address_len check (char_length(address) between 2 and 300),
  add constraint stations_connector_count_range check (connector_count is null or connector_count between 1 and 1000),
  add constraint stations_power_range check (power_kw is null or power_kw between 0.5 and 1000);

-- ---------- 2. Provenance, freshness, quality ------------------------------
alter table public.stations
  add column if not exists district text check (char_length(district) <= 100),
  add column if not exists external_id text check (char_length(external_id) <= 100),
  add column if not exists vehicle_classes text[] not null default '{}',
  add column if not exists source_url text check (source_url is null or source_url ~ '^https?://[^[:space:]]+$'),
  add column if not exists source_attribution text check (char_length(source_attribution) <= 600),
  add column if not exists source_data_as_of date,
  add column if not exists last_evidence_check timestamptz,
  add column if not exists location_quality text not null default 'ok' check (location_quality in ('ok', 'suspect')),
  add column if not exists name_is_derived boolean not null default false,
  add column if not exists data_quality_score smallint check (data_quality_score between 0 and 100),
  add column if not exists import_batch_id uuid,
  add column if not exists merged_source_ids text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stations_source_external_key') then
    alter table public.stations add constraint stations_source_external_key unique (source, external_id);
  end if;
  -- Hard guarantee: a station with suspect coordinates can never be public.
  if not exists (select 1 from pg_constraint where conname = 'stations_suspect_never_published') then
    alter table public.stations add constraint stations_suspect_never_published
      check (not (status = 'published' and location_quality = 'suspect'));
  end if;
end;
$$;

-- ---------- 3. New tables --------------------------------------------------
create table if not exists public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (char_length(source) <= 40),
  label       text not null check (char_length(label) <= 200),
  status      text not null default 'running' check (status in ('running', 'completed', 'failed')),
  total       integer not null default 0,
  inserted    integer not null default 0,
  skipped     integer not null default 0,
  failed      integer not null default 0,
  publish_as  text not null default 'inactive' check (publish_as in ('inactive', 'published')),
  notes       text check (char_length(notes) <= 1000),
  created_by  uuid references public.profiles (id) on delete set null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.charging_points (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid not null references public.stations (id) on delete cascade,
  standard        text not null check (standard in ('ccs2', 'chademo', 'type2', 'gbt', 'bharat_ac001', 'bharat_dc001', 'type7_lecct', '15a_socket', 'lev_ac', 'lev_dc')),
  current         text not null check (current in ('AC', 'DC')),
  power_kw        numeric(6, 1) check (power_kw is null or power_kw between 0.1 and 1000),
  connector_count integer not null check (connector_count between 1 and 5000),
  vehicle_classes text[] not null default '{}'
);
create unique index if not exists charging_points_unique on public.charging_points (station_id, standard, coalesce(power_kw, -1));

create table if not exists public.station_sources (
  id               uuid primary key default gen_random_uuid(),
  station_id       uuid not null references public.stations (id) on delete cascade,
  source           text not null,
  source_record_id text not null,
  source_url       text,
  data_as_of       date,
  retrieved_at     timestamptz not null default now(),
  import_batch_id  uuid references public.import_batches (id) on delete set null,
  is_merged_record boolean not null default false,
  unique (source, source_record_id)
);
create index if not exists station_sources_station_idx on public.station_sources (station_id);

create table if not exists public.station_claims (
  id            uuid primary key default gen_random_uuid(),
  station_id    uuid not null references public.stations (id) on delete cascade,
  claimant_id   uuid not null references public.profiles (id) on delete cascade,
  company_name  text not null check (char_length(company_name) between 2 and 120),
  contact_email text not null check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 200),
  contact_phone text check (char_length(contact_phone) <= 25),
  evidence      text not null check (char_length(evidence) between 10 and 1500),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note   text check (char_length(review_note) <= 500),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);
create unique index if not exists station_claims_one_pending on public.station_claims (station_id, claimant_id) where status = 'pending';
create index if not exists station_claims_status_idx on public.station_claims (status, created_at desc);

-- Limit abuse: at most 10 pending claims per person.
create or replace function public.limit_pending_claims()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.station_claims c where c.claimant_id = new.claimant_id and c.status = 'pending') >= 10 then
    raise exception 'Too many pending claims. Please wait for a review.' using errcode = 'P0001';
  end if;
  new.status := 'pending'; new.created_at := now(); new.reviewed_at := null; new.review_note := null;
  return new;
end;
$$;
drop trigger if exists station_claims_limit on public.station_claims;
create trigger station_claims_limit before insert on public.station_claims
  for each row execute function public.limit_pending_claims();

-- ---------- RLS for the new tables ----------------------------------------
alter table public.import_batches enable row level security;
alter table public.charging_points enable row level security;
alter table public.station_sources enable row level security;
alter table public.station_claims enable row level security;

drop policy if exists "import_batches: admins" on public.import_batches;
create policy "import_batches: admins" on public.import_batches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "charging_points: read published" on public.charging_points;
create policy "charging_points: read published" on public.charging_points for select to anon, authenticated
  using (exists (select 1 from public.stations s where s.id = station_id and s.status = 'published'));
drop policy if exists "charging_points: admins read all" on public.charging_points;
create policy "charging_points: admins read all" on public.charging_points for select to authenticated using (public.is_admin());
drop policy if exists "charging_points: admins write" on public.charging_points;
create policy "charging_points: admins write" on public.charging_points for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "station_sources: admins" on public.station_sources;
create policy "station_sources: admins" on public.station_sources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "station_claims: own or admin read" on public.station_claims;
create policy "station_claims: own or admin read" on public.station_claims for select to authenticated
  using (claimant_id = (select auth.uid()) or public.is_admin());
drop policy if exists "station_claims: operators insert own" on public.station_claims;
create policy "station_claims: operators insert own" on public.station_claims for insert to authenticated
  with check (
    claimant_id = (select auth.uid())
    and public.current_operator_id() is not null
    and exists (select 1 from public.stations s where s.id = station_id and s.status = 'published')
  );
drop policy if exists "station_claims: admins update" on public.station_claims;
create policy "station_claims: admins update" on public.station_claims for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.import_batches, public.station_sources, public.station_claims from anon;
revoke all on public.charging_points from anon;
grant select on public.charging_points to anon;

-- ---------- 4. Indexes ------------------------------------------------------
create index if not exists stations_pub_state_idx on public.stations (state) where status = 'published';
create index if not exists stations_pub_geo_idx on public.stations (latitude, longitude) where status = 'published';
create index if not exists stations_pub_vehicle_idx on public.stations using gin (vehicle_classes) where status = 'published';
create index if not exists stations_source_status_idx on public.stations (source, status);
create index if not exists stations_state_status_idx on public.stations (state, status);
create index if not exists stations_pub_power_idx2 on public.stations (power_kw) where status = 'published' and power_kw is not null;

-- ---------- 5. Search functions (security invoker: RLS applies) -------------
-- Shared vocabulary of current types per connector id.
create or replace function public.ac_connectors() returns text[] language sql immutable set search_path = ''
  as $$ select array['type2', 'bharat_ac001', '15a_socket', 'lev_ac'] $$;
create or replace function public.dc_connectors() returns text[] language sql immutable set search_path = ''
  as $$ select array['ccs2', 'chademo', 'gbt', 'bharat_dc001', 'type7_lecct', 'lev_dc'] $$;

create or replace function public.stations_nearby(
  p_lat double precision, p_lng double precision, p_radius_km double precision default 50,
  p_limit integer default 24, p_offset integer default 0,
  p_state text default null, p_vehicle text default null, p_current text default null, p_connector text default null,
  p_min_power numeric default null, p_network text default null, p_verified boolean default false, p_q text default null
)
returns table (id uuid, distance_km double precision, total_count bigint)
language sql stable security invoker set search_path = ''
as $$
  with box as (
    select p_lat - (p_radius_km / 111.0) as lat_min, p_lat + (p_radius_km / 111.0) as lat_max,
           p_lng - (p_radius_km / (111.0 * greatest(cos(radians(p_lat)), 0.01))) as lng_min,
           p_lng + (p_radius_km / (111.0 * greatest(cos(radians(p_lat)), 0.01))) as lng_max
  ), cand as (
    select s.id,
      2 * 6371 * asin(least(1, sqrt(
        power(sin(radians(s.latitude - p_lat) / 2), 2) +
        cos(radians(p_lat)) * cos(radians(s.latitude)) * power(sin(radians(s.longitude - p_lng) / 2), 2)))) as d
    from public.stations s, box
    where s.status = 'published' and s.location_quality = 'ok'
      and s.latitude between box.lat_min and box.lat_max and s.longitude between box.lng_min and box.lng_max
      and (p_state is null or s.state = p_state)
      and (p_vehicle is null or s.vehicle_classes @> array[p_vehicle])
      and (p_current is null or s.connector_types && (case when p_current = 'DC' then public.dc_connectors() else public.ac_connectors() end))
      and (p_connector is null or s.connector_types @> array[p_connector])
      and (p_min_power is null or s.power_kw >= p_min_power)
      and (p_network is null or lower(s.network) = lower(p_network))
      and (not p_verified or s.verification_status = 'verified')
      and (p_q is null or s.name ilike '%' || p_q || '%' or s.address ilike '%' || p_q || '%' or s.city ilike '%' || p_q || '%' or s.network ilike '%' || p_q || '%')
  ), within as (select * from cand where d <= p_radius_km)
  select w.id, w.d, count(*) over () from within w order by w.d, w.id limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;

create or replace function public.station_map_points(
  p_min_lat double precision, p_min_lng double precision, p_max_lat double precision, p_max_lng double precision, p_zoom integer,
  p_state text default null, p_vehicle text default null, p_current text default null, p_connector text default null,
  p_min_power numeric default null, p_network text default null, p_verified boolean default false, p_q text default null
)
returns table (kind text, lat double precision, lng double precision, n bigint, id uuid, slug text, name text, power_kw numeric, verified boolean, vehicle_classes text[])
language sql stable security invoker set search_path = ''
as $$
  with params as (select greatest(180.0 / power(2, least(greatest(p_zoom, 3), 18) + 1), 0.0005) as g),
  f as (
    select s.*, floor(s.latitude / params.g) as ci, floor(s.longitude / params.g) as cj
    from public.stations s, params
    where s.status = 'published' and s.location_quality = 'ok'
      and s.latitude between p_min_lat and p_max_lat and s.longitude between p_min_lng and p_max_lng
      and (p_state is null or s.state = p_state)
      and (p_vehicle is null or s.vehicle_classes @> array[p_vehicle])
      and (p_current is null or s.connector_types && (case when p_current = 'DC' then public.dc_connectors() else public.ac_connectors() end))
      and (p_connector is null or s.connector_types @> array[p_connector])
      and (p_min_power is null or s.power_kw >= p_min_power)
      and (p_network is null or lower(s.network) = lower(p_network))
      and (not p_verified or s.verification_status = 'verified')
      and (p_q is null or s.name ilike '%' || p_q || '%' or s.address ilike '%' || p_q || '%' or s.city ilike '%' || p_q || '%' or s.network ilike '%' || p_q || '%')
  ), cells as (
    select ci, cj, count(*) as cnt, avg(latitude) as clat, avg(longitude) as clng, (array_agg(f.id order by f.id))[1] as one_id from f group by ci, cj
  )
  select case when c.cnt = 1 then 'station' else 'cluster' end, case when c.cnt = 1 then s.latitude else c.clat end,
         case when c.cnt = 1 then s.longitude else c.clng end, c.cnt,
         case when c.cnt = 1 then s.id end, case when c.cnt = 1 then s.slug end, case when c.cnt = 1 then s.name end,
         case when c.cnt = 1 then s.power_kw end, case when c.cnt = 1 then s.verification_status = 'verified' end,
         case when c.cnt = 1 then s.vehicle_classes end
  from cells c left join public.stations s on s.id = c.one_id and c.cnt = 1
  order by c.cnt desc limit 800
$$;

create or replace function public.state_stats()
returns table (state text, total bigint, published bigint, hidden bigint, pending bigint, verified bigint, source_listed bigint, suspect bigint)
language sql stable security invoker set search_path = ''
as $$
  select s.state, count(*), count(*) filter (where s.status = 'published'), count(*) filter (where s.status in ('inactive', 'rejected')),
         count(*) filter (where s.status = 'pending_review'), count(*) filter (where s.status = 'published' and s.verification_status = 'verified'),
         count(*) filter (where s.source::text in ('bee', 'osm')), count(*) filter (where s.location_quality = 'suspect')
  from public.stations s group by s.state order by s.state
$$;

create or replace function public.operator_counts()
returns table (network text, stations bigint)
language sql stable security invoker set search_path = ''
as $$
  select s.network, count(*) from public.stations s where s.status = 'published' group by s.network order by count(*) desc, s.network
$$;

-- ---------- 6. Atomic, idempotent bulk import (admin only) -------------------
-- Rows already imported (same source + external_id) are skipped, never overwritten.
create or replace function public.import_stations_batch(p_rows jsonb, p_publish boolean, p_batch uuid)
returns table (inserted integer, skipped integer)
language plpgsql security invoker set search_path = ''
as $$
declare total integer; ins integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can import stations' using errcode = '42501';
  end if;
  total := jsonb_array_length(p_rows);
  if total > 1000 then raise exception 'Batch too large (max 1000 rows)' using errcode = '22023'; end if;

  with src as (
    select * from jsonb_to_recordset(p_rows) as x(
      source text, external_id text, name text, slug text, network text, address text, city text, district text, state text,
      latitude double precision, longitude double precision, connector_types text[], connector_count integer, power_kw numeric,
      vehicle_classes text[], source_url text, source_attribution text, source_data_as_of date, last_evidence_check timestamptz,
      location_quality text, name_is_derived boolean, data_quality_score integer, merged_source_ids text[], eligibility text, points jsonb)
  ), new_stations as (
    insert into public.stations (
      operator_id, name, slug, network, address, area, city, district, state, latitude, longitude, connector_types, connector_count,
      power_kw, price, price_unit, opening_hours, amenities, status, verification_status, source, external_id, vehicle_classes,
      source_url, source_attribution, source_data_as_of, last_evidence_check, location_quality, name_is_derived, data_quality_score,
      merged_source_ids, import_batch_id)
    select null, left(x.name, 120), x.slug, left(x.network, 80), x.address, null, x.city, x.district, x.state, x.latitude, x.longitude,
      coalesce(x.connector_types, '{}'), x.connector_count, x.power_kw, null, 'per_kwh', null, '{}',
      case when p_publish and x.eligibility = 'B' and x.location_quality = 'ok' then 'published'::public.station_status else 'inactive'::public.station_status end,
      'unverified', x.source::public.station_source, x.external_id, coalesce(x.vehicle_classes, '{}'),
      x.source_url, x.source_attribution, x.source_data_as_of, x.last_evidence_check, x.location_quality, coalesce(x.name_is_derived, false),
      x.data_quality_score, coalesce(x.merged_source_ids, '{}'), p_batch
    from src x
    on conflict (source, external_id) do nothing
    returning id, source::text as source, external_id
  ), pts as (
    insert into public.charging_points (station_id, standard, current, power_kw, connector_count, vehicle_classes)
    select n.id, p.standard, p.current, p.power_kw, p.connector_count, coalesce(p.vehicle_classes, '{}')
    from new_stations n join src x on x.source = n.source and x.external_id = n.external_id
    cross join lateral jsonb_to_recordset(coalesce(x.points, '[]'::jsonb)) as p(standard text, current text, power_kw numeric, connector_count integer, vehicle_classes text[])
    returning 1
  ), provenance as (
    insert into public.station_sources (station_id, source, source_record_id, source_url, data_as_of, import_batch_id)
    select n.id, n.source, n.external_id, x.source_url, x.source_data_as_of, p_batch
    from new_stations n join src x on x.source = n.source and x.external_id = n.external_id
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

-- ---------- 7. Chunked bulk publish / hide (admin only) ----------------------
-- Works in chunks so one call stays well inside Supabase's statement timeout; the
-- admin screen calls it repeatedly until it returns 0. Only inactive stations can be
-- bulk-published, and never ones with suspect coordinates.
create or replace function public.admin_bulk_set_status(
  p_source text, p_state text, p_from public.station_status, p_to public.station_status, p_limit integer default 2000)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change station status in bulk' using errcode = '42501';
  end if;
  if p_to = 'published' and p_from <> 'inactive' then
    raise exception 'Only hidden (inactive) stations can be bulk-published' using errcode = '22023';
  end if;
  if p_to not in ('published', 'inactive') then
    raise exception 'Bulk status must be published or inactive' using errcode = '22023';
  end if;
  with chunk as (
    select s.id from public.stations s
    where s.source::text = p_source and s.status = p_from
      and (p_state is null or s.state = p_state)
      and (p_to <> 'published' or (s.location_quality = 'ok' and s.source::text <> 'osm'))
    order by s.id limit least(greatest(p_limit, 1), 5000)
  )
  update public.stations s set status = p_to from chunk where s.id = chunk.id;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.admin_bulk_set_status(text, text, public.station_status, public.station_status, integer) from public, anon;
grant execute on function public.admin_bulk_set_status(text, text, public.station_status, public.station_status, integer) to authenticated;
