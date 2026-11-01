import { AlertTriangle, ExternalLink } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { connectorLabel } from "@/lib/constants";
import type { LeadStatus, StationLead } from "@/lib/types";

const statusLabel: Record<LeadStatus, { label: string; tone: BadgeTone }> = {
  pending_review: { label: "Needs review", tone: "amber" },
  converted: { label: "Converted to station", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  duplicate: { label: "Duplicate", tone: "gray" },
};

const missingLabel: Record<string, string> = {
  coordinates: "Coordinates",
  connector_types: "Connectors",
  power_kw: "Power",
  tariff: "Tariff",
  opening_hours: "Hours",
  area: "Area",
  connector_count: "Connector count",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const s = statusLabel[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Everything known about a lead, with gaps shown explicitly. */
export function LeadSummary({ lead }: { lead: StationLead }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LeadStatusBadge status={lead.status} />
        <Badge tone="gray">Unverified lead</Badge>
        {lead.sourceRow && <span className="text-xs text-ink-subtle">CSV row {lead.sourceRow}</span>}
      </div>
      <div>
        {lead.operatorName && <p className="text-xs font-semibold uppercase text-brand-700">{lead.operatorName}</p>}
        <h3 className="font-semibold">{lead.stationName}</h3>
        <p className="text-sm text-ink-muted">
          {lead.address} · {lead.city}, {lead.state}
          {lead.pincode && !lead.address.includes(lead.pincode) ? ` ${lead.pincode}` : ""}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-ink-subtle">Connectors</dt>
          <dd>
            {lead.connectorTypes.length ? lead.connectorTypes.map(connectorLabel).join(", ") : <span className="text-amber-800">Not listed</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-subtle">Power (as listed)</dt>
          <dd>{lead.powerKwRaw ? `${lead.powerKwRaw} kW` : <span className="text-amber-800">Not listed</span>}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-subtle">Tariff</dt>
          <dd>{lead.tariffInrPerKwh !== null ? `₹${lead.tariffInrPerKwh}/kWh` : <span className="text-amber-800">Not listed</span>}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-subtle">Source</dt>
          <dd>
            <a
              href={lead.sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-brand-700 underline underline-offset-2"
            >
              {hostname(lead.sourceUrl)} <ExternalLink aria-hidden className="size-3" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </dd>
        </div>
      </dl>
      {lead.accessNotes && (
        <p className="text-sm">
          <span className="text-ink-subtle">Access: </span>
          {lead.accessNotes}
        </p>
      )}
      {lead.notes && (
        <p className="text-sm">
          <span className="text-ink-subtle">Notes: </span>
          {lead.notes}
        </p>
      )}
      {lead.missingFields.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-ink-subtle">Still needed before publishing:</span>
          {lead.missingFields.map((f) => (
            <Badge key={f} tone="amber">
              {missingLabel[f] ?? f}
            </Badge>
          ))}
        </div>
      )}
      {lead.qualityFlags.length > 0 && (
        <ul className="space-y-1 text-sm text-amber-900">
          {lead.qualityFlags.map((f) => (
            <li key={f} className="flex gap-1.5">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      )}
      {lead.reviewNote && (
        <p className="text-sm">
          <span className="text-ink-subtle">Review note: </span>
          {lead.reviewNote}
        </p>
      )}
    </div>
  );
}
