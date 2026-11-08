import { BadgeCheck, CircleDashed, FlaskConical, Gauge, Plug, WifiOff } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { connectorCurrent, connectorLabel, LIVE_AVAILABILITY_CONNECTED } from "@/lib/constants";
import { formatDate, formatKw } from "@/lib/format";
import { verificationFreshness } from "@/lib/india";
import { t } from "@/lib/i18n";
import type { Station, StationStatus } from "@/lib/types";

export function ConnectorBadges({ connectors }: { connectors: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t.stations.connectors}>
      {connectors.map((c) => (
        <li key={c}>
          <Badge
            tone={connectorCurrent(c) === "DC" ? "blue" : "gray"}
            icon={<Plug aria-hidden className="size-3" />}
          >
            {connectorLabel(c)}
            <span className="sr-only"> ({connectorCurrent(c)})</span>
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export function PowerBadge({ kw }: { kw: number | null }) {
  if (kw === null) {
    return (
      <Badge tone="gray" icon={<Gauge aria-hidden className="size-3" />}>
        Power not provided
      </Badge>
    );
  }
  const tone: BadgeTone = kw >= 50 ? "violet" : kw > 22 ? "blue" : "gray";
  const label = kw >= 100 ? "Ultra-fast" : kw > 22 ? "DC fast" : "AC";
  return (
    <Badge tone={tone} icon={<Gauge aria-hidden className="size-3" />}>
      {formatKw(kw)} · {label}
    </Badge>
  );
}

export const isSourceListed = (s: Pick<Station, "source" | "verificationStatus">) =>
  s.verificationStatus !== "verified" && (s.source === "bee" || s.source === "osm");

export function VerificationBadge({ station }: { station: Pick<Station, "verificationStatus"> & Partial<Pick<Station, "source">> }) {
  if (station.verificationStatus !== "verified" && (station.source === "bee" || station.source === "osm")) {
    return (
      <Badge tone="amber" icon={<CircleDashed aria-hidden className="size-3.5" />}>
        Source-listed · status unconfirmed
      </Badge>
    );
  }
  return station.verificationStatus === "verified" ? (
    <Badge tone="green" icon={<BadgeCheck aria-hidden className="size-3.5" />}>
      {t.verification.verified}
    </Badge>
  ) : (
    <Badge tone="amber" icon={<CircleDashed aria-hidden className="size-3.5" />}>
      {t.verification.unverified}
    </Badge>
  );
}

const statusTone: Record<StationStatus, BadgeTone> = {
  pending_review: "amber",
  published: "green",
  rejected: "red",
  inactive: "gray",
};

export function StatusBadge({ status }: { status: StationStatus }) {
  return <Badge tone={statusTone[status]}>{t.status[status]}</Badge>;
}

export function DemoBadge({ station }: { station: Pick<Station, "source"> }) {
  if (station.source !== "demo") return null;
  return (
    <Badge tone="amber" icon={<FlaskConical aria-hidden className="size-3" />}>
      {t.demo.label}
    </Badge>
  );
}

/** "Verified 19 days ago (12 Oct 2026)", with a warning once data is old. */
export function FreshnessLine({
  station,
}: {
  station: Pick<Station, "verificationStatus" | "lastVerifiedAt" | "updatedAt"> &
    Partial<Pick<Station, "source" | "sourceDataAsOf">>;
}) {
  if (station.verificationStatus !== "verified" && (station.source === "bee" || station.source === "osm")) {
    return (
      <p className="text-xs text-amber-800">
        Operational status not confirmed · source list dated {formatDate(station.sourceDataAsOf ?? station.updatedAt)}
      </p>
    );
  }
  if (station.verificationStatus !== "verified" || !station.lastVerifiedAt) {
    return (
      <p className="text-xs text-ink-subtle">
        Details not independently checked · listing updated {formatDate(station.updatedAt)}
      </p>
    );
  }
  const f = verificationFreshness(station.lastVerifiedAt);
  return (
    <p className={f.state === "stale" ? "text-xs font-medium text-amber-800" : "text-xs text-ink-subtle"}>
      {f.label} ({formatDate(station.lastVerifiedAt)})
      {f.state === "stale" && " — may be outdated, check before travelling"}
    </p>
  );
}

/** Honest availability label: we never show fake live status. */
export function AvailabilityNotice({ compact = false }: { compact?: boolean }) {
  if (LIVE_AVAILABILITY_CONNECTED) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-subtle" title={t.stations.availabilityHelp}>
      <WifiOff aria-hidden className="size-3.5" />
      {t.stations.availabilityNotConnected}
      {!compact && <span className="hidden sm:inline">— {t.stations.availabilityHelp}</span>}
    </p>
  );
}

export function VehicleBadges({ classes }: { classes: string[] }) {
  if (!classes.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Vehicle types">
      {classes.includes("car") && <li><Badge tone="gray">Car</Badge></li>}
      {classes.includes("two_three_wheeler") && <li><Badge tone="gray">2W / 3W</Badge></li>}
    </ul>
  );
}
