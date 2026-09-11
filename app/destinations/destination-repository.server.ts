import type {
  Destination,
  DestinationCandidate,
  DraftDestination,
  DestinationPreview,
} from "./destination";

export type PublishErrors = Partial<Record<keyof DestinationCandidate, string>>;

export type PublishResult =
  | { ok: true; destinationId: string }
  | { ok: false; errors: PublishErrors };

export type OwnerDestination = {
  destinationId: string;
  published?: Destination;
  draft?: DraftDestination;
  lifecycleStatus?: "Published" | "Archived";
};

export interface DestinationRepository {
  listPublished(): Destination[];
  listForOwner(): OwnerDestination[];
  createDraft(): DraftDestination;
  getDraft(id: string): DraftDestination | undefined;
  saveDraft(id: string, candidate: DestinationCandidate): DraftDestination;
  previewDraft(id: string): DestinationPreview;
  startReplacementDraft(destinationId: string): DraftDestination;
  publishDraft(id: string): PublishResult;
  archiveDestination(destinationId: string): void;
}
