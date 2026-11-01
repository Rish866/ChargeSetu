import Link from "next/link";
import { Clock, IndianRupee, MapPin, Navigation } from "lucide-react";
import { ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { directionsUrl, displayPrice, formatDate, formatDistanceKm } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { StationWithDistance } from "@/lib/stations/search";
import {
  AvailabilityNotice,
  ConnectorBadges,
  DemoBadge,
  PowerBadge,
  VerificationBadge,
} from "./station-badges";

export function StationCard({ station }: { station: StationWithDistance }) {
  const price = displayPrice(station);
  const href = `/stations/${station.slug}`;

  return (
    <Card className="flex h-full flex-col">
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <VerificationBadge station={station} />
          <DemoBadge station={station} />
          {station.distanceKm !== undefined && (
            <span className="ml-auto text-xs font-medium text-brand-700">
              {t.stations.distanceAway(formatDistanceKm(station.distanceKm))}
            </span>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{station.network}</p>
          <h3 className="mt-0.5 text-base font-semibold leading-snug">
            <Link href={href} className="hover:underline">
              {station.name}
            </Link>
          </h3>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-muted">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              {station.address}, <span className="font-medium text-ink">{station.area}</span>, {station.city}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <PowerBadge kw={station.powerKw} />
        </div>
        <ConnectorBadges connectors={station.connectorTypes} />

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">{t.stations.price}</dt>
            <IndianRupee aria-hidden className="size-4 text-ink-subtle" />
            <dd className={price ? "font-semibold" : "text-ink-subtle"}>{price ?? t.stations.priceNotVerified}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">{t.stations.hours}</dt>
            <Clock aria-hidden className="size-4 text-ink-subtle" />
            <dd className="truncate">{station.openingHours}</dd>
          </div>
        </dl>

        <div className="mt-auto space-y-1 border-t border-line pt-3">
          <AvailabilityNotice compact />
          <p className="text-xs text-ink-subtle">
            {station.lastVerifiedAt
              ? `${t.stations.lastVerified} ${formatDate(station.lastVerifiedAt)}`
              : `${t.stations.lastUpdated} ${formatDate(station.updatedAt)}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
        <ButtonLink href={href} variant="secondary" size="sm">
          {t.stations.details}
        </ButtonLink>
        <ButtonAnchor
          href={directionsUrl(station.latitude, station.longitude)}
          size="sm"
          aria-label={`${t.stations.directions} to ${station.name} (opens Google Maps)`}
        >
          <Navigation aria-hidden className="size-4" />
          {t.stations.directions}
        </ButtonAnchor>
      </div>
    </Card>
  );
}
