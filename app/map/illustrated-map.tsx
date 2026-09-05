import type { MapPresentation } from "./map-provider";
import { Badge } from "~/components/ui/badge";

export function IllustratedMap({
  markers,
  focusedDestinationId,
  onFocus,
}: MapPresentation) {
  return (
    <div className="illustrated-map">
      <div className="map-toolbar" aria-hidden="true">
        <Badge variant="secondary">Batam</Badge>
        <Badge variant="outline">Illustrated map</Badge>
      </div>
      <div className="island island-main" aria-hidden="true" />
      <div className="island island-south" aria-hidden="true" />
      <span className="map-place-label map-place-label-main">Batam</span>
      <span className="map-place-label map-place-label-south">Barelang</span>

      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          className="map-marker"
          aria-pressed={marker.id === focusedDestinationId}
          aria-label={`View details for ${marker.label}`}
          onClick={() => onFocus(marker.id)}
        >
          <span aria-hidden="true">•</span>
        </button>
      ))}

      <div className="map-caption" aria-live="polite">
        <strong>
          {markers.find(({ id }) => id === focusedDestinationId)?.label ??
            "Explore Batam"}
        </strong>
        <span>Focused Destination</span>
      </div>
    </div>
  );
}
