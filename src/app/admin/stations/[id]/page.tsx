import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { adminUpdateStationAction } from "@/app/actions/admin";
import { ModerationButtons } from "@/components/admin/moderation-buttons";
import { AccessDenied } from "@/components/auth/access-denied";
import { StationForm } from "@/components/forms/station-form";
import { StatusBadge, VerificationBadge } from "@/components/stations/station-badges";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { isAdmin } from "@/lib/stations/moderation";

export const metadata: Metadata = { title: "Edit station (admin)" };

export default function AdminStationPage({ params }: PageProps<"/admin/stations/[id]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AdminStation params={params} />
      </Suspense>
    </div>
  );
}

async function AdminStation({ params }: { params: PageProps<"/admin/stations/[id]">["params"] }) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);
  if (!isAdmin(user)) return <AccessDenied user={user} required="admin" next={`/admin/stations/${id}`} />;

  const station = await getStore().getStationById(id);
  if (!station) notFound();

  return (
    <>
      <PageHeader
        title={station.name}
        description="Admin edit. Saving keeps the current status; use the actions below to change it."
        eyebrow={
          <div className="flex gap-1.5">
            <StatusBadge status={station.status} />
            <VerificationBadge station={station} />
          </div>
        }
      />
      <Card className="mb-6">
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold">Moderation</h2>
          <ModerationButtons station={station} />
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <StationForm
            action={adminUpdateStationAction.bind(null, station.id)}
            station={station}
            submitLabel="Save changes"
            cancelHref="/admin"
            reviewNotice={false}
          />
        </CardBody>
      </Card>
    </>
  );
}
