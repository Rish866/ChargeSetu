/**
 * Shared reference data. Labels are English for now; translated labels live in
 * the i18n dictionaries keyed by these ids.
 */

export const CONNECTOR_TYPES = [
  { id: "ccs2", label: "CCS2", current: "DC" },
  { id: "chademo", label: "CHAdeMO", current: "DC" },
  { id: "type2", label: "Type 2", current: "AC" },
  { id: "gbt", label: "GB/T", current: "DC" },
  { id: "bharat_ac001", label: "Bharat AC-001", current: "AC" },
  { id: "bharat_dc001", label: "Bharat DC-001", current: "DC" },
  { id: "type7_lecct", label: "Type 7 / LECCS (2W/3W)", current: "DC" },
  { id: "15a_socket", label: "15A socket (2W/3W)", current: "AC" },
] as const;

export type ConnectorTypeId = (typeof CONNECTOR_TYPES)[number]["id"];
export const CONNECTOR_TYPE_IDS = CONNECTOR_TYPES.map((c) => c.id) as [
  ConnectorTypeId,
  ...ConnectorTypeId[],
];

export const AMENITIES = [
  { id: "parking", label: "Parking" },
  { id: "restroom", label: "Restroom" },
  { id: "cafe", label: "Café / food" },
  { id: "wifi", label: "Wi-Fi" },
  { id: "waiting_area", label: "Waiting area" },
  { id: "shopping", label: "Shopping nearby" },
  { id: "wheelchair_access", label: "Wheelchair accessible" },
  { id: "security", label: "Security / CCTV" },
] as const;

export type AmenityId = (typeof AMENITIES)[number]["id"];
export const AMENITY_IDS = AMENITIES.map((a) => a.id) as [
  AmenityId,
  ...AmenityId[],
];

export const PRICE_UNITS = [
  { id: "per_kwh", label: "per kWh", short: "/kWh" },
  { id: "per_minute", label: "per minute", short: "/min" },
  { id: "per_hour", label: "per hour", short: "/hr" },
  { id: "per_session", label: "per session", short: "/session" },
  { id: "free", label: "Free", short: "" },
] as const;

export type PriceUnitId = (typeof PRICE_UNITS)[number]["id"];
export const PRICE_UNIT_IDS = PRICE_UNITS.map((p) => p.id) as [
  PriceUnitId,
  ...PriceUnitId[],
];

export const ISSUE_TYPES = [
  { id: "closed_permanently", label: "Station closed permanently" },
  { id: "wrong_location", label: "Wrong location / address" },
  { id: "wrong_connectors", label: "Wrong connector or power details" },
  { id: "wrong_price", label: "Wrong price" },
  { id: "wrong_hours", label: "Wrong opening hours" },
  { id: "not_working", label: "Chargers not working" },
  { id: "other", label: "Something else" },
] as const;

export type IssueTypeId = (typeof ISSUE_TYPES)[number]["id"];
export const ISSUE_TYPE_IDS = ISSUE_TYPES.map((i) => i.id) as [
  IssueTypeId,
  ...IssueTypeId[],
];

/** Minimum-power filter options shown to drivers. */
export const POWER_FILTERS = [
  { value: 0, label: "Any power" },
  { value: 7, label: "7 kW+ (AC)" },
  { value: 25, label: "25 kW+ (DC fast)" },
  { value: 50, label: "50 kW+ (DC fast)" },
  { value: 100, label: "100 kW+ (ultra-fast)" },
] as const;

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

/** Popular areas promoted on the landing page (links into the directory). */
export const POPULAR_AREAS = [
  { city: "Mumbai", area: "Bandra West" },
  { city: "Pune", area: "Hinjawadi" },
  { city: "Bengaluru", area: "Whitefield" },
  { city: "Delhi", area: "Connaught Place" },
  { city: "Hyderabad", area: "HITEC City" },
  { city: "Chennai", area: "OMR" },
] as const;

/** Approximate bounding box for India, used to sanity-check coordinates. */
export const INDIA_BOUNDS = {
  minLat: 6.0,
  maxLat: 37.6,
  minLng: 68.0,
  maxLng: 97.5,
} as const;

/**
 * No data source in this MVP provides real-time charger availability.
 * Flip this only once an operator integration genuinely supplies live status.
 */
export const LIVE_AVAILABILITY_CONNECTED = false;

export function connectorLabel(id: string): string {
  return CONNECTOR_TYPES.find((c) => c.id === id)?.label ?? id;
}

export function connectorCurrent(id: string): "AC" | "DC" | undefined {
  return CONNECTOR_TYPES.find((c) => c.id === id)?.current;
}

export function amenityLabel(id: string): string {
  return AMENITIES.find((a) => a.id === id)?.label ?? id;
}

export function issueTypeLabel(id: string): string {
  return ISSUE_TYPES.find((i) => i.id === id)?.label ?? id;
}

export function priceUnitShort(id: string): string {
  return PRICE_UNITS.find((p) => p.id === id)?.short ?? "";
}
