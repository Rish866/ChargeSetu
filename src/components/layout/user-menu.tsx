import Link from "next/link";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { buttonClasses } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

/** Reads the session, so it must render inside <Suspense>. */
export async function UserMenu() {
  const t = await getT();
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/operator" className={buttonClasses("ghost", "sm", "hidden sm:inline-flex")}>
          {t.nav.operator}
        </Link>
        <Link href="/login" className={buttonClasses("secondary", "sm")}>
          {t.nav.signIn}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {user.role === "admin" && (
        <Link href="/admin" className={buttonClasses("ghost", "sm")}>
          <ShieldCheck aria-hidden className="size-4" />
          <span className="hidden sm:inline">{t.nav.admin}</span>
        </Link>
      )}
      {user.role === "operator" && (
        <Link href="/operator" className={buttonClasses("ghost", "sm", "hidden sm:inline-flex")}>
          Dashboard
        </Link>
      )}
      <span className="hidden items-center gap-1.5 text-sm text-ink-muted lg:flex">
        <UserRound aria-hidden className="size-4" />
        {user.name}
        {user.isDemo && <span className="text-xs text-amber-700">(demo)</span>}
      </span>
      <form action={signOut}>
        <button type="submit" className={buttonClasses("secondary", "sm")} aria-label={t.nav.signOut}>
          <LogOut aria-hidden className="size-4" />
          <span className="hidden sm:inline">{t.nav.signOut}</span>
        </button>
      </form>
    </div>
  );
}

export function UserMenuFallback() {
  return <div className="h-9 w-24 animate-pulse rounded-xl bg-gray-100" aria-hidden />;
}
