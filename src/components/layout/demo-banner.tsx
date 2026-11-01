import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { isDemoMode } from "@/lib/config";
import { t } from "@/lib/i18n";

/** Shown on every page while running without a real database. */
export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <p className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-2 text-xs sm:items-center sm:text-sm">
        <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0 sm:mt-0" />
        <span>
          {t.demo.banner}{" "}
          <Link href="/about#demo" className="font-semibold underline underline-offset-2">
            {t.demo.learnMore}
          </Link>
        </span>
      </p>
    </div>
  );
}
