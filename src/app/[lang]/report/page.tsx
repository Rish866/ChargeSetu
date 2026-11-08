import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ReportForm } from "@/components/forms/report-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getStore } from "@/lib/data";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Report an issue",
  description: "Report incorrect or outdated EV charging station information.",
};

export default async function ReportPage({ searchParams }: PageProps<"/[lang]/report">) {
  const t = await getT();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.report.title} description={t.report.subtitle} />
      <Card>
        <CardBody>
          <Suspense
            fallback={
              <div className="space-y-4" role="status" aria-label="Loading form">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            }
          >
            <ReportFormLoader searchParams={searchParams} />
          </Suspense>
        </CardBody>
      </Card>
    </div>
  );
}

async function ReportFormLoader({ searchParams }: { searchParams: PageProps<"/[lang]/report">["searchParams"] }) {
  const sp = await searchParams;
  const store = getStore();
  const requested = typeof sp.station === "string" ? sp.station : undefined;
  if (requested) {
    // With tens of thousands of stations a dropdown is unusable: report from a station page instead.
    const names = await store.getStationNames([requested]);
    if (names[requested]) {
      return <ReportForm stations={[{ id: requested, name: names[requested], city: "" }]} defaultStationId={requested} />;
    }
  }
  const stations = await store.listStationOptions();
  if (stations.length > 200) {
    return (
      <p className="text-sm text-ink-muted">
        To report a problem, open the station on its page and tap <strong>Report an issue</strong>.{" "}
        <Link href="/stations" className="font-semibold text-brand-700 underline underline-offset-2">Find a station</Link>
      </p>
    );
  }
  return <ReportForm stations={stations} />;
}
