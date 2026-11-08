"use client";

import { Loader2, LocateFixed } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { INDIA_BOUNDS } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";

/** Asks for the browser location and opens the directory sorted by distance. */
export function NearMeButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const t = useT();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "locating" | "error" | "outside">("idle");

  function locate() {
    if (!("geolocation" in navigator)) {
      setState("error");
      return;
    }
    setState("locating");
    const onPosition = ({ coords }: GeolocationPosition) => {
        const lat = Number(coords.latitude.toFixed(4));
        const lng = Number(coords.longitude.toFixed(4));
        const inIndia =
          lat >= INDIA_BOUNDS.minLat && lat <= INDIA_BOUNDS.maxLat && lng >= INDIA_BOUNDS.minLng && lng <= INDIA_BOUNDS.maxLng;
        if (!inIndia) {
          setState("outside");
          return;
        }
        setState("idle");
        router.push(`/stations?lat=${lat}&lng=${lng}`);
    };
    // Fast, battery-friendly network location first; if the device has none (or it times out),
    // try once more with GPS. A refused permission is not retried.
    navigator.geolocation.getCurrentPosition(
      onPosition,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) return setState("error");
        navigator.geolocation.getCurrentPosition(onPosition, () => setState("error"), {
          enableHighAccuracy: true,
          timeout: 20_000,
          maximumAge: 300_000,
        });
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 },
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={locate}
        disabled={state === "locating"}
        className={buttonClasses(variant, "lg", "w-full sm:w-auto")}
      >
        {state === "locating" ? (
          <Loader2 aria-hidden className="size-5 animate-spin" />
        ) : (
          <LocateFixed aria-hidden className="size-5" />
        )}
        {state === "locating" ? t.home.locating : t.home.nearMe}
      </button>
      <p aria-live="polite" className="text-sm text-amber-800">
        {state === "error" && t.home.locationDenied}
        {state === "outside" && t.home.locationOutside}
      </p>
    </div>
  );
}
