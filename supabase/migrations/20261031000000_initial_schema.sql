-- =============================================================================
-- ChargeSetu — initial schema
-- EV charging station discovery for India.
--
-- Security model (enforced HERE, not just in the app):
--   * Anyone can read PUBLISHED stations.
--   * Operators can create stations for their own company and edit their own
--     stations, but every insert/update by a non-admin is forced back to
--     `pending_review` + `unverified` by a trigger. Operators cannot publish.
--   * Only admins can approve/reject/verify, read reports, and see all rows.
--   * Nobody can make themselves an admin: profiles.role is not updatable by
--     users, and the signup trigger only creates `customer`/`operator` roles.
--   * The app uses only the anon/publishable key. No service-role key needed.
-- =============================================================================

-- ---------- Types -------------------------------------------------------------
create type public.user_role as enum ('customer', 'operator', 'admin');
create type public.station_status as enum ('pending_review', 'published', 'rejected', 'inactive');
create type public.verification_status as enum ('unverified', 'verified');
create type public.station_source as enum ('operator', 'admin', 'community', 'demo');
create type public.report_status as enum ('open', 'resolved', 'dismissed');

-- ---------- Tables ------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 100),
  role        public.user_role not null default 'customer',
  created_at  timestamptz not null default now()
);

create table public.operators (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null unique references public.profiles (id) on delete cascade,
  company_name   text not null check (char_length(company_name) between 2 and 120),
  contact_email  text not null check (char_length(contact_email) <= 200),
  contact_phone  text check (char_length(contact_phone) <= 20),
  created_at     timestamptz not null default now()
);

create table public.stations (
  id                   uuid primary key default gen_random_uuid(),
  -- Nullable: admin-created public records have no operator.
  operator_id          uuid references public.operators (id) on delete set null,
  name                 text not null check (char_length(name) between 3 and 120),
  slug                 text not null unique check (slug ~ '^[a-z0-9-]+$'),
  network              text not null check (char_length(network) between 2 and 80),
  address              text not null check (char_length(address) between 8 and 300),
  area                 text not null check (char_length(area) between 2 and 80),
  city                 text not null check (char_length(city) between 2 and 80),
  state                text not null check (char_length(state) between 2 and 80),
  country              text not null default 'India',
  -- Rough India bounding box.
  latitude             double precision not null check (latitude between 6.0 and 37.6),
  longitude            double precision not null check (longitude between 68.0 and 97.5),
  connector_types      text[] not null check (cardinality(connector_types) >= 1),
  connector_count      integer not null check (connector_count between 1 and 200),
  power_kw             numeric(6, 1) not null check (power_kw between 1 and 1000),
  price                numeric(10, 2) check (price is null or price between 0 and 10000),
  price_unit           text not null default 'per_kwh'
                         check (price_unit in ('per_kwh', 'per_minute', 'per_hour', 'per_session', 'free')),
  opening_hours        text not null check (char_length(opening_hours) between 2 and 120),
  amenities            text[] not null default '{}',
  contact_phone        text check (char_length(contact_phone) <= 20),
  contact_email        text check (char_length(contact_email) <= 200),
  photo_urls           text[] not null default '{}' check (cardinality(photo_urls) <= 6),
  status               public.station_status not null default 'pending_review',
  verification_status  public.verification_status not null default 'unverified',
  source               public.station_source not null default 'operator',
  rejection_reason     text check (char_length(rejection_reason) <= 500),
  last_verified_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid not null references public.stations (id) on delete cascade,
  reporter_email  text check (char_length(reporter_email) <= 200),
  issue_type      text not null check (issue_type in (
                    'closed_permanently', 'wrong_location', 'wrong_connectors',
                    'wrong_price', 'wrong_hours', 'not_working', 'other')),
  description     text not null check (char_length(description) between 10 and 2000),
  status          public.report_status not null default 'open',
  created_at      timestamptz not null default now()
);

-- ---------- Indexes -----------------------------------------------------------
create index stations_status_idx            on public.stations (status);
create index stations_public_city_idx       on public.stations (lower(city)) where status = 'published';
create index stations_public_network_idx    on public.stations (lower(network)) where status = 'published';
create index stations_public_power_idx      on public.stations (power_kw) where status = 'published';
create index stations_connector_types_idx   on public.stations using gin (connector_types);
create index stations_operator_idx          on public.stations (operator_id);
create index stations_verified_idx          on public.stations (last_verified_at desc)
  where status = 'published' and verification_status = 'verified';
