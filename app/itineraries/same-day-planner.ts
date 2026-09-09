import type { Destination } from "~/destinations/destination";
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

async function estimateLeg(
  origin: ItineraryAnchor,
  destination: ItineraryAnchor,
  trip: Trip,
  routingProvider: RoutingProvider,
) {
  if (trip.transportMode !== "walking" && trip.shortWalkMinutes > 0) {
    const walking = await routingProvider.estimateTravel({
      origin: origin.coordinates,
      destination: destination.coordinates,
      mode: "walking",
    });
    if (walking && walking.durationSeconds <= trip.shortWalkMinutes * 60) {
      return walking;
    }
  }
  return routingProvider.estimateTravel({
    origin: origin.coordinates,
    destination: destination.coordinates,
    mode: trip.transportMode!,
  });
}

type OptimizedRoute = {
  destinations: SelectedDestination[];
  estimates: TravelEstimate[];
};

type PartialRoute = {
  durationSeconds: number;
  destinationIndexes: number[];
};

function routeIdentity(route: PartialRoute, destinations: SelectedDestination[]) {
  return route.destinationIndexes.map((index) => destinations[index].id).join("\0");
}

function isBetterRoute(
  candidate: PartialRoute,
  current: PartialRoute | undefined,
  destinations: SelectedDestination[],
) {
  return (
    !current ||
    candidate.durationSeconds < current.durationSeconds ||
    (candidate.durationSeconds === current.durationSeconds &&
      routeIdentity(candidate, destinations) < routeIdentity(current, destinations))
  );
}

async function optimizeRoute(
  destinations: SelectedDestination[],
  arrival: ItineraryAnchor,
  departure: ItineraryAnchor,
  trip: Trip,
  routingProvider: RoutingProvider,
): Promise<OptimizedRoute | null> {
  const destinationAnchors = destinations.map(destinationAnchor);
  const estimates = new Map<string, TravelEstimate>();
  const key = (origin: ItineraryAnchor, destination: ItineraryAnchor) =>
    `${origin.id}\0${destination.id}`;
  const candidates = [
    ...destinationAnchors.map((destination) => [arrival, destination] as const),
    ...destinationAnchors.flatMap((origin, originIndex) =>
      destinationAnchors.flatMap((destination, destinationIndex) =>
        originIndex === destinationIndex ? [] : [[origin, destination] as const],
      ),
    ),
    ...destinationAnchors.map((origin) => [origin, departure] as const),
  ];
  await Promise.all(
    candidates.map(async ([origin, destination]) => {
      const estimate = await estimateLeg(origin, destination, trip, routingProvider);
      if (estimate) estimates.set(key(origin, destination), estimate);
    }),
  );

  const state = new Map<string, PartialRoute>();
  destinationAnchors.forEach((destination, index) => {
    const estimate = estimates.get(key(arrival, destination));
    if (estimate) {
      state.set(`${1 << index}:${index}`, {
        durationSeconds: estimate.durationSeconds,
        destinationIndexes: [index],
      });
    }
  });
  const completeMask = (1 << destinations.length) - 1;
  for (let mask = 1; mask <= completeMask; mask += 1) {
    for (let last = 0; last < destinations.length; last += 1) {
      const current = state.get(`${mask}:${last}`);
      if (!current) continue;
      for (let next = 0; next < destinations.length; next += 1) {
        if (mask & (1 << next)) continue;
        const estimate = estimates.get(
          key(destinationAnchors[last], destinationAnchors[next]),
        );
        if (!estimate) continue;
        const nextMask = mask | (1 << next);
        const candidate = {
          durationSeconds: current.durationSeconds + estimate.durationSeconds,
          destinationIndexes: [...current.destinationIndexes, next],
        };
        const stateKey = `${nextMask}:${next}`;
        if (isBetterRoute(candidate, state.get(stateKey), destinations)) {
          state.set(stateKey, candidate);
        }
      }
    }
  }

  let best: PartialRoute | undefined;
  for (let last = 0; last < destinations.length; last += 1) {
    const route = state.get(`${completeMask}:${last}`);
    const finalEstimate = estimates.get(key(destinationAnchors[last], departure));
    if (!route || !finalEstimate) continue;
    const candidate = {
      ...route,
      durationSeconds: route.durationSeconds + finalEstimate.durationSeconds,
    };
    if (isBetterRoute(candidate, best, destinations)) best = candidate;
  }
  if (!best) return null;
  const orderedAnchors = best.destinationIndexes.map(
    (index) => destinationAnchors[index],
  );
  const anchors = [arrival, ...orderedAnchors, departure];
  return {
    destinations: best.destinationIndexes.map((index) => destinations[index]),
    estimates: anchors.slice(0, -1).map(
      (origin, index) => estimates.get(key(origin, anchors[index + 1]))!,
    ),
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
  publishedDestinations: readonly Pick<Destination, "id" | "operationalStatus">[] =
    trip.destinations,
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
  const publishedStatuses = new Map(
    publishedDestinations.map(({ id, operationalStatus }) => [id, operationalStatus]),
  );
  const blocked = trip.destinations.find(
    ({ id }) => publishedStatuses.get(id) !== "Open",
  );
  if (blocked) {
    return {
      ok: false,
      code: "ineligible-destination",
      message: `${blocked.name} is not currently eligible for a Visit.`,
    };
  }

  let destinations = trip.destinationOrder
    ? trip.destinationOrder.map(
        (id) => trip.destinations.find((destination) => destination.id === id)!,
      )
    : trip.destinations;
  const durations = new Map(
    destinations.map((destination) => [
      destination.id,
      effectiveVisitMinutes(trip, destination.id),
    ]),
  );
  if ([...durations.values()].some((minutes) => !minutes || !Number.isInteger(minutes) || minutes <= 0)) {
    return {
      ok: false,
      code: "missing-input",
      message: "Every selected Destination needs a Visit duration.",
    };
  }

  const arrivalAnchor: ItineraryAnchor = {
    id: `terminal:${arrivalTerminal.name}`,
    name: arrivalTerminal.name,
    coordinates: arrivalTerminal.coordinates,
    kind: "terminal",
  };
  const departureAnchor: ItineraryAnchor = {
    id: `terminal:${departureTerminal.name}`,
    name: departureTerminal.name,
    coordinates: departureTerminal.coordinates,
    kind: "terminal",
  };
  let anchors: ItineraryAnchor[];
  let estimates: TravelEstimate[];
  if (trip.destinationOrder === null) {
    const optimized = await optimizeRoute(
      destinations,
      arrivalAnchor,
      departureAnchor,
      trip,
      routingProvider,
    );
    if (!optimized) {
      return {
        ok: false,
        code: "unavailable-route",
        message: "No complete Travel route connects every selected Destination.",
      };
    }
    destinations = optimized.destinations;
    anchors = [arrivalAnchor, ...destinations.map(destinationAnchor), departureAnchor];
    estimates = optimized.estimates;
  } else {
    anchors = [arrivalAnchor, ...destinations.map(destinationAnchor), departureAnchor];
    estimates = [];
    for (let index = 0; index < anchors.length - 1; index += 1) {
      const estimate = await estimateLeg(
        anchors[index],
        anchors[index + 1],
        trip,
        routingProvider,
      );
      if (!estimate) {
        return {
          ok: false,
          code: "unavailable-route",
          message: `Travel from ${anchors[index].name} to ${anchors[index + 1].name} is unavailable.`,
        };
      }
      estimates.push(estimate);
    }
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
      estimate,
    });
    cursor = travelEnd;
    if (index < destinations.length) {
      const durationMinutes = durations.get(destinations[index].id)!;
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
