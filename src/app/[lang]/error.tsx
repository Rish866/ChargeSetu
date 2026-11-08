"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const notAuthorized = error.message?.startsWith("Not authorized");

  return (
    <div className="py-10">
      <EmptyState
        icon={AlertTriangle}
        title={notAuthorized ? "You don't have access to do that" : "Something went wrong"}
        body={
          notAuthorized
            ? "Your session may have expired, or your account doesn't have the required role."
            : "We couldn't load this page. Please try again — if it keeps happening, come back a little later."
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {notAuthorized ? (
              <ButtonLink href="/login">Sign in</ButtonLink>
            ) : (
              <Button onClick={reset}>Try again</Button>
            )}
            <ButtonLink href="/" variant="secondary">
              Go home
            </ButtonLink>
          </div>
        }
      />
      {error.digest && (
        <p className="mt-4 text-center text-xs text-ink-subtle">Error reference: {error.digest}</p>
      )}
    </div>
  );
}
