"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Building2, Flag, Home, Info, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";

type Messages = ReturnType<typeof useT>;
const desktopLinks = (t: Messages) => [
  { href: "/stations", label: t.nav.stations },
  { href: "/about", label: t.nav.about },
  { href: "/report", label: t.nav.report },
];

const mobileLinks = (t: Messages) => [
  { href: "/", label: t.nav.home, Icon: Home },
  { href: "/stations", label: t.nav.stations, Icon: MapPin },
  { href: "/report", label: t.nav.report, Icon: Flag },
  { href: "/about", label: t.nav.about, Icon: Info },
  { href: "/operator", label: t.nav.operator, Icon: Building2 },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function DesktopNavView({ pathname }: { pathname: string | null }) {
  const t = useT();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {desktopLinks(t).map((l) => (
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
  const t = useT();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {mobileLinks(t).map(({ href, label, Icon }) => {
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
