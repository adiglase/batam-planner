import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  PlusIcon,
  CalendarDaysIcon,
  CompassIcon,
  ListFilterIcon,
  LuggageIcon,
  MapPinIcon,
  RotateCcwIcon,
  SearchIcon,
  TriangleAlertIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react";
import { Link } from "react-router";

import { TripSwitcher } from "~/trips/trip-switcher";
import { useTrips } from "~/trips/use-trips";
import { reopeningSurface } from "~/trips/trip-repository";
import { DestinationSelection, TripSurface } from "~/trips/trip-controls";
import type { TripControls } from "~/trips/trip-controls";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "~/components/ui/drawer";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { Route } from "./+types/home";
import type { Destination } from "~/destinations/destination";
import { DESTINATION_CATEGORIES } from "~/destinations/destination";
import { DestinationDetails } from "~/destinations/destination-details";
import { DestinationPresentationCard } from "~/destinations/destination-presentation-card";
import { getDestinationRepository } from "~/destinations/sqlite-destination-repository.server";
import {
  filterPublishedDestinations,
  viewportBoundsFromCenterZoom,
} from "~/discovery/discovery";
import type { MapBounds } from "~/discovery/discovery";
import {
  loadDiscoverySession,
  saveDiscoverySession,
} from "~/discovery/discovery-session";
import { BATAM_MAP_CENTER } from "~/geography/coordinates";
import { ConfiguredMap } from "~/map/configured-map";
import { ItinerarySurface } from "~/itineraries/itinerary-surface";
import {
  fitRouteViewport,
  itineraryCoordinates,
  itineraryDayPresentation,
} from "~/itineraries/itinerary-workspace";
import { isAccommodation } from "~/trips/trip-repository";
import { browserRoutingProvider } from "~/routing/browser-routing-provider";
import type { RoutingProvider } from "~/routing/routing-provider";
import type { MapViewport } from "~/map/map-provider";
import { useConnectivity } from "~/lib/use-connectivity";

