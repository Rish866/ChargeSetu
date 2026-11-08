import Link from "next/link";
import { BadgeCheck, Check, Search } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { FiltersDisclosure } from "./filters-disclosure";
import { CONNECTOR_TYPES, INDIAN_STATES, POWER_FILTERS } from "@/lib/constants";
import type { Messages } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { stationsHref, type StationFilters as Filters } from "@/lib/validation/filters";

const selectClass =
  "h-11 w-full rounded-xl border border-line bg-white px-3 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 sm:text-sm";

/** One-tap shortcuts for the most common searches (each toggles one filter). */
function quickFilters(filters: Filters, t: Messages) {
  return [
    { label: t.filters.quickVerified, active: filters.verified === "1", next: { verified: filters.verified ? undefined : ("1" as const) } },
    { label: "CCS2", active: filters.connector === "ccs2", next: { connector: filters.connector === "ccs2" ? undefined : ("ccs2" as const) } },
    { label: "Type 2", active: filters.connector === "type2", next: { connector: filters.connector === "type2" ? undefined : ("type2" as const) } },
    { label: t.filters.quickFast, active: filters.minPower === 50, next: { minPower: filters.minPower === 50 ? undefined : 50 } },
    { label: t.filters.quick2w, active: filters.vehicle === "two_three_wheeler", next: { vehicle: filters.vehicle === "two_three_wheeler" ? undefined : ("two_three_wheeler" as const) } },
    { label: t.filters.quickDc, active: filters.current === "DC", next: { current: filters.current === "DC" ? undefined : ("DC" as const) } },
  ];
}

/**
 * Plain GET form — works without JavaScript and keeps filters in the URL so
 * results are shareable and bookmarkable.
 */
export async function StationFilters({
  filters,
  networks,
}: {
  filters: Filters;
  networks: string[];
}) {
  const t = await getT();
  const activeCount = [filters.state, filters.vehicle, filters.current, filters.city, filters.connector, filters.minPower, filters.network, filters.verified].filter(Boolean).length;

  return (
    <div className="space-y-3">
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <div className="space-y-1">
              <label htmlFor="state" className="text-xs font-medium text-ink-muted">{t.filters.state}</label>
              <select id="state" name="state" defaultValue={filters.state ?? ""} className={selectClass}>
                <option value="">{t.filters.allIndia}</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="vehicle" className="text-xs font-medium text-ink-muted">{t.filters.vehicle}</label>
              <select id="vehicle" name="vehicle" defaultValue={filters.vehicle ?? ""} className={selectClass}>
                <option value="">{t.filters.anyVehicle}</option>
                <option value="car">{t.filters.car}</option>
                <option value="two_three_wheeler">{t.filters.twoWheeler}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="current" className="text-xs font-medium text-ink-muted">{t.filters.current}</label>
              <select id="current" name="current" defaultValue={filters.current ?? ""} className={selectClass}>
                <option value="">{t.filters.anyCurrent}</option>
                <option value="AC">{t.filters.ac}</option>
                <option value="DC">{t.filters.dc}</option>
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
              <select id="minPower" name="minPower" defaultValue={filters.minPower ? String(filters.minPower) : ""} className={selectClass}>
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
          <label className="mt-3 flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" name="verified" value="1" defaultChecked={filters.verified === "1"} className="size-4 accent-brand-600" />
            <BadgeCheck aria-hidden className="size-4 text-brand-700" />
            {t.filters.verifiedOnly}
          </label>
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

      <nav aria-label="Quick filters" className="-mx-4 overflow-x-auto px-4 pb-1">
        <ul className="flex w-max gap-2">
          {quickFilters(filters, t).map((qf) => (
            <li key={qf.label}>
              <Link
                href={stationsHref({ ...filters, ...qf.next, page: undefined })}
                className={cn(
                  "inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset",
                  qf.active ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-ink ring-line hover:bg-gray-50",
                )}
              >
                {qf.active && <Check aria-hidden className="size-3.5" />}
                {qf.label}
                <span className="sr-only">{qf.active ? " (filter on, tap to remove)" : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
