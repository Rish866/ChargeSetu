import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { Logo } from "./logo";

const linkClass = "hover:text-ink";

export async function SiteFooter() {
  const t = await getT();
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-ink-muted">{t.brand.tagline}.</p>
          <p className="text-xs text-ink-subtle">
            We list stations run by independent charge point operators. We don&apos;t own or operate chargers, we
            don&apos;t show live availability, and we don&apos;t take bookings or payments.
          </p>
        </div>
        <nav aria-label="Drivers">
          <h2 className="mb-3 font-semibold">Drivers</h2>
          <ul className="space-y-2 text-ink-muted">
            <li><Link className={linkClass} href="/stations">{t.nav.stations}</Link></li>
            <li><Link className={linkClass} href="/about">{t.nav.about}</Link></li>
            <li><Link className={linkClass} href="/report">{t.nav.report}</Link></li>
          </ul>
        </nav>
        <nav aria-label="Operators">
          <h2 className="mb-3 font-semibold">Operators</h2>
          <ul className="space-y-2 text-ink-muted">
            <li><Link className={linkClass} href="/operator">Operator dashboard</Link></li>
            <li><Link className={linkClass} href="/operator/stations/new">Submit a station</Link></li>
            <li><Link className={linkClass} href="/login">{t.nav.signIn}</Link></li>
          </ul>
        </nav>
        <nav aria-label="Help and legal">
          <h2 className="mb-3 font-semibold">Help</h2>
          <ul className="space-y-2 text-ink-muted">
            <li><Link className={linkClass} href="/contact">Contact &amp; support</Link></li>
            <li><Link className={linkClass} href="/open-data">Open data &amp; sources</Link></li>
            <li><Link className={linkClass} href="/privacy">Privacy Policy</Link></li>
            <li><Link className={linkClass} href="/terms">Terms of Use</Link></li>
          </ul>
        </nav>
      </div>
      <p className="border-t border-line py-4 text-center text-xs text-ink-subtle">
        Map and station data ©{" "}
        <a className="underline underline-offset-2" href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>{" "}
        (ODbL). Prices in INR (₹), may exclude GST and parking fees.
      </p>
    </footer>
  );
}
