import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BedDoubleIcon,
  CheckIcon,
  PlusIcon,
  ShipIcon,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "~/components/ui/empty";
import type { Destination } from "~/destinations/destination";
import { FERRY_TERMINALS } from "~/geography/ferry-terminals";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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
  MAX_SELECTED_DESTINATIONS,
  SHORT_WALK_OPTIONS,
  tripDayDates,
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
  const selectionLimitReached =
    !selected && trip.destinations.length >= MAX_SELECTED_DESTINATIONS;

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
      disabled={selectionLimitReached || (!selected && !canSelect(destination))}
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
        : selectionLimitReached
          ? "10 Destination limit"
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
  const selectedDestinations = (trip.destinationOrder ?? trip.destinations.map(({ id }) => id))
    .map((id) => trip.destinations.find((destination) => destination.id === id))
    .filter((destination) => destination !== undefined);
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
          <CardTitle>Ferry boundaries</CardTitle>
          <CardDescription>
            Arrival and departure use Batam time (WIB, UTC+7). These are exact
            Trip Boundaries; no ferry buffer is added.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {(["arrival", "departure"] as const).map((kind) => {
            const boundary = trip.boundaries[kind];
            const label = kind === "arrival" ? "Arrival" : "Departure";
            return (
              <FieldSet key={kind}>
                <FieldLegend variant="label" className="flex items-center gap-2">
                  <ShipIcon aria-hidden="true" />
                  {label}
                </FieldLegend>
                {trips.editing ? (
                  <FieldGroup className="grid gap-3 sm:grid-cols-2">
                    <Field className="sm:col-span-2">
                      <FieldLabel htmlFor={`${kind}-terminal`}>Ferry terminal</FieldLabel>
                      <Select
                        value={boundary.terminal || null}
                        onValueChange={(value) =>
                          trips.setBoundary(kind, "terminal", value ?? "")
                        }
                      >
                        <SelectTrigger id={`${kind}-terminal`} className="w-full">
                          <SelectValue placeholder={`Choose ${kind} ferry terminal`} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {FERRY_TERMINALS.map((terminal) => (
                              <SelectItem key={terminal.name} value={terminal.name}>
                                {terminal.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`${kind}-date`}>{label} date</FieldLabel>
                      <Input
                        id={`${kind}-date`}
                        type="date"
                        value={boundary.date}
                        onChange={(event) =>
                          trips.setBoundary(kind, "date", event.target.value)
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`${kind}-time`}>{label} time</FieldLabel>
                      <Input
                        id={`${kind}-time`}
                        type="time"
                        value={boundary.time}
                        onChange={(event) =>
                          trips.setBoundary(kind, "time", event.target.value)
                        }
                      />
                    </Field>
                  </FieldGroup>
                ) : (
                  <p>
                    {boundary.terminal || "Terminal not set"} ·{" "}
                    {boundary.date && boundary.time
                      ? `${boundary.date} at ${boundary.time}`
                      : "Boundary time not set"}
                  </p>
                )}
              </FieldSet>
            );
          })}
          {trip.boundaries.arrival.date &&
            trip.boundaries.departure.date &&
            tripDayDates(trip).length === 0 && (
              <p role="alert" className="text-sm text-destructive">
                A Trip must cover one through four Batam calendar days, with
                departure on or after arrival.
              </p>
            )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Daily windows</CardTitle>
          <CardDescription>
            Each supported Trip day defaults to 09:00–21:00 Batam time and can
            be changed independently.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {trip.dailyWindows.length === 0 ? (
            <p>Set valid arrival and departure dates to create Daily windows.</p>
          ) : (
            trip.dailyWindows.map((window, index) => (
              <FieldSet key={window.date}>
                <FieldLegend variant="label">
                  Day {index + 1} · {window.date}
                </FieldLegend>
                {trips.editing ? (
                  <FieldGroup className="grid grid-cols-2 gap-3">
                    <Field data-invalid={window.start >= window.end || undefined}>
                      <FieldLabel htmlFor={`day-${window.date}-start`}>Start</FieldLabel>
                      <Input
                        id={`day-${window.date}-start`}
                        type="time"
                        value={window.start}
                        aria-invalid={window.start >= window.end || undefined}
                        onChange={(event) =>
                          trips.setDailyWindow(window.date, "start", event.target.value)
                        }
                      />
                    </Field>
                    <Field data-invalid={window.start >= window.end || undefined}>
                      <FieldLabel htmlFor={`day-${window.date}-end`}>End</FieldLabel>
                      <Input
                        id={`day-${window.date}-end`}
                        type="time"
                        value={window.end}
                        aria-invalid={window.start >= window.end || undefined}
                        onChange={(event) =>
                          trips.setDailyWindow(window.date, "end", event.target.value)
                        }
                      />
                    </Field>
                  </FieldGroup>
                ) : (
                  <p>{window.start}–{window.end}</p>
                )}
                {window.start >= window.end && (
                  <p role="alert" className="text-sm text-destructive">
                    End must be later than start.
                  </p>
                )}
              </FieldSet>
            ))
          )}
        </CardContent>
      </Card>
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
        <CardContent className="flex flex-col gap-5">
          {trips.editing ? (
            <>
              <FieldSet>
                <FieldLegend className="sr-only">Primary transport</FieldLegend>
                <RadioGroup
                  value={trip.transportMode ?? ""}
                  onValueChange={(mode) => {
                    if (isPrimaryTransportMode(mode)) trips.setTransportMode(mode);
                  }}
                >
                  {TRANSPORT_MODES.map((mode) => {
                    const controlId = `primary-transport-${mode}`;
                    return (
                      <Field key={mode} className="min-h-11" orientation="horizontal">
                        <RadioGroupItem id={controlId} value={mode} />
                        <FieldLabel htmlFor={controlId} className="font-normal">
                          {TRANSPORT_MODE_LABELS[mode]}
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </RadioGroup>
              </FieldSet>
              <FieldSet>
                <FieldLegend variant="label">Short-walk tolerance</FieldLegend>
                <RadioGroup
                  value={String(trip.shortWalkMinutes)}
                  onValueChange={(value) =>
                    trips.setShortWalkMinutes(Number(value) as 0 | 5 | 10 | 15)
                  }
                >
                  {SHORT_WALK_OPTIONS.map((minutes) => {
                    const controlId = `short-walk-${minutes}`;
                    return (
                      <Field key={minutes} className="min-h-11" orientation="horizontal">
                        <RadioGroupItem id={controlId} value={String(minutes)} />
                        <FieldLabel htmlFor={controlId} className="font-normal">
                          {minutes === 0 ? "None" : `${minutes} minutes`}
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </RadioGroup>
              </FieldSet>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p>
                {trip.transportMode
                  ? TRANSPORT_MODE_LABELS[trip.transportMode]
                  : "Primary transport not chosen yet."}
              </p>
              <p>
                Short-walk tolerance: {trip.shortWalkMinutes === 0 ? "None" : `${trip.shortWalkMinutes} minutes`}
              </p>
            </div>
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
            <p role="status">Select at least one Destination before building an Itinerary.</p>
          )}
          {trip.destinations.length >= MAX_SELECTED_DESTINATIONS && (
            <p role="status" className="text-sm text-muted-foreground">
              Maximum reached: a Trip supports up to {MAX_SELECTED_DESTINATIONS} selected Destinations.
            </p>
          )}
          {selectedDestinations.map((destination, index) => {
            const override = trip.visitDurationOverrides[destination.id];
            const duration = override ?? destination.typicalVisitMinutes;
            return (
              <div key={destination.id} className="flex flex-col gap-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {trip.destinationOrder && `${index + 1}. `}{destination.name}
                  </span>
                  {trips.editing && (
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        disabled={index === 0}
                        aria-label={`Move ${destination.name} earlier`}
                        onClick={() => trips.moveDestination(destination.id, -1)}
                      >
                        <ArrowUpIcon data-icon="inline-start" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        disabled={index === selectedDestinations.length - 1}
                        aria-label={`Move ${destination.name} later`}
                        onClick={() => trips.moveDestination(destination.id, 1)}
                      >
                        <ArrowDownIcon data-icon="inline-start" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Remove ${destination.name} from Trip`}
                        onClick={() => trips.removeDestination(destination.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
                {trips.editing ? (
                  <Field data-invalid={!duration || undefined}>
                    <FieldLabel htmlFor={`visit-duration-${destination.id}`}>
                      Visit duration (minutes)
                    </FieldLabel>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        id={`visit-duration-${destination.id}`}
                        className="w-28"
                        type="number"
                        min={1}
                        step={5}
                        value={duration ?? ""}
                        aria-invalid={!duration || undefined}
                        onChange={(event) => {
                          const value = event.target.value;
                          trips.setVisitDuration(
                            destination.id,
                            value === "" ? null : Number(value),
                          );
                        }}
                      />
                      {override !== undefined ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => trips.setVisitDuration(destination.id, null)}
                        >
                          Use typical {destination.typicalVisitMinutes ? `(${destination.typicalVisitMinutes} min)` : "duration"}
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">Typical duration</span>
                      )}
                    </div>
                  </Field>
                ) : (
                  <p>{duration ? `${duration} minutes${override !== undefined ? " · overridden" : " · typical"}` : "Visit duration not set"}</p>
                )}
              </div>
            );
          })}
          {trip.destinations.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                Destination order: {trip.destinationOrder ? "Manual (hard constraint)" : "Optimize when built"}
              </span>
              {trips.editing && (
                trip.destinationOrder ? (
                  <Button variant="outline" size="sm" onClick={() => trips.optimizeDestinationOrder()}>
                    Optimize order
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => trips.useCurrentDestinationOrder()}>
                    Use current order
                  </Button>
                )
              )}
            </div>
          )}
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
