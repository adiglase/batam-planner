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
      Response.json({
        routes: [
          {
            distanceMeters: 18500,
            duration: "1740s",
            polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
          },
        ],
      }),
    );
    const estimate = await createGoogleRoutesProvider(
      "server-key",
      fetcher,
    ).estimateTravel(input);

    expect(estimate).toEqual({
      distanceMeters: 18500,
      durationSeconds: 1740,
      mode: "motorcycle",
      geometry: [
        { latitude: 38.5, longitude: -120.2 },
        { latitude: 40.7, longitude: -120.95 },
        { latitude: 43.252, longitude: -126.453 },
      ],
      warnings: [
        {
          code: "two-wheel-route-limitations",
          message:
            "Motorcycle directions are in beta and may be missing suitable two-wheel routes.",
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
    );
    expect(init?.headers).toMatchObject({
      "X-Goog-Api-Key": "server-key",
      "X-Goog-FieldMask":
        "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
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
      Response.json({
        routes: [
          {
            distanceMeters: 900,
            duration: "720s",
            polyline: { encodedPolyline: "??" },
          },
        ],
      }),
    );
    const estimate = await createGoogleRoutesProvider(
      "server-key",
      fetcher,
    ).estimateTravel({
      ...input,
      mode: "walking",
    });

    expect(estimate?.warnings).toEqual([
      {
        code: "walking-route-limitations",
        message:
          "Walking directions are in beta and may be missing clear sidewalks or pedestrian paths.",
      },
    ]);
    const [, init] = fetcher.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      origin: { location: { latLng: input.origin } },
      destination: { location: { latLng: input.destination } },
      travelMode: "WALK",
    });
  });

  it("maps car behavior to a traffic-unaware drive request without a route warning", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        routes: [
          {
            distanceMeters: 900,
            duration: "720s",
            polyline: { encodedPolyline: "??" },
          },
        ],
      }),
    );
    const estimate = await createGoogleRoutesProvider(
      "server-key",
      fetcher,
    ).estimateTravel({ ...input, mode: "car" });

    expect(estimate?.warnings).toEqual([]);
    const [, init] = fetcher.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
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
      warnings: [
        {
          code: "two-wheel-route-limitations",
          message: "Translated provider caution",
        },
      ],
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
