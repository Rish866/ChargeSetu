-- =============================================================================
-- ChargeSetu — station leads (additive; safe to run on an existing database)
--
-- A "lead" is a candidate station gathered from third-party directories,
-- articles or operator websites. Leads usually lack required station data
-- (coordinates, opening hours, tariff), so they are stored here exactly as
-- found — missing values stay NULL — instead of in `stations`.
--
--   * Admin-only: no anonymous, customer or operator access at all.
--   * Never public, never verified: verification_status is pinned to
--     'unverified'; an admin converts a lead into a station (which then goes
--     through the normal pending_review → published workflow).
--   * Idempotent imports: `dedupe_key` (normalised name + address) is unique.
--   * Does not modify any existing table or row.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status' and typnamespace = 'public'::regnamespace) then
    create type public.lead_status as enum ('pending_review', 'converted', 'rejected', 'duplicate');
  end if;
end;
$$;

create table if not exists public.station_leads (
  id                   uuid primary key default gen_random_uuid(),
  dedupe_key           text not null unique check (char_length(dedupe_key) between 3 and 600),
  import_batch         text not null check (char_length(import_batch) between 1 and 120),
  source_row           integer check (source_row > 0),
  station_name         text not null check (char_length(station_name) between 2 and 200),
  operator_name        text check (char_length(operator_name) <= 120),
  address              text not null check (char_length(address) between 5 and 400),
  city                 text not null check (char_length(city) between 2 and 80),
  state                text not null check (char_length(state) between 2 and 80),
  pincode              text check (pincode ~ '^[1-9][0-9]{5}$'),
  -- Only ever filled in by a person who has confirmed the location.
  latitude             double precision check (latitude between 6.0 and 37.6),
  longitude            double precision check (longitude between 68.0 and 97.5),
  connector_types      text[] not null default '{}',
  connector_types_raw  text check (char_length(connector_types_raw) <= 200),
  power_kw_max         numeric(6, 1) check (power_kw_max between 0.5 and 1000),
  power_kw_raw         text check (char_length(power_kw_raw) <= 100),
  tariff_inr_per_kwh   numeric(10, 2) check (tariff_inr_per_kwh between 0 and 10000),
  access_notes         text check (char_length(access_notes) <= 500),
  source_url           text not null check (source_url ~ '^https?://[^\s]+$' and char_length(source_url) <= 500),
  notes                text check (char_length(notes) <= 1000),
  missing_fields       text[] not null default '{}',
  quality_flags        text[] not null default '{}',
  status               public.lead_status not null default 'pending_review',
  verification_status  public.verification_status not null default 'unverified'
                         check (verification_status = 'unverified'),
  station_id           uuid references public.stations (id) on delete set null,
  review_note          text check (char_length(review_note) <= 500),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists station_leads_status_idx on public.station_leads (status, created_at desc);
create index if not exists station_leads_city_idx on public.station_leads (lower(city));
create index if not exists station_leads_batch_idx on public.station_leads (import_batch);

create or replace function public.touch_station_lead()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.dedupe_key := old.dedupe_key;
  end if;
  return new;
end;
$$;

drop trigger if exists station_leads_touch on public.station_leads;
create trigger station_leads_touch
  before insert or update on public.station_leads
  for each row execute function public.touch_station_lead();

alter table public.station_leads enable row level security;

drop policy if exists "station_leads: admins read" on public.station_leads;
create policy "station_leads: admins read" on public.station_leads
  for select to authenticated using (public.is_admin());

drop policy if exists "station_leads: admins insert" on public.station_leads;
create policy "station_leads: admins insert" on public.station_leads
  for insert to authenticated with check (public.is_admin());

drop policy if exists "station_leads: admins update" on public.station_leads;
create policy "station_leads: admins update" on public.station_leads
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "station_leads: admins delete" on public.station_leads;
create policy "station_leads: admins delete" on public.station_leads
  for delete to authenticated using (public.is_admin());

-- Belt and braces: anonymous visitors have no table privileges at all.
revoke all on public.station_leads from anon;
