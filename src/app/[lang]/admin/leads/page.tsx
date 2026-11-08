import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Inbox } from "lucide-react";
import { LeadSummary } from "@/components/admin/lead-summary";
import { AccessDenied } from "@/components/auth/access-denied";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StationListSkeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getStore } from "@/lib/data";
import { isAdmin } from "@/lib/stations/moderation";
import type { LeadStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Station leads", robots: { index: false } };

const FILTERS: Array<{ value: LeadStatus; label: string }> = [
  { value: "pending_review", label: "Needs review" },
  { value: "converted", label: "Converted" },
  { value: "rejected", label: "Rejected" },
  { value: "duplicate", label: "Duplicate" },
];

export default function LeadsPage({ searchParams }: PageProps<"/[lang]/admin/leads">) {
  return (
    <Suspense fallback={<StationListSkeleton count={4} />}>
      <Leads searchParams={searchParams} />
    </Suspense>
  );
}

async function Leads({ searchParams }: { searchParams: PageProps<"/[lang]/admin/leads">["searchParams"] }) {
  const [user, sp] = await Promise.all([getCurrentUser(), searchParams]);
  if (!isAdmin(user)) return <AccessDenied user={user} required="admin" next="/admin/leads" />;

  const status = FILTERS.find((f) => f.value === sp.status)?.value ?? "pending_review";
  const city = typeof sp.city === "string" && sp.city ? sp.city : undefined;
  const all = await getStore().listLeads(status);
  const cities = [...new Set(all.map((l) => l.city))].sort();
  const leads = city ? all.filter((l) => l.city === city) : all;
  const href = (next: { status?: string; city?: string }) => {
    const p = new URLSearchParams();
    const s = next.status ?? status;
    if (s !== "pending_review") p.set("status", s);
    const c = "city" in next ? next.city : city;
    if (c) p.set("city", c);
    const q = p.toString();
    return q ? `/admin/leads?${q}` : "/admin/leads";
  };

  return (
    <div className="space-y-6">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> Back to admin
      </Link>
      <PageHeader
        title="Station leads"
        description="Candidate stations gathered from directories and articles. They are private, unverified, and never shown to drivers."
      />
      <Alert tone="info" title="How to use leads">
        Confirm each lead with the operator or on site. Then choose <strong>Review</strong>, fill in the confirmed
        coordinates, hours and other details, and create a station. The new station goes to the pending queue, where you
        approve and verify it as usual. Leave anything you haven&apos;t confirmed blank.
      </Alert>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Lead status" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={href({ status: f.value, city: undefined })}
              aria-current={status === f.value ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-sm",
                status === f.value ? "bg-ink text-white" : "bg-white text-ink-muted ring-1 ring-line hover:text-ink",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        {cities.length > 1 && (
          <nav aria-label="City" className="flex flex-wrap gap-1">
            <Link
              href={href({ city: undefined })}
              aria-current={!city ? "page" : undefined}
              className={cn("rounded-full px-3 py-1 text-sm", !city ? "bg-brand-700 text-white" : "bg-white ring-1 ring-line")}
            >
              All cities ({all.length})
            </Link>
            {cities.map((c) => (
              <Link
                key={c}
                href={href({ city: c })}
                aria-current={city === c ? "page" : undefined}
                className={cn("rounded-full px-3 py-1 text-sm", city === c ? "bg-brand-700 text-white" : "bg-white ring-1 ring-line")}
              >
                {c} ({all.filter((l) => l.city === c).length})
              </Link>
            ))}
          </nav>
        )}
      </div>

      <p className="text-sm font-medium" aria-live="polite">
        {leads.length === 1 ? "1 lead" : `${leads.length} leads`}
      </p>

      {leads.length === 0 ? (
        <EmptyState icon={Inbox} title="No leads here" body="Leads are added by importing a CSV file (see the README)." />
      ) : (
        <ul className="space-y-3">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Card className="space-y-3 p-4 sm:p-5">
                <LeadSummary lead={lead} />
                <div className="flex flex-wrap gap-2">
                  {lead.status === "pending_review" && (
                    <ButtonLink href={`/admin/leads/${lead.id}`} size="sm">
                      Review
                    </ButtonLink>
                  )}
                  {lead.stationId && (
                    <ButtonLink href={`/admin/stations/${lead.stationId}`} variant="secondary" size="sm">
                      Open station
                    </ButtonLink>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
