import Link from "next/link";
import { Zap } from "lucide-react";
import { t } from "@/lib/i18n";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-ink">
      <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white">
        <Zap aria-hidden className="size-5" fill="currentColor" />
      </span>
      <span className="text-lg">{t.brand.name}</span>
    </Link>
  );
}
