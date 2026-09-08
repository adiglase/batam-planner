import type { Destination } from "~/destinations/destination";

export type SelectedDestination = Pick<
  Destination,
  "id" | "name" | "coordinates" | "typicalVisitMinutes" | "operationalStatus"
>;
export type Trip = {
  id: string;
  name: string;
  destinations: SelectedDestination[];
  dates: { arrival?: string; departure?: string };
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
    revision: 0,
    itinerary: null,
  };
}
export function canSelect(destination: Destination) {
  return destination.operationalStatus === "Open";
}
export function toggleDestination(
  trip: Trip,
  destination: Destination,
  editing: boolean,
): Trip {
  if (!editing) return trip;
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
    new Set(t.destinations.map((d) => d.id)).size === t.destinations.length
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
        collection: { trips: data.trips, activeTripId: data.activeTripId },
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
