/**
 * Research findings for imported station leads (see
 * data/research/*.json and docs/research/*.md). Used by the admin lead-review
 * screen to show evidence and to correct pre-filled values. Pure functions.
 */
import { CONNECTOR_TYPES, INDIAN_STATES, type ConnectorTypeId } from "../constants.ts";
import type { Station, StationLead } from "../types.ts";

export type ResearchDecision =
  | "listed_by_operator"
  | "corroborated_secondary"
  | "needs_correction"
  | "restricted_access"
  | "no_evidence_found";

export interface ResearchEvidence {
  url: string;
  kind: string;
  note: string;
}

export interface ResearchEntry {
  sourceRow: number;
  stationName: string;
  decision: ResearchDecision;
  decisionLabel: string;
  method: string;
  findings: string;
  evidence: ResearchEvidence[];
  coordinates: {
    latitude: number;
    longitude: number;
    source: string;
    precision: "operator_published" | "premises_only";
  } | null;
  prefill: { connectorTypes?: string[]; city?: string } | null;
  corrections: string[];
  missingBeforePublication: string[];
}

/** Finds the research entry for a lead: same CSV row and same station name. */
export function findResearch(entries: ResearchEntry[], lead: Pick<StationLead, "sourceRow" | "stationName">): ResearchEntry | null {
  if (lead.sourceRow === null) return null;
  return entries.find((e) => e.sourceRow === lead.sourceRow && e.stationName === lead.stationName) ?? null;
}

const KNOWN_CONNECTORS = new Set<string>(CONNECTOR_TYPES.map((c) => c.id));

/**
 * Starting values for the "create station from lead" form. Values come only
 * from the lead itself, plus research corrections. Coordinates are filled in
 * only when the operator itself published them — never from a guess.
 */
export function buildStationPrefill(lead: StationLead, research: ResearchEntry | null): Partial<Station> {
  const connectorTypes = (research?.prefill?.connectorTypes ?? lead.connectorTypes).filter((c) => KNOWN_CONNECTORS.has(c)) as ConnectorTypeId[];
  // A power figure is only pre-filled when research did not flag it as unconfirmed.
  const powerUnconfirmed = research?.missingBeforePublication.includes("power (kW)") ?? false;
  const operatorCoords = research?.coordinates?.precision === "operator_published" ? research.coordinates : null;
  return {
    name: lead.stationName,
    network: lead.operatorName ?? undefined,
    address: lead.address,
    city: research?.prefill?.city ?? lead.city,
    state: INDIAN_STATES.find((s) => s === lead.state),
    latitude: lead.latitude ?? operatorCoords?.latitude ?? undefined,
    longitude: lead.longitude ?? operatorCoords?.longitude ?? undefined,
    connectorTypes,
    powerKw: powerUnconfirmed ? undefined : (lead.powerKwMax ?? undefined),
    price: lead.tariffInrPerKwh ?? undefined,
    priceUnit: "per_kwh",
    amenities: [],
  } as Partial<Station>;
}
