import type { Metadata } from "next";
import { Suspense } from "react";
import { createStationAction } from "@/app/actions/stations";
import { AccessDenied } from "@/components/auth/access-denied";
import { StationForm } from "@/components/forms/station-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { isOperator } from "@/lib/stations/moderation";

export const metadata: Metadata = { title: "Submit a station" };

export default function NewStationPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <NewStation />
      </Suspense>
    </div>
  );
}

async function NewStation() {
  const t = await getT();
  const user = await getCurrentUser();
  if (!isOperator(user)) return <AccessDenied user={user} required="operator" next="/operator/stations/new" />;
  return (
    <>
      <PageHeader title={t.operator.newStation} description="Fields marked * are required." />
      <Card>
        <CardBody>
          <StationForm action={createStationAction} submitLabel="Submit for review" cancelHref="/operator" />
        </CardBody>
      </Card>
    </>
  );
}
