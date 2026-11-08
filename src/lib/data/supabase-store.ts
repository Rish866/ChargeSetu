import "server-only";
import { slugify } from "@/lib/format";
import { clusterStations } from "@/lib/stations/cluster";
import { filterStations } from "@/lib/stations/search";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  LeadStatus,
  ClaimStatus,
  ImportBatch,
  LocationQuality,
  VehicleClass,
  Report,
  ReportStatus,
  Station,
  StationLead,
  StationSource,
  StationStatus,
  VerificationStatus,
} from "@/lib/types";
import type { StationFilters } from "@/lib/validation/filters";
import type { StationInput } from "@/lib/validation/station";
import type { AmenityId, ConnectorTypeId, IssueTypeId, PriceUnitId } from "@/lib/constants";
import { DataStoreError, type DataStore, type ModerationPatch } from "./store";

/** Row shape of `public.stations` (see supabase/migrations). */
interface StationRow {
  id: string;
  operator_id: string | null;
  name: string;
  slug: string;
  network: string;
  address: string;
  area: string | null;
  district?: string | null;
  external_id?: string | null;
  vehicle_classes?: string[] | null;
  source_url?: string | null;
  source_attribution?: string | null;
  source_data_as_of?: string | null;
  last_evidence_check?: string | null;
  location_quality?: string | null;
  name_is_derived?: boolean | null;
  data_quality_score?: number | null;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  connector_types: string[];
  connector_count: number | null;
  power_kw: number | null;
  price: number | null;
  price_unit: string;
  opening_hours: string | null;
  amenities: string[];
  contact_phone: string | null;
  contact_email: string | null;
  photo_urls: string[];
  status: string;
  verification_status: string;
  source: string;
  rejection_reason: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ReportRow {
  id: string;
  station_id: string;
  reporter_email: string | null;
  issue_type: string;
  description: string;
  status: string;
  created_at: string;
  stations?: { name: string } | null;
}

interface LeadRow {
  id: string;
  import_batch: string;
  source_row: number | null;
  station_name: string;
  operator_name: string | null;
  address: string;
  city: string;
  state: string;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  connector_types: string[];
  connector_types_raw: string | null;
  power_kw_max: number | string | null;
  power_kw_raw: string | null;
  tariff_inr_per_kwh: number | string | null;
  access_notes: string | null;
  source_url: string;
  notes: string | null;
  missing_fields: string[];
  quality_flags: string[];
  status: string;
  station_id: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

const numOrNull = (v: number | string | null) => (v === null ? null : Number(v));

function toLead(r: LeadRow): StationLead {
  return {
    id: r.id,
    importBatch: r.import_batch,
    sourceRow: r.source_row,
    stationName: r.station_name,
    operatorName: r.operator_name,
    address: r.address,
    city: r.city,
    state: r.state,
    pincode: r.pincode,
    latitude: numOrNull(r.latitude),
    longitude: numOrNull(r.longitude),
    connectorTypes: (r.connector_types ?? []) as ConnectorTypeId[],
    connectorTypesRaw: r.connector_types_raw,
    powerKwMax: numOrNull(r.power_kw_max),
    powerKwRaw: r.power_kw_raw,
    tariffInrPerKwh: numOrNull(r.tariff_inr_per_kwh),
    accessNotes: r.access_notes,
    sourceUrl: r.source_url,
    notes: r.notes,
    missingFields: r.missing_fields ?? [],
    qualityFlags: r.quality_flags ?? [],
    status: r.status as LeadStatus,
    stationId: r.station_id,
    reviewNote: r.review_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROWS = 500;

function toStation(r: StationRow): Station {
  return {
    id: r.id,
    operatorId: r.operator_id,
    name: r.name,
    slug: r.slug,
    network: r.network,
    address: r.address,
    area: r.area,
    city: r.city,
    state: r.state,
    country: r.country,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    connectorTypes: (r.connector_types ?? []) as ConnectorTypeId[],
    connectorCount: r.connector_count,
    powerKw: r.power_kw === null ? null : Number(r.power_kw),
    district: r.district ?? null,
    externalId: r.external_id ?? null,
    vehicleClasses: (r.vehicle_classes ?? ["car"]) as VehicleClass[],
    sourceUrl: r.source_url ?? null,
    sourceAttribution: r.source_attribution ?? null,
    sourceDataAsOf: r.source_data_as_of ?? null,
    lastEvidenceCheck: r.last_evidence_check ?? null,
    locationQuality: (r.location_quality ?? "ok") as LocationQuality,
    nameIsDerived: r.name_is_derived ?? false,
    dataQualityScore: r.data_quality_score ?? null,
    price: r.price === null ? null : Number(r.price),
    priceUnit: r.price_unit as PriceUnitId,
    openingHours: r.opening_hours,
    amenities: (r.amenities ?? []) as AmenityId[],
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    photoUrls: r.photo_urls ?? [],
    status: r.status as StationStatus,
    verificationStatus: r.verification_status as VerificationStatus,
    source: r.source as StationSource,
    rejectionReason: r.rejection_reason,
    lastVerifiedAt: r.last_verified_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function inputToRow(input: StationInput) {
  return {
    name: input.name,
    network: input.network,
    address: input.address,
    area: input.area,
    city: input.city,
    state: input.state,
    latitude: input.latitude,
    longitude: input.longitude,
    connector_types: input.connectorTypes,
    connector_count: input.connectorCount,
    power_kw: input.powerKw,
    price: input.price,
    price_unit: input.priceUnit,
    opening_hours: input.openingHours,
    amenities: input.amenities,
    contact_phone: input.contactPhone,
    contact_email: input.contactEmail,
    photo_urls: input.photoUrls,
  };
}

function patchToRow(patch: ModerationPatch) {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.verificationStatus !== undefined) row.verification_status = patch.verificationStatus;
  if (patch.lastVerifiedAt !== undefined) row.last_verified_at = patch.lastVerifiedAt;
  if (patch.rejectionReason !== undefined) row.rejection_reason = patch.rejectionReason;
  return row;
}

function fail(context: string, error: unknown): never {
  console.error(`[supabase] ${context}`, error);
  throw new DataStoreError(`Database error while trying to ${context}.`, error);
}

const randomSuffix = () => crypto.randomUUID().slice(0, 6);

/** Removes characters that could alter a PostgREST filter expression or act as LIKE wildcards. */
const safeTerm = (s: string) => s.replace(/[^\p{L}\p{N} .\-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 100);

/**
 * True when an error means "this database has not had the nationwide migration
 * yet" (missing function / column / table). The app then falls back to the
 * pre-migration behaviour instead of breaking, so code can be deployed first.
 */
export function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? "";
  return ["PGRST202", "PGRST204", "PGRST205", "42883", "42703", "42P01"].includes(code);
}

/** Pre-migration search: up to 500 published rows, filtered and sorted in app code (old behaviour). */
async function legacySearch(filters: StationFilters, page: number, pageSize: number) {
  const sb = await createSupabaseServerClient();
  let q = sb.from("stations").select("*").eq("status", "published");
  if (filters.state) q = q.eq("state", filters.state);
  if (filters.connector) q = q.contains("connector_types", [filters.connector]);
  if (filters.minPower) q = q.gte("power_kw", filters.minPower);
  if (filters.verified) q = q.eq("verification_status", "verified");
  const { data, error } = await q.limit(MAX_ROWS);
  if (error) fail("load stations", error);
  const all = filterStations((data as StationRow[]).map(toStation), filters);
  const from = (page - 1) * pageSize;
  return { items: all.slice(from, from + pageSize), total: all.length, page, pageSize };
}

const CURRENT_LISTS = {
  AC: ["type2", "bharat_ac001", "15a_socket", "lev_ac"],
  DC: ["ccs2", "chademo", "gbt", "bharat_dc001", "type7_lecct", "lev_dc"],
} as const;

export const supabaseStore: DataStore = {
  async searchStations(filters, page, pageSize) {
    const sb = await createSupabaseServerClient();
    const from = (page - 1) * pageSize;
    const term = filters.q ? safeTerm(filters.q) : undefined;

    // Nearby: the database computes distances and returns one page of ids.
    if (filters.lat !== undefined && filters.lng !== undefined) {
      const { data: near, error: nearErr } = await sb.rpc("stations_nearby", {
        p_lat: filters.lat,
        p_lng: filters.lng,
        p_radius_km: 100,
        p_limit: pageSize,
        p_offset: from,
        p_state: filters.state ?? null,
        p_vehicle: filters.vehicle ?? null,
        p_current: filters.current ?? null,
        p_connector: filters.connector ?? null,
        p_min_power: filters.minPower ?? null,
        p_network: filters.network ?? null,
        p_verified: Boolean(filters.verified),
        p_q: term ?? null,
      });
      if (nearErr && isMissingSchema(nearErr)) return legacySearch(filters, page, pageSize);
      if (nearErr) fail("search nearby stations", nearErr);
      const hits = (near ?? []) as { id: string; distance_km: number; total_count: number }[];
      if (hits.length === 0) return { items: [], total: 0, page, pageSize };
      const { data, error } = await sb.from("stations").select("*").in("id", hits.map((h) => h.id));
      if (error) fail("load nearby stations", error);
      const byId = new Map((data as StationRow[]).map((r) => [r.id, toStation(r)]));
      const items = hits.flatMap((h) => {
        const st = byId.get(h.id);
        return st ? [{ ...st, distanceKm: Number(h.distance_km) }] : [];
      });
      return { items, total: Number(hits[0].total_count), page, pageSize };
    }

    let q = sb.from("stations").select("*", { count: "exact" }).eq("status", "published");
    if (filters.state) q = q.eq("state", filters.state);
    if (filters.city) q = q.ilike("city", safeTerm(filters.city));
    if (filters.network) q = q.ilike("network", safeTerm(filters.network));
    if (filters.vehicle) q = q.contains("vehicle_classes", [filters.vehicle]);
    if (filters.current) q = q.overlaps("connector_types", [...CURRENT_LISTS[filters.current]]);
    if (filters.connector) q = q.contains("connector_types", [filters.connector]);
    if (filters.minPower) q = q.gte("power_kw", filters.minPower);
    if (filters.verified) q = q.eq("verification_status", "verified");
    if (term) {
      q = q.or(`name.ilike.%${term}%,address.ilike.%${term}%,city.ilike.%${term}%,network.ilike.%${term}%,area.ilike.%${term}%`);
    }
    const { data, error, count } = await q
      .order("verification_status", { ascending: false })
      .order("state")
      .order("city")
      .order("name")
      .range(from, from + pageSize - 1);
    if (error && isMissingSchema(error)) return legacySearch(filters, page, pageSize);
    if (error) fail("search stations", error);
    return { items: (data as StationRow[]).map(toStation), total: count ?? 0, page, pageSize };
  },

  async mapPoints({ minLat, minLng, maxLat, maxLng, zoom, filters }) {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb.rpc("station_map_points", {
      p_min_lat: minLat,
      p_min_lng: minLng,
      p_max_lat: maxLat,
      p_max_lng: maxLng,
      p_zoom: zoom,
      p_state: filters.state ?? null,
      p_vehicle: filters.vehicle ?? null,
      p_current: filters.current ?? null,
      p_connector: filters.connector ?? null,
      p_min_power: filters.minPower ?? null,
      p_network: filters.network ?? null,
      p_verified: Boolean(filters.verified),
      p_q: filters.q ? safeTerm(filters.q) : null,
    });
    if (error && isMissingSchema(error)) {
      // Pre-migration database: cluster in app code from published rows in the box.
      const { data: rows, error: e2 } = await sb
        .from("stations")
        .select("*")
        .eq("status", "published")
        .gte("latitude", minLat)
        .lte("latitude", maxLat)
        .gte("longitude", minLng)
        .lte("longitude", maxLng)
        .limit(MAX_ROWS);
      if (e2) fail("load map points", e2);
      return clusterStations(filterStations((rows as StationRow[]).map(toStation), filters), zoom);
    }
    if (error) fail("load map points", error);
    type Row = { kind: string; lat: number; lng: number; n: number; id: string | null; slug: string | null; name: string | null; power_kw: number | null; verified: boolean | null; vehicle_classes: string[] | null };
    return ((data ?? []) as Row[]).map((r) => ({
      kind: r.kind === "cluster" ? ("cluster" as const) : ("station" as const),
      lat: Number(r.lat),
      lng: Number(r.lng),
      count: Number(r.n),
      id: r.id ?? undefined,
      slug: r.slug ?? undefined,
      name: r.name ?? undefined,
      powerKw: r.power_kw === null ? null : Number(r.power_kw),
      verified: Boolean(r.verified),
      vehicleClasses: (r.vehicle_classes ?? []) as VehicleClass[],
    }));
  },

  async stateStats() {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb.rpc("state_stats");
    if (error && isMissingSchema(error)) return [];
    if (error) fail("load state statistics", error);
    type Row = { state: string; total: number; published: number; hidden: number; pending: number; verified: number; source_listed: number; suspect: number };
    return ((data ?? []) as Row[]).map((r) => ({
      state: r.state,
      total: Number(r.total),
      published: Number(r.published),
      hidden: Number(r.hidden),
      pending: Number(r.pending),
      verified: Number(r.verified),
      sourceListed: Number(r.source_listed),
      suspect: Number(r.suspect),
    }));
  },

  async operatorCounts() {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb.rpc("operator_counts");
    if (error) fail("load operators", error);
    return ((data ?? []) as { network: string; stations: number }[]).map((r) => ({ network: r.network, stations: Number(r.stations) }));
  },

  async getChargingPoints(stationId) {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb.from("charging_points").select("*").eq("station_id", stationId).order("power_kw", { ascending: false });
    if (error) return []; // table may not exist on older databases
    type Row = { standard: string; current: string; power_kw: number | null; connector_count: number; vehicle_classes: string[] };
    return (data as Row[]).map((r) => ({
      standard: r.standard as ConnectorTypeId,
      current: r.current as "AC" | "DC",
      powerKw: r.power_kw === null ? null : Number(r.power_kw),
      connectorCount: r.connector_count,
      vehicleClasses: r.vehicle_classes as VehicleClass[],
    }));
  },

  async getStationNames(ids) {
    const valid = ids.filter((i) => UUID_RE.test(i)).slice(0, 50);
    if (valid.length === 0) return {};
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb.from("stations").select("id, name").in("id", valid);
    if (error) fail("load station names", error);
    return Object.fromEntries((data as { id: string; name: string }[]).map((r) => [r.id, r.name]));
  },

  async startImportBatch({ source, label, publishAs, total, userId }) {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb
      .from("import_batches")
      .insert({ source, label, publish_as: publishAs, total, created_by: userId })
      .select("id")
      .single();
    if (error) fail("start import", error);
    return (data as { id: string }).id;
  },

  async importStationsChunk(batchId, rows, publish) {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb.rpc("import_stations_batch", { p_rows: rows, p_publish: publish, p_batch: batchId });
    if (error) fail("import stations", error);
    const row = (Array.isArray(data) ? data[0] : data) as { inserted: number; skipped: number } | undefined;
    return { inserted: Number(row?.inserted ?? 0), skipped: Number(row?.skipped ?? 0) };
  },

  async finishImportBatch(batchId, status, totals) {
    const sb = await createSupabaseServerClient();
    const { error } = await sb
      .from("import_batches")
      .update({ status, inserted: totals.inserted, skipped: totals.skipped, failed: totals.failed, finished_at: new Date().toISOString() })
      .eq("id", batchId);
    if (error) fail("finish import", error);
  },

  async listImportBatches(limit) {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb.from("import_batches").select("*").order("started_at", { ascending: false }).limit(limit);
    if (error) return [];
    type Row = { id: string; source: string; label: string; status: string; total: number; inserted: number; skipped: number; failed: number; publish_as: string; started_at: string; finished_at: string | null };
    return (data as Row[]).map((r) => ({
      id: r.id, source: r.source, label: r.label, status: r.status as ImportBatch["status"], total: r.total,
      inserted: r.inserted, skipped: r.skipped, failed: r.failed, publishAs: r.publish_as as ImportBatch["publishAs"],
      startedAt: r.started_at, finishedAt: r.finished_at,
    }));
  },

  async bulkSetStatus({ source, state, from, to, limit }) {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb.rpc("admin_bulk_set_status", { p_source: source, p_state: state, p_from: from, p_to: to, p_limit: limit });
    if (error) fail("change station visibility", error);
    return Number(data ?? 0);
  },

  async createClaim(input) {
    const sb = await createSupabaseServerClient();
    const { error } = await sb.from("station_claims").insert({
      station_id: input.stationId,
      claimant_id: input.claimantId,
      company_name: input.companyName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone,
      evidence: input.evidence,
    });
    if (error) fail("submit claim", error);
  },

  async listClaims(status) {
    const sb = await createSupabaseServerClient();
    let q = sb.from("station_claims").select("*, stations(name)").order("created_at", { ascending: false }).limit(200);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return [];
    type Row = { id: string; station_id: string; claimant_id: string; company_name: string; contact_email: string; contact_phone: string | null; evidence: string; status: string; review_note: string | null; created_at: string; stations?: { name: string } | null };
    return (data as Row[]).map((r) => ({
      id: r.id, stationId: r.station_id, stationName: r.stations?.name, claimantId: r.claimant_id,
      companyName: r.company_name, contactEmail: r.contact_email, contactPhone: r.contact_phone,
      evidence: r.evidence, status: r.status as ClaimStatus, reviewNote: r.review_note, createdAt: r.created_at,
    }));
  },

  async setClaimStatus(id, status, reviewNote) {
    const sb = await createSupabaseServerClient();
    const { error } = await sb
      .from("station_claims")
      .update({ status, review_note: reviewNote, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) fail("update claim", error);
  },

  async listPublishedStations(filters) {
    const sb = await createSupabaseServerClient();
    let q = sb.from("stations").select("*").eq("status", "published");
    if (filters.city) q = q.ilike("city", filters.city);
    if (filters.network) q = q.ilike("network", filters.network);
    if (filters.connector) q = q.contains("connector_types", [filters.connector]);
    if (filters.minPower) q = q.gte("power_kw", filters.minPower);
    if (filters.verified) q = q.eq("verification_status", "verified");
    const { data, error } = await q.limit(MAX_ROWS);
    if (error) fail("load stations", error);
    // Free-text matching and distance sorting are done in app code so the
    // behaviour is identical to demo mode (and covered by unit tests).
    return filterStations((data as StationRow[]).map(toStation), filters);
  },

  async getPublishedStation(idOrSlug) {
    const sb = await createSupabaseServerClient();
    const column = UUID_RE.test(idOrSlug) ? "id" : "slug";
    const { data, error } = await sb
      .from("stations")
      .select("*")
      .eq(column, idOrSlug)
      .eq("status", "published")
      .maybeSingle();
    if (error) fail("load station", error);
    return data ? toStation(data as StationRow) : null;
  },

  async listRecentlyVerified(limit) {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb
      .from("stations")
      .select("*")
      .eq("status", "published")
      .eq("verification_status", "verified")
      .order("last_verified_at", { ascending: false })
      .limit(limit);
    if (error) fail("load stations", error);
    return (data as StationRow[]).map(toStation);
  },

  async getFilterOptions() {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb.rpc("operator_counts");
    if (error) {
      // Older databases without the nationwide migration: fall back to a sample.
      const fb = await sb.from("stations").select("city, network").eq("status", "published").limit(2000);
      if (fb.error) fail("load filters", fb.error);
      const rows = fb.data as { city: string; network: string }[];
      const uniq = (xs: string[]) => Array.from(new Set(xs)).sort((a, b) => a.localeCompare(b));
      return { cities: uniq(rows.map((r) => r.city)), networks: uniq(rows.map((r) => r.network)) };
    }
    const nets = (data as { network: string; stations: number }[]).slice(0, 80).map((r) => r.network);
    return { cities: [], networks: nets.sort((a, b) => a.localeCompare(b)) };
  },

  async listStationOptions() {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb
      .from("stations")
      .select("id, name, city")
      .eq("status", "published")
      .order("city")
      .order("name")
      .limit(201);
    if (error) fail("load stations", error);
    return data as { id: string; name: string; city: string }[];
  },

  async getStationById(id) {
    if (!UUID_RE.test(id)) return null;
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb.from("stations").select("*").eq("id", id).maybeSingle();
    if (error) fail("load station", error);
    return data ? toStation(data as StationRow) : null;
  },

  async listStationsByOperator(operatorId) {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb
      .from("stations")
      .select("*")
      .eq("operator_id", operatorId)
      .order("updated_at", { ascending: false });
    if (error) fail("load your stations", error);
    return (data as StationRow[]).map(toStation);
  },

  async listAllStations(status) {
    const sb = await createSupabaseServerClient();
    let q = sb.from("stations").select("*");
    if (status) q = q.eq("status", status);
    const { data, error } = await q.order("updated_at", { ascending: false }).limit(MAX_ROWS);
    if (error) fail("load stations", error);
    return (data as StationRow[]).map(toStation);
  },

  async listReports(status) {
    const sb = await createSupabaseServerClient();
    let q = sb.from("reports").select("*, stations(name)");
    if (status) q = q.eq("status", status);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(MAX_ROWS);
    if (error) fail("load reports", error);
    return (data as ReportRow[]).map(
      (r): Report => ({
        id: r.id,
        stationId: r.station_id,
        stationName: r.stations?.name,
        reporterEmail: r.reporter_email,
        issueType: r.issue_type as IssueTypeId,
        description: r.description,
        status: r.status as ReportStatus,
        createdAt: r.created_at,
      }),
    );
  },

  async listOperators() {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb
      .from("operators")
      .select("id, profile_id, company_name, contact_email, contact_phone, created_at, stations(count)")
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
    if (error) fail("load operators", error);
    type Row = {
      id: string;
      profile_id: string;
      company_name: string;
      contact_email: string;
      contact_phone: string | null;
      created_at: string;
      stations: { count: number }[] | null;
    };
    return (data as Row[]).map((o) => ({
      id: o.id,
      profileId: o.profile_id,
      companyName: o.company_name,
      contactEmail: o.contact_email,
      contactPhone: o.contact_phone,
      createdAt: o.created_at,
      stationCount: o.stations?.[0]?.count ?? 0,
    }));
  },

  async listLeads(status) {
    const sb = await createSupabaseServerClient();
    let q = sb.from("station_leads").select("*");
    if (status) q = q.eq("status", status);
    const { data, error } = await q.order("city").order("station_name").limit(MAX_ROWS);
    if (error) fail("load station leads", error);
    return (data as LeadRow[]).map(toLead);
  },

  async getLead(id) {
    if (!UUID_RE.test(id)) return null;
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb.from("station_leads").select("*").eq("id", id).maybeSingle();
    if (error) fail("load the lead", error);
    return data ? toLead(data as LeadRow) : null;
  },

  async updateLead(id, patch) {
    const sb = await createSupabaseServerClient();
    const row: Record<string, unknown> = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.reviewNote !== undefined) row.review_note = patch.reviewNote;
    if (patch.stationId !== undefined) row.station_id = patch.stationId;
    const { data, error } = await sb.from("station_leads").update(row).eq("id", id).select("*").maybeSingle();
    if (error) fail("update the lead", error);
    return data ? toLead(data as LeadRow) : null;
  },

  async getCounts() {
    const sb = await createSupabaseServerClient();
    const countStations = async (filters: Record<string, string>) => {
      let q = sb.from("stations").select("id", { count: "exact", head: true });
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
      const { count, error } = await q;
      if (error) fail("count stations", error);
      return count ?? 0;
    };
    const [published, pending, rejected, inactive, verified, ops, reports, leads, claims] = await Promise.all([
      countStations({ status: "published" }),
      countStations({ status: "pending_review" }),
      countStations({ status: "rejected" }),
      countStations({ status: "inactive" }),
      countStations({ status: "published", verification_status: "verified" }),
      sb.from("operators").select("id", { count: "exact", head: true }),
      sb.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      sb.from("station_leads").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
      sb.from("station_claims").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    if (ops.error) fail("count operators", ops.error);
    if (reports.error) fail("count reports", reports.error);
    return {
      published,
      pending,
      rejected,
      inactive,
      verified,
      operators: ops.count ?? 0,
      openReports: reports.count ?? 0,
      // The leads table may not exist yet on older databases — show 0 then.
      pendingLeads: leads.error ? 0 : (leads.count ?? 0),
      pendingClaims: claims.error ? 0 : (claims.count ?? 0),
    };
  },

  async createStation(input, options) {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb
      .from("stations")
      .insert({
        ...inputToRow(input),
        slug: `${slugify(input.name) || "station"}-${randomSuffix()}`,
        operator_id: options.operatorId,
        source: options.source,
        ...patchToRow({
          status: options.status ?? "pending_review",
          verificationStatus: options.verificationStatus ?? "unverified",
          lastVerifiedAt: options.lastVerifiedAt ?? null,
          rejectionReason: options.rejectionReason ?? null,
        }),
      })
      .select("*")
      .single();
    if (error) fail("save the station", error);
    return toStation(data as StationRow);
  },

  async updateStation(id, input, patch = {}) {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb
      .from("stations")
      .update({ ...inputToRow(input), ...patchToRow(patch) })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) fail("update the station", error);
    return data ? toStation(data as StationRow) : null;
  },

  async moderateStation(id, patch) {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb
      .from("stations")
      .update(patchToRow(patch))
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) fail("update the station", error);
    return data ? toStation(data as StationRow) : null;
  },

  async createReport(input) {
    const sb = await createSupabaseServerClient();
    const { error } = await sb.from("reports").insert({
      station_id: input.stationId,
      issue_type: input.issueType,
      description: input.description,
      reporter_email: input.reporterEmail,
    });
    if (error) fail("send the report", error);
  },

  async setReportStatus(id, status) {
    const sb = await createSupabaseServerClient();
    const { error } = await sb.from("reports").update({ status }).eq("id", id);
    if (error) fail("update the report", error);
  },
};
