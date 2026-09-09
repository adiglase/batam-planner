import { describe, expect, it, vi } from "vitest";
import type { Destination } from "~/destinations/destination";
import type { RoutingProvider } from "~/routing/routing-provider";
import {
  createTrip,
  setBoundary,
  setDailyWindow,
  setTransportMode,
  toggleDestination,
} from "~/trips/trip-repository";
import { buildSameDayItinerary } from "./same-day-planner";

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

describe("same-day Itinerary Build", () => {
  it("schedules every Destination exactly once with terminal Travel and exact provider facts", async () => {
    const provider = routing();
    const trip = completeTrip();
    const result = await buildSameDayItinerary(trip, provider);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(provider.estimateTravel).toHaveBeenCalledTimes(3);
    expect(result.itinerary.inputRevision).toBe(trip.revision);
    expect(result.itinerary.startSeconds).toBe(9 * 3600);
    expect(result.itinerary.endSeconds).toBe(11 * 3600);
    expect(result.itinerary.entries.map((entry) => entry.kind)).toEqual([
      "travel",
      "visit",
      "travel",
      "visit",
      "travel",
    ]);
    const visits = result.itinerary.entries.filter((entry) => entry.kind === "visit");
    expect(visits.map(({ destinationId }) => destinationId)).toEqual(["beach", "temple"]);
    const travels = result.itinerary.entries.filter((entry) => entry.kind === "travel");
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
    let request = 0;
    const provider: RoutingProvider = {
      estimateTravel: async ({ origin, destination, mode }) => {
        request += 1;
        return request === 2
          ? null
          : { distanceMeters: 1, durationSeconds: 1, geometry: [origin, destination], mode };
      },
    };
    const trip = completeTrip();
    await expect(buildSameDayItinerary(trip, provider)).resolves.toEqual({
      ok: false,
      code: "unavailable-route",
      message: "Travel from Beach to Temple is unavailable.",
    });
    expect(trip.itinerary).toBeNull();
  });

  it("rejects a complete route that exceeds the tighter Boundary or Daily window", async () => {
    const trip = setDailyWindow(completeTrip(), "2026-06-01", "end", "10:59");
    const result = await buildSameDayItinerary(trip, routing());
    expect(result).toMatchObject({ ok: false, code: "insufficient-time" });
    expect(result).not.toHaveProperty("itinerary");
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
