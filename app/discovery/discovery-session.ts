import type { Coordinates } from "~/geography/coordinates";
import type { MapBounds } from "./discovery";

export type PersistedDiscoveryState = {
  search: string;
  categories: string[];
  areas: string[];
  appliedBounds: MapBounds | null;
  focusedId: string | null;
  mapViewport: { center: Coordinates; zoom: number } | null;
  surface: "discover" | "trip" | "itinerary";
};

export const DISCOVERY_SESSION_KEY = "batam-planner:discovery:v1";

export const NEUTRAL_DISCOVERY_STATE: PersistedDiscoveryState = {
  search: "",
  categories: [],
  areas: [],
  appliedBounds: null,
  focusedId: null,
  mapViewport: null,
  surface: "discover",
};

/**
 * Session-only discovery persistence. sessionStorage survives reversible
 * in-session navigation and reloads but starts neutral in a later session
 * (a new tab/session gets fresh storage). Trip data lives separately in
 * localStorage and is never touched here.
 */
export function loadDiscoverySession(
  storage?: Storage | null,
): PersistedDiscoveryState {
  try {
    const source =
      storage ??
      (typeof sessionStorage === "undefined" ? null : sessionStorage);
    if (!source) return { ...NEUTRAL_DISCOVERY_STATE };
    const raw = source.getItem(DISCOVERY_SESSION_KEY);
    if (!raw) return { ...NEUTRAL_DISCOVERY_STATE };
    const parsed = JSON.parse(raw) as Partial<PersistedDiscoveryState>;
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      categories: Array.isArray(parsed.categories)
        ? parsed.categories.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      areas: Array.isArray(parsed.areas)
        ? parsed.areas.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      appliedBounds:
        parsed.appliedBounds &&
        typeof parsed.appliedBounds.north === "number" &&
        typeof parsed.appliedBounds.south === "number" &&
        typeof parsed.appliedBounds.east === "number" &&
        typeof parsed.appliedBounds.west === "number"
          ? parsed.appliedBounds
          : null,
      focusedId: typeof parsed.focusedId === "string" ? parsed.focusedId : null,
      mapViewport:
        parsed.mapViewport &&
        typeof parsed.mapViewport.center?.latitude === "number" &&
        typeof parsed.mapViewport.center?.longitude === "number" &&
        typeof parsed.mapViewport.zoom === "number"
          ? parsed.mapViewport
          : null,
      surface:
        parsed.surface === "trip" || parsed.surface === "itinerary"
          ? parsed.surface
          : "discover",
    };
  } catch {
    return { ...NEUTRAL_DISCOVERY_STATE };
  }
}

export function saveDiscoverySession(
  state: PersistedDiscoveryState,
  storage?: Storage | null,
): void {
  try {
    const target =
      storage ??
      (typeof sessionStorage === "undefined" ? null : sessionStorage);
    if (!target) return;
    target.setItem(DISCOVERY_SESSION_KEY, JSON.stringify(state));
  } catch {
    // Session persistence is best-effort; discovery still works in memory.
  }
}
