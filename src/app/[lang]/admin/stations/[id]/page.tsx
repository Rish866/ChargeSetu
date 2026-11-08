import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { adminUpdateStationAction } from "@/app/actions/admin";
import { ModerationButtons } from "@/components/admin/moderation-buttons";
import { AccessDenied } from "@/components/auth/access-denied";
import { StationForm } from "@/components/forms/station-form";
import { StatusBadge, VerificationBadge } from "@/components/stations/station-badges";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { isAdmin } from "@/lib/stations/moderation";

export const metadata: Metadata = { title: "Edit station (admin)" };

export default function AdminStationPage({ params, searchParams }: PageProps<"/[lang]/admin/stations/[id]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AdminStation params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AdminStation({
  params,
  searchParams,
}: {
  params: PageProps<"/[lang]/admin/stations/[id]">["params"];
  searchParams: PageProps<"/[lang]/admin/stations/[id]">["searchParams"];
}) {
  const [{ id }, user, sp] = await Promise.all([params, getCurrentUser(), searchParams]);
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
      {sp.notice === "from-lead" && (
        <Alert tone="success" title="Station created from the lead" className="mb-4">
          It is pending review and hidden from drivers. Approve it below once you&apos;re happy with the details — use{" "}
          <strong>Approve &amp; verify</strong> only if you have confirmed them with the operator or on site.
        </Alert>
      )}
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
