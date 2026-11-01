import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Inbox, MessageSquareWarning } from "lucide-react";
import { setReportStatusAction } from "@/app/actions/admin";
import { ModerationButtons } from "@/components/admin/moderation-buttons";
import { AccessDenied } from "@/components/auth/access-denied";
import { ConnectorBadges, DemoBadge, StatusBadge, VerificationBadge } from "@/components/stations/station-badges";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { StationListSkeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { amenityLabel, issueTypeLabel } from "@/lib/constants";
import { getStore } from "@/lib/data";
import { formatDate, formatKw, rawPrice } from "@/lib/format";
import { t } from "@/lib/i18n";
import { isAdmin } from "@/lib/stations/moderation";
import { cn } from "@/lib/cn";
import type { Station, StationStatus } from "@/lib/types";
import type { OperatorSummary } from "@/lib/data/store";

export const metadata: Metadata = { title: "Admin" };

const STATUS_FILTERS: Array<{ value: StationStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "pending_review", label: "Pending" },
  { value: "rejected", label: "Rejected" },
  { value: "inactive", label: "Inactive" },
];

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<StationListSkeleton count={4} />}>
      <AdminDashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminDashboard({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const [user, sp] = await Promise.all([getCurrentUser(), searchParams]);
  // Server-side gate: non-admins never receive admin data.
  if (!isAdmin(user)) return <AdminDenied user={user} />;

  const statusParam = typeof sp.status === "string" ? sp.status : "all";
  const statusFilter = STATUS_FILTERS.find((f) => f.value === statusParam)?.value ?? "all";

  const store = getStore();
  const [counts, pending, reports, all, operators] = await Promise.all([
    store.getCounts(),
    store.listAllStations("pending_review"),
    store.listReports("open"),
    store.listAllStations(statusFilter === "all" ? undefined : statusFilter),
    store.listOperators(),
  ]);
  const operatorById = new Map(operators.map((o) => [o.id, o]));

  return (
    <div className="space-y-10">
      <PageHeader title={t.admin.title} description={`Signed in as ${user.name}${user.isDemo ? " (demo)" : ""}.`} />
      {sp.notice === "saved" && <Alert tone="success">Station details saved.</Alert>}
      {counts.pendingLeads > 0 && (
        <Alert tone="info" title={`${counts.pendingLeads} station lead${counts.pendingLeads === 1 ? "" : "s"} to review`}>
          Imported candidate stations are private and unverified until you confirm them.{" "}
          <Link href="/admin/leads" className="font-semibold underline underline-offset-2">
            Review leads
          </Link>
        </Alert>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          ["Published", counts.published],
          ["Verified", counts.verified],
          ["Pending review", counts.pending],
          ["Rejected / inactive", counts.rejected + counts.inactive],
          ["Operators", counts.operators],
          ["Open reports", counts.openReports],
          ["Leads to review", counts.pendingLeads],
        ].map(([label, n]) => (
          <Card key={label} className="p-4">
            <dt className="text-xs text-ink-subtle">{label}</dt>
            <dd className="text-2xl font-bold">{n}</dd>
          </Card>
        ))}
      </dl>

      <section aria-labelledby="pending-h" className="space-y-3">
        <h2 id="pending-h" className="text-lg font-semibold">
          {t.admin.pending} ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <EmptyState icon={Inbox} title={t.admin.noPending} />
        ) : (
          <ul className="space-y-3">
            {pending.map((s) => (
              <li key={s.id}>
                <StationAdminCard station={s} operator={s.operatorId ? operatorById.get(s.operatorId) : undefined} detailed />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="reports-h" className="space-y-3">
        <h2 id="reports-h" className="text-lg font-semibold">
          {t.admin.reports} ({reports.length})
        </h2>
        {reports.length === 0 ? (
          <EmptyState icon={MessageSquareWarning} title={t.admin.noReports} />
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id}>
                <Card className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{issueTypeLabel(r.issueType)}</p>
                    <p className="text-xs text-ink-subtle">{formatDate(r.createdAt)}</p>
                  </div>
                  <p className="text-sm">
                    <span className="text-ink-subtle">Station: </span>
                    <Link href={`/admin/stations/${r.stationId}`} className="font-medium text-brand-700 underline underline-offset-2">
                      {r.stationName ?? r.stationId}
                    </Link>
                  </p>
                  <p className="whitespace-pre-line text-sm text-ink-muted">{r.description}</p>
                  {r.reporterEmail && <p className="text-xs text-ink-subtle">From: {r.reporterEmail}</p>}
                  <div className="flex gap-2 pt-1">
                    {(["resolved", "dismissed"] as const).map((status) => (
                      <form key={status} action={setReportStatusAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value={status} />
                        <SubmitButton size="sm" variant={status === "resolved" ? "primary" : "secondary"} pendingText="…">
                          {status === "resolved" ? t.admin.resolve : t.admin.dismiss}
                        </SubmitButton>
                      </form>
                    ))}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="operators-h" className="space-y-3">
        <h2 id="operators-h" className="text-lg font-semibold">
          Operator accounts ({operators.length})
        </h2>
        <p className="text-sm text-ink-muted">
          Anyone can register as an operator. Before approving their first station, confirm the company is a genuine
          charge point operator (for example by calling the number on their website).
        </p>
        {operators.length === 0 ? (
          <p className="text-sm text-ink-muted">No operator accounts yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-line bg-gray-50 text-xs text-ink-subtle">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Company</th>
                  <th scope="col" className="px-4 py-2 font-medium">Contact</th>
                  <th scope="col" className="px-4 py-2 font-medium">Stations</th>
                  <th scope="col" className="px-4 py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {operators.map((o) => (
                  <tr key={o.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 font-medium">{o.companyName}</td>
                    <td className="px-4 py-2">
                      <a className="text-brand-700 underline underline-offset-2" href={`mailto:${o.contactEmail}`}>
                        {o.contactEmail}
                      </a>
                      {o.contactPhone && <span className="block text-xs text-ink-subtle">{o.contactPhone}</span>}
                    </td>
                    <td className="px-4 py-2">{o.stationCount}</td>
                    <td className="px-4 py-2">{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="all-h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="all-h" className="text-lg font-semibold">
            {t.admin.allStations}
          </h2>
          <nav aria-label="Filter by status" className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <Link
                key={f.value}
                href={f.value === "all" ? "/admin#all-h" : `/admin?status=${f.value}#all-h`}
                aria-current={statusFilter === f.value ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1 text-sm",
                  statusFilter === f.value ? "bg-ink text-white" : "bg-white text-ink-muted ring-1 ring-line hover:text-ink",
                )}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        </div>
        {all.length === 0 ? (
          <p className="text-sm text-ink-muted">No stations with this status.</p>
        ) : (
          <ul className="space-y-3">
            {all.map((s) => (
              <li key={s.id}>
                <StationAdminCard station={s} operator={s.operatorId ? operatorById.get(s.operatorId) : undefined} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StationAdminCard({
  station: s,
  operator,
  detailed = false,
}: {
  station: Station;
  operator?: OperatorSummary;
  detailed?: boolean;
}) {
  return (
    <Card className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge status={s.status} />
        <VerificationBadge station={s} />
        <DemoBadge station={s} />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-brand-700">{s.network}</p>
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
          {s.address}, {s.area}, {s.city}, {s.state}
        </p>
      </div>
      <p className="text-sm">
        <span className="text-ink-subtle">Submitted by: </span>
        {operator ? (
          <>
            <span className="font-medium">{operator.companyName}</span>{" "}
            <a className="text-brand-700 underline underline-offset-2" href={`mailto:${operator.contactEmail}`}>
              {operator.contactEmail}
            </a>
          </>
        ) : s.operatorId ? (
          "Operator account (details unavailable)"
        ) : (
          "Admin / unowned record"
        )}
      </p>
      {detailed && (
        <>
          <ConnectorBadges connectors={s.connectorTypes} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-ink-subtle">Opening hours</dt>
              <dd>{s.openingHours}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">Station phone</dt>
              <dd>{s.contactPhone ?? "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-ink-subtle">Amenities</dt>
              <dd>{s.amenities.length ? s.amenities.map(amenityLabel).join(", ") : "—"}</dd>
            </div>
          </dl>
          {s.photoUrls.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-ink-subtle">
                Photo links (open each and check it shows this charger before approving):
              </p>
              <ul className="flex flex-wrap gap-2 text-sm">
                {s.photoUrls.map((u, i) => (
                  <li key={u}>
                    <a href={u} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-700 underline underline-offset-2">
                      Photo {i + 1} ({new URL(u).hostname})
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-ink-subtle">Power</dt>
              <dd>{formatKw(s.powerKw)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">Connectors</dt>
              <dd>{s.connectorCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">Price (unverified)</dt>
              <dd>{rawPrice(s)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">Coordinates</dt>
              <dd>
                <a
                  className="text-brand-700 underline underline-offset-2"
                  href={`https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=18/${s.latitude}/${s.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                </a>
              </dd>
            </div>
          </dl>
        </>
      )}
      <p className="text-xs text-ink-subtle">
        Updated {formatDate(s.updatedAt)} · Verified {formatDate(s.lastVerifiedAt)} · Source: {s.source}
      </p>
      {s.rejectionReason && s.status === "rejected" && <p className="text-sm text-red-700">Rejection reason: {s.rejectionReason}</p>}
      <ModerationButtons station={s} />
    </Card>
  );
}

function AdminDenied({ user }: { user: Awaited<ReturnType<typeof getCurrentUser>> }) {
  return <AccessDenied user={user} required="admin" next="/admin" />;
}
