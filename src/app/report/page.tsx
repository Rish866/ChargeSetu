import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportForm } from "@/components/forms/report-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getStore } from "@/lib/data";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Report an issue",
  description: "Report incorrect or outdated EV charging station information.",
};

export default function ReportPage({ searchParams }: PageProps<"/report">) {
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

async function ReportFormLoader({ searchParams }: { searchParams: PageProps<"/report">["searchParams"] }) {
  const sp = await searchParams;
  const stations = await getStore().listStationOptions();
  const requested = typeof sp.station === "string" ? sp.station : undefined;
  const defaultStationId = stations.some((s) => s.id === requested) ? requested : undefined;
  return <ReportForm stations={stations} defaultStationId={defaultStationId} />;
}