create index stations_location_idx          on public.stations (latitude, longitude);
create index reports_status_created_idx     on public.reports (status, created_at desc);
create index reports_station_idx            on public.reports (station_id);

-- ---------- Helper functions --------------------------------------------------
-- SECURITY DEFINER so policies can check roles without recursive RLS lookups.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

create or replace function public.current_operator_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select o.id
  from public.operators o
  join public.profiles p on p.id = o.profile_id
  where o.profile_id = (select auth.uid()) and p.role = 'operator';
$$;

-- True for requests coming through the API as a normal user/anon (not for
-- migrations, the SQL editor, or the service role).
create or replace function public.is_end_user_request()
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  ) in ('anon', 'authenticated');
$$;

-- ---------- Triggers ----------------------------------------------------------
-- Create a profile (and an operator record) for every new auth user.
-- Role comes from signup metadata but can only ever be customer or operator.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  account_type text := coalesce(new.raw_user_meta_data ->> 'account_type', 'customer');
  wants_operator boolean := account_type = 'operator';
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 100),
    case when wants_operator then 'operator'::public.user_role else 'customer'::public.user_role end
  );

  if wants_operator then
    insert into public.operators (profile_id, company_name, contact_email)
    values (
      new.id,
      left(coalesce(nullif(new.raw_user_meta_data ->> 'company_name', ''), 'Unnamed operator'), 120),
      coalesce(new.email, '')
    );
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Moderation guard: non-admin writes can never publish or verify.
create or replace function public.enforce_station_moderation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();

  if public.is_end_user_request() and not public.is_admin() then
    new.status := 'pending_review';
    new.verification_status := 'unverified';
    new.last_verified_at := null;
    new.rejection_reason := null;
    new.source := 'operator';
    if tg_op = 'UPDATE' then
      new.operator_id := old.operator_id;   -- cannot move a station to another operator
      new.slug := old.slug;
      new.created_at := old.created_at;
    else
      new.operator_id := public.current_operator_id();
    end if;
  end if;
  return new;
end;
$$;

create trigger stations_moderation
  before insert or update on public.stations
  for each row execute function public.enforce_station_moderation();

-- ---------- Row Level Security ------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.operators enable row level security;
alter table public.stations  enable row level security;
alter table public.reports   enable row level security;

-- profiles
create policy "profiles: read own or admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "profiles: admin manages" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Users may only change their own name — never their role.
revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- operators
create policy "operators: read own or admin" on public.operators
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin());

create policy "operators: update own" on public.operators
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

revoke update on public.operators from anon, authenticated;
grant update (company_name, contact_email, contact_phone) on public.operators to authenticated;

-- stations
create policy "stations: public reads published" on public.stations
  for select to anon, authenticated
  using (status = 'published');

create policy "stations: operators read own" on public.stations
  for select to authenticated
  using (operator_id is not null and operator_id = public.current_operator_id());

create policy "stations: admins read all" on public.stations
  for select to authenticated
  using (public.is_admin());

create policy "stations: operators insert own" on public.stations
  for insert to authenticated
  with check (
    public.current_operator_id() is not null
    and operator_id = public.current_operator_id()
    and status = 'pending_review'
    and verification_status = 'unverified'
  );

create policy "stations: admins insert" on public.stations
  for insert to authenticated
  with check (public.is_admin());

create policy "stations: operators update own" on public.stations
  for update to authenticated
  using (operator_id is not null and operator_id = public.current_operator_id())
  with check (operator_id = public.current_operator_id() and status = 'pending_review');

create policy "stations: admins update" on public.stations
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "stations: admins delete" on public.stations
  for delete to authenticated
  using (public.is_admin());

-- reports
create policy "reports: anyone can report a published station" on public.reports
  for insert to anon, authenticated
  with check (
    status = 'open'
    and exists (select 1 from public.stations s where s.id = station_id and s.status = 'published')
  );

create policy "reports: admins read" on public.reports
  for select to authenticated
  using (public.is_admin());

create policy "reports: admins update" on public.reports
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Reporters only insert; they never read reports back (protects emails).
revoke update, delete on public.reports from anon;
