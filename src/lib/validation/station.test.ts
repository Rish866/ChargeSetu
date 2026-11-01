import { describe, expect, it } from "vitest";
import { parseStationForm } from "./station";

function form(overrides: Record<string, string | string[] | undefined> = {}) {
  const base: Record<string, string | string[]> = {
    name: "GreenPlug Phoenix Mall",
    network: "GreenPlug",
    address: "Level B1, Phoenix Mall, Lower Parel",
    area: "Lower Parel",
    city: "Mumbai",
    state: "Maharashtra",
    latitude: "18.9947",
    longitude: "72.8258",
    connectorTypes: ["ccs2", "type2"],
    connectorCount: "4",
    powerKw: "60",
    price: "21.5",
    priceUnit: "per_kwh",
    openingHours: "24 hours",
    amenities: ["parking"],
    contactPhone: "+91 98765 43210",
    contactEmail: "",
    photoUrls: "",
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...base, ...overrides })) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  }
  return fd;
}

describe("parseStationForm", () => {
  it("accepts a complete valid submission and normalises values", () => {
    const r = parseStationForm(form());
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.latitude).toBe(18.9947);
    expect(r.data.connectorCount).toBe(4);
    expect(r.data.price).toBe(21.5);
    expect(r.data.connectorTypes).toEqual(["ccs2", "type2"]);
    expect(r.data.contactEmail).toBeNull();
    expect(r.data.photoUrls).toEqual([]);
    expect(r.data.contactPhone).toBe("+91 98765 43210");
  });

  it("normalises Indian phone formats and rejects foreign numbers", () => {
    const r = parseStationForm(form({ contactPhone: "098765-43210" }));
    expect(r.success && r.data.contactPhone).toBe("+91 98765 43210");
    const foreign = parseStationForm(form({ contactPhone: "+1 415 555 0100" }));
    expect(foreign.success).toBe(false);
    if (!foreign.success) expect(foreign.fieldErrors.contactPhone?.[0]).toMatch(/Indian number/);
  });

  it("rejects coordinates outside India", () => {
    const r = parseStationForm(form({ latitude: "51.5", longitude: "-0.12" }));
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.fieldErrors.latitude?.[0]).toMatch(/within India/);
    expect(r.fieldErrors.longitude?.[0]).toMatch(/within India/);
  });

  it("requires at least one known connector type", () => {
    const none = parseStationForm(form({ connectorTypes: [] }));
    expect(none.success).toBe(false);
    if (!none.success) expect(none.fieldErrors.connectorTypes?.[0]).toMatch(/at least one/);

    const unknown = parseStationForm(form({ connectorTypes: ["tesla_nacs"] }));
    expect(unknown.success).toBe(false);
  });

  it("de-duplicates connectors and amenities", () => {
    const r = parseStationForm(form({ connectorTypes: ["ccs2", "ccs2"], amenities: ["wifi", "wifi"] }));
    expect(r.success && r.data.connectorTypes).toEqual(["ccs2"]);
    expect(r.success && r.data.amenities).toEqual(["wifi"]);
  });

  it("requires a price unless the unit is free", () => {
    const missing = parseStationForm(form({ price: "" }));
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.fieldErrors.price?.[0]).toMatch(/Enter a price/);

    const free = parseStationForm(form({ price: "", priceUnit: "free" }));
    expect(free.success).toBe(true);
    if (free.success) expect(free.data.price).toBe(0);
  });

  it("rejects negative prices, zero power and fractional connector counts", () => {
    const r = parseStationForm(form({ price: "-1", powerKw: "0", connectorCount: "2.5" }));
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.fieldErrors.price).toBeDefined();
    expect(r.fieldErrors.powerKw).toBeDefined();
    expect(r.fieldErrors.connectorCount).toBeDefined();
  });

  it("gives a friendly error for non-numeric numbers", () => {
    const r = parseStationForm(form({ powerKw: "fast" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.fieldErrors.powerKw?.[0]).toMatch(/must be a number/);
  });

  it("only accepts known Indian states/UTs", () => {
    const r = parseStationForm(form({ state: "California" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.fieldErrors.state).toBeDefined();
  });

  it("validates phone and email when provided", () => {
    const r = parseStationForm(form({ contactPhone: "call me", contactEmail: "nope" }));
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.fieldErrors.contactPhone).toBeDefined();
    expect(r.fieldErrors.contactEmail).toBeDefined();
  });

  it("parses photo URLs one per line and requires https", () => {
    const ok = parseStationForm(form({ photoUrls: "https://example.com/a.jpg\n\n https://example.com/b.jpg " }));
    expect(ok.success && ok.data.photoUrls).toEqual(["https://example.com/a.jpg", "https://example.com/b.jpg"]);

    const insecure = parseStationForm(form({ photoUrls: "http://example.com/a.jpg" }));
    expect(insecure.success).toBe(false);

    const script = parseStationForm(form({ photoUrls: "javascript:alert(1)" }));
    expect(script.success).toBe(false);
  });

  it("reports every problem at once (a bad phone doesn't hide the price error)", () => {
    const r = parseStationForm(form({ latitude: "51.5", contactPhone: "+1 415 555 0100", price: "" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(r.fieldErrors).sort()).toEqual(["contactPhone", "latitude", "price"]);
  });

  it("echoes submitted values so the form can be re-filled", () => {
    const r = parseStationForm(form({ latitude: "999" }));
    expect(r.success).toBe(false);
    expect(r.values.name).toBe("GreenPlug Phoenix Mall");
    expect(r.values.connectorTypes).toEqual(["ccs2", "type2"]);
  });

  it("trims whitespace and enforces minimum lengths", () => {
    const r = parseStationForm(form({ name: "  A  " }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.fieldErrors.name?.[0]).toMatch(/at least 3/);
  });
});
