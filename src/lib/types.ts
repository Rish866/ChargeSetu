import type {
  AmenityId,
  ConnectorTypeId,
  IssueTypeId,
  PriceUnitId,
} from "@/lib/constants";

export type Role = "customer" | "operator" | "admin";

export type StationStatus =
  | "pending_review"
  | "published"
  | "rejected"
  | "inactive";

export type VerificationStatus = "unverified" | "verified";

/** Where a station record came from. `demo` = fictional sample data. */
export type StationSource = "operator" | "admin" | "community" | "demo" | "bee" | "osm";
export type VehicleClass = "car" | "two_three_wheeler";
export type LocationQuality = "ok" | "suspect";

export type ReportStatus = "open" | "resolved" | "dismissed";

export interface Station {
  id: string;
  operatorId: string | null;
  name: string;
  slug: string;
  /** Brand / charging network shown to drivers, e.g. "GreenPlug (Demo)". */
  network: string;
  address: string;
  /** Locality. Null when the source does not give one (never guessed). */
  area: string | null;
  district: string | null;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  connectorTypes: ConnectorTypeId[];
  /** Null = unknown. Unknown values are shown as "not provided", never invented. */
  connectorCount: number | null;
  powerKw: number | null;
  price: number | null;
  priceUnit: PriceUnitId;
  openingHours: string | null;
  amenities: AmenityId[];
  contactPhone: string | null;
  contactEmail: string | null;
  photoUrls: string[];
  status: StationStatus;
  verificationStatus: VerificationStatus;
  source: StationSource;
  rejectionReason: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // --- Provenance and freshness (imported / source-listed stations) ---
  externalId: string | null;
  vehicleClasses: VehicleClass[];
  sourceUrl: string | null;
  sourceAttribution: string | null;
  sourceDataAsOf: string | null;
  lastEvidenceCheck: string | null;
  locationQuality: LocationQuality;
  nameIsDerived: boolean;
  dataQualityScore: number | null;
}

/** One group of identical connectors at a station. */
export interface ChargingPoint {
  standard: ConnectorTypeId;
  current: "AC" | "DC";
  powerKw: number | null;
  connectorCount: number;
  vehicleClasses: VehicleClass[];
}

export interface StateStat {
  state: string;
  total: number;
  published: number;
  hidden: number;
  pending: number;
  verified: number;
  sourceListed: number;
  suspect: number;
}

export interface MapPoint {
  kind: "cluster" | "station";
  lat: number;
  lng: number;
  count: number;
  id?: string;
  slug?: string;
  name?: string;
  powerKw?: number | null;
  verified?: boolean;
  vehicleClasses?: VehicleClass[];
}

export interface ImportBatch {
  id: string;
  source: string;
  label: string;
  status: "running" | "completed" | "failed";
  total: number;
  inserted: number;
  skipped: number;
  failed: number;
  publishAs: "inactive" | "published";
  startedAt: string;
  finishedAt: string | null;
}

export type ClaimStatus = "pending" | "approved" | "rejected";
export interface StationClaim {
  id: string;
  stationId: string;
  stationName?: string;
  claimantId: string;
  companyName: string;
  contactEmail: string;
  contactPhone: string | null;
  evidence: string;
  status: ClaimStatus;
  reviewNote: string | null;
  createdAt: string;
}

/** How a station's information should be described to drivers. */
export type ListingLevel = "verified" | "source_listed" | "submitted";

export interface Operator {
  id: string;
  profileId: string;
  companyName: string;
  contactEmail: string;
  contactPhone: string | null;
  createdAt: string;
}

export interface Report {
  id: string;
  stationId: string;
  stationName?: string;
  reporterEmail: string | null;
  issueType: IssueTypeId;
  description: string;
  status: ReportStatus;
  createdAt: string;
}

/** The signed-in user as seen by server code. Never trust this on the client. */
export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  operatorId: string | null;
  isDemo: boolean;
}

export interface DashboardCounts {
  published: number;
  pending: number;
  rejected: number;
  inactive: number;
  verified: number;
  operators: number;
  openReports: number;
  pendingLeads: number;
  pendingClaims: number;
}

export type LeadStatus = "pending_review" | "converted" | "rejected" | "duplicate";

/**
 * A candidate station from a directory/article/operator site. Admin-only,
 * never public, never verified. Missing values are null — never guessed.
 */
export interface StationLead {
  id: string;
  importBatch: string;
  sourceRow: number | null;
  stationName: string;
  operatorName: string | null;
  address: string;
  city: string;
  state: string;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  connectorTypes: ConnectorTypeId[];
  connectorTypesRaw: string | null;
  powerKwMax: number | null;
  powerKwRaw: string | null;
  tariffInrPerKwh: number | null;
  accessNotes: string | null;
  sourceUrl: string;
  notes: string | null;
  missingFields: string[];
  qualityFlags: string[];
  status: LeadStatus;
  stationId: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Shared shape returned by form server actions (used with useActionState). */
export interface FormState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Raw submitted values, echoed back so the form keeps user input on error. */
  values?: Record<string, string | string[]>;
}

export const initialFormState: FormState = { status: "idle" };
