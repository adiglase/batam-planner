import type { Coordinates } from "~/geography/coordinates";
import type { MapMarker, MapRoute, MapViewport } from "~/map/map-provider";
import type { TransportMode } from "~/routing/routing-provider";
import type { Trip } from "~/trips/trip-repository";
import type {
  Itinerary,
  ItineraryAnchor,
  ItineraryDay,
  ItineraryTravel,
  ItineraryVisit,
} from "./itinerary-planner";

/** Batam uses WIB (UTC+7) all year, with no daylight-saving transition. */
export const BATAM_UTC_OFFSET_SECONDS = 7 * 3600;

export function visitElementId(destinationId: string) {
  return `visit:${destinationId}`;
}

export function travelElementId(originId: string, destinationId: string) {
  return `travel:${originId}->${destinationId}`;
}

export function anchorElementId(anchorId: string) {
  return `anchor:${anchorId}`;
}

export type ItineraryCoordinates = ReadonlyMap<string, Coordinates>;

/** Coordinates for every Destination the Trip still knows about. */
export function itineraryCoordinates(
  trip: Pick<Trip, "destinations" | "accommodation">,
): Map<string, Coordinates> {
  const coordinates = new Map<string, Coordinates>();
  for (const destination of trip.destinations) {
    coordinates.set(destination.id, destination.coordinates);
  }
  if (trip.accommodation) {
    coordinates.set(trip.accommodation.id, trip.accommodation.coordinates);
  }
  return coordinates;
}

export type ItineraryDayPresentation = {
  day: ItineraryDay;
  markers: MapMarker[];
  route: MapRoute;
};

function visitCoordinates(
  day: ItineraryDay,
  destinationId: string,
): Coordinates | null {
  for (const entry of day.entries) {
    if (entry.kind !== "travel") continue;
    if (entry.origin.id === destinationId) return entry.origin.coordinates;
    if (entry.destination.id === destinationId) return entry.destination.coordinates;
  }
  return null;
}

/**
 * The map presentation of one selected day: its numbered Visits, any
 * ferry-terminal or Accommodation anchor, and the ordered Travel legs.
 * Presentation is read-only and never changes planning data.
 */
export function itineraryDayPresentation(
  itinerary: Itinerary,
  dayIndex: number,
  coordinates: ItineraryCoordinates,
): ItineraryDayPresentation | null {
  const day = itinerary.days[dayIndex];
  if (!day) return null;

  const visitIds = new Set(
    itinerary.days.flatMap((item) =>
      item.entries
        .filter((entry): entry is ItineraryVisit => entry.kind === "visit")
        .map((entry) => entry.destinationId),
    ),
  );
  const markers = new Map<string, MapMarker>();
  const legs: MapRoute["legs"] = [];
  let sequence = 0;

  const addEndpoint = (anchor: ItineraryAnchor) => {
    // Visits own their marker; a Travel endpoint only contributes an anchor.
    if (visitIds.has(anchor.id)) return;
    const id = anchorElementId(anchor.id);
    if (markers.has(id)) return;
    markers.set(id, {
      id,
      label: anchor.name,
      coordinates: anchor.coordinates,
      kind: anchor.kind === "terminal" ? "terminal" : "accommodation",
    });
  };

  for (const entry of day.entries) {
    if (entry.kind === "travel") {
      addEndpoint(entry.origin);
      addEndpoint(entry.destination);
      legs.push({
        id: travelElementId(entry.origin.id, entry.destination.id),
        label: `Travel from ${entry.origin.name} to ${entry.destination.name}`,
        path: entry.estimate.geometry,
      });
      continue;
    }
    sequence += 1;
    const id = visitElementId(entry.destinationId);
    const point =
      coordinates.get(entry.destinationId) ??
      visitCoordinates(day, entry.destinationId);
    if (!point) continue;
    markers.set(id, {
      id,
      label: entry.destinationName,
      coordinates: point,
      kind: "visit",
      sequence,
    });
  }

  return { day, markers: [...markers.values()], route: { id: day.date, legs } };
}

/**
 * A viewport that contains every marker and every route path coordinate of
 * the selected day with a small margin. Route geometry can bow outside the
 * endpoints, so fitting markers alone would clip it. Map movement is
 * view-only; it never changes planning data.
 */
