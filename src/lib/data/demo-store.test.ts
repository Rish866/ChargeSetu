import { beforeEach, describe, expect, it, vi } from "vitest";

// `connection()` only works inside a Next.js request; stub it for unit tests.
vi.mock("next/server", () => ({ connection: async () => {} }));

const validInput = {
  name: "Unit Test Station",
  network: "TestNet",
  address: "1 Test Road, Test Nagar",
  area: "Test Nagar",
  city: "Pune",
  state: "Maharashtra" as const,
  latitude: 18.5,
  longitude: 73.8,
  connectorTypes: ["ccs2" as const],
  connectorCount: 2,
  powerKw: 30,
  price: 18,
  priceUnit: "per_kwh" as const,
  openingHours: "24 hours",
  amenities: [],
  contactPhone: null,
  contactEmail: null,
  photoUrls: [],
};

describe("demo store moderation workflow", () => {
  beforeEach(() => {
    // Fresh in-memory state per test.
    delete (globalThis as { __evDemoState?: unknown }).__evDemoState;
    vi.resetModules();
  });

  it("keeps new submissions out of public results until approved", async () => {
    const { demoStore } = await import("./demo-store");
    const created = await demoStore.createStation(validInput, {
      operatorId: "op-1",
      source: "operator",
      status: "pending_review",
    });
    expect(created.status).toBe("pending_review");
    expect(await demoStore.getPublishedStation(created.id)).toBeNull();
    expect((await demoStore.listPublishedStations({ q: "Unit Test Station" })).length).toBe(0);

    await demoStore.moderateStation(created.id, { status: "published" });
    expect((await demoStore.getPublishedStation(created.slug))?.id).toBe(created.id);
    expect((await demoStore.listPublishedStations({ q: "Unit Test Station" })).length).toBe(1);
  });

  it("generates unique slugs for duplicate names", async () => {
    const { demoStore } = await import("./demo-store");
    const a = await demoStore.createStation(validInput, { operatorId: null, source: "admin" });
    const b = await demoStore.createStation(validInput, { operatorId: null, source: "admin" });
    expect(a.slug).not.toBe(b.slug);
  });

  it("only accepts reports for published stations", async () => {
    const { demoStore } = await import("./demo-store");
    const pending = (await demoStore.listAllStations("pending_review"))[0];
    await expect(
      demoStore.createReport({ stationId: pending.id, issueType: "other", description: "x".repeat(20), reporterEmail: null }),
    ).rejects.toThrow();
  });
});
