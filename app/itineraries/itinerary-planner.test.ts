import { describe, expect, it, vi } from "vitest";
import type { Destination } from "~/destinations/destination";
import type { RoutingProvider } from "~/routing/routing-provider";
import {
  createTrip,
  setBoundary,
  setDailyWindow,
  setTransportMode,
  toggleDestination,
  useCurrentDestinationOrder,
} from "~/trips/trip-repository";
import { buildItinerary as buildSameDayItinerary } from "./itinerary-planner";

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

function completeTrip() {
  let trip = createTrip("trip");
  trip = toggleDestination(trip, beach, true);
  trip = toggleDestination(trip, temple, true);
  trip = setBoundary(trip, "arrival", "terminal", "Batam Centre Ferry Terminal");
  trip = setBoundary(trip, "arrival", "date", "2026-06-01");
  trip = setBoundary(trip, "arrival", "time", "08:30");
  trip = setBoundary(trip, "departure", "terminal", "Harbour Bay Ferry Terminal");
  trip = setBoundary(trip, "departure", "date", "2026-06-01");
  trip = setBoundary(trip, "departure", "time", "13:00");
  trip = setDailyWindow(trip, "2026-06-01", "start", "09:00");
  trip = setTransportMode(trip, "car", true);
  return trip;
}

function routing(durationSeconds = 600): RoutingProvider & {
  estimateTravel: ReturnType<typeof vi.fn>;
} {
  return {
    estimateTravel: vi.fn(async ({ origin, destination, mode }) => ({
      distanceMeters: 4200,
      durationSeconds,
      mode,
      geometry: [origin, destination],
    })),
  };
}

describe("one-day Itinerary Build", () => {
  it("schedules every Destination exactly once with terminal Travel and exact provider facts", async () => {
    const provider = routing();
    const trip = completeTrip();
    const result = await buildSameDayItinerary(trip, provider);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(provider.estimateTravel).toHaveBeenCalledTimes(6);
    expect(result.itinerary.inputRevision).toBe(trip.revision);
    expect(result.itinerary.days[0].startSeconds).toBe(9 * 3600);
    expect(result.itinerary.days[0].endSeconds).toBe(11 * 3600);
    expect(result.itinerary.days[0].entries.map((entry) => entry.kind)).toEqual([
      "travel",
      "visit",
      "travel",
      "visit",
      "travel",
    ]);
    const visits = result.itinerary.days[0].entries.filter((entry) => entry.kind === "visit");
    expect(visits.map(({ destinationId }) => destinationId)).toEqual(["beach", "temple"]);
    const travels = result.itinerary.days[0].entries.filter((entry) => entry.kind === "travel");
    expect(travels[0].estimate).toEqual({
      distanceMeters: 4200,
      durationSeconds: 600,
      mode: "car",
      geometry: [travels[0].origin.coordinates, travels[0].destination.coordinates],
    });
  });

  it("reproduces the identical result for identical inputs and routing facts", async () => {
    const first = await buildSameDayItinerary(completeTrip(), routing());
    const second = await buildSameDayItinerary(completeTrip(), routing());
    expect(second).toEqual(first);
  });

  it("returns no partial Itinerary when a required route is unavailable", async () => {
    const provider: RoutingProvider = {
      estimateTravel: async ({ origin, destination, mode }) =>
        origin.latitude === beach.coordinates.latitude &&
        destination.latitude === temple.coordinates.latitude
          ? null
          : { distanceMeters: 1, durationSeconds: 1, geometry: [origin, destination], mode },
    };
    const trip = useCurrentDestinationOrder(completeTrip());
    await expect(buildSameDayItinerary(trip, provider)).resolves.toEqual({
      ok: false,
      code: "unavailable-route",
      message: "No complete Travel route connects every required terminal, Accommodation, and Destination anchor.",
    });
    expect(trip.itinerary).toBeNull();
  });

  it("rejects a complete route that exceeds the tighter Boundary or Daily window", async () => {
    const trip = setDailyWindow(completeTrip(), "2026-06-01", "end", "10:59");
    const result = await buildSameDayItinerary(trip, routing());
    expect(result).toMatchObject({ ok: false, code: "insufficient-time" });
    expect(result).not.toHaveProperty("itinerary");
  });

  it("optimizes Travel duration with a stable Destination identity tie-break", async () => {
    const durations = new Map([
      ["1.1306:1.1", 100],
      ["1.1:1.2", 100],
      ["1.2:1.1531", 100],
      ["1.1306:1.2", 10],
      ["1.2:1.1", 10],
      ["1.1:1.1531", 10],
    ]);
    const provider: RoutingProvider = {
      estimateTravel: async ({ origin, destination, mode }) => ({
        distanceMeters: 1,
        durationSeconds:
          durations.get(`${origin.latitude}:${destination.latitude}`) ?? 1_000,
        geometry: [origin, destination],
        mode,
      }),
    };
    const result = await buildSameDayItinerary(completeTrip(), provider);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.itinerary.days[0].entries
        .filter((entry) => entry.kind === "visit")
        .map((entry) => entry.destinationId),
    ).toEqual(["temple", "beach"]);
  });

  it("walks qualifying legs and falls back to Primary transport", async () => {
    const trip = {
      ...completeTrip(),
      destinations: [completeTrip().destinations[0]],
      destinationOrder: [beach.id],
      shortWalkMinutes: 5 as const,
    };
    let walkingRequest = 0;
    const provider: RoutingProvider = {
      estimateTravel: async ({ origin, destination, mode }) => {
        if (mode === "walking") walkingRequest += 1;
        return {
          distanceMeters: 1,
          durationSeconds:
            mode === "walking" ? (walkingRequest === 1 ? 300 : 301) : 60,
          geometry: [origin, destination],
          mode,
        };
      },
    };
    const result = await buildSameDayItinerary(trip, provider);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.itinerary.days[0].entries
        .filter((entry) => entry.kind === "travel")
        .map((entry) => entry.estimate.mode),
    ).toEqual(["walking", "car"]);
  });

  it("rejects a Destination whose current Published status is no longer eligible", async () => {
    const provider = routing();
    const result = await buildSameDayItinerary(completeTrip(), provider, [
      { id: beach.id, operationalStatus: "Temporarily closed" },
      { id: temple.id, operationalStatus: "Open" },
    ]);

    expect(result).toMatchObject({ ok: false, code: "ineligible-destination" });
    expect(provider.estimateTravel).not.toHaveBeenCalled();
  });

  it("does not read or apply Operating hours", async () => {
    const withHours = {
      ...beach,
      operatingHours: { kind: "periods" as const, text: "Closed on this date" },
    };
    let trip = completeTrip();
    trip = {
      ...trip,
      destinations: trip.destinations.map((item) =>
        item.id === beach.id ? { ...item, ...withHours } : item,
      ),
    };
    const result = await buildSameDayItinerary(trip, routing());
    expect(result.ok).toBe(true);
  });
});
