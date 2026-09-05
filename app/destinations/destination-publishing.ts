import {
  DESTINATION_CATEGORIES,
  type DestinationCandidate,
  type DestinationCategory,
  type DraftDestination,
  type DestinationPreview,
  type OperationalStatus,
} from "./destination";
import type { PublishErrors } from "./destination-repository.server";

const OPERATIONAL_STATUSES: OperationalStatus[] = [
  "Open",
  "Temporarily closed",
];
const EXPLICIT_HOURS_STATES = ["Hours unknown", "No meaningful restriction"];
const HOURS_PERIOD = /(?:[01]\d|2[0-3]):[0-5]\d\s*[–-]\s*(?:[01]\d|2[0-3]):[0-5]\d/;
const IDR_AMOUNT = "(?:0|[1-9]\\d*|[1-9]\\d{0,2}(?:,\\d{3})+)";
const ENTRY_COST = new RegExp(
  `^(?:Free|Cost unknown|IDR ${IDR_AMOUNT}(?:\\s*[–-]\\s*(?:IDR )?${IDR_AMOUNT})?)(?: .+)?$`,
);

export function categoryUsesVisitFacts(category: string) {
  return category !== "Accommodation";
}

function hasLatinText(value: string) {
  return /[A-Za-z]/.test(value);
}

function isGoogleMapsUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.hostname === "maps.app.goo.gl") return url.pathname.length > 1;
    if (url.hostname === "goo.gl") return url.pathname.startsWith("/maps");
    return (
      (url.hostname === "google.com" || url.hostname === "www.google.com") &&
      url.pathname.startsWith("/maps")
    ) || url.hostname === "maps.google.com";
  } catch {
    return false;
  }
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const MAX_FACTUAL_TAGS = 8;

