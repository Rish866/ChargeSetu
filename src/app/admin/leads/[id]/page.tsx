import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { convertLeadAction, setLeadStatusAction } from "@/app/actions/leads";
import { LeadSummary } from "@/components/admin/lead-summary";
import { AccessDenied } from "@/components/auth/access-denied";
import { StationForm } from "@/components/forms/station-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { isAdmin } from "@/lib/stations/moderation";
import { ResearchPanel } from "@/components/admin/research-panel";
import { buildStationPrefill, findResearch } from "@/lib/leads/research";
import { researchDate, researchEntries } from "@/lib/leads/research-data";

export const metadata: Metadata = { title: "Review lead", robots: { index: false } };

export default function LeadPage({ params }: PageProps<"/admin/leads/[id]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <LeadReview params={params} />
      </Suspense>
    </div>
  );
}

async function LeadReview({ params }: { params: PageProps<"/admin/leads/[id]">["params"] }) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);
  if (!isAdmin(user)) return <AccessDenied user={user} required="admin" next={`/admin/leads/${id}`} />;
  const lead = await getStore().getLead(id);
  if (!lead) notFound();
  const research = findResearch(researchEntries, lead);

  return (
    <div className="space-y-6">
      <Link href="/admin/leads" className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Back to leads
      </Link>
      <PageHeader title="Review lead" />
      <Card>
        <CardBody>
          <LeadSummary lead={lead} />
        </CardBody>
      </Card>

      {research && <ResearchPanel research={research} date={researchDate} />}

      {lead.status !== "pending_review" ? (
        <Alert tone="info">This lead has already been handled.</Alert>
      ) : (
        <>
          <Card>
            <CardBody className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Create a station from this lead</h2>
                <p className="text-sm text-ink-muted">
                  Values from the lead are filled in. Add the coordinates, area, opening hours and number of connectors{" "}
                  <strong>only after confirming them</strong>, and correct anything that turns out to be wrong. The station
                  will be created as <strong>pending review</strong> and stays hidden until you approve it.
                </p>
              </div>
              {lead.qualityFlags.length > 0 && (
                <Alert tone="warning" title="Check these before creating the station">
                  <ul className="list-disc pl-4">
                    {lead.qualityFlags.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              <StationForm
                action={convertLeadAction.bind(null, lead.id)}
                station={buildStationPrefill(lead, research)}
                submitLabel="Create station (pending review)"
                cancelHref="/admin/leads"
                reviewNotice={false}
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-base font-semibold">Not a real or public station?</h2>
              <form action={setLeadStatusAction} className="space-y-3">
                <input type="hidden" name="id" value={lead.id} />
                <label htmlFor="lead-note" className="block text-sm font-medium">
                  Note <span className="font-normal text-ink-subtle">(optional, private)</span>
                </label>
                <textarea
                  id="lead-note"
                  name="note"
                  rows={2}
                  maxLength={500}
                  placeholder="e.g. Hotel guests only — not public"
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="status" value="rejected" variant="danger" size="sm" pendingText="Saving…">
                    Reject lead
                  </SubmitButton>
                  <SubmitButton name="status" value="duplicate" variant="secondary" size="sm" pendingText="Saving…">
                    Mark as duplicate
                  </SubmitButton>
                </div>
              </form>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
