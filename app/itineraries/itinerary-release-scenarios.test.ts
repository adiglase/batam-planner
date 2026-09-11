import { describe, it, vi } from "vitest";
import type { Destination } from "~/destinations/destination";
import type { RoutingProvider } from "~/routing/routing-provider";
import {
  createTrip,
  setAccommodation,
  setBoundary,
  setDailyWindow,
  setShortWalkMinutes,
  setTransportMode,
  toggleDestination,
  useCurrentDestinationOrder,
} from "~/trips/trip-repository";
import type { PrimaryTransportMode, Trip } from "~/trips/trip-repository";
import { assertCompleteItinerary } from "./itinerary-test-assertions";
import { buildItinerary } from "./itinerary-planner";

const destinations: Destination[] = ["Bridge", "Temple", "Beach", "Seafood"].map(
  (name, index) => ({
    id: name.toLowerCase(),
    slug: name.toLowerCase(),
    name,
    primaryCategory: "Attractions & landmarks",
    area: "Batam",
    description: "",
    coordinates: { latitude: 1.01 + index / 100, longitude: 104.01 + index / 100 },
    operationalStatus: "Open",
    typicalVisitMinutes: 60 + index * 15,
    googleMapsUrl: "https://maps.google.com",
  }),
);

const accommodation: Destination = {
  ...destinations[0],
  id: "hotel",
  name: "Batam Hotel",
  primaryCategory: "Accommodation",
};

function completeTrip(mode: PrimaryTransportMode, useDestinationOrder: boolean) {
  let trip = createTrip(`release-${mode}-${useDestinationOrder}`);
  for (const destination of destinations) trip = toggleDestination(trip, destination, true);
  trip = setAccommodation(trip, accommodation, true);
  trip = setBoundary(trip, "arrival", "terminal", "Batam Centre Ferry Terminal");
  trip = setBoundary(trip, "arrival", "date", "2026-10-10");
  trip = setBoundary(trip, "arrival", "time", "08:30");
  trip = setBoundary(trip, "departure", "terminal", "Harbour Bay Ferry Terminal");
  trip = setBoundary(trip, "departure", "date", "2026-10-11");
  trip = setBoundary(trip, "departure", "time", "18:00");
  trip = setDailyWindow(trip, "2026-10-10", "end", "13:00");
  trip = setTransportMode(trip, mode, true);
  trip = setShortWalkMinutes(trip, mode === "walking" ? 0 : 10);
  return useDestinationOrder ? useCurrentDestinationOrder(trip) : trip;
}

function createDeterministicRoutingProvider(): RoutingProvider & {
  estimateTravel: ReturnType<typeof vi.fn>;
} {
  return {
    estimateTravel: vi.fn(async ({ origin, destination, mode }) => ({
      distanceMeters: mode === "walking" ? 700 : 4_200,
      durationSeconds: mode === "walking" ? 540 : 600,
      mode,
      geometry: [origin, destination],
      warnings: [],
    })),
  };
}

describe("MVP planner release scenarios", () => {
  it.each([
    ["car", false],
    ["car", true],
    ["motorcycle", true],
    ["walking", false],
  ] as const)(
    "asserts every invariant for %s Primary transport with Destination order %s",
    async (mode, useDestinationOrder) => {
      const trip: Trip = completeTrip(mode, useDestinationOrder);
      const result = await buildItinerary(
        trip,
        createDeterministicRoutingProvider(),
      );
      assertCompleteItinerary(trip, result);
    },
  );
});
