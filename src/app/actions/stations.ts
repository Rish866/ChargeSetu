"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { canEditStation, operatorModerationFields } from "@/lib/stations/moderation";
import type { FormState } from "@/lib/types";
import { parseStationForm } from "@/lib/validation/station";

const NOT_ALLOWED: FormState = {
  status: "error",
  message: "You need an operator account to do this. Please sign in again.",
};

const SAVE_FAILED = "We couldn't save your station right now. Please try again in a moment.";

/** Operator: submit a new station. Always enters `pending_review`. */
export async function createStationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await authorize(["operator"]);
  if (!user?.operatorId) return NOT_ALLOWED;

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
    await getStore().createStation(parsed.data, {
      operatorId: user.operatorId,
      source: "operator",
      ...operatorModerationFields(),
    });
  } catch {
    return { status: "error", message: SAVE_FAILED, values: parsed.values };
  }

  revalidatePath("/operator");
  revalidatePath("/admin");
  redirect("/operator?notice=submitted");
}

/** Operator: edit one of their own stations. Sends it back to review. */
export async function updateStationAction(
  stationId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await authorize(["operator"]);
  if (!user) return NOT_ALLOWED;

  const store = getStore();
  const existing = await store.getStationById(stationId);
  if (!existing || !canEditStation(user, existing)) {
    return { status: "error", message: "Station not found, or you don't have permission to edit it." };
  }

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
    const updated = await store.updateStation(stationId, parsed.data, operatorModerationFields());
    if (!updated) return { status: "error", message: SAVE_FAILED, values: parsed.values };
  } catch {
    return { status: "error", message: SAVE_FAILED, values: parsed.values };
  }

  revalidatePath("/operator");
  revalidatePath("/admin");
  revalidatePath("/stations");
  revalidatePath(`/stations/${existing.slug}`);
  redirect("/operator?notice=updated");
}
