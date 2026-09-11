import type { Destination } from "~/destinations/destination";
import type { Itinerary } from "~/itineraries/itinerary-planner";
import type { TransportMode } from "~/routing/routing-provider";

export type SelectedDestination = Pick<
  Destination,
  "id" | "name" | "coordinates" | "typicalVisitMinutes" | "operationalStatus"
> & { availability: "Published" | "Archived" };

export type AccommodationRef = Pick<
  Destination,
  "id" | "name" | "coordinates" | "operationalStatus"
> & { availability: "Published" | "Archived" };

export type DestinationNotice = {
  destinationId: string;
  destinationName: string;
  reason: "Planning facts changed" | "Temporarily closed" | "Archived";
};

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
  itinerary: Itinerary | null;
  destinationNotices: DestinationNotice[];
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
export function storeBuiltItinerary(
  trip: Trip,
  itinerary: Itinerary,
): Trip {
  // A Build result is stale if inputs changed while routing was in flight.
  if (itinerary.inputRevision !== trip.revision) return trip;
  return { ...trip, itinerary, destinationNotices: [] };
}

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
    destinationNotices: [],
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
  const { id, name, coordinates, operationalStatus } = destination;
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
    accommodation: {
      id,
      name,
      coordinates,
      operationalStatus,
      availability: "Published",
    },
    destinationNotices: trip.destinationNotices.filter(
      (notice) =>
        notice.destinationId !== id &&
        notice.destinationId !== trip.accommodation?.id,
    ),
  };
}
export function clearAccommodation(trip: Trip, editing: boolean): Trip {
  if (!editing) return trip;
  if (!trip.accommodation) return trip;
  return {
    ...trip,
    revision: trip.revision + 1,
    accommodation: null,
    destinationNotices: trip.destinationNotices.filter(
      (notice) => notice.destinationId !== trip.accommodation!.id,
    ),
  };
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
        {
          id,
          name,
          coordinates,
          typicalVisitMinutes,
          operationalStatus,
          availability: "Published" as const,
        },
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
    destinationNotices: selected
      ? trip.destinationNotices.filter((notice) => notice.destinationId !== id)
      : trip.destinationNotices,
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
    destinationNotices: trip.destinationNotices.filter(
      (notice) => notice.destinationId !== id,
    ),
  };
}

function sameCoordinates(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
) {
  return left.latitude === right.latitude && left.longitude === right.longitude;
}

/**
 * Refreshes only planning-relevant Destination snapshots in browser-local
 * Trips. Visitor-content edits are deliberately absent from these snapshots,
 * so they cannot make an Itinerary stale.
 */
