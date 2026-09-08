import {
  BedDoubleIcon,
  CheckIcon,
  PlusIcon,
  ArrowRightIcon,
} from "lucide-react";
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
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  RadioGroup,
  RadioGroupItem,
} from "~/components/ui/radio-group";
import { TRANSPORT_MODE_LABELS } from "~/routing/travel-estimate";
import {
  canSelect,
  canSetAsAccommodation,
  isAccommodation,
  isPrimaryTransportMode,
  tripStatus,
  TRANSPORT_MODES,
} from "./trip-repository";
import type { useTrips } from "./use-trips";

export type TripControls = ReturnType<typeof useTrips>;
/**
 * Selection affordance for one Destination. Visit selection ("Add to
 * trip") and Accommodation ("Set as accommodation") are mutually
 * exclusive roles: the Accommodation is always visibly distinct
 * and can never simultaneously be a selected Visit.
 */
export function DestinationSelection({
  destination,
  trips,
}: {
  destination: Destination;
  trips: TripControls;
}) {
  const trip = trips.activeTrip;
  if (!trip) return null;
  const accommodation = isAccommodation(trip, destination.id);
  const selected = trip.destinations.some(({ id }) => id === destination.id);

  if (accommodation) {
    if (!trips.editing)
      return (
        <Badge variant="secondary">
          <BedDoubleIcon data-icon="inline-start" />
          Accommodation
        </Badge>
      );
    return (
      <Button
        variant="secondary"
        className="min-h-11"
        aria-pressed={true}
        onClick={() => trips.clearAccommodation()}
        aria-label={`Clear ${destination.name} as Accommodation`}
      >
        <BedDoubleIcon data-icon="inline-start" />
        Accommodation set
      </Button>
    );
  }

  if (!trips.editing)
    return selected ? (
      <Badge variant="secondary">
        <CheckIcon data-icon="inline-start" />
        In this Trip
      </Badge>
    ) : null;
  const visitControl = (
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

  if (destination.primaryCategory === "Accommodation") {
    return (
      <div className="flex flex-wrap gap-2">
        {visitControl}
        <Button
          variant="outline"
          className="min-h-11"
          disabled={!canSetAsAccommodation(destination)}
          aria-pressed={false}
          onClick={() => trips.setAccommodation(destination)}
          aria-label={`Set ${destination.name} as Accommodation`}
        >
          <BedDoubleIcon data-icon="inline-start" />
          {canSetAsAccommodation(destination)
            ? "Set as accommodation"
            : "Accommodation unavailable"}
        </Button>
      </div>
    );
  }

  return visitControl;
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
          <CardTitle>Accommodation</CardTitle>
          <CardDescription>
            This optional Destination stays distinct from selected Visits and
            is never scheduled as one.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {trip.accommodation ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <BedDoubleIcon aria-hidden="true" />
                <span>{trip.accommodation.name}</span>
                <Badge variant="secondary">Accommodation</Badge>
              </span>
              {trips.editing && (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Clear ${trip.accommodation.name} as Accommodation`}
                  onClick={() => trips.clearAccommodation()}
                >
                  Clear
                </Button>
              )}
            </div>
          ) : (
            <p>
              {trips.editing
                ? "No Accommodation set. Choose an Accommodation-category Destination from Discover."
                : "No Accommodation set."}
            </p>
          )}
          <Button variant="outline" onClick={onDiscover}>
            {trip.accommodation
              ? "Change accommodation"
              : trips.editing
                ? "Choose accommodation"
                : "View accommodation options"}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Primary transport</CardTitle>
          <CardDescription>
            Used for the Accommodation travel estimate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {trips.editing ? (
            <FieldSet>
              <FieldLegend className="sr-only">Primary transport</FieldLegend>
              <RadioGroup
                value={trip.transportMode ?? ""}
                onValueChange={(mode) => {
                  if (isPrimaryTransportMode(mode)) {
                    trips.setTransportMode(mode);
                  }
                }}
              >
                {TRANSPORT_MODES.map((mode) => {
                  const controlId = `primary-transport-${mode}`;
                  return (
                    <Field
                      key={mode}
                      className="min-h-11"
                      orientation="horizontal"
                    >
                      <RadioGroupItem
                        id={controlId}
                        value={mode}
                      />
                      <FieldLabel htmlFor={controlId} className="font-normal">
                        {TRANSPORT_MODE_LABELS[mode]}
                      </FieldLabel>
                    </Field>
                  );
                })}
              </RadioGroup>
            </FieldSet>
          ) : (
            <p>
              {trip.transportMode
                ? TRANSPORT_MODE_LABELS[trip.transportMode]
                : "Transport not chosen yet."}
            </p>
          )}
        </CardContent>
      </Card>
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
