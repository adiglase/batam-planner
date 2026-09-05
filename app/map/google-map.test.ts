import { afterEach, describe, expect, it, vi } from "vitest";

import {
  googleMapsScriptUrl,
  isMapViewportSynced,
  loadGoogleMaps,
} from "./google-map";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("googleMapsScriptUrl", () => {
  it("requests Google's asynchronous loading strategy", () => {
    const source = googleMapsScriptUrl("test-key");

    expect(source.searchParams.get("loading")).toBe("async");
  });

  it("waits for the Maps API readiness callback", async () => {
    const maps = {};
    const fakeWindow: Record<string, unknown> = {};
    const script = {
      async: false,
      onerror: null as null | (() => void),
      onload: null as null | (() => void),
      remove: vi.fn(),
      src: "",
    };
    const fakeDocument = {
      createElement: () => script,
      head: {
        append: () => {
          const callbackName = new URL(script.src).searchParams.get("callback");
          if (!callbackName) {
            script.onload?.();
            return;
          }

          fakeWindow.google = { maps };
          const callback = fakeWindow[callbackName] as (() => void) | undefined;
          callback?.();
        },
      },
    };
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("document", fakeDocument);

    await expect(loadGoogleMaps("test-key")).resolves.toBe(maps);
  });
});

describe("isMapViewportSynced", () => {
  const desired = {
    center: { latitude: 1.0456, longitude: 104.0305 },
    zoom: 10,
  };

  it("treats an exact match as synced", () => {
    expect(
      isMapViewportSynced(
        { latitude: 1.0456, longitude: 104.0305, zoom: 10 },
        desired,
      ),
    ).toBe(true);
  });

  it("ignores float noise from the Maps API round-trip", () => {
    expect(
      isMapViewportSynced(
        { latitude: 1.0456000000001, longitude: 104.0305, zoom: 10 },
        desired,
      ),
    ).toBe(true);
  });

  it("detects a real center drift", () => {
    expect(
      isMapViewportSynced(
        { latitude: 1.13, longitude: 104.03, zoom: 10 },
        desired,
      ),
    ).toBe(false);
  });

  it("detects a zoom change", () => {
    expect(
      isMapViewportSynced(
        { latitude: 1.0456, longitude: 104.0305, zoom: 12 },
        desired,
      ),
    ).toBe(false);
  });

  it("treats a missing reading as drifted", () => {
    expect(isMapViewportSynced(undefined, desired)).toBe(false);
  });
});
