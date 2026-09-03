import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

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
        <a className="brand" href="/" aria-label="Batam Planner home">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          <span>Batam Planner</span>
        </a>
        <span className="no-account-note">No account needed</span>
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

        <section className="workspace-region">
          <nav className="surface-tabs" aria-label="Planning workspace" role="tablist">
            {(["discover", "trip", "itinerary"] as const).map((surface) => (
              <button
                key={surface}
                type="button"
                role="tab"
                aria-selected={activeSurface === surface}
                aria-controls={`${surface}-surface`}
                className="surface-tab"
                onClick={() => setActiveSurface(surface)}
              >
                {surface[0].toUpperCase() + surface.slice(1)}
              </button>
            ))}
          </nav>

          <div className="surface-content">
            {activeSurface === "discover" && (
              <DiscoverSurface
                destinations={destinations}
                focusedDestination={focusedDestination}
                onFocus={setFocusedId}
              />
            )}
            {activeSurface === "trip" && (
              <EmptySurface
                id="trip-surface"
                eyebrow="Your Trip"
                title="No Trip yet"
                body="Create a Trip later when you are ready to select Destinations. Browsing remains commitment-free."
              />
            )}
            {activeSurface === "itinerary" && (
              <EmptySurface
                id="itinerary-surface"
                eyebrow="Your Itinerary"
                title="Nothing scheduled yet"
                body="A complete Itinerary will appear here after you create a Trip and explicitly build it."
              />
            )}
          </div>
        </section>
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
    <div id="discover-surface" role="tabpanel" className="discover-surface">
      <div>
        <p className="eyebrow">Owner-curated Destinations</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
          Discover Batam
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Browse Published Destinations freely. Looking around will not create or
          change a Trip.
        </p>
      </div>

      {destinations.length === 0 ? (
        <div className="empty-card">
          <h2>No Published Destinations</h2>
          <p>The curated collection is not available yet.</p>
        </div>
      ) : (
        <>
          <div className="destination-heading">
            <h2>Destinations</h2>
            <span>
              {destinations.length} curated · A–Z
            </span>
          </div>
          <div className="destination-list">
            {destinations.map((destination) => (
              <button
                key={destination.id}
                type="button"
                className="destination-card"
                aria-pressed={destination.id === focusedDestination?.id}
                onClick={() => onFocus(destination.id)}
              >
                <span className="destination-thumbnail" aria-hidden="true" />
                <span>
                  <strong>{destination.name}</strong>
                  <small>
                    {destination.primaryCategory} · {destination.area}
                  </small>
                </span>
                <span className="focus-arrow" aria-hidden="true">
                  →
                </span>
              </button>
            ))}
          </div>

          {focusedDestination && (
            <article className="destination-detail">
              <div className="detail-hero" aria-label="No Destination image available">
                <span>Image coming soon</span>
              </div>
              <p className="eyebrow">
                {focusedDestination.primaryCategory} · {focusedDestination.area}
              </p>
              <h2>{focusedDestination.name}</h2>
              <p>{focusedDestination.description}</p>
              <dl className="facts-grid">
                <div>
                  <dt>Entry cost</dt>
                  <dd>{focusedDestination.entryCostLabel}</dd>
                </div>
                <div>
                  <dt>Typical visit</dt>
                  <dd>{focusedDestination.typicalVisitMinutes} minutes</dd>
                </div>
                <div>
                  <dt>Operating hours</dt>
                  <dd>{focusedDestination.operatingHoursLabel}</dd>
                </div>
              </dl>
              <a
                className="maps-link"
                href={focusedDestination.googleMapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open in Google Maps <span aria-hidden="true">↗</span>
              </a>
            </article>
          )}
        </>
      )}
    </div>
  );
}

function EmptySurface({
  id,
  eyebrow,
  title,
  body,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div id={id} role="tabpanel" className="empty-surface">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    </div>
  );
}
