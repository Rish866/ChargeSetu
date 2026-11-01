import "server-only";
import { slugify } from "@/lib/format";
import { filterStations } from "@/lib/stations/search";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Report,
  ReportStatus,
  Station,
  StationSource,
  StationStatus,
  VerificationStatus,
} from "@/lib/types";
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
  area: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  connector_types: string[];
  connector_count: number;
  power_kw: number;
  price: number | null;
  price_unit: string;
  opening_hours: string;
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
    powerKw: Number(r.power_kw),
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

export const supabaseStore: DataStore = {
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
    const { data, error } = await sb
      .from("stations")
      .select("city, network")
      .eq("status", "published")
      .limit(5000);
    if (error) fail("load filters", error);
    const rows = data as { city: string; network: string }[];
    const uniq = (xs: string[]) => Array.from(new Set(xs)).sort((a, b) => a.localeCompare(b));
    return { cities: uniq(rows.map((r) => r.city)), networks: uniq(rows.map((r) => r.network)) };
  },

  async listStationOptions() {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb
      .from("stations")
      .select("id, name, city")
      .eq("status", "published")
      .order("city")
      .order("name")
      .limit(2000);
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

  async getCounts() {
    const sb = await createSupabaseServerClient();
    const countStations = async (filters: Record<string, string>) => {
      let q = sb.from("stations").select("id", { count: "exact", head: true });
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
      const { count, error } = await q;
      if (error) fail("count stations", error);
      return count ?? 0;
    };
    const [published, pending, rejected, inactive, verified, ops, reports] = await Promise.all([
      countStations({ status: "published" }),
      countStations({ status: "pending_review" }),
      countStations({ status: "rejected" }),
      countStations({ status: "inactive" }),
      countStations({ status: "published", verification_status: "verified" }),
      sb.from("operators").select("id", { count: "exact", head: true }),
      sb.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
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
