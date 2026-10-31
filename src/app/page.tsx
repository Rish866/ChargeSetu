import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BadgeCheck, Building2, Flag, MapPin, Search, ShieldCheck, Zap } from "lucide-react";
import { NearMeButton } from "@/components/stations/near-me-button";
import { StationCard } from "@/components/stations/station-card";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { StationListSkeleton } from "@/components/ui/skeleton";
import { POPULAR_AREAS } from "@/lib/constants";
import { getStore } from "@/lib/data";
import { t } from "@/lib/i18n";
import { stationsHref } from "@/lib/validation/filters";

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-50 via-white to-white px-5 py-10 ring-1 ring-brand-100 sm:px-10 sm:py-14">
        <div className="max-w-2xl space-y-5">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-200">
            <Zap aria-hidden className="size-3.5" /> Built for Indian EV drivers
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-5xl">{t.home.heroTitle}</h1>
          <p className="text-base text-ink-muted sm:text-lg">{t.home.heroSubtitle}</p>

          <form action="/stations" method="get" role="search" className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="home-q" className="sr-only">
              {t.filters.search}
            </label>
            <div className="relative flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-subtle" />
              <input
                id="home-q"
                name="q"
                type="search"
                placeholder={t.home.searchPlaceholder}
                className="h-12 w-full rounded-xl border border-line bg-white pl-11 pr-3 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <button type="submit" className={buttonClasses("primary", "lg")}>
              {t.home.searchButton}
            </button>
          </form>
          <NearMeButton />
        </div>
      </section>

      <section aria-labelledby="popular-heading">
        <h2 id="popular-heading" className="mb-4 text-xl font-semibold">
          {t.home.popularAreas}
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {POPULAR_AREAS.map((a) => (
            <li key={`${a.city}-${a.area}`}>
              <Link
                href={stationsHref({ city: a.city })}
                className="flex h-full flex-col gap-0.5 rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)] hover:border-brand-300 hover:bg-brand-50"
              >
                <MapPin aria-hidden className="mb-1 size-5 text-brand-600" />
                <span className="font-semibold">{a.city}</span>
                <span className="text-xs text-ink-subtle">{a.area} & more</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="featured-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 id="featured-heading" className="text-xl font-semibold">
            {t.home.featured}
          </h2>
          <Link href="/stations" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
            See all <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <Suspense fallback={<StationListSkeleton count={3} />}>
          <RecentlyVerified />
        </Suspense>
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="How it works">
        {[
          { Icon: Building2, title: "Operator-submitted", body: "Charge point operators submit and maintain their own station details." },
          { Icon: ShieldCheck, title: "Reviewed before publishing", body: "Our team checks every submission before it appears in search." },
          { Icon: BadgeCheck, title: "Clearly labelled", body: "You always see whether details are verified and when they were last checked." },
        ].map(({ Icon, title, body }) => (
          <Card key={title}>
            <CardBody>
              <Icon aria-hidden className="mb-3 size-6 text-brand-600" />
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-ink-muted">{body}</p>
            </CardBody>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--radius-card)] bg-ink text-white shadow-[var(--shadow-card)]">
          <CardBody className="space-y-3">
            <Building2 aria-hidden className="size-6 text-brand-300" />
            <h2 className="text-lg font-semibold">{t.home.operatorCtaTitle}</h2>
            <p className="text-sm text-gray-300">{t.home.operatorCtaBody}</p>
            <ButtonLink href="/operator">{t.home.operatorCtaButton}</ButtonLink>
          </CardBody>
        </div>
        <Card>
          <CardBody className="space-y-3">
            <Flag aria-hidden className="size-6 text-amber-600" />
            <h2 className="text-lg font-semibold">{t.home.reportCtaTitle}</h2>
            <p className="text-sm text-ink-muted">{t.home.reportCtaBody}</p>
            <ButtonLink href="/report" variant="secondary">
              {t.home.reportCtaButton}
            </ButtonLink>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

async function RecentlyVerified() {
  const stations = await getStore().listRecentlyVerified(3);
  if (stations.length === 0) {
    return <p className="text-sm text-ink-muted">No verified stations yet. Check back soon.</p>;
  }
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {stations.map((s) => (
        <li key={s.id}>
          <StationCard station={s} />
        </li>
      ))}
    </ul>
  );
}
