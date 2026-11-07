import { AlertTriangle, ExternalLink, SearchCheck } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import type { ResearchDecision, ResearchEntry } from "@/lib/leads/research";

const tone: Record<ResearchDecision, BadgeTone> = {
  listed_by_operator: "green",
  corroborated_secondary: "blue",
  needs_correction: "red",
  restricted_access: "amber",
  no_evidence_found: "gray",
};

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Shows what desk research found for a lead, and what is still unconfirmed. */
export function ResearchPanel({ research, date }: { research: ResearchEntry; date: string }) {
  const sources = research.evidence.filter((e) => e.kind !== "checked_not_found");
  const checked = research.evidence.filter((e) => e.kind === "checked_not_found");
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchCheck aria-hidden className="size-5 text-brand-700" />
          <h2 className="text-base font-semibold">What our research found</h2>
          <Badge tone={tone[research.decision]}>{research.decisionLabel}</Badge>
        </div>
        <p className="text-sm text-ink-muted">{research.findings}</p>

        {research.coordinates && (
          <p className="text-sm">
            <span className="text-ink-subtle">Coordinates: </span>
            {research.coordinates.latitude}, {research.coordinates.longitude}{" "}
            <span className="text-ink-subtle">
              ({research.coordinates.source};{" "}
              {research.coordinates.precision === "operator_published" ? "published by the operator" : "premises only, not the charger — not pre-filled"})
            </span>
          </p>
        )}

        {sources.length > 0 && (
          <ul className="space-y-1.5 text-sm">
            {sources.map((e) => (
              <li key={e.url + e.note}>
                <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-brand-700 underline underline-offset-2">
                  {host(e.url)} <ExternalLink aria-hidden className="size-3" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
                <span className="text-ink-muted"> — {e.note}</span>
              </li>
            ))}
          </ul>
        )}
        {checked.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {checked.map((e) => (
              <li key={e.url + e.note}>Checked {host(e.url)}: {e.note}</li>
            ))}
          </ul>
        )}

        {research.corrections.length > 0 && (
          <ul className="space-y-1 text-sm text-amber-900">
            {research.corrections.map((c) => (
              <li key={c} className="flex gap-1.5">
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                {c}
              </li>
            ))}
          </ul>
        )}

        {research.missingBeforePublication.length > 0 && (
          <p className="text-sm">
            <span className="text-ink-subtle">Still to confirm with the operator or on site: </span>
            {research.missingBeforePublication.join(", ")}.
          </p>
        )}
        <p className="text-xs text-ink-subtle">
          Desk research dated {date}. This shows a station is listed somewhere; it is <strong>not</strong> verification.
          Only mark a station verified after confirming it yourself.
        </p>
      </CardBody>
    </Card>
  );
}
