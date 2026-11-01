import "server-only";
import { connection } from "next/server";
import { slugify } from "@/lib/format";
import { filterOptions, filterStations } from "@/lib/stations/search";
import type { Report, Station, StationLead } from "@/lib/types";
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
}

const globalForDemo = globalThis as unknown as { __evDemoState?: DemoState };

function state(): DemoState {
  if (!globalForDemo.__evDemoState) {
    globalForDemo.__evDemoState = {
      stations: structuredClone(demoStations),
      reports: structuredClone(demoReports),
      leads: structuredClone(demoLeads),
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

export const demoStore: DataStore = {
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
    };
  },

  async createStation(input, options) {
    const ts = now();
    const station: Station = {
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
