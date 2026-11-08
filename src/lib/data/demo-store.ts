import "server-only";
import { connection } from "next/server";
import { slugify } from "@/lib/format";
import { clusterStations } from "@/lib/stations/cluster";
import { filterOptions, filterStations } from "@/lib/stations/search";
import type { ChargingPoint, ImportBatch, Report, Station, StationClaim, StationLead, VehicleClass } from "@/lib/types";
import { demoLeads, demoOperators, demoReports, demoStations } from "./demo-seed";
import { DataStoreError, type DataStore } from "./store";

/**
 * In-memory store used when Supabase isn't configured.
 * Changes persist only while the server process runs and reset on restart
 * (and are not shared between serverless instances). Demo use only.
 */
interface DemoState {
  stations: Station[];
  reports: Report[];
  leads: StationLead[];
  claims: StationClaim[];
  batches: ImportBatch[];
  importedKeys: Set<string>;
  points: Map<string, ChargingPoint[]>;
}

const globalForDemo = globalThis as unknown as { __evDemoState?: DemoState };

function state(): DemoState {
  if (!globalForDemo.__evDemoState) {
    globalForDemo.__evDemoState = {
      stations: structuredClone(demoStations),
      reports: structuredClone(demoReports),
      leads: structuredClone(demoLeads),
      claims: [],
      batches: [],
      importedKeys: new Set<string>(),
      points: new Map<string, ChargingPoint[]>(),
    };
  }
  return globalForDemo.__evDemoState;
}

/**
 * Demo data lives in memory, so Next.js would otherwise treat reads as static
 * and prerender them at build time. `connection()` marks them request-time.
 * Outside a render (e.g. in tests) it may throw, which is safe to ignore.
 */
async function dynamicRead() {
  try {
    await connection();
  } catch {
    /* not in a request scope */
  }
}

const clone = <T>(v: T): T => structuredClone(v);
const now = () => new Date().toISOString();

