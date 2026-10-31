import { Lock } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Role, SessionUser } from "@/lib/types";

const roleLabel: Record<Role, string> = { customer: "driver", operator: "operator", admin: "admin" };

/** Shown when a page requires a role the visitor doesn't have. */
export function AccessDenied({ user, required, next }: { user: SessionUser | null; required: Role; next: string }) {
  if (!user) {
    return (
      <EmptyState
        icon={Lock}
        title={`Sign in as an ${roleLabel[required]} to continue`}
        body={
          required === "operator"
            ? "Charge point operators can list stations for free. Every listing is reviewed before it is published."
            : "This area is for the review team."
        }
        action={<ButtonLink href={`/login?next=${encodeURIComponent(next)}`}>Sign in</ButtonLink>}
      />
    );
  }
  return (
    <EmptyState
      icon={Lock}
      title="You don't have access to this page"
      body={`You're signed in as ${user.name} (${roleLabel[user.role]}). This page needs an ${roleLabel[required]} account.`}
      action={
        <ButtonLink href="/" variant="secondary">
          Go home
        </ButtonLink>
      }
    />
  );
}
