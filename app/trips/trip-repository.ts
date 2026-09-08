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

export const TRANSPORT_MODES: readonly PrimaryTransportMode[] = [
  "car",
  "motorcycle",
  "walking",
] as const;

export type Trip = {
  id: string;
  name: string;
  destinations: SelectedDestination[];
  dates: { arrival?: string; departure?: string };
  accommodation: AccommodationRef | null;
  transportMode: PrimaryTransportMode | null;
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
    accommodation: null,
    transportMode: null,
    revision: 0,
    itinerary: null,
  };
}
/**
 * A Destination is selectable as a Visit only when it is Open and not an
 * Accommodation-category Destination. Accommodation-category Destinations
 * can only serve as the Trip's Accommodation (see
 * `canSetAsAccommodation`): they omit Typical visit duration and Entry
 * cost, so scheduling them as Visits would misrepresent the Itinerary.
 */
export function canSelect(destination: Destination) {
  return (
    destination.operationalStatus === "Open" &&
    destination.primaryCategory !== "Accommodation"
  );
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
 * Whether the Destination currently anchors the Trip as Accommodation.
 * The anchor is never also a selected Visit.
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
  return {
    ...trip,
    revision: trip.revision + 1,
    // Accommodation is distinct from Trip membership: the same Destination
    // can never be both the anchor and a selected Visit.
    destinations: trip.destinations.filter((item) => item.id !== id),
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
export function toggleDestination(
  trip: Trip,
  destination: Destination,
  editing: boolean,
): Trip {
  if (!editing) return trip;
  // The Accommodation anchor can never be a selected Visit.
  if (isAccommodation(trip, destination.id)) return trip;
  const selected = trip.destinations.some(({ id }) => id === destination.id);
  if (!selected && !canSelect(destination)) return trip;
  const { id, name, coordinates, typicalVisitMinutes, operationalStatus } =
    destination;
  return {
    ...trip,
    revision: trip.revision + 1,
    destinations: selected
      ? trip.destinations.filter((item) => item.id !== id)
      : [
          ...trip.destinations,
          { id, name, coordinates, typicalVisitMinutes, operationalStatus },
        ],
  };
}

export function removeSelectedDestination(trip: Trip, id: string): Trip {
  if (!trip.destinations.some((destination) => destination.id === id))
    return trip;
  return {
    ...trip,
    revision: trip.revision + 1,
    destinations: trip.destinations.filter(
      (destination) => destination.id !== id,
    ),
  };
}

function isAccommodationRef(value: unknown): value is AccommodationRef {
  if (!value || typeof value !== "object") return false;
  const a = value as AccommodationRef;
  return (
    typeof a.id === "string" &&
    a.id.length > 0 &&
    typeof a.name === "string" &&
    !!a.coordinates &&
    Number.isFinite(a.coordinates.latitude) &&
    Number.isFinite(a.coordinates.longitude)
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
    // Accommodation and transport were added in issue #18; older stored
    // Trips without them remain readable and normalize to null on load.
    (t.accommodation === null ||
      t.accommodation === undefined ||
      isAccommodationRef(t.accommodation)) &&
    (t.transportMode === null ||
      t.transportMode === undefined ||
      (TRANSPORT_MODES as readonly string[]).includes(t.transportMode)) &&
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
    // The Accommodation anchor is never also a selected Visit.
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
          trips: data.trips.map((trip: Trip) => ({
            ...trip,
            accommodation: trip.accommodation ?? null,
            transportMode: trip.transportMode ?? null,
          })),
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
