import type { Route } from "./+types/travel-estimate-api";
import type { Coordinates } from "~/geography/coordinates";
import { createGoogleRoutesProvider } from "~/routing/google-routes-provider.server";
import { isPrimaryTransportMode } from "~/trips/trip-repository";

function isCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== "object") return false;
  const coordinates = value as Coordinates;
  return (
    Number.isFinite(coordinates.latitude) &&
    coordinates.latitude >= -90 &&
    coordinates.latitude <= 90 &&
    Number.isFinite(coordinates.longitude) &&
    coordinates.longitude >= -180 &&
    coordinates.longitude <= 180
  );
}

export async function action({ request }: Route.ActionArgs) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ estimate: null }, { status: 400 });
  }
  if (!input || typeof input !== "object") {
    return Response.json({ estimate: null }, { status: 400 });
  }
  const candidate = input as {
    origin?: unknown;
    destination?: unknown;
    mode?: unknown;
  };
  if (
    !isCoordinates(candidate.origin) ||
    !isCoordinates(candidate.destination) ||
    typeof candidate.mode !== "string" ||
    !isPrimaryTransportMode(candidate.mode)
  ) {
    return Response.json({ estimate: null }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_ROUTES_API_KEY;
  if (!apiKey) {
    return Response.json(
      { estimate: null },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const estimate = await createGoogleRoutesProvider(apiKey).estimateTravel({
    origin: candidate.origin,
    destination: candidate.destination,
    mode: candidate.mode,
  });
  return Response.json(
    { estimate },
    { headers: { "Cache-Control": "no-store" } },
  );
}
