import {
  approveAndVerifyStation,
  approveStation,
  deactivateStation,
  rejectStation,
  republishStation,
  unverifyStation,
  verifyStation,
} from "@/app/actions/admin";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/form";
import { getT } from "@/lib/i18n/server";
import type { Station } from "@/lib/types";

function ActionForm({
  action,
  id,
  label,
  variant = "secondary",
}: {
  action: (fd: FormData) => Promise<void>;
  id: string;
  label: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" variant={variant} pendingText="…">
        {label}
      </SubmitButton>
    </form>
  );
}

async function RejectForm({ id }: { id: string }) {
  const t = await getT();
  return (
    <details className="group w-full">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-xl border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 hover:bg-red-50">
        {t.admin.reject}…
      </summary>
      <form action={rejectStation} className="mt-2 space-y-2">
        <input type="hidden" name="id" value={id} />
        <label htmlFor={`reason-${id}`} className="block text-xs font-medium">
          Reason (shown to the operator)
        </label>
        <textarea
          id={`reason-${id}`}
          name="reason"
          rows={2}
          maxLength={500}
          className="w-full rounded-xl border border-line px-3 py-2 text-sm"
          placeholder="e.g. Coordinates don't match the address"
        />
        <SubmitButton size="sm" variant="danger" pendingText="Rejecting…">
          Confirm rejection
        </SubmitButton>
      </form>
    </details>
  );
}

/** The set of moderation actions valid for a station's current state. */
export async function ModerationButtons({ station }: { station: Station }) {
  const t = await getT();
  const { id, status, verificationStatus } = station;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {status === "pending_review" && (
        <>
          <ActionForm action={approveAndVerifyStation} id={id} label={t.admin.approveVerify} variant="primary" />
          <ActionForm action={approveStation} id={id} label={t.admin.approve} />
        </>
      )}
      {status === "rejected" && <ActionForm action={approveStation} id={id} label={t.admin.approve} />}
      {status === "published" &&
        (verificationStatus === "verified" ? (
          <ActionForm action={unverifyStation} id={id} label="Remove verification" />
        ) : (
          <ActionForm action={verifyStation} id={id} label={t.admin.verify} variant="primary" />
        ))}
      {status === "published" && <ActionForm action={deactivateStation} id={id} label={t.admin.deactivate} variant="danger" />}
      {status === "inactive" && <ActionForm action={republishStation} id={id} label={t.admin.reactivate} />}
      <ButtonLink href={`/admin/stations/${id}`} variant="secondary" size="sm">
        {t.admin.edit}
      </ButtonLink>
      {status === "pending_review" && <RejectForm id={id} />}
    </div>
  );
}
