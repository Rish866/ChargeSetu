"use client";

import { useActionState } from "react";
import { submitClaimAction } from "@/app/actions/claims";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton, TextField, TextareaField } from "@/components/ui/form";
import { initialFormState } from "@/lib/types";

export function ClaimForm({ stationId, defaultCompany, defaultEmail }: { stationId: string; defaultCompany: string; defaultEmail: string }) {
  const [state, action] = useActionState(submitClaimAction, initialFormState);
  const v = (k: string) => (typeof state.values?.[k] === "string" ? (state.values[k] as string) : undefined);
  const e = (k: string) => state.fieldErrors?.[k];
  if (state.status === "success") {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Claim sent">{state.message}</Alert>
        <ButtonLink href="/operator" variant="secondary">Back to your dashboard</ButtonLink>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.status === "error" && state.message && <Alert tone="error">{state.message}</Alert>}
      <input type="hidden" name="stationId" value={stationId} />
      <TextField label="Company name" name="companyName" required defaultValue={v("companyName") ?? defaultCompany} errors={e("companyName")} />
      <TextField label="Contact email" name="contactEmail" type="email" required defaultValue={v("contactEmail") ?? defaultEmail} errors={e("contactEmail")} />
      <TextField label="Contact phone" name="contactPhone" type="tel" defaultValue={v("contactPhone")} errors={e("contactPhone")} />
      <TextareaField
        label="How can you show you run this station?"
        name="evidence"
        required
        hint="For example: business registration, site agreement, an official email from the operator domain, or a photo of the charger with your branding."
        defaultValue={v("evidence")}
        errors={e("evidence")}
        maxLength={1500}
      />
      <SubmitButton pendingText="Sending…" size="lg" className="w-full sm:w-auto">Submit claim</SubmitButton>
    </form>
  );
}
