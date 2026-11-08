"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { mapConfig } from "@/lib/config";
import { directionsUrl, formatKw } from "@/lib/format";
import type { MapPoint } from "@/lib/types";

function clusterIcon(count: number) {
  const size = count >= 10000 ? 56 : count >= 1000 ? 48 : count >= 100 ? 40 : 32;
  const label = count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k` : String(count);
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;line-height:${size}px" class="rounded-full bg-brand-700/90 text-center text-xs font-bold text-white ring-4 ring-brand-600/30">${label}</div>`,
    className: "",
    iconSize: [size, size],
  });
}

function Loader({ query, onState }: { query: string; onState: (s: { loading: boolean; error: boolean; count: number }) => void; }) {
  const map = useMap();
  const [points, setPoints] = useState<MapPoint[]>([]);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      const b = map.getBounds();
      const sp = new URLSearchParams(query);
      sp.set("minLat", b.getSouth().toFixed(4));
      sp.set("maxLat", b.getNorth().toFixed(4));
      sp.set("minLng", b.getWest().toFixed(4));
      sp.set("maxLng", b.getEast().toFixed(4));
      sp.set("zoom", String(map.getZoom()));
      sp.delete("lat");
      sp.delete("lng");
      onState({ loading: true, error: false, count: 0 });
      try {
        const res = await fetch(`/api/map?${sp.toString()}`, { signal: ac.signal });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { points: MapPoint[] };
        setPoints(json.points);
        onState({ loading: false, error: false, count: json.points.length });
      } catch (e) {
        if ((e as Error).name !== "AbortError") onState({ loading: false, error: true, count: 0 });
      }
    }, 250);
  }, [map, query, onState]);

  useEffect(() => {
    load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
    };
  }, [load]);
  useMapEvents({ moveend: load });

  return (
    <>
      {points.map((p, i) =>
        p.kind === "cluster" ? (
          <Marker
            key={`c${i}-${p.lat}-${p.lng}`}
            position={[p.lat, p.lng]}
            icon={clusterIcon(p.count)}
            eventHandlers={{ click: () => map.setView([p.lat, p.lng], Math.min(map.getZoom() + 2, 17)) }}
            keyboard={false}
          />
        ) : (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={9}
            pathOptions={{ color: "#fff", weight: 2, fillColor: p.verified ? "#039855" : "#d97706", fillOpacity: 0.95 }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{p.name}</p>
                <p>{formatKw(p.powerKw ?? null)} · {p.verified ? "Verified" : "Status unconfirmed"}</p>
                <p className="flex gap-3 pt-1">
                  <Link href={`/stations/${p.slug}`}>Details</Link>
                  <a href={directionsUrl(p.lat, p.lng)} target="_blank" rel="noopener noreferrer">Directions</a>
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ),
      )}
    </>
  );
}

/** Nationwide map: asks the server for clustered markers inside the visible area. */
export default function ExplorerMap({ query, userLocation, height = "32rem" }: { query: string; userLocation?: { lat: number; lng: number }; height?: string }) {
  const [state, setState] = useState({ loading: true, error: false, count: 0 });
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line" style={{ height }}>
      <MapContainer
        center={userLocation ? [userLocation.lat, userLocation.lng] : mapConfig.defaultCenter}
        zoom={userLocation ? 11 : mapConfig.defaultZoom}
        scrollWheelZoom={false}
        className="h-full w-full"
        aria-label="Map of charging stations across India"
      >
        <TileLayer url={mapConfig.tileUrl} attribution={mapConfig.attribution} />
        {userLocation && (
          <CircleMarker center={[userLocation.lat, userLocation.lng]} radius={8} pathOptions={{ color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 0.9, weight: 3 }}>
            <Popup>You are here</Popup>
          </CircleMarker>
        )}
        <Loader query={query} onState={setState} />
      </MapContainer>
      <p className="absolute left-2 top-2 z-[1000] rounded-lg bg-white/95 px-2 py-1 text-xs shadow" role="status">
        {state.error ? "Couldn't load stations for this area." : state.loading ? "Loading stations…" : state.count === 0 ? "No stations in this view — zoom out or move the map." : "Tap a number to zoom in."}
      </p>
    </div>
  );
}
