import { expect } from "vitest";
import {
  effectiveVisitMinutes,
  tripDayDates,
} from "~/trips/trip-repository";
import type { Trip } from "~/trips/trip-repository";
import type { BuildItineraryResult } from "./itinerary-planner";

function seconds(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 3_600 + minutes * 60;
}

/**
 * One independent release oracle for every successful planner scenario.
 * It checks the saved domain result rather than planner implementation steps.
 */
export function assertCompleteItinerary(
  trip: Trip,
  result: BuildItineraryResult,
) {
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  const itinerary = result.itinerary;
  const dates = tripDayDates(trip);
  expect(itinerary.inputRevision).toBe(trip.revision);
  expect(itinerary.days.map(({ date }) => date)).toEqual(dates);

  const expectedVisitIds = trip.destinations.map(({ id }) => id).sort();
  const visits = itinerary.days.flatMap(({ entries }) =>
    entries.filter((entry) => entry.kind === "visit"),
  );
  expect(visits.map(({ destinationId }) => destinationId).sort()).toEqual(
    expectedVisitIds,
  );
  expect(new Set(visits.map(({ destinationId }) => destinationId)).size).toBe(
    expectedVisitIds.length,
  );

  for (const [dayIndex, day] of itinerary.days.entries()) {
    const window = trip.dailyWindows.find(({ date }) => date === day.date)!;
    const lowerBoundary = Math.max(
      seconds(window.start),
      dayIndex === 0 ? seconds(trip.boundaries.arrival.time) : 0,
    );
    const upperBoundary = Math.min(
      seconds(window.end),
      dayIndex === itinerary.days.length - 1
        ? seconds(trip.boundaries.departure.time)
        : 24 * 3_600,
    );
    expect(day.startSeconds).toBeGreaterThanOrEqual(lowerBoundary);
    expect(day.endSeconds).toBeLessThanOrEqual(upperBoundary);

    let cursor = day.startSeconds;
    for (const [entryIndex, entry] of day.entries.entries()) {
      expect(entry.startSeconds).toBe(cursor);
      expect(entry.endSeconds).toBeGreaterThanOrEqual(entry.startSeconds);

      if (entry.kind === "visit") {
        expect(entry.durationMinutes).toBe(
          effectiveVisitMinutes(trip, entry.destinationId),
        );
        expect(entry.endSeconds - entry.startSeconds).toBe(
          entry.durationMinutes * 60,
        );
      } else {
        expect(entry.endSeconds - entry.startSeconds).toBe(
          entry.estimate.durationSeconds,
        );
        expect(entry.estimate.distanceMeters).toBeGreaterThanOrEqual(0);
        expect(entry.estimate.geometry.length).toBeGreaterThanOrEqual(2);
        expect(Array.isArray(entry.estimate.warnings)).toBe(true);
        if (entry.estimate.mode !== trip.transportMode) {
          expect(entry.estimate.mode).toBe("walking");
          expect(entry.estimate.durationSeconds).toBeLessThanOrEqual(
            trip.shortWalkMinutes * 60,
          );
        }
      }

      const next = day.entries[entryIndex + 1];
      if (entry.kind === "travel" && next?.kind === "visit") {
        expect(entry.destination.id).toBe(next.destinationId);
      }
      if (entry.kind === "visit" && next?.kind === "travel") {
        expect(next.origin.id).toBe(entry.destinationId);
      }
      cursor = entry.endSeconds;
    }
    expect(day.endSeconds).toBe(cursor);
  }

  if (trip.destinationOrder) {
    expect(visits.map(({ destinationId }) => destinationId)).toEqual(
      trip.destinationOrder,
    );
  }
}
