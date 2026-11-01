"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import type { FormState } from "@/lib/types";
import { optionalText } from "@/lib/validation/helpers";
import { parseStationForm } from "@/lib/validation/station";

/**
 * Admin: turn a lead into a real station record. The new station is created
 * as `pending_review` + `unverified`, so it still has to be approved (and
 * verified) in the normal queue before anyone can see it.
 */
export async function convertLeadAction(leadId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await authorize(["admin"]);
  if (!user) return { status: "error", message: "Admin access required." };

  const store = getStore();
  const lead = await store.getLead(leadId);
  if (!lead) return { status: "error", message: "Lead not found." };
  if (lead.status !== "pending_review") {
    return { status: "error", message: `This lead is already ${lead.status.replace("_", " ")}.` };
  }

  const parsed = parseStationForm(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields. Only fill in details you have confirmed.",
      fieldErrors: parsed.fieldErrors,
      values: parsed.values,
    };
  }

  let stationId: string;
  try {
    const station = await store.createStation(parsed.data, {
      operatorId: null,
      source: "admin",
      status: "pending_review",
      verificationStatus: "unverified",
      lastVerifiedAt: null,
      rejectionReason: null,
    });
    stationId = station.id;
  } catch {
    return { status: "error", message: "Couldn't create the station. Please try again.", values: parsed.values };
  }

  try {
    await store.updateLead(leadId, { status: "converted", stationId });
  } catch {
    // The station exists (pending review); only the lead link failed.
    return {
      status: "error",
      message: "The station was created and is in the pending queue, but the lead couldn't be marked as converted. Mark it manually.",
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  redirect(`/admin/stations/${stationId}?notice=from-lead`);
}

const closeSchema = z.object({
  id: z.string().min(1).max(100),
  status: z.enum(["rejected", "duplicate", "pending_review"]),
  note: optionalText(500),
});

/** Admin: reject a lead, mark it a duplicate, or reopen it. */
export async function setLeadStatusAction(formData: FormData) {
  const user = await authorize(["admin"]);
  if (!user) throw new Error("Not authorized: admin access required.");
  const parsed = closeSchema.parse({ id: formData.get("id"), status: formData.get("status"), note: formData.get("note") });
  const store = getStore();
  const lead = await store.getLead(parsed.id);
  if (!lead) throw new Error("Lead not found.");
  if (lead.status === "converted") throw new Error("Converted leads can't be changed.");
  await store.updateLead(parsed.id, { status: parsed.status, reviewNote: parsed.note ?? null });
  refresh();
  revalidatePath("/admin");
  revalidatePath("/admin/leads");
}
