import { z } from "zod";
import { CONNECTOR_TYPE_IDS, INDIA_BOUNDS, INDIAN_STATES } from "@/lib/constants";
import { unreadableReason } from "./text-quality";

/**
 * Server-side validation for rows sent by the admin import screen. The file is
 * parsed in the admin's browser, so every row is re-checked here before it
 * reaches the database (which enforces its own constraints as well).
 */
const text = (min: number, max: number) =>
  z.string().trim().min(min).max(max).refine((v) => unreadableReason(v) === null, "Unreadable (garbled) text");
const vehicle = z.array(z.enum(["car", "two_three_wheeler"])).max(2);

export const importPointSchema = z.object({
  standard: z.enum(CONNECTOR_TYPE_IDS),
  current: z.enum(["AC", "DC"]),
  power_kw: z.number().min(0.1).max(1000).nullable(),
  connector_count: z.number().int().min(1).max(5000),
  vehicle_classes: vehicle,
});

export const importRowSchema = z.object({
  source: z.literal("bee"),
  external_id: z.string().regex(/^[A-Za-z0-9_-]{3,60}$/),
  name: text(2, 120),
  slug: z.string().regex(/^[a-z0-9-]{3,160}$/),
  network: text(1, 80),
  address: text(2, 300),
  city: text(1, 80),
  district: z.string().trim().max(80).refine((v) => unreadableReason(v) === null, "Unreadable (garbled) text").nullable(),
  state: z.enum(INDIAN_STATES as unknown as [string, ...string[]]),
  latitude: z.number().min(INDIA_BOUNDS.minLat).max(INDIA_BOUNDS.maxLat),
  longitude: z.number().min(INDIA_BOUNDS.minLng).max(INDIA_BOUNDS.maxLng),
  connector_types: z.array(z.enum(CONNECTOR_TYPE_IDS)).max(10),
  connector_count: z.number().int().min(1).max(1000).nullable(),
  power_kw: z.number().min(0.5).max(1000).nullable(),
  vehicle_classes: vehicle,
  source_url: z.url().max(500).nullable(),
  source_attribution: text(2, 300),
  source_data_as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  last_evidence_check: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable(),
  location_quality: z.literal("ok"),
  name_is_derived: z.boolean(),
  data_quality_score: z.number().int().min(0).max(100).nullable(),
  merged_source_ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{3,60}$/)).max(200),
  // Only publication-eligible rows may be imported.
  eligibility: z.literal("B"),
  points: z.array(importPointSchema).max(50),
});

export const MAX_IMPORT_CHUNK = 250;
export const importChunkSchema = z.array(importRowSchema).min(1).max(MAX_IMPORT_CHUNK);
