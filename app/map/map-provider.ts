import type { Coordinates } from "~/geography/coordinates";

export type MapMarker = {
  id: string;
  label: string;
  coordinates: Coordinates;
  /** Itinerary Visits are numbered; plain Destination markers leave this undefined. */
  sequence?: number;
  /** Itinerary presentation role; plain Destination markers leave this undefined. */
  kind?: "visit" | "terminal" | "accommodation";
};

/** One provider-independent Travel leg of the route drawn on the map. */
export type MapRouteLeg = {
  id: string;
  label: string;
  path: Coordinates[];
};

/**
 * The ordered route for the currently selected Itinerary day. Its presence
 * switches the map from Destination clustering to an ordered day route.
 */
export type MapRoute = {
  id: string;
  legs: MapRouteLeg[];
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
  /** Focused marker or Travel leg; null when nothing is emphasized. */
  focusedElementId: string | null;
  /** Selected-day route, when an Itinerary is being presented. */
  route?: MapRoute | null;
  viewport: MapViewport;
  /** Actual visible bounds last reported by the provider; null until known. */
  visibleBounds: MapBounds | null;
  onViewportChange: (viewport: MapViewport, bounds: MapBounds | null) => void;
  /** Absent when activating a marker should only focus it, as in Itinerary. */
  onOpenDestination?: (destinationId: string) => void;
  onFocusElement?: (elementId: string) => void;
};
