import type { Coordinates } from "~/geography/coordinates";

export type TransportMode = "car" | "motorcycle" | "walking";

export type TravelWarning = {
  code: "walking-route-limitations" | "two-wheel-route-limitations";
  message: string;
};

export type TravelEstimate = {
  distanceMeters: number;
  durationSeconds: number;
  mode: TransportMode;
  geometry: Coordinates[];
  /** Product-facing warnings. Provider enums and response types stay in adapters. */
  warnings: TravelWarning[];
};

export type RoutingFailureCode =
  | "connection-required"
  | "quota-exceeded"
  | "provider-unavailable";

/** A provider-neutral failure that is safe to translate in Visitor-facing UI. */
export class RoutingFailure extends Error {
  constructor(public readonly code: RoutingFailureCode) {
    super(code);
    this.name = "RoutingFailure";
  }
}

export function isRoutingFailure(value: unknown): value is RoutingFailure {
  return value instanceof RoutingFailure;
}

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
