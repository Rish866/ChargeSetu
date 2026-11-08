import { describe, expect, it } from "vitest";
import { demoStations } from "@/lib/data/demo-seed";
import { cellSize, clusterStations } from "./cluster";

describe("clusterStations", () => {
  it("clusters at country zoom and splits at street zoom", () => {
    const pub = demoStations.filter((s) => s.status === "published");
    const far = clusterStations(pub, 4);
    expect(far.some((p) => p.kind === "cluster")).toBe(true);
    expect(far.reduce((a, p) => a + p.count, 0)).toBe(pub.length);
    const near = clusterStations(pub, 18);
    expect(near.every((p) => p.kind === "station")).toBe(true);
  });
  it("never uses a cell smaller than the SQL minimum", () => {
    expect(cellSize(30)).toBeGreaterThanOrEqual(0.0005);
  });
});
