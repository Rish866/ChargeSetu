import { z } from "zod";
import { ISSUE_TYPE_IDS } from "@/lib/constants";
import { emptyToUndefined, formDataToObject, toFieldErrors } from "./helpers";
import type { ParseResult } from "./station";

export const reportInputSchema = z.object({
  stationId: z
    .string({ error: "Choose the station you're reporting" })
    .trim()
    .min(1, "Choose the station you're reporting"),
  issueType: z.enum(ISSUE_TYPE_IDS, { error: "Choose what's wrong" }),
  description: z
    .string()
    .trim()
    .min(10, "Please add a few more details (at least 10 characters)")
    .max(2000, "Keep details under 2000 characters"),
  reporterEmail: z.preprocess(
    emptyToUndefined,
    z
      .email("Enter a valid email address, or leave it blank")
      .max(200)
      .optional()
      .transform((v) => v ?? null),
  ),
});

export type ReportInput = z.output<typeof reportInputSchema>;

export function parseReportForm(formData: FormData): ParseResult<ReportInput> {
  const values = formDataToObject(formData);
  const result = reportInputSchema.safeParse(values);
  if (!result.success) {
    return { success: false, fieldErrors: toFieldErrors(result.error), values };
  }
  return { success: true, data: result.data, values };
}
