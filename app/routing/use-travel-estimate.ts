import { useEffect, useState } from "react";
import type { Coordinates } from "~/geography/coordinates";
import type {
  RoutingFailureCode,
  RoutingProvider,
  TransportMode,
  TravelEstimate,
} from "~/routing/routing-provider";
import { isRoutingFailure } from "~/routing/routing-provider";

export type TravelEstimateStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; estimate: TravelEstimate }
  | { state: "unavailable"; reason: RoutingFailureCode | "unavailable-route" };

/**
 * Requests one traffic-unaware Travel estimate from the Accommodation to
 * the focused Destination through the provider-independent routing
 * contract. Requests only fire when origin, destination, and mode are all
 * known; the comparison is never precomputed for whole result lists and
 * never drawn on the map. Failures resolve to "unavailable" without any
 * straight-line or substituted fallback.
 */
export function useTravelEstimate({
  origin,
  destination,
  mode,
  provider,
}: {
  origin: Coordinates | null;
  destination: Coordinates | null;
  mode: TransportMode | null;
  provider: RoutingProvider;
}): TravelEstimateStatus {
  const [status, setStatus] = useState<TravelEstimateStatus>({ state: "idle" });

  const originLatitude = origin?.latitude ?? null;
  const originLongitude = origin?.longitude ?? null;
  const destinationLatitude = destination?.latitude ?? null;
  const destinationLongitude = destination?.longitude ?? null;

  useEffect(() => {
    if (
      originLatitude === null ||
      originLongitude === null ||
      destinationLatitude === null ||
      destinationLongitude === null ||
      mode === null
    ) {
      setStatus({ state: "idle" });
      return;
    }
    let cancelled = false;
    setStatus({ state: "loading" });
    provider
      .estimateTravel({
        origin: { latitude: originLatitude, longitude: originLongitude },
        destination: {
          latitude: destinationLatitude,
          longitude: destinationLongitude,
        },
        mode,
      })
      .then((estimate) => {
        if (cancelled) return;
        setStatus(
          estimate
            ? { state: "ready", estimate }
            : { state: "unavailable", reason: "unavailable-route" },
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus({
            state: "unavailable",
            reason: isRoutingFailure(error)
              ? error.code
              : "provider-unavailable",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    originLatitude,
    originLongitude,
    destinationLatitude,
    destinationLongitude,
    mode,
    provider,
  ]);

  return status;
}
