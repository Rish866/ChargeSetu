import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Pencil, Plus, PlugZap } from "lucide-react";
import { AccessDenied } from "@/components/auth/access-denied";
import { StatusBadge, VerificationBadge } from "@/components/stations/station-badges";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StationListSkeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { formatDate, formatKw, rawPrice } from "@/lib/format";
import { t } from "@/lib/i18n";
import { isOperator } from "@/lib/stations/moderation";

export const metadata: Metadata = { title: "Operator dashboard" };

export default function OperatorPage({ searchParams }: PageProps<"/operator">) {
  return (
    <Suspense fallback={<StationListSkeleton count={2} />}>
      <OperatorDashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function OperatorDashboard({ searchParams }: { searchParams: PageProps<"/operator">["searchParams"] }) {
  const [user, sp] = await Promise.all([getCurrentUser(), searchParams]);
  if (!isOperator(user)) return <AccessDenied user={user} required="operator" next="/operator" />;

  const stations = await getStore().listStationsByOperator(user.operatorId);
  const notice = sp.notice === "submitted" ? t.operator.submitted : sp.notice === "updated" ? t.operator.updated : null;
  const counts = {
    published: stations.filter((s) => s.status === "published").length,
    pending: stations.filter((s) => s.status === "pending_review").length,
    rejected: stations.filter((s) => s.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.operator.title}
        description={`Signed in as ${user.name}${user.isDemo ? " (demo)" : ""}. ${t.operator.reviewNote}`}
        actions={
          <ButtonLink href="/operator/stations/new">
            <Plus aria-hidden className="size-4" />
            {t.operator.newStation}
          </ButtonLink>
        }
      />

      {notice && <Alert tone="success">{notice}</Alert>}

      <dl className="grid grid-cols-3 gap-3">
        {[
          ["Published", counts.published],
          ["Pending review", counts.pending],
          ["Needs changes", counts.rejected],
        ].map(([label, n]) => (
          <Card key={label} className="p-4">
            <dt className="text-xs text-ink-subtle sm:text-sm">{label}</dt>
            <dd className="text-2xl font-bold">{n}</dd>
          </Card>
        ))}
      </dl>

      <section aria-labelledby="your-stations" className="space-y-3">
        <h2 id="your-stations" className="text-lg font-semibold">
          {t.operator.yourStations}
        </h2>
        {stations.length === 0 ? (
          <EmptyState
            icon={PlugZap}
            title={t.operator.empty}
            body="Add your first station — it takes about two minutes."
            action={<ButtonLink href="/operator/stations/new">{t.operator.newStation}</ButtonLink>}
          />
        ) : (
          <ul className="space-y-3">
            {stations.map((s) => (
              <li key={s.id}>
                <Card className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status={s.status} />
                        {s.status === "published" && <VerificationBadge station={s} />}
                      </div>
                      <h3 className="font-semibold">
                        {s.status === "published" ? (
                          <Link href={`/stations/${s.slug}`} className="hover:underline">
                            {s.name}
                          </Link>
                        ) : (
                          s.name
                        )}
                      </h3>
                      <p className="text-sm text-ink-muted">
                        {s.area}, {s.city} · {formatKw(s.powerKw)} · {s.connectorCount} connectors · {rawPrice(s)}
                      </p>
                      <p className="text-xs text-ink-subtle">Last updated {formatDate(s.updatedAt)}</p>
                      {s.status === "rejected" && s.rejectionReason && (
                        <Alert tone="error" title="Reviewer feedback" className="mt-2">
                          {s.rejectionReason}
                        </Alert>
                      )}
                    </div>
                    <ButtonLink href={`/operator/stations/${s.id}/edit`} variant="secondary" size="sm">
                      <Pencil aria-hidden className="size-4" />
                      Edit
                    </ButtonLink>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
