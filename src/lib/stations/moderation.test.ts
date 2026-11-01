import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/types";
import {
  canEditStation,
  canModerate,
  canSubmitStation,
  canTransition,
  isPubliclyVisible,
  operatorModerationFields,
} from "./moderation";

const user = (role: SessionUser["role"], operatorId: string | null = null): SessionUser => ({
  id: `u-${role}`,
  name: role,
  email: null,
  role,
  operatorId,
  isDemo: false,
});

const admin = user("admin");
const opA = user("operator", "op-a");
const opB = user("operator", "op-b");
const unlinkedOperator = user("operator", null);
const customer = user("customer");

describe("permissions", () => {
  it("only linked operators can submit stations", () => {
    expect(canSubmitStation(opA)).toBe(true);
    expect(canSubmitStation(unlinkedOperator)).toBe(false);
    expect(canSubmitStation(customer)).toBe(false);
    expect(canSubmitStation(admin)).toBe(false);
    expect(canSubmitStation(null)).toBe(false);
  });

  it("operators can edit only their own stations; admins can edit any", () => {
    const station = { operatorId: "op-a" };
    expect(canEditStation(opA, station)).toBe(true);
    expect(canEditStation(opB, station)).toBe(false);
    expect(canEditStation(customer, station)).toBe(false);
    expect(canEditStation(null, station)).toBe(false);
    expect(canEditStation(admin, station)).toBe(true);
    expect(canEditStation(admin, { operatorId: null })).toBe(true);
  });

  it("operators cannot edit admin-created (unowned) stations", () => {
    expect(canEditStation(unlinkedOperator, { operatorId: null })).toBe(false);
    expect(canEditStation(opA, { operatorId: null })).toBe(false);
  });

  it("only admins can moderate", () => {
    expect(canModerate(admin)).toBe(true);
    expect(canModerate(opA)).toBe(false);
    expect(canModerate(customer)).toBe(false);
    expect(canModerate(null)).toBe(false);
  });
});

describe("status transitions", () => {
  it("allows the review workflow", () => {
    expect(canTransition("pending_review", "published")).toBe(true);
    expect(canTransition("pending_review", "rejected")).toBe(true);
    expect(canTransition("published", "inactive")).toBe(true);
    expect(canTransition("inactive", "published")).toBe(true);
    expect(canTransition("rejected", "published")).toBe(true);
  });

  it("blocks nonsensical transitions", () => {
    expect(canTransition("inactive", "rejected")).toBe(false);
    expect(canTransition("published", "published")).toBe(false);
    expect(canTransition("pending_review", "inactive")).toBe(false);
  });
});

describe("operator moderation fields", () => {
  it("always forces pending review and clears verification", () => {
    expect(operatorModerationFields()).toEqual({
      status: "pending_review",
      verificationStatus: "unverified",
      lastVerifiedAt: null,
      rejectionReason: null,
    });
  });

  it("only published stations are public", () => {
    expect(isPubliclyVisible({ status: "published" })).toBe(true);
    expect(isPubliclyVisible({ status: "pending_review" })).toBe(false);
    expect(isPubliclyVisible({ status: "rejected" })).toBe(false);
    expect(isPubliclyVisible({ status: "inactive" })).toBe(false);
  });
});
