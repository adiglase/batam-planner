import type { ComponentType } from "react";

export type MapMarker = {
  id: string;
  label: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
};

export type MapPresentation = {
  markers: MapMarker[];
  focusedDestinationId: string | null;
  onFocus: (destinationId: string) => void;
};

export type MapProvider = ComponentType<MapPresentation>;
