import { NextResponse, type NextRequest } from "next/server";
import { INDIA_BOUNDS } from "@/lib/constants";
import { getStore } from "@/lib/data";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { parseStationFilters } from "@/lib/validation/filters";

const num = (v: string | null, min: number, max: number) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

/** Clustered map markers for a bounding box. Public, cacheable, rate limited. */
export async function GET(req: NextRequest) {
  const rl = rateLimit(`map:${clientIp(req.headers)}`, 120, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  const sp = req.nextUrl.searchParams;
  const minLat = num(sp.get("minLat"), -90, 90);
  const maxLat = num(sp.get("maxLat"), -90, 90);
  const minLng = num(sp.get("minLng"), -180, 180);
  const maxLng = num(sp.get("maxLng"), -180, 180);
  const zoom = num(sp.get("zoom"), 1, 20);
  if (minLat === null || maxLat === null || minLng === null || maxLng === null || zoom === null || minLat >= maxLat || minLng >= maxLng) {
    return NextResponse.json({ error: "Invalid bounding box" }, { status: 400 });
  }
  const filters = parseStationFilters(Object.fromEntries(sp.entries()));
  // Round the box outward so near-identical viewports share a cache entry.
  const r = (x: number, f: (n: number) => number) => f(x * 50) / 50;
  try {
    const points = await getStore().mapPoints({
      minLat: Math.max(r(minLat, Math.floor), INDIA_BOUNDS.minLat - 1),
      minLng: Math.max(r(minLng, Math.floor), INDIA_BOUNDS.minLng - 1),
      maxLat: Math.min(r(maxLat, Math.ceil), INDIA_BOUNDS.maxLat + 1),
      maxLng: Math.min(r(maxLng, Math.ceil), INDIA_BOUNDS.maxLng + 1),
      zoom: Math.round(zoom),
      filters,
    });
    return NextResponse.json(
      { points },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (e) {
    console.error("[api/map]", e);
    return NextResponse.json({ error: "Map data is temporarily unavailable" }, { status: 503 });
  }
}
