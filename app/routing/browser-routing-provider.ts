import type { RoutingFailureCode, RoutingProvider, TravelEstimate } from "./routing-provider";
import { RoutingFailure } from "./routing-provider";

type TravelEstimateResponse = {
  estimate: TravelEstimate | null;
  failure?: RoutingFailureCode;
};

function isRoutingFailureCode(value: unknown): value is RoutingFailureCode {
  return value === "connection-required" ||
    value === "quota-exceeded" ||
    value === "provider-unavailable";
}

function isTravelWarnings(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (warning) =>
        !!warning &&
        typeof warning === "object" &&
        (warning.code === "walking-route-limitations" ||
          warning.code === "two-wheel-route-limitations") &&
        typeof warning.message === "string",
    )
  );
}

function isTravelGeometry(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (point) =>
        !!point &&
        typeof point === "object" &&
        Number.isFinite((point as { latitude?: unknown }).latitude) &&
        Number.isFinite((point as { longitude?: unknown }).longitude),
    )
  );
}

function isTravelEstimateResponse(
  value: unknown,
  requestedMode: TravelEstimate["mode"],
): value is TravelEstimateResponse {
  if (!value || typeof value !== "object" || !("estimate" in value)) {
    return false;
  }
  const response = value as TravelEstimateResponse;
  if (response.failure !== undefined && !isRoutingFailureCode(response.failure)) {
    return false;
  }
  const estimate = response.estimate;
  if (estimate === null) return true;
  return (
    !!estimate &&
    Number.isFinite(estimate.distanceMeters) &&
    estimate.distanceMeters >= 0 &&
    Number.isFinite(estimate.durationSeconds) &&
    estimate.durationSeconds >= 0 &&
    estimate.mode === requestedMode &&
    isTravelGeometry(estimate.geometry) &&
    isTravelWarnings(estimate.warnings)
  );
}

export function createBrowserRoutingProvider(
  fetcher: typeof fetch = globalThis.fetch,
): RoutingProvider {
  return {
    async estimateTravel(input) {
      let response: Response;
      try {
        response = await fetcher("/api/travel-estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
      } catch {
        throw new RoutingFailure("connection-required");
      }
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new RoutingFailure("provider-unavailable");
      }
      if (!isTravelEstimateResponse(data, input.mode)) {
        throw new RoutingFailure("provider-unavailable");
      }
      if (data.failure) throw new RoutingFailure(data.failure);
      if (!response.ok) throw new RoutingFailure("provider-unavailable");
      if (data.estimate === null) return null;
      const estimate = data.estimate;
      return {
        distanceMeters: estimate.distanceMeters,
        durationSeconds: estimate.durationSeconds,
        mode: estimate.mode,
        geometry: estimate.geometry.map(({ latitude, longitude }) => ({
          latitude,
          longitude,
        })),
        warnings: estimate.warnings.map(({ code, message }) => ({
          code,
          message,
        })),
      };
    },
  };
}

export const browserRoutingProvider = createBrowserRoutingProvider();
