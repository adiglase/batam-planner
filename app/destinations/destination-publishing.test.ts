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
  address: "Jalan Hang Lekiu, Nongsa, Batam",
  factualTags: "Beach, Sunset, Quiet",
  practicalNotes: "Bring small cash for the parking attendant.",
  officialWebsiteUrl: "https://nongsa-coast.example.com",
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

  it("keeps a Draft Destination private until it becomes a Published Destination", () => {
    const draft = repository.createDraft();

    repository.saveDraft(draft.id, publishableCandidate);
    expect(repository.listPublished()).toEqual([]);

    const result = repository.publishDraft(draft.id);

    expect(result).toEqual({ ok: true, destinationId: draft.destinationId });
    expect(repository.listPublished()).toEqual([
      expect.objectContaining({
        id: draft.destinationId,
        name: "Nongsa Coast",
        entryCost: { kind: "free" },
        operatingHours: {
          kind: "periods",
          text: "Open daily, 06:00–18:00",
        },
        address: "Jalan Hang Lekiu, Nongsa, Batam",
        factualTags: ["Beach", "Sunset", "Quiet"],
        practicalNotes: "Bring small cash for the parking attendant.",
        officialWebsiteUrl: "https://nongsa-coast.example.com",
        image: {
          url: "https://images.example.com/nongsa-coast.jpg",
          altText: "Rocky Nongsa shoreline beside calm blue water",
        },
      }),
    ]);
  });

  it("omits absent optional facts from the Published Destination", () => {
    const draft = repository.createDraft();
    repository.saveDraft(draft.id, {
      ...publishableCandidate,
      address: "",
      factualTags: "",
      practicalNotes: "",
      officialWebsiteUrl: "",
    });

    expect(repository.publishDraft(draft.id)).toEqual({
      ok: true,
      destinationId: draft.destinationId,
    });
    const published = repository.listPublished()[0];
    expect(published).not.toHaveProperty("address");
    expect(published).not.toHaveProperty("factualTags");
    expect(published).not.toHaveProperty("practicalNotes");
    expect(published).not.toHaveProperty("officialWebsiteUrl");
  });

  it("validates optional facts only when present", () => {
    const draft = repository.createDraft();
    repository.saveDraft(draft.id, {
      ...publishableCandidate,
      address: "123",
      factualTags: "x, this tag is far too long to be a factual tag entry",
      practicalNotes: "12345",
      officialWebsiteUrl: "http://insecure.example.com",
    });

    const result = repository.publishDraft(draft.id);

    expect(result).toEqual({
      ok: false,
      errors: expect.objectContaining({
        address: expect.any(String),
        factualTags: expect.any(String),
        practicalNotes: expect.any(String),
        officialWebsiteUrl: expect.any(String),
      }),
    });
    expect(repository.listPublished()).toEqual([]);
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
      operationalStatus: "Closed" as never,
      typicalVisitMinutes: 0,
      operatingHoursLabel: "Whenever the owner is around",
      entryCostLabel: "Cheap",
      googleMapsUrl: "https://docs.google.com/document/d/not-maps",
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

  it("keeps the current Published Destination live until a replacement is valid", () => {
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

  it("Archives a Destination from discovery while retaining it for republishing", () => {
    const draft = repository.createDraft();
    repository.saveDraft(draft.id, publishableCandidate);
    repository.publishDraft(draft.id);

    repository.archiveDestination(draft.destinationId);

    expect(repository.listPublished()).toEqual([]);
    expect(repository.listForOwner()).toEqual([
      expect.objectContaining({
        destinationId: draft.destinationId,
        lifecycleStatus: "Archived",
        published: expect.objectContaining({ name: "Nongsa Coast" }),
      }),
    ]);

    const replacement = repository.startReplacementDraft(draft.destinationId);
    expect(replacement.replacesPublished).toBe(false);
    expect(repository.publishDraft(replacement.id)).toEqual({
      ok: true,
      destinationId: draft.destinationId,
    });
    expect(repository.listPublished()[0]?.name).toBe("Nongsa Coast");
  });

  it("keeps a temporarily closed Destination Published and discoverable", () => {
    const draft = repository.createDraft();
    repository.saveDraft(draft.id, {
      ...publishableCandidate,
      operationalStatus: "Temporarily closed",
    });

    expect(repository.publishDraft(draft.id)).toEqual({
      ok: true,
      destinationId: draft.destinationId,
    });
    expect(repository.listPublished()[0]).toMatchObject({
      id: draft.destinationId,
      operationalStatus: "Temporarily closed",
    });
  });

  it("previews Visitor facts while omitting absent media and private rights", () => {
    const draft = repository.createDraft();
    repository.saveDraft(draft.id, {
      ...publishableCandidate,
      address: "",
      factualTags: "",
      practicalNotes: "",
      officialWebsiteUrl: "",
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
    expect(preview).not.toHaveProperty("address");
    expect(preview).not.toHaveProperty("factualTags");
    expect(preview).not.toHaveProperty("practicalNotes");
    expect(preview).not.toHaveProperty("officialWebsiteUrl");
  });

  it("uses the Published omission rules when previewing Accommodation", () => {
    const draft = repository.createDraft();
    repository.saveDraft(draft.id, {
      ...publishableCandidate,
      primaryCategory: "Accommodation",
      typicalVisitMinutes: 90,
      operatingHoursLabel: "Open daily, 06:00–18:00",
      entryCostLabel: "IDR 500,000",
    });

    const preview = repository.previewDraft(draft.id);

    expect(preview).not.toHaveProperty("typicalVisitMinutes");
    expect(preview).not.toHaveProperty("operatingHours");
    expect(preview).not.toHaveProperty("entryCost");
  });

  it("publishes ungrouped fixed IDR ranges", () => {
    const draft = repository.createDraft();
    repository.saveDraft(draft.id, {
      ...publishableCandidate,
      entryCostLabel: "IDR 50000–100000",
    });

    expect(repository.publishDraft(draft.id)).toEqual({
      ok: true,
      destinationId: draft.destinationId,
    });
  });
});
