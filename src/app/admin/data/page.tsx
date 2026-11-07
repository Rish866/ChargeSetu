import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/auth/access-denied";
import { ImportPanel } from "@/components/admin/import-panel";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StationListSkeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { INDIAN_STATES } from "@/lib/constants";
import { getStore } from "@/lib/data";
import { datasetByState, loadBeeDataset } from "@/lib/etl/dataset";
import { formatDate } from "@/lib/format";
import { isAdmin } from "@/lib/stations/moderation";

export const metadata: Metadata = { title: "Nationwide data", robots: { index: false } };

export default function DataPage() {
  return (
    <Suspense fallback={<StationListSkeleton count={4} />}>
      <DataAdmin />
    </Suspense>
  );
}

async function DataAdmin() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return <AccessDenied user={user} required="admin" next="/admin/data" />;

  const store = getStore();
  const [dataset, stats, batches] = await Promise.all([loadBeeDataset(), store.stateStats(), store.listImportBatches(10)]);
  const inFile = datasetByState(dataset);
  const live = new Map(stats.map((s) => [s.state, s]));
  const num = (n: number) => n.toLocaleString("en-IN");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Nationwide data"
        description="Import the bundled BEE station list, publish it state by state, and watch coverage."
      />
      <Alert tone="info" title="Before you publish">
        Imported stations are labelled “Source-listed — operational status not confirmed”. The BEE list has no published reuse licence;
        get written confirmation from BEE before commercial use (see docs/NATIONWIDE.md).
      </Alert>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="text-lg font-semibold">Import and publish</h2>
          <ImportPanel states={[...INDIAN_STATES]} datasetTotal={dataset.length} />
        </CardBody>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">State dashboard</h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-ink-subtle">
              <tr>
                <th className="px-3 py-2">State / UT</th>
                <th className="px-3 py-2 text-right">In file</th>
                <th className="px-3 py-2 text-right">In database</th>
                <th className="px-3 py-2 text-right">Published</th>
                <th className="px-3 py-2 text-right">Hidden</th>
                <th className="px-3 py-2 text-right">Verified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {INDIAN_STATES.map((s) => {
                const l = live.get(s);
                return (
                  <tr key={s}>
                    <td className="px-3 py-2 font-medium">{s}</td>
                    <td className="px-3 py-2 text-right">{num(inFile.get(s) ?? 0)}</td>
                    <td className="px-3 py-2 text-right">{num(l?.total ?? 0)}</td>
                    <td className="px-3 py-2 text-right">{num(l?.published ?? 0)}</td>
                    <td className="px-3 py-2 text-right">{num(l?.hidden ?? 0)}</td>
                    <td className="px-3 py-2 text-right">{num(l?.verified ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Import history</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-ink-muted">No imports yet.</p>
        ) : (
          <ul className="space-y-2">
            {batches.map((b) => (
              <li key={b.id} className="rounded-xl border border-line bg-white p-3 text-sm">
                <p className="font-medium">{b.label}</p>
                <p className="text-xs text-ink-muted">
                  {b.status} · {num(b.inserted)} added · {num(b.skipped)} skipped · {num(b.failed)} failed · started {formatDate(b.startedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
