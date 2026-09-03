export type Destination = {
  id: string;
  slug: string;
  name: string;
  primaryCategory: string;
  area: string;
  description: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  operationalStatus: "Open" | "Temporarily closed";
  typicalVisitMinutes: number;
  operatingHoursLabel: string;
  entryCostLabel: string;
  googleMapsUrl: string;
};
