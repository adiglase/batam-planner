import { GoogleMap } from "./google-map";
import { IllustratedMap } from "./illustrated-map";
import type { MapPresentation } from "./map-provider";

export function ConfiguredMap({
  onAvailabilityChange,
  ...presentation
}: MapPresentation & {
  onAvailabilityChange?: (available: boolean) => void;
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return <IllustratedMap {...presentation} />;
  }

  return (
    <GoogleMap
      {...presentation}
      apiKey={apiKey}
      onAvailabilityChange={onAvailabilityChange}
    />
  );
}
