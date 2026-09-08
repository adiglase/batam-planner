import { CheckIcon, PlusIcon, ArrowRightIcon } from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "~/components/ui/empty";
import type { Destination } from "~/destinations/destination";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { canSelect, tripStatus } from "./trip-repository";
import type { useTrips } from "./use-trips";

export type TripControls = ReturnType<typeof useTrips>;
export function DestinationSelection({
  destination,
  trips,
}: {
  destination: Destination;
  trips: TripControls;
}) {
  const selected = trips.activeTrip?.destinations.some(
    ({ id }) => id === destination.id,
  );
  if (!trips.activeTrip) return null;
  if (!trips.editing)
    return selected ? (
      <Badge variant="secondary">
        <CheckIcon data-icon="inline-start" />
        In this Trip
      </Badge>
    ) : null;
  return (
    <Button
      variant={selected ? "secondary" : "outline"}
      className="min-h-11"
      disabled={!selected && !canSelect(destination)}
      aria-pressed={!!selected}
      onClick={() => trips.toggle(destination)}
      aria-label={`${selected ? "Remove" : "Add"} ${destination.name} ${selected ? "from" : "to"} Trip`}
    >
      {selected ? (
        <CheckIcon data-icon="inline-start" />
      ) : (
        <PlusIcon data-icon="inline-start" />
      )}
      {selected
        ? "Selected"
        : canSelect(destination)
          ? "Add to trip"
          : "Unavailable"}
    </Button>
  );
}
export function TripSurface({
  trips,
  onDiscover,
  onDeleted,
  onCreate,
}: {
  trips: TripControls;
  onDiscover: () => void;
  onDeleted: () => void;
  onCreate: () => void;
}) {
  const trip = trips.activeTrip;
  if (!trip)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Start your Batam Trip</EmptyTitle>
          <EmptyDescription>
            Choose the Destinations you want to visit. You can name your Trip
            and adjust your selection along the way.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onCreate}>
            Create new trip
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </EmptyContent>
      </Empty>
    );
  return (
    <>
      <header className="surface-intro surface-intro-compact">
        <h1>{trip.name || "Untitled Trip"}</h1>
        <Badge variant="secondary">{tripStatus(trip)}</Badge>
      </header>
      {trips.editing && (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="trip-name">Trip name</FieldLabel>
            <Input
              id="trip-name"
              value={trip.name}
              placeholder="Untitled Trip"
              onChange={(event) => trips.rename(event.target.value)}
            />
          </Field>
        </FieldGroup>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Selected Destinations</CardTitle>
          <CardDescription>
            {trip.destinations.length} selected ·{" "}
            {trips.failed
              ? "Changes remain available on this page only."
              : trips.editing
                ? "Changes save immediately in this browser."
                : "Choose Edit trip to change your selection."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {trip.destinations.length === 0 && (
            <p>No Destinations selected yet.</p>
          )}
          {trip.destinations.map((destination) => (
            <div
              key={destination.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span>{destination.name}</span>
              {trips.editing && (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Remove ${destination.name} from Trip`}
                  onClick={() => trips.removeDestination(destination.id)}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          <Button onClick={onDiscover}>
            {trips.editing
              ? "Choose Destinations"
              : "Edit trip & choose Destinations"}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </CardContent>
      </Card>
      {trips.editing && (
        <Button
          variant="ghost"
          onClick={() => {
            if (
              window.confirm(
                `Delete “${trip.name || "Untitled Trip"}”? This cannot be undone.`,
              )
            ) {
              trips.remove(trip.id);
              onDeleted();
            }
          }}
        >
          Delete trip
        </Button>
      )}
    </>
  );
}
