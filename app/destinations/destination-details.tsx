import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CalendarDaysIcon,
  Clock3Icon,
  GlobeIcon,
  InfoIcon,
  MapPinIcon,
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

/**
 * The complete curated English facts for one Published Destination.
 * Inspecting a Destination is view-only: it never changes Trip membership.
 */
export function DestinationDetails({
  destination,
  onBack,
}: {
  destination: Destination;
  onBack: () => void;
}) {
  const entryCost = destination.entryCost;
  const operatingHours = destination.operatingHours;
  const isTemporarilyClosed =
    destination.operationalStatus === "Temporarily closed";

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
