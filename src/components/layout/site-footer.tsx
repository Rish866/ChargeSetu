import Link from "next/link";
import { t } from "@/lib/i18n";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
        <div className="space-y-3">
          <Logo />
          <p className="text-ink-muted">{t.brand.tagline}.</p>
          <p className="text-xs text-ink-subtle">
            We list stations run by independent charge point operators. We don&apos;t own or operate
            chargers, and we don&apos;t take bookings or payments.
          </p>
        </div>
        <div>
          <h2 className="mb-3 font-semibold">Drivers</h2>
          <ul className="space-y-2 text-ink-muted">
            <li><Link className="hover:text-ink" href="/stations">{t.nav.stations}</Link></li>
            <li><Link className="hover:text-ink" href="/about">{t.nav.about}</Link></li>
            <li><Link className="hover:text-ink" href="/report">{t.nav.report}</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 font-semibold">Operators</h2>
          <ul className="space-y-2 text-ink-muted">
            <li><Link className="hover:text-ink" href="/operator">Operator dashboard</Link></li>
            <li><Link className="hover:text-ink" href="/operator/stations/new">Submit a station</Link></li>
            <li><Link className="hover:text-ink" href="/login">{t.nav.signIn}</Link></li>
          </ul>
        </div>
      </div>
      <p className="border-t border-line py-4 text-center text-xs text-ink-subtle">
        Map data © OpenStreetMap contributors. Prices in INR (₹).
      </p>
    </footer>
  );
}
