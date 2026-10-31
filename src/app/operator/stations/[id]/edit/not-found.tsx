import { MapPinOff } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function OperatorStationNotFound() {
  return (
    <EmptyState
      icon={MapPinOff}
      title="Station not found"
      body="This station doesn't exist, or it isn't one of your stations."
      action={<ButtonLink href="/operator">Back to your dashboard</ButtonLink>}
    />
  );
}
