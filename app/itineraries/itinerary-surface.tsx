import { useEffect, useRef, useState } from "react";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  MapPinIcon,
  NavigationIcon,
  RouteIcon,
  SquareIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
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
import type {
  BuildFailure,
  ItineraryDay,
  ItineraryTravel,
  ItineraryVisit,
} from "./itinerary-planner";
import {
  googleMapsNavigationUrl,
  onTripState,
  travelElementId,
  visitElementId,
} from "./itinerary-workspace";
import type { OnTripState } from "./itinerary-workspace";

/**
 * The client-local Batam clock that drives on-trip emphasis. It starts null
 * so the server render and first client render agree, and refreshes while
 * the Visitor keeps the Itinerary open.
 */
function useBatamNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function ItinerarySurface({
  trips,
  routingProvider,
  publishedDestinations,
  onReviewTrip,
  dayIndex,
  onSelectDay,
  focusedElementId,
  onFocusElement,
}: {
  trips: TripControls;
  routingProvider: RoutingProvider;
  publishedDestinations: readonly Destination[];
  onReviewTrip: (targetId?: string) => void;
  dayIndex: number;
  onSelectDay: (index: number) => void;
  focusedElementId: string | null;
  onFocusElement: (elementId: string | null) => void;
}) {
  const [building, setBuilding] = useState(false);
  const [failure, setFailure] = useState<BuildFailure | string | null>(null);
  const timelineRef = useRef<HTMLOListElement>(null);
  const now = useBatamNow();
  const trip = trips.activeTrip;

  useEffect(() => {
    setFailure(null);
    setBuilding(false);
  }, [trip?.id, trip?.revision, trip?.itinerary?.inputRevision]);

  // Map-driven focus stays visible in the timeline. "nearest" leaves an
  // already-visible entry alone, so ordinary pointer movement over the
  // timeline itself never jumps the surface.
  useEffect(() => {
    if (!focusedElementId || !timelineRef.current) return;
    const target = [
      ...timelineRef.current.querySelectorAll<HTMLElement>("[data-element-id]"),
    ].find((element) => element.dataset.elementId === focusedElementId);
    target?.scrollIntoView({ block: "nearest" });
  }, [focusedElementId, dayIndex, trip?.itinerary]);

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

  const day = itinerary.days[Math.min(dayIndex, itinerary.days.length - 1)];
  const dayState = onTripState(day, now);
  const nextElementId = dayState.nextTravel
    ? travelElementId(dayState.nextTravel.origin.id, dayState.nextTravel.destination.id)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <header className="surface-intro surface-intro-compact">
        <Badge variant="secondary">
          {needsRebuilding ? "Needs rebuilding" : "Itinerary ready"}
        </Badge>
        <h1>
          {itinerary.days.length === 1
            ? day.date
            : `${itinerary.days[0].date}–${itinerary.days.at(-1)!.date}`}
        </h1>
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
      <div className="itinerary-actions">
        <Button disabled={building} onClick={build}>
          {building && <Spinner data-icon="inline-start" />}
          {building
            ? needsRebuilding
              ? "Rebuilding…"
              : "Building…"
            : needsRebuilding
              ? "Rebuild itinerary"
              : "Build again"}
        </Button>
        <Button variant="outline" onClick={() => onReviewTrip()}>
          Review Trip inputs
        </Button>
      </div>
      {itinerary.days.length > 1 && (
        <div className="flex flex-wrap gap-2" aria-label="Itinerary days">
          {itinerary.days.map((item, index) => (
            <Button
              key={item.date}
              size="sm"
              variant={index === dayIndex ? "default" : "outline"}
              aria-pressed={index === dayIndex}
              onClick={() => onSelectDay(index)}
            >
              Day {index + 1} · {item.date}
            </Button>
          ))}
        </div>
      )}
      <OnTripPanel
        day={day}
        state={dayState}
        focusedElementId={focusedElementId}
        onFocusElement={onFocusElement}
      />
      <Card>
        <CardHeader>
          <CardTitle>Day timeline · {day.date}</CardTitle>
          <CardDescription>
            {formatItineraryTime(day.startSeconds)}–{formatItineraryTime(day.endSeconds)} · Visits and Travel are shown chronologically with no added buffers.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {day.entries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No Visits or Travel scheduled for this day.
            </p>
          )}
          <ol ref={timelineRef} className="itinerary-timeline">
            {day.entries.map((entry) => {
              if (entry.kind === "visit") {
                return (
                  <TimelineVisit
                    key={visitElementId(entry.destinationId)}
                    entry={entry}
                    state={dayState}
                    focusedElementId={focusedElementId}
                    onFocusElement={onFocusElement}
                  />
                );
              }
              return (
                <TimelineTravel
                  key={travelElementId(entry.origin.id, entry.destination.id)}
                  entry={entry}
                  isNext={nextElementId === travelElementId(entry.origin.id, entry.destination.id)}
                  focusedElementId={focusedElementId}
                  onFocusElement={onFocusElement}
                />
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineVisit({
  entry,
  state,
  focusedElementId,
  onFocusElement,
}: {
  entry: ItineraryVisit;
  state: OnTripState;
  focusedElementId: string | null;
  onFocusElement: (elementId: string | null) => void;
}) {
  const elementId = visitElementId(entry.destinationId);
  const focused = elementId === focusedElementId;
  const current = state.currentVisit?.destinationId === entry.destinationId;
  const next = !current && state.nextVisit?.destinationId === entry.destinationId;
  return (
    <li
      className="itinerary-entry"
      data-element-id={elementId}
      data-focused={focused || undefined}
      data-current={current || undefined}
      tabIndex={0}
      aria-current={current ? "true" : undefined}
      aria-label={`Visit ${entry.destinationName}, ${formatItineraryTime(entry.startSeconds)} to ${formatItineraryTime(entry.endSeconds)}`}
      onMouseEnter={() => onFocusElement(elementId)}
      onFocus={() => onFocusElement(elementId)}
      onClick={() => onFocusElement(elementId)}
    >
      <span className="itinerary-entry-heading">
        <MapPinIcon aria-hidden="true" />
        <span className="font-medium">{entry.destinationName}</span>
        {current && <Badge>Now</Badge>}
        {next && <Badge variant="outline">Next</Badge>}
      </span>
      <span className="text-sm text-muted-foreground">
        Visit · {formatItineraryTime(entry.startSeconds)}–{formatItineraryTime(entry.endSeconds)} · {entry.durationMinutes} min
      </span>
    </li>
  );
}

function TimelineTravel({
  entry,
  isNext,
  focusedElementId,
  onFocusElement,
}: {
  entry: ItineraryTravel;
  isNext: boolean;
  focusedElementId: string | null;
  onFocusElement: (elementId: string | null) => void;
}) {
  const elementId = travelElementId(entry.origin.id, entry.destination.id);
  const focused = elementId === focusedElementId;
  return (
    <li
      className="itinerary-entry"
      data-element-id={elementId}
      data-focused={focused || undefined}
      data-next-leg={isNext || undefined}
      tabIndex={0}
      aria-label={`Travel from ${entry.origin.name} to ${entry.destination.name}, ${formatTravelDuration(entry.estimate.durationSeconds)} by ${TRANSPORT_MODE_LABELS[entry.estimate.mode]}`}
      onMouseEnter={() => onFocusElement(elementId)}
      onFocus={() => onFocusElement(elementId)}
      onClick={() => onFocusElement(elementId)}
    >
      <span className="itinerary-entry-heading">
        <RouteIcon aria-hidden="true" />
        <span className="font-medium">Travel to {entry.destination.name}</span>
        {isNext && <Badge>Next leg</Badge>}
      </span>
      <span className="text-sm text-muted-foreground">
        {formatItineraryTime(entry.startSeconds)}–{formatItineraryTime(entry.endSeconds)} · {formatTravelDuration(entry.estimate.durationSeconds)} · {formatTravelDistance(entry.estimate.distanceMeters)} · {TRANSPORT_MODE_LABELS[entry.estimate.mode]} · Traffic-unaware
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
      {/* The on-trip panel hands over the next leg; per-leg links let a
          Visitor preview any other leg of the selected day. */}
      <a
        className={buttonVariants({
          variant: isNext ? "default" : "outline",
          size: "sm",
          className: "min-h-11 self-start",
        })}
        href={googleMapsNavigationUrl(entry)}
        target="_blank"
        rel="noreferrer"
      >
        <NavigationIcon aria-hidden="true" data-icon="inline-start" />
        Open navigation
      </a>
    </li>
  );
}

/**
 * The on-trip emphasis: the Visit underway (or the first planned one), the
 * next Destination, the next leg to hand to navigation, and how much of the
 * selected day remains. A focused Visit or Travel leg temporarily becomes
 * the subject without changing any planning data.
 */
function OnTripPanel({
  day,
  state,
  focusedElementId,
  onFocusElement,
}: {
  day: ItineraryDay;
  state: OnTripState;
  focusedElementId: string | null;
  onFocusElement: (elementId: string | null) => void;
}) {
  const visits = day.entries.filter(
    (entry): entry is ItineraryVisit => entry.kind === "visit",
  );
  const focusedVisit = visits.find(
    (entry) => visitElementId(entry.destinationId) === focusedElementId,
  );
  const focusedTravel = day.entries.find(
    (entry): entry is ItineraryTravel =>
      entry.kind === "travel" &&
      travelElementId(entry.origin.id, entry.destination.id) === focusedElementId,
  );
  const subject = focusedVisit ?? state.currentVisit ?? state.nextVisit;
  const subjectLabel = focusedVisit
    ? "Focused Visit"
    : state.currentVisit
      ? "Now"
      : "Next";
  const remaining = state.remainingSeconds;

  return (
    <Card className="itinerary-on-trip">
      <CardHeader>
        <CardTitle>
          {state.isToday ? "On the road today" : "Planned day"}
        </CardTitle>
        <CardDescription>
          {state.isToday
            ? `Batam time now · ${formatItineraryTime(state.nowSeconds!)}`
            : "Not today in Batam. Planned times are unchanged."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="itinerary-on-trip-subject" data-empty={!subject || undefined}>
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{subjectLabel}</Badge>
            <strong>
              {subject
                ? subject.destinationName
                : state.isToday
                  ? "No Visit remaining today"
                  : "No Visit planned"}
            </strong>
          </span>
          {subject && (
            <span className="text-sm text-muted-foreground">
              Planned {formatItineraryTime(subject.startSeconds)}–{formatItineraryTime(subject.endSeconds)}
            </span>
          )}
        </div>
        <Separator />
        <dl className="itinerary-on-trip-facts">
          <div>
            <dt>Next Destination</dt>
            <dd>{state.nextVisit?.destinationName ?? "None planned"}</dd>
          </div>
          <div>
            <dt>Remaining day</dt>
            <dd>
              {remaining === null
                ? `${formatItineraryTime(day.startSeconds)}–${formatItineraryTime(day.endSeconds)}`
                : remaining === 0
                  ? "Day complete"
                  : `${formatTravelDuration(remaining)} until ${formatItineraryTime(day.endSeconds)}`}
            </dd>
          </div>
          <div>
            <dt>Planned times</dt>
            <dd>
              {formatItineraryTime(day.startSeconds)}–{formatItineraryTime(day.endSeconds)}
            </dd>
          </div>
        </dl>
        {focusedTravel && focusedTravel !== state.nextTravel && (
          <div className="itinerary-on-trip-leg">
            <span className="font-medium">{focusedTravel.origin.name} → {focusedTravel.destination.name}</span>
            <span className="text-sm text-muted-foreground">
              {formatTravelDuration(focusedTravel.estimate.durationSeconds)} · {TRANSPORT_MODE_LABELS[focusedTravel.estimate.mode]} · Traffic-unaware
            </span>
          </div>
        )}
        {state.nextTravel ? (
          <div className="itinerary-on-trip-leg">
            <span className="font-medium">
              Next leg · {state.nextTravel.origin.name} → {state.nextTravel.destination.name}
            </span>
            <span className="text-sm text-muted-foreground">
              {formatItineraryTime(state.nextTravel.startSeconds)}–{formatItineraryTime(state.nextTravel.endSeconds)} · {formatTravelDuration(state.nextTravel.estimate.durationSeconds)} · {TRANSPORT_MODE_LABELS[state.nextTravel.estimate.mode]}
            </span>
            {state.nextTravel.estimate.warnings.map((warning) => (
              <span key={warning.code} className="flex items-start gap-2 text-sm text-muted-foreground">
                <TriangleAlertIcon aria-hidden="true" />
                {warning.message}
              </span>
            ))}
            <a
              className={buttonVariants({
                variant: "default",
                className: "min-h-11 self-start",
              })}
              href={googleMapsNavigationUrl(state.nextTravel)}
              target="_blank"
              rel="noreferrer"
            >
              <NavigationIcon aria-hidden="true" data-icon="inline-start" />
              Open navigation
            </a>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No Travel leg remains in this day.
          </p>
        )}
        {focusedElementId && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => onFocusElement(null)}
          >
            Clear focus
          </Button>
        )}
      </CardContent>
    </Card>
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
