import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(resetRateLimits);
  it("allows up to the limit then blocks, per key", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("a", 3, 1000, 100 + i).ok).toBe(true);
    const blocked = rateLimit("a", 3, 1000, 110);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(rateLimit("b", 3, 1000, 110).ok).toBe(true);
  });
  it("recovers after the window", () => {
    for (let i = 0; i < 3; i++) rateLimit("a", 3, 1000, 100);
    expect(rateLimit("a", 3, 1000, 1200).ok).toBe(true);
  });
});
