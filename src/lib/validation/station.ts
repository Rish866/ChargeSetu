import { z } from "zod";
import {
  AMENITY_IDS,
  CONNECTOR_TYPE_IDS,
  INDIA_BOUNDS,
  INDIAN_STATES,
  PRICE_UNIT_IDS,
} from "@/lib/constants";
import { parseIndianPhone } from "@/lib/india";
import {
  emptyToUndefined,
  formDataToObject,
  optionalText,
  toFieldErrors,
  type FieldErrors,
} from "./helpers";

const requiredNumber = (label: string) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number({ error: `${label} must be a number` }),
  );

// A plain refinement (not a transform) so a bad phone number doesn't hide
// other errors on the form. The number is normalised in the final transform.
const indianPhone = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .max(25, "Phone number is too long")
    .refine((v) => parseIndianPhone(v).ok, {
      message: "Enter an Indian number, e.g. +91 98765 43210, 020 2612 3456 or 1800 123 4567",
    })
    .optional(),
);

function normalisePhone(v: string | undefined): string | null {
  if (!v) return null;
  const p = parseIndianPhone(v);
  return p.ok ? p.display : null;
}

/**
 * Validation for station submissions. Used on the server for every create and
 * update; the same schema can be reused client-side for instant feedback.
 */
export const stationInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, "Station name must be at least 3 characters")
      .max(120, "Station name must be under 120 characters"),
    network: z
      .string()
      .trim()
      .min(2, "Enter the network or operator brand name")
      .max(80, "Network name must be under 80 characters"),
    address: z
      .string()
      .trim()
      .min(8, "Enter the full street address")
      .max(300, "Address must be under 300 characters"),
    area: z
      .string()
      .trim()
      .min(2, "Enter the area or locality")
      .max(80, "Area must be under 80 characters"),
    city: z
      .string()
      .trim()
      .min(2, "Enter the city")
      .max(80, "City must be under 80 characters"),
    state: z.enum(INDIAN_STATES, { error: "Choose a state or union territory" }),
    latitude: requiredNumber("Latitude").pipe(
      z
        .number()
        .min(INDIA_BOUNDS.minLat, "Latitude must be within India (6 to 37.6)")
        .max(INDIA_BOUNDS.maxLat, "Latitude must be within India (6 to 37.6)"),
    ),
    longitude: requiredNumber("Longitude").pipe(
      z
        .number()
        .min(INDIA_BOUNDS.minLng, "Longitude must be within India (68 to 97.5)")
        .max(INDIA_BOUNDS.maxLng, "Longitude must be within India (68 to 97.5)"),
    ),
    connectorTypes: z
      .array(z.enum(CONNECTOR_TYPE_IDS, { error: "Unknown connector type" }))
      .min(1, "Select at least one connector type")
      .transform((arr) => Array.from(new Set(arr))),
    connectorCount: requiredNumber("Number of connectors").pipe(
      z
        .number()
        .int("Number of connectors must be a whole number")
        .min(1, "There must be at least 1 connector")
        .max(200, "That seems too many — max 200"),
    ),
    powerKw: requiredNumber("Maximum power").pipe(
      z
        .number()
        .min(1, "Power must be at least 1 kW")
        .max(1000, "Power must be at most 1000 kW"),
    ),
    priceUnit: z.enum(PRICE_UNIT_IDS, { error: "Choose how pricing is charged" }),
    price: z.preprocess(
      emptyToUndefined,
      z.coerce
        .number({ error: "Price must be a number" })
        .min(0, "Price cannot be negative")
        .max(10000, "Price must be at most ₹10,000")
        .optional(),
    ),
    openingHours: z
      .string()
      .trim()
      .min(2, "Enter opening hours, e.g. “24 hours” or “Mon–Sat 8 AM–10 PM”")
      .max(120, "Opening hours must be under 120 characters"),
    amenities: z
      .array(z.enum(AMENITY_IDS, { error: "Unknown amenity" }))
      .default([])
      .transform((arr) => Array.from(new Set(arr))),
    contactPhone: indianPhone,
    contactEmail: z.preprocess(
      emptyToUndefined,
      z.email("Enter a valid email address").optional(),
    ),
    photoUrls: z.preprocess(
      (v) =>
        typeof v === "string"
          ? v
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean)
          : v,
      z
        .array(
          z
            .url({ protocol: /^https$/, error: "Photo links must be https:// URLs" })
            .max(500, "Photo URL is too long"),
        )
        .max(6, "Add at most 6 photo links")
        .default([]),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.priceUnit !== "free" && data.price === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["price"],
        message: "Enter a price, or choose “Free” as the pricing unit",
      });
    }
  })
  .transform((data) => ({
    ...data,
    price: data.priceUnit === "free" ? 0 : (data.price ?? null),
    contactPhone: normalisePhone(data.contactPhone),
    contactEmail: data.contactEmail ?? null,
  }));

export type StationInput = z.output<typeof stationInputSchema>;

export const STATION_ARRAY_FIELDS = ["connectorTypes", "amenities"] as const;

export type ParseResult<T> =
  | { success: true; data: T; values: Record<string, string | string[]> }
  | {
      success: false;
      fieldErrors: FieldErrors;
      values: Record<string, string | string[]>;
    };

export function parseStationForm(formData: FormData): ParseResult<StationInput> {
  const values = formDataToObject(formData, STATION_ARRAY_FIELDS);
  const result = stationInputSchema.safeParse(values);
  if (!result.success) {
    return { success: false, fieldErrors: toFieldErrors(result.error), values };
  }
  return { success: true, data: result.data, values };
}

export const rejectSchema = z.object({
  id: z.string().min(1),
  reason: optionalText(500),
});