export function reconcileDestinationFacts(
  collection: TripCollection,
  publishedDestinations: readonly Destination[],
): TripCollection {
  const published = new Map(publishedDestinations.map((item) => [item.id, item]));
  let collectionChanged = false;
  const trips = collection.trips.map((trip) => {
    let planningChanged = false;
    let tripChanged = false;
    const nextNotices = new Map(
      (trip.destinationNotices ?? []).map((notice) => [notice.destinationId, notice]),
    );
    const destinations = trip.destinations.map((saved) => {
      const current = published.get(saved.id);
      if (!current) {
        if (saved.availability !== "Archived") planningChanged = true;
        if (saved.availability !== "Archived") tripChanged = true;
        nextNotices.set(saved.id, {
          destinationId: saved.id,
          destinationName: saved.name,
          reason: "Archived",
        });
        return { ...saved, availability: "Archived" as const };
      }
      const changed =
        saved.availability !== "Published" ||
        !sameCoordinates(saved.coordinates, current.coordinates) ||
        saved.typicalVisitMinutes !== current.typicalVisitMinutes ||
        saved.operationalStatus !== current.operationalStatus;
      if (!changed && saved.name === current.name) return saved;
      tripChanged = true;
      if (!changed) return { ...saved, name: current.name };
      planningChanged = true;
      nextNotices.set(saved.id, {
        destinationId: saved.id,
        destinationName: current.name,
        reason:
          current.operationalStatus === "Temporarily closed"
            ? "Temporarily closed"
            : "Planning facts changed",
      });
      return {
        id: current.id,
        name: current.name,
        coordinates: current.coordinates,
        typicalVisitMinutes: current.typicalVisitMinutes,
        operationalStatus: current.operationalStatus,
        availability: "Published" as const,
      };
    });

    let accommodation = trip.accommodation;
    if (accommodation) {
      const current = published.get(accommodation.id);
      if (!current) {
        if (accommodation.availability !== "Archived") planningChanged = true;
        if (accommodation.availability !== "Archived") tripChanged = true;
        nextNotices.set(accommodation.id, {
          destinationId: accommodation.id,
          destinationName: accommodation.name,
          reason: "Archived",
        });
        accommodation = { ...accommodation, availability: "Archived" };
      } else {
        const changed =
          accommodation.availability !== "Published" ||
          !sameCoordinates(accommodation.coordinates, current.coordinates) ||
          accommodation.operationalStatus !== current.operationalStatus;
        if (changed || accommodation.name !== current.name) {
          tripChanged = true;
          if (!changed) {
            accommodation = { ...accommodation, name: current.name };
          } else {
          planningChanged = true;
          nextNotices.set(accommodation.id, {
            destinationId: accommodation.id,
            destinationName: current.name,
            reason:
              current.operationalStatus === "Temporarily closed"
                ? "Temporarily closed"
                : "Planning facts changed",
          });
          accommodation = {
            id: current.id,
            name: current.name,
            coordinates: current.coordinates,
            operationalStatus: current.operationalStatus,
            availability: "Published",
          };
          }
        }
      }
    }
    if (!tripChanged) return trip;
    collectionChanged = true;
    return {
      ...trip,
      destinations,
      accommodation,
      revision: trip.revision + (planningChanged ? 1 : 0),
      destinationNotices: [...nextNotices.values()],
    };
  });
  return collectionChanged ? { ...collection, trips } : collection;
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
    Number.isFinite(accommodation.coordinates.longitude) &&
    (accommodation.operationalStatus === undefined ||
      ["Open", "Temporarily closed"].includes(accommodation.operationalStatus)) &&
    (accommodation.availability === undefined ||
      ["Published", "Archived"].includes(accommodation.availability))
  );
}

function isDestinationNotice(value: unknown): value is DestinationNotice {
  if (!value || typeof value !== "object") return false;
  const notice = value as DestinationNotice;
  return (
    typeof notice.destinationId === "string" &&
    typeof notice.destinationName === "string" &&
    ["Planning facts changed", "Temporarily closed", "Archived"].includes(
      notice.reason,
    )
  );
}

function isItineraryEntry(entry: any) {
  if (
    !entry ||
    typeof entry !== "object" ||
    !Number.isFinite(entry.startSeconds) ||
    !Number.isFinite(entry.endSeconds) ||
    entry.endSeconds < entry.startSeconds
  ) return false;
  if (entry.kind === "visit") {
    return (
      typeof entry.destinationId === "string" &&
      typeof entry.destinationName === "string" &&
      Number.isInteger(entry.durationMinutes) &&
      entry.durationMinutes > 0
    );
  }
  return (
    entry.kind === "travel" &&
    !!entry.origin &&
    typeof entry.origin.name === "string" &&
    !!entry.destination &&
    typeof entry.destination.name === "string" &&
    !!entry.estimate &&
    Number.isFinite(entry.estimate.distanceMeters) &&
    Number.isFinite(entry.estimate.durationSeconds) &&
    TRANSPORT_MODES.includes(entry.estimate.mode) &&
    (entry.estimate.warnings === undefined ||
      (Array.isArray(entry.estimate.warnings) &&
        entry.estimate.warnings.every(
          (warning: any) =>
            warning &&
            (warning.code === "walking-route-limitations" ||
              warning.code === "two-wheel-route-limitations") &&
            typeof warning.message === "string",
        ))) &&
    Array.isArray(entry.estimate.geometry) &&
    entry.estimate.geometry.every(
      (point: any) =>
        point &&
        Number.isFinite(point.latitude) &&
        Number.isFinite(point.longitude),
    )
  );
}

