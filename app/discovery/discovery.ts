import type { Coordinates } from "~/geography/coordinates";
import type { Destination } from "~/destinations/destination";

export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type DiscoveryFilters = {
  search: string;
  categories: string[];
  areas: string[];
  viewportBounds: MapBounds | null;
};

export const DISCOVERY_DEFAULT_ZOOM = 10;
export const CLUSTER_MAX_ZOOM = 13;
const COORDINATE_EPSILON = 1e-9;

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

export function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  // Optimal string alignment: adjacent transpositions (e.g. "melur" ->
  // "melru") cost a single edit so common keystroke swaps stay matched.
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: columns }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + substitutionCost,
      );
      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      ) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }
  return matrix[left.length][right.length];
}

function toleranceFor(token: string): number {
  if (token.length <= 3) return 0;
  if (token.length <= 6) return 1;
  return 2;
}

function tokenMatchesHaystack(queryToken: string, haystackTokens: string[]): boolean {
  const tolerance = toleranceFor(queryToken);
  return haystackTokens.some((haystackToken) => {
    if (haystackToken.includes(queryToken) || queryToken.includes(haystackToken)) {
      return true;
    }
    if (tolerance === 0) return false;
    if (Math.abs(haystackToken.length - queryToken.length) > tolerance) {
      // Still allow prefix typos where one token is a truncated form.
      if (queryToken.length < 4 || haystackToken.length < 4) return false;
    }
    return levenshteinDistance(queryToken, haystackToken) <= tolerance;
  });
}

function destinationHaystack(destination: Destination): string[] {
  const fields = [
    destination.name,
    destination.primaryCategory,
    destination.area,
    ...(destination.factualTags ?? []),
  ];
  return fields.flatMap(tokenize);
}

export function matchesDiscoverySearch(
  destination: Destination,
  rawQuery: string,
): boolean {
  const queryTokens = tokenize(rawQuery);
  if (queryTokens.length === 0) return true;
  const haystack = destinationHaystack(destination);
  if (haystack.length === 0) return false;
  return queryTokens.every((queryToken) =>
    tokenMatchesHaystack(queryToken, haystack),
  );
}

export function sortPublishedByName(destinations: Destination[]): Destination[] {
  return [...destinations].sort((left, right) =>
    left.name.localeCompare(right.name, "en", { sensitivity: "base" }),
  );
}

export function viewportContainsBounds(
  bounds: MapBounds,
  coordinates: Coordinates,
): boolean {
  const withinLatitude =
    coordinates.latitude <= bounds.north + COORDINATE_EPSILON &&
    coordinates.latitude >= bounds.south - COORDINATE_EPSILON;
  const withinLongitude =
    coordinates.longitude <= bounds.east + COORDINATE_EPSILON &&
    coordinates.longitude >= bounds.west - COORDINATE_EPSILON;
  return withinLatitude && withinLongitude;
}

/** Approximate visible bounds for a center/zoom pair (used when a provider has no native bounds). */
export function viewportBoundsFromCenterZoom(
  center: Coordinates,
  zoom: number,
): MapBounds {
  const span = (360 / Math.pow(2, zoom)) * 1.5;
  const latitudeSpan = span;
  const longitudeSpan =
    span / Math.max(0.3, Math.cos((center.latitude * Math.PI) / 180));
  return {
    north: center.latitude + latitudeSpan / 2,
    south: center.latitude - latitudeSpan / 2,
    east: center.longitude + longitudeSpan / 2,
    west: center.longitude - longitudeSpan / 2,
  };
}

export function filterPublishedDestinations(
  destinations: Destination[],
  filters: DiscoveryFilters,
): Destination[] {
  const categorySet = new Set(filters.categories);
  const areaSet = new Set(filters.areas);
  const filtered = destinations.filter((destination) => {
    if (categorySet.size > 0 && !categorySet.has(destination.primaryCategory)) {
      return false;
    }
    if (areaSet.size > 0 && !areaSet.has(destination.area)) {
      return false;
    }
    if (!matchesDiscoverySearch(destination, filters.search)) {
      return false;
    }
    if (
      filters.viewportBounds &&
      !viewportContainsBounds(filters.viewportBounds, destination.coordinates)
    ) {
      return false;
    }
    return true;
  });
  return sortPublishedByName(filtered);
}

export type ClusterInput = {
  id: string;
  label: string;
  coordinates: Coordinates;
};

export type DestinationCluster = {
  id: string;
  coordinates: Coordinates;
  memberIds: string[];
  count: number;
  sharedCoordinates: boolean;
};

