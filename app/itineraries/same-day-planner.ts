import { findFerryTerminal } from "~/geography/ferry-terminals";
import type { Coordinates } from "~/geography/coordinates";
import type {
  RoutingProvider,
  TravelEstimate,
} from "~/routing/routing-provider";
import {
  effectiveVisitMinutes,
  MAX_SELECTED_DESTINATIONS,
  tripDayDates,
} from "~/trips/trip-repository";
import type { SelectedDestination, Trip } from "~/trips/trip-repository";

export type ItineraryAnchor = {
  id: string;
  name: string;
  coordinates: Coordinates;
  kind: "terminal" | "destination";
};

export type ItineraryTravel = {
  kind: "travel";
  origin: ItineraryAnchor;
  destination: ItineraryAnchor;
  startSeconds: number;
  endSeconds: number;
  estimate: TravelEstimate;
};

export type ItineraryVisit = {
  kind: "visit";
  destinationId: string;
  destinationName: string;
  startSeconds: number;
  endSeconds: number;
  durationMinutes: number;
};

export type SameDayItinerary = {
  inputRevision: number;
  date: string;
  startSeconds: number;
  endSeconds: number;
  entries: Array<ItineraryTravel | ItineraryVisit>;
};

export type BuildFailureCode =
  | "missing-input"
  | "unsupported-trip-length"
  | "ineligible-destination"
  | "unavailable-route"
  | "insufficient-time";

export type BuildItineraryResult =
  | { ok: true; itinerary: SameDayItinerary }
  | { ok: false; code: BuildFailureCode; message: string };

function timeToSeconds(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 3600 + minutes * 60;
}

function destinationAnchor(destination: SelectedDestination): ItineraryAnchor {
  return {
    id: destination.id,
    name: destination.name,
    coordinates: destination.coordinates,
    kind: "destination",
  };
}

/**
 * Build a complete same-day Itinerary or no Itinerary at all. The function is
 * deliberately side-effect free except for provider requests; callers commit
 * only the successful result. Operating hours are not read here.
 */
export async function buildSameDayItinerary(
  trip: Trip,
  routingProvider: RoutingProvider,
): Promise<BuildItineraryResult> {
  const days = tripDayDates(trip);
  if (days.length !== 1) {
    return {
      ok: false,
      code: "unsupported-trip-length",
      message: "This Build currently requires arrival and departure on the same day.",
    };
  }
  if (
    trip.destinations.length < 1 ||
    trip.destinations.length > MAX_SELECTED_DESTINATIONS ||
    !trip.transportMode
  ) {
    return {
      ok: false,
      code: "missing-input",
      message: "Choose one through ten Destinations and a Primary transport.",
    };
  }
  const arrivalTerminal = findFerryTerminal(trip.boundaries.arrival.terminal);
  const departureTerminal = findFerryTerminal(trip.boundaries.departure.terminal);
  const arrivalSeconds = timeToSeconds(trip.boundaries.arrival.time);
  const departureSeconds = timeToSeconds(trip.boundaries.departure.time);
  const window = trip.dailyWindows.find(({ date }) => date === days[0]);
  const windowStart = window ? timeToSeconds(window.start) : null;
  const windowEnd = window ? timeToSeconds(window.end) : null;
  if (
    !arrivalTerminal ||
    !departureTerminal ||
    arrivalSeconds === null ||
    departureSeconds === null ||
    windowStart === null ||
    windowEnd === null
  ) {
    return {
      ok: false,
      code: "missing-input",
      message: "Choose supported ferry terminals and complete the Trip Boundary and Daily window times.",
    };
  }
  if (trip.destinations.some(({ operationalStatus }) => operationalStatus !== "Open")) {
    const blocked = trip.destinations.find(
      ({ operationalStatus }) => operationalStatus !== "Open",
    )!;
    return {
      ok: false,
      code: "ineligible-destination",
      message: `${blocked.name} is not currently eligible for a Visit.`,
    };
  }

  const orderedIds = trip.destinationOrder ?? trip.destinations.map(({ id }) => id);
  const destinations = orderedIds.map(
    (id) => trip.destinations.find((destination) => destination.id === id)!,
  );
  const durations = destinations.map((destination) =>
    effectiveVisitMinutes(trip, destination.id),
  );
  if (durations.some((minutes) => !minutes || !Number.isInteger(minutes) || minutes <= 0)) {
    return {
      ok: false,
      code: "missing-input",
      message: "Every selected Destination needs a Visit duration.",
    };
  }

  const anchors: ItineraryAnchor[] = [
    {
      id: `terminal:${arrivalTerminal.name}`,
      name: arrivalTerminal.name,
      coordinates: arrivalTerminal.coordinates,
      kind: "terminal",
    },
    ...destinations.map(destinationAnchor),
    {
      id: `terminal:${departureTerminal.name}`,
      name: departureTerminal.name,
      coordinates: departureTerminal.coordinates,
      kind: "terminal",
    },
  ];
  const estimates: TravelEstimate[] = [];
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const estimate = await routingProvider.estimateTravel({
      origin: anchors[index].coordinates,
      destination: anchors[index + 1].coordinates,
      mode: trip.transportMode,
    });
    if (!estimate) {
      return {
        ok: false,
        code: "unavailable-route",
        message: `Travel from ${anchors[index].name} to ${anchors[index + 1].name} is unavailable.`,
      };
    }
    estimates.push(estimate);
  }

  const availableStart = Math.max(arrivalSeconds, windowStart);
  const availableEnd = Math.min(departureSeconds, windowEnd);
  let cursor = availableStart;
  const entries: SameDayItinerary["entries"] = [];
  for (let index = 0; index < estimates.length; index += 1) {
    const estimate = estimates[index];
    const travelEnd = cursor + estimate.durationSeconds;
    entries.push({
      kind: "travel",
      origin: anchors[index],
      destination: anchors[index + 1],
      startSeconds: cursor,
      endSeconds: travelEnd,
      // Preserve provider-independent routing facts without adding buffers.
      estimate: {
        ...estimate,
        geometry: estimate.geometry.map((point) => ({ ...point })),
      },
    });
    cursor = travelEnd;
    if (index < destinations.length) {
      const durationMinutes = durations[index]!;
      const visitEnd = cursor + durationMinutes * 60;
      entries.push({
        kind: "visit",
        destinationId: destinations[index].id,
        destinationName: destinations[index].name,
        startSeconds: cursor,
        endSeconds: visitEnd,
        durationMinutes,
      });
      cursor = visitEnd;
    }
  }

  if (cursor > availableEnd) {
    return {
      ok: false,
      code: "insufficient-time",
      message: "The complete Itinerary does not fit within the Trip Boundaries and Daily window.",
    };
  }
  return {
    ok: true,
    itinerary: {
      inputRevision: trip.revision,
      date: days[0],
      startSeconds: availableStart,
      endSeconds: cursor,
      entries,
    },
  };
}

export function formatItineraryTime(seconds: number): string {
  const wholeSeconds = Math.round(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  const base = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return remainder === 0 ? base : `${base}:${String(remainder).padStart(2, "0")}`;
}
