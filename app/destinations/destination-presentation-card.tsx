import type { ReactNode } from "react";
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
  entryCostText,
  formatVisitDuration,
  operatingHoursText,
} from "~/destinations/destination-facts";
import { DestinationMedia } from "~/destinations/destination-media";
import { cn } from "~/lib/utils";

export function DestinationPresentationCard({
  destination,
  isFocused = false,
  onOpen,
  compact = false,
  selectionControl,
}: {
  destination: Destination | DestinationPreview;
  isFocused?: boolean;
  onOpen?: (destinationId: string) => void;
  compact?: boolean;
  selectionControl?: ReactNode;
}) {
  const hasFacts = Boolean(
    destination.entryCost ||
    destination.typicalVisitMinutes ||
    destination.operatingHours,
  );
  const hasWarning =
    destination.operationalStatus === "Temporarily closed" ||
    destination.operatingHours?.kind === "unknown";

  return (
    <Card
      size={compact ? "sm" : "default"}
      className={cn(compact && "destination-card-compact")}
    >
      <DestinationMedia
        image={destination.image}
        className={cn(compact && "destination-media-compact")}
      />
      <CardHeader>
        <CardTitle>
          {onOpen ? (
            <Button
              type="button"
              variant="link"
              className="h-auto min-h-11 justify-start whitespace-normal px-0 py-2 text-left"
              aria-label={`View details for ${destination.name || "Destination"}`}
              onClick={() => onOpen(destination.id)}
            >
              {destination.name || "Untitled Destination"}
            </Button>
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
        {onOpen && (
          <CardAction>
            <Button
              variant={isFocused ? "secondary" : "outline"}
              size="icon"
              className="size-11"
              aria-label={`View details for ${destination.name || "Destination"}`}
              onClick={() => onOpen(destination.id)}
            >
              <MapPinIcon data-icon="inline-start" />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {hasWarning && (
          <div className="flex flex-wrap gap-2">
            {destination.operationalStatus === "Temporarily closed" && (
              <Badge variant="secondary">
                <TriangleAlertIcon data-icon="inline-start" />
                Temporarily closed
              </Badge>
            )}
            {destination.operatingHours?.kind === "unknown" && (
              <Badge variant="secondary">
                <TriangleAlertIcon data-icon="inline-start" />
                Hours unknown
              </Badge>
            )}
          </div>
        )}
        {destination.description && (
          <p className="destination-description">{destination.description}</p>
        )}
        {hasFacts && (
          <>
            <Separator />
            <dl className="destination-facts">
              {destination.entryCost && (
                <div>
                  <TicketIcon aria-hidden="true" />
                  <dt>Entry</dt>
                  <dd>{entryCostText(destination.entryCost)}</dd>
                </div>
              )}
              {destination.typicalVisitMinutes && (
                <div>
                  <Clock3Icon aria-hidden="true" />
                  <dt>Visit</dt>
                  <dd>
                    {formatVisitDuration(destination.typicalVisitMinutes)}
                  </dd>
                </div>
              )}
              {destination.operatingHours && (
                <div>
                  <CalendarDaysIcon aria-hidden="true" />
                  <dt>Hours</dt>
                  <dd>{operatingHoursText(destination.operatingHours)}</dd>
                </div>
              )}
            </dl>
          </>
        )}
      </CardContent>
      {(destination.googleMapsUrl || selectionControl) && (
        <CardFooter className="flex flex-wrap gap-2">
          {selectionControl}
          {destination.googleMapsUrl && (
            <a
              className={buttonVariants({
                variant: selectionControl ? "ghost" : "outline",
                className: selectionControl ? "ml-auto" : "w-full",
              })}
              href={destination.googleMapsUrl}
              target="_blank"
              rel="noreferrer"
            >
              {compact ? "Maps" : "View in Google Maps"}
              <ArrowUpRightIcon data-icon="inline-end" />
            </a>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
