import { useEffect, useState } from "react";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  MapPinIcon,
  SquareIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { Separator } from "~/components/ui/separator";
import { Spinner } from "~/components/ui/spinner";
import type { Destination } from "~/destinations/destination";
import type { RoutingProvider } from "~/routing/routing-provider";
import {
  formatTravelDistance,
  formatTravelDuration,
  TRANSPORT_MODE_LABELS,
} from "~/routing/travel-estimate";
import type { TripControls } from "~/trips/trip-controls";
import { tripStatus } from "~/trips/trip-repository";
import {
  buildItinerary,
  formatItineraryTime,
} from "./itinerary-planner";
import type { BuildFailure } from "./itinerary-planner";

export function ItinerarySurface({
  trips,
  routingProvider,
  publishedDestinations,
  onReviewTrip,
}: {
  trips: TripControls;
  routingProvider: RoutingProvider;
  publishedDestinations: readonly Destination[];
  onReviewTrip: (targetId?: string) => void;
}) {
  const [building, setBuilding] = useState(false);
  const [failure, setFailure] = useState<BuildFailure | string | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const trip = trips.activeTrip;

  useEffect(() => {
    setFailure(null);
    setBuilding(false);
    setSelectedDay(0);
  }, [trip?.id, trip?.revision, trip?.itinerary?.inputRevision]);

  if (!trip) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No active Trip</EmptyTitle>
          <EmptyDescription>Create a Trip before building an Itinerary.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  async function build() {
    if (!trip || building) return;
    setBuilding(true);
    setFailure(null);
    const result = await buildItinerary(
      trip,
      routingProvider,
      publishedDestinations,
    );
    if (result.ok) {
      if (!trips.storeBuiltItinerary(trip.id, result.itinerary)) {
        setFailure("Trip inputs changed during the Build. Review them and build again.");
      }
    } else {
      setFailure(result);
    }
    setBuilding(false);
  }

  const itinerary = trip.itinerary;
  const needsRebuilding = tripStatus(trip) === "Needs rebuilding";
  if (!itinerary) {
    return (
      <div className="flex flex-col gap-4">
        {failure && (
          <BuildFailureAlert failure={failure} onReviewTrip={onReviewTrip} />
        )}
        <Empty className="border bg-card">
          <EmptyHeader>
            <CalendarDaysIcon aria-hidden="true" />
            <EmptyTitle>Build your Itinerary</EmptyTitle>
            <EmptyDescription>
              Every selected Destination and all terminal Travel must fit before a complete Itinerary is saved.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button disabled={building} onClick={build}>
              {building && <Spinner data-icon="inline-start" />}
              {building ? "Building…" : "Build itinerary"}
            </Button>
            <Button variant="outline" onClick={() => onReviewTrip()}>
              Review Trip inputs
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const day = itinerary.days[Math.min(selectedDay, itinerary.days.length - 1)];
  return (
    <div className="flex flex-col gap-4">
      <header className="surface-intro surface-intro-compact">
        <Badge variant="secondary">
          {needsRebuilding ? "Needs rebuilding" : "Itinerary ready"}
        </Badge>
        <h1>{itinerary.days.length === 1 ? day.date : `${itinerary.days[0].date}–${itinerary.days.at(-1)!.date}`}</h1>
        <p>Traffic-unaware estimates, non-live and not guaranteed.</p>
      </header>
      {needsRebuilding && (
        <Alert>
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>This Itinerary needs rebuilding</AlertTitle>
          <AlertDescription>
            It still shows the last successful Build. Trip inputs have changed.
          </AlertDescription>
        </Alert>
      )}
      {failure && (
        <BuildFailureAlert failure={failure} onReviewTrip={onReviewTrip} />
      )}
      {itinerary.warnings.map((warning) => (
        <Alert key={warning.code}>
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Accommodation not set</AlertTitle>
          <AlertDescription>{warning.message}</AlertDescription>
        </Alert>
      ))}
      {itinerary.days.length > 1 && (
        <div className="flex flex-wrap gap-2" aria-label="Itinerary days">
          {itinerary.days.map((item, index) => (
            <Button
              key={item.date}
              size="sm"
              variant={index === selectedDay ? "default" : "outline"}
              aria-pressed={index === selectedDay}
              onClick={() => setSelectedDay(index)}
            >
              Day {index + 1} · {item.date}
            </Button>
          ))}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Day timeline · {day.date}</CardTitle>
          <CardDescription>
            {formatItineraryTime(day.startSeconds)}–{formatItineraryTime(day.endSeconds)} · Visits and Travel are shown chronologically with no added buffers.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {day.entries.length === 0 && (
            <p className="text-sm text-muted-foreground">No Visits or Travel scheduled for this day.</p>
          )}
          {day.entries.map((entry, index) => (
            <div key={`${entry.kind}-${index}`} className="flex flex-col gap-3">
              {index > 0 && <Separator />}
              {entry.kind === "visit" ? (
                <div className="flex items-start gap-3">
                  <MapPinIcon aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{entry.destinationName}</span>
                    <span className="text-sm text-muted-foreground">
                      Visit · {formatItineraryTime(entry.startSeconds)}–{formatItineraryTime(entry.endSeconds)} · {entry.durationMinutes} min
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="font-medium">
                    Travel to {entry.destination.name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatItineraryTime(entry.startSeconds)}–{formatItineraryTime(entry.endSeconds)} · {formatTravelDuration(entry.estimate.durationSeconds)} · {formatTravelDistance(entry.estimate.distanceMeters)} · {TRANSPORT_MODE_LABELS[entry.estimate.mode]}
                  </span>
                  {entry.estimate.warnings.map((warning) => (
                    <span
                      key={warning.code}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <TriangleAlertIcon aria-hidden="true" />
                      {warning.message}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button disabled={building} onClick={build}>
          {building && <Spinner data-icon="inline-start" />}
          {building
            ? "Building…"
            : needsRebuilding
              ? "Rebuild itinerary"
              : "Build again"}
        </Button>
        <Button variant="outline" onClick={() => onReviewTrip()}>
          Review Trip inputs
        </Button>
      </div>
    </div>
  );
}

function BuildFailureAlert({
  failure,
  onReviewTrip,
}: {
  failure: BuildFailure | string;
  onReviewTrip: (targetId?: string) => void;
}) {
  if (typeof failure === "string") {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon aria-hidden="true" />
        <AlertTitle>No Itinerary was produced</AlertTitle>
        <AlertDescription>{failure}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>
        {failure.code === "missing-input"
          ? "Complete your Trip before building"
          : "No complete Itinerary fits"}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>{failure.message}</p>
        {failure.requirements && failure.requirements.length > 0 && (
          <ul className="flex flex-col gap-1" aria-label="Required Trip inputs">
            {failure.requirements.map((requirement) => (
              <li key={`${requirement.targetId}-${requirement.label}`}>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto justify-start px-0 text-left whitespace-normal"
                  onClick={() => onReviewTrip(requirement.targetId)}
                >
                  <SquareIcon data-icon="inline-start" />
                  {requirement.label}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {failure.suggestions.length > 0 && (
          <div className="flex flex-col gap-1">
            <strong>Possible corrections</strong>
            <ul className="flex flex-col items-start gap-1">
              {failure.suggestions.map((suggestion) => (
                <li key={`${suggestion.targetId}-${suggestion.label}`}>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto justify-start px-0 text-left whitespace-normal"
                    onClick={() => onReviewTrip(suggestion.targetId)}
                  >
                    {suggestion.label}
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
