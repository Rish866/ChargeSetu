import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { List, Map as MapIcon, SearchX, X } from "lucide-react";
import { NearMeButton } from "@/components/stations/near-me-button";
import { StationCard } from "@/components/stations/station-card";
import { StationFilters } from "@/components/stations/station-filters";
import { StationMapLoader } from "@/components/stations/station-map-loader";
import { toMapStation } from "@/components/stations/to-map-station";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StationListSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { isMapEnabled } from "@/lib/config";
import { getStore } from "@/lib/data";
import { t } from "@/lib/i18n";
import { parseStationFilters, stationsHref, type StationFilters as Filters } from "@/lib/validation/filters";

export const metadata: Metadata = {
  title: "Find charging stations",
  description: "Search EV charging stations in India by city, connector, power and network.",
};

export default function StationsPage({ searchParams }: PageProps<"/stations">) {
  return (
    <>
      <PageHeader title={t.stations.title} description="Browse published stations from charge point operators across India." />
      <Suspense fallback={<StationListSkeleton count={6} />}>
        <StationResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function StationResults({ searchParams }: { searchParams: PageProps<"/stations">["searchParams"] }) {
  const filters = parseStationFilters(await searchParams);
  const store = getStore();
  const [stations, options] = await Promise.all([store.listPublishedStations(filters), store.getFilterOptions()]);

  const mapEnabled = isMapEnabled();
  const view = mapEnabled && filters.view === "map" ? "map" : "list";
  const userLocation = filters.lat !== undefined && filters.lng !== undefined ? { lat: filters.lat, lng: filters.lng } : undefined;

  return (
    <div className="space-y-5">
      <StationFilters filters={filters} cities={options.cities} networks={options.networks} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium" aria-live="polite">
            {t.stations.resultsCount(stations.length)}
          </p>
          {userLocation && (
            <Link
              href={stationsHref({ ...filters, lat: undefined, lng: undefined })}
              className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 ring-1 ring-sky-200 hover:bg-sky-100"
            >
              Sorted by distance from you <X aria-hidden className="size-3" />
              <span className="sr-only">Clear location</span>
            </Link>
          )}
        </div>
        {mapEnabled && <ViewToggle filters={filters} view={view} />}
      </div>

      {!mapEnabled && filters.view === "map" && <Alert tone="info">{t.stations.mapDisabled}</Alert>}

      {stations.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={t.stations.noResultsTitle}
          body={t.stations.noResultsBody}
          action={
            <ButtonLink href="/stations" variant="secondary">
              {t.stations.clearFilters}
            </ButtonLink>
          }
        />
      ) : (
        <>
          {view === "map" && (
            <StationMapLoader stations={stations.map(toMapStation)} userLocation={userLocation} />
          )}
          <ul className={cn("grid gap-4", view === "map" ? "md:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-3")}>
            {stations.map((s) => (
              <li key={s.id}>
                <StationCard station={s} />
              </li>
            ))}
          </ul>
        </>
      )}

      {!userLocation && (
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">Want the closest stations first?</p>
          <NearMeButton />
        </div>
      )}
    </div>
  );
}

function ViewToggle({ filters, view }: { filters: Filters; view: "list" | "map" }) {
  const item = (v: "list" | "map", label: string, Icon: typeof List) => (
    <Link
      href={stationsHref({ ...filters, view: v === "list" ? undefined : v })}
      aria-current={view === v ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium",
        view === v ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink",
      )}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </Link>
  );
  return (
    <nav aria-label="Results view" className="inline-flex rounded-xl bg-gray-100 p-1">
      {item("list", t.stations.listView, List)}
      {item("map", t.stations.mapView, MapIcon)}
    </nav>
  );
}