function isItineraryDay(day: any) {
  return (
    day &&
    typeof day.date === "string" &&
    Number.isFinite(day.startSeconds) &&
    Number.isFinite(day.endSeconds) &&
    day.endSeconds >= day.startSeconds &&
    Array.isArray(day.entries) &&
    day.entries.every(isItineraryEntry)
  );
}

function isItinerary(value: unknown): value is Itinerary {
  if (!value || typeof value !== "object") return false;
  const itinerary = value as Itinerary;
  return (
    Number.isInteger(itinerary.inputRevision) &&
    Array.isArray(itinerary.days) &&
    itinerary.days.length >= 1 &&
    itinerary.days.length <= MAX_TRIP_DAYS &&
    itinerary.days.every(isItineraryDay) &&
    Array.isArray(itinerary.warnings) &&
    itinerary.warnings.every(
      (warning) =>
        warning?.code === "missing-accommodation" &&
        typeof warning.message === "string",
    )
  );
}

function isLegacySameDayItinerary(value: any) {
  return (
    value &&
    Number.isInteger(value.inputRevision) &&
    typeof value.date === "string" &&
    Number.isFinite(value.startSeconds) &&
    Number.isFinite(value.endSeconds) &&
    Array.isArray(value.entries) &&
    value.entries.every(isItineraryEntry)
  );
}

function normalizeItinerary(value: any): Itinerary | null {
  if (value === null) return null;
  const itinerary = isItinerary(value)
    ? value
    : {
        inputRevision: value.inputRevision,
        days: [{
          date: value.date,
          startSeconds: value.startSeconds,
          endSeconds: value.endSeconds,
          entries: value.entries,
        }],
        warnings: [],
      };
  return {
    ...itinerary,
    days: itinerary.days.map((day: any) => ({
      ...day,
      entries: day.entries.map((entry: any) =>
        entry.kind === "travel"
          ? {
              ...entry,
              estimate: {
                ...entry.estimate,
                // Trips saved before Travel warnings were introduced remain readable.
                warnings: entry.estimate.warnings ?? [],
              },
            }
          : entry,
      ),
    })),
  };
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
    (t.itinerary === null || isItinerary(t.itinerary) || isLegacySameDayItinerary(t.itinerary)) &&
    (t.destinationNotices === undefined ||
      (Array.isArray(t.destinationNotices) &&
        t.destinationNotices.every(isDestinationNotice))) &&
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
        ["Open", "Temporarily closed"].includes(d.operationalStatus) &&
        (d.availability === undefined ||
          ["Published", "Archived"].includes(d.availability)),
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
              itinerary: normalizeItinerary(trip.itinerary),
              destinationNotices: trip.destinationNotices ?? [],
            };
            normalized.destinations = normalized.destinations.map((destination) => ({
              ...destination,
              availability: destination.availability ?? "Published",
            }));
            if (normalized.accommodation) {
              normalized.accommodation = {
                ...normalized.accommodation,
                operationalStatus:
                  normalized.accommodation.operationalStatus ?? "Open",
                availability:
                  normalized.accommodation.availability ?? "Published",
              };
            }
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
      const storage = this.storage();
      const serialized = JSON.stringify({ version: 1, ...collection });
      storage.setItem(TRIPS_KEY, serialized);
      // Some privacy/storage implementations accept writes without retaining
      // them. A save is successful only when the exact envelope is readable.
      return storage.getItem(TRIPS_KEY) === serialized;
    } catch {
      return false;
    }
  }
}
