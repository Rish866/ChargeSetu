import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/auth/access-denied";
import { ClaimForm } from "@/components/forms/claim-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { getStore } from "@/lib/data";

export const metadata: Metadata = { title: "Claim this station", robots: { index: false } };

export default function ClaimPage({ params }: PageProps<"/stations/[id]/claim">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Claim params={params} />
    </Suspense>
  );
}

async function Claim({ params }: { params: PageProps<"/stations/[id]/claim">["params"] }) {
  const { id } = await params;
  const [user, station] = await Promise.all([getCurrentUser(), getStore().getPublishedStation(decodeURIComponent(id))]);
  if (!station) notFound();
  if (!user || user.role !== "operator") {
    return <AccessDenied user={user} required="operator" next={`/stations/${station.slug}/claim`} />;
  }
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Claim this station" description={`${station.name} — ${station.city}, ${station.state}`} />
      <Card>
        <CardBody>
          <p className="mb-5 text-sm text-ink-muted">
            If you operate this station, tell us how you can show it. Our team reviews every claim by hand. A claim does not change the public
            listing until it is approved and the details are checked.
          </p>
          <ClaimForm stationId={station.id} defaultCompany={user.name} defaultEmail={user.email ?? ""} />
        </CardBody>
      </Card>
    </div>
  );
}
