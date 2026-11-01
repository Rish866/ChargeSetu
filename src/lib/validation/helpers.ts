import { z } from "zod";

/** Converts FormData into a plain object; keys in `arrayKeys` keep all values. */
export function formDataToObject(
  formData: FormData,
  arrayKeys: readonly string[] = [],
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue; // Next.js internal fields
    const values = formData
      .getAll(key)
      .filter((v): v is string => typeof v === "string");
    out[key] = arrayKeys.includes(key) ? values : (values[0] ?? "");
  }
  for (const key of arrayKeys) {
    if (!(key in out)) out[key] = [];
  }
  return out;
}

/** Empty strings become `undefined` so optional fields validate cleanly. */
export const emptyToUndefined = (v: unknown) => {
  if (typeof v !== "string") return v;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
};

export const optionalText = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.string().trim().max(max, `Keep this under ${max} characters`).optional(),
  );

export type FieldErrors = Record<string, string[] | undefined>;

export function toFieldErrors(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}
