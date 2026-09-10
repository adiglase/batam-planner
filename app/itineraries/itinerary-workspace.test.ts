import { describe, expect, it } from "vitest";
import type { Destination } from "~/destinations/destination";
import { viewportContainsBounds, viewportBoundsFromCenterZoom } from "~/discovery/discovery";
import type { RoutingProvider } from "~/routing/routing-provider";
import {
  createTrip,
  reopeningSurface,
  setAccommodation,
  setBoundary,
  setDailyWindow,
  setTransportMode,
  storeBuiltItinerary,
  toggleDestination,
  tripStatus,
  TripRepository,
  useCurrentDestinationOrder,
} from "~/trips/trip-repository";
import { buildItinerary } from "./itinerary-planner";
import {
  anchorElementId,
  batamClock,
  fitRouteViewport,
  googleMapsNavigationUrl,
  itineraryCoordinates,
  itineraryDayPresentation,
  onTripState,
  travelElementId,
  visitElementId,
} from "./itinerary-workspace";

const beach: Destination = {
  id: "beach",
  slug: "beach",
  name: "Beach",
  primaryCategory: "Nature & beaches",
  area: "Batam",
  description: "",
  coordinates: { latitude: 1.1, longitude: 104.1 },
  operationalStatus: "Open",
  typicalVisitMinutes: 60,
  googleMapsUrl: "https://maps.google.com",
};
const temple: Destination = {
  ...beach,
  id: "temple",
  slug: "temple",
  name: "Temple",
  coordinates: { latitude: 1.2, longitude: 104.2 },
  typicalVisitMinutes: 30,
};
const accommodation: Destination = {
  ...beach,
  id: "harris",
  slug: "harris",
  name: "Harris Stay",
  primaryCategory: "Accommodation",
  coordinates: { latitude: 1.15, longitude: 104.05 },
};

function routing(seconds = 600): RoutingProvider {
  return {
    estimateTravel: async ({ origin, destination, mode }) => ({
      distanceMeters: 4_200,
      durationSeconds: seconds,
      mode,
      geometry: [origin, destination],
      warnings: [],
    }),
  };
}

function singleDayTrip() {
  let trip = createTrip("trip");
  trip = toggleDestination(trip, beach, true);
  trip = toggleDestination(trip, temple, true);
  trip = useCurrentDestinationOrder(trip);
  trip = setBoundary(trip, "arrival", "terminal", "Batam Centre Ferry Terminal");
  trip = setBoundary(trip, "arrival", "date", "2026-06-01");
  trip = setBoundary(trip, "arrival", "time", "08:30");
  trip = setBoundary(trip, "departure", "terminal", "Harbour Bay Ferry Terminal");
  trip = setBoundary(trip, "departure", "date", "2026-06-01");
  trip = setBoundary(trip, "departure", "time", "13:00");
  return setTransportMode(trip, "car", true);
}

function twoDayTrip() {
  let trip = createTrip("trip");
  trip = toggleDestination(trip, beach, true);
  trip = toggleDestination(trip, temple, true);
  trip = useCurrentDestinationOrder(trip);
  trip = setAccommodation(trip, accommodation, true);
  trip = setBoundary(trip, "arrival", "terminal", "Batam Centre Ferry Terminal");
  trip = setBoundary(trip, "arrival", "date", "2026-06-01");
  trip = setBoundary(trip, "arrival", "time", "08:30");
  trip = setBoundary(trip, "departure", "terminal", "Harbour Bay Ferry Terminal");
  trip = setBoundary(trip, "departure", "date", "2026-06-02");
  trip = setBoundary(trip, "departure", "time", "18:00");
  trip = setDailyWindow(trip, "2026-06-01", "end", "10:20");
  trip = setDailyWindow(trip, "2026-06-02", "end", "10:00");
  return setTransportMode(trip, "car", true);
}

