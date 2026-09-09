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

/**
 * Default provider until a Google Routes adapter lands (deferred per
 * ADR-0001). It reports every calculation as unavailable rather than
 * inventing a distance or substituting a straight-line estimate.
 */
export const unavailableRoutingProvider: RoutingProvider = {
  estimateTravel: async () => null,
};
