"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";

/** Filters are always visible on desktop and collapsible on mobile. */
export function FiltersDisclosure({
  activeCount,
  children,
}: {
  activeCount: number;
  children: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(activeCount > 0);
  const panelId = useId();

  return (
    <div className="rounded-2xl border border-line bg-white p-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-sm font-medium md:pointer-events-none md:cursor-default"
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        {t.filters.title}
        {activeCount > 0 && (
          <span className="rounded-full bg-brand-700 px-2 py-0.5 text-xs text-white">{activeCount}</span>
        )}
        <ChevronDown aria-hidden className={cn("ml-auto size-4 transition-transform md:hidden", open && "rotate-180")} />
      </button>
      <div id={panelId} className={cn("mt-3", open ? "block" : "hidden", "md:block")}>
        {children}
      </div>
    </div>
  );
}
