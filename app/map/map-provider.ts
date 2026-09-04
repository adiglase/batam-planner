import type { Coordinates } from "~/geography/coordinates";

export type MapMarker = {
  id: string;
  label: string;
  coordinates: Coordinates;
};

export type MapPresentation = {
  markers: MapMarker[];
  focusedDestinationId: string | null;
  onFocus: (destinationId: string) => void;
};
