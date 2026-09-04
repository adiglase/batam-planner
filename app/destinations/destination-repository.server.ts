import type { Destination } from "./destination";

export interface DestinationRepository {
  listPublished(): Destination[];
}