/** Splits a comma-separated owner entry into distinct Factual tags. */
export function parseFactualTags(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function validateDestinationCandidate(
  candidate: DestinationCandidate,
): PublishErrors {
  const errors: PublishErrors = {};
  const usesVisitFacts = categoryUsesVisitFacts(candidate.primaryCategory);

  if (
    !hasLatinText(candidate.name) ||
    candidate.name.length < 2 ||
    candidate.name.length > 120
  ) {
    errors.name = "Enter an English name between 2 and 120 characters.";
  }
  if (
    !DESTINATION_CATEGORIES.includes(
      candidate.primaryCategory as DestinationCategory,
    )
  ) {
    errors.primaryCategory = "Choose a primary category.";
  }
  if (
    !hasLatinText(candidate.description) ||
    candidate.description.length < 20 ||
    candidate.description.length > 240
  ) {
    errors.description =
      "Enter a concise English description between 20 and 240 characters.";
  }
  if (
    candidate.latitude === null ||
    !Number.isFinite(candidate.latitude) ||
    candidate.latitude < -90 ||
    candidate.latitude > 90
  ) {
    errors.latitude = "Enter a latitude from -90 to 90.";
  }
  if (
    candidate.longitude === null ||
    !Number.isFinite(candidate.longitude) ||
    candidate.longitude < -180 ||
    candidate.longitude > 180
  ) {
    errors.longitude = "Enter a longitude from -180 to 180.";
  }
  if (!OPERATIONAL_STATUSES.includes(candidate.operationalStatus as OperationalStatus)) {
    errors.operationalStatus = "Choose an operational status.";
  }
  if (usesVisitFacts) {
    if (
      candidate.typicalVisitMinutes === null ||
      !Number.isSafeInteger(candidate.typicalVisitMinutes) ||
      candidate.typicalVisitMinutes <= 0
    ) {
      errors.typicalVisitMinutes = "Enter a positive whole number of minutes.";
    }
    if (
      !EXPLICIT_HOURS_STATES.includes(candidate.operatingHoursLabel) &&
      !HOURS_PERIOD.test(candidate.operatingHoursLabel)
    ) {
      errors.operatingHoursLabel =
        "Enter a daily time period, Hours unknown, or No meaningful restriction.";
    }
    if (!ENTRY_COST.test(candidate.entryCostLabel)) {
      errors.entryCostLabel =
        "Enter Free, Cost unknown, a fixed IDR amount, or an IDR range.";
    }
  }
  if (candidate.address) {
    if (!hasLatinText(candidate.address) || candidate.address.length > 200) {
      errors.address =
        "Enter an English street address of 200 characters or fewer.";
    }
  }
  const factualTags = parseFactualTags(candidate.factualTags);
  if (
    factualTags.length > MAX_FACTUAL_TAGS ||
    factualTags.some(
      (tag) => !hasLatinText(tag) || tag.length < 2 || tag.length > 40,
    )
  ) {
    errors.factualTags =
      "Enter up to 8 comma-separated English tags of 2 to 40 characters each.";
  }
  if (
    candidate.practicalNotes &&
    (!hasLatinText(candidate.practicalNotes) ||
      candidate.practicalNotes.length > 500)
  ) {
    errors.practicalNotes =
      "Enter English practical notes of 500 characters or fewer.";
  }
  if (
    candidate.officialWebsiteUrl &&
    !isHttpsUrl(candidate.officialWebsiteUrl)
  ) {
    errors.officialWebsiteUrl = "Enter a valid HTTPS official website link.";
  }
  if (!isGoogleMapsUrl(candidate.googleMapsUrl)) {
    errors.googleMapsUrl = "Enter a valid HTTPS Google Maps link.";
  }

  const hasAnyImageFact = Boolean(
    candidate.imageUrl ||
      candidate.imageAltText ||
      candidate.imageRightsSource,
  );
  if (hasAnyImageFact && !isHttpsUrl(candidate.imageUrl)) {
    errors.imageUrl = "Enter a valid HTTPS image URL.";
  }
  if (
    candidate.imageUrl &&
    (!hasLatinText(candidate.imageAltText) ||
      candidate.imageAltText.length < 5 ||
      candidate.imageAltText.length > 240)
  ) {
    errors.imageAltText =
      "Enter English alt text between 5 and 240 characters.";
  }
  if (
    candidate.imageUrl &&
    (!candidate.imageRightsSource || candidate.imageRightsSource.length > 500)
  ) {
    errors.imageRightsSource =
      "Record the private image rights and source in 500 characters or fewer.";
  }

  return errors;
}

export function destinationPreviewFromDraft(
  draft: DraftDestination,
): DestinationPreview {
  const candidate = draft.candidate;
  const usesVisitFacts = categoryUsesVisitFacts(candidate.primaryCategory);
  const factualTags = parseFactualTags(candidate.factualTags);
  return {
    id: draft.destinationId,
    name: candidate.name,
    ...(candidate.primaryCategory
      ? { primaryCategory: candidate.primaryCategory }
      : {}),
    ...(candidate.area ? { area: candidate.area } : {}),
    ...(candidate.description ? { description: candidate.description } : {}),
    ...(candidate.latitude !== null && candidate.longitude !== null
      ? {
          coordinates: {
            latitude: candidate.latitude,
            longitude: candidate.longitude,
          },
        }
      : {}),
    ...(candidate.operationalStatus
      ? { operationalStatus: candidate.operationalStatus }
      : {}),
    ...(usesVisitFacts && candidate.typicalVisitMinutes
      ? { typicalVisitMinutes: candidate.typicalVisitMinutes }
      : {}),
    ...(usesVisitFacts && candidate.operatingHoursLabel
      ? { operatingHoursLabel: candidate.operatingHoursLabel }
      : {}),
    ...(usesVisitFacts && candidate.entryCostLabel
      ? { entryCostLabel: candidate.entryCostLabel }
      : {}),
    ...(candidate.address ? { address: candidate.address } : {}),
    ...(factualTags.length > 0 ? { factualTags } : {}),
    ...(candidate.practicalNotes
      ? { practicalNotes: candidate.practicalNotes }
      : {}),
    ...(candidate.officialWebsiteUrl
      ? { officialWebsiteUrl: candidate.officialWebsiteUrl }
      : {}),
    ...(candidate.googleMapsUrl
      ? { googleMapsUrl: candidate.googleMapsUrl }
      : {}),
    ...(candidate.imageUrl && candidate.imageAltText
      ? {
          image: {
            url: candidate.imageUrl,
            altText: candidate.imageAltText,
          },
        }
      : {}),
  };
}
