import { describe, expect, it } from "vitest";

import type { Destination } from "~/destinations/destination";
import {
  CLUSTER_MAX_ZOOM,
  clusterMarkers,
  filterPublishedDestinations,
  groupSharedCoordinates,
  isClusterActive,
  levenshteinDistance,
  matchesDiscoverySearch,
  sortPublishedByName,
  viewportBoundsFromCenterZoom,
  viewportContainsBounds,
} from "./discovery";

function destination(overrides: Partial<Destination> & { name: string }): Destination {
  return {
    id: overrides.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    slug: overrides.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    primaryCategory: "Nature & beaches",
    area: "Batam Center",
    description: "A test Destination",
    coordinates: { latitude: 1.05, longitude: 104.03 },
    operationalStatus: "Open",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=test",
    ...overrides,
  } as Destination;
}

describe("matchesDiscoverySearch", () => {
  const beach = destination({
    name: "Pantai Melur",
    primaryCategory: "Nature & beaches",
    area: "Galang",
    factualTags: ["Beach", "Swimming", "Sunset"],
  });

  it("matches names case-insensitively", () => {
    expect(matchesDiscoverySearch(beach, "pantai")).toBe(true);
    expect(matchesDiscoverySearch(beach, "MELUR")).toBe(true);
  });

  it("tolerates small typos in the name", () => {
    expect(matchesDiscoverySearch(beach, "Panti Melur")).toBe(true);
    expect(matchesDiscoverySearch(beach, "Melru")).toBe(true);
  });

  it("matches category, tags, and area", () => {
    expect(matchesDiscoverySearch(beach, "beaches")).toBe(true);
    expect(matchesDiscoverySearch(beach, "swimming")).toBe(true);
    expect(matchesDiscoverySearch(beach, "galang")).toBe(true);
    expect(matchesDiscoverySearch(beach, "sunsett")).toBe(true);
  });

  it("requires every query token to match somewhere", () => {
    expect(matchesDiscoverySearch(beach, "melur beach")).toBe(true);
    expect(matchesDiscoverySearch(beach, "melur mall")).toBe(false);
  });

  it("treats blank queries as matching everything", () => {
    expect(matchesDiscoverySearch(beach, "   ")).toBe(true);
  });
});

describe("levenshteinDistance", () => {
  it("measures single-character edits", () => {
    expect(levenshteinDistance("melur", "melru")).toBe(1);
    expect(levenshteinDistance("beach", "bech")).toBe(1);
    expect(levenshteinDistance("same", "same")).toBe(0);
  });
});

describe("sortPublishedByName", () => {
  it("orders names A-Z without mutating the input", () => {
    const input = [destination({ name: "Wey Wey" }), destination({ name: "Barelang Bridge" })];
    const sorted = sortPublishedByName(input);
    expect(sorted.map((item) => item.name)).toEqual(["Barelang Bridge", "Wey Wey"]);
    expect(input[0].name).toBe("Wey Wey");
  });
});

describe("filterPublishedDestinations", () => {
  const collection = sortPublishedByName([
    destination({ name: "Pantai Melur", area: "Galang", primaryCategory: "Nature & beaches" }),
    destination({ name: "Nagoya Hill", area: "Nagoya", primaryCategory: "Shopping" }),
    destination({ name: "Wey Wey Seafood", area: "Nagoya", primaryCategory: "Food & drink" }),
  ]);

  it("composes search with multi-select category and area filters", () => {
    expect(
      filterPublishedDestinations(collection, {
        search: "",
        categories: ["Shopping", "Food & drink"],
        areas: ["Nagoya"],
        viewportBounds: null,
      }).map((item) => item.name),
    ).toEqual(["Nagoya Hill", "Wey Wey Seafood"]);
  });

  it("applies search across the full collection, not a viewport subset", () => {
    const wide = filterPublishedDestinations(collection, {
      search: "seafood",
      categories: [],
      areas: [],
      viewportBounds: null,
    });
    const narrowedByViewport = filterPublishedDestinations(collection, {
      search: "seafood",
      categories: [],
      areas: [],
      viewportBounds: { north: 0, south: -1, east: 0, west: -1 },
    });
    expect(wide.map((item) => item.name)).toEqual(["Wey Wey Seafood"]);
    expect(narrowedByViewport).toEqual([]);
  });

  it("keeps results sorted A-Z after filtering", () => {
    const result = filterPublishedDestinations(collection, {
      search: "",
      categories: [],
      areas: ["Nagoya", "Galang"],
      viewportBounds: null,
    });
    expect(result.map((item) => item.name)).toEqual([
      "Nagoya Hill",
      "Pantai Melur",
      "Wey Wey Seafood",
    ]);
  });
});

