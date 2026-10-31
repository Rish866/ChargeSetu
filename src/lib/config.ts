/**
 * Runtime configuration. Only NEXT_PUBLIC_* values are safe for the browser.
 * This app never needs the Supabase service-role key — all access goes
 * through the anon/publishable key and Row Level Security.
 */

export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

export function supabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    undefined
  );
}

/** True when both Supabase URL and public key are set. Otherwise: demo mode. */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}

/** Map can be disabled (e.g. for tile-provider policy reasons); the list always works. */
export function isMapEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MAP_ENABLED !== "false";
}

export const mapConfig = {
  tileUrl:
    process.env.NEXT_PUBLIC_MAP_TILE_URL ||
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  /** Geographic centre of India, used when no stations/location are known. */
  defaultCenter: [22.5, 79.0] as [number, number],
  defaultZoom: 5,
};

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}
