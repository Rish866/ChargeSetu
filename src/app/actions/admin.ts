"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import type { ModerationPatch } from "@/lib/data/store";
import { canTransition } from "@/lib/stations/moderation";
import type { FormState, StationStatus } from "@/lib/types";
import { rejectSchema, parseStationForm } from "@/lib/validation/station";

/** Every admin action starts here. Throws (→ error page) if not an admin. */
async function requireAdmin() {
  const user = await authorize(["admin"]);
  if (!user) throw new Error("Not authorized: admin access required.");
  return user;
}

const idSchema = z.string().min(1).max(100);

function revalidateStationPages(slug?: string) {
  // Re-render whatever page the admin is currently on (dashboard or edit page).
  refresh();
  revalidatePath("/admin");
  revalidatePath("/operator");
  revalidatePath("/stations");
  revalidatePath("/");
  if (slug) revalidatePath(`/stations/${slug}`);
}

async function transition(formData: FormData, to: StationStatus, extra: ModerationPatch = {}) {
  await requireAdmin();
  const id = idSchema.parse(formData.get("id"));
  const store = getStore();
  const station = await store.getStationById(id);
  if (!station) throw new Error("Station not found.");
  if (!canTransition(station.status, to)) {
    throw new Error(`A ${station.status} station cannot be changed to ${to}.`);
  }
  await store.moderateStation(id, { status: to, ...extra });
  revalidateStationPages(station.slug);
}

export async function approveStation(formData: FormData) {
  await transition(formData, "published", { rejectionReason: null });
}

export async function approveAndVerifyStation(formData: FormData) {
  await transition(formData, "published", {
    rejectionReason: null,
    verificationStatus: "verified",
    lastVerifiedAt: new Date().toISOString(),
  });
}

export async function rejectStation(formData: FormData) {
  const parsed = rejectSchema.safeParse({ id: formData.get("id"), reason: formData.get("reason") });
  if (!parsed.success) throw new Error("Invalid rejection request.");
  await transition(formData, "rejected", {
    rejectionReason: parsed.data.reason ?? "Rejected during review.",
    verificationStatus: "unverified",
  });
}

export async function deactivateStation(formData: FormData) {
  await transition(formData, "inactive");
}

export async function republishStation(formData: FormData) {
  await transition(formData, "published");
}

/** Confirms a published station's details, setting `last_verified_at`. */
export async function verifyStation(formData: FormData) {
  await requireAdmin();
  const id = idSchema.parse(formData.get("id"));
  const store = getStore();
  const station = await store.getStationById(id);
  if (!station) throw new Error("Station not found.");
  await store.moderateStation(id, {
    verificationStatus: "verified",
    lastVerifiedAt: new Date().toISOString(),
  });
  revalidateStationPages(station.slug);
}

export async function unverifyStation(formData: FormData) {
  await requireAdmin();
  const id = idSchema.parse(formData.get("id"));
  const store = getStore();
  const station = await store.getStationById(id);
  if (!station) throw new Error("Station not found.");
  await store.moderateStation(id, { verificationStatus: "unverified" });
  revalidateStationPages(station.slug);
}

/** Admin edit: changes details but keeps the current status. */
export async function adminUpdateStationAction(
  stationId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await authorize(["admin"]);
  if (!user) return { status: "error", message: "Admin access required." };

  const store = getStore();
  const existing = await store.getStationById(stationId);
  if (!existing) return { status: "error", message: "Station not found." };

  const parsed = parseStationForm(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.fieldErrors,
      values: parsed.values,
    };
  }
  try {
    await store.updateStation(stationId, parsed.data);
  } catch {
    return { status: "error", message: "Couldn't save changes. Please try again.", values: parsed.values };
  }
  revalidateStationPages(existing.slug);
  redirect("/admin?notice=saved");
}

const reportStatusSchema = z.object({
  id: idSchema,
  status: z.enum(["open", "resolved", "dismissed"]),
});

export async function setReportStatusAction(formData: FormData) {
  await requireAdmin();
  const parsed = reportStatusSchema.parse({ id: formData.get("id"), status: formData.get("status") });
  await getStore().setReportStatus(parsed.id, parsed.status);
  revalidatePath("/admin");
}
