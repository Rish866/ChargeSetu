"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/lib/i18n";
import type { MapStation } from "./station-map";

// Leaflet touches `window`, so it must only load in the browser.
const StationMap = dynamic(() => import("./station-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-[28rem] w-full rounded-2xl" />,
});

/** If the map crashes (e.g. script blocked), show a notice instead of breaking the page. */
class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[map]", error);
  }
  render() {
    if (this.state.failed) return <Alert tone="warning">{t.stations.mapUnavailable}</Alert>;
    return this.props.children;
  }
}

export function StationMapLoader(props: {
  stations: MapStation[];
  userLocation?: { lat: number; lng: number };
  height?: string;
}) {
  return (
    <MapErrorBoundary>
      <StationMap {...props} />
    </MapErrorBoundary>
  );
}
