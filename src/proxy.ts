import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * 1. Language: pages live under `app/[lang]`. Plain URLs (`/stations`) are rewritten
 *    internally to `/en/stations` or `/hi/stations` using the `lang` cookie, so links
 *    never change. Visiting `/hi/...` or `/en/...` directly also sets the cookie.
 * 2. Refreshes the Supabase session cookie (not authorization — pages check roles).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];
  if (isLocale(first)) {
    const res = await updateSupabaseSession(request);
    if (request.cookies.get(LOCALE_COOKIE)?.value !== first) setLocaleCookie(res, first);
    return res;
  }
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(cookie) ? cookie : defaultLocale;
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return updateSupabaseSession(request, url);
}

function setLocaleCookie(res: NextResponse, locale: Locale) {
  res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
}

export const config = {
  // Skip API routes, Next internals and static / metadata files.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
