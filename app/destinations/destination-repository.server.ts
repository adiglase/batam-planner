import type {
  Destination,
  DestinationCandidate,
  DestinationDraft,
  DestinationPreview,
} from "./destination";

export type PublishErrors = Partial<Record<keyof DestinationCandidate, string>>;

export type PublishResult =
  | { ok: true; destinationId: string }
  | { ok: false; errors: PublishErrors };

export type OwnerDestination = {
  destinationId: string;
  published?: Destination;
  draft?: DestinationDraft;
};

export interface DestinationRepository {
  listPublished(): Destination[];
  listForOwner(): OwnerDestination[];
  createDraft(): DestinationDraft;
  getDraft(id: string): DestinationDraft | undefined;
  saveDraft(id: string, candidate: DestinationCandidate): DestinationDraft;
  previewDraft(id: string): DestinationPreview;
  startReplacementDraft(destinationId: string): DestinationDraft;
  publishDraft(id: string): PublishResult;
}
