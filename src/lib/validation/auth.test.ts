import { describe, expect, it } from "vitest";
import { friendlyAuthError, signUpSchema, updatePasswordSchema } from "./auth";

const base = {
  fullName: "Asha Rao",
  email: "  Asha@Example.com ",
  password: "charge2026",
  accountType: "customer",
  consent: "yes",
};

describe("signUpSchema", () => {
  it("accepts a driver and normalises the email", () => {
    const r = signUpSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe("asha@example.com");
      expect(r.data.companyName).toBeNull();
    }
  });

  it("requires consent to the terms", () => {
    const r = signUpSchema.safeParse({ ...base, consent: undefined });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["consent"]);
  });

  it("requires a letter and a number in passwords", () => {
    expect(signUpSchema.safeParse({ ...base, password: "abcdefgh" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, password: "12345678" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, password: "short1" }).success).toBe(false);
  });

  it("requires company name and an Indian business phone for operators", () => {
    const missing = signUpSchema.safeParse({ ...base, accountType: "operator" });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      const paths = missing.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("companyName");
      expect(paths).toContain("companyPhone");
    }
    const ok = signUpSchema.safeParse({ ...base, accountType: "operator", companyName: "Volt Pvt Ltd", companyPhone: "9876543210" });
    expect(ok.success && ok.data.companyPhone).toBe("+91 98765 43210");
  });

  it("can never request an admin account", () => {
    expect(signUpSchema.safeParse({ ...base, accountType: "admin" }).success).toBe(false);
  });
});

describe("updatePasswordSchema", () => {
  it("requires matching passwords", () => {
    expect(updatePasswordSchema.safeParse({ password: "newpass123", confirmPassword: "newpass123" }).success).toBe(true);
    expect(updatePasswordSchema.safeParse({ password: "newpass123", confirmPassword: "newpass124" }).success).toBe(false);
  });
});

describe("friendlyAuthError", () => {
  it("never echoes unknown provider errors", () => {
    expect(friendlyAuthError("some_internal_code")).toBe("Something went wrong. Please try again in a moment.");
    expect(friendlyAuthError(undefined)).toMatch(/try again/);
    expect(friendlyAuthError("over_email_send_rate_limit")).toMatch(/wait a few minutes/);
  });
});
