import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DestinationCandidate } from "./destination";
import { SqliteDestinationRepository } from "./sqlite-destination-repository.server";

const publishableCandidate: DestinationCandidate = {
  name: "Nongsa Coast",
  primaryCategory: "Nature & beaches",
  area: "Nongsa",
  description: "A quiet stretch of coast with views across the Singapore Strait.",
  latitude: 1.1962,
  longitude: 104.0977,
  operationalStatus: "Open",
  typicalVisitMinutes: 90,
  operatingHoursLabel: "Open daily, 06:00–18:00",
  entryCostLabel: "Free",
  googleMapsUrl:
    "https://www.google.com/maps/search/?api=1&query=Nongsa+Coast+Batam",
  imageUrl: "https://images.example.com/nongsa-coast.jpg",
  imageAltText: "Rocky Nongsa shoreline beside calm blue water",
  imageRightsSource: "Owner photograph, licensed for Batam Planner",
};

describe("Destination publishing", () => {
  let directory: string;
  let repository: SqliteDestinationRepository;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "batam-planner-publishing-"));
    repository = new SqliteDestinationRepository(
      path.join(directory, "destinations.sqlite"),
      { seed: false },
    );
  });

  afterEach(() => {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("keeps a Draft private until its complete candidate is Published", () => {
    const draft = repository.createDraft();

    repository.saveDraft(draft.id, publishableCandidate);
    expect(repository.listPublished()).toEqual([]);

    const result = repository.publishDraft(draft.id);

    expect(result).toEqual({ ok: true, destinationId: draft.destinationId });
    expect(repository.listPublished()).toEqual([
      expect.objectContaining({
        id: draft.destinationId,
        name: "Nongsa Coast",
        image: {
          url: "https://images.example.com/nongsa-coast.jpg",
          altText: "Rocky Nongsa shoreline beside calm blue water",
        },
      }),
    ]);
  });

  it("identifies every invalid field and refuses to Publish", () => {
    const draft = repository.createDraft();
    repository.saveDraft(draft.id, {
      ...publishableCandidate,
      name: "",
      primaryCategory: "",
      description: "",
      latitude: 91,
      longitude: null,
      operationalStatus: "",
      typicalVisitMinutes: 0,
      operatingHoursLabel: "",
      entryCostLabel: "",
      googleMapsUrl: "https://example.com/not-google-maps",
      imageAltText: "",
      imageRightsSource: "",
    });

    const result = repository.publishDraft(draft.id);

    expect(result).toEqual({
      ok: false,
      errors: expect.objectContaining({
        name: expect.any(String),
        primaryCategory: expect.any(String),
        description: expect.any(String),
        latitude: expect.any(String),
        longitude: expect.any(String),
        operationalStatus: expect.any(String),
        typicalVisitMinutes: expect.any(String),
        operatingHoursLabel: expect.any(String),
        entryCostLabel: expect.any(String),
        googleMapsUrl: expect.any(String),
        imageAltText: expect.any(String),
        imageRightsSource: expect.any(String),
      }),
    });
    expect(repository.listPublished()).toEqual([]);
  });

  it("keeps the current Published version live until a replacement is valid", () => {
    const originalDraft = repository.createDraft();
    repository.saveDraft(originalDraft.id, publishableCandidate);
    repository.publishDraft(originalDraft.id);

    const replacement = repository.startReplacementDraft(
      originalDraft.destinationId,
    );
    repository.saveDraft(replacement.id, {
      ...publishableCandidate,
      name: "Nongsa Coast at sunrise",
      description: "",
    });

    expect(repository.listPublished()[0]?.name).toBe("Nongsa Coast");
    expect(repository.publishDraft(replacement.id)).toEqual({
      ok: false,
      errors: expect.objectContaining({ description: expect.any(String) }),
    });
    expect(repository.listPublished()[0]?.name).toBe("Nongsa Coast");

    repository.saveDraft(replacement.id, {
      ...publishableCandidate,
      name: "Nongsa Coast at sunrise",
    });
    expect(repository.publishDraft(replacement.id)).toEqual({
      ok: true,
      destinationId: originalDraft.destinationId,
    });
    expect(repository.listPublished()[0]?.name).toBe(
      "Nongsa Coast at sunrise",
    );
  });

  it("previews Visitor facts while omitting absent media and private rights", () => {
    const draft = repository.createDraft();
    repository.saveDraft(draft.id, {
      ...publishableCandidate,
      imageUrl: "",
      imageAltText: "",
      imageRightsSource: "private source note",
    });

    const preview = repository.previewDraft(draft.id);

    expect(preview).toEqual(
      expect.objectContaining({
        name: "Nongsa Coast",
        primaryCategory: "Nature & beaches",
        area: "Nongsa",
      }),
    );
    expect(preview).not.toHaveProperty("image");
    expect(preview).not.toHaveProperty("imageRightsSource");
  });
});
