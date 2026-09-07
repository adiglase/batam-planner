import { useEffect, useMemo, useState } from "react";

import {
  CLUSTER_MAX_ZOOM,
  clusterMarkers,
  isClusterActive,
  viewportBoundsFromCenterZoom,
} from "~/discovery/discovery";
import type { DestinationCluster } from "~/discovery/discovery";
import { BATAM_MAP_CENTER } from "~/geography/coordinates";
import type { Coordinates } from "~/geography/coordinates";
import { Badge } from "~/components/ui/badge";
import type { MapBounds, MapPresentation } from "./map-provider";

// Approximate Batam-wide extent used to project coordinates onto the
// illustration. Positions are schematic, not survey-grade.
const ILLUSTRATED_EXTENT = {
  minLatitude: 0.7,
  maxLatitude: 1.2,
  minLongitude: 103.9,
  maxLongitude: 104.3,
};

const MIN_ZOOM = 8;
const MAX_ZOOM = 15;

function projectToPercent(coordinates: Coordinates): { left: number; top: number } {
  const clamp = (value: number) => Math.min(94, Math.max(6, value));
  const left =
    ((coordinates.longitude - ILLUSTRATED_EXTENT.minLongitude) /
      (ILLUSTRATED_EXTENT.maxLongitude - ILLUSTRATED_EXTENT.minLongitude)) *
    100;
  const top =
    (1 -
      (coordinates.latitude - ILLUSTRATED_EXTENT.minLatitude) /
        (ILLUSTRATED_EXTENT.maxLatitude - ILLUSTRATED_EXTENT.minLatitude)) *
    100;
  return { left: clamp(left), top: clamp(top) };
}

function boundsEqual(left: MapBounds | null, right: MapBounds): boolean {
  if (!left) return false;
  return (
    left.north === right.north &&
    left.south === right.south &&
    left.east === right.east &&
    left.west === right.west
  );
}

