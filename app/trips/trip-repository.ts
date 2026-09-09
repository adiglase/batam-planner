import type { Destination } from "~/destinations/destination";
import type { TransportMode } from "~/routing/routing-provider";

export type SelectedDestination = Pick<
  Destination,
  "id" | "name" | "coordinates" | "typicalVisitMinutes" | "operationalStatus"
>;

export type AccommodationRef = Pick<
  Destination,
  "id" | "name" | "coordinates"
>;

export type PrimaryTransportMode = TransportMode;
export type ShortWalkMinutes = 0 | 5 | 10 | 15;
export type TripBoundary = { terminal: string; date: string; time: string };
export type DailyWindow = { date: string; start: string; end: string };
export type BoundaryKind = "arrival" | "departure";

export const SHORT_WALK_OPTIONS: readonly ShortWalkMinutes[] = [0, 5, 10, 15];
export const MAX_TRIP_DAYS = 4;
export const MAX_SELECTED_DESTINATIONS = 10;
export const DEFAULT_DAY_START = "09:00";
export const DEFAULT_DAY_END = "21:00";

export const TRANSPORT_MODES: readonly PrimaryTransportMode[] = [
  "car",
  "motorcycle",
  "walking",
] as const;

export function isPrimaryTransportMode(
  value: string,
): value is PrimaryTransportMode {
  return (TRANSPORT_MODES as readonly string[]).includes(value);
}

export type Trip = {
  id: string;
  name: string;
  destinations: SelectedDestination[];
  dates: { arrival?: string; departure?: string };
  boundaries: { arrival: TripBoundary; departure: TripBoundary };
  dailyWindows: DailyWindow[];
  accommodation: AccommodationRef | null;
  transportMode: PrimaryTransportMode | null;
  shortWalkMinutes: ShortWalkMinutes;
  visitDurationOverrides: Record<string, number>;
  destinationOrder: string[] | null;
  revision: number;
  itinerary: { inputRevision: number; [key: string]: unknown } | null;
};
export type TripCollection = { trips: Trip[]; activeTripId: string | null };
export const TRIPS_KEY = "batam-planner:trips:v1";
export const emptyCollection = (): TripCollection => ({
  trips: [],
  activeTripId: null,
});
export const tripStatus = (trip: Trip) =>
  !trip.itinerary
    ? "Draft"
    : trip.revision === trip.itinerary.inputRevision
      ? "Itinerary ready"
      : "Needs rebuilding";
export const reopeningSurface = (trip: Trip) =>
  trip.itinerary ? ("itinerary" as const) : ("trip" as const);
export function createTrip(id: string): Trip {
  return {
    id,
    name: "",
    destinations: [],
    dates: {},
    boundaries: {
      arrival: { terminal: "", date: "", time: "" },
      departure: { terminal: "", date: "", time: "" },
    },
    dailyWindows: [],
    accommodation: null,
    transportMode: null,
    shortWalkMinutes: 0,
    visitDurationOverrides: {},
    destinationOrder: null,
    revision: 0,
    itinerary: null,
  };
}
/**
 * A Destination is selectable as a Visit when it is Open. The Destination
 * assigned as the Trip's Accommodation is rejected separately by
 * `toggleDestination`, keeping only those two roles mutually exclusive.
 */
export function canSelect(destination: Destination) {
  return destination.operationalStatus === "Open";
}
/**
 * Any Open Published Accommodation-category Destination is eligible as
 * Accommodation. Temporarily closed Destinations cannot become
 * Accommodation, mirroring the Visit selection rule.
 */
export function canSetAsAccommodation(destination: Destination) {
  return (
    destination.primaryCategory === "Accommodation" &&
    destination.operationalStatus === "Open"
  );
}
/**
 * Whether the Destination is currently the Trip's Accommodation.
 * The Accommodation is never also a selected Visit.
 */
