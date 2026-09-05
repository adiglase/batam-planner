import { describe, expect, it } from "vitest";

import { googleMapsScriptUrl } from "./google-map";

describe("googleMapsScriptUrl", () => {
  it("requests Google's asynchronous loading strategy", () => {
    const source = googleMapsScriptUrl("test-key");

    expect(source.searchParams.get("loading")).toBe("async");
  });
});
