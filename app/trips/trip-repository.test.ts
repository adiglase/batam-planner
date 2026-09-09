import { describe, expect, it } from "vitest";
import {
  canSelect,
  canSetAsAccommodation,
  clearAccommodation,
  createTrip,
  effectiveVisitMinutes,
  moveDestination,
  optimizeDestinationOrder,
  reopeningSurface,
  removeSelectedDestination,
  setAccommodation,
  setBoundary,
  setDailyWindow,
  setShortWalkMinutes,
  setTransportMode,
  setVisitDuration,
  storeBuiltItinerary,
  toggleDestination,
  tripDayDates,
  tripStatus,
  useCurrentDestinationOrder,
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
const accommodation: Destination = {
  id: "harris",
  slug: "harris",
  name: "Harris Hotel Batam Center",
  primaryCategory: "Accommodation",
  area: "Batam Center",
  description: "",
  coordinates: { latitude: 1.13, longitude: 104.01 },
  operationalStatus: "Open",
  googleMapsUrl: "https://maps.google.com",
};
function itinerary(inputRevision: number) {
  return {
    inputRevision,
    date: "2026-06-01",
    startSeconds: 32_400,
    endSeconds: 32_400,
    entries: [],
  };
}
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
  it("stores a complete Build atomically and rejects a stale result", () => {
    const trip = createTrip("trip");
    const built = itinerary(trip.revision);
    expect(storeBuiltItinerary(trip, built).itinerary).toEqual(built);
    expect(storeBuiltItinerary({ ...trip, revision: 1 }, built).itinerary).toBeNull();
  });
  it("preserves the last Itinerary and restoration surface after a planning edit", () => {
    const trip = {
      ...createTrip("trip"),
      itinerary: itinerary(0),
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
      itinerary: itinerary(1),
    };
    const unchanged = removeSelectedDestination(trip, "not-selected");
    expect(tripStatus(unchanged)).toBe("Itinerary ready");
    expect(unchanged).toEqual(trip);
  });
  it("marks a real removal for rebuilding only once and preserves the Itinerary", () => {
    const trip = {
      ...toggleDestination(createTrip("trip"), destination, true),
      itinerary: itinerary(1),
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

describe("progressive Trip constraints", () => {
  it("creates one through four Batam days with independent default Daily windows", () => {
    let trip = setBoundary(createTrip("trip"), "arrival", "date", "2026-06-01");
    trip = setBoundary(trip, "departure", "date", "2026-06-04");
    expect(tripDayDates(trip)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
    ]);
    expect(trip.dailyWindows).toEqual(
      tripDayDates(trip).map((date) => ({ date, start: "09:00", end: "21:00" })),
    );
    const changed = setDailyWindow(trip, "2026-06-02", "start", "10:30");
    expect(changed.dailyWindows[0].start).toBe("09:00");
    expect(changed.dailyWindows[1].start).toBe("10:30");

    const tooLong = setBoundary(changed, "departure", "date", "2026-06-05");
    expect(tripDayDates(tooLong)).toEqual([]);
  });

  it("records both ferry boundaries, Primary transport, and short-walk tolerance", () => {
    let trip = createTrip("trip");
    trip = setBoundary(trip, "arrival", "terminal", "Batam Centre");
    trip = setBoundary(trip, "arrival", "time", "08:45");
    trip = setBoundary(trip, "departure", "terminal", "Harbour Bay");
    trip = setBoundary(trip, "departure", "time", "19:30");
    trip = setTransportMode(trip, "car", true);
    trip = setShortWalkMinutes(trip, 10);
    expect(trip.boundaries.arrival).toMatchObject({ terminal: "Batam Centre", time: "08:45" });
    expect(trip.boundaries.departure).toMatchObject({ terminal: "Harbour Bay", time: "19:30" });
    expect(trip.transportMode).toBe("car");
    expect(trip.shortWalkMinutes).toBe(10);
  });

  it("uses Typical visit duration until overridden and removes stale overrides", () => {
    const selected = toggleDestination(createTrip("trip"), destination, true);
    expect(effectiveVisitMinutes(selected, destination.id)).toBe(60);
    const overridden = setVisitDuration(selected, destination.id, 95);
    expect(effectiveVisitMinutes(overridden, destination.id)).toBe(95);
    const reset = setVisitDuration(overridden, destination.id, null);
    expect(effectiveVisitMinutes(reset, destination.id)).toBe(60);
    expect(removeSelectedDestination(overridden, destination.id).visitDurationOverrides).toEqual({});
  });

  it("makes manual Destination order explicit and Optimize order removes it", () => {
    const second = { ...destination, id: "spa", name: "Spa" };
    let trip = toggleDestination(createTrip("trip"), destination, true);
    trip = toggleDestination(trip, second, true);
    const currentOrder = useCurrentDestinationOrder(trip);
    expect(currentOrder.destinationOrder).toEqual([destination.id, second.id]);
    const ordered = moveDestination(currentOrder, second.id, -1);
    expect(ordered.destinationOrder).toEqual([second.id, destination.id]);
    expect(optimizeDestinationOrder(ordered).destinationOrder).toBeNull();
  });

  it("enforces the ten-Destination selection limit without changing revision", () => {
    let trip = createTrip("trip");
    for (let index = 0; index < 10; index += 1) {
      trip = toggleDestination(
        trip,
        { ...destination, id: `destination-${index}`, name: `Destination ${index}` },
        true,
      );
    }
    const unchanged = toggleDestination(
      trip,
      { ...destination, id: "eleventh", name: "Eleventh" },
      true,
    );
    expect(unchanged).toBe(trip);
    expect(unchanged.destinations).toHaveLength(10);
  });

  it("persists all progressive constraints without creating an Itinerary", () => {
    const storage = memoryStorage();
    const repository = new TripRepository(() => storage);
    repository.load();
    let trip = toggleDestination(createTrip("trip"), destination, true);
    trip = setBoundary(trip, "arrival", "date", "2026-07-01");
    trip = setBoundary(trip, "departure", "date", "2026-07-02");
    trip = setDailyWindow(trip, "2026-07-02", "end", "18:00");
    trip = setVisitDuration(trip, destination.id, 75);
    trip = setShortWalkMinutes(trip, 5);
    repository.save({ trips: [trip], activeTripId: trip.id });
    const reopened = new TripRepository(() => storage).load().collection.trips[0];
    expect(reopened).toEqual(trip);
    expect(reopened.itinerary).toBeNull();
  });
});

describe("Accommodation and Primary transport", () => {
  it("starts with no Accommodation and no transport", () => {
    const trip = createTrip("trip");
    expect(trip.accommodation).toBeNull();
    expect(trip.transportMode).toBeNull();
  });
  it("sets any Open Accommodation-category Destination as Accommodation", () => {
    const trip = setAccommodation(createTrip("trip"), accommodation, true);
    expect(trip.accommodation).toEqual({
      id: accommodation.id,
      name: accommodation.name,
      coordinates: accommodation.coordinates,
    });
    expect(trip.revision).toBe(1);
  });
  it("refuses Accommodation without edit mode, when closed, or for non-Accommodation Destinations", () => {
    const trip = createTrip("trip");
    expect(setAccommodation(trip, accommodation, false)).toEqual(trip);
    expect(
      setAccommodation(
        trip,
        { ...accommodation, operationalStatus: "Temporarily closed" },
        true,
      ),
    ).toEqual(trip);
    expect(setAccommodation(trip, destination, true)).toEqual(trip);
    expect(canSetAsAccommodation(accommodation)).toBe(true);
    expect(canSetAsAccommodation(destination)).toBe(false);
  });
  it("keeps Accommodation distinct from selected Visits in both directions", () => {
    expect(canSelect(accommodation)).toBe(true);
    const withVisit = toggleDestination(createTrip("trip"), destination, true);
    const withAccommodation = setAccommodation(
      withVisit,
      accommodation,
      true,
    );
    expect(withAccommodation.accommodation?.id).toBe(accommodation.id);
    expect(withAccommodation.destinations.map((d) => d.id)).toEqual([
      destination.id,
    ]);

    const accommodationVisit = toggleDestination(
      createTrip("stay"),
      accommodation,
      true,
    );
    expect(accommodationVisit.destinations[0]?.id).toBe(accommodation.id);
    const assignedAccommodation = setAccommodation(
      accommodationVisit,
      accommodation,
      true,
    );
    expect(assignedAccommodation.destinations).toEqual([]);
    expect(assignedAccommodation.accommodation?.id).toBe(accommodation.id);
    const visitBlocked = toggleDestination(
      withAccommodation,
      accommodation,
      true,
    );
    expect(visitBlocked).toEqual(withAccommodation);
  });
  it("changes Accommodation and clears it explicitly", () => {
    const first = setAccommodation(createTrip("trip"), accommodation, true);
    const other = { ...accommodation, id: "other", name: "Other Stay" };
    const changed = setAccommodation(first, other, true);
    expect(changed.accommodation?.id).toBe("other");
    expect(changed.revision).toBe(2);
    expect(setAccommodation(changed, other, true)).toEqual(changed);
    const cleared = clearAccommodation(changed, true);
    expect(cleared.accommodation).toBeNull();
    expect(cleared.revision).toBe(3);
    expect(clearAccommodation(cleared, true)).toEqual(cleared);
    expect(clearAccommodation(changed, false)).toEqual(changed);
  });
  it("records Primary transport and marks the Itinerary for rebuilding", () => {
    const trip = {
      ...createTrip("trip"),
      itinerary: itinerary(0),
    };
    expect(tripStatus(trip)).toBe("Itinerary ready");
    const withTransport = setTransportMode(trip, "car", true);
    expect(withTransport.transportMode).toBe("car");
    expect(tripStatus(withTransport)).toBe("Needs rebuilding");
    expect(withTransport.itinerary).toEqual(trip.itinerary);
    expect(setTransportMode(withTransport, "car", true)).toEqual(
      withTransport,
    );
    expect(setTransportMode(withTransport, "motorcycle", false)).toEqual(
      withTransport,
    );
  });
  it("persists Accommodation and transport across a fresh repository", () => {
    const storage = memoryStorage();
    const repository = new TripRepository(() => storage);
    repository.load();
    const trip = setTransportMode(
      setAccommodation(createTrip("trip"), accommodation, true),
      "motorcycle",
      true,
    );
    expect(repository.save({ trips: [trip], activeTripId: trip.id })).toBe(
      true,
    );
    const reopened = new TripRepository(() => storage).load();
    expect(reopened.failed).toBe(false);
    expect(reopened.collection.trips[0].accommodation?.id).toBe(
      accommodation.id,
    );
    expect(reopened.collection.trips[0].transportMode).toBe("motorcycle");
  });
  it("loads stored Trips written before Accommodation existed", () => {
    const storage = memoryStorage();
    const legacy = createTrip("legacy");
    // deno-lint-ignore: simulate a v1 payload without the new fields
    const { accommodation: _a, transportMode: _t, ...legacyPayload } = legacy;
    storage.setItem(
      TRIPS_KEY,
      JSON.stringify({
        version: 1,
        trips: [legacyPayload],
        activeTripId: "legacy",
      }),
    );
    const loaded = new TripRepository(() => storage).load();
    expect(loaded.failed).toBe(false);
    expect(loaded.collection.trips[0].accommodation).toBeNull();
    expect(loaded.collection.trips[0].transportMode).toBeNull();
  });
  it("rejects stored Trips where Accommodation overlaps a Visit", () => {
    const storage = memoryStorage();
    const trip = setAccommodation(createTrip("trip"), accommodation, true);
    const overlapping = {
      ...trip,
      destinations: [
        {
          id: accommodation.id,
          name: accommodation.name,
          coordinates: accommodation.coordinates,
          operationalStatus: "Open" as const,
        },
      ],
    };
    storage.setItem(
      TRIPS_KEY,
      JSON.stringify({
        version: 1,
        trips: [overlapping],
        activeTripId: trip.id,
      }),
    );
    const repository = new TripRepository(() => storage);
    expect(repository.load().failed).toBe(true);
  });
});
