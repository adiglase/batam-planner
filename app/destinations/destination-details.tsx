import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  BedDoubleIcon,
  CalendarDaysIcon,
  Clock3Icon,
  GlobeIcon,
  InfoIcon,
  MapPinIcon,
  RouteIcon,
  TagIcon,
  TicketIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import type { Destination } from "~/destinations/destination";
import {
  entryCostText,
  formatVisitDuration,
  operatingHoursText,
} from "~/destinations/destination-facts";
import { DestinationMedia } from "~/destinations/destination-media";
import type { AccommodationRef } from "~/trips/trip-repository";
import type { PrimaryTransportMode } from "~/trips/trip-repository";
import { isAccommodation } from "~/trips/trip-repository";
import {
  formatTravelEstimate,
  TRANSPORT_MODE_LABELS,
} from "~/routing/travel-estimate";
import type { RoutingProvider } from "~/routing/routing-provider";
import { unavailableRoutingProvider } from "~/routing/routing-provider";
import { useTravelEstimate } from "~/routing/use-travel-estimate";

/**
 * The complete curated English facts for one Published Destination.
 * Inspecting a Destination is view-only: it never changes Trip membership.
 */
export function DestinationDetails({
  destination,
  onBack,
  accommodation = null,
  transportMode = null,
  routingProvider,
}: {
  destination: Destination;
  onBack: () => void;
  accommodation?: AccommodationRef | null;
  transportMode?: PrimaryTransportMode | null;
  routingProvider?: RoutingProvider;
}) {
  const entryCost = destination.entryCost;
  const operatingHours = destination.operatingHours;
  const isTemporarilyClosed =
    destination.operationalStatus === "Temporarily closed";
  const isAccommodationAnchor = isAccommodation(
    { accommodation },
    destination.id,
  );
  // One comparison only, from the Accommodation to this focused
  // Destination, requested through the provider-independent contract when
  // both Accommodation and transport are known. Never precomputed for
  // result lists and never drawn on the map.
  const travelStatus = useTravelEstimate({
    origin: accommodation?.coordinates ?? null,
    destination: destination.coordinates,
    mode:
      accommodation && transportMode && !isAccommodationAnchor
        ? transportMode
        : null,
    provider: routingProvider ?? unavailableRoutingProvider,
  });

  return (
    <div className="destination-detail-layout">
      <div>
        <Button variant="ghost" className="min-h-11" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to results
        </Button>
      </div>

      <article aria-label={destination.name}>
        <Card className="destination-detail">
          <DestinationMedia
            image={destination.image}
            className="destination-detail-media"
          />

          <CardHeader className="destination-detail-heading">
            <div className="destination-detail-badges">
              <Badge variant="secondary">{destination.primaryCategory}</Badge>
              {destination.area && (
                <Badge variant="outline">
                  <MapPinIcon data-icon="inline-start" />
                  {destination.area}
                </Badge>
              )}
              {isAccommodationAnchor && (
                <Badge variant="secondary">
                  <BedDoubleIcon data-icon="inline-start" />
                  Accommodation
                </Badge>
              )}
            </div>
            <CardTitle>
              <h1>{destination.name}</h1>
            </CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            {isTemporarilyClosed && (
              <Alert variant="destructive">
                <TriangleAlertIcon aria-hidden="true" />
                <AlertTitle>Temporarily closed</AlertTitle>
                <AlertDescription>
                  You can still inspect this Destination, but it is unavailable
                  for new Trip selection until it reopens.
                </AlertDescription>
              </Alert>
            )}

            <p className="destination-detail-description">
              {destination.description}
            </p>

            <Separator />

            <dl className="destination-detail-facts">
              {entryCost && (
                <div>
                  <TicketIcon aria-hidden="true" />
                  <dt>Entry cost</dt>
                  <dd>
                    {entryCostText(entryCost)}
                    {entryCost.qualification && (
                      <span className="destination-fact-note">
                        {entryCost.qualification}
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {destination.typicalVisitMinutes && (
                <div>
                  <Clock3Icon aria-hidden="true" />
                  <dt>Typical visit</dt>
                  <dd>{formatVisitDuration(destination.typicalVisitMinutes)}</dd>
                </div>
              )}
              {operatingHours && (
                <div>
                  <CalendarDaysIcon aria-hidden="true" />
                  <dt>Operating hours</dt>
                  <dd>
                    {operatingHoursText(operatingHours)}
                    {operatingHours.kind === "unknown" && (
                      <span className="destination-fact-note">
                        Check locally before visiting
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {destination.address && (
                <div>
                  <MapPinIcon aria-hidden="true" />
                  <dt>Address</dt>
                  <dd>{destination.address}</dd>
                </div>
              )}
              {destination.practicalNotes && (
                <div>
                  <InfoIcon aria-hidden="true" />
                  <dt>Practical notes</dt>
                  <dd>{destination.practicalNotes}</dd>
                </div>
              )}
            </dl>

            {destination.factualTags && destination.factualTags.length > 0 && (
              <div className="destination-detail-tags">
                <TagIcon aria-hidden="true" />
                <ul aria-label="Factual tags">
                  {destination.factualTags.map((tag) => (
                    <li key={tag}>
                      <Badge variant="outline">{tag}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <TravelFromAccommodation
              destinationName={destination.name}
              accommodationName={accommodation?.name ?? null}
              transportMode={transportMode}
              isAccommodation={isAccommodationAnchor}
              travelStatus={travelStatus}
            />

            <p className="destination-detail-assurance">
              Inspecting this Destination never changes your Trip.
            </p>
          </CardContent>

          <CardFooter className="destination-detail-actions">
            <a
              className={buttonVariants({
                variant: "default",
                className: "min-h-11",
              })}
              href={destination.googleMapsUrl}
              target="_blank"
              rel="noreferrer"
            >
              View in Google Maps
              <ArrowUpRightIcon data-icon="inline-end" />
            </a>
            {destination.officialWebsiteUrl && (
              <a
                className={buttonVariants({
                  variant: "outline",
                  className: "min-h-11",
                })}
                href={destination.officialWebsiteUrl}
                target="_blank"
                rel="noreferrer"
              >
                <GlobeIcon data-icon="inline-start" />
                Official website
                <ArrowUpRightIcon data-icon="inline-end" />
              </a>
            )}
          </CardFooter>
        </Card>
      </article>
    </div>
  );
}

/**
 * One traffic-unaware Travel comparison from the Trip's Accommodation to the
 * focused Destination. Rendered only in Destination details: never
 * precomputed across result lists and never drawn on the map. An
 * unavailable calculation reports unavailability without straight-line,
 * invented, or substituted information.
 */
function TravelFromAccommodation({
  destinationName,
  accommodationName,
  transportMode,
  isAccommodation,
  travelStatus,
}: {
  destinationName: string;
  accommodationName: string | null;
  transportMode: PrimaryTransportMode | null;
  isAccommodation: boolean;
  travelStatus: ReturnType<typeof useTravelEstimate>;
}) {
  return (
    <section aria-label="Travel from your Accommodation">
      <Separator />
      <div className="destination-detail-travel">
        <RouteIcon aria-hidden="true" />
        {isAccommodation ? (
          <p>
            This is your Accommodation. Travel estimates measure from here to
            other Destinations.
          </p>
        ) : !accommodationName ? (
          <p>Set an Accommodation to see a Travel estimate.</p>
        ) : !transportMode ? (
          <p>Choose Primary transport to see a Travel estimate.</p>
        ) : (
          <>
            <h2>From your Accommodation</h2>
            {travelStatus.state === "loading" && (
              <p aria-live="polite">Calculating travel…</p>
            )}
            {travelStatus.state === "ready" && (
              <>
                <p aria-live="polite">
                  {formatTravelEstimate(travelStatus.estimate)}
                  <span className="sr-only">
                    {" "}
                    to {destinationName} from {accommodationName} by{" "}
                    {TRANSPORT_MODE_LABELS[travelStatus.estimate.mode]}
                  </span>
                </p>
                <p className="destination-fact-note">
                  Traffic-unaware estimate · Non-live · Not guaranteed.
                </p>
                {travelStatus.estimate.warnings.map((warning) => (
                  <Alert key={warning.code}>
                    <TriangleAlertIcon aria-hidden="true" />
                    <AlertTitle>Travel direction caution</AlertTitle>
                    <AlertDescription>{warning.message}</AlertDescription>
                  </Alert>
                ))}
              </>
            )}
            {travelStatus.state === "unavailable" && (
              <>
                <p aria-live="polite">
                  {travelStatus.reason === "connection-required"
                    ? "Connection required"
                    : travelStatus.reason === "quota-exceeded"
                      ? "Travel calculations are temporarily at capacity"
                      : travelStatus.reason === "provider-unavailable"
                        ? "Travel calculations are temporarily unavailable"
                        : "Travel unavailable"}
                </p>
                <p className="destination-fact-note">
                  {travelStatus.reason === "connection-required"
                    ? "Reconnect before requesting a new Travel estimate."
                    : `We could not calculate Travel from ${accommodationName}. Distances and durations are shown only from measured road estimates.`}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
