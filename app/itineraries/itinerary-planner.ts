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
  | "excess-destination-count"
  | "unsupported-trip-length"
  | "ineligible-destination"
  | "unavailable-route"
  | "insufficient-time";

export type BuildAction = {
  label: string;
  targetId: string;
};

export type BuildFailure = {
  ok: false;
  code: BuildFailureCode;
  message: string;
  requirements?: BuildAction[];
  suggestions: BuildAction[];
};

export type BuildItineraryResult =
  | { ok: true; itinerary: Itinerary }
  | BuildFailure;

function dateAtUtc(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

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
  firstVisitStartSeconds: number | null;
  lastVisitEndSeconds: number | null;
  leadingTravelSeconds: number;
  trailingTravelSeconds: number;
  identity: string;
};

type Candidate = {
  days: DayRoute[];
  travelSeconds: number;
  openSeconds: number;
  visitCompletion: number;
  lastVisitEnd: number | null;
  trailingTravelSeconds: number;
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

function betterDayRoute(
  candidate: DayRoute,
  current: DayRoute | undefined,
  finalVisits: boolean,
) {
  return (
    !current ||
    candidate.travelSeconds < current.travelSeconds ||
    (candidate.travelSeconds === current.travelSeconds &&
      ((finalVisits &&
        candidate.lastVisitEndSeconds! < current.lastVisitEndSeconds!) ||
        ((!finalVisits ||
          candidate.lastVisitEndSeconds === current.lastVisitEndSeconds) &&
          candidate.identity < current.identity)))
  );
}

function betterCandidate(
  candidate: Candidate,
  current: Candidate | undefined,
  complete: boolean,
) {
  if (!current) return true;
  if (candidate.travelSeconds !== current.travelSeconds) {
    return candidate.travelSeconds < current.travelSeconds;
  }
  if (!complete) {
    // A later Visit adds its start to this continuation score. Retaining the
    // lowest score preserves the globally least open time without enumerating
    // every earlier day allocation.
    const continuationScore = (item: Candidate) =>
      item.lastVisitEnd === null
        ? 0
        : item.openSeconds - item.lastVisitEnd - item.trailingTravelSeconds;
    const candidateScore = continuationScore(candidate);
    const currentScore = continuationScore(current);
    return (
      candidateScore < currentScore ||
      (candidateScore === currentScore && candidate.identity < current.identity)
    );
  }
  return (
    candidate.openSeconds < current.openSeconds ||
    (candidate.openSeconds === current.openSeconds &&
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
  finalVisits: boolean,
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
        firstVisitStartSeconds: null,
        lastVisitEndSeconds: null,
        leadingTravelSeconds: 0,
        trailingTravelSeconds: 0,
        identity: "",
      };
    }
    return {
      destinationIndexes: [],
      estimates: [],
      anchors: [],
      durationSeconds: 0,
      travelSeconds: 0,
      firstVisitStartSeconds: null,
      lastVisitEndSeconds: null,
      leadingTravelSeconds: 0,
      trailingTravelSeconds: 0,
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
    const durationSeconds =
      travelSeconds + order.reduce((total, index) => total + durations[index] * 60, 0);
    const leadingTravelSeconds = bounds.startAnchor
      ? routeEstimates[0].durationSeconds
      : 0;
    const trailingTravelSeconds = bounds.endAnchor
      ? routeEstimates.at(-1)!.durationSeconds
      : 0;
    return {
      destinationIndexes: order,
      estimates: routeEstimates,
      anchors: routeAnchors,
      travelSeconds,
      durationSeconds,
      firstVisitStartSeconds: bounds.startSeconds + leadingTravelSeconds,
      lastVisitEndSeconds:
        bounds.startSeconds + durationSeconds - trailingTravelSeconds,
      leadingTravelSeconds,
      trailingTravelSeconds,
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
    if (candidate && betterDayRoute(candidate, best, finalVisits)) best = candidate;
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
  const cachedRoute = (
    dayIndex: number,
    dayMask: number,
    finalVisits: boolean,
  ) => {
    const key = `${dayIndex}:${dayMask}:${finalVisits}`;
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
          finalVisits,
          allowMissing,
          trip,
        ),
      );
    }
    return routeCache.get(key)!;
  };
  let states = new Map<number, Candidate>([[0, {
    days: [],
    travelSeconds: 0,
    openSeconds: 0,
    visitCompletion: 0,
    lastVisitEnd: null,
    trailingTravelSeconds: 0,
    identity: "",
  }]]);
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
          const nextMask = usedMask | dayMask;
          const route = cachedRoute(
            dayIndex,
            dayMask,
            nextMask === completeMask,
          );
          if (route && route.durationSeconds <= bounds[dayIndex].endSeconds - bounds[dayIndex].startSeconds) {
            const firstVisitStart = route.firstVisitStartSeconds === null
              ? null
              : dayIndex * 86_400 + route.firstVisitStartSeconds;
            const lastVisitEnd = route.lastVisitEndSeconds === null
              ? current.lastVisitEnd
              : dayIndex * 86_400 + route.lastVisitEndSeconds;
            // Open time is the elapsed gap between Visits after excluding the
            // Travel to and from the applicable day anchors.
            const openSeconds =
              firstVisitStart === null || current.lastVisitEnd === null
                ? current.openSeconds
                : current.openSeconds + Math.max(
                    0,
                    firstVisitStart -
                      current.lastVisitEnd -
                      current.trailingTravelSeconds -
                      route.leadingTravelSeconds,
                  );
            const visitCompletion = lastVisitEnd ?? current.visitCompletion;
            const candidate: Candidate = {
              days: [...current.days, route],
              travelSeconds: current.travelSeconds + route.travelSeconds,
              openSeconds,
              visitCompletion: Math.max(current.visitCompletion, visitCompletion),
              lastVisitEnd,
              trailingTravelSeconds:
                route.lastVisitEndSeconds === null
                  ? current.trailingTravelSeconds
                  : route.trailingTravelSeconds,
              identity: `${current.identity}|${route.identity}`,
            };
            if (
              betterCandidate(
                candidate,
                nextStates.get(nextMask),
                nextMask === completeMask,
              )
            ) nextStates.set(nextMask, candidate);
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
  const missing: BuildAction[] = [];
  if (trip.destinations.length === 0) {
    missing.push({ label: "Choose at least one Destination", targetId: "choose-destinations" });
  }
  for (const kind of ["arrival", "departure"] as const) {
    const label = kind === "arrival" ? "Arrival" : "Departure";
    const boundary = trip.boundaries[kind];
    if (!boundary.terminal) missing.push({ label: `Choose ${kind === "arrival" ? "an" : "a"} ${label.toLowerCase()} ferry terminal`, targetId: `${kind}-terminal` });
    if (!boundary.date) missing.push({ label: `Set the ${label.toLowerCase()} date`, targetId: `${kind}-date` });
    if (!boundary.time) missing.push({ label: `Set the ${label.toLowerCase()} time`, targetId: `${kind}-time` });
  }
  if (!trip.transportMode) {
    missing.push({ label: "Choose Primary transport", targetId: "primary-transport-car" });
  }
  for (const destination of trip.destinations) {
    const minutes = effectiveVisitMinutes(trip, destination.id);
    if (!Number.isInteger(minutes) || minutes! <= 0) {
      missing.push({ label: `Set a Visit duration for ${destination.name}`, targetId: `visit-duration-${destination.id}` });
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      code: "missing-input",
      message: "Complete these Trip inputs before building. Nothing has been changed.",
      requirements: missing,
      suggestions: [],
    };
  }

  // Failure priority is stable: structural limits, Published eligibility,
  // route availability, then usable time. One Build always names one blocker.
  if (trip.destinations.length > MAX_SELECTED_DESTINATIONS) {
    return {
      ok: false,
      code: "excess-destination-count",
      message: `${trip.destinations.length} Destinations are selected; a Trip supports at most ${MAX_SELECTED_DESTINATIONS}.`,
      suggestions: [{ label: `Remove ${trip.destinations.length - MAX_SELECTED_DESTINATIONS} Destination${trip.destinations.length - MAX_SELECTED_DESTINATIONS === 1 ? "" : "s"}`, targetId: `remove-destination-${trip.destinations.at(-1)!.id}` }],
    };
  }

  const arrivalDate = dateAtUtc(trip.boundaries.arrival.date);
  const departureDate = dateAtUtc(trip.boundaries.departure.date);
  const dayCount = arrivalDate && departureDate
    ? Math.floor((departureDate.valueOf() - arrivalDate.valueOf()) / 86_400_000) + 1
    : 0;
  if (!arrivalDate || !departureDate || dayCount < 1 || dayCount > 4) {
    const detail = dayCount > 4
      ? `The Trip spans ${dayCount} Batam calendar days; only one through four are supported.`
      : "The departure date must be on or after the arrival date, forming one through four Batam calendar days.";
    return {
      ok: false,
      code: "unsupported-trip-length",
      message: detail,
      suggestions: [
        { label: "Change the arrival date", targetId: "arrival-date" },
        { label: "Change the departure date", targetId: "departure-date" },
      ],
    };
  }
  const dates = tripDayDates(trip);
  const arrivalTerminal = findFerryTerminal(trip.boundaries.arrival.terminal);
  const departureTerminal = findFerryTerminal(trip.boundaries.departure.terminal);
  const arrivalSeconds = timeToSeconds(trip.boundaries.arrival.time);
  const departureSeconds = timeToSeconds(trip.boundaries.departure.time);
  const invalidBoundaryRequirements: BuildAction[] = [];
  if (!arrivalTerminal) invalidBoundaryRequirements.push({ label: "Choose a supported arrival ferry terminal", targetId: "arrival-terminal" });
  if (!departureTerminal) invalidBoundaryRequirements.push({ label: "Choose a supported departure ferry terminal", targetId: "departure-terminal" });
  if (arrivalSeconds === null) invalidBoundaryRequirements.push({ label: "Set a valid arrival time", targetId: "arrival-time" });
  if (departureSeconds === null) invalidBoundaryRequirements.push({ label: "Set a valid departure time", targetId: "departure-time" });
  const windows = dates.map((date) => trip.dailyWindows.find((window) => window.date === date));
  const parsedWindows = windows.map((window) => window ? [timeToSeconds(window.start), timeToSeconds(window.end)] as const : [null, null] as const);
  parsedWindows.forEach(([start, end], index) => {
    if (start === null || end === null || start >= end) {
      invalidBoundaryRequirements.push({ label: `Set a valid Daily window for ${dates[index]}`, targetId: `day-${dates[index]}-start` });
    }
  });
  if (invalidBoundaryRequirements.length > 0) {
    return {
      ok: false,
      code: "missing-input",
      message: "Correct these Trip inputs before building. Nothing has been changed.",
      requirements: invalidBoundaryRequirements,
      suggestions: [],
    };
  }

  const publishedStatuses = new Map(publishedDestinations.map(({ id, operationalStatus }) => [id, operationalStatus]));
  const blocked = trip.destinations.find(({ id }) => publishedStatuses.get(id) !== "Open");
  if (blocked) return {
    ok: false,
    code: "ineligible-destination",
    message: `${blocked.name} is not currently eligible for a Visit.`,
    suggestions: [{ label: `Remove ${blocked.name}`, targetId: `remove-destination-${blocked.id}` }],
  };

  const destinations = trip.destinationOrder
    ? trip.destinationOrder.map((id) => trip.destinations.find((destination) => destination.id === id)!)
    : [...trip.destinations];
  const durations = destinations.map((destination) => effectiveVisitMinutes(trip, destination.id)!);

  const arrivalAnchor = terminalAnchor(arrivalTerminal!.name, arrivalTerminal!.coordinates);
  const departureAnchor = terminalAnchor(departureTerminal!.name, departureTerminal!.coordinates);
  const accommodationAnchor = trip.accommodation ? destinationAnchor({ ...trip.accommodation, typicalVisitMinutes: undefined, operationalStatus: "Open" }) : null;
  const multiDay = dates.length > 1;
  const bounds: DayBounds[] = dates.map((date, index) => {
    const [windowStart, windowEnd] = parsedWindows[index] as readonly [number, number];
    const first = index === 0;
    const last = index === dates.length - 1;
    return {
      date,
      startSeconds: first ? Math.max(windowStart, arrivalSeconds!) : windowStart,
      endSeconds: last ? Math.min(windowEnd, departureSeconds!) : windowEnd,
      startAnchor: first ? arrivalAnchor : multiDay ? accommodationAnchor : null,
      endAnchor: last ? departureAnchor : multiDay ? accommodationAnchor : null,
    };
  });
  const unusableDay = bounds.find((day) => day.startSeconds > day.endSeconds);
  if (unusableDay) {
    return {
      ok: false,
      code: "insufficient-time",
      message: `${unusableDay.date} has no usable time where its Daily window and Trip Boundaries overlap.`,
      suggestions: [
        { label: `Widen the Daily window for ${unusableDay.date}`, targetId: `day-${unusableDay.date}-start` },
        { label: "Change the Trip Boundaries", targetId: "arrival-time" },
      ],
    };
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
    if (fitsWithoutMissingRoutes) {
      const missingLeg = fitsWithoutMissingRoutes.days
        .flatMap((day) => day.anchors.slice(0, -1).map((origin, index) => [origin, day.anchors[index + 1]] as const))
        .find(([origin, destination]) => !estimates.has(estimateKey(origin, destination)));
      const routeMessage = missingLeg
        ? `Travel from ${missingLeg[0].name} to ${missingLeg[1].name} is unavailable using ${trip.transportMode}.`
        : `A required Travel route is unavailable using ${trip.transportMode}.`;
      return {
        ok: false,
        code: "unavailable-route",
        message: routeMessage,
        suggestions: [
          { label: "Choose different Primary transport", targetId: "primary-transport-car" },
          { label: "Change the Trip Boundaries", targetId: "arrival-terminal" },
          { label: "Remove a Destination", targetId: `remove-destination-${destinations.at(-1)!.id}` },
        ],
      };
    }
    const usableMinutes = Math.floor(bounds.reduce(
      (total, day) => total + Math.max(0, day.endSeconds - day.startSeconds),
      0,
    ) / 60);
    const visitMinutes = durations.reduce((total, minutes) => total + minutes, 0);
    return {
      ok: false,
      code: "insufficient-time",
      message: `The selected Visits need ${visitMinutes} minutes before Travel, with ${usableMinutes} usable minutes across the Trip Boundaries and Daily windows. No complete Itinerary fits.`,
      suggestions: [
        { label: "Shorten a Visit", targetId: `visit-duration-${destinations[0].id}` },
        { label: "Widen a Daily window", targetId: `day-${dates[0]}-start` },
        { label: "Choose different Primary transport", targetId: "primary-transport-car" },
        { label: "Change the Trip Boundaries", targetId: "departure-time" },
        { label: "Remove a Destination", targetId: `remove-destination-${destinations.at(-1)!.id}` },
      ],
    };
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
