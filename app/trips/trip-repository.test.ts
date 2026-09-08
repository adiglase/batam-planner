import { describe, expect, it } from "vitest";
import {
  canSelect,
  createTrip,
  reopeningSurface,
  removeSelectedDestination,
  toggleDestination,
  tripStatus,
  TripRepository,
  TRIPS_KEY,
} from "./trip-repository";
import type { Destination } from "~/destinations/destination";
const destination: Destination = {
  id: "beach",
  slug: "beach",
  name: "Beach",
  primaryCategory: "Nature & beaches",
  area: "",
  description: "",
  coordinates: { latitude: 1, longitude: 104 },
  operationalStatus: "Open",
  googleMapsUrl: "https://maps.google.com",
  typicalVisitMinutes: 60,
};
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
describe("browser-local Trips", () => {
  it("preserves multiple Trips and the active identity across a fresh repository", () => {
    const storage = memoryStorage();
    const repository = new TripRepository(() => storage);
    expect(repository.load().failed).toBe(false);
    const first = {
      ...toggleDestination(createTrip("first"), destination, true),
      name: "Weekend",
    };
    const second = createTrip("second");
    expect(
      repository.save({ trips: [first, second], activeTripId: second.id }),
    ).toBe(true);
    const reopened = new TripRepository(() => storage).load().collection;
    expect(reopened).toEqual({
      trips: [first, second],
      activeTripId: second.id,
    });
    expect(reopeningSurface(reopened.trips[1])).toBe("trip");
    expect(tripStatus(reopened.trips[1])).toBe("Draft");
    expect(reopened.trips[1].destinations).toEqual([]);
  });
  it("requires explicit edit mode and allows removing a now-closed Destination", () => {
    const trip = createTrip("trip");
    expect(toggleDestination(trip, destination, false)).toEqual(trip);
    const closed = {
      ...destination,
      operationalStatus: "Temporarily closed" as const,
    };
    expect(canSelect(closed)).toBe(false);
    expect(toggleDestination(trip, closed, true)).toEqual(trip);
    const selected = toggleDestination(trip, destination, true);
    expect(selected.destinations.map((d) => d.id)).toEqual([destination.id]);
    expect(toggleDestination(selected, closed, true).destinations).toEqual([]);
  });
  it("preserves the last Itinerary and restoration surface after a planning edit", () => {
    const trip = {
      ...createTrip("trip"),
      itinerary: { inputRevision: 0, visits: ["retained"] },
    };
    expect(tripStatus(trip)).toBe("Itinerary ready");
    const changed = toggleDestination(trip, destination, true);
    expect(tripStatus(changed)).toBe("Needs rebuilding");
    expect(changed.itinerary).toEqual(trip.itinerary);
    expect(reopeningSurface(changed)).toBe("itinerary");
    expect(tripStatus({ ...trip, name: "Renamed" })).toBe("Itinerary ready");
  });
  it("keeps an Itinerary ready when removing an unselected Destination", () => {
    const trip = {
      ...toggleDestination(createTrip("trip"), destination, true),
      itinerary: { inputRevision: 1, visits: [destination.id] },
    };
    const unchanged = removeSelectedDestination(trip, "not-selected");
    expect(tripStatus(unchanged)).toBe("Itinerary ready");
    expect(unchanged).toEqual(trip);
  });
  it("marks a real removal for rebuilding only once and preserves the Itinerary", () => {
    const trip = {
      ...toggleDestination(createTrip("trip"), destination, true),
      itinerary: { inputRevision: 1, visits: [destination.id] },
    };
    const removed = removeSelectedDestination(trip, destination.id);
    expect(removed.destinations).toEqual([]);
    expect(tripStatus(removed)).toBe("Needs rebuilding");
    expect(removed.itinerary).toEqual(trip.itinerary);
    expect(removeSelectedDestination(removed, destination.id)).toEqual(removed);
  });
  it.each([
    "bad json",
    JSON.stringify({ version: 2 }),
    JSON.stringify({
      version: 1,
      trips: [createTrip("one")],
      activeTripId: "missing",
    }),
    JSON.stringify({
      version: 1,
      trips: [{ ...createTrip("one"), destinations: [null] }],
      activeTripId: "one",
    }),
  ])("reports corrupt storage without overwriting it: %s", (raw) => {
    const storage = memoryStorage();
    storage.setItem(TRIPS_KEY, raw);
    const repository = new TripRepository(() => storage);
    expect(repository.load().failed).toBe(true);
    expect(
      repository.save({ trips: [createTrip("new")], activeTripId: "new" }),
    ).toBe(false);
    expect(storage.getItem(TRIPS_KEY)).toBe(raw);
  });
  it("reports unavailable and full storage without modifying in-page Trip data", () => {
    const unavailable = new TripRepository(() => {
      throw new Error("Denied");
    });
    expect(unavailable.load().failed).toBe(true);
    const full = new TripRepository(() => ({
      getItem: () => null,
      setItem: () => {
        throw new Error("Quota");
      },
    }));
    full.load();
    const trip = toggleDestination(createTrip("trip"), destination, true);
    expect(full.save({ trips: [trip], activeTripId: trip.id })).toBe(false);
    expect(trip.destinations).toHaveLength(1);
  });
});
