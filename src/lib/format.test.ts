import { describe, expect, it } from "vitest";
import { safeNextPath } from "./auth/redirect";
import { directionsUrl, displayPrice, formatINR, formatKw, rawPrice, slugify } from "./format";

describe("formatINR", () => {
  it("uses the rupee symbol and Indian digit grouping", () => {
    expect(formatINR(18)).toBe("₹18");
    expect(formatINR(21.5)).toBe("₹21.5");
    expect(formatINR(125000)).toBe("₹1,25,000");
  });
});

describe("displayPrice", () => {
  it("shows prices only for verified stations", () => {
    expect(displayPrice({ price: 21, priceUnit: "per_kwh", verificationStatus: "verified" })).toBe("₹21/kWh");
    expect(displayPrice({ price: 21, priceUnit: "per_kwh", verificationStatus: "unverified" })).toBeNull();
  });

  it("handles free and per-session pricing", () => {
    expect(displayPrice({ price: 0, priceUnit: "free", verificationStatus: "verified" })).toBe("Free");
    expect(displayPrice({ price: 150, priceUnit: "per_session", verificationStatus: "verified" })).toBe("₹150/session");
    expect(displayPrice({ price: null, priceUnit: "per_kwh", verificationStatus: "verified" })).toBeNull();
  });

  it("rawPrice ignores verification (for operators/admins)", () => {
    expect(rawPrice({ price: 2, priceUnit: "per_minute" })).toBe("₹2/min");
  });
});

describe("misc formatting", () => {
  it("formats power", () => {
    expect(formatKw(60)).toBe("60 kW");
    expect(formatKw(7.4)).toBe("7.4 kW");
  });

  it("builds a Google Maps directions link", () => {
    expect(directionsUrl(19.06, 72.83)).toBe("https://www.google.com/maps/dir/?api=1&destination=19.06,72.83");
  });

  it("slugifies names", () => {
    expect(slugify("GreenPlug — Bandra West (Demo)")).toBe("greenplug-bandra-west-demo");
    expect(slugify("Café Señor")).toBe("cafe-senor");
  });
});

describe("safeNextPath", () => {
  it("allows only same-site relative paths", () => {
    expect(safeNextPath("/operator")).toBe("/operator");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(undefined, "/admin")).toBe("/admin");
  });
});
