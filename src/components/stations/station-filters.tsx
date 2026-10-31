import Link from "next/link";
import { Search } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { FiltersDisclosure } from "./filters-disclosure";
import { CONNECTOR_TYPES, POWER_FILTERS } from "@/lib/constants";
import { t } from "@/lib/i18n";
import type { StationFilters as Filters } from "@/lib/validation/filters";

const selectClass =
  "h-11 w-full rounded-xl border border-line bg-white px-3 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 sm:text-sm";

/**
 * Plain GET form — works without JavaScript and keeps filters in the URL so
 * results are shareable and bookmarkable.
 */
export function StationFilters({
  filters,
  cities,
  networks,
}: {
  filters: Filters;
  cities: string[];
  networks: string[];
}) {
  const activeCount = [filters.city, filters.connector, filters.minPower, filters.network].filter(Boolean).length;

  return (
    <form action="/stations" method="get" role="search" className="space-y-3">
      {filters.view && <input type="hidden" name="view" value={filters.view} />}
      {filters.lat !== undefined && <input type="hidden" name="lat" value={filters.lat} />}
      {filters.lng !== undefined && <input type="hidden" name="lng" value={filters.lng} />}

      <div className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          {t.filters.search}
        </label>
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q ?? ""}
            placeholder={t.home.searchPlaceholder}
            className={`${selectClass} pl-9`}
          />
        </div>
        <button type="submit" className={buttonClasses("primary", "md")}>
          {t.home.searchButton}
        </button>
      </div>

      <FiltersDisclosure activeCount={activeCount}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label htmlFor="city" className="text-xs font-medium text-ink-muted">
              {t.filters.city}
            </label>
            <select id="city" name="city" defaultValue={filters.city ?? ""} className={selectClass}>
              <option value="">{t.filters.anyCity}</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="connector" className="text-xs font-medium text-ink-muted">
              {t.filters.connector}
            </label>
            <select id="connector" name="connector" defaultValue={filters.connector ?? ""} className={selectClass}>
              <option value="">{t.filters.anyConnector}</option>
              {CONNECTOR_TYPES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.current})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="minPower" className="text-xs font-medium text-ink-muted">
              {t.filters.power}
            </label>
            <select id="minPower" name="minPower" defaultValue={String(filters.minPower ?? 0)} className={selectClass}>
              {POWER_FILTERS.map((p) => (
                <option key={p.value} value={p.value === 0 ? "" : p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="network" className="text-xs font-medium text-ink-muted">
              {t.filters.network}
            </label>
            <select id="network" name="network" defaultValue={filters.network ?? ""} className={selectClass}>
              <option value="">{t.filters.anyNetwork}</option>
              {networks.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="submit" className={buttonClasses("primary", "sm")}>
            {t.filters.apply}
          </button>
          <Link href={filters.view ? `/stations?view=${filters.view}` : "/stations"} className={buttonClasses("ghost", "sm")}>
            {t.filters.reset}
          </Link>
        </div>
      </FiltersDisclosure>
    </form>
  );
}
