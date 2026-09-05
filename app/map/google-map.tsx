import { useEffect, useRef, useState } from "react";

import type { MapPresentation } from "./map-provider";

type GoogleMapInstance = {
  addListener(event: "idle", listener: () => void): { remove(): void };
  getCenter(): { lat(): number; lng(): number } | undefined;
  getZoom(): number | undefined;
  setCenter(position: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
};
type GoogleMarkerInstance = {
  addListener(
    event: "click",
    listener: () => void,
  ): { remove?(): void } | undefined;
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

export function googleMapsScriptUrl(apiKey: string) {
  const source = new URL("https://maps.googleapis.com/maps/api/js");
  source.searchParams.set("key", apiKey);
  source.searchParams.set("loading", "async");
  source.searchParams.set("v", "weekly");
  return source;
}

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = (message: string) => {
      script.remove();
      googleMapsPromise = undefined;
      reject(new Error(message));
    };
    const source = googleMapsScriptUrl(apiKey);
    script.src = source.toString();
    script.async = true;
    script.onerror = () => fail("Google Maps failed to load");
    script.onload = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else fail("Google Maps loaded without its browser API");
    };
    document.head.append(script);
  });

  return googleMapsPromise;
}

export function GoogleMap({
  apiKey,
  markers,
  focusedDestinationId,
  viewport,
  onViewportChange,
  onOpenDestination,
}: MapPresentation & { apiKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [mapState, setMapState] = useState<{
    maps: GoogleMapsApi;
    map: GoogleMapInstance;
  } | null>(null);
  const focusedMarker = markers.find(({ id }) => id === focusedDestinationId);

  useEffect(() => {
    let active = true;
    let idleListener: { remove(): void } | undefined;

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (!active || !containerRef.current) return;

        const map = new maps.Map(containerRef.current, {
          center: {
            lat: viewport.center.latitude,
            lng: viewport.center.longitude,
          },
          zoom: viewport.zoom,
          mapTypeControl: false,
          streetViewControl: false,
        });
        idleListener = map.addListener("idle", () => {
          const center = map.getCenter();
          const zoom = map.getZoom();
          if (!center || zoom === undefined) return;
          onViewportChange({
            center: { latitude: center.lat(), longitude: center.lng() },
            zoom,
          });
        });
        setMapState({ maps, map });
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });

    return () => {
      active = false;
      idleListener?.remove();
    };
  }, [apiKey, onViewportChange]);

  useEffect(() => {
    if (!mapState) return;

    const markerInstances = markers.map((marker) => {
      const instance = new mapState.maps.Marker({
        map: mapState.map,
        position: {
          lat: marker.coordinates.latitude,
          lng: marker.coordinates.longitude,
        },
        title: marker.label,
      });
      const listener = instance.addListener("click", () =>
        onOpenDestination(marker.id),
      );
      return { instance, listener };
    });

    return () => {
      markerInstances.forEach(({ instance, listener }) => {
        listener?.remove?.();
        instance.setMap(null);
      });
    };
  }, [mapState, markers, onOpenDestination]);

  useEffect(() => {
    if (!mapState) return;
    mapState.map.setCenter({
      lat: viewport.center.latitude,
      lng: viewport.center.longitude,
    });
    mapState.map.setZoom(viewport.zoom);
  }, [mapState, viewport]);

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
      <div ref={containerRef} className="google-map" />
      <div className="map-caption" aria-live="polite">
        <strong>
          {focusedMarker?.label ?? "Explore Batam"}
        </strong>
        <span>Traffic-unaware map context</span>
      </div>
    </div>
  );
}
