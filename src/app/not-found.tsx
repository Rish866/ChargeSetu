import { MapPinOff } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="py-10">
      <EmptyState
        icon={MapPinOff}
        title="Page not found"
        body="The page you're looking for doesn't exist or has moved."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink href="/stations">Find stations</ButtonLink>
            <ButtonLink href="/" variant="secondary">
              Go home
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
