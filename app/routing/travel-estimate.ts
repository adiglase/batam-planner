import type {
  TransportMode,
  TravelEstimate,
} from "~/routing/routing-provider";

export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  car: "Car / taxi / ride-hailing",
  motorcycle: "Motorcycle",
  walking: "Walking",
};

/** Approximate distance, preferring kilometres with one decimal. */
export function formatTravelDistance(distanceMeters: number): string {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return "—";
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

/** Approximate duration, rounded to whole minutes. */
export function formatTravelDuration(durationSeconds: number): string {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) return "—";
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * One-line summary for the Accommodation-to-Destination comparison, e.g.
 * "About 29 min · 18.0 km by Car / taxi / ride-hailing".
 */
export function formatTravelEstimate(estimate: TravelEstimate): string {
  return `About ${formatTravelDuration(estimate.durationSeconds)} · ${formatTravelDistance(estimate.distanceMeters)} by ${TRANSPORT_MODE_LABELS[estimate.mode]}`;
}