/** Whether a cluster contains the focused Destination (drives map emphasis). */
export function isClusterActive(
  cluster: DestinationCluster,
  focusedDestinationId: string | null,
): boolean {
  return (
    focusedDestinationId !== null &&
    cluster.memberIds.includes(focusedDestinationId)
  );
}

function gridSizeForZoom(zoom: number): number {
  return 360 / Math.pow(2, zoom + 2);
}

function coordinatesMatch(left: Coordinates, right: Coordinates): boolean {
  return (
    Math.abs(left.latitude - right.latitude) <= COORDINATE_EPSILON &&
    Math.abs(left.longitude - right.longitude) <= COORDINATE_EPSILON
  );
}

function centroidOf(members: ClusterInput[]): Coordinates {
  const latitude =
    members.reduce((sum, member) => sum + member.coordinates.latitude, 0) /
    members.length;
  const longitude =
    members.reduce((sum, member) => sum + member.coordinates.longitude, 0) /
    members.length;
  return { latitude, longitude };
}

export function groupSharedCoordinates(
  markers: ClusterInput[],
): DestinationCluster[] {
  const groups = new Map<string, ClusterInput[]>();
  for (const marker of markers) {
    const key = `${marker.coordinates.latitude.toFixed(6)}|${marker.coordinates.longitude.toFixed(6)}`;
    const group = groups.get(key);
    if (group) group.push(marker);
    else groups.set(key, [marker]);
  }
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      id: `shared-${group[0].id}`,
      coordinates: { ...group[0].coordinates },
      memberIds: group.map((member) => member.id),
      count: group.length,
      sharedCoordinates: true,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Route presentation shows every marker in Visit order instead of
 * clustering: numbered Visits must stay individually visible.
 */
export function singleMarkerClusters(
  markers: ClusterInput[],
): DestinationCluster[] {
  return markers.map((marker) => ({
    id: marker.id,
    coordinates: marker.coordinates,
    memberIds: [marker.id],
    count: 1,
    sharedCoordinates: false,
  }));
}

export function clusterMarkers(
  markers: ClusterInput[],
  zoom: number,
): DestinationCluster[] {
  if (markers.length === 0) return [];
  if (zoom >= CLUSTER_MAX_ZOOM) {
    // Even at the closest zoom, identical coordinates cannot be separated
    // by zooming, so shared-coordinate groups stay clustered (with a
    // chooser) while genuinely separable points become singletons.
    const byCoordinate = new Map<string, ClusterInput[]>();
    for (const marker of markers) {
      const key = `${marker.coordinates.latitude.toFixed(6)}|${marker.coordinates.longitude.toFixed(6)}`;
      const group = byCoordinate.get(key);
      if (group) group.push(marker);
      else byCoordinate.set(key, [marker]);
    }
    return [...byCoordinate.values()]
      .map((group) =>
        group.length === 1
          ? {
              id: group[0].id,
              coordinates: { ...group[0].coordinates },
              memberIds: [group[0].id],
              count: 1,
              sharedCoordinates: false,
            }
          : {
              id: `shared-${group.map((member) => member.id).sort()[0]}`,
              coordinates: { ...group[0].coordinates },
              memberIds: group.map((member) => member.id).sort(),
              count: group.length,
              sharedCoordinates: true,
            },
      )
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  const grid = gridSizeForZoom(zoom);
  const cells = new Map<string, ClusterInput[]>();
  for (const marker of markers) {
    const key = `${Math.floor(marker.coordinates.latitude / grid)}|${Math.floor(marker.coordinates.longitude / grid)}`;
    const cell = cells.get(key);
    if (cell) cell.push(marker);
    else cells.set(key, [marker]);
  }

  const clusters: DestinationCluster[] = [];
  for (const [key, cell] of cells) {
    if (cell.length === 1) {
      clusters.push({
        id: cell[0].id,
        coordinates: { ...cell[0].coordinates },
        memberIds: [cell[0].id],
        count: 1,
        sharedCoordinates: false,
      });
      continue;
    }
    const shared = cell.every((member) => coordinatesMatch(member.coordinates, cell[0].coordinates));
    clusters.push({
      id: `cluster-${key}`,
      coordinates: centroidOf(cell),
      memberIds: cell.map((member) => member.id).sort(),
      count: cell.length,
      sharedCoordinates: shared,
    });
  }
  clusters.sort((left, right) => left.id.localeCompare(right.id));
  return clusters;
}
