import {
  ArrowUpRightIcon,
  CalendarDaysIcon,
  Clock3Icon,
  MapPinIcon,
  TicketIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import type {
  Destination,
  DestinationPreview,
} from "~/destinations/destination";
import {
  describeEntryCost,
  describeOperatingHours,
  entryCostText,
  formatVisitDuration,
  operatingHoursText,
} from "~/destinations/destination-facts";
import { DestinationMedia } from "~/destinations/destination-media";

export function DestinationPresentationCard({
  destination,
  isFocused = false,
  onFocus,
  onOpen,
}: {
  destination: Destination | DestinationPreview;
  isFocused?: boolean;
  onFocus?: (destinationId: string) => void;
  onOpen?: (destinationId: string) => void;
}) {
  const hasFacts = Boolean(
    destination.entryCostLabel ||
      destination.typicalVisitMinutes ||
      destination.operatingHoursLabel,
  );

  return (
    <Card>
      <DestinationMedia image={destination.image} />
      <CardHeader>
        <CardTitle>
          {onOpen ? (
            <button
              type="button"
              className="destination-name-button"
              aria-label={`View details for ${destination.name || "Destination"}`}
              onClick={() => onOpen(destination.id)}
            >
              {destination.name || "Untitled Destination"}
            </button>
          ) : (
            destination.name || "Untitled Destination"
          )}
        </CardTitle>
        {(destination.primaryCategory || destination.area) && (
          <CardDescription>
            {[destination.primaryCategory, destination.area]
              .filter(Boolean)
              .join(" · ")}
          </CardDescription>
        )}
        {onFocus && (
          <CardAction>
            {isFocused ? (
              <Badge variant="secondary">On map</Badge>
            ) : (
              <Button
                variant="outline"
                size="icon"
                aria-label={`Show ${destination.name || "Destination"} on map`}
                onClick={() => onFocus(destination.id)}
              >
                <MapPinIcon data-icon="inline-start" />
              </Button>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {destination.operationalStatus === "Temporarily closed" && (
          <Badge variant="secondary">
            <TriangleAlertIcon data-icon="inline-start" />
            Temporarily closed
          </Badge>
        )}
        {destination.description && (
          <p className="destination-description">{destination.description}</p>
        )}
        {hasFacts && (
          <>
            <Separator />
            <dl className="destination-facts">
              {destination.entryCostLabel && (
                <div>
                  <TicketIcon aria-hidden="true" />
                  <dt>Entry</dt>
                  <dd>
                    {entryCostText(
                      describeEntryCost(destination.entryCostLabel),
                    )}
                  </dd>
                </div>
              )}
              {destination.typicalVisitMinutes && (
                <div>
                  <Clock3Icon aria-hidden="true" />
                  <dt>Visit</dt>
                  <dd>{formatVisitDuration(destination.typicalVisitMinutes)}</dd>
                </div>
              )}
              {destination.operatingHoursLabel && (
                <div>
                  <CalendarDaysIcon aria-hidden="true" />
                  <dt>Hours</dt>
                  <dd>
                    {operatingHoursText(
                      describeOperatingHours(destination.operatingHoursLabel),
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </>
        )}
      </CardContent>
      {destination.googleMapsUrl && (
        <CardFooter>
          <a
            className={buttonVariants({
              variant: "default",
              className: "w-full",
            })}
            href={destination.googleMapsUrl}
            target="_blank"
            rel="noreferrer"
          >
            View in Google Maps
            <ArrowUpRightIcon data-icon="inline-end" />
          </a>
        </CardFooter>
      )}
    </Card>
  );
}
