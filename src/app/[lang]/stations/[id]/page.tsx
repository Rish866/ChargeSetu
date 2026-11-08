import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache, Suspense } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Flag,
  Gauge,
  IndianRupee,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Plug,
  Sparkles,
} from "lucide-react";
import {
  AvailabilityNotice,
  ConnectorBadges,
  DemoBadge,
  FreshnessLine,
  isSourceListed,
  PowerBadge,
  VehicleBadges,
  VerificationBadge,
} from "@/components/stations/station-badges";
import { StationMapLoader } from "@/components/stations/station-map-loader";
import { toMapStation } from "@/components/stations/to-map-station";
import { Alert } from "@/components/ui/alert";
import { ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isMapEnabled } from "@/lib/config";
import { amenityLabel, connectorLabel } from "@/lib/constants";
import type { ChargingPoint, Station } from "@/lib/types";
import { getStore } from "@/lib/data";
import { directionsUrl, displayPrice, formatDate, formatKw, osmUrl } from "@/lib/format";
import { getT } from "@/lib/i18n/server";

const loadStation = cache(async (id: string) => getStore().getPublishedStation(decodeURIComponent(id)));

export async function generateMetadata({ params }: PageProps<"/[lang]/stations/[id]">): Promise<Metadata> {
  const { id } = await params;
  const station = await loadStation(id);
  if (!station) return { title: "Station not found", robots: { index: false } };
  const title = `${station.name} — EV charging in ${station.area ? station.area + ", " : ""}${station.city}`;
  const description = `${station.network} charging station at ${station.address}, ${station.area ? station.area + ", " : ""}${station.city}. Up to ${formatKw(station.powerKw)}; connectors: ${station.connectorTypes.map(connectorLabel).join(", ")}.`;
  return {
    title,
    description,
    alternates: { canonical: `/stations/${station.slug}` },
    openGraph: { title, description, type: "website" },
    // Fictional demo listings should never be indexed.
    // Source-listed (unconfirmed) stations are also kept out of search indexes until verified.
    robots: station.source === "demo" || (station.source !== "operator" && station.verificationStatus !== "verified") ? { index: false, follow: true } : undefined,
  };
}

