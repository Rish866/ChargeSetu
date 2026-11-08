import { describe, expect, it } from "vitest";
import { isMissingSchema } from "./supabase-store";

describe("isMissingSchema (pre-migration fallback)", () => {
  it("recognises missing function / column / table errors", () => {
    for (const code of ["PGRST202", "42883", "42703", "42P01", "PGRST205"]) expect(isMissingSchema({ code })).toBe(true);
  });
  it("does not hide real errors such as permission or timeout", () => {
    for (const code of ["42501", "57014", "PGRST301", ""]) expect(isMissingSchema({ code })).toBe(false);
    expect(isMissingSchema(null)).toBe(false);
  });
});
