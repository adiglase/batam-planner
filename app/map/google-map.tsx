import { useEffect, useRef, useState } from "react";

import type { MapPresentation } from "./map-provider";

type GoogleMapInstance = object;
type GoogleMarkerInstance = {
  addListener(event: "click", listener: () => void): { remove(): void };
  setMap(map: null): void;
};
type GoogleMapsApi = {
  Map: new (
    element: HTMLElement,
    options: {
      center: { lat: number; lng: number };
      mapTypeControl: boolean;
      streetViewControl: boolean;
      zoom: number;
    },
  ) => GoogleMapInstance;
  Marker: new (options: {
    map: GoogleMapInstance;
    position: { lat: number; lng: number };
    title: string;
  }) => GoogleMarkerInstance;
};

declare global {
  interface Window {
    google?: { maps: GoogleMapsApi };
  }
}

let googleMapsPromise: Promise<GoogleMapsApi> | undefined;

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const source = new URL("https://maps.googleapis.com/maps/api/js");
    source.searchParams.set("key", apiKey);
    source.searchParams.set("v", "weekly");
    script.src = source.toString();
    script.async = true;
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    script.onload = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error("Google Maps loaded without its browser API"));
    };
    document.head.append(script);
  });

  return googleMapsPromise;
}

export function GoogleMap({
  apiKey,
  markers,
  focusedDestinationId,
  onFocus,
}: MapPresentation & { apiKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    const markerInstances: GoogleMarkerInstance[] = [];
    const listeners: Array<{ remove(): void }> = [];

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (!active || !containerRef.current) return;

        const focusedMarker =
          markers.find(({ id }) => id === focusedDestinationId) ?? markers[0];
        const center = focusedMarker
          ? {
              lat: focusedMarker.coordinates.latitude,
              lng: focusedMarker.coordinates.longitude,
            }
          : { lat: 1.0456, lng: 104.0305 };
        const map = new maps.Map(containerRef.current, {
          center,
          zoom: focusedMarker ? 12 : 10,
          mapTypeControl: false,
          streetViewControl: false,
        });

        markers.forEach((marker) => {
          const instance = new maps.Marker({
            map,
            position: {
              lat: marker.coordinates.latitude,
              lng: marker.coordinates.longitude,
            },
            title: marker.label,
          });
          markerInstances.push(instance);
          listeners.push(instance.addListener("click", () => onFocus(marker.id)));
        });
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });

    return () => {
      active = false;
      listeners.forEach((listener) => listener.remove());
      markerInstances.forEach((marker) => marker.setMap(null));
    };
  }, [apiKey, focusedDestinationId, markers, onFocus]);

  if (unavailable) {
    return (
      <div className="map-unavailable" role="status">
        <div>
          <strong>Map unavailable</strong>
          <span>The Destination remains available in Discover.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="google-map-shell">
      <div ref={containerRef} className="google-map" aria-label="Google map of Batam" />
      <div className="map-caption" aria-live="polite">
        <strong>
          {markers.find(({ id }) => id === focusedDestinationId)?.label ??
            "Explore Batam"}
        </strong>
        <span>Traffic-unaware map context</span>
      </div>
    </div>
  );
}
