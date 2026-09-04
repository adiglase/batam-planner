import type { Coordinates } from "~/geography/coordinates";

export type OperationalStatus = "Open" | "Temporarily closed";

export const DESTINATION_CATEGORIES = [
  "Attractions & landmarks",
  "Nature & beaches",
  "Food & drink",
  "Shopping",
  "Culture & worship",
  "Spa & wellness",
  "Entertainment & nightlife",
  "Accommodation",
] as const;

export type DestinationCategory = (typeof DESTINATION_CATEGORIES)[number];

export type DestinationImage = {
  url: string;
  altText: string;
};

export type Destination = {
  id: string;
  slug: string;
  name: string;
  primaryCategory: DestinationCategory;
  area: string;
  description: string;
  coordinates: Coordinates;
  operationalStatus: OperationalStatus;
  typicalVisitMinutes?: number;
  operatingHoursLabel?: string;
  entryCostLabel?: string;
  googleMapsUrl: string;
  image?: DestinationImage;
};

export type DestinationCandidate = {
  name: string;
  primaryCategory: DestinationCategory | "";
  area: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  operationalStatus: OperationalStatus | "";
  typicalVisitMinutes: number | null;
  operatingHoursLabel: string;
  entryCostLabel: string;
  googleMapsUrl: string;
  imageUrl: string;
  imageAltText: string;
  imageRightsSource: string;
};

export type DraftDestination = {
  id: string;
  destinationId: string;
  candidate: DestinationCandidate;
  replacesPublished: boolean;
  updatedAt: string;
};

export type DestinationPreview = {
  id: string;
  name: string;
  primaryCategory?: DestinationCategory;
  area?: string;
  description?: string;
  coordinates?: Coordinates;
  operationalStatus?: OperationalStatus;
  typicalVisitMinutes?: number;
  operatingHoursLabel?: string;
  entryCostLabel?: string;
  googleMapsUrl?: string;
  image?: DestinationImage;
};
