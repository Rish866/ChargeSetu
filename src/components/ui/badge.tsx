import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "green" | "gray" | "amber" | "red" | "blue" | "violet";

const tones: Record<BadgeTone, string> = {
  green: "bg-brand-50 text-brand-800 ring-brand-200",
  gray: "bg-gray-100 text-gray-700 ring-gray-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
};

export function Badge({
  tone = "gray",
  children,
  className,
  icon,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
