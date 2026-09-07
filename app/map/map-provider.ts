import type { Coordinates } from "~/geography/coordinates";

export type MapMarker = {
  id: string;
  label: string;
  coordinates: Coordinates;
};

export type MapViewport = {
  center: Coordinates;
  zoom: number;
};

export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type MapPresentation = {
  markers: MapMarker[];
  focusedDestinationId: string | null;
  viewport: MapViewport;
  /** Actual visible bounds last reported by the provider; null until known. */
  visibleBounds: MapBounds | null;
  onViewportChange: (viewport: MapViewport, bounds: MapBounds | null) => void;
  onOpenDestination: (destinationId: string) => void;
  onFocusDestination?: (destinationId: string) => void;
};
