import type {
  RoutingProvider,
  TransportMode,
  TravelWarning,
} from "./routing-provider";
import { RoutingFailure } from "./routing-provider";

const GOOGLE_ROUTES_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

const GOOGLE_TRAVEL_MODES = {
  car: "DRIVE",
  motorcycle: "TWO_WHEELER",
  walking: "WALK",
} as const;

const REQUIRED_ROUTE_WARNINGS: Partial<Record<TransportMode, TravelWarning>> = {
  walking: {
    code: "walking-route-limitations",
    message:
      "Walking directions are in beta and may be missing clear sidewalks or pedestrian paths.",
  },
  motorcycle: {
    code: "two-wheel-route-limitations",
    message:
      "Motorcycle directions are in beta and may be missing suitable two-wheel routes.",
  },
};

function decodePolyline(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return null;
  const points: Array<{ latitude: number; longitude: number }> = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  try {
    while (index < value.length) {
      const deltas: number[] = [];
      for (let coordinate = 0; coordinate < 2; coordinate += 1) {
        let result = 0;
        let shift = 0;
        let chunk: number;
        do {
          chunk = value.charCodeAt(index++) - 63;
          if (chunk < 0 || index > value.length) return null;
          result |= (chunk & 0x1f) << shift;
          shift += 5;
        } while (chunk >= 0x20);
        deltas.push(result & 1 ? ~(result >> 1) : result >> 1);
      }
      latitude += deltas[0];
      longitude += deltas[1];
      points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
    }
  } catch {
    return null;
  }
  return points.length > 0 ? points : null;
}

function durationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

export function createGoogleRoutesProvider(
  apiKey: string,
  fetcher: typeof fetch = globalThis.fetch,
): RoutingProvider {
  return {
    async estimateTravel(input) {
      try {
        const travelMode = GOOGLE_TRAVEL_MODES[input.mode];
        const body: Record<string, unknown> = {
          origin: { location: { latLng: input.origin } },
          destination: { location: { latLng: input.destination } },
          travelMode,
        };
        if (travelMode === "DRIVE" || travelMode === "TWO_WHEELER") {
          body.routingPreference = "TRAFFIC_UNAWARE";
        }
        const response = await fetcher(GOOGLE_ROUTES_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
              "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
          },
          body: JSON.stringify(body),
        });
        if (response.status === 429) throw new RoutingFailure("quota-exceeded");
        if (!response.ok) throw new RoutingFailure("provider-unavailable");
        const data: unknown = await response.json();
        const route =
          data && typeof data === "object" && "routes" in data
            ? (data as { routes?: unknown[] }).routes?.[0]
            : undefined;
        if (!route || typeof route !== "object") return null;
        const distanceMeters = (route as { distanceMeters?: unknown })
          .distanceMeters;
        const parsedDuration = durationSeconds(
          (route as { duration?: unknown }).duration,
        );
        const geometry = decodePolyline(
          (route as { polyline?: { encodedPolyline?: unknown } }).polyline
            ?.encodedPolyline,
        );
        if (
          typeof distanceMeters !== "number" ||
          !Number.isFinite(distanceMeters) ||
          distanceMeters < 0 ||
          parsedDuration === null ||
          geometry === null
        ) {
          return null;
        }
        const requiredWarning = REQUIRED_ROUTE_WARNINGS[input.mode];
        return {
          distanceMeters,
          durationSeconds: parsedDuration,
          mode: input.mode,
          geometry,
          warnings: requiredWarning ? [requiredWarning] : [],
        };
      } catch (error) {
        if (error instanceof RoutingFailure) throw error;
        throw new RoutingFailure("provider-unavailable");
      }
    },
  };
}
