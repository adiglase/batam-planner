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

export type MapPresentation = {
  markers: MapMarker[];
  focusedDestinationId: string | null;
  viewport: MapViewport;
  onViewportChange: (viewport: MapViewport) => void;
  onOpenDestination: (destinationId: string) => void;
};
