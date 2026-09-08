import {
  CheckIcon,
  ChevronDownIcon,
  LuggageIcon,
  PlusIcon,
} from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "~/components/ui/empty";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
  PopoverTrigger,
} from "~/components/ui/popover";
import type { Trip } from "./trip-repository";
import { tripStatus } from "./trip-repository";
import type { TripControls } from "./trip-controls";

export function TripSwitcher({
  trips,
  open,
  onOpenChange,
  onChoose,
  onCreate,
}: {
  trips: TripControls;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (trip: Trip) => void;
  onCreate: () => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            disabled={!trips.ready}
            className="min-h-11 shrink-0"
          />
        }
      >
        <LuggageIcon data-icon="inline-start" />
        My Trips
        <ChevronDownIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-96 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0"
      >
        <PopoverHeader className="p-4">
          <PopoverTitle>My Trips</PopoverTitle>
          <PopoverDescription>
            Choose a Trip to open its details.
          </PopoverDescription>
        </PopoverHeader>
        <Separator />
        <div className="max-h-[min(22rem,45dvh)] overflow-y-auto overscroll-contain p-2">
          {trips.trips.length === 0 ? (
            <Empty className="p-4">
              <EmptyHeader>
                <EmptyTitle>No saved Trips yet</EmptyTitle>
                <EmptyDescription>
                  Create your first Trip and choose the Destinations you want to
                  visit.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Saved Trips">
              {trips.trips.map((trip) => {
                const active = trip.id === trips.activeTripId;
                return (
                  <li key={trip.id}>
                    <Button
                      variant={active ? "secondary" : "ghost"}
                      className="h-auto min-h-24 w-full justify-start whitespace-normal p-3 text-left"
                      aria-current={active ? "true" : undefined}
                      onClick={() => onChoose(trip)}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-2">
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0 break-words">
                            {trip.name || "Untitled Trip"}
                          </span>
                          {active && (
                            <span className="flex shrink-0 items-center gap-1 text-xs">
                              <CheckIcon data-icon="inline-start" />
                              Active
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {[trip.dates.arrival, trip.dates.departure]
                            .filter(Boolean)
                            .join(" – ") || "Dates not set"}
                        </span>
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            {trip.destinations.length}{" "}
                            {trip.destinations.length === 1
                              ? "Destination"
                              : "Destinations"}
                          </span>
                          <Badge variant="outline">{tripStatus(trip)}</Badge>
                        </span>
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Separator />
        <div className="flex flex-col gap-2 p-3">
          <Button className="min-h-11 w-full" onClick={onCreate}>
            <PlusIcon data-icon="inline-start" />
            Create new trip
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Trips stay in this browser.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