export function fitRouteViewport(
  presentation: Pick<ItineraryDayPresentation, "markers" | "route">,
): MapViewport | null {
  const points = [
    ...presentation.markers.map(({ coordinates }) => coordinates),
    ...presentation.route.legs.flatMap(({ path }) => path),
  ];
  if (points.length === 0) return null;
  const latitudes = points.map(({ latitude }) => latitude);
  const longitudes = points.map(({ longitude }) => longitude);
  const north = Math.max(...latitudes);
  const south = Math.min(...latitudes);
  const east = Math.max(...longitudes);
  const west = Math.min(...longitudes);
  const center = {
    latitude: (north + south) / 2,
    longitude: (east + west) / 2,
  };
  const latitudeSpan = Math.max(north - south, 0.02);
  const longitudeScale = Math.max(
    0.3,
    Math.cos((center.latitude * Math.PI) / 180),
  );
  const longitudeSpan = Math.max((east - west) * longitudeScale, 0.02);
  const span = Math.max(latitudeSpan, longitudeSpan) * 1.6;
  // Mirrors viewportBoundsFromCenterZoom: span = (360 / 2^zoom) * 1.5.
  const zoom = Math.min(14, Math.max(9, Math.log2(540 / span)));
  return { center, zoom };
}

export type OnTripState = {
  isToday: boolean;
  nowSeconds: number | null;
  currentVisit: ItineraryVisit | null;
  nextVisit: ItineraryVisit | null;
  nextTravel: ItineraryTravel | null;
  remainingSeconds: number | null;
};

export function batamClock(now: Date): { date: string; seconds: number } {
  const shifted = new Date(now.getTime() + BATAM_UTC_OFFSET_SECONDS * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    seconds:
      shifted.getUTCHours() * 3600 +
      shifted.getUTCMinutes() * 60 +
      shifted.getUTCSeconds(),
  };
}

/**
 * What the Visitor needs in the moment: the Visit underway (or the first
 * Visit of another day), the next Destination and Travel leg, and how much
 * of the selected day remains. A null clock means the client has not
 * mounted yet, so nothing is claimed to be "now".
 */
export function onTripState(
  day: ItineraryDay,
  now: Date | null,
): OnTripState {
  const unclocked = {
    currentVisit: null,
    nextTravel: day.entries.find((entry) => entry.kind === "travel") ?? null,
    remainingSeconds: null,
  };
  if (!now) {
    return {
      isToday: false,
      nowSeconds: null,
      nextVisit:
        day.entries.find((entry): entry is ItineraryVisit => entry.kind === "visit") ??
        null,
      ...unclocked,
    };
  }

  const clock = batamClock(now);
  if (day.date !== clock.date) {
    return {
      isToday: false,
      nowSeconds: null,
      nextVisit:
        day.entries.find((entry): entry is ItineraryVisit => entry.kind === "visit") ??
        null,
      ...unclocked,
    };
  }

  const visits = day.entries.filter(
    (entry): entry is ItineraryVisit => entry.kind === "visit",
  );
  const travels = day.entries.filter(
    (entry): entry is ItineraryTravel => entry.kind === "travel",
  );
  const { seconds } = clock;
  const nextTravel =
    travels.find(
      (entry) => entry.startSeconds <= seconds && seconds < entry.endSeconds,
    ) ??
    travels.find((entry) => entry.startSeconds >= seconds) ??
    null;
  return {
    isToday: true,
    nowSeconds: seconds,
    currentVisit:
      visits.find(
        (entry) => entry.startSeconds <= seconds && seconds < entry.endSeconds,
      ) ?? null,
    nextVisit: visits.find((entry) => entry.startSeconds > seconds) ?? null,
    nextTravel,
    remainingSeconds: Math.max(0, day.endSeconds - seconds),
  };
}

/**
 * Google Maps has no two-wheeler navigation mode, so motorcycle legs hand
 * off using the closest driving mode; the Itinerary still reports the mode
 * actually used for the estimate.
 */
const NAVIGATION_TRAVEL_MODE: Record<TransportMode, string> = {
  car: "driving",
  motorcycle: "driving",
  walking: "walking",
};

/**
 * Hands one Travel leg to an external navigation application. The product
 * never embeds turn-by-turn guidance.
 */
export function googleMapsNavigationUrl(leg: ItineraryTravel): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set(
    "origin",
    `${leg.origin.coordinates.latitude},${leg.origin.coordinates.longitude}`,
  );
  url.searchParams.set(
    "destination",
    `${leg.destination.coordinates.latitude},${leg.destination.coordinates.longitude}`,
  );
  url.searchParams.set("travelmode", NAVIGATION_TRAVEL_MODE[leg.estimate.mode]);
  url.searchParams.set("dir_action", "navigate");
  return url.toString();
}
