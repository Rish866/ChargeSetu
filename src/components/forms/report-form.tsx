"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { submitReportAction } from "@/app/actions/reports";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { SelectField, SubmitButton, TextField, TextareaField } from "@/components/ui/form";
import { ISSUE_TYPES } from "@/lib/constants";
import { t } from "@/lib/i18n";
import { initialFormState } from "@/lib/types";

export function ReportForm({
  stations,
  defaultStationId,
}: {
  stations: { id: string; name: string; city: string }[];
  defaultStationId?: string;
}) {
  const [state, formAction] = useActionState(submitReportAction, initialFormState);
  // When the form first appeared — lets the server ignore instant bot submissions.
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);
  const submit = (fd: FormData) => {
    fd.set("startedAt", String(shownAt.current));
    return formAction(fd);
  };
  const v = (k: string) => (typeof state.values?.[k] === "string" ? (state.values[k] as string) : undefined);
  const e = (k: string) => state.fieldErrors?.[k];

  if (state.status === "success") {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Report sent">
          {state.message}
        </Alert>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/stations">Back to stations</ButtonLink>
          <ButtonLink href="/report" variant="secondary">
            Report another issue
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <form action={submit} className="space-y-5" noValidate>
      {state.status === "error" && state.message && <Alert tone="error">{state.message}</Alert>}

      <SelectField
        label={t.report.station}
        name="stationId"
        required
        placeholder={t.report.chooseStation}
        defaultValue={v("stationId") ?? defaultStationId ?? ""}
        errors={e("stationId")}
        options={stations.map((s) => ({ value: s.id, label: `${s.name} — ${s.city}` }))}
      />
      <SelectField
        label={t.report.issueType}
        name="issueType"
        required
        placeholder={t.report.chooseIssue}
        defaultValue={v("issueType") ?? ""}
        errors={e("issueType")}
        options={ISSUE_TYPES.map((i) => ({ value: i.id, label: i.label }))}
      />
      <TextareaField
        label={t.report.description}
        name="description"
        required
        hint={t.report.descriptionHint}
        defaultValue={v("description")}
        errors={e("description")}
        maxLength={2000}
      />
      <TextField
        label={t.report.email}
        name="reporterEmail"
        type="email"
        autoComplete="email"
        hint={t.report.emailHint}
        defaultValue={v("reporterEmail")}
        errors={e("reporterEmail")}
      />
      {/* Honeypot: hidden from people and assistive tech. */}
      <div aria-hidden className="hidden">
        <label>
          Website <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <p className="text-xs text-ink-subtle">
        Your report is seen only by our review team. If you add your email, we use it only to follow up on this report.
        See our{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
      <SubmitButton pendingText={t.common.sending} size="lg" className="w-full sm:w-auto">
        {t.report.submit}
      </SubmitButton>
    </form>
  );
}
