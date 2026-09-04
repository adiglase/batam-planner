import type { Coordinates } from "~/geography/coordinates";

export type OperationalStatus = "Open" | "Temporarily closed";

export type Destination = {
  id: string;
  slug: string;
  name: string;
  primaryCategory: string;
  area: string;
  description: string;
  coordinates: Coordinates;
  operationalStatus: OperationalStatus;
  typicalVisitMinutes: number;
  operatingHoursLabel: string;
  entryCostLabel: string;
  googleMapsUrl: string;
};
