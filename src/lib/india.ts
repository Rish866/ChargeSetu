/**
 * India-specific helpers: phone numbers and data freshness.
 */

export type IndianPhone =
  | { ok: true; kind: "mobile" | "landline" | "tollfree"; e164: string; display: string }
  | { ok: false };

/**
 * Validates and normalises an Indian phone number.
 *  - Mobile: 10 digits starting 6–9, optional +91 / 91 / 0 prefix
 *  - Landline: 0 + STD code + number = 11 digits (or +91 and 10 digits not starting 6–9)
 *  - Toll-free: 1800 / 1860 followed by 6–7 digits
 * Separators (spaces, dashes, dots, brackets) are ignored.
 */
export function parseIndianPhone(input: string): IndianPhone {
  const raw = input.trim();
  if (!/^[+\d][\d\s().-]*$/.test(raw)) return { ok: false };
  let digits = raw.replace(/\D/g, "");

  if (/^18[06]0\d{6,7}$/.test(digits)) {
    return { ok: true, kind: "tollfree", e164: digits, display: `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` };
  }

  const hadCountryCode = raw.startsWith("+91") || (digits.length === 12 && digits.startsWith("91"));
  if (hadCountryCode) digits = digits.slice(2);
  else if (raw.startsWith("+")) return { ok: false }; // other country codes

  if (digits.length === 11 && digits.startsWith("0")) {
    const national = digits.slice(1);
    if (/^[6-9]/.test(national)) {
      return { ok: true, kind: "mobile", e164: `+91${national}`, display: `+91 ${national.slice(0, 5)} ${national.slice(5)}` };
    }
    if (/^[1-9]\d{9}$/.test(national)) {
      return { ok: true, kind: "landline", e164: `+91${national}`, display: `0${national}` };
    }
    return { ok: false };
  }

  if (digits.length !== 10) return { ok: false };
  if (/^[6-9]\d{9}$/.test(digits)) {
    return { ok: true, kind: "mobile", e164: `+91${digits}`, display: `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` };
  }
  // 10 digits not starting 6–9 is only a landline when written with +91.
  if (hadCountryCode && /^[1-5]\d{9}$/.test(digits)) {
    return { ok: true, kind: "landline", e164: `+91${digits}`, display: `+91 ${digits}` };
  }
  return { ok: false };
}

export const STALE_AFTER_DAYS = 180;

export type Freshness =
  | { state: "never"; label: string }
  | { state: "fresh" | "stale"; days: number; label: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long ago a station was verified, in plain words. */
export function verificationFreshness(lastVerifiedAt: string | null, now: Date = new Date()): Freshness {
  if (!lastVerifiedAt) return { state: "never", label: "Never verified" };
  const then = new Date(lastVerifiedAt).getTime();
  if (Number.isNaN(then)) return { state: "never", label: "Never verified" };
  const days = Math.max(0, Math.floor((now.getTime() - then) / DAY_MS));
  const ago =
    days === 0 ? "today" : days === 1 ? "yesterday" : days < 60 ? `${days} days ago` : `${Math.round(days / 30)} months ago`;
  return {
    state: days > STALE_AFTER_DAYS ? "stale" : "fresh",
    days,
    label: `Verified ${ago}`,
  };
}
