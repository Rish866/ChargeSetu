"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { mapConfig } from "@/lib/config";
import { directionsUrl, formatKw } from "@/lib/format";

export interface MapStation {
  id: string;
  slug: string;
  name: string;
  network: string;
  latitude: number;
  longitude: number;
  powerKw: number;
  verified: boolean;
}

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
  }, [map, bounds]);
  return null;
}

/**
 * Leaflet + OpenStreetMap map. Uses circle markers (no image assets) so it
 * works without any bundler configuration or API key.
 */
export default function StationMap({
  stations,
  userLocation,
  height = "28rem",
}: {
  stations: MapStation[];
  userLocation?: { lat: number; lng: number };
  height?: string;
}) {
  const [tileErrors, setTileErrors] = useState(0);

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const pts: [number, number][] = stations.map((s) => [s.latitude, s.longitude]);
    if (userLocation) pts.push([userLocation.lat, userLocation.lng]);
    return pts.length ? pts : null;
  }, [stations, userLocation]);

  const single = stations.length === 1 && !userLocation;
  const center: [number, number] = single
    ? [stations[0].latitude, stations[0].longitude]
    : mapConfig.defaultCenter;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line" style={{ height }}>
      <MapContainer
        center={center}
        zoom={single ? 15 : mapConfig.defaultZoom}
        scrollWheelZoom={false}
        className="h-full w-full"
        aria-label="Map of charging stations"
      >
        <TileLayer
          url={mapConfig.tileUrl}
          attribution={mapConfig.attribution}
          eventHandlers={{ tileerror: () => setTileErrors((n) => n + 1) }}
        />
        {!single && <FitBounds bounds={bounds} />}
        {userLocation && (
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={8}
            pathOptions={{ color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 0.9, weight: 3 }}
          >
            <Popup>You are here</Popup>
          </CircleMarker>
        )}
        {stations.map((s) => (
          <CircleMarker
            key={s.id}
            center={[s.latitude, s.longitude]}
            radius={single ? 12 : 9}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: s.verified ? "#039855" : "#d97706",
              fillOpacity: 0.95,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <p className="text-xs font-semibold uppercase text-emerald-700">{s.network}</p>
                <p className="font-semibold">{s.name}</p>
                <p>
                  {formatKw(s.powerKw)} · {s.verified ? "Verified" : "Not yet verified"}
                </p>
                <p className="flex gap-3 pt-1">
                  {!single && <Link href={`/stations/${s.slug}`}>Details</Link>}
                  <a href={directionsUrl(s.latitude, s.longitude)} target="_blank" rel="noopener noreferrer">
                    Directions
                  </a>
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {tileErrors > 5 && (
        <p className="absolute inset-x-2 bottom-2 z-[1000] rounded-lg bg-white/95 p-2 text-xs text-amber-800 shadow">
          Map tiles are having trouble loading. Station list is still available.
        </p>
      )}
    </div>
  );
}
