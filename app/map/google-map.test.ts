import { afterEach, describe, expect, it, vi } from "vitest";

import { googleMapsScriptUrl, loadGoogleMaps } from "./google-map";

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
