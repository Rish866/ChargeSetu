"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/auth/session";
import { INDIAN_STATES } from "@/lib/constants";
import { getStore } from "@/lib/data";
import { loadBeeDataset } from "@/lib/etl/dataset";

async function requireAdmin() {
  const user = await authorize(["admin"]);
  if (!user) throw new Error("Not authorized: admin access required.");
  return user;
}

const stateSchema = z.enum(INDIAN_STATES as unknown as [string, ...string[]]).nullable();
const CHUNK = 500;

export interface ImportProgress {
  ok: boolean;
  message?: string;
  inserted?: number;
  skipped?: number;
  nextOffset?: number;
  total?: number;
  batchId?: string;
}

/** Step 1: counts the rows in scope and opens a batch record. */
export async function startImportAction(input: { state: string | null; publish: boolean }): Promise<ImportProgress> {
  try {
    const user = await requireAdmin();
    const state = stateSchema.parse(input.state);
    const rows = (await loadBeeDataset()).filter((r) => !state || r.state === state);
    if (rows.length === 0) return { ok: false, message: "No rows in the bundled dataset for that scope." };
    const batchId = await getStore().startImportBatch({
      source: "bee",
      label: `BEE list (26 Oct 2025) — ${state ?? "all states"}`,
      publishAs: input.publish ? "published" : "inactive",
      total: rows.length,
      userId: user.id,
    });
    return { ok: true, batchId, total: rows.length, nextOffset: 0 };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not start the import." };
  }
}

/** Step 2 (repeated): imports one chunk. Safe to re-run — existing rows are skipped. */
export async function importChunkAction(input: { batchId: string; state: string | null; publish: boolean; offset: number }): Promise<ImportProgress> {
  try {
    await requireAdmin();
    const state = stateSchema.parse(input.state);
    const offset = z.number().int().min(0).parse(input.offset);
    const batchId = z.string().uuid().parse(input.batchId);
    const rows = (await loadBeeDataset()).filter((r) => !state || r.state === state);
    const slice = rows.slice(offset, offset + CHUNK);
    const res = await getStore().importStationsChunk(batchId, slice as unknown as Record<string, unknown>[], input.publish);
    return { ok: true, ...res, nextOffset: offset + slice.length, total: rows.length };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Import failed." };
  }
}

/** Step 3: closes the batch with its final totals. */
export async function finishImportAction(input: { batchId: string; ok: boolean; inserted: number; skipped: number; failed: number }) {
  await requireAdmin();
  await getStore().finishImportBatch(z.string().uuid().parse(input.batchId), input.ok ? "completed" : "failed", {
    inserted: input.inserted,
    skipped: input.skipped,
    failed: input.failed,
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
    return { ok: false, changed: 0, message: e instanceof Error ? e.message : "Update failed." };
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
    return { ok: false, changed: 0, message: e instanceof Error ? e.message : "Update failed." };
  }
}
