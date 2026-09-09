import { describe, expect, it, vi } from "vitest";
import type { Destination } from "~/destinations/destination";
import type { RoutingProvider } from "~/routing/routing-provider";
import {
  createTrip,
  setAccommodation,
  setBoundary,
  setDailyWindow,
  setTransportMode,
  toggleDestination,
  useCurrentDestinationOrder,
} from "~/trips/trip-repository";
import { buildItinerary } from "./itinerary-planner";

const destinations: Destination[] = ["Beach", "Temple", "Spa", "Cafe"].map(
  (name, index) => ({
    id: name.toLowerCase(),
    slug: name.toLowerCase(),
    name,
    primaryCategory: "Nature & beaches",
    area: "Batam",
    description: "",
    coordinates: { latitude: 1.2 + index / 100, longitude: 104.1 + index / 100 },
    operationalStatus: "Open",
    typicalVisitMinutes: 60,
    googleMapsUrl: "https://maps.google.com",
  }),
);
const accommodation: Destination = {
  ...destinations[0],
  id: "accommodation",
  name: "Batam Stay",
  primaryCategory: "Accommodation",
  coordinates: { latitude: 1.15, longitude: 104.05 },
};

function routing(seconds = 600): RoutingProvider & { estimateTravel: ReturnType<typeof vi.fn> } {
  return {
    estimateTravel: vi.fn(async ({ origin, destination, mode }) => ({
      distanceMeters: 1_000,
      durationSeconds: seconds,
      geometry: [origin, destination],
      mode,
      warnings: [],
    })),
  };
}

function tripForDates(arrivalDate: string, departureDate: string, count = 2) {
  let trip = createTrip("trip");
  for (const destination of destinations.slice(0, count)) trip = toggleDestination(trip, destination, true);
  trip = useCurrentDestinationOrder(trip);
  trip = setBoundary(trip, "arrival", "terminal", "Batam Centre Ferry Terminal");
  trip = setBoundary(trip, "arrival", "date", arrivalDate);
  trip = setBoundary(trip, "arrival", "time", "08:30");
  trip = setBoundary(trip, "departure", "terminal", "Harbour Bay Ferry Terminal");
  trip = setBoundary(trip, "departure", "date", departureDate);
  trip = setBoundary(trip, "departure", "time", "18:00");
  return setTransportMode(trip, "car", true);
}

function visitsByDay(result: Awaited<ReturnType<typeof buildItinerary>>) {
  if (!result.ok) return [];
  return result.itinerary.days.map((day) =>
    day.entries.filter((entry) => entry.kind === "visit").map((entry) => entry.destinationId),
  );
}

describe("multi-day Itinerary contract", () => {
  it("constrains first and last days by ferry boundaries and custom Daily windows", async () => {
    let trip = tripForDates("2026-06-01", "2026-06-02");
    trip = setAccommodation(trip, accommodation, true);
    trip = setDailyWindow(trip, "2026-06-01", "start", "08:00");
    trip = setDailyWindow(trip, "2026-06-01", "end", "10:00");
    trip = setDailyWindow(trip, "2026-06-02", "start", "12:00");
    trip = setDailyWindow(trip, "2026-06-02", "end", "19:00");

    const result = await buildItinerary(trip, routing());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.days.map(({ startSeconds }) => startSeconds)).toEqual([
      8.5 * 3600,
      12 * 3600,
    ]);
    expect(result.itinerary.days[1].endSeconds).toBeLessThanOrEqual(18 * 3600);
  });

  it("uses Accommodation as each overnight routing anchor and schedules every Destination once", async () => {
    let trip = tripForDates("2026-06-01", "2026-06-04", 4);
    trip = setAccommodation(trip, accommodation, true);
    const result = await buildItinerary(trip, routing());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.days).toHaveLength(4);
    const visits = result.itinerary.days.flatMap((day) =>
      day.entries.filter((entry) => entry.kind === "visit"),
    );
    expect(visits.map((visit) => visit.destinationId).sort()).toEqual(
      destinations.map(({ id }) => id).sort(),
    );
    expect(new Set(visits.map((visit) => visit.destinationId)).size).toBe(4);
    expect(result.itinerary.warnings).toEqual([]);

    const firstDayTravel = result.itinerary.days[0].entries.filter((entry) => entry.kind === "travel");
    const lastDayTravel = result.itinerary.days[3].entries.filter((entry) => entry.kind === "travel");
    expect(firstDayTravel[0].origin.name).toBe("Batam Centre Ferry Terminal");
    expect(firstDayTravel.at(-1)!.destination.name).toBe(accommodation.name);
    expect(lastDayTravel[0].origin.name).toBe(accommodation.name);
    expect(lastDayTravel.at(-1)!.destination.name).toBe("Harbour Bay Ferry Terminal");
    expect(visitsByDay(result).slice(1, 3)).toEqual([[], []]);
  });

  it("omits invented overnight anchors and persists a visible warning without Accommodation", async () => {
    const trip = tripForDates("2026-06-01", "2026-06-02");
    const first = await buildItinerary(trip, routing());
    const second = await buildItinerary(trip, routing());

    expect(second).toEqual(first);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.itinerary.warnings).toEqual([
      expect.objectContaining({ code: "missing-accommodation" }),
    ]);
    const anchors = first.itinerary.days.flatMap((day) =>
      day.entries.flatMap((entry) =>
        entry.kind === "travel" ? [entry.origin.name, entry.destination.name] : [],
      ),
    );
    expect(anchors).not.toContain(accommodation.name);
  });

  it("supports the one-day and four-day boundaries and rejects five days", async () => {
    const one = await buildItinerary(tripForDates("2026-06-01", "2026-06-01", 1), routing());
    const four = await buildItinerary(tripForDates("2026-06-01", "2026-06-04", 1), routing());
    const five = await buildItinerary(tripForDates("2026-06-01", "2026-06-05", 1), routing());
    expect(one.ok && one.itinerary.days).toHaveLength(1);
    expect(four.ok && four.itinerary.days).toHaveLength(4);
    expect(five).toMatchObject({ ok: false, code: "unsupported-trip-length" });
  });
});
