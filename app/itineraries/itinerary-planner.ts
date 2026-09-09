import type { Destination } from "~/destinations/destination";
import type { Coordinates } from "~/geography/coordinates";
import { findFerryTerminal } from "~/geography/ferry-terminals";
import type { RoutingProvider, TravelEstimate } from "~/routing/routing-provider";
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

export type ItineraryDay = {
  date: string;
  startSeconds: number;
  endSeconds: number;
  entries: Array<ItineraryTravel | ItineraryVisit>;
};

export type ItineraryWarning = {
  code: "missing-accommodation";
  message: string;
};

export type Itinerary = {
  inputRevision: number;
  days: ItineraryDay[];
  warnings: ItineraryWarning[];
};

export type BuildFailureCode =
  | "missing-input"
  | "unsupported-trip-length"
  | "ineligible-destination"
  | "unavailable-route"
  | "insufficient-time";

export type BuildItineraryResult =
  | { ok: true; itinerary: Itinerary }
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

function terminalAnchor(name: string, coordinates: Coordinates): ItineraryAnchor {
  return { id: `terminal:${name}`, name, coordinates, kind: "terminal" };
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

type DayBounds = {
  date: string;
  startSeconds: number;
  endSeconds: number;
  startAnchor: ItineraryAnchor | null;
  endAnchor: ItineraryAnchor | null;
};

type DayRoute = {
  destinationIndexes: number[];
  estimates: TravelEstimate[];
  anchors: ItineraryAnchor[];
  durationSeconds: number;
  travelSeconds: number;
  identity: string;
};

type Candidate = {
  days: DayRoute[];
  travelSeconds: number;
  visitCompletion: number;
  identity: string;
};

function estimateKey(origin: ItineraryAnchor, destination: ItineraryAnchor) {
  return `${origin.id}\0${destination.id}`;
}

function fakeEstimate(
  origin: ItineraryAnchor,
  destination: ItineraryAnchor,
  trip: Trip,
): TravelEstimate {
  return {
    distanceMeters: 0,
    durationSeconds: 0,
    mode: trip.transportMode!,
    geometry: [origin.coordinates, destination.coordinates],
    warnings: [],
  };
}

function betterDayRoute(candidate: DayRoute, current: DayRoute | undefined) {
  return (
    !current ||
    candidate.travelSeconds < current.travelSeconds ||
    (candidate.travelSeconds === current.travelSeconds &&
      candidate.identity < current.identity)
  );
}

function betterCandidate(candidate: Candidate, current: Candidate | undefined) {
  return (
    !current ||
    candidate.travelSeconds < current.travelSeconds ||
    (candidate.travelSeconds === current.travelSeconds &&
      (candidate.visitCompletion < current.visitCompletion ||
        (candidate.visitCompletion === current.visitCompletion &&
          candidate.identity < current.identity)))
  );
}

function routeForDay(
  mask: number,
  bounds: DayBounds,
  destinations: SelectedDestination[],
  durations: number[],
  estimates: Map<string, TravelEstimate>,
  manualOrder: boolean,
  allowMissing: boolean,
  trip: Trip,
): DayRoute | null {
  const indexes = destinations.map((_, index) => index).filter((index) => mask & (1 << index));
  const estimate = (origin: ItineraryAnchor, destination: ItineraryAnchor) =>
    estimates.get(estimateKey(origin, destination)) ??
    (allowMissing ? fakeEstimate(origin, destination, trip) : null);

  if (indexes.length === 0) {
    if (
      bounds.startAnchor &&
      bounds.endAnchor &&
      bounds.startAnchor.id !== bounds.endAnchor.id
    ) {
      const direct = estimate(bounds.startAnchor, bounds.endAnchor);
      if (!direct) return null;
      return {
        destinationIndexes: [],
        estimates: [direct],
        anchors: [bounds.startAnchor, bounds.endAnchor],
        durationSeconds: direct.durationSeconds,
        travelSeconds: direct.durationSeconds,
        identity: "",
      };
    }
    return {
      destinationIndexes: [],
      estimates: [],
      anchors: [],
      durationSeconds: 0,
      travelSeconds: 0,
      identity: "",
    };
  }

  const anchors = destinations.map(destinationAnchor);
  const finish = (order: number[]): DayRoute | null => {
    const orderedAnchors = order.map((index) => anchors[index]);
    const routeAnchors = [
      ...(bounds.startAnchor ? [bounds.startAnchor] : []),
      ...orderedAnchors,
      ...(bounds.endAnchor ? [bounds.endAnchor] : []),
    ];
    const routeEstimates: TravelEstimate[] = [];
    for (let index = 0; index < routeAnchors.length - 1; index += 1) {
      const leg = estimate(routeAnchors[index], routeAnchors[index + 1]);
      if (!leg) return null;
      routeEstimates.push(leg);
    }
    const travelSeconds = routeEstimates.reduce(
      (total, item) => total + item.durationSeconds,
      0,
    );
    return {
      destinationIndexes: order,
      estimates: routeEstimates,
      anchors: routeAnchors,
      travelSeconds,
      durationSeconds:
        travelSeconds + order.reduce((total, index) => total + durations[index] * 60, 0),
      identity: order.map((index) => destinations[index].id).join("\0"),
    };
  };

  if (manualOrder) return finish(indexes);

  type Partial = { order: number[]; travelSeconds: number };
  const state = new Map<string, Partial>();
  for (const index of indexes) {
    const first = bounds.startAnchor ? estimate(bounds.startAnchor, anchors[index]) : fakeEstimate(anchors[index], anchors[index], trip);
    if (first) state.set(`${1 << index}:${index}`, { order: [index], travelSeconds: first.durationSeconds });
  }
  for (let partialMask = 1; partialMask <= mask; partialMask += 1) {
    if ((partialMask & mask) !== partialMask) continue;
    for (const last of indexes) {
      const current = state.get(`${partialMask}:${last}`);
      if (!current) continue;
      for (const next of indexes) {
        if (partialMask & (1 << next)) continue;
        const leg = estimate(anchors[last], anchors[next]);
        if (!leg) continue;
        const nextMask = partialMask | (1 << next);
        const candidate = {
          order: [...current.order, next],
          travelSeconds: current.travelSeconds + leg.durationSeconds,
        };
        const key = `${nextMask}:${next}`;
        const existing = state.get(key);
        const candidateIdentity = candidate.order.map((item) => destinations[item].id).join("\0");
        const existingIdentity = existing?.order.map((item) => destinations[item].id).join("\0");
        if (
          !existing ||
          candidate.travelSeconds < existing.travelSeconds ||
          (candidate.travelSeconds === existing.travelSeconds && candidateIdentity < existingIdentity!)
        ) state.set(key, candidate);
      }
    }
  }
  let best: DayRoute | undefined;
  for (const last of indexes) {
    const partial = state.get(`${mask}:${last}`);
    if (!partial) continue;
    const candidate = finish(partial.order);
    if (candidate && betterDayRoute(candidate, best)) best = candidate;
  }
  return best ?? null;
}

function scheduleDay(
  bounds: DayBounds,
  route: DayRoute,
  destinations: SelectedDestination[],
  durations: number[],
): ItineraryDay {
  let cursor = bounds.startSeconds;
  const entries: ItineraryDay["entries"] = [];
  let estimateIndex = 0;
  for (let index = 0; index < route.destinationIndexes.length; index += 1) {
    const destinationIndex = route.destinationIndexes[index];
    const destination = destinations[destinationIndex];
    if (index > 0 || bounds.startAnchor) {
      const estimate = route.estimates[estimateIndex++];
      const origin = index === 0 ? bounds.startAnchor! : destinationAnchor(destinations[route.destinationIndexes[index - 1]]);
      const target = destinationAnchor(destination);
      entries.push({ kind: "travel", origin, destination: target, startSeconds: cursor, endSeconds: cursor + estimate.durationSeconds, estimate });
      cursor += estimate.durationSeconds;
    }
    const durationMinutes = durations[destinationIndex];
    entries.push({
      kind: "visit",
      destinationId: destination.id,
      destinationName: destination.name,
      startSeconds: cursor,
      endSeconds: cursor + durationMinutes * 60,
      durationMinutes,
    });
    cursor += durationMinutes * 60;
  }
  if (bounds.endAnchor) {
    const origin = route.destinationIndexes.length > 0
      ? destinationAnchor(destinations[route.destinationIndexes.at(-1)!])
      : bounds.startAnchor;
    if (origin && origin.id !== bounds.endAnchor.id) {
      const estimate = route.estimates[estimateIndex];
      entries.push({ kind: "travel", origin, destination: bounds.endAnchor, startSeconds: cursor, endSeconds: cursor + estimate.durationSeconds, estimate });
      cursor += estimate.durationSeconds;
    }
  }
  return { date: bounds.date, startSeconds: bounds.startSeconds, endSeconds: cursor, entries };
}

async function solve(
  trip: Trip,
  bounds: DayBounds[],
  destinations: SelectedDestination[],
  durations: number[],
  estimates: Map<string, TravelEstimate>,
  allowMissing: boolean,
): Promise<Candidate | null> {
  const completeMask = (1 << destinations.length) - 1;
  const routeCache = new Map<string, DayRoute | null>();
  const cachedRoute = (dayIndex: number, dayMask: number) => {
    const key = `${dayIndex}:${dayMask}`;
    if (!routeCache.has(key)) {
      routeCache.set(
        key,
        routeForDay(
          dayMask,
          bounds[dayIndex],
          destinations,
          durations,
          estimates,
          !!trip.destinationOrder,
          allowMissing,
          trip,
        ),
      );
    }
    return routeCache.get(key)!;
  };
  let states = new Map<number, Candidate>([[0, { days: [], travelSeconds: 0, visitCompletion: 0, identity: "" }]]);
  for (let dayIndex = 0; dayIndex < bounds.length; dayIndex += 1) {
    const nextStates = new Map<number, Candidate>();
    for (const [usedMask, current] of states) {
      const remaining = completeMask ^ usedMask;
      for (let dayMask = remaining; ; dayMask = (dayMask - 1) & remaining) {
        let allowed = true;
        if (trip.destinationOrder) {
          const usedCount = current.days.reduce((total, day) => total + day.destinationIndexes.length, 0);
          const count = dayMask.toString(2).replaceAll("0", "").length;
          const expected = count === 0 ? 0 : ((1 << count) - 1) << usedCount;
          allowed = dayMask === expected;
        }
        if (allowed) {
          const route = cachedRoute(dayIndex, dayMask);
          if (route && route.durationSeconds <= bounds[dayIndex].endSeconds - bounds[dayIndex].startSeconds) {
            const visitCompletion = route.destinationIndexes.length > 0
              ? dayIndex * 86_400 + bounds[dayIndex].startSeconds + route.durationSeconds - (bounds[dayIndex].endAnchor ? route.estimates.at(-1)?.durationSeconds ?? 0 : 0)
              : current.visitCompletion;
            const candidate: Candidate = {
              days: [...current.days, route],
              travelSeconds: current.travelSeconds + route.travelSeconds,
              visitCompletion: Math.max(current.visitCompletion, visitCompletion),
              identity: `${current.identity}|${route.identity}`,
            };
            const nextMask = usedMask | dayMask;
            if (betterCandidate(candidate, nextStates.get(nextMask))) nextStates.set(nextMask, candidate);
          }
        }
        if (dayMask === 0) break;
      }
    }
    states = nextStates;
  }
  return states.get(completeMask) ?? null;
}

/** Build a complete one-to-four-day Itinerary or no Itinerary at all. */
export async function buildItinerary(
  trip: Trip,
  routingProvider: RoutingProvider,
  publishedDestinations: readonly Pick<Destination, "id" | "operationalStatus">[] = trip.destinations,
): Promise<BuildItineraryResult> {
  const dates = tripDayDates(trip);
  if (dates.length === 0) {
    return { ok: false, code: "unsupported-trip-length", message: "A Trip must cover one through four Batam calendar days." };
  }
  if (trip.destinations.length < 1 || trip.destinations.length > MAX_SELECTED_DESTINATIONS || !trip.transportMode) {
    return { ok: false, code: "missing-input", message: "Choose one through ten Destinations and a Primary transport." };
  }
  const arrivalTerminal = findFerryTerminal(trip.boundaries.arrival.terminal);
  const departureTerminal = findFerryTerminal(trip.boundaries.departure.terminal);
  const arrivalSeconds = timeToSeconds(trip.boundaries.arrival.time);
  const departureSeconds = timeToSeconds(trip.boundaries.departure.time);
  if (!arrivalTerminal || !departureTerminal || arrivalSeconds === null || departureSeconds === null) {
    return { ok: false, code: "missing-input", message: "Choose supported ferry terminals and complete the Trip Boundary times." };
  }
  const windows = dates.map((date) => trip.dailyWindows.find((window) => window.date === date));
  const parsedWindows = windows.map((window) => window ? [timeToSeconds(window.start), timeToSeconds(window.end)] as const : [null, null] as const);
  if (parsedWindows.some(([start, end]) => start === null || end === null || start >= end)) {
    return { ok: false, code: "missing-input", message: "Complete every Daily window with an end later than its start." };
  }
  const publishedStatuses = new Map(publishedDestinations.map(({ id, operationalStatus }) => [id, operationalStatus]));
  const blocked = trip.destinations.find(({ id }) => publishedStatuses.get(id) !== "Open");
  if (blocked) return { ok: false, code: "ineligible-destination", message: `${blocked.name} is not currently eligible for a Visit.` };

  const destinations = trip.destinationOrder
    ? trip.destinationOrder.map((id) => trip.destinations.find((destination) => destination.id === id)!)
    : [...trip.destinations];
  const durations = destinations.map((destination) => effectiveVisitMinutes(trip, destination.id) ?? 0);
  if (durations.some((minutes) => !Number.isInteger(minutes) || minutes <= 0)) {
    return { ok: false, code: "missing-input", message: "Every selected Destination needs a Visit duration." };
  }

  const arrivalAnchor = terminalAnchor(arrivalTerminal.name, arrivalTerminal.coordinates);
  const departureAnchor = terminalAnchor(departureTerminal.name, departureTerminal.coordinates);
  const accommodationAnchor = trip.accommodation ? destinationAnchor({ ...trip.accommodation, typicalVisitMinutes: undefined, operationalStatus: "Open" }) : null;
  const multiDay = dates.length > 1;
  const bounds: DayBounds[] = dates.map((date, index) => {
    const [windowStart, windowEnd] = parsedWindows[index] as readonly [number, number];
    const first = index === 0;
    const last = index === dates.length - 1;
    return {
      date,
      startSeconds: first ? Math.max(windowStart, arrivalSeconds) : windowStart,
      endSeconds: last ? Math.min(windowEnd, departureSeconds) : windowEnd,
      startAnchor: first ? arrivalAnchor : multiDay ? accommodationAnchor : null,
      endAnchor: last ? departureAnchor : multiDay ? accommodationAnchor : null,
    };
  });
  if (bounds.some((day) => day.startSeconds > day.endSeconds)) {
    return { ok: false, code: "insufficient-time", message: "A Daily window has no usable time within the Trip Boundaries." };
  }

  const destinationAnchors = destinations.map(destinationAnchor);
  const pairs = new Map<string, readonly [ItineraryAnchor, ItineraryAnchor]>();
  // Keep requests deterministic while avoiding routes that a hard Destination
  // order can never use.
  for (const day of bounds) {
    if (day.startAnchor) for (const destination of destinationAnchors) pairs.set(estimateKey(day.startAnchor, destination), [day.startAnchor, destination]);
  }
  for (let originIndex = 0; originIndex < destinationAnchors.length; originIndex += 1) {
    for (let destinationIndex = 0; destinationIndex < destinationAnchors.length; destinationIndex += 1) {
      if (originIndex === destinationIndex) continue;
      if (trip.destinationOrder && destinationIndex !== originIndex + 1) continue;
      const origin = destinationAnchors[originIndex];
      const destination = destinationAnchors[destinationIndex];
      pairs.set(estimateKey(origin, destination), [origin, destination]);
    }
  }
  for (const day of bounds) {
    if (day.endAnchor) for (const origin of destinationAnchors) pairs.set(estimateKey(origin, day.endAnchor), [origin, day.endAnchor]);
    if (multiDay && day.startAnchor && day.endAnchor && day.startAnchor.id !== day.endAnchor.id) pairs.set(estimateKey(day.startAnchor, day.endAnchor), [day.startAnchor, day.endAnchor]);
  }
  const estimates = new Map<string, TravelEstimate>();
  await Promise.all([...pairs].map(async ([key, [origin, destination]]) => {
    const value = await estimateLeg(origin, destination, trip, routingProvider);
    if (value) estimates.set(key, value);
  }));

  const solution = await solve(trip, bounds, destinations, durations, estimates, false);
  if (!solution) {
    const fitsWithoutMissingRoutes = await solve(trip, bounds, destinations, durations, estimates, true);
    return fitsWithoutMissingRoutes
      ? { ok: false, code: "unavailable-route", message: "No complete Travel route connects every required terminal, Accommodation, and Destination anchor." }
      : { ok: false, code: "insufficient-time", message: "The complete Itinerary does not fit within the Trip Boundaries and Daily windows." };
  }

  return {
    ok: true,
    itinerary: {
      inputRevision: trip.revision,
      days: solution.days.map((route, index) => scheduleDay(bounds[index], route, destinations, durations)),
      warnings: multiDay && !trip.accommodation
        ? [{ code: "missing-accommodation", message: "No Accommodation is set. Overnight repositioning is omitted, so each later day begins at its first Visit." }]
        : [],
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
