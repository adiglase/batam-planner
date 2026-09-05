import { useEffect, useRef, useState } from "react";

import type { MapPresentation, MapViewport } from "./map-provider";

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
  setIcon(icon: string): void;
  setOpacity(opacity: number): void;
  setZIndex(zIndex: number): void;
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
    icon?: string;
    opacity?: number;
    zIndex?: number;
  }) => GoogleMarkerInstance;
};

declare global {
  interface Window {
    google?: { maps: GoogleMapsApi };
    __batamPlannerGoogleMapsLoaded?: () => void;
  }
}

const GOOGLE_MAPS_CALLBACK = "__batamPlannerGoogleMapsLoaded";
let googleMapsPromise: Promise<GoogleMapsApi> | undefined;

const MARKER_FILL = "#E7684B";
const MARKER_RING = "#0F766E";

// Tolerance for float noise in the Maps API round-trip. Differences at or
// below this are treated as "already there" so idle echoes never yank the
// map to a near-identical position.
const VIEWPORT_EPSILON = 1e-9;

export function isMapViewportSynced(
  actual: { latitude: number; longitude: number; zoom: number } | undefined,
  desired: MapViewport,
) {
  if (!actual) return false;
  return (
    Math.abs(actual.latitude - desired.center.latitude) <= VIEWPORT_EPSILON &&
    Math.abs(actual.longitude - desired.center.longitude) <= VIEWPORT_EPSILON &&
    actual.zoom === desired.zoom
  );
}

function markerIconUrl(selected: boolean) {
  const pin =
    "M20 3 C10 3 3 10 3 19 C3 30 20 49 20 49 C20 49 37 30 37 19 C37 10 30 3 20 3 Z";
  const selectedPin =
    "M24 4 C12 4 4 12 4 23 C4 36 24 59 24 59 C24 59 44 36 44 23 C44 12 36 4 24 4 Z";
  const svg = selected
    ? `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='63' viewBox='0 0 48 63'><defs><filter id='sel' x='-40%' y='-40%' width='180%' height='180%'><feDropShadow dx='0' dy='2.5' stdDeviation='3' flood-color='#0B1F20' flood-opacity='0.5'/></filter></defs><circle cx='24' cy='23' r='21' fill='${MARKER_RING}' fill-opacity='0.22'/><g filter='url(#sel)'><path d='${selectedPin}' fill='white'/><path d='${selectedPin}' fill='${MARKER_FILL}' stroke='${MARKER_RING}' stroke-width='4' stroke-linejoin='round'/></g><circle cx='24' cy='23' r='6' fill='white' stroke='${MARKER_RING}' stroke-width='2'/></svg>`
    : `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='52' viewBox='0 0 40 52'><defs><filter id='base' x='-40%' y='-40%' width='180%' height='180%'><feDropShadow dx='0' dy='2' stdDeviation='2.5' flood-color='#0B1F20' flood-opacity='0.5'/></filter></defs><g filter='url(#base)'><path d='${pin}' fill='white'/><path d='${pin}' fill='${MARKER_FILL}' stroke='white' stroke-width='2.5' stroke-linejoin='round'/></g><circle cx='20' cy='19' r='5' fill='white'/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function applyMarkerEmphasis(
  instance: GoogleMarkerInstance,
  selected: boolean,
) {
  instance.setIcon(markerIconUrl(selected));
  instance.setZIndex(selected ? 100 : 10);
  instance.setOpacity(1);
}

export function googleMapsScriptUrl(apiKey: string) {
  const source = new URL("https://maps.googleapis.com/maps/api/js");
  source.searchParams.set("key", apiKey);
  source.searchParams.set("loading", "async");
  source.searchParams.set("v", "weekly");
  source.searchParams.set("callback", GOOGLE_MAPS_CALLBACK);
  return source;
}

export function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = (message: string) => {
      script.remove();
      delete window.__batamPlannerGoogleMapsLoaded;
      googleMapsPromise = undefined;
      reject(new Error(message));
    };
    const source = googleMapsScriptUrl(apiKey);
    script.src = source.toString();
    script.async = true;
    script.onerror = () => fail("Google Maps failed to load");
    window.__batamPlannerGoogleMapsLoaded = () => {
      delete window.__batamPlannerGoogleMapsLoaded;
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
  const openDestinationRef = useRef(onOpenDestination);
  useEffect(() => {
    openDestinationRef.current = onOpenDestination;
  }, [onOpenDestination]);
  const focusedIdRef = useRef(focusedDestinationId);
  useEffect(() => {
    focusedIdRef.current = focusedDestinationId;
  }, [focusedDestinationId]);
  const markerInstancesRef = useRef(new Map<string, GoogleMarkerInstance>());
  // Latest committed viewport for the async map construction below. Read
  // here instead of closing over the first render's viewport, otherwise a
  // slow Maps load builds the map at a stale position.
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    let active = true;
    let idleListener: { remove(): void } | undefined;

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (!active || !containerRef.current) return;

        const initialViewport = viewportRef.current;
        const map = new maps.Map(containerRef.current, {
          center: {
            lat: initialViewport.center.latitude,
            lng: initialViewport.center.longitude,
          },
          zoom: initialViewport.zoom,
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
      const selected = marker.id === focusedIdRef.current;
      const instance = new mapState.maps.Marker({
        map: mapState.map,
        position: {
          lat: marker.coordinates.latitude,
          lng: marker.coordinates.longitude,
        },
        title: marker.label,
        icon: markerIconUrl(selected),
        opacity: 1,
        zIndex: selected ? 100 : 10,
      });
      const listener = instance.addListener("click", () =>
        openDestinationRef.current(marker.id),
      );
      return { markerId: marker.id, instance, listener };
    });
    markerInstancesRef.current = new Map(
      markerInstances.map(({ markerId, instance }) => [markerId, instance]),
    );

    return () => {
      markerInstances.forEach(({ instance, listener }) => {
        listener?.remove?.();
        instance.setMap(null);
      });
      markerInstancesRef.current.clear();
    };
  }, [mapState, markers]);

  useEffect(() => {
    markerInstancesRef.current.forEach((instance, markerId) => {
      applyMarkerEmphasis(instance, markerId === focusedDestinationId);
    });
  }, [focusedDestinationId]);

  // Drive the map only when it actually drifted from the desired viewport.
  // The previous unconditional setCenter/setZoom re-drove the map on every
  // idle echo, which yanked the view to near-identical positions and
  // corrupted wheel/pinch zoom anchors.
  useEffect(() => {
    if (!mapState) return;
    const center = mapState.map.getCenter();
    const zoom = mapState.map.getZoom();
    const synced = isMapViewportSynced(
      center && zoom !== undefined
        ? { latitude: center.lat(), longitude: center.lng(), zoom }
        : undefined,
      viewport,
    );
    if (synced) return;
    const centerSynced =
      center &&
      Math.abs(center.lat() - viewport.center.latitude) <= VIEWPORT_EPSILON &&
      Math.abs(center.lng() - viewport.center.longitude) <= VIEWPORT_EPSILON;
    if (!centerSynced) {
      mapState.map.setCenter({
        lat: viewport.center.latitude,
        lng: viewport.center.longitude,
      });
    }
    if (zoom !== viewport.zoom) {
      mapState.map.setZoom(viewport.zoom);
    }
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
