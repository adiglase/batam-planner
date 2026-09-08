import { useEffect, useRef, useState } from "react";
import type { Destination } from "~/destinations/destination";
import {
  createTrip,
  emptyCollection,
  removeSelectedDestination,
  toggleDestination,
  TripRepository,
} from "./trip-repository";
import type { Trip, TripCollection } from "./trip-repository";

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
    removeDestination(id: string) {
      update((trip) => removeSelectedDestination(trip, id));
    },
  };
}
