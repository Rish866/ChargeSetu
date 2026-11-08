import { Suspense } from "react";
import { Logo } from "./logo";
import { DesktopNav } from "./nav-links";
import { LanguageSwitch } from "./language-switch";
import { UserMenu, UserMenuFallback } from "./user-menu";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Logo />
          <DesktopNav />
        </div>
        <div className="flex items-center gap-1">
          <LanguageSwitch />
          <Suspense fallback={<UserMenuFallback />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
