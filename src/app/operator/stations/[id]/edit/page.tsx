import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { updateStationAction } from "@/app/actions/stations";
import { AccessDenied } from "@/components/auth/access-denied";
import { StationForm } from "@/components/forms/station-form";
import { StatusBadge } from "@/components/stations/station-badges";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { t } from "@/lib/i18n";
import { canEditStation, isOperator } from "@/lib/stations/moderation";

export const metadata: Metadata = { title: "Edit station" };

export default function EditStationPage({ params }: PageProps<"/operator/stations/[id]/edit">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <EditStation params={params} />
      </Suspense>
    </div>
  );
}

async function EditStation({ params }: { params: PageProps<"/operator/stations/[id]/edit">["params"] }) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);
  if (!isOperator(user)) return <AccessDenied user={user} required="operator" next={`/operator/stations/${id}/edit`} />;

  const station = await getStore().getStationById(id);
  // Treat "not yours" exactly like "doesn't exist" so IDs can't be probed.
  if (!station || !canEditStation(user, station)) notFound();

  return (
    <>
      <PageHeader title={t.operator.editStation} description={station.name} eyebrow={<StatusBadge status={station.status} />} />
      {station.status === "published" && (
        <Alert tone="warning" className="mb-4">
          Saving changes sends this station back to review. It will be hidden from drivers until an admin approves it again.
        </Alert>
      )}
      {station.status === "rejected" && station.rejectionReason && (
        <Alert tone="error" title="Reviewer feedback" className="mb-4">
          {station.rejectionReason}
        </Alert>
      )}
      <Card>
        <CardBody>
          <StationForm
            action={updateStationAction.bind(null, station.id)}
            station={station}
            submitLabel="Save and resubmit"
            cancelHref="/operator"
            reviewNotice={false}
          />
        </CardBody>
      </Card>
    </>
  );
}
