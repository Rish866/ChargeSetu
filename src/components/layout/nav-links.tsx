"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Building2, Flag, Home, Info, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

const desktopLinks = [
  { href: "/stations", label: t.nav.stations },
  { href: "/about", label: t.nav.about },
  { href: "/report", label: t.nav.report },
];

const mobileLinks = [
  { href: "/", label: t.nav.home, Icon: Home },
  { href: "/stations", label: "Stations", Icon: MapPin },
  { href: "/report", label: "Report", Icon: Flag },
  { href: "/about", label: "About", Icon: Info },
  { href: "/operator", label: "Operators", Icon: Building2 },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function DesktopNavView({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {desktopLinks.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={isActive(pathname, l.href) ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:bg-gray-100 hover:text-ink",
            isActive(pathname, l.href) && "bg-brand-50 text-brand-800",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

function MobileNavView({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {mobileLinks.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-brand-700" : "text-ink-subtle",
                )}
              >
                <Icon aria-hidden className="size-5" strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ActiveDesktopNav() {
  return <DesktopNavView pathname={usePathname()} />;
}

function ActiveMobileNav() {
  return <MobileNavView pathname={usePathname()} />;
}

/*
 * The pathname is request data, so the active-link highlight streams in.
 * The fallback renders the same links without highlighting, so navigation
 * is usable immediately.
 */
export function DesktopNav() {
  return (
    <Suspense fallback={<DesktopNavView pathname={null} />}>
      <ActiveDesktopNav />
    </Suspense>
  );
}

/** Bottom tab bar on small screens. */
export function MobileNav() {
  return (
    <Suspense fallback={<MobileNavView pathname={null} />}>
      <ActiveMobileNav />
    </Suspense>
  );
}
