import type { MapPoint, Station } from "@/lib/types";

/** Grid cell size in degrees for a zoom level — must match `station_map_points` in the migration. */
export function cellSize(zoom: number): number {
  return Math.max(180 / 2 ** (Math.min(Math.max(zoom, 3), 18) + 1), 0.0005);
}

/** Groups stations into grid clusters (single stations stay individual). Same output as the SQL function. */
export function clusterStations(stations: Station[], zoom: number, max = 800): MapPoint[] {
  const cell = cellSize(zoom);
  const groups = new Map<string, Station[]>();
  for (const s of stations) {
    const key = `${Math.floor(s.latitude / cell)}:${Math.floor(s.longitude / cell)}`;
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }
  const out: MapPoint[] = [];
  for (const g of groups.values()) {
    if (g.length === 1) {
      const s = g[0];
      out.push({ kind: "station", lat: s.latitude, lng: s.longitude, count: 1, id: s.id, slug: s.slug, name: s.name, powerKw: s.powerKw, verified: s.verificationStatus === "verified", vehicleClasses: s.vehicleClasses });
    } else {
      out.push({ kind: "cluster", lat: g.reduce((a, s) => a + s.latitude, 0) / g.length, lng: g.reduce((a, s) => a + s.longitude, 0) / g.length, count: g.length });
    }
  }
  return out.slice(0, max);
}
