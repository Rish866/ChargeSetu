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
export type StationSource = "operator" | "admin" | "community" | "demo";

export type ReportStatus = "open" | "resolved" | "dismissed";

export interface Station {
  id: string;
  operatorId: string | null;
  name: string;
  slug: string;
  /** Brand / charging network shown to drivers, e.g. "GreenPlug (Demo)". */
  network: string;
  address: string;
  area: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  connectorTypes: ConnectorTypeId[];
  connectorCount: number;
  powerKw: number;
  price: number | null;
  priceUnit: PriceUnitId;
  openingHours: string;
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
}

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
