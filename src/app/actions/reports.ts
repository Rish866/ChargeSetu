"use server";

import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/data";
import type { FormState } from "@/lib/types";
import { parseReportForm } from "@/lib/validation/report";

/** Public: anyone can report outdated information. Reports start as `open`. */
export async function submitReportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Simple honeypot — bots fill every field, humans never see this one.
  if (typeof formData.get("website") === "string" && formData.get("website") !== "") {
    return { status: "success", message: "Thanks! Your report has been sent." };
  }

  const parsed = parseReportForm(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.fieldErrors,
      values: parsed.values,
    };
  }

  try {
    await getStore().createReport(parsed.data);
  } catch {
    return {
      status: "error",
      message: "We couldn't send your report. Check the station and try again.",
      values: parsed.values,
    };
  }

  revalidatePath("/admin");
  return { status: "success", message: "Thanks! Your report has been sent to our review team." };
}
