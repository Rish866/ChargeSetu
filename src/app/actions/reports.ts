"use server";

import { revalidatePath } from "next/cache";
import { checkPublicSubmission } from "@/lib/abuse";
import { getStore } from "@/lib/data";
import type { FormState } from "@/lib/types";
import { parseReportForm } from "@/lib/validation/report";

const THANKS = "Thanks! Your report has been sent to our review team.";

/**
 * Public: anyone can report outdated information. Reports start as `open`.
 * Abuse controls: honeypot + fill-time check here, and a per-station rate
 * limit enforced by the database (see the pilot-hardening migration).
 */
export async function submitReportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Validate first, so a real person who presses "Send" too early sees what's
  // missing instead of being mistaken for a bot.
  const parsed = parseReportForm(formData);
  if (parsed.success) {
    const check = checkPublicSubmission(formData);
    // Bots get a fake success so they learn nothing.
    if (check === "bot") return { status: "success", message: THANKS };
    if (check === "no-timestamp") {
      return {
        status: "error",
        message: "Please make sure JavaScript is enabled in your browser, reload the page and try again.",
        values: parsed.values,
      };
    }
  }
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
  } catch (err) {
    const rateLimited = err instanceof Error && /too many reports/i.test(String((err as { cause?: { message?: string } }).cause?.message ?? err.message));
    return {
      status: "error",
      message: rateLimited
        ? "This station has received a lot of reports recently. Our team is already looking at it — please try again later."
        : "We couldn't send your report. Check the station and try again.",
      values: parsed.values,
    };
  }

  revalidatePath("/admin");
  return { status: "success", message: THANKS };
}
