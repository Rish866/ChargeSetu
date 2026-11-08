"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import type { FormState } from "@/lib/types";

const claimSchema = z.object({
  stationId: z.string().trim().min(1).max(100),
  companyName: z.string().trim().min(2, "Enter your company name").max(120),
  contactEmail: z.email("Enter a valid email address").max(200),
  contactPhone: z.string().trim().max(25).optional(),
  evidence: z.string().trim().min(10, "Please explain how you can show ownership (at least 10 characters)").max(1500),
});

export async function submitClaimAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await authorize(["operator"]);
  if (!user) return { status: "error", message: "Please sign in with an operator account to claim a station." };
  const values = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = claimSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (fieldErrors[String(issue.path[0])] ??= []).push(issue.message);
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors, values };
  }
  try {
    await getStore().createClaim({
      stationId: parsed.data.stationId,
      claimantId: user.id,
      companyName: parsed.data.companyName,
      contactEmail: parsed.data.contactEmail,
      contactPhone: parsed.data.contactPhone || null,
      evidence: parsed.data.evidence,
    });
  } catch (err) {
    const cause = String((err as { cause?: { message?: string } }).cause?.message ?? "");
    const msg = /too many pending/i.test(cause)
      ? "You already have several claims waiting for review. Please wait for a decision."
      : /duplicate|unique/i.test(cause)
        ? "You already have a pending claim for this station."
        : "We couldn't submit your claim. Check the details and try again.";
    return { status: "error", message: msg, values };
  }
  revalidatePath("/admin/claims");
  return { status: "success", message: "Claim received. Our team will contact you after reviewing your evidence." };
}

const decisionSchema = z.object({
  id: z.string().min(1).max(100),
  status: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

export async function decideClaimAction(formData: FormData) {
  const admin = await authorize(["admin"]);
  if (!admin) throw new Error("Not authorized: admin access required.");
  const parsed = decisionSchema.parse({ id: formData.get("id"), status: formData.get("status"), note: formData.get("note") || undefined });
  await getStore().setClaimStatus(parsed.id, parsed.status, parsed.note ?? null);
  revalidatePath("/admin/claims");
  revalidatePath("/admin");
}
