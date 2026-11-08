"use client";

import { Crosshair } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import {
  CheckboxGroupField,
  SelectField,
  SubmitButton,
  TextField,
  TextareaField,
} from "@/components/ui/form";
import { AMENITIES, CONNECTOR_TYPES, INDIAN_STATES, PRICE_UNITS } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";
import { initialFormState, type FormState, type Station } from "@/lib/types";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function StationForm({
  action,
  station,
  submitLabel,
  cancelHref,
  reviewNotice = true,
}: {
  action: Action;
  /** Saved station, or partial prefilled values (e.g. from an imported lead). */
  station?: Partial<Station>;
  submitLabel: string;
  cancelHref: string;
  reviewNotice?: boolean;
}) {
  const t = useT();
  const [state, formAction] = useActionState(action, initialFormState);
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  // Values priority: what the user just submitted > saved station > defaults.
  const sv = state.values;
  const str = (k: string, fallback?: string | number | null) => {
    const x = sv?.[k];
    if (typeof x === "string") return x;
    return fallback === null || fallback === undefined ? "" : String(fallback);
  };
  const arr = (k: string, fallback: string[] = []) => {
    const x = sv?.[k];
    return Array.isArray(x) ? x : fallback;
  };
  const e = (k: string) => state.fieldErrors?.[k];

  function fillFromMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeoMsg("Location isn't available in this browser.");
      return;
    }
    setGeoMsg("Getting location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (latRef.current) latRef.current.value = coords.latitude.toFixed(6);
        if (lngRef.current) lngRef.current.value = coords.longitude.toFixed(6);
        setGeoMsg("Filled from your current location. Make sure you are at the station.");
      },
      () => setGeoMsg("Couldn't get your location. Enter coordinates manually."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  // After each submit React resets the form to the current defaultValues,
  // which come from `state.values` on error — so user input is preserved.
  return (
    <form action={formAction} className="space-y-6" noValidate>
      {reviewNotice && <Alert tone="info">{t.operator.reviewNote}</Alert>}
      {state.status === "error" && state.message && (
        <Alert tone="error" title="Couldn't save">
          {state.message}
        </Alert>
      )}

      <Section title="Station">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Station name" name="name" required defaultValue={str("name", station?.name)} errors={e("name")} hint="As drivers will see it, e.g. “GreenPlug Phoenix Mall”" />
          <TextField label="Network / brand" name="network" required defaultValue={str("network", station?.network)} errors={e("network")} hint="The charging network or brand name" />
        </div>
      </Section>

      <Section title="Location" description="Accurate coordinates make directions work. Tip: long-press the spot in Google Maps to copy them.">
        <TextField label="Street address" name="address" required autoComplete="street-address" defaultValue={str("address", station?.address)} errors={e("address")} />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Area / locality" name="area" required defaultValue={str("area", station?.area)} errors={e("area")} />
          <TextField label="City" name="city" required autoComplete="address-level2" defaultValue={str("city", station?.city)} errors={e("city")} />
          <SelectField
            label="State / UT"
            name="state"
            required
            placeholder="Choose…"
            defaultValue={str("state", station?.state)}
            errors={e("state")}
            options={INDIAN_STATES.map((s) => ({ value: s, label: s }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField ref={latRef} label="Latitude" name="latitude" required inputMode="decimal" placeholder="19.0607" defaultValue={str("latitude", station?.latitude)} errors={e("latitude")} />
          <TextField ref={lngRef} label="Longitude" name="longitude" required inputMode="decimal" placeholder="72.8362" defaultValue={str("longitude", station?.longitude)} errors={e("longitude")} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={fillFromMyLocation} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
            <Crosshair aria-hidden className="size-4" /> Use my current location
          </button>
          <span aria-live="polite" className="text-xs text-ink-subtle">
            {geoMsg}
          </span>
        </div>
      </Section>

      <Section title="Chargers">
        <CheckboxGroupField
          legend="Connector types"
          name="connectorTypes"
          required
          options={CONNECTOR_TYPES.map((c) => ({ value: c.id, label: c.label, detail: c.current }))}
          defaultValues={arr("connectorTypes", station?.connectorTypes)}
          errors={e("connectorTypes")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Number of connectors" name="connectorCount" type="number" min={1} max={200} step={1} required inputMode="numeric" defaultValue={str("connectorCount", station ? station.connectorCount : 1)} errors={e("connectorCount")} />
          <TextField label="Maximum power (kW)" name="powerKw" type="number" min={1} max={1000} step="0.1" required inputMode="decimal" defaultValue={str("powerKw", station?.powerKw)} errors={e("powerKw")} hint="Highest output of any connector at this station" />
        </div>
      </Section>

      <Section title="Pricing & hours" description="Prices are shown to drivers only after our team verifies them.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Price (₹)" name="price" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={str("price", station?.priceUnit === "free" ? "" : station?.price)} errors={e("price")} hint="Leave empty if charging is free" />
          <SelectField
            label="Pricing unit"
            name="priceUnit"
            required
            defaultValue={str("priceUnit", station?.priceUnit ?? "per_kwh")}
            errors={e("priceUnit")}
            options={PRICE_UNITS.map((p) => ({ value: p.id, label: p.label }))}
          />
        </div>
        <TextField label="Opening hours" name="openingHours" required placeholder="24 hours, or Mon–Sat 8 AM–10 PM" defaultValue={str("openingHours", station?.openingHours)} errors={e("openingHours")} />
      </Section>

      <Section title="Amenities & contact">
        <CheckboxGroupField
          legend="Amenities"
          name="amenities"
          options={AMENITIES.map((a) => ({ value: a.id, label: a.label }))}
          defaultValues={arr("amenities", station?.amenities)}
          errors={e("amenities")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Station phone" name="contactPhone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" defaultValue={str("contactPhone", station?.contactPhone)} errors={e("contactPhone")} />
          <TextField label="Station email" name="contactEmail" type="email" autoComplete="email" defaultValue={str("contactEmail", station?.contactEmail)} errors={e("contactEmail")} />
        </div>
        <TextareaField
          label="Photo links"
          name="photoUrls"
          rows={3}
          placeholder={"https://example.com/photo-1.jpg\nhttps://example.com/photo-2.jpg"}
          hint="One https:// link per line, up to 6. Direct photo uploads are not available yet."
          defaultValue={str("photoUrls", station?.photoUrls?.join("\n"))}
          errors={e("photoUrls")}
        />
      </Section>

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-6 sm:flex-row sm:justify-end">
        <ButtonLink href={cancelHref} variant="secondary">
          {t.common.cancel}
        </ButtonLink>
        <SubmitButton pendingText={t.common.saving}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
