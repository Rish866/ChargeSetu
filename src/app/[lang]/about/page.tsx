import type { Metadata } from "next";
import { BadgeCheck, CircleDashed, ClipboardCheck, Flag, Send, WifiOff } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { isDemoMode } from "@/lib/config";

export const metadata: Metadata = {
  title: "How we verify stations",
  description: "How charging station listings are submitted, reviewed, verified and kept up to date.",
};

const steps = [
  {
    Icon: Send,
    title: "1. Operator submits",
    body: "A charge point operator (CPO) submits station details: location, connectors, power, pricing, hours and amenities. Submissions start as “Pending review” and are not public.",
  },
  {
    Icon: ClipboardCheck,
    title: "2. Our team reviews",
    body: "An admin checks the submission for completeness and plausibility — for example that coordinates match the address and connector details make sense — then approves or rejects it with a reason.",
  },
  {
    Icon: BadgeCheck,
    title: "3. Verification",
    body: "When an admin has confirmed details with the operator or on site, the station is marked “Verified” and the verification date is shown. Prices are only displayed for verified stations.",
  },
  {
    Icon: Flag,
    title: "4. Community reports",
    body: "Drivers can report outdated or incorrect details. Reports go to the admin team, who correct the listing or contact the operator.",
  },
];

export default function AboutPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="How we verify station information"
        description="We are a discovery platform. Stations come from operators and from open map data — we don't install, own or operate any charging hardware."
      />

      <ol className="grid gap-4 md:grid-cols-2">
        {steps.map(({ Icon, title, body }) => (
          <li key={title}>
            <Card className="h-full">
              <CardBody>
                <Icon aria-hidden className="mb-3 size-6 text-brand-600" />
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-ink-muted">{body}</p>
              </CardBody>
            </Card>
          </li>
        ))}
      </ol>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">What the labels mean</h2>
        <dl className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardBody>
              <dt className="flex items-center gap-2 font-semibold text-brand-800">
                <BadgeCheck aria-hidden className="size-5" /> Verified
              </dt>
              <dd className="mt-1 text-sm text-ink-muted">
                Details were confirmed by our review team on the date shown. Things can still change — check before long trips.
              </dd>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <dt className="flex items-center gap-2 font-semibold text-amber-800">
                <CircleDashed aria-hidden className="size-5" /> Source-listed · status unconfirmed
              </dt>
              <dd className="mt-1 text-sm text-ink-muted">
                The location comes from an openly licensed source such as OpenStreetMap. We have not confirmed the station is working,
                public, or that details are current. Unknown details are shown as “not provided”, never guessed.
              </dd>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <dt className="flex items-center gap-2 font-semibold text-amber-800">
                <CircleDashed aria-hidden className="size-5" /> Not yet verified
              </dt>
              <dd className="mt-1 text-sm text-ink-muted">
                Approved for listing based on the operator&apos;s submission, but not independently confirmed. Prices are hidden.
              </dd>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <dt className="flex items-center gap-2 font-semibold text-ink">
                <WifiOff aria-hidden className="size-5" /> Availability not connected
              </dt>
              <dd className="mt-1 text-sm text-ink-muted">
                We don&apos;t yet receive live charger status from operators, so we never show whether a charger is free or busy.
              </dd>
            </CardBody>
          </Card>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What we don&apos;t do (yet)</h2>
        <ul className="list-disc space-y-1 pl-5 text-ink-muted">
          <li>No live availability or charger status.</li>
          <li>No bookings, reservations or payments — pay the operator directly using their app or at the station.</li>
          <li>No official partnerships are implied by a listing.</li>
        </ul>
      </section>

      <section id="demo" className="scroll-mt-24">
        {isDemoMode() ? (
          <Alert tone="warning" title="This site is running in demo mode">
            All stations, operators, networks, addresses, phone numbers and prices shown are fictional sample data. The
            coordinates point to real neighbourhoods only so the map looks realistic — there are no real chargers
            behind these listings. Sign-in uses a demo role picker instead of real accounts, and changes you make are
            kept in memory only and reset when the server restarts.
          </Alert>
        ) : (
          <Alert tone="info" title="Data sources">
            Listings are submitted by charge point operators or added by our team, and labelled with their verification
            status and date.
          </Alert>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/stations">Find stations</ButtonLink>
        <ButtonLink href="/report" variant="secondary">
          Report an issue
        </ButtonLink>
      </div>
    </div>
  );
}
