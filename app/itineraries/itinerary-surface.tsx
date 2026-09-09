import { useEffect, useState } from "react";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  MapPinIcon,
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
import type { RoutingProvider } from "~/routing/routing-provider";
import {
  formatTravelDistance,
  formatTravelDuration,
  TRANSPORT_MODE_LABELS,
} from "~/routing/travel-estimate";
import type { TripControls } from "~/trips/trip-controls";
import { tripStatus } from "~/trips/trip-repository";
import {
  buildSameDayItinerary,
  formatItineraryTime,
} from "./same-day-planner";

export function ItinerarySurface({
  trips,
  routingProvider,
  onReviewTrip,
}: {
  trips: TripControls;
  routingProvider: RoutingProvider;
  onReviewTrip: () => void;
}) {
  const [building, setBuilding] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const trip = trips.activeTrip;

  useEffect(() => {
    setFailure(null);
    setBuilding(false);
  }, [trip?.id]);

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
    const result = await buildSameDayItinerary(trip, routingProvider);
    if (result.ok) {
      if (!trips.storeBuiltItinerary(trip.id, result.itinerary)) {
        setFailure("Trip inputs changed during the Build. Review them and build again.");
      }
    } else {
      setFailure(result.message);
    }
    setBuilding(false);
  }

  const itinerary = trip.itinerary;
  const needsRebuilding = tripStatus(trip) === "Needs rebuilding";
  if (!itinerary) {
    return (
      <div className="flex flex-col gap-4">
        {failure && (
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>No Itinerary was produced</AlertTitle>
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        )}
        <Empty className="border bg-card">
          <EmptyHeader>
            <CalendarDaysIcon aria-hidden="true" />
            <EmptyTitle>Build your same-day Itinerary</EmptyTitle>
            <EmptyDescription>
              Every selected Destination and all terminal Travel must fit before a complete Itinerary is saved.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button disabled={building} onClick={build}>
              {building && <Spinner data-icon="inline-start" />}
              {building ? "Building…" : "Build itinerary"}
            </Button>
            <Button variant="outline" onClick={onReviewTrip}>
              Review Trip inputs
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="surface-intro surface-intro-compact">
        <Badge variant="secondary">
          {needsRebuilding ? "Needs rebuilding" : "Itinerary ready"}
        </Badge>
        <h1>{itinerary.date}</h1>
        <p>
          {formatItineraryTime(itinerary.startSeconds)}–{formatItineraryTime(itinerary.endSeconds)} · Traffic-unaware estimates, non-live and not guaranteed.
        </p>
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
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Build failed</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Day timeline</CardTitle>
          <CardDescription>
            Visits and Travel are shown chronologically with no added ferry, pickup, parking, or uncertainty buffers.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {itinerary.entries.map((entry, index) => (
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
        <Button variant="outline" onClick={onReviewTrip}>
          Review Trip inputs
        </Button>
      </div>
    </div>
  );
}
