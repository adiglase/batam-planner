import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowUpRightIcon,
  CalendarDaysIcon,
  Clock3Icon,
  CompassIcon,
  LuggageIcon,
  MapPinIcon,
  TicketIcon,
} from "lucide-react";
import { Link } from "react-router";

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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/components/ui/tabs";
import type { Route } from "./+types/home";
import type { Destination } from "~/destinations/destination";
import { getDestinationRepository } from "~/destinations/sqlite-destination-repository.server";
import { ConfiguredMap } from "~/map/configured-map";

export function meta() {
  return [
    { title: "Discover Batam | Batam Planner" },
    {
      name: "description",
      content: "Browse owner-curated Batam Destinations and start shaping a Trip.",
    },
  ];
}

export function loader() {
  return { destinations: getDestinationRepository().listPublished() };
}

type Surface = "discover" | "trip" | "itinerary";
type Split = { desktop: number; mobile: number };

const MIN_REGION_SHARE = 35;
const MAX_REGION_SHARE = 65;
const PHONE_QUERY = "(max-width: 48rem)";

function clampRegionShare(value: number) {
  return Math.min(MAX_REGION_SHARE, Math.max(MIN_REGION_SHARE, value));
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { destinations } = loaderData;
  const [activeSurface, setActiveSurface] = useState<Surface>("discover");
  const [focusedId, setFocusedId] = useState(destinations[0]?.id ?? null);
  const [split, setSplit] = useState<Split>({ desktop: 60, mobile: 45 });
  const [phoneLayout, setPhoneLayout] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia(PHONE_QUERY);
    const updateLayout = () => setPhoneLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  const focusedDestination =
    destinations.find((destination) => destination.id === focusedId) ??
    destinations[0];
  const mapMarkers = useMemo(
    () =>
      destinations.map((destination) => ({
        id: destination.id,
        label: destination.name,
        coordinates: destination.coordinates,
      })),
    [destinations],
  );
  const focusFromMap = useCallback((destinationId: string) => {
    setFocusedId(destinationId);
    setActiveSurface("discover");
  }, []);

  function adjustSplit(delta: number) {
    const layout = phoneLayout ? "mobile" : "desktop";
    setSplit((current) => ({
      ...current,
      [layout]: clampRegionShare(current[layout] + delta),
    }));
  }

  function resizeFromPointer(clientX: number, clientY: number) {
    const shell = shellRef.current;
    if (!shell) return;

    const bounds = shell.getBoundingClientRect();
    const share = phoneLayout
      ? ((clientY - bounds.top) / bounds.height) * 100
      : ((clientX - bounds.left) / bounds.width) * 100;

    setSplit((current) => ({
      ...current,
      [phoneLayout ? "mobile" : "desktop"]: clampRegionShare(share),
    }));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Batam Planner home">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          <span>Batam Planner</span>
        </Link>
        <Badge className="ml-auto" variant="outline">
          No sign-in required
        </Badge>
      </header>

      <div
        ref={shellRef}
        className="workspace-shell"
        style={
          {
            "--desktop-map-share": `${split.desktop}%`,
            "--mobile-map-share": `${split.mobile}%`,
          } as CSSProperties
        }
      >
        <section className="map-region" aria-label="Batam Destination map">
          <ConfiguredMap
            markers={mapMarkers}
            focusedDestinationId={focusedDestination?.id ?? null}
            onFocus={focusFromMap}
          />
        </section>

        <div
          className="region-divider"
          role="separator"
          aria-label="Resize map and workspace"
          aria-orientation={phoneLayout ? "horizontal" : "vertical"}
          aria-valuemin={MIN_REGION_SHARE}
          aria-valuemax={MAX_REGION_SHARE}
          aria-valuenow={phoneLayout ? split.mobile : split.desktop}
          tabIndex={0}
          onKeyDown={(event) => {
            if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
              event.preventDefault();
              adjustSplit(-5);
            }
            if (["ArrowRight", "ArrowDown"].includes(event.key)) {
              event.preventDefault();
              adjustSplit(5);
            }
          }}
          onPointerDown={(event) => {
            draggingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (draggingRef.current) {
              resizeFromPointer(event.clientX, event.clientY);
            }
          }}
          onPointerUp={(event) => {
            draggingRef.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
        >
          <span aria-hidden="true" />
        </div>

        <Tabs
          className="workspace-region"
          value={activeSurface}
          onValueChange={(value) => setActiveSurface(value as Surface)}
        >
          <div className="workspace-tabs-shell">
            <TabsList
              className="grid w-full grid-cols-3"
              variant="line"
              aria-label="Planning workspace"
            >
              <TabsTrigger value="discover">
                <CompassIcon data-icon="inline-start" />
                Discover
              </TabsTrigger>
              <TabsTrigger value="trip">
                <LuggageIcon data-icon="inline-start" />
                Trip
              </TabsTrigger>
              <TabsTrigger value="itinerary">
                <CalendarDaysIcon data-icon="inline-start" />
                Itinerary
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="surface-content" value="discover">
            <DiscoverSurface
              destinations={destinations}
              focusedDestination={focusedDestination}
              onFocus={setFocusedId}
            />
          </TabsContent>
          <TabsContent className="surface-content" value="trip">
            <EmptySurface
              eyebrow="Your Trip"
              title="No Trip yet"
              body="Create a Trip later when you are ready to select Destinations. Browsing remains commitment-free."
            />
          </TabsContent>
          <TabsContent className="surface-content" value="itinerary">
            <EmptySurface
              eyebrow="Your Itinerary"
              title="Nothing scheduled yet"
              body="A complete Itinerary will appear here after you create a Trip and explicitly build it."
            />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function DiscoverSurface({
  destinations,
  focusedDestination,
  onFocus,
}: {
  destinations: Destination[];
  focusedDestination?: Destination;
  onFocus: (destinationId: string) => void;
}) {
  return (
    <ScrollArea className="surface-scroll">
      <div className="surface-layout">
        <header className="surface-intro">
          <Badge variant="secondary">Batam essentials</Badge>
          <h1>Where do you want to go?</h1>
          <p>
            Explore owner-curated Destinations without creating or changing a
            Trip.
          </p>
        </header>

        <section
          className="destination-collection"
          aria-labelledby="destinations-title"
        >
          <div className="collection-heading">
            <div>
              <h2 id="destinations-title">Published Destinations</h2>
              <p>Curated Destinations, ordered A–Z</p>
            </div>
            <Badge variant="outline">{destinations.length}</Badge>
          </div>

          {destinations.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No Published Destinations</EmptyTitle>
                <EmptyDescription>
                  The curated collection is not available yet.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="destination-grid">
              {destinations.map((destination) => {
                const isFocused = destination.id === focusedDestination?.id;

                return (
                  <Card key={destination.id}>
                    <CardHeader>
                      <CardTitle>{destination.name}</CardTitle>
                      <CardDescription>
                        {destination.primaryCategory} · {destination.area}
                      </CardDescription>
                      <CardAction>
                        {isFocused ? (
                          <Badge variant="secondary">On map</Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label={`Show ${destination.name} on map`}
                            onClick={() => onFocus(destination.id)}
                          >
                            <MapPinIcon data-icon="inline-start" />
                          </Button>
                        )}
                      </CardAction>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <p className="destination-description">
                        {destination.description}
                      </p>
                      <Separator />
                      <dl className="destination-facts">
                        <div>
                          <TicketIcon aria-hidden="true" />
                          <dt>Entry</dt>
                          <dd>{destination.entryCostLabel}</dd>
                        </div>
                        <div>
                          <Clock3Icon aria-hidden="true" />
                          <dt>Visit</dt>
                          <dd>{destination.typicalVisitMinutes} min</dd>
                        </div>
                        <div>
                          <CalendarDaysIcon aria-hidden="true" />
                          <dt>Hours</dt>
                          <dd>{destination.operatingHoursLabel}</dd>
                        </div>
                      </dl>
                    </CardContent>
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
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}

function EmptySurface({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <ScrollArea className="surface-scroll">
      <div className="empty-surface">
        <Empty>
          <EmptyHeader>
            <Badge variant="outline">{eyebrow}</Badge>
            <EmptyTitle>
              <h1>{title}</h1>
            </EmptyTitle>
            <EmptyDescription>{body}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </ScrollArea>
  );
}
