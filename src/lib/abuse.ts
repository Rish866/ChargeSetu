/**
 * Cheap, privacy-friendly bot checks for public forms. These stop naive bots;
 * they are not a substitute for a CAPTCHA or rate limiting at the edge.
 */

/** Minimum time a human plausibly needs to fill in the report form. */
export const MIN_FILL_MS = 3000;

export type SubmissionCheck = "ok" | "bot" | "no-timestamp";

export function checkPublicSubmission(formData: FormData, now: number = Date.now()): SubmissionCheck {
  // Honeypot: hidden from people and assistive tech; bots fill it in.
  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot.trim() !== "") return "bot";

  // Timing: the browser stamps when the form appeared.
  const raw = formData.get("startedAt");
  const startedAt = Number(raw);
  if (raw === null || !Number.isFinite(startedAt) || startedAt <= 0) return "no-timestamp";
  if (startedAt > now + 60_000) return "bot"; // from the future = tampered
  if (now - startedAt < MIN_FILL_MS) return "bot";
  return "ok";
}