function uniqueSlug(name: string, excludeId?: string): string {
  const base = slugify(name) || "station";
  let slug = base;
  let i = 2;
  while (state().stations.some((s) => s.slug === slug && s.id !== excludeId)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

function rowToStation(r: Record<string, unknown>, publish: boolean): Station {
  const str = (k: string) => (typeof r[k] === "string" && r[k] !== "" ? (r[k] as string) : null);
  const num = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : null);
  const arr = <T,>(k: string) => (Array.isArray(r[k]) ? (r[k] as T[]) : []);
  const ts = now();
  const name = str("name") ?? "Unnamed station";
  return {
    id: crypto.randomUUID(),
    operatorId: null,
    name,
    slug: uniqueSlug(str("slug") ?? name),
    network: str("network") ?? "Unknown",
    address: str("address") ?? "",
    area: str("area"),
    district: str("district"),
    city: str("city") ?? "",
    state: str("state") ?? "",
    country: "India",
    latitude: num("latitude") ?? 0,
    longitude: num("longitude") ?? 0,
    connectorTypes: arr<Station["connectorTypes"][number]>("connector_types"),
    connectorCount: num("connector_count"),
    powerKw: num("power_kw"),
    price: null,
    priceUnit: "per_kwh",
    openingHours: str("opening_hours"),
    amenities: [],
    contactPhone: null,
    contactEmail: null,
    photoUrls: [],
    status: publish && r["eligibility"] === "B" ? "published" : "inactive",
    verificationStatus: "unverified",
    source: (str("source") ?? "bee") as Station["source"],
    rejectionReason: null,
    lastVerifiedAt: null,
    externalId: str("external_id"),
    vehicleClasses: arr<VehicleClass>("vehicle_classes"),
    sourceUrl: str("source_url"),
    sourceAttribution: str("source_attribution"),
    sourceDataAsOf: str("source_data_as_of"),
    lastEvidenceCheck: str("last_evidence_check"),
    locationQuality: r["location_quality"] === "suspect" ? "suspect" : "ok",
    nameIsDerived: r["name_is_derived"] === true,
    dataQualityScore: num("data_quality_score"),
    createdAt: ts,
    updatedAt: ts,
  };
}

export const demoStore: DataStore = {
  async searchStations(filters, page, pageSize) {
    await dynamicRead();
    const all = filterStations(state().stations, filters);
    const from = (page - 1) * pageSize;
    return { items: clone(all.slice(from, from + pageSize)), total: all.length, page, pageSize };
  },

  async mapPoints({ minLat, minLng, maxLat, maxLng, zoom, filters }) {
    await dynamicRead();
    const inBox = filterStations(state().stations, filters).filter(
      (s) => s.latitude >= minLat && s.latitude <= maxLat && s.longitude >= minLng && s.longitude <= maxLng,
    );
    return clusterStations(inBox, zoom);
  },

  async stateStats() {
    await dynamicRead();
    const by = new Map<string, import("@/lib/types").StateStat>();
    for (const s of state().stations) {
      const e = by.get(s.state) ?? { state: s.state, total: 0, published: 0, hidden: 0, pending: 0, verified: 0, sourceListed: 0, suspect: 0 };
      e.total++;
      if (s.status === "published") e.published++;
      if (s.status === "inactive") e.hidden++;
      if (s.status === "pending_review") e.pending++;
      if (s.status === "published" && s.verificationStatus === "verified") e.verified++;
      if (s.source === "bee" || s.source === "osm") e.sourceListed++;
      if (s.locationQuality === "suspect") e.suspect++;
      by.set(s.state, e);
    }
    return [...by.values()].sort((a, b) => a.state.localeCompare(b.state));
  },

  async operatorCounts() {
    await dynamicRead();
    const m = new Map<string, number>();
    for (const s of state().stations) if (s.status === "published") m.set(s.network, (m.get(s.network) ?? 0) + 1);
    return [...m.entries()].map(([network, stations]) => ({ network, stations })).sort((a, b) => b.stations - a.stations);
  },

  async getChargingPoints(stationId) {
    return clone(state().points.get(stationId) ?? []);
  },

  async getStationNames(ids) {
    const set = new Set(ids);
    return Object.fromEntries(state().stations.filter((s) => set.has(s.id)).map((s) => [s.id, s.name]));
  },

  async startImportBatch({ source, label, publishAs, total }) {
    const id = crypto.randomUUID();
    state().batches.unshift({ id, source, label, status: "running", total, inserted: 0, skipped: 0, failed: 0, publishAs, startedAt: now(), finishedAt: null });
    return id;
  },

  async importStationsChunk(_batchId, rows, publish) {
    let inserted = 0;
    let skipped = 0;
    for (const r of rows) {
      const key = `${r["source"]}:${r["external_id"]}`;
      if (state().importedKeys.has(key)) { skipped++; continue; }
      state().importedKeys.add(key);
      const st = rowToStation(r, publish);
      state().stations.push(st);
      const pts = Array.isArray(r["points"]) ? (r["points"] as Record<string, unknown>[]) : [];
      state().points.set(
        st.id,
        pts.map((p) => ({
          standard: p["standard"] as ChargingPoint["standard"],
          current: p["current"] as "AC" | "DC",
          powerKw: typeof p["power_kw"] === "number" ? p["power_kw"] : null,
          connectorCount: Number(p["connector_count"] ?? 1),
          vehicleClasses: (p["vehicle_classes"] as VehicleClass[]) ?? [],
        })),
      );
      inserted++;
    }
    return { inserted, skipped };
  },

  async finishImportBatch(batchId, status, totals) {
    const b = state().batches.find((x) => x.id === batchId);
    if (b) Object.assign(b, totals, { status, finishedAt: now() });
  },

  async listImportBatches(limit) {
    return clone(state().batches.slice(0, limit));
  },

  async bulkSetStatus({ source, state: st, from, to, limit }) {
    let n = 0;
    for (const s of state().stations) {
      if (n >= limit) break;
      if (s.source !== source || s.status !== from) continue;
      if (st && s.state !== st) continue;
      if (to === "published" && (s.locationQuality !== "ok" || s.source === "osm")) continue;
      s.status = to;
      s.updatedAt = now();
      n++;
    }
    return n;
  },

  async createClaim(input) {
    state().claims.unshift({ id: crypto.randomUUID(), stationId: input.stationId, claimantId: input.claimantId, companyName: input.companyName, contactEmail: input.contactEmail, contactPhone: input.contactPhone, evidence: input.evidence, status: "pending", reviewNote: null, createdAt: now() });
  },

  async listClaims(status) {
    return clone(state().claims.filter((c) => !status || c.status === status).map((c) => ({ ...c, stationName: state().stations.find((s) => s.id === c.stationId)?.name })));
  },

  async setClaimStatus(id, status, reviewNote) {
    const c = state().claims.find((x) => x.id === id);
    if (c) { c.status = status; c.reviewNote = reviewNote; }
  },

  async listPublishedStations(filters) {
    await dynamicRead();
    return clone(filterStations(state().stations, filters));
  },

  async getPublishedStation(idOrSlug) {
    await dynamicRead();
    const s = state().stations.find(
      (x) => (x.id === idOrSlug || x.slug === idOrSlug) && x.status === "published",
    );
    return s ? clone(s) : null;
  },

  async listRecentlyVerified(limit) {
    await dynamicRead();
    return clone(
      state()
        .stations.filter((s) => s.status === "published" && s.verificationStatus === "verified")
        .sort((a, b) => (b.lastVerifiedAt ?? "").localeCompare(a.lastVerifiedAt ?? ""))
        .slice(0, limit),
    );
  },

  async getFilterOptions() {
    await dynamicRead();
    return filterOptions(state().stations);
  },

  async listStationOptions() {
    await dynamicRead();
    return state()
      .stations.filter((s) => s.status === "published")
      .map((s) => ({ id: s.id, name: s.name, city: s.city }))
      .sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  },

  async getStationById(id) {
    await dynamicRead();
    const s = state().stations.find((x) => x.id === id);
    return s ? clone(s) : null;
  },

  async listStationsByOperator(operatorId) {
    await dynamicRead();
    return clone(
      state()
        .stations.filter((s) => s.operatorId === operatorId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  },

  async listAllStations(status) {
    await dynamicRead();
    return clone(
      state()
        .stations.filter((s) => !status || s.status === status)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  },

  async listReports(status) {
    await dynamicRead();
    const stations = state().stations;
    return clone(
      state()
        .reports.filter((r) => !status || r.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => ({
          ...r,
          stationName: stations.find((s) => s.id === r.stationId)?.name,
        })),
    );
  },

  async listOperators() {
    await dynamicRead();
    return demoOperators.map((o) => ({
      ...o,
      stationCount: state().stations.filter((s) => s.operatorId === o.id).length,
    }));
  },

  async listLeads(status) {
    await dynamicRead();
    return clone(
      state()
        .leads.filter((l) => !status || l.status === status)
        .sort((a, b) => a.city.localeCompare(b.city) || a.stationName.localeCompare(b.stationName)),
    );
  },

  async getLead(id) {
    await dynamicRead();
    const l = state().leads.find((x) => x.id === id);
    return l ? clone(l) : null;
  },

  async updateLead(id, patch) {
    const l = state().leads.find((x) => x.id === id);
    if (!l) return null;
    Object.assign(l, patch, { updatedAt: now() });
    return clone(l);
  },

  async getCounts() {
    await dynamicRead();
    const st = state().stations;
    const count = (fn: (s: Station) => boolean) => st.filter(fn).length;
    return {
      published: count((s) => s.status === "published"),
      pending: count((s) => s.status === "pending_review"),
      rejected: count((s) => s.status === "rejected"),
      inactive: count((s) => s.status === "inactive"),
      verified: count((s) => s.status === "published" && s.verificationStatus === "verified"),
      operators: demoOperators.length,
      openReports: state().reports.filter((r) => r.status === "open").length,
      pendingLeads: state().leads.filter((l) => l.status === "pending_review").length,
      pendingClaims: state().claims.filter((c) => c.status === "pending").length,
    };
  },

  async createStation(input, options) {
    const ts = now();
    const station: Station = {
      district: null,
      externalId: null,
      vehicleClasses: ["car"],
      sourceUrl: null,
      sourceAttribution: null,
      sourceDataAsOf: null,
      lastEvidenceCheck: null,
      locationQuality: "ok",
      nameIsDerived: false,
      dataQualityScore: null,
      ...input,
      id: crypto.randomUUID(),
      slug: uniqueSlug(input.name),
      country: "India",
      operatorId: options.operatorId,
      source: options.source,
      status: options.status ?? "pending_review",
      verificationStatus: options.verificationStatus ?? "unverified",
      lastVerifiedAt: options.lastVerifiedAt ?? null,
      rejectionReason: options.rejectionReason ?? null,
      createdAt: ts,
      updatedAt: ts,
    };
    state().stations.push(station);
    return clone(station);
  },

  async updateStation(id, input, patch = {}) {
    const st = state().stations;
    const idx = st.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const prev = st[idx];
    st[idx] = {
      ...prev,
      ...input,
      ...patch,
      slug: prev.name === input.name ? prev.slug : uniqueSlug(input.name, id),
      updatedAt: now(),
    };
    return clone(st[idx]);
  },

  async moderateStation(id, patch) {
    const st = state().stations;
    const idx = st.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    st[idx] = { ...st[idx], ...patch, updatedAt: now() };
    return clone(st[idx]);
  },

  async createReport(input) {
    const exists = state().stations.some(
      (s) => s.id === input.stationId && s.status === "published",
    );
    if (!exists) throw new DataStoreError("Station not found");
    state().reports.push({
      id: crypto.randomUUID(),
      stationId: input.stationId,
      reporterEmail: input.reporterEmail,
      issueType: input.issueType,
      description: input.description,
      status: "open",
      createdAt: now(),
    });
  },

  async setReportStatus(id, status) {
    const r = state().reports.find((x) => x.id === id);
    if (r) r.status = status;
  },
};
