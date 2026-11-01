import { Alert } from "@/components/ui/alert";

/** Shown at the top of every legal page until a lawyer has reviewed it. */
export function DraftLegalNotice() {
  return (
    <Alert tone="warning" title="Draft — not yet reviewed by a lawyer">
      This page is a starting template written for a small pilot. It has not been reviewed by a qualified Indian lawyer
      and does not claim compliance with any law, including the Digital Personal Data Protection Act, 2023 or the
      Information Technology Act, 2000 and its rules. Have it reviewed before a public launch.
    </Alert>
  );
}

export function SupportContact({ email }: { email?: string }) {
  return email ? (
    <a href={`mailto:${email}`} className="font-medium text-brand-700 underline">
      {email}
    </a>
  ) : (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">
      [support email not configured — set NEXT_PUBLIC_SUPPORT_EMAIL]
    </span>
  );
}
