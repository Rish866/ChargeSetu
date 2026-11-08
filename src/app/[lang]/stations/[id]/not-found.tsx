import { MapPinOff } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function StationNotFound() {
  return (
    <EmptyState
      icon={MapPinOff}
      title="Station not found"
      body="This station doesn't exist, is no longer listed, or is still being reviewed."
      action={<ButtonLink href="/stations">Browse all stations</ButtonLink>}
    />
  );
}