describe("viewportContainsBounds", () => {
  const bounds = { north: 1.2, south: 1.0, east: 104.1, west: 103.9 };

  it("includes boundary coordinates", () => {
    expect(viewportContainsBounds(bounds, { latitude: 1.0, longitude: 103.9 })).toBe(true);
    expect(viewportContainsBounds(bounds, { latitude: 1.3, longitude: 104.0 })).toBe(false);
    expect(viewportContainsBounds(bounds, { latitude: 1.1, longitude: 104.2 })).toBe(false);
  });

  it("derives usable bounds from a center and zoom", () => {
    const derived = viewportBoundsFromCenterZoom(
      { latitude: 1.0456, longitude: 104.0305 },
      10,
    );
    expect(viewportContainsBounds(derived, { latitude: 1.0456, longitude: 104.0305 })).toBe(true);
    expect(derived.north).toBeGreaterThan(derived.south);
    expect(derived.east).toBeGreaterThan(derived.west);
  });
});

describe("clusterMarkers", () => {
  const markers = [
    { id: "a", label: "A", coordinates: { latitude: 1.141, longitude: 104.002 } },
    { id: "b", label: "B", coordinates: { latitude: 1.1445, longitude: 104.0045 } },
    { id: "c", label: "C", coordinates: { latitude: 0.771, longitude: 104.23 } },
  ];

  it("clusters nearby markers at wider views", () => {
    const clusters = clusterMarkers(markers, 8);
    const multi = clusters.filter((cluster) => cluster.count > 1);
    expect(multi.length).toBeGreaterThan(0);
    expect(clusters.reduce((sum, cluster) => sum + cluster.count, 0)).toBe(3);
  });

  it("returns singletons at close zoom for separable points", () => {
    const clusters = clusterMarkers(markers, CLUSTER_MAX_ZOOM);
    expect(clusters).toHaveLength(3);
    expect(clusters.every((cluster) => cluster.count === 1)).toBe(true);
  });

  it("keeps shared-coordinate groups clustered at close zoom", () => {
    const shared = [
      { id: "x", label: "X", coordinates: { latitude: 1.1, longitude: 104.0 } },
      { id: "y", label: "Y", coordinates: { latitude: 1.1, longitude: 104.0 } },
      { id: "z", label: "Z", coordinates: { latitude: 0.8, longitude: 104.2 } },
    ];
    const clusters = clusterMarkers(shared, CLUSTER_MAX_ZOOM);
    expect(clusters).toHaveLength(2);
    const pair = clusters.find((cluster) => cluster.count === 2);
    expect(pair?.sharedCoordinates).toBe(true);
    expect(pair?.memberIds).toEqual(["x", "y"]);
    const lone = clusters.find((cluster) => cluster.count === 1);
    expect(lone?.memberIds).toEqual(["z"]);
  });

  it("flags shared coordinates even inside a cluster", () => {
    const shared = [
      { id: "x", label: "X", coordinates: { latitude: 1.1, longitude: 104.0 } },
      { id: "y", label: "Y", coordinates: { latitude: 1.1, longitude: 104.0 } },
    ];
    const clusters = clusterMarkers(shared, 8);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].sharedCoordinates).toBe(true);
    expect(groupSharedCoordinates(shared)).toHaveLength(1);
    expect(groupSharedCoordinates(markers)).toEqual([]);
  });

  it("reports whether a cluster holds the focused Destination", () => {
    const clusters = clusterMarkers(
      [
        { id: "x", label: "X", coordinates: { latitude: 1.1, longitude: 104.0 } },
        { id: "y", label: "Y", coordinates: { latitude: 1.1, longitude: 104.0 } },
      ],
      8,
    );
    expect(clusters).toHaveLength(1);
    expect(isClusterActive(clusters[0], "x")).toBe(true);
    expect(isClusterActive(clusters[0], "other")).toBe(false);
    expect(isClusterActive(clusters[0], null)).toBe(false);
  });
});
