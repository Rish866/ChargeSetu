import type { StationWithDistance } from "@/lib/stations/search";
import type {
  ChargingPoint,
  ClaimStatus,
  ImportBatch,
  MapPoint,
  StateStat,
  StationClaim,
  DashboardCounts,
  LeadStatus,
  Operator,
  Report,
  ReportStatus,
  Station,
  StationSource,
  StationLead,
  StationStatus,
  VerificationStatus,
} from "@/lib/types";
import type { StationFilters } from "@/lib/validation/filters";
import type { ReportInput } from "@/lib/validation/report";
import type { StationInput } from "@/lib/validation/station";

export interface ModerationPatch {
  status?: StationStatus;
  verificationStatus?: VerificationStatus;
  lastVerifiedAt?: string | null;
  rejectionReason?: string | null;
}

export interface CreateStationOptions extends ModerationPatch {
  operatorId: string | null;
  source: StationSource;
}

export interface LeadPatch {
  status?: LeadStatus;
  reviewNote?: string | null;
  stationId?: string | null;
}

export interface OperatorSummary extends Operator {
  stationCount: number;
}

export interface SearchResult {
  items: StationWithDistance[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MapQuery {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  zoom: number;
  filters: StationFilters;
}

/** One row of the nationwide import file, in the shape `import_stations_batch` expects. */
export type ImportRow = Record<string, unknown>;

export interface StationOption {
  id: string;
  name: string;
  city: string;
}

/**
 * Data access contract. Two implementations exist:
 *  - `demo-store.ts`   in-memory fictional data (no setup needed)
 *  - `supabase-store.ts` Postgres via Supabase, protected by RLS
 *
 * Methods marked "privileged" do not check permissions themselves — callers
 * (server actions / pages) must authorize first via `src/lib/auth`.
 * In Supabase mode RLS is a second line of defence.
 */
export interface DataStore {
  // ---- Public reads (published stations only) ----
  listPublishedStations(filters: StationFilters): Promise<StationWithDistance[]>;
  getPublishedStation(idOrSlug: string): Promise<Station | null>;
  listRecentlyVerified(limit: number): Promise<Station[]>;
  getFilterOptions(): Promise<{ cities: string[]; networks: string[] }>;
  listStationOptions(): Promise<StationOption[]>;

  /** Paginated, filtered search used by the directory. Scales to tens of thousands of rows. */
  searchStations(filters: StationFilters, page: number, pageSize: number): Promise<SearchResult>;
  /** Clustered map markers inside a bounding box. */
  mapPoints(query: MapQuery): Promise<MapPoint[]>;
  stateStats(): Promise<StateStat[]>;
  operatorCounts(): Promise<{ network: string; stations: number }[]>;
  getChargingPoints(stationId: string): Promise<ChargingPoint[]>;
  getStationNames(ids: string[]): Promise<Record<string, string>>;

  // ---- Admin: bulk import ----
  startImportBatch(input: { source: string; label: string; publishAs: "inactive" | "published"; total: number; userId: string }): Promise<string>;
  importStationsChunk(batchId: string, rows: ImportRow[], publish: boolean): Promise<{ inserted: number; skipped: number }>;
  finishImportBatch(batchId: string, status: "completed" | "failed", totals: { inserted: number; skipped: number; failed: number }): Promise<void>;
  listImportBatches(limit: number): Promise<ImportBatch[]>;
  /** Moves up to `limit` stations of a source/state between inactive and published. Returns rows changed. */
  bulkSetStatus(args: { source: string; state: string | null; from: StationStatus; to: StationStatus; limit: number }): Promise<number>;

  // ---- Ownership claims ----
  createClaim(input: { stationId: string; claimantId: string; companyName: string; contactEmail: string; contactPhone: string | null; evidence: string }): Promise<void>;
  listClaims(status?: ClaimStatus): Promise<StationClaim[]>;
  setClaimStatus(id: string, status: ClaimStatus, reviewNote: string | null): Promise<void>;

  // ---- Privileged reads ----
  getStationById(id: string): Promise<Station | null>;
  listStationsByOperator(operatorId: string): Promise<Station[]>;
  listAllStations(status?: StationStatus): Promise<Station[]>;
  listReports(status?: ReportStatus): Promise<Report[]>;
  listOperators(): Promise<OperatorSummary[]>;
  listLeads(status?: LeadStatus): Promise<StationLead[]>;
  getLead(id: string): Promise<StationLead | null>;
  updateLead(id: string, patch: LeadPatch): Promise<StationLead | null>;
  getCounts(): Promise<DashboardCounts>;

  // ---- Writes ----
  createStation(input: StationInput, options: CreateStationOptions): Promise<Station>;
  updateStation(id: string, input: StationInput, patch?: ModerationPatch): Promise<Station | null>;
  moderateStation(id: string, patch: ModerationPatch): Promise<Station | null>;
  createReport(input: ReportInput): Promise<void>;
  setReportStatus(id: string, status: ReportStatus): Promise<void>;
}

export class DataStoreError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DataStoreError";
  }
}
