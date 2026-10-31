import type { Station } from "@/lib/types";
import type { MapStation } from "./station-map";

/** Only send the fields the map needs to the browser. */
export function toMapStation(s: Station): MapStation {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    network: s.network,
    latitude: s.latitude,
    longitude: s.longitude,
    powerKw: s.powerKw,
    verified: s.verificationStatus === "verified",
  };
}