async function built(trip = singleDayTrip()) {
  const result = await buildItinerary(trip, routing());
  if (!result.ok) throw new Error(result.message);
  return { trip: storeBuiltItinerary(trip, result.itinerary), itinerary: result.itinerary };
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

describe("Itinerary day map presentation", () => {
  it("draws only the selected day's ordered route with visit and anchor markers", async () => {
    const { trip, itinerary } = await built(twoDayTrip());
    const presentation = itineraryDayPresentation(
      itinerary,
      0,
      itineraryCoordinates(trip),
    );

    expect(presentation).not.toBeNull();
    if (!presentation) return;
    expect(presentation.day).toBe(itinerary.days[0]);
    expect(
      presentation.markers.map((marker) => [
        marker.id,
        marker.kind,
        marker.sequence ?? null,
      ]),
    ).toEqual([
      [
        anchorElementId("terminal:Batam Centre Ferry Terminal"),
        "terminal",
        null,
      ],
      [visitElementId("beach"), "visit", 1],
      [anchorElementId("harris"), "accommodation", null],
    ]);
    expect(presentation.markers[1].coordinates).toEqual(beach.coordinates);
    expect(presentation.route.legs.map((leg) => leg.id)).toEqual([
      travelElementId("terminal:Batam Centre Ferry Terminal", "beach"),
      travelElementId("beach", "harris"),
    ]);
    expect(presentation.route.legs.map((leg) => leg.label)).toEqual([
      "Travel from Batam Centre Ferry Terminal to Beach",
      "Travel from Beach to Harris Stay",
    ]);
    expect(presentation.route.legs[0].path).toEqual([
      { latitude: 1.1306, longitude: 104.0556 },
      beach.coordinates,
    ]);
    expect(
      presentation.markers.some((marker) => marker.id === visitElementId("temple")),
    ).toBe(false);
  });

  it("numbers Visits within the selected day and reuses a repeated anchor once", async () => {
    const { trip, itinerary } = await built(twoDayTrip());
    const first = itineraryDayPresentation(itinerary, 0, itineraryCoordinates(trip))!;
    const second = itineraryDayPresentation(itinerary, 1, itineraryCoordinates(trip))!;

    expect(first.markers.filter(({ kind }) => kind === "accommodation")).toHaveLength(1);
    expect(second.markers.filter(({ kind }) => kind === "accommodation")).toHaveLength(1);
    expect(second.markers.find(({ kind }) => kind === "visit")?.sequence).toBe(1);
    expect(second.route.legs[0].id).toBe(
      travelElementId("harris", "temple"),
    );
    expect(
      itineraryDayPresentation(itinerary, 4, itineraryCoordinates(trip)),
    ).toBeNull();
  });

  it("returns a fresh ordered route for a same-day Itinerary", async () => {
    const { trip, itinerary } = await built();
    const presentation = itineraryDayPresentation(
      itinerary,
      0,
      itineraryCoordinates(trip),
    )!;

    expect(presentation.route.id).toBe("2026-06-01");
    expect(presentation.route.legs).toHaveLength(3);
    expect(presentation.markers.map(({ sequence }) => sequence ?? 0)).toEqual([0, 1, 2, 0]);
  });

  it("places a Visit from day anchors when its Destination is no longer on the Trip", async () => {
    const { trip, itinerary } = await built(singleDayTrip());
    const withoutSelectedDestinations = { ...trip, destinations: [] };

    const presentation = itineraryDayPresentation(
      itinerary,
      0,
      itineraryCoordinates(withoutSelectedDestinations),
    )!;

    const visit = presentation.markers.find(({ id }) => id === visitElementId("beach"));
    expect(visit?.coordinates).toEqual(beach.coordinates);
  });

  it("does not mutate the saved Itinerary while presenting it", async () => {
    const { trip, itinerary } = await built(twoDayTrip());
    const snapshot = structuredClone(itinerary);

    itineraryDayPresentation(itinerary, 0, itineraryCoordinates(trip));
    itineraryDayPresentation(itinerary, 1, itineraryCoordinates(trip));

    expect(itinerary).toEqual(snapshot);
  });
});

describe("Itinerary map viewport", () => {
  it("fits every marker of the selected day", async () => {
    const { trip, itinerary } = await built(twoDayTrip());
    const { markers } = itineraryDayPresentation(
      itinerary,
      0,
      itineraryCoordinates(trip),
    )!;

    const viewport = fitRouteViewport(markers);
    expect(viewport).not.toBeNull();
    if (!viewport) return;
    const bounds = viewportBoundsFromCenterZoom(viewport.center, viewport.zoom);
    expect(
      markers.every(({ coordinates }) => viewportContainsBounds(bounds, coordinates)),
    ).toBe(true);
  });

  it("reports no viewport for an empty day", () => {
    expect(fitRouteViewport([])).toBeNull();
  });
});

describe("on-trip day state", () => {
  it("reads Batam time (UTC+7) independently of the host timezone", () => {
    expect(batamClock(new Date("2026-06-01T01:30:00Z"))).toEqual({
      date: "2026-06-01",
      seconds: 8.5 * 3600,
    });
    expect(batamClock(new Date("2026-06-01T18:00:00Z")).date).toBe("2026-06-02");
  });

  it("emphasizes the current Visit, next Destination, next leg, and remaining day", async () => {
    const { itinerary } = await built();
    const day = itinerary.days[0];

    const beforeDay = onTripState(day, new Date("2026-06-01T00:00:00Z"));
    expect(beforeDay.isToday).toBe(true);
    expect(beforeDay.currentVisit).toBeNull();
    expect(beforeDay.nextVisit?.destinationId).toBe("beach");
    expect(beforeDay.nextTravel?.destination.name).toBe("Beach");
    expect(beforeDay.remainingSeconds).toBe(day.endSeconds - 7 * 3600);

    const duringVisit = onTripState(day, new Date("2026-06-01T02:30:00Z"));
    expect(duringVisit.currentVisit?.destinationId).toBe("beach");
    expect(duringVisit.nextVisit?.destinationId).toBe("temple");
    expect(duringVisit.nextTravel?.destination.name).toBe("Temple");

    const duringTravel = onTripState(day, new Date("2026-06-01T03:15:00Z"));
    expect(duringTravel.currentVisit).toBeNull();
    expect(duringTravel.nextVisit?.destinationId).toBe("temple");
    expect(duringTravel.nextTravel?.origin.name).toBe("Beach");

    const afterDay = onTripState(day, new Date("2026-06-01T05:00:00Z"));
    expect(afterDay.currentVisit).toBeNull();
    expect(afterDay.nextVisit).toBeNull();
    expect(afterDay.nextTravel).toBeNull();
    expect(afterDay.remainingSeconds).toBe(0);
  });

  it("leaves another day's plan unclocked while naming its first Visit and leg", async () => {
    const { itinerary } = await built();
    const state = onTripState(itinerary.days[0], new Date("2026-06-02T02:30:00Z"));

    expect(state).toMatchObject({
      isToday: false,
      nowSeconds: null,
      currentVisit: null,
      remainingSeconds: null,
    });
    expect(state.nextVisit?.destinationId).toBe("beach");
    expect(state.nextTravel?.destination.name).toBe("Beach");
  });

  it("treats a missing clock as an unclocked day", async () => {
    const { itinerary } = await built();
    const state = onTripState(itinerary.days[0], null);

    expect(state.isToday).toBe(false);
    expect(state.nextVisit?.destinationId).toBe("beach");
  });
});

describe("external navigation handoff", () => {
  it("builds a Google Maps directions URL for the leg's actual mode", async () => {
    const { itinerary } = await built();
    const leg = itinerary.days[0].entries.find(
      (entry) => entry.kind === "travel",
    )!;

    const url = new URL(googleMapsNavigationUrl(leg));
    expect(`${url.origin}${url.pathname}`).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("origin")).toBe("1.1306,104.0556");
    expect(url.searchParams.get("destination")).toBe("1.1,104.1");
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("dir_action")).toBe("navigate");
  });

  it("maps walking to walking and motorcycle to the closest driving mode", async () => {
    const { itinerary } = await built();
    const leg = itinerary.days[0].entries.find(
      (entry) => entry.kind === "travel",
    )!;

    expect(
      new URL(googleMapsNavigationUrl({ ...leg, estimate: { ...leg.estimate, mode: "walking" } })).searchParams.get("travelmode"),
    ).toBe("walking");
    expect(
      new URL(googleMapsNavigationUrl({ ...leg, estimate: { ...leg.estimate, mode: "motorcycle" } })).searchParams.get("travelmode"),
    ).toBe("driving");
  });
});

describe("reopening an Itinerary-ready Trip", () => {
  it("restores the saved Itinerary unchanged on the Itinerary surface without rebuilding", async () => {
    const { trip, itinerary } = await built(twoDayTrip());
    const storage = memoryStorage();
    const repository = new TripRepository(() => storage);
    repository.load();
    expect(repository.save({ trips: [trip], activeTripId: trip.id })).toBe(true);

    const reopened = new TripRepository(() => storage).load().collection.trips[0];
    expect(reopened.itinerary).toEqual(itinerary);
    expect(reopeningSurface(reopened)).toBe("itinerary");
    expect(tripStatus(reopened)).toBe("Itinerary ready");

    // Presenting the saved Itinerary never asks a routing provider for
    // anything: no silent Build happens on reopen.
    const presentation = itineraryDayPresentation(
      reopened.itinerary!,
      0,
      itineraryCoordinates(reopened),
    );
    expect(presentation?.markers.length).toBeGreaterThan(0);
    expect(reopened.itinerary).toEqual(itinerary);
  });
});
