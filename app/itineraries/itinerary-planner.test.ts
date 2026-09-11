import { describe, expect, it, vi } from "vitest";
import type { Destination } from "~/destinations/destination";
import type { RoutingProvider } from "~/routing/routing-provider";
import { RoutingFailure } from "~/routing/routing-provider";
import {
  createTrip,
  optimizeDestinationOrder,
  setBoundary,
  setDailyWindow,
  setTransportMode,
  toggleDestination,
  useCurrentDestinationOrder,
} from "~/trips/trip-repository";
import { buildItinerary as buildSameDayItinerary } from "./itinerary-planner";
import { assertCompleteItinerary } from "./itinerary-test-assertions";

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
      warnings: [],
    })),
  };
}

describe("one-day Itinerary Build", () => {
  it("schedules every Destination exactly once with terminal Travel and exact provider facts", async () => {
    const provider = routing();
    const trip = completeTrip();
    const result = await buildSameDayItinerary(trip, provider);

    assertCompleteItinerary(trip, result);
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
      warnings: [],
    });
  });

  it("reproduces the identical result for identical inputs and routing facts", async () => {
    const trip = completeTrip();
    const first = await buildSameDayItinerary(trip, routing());
    const second = await buildSameDayItinerary(trip, routing());
    assertCompleteItinerary(trip, first);
    assertCompleteItinerary(trip, second);
    expect(second).toEqual(first);
  });

  it("returns no partial Itinerary when a required route is unavailable", async () => {
    const provider: RoutingProvider = {
      estimateTravel: async ({ origin, destination, mode }) =>
        origin.latitude === beach.coordinates.latitude &&
        destination.latitude === temple.coordinates.latitude
          ? null
          : { distanceMeters: 1, durationSeconds: 1, geometry: [origin, destination], mode, warnings: [] },
    };
    const trip = useCurrentDestinationOrder(completeTrip());
    await expect(buildSameDayItinerary(trip, provider)).resolves.toMatchObject({
      ok: false,
      code: "unavailable-route",
      message: "Travel from Beach to Temple is unavailable using car.",
      suggestions: expect.arrayContaining([
        expect.objectContaining({ label: "Choose different Primary transport" }),
      ]),
    });
    expect(trip.itinerary).toBeNull();
  });

  it("rejects a complete route that exceeds the tighter Boundary or Daily window", async () => {
    const trip = setDailyWindow(completeTrip(), "2026-06-01", "end", "10:59");
    const result = await buildSameDayItinerary(trip, routing());
    expect(result).toMatchObject({
      ok: false,
      code: "insufficient-time",
      suggestions: expect.arrayContaining([
        expect.objectContaining({ label: "Shorten a Visit" }),
        expect.objectContaining({ label: "Widen a Daily window" }),
      ]),
    });
    expect(result).not.toHaveProperty("itinerary");
  });

  it("returns every missing requirement as a deterministic linked checklist", async () => {
    const result = await buildSameDayItinerary(createTrip("empty"), routing());

    expect(result).toEqual({
      ok: false,
      code: "missing-input",
      message: "Complete these Trip inputs before building. Nothing has been changed.",
      requirements: [
        { label: "Choose at least one Destination", targetId: "choose-destinations" },
        { label: "Choose an arrival ferry terminal", targetId: "arrival-terminal" },
        { label: "Set the arrival date", targetId: "arrival-date" },
        { label: "Set the arrival time", targetId: "arrival-time" },
        { label: "Choose a departure ferry terminal", targetId: "departure-terminal" },
        { label: "Set the departure date", targetId: "departure-date" },
        { label: "Set the departure time", targetId: "departure-time" },
        { label: "Choose Primary transport", targetId: "primary-transport-car" },
      ],
      suggestions: [],
    });
    expect(result).not.toHaveProperty("itinerary");
  });

  it("reports excess Destination count before other infeasible blockers", async () => {
    const complete = completeTrip();
    const destinations = Array.from({ length: 11 }, (_, index) => ({
      ...complete.destinations[0],
      id: `destination-${index}`,
      name: `Destination ${index}`,
    }));
    const trip = {
      ...complete,
      destinations,
      destinationOrder: null,
      boundaries: {
        ...complete.boundaries,
        departure: { ...complete.boundaries.departure, date: "2026-06-05" },
      },
    };

    const result = await buildSameDayItinerary(trip, routing(), destinations);

    expect(result).toMatchObject({
      ok: false,
      code: "excess-destination-count",
      message: "11 Destinations are selected; a Trip supports at most 10.",
    });
    expect(result).not.toHaveProperty("itinerary");
  });

  it("builds the supported ten-Destination boundary", async () => {
    const complete = completeTrip();
    const destinations = Array.from({ length: 10 }, (_, index) => ({
      ...complete.destinations[0],
      id: `destination-${index}`,
      name: `Destination ${index}`,
      typicalVisitMinutes: 5,
    }));
    const trip = {
      ...complete,
      destinations,
      destinationOrder: destinations.map(({ id }) => id),
    };

    const result = await buildSameDayItinerary(trip, routing(60), destinations);

    assertCompleteItinerary(trip, result);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.days[0].entries.filter(({ kind }) => kind === "visit")).toHaveLength(10);
  });

  it("optimizes Travel duration", async () => {
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
        warnings: [],
      }),
    };
    const trip = completeTrip();
    const result = await buildSameDayItinerary(trip, provider);

    assertCompleteItinerary(trip, result);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.itinerary.days[0].entries
        .filter((entry) => entry.kind === "visit")
        .map((entry) => entry.destinationId),
    ).toEqual(["temple", "beach"]);
  });

  it("uses earliest completion before stable identity when Travel and open time tie", async () => {
    const durations = new Map([
      ["1.1306:1.2", 10],
      ["1.2:1.1", 10],
      ["1.1:1.1531", 30],
      ["1.1306:1.1", 20],
      ["1.1:1.2", 20],
      ["1.2:1.1531", 10],
    ]);
    const provider: RoutingProvider = {
      estimateTravel: async ({ origin, destination, mode }) => ({
        distanceMeters: 1,
        durationSeconds: durations.get(`${origin.latitude}:${destination.latitude}`)!,
        geometry: [origin, destination],
        mode,
        warnings: [],
      }),
    };

    const trip = completeTrip();
    const result = await buildSameDayItinerary(trip, provider);

    assertCompleteItinerary(trip, result);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.itinerary.days[0].entries
        .filter((entry) => entry.kind === "visit")
        .map((entry) => entry.destinationId),
    ).toEqual(["temple", "beach"]);
  });

  it("uses stable Destination identity after Optimize order removes the manual constraint", async () => {
    const manuallyOrdered = {
      ...completeTrip(),
      destinationOrder: [temple.id, beach.id],
    };
    const manual = await buildSameDayItinerary(manuallyOrdered, routing());
    const optimizedTrip = optimizeDestinationOrder(manuallyOrdered);
    const optimized = await buildSameDayItinerary(optimizedTrip, routing());
    const visitIds = (result: Awaited<ReturnType<typeof buildSameDayItinerary>>) =>
      result.ok
        ? result.itinerary.days[0].entries
            .filter((entry) => entry.kind === "visit")
            .map((entry) => entry.destinationId)
        : [];

    assertCompleteItinerary(manuallyOrdered, manual);
    assertCompleteItinerary(optimizedTrip, optimized);
    expect(visitIds(manual)).toEqual(["temple", "beach"]);
    expect(visitIds(optimized)).toEqual(["beach", "temple"]);
  });

  it.each([5, 10, 15] as const)(
    "walks only legs within the %i-minute tolerance",
    async (shortWalkMinutes) => {
      const complete = completeTrip();
      const trip = {
        ...complete,
        destinations: [complete.destinations[0]],
        destinationOrder: [beach.id],
        shortWalkMinutes,
      };
      let walkingRequest = 0;
      const provider: RoutingProvider = {
        estimateTravel: async ({ origin, destination, mode }) => {
          if (mode === "walking") walkingRequest += 1;
          return {
            distanceMeters: 1,
            durationSeconds:
              mode === "walking"
                ? walkingRequest === 1
                  ? shortWalkMinutes * 60
                  : shortWalkMinutes * 60 + 1
                : 60,
            geometry: [origin, destination],
            mode,
            warnings: [],
          };
        },
      };
      const result = await buildSameDayItinerary(trip, provider);

      assertCompleteItinerary(trip, result);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(
        result.itinerary.days[0].entries
          .filter((entry) => entry.kind === "travel")
          .map((entry) => entry.estimate.mode),
      ).toEqual(["walking", "car"]);
    },
  );

  it.each(["car", "motorcycle", "walking"] as const)(
    "requests and records %s Primary transport without short-walk substitution",
    async (mode) => {
      const complete = completeTrip();
      const trip = {
        ...complete,
        destinations: [complete.destinations[0]],
        destinationOrder: [beach.id],
        transportMode: mode,
        shortWalkMinutes: 0 as const,
      };
      const provider = routing();
      const result = await buildSameDayItinerary(trip, provider);

      assertCompleteItinerary(trip, result);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(provider.estimateTravel.mock.calls.every(([input]) => input.mode === mode)).toBe(true);
      expect(
        result.itinerary.days[0].entries
          .filter((entry) => entry.kind === "travel")
          .map((entry) => entry.estimate.mode),
      ).toEqual([mode, mode]);
    },
  );

  it.each(["car", "motorcycle", "walking"] as const)(
    "does not substitute another mode when required %s Travel is unavailable",
    async (mode) => {
      const complete = completeTrip();
      const trip = {
        ...complete,
        destinations: [complete.destinations[0]],
        destinationOrder: [beach.id],
        transportMode: mode,
        shortWalkMinutes: 0 as const,
      };
      const provider: RoutingProvider & { estimateTravel: ReturnType<typeof vi.fn> } = {
        estimateTravel: vi.fn(async () => null),
      };

      await expect(buildSameDayItinerary(trip, provider)).resolves.toMatchObject({
        ok: false,
        code: "unavailable-route",
      });
      expect(provider.estimateTravel.mock.calls.every(([input]) => input.mode === mode)).toBe(true);
    },
  );

  it.each([
    ["connection-required", "connection-required"],
    ["quota-exceeded", "routing-quota"],
    ["provider-unavailable", "routing-provider-unavailable"],
  ] as const)(
    "translates %s without changing the Trip or its current Itinerary",
    async (failure, expectedCode) => {
      const trip = completeTrip();
      const snapshot = structuredClone(trip);
      const provider: RoutingProvider = {
        estimateTravel: async () => {
          throw new RoutingFailure(failure);
        },
      };

      await expect(buildSameDayItinerary(trip, provider)).resolves.toMatchObject({
        ok: false,
        code: expectedCode,
      });
      expect(trip).toEqual(snapshot);
    },
  );

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
    assertCompleteItinerary(trip, result);
    expect(result.ok).toBe(true);
  });
});
