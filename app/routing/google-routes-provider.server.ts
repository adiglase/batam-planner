import type { RoutingProvider } from "./routing-provider";

const GOOGLE_ROUTES_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

const GOOGLE_TRAVEL_MODES = {
  car: "DRIVE",
  motorcycle: "TWO_WHEELER",
  walking: "WALK",
} as const;

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
            "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
          },
          body: JSON.stringify(body),
        });
        if (!response.ok) return null;
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
        if (
          typeof distanceMeters !== "number" ||
          !Number.isFinite(distanceMeters) ||
          distanceMeters < 0 ||
          parsedDuration === null
        ) {
          return null;
        }
        return {
          distanceMeters,
          durationSeconds: parsedDuration,
          mode: input.mode,
          geometry: [],
        };
      } catch {
        return null;
      }
    },
  };
}
