-- =============================================================================
-- ChargeSetu — read-only checks AFTER the nationwide migration. Changes nothing.
-- Every row should say ok = true.
-- =============================================================================
with fns(name) as (values ('stations_nearby'), ('station_map_points'), ('state_stats'), ('operator_counts'),
                          ('import_stations_batch'), ('admin_bulk_set_status'), ('ac_connectors'), ('dc_connectors')),
     tbls(name) as (values ('import_batches'), ('charging_points'), ('station_sources'), ('station_claims')),
     private_tbls(name) as (values ('import_batches'), ('station_sources'), ('station_claims'), ('station_leads'))
select 'function ' || f.name as check, exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f.name) as ok, '' as detail from fns f
union all
select 'RLS on ' || t.name, coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = t.name), false), '' from tbls t
union all
select 'anon cannot read ' || t.name, not has_table_privilege('anon', 'public.' || t.name, 'select'), '' from private_tbls t
union all
select 'anon cannot run import_stations_batch', not has_function_privilege('anon', 'public.import_stations_batch(jsonb, boolean, uuid)', 'execute'), ''
union all
select 'suspect-location publish guard', exists (select 1 from pg_constraint where conname = 'stations_suspect_never_published'), ''
union all
select 'unique (source, external_id)', exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'stations' and indexdef ilike '%(source, external_id)%'), ''
union all
select 'existing stations kept', (select count(*) from public.stations) > 0, (select count(*)::text || ' stations, ' || count(*) filter (where status = 'published')::text || ' published' from public.stations)
union all
select 'no BEE station is published', not exists (select 1 from public.stations where source::text = 'bee' and status = 'published'),
       (select count(*)::text || ' BEE rows imported' from public.stations where source::text = 'bee')
union all
select 'no source-listed station marked verified', not exists (select 1 from public.stations where source::text in ('bee', 'osm') and verification_status = 'verified'), '';
