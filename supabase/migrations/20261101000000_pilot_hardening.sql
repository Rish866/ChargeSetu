-- =============================================================================
-- ChargeSetu — pilot hardening (additive; safe to run on an existing database)
--   1. Report flood protection: max 5 reports per station per hour.
--   2. Photo links must be https:// (enforced in the database, not just the app).
--   3. Basic format check for reporter emails.
--   4. Non-admin inserts can't backdate created_at / updated_at.
--   5. Operator sign-ups store a business phone; record when terms were accepted.
-- =============================================================================

-- ---------- 1. Report rate limit --------------------------------------------
create index if not exists reports_station_created_idx on public.reports (station_id, created_at desc);

create or replace function public.limit_report_rate()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  recent integer;
begin
  if public.is_end_user_request() and not public.is_admin() then
    select count(*) into recent
    from public.reports r
    where r.station_id = new.station_id
      and r.created_at > now() - interval '1 hour';
    if recent >= 5 then
      raise exception 'Too many reports for this station. Please try again later.'
        using errcode = 'P0001';
    end if;
    new.created_at := now();
    new.status := 'open';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function public.limit_report_rate();

-- ---------- 2. https-only photo links ---------------------------------------
create or replace function public.all_https(urls text[])
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(bool_and(u ~ '^https://[^\s]+$' and char_length(u) <= 500), true)
  from unnest(urls) as u;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stations_photo_urls_https') then
    alter table public.stations
      add constraint stations_photo_urls_https check (public.all_https(photo_urls));
  end if;
  -- ---------- 3. reporter email format --------------------------------------
  if not exists (select 1 from pg_constraint where conname = 'reports_reporter_email_format') then
    alter table public.reports
      add constraint reports_reporter_email_format
      check (reporter_email is null or reporter_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  end if;
end;
$$;

-- ---------- 4. Moderation guard: also lock timestamps on insert --------------
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
      new.created_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- ---------- 5. Sign-up details ----------------------------------------------
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wants_operator boolean := coalesce(meta ->> 'account_type', 'customer') = 'operator';
begin
  insert into public.profiles (id, full_name, role, terms_accepted_at)
  values (
    new.id,
    left(coalesce(meta ->> 'full_name', ''), 100),
    -- Only ever customer or operator. Admins are promoted manually in SQL.
    case when wants_operator then 'operator'::public.user_role else 'customer'::public.user_role end,
    case when meta ? 'terms_accepted_at' then now() else null end
  );

  if wants_operator then
    insert into public.operators (profile_id, company_name, contact_email, contact_phone)
    values (
      new.id,
      left(coalesce(nullif(trim(meta ->> 'company_name'), ''), 'Unnamed operator'), 120),
      left(coalesce(new.email, ''), 200),
      nullif(left(coalesce(meta ->> 'company_phone', ''), 20), '')
    );
  end if;
  return new;
end;
$$;
