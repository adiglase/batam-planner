import type { Coordinates } from "~/geography/coordinates";

export type TransportMode = "car" | "motorcycle" | "walking";

export type TravelEstimate = {
  distanceMeters: number;
  durationSeconds: number;
  mode: TransportMode;
  geometry: Coordinates[];
};

export interface RoutingProvider {
  estimateTravel(input: {
    origin: Coordinates;
    destination: Coordinates;
    mode: TransportMode;
  }): Promise<TravelEstimate | null>;
}