export function isAccommodation(
  trip: Pick<Trip, "accommodation">,
  id: string,
) {
  return trip.accommodation?.id === id;
}
export function setAccommodation(
  trip: Trip,
  destination: Destination,
  editing: boolean,
): Trip {
  if (!editing) return trip;
  if (!canSetAsAccommodation(destination)) return trip;
  if (isAccommodation(trip, destination.id)) return trip;
  const { id, name, coordinates } = destination;
  const visitDurationOverrides = { ...trip.visitDurationOverrides };
  delete visitDurationOverrides[id];
  return {
    ...trip,
    revision: trip.revision + 1,
    // Accommodation is distinct from Trip membership: the same Destination
    // can never be both the Accommodation and a selected Visit.
    destinations: trip.destinations.filter((item) => item.id !== id),
    destinationOrder: trip.destinationOrder?.filter((item) => item !== id) ?? null,
    visitDurationOverrides,
    accommodation: { id, name, coordinates },
  };
}
export function clearAccommodation(trip: Trip, editing: boolean): Trip {
  if (!editing) return trip;
  if (!trip.accommodation) return trip;
  return { ...trip, revision: trip.revision + 1, accommodation: null };
}
export function setTransportMode(
  trip: Trip,
  mode: PrimaryTransportMode,
  editing: boolean,
): Trip {
  if (!editing) return trip;
  if (!TRANSPORT_MODES.includes(mode)) return trip;
  if (trip.transportMode === mode) return trip;
  return { ...trip, revision: trip.revision + 1, transportMode: mode };
}

function dateAtUtc(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date
    ? null
    : parsed;
}

/** Inclusive Batam calendar dates, or an empty list for incomplete/unsupported boundaries. */
export function tripDayDates(trip: Pick<Trip, "boundaries">): string[] {
  const arrival = dateAtUtc(trip.boundaries.arrival.date);
  const departure = dateAtUtc(trip.boundaries.departure.date);
  if (!arrival || !departure || departure < arrival) return [];
  const days = Math.floor((departure.valueOf() - arrival.valueOf()) / 86_400_000) + 1;
  if (days > MAX_TRIP_DAYS) return [];
  return Array.from({ length: days }, (_, index) =>
    new Date(arrival.valueOf() + index * 86_400_000).toISOString().slice(0, 10),
  );
}

function windowsForBoundaries(trip: Trip) {
  const existing = new Map(trip.dailyWindows.map((window) => [window.date, window]));
  return tripDayDates(trip).map(
    (date) => existing.get(date) ?? { date, start: DEFAULT_DAY_START, end: DEFAULT_DAY_END },
  );
}

export function setBoundary(
  trip: Trip,
  kind: BoundaryKind,
  field: keyof TripBoundary,
  value: string,
): Trip {
  if (trip.boundaries[kind][field] === value) return trip;
  const next = {
    ...trip,
    revision: trip.revision + 1,
    boundaries: {
      ...trip.boundaries,
      [kind]: { ...trip.boundaries[kind], [field]: value },
    },
    dates:
      field === "date"
        ? { ...trip.dates, [kind]: value || undefined }
        : trip.dates,
  };
  return { ...next, dailyWindows: windowsForBoundaries(next) };
}

export function setShortWalkMinutes(trip: Trip, minutes: ShortWalkMinutes): Trip {
  if (!SHORT_WALK_OPTIONS.includes(minutes) || trip.shortWalkMinutes === minutes) return trip;
  return { ...trip, revision: trip.revision + 1, shortWalkMinutes: minutes };
}

export function setDailyWindow(
  trip: Trip,
  date: string,
  field: "start" | "end",
  value: string,
): Trip {
  const index = trip.dailyWindows.findIndex((window) => window.date === date);
  if (index < 0 || trip.dailyWindows[index][field] === value) return trip;
  return {
    ...trip,
    revision: trip.revision + 1,
    dailyWindows: trip.dailyWindows.map((window, current) =>
      current === index ? { ...window, [field]: value } : window,
    ),
  };
}

export function setVisitDuration(trip: Trip, id: string, minutes: number | null): Trip {
  if (!trip.destinations.some((destination) => destination.id === id)) return trip;
  const overrides = { ...trip.visitDurationOverrides };
  if (minutes === null) delete overrides[id];
  else if (Number.isInteger(minutes) && minutes > 0) overrides[id] = minutes;
  else return trip;
  if (overrides[id] === trip.visitDurationOverrides[id]) return trip;
  if (minutes === null && trip.visitDurationOverrides[id] === undefined) return trip;
  return { ...trip, revision: trip.revision + 1, visitDurationOverrides: overrides };
}

export function effectiveVisitMinutes(trip: Trip, id: string) {
  const destination = trip.destinations.find((item) => item.id === id);
  return trip.visitDurationOverrides[id] ?? destination?.typicalVisitMinutes;
}

