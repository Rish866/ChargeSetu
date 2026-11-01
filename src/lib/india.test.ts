import { describe, expect, it } from "vitest";
import { checkPublicSubmission, MIN_FILL_MS } from "./abuse";
import { areDemoRolesAllowed } from "./config";
import { parseIndianPhone, verificationFreshness } from "./india";

describe("parseIndianPhone", () => {
  it.each([
    ["9876543210", "+91 98765 43210"],
    ["+91 98765 43210", "+91 98765 43210"],
    ["+91-98765-43210", "+91 98765 43210"],
    ["919876543210", "+91 98765 43210"],
    ["098765 43210", "+91 98765 43210"],
    ["+91 6123456789", "+91 61234 56789"],
  ])("accepts mobile %s", (input, display) => {
    const p = parseIndianPhone(input);
    expect(p.ok && p.kind).toBe("mobile");
    expect(p.ok && p.display).toBe(display);
  });

  it("accepts landlines with STD code", () => {
    const p = parseIndianPhone("020 2612 3456");
    expect(p.ok && p.kind).toBe("landline");
    expect(p.ok && p.e164).toBe("+912026123456");
    expect(parseIndianPhone("+91 22 2345 6789").ok).toBe(true);
  });

  it("accepts toll-free numbers", () => {
    const p = parseIndianPhone("1800 123 4567");
    expect(p.ok && p.kind).toBe("tollfree");
  });

  it.each([
    "12345", // too short
    "5876543210", // 10 digits not starting 6–9, no +91
    "98765432101", // 11 digits without leading 0
    "+1 415 555 0100", // other country
    "+44 20 7946 0958",
    "call me",
    "98765abc10",
    "",
  ])("rejects %s", (input) => {
    expect(parseIndianPhone(input).ok).toBe(false);
  });
});

describe("verificationFreshness", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  it("labels never-verified", () => {
    expect(verificationFreshness(null, now).state).toBe("never");
    expect(verificationFreshness("not a date", now).state).toBe("never");
  });
  it("describes recent verification in days", () => {
    expect(verificationFreshness("2026-11-01T08:00:00Z", now).label).toBe("Verified today");
    expect(verificationFreshness("2026-10-31T08:00:00Z", now).label).toBe("Verified yesterday");
    const f = verificationFreshness("2026-10-12T06:30:00Z", now);
    expect(f.label).toBe("Verified 20 days ago");
    expect(f.state).toBe("fresh");
  });
  it("flags data older than 180 days as stale", () => {
    const f = verificationFreshness("2026-03-01T00:00:00Z", now);
    expect(f.state).toBe("stale");
    expect(f.label).toMatch(/months ago/);
  });
});

describe("checkPublicSubmission", () => {
  const now = 1_800_000_000_000;
  const fd = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };
  it("accepts a normal human submission", () => {
    expect(checkPublicSubmission(fd({ startedAt: String(now - 20_000), website: "" }), now)).toBe("ok");
  });
  it("flags honeypot, too-fast and future timestamps as bots", () => {
    expect(checkPublicSubmission(fd({ startedAt: String(now - 20_000), website: "spam.example" }), now)).toBe("bot");
    expect(checkPublicSubmission(fd({ startedAt: String(now - MIN_FILL_MS + 1) }), now)).toBe("bot");
    expect(checkPublicSubmission(fd({ startedAt: String(now + 3_600_000) }), now)).toBe("bot");
  });
  it("asks for JavaScript when the timestamp is missing", () => {
    expect(checkPublicSubmission(fd({}), now)).toBe("no-timestamp");
    expect(checkPublicSubmission(fd({ startedAt: "0" }), now)).toBe("no-timestamp");
  });
});

describe("areDemoRolesAllowed", () => {
  it("allows the role picker only in local development or with explicit opt-in", () => {
    expect(areDemoRolesAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(areDemoRolesAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(areDemoRolesAllowed({ NODE_ENV: "production", ALLOW_DEMO_ROLES: "true" })).toBe(true);
  });
  it("never allows demo roles once Supabase is configured", () => {
    const sb = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" };
    expect(areDemoRolesAllowed({ ...sb, NODE_ENV: "development" })).toBe(false);
    expect(areDemoRolesAllowed({ ...sb, NODE_ENV: "production", ALLOW_DEMO_ROLES: "true" })).toBe(false);
  });
});
