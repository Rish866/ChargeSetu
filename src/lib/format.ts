import { priceUnitShort } from "@/lib/constants";
import type { Station } from "@/lib/types";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** Formats a rupee amount, e.g. 18 -> "₹18", 1250.5 -> "₹1,250.5". */
export function formatINR(amount: number): string {
  return inrFormatter.format(amount);
}

/**
 * Returns a display price only if the station's details are verified.
 * Unverified prices are never shown to drivers as fact.
 */
export function displayPrice(
  station: Pick<Station, "price" | "priceUnit" | "verificationStatus">,
): string | null {
  if (station.verificationStatus !== "verified") return null;
  if (station.priceUnit === "free") return "Free";
  if (station.price === null || Number.isNaN(station.price)) return null;
  return `${formatINR(station.price)}${priceUnitShort(station.priceUnit)}`;
}

/** Formats a price regardless of verification (for operator/admin views). */
export function rawPrice(
  station: Pick<Station, "price" | "priceUnit">,
): string {
  if (station.priceUnit === "free") return "Free";
  if (station.price === null) return "—";
  return `${formatINR(station.price)}${priceUnitShort(station.priceUnit)}`;
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dateFormatter.format(d);
}

export function formatKw(kw: number | null | undefined): string {
  if (kw === null || kw === undefined) return "Power not provided";
  return `${Number.isInteger(kw) ? kw : kw.toFixed(1)} kW`;
}

export function formatDistanceKm(km: number): string {
  return km < 10 ? km.toFixed(1) : Math.round(km).toString();
}

/** Google Maps directions deep link (works on Android, iOS and desktop). */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function osmUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

/** URL-safe slug, e.g. "VoltHub — Bandra West" -> "volthub-bandra-west". */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
