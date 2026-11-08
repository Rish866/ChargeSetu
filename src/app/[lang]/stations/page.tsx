import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { List, Map as MapIcon, SearchX, X } from "lucide-react";
import { NearMeButton } from "@/components/stations/near-me-button";
import { StationCard } from "@/components/stations/station-card";
import { StationFilters } from "@/components/stations/station-filters";
import { ExplorerMapLoader } from "@/components/stations/station-map-loader";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StationListSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { isMapEnabled } from "@/lib/config";
import { getStore } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { parseStationFilters, stationsHref, type StationFilters as Filters } from "@/lib/validation/filters";

const PAGE_SIZE = 24;

export const metadata: Metadata = {
  title: "Find charging stations",
  description: "Search EV charging stations in India by city, connector, power and network.",
};

export default async function StationsPage({ searchParams }: PageProps<"/[lang]/stations">) {
  const t = await getT();
  return (
    <>
      <PageHeader title={t.stations.title} description="Browse published stations from charge point operators across India." />
      <Suspense fallback={<StationListSkeleton count={6} />}>
        <StationResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function StationResults({ searchParams }: { searchParams: PageProps<"/[lang]/stations">["searchParams"] }) {
  const t = await getT();
  const filters = parseStationFilters(await searchParams);
  const store = getStore();
  const page = filters.page ?? 1;
  const [result, options] = await Promise.all([store.searchStations(filters, page, PAGE_SIZE), store.getFilterOptions()]);
  const stations = result.items;
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  const mapEnabled = isMapEnabled();
  const view = mapEnabled && filters.view === "map" ? "map" : "list";
  const userLocation = filters.lat !== undefined && filters.lng !== undefined ? { lat: filters.lat, lng: filters.lng } : undefined;

  return (
    <div className="space-y-5">
      <StationFilters filters={filters} networks={options.networks} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium" aria-live="polite">
            {t.stations.resultsCount(result.total)}
          </p>
          {userLocation && (
            <Link
              href={stationsHref({ ...filters, lat: undefined, lng: undefined })}
              className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 ring-1 ring-sky-200 hover:bg-sky-100"
            >
              {t.stations.sortedByDistance} <X aria-hidden className="size-3" />
              <span className="sr-only">{t.stations.clearLocation}</span>
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
            <ExplorerMapLoader query={mapQuery(filters)} userLocation={userLocation} />
          )}
          <ul className={cn("grid gap-4", view === "map" ? "md:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-3")}>
            {stations.map((s) => (
              <li key={s.id}>
                <StationCard station={s} />
              </li>
            ))}
          </ul>
          <Pagination filters={filters} page={page} totalPages={totalPages} />
        </>
      )}

      {!userLocation && (
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">{t.stations.nearestPrompt}</p>
          <NearMeButton />
        </div>
      )}
    </div>
  );
}

function mapQuery(f: Filters): string {
  const sp = new URLSearchParams();
  for (const k of ["q", "state", "vehicle", "current", "connector", "minPower", "network", "verified"] as const) {
    const v = f[k];
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  return sp.toString();
}

async function Pagination({ filters, page, totalPages }: { filters: Filters; page: number; totalPages: number }) {
  const t = await getT();
  if (totalPages <= 1) return null;
  const link = (p: number, label: string, disabled: boolean) =>
    disabled ? (
      <span className="inline-flex h-10 items-center rounded-xl px-4 text-sm text-ink-subtle">{label}</span>
    ) : (
      <Link href={stationsHref({ ...filters, page: p })} className="inline-flex h-10 items-center rounded-xl border border-line bg-white px-4 text-sm font-medium hover:bg-gray-50">
        {label}
      </Link>
    );
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
      {link(page - 1, t.stations.previous, page <= 1)}
      <p className="text-sm text-ink-muted">
        {t.stations.pageOf(page.toLocaleString("en-IN"), totalPages.toLocaleString("en-IN"))}
      </p>
      {link(page + 1, t.stations.next, page >= totalPages)}
    </nav>
  );
}

async function ViewToggle({ filters, view }: { filters: Filters; view: "list" | "map" }) {
  const t = await getT();
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
