import type { RoutingProvider, TravelEstimate } from "./routing-provider";

type TravelEstimateResponse = { estimate: TravelEstimate | null };

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

function isTravelEstimateResponse(
  value: unknown,
  requestedMode: TravelEstimate["mode"],
): value is TravelEstimateResponse {
  if (!value || typeof value !== "object" || !("estimate" in value)) {
    return false;
  }
  const estimate = (value as TravelEstimateResponse).estimate;
  if (estimate === null) return true;
  return (
    !!estimate &&
    Number.isFinite(estimate.distanceMeters) &&
    estimate.distanceMeters >= 0 &&
    Number.isFinite(estimate.durationSeconds) &&
    estimate.durationSeconds >= 0 &&
    estimate.mode === requestedMode &&
    Array.isArray(estimate.geometry) &&
    isTravelWarnings(estimate.warnings)
  );
}

export function createBrowserRoutingProvider(
  fetcher: typeof fetch = globalThis.fetch,
): RoutingProvider {
  return {
    async estimateTravel(input) {
      try {
        const response = await fetcher("/api/travel-estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!response.ok) return null;
        const data: unknown = await response.json();
        return isTravelEstimateResponse(data, input.mode)
          ? data.estimate
          : null;
      } catch {
        return null;
      }
    },
  };
}

export const browserRoutingProvider = createBrowserRoutingProvider();
