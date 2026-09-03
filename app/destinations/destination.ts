import type { Coordinates } from "~/geography/coordinates";

export type Destination = {
  id: string;
  slug: string;
  name: string;
  primaryCategory: string;
  area: string;
  description: string;
  coordinates: Coordinates;
  operationalStatus: "Open" | "Temporarily closed";
  typicalVisitMinutes: number;
  operatingHoursLabel: string;
  entryCostLabel: string;
  googleMapsUrl: string;
};
