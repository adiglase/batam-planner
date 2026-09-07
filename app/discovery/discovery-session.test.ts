import { describe, expect, it } from "vitest";

import {
  DISCOVERY_SESSION_KEY,
  NEUTRAL_DISCOVERY_STATE,
  loadDiscoverySession,
  saveDiscoverySession,
} from "./discovery-session";

function memoryStorage(initial?: Record<string, string>) {
  const store = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  } as Storage;
}

describe("discovery session persistence", () => {
  it("starts from a neutral Batam-wide state when nothing is stored", () => {
    expect(loadDiscoverySession(memoryStorage())).toEqual(NEUTRAL_DISCOVERY_STATE);
    expect(NEUTRAL_DISCOVERY_STATE.appliedBounds).toBeNull();
    expect(NEUTRAL_DISCOVERY_STATE.surface).toBe("discover");
  });

  it("round-trips search, filters, viewport scope, and focus", () => {
    const storage = memoryStorage();
    saveDiscoverySession(
      {
        search: "melur",
        categories: ["Nature & beaches"],
        areas: ["Galang"],
        appliedBounds: { north: 1.2, south: 1.0, east: 104.1, west: 103.9 },
        focusedId: "destination-melur-beach",
        mapViewport: { center: { latitude: 1.05, longitude: 104.03 }, zoom: 11 },
        surface: "discover",
      },
      storage,
    );
    expect(storage.getItem(DISCOVERY_SESSION_KEY)).toContain("melur");
    expect(loadDiscoverySession(storage).search).toBe("melur");
    expect(loadDiscoverySession(storage).appliedBounds?.north).toBe(1.2);
  });

  it("recovers to neutral state on corrupt storage", () => {
    const storage = memoryStorage({ [DISCOVERY_SESSION_KEY]: "{not json" });
    expect(loadDiscoverySession(storage)).toEqual(NEUTRAL_DISCOVERY_STATE);
  });

  it("keeps discovery state in its own key, away from Trip data", () => {
    expect(DISCOVERY_SESSION_KEY).not.toContain("trip");
    expect(DISCOVERY_SESSION_KEY).toContain("discovery");
  });
});
