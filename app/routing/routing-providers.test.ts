import { describe, expect, it, vi } from "vitest";
import { createBrowserRoutingProvider } from "./browser-routing-provider";
import { createGoogleRoutesProvider } from "./google-routes-provider.server";

const input = {
  origin: { latitude: 1.13, longitude: 104.01 },
  destination: { latitude: 1.14, longitude: 104 },
  mode: "motorcycle" as const,
};

describe("Google Routes provider", () => {
  it("requests one traffic-unaware route and returns its distance and duration", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ routes: [{ distanceMeters: 18500, duration: "1740s" }] }),
    );
    const estimate = await createGoogleRoutesProvider(
      "server-key",
      fetcher,
    ).estimateTravel(input);

    expect(estimate).toEqual({
      distanceMeters: 18500,
      durationSeconds: 1740,
      mode: "motorcycle",
      geometry: [],
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
    );
    expect(init?.headers).toMatchObject({
      "X-Goog-Api-Key": "server-key",
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      travelMode: "TWO_WHEELER",
      routingPreference: "TRAFFIC_UNAWARE",
    });
  });

  it("reports unavailable when Google does not return a measured route", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ routes: [] }));
    await expect(
      createGoogleRoutesProvider("server-key", fetcher).estimateTravel(input),
    ).resolves.toBeNull();
  });

  it("omits the driving-only routing preference for walking", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ routes: [{ distanceMeters: 900, duration: "720s" }] }),
    );
    await createGoogleRoutesProvider("server-key", fetcher).estimateTravel({
      ...input,
      mode: "walking",
    });

    const [, init] = fetcher.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      origin: { location: { latLng: input.origin } },
      destination: { location: { latLng: input.destination } },
      travelMode: "WALK",
    });
  });
});

describe("browser routing provider", () => {
  it("requests the server adapter and accepts a matching estimate", async () => {
    const estimate = {
      distanceMeters: 18500,
      durationSeconds: 1740,
      mode: "motorcycle" as const,
      geometry: [],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ estimate }));

    await expect(
      createBrowserRoutingProvider(fetcher).estimateTravel(input),
    ).resolves.toEqual(estimate);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/travel-estimate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects malformed or mismatched responses as unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        estimate: {
          distanceMeters: 1,
          durationSeconds: 1,
          mode: "car",
          geometry: [],
        },
      }),
    );
    await expect(
      createBrowserRoutingProvider(fetcher).estimateTravel(input),
    ).resolves.toBeNull();
  });
});
