import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "error";

const styles: Record<Tone, { box: string; Icon: typeof Info }> = {
  info: { box: "bg-sky-50 border-sky-200 text-sky-900", Icon: Info },
  success: { box: "bg-brand-50 border-brand-200 text-brand-900", Icon: CheckCircle2 },
  warning: { box: "bg-amber-50 border-amber-200 text-amber-900", Icon: AlertTriangle },
  error: { box: "bg-red-50 border-red-200 text-red-900", Icon: XCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = styles[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border p-3.5 text-sm", box, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}
