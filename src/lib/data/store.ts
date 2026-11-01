import type { StationWithDistance } from "@/lib/stations/search";
import type {
  DashboardCounts,
  Operator,
  Report,
  ReportStatus,
  Station,
  StationSource,
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

export interface OperatorSummary extends Operator {
  stationCount: number;
}

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

  // ---- Privileged reads ----
  getStationById(id: string): Promise<Station | null>;
  listStationsByOperator(operatorId: string): Promise<Station[]>;
  listAllStations(status?: StationStatus): Promise<Station[]>;
  listReports(status?: ReportStatus): Promise<Report[]>;
  listOperators(): Promise<OperatorSummary[]>;
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
