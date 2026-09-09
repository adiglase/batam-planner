import { useEffect, useRef, useState } from "react";
import type { Destination } from "~/destinations/destination";
import {
  clearAccommodation,
  createTrip,
  emptyCollection,
  moveDestination,
  optimizeDestinationOrder,
  removeSelectedDestination,
  setAccommodation,
  setBoundary,
  setDailyWindow,
  setShortWalkMinutes,
  setTransportMode,
  setVisitDuration,
  storeBuiltItinerary,
  toggleDestination,
  TripRepository,
  useCurrentDestinationOrder,
} from "./trip-repository";
import type { SameDayItinerary } from "~/itineraries/same-day-planner";
import type {
  BoundaryKind,
  PrimaryTransportMode,
  ShortWalkMinutes,
  Trip,
  TripBoundary,
  TripCollection,
} from "./trip-repository";

export function useTrips() {
  const repository = useRef<TripRepository | null>(null);
  const current = useRef<TripCollection>(emptyCollection());
  const [collection, setCollection] = useState(current.current);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    repository.current = new TripRepository();
    const loaded = repository.current.load();
    current.current = loaded.collection;
    setCollection(loaded.collection);
    setFailed(loaded.failed);
    setReady(true);
  }, []);
  function commit(next: TripCollection) {
    if (!ready) return;
    current.current = next;
    setCollection(next);
    setFailed(!repository.current!.save(next));
  }
  function update(change: (trip: Trip) => Trip) {
    if (!editing) return;
    commit({
      ...current.current,
      trips: current.current.trips.map((trip) =>
        trip.id === current.current.activeTripId ? change(trip) : trip,
      ),
    });
  }
  return {
    ...collection,
    ready,
    failed,
    editing,
    setEditing,
    activeTrip: collection.trips.find(
      (trip) => trip.id === collection.activeTripId,
    ),
    create() {
      const trip = createTrip(crypto.randomUUID());
      commit({
        trips: [...current.current.trips, trip],
        activeTripId: trip.id,
      });
      setEditing(true);
    },
    open(id: string) {
      if (!current.current.trips.some((trip) => trip.id === id)) return;
      commit({ ...current.current, activeTripId: id });
      setEditing(false);
    },
    remove(id: string) {
      if (!editing || id !== current.current.activeTripId) return;
      const trips = current.current.trips.filter((trip) => trip.id !== id);
      commit({ trips, activeTripId: trips[0]?.id ?? null });
      setEditing(false);
    },
    rename(name: string) {
      update((trip) => ({ ...trip, name }));
    },
    toggle(destination: Destination) {
      update((trip) => toggleDestination(trip, destination, editing));
    },
    setAccommodation(destination: Destination) {
      update((trip) => setAccommodation(trip, destination, editing));
    },
    clearAccommodation() {
      update((trip) => clearAccommodation(trip, editing));
    },
    setTransportMode(mode: PrimaryTransportMode) {
      update((trip) => setTransportMode(trip, mode, editing));
    },
    setBoundary(kind: BoundaryKind, field: keyof TripBoundary, value: string) {
      update((trip) => setBoundary(trip, kind, field, value));
    },
    setShortWalkMinutes(minutes: ShortWalkMinutes) {
      update((trip) => setShortWalkMinutes(trip, minutes));
    },
    setDailyWindow(date: string, field: "start" | "end", value: string) {
      update((trip) => setDailyWindow(trip, date, field, value));
    },
    setVisitDuration(id: string, minutes: number | null) {
      update((trip) => setVisitDuration(trip, id, minutes));
    },
    moveDestination(id: string, offset: -1 | 1) {
      update((trip) => moveDestination(trip, id, offset));
    },
    useCurrentDestinationOrder() {
      update(useCurrentDestinationOrder);
    },
    optimizeDestinationOrder() {
      update(optimizeDestinationOrder);
    },
    removeDestination(id: string) {
      update((trip) => removeSelectedDestination(trip, id));
    },
    storeBuiltItinerary(tripId: string, itinerary: SameDayItinerary) {
      const existing = current.current.trips.find((trip) => trip.id === tripId);
      if (!existing || existing.revision !== itinerary.inputRevision) return false;
      commit({
        ...current.current,
        trips: current.current.trips.map((trip) =>
          trip.id === tripId ? storeBuiltItinerary(trip, itinerary) : trip,
        ),
      });
      return true;
    },
  };
}