export function meta() {
  return [
    { title: "Discover Batam | Batam Planner" },
    {
      name: "description",
      content:
        "Browse owner-curated Batam Destinations and start shaping a Trip.",
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

type RestoreSnapshot = {
  focusedId: string | null;
  scrollTop: number;
  surface: Surface;
  mapViewport: MapViewport;
  search: string;
  categories: string[];
  areas: string[];
  appliedBounds: MapBounds | null;
};

export default function Home({ loaderData }: Route.ComponentProps) {
  const { destinations } = loaderData;
  const trips = useTrips(destinations);
  const connectivity = useConnectivity();
  const [tripListOpen, setTripListOpen] = useState(false);
  const [activeSurface, setActiveSurface] = useState<Surface>("discover");
  const [pendingTripInput, setPendingTripInput] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(
    destinations[0]?.id ?? null,
  );
  const [itineraryDayIndex, setItineraryDayIndex] = useState(0);
  const [focusedItineraryElement, setFocusedItineraryElement] = useState<
    string | null
  >(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [appliedBounds, setAppliedBounds] = useState<MapBounds | null>(null);
  const [visibleBounds, setVisibleBounds] = useState<MapBounds | null>(null);
  const [mapViewport, setMapViewport] = useState<MapViewport>({
    center: BATAM_MAP_CENTER,
    zoom: 10,
  });
  const [split, setSplit] = useState<Split>({ desktop: 60, mobile: 45 });
  const [phoneLayout, setPhoneLayout] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [mapAttempt, setMapAttempt] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const discoverRegionRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<RestoreSnapshot | null>(null);

  useEffect(() => {
    const media = window.matchMedia(PHONE_QUERY);
    const updateLayout = () => setPhoneLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  // Session-only discovery persistence. Trip data lives separately in
  // localStorage; this sessionStorage envelope starts neutral in a later
  // session. Loading in an effect avoids SSR hydration mismatches.
  useEffect(() => {
    const saved = loadDiscoverySession();
    if (saved.search) setSearch(saved.search);
    if (saved.categories.length > 0) setSelectedCategories(saved.categories);
    if (saved.areas.length > 0) setSelectedAreas(saved.areas);
    if (saved.appliedBounds) setAppliedBounds(saved.appliedBounds);
    if (
      saved.focusedId &&
      destinations.some(({ id }) => id === saved.focusedId)
    ) {
      setFocusedId(saved.focusedId);
    }
    if (saved.mapViewport) setMapViewport(saved.mapViewport);
    // Active Trip restoration owns the surface when one is present.
    setSessionRestored(true);
  }, [destinations]);

  useEffect(() => {
    if (!sessionRestored) return;
    saveDiscoverySession({
      search,
      categories: selectedCategories,
      areas: selectedAreas,
      appliedBounds,
      focusedId,
      mapViewport,
      surface: activeSurface,
    });
  }, [
    sessionRestored,
    search,
    selectedCategories,
    selectedAreas,
    appliedBounds,
    focusedId,
    mapViewport,
    activeSurface,
  ]);

  useEffect(() => {
    if (!trips.ready) return;
    setActiveSurface(
      trips.activeTrip && !trips.editing
        ? reopeningSurface(trips.activeTrip)
        : "discover",
    );
    setViewingId(null);
    restoreRef.current = null;
  }, [trips.ready, trips.activeTripId]);

  // Day selection and Itinerary focus are view state. Planning edits retain
  // both the last feasible Itinerary and its selected-day route. Only opening
  // another Trip or atomically storing a successful Build selects day one of
  // the replacement Itinerary.
  useEffect(() => {
    setItineraryDayIndex(0);
    setFocusedItineraryElement(null);
  }, [
    trips.activeTripId,
    trips.activeTrip?.itinerary?.inputRevision,
  ]);

  // Choosing another day is a view change: the previous day's focus id
  // exists in neither the new timeline nor its map, so it must not linger.
  const selectItineraryDay = useCallback((index: number) => {
    setItineraryDayIndex(index);
    setFocusedItineraryElement(null);
  }, []);

  const availableCategories = useMemo(() => {
    const present = new Set(
      destinations.map(({ primaryCategory }) => primaryCategory),
    );
    return DESTINATION_CATEGORIES.filter((category) => present.has(category));
  }, [destinations]);
  const availableAreas = useMemo(
    () =>
      [...new Set(destinations.map(({ area }) => area).filter(Boolean))].sort(
        (left, right) =>
          left.localeCompare(right, "en", { sensitivity: "base" }),
      ),
    [destinations],
  );

  // Search and filters operate on the full matching Published collection,
  // independent of the viewport. The viewport scope applies only when the
  // Visitor explicitly requests "Search this area".
  const baseFiltered = useMemo(
    () =>
      filterPublishedDestinations(destinations, {
        search,
        categories: selectedCategories,
        areas: selectedAreas,
        viewportBounds: null,
      }),
    [destinations, search, selectedCategories, selectedAreas],
  );
  const results = useMemo(
    () =>
      filterPublishedDestinations(destinations, {
        search,
        categories: selectedCategories,
        areas: selectedAreas,
        viewportBounds: appliedBounds,
      }),
    [destinations, search, selectedCategories, selectedAreas, appliedBounds],
  );

  const focusedDestination =
    results.find((destination) => destination.id === focusedId) ?? results[0];
  const mapMarkers = useMemo(
    () =>
      results.map((destination) => ({
        id: destination.id,
        label: destination.name,
        coordinates: destination.coordinates,
      })),
    [results],
  );

  // Presenting an Itinerary replaces the Destination collection with only
  // the selected day's ordered route, including its terminal or
  // Accommodation anchors. Deriving it here keeps the map and the timeline
  // reading the same read-only presentation.
  const activeItinerary = trips.activeTrip?.itinerary ?? null;
  const itineraryPresentation = useMemo(() => {
    if (activeSurface !== "itinerary" || !activeItinerary || !trips.activeTrip) {
      return null;
    }
    return itineraryDayPresentation(
      activeItinerary,
      itineraryDayIndex,
      itineraryCoordinates(trips.activeTrip),
    );
  }, [activeSurface, activeItinerary, itineraryDayIndex, trips.activeTrip]);

  // Fitting the map to the selected day is view-only. The presentation is
  // stable across focus and hover, so this runs once per day or Rebuild.
  useEffect(() => {
    if (!itineraryPresentation) return;
    const fit = fitRouteViewport(itineraryPresentation);
    if (fit) setMapViewport(fit);
  }, [itineraryPresentation]);

  const discoverViewport = useCallback(
    () =>
      discoverRegionRef.current?.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]',
      ) ?? null,
    [],
  );

  // Latest committed selection context for the stable openDetails below.
  // Keeping these in a ref prevents a new callback identity on every
  // selection, which previously retriggered the map marker effect.
  // Updated in an effect so the snapshot never captures an uncommitted
  // render or a mid-settle map position.
  const openContextRef = useRef({
    activeSurface,
    destinations,
    focusedId,
    mapViewport,
    viewingId,
    search,
    selectedCategories,
    selectedAreas,
    appliedBounds,
  });
  useEffect(() => {
    openContextRef.current = {
      activeSurface,
      destinations,
      focusedId,
      mapViewport,
      viewingId,
      search,
      selectedCategories,
      selectedAreas,
      appliedBounds,
    };
  }, [
    activeSurface,
    destinations,
    focusedId,
    mapViewport,
    viewingId,
    search,
    selectedCategories,
    selectedAreas,
    appliedBounds,
  ]);

  // Inspecting a Destination is view-only: opening details focuses the
  // Destination and never touches Trip state.
  // Only list selection recenters the map; map marker selection leaves
  // the viewport untouched so clicking a point never shifts the view.
  const openDetails = useCallback(
    (destinationId: string, centerMap = true) => {
      const snapshot = openContextRef.current;
      const destination = snapshot.destinations.find(
        ({ id }) => id === destinationId,
      );
      if (!destination) return;

      // Snapshot the results context once per details visit so moving
      // between Destinations via the map keeps the original context.
      if (!snapshot.viewingId) {
        restoreRef.current = {
          focusedId: snapshot.focusedId,
          scrollTop: discoverViewport()?.scrollTop ?? 0,
          surface: snapshot.activeSurface,
          mapViewport: snapshot.mapViewport,
          search: snapshot.search,
          categories: snapshot.selectedCategories,
          areas: snapshot.selectedAreas,
          appliedBounds: snapshot.appliedBounds,
        };
      }
      setFocusedId(destinationId);
      setViewingId(destinationId);
      setActiveSurface("discover");
      if (centerMap) {
        setMapViewport((current) => ({
          center: destination.coordinates,
          zoom: current.zoom,
        }));
      }
    },
    [discoverViewport],
  );

  const openFromMap = useCallback(
    (destinationId: string) => openDetails(destinationId, false),
    [openDetails],
  );

  // Hovering or keyboard-focusing a result highlights its marker without
  // opening details, keeping map, list, and focus synchronized.
  const focusDestination = useCallback(
    (destinationId: string) => {
      if (!destinations.some(({ id }) => id === destinationId)) return;
      setFocusedId((current) =>
        current === destinationId ? current : destinationId,
      );
    },
    [destinations],
  );

  const backToResults = useCallback(() => {
    setViewingId(null);
    const restore = restoreRef.current;
    if (!restore) return;
    setFocusedId(restore.focusedId);
    setActiveSurface(restore.surface);
    setMapViewport(restore.mapViewport);
    setSearch(restore.search);
    setSelectedCategories(restore.categories);
    setSelectedAreas(restore.areas);
    setAppliedBounds(restore.appliedBounds);
  }, []);

  const updateMapViewport = useCallback(
    (next: MapViewport, bounds: MapBounds | null) => {
      setMapViewport((current) => {
        if (
          current.zoom === next.zoom &&
          current.center.latitude === next.center.latitude &&
          current.center.longitude === next.center.longitude
        ) {
          return current;
        }
        return next;
      });
      // Map movement alone never changes results; it only refreshes the
      // bounds offered to an explicit "Search this area" request.
      setVisibleBounds(
        bounds ?? viewportBoundsFromCenterZoom(next.center, next.zoom),
      );
    },
    [],
  );

  const searchThisArea = useCallback(() => {
    if (visibleBounds) setAppliedBounds({ ...visibleBounds });
  }, [visibleBounds]);

  const showAllDestinations = useCallback(() => {
    setAppliedBounds(null);
  }, []);

  const clearSearchAndFilters = useCallback(() => {
    setSearch("");
    setSelectedCategories([]);
    setSelectedAreas([]);
  }, []);

  function toggleSelection(current: string[], value: string) {
    return current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
  }

  // Restore the exact results position after reversible detail navigation;
  // scroll to the top when details open.
  useEffect(() => {
    const viewport = discoverViewport();
    if (!viewport) return;
    if (viewingId) {
      viewport.scrollTop = 0;
    } else if (restoreRef.current) {
      viewport.scrollTop = restoreRef.current.scrollTop;
    }
  }, [discoverViewport, viewingId]);

  const viewingDestination = viewingId
    ? destinations.find((destination) => destination.id === viewingId)
    : undefined;

  useEffect(() => {
    if (activeSurface !== "trip" || !trips.editing || !pendingTripInput) return;
    const target = document.getElementById(pendingTripInput);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.focus({ preventScroll: true });
    setPendingTripInput(null);
  }, [activeSurface, pendingTripInput, trips.editing]);

  function reviewTripInput(targetId?: string) {
    trips.setEditing(true);
    setPendingTripInput(targetId ?? null);
    setActiveSurface("trip");
  }

  function startTrip() {
    trips.create();
    setSearch("");
    setSelectedCategories([]);
    setSelectedAreas([]);
    setAppliedBounds(null);
    setViewingId(null);
    restoreRef.current = null;
    setActiveSurface("discover");
    setTripListOpen(false);
  }

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

  const handleMapAvailability = useCallback((available: boolean) => {
    setMapUnavailable(!available);
  }, []);

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
        data-map-unavailable={mapUnavailable || undefined}
        style={
          {
            "--desktop-map-share": `${split.desktop}%`,
            "--mobile-map-share": `${split.mobile}%`,
          } as CSSProperties
        }
      >
        <section className="map-region" aria-label="Batam Destination map">
          <ConfiguredMap
            key={mapAttempt}
            markers={itineraryPresentation?.markers ?? mapMarkers}
            focusedElementId={
              itineraryPresentation
                ? focusedItineraryElement
                : focusedDestination?.id ?? null
            }
            route={itineraryPresentation?.route ?? null}
            viewport={mapViewport}
            visibleBounds={visibleBounds}
            onViewportChange={updateMapViewport}
            onOpenDestination={itineraryPresentation ? undefined : openFromMap}
            onFocusElement={
              itineraryPresentation
                ? setFocusedItineraryElement
                : focusDestination
            }
            onAvailabilityChange={handleMapAvailability}
          />
          {trips.editing && viewingDestination && (
            <div className="trip-map-selection">
              <span>{viewingDestination.name}</span>
              <DestinationSelection
                destination={viewingDestination}
                trips={trips}
              />
            </div>
          )}
          <div className="map-search-control">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!visibleBounds}
              onClick={searchThisArea}
              title={
                visibleBounds
                  ? "Limit results to the Destinations currently visible on the map"
                  : "Move the map to define a searchable area"
              }
            >
              <SearchIcon data-icon="inline-start" />
              Search this area
            </Button>
            {appliedBounds && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={showAllDestinations}
              >
                <RotateCcwIcon data-icon="inline-start" />
                All Batam
              </Button>
            )}
          </div>
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
          <div className="trip-workspace-header">
            <div className="flex min-w-0 flex-1 basis-full items-center gap-3 md:basis-auto">
              <TripSwitcher
                trips={trips}
                open={tripListOpen}
                onOpenChange={setTripListOpen}
                onCreate={startTrip}
                onChoose={(trip) => {
                  trips.open(trip.id);
                  setActiveSurface(reopeningSurface(trip));
                  setViewingId(null);
                  restoreRef.current = null;
                  setTripListOpen(false);
                }}
              />
              {trips.activeTrip && (
                <span
                  className="min-w-0 truncate text-sm"
                  title={trips.activeTrip.name || "Untitled Trip"}
                >
                  {trips.activeTrip.name || "Untitled Trip"}
                </span>
              )}
            </div>
            {!trips.activeTrip && (
              <Button disabled={!trips.ready} onClick={startTrip}>
                <PlusIcon data-icon="inline-start" />
                Create new trip
              </Button>
            )}
            {trips.activeTrip && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {trips.activeTrip.destinations.length} selected
                </span>
                <Button
                  onClick={() => {
                    if (trips.editing) {
                      trips.setEditing(false);
                      setActiveSurface("trip");
                      setViewingId(null);
                      restoreRef.current = null;
                    } else {
                      trips.setEditing(true);
                    }
                  }}
                >
                  {trips.editing ? "Done" : "Edit trip"}
                </Button>
              </div>
            )}
            {trips.failed && (
              <Alert variant="destructive">
                <TriangleAlertIcon aria-hidden="true" />
                <AlertTitle>This trip is not being saved</AlertTitle>
                <AlertDescription>
                  Your current Trip remains available on this page. Keep it open so you can inspect or manually recover the information.
                </AlertDescription>
                <AlertAction>
                  <Button size="sm" variant="outline" onClick={trips.retrySave}>
                    Retry
                  </Button>
                </AlertAction>
              </Alert>
            )}
            {!connectivity.connected && (
              <Alert variant="destructive">
                <WifiOffIcon aria-hidden="true" />
                <AlertTitle>Connection required</AlertTitle>
                <AlertDescription>
                  Saved Trip data is untouched. Reconnect to use maps and calculate Travel.
                </AlertDescription>
                <AlertAction>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={connectivity.checking}
                    onClick={() => void connectivity.retry()}
                  >
                    {connectivity.checking ? "Checking…" : "Retry"}
                  </Button>
                </AlertAction>
              </Alert>
            )}
            {mapUnavailable && (
              <Alert>
                <MapPinIcon aria-hidden="true" />
                <AlertTitle>Map unavailable</AlertTitle>
                <AlertDescription>
                  Continue planning with Discover, Trip details, and Itinerary.
                </AlertDescription>
                <AlertAction>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setMapUnavailable(false);
                      setMapAttempt((attempt) => attempt + 1);
                    }}
                  >
                    Retry
                  </Button>
                </AlertAction>
              </Alert>
            )}
          </div>
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
                Trip details
              </TabsTrigger>
              <TabsTrigger value="itinerary">
                <CalendarDaysIcon data-icon="inline-start" />
                Itinerary
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="surface-content" value="discover" keepMounted>
            <div ref={discoverRegionRef} className="surface-scroll-region">
              <DiscoverSurface
                trips={trips}
                onCreate={startTrip}
                destinations={destinations}
                results={results}
                baseCount={baseFiltered.length}
                focusedDestination={focusedDestination}
                viewingDestination={viewingDestination}
                routingProvider={browserRoutingProvider}
                search={search}
                onSearchChange={setSearch}
                availableCategories={availableCategories}
                selectedCategories={selectedCategories}
                onToggleCategory={(category) =>
                  setSelectedCategories((current) =>
                    toggleSelection(current, category),
                  )
                }
                availableAreas={availableAreas}
                selectedAreas={selectedAreas}
                onToggleArea={(area) =>
                  setSelectedAreas((current) => toggleSelection(current, area))
                }
                viewportScoped={appliedBounds !== null}
                phoneLayout={phoneLayout}
                onShowAll={showAllDestinations}
                onClearFilters={clearSearchAndFilters}
                onOpen={openDetails}
                onFocus={focusDestination}
                onBack={backToResults}
              />
            </div>
          </TabsContent>
          <TabsContent className="surface-content" value="trip">
            <ScrollArea className="surface-scroll">
              <div className="surface-layout">
                <TripSurface
                  trips={trips}
                  onCreate={startTrip}
                  onDiscover={() => {
                    trips.setEditing(true);
                    setViewingId(null);
                    setActiveSurface("discover");
                  }}
                  onDeleted={() => setViewingId(null)}
                />
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent className="surface-content" value="itinerary">
            <ScrollArea className="surface-scroll">
              <div className="surface-layout">
                <ItinerarySurface
                  trips={trips}
                  routingProvider={browserRoutingProvider}
                  publishedDestinations={destinations}
                  onReviewTrip={reviewTripInput}
                  dayIndex={itineraryDayIndex}
                  onSelectDay={selectItineraryDay}
                  focusedElementId={focusedItineraryElement}
                  onFocusElement={setFocusedItineraryElement}
                  connected={connectivity.connected}
                  onRetryConnection={connectivity.retry}
                />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function DiscoverSurface({
  trips,
  onCreate,
  destinations,
  results,
  baseCount,
  focusedDestination,
  viewingDestination,
  routingProvider,
  search,
  onSearchChange,
  availableCategories,
  selectedCategories,
  onToggleCategory,
  availableAreas,
  selectedAreas,
  onToggleArea,
  viewportScoped,
  phoneLayout,
  onShowAll,
  onClearFilters,
  onOpen,
  onFocus,
  onBack,
}: {
  trips: TripControls;
  onCreate: () => void;
  destinations: Destination[];
  results: Destination[];
  baseCount: number;
  focusedDestination?: Destination;
  viewingDestination?: Destination;
  routingProvider: RoutingProvider;
  search: string;
  onSearchChange: (value: string) => void;
  availableCategories: string[];
  selectedCategories: string[];
  onToggleCategory: (category: string) => void;
  availableAreas: string[];
  selectedAreas: string[];
  onToggleArea: (area: string) => void;
  viewportScoped: boolean;
  phoneLayout: boolean;
  onShowAll: () => void;
  onClearFilters: () => void;
  onOpen: (destinationId: string) => void;
  onFocus: (destinationId: string) => void;
  onBack: () => void;
}) {
  if (viewingDestination) {
    return (
      <ScrollArea className="surface-scroll">
        <div className="surface-layout">
          <DestinationSelection
            destination={viewingDestination}
            trips={trips}
          />
          <DestinationDetails
            destination={viewingDestination}
            onBack={onBack}
            accommodation={trips.activeTrip?.accommodation ?? null}
            transportMode={trips.activeTrip?.transportMode ?? null}
            routingProvider={routingProvider}
          />
        </div>
      </ScrollArea>
    );
  }

  const hasActiveSearchOrFilters =
    search.trim() !== "" ||
    selectedCategories.length > 0 ||
    selectedAreas.length > 0;
  const noViewportMatch =
    viewportScoped && baseCount > 0 && results.length === 0;
  const activeFilterCount = selectedCategories.length + selectedAreas.length;
  const filterFields = (
    <DiscoveryFilterFields
      availableCategories={availableCategories}
      selectedCategories={selectedCategories}
      onToggleCategory={onToggleCategory}
      availableAreas={availableAreas}
      selectedAreas={selectedAreas}
      onToggleArea={onToggleArea}
    />
  );

  return (
    <ScrollArea className="surface-scroll">
      <div className="surface-layout">
        <header className="surface-intro surface-intro-compact">
          <h1>
            {trips.editing
              ? "Choose your Destinations"
              : "Where do you want to go?"}
          </h1>
          <p>
            {trips.editing
              ? "Add the Destinations you want to visit. Choose Done to review your Trip."
              : "Explore owner-curated Batam Destinations."}
          </p>
        </header>

        {!trips.activeTrip && trips.ready && (
          <Empty className="items-start border bg-card p-5 text-left">
            <EmptyHeader className="items-start text-left">
              <EmptyTitle>Make a Trip of your own</EmptyTitle>
              <EmptyDescription>
                Create a Trip, choose the Destinations you want to visit, then
                review your selection. No dates or name needed to start.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="items-start">
              <Button onClick={onCreate}>
                <PlusIcon data-icon="inline-start" />
                Create new trip
              </Button>
              <p className="text-sm text-muted-foreground">
                Just exploring? Browse below and open any Destination for
                details.
              </p>
            </EmptyContent>
          </Empty>
        )}

        <section
          className="discovery-toolbar-shell"
          aria-label="Search and filter Destinations"
        >
          <div className="discovery-toolbar">
            <div className="discovery-search-input">
              <SearchIcon aria-hidden="true" />
              <Input
                id="destination-search"
                type="search"
                autoComplete="off"
                aria-label="Search Destinations"
                placeholder="Search Destinations"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
              {search !== "" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Clear search"
                  onClick={() => onSearchChange("")}
                >
                  <XIcon data-icon="inline-start" />
                </Button>
              )}
            </div>

            {phoneLayout ? (
              <Drawer showSwipeHandle>
                <DrawerTrigger
                  render={<Button type="button" variant="outline" />}
                >
                  <ListFilterIcon data-icon="inline-start" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary">{activeFilterCount}</Badge>
                  )}
                </DrawerTrigger>
                <DrawerContent>
                  <DrawerHeader>
                    <DrawerTitle>Filter Destinations</DrawerTitle>
                    <DrawerDescription>
                      Select any combination of categories and areas.
                    </DrawerDescription>
                  </DrawerHeader>
                  <div className="discovery-filter-drawer-body">
                    {filterFields}
                  </div>
                  <DrawerFooter>
                    <DrawerClose render={<Button type="button" />}>
                      Done
                    </DrawerClose>
                  </DrawerFooter>
                </DrawerContent>
              </Drawer>
            ) : (
              <Popover>
                <PopoverTrigger
                  render={<Button type="button" variant="outline" />}
                >
                  <ListFilterIcon data-icon="inline-start" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary">{activeFilterCount}</Badge>
                  )}
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="discovery-filter-popover"
                >
                  <PopoverHeader>
                    <PopoverTitle>Filter Destinations</PopoverTitle>
                    <PopoverDescription>
                      Select any combination of categories and areas.
                    </PopoverDescription>
                  </PopoverHeader>
                  {filterFields}
                </PopoverContent>
              </Popover>
            )}
          </div>

          {(activeFilterCount > 0 || viewportScoped) && (
            <div
              className="discovery-active-filters"
              aria-label="Active filters"
            >
              {selectedCategories.map((category) => (
                <Badge
                  key={category}
                  variant="secondary"
                  render={
                    <button
                      type="button"
                      aria-label={`Remove ${category} category filter`}
                      onClick={() => onToggleCategory(category)}
                    />
                  }
                >
                  {category}
                  <XIcon aria-hidden="true" />
                </Badge>
              ))}
              {selectedAreas.map((area) => (
                <Badge
                  key={area}
                  variant="secondary"
                  render={
                    <button
                      type="button"
                      aria-label={`Remove ${area} area filter`}
                      onClick={() => onToggleArea(area)}
                    />
                  }
                >
                  {area}
                  <XIcon aria-hidden="true" />
                </Badge>
              ))}
              {viewportScoped && (
                <Badge
                  variant="outline"
                  render={
                    <button
                      type="button"
                      aria-label="Show all Batam Destinations"
                      onClick={onShowAll}
                    />
                  }
                >
                  <MapPinIcon aria-hidden="true" />
                  Map area
                  <XIcon aria-hidden="true" />
                </Badge>
              )}
              {activeFilterCount > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={onClearFilters}
                >
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </section>

        <section
          className="destination-collection"
          aria-labelledby="destinations-title"
        >
          <div className="collection-heading">
            <div>
              <h2 id="destinations-title">Published Destinations</h2>
              <p aria-live="polite">
                {results.length === destinations.length
                  ? `Curated Destinations, ordered A–Z · ${results.length}`
                  : `${results.length} of ${destinations.length} Destinations, ordered A–Z`}
              </p>
            </div>
            <Badge variant="outline">{results.length}</Badge>
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
          ) : noViewportMatch ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No Destinations in this map area</EmptyTitle>
                <EmptyDescription>
                  {baseCount}{" "}
                  {baseCount === 1
                    ? "Destination matches"
                    : "Destinations match"}{" "}
                  your search and filters elsewhere in Batam, but none fall
                  inside the current map area.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="default"
                  className="min-h-11"
                  onClick={onShowAll}
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Show all Batam Destinations
                </Button>
                {hasActiveSearchOrFilters && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={onClearFilters}
                  >
                    Clear search &amp; filters
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          ) : results.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No matching Destinations</EmptyTitle>
                <EmptyDescription>
                  Nothing in the curated collection matches this search and
                  filter combination. Try a different spelling or fewer filters.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="default"
                  className="min-h-11"
                  onClick={onClearFilters}
                >
                  Clear search &amp; filters
                </Button>
                {viewportScoped && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={onShowAll}
                  >
                    <RotateCcwIcon data-icon="inline-start" />
                    Show all Batam Destinations
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          ) : (
            <div className="destination-grid">
              {results.map((destination) => {
                const isFocused = destination.id === focusedDestination?.id;

                return (
                  <div
                    key={destination.id}
                    onMouseEnter={() => onFocus(destination.id)}
                    onFocus={() => onFocus(destination.id)}
                  >
                    <DestinationPresentationCard
                      selectionControl={
                        trips.activeTrip &&
                        (trips.editing ||
                          trips.activeTrip.destinations.some(
                            ({ id }) => id === destination.id,
                          ) ||
                          isAccommodation(
                            trips.activeTrip,
                            destination.id,
                          )) ? (
                          <DestinationSelection
                            destination={destination}
                            trips={trips}
                          />
                        ) : undefined
                      }
                      destination={destination}
                      isFocused={isFocused}
                      onOpen={onOpen}
                      compact
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}

function DiscoveryFilterFields({
  availableCategories,
  selectedCategories,
  onToggleCategory,
  availableAreas,
  selectedAreas,
  onToggleArea,
}: {
  availableCategories: string[];
  selectedCategories: string[];
  onToggleCategory: (category: string) => void;
  availableAreas: string[];
  selectedAreas: string[];
  onToggleArea: (area: string) => void;
}) {
  return (
    <div className="discovery-filter-fields">
      {availableCategories.length > 0 && (
        <FieldSet>
          <FieldLegend variant="label">Category</FieldLegend>
          <FieldGroup className="discovery-filter-grid">
            {availableCategories.map((category) => {
              const controlId = `filter-category-${category
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")}`;
              return (
                <Field key={category} orientation="horizontal">
                  <Checkbox
                    id={controlId}
                    checked={selectedCategories.includes(category)}
                    onCheckedChange={() => onToggleCategory(category)}
                  />
                  <FieldLabel htmlFor={controlId} className="font-normal">
                    {category}
                  </FieldLabel>
                </Field>
              );
            })}
          </FieldGroup>
        </FieldSet>
      )}
      {availableAreas.length > 0 && (
        <FieldSet>
          <FieldLegend variant="label">Area</FieldLegend>
          <FieldGroup className="discovery-filter-grid">
            {availableAreas.map((area) => {
              const controlId = `filter-area-${area
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")}`;
              return (
                <Field key={area} orientation="horizontal">
                  <Checkbox
                    id={controlId}
                    checked={selectedAreas.includes(area)}
                    onCheckedChange={() => onToggleArea(area)}
                  />
                  <FieldLabel htmlFor={controlId} className="font-normal">
                    {area}
                  </FieldLabel>
                </Field>
              );
            })}
          </FieldGroup>
        </FieldSet>
      )}
    </div>
  );
}
