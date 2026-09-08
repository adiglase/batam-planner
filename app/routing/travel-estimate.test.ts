import { describe, expect, it } from "vitest";
import {
  formatTravelDistance,
  formatTravelDuration,
  formatTravelEstimate,
  TRANSPORT_MODE_LABELS,
} from "./travel-estimate";
import { unavailableRoutingProvider } from "./routing-provider";

describe("travel estimates through the provider-independent contract", () => {
  it("labels every Primary transport mode", () => {
    expect(TRANSPORT_MODE_LABELS.car).toBe("Car / taxi / ride-hailing");
    expect(TRANSPORT_MODE_LABELS.motorcycle).toBe("Motorcycle");
    expect(TRANSPORT_MODE_LABELS.walking).toBe("Walking");
  });
  it("formats road distances approximately", () => {
    expect(formatTravelDistance(850)).toBe("850 m");
    expect(formatTravelDistance(18000)).toBe("18.0 km");
    expect(formatTravelDistance(18500)).toBe("18.5 km");
  });
  it("formats durations approximately in whole minutes", () => {
    expect(formatTravelDuration(29 * 60)).toBe("29 min");
    expect(formatTravelDuration(65 * 60)).toBe("1 h 5 min");
    expect(formatTravelDuration(60 * 60)).toBe("1 h");
  });
  it("summarizes one Accommodation-to-Destination comparison", () => {
    expect(
      formatTravelEstimate({
        distanceMeters: 18000,
        durationSeconds: 29 * 60,
        mode: "car",
        geometry: [],
      }),
    ).toBe("About 29 min · 18.0 km by Car / taxi / ride-hailing");
  });
  it("reports unavailable without inventing information", async () => {
    await expect(
      unavailableRoutingProvider.estimateTravel({
        origin: { latitude: 1.13, longitude: 104.01 },
        destination: { latitude: 1.14, longitude: 104.0 },
        mode: "car",
      }),
    ).resolves.toBeNull();
  });
});