export function moveDestination(trip: Trip, id: string, offset: -1 | 1): Trip {
  const order = trip.destinationOrder ?? trip.destinations.map((item) => item.id);
  const from = order.indexOf(id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= order.length) return trip;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return { ...trip, revision: trip.revision + 1, destinationOrder: next };
}

export function useCurrentDestinationOrder(trip: Trip): Trip {
  if (trip.destinationOrder !== null || trip.destinations.length < 2) return trip;
  return {
    ...trip,
    revision: trip.revision + 1,
    destinationOrder: trip.destinations.map((destination) => destination.id),
  };
}

export function optimizeDestinationOrder(trip: Trip): Trip {
  if (trip.destinationOrder === null) return trip;
  return { ...trip, revision: trip.revision + 1, destinationOrder: null };
}

export function toggleDestination(
  trip: Trip,
  destination: Destination,
  editing: boolean,
): Trip {
  if (!editing) return trip;
  // The Accommodation can never be a selected Visit.
  if (isAccommodation(trip, destination.id)) return trip;
  const selected = trip.destinations.some(({ id }) => id === destination.id);
  if (!selected && !canSelect(destination)) return trip;
  if (!selected && trip.destinations.length >= MAX_SELECTED_DESTINATIONS) return trip;
  const { id, name, coordinates, typicalVisitMinutes, operationalStatus } =
    destination;
  const destinations = selected
    ? trip.destinations.filter((item) => item.id !== id)
    : [
        ...trip.destinations,
        { id, name, coordinates, typicalVisitMinutes, operationalStatus },
      ];
  const visitDurationOverrides = { ...trip.visitDurationOverrides };
  if (selected) delete visitDurationOverrides[id];
  return {
    ...trip,
    revision: trip.revision + 1,
    destinations,
    visitDurationOverrides,
    destinationOrder:
      trip.destinationOrder === null
        ? null
        : selected
          ? trip.destinationOrder.filter((item) => item !== id)
          : [...trip.destinationOrder, id],
  };
}

export function removeSelectedDestination(trip: Trip, id: string): Trip {
  if (!trip.destinations.some((destination) => destination.id === id))
    return trip;
  const visitDurationOverrides = { ...trip.visitDurationOverrides };
  delete visitDurationOverrides[id];
  return {
    ...trip,
    revision: trip.revision + 1,
    destinations: trip.destinations.filter(
      (destination) => destination.id !== id,
    ),
    visitDurationOverrides,
    destinationOrder: trip.destinationOrder?.filter((item) => item !== id) ?? null,
  };
}

function isAccommodationRef(value: unknown): value is AccommodationRef {
  if (!value || typeof value !== "object") return false;
  const accommodation = value as AccommodationRef;
  return (
    typeof accommodation.id === "string" &&
    accommodation.id.length > 0 &&
    typeof accommodation.name === "string" &&
    !!accommodation.coordinates &&
    Number.isFinite(accommodation.coordinates.latitude) &&
    Number.isFinite(accommodation.coordinates.longitude)
  );
}

function isBoundary(value: unknown): value is TripBoundary {
  if (!value || typeof value !== "object") return false;
  const boundary = value as TripBoundary;
  return [boundary.terminal, boundary.date, boundary.time].every(
    (item) => typeof item === "string",
  );
}

