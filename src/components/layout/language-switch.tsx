"use client";

import { Languages } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/client";
import { LOCALE_COOKIE } from "@/lib/i18n";

/** Switches between English and Hindi. The URL stays the same; the choice is kept in a cookie. */
export function LanguageSwitch() {
  const locale = useLocale();
  const t = useT();
  const next = locale === "hi" ? "en" : "hi";
  return (
    <button
      type="button"
      lang={next === "hi" ? "hi" : "en"}
      aria-label={t.language.switchToLabel}
      title={t.language.switchToLabel}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink-muted hover:bg-gray-100 hover:text-ink"
    >
      <Languages aria-hidden className="size-4" />
      {t.language.switchTo}
    </button>
  );
}
