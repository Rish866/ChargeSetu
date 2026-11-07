import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { decideClaimAction } from "@/app/actions/claims";
import { AccessDenied } from "@/components/auth/access-denied";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StationListSkeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { isAdmin } from "@/lib/stations/moderation";
import { Inbox } from "lucide-react";

export const metadata: Metadata = { title: "Ownership claims", robots: { index: false } };

export default function ClaimsPage() {
  return (
    <Suspense fallback={<StationListSkeleton count={3} />}>
      <Claims />
    </Suspense>
  );
}

async function Claims() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return <AccessDenied user={user} required="admin" next="/admin/claims" />;
  const claims = await getStore().listClaims();
  const pending = claims.filter((c) => c.status === "pending");
  const decided = claims.filter((c) => c.status !== "pending");
  return (
    <div className="space-y-6">
      <PageHeader title="Ownership claims" description="Operators asking to take over a source-listed station. Approving records your decision; ownership is linked after you check the evidence." />
      {pending.length === 0 ? (
        <EmptyState icon={Inbox} title="No claims waiting" body="New claims from operators appear here." />
      ) : (
        <ul className="space-y-3">
          {pending.map((c) => (
            <li key={c.id}>
              <Card>
                <CardBody className="space-y-3 text-sm">
                  <p className="font-semibold">
                    {c.companyName} → <Link className="text-brand-700 underline" href={`/stations/${c.stationId}`}>{c.stationName ?? c.stationId}</Link>
                  </p>
                  <p className="text-ink-muted">{c.contactEmail}{c.contactPhone ? ` · ${c.contactPhone}` : ""} · {formatDate(c.createdAt)}</p>
                  <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3">{c.evidence}</p>
                  <form action={decideClaimAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input name="note" placeholder="Note (optional)" aria-label="Review note" maxLength={500} className="h-10 min-w-48 flex-1 rounded-xl border border-line px-3 text-sm" />
                    <button name="status" value="approved" className="h-10 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white">Approve</button>
                    <button name="status" value="rejected" className="h-10 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700">Reject</button>
                  </form>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {decided.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Decided</h2>
          <ul className="space-y-1 text-sm text-ink-muted">
            {decided.map((c) => (
              <li key={c.id}>{c.companyName} · {c.stationName ?? c.stationId} · {c.status}{c.reviewNote ? ` — ${c.reviewNote}` : ""}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
