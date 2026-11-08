"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/auth/session";
import { INDIAN_STATES } from "@/lib/constants";
import { getStore } from "@/lib/data";
import { importChunkSchema } from "@/lib/etl/import-schema";

async function requireAdmin() {
  const user = await authorize(["admin"]);
  if (!user) throw new Error("Not authorized: admin access required.");
  return user;
}

const stateSchema = z.enum(INDIAN_STATES as unknown as [string, ...string[]]).nullable();
const errMsg = (e: unknown, fallback: string) =>
  e instanceof z.ZodError ? "The file contains rows that failed validation." : e instanceof Error ? e.message : fallback;

export interface ImportProgress {
  ok: boolean;
  message?: string;
  inserted?: number;
  skipped?: number;
  batchId?: string;
}

/** Step 1: opens a batch record for an uploaded, browser-parsed file. */
export async function startImportAction(input: { label: string; total: number; publish: boolean }): Promise<ImportProgress> {
  try {
    const user = await requireAdmin();
    const label = z.string().trim().min(1).max(200).parse(input.label);
    const total = z.number().int().min(1).max(100_000).parse(input.total);
    const batchId = await getStore().startImportBatch({
      source: "bee",
      label,
      publishAs: input.publish ? "published" : "inactive",
      total,
      userId: user.id,
    });
    return { ok: true, batchId };
  } catch (e) {
    return { ok: false, message: errMsg(e, "Could not start the import.") };
  }
}

/** Step 2 (repeated): validates and imports one chunk. Safe to re-run — existing rows are skipped. */
export async function importChunkAction(input: { batchId: string; rows: unknown; publish: boolean }): Promise<ImportProgress> {
  try {
    await requireAdmin();
    const batchId = z.string().uuid().parse(input.batchId);
    const rows = importChunkSchema.parse(input.rows);
    const res = await getStore().importStationsChunk(batchId, rows, Boolean(input.publish));
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, message: errMsg(e, "Import failed.") };
  }
}

/** Step 3: closes the batch with its final totals. */
export async function finishImportAction(input: { batchId: string; ok: boolean; inserted: number; skipped: number; failed: number }) {
  await requireAdmin();
  const n = z.number().int().min(0).max(100_000);
  await getStore().finishImportBatch(z.string().uuid().parse(input.batchId), input.ok ? "completed" : "failed", {
    inserted: n.parse(input.inserted),
    skipped: n.parse(input.skipped),
    failed: n.parse(input.failed),
  });
  revalidatePath("/admin/data");
  revalidatePath("/stations");
  revalidatePath("/");
}

/** Publishes/hides one chunk of source-listed stations. The screen repeats this until it returns 0. */
export async function bulkStatusAction(input: { state: string | null; to: "published" | "inactive" }): Promise<{ ok: boolean; changed: number; message?: string }> {
  try {
    await requireAdmin();
    const state = stateSchema.parse(input.state);
    const to = z.enum(["published", "inactive"]).parse(input.to);
    const changed = await getStore().bulkSetStatus({
      source: "bee",
      state,
      from: to === "published" ? "inactive" : "published",
      to,
      limit: 2000,
    });
    if (changed === 0) {
      revalidatePath("/admin/data");
      revalidatePath("/stations");
      revalidatePath("/");
    }
    return { ok: true, changed };
  } catch (e) {
    return { ok: false, changed: 0, message: errMsg(e, "Update failed.") };
  }
}

/**
 * Hides (never deletes) the fictional demo stations. Refuses to run until real
 * stations are live, so the public directory cannot end up empty.
 */
export async function hideDemoStationsAction(input: { confirm: string }): Promise<{ ok: boolean; changed: number; message?: string }> {
  try {
    await requireAdmin();
    if (input.confirm !== "HIDE DEMO") return { ok: false, changed: 0, message: 'Type "HIDE DEMO" to confirm.' };
    const store = getStore();
    const { total } = await store.searchStations({}, 1, 1);
    if (total < 500) {
      return { ok: false, changed: 0, message: "Refused: fewer than 500 stations are published, so real stations are not live yet. Publish the imported stations first." };
    }
    const changed = await store.bulkSetStatus({ source: "demo", state: null, from: "published", to: "inactive", limit: 1000 });
    revalidatePath("/admin/data");
    revalidatePath("/stations");
    revalidatePath("/");
    return { ok: true, changed };
  } catch (e) {
    return { ok: false, changed: 0, message: errMsg(e, "Update failed.") };
  }
}