export default async function StationPage({ params }: PageProps<"/[lang]/stations/[id]">) {
  const t = await getT();
  return (
    <>
      <Link href="/stations" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        {t.stations.backToList}
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <StationLoader params={params} />
      </Suspense>
    </>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading station">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/*
 * Note: because the page shell streams first, a missing station renders the
 * not-found UI with <meta name="robots" content="noindex"> but HTTP 200.
 */
async function StationLoader({ params }: { params: PageProps<"/[lang]/stations/[id]">["params"] }) {
  const { id } = await params;
  const station = await loadStation(id);
  if (!station) notFound();
  const points = await getStore().getChargingPoints(station.id);
  return <StationDetail station={station} points={points} />;
}

async function StationDetail({ station, points }: { station: Station; points: ChargingPoint[] }) {
  const t = await getT();
  const price = displayPrice(station);

  return (
    <article className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <VerificationBadge station={station} />
          <DemoBadge station={station} />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{station.network}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{station.name}</h1>
          <p className="mt-2 flex items-start gap-1.5 text-ink-muted">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
            {station.address}, {station.area ? `${station.area}, ` : ""}{station.city}, {station.state}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ButtonAnchor href={directionsUrl(station.latitude, station.longitude)} size="lg">
            <Navigation aria-hidden className="size-5" />
            {t.stations.directions}
          </ButtonAnchor>
          <ButtonAnchor
            href={station.source === "osm" && station.sourceUrl ? station.sourceUrl : osmUrl(station.latitude, station.longitude)}
            variant="secondary"
            size="lg"
          >
            {t.stations.openInOsm}
          </ButtonAnchor>
        </div>
      </header>

      {isSourceListed(station) && (
        <Alert tone="warning" title={t.stations.sourceListedTitle}>
          {station.source === "osm" ? t.stations.sourceListedOsm : t.stations.sourceListedGov}
        </Alert>
      )}

      {station.source === "demo" && (
        <Alert tone="warning" title="Fictional demo listing">
          This station does not exist. It is sample data used to demonstrate the app. Do not travel here to charge.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardBody className="space-y-5">
              <h2 className="text-lg font-semibold">Charging details</h2>
              <dl className="grid gap-5 sm:grid-cols-2">
                <Detail icon={Plug} label={t.stations.connectors}>
                  {station.connectorTypes.length > 0 ? (
                    <ConnectorBadges connectors={station.connectorTypes} />
                  ) : (
                    <p className="font-medium text-ink-muted">{t.stations.notProvided}</p>
                  )}
                  <div className="mt-1.5"><VehicleBadges classes={station.vehicleClasses} /></div>
                  {station.connectorCount !== null && (
                    <p className="mt-1.5 text-sm text-ink-muted">
                      {station.connectorCount} {station.connectorCount === 1 ? "connector" : "connectors"}
                    </p>
                  )}
                </Detail>
                <Detail icon={Gauge} label={t.stations.power}>
                  <p className="font-semibold">{station.powerKw === null ? t.stations.notProvided : formatKw(station.powerKw)}</p>
                  <div className="mt-1">
                    <PowerBadge kw={station.powerKw} />
                  </div>
                </Detail>
                <Detail icon={IndianRupee} label={t.stations.price}>
                  {price ? (
                    <p className="font-semibold">{price}</p>
                  ) : (
                    <p className="font-medium text-amber-800">
                      {t.stations.priceNotVerified}. Confirm the tariff with the operator before charging.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-ink-subtle">Prices in INR. GST and parking fees may apply.</p>
                </Detail>
                <Detail icon={Clock} label={t.stations.hours}>
                  <p className="font-semibold">{station.openingHours ?? t.stations.notProvided}</p>
                </Detail>
              </dl>
              <div className="rounded-xl bg-gray-50 p-3">
                <AvailabilityNotice />
              </div>
            </CardBody>
          </Card>

          {points.length > 0 && (
            <Card>
              <CardBody>
                <h2 className="mb-3 text-lg font-semibold">{t.stations.chargingPoints}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-ink-subtle">
                      <tr><th className="py-1 pr-3">Connector</th><th className="py-1 pr-3">Type</th><th className="py-1 pr-3">Power</th><th className="py-1">Count</th></tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {points.map((p) => (
                        <tr key={`${p.standard}-${p.powerKw}`}>
                          <td className="py-1.5 pr-3">{connectorLabel(p.standard)}</td>
                          <td className="py-1.5 pr-3">{p.current}</td>
                          <td className="py-1.5 pr-3">{p.powerKw === null ? "Not provided" : formatKw(p.powerKw)}</td>
                          <td className="py-1.5">{p.connectorCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          )}

          {station.sourceNotes && (
            <Card>
              <CardBody>
                <h2 className="mb-3 text-lg font-semibold">{t.stations.fromSource}</h2>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {station.sourceNotes.split(/\.\s+/).filter(Boolean).map((n) => (
                    <li key={n}>{n.replace(/\.$/, "")}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {station.amenities.length > 0 && (
            <Card>
              <CardBody>
                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                  <Sparkles aria-hidden className="size-5 text-brand-600" />
                  {t.stations.amenities}
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {station.amenities.map((a) => (
                    <li key={a} className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-900">
                      {amenityLabel(a)}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {station.photoUrls.length > 0 && (
            <Card>
              <CardBody>
                <h2 className="mb-3 text-lg font-semibold">{t.stations.photos}</h2>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {station.photoUrls.map((url, i) => (
                    <li key={url}>
                      {/* Operator-supplied URLs from arbitrary hosts, so next/image isn't used. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`${station.name} photo ${i + 1}`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="aspect-[4/3] w-full rounded-xl object-cover"
                      />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {isMapEnabled() && <StationMapLoader stations={[toMapStation(station)]} height="18rem" />}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardBody className="space-y-3 text-sm">
              <h2 className="text-base font-semibold">{t.stations.listingInfo}</h2>
              <p>
                <span className="text-ink-subtle">Verification: </span>
                {station.verificationStatus === "verified"
                  ? t.verification.verifiedHelp
                  : isSourceListed(station)
                    ? "Taken from a public source list. Not independently confirmed by our team."
                    : t.verification.unverifiedHelp}
              </p>
              <FreshnessLine station={station} />
              <p>
                <span className="text-ink-subtle">{t.stations.lastUpdated}: </span>
                {formatDate(station.updatedAt)}
              </p>
              <p>
                <span className="text-ink-subtle">Source: </span>
                {station.source === "demo"
                  ? "Fictional demo data"
                  : station.source === "operator"
                    ? "Submitted by the operator, reviewed by our team"
                    : station.source === "osm"
                      ? (
                          <>
                            <a href="https://www.openstreetmap.org/copyright" className="underline underline-offset-2">© OpenStreetMap contributors</a>
                            {" "}(ODbL 1.0) ·{" "}
                            <Link href="/open-data" className="underline underline-offset-2">Open data</Link>
                          </>
                        )
                      : station.source === "bee"
                        ? (station.sourceAttribution ?? "Public source list")
                        : "Added by our team"}
              </p>
              {station.sourceDataAsOf && (
                <p>
                  <span className="text-ink-subtle">{station.source === "osm" ? "Last edited on OpenStreetMap: " : "Source list dated: "}</span>
                  {formatDate(station.sourceDataAsOf)}
                </p>
              )}
              {station.lastEvidenceCheck && (
                <p>
                  <span className="text-ink-subtle">Last checked against the source: </span>
                  {formatDate(station.lastEvidenceCheck)}
                </p>
              )}
              {station.nameIsDerived && (
                <p className="text-xs text-ink-subtle">The source gives no station name, so this name is built from the operator and place.</p>
              )}
              <Link href="/about" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                How we verify stations <ArrowRight aria-hidden className="size-4" />
              </Link>
            </CardBody>
          </Card>

          {(station.contactPhone || station.contactEmail) && (
            <Card>
              <CardBody className="space-y-2 text-sm">
                <h2 className="text-base font-semibold">{t.stations.contact}</h2>
                {station.contactPhone && (
                  <a href={`tel:${station.contactPhone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-brand-700 hover:underline">
                    <Phone aria-hidden className="size-4" /> {station.contactPhone}
                  </a>
                )}
                {station.contactEmail && (
                  <a href={`mailto:${station.contactEmail}`} className="flex items-center gap-2 text-brand-700 hover:underline">
                    <Mail aria-hidden className="size-4" /> {station.contactEmail}
                  </a>
                )}
              </CardBody>
            </Card>
          )}

          {station.source !== "demo" && station.operatorId === null && (
            <ButtonLink href={`/stations/${station.slug}/claim`} variant="secondary" className="w-full">
              {t.stations.claim}
            </ButtonLink>
          )}
          <ButtonLink href={`/report?station=${station.id}`} variant="secondary" className="w-full">
            <Flag aria-hidden className="size-4" />
            {t.stations.reportIssue}
          </ButtonLink>
        </aside>
      </div>
    </article>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Plug;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="mb-1.5 flex items-center gap-1.5 text-sm text-ink-subtle">
        <Icon aria-hidden className="size-4" />
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
