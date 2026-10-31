import type { StationFilters } from "@/lib/validation/filters";
import type { Station } from "@/lib/types";

export interface StationWithDistance extends Station {
  distanceKm?: number;
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two coordinates in kilometres. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const norm = (s: string) => s.toLocaleLowerCase("en-IN").trim();

/** True if every word of the query appears in the station's searchable text. */
export function matchesQuery(station: Station, q: string): boolean {
  const haystack = norm(
    [station.name, station.network, station.address, station.area, station.city, station.state].join(" "),
  );
  return norm(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * Applies directory filters to a list of stations. Only `published` stations
 * are ever returned — this is the single gate for what the public sees.
 * When a location is supplied, results gain `distanceKm` and are sorted by it.
 */
export function filterStations(
  stations: Station[],
  filters: StationFilters,
): StationWithDistance[] {
  const result: StationWithDistance[] = stations.filter((s) => {
    if (s.status !== "published") return false;
    if (filters.q && !matchesQuery(s, filters.q)) return false;
    if (filters.city && norm(s.city) !== norm(filters.city)) return false;
    if (filters.network && norm(s.network) !== norm(filters.network)) return false;
    if (filters.connector && !s.connectorTypes.includes(filters.connector)) return false;
    if (filters.minPower && s.powerKw < filters.minPower) return false;
    return true;
  });

  if (filters.lat !== undefined && filters.lng !== undefined) {
    const origin = { lat: filters.lat, lng: filters.lng };
    return result
      .map((s) => ({
        ...s,
        distanceKm: haversineKm(origin, { lat: s.latitude, lng: s.longitude }),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  return result.sort(
    (a, b) =>
      a.city.localeCompare(b.city) ||
      a.area.localeCompare(b.area) ||
      a.name.localeCompare(b.name),
  );
}

/** Distinct, sorted values for filter dropdowns, from published stations. */
export function filterOptions(stations: Station[]) {
  const published = stations.filter((s) => s.status === "published");
  const uniq = (xs: string[]) =>
    Array.from(new Set(xs)).sort((a, b) => a.localeCompare(b));
  return {
    cities: uniq(published.map((s) => s.city)),
    networks: uniq(published.map((s) => s.network)),
  };
}