export function IllustratedMap({
  markers,
  focusedDestinationId,
  viewport,
  visibleBounds,
  onViewportChange,
  onOpenDestination,
  onFocusDestination,
}: MapPresentation) {
  const [chooser, setChooser] = useState<DestinationCluster | null>(null);
  const clusters = useMemo(
    () => clusterMarkers(markers, viewport.zoom),
    [markers, viewport.zoom],
  );
  const markerById = useMemo(
    () => new Map(markers.map((marker) => [marker.id, marker])),
    [markers],
  );

  // The illustration has no native bounds, so it reports derived bounds for
  // the current viewport. "Search this area" in Discover uses these bounds;
  // moving or zooming here never filters results on its own.
  const derivedBounds = useMemo(
    () => viewportBoundsFromCenterZoom(viewport.center, viewport.zoom),
    [viewport.center, viewport.zoom],
  );
  useEffect(() => {
    if (!boundsEqual(visibleBounds, derivedBounds)) {
      onViewportChange(viewport, derivedBounds);
    }
  }, [derivedBounds, visibleBounds, viewport, onViewportChange]);

  useEffect(() => {
    if (!chooser) return;
    const stillPresent = chooser.memberIds.every((id) => markerById.has(id));
    if (!stillPresent) setChooser(null);
  }, [chooser, markerById]);

  useEffect(() => {
    if (!chooser) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChooser(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chooser]);

  function zoomToCluster(cluster: DestinationCluster) {
    // Shared coordinates cannot be disambiguated by zooming, so offer an
    // explicit chooser. Wider clusters zoom toward their members.
    if (cluster.sharedCoordinates) {
      setChooser(cluster);
      return;
    }
    const nextZoom = Math.min(viewport.zoom + 2, MAX_ZOOM);
    if (nextZoom === viewport.zoom) {
      setChooser(cluster);
      return;
    }
    const nextViewport = { center: cluster.coordinates, zoom: nextZoom };
    onViewportChange(
      nextViewport,
      viewportBoundsFromCenterZoom(nextViewport.center, nextViewport.zoom),
    );
  }

  function changeZoom(nextZoom: number) {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    if (clamped === viewport.zoom) return;
    const nextViewport = { center: viewport.center, zoom: clamped };
    onViewportChange(
      nextViewport,
      viewportBoundsFromCenterZoom(nextViewport.center, nextViewport.zoom),
    );
  }

  function resetView() {
    const nextViewport = { center: BATAM_MAP_CENTER, zoom: 10 };
    onViewportChange(
      nextViewport,
      viewportBoundsFromCenterZoom(nextViewport.center, nextViewport.zoom),
    );
  }

  return (
    <div className="illustrated-map">
      <div className="map-toolbar" aria-hidden="true">
        <Badge variant="secondary">Batam</Badge>
        <Badge variant="outline">Illustrated map</Badge>
      </div>
      <div
        className="map-zoom-controls"
        role="group"
        aria-label="Illustrated map zoom"
      >
        <button
          type="button"
          aria-label="Zoom in on illustrated map"
          onClick={() => changeZoom(viewport.zoom + 1)}
          disabled={viewport.zoom >= MAX_ZOOM}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out on illustrated map"
          onClick={() => changeZoom(viewport.zoom - 1)}
          disabled={viewport.zoom <= MIN_ZOOM}
        >
          −
        </button>
        <button type="button" aria-label="Reset illustrated map view" onClick={resetView}>
          Reset
        </button>
      </div>
      <div className="island island-main" aria-hidden="true" />
      <div className="island island-south" aria-hidden="true" />
      <span className="map-place-label map-place-label-main">Batam</span>
      <span className="map-place-label map-place-label-south">Barelang</span>

      {clusters.map((cluster) => {
        const position = projectToPercent(cluster.coordinates);
        if (cluster.count === 1) {
          const marker = markerById.get(cluster.memberIds[0]);
          if (!marker) return null;
          const selected = marker.id === focusedDestinationId;
          return (
            <button
              key={marker.id}
              type="button"
              className="map-marker"
              style={{ left: `${position.left}%`, top: `${position.top}%` }}
              aria-pressed={selected}
              aria-label={`View details for ${marker.label}`}
              onClick={() => onOpenDestination(marker.id)}
              onMouseEnter={() => onFocusDestination?.(marker.id)}
              onFocus={() => onFocusDestination?.(marker.id)}
            >
              <span aria-hidden="true">•</span>
            </button>
          );
        }
        const containsFocus = isClusterActive(cluster, focusedDestinationId);
        return (
          <button
            key={cluster.id}
            type="button"
            className="map-cluster"
            data-active={containsFocus}
            style={{ left: `${position.left}%`, top: `${position.top}%` }}
            aria-label={
              cluster.sharedCoordinates
                ? `${cluster.count} Destinations share this point. Choose one to inspect.`
                : `${cluster.count} Destinations clustered. Zoom in to separate them.`
            }
            onClick={() => zoomToCluster(cluster)}
          >
            <span aria-hidden="true">{cluster.count > 99 ? "99+" : cluster.count}</span>
          </button>
        );
      })}

      {chooser ? (
        <div
          className="map-chooser"
          role="dialog"
          aria-modal="false"
          aria-label={
            chooser.sharedCoordinates
              ? `${chooser.count} Destinations share this point`
              : `${chooser.count} Destinations close together`
          }
        >
          <div className="map-chooser-card">
            <strong>
              {chooser.sharedCoordinates
                ? `${chooser.count} Destinations share this point`
                : `${chooser.count} Destinations close together`}
            </strong>
            <span>
              {chooser.sharedCoordinates
                ? "Zooming cannot separate them. Choose one to inspect."
                : "They still overlap at this zoom. Choose one to inspect."}
            </span>
            <ul>
              {chooser.memberIds.map((memberId) => (
                <li key={memberId}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenDestination(memberId);
                      setChooser(null);
                    }}
                  >
                    {markerById.get(memberId)?.label ?? memberId}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setChooser(null)}>
              Close chooser
            </button>
          </div>
        </div>
      ) : null}

      <div className="map-caption" aria-live="polite">
        <strong>
          {markers.find(({ id }) => id === focusedDestinationId)?.label ??
            "Explore Batam"}
        </strong>
        <span>
          {viewport.zoom >= CLUSTER_MAX_ZOOM
            ? "Focused Destination"
            : "Focused Destination · zoom in to separate clusters"}
        </span>
      </div>
    </div>
  );
}