function isTrip(value: unknown): value is Trip {
  if (!value || typeof value !== "object") return false;
  const t = value as Trip;
  return (
    typeof t.id === "string" &&
    t.id.length > 0 &&
    typeof t.name === "string" &&
    Number.isInteger(t.revision) &&
    t.revision >= 0 &&
    !!t.dates &&
    typeof t.dates === "object" &&
    [t.dates.arrival, t.dates.departure].every(
      (d) => d === undefined || typeof d === "string",
    ) &&
    (t.boundaries === undefined ||
      (!!t.boundaries &&
        isBoundary(t.boundaries.arrival) &&
        isBoundary(t.boundaries.departure))) &&
    (t.dailyWindows === undefined ||
      (Array.isArray(t.dailyWindows) &&
        t.dailyWindows.every(
          (window) =>
            window &&
            typeof window.date === "string" &&
            typeof window.start === "string" &&
            typeof window.end === "string",
        ))) &&
    // Planning fields were added progressively; older v1 Trips remain readable.
    (t.accommodation === null ||
      t.accommodation === undefined ||
      isAccommodationRef(t.accommodation)) &&
    (t.transportMode === null ||
      t.transportMode === undefined ||
      (TRANSPORT_MODES as readonly string[]).includes(t.transportMode)) &&
    (t.shortWalkMinutes === undefined ||
      SHORT_WALK_OPTIONS.includes(t.shortWalkMinutes)) &&
    (t.visitDurationOverrides === undefined ||
      (!!t.visitDurationOverrides &&
        typeof t.visitDurationOverrides === "object" &&
        Object.values(t.visitDurationOverrides).every(
          (minutes) => Number.isInteger(minutes) && minutes > 0,
        ))) &&
    (t.destinationOrder === undefined ||
      t.destinationOrder === null ||
      (Array.isArray(t.destinationOrder) &&
        t.destinationOrder.length === t.destinations.length &&
        new Set(t.destinationOrder).size === t.destinationOrder.length &&
        t.destinationOrder.every((id) =>
          t.destinations.some((destination) => destination.id === id),
        ))) &&
    (t.itinerary === null ||
      (!!t.itinerary &&
        typeof t.itinerary === "object" &&
        Number.isInteger(t.itinerary.inputRevision))) &&
    Array.isArray(t.destinations) &&
    t.destinations.every(
      (d) =>
        d &&
        typeof d.id === "string" &&
        typeof d.name === "string" &&
        !!d.coordinates &&
        Number.isFinite(d.coordinates.latitude) &&
        Number.isFinite(d.coordinates.longitude) &&
        (d.typicalVisitMinutes === undefined ||
          Number.isFinite(d.typicalVisitMinutes)) &&
        ["Open", "Temporarily closed"].includes(d.operationalStatus),
    ) &&
    new Set(t.destinations.map((d) => d.id)).size === t.destinations.length &&
    // The Accommodation is never also a selected Visit.
    !t.destinations.some((d) => d.id === t.accommodation?.id)
  );
}

/** Storage access is deferred and guarded, including browsers that throw on the getter. */
export class TripRepository {
  private readable = false;
  constructor(
    private storage: () => Pick<Storage, "getItem" | "setItem"> = () =>
      window.localStorage,
  ) {}
  load(): { collection: TripCollection; failed: boolean } {
    try {
      const raw = this.storage().getItem(TRIPS_KEY);
      if (raw === null) {
        this.readable = true;
        return { collection: emptyCollection(), failed: false };
      }
      const data = JSON.parse(raw);
      if (
        data.version !== 1 ||
        !Array.isArray(data.trips) ||
        !data.trips.every(isTrip) ||
        new Set(data.trips.map((t: Trip) => t.id)).size !== data.trips.length ||
        (data.trips.length === 0
          ? data.activeTripId !== null
          : !data.trips.some((t: Trip) => t.id === data.activeTripId))
      )
        throw new Error("Invalid Trip storage");
      this.readable = true;
      return {
        collection: {
          trips: data.trips.map((trip: Trip) => {
            const boundaries = trip.boundaries ?? {
              arrival: {
                terminal: "",
                date: trip.dates.arrival ?? "",
                time: "",
              },
              departure: {
                terminal: "",
                date: trip.dates.departure ?? "",
                time: "",
              },
            };
            const normalized = {
              ...trip,
              boundaries,
              dailyWindows: trip.dailyWindows ?? [],
              accommodation: trip.accommodation ?? null,
              transportMode: trip.transportMode ?? null,
              shortWalkMinutes: trip.shortWalkMinutes ?? 0,
              visitDurationOverrides: trip.visitDurationOverrides ?? {},
              destinationOrder: trip.destinationOrder ?? null,
            };
            return normalized.dailyWindows.length > 0
              ? normalized
              : { ...normalized, dailyWindows: windowsForBoundaries(normalized) };
          }),
          activeTripId: data.activeTripId,
        },
        failed: false,
      };
    } catch {
      // Never overwrite unreadable or unknown-version data with an empty collection.
      this.readable = false;
      return { collection: emptyCollection(), failed: true };
    }
  }
  save(collection: TripCollection): boolean {
    if (!this.readable) return false;
    try {
      this.storage().setItem(
        TRIPS_KEY,
        JSON.stringify({ version: 1, ...collection }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
