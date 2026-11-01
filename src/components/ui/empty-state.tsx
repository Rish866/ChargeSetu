import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <span className="mb-3 grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700">
        <Icon aria-hidden className="size-6" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
