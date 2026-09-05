import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  type Destination,
  type DestinationCandidate,
  type DestinationCategory,
  type DraftDestination,
  type DestinationPreview,
  type OperationalStatus,
} from "./destination";
import {
  categoryUsesVisitFacts,
  destinationPreviewFromDraft,
  validateDestinationCandidate,
} from "./destination-publishing";
import type {
  DestinationRepository,
  OwnerDestination,
  PublishResult,
} from "./destination-repository.server";

type DestinationRow = {
  id: string;
  slug: string;
  name: string;
  primary_category: DestinationCategory;
  area: string;
  description: string;
  latitude: number;
  longitude: number;
  lifecycle_status: "Published" | "Archived";
  operational_status: OperationalStatus;
  typical_visit_minutes: number;
  operating_hours_label: string;
  entry_cost_label: string;
  google_maps_url: string;
  image_url: string | null;
  image_alt_text: string | null;
  image_rights_source: string | null;
};

type DraftRow = {
  id: string;
  destination_id: string;
  name: string;
  primary_category: DestinationCategory | "";
  area: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  operational_status: OperationalStatus | "";
  typical_visit_minutes: number | null;
  operating_hours_label: string;
  entry_cost_label: string;
  google_maps_url: string;
  image_url: string;
  image_alt_text: string;
  image_rights_source: string;
  updated_at: string;
};

const EMPTY_CANDIDATE: DestinationCandidate = {
  name: "",
  primaryCategory: "",
  area: "",
  description: "",
  latitude: null,
  longitude: null,
  operationalStatus: "",
  typicalVisitMinutes: null,
  operatingHoursLabel: "",
  entryCostLabel: "",
  googleMapsUrl: "",
  imageUrl: "",
  imageAltText: "",
  imageRightsSource: "",
};

function candidateFromRow(row: DraftRow): DestinationCandidate {
  return {
    name: row.name,
    primaryCategory: row.primary_category,
    area: row.area,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    operationalStatus: row.operational_status,
    typicalVisitMinutes: row.typical_visit_minutes,
    operatingHoursLabel: row.operating_hours_label,
    entryCostLabel: row.entry_cost_label,
    googleMapsUrl: row.google_maps_url,
    imageUrl: row.image_url,
    imageAltText: row.image_alt_text,
    imageRightsSource: row.image_rights_source,
  };
}

function destinationFromRow(row: DestinationRow): Destination {
  const usesVisitFacts = categoryUsesVisitFacts(row.primary_category);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    primaryCategory: row.primary_category,
    area: row.area,
    description: row.description,
    coordinates: { latitude: row.latitude, longitude: row.longitude },
    operationalStatus: row.operational_status,
    ...(usesVisitFacts && {
      typicalVisitMinutes: row.typical_visit_minutes,
      operatingHoursLabel: row.operating_hours_label,
      entryCostLabel: row.entry_cost_label,
    }),
    googleMapsUrl: row.google_maps_url,
    ...(row.image_url && row.image_alt_text
      ? { image: { url: row.image_url, altText: row.image_alt_text } }
      : {}),
  };
}

function draftFromRow(
  row: DraftRow,
  replacesPublished: boolean,
): DraftDestination {
  return {
    id: row.id,
    destinationId: row.destination_id,
    candidate: candidateFromRow(row),
    replacesPublished,
    updatedAt: row.updated_at,
  };
}

function slugify(name: string) {
  return (
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "destination"
  );
}

export class SqliteDestinationRepository implements DestinationRepository {
  private readonly database: Database.Database;

  constructor(databasePath: string, options: { seed?: boolean } = {}) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma("journal_mode = WAL");
    this.createSchema(options.seed !== false);
  }

  close() {
    this.database.close();
  }

  listPublished(): Destination[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM destinations
         WHERE lifecycle_status = 'Published'
         ORDER BY name COLLATE NOCASE ASC`,
      )
      .all() as DestinationRow[];
    return rows.map(destinationFromRow);
  }

  listForOwner(): OwnerDestination[] {
    const publishedRows = this.database
      .prepare("SELECT * FROM destinations ORDER BY name COLLATE NOCASE ASC")
      .all() as DestinationRow[];
    const draftRows = this.database
      .prepare("SELECT * FROM destination_drafts ORDER BY updated_at DESC")
      .all() as DraftRow[];
    const byDestination = new Map<string, OwnerDestination>();

    for (const row of publishedRows) {
      byDestination.set(row.id, {
        destinationId: row.id,
        published: destinationFromRow(row),
      });
    }
    for (const row of draftRows) {
      const current = byDestination.get(row.destination_id);
      byDestination.set(row.destination_id, {
        destinationId: row.destination_id,
        ...current,
        draft: draftFromRow(row, Boolean(current?.published)),
      });
    }

    return [...byDestination.values()].sort((left, right) => {
      const leftName = left.draft?.candidate.name || left.published?.name || "";
      const rightName = right.draft?.candidate.name || right.published?.name || "";
      return leftName.localeCompare(rightName);
    });
  }

  createDraft(): DraftDestination {
    const now = new Date().toISOString();
    const id = randomUUID();
    const destinationId = randomUUID();
    this.insertDraft(id, destinationId, EMPTY_CANDIDATE, now);
    return this.getDraft(id)!;
  }

  getDraft(id: string): DraftDestination | undefined {
    const row = this.database
      .prepare("SELECT * FROM destination_drafts WHERE id = ?")
      .get(id) as DraftRow | undefined;
    if (!row) return undefined;
    const published = this.database
      .prepare("SELECT 1 FROM destinations WHERE id = ?")
      .get(row.destination_id);
    return draftFromRow(row, Boolean(published));
  }

  saveDraft(id: string, candidate: DestinationCandidate): DraftDestination {
    const result = this.database
      .prepare(
        `UPDATE destination_drafts SET
          name = @name,
          primary_category = @primaryCategory,
          area = @area,
          description = @description,
          latitude = @latitude,
          longitude = @longitude,
          operational_status = @operationalStatus,
          typical_visit_minutes = @typicalVisitMinutes,
          operating_hours_label = @operatingHoursLabel,
          entry_cost_label = @entryCostLabel,
          google_maps_url = @googleMapsUrl,
          image_url = @imageUrl,
          image_alt_text = @imageAltText,
          image_rights_source = @imageRightsSource,
          updated_at = @updatedAt
        WHERE id = @id`,
      )
      .run({ ...candidate, id, updatedAt: new Date().toISOString() });
    if (result.changes === 0) throw new Error("Draft Destination not found");
    return this.getDraft(id)!;
  }

  previewDraft(id: string): DestinationPreview {
    const draft = this.getDraft(id);
    if (!draft) throw new Error("Draft Destination not found");
    return destinationPreviewFromDraft(draft);
  }

  startReplacementDraft(destinationId: string): DraftDestination {
    const existing = this.database
      .prepare("SELECT * FROM destination_drafts WHERE destination_id = ?")
      .get(destinationId) as DraftRow | undefined;
    if (existing) return draftFromRow(existing, true);

    const published = this.database
      .prepare("SELECT * FROM destinations WHERE id = ?")
      .get(destinationId) as DestinationRow | undefined;
    if (!published) throw new Error("Published Destination not found");

    const id = randomUUID();
    this.insertDraft(
      id,
      destinationId,
      {
        name: published.name,
        primaryCategory: published.primary_category,
        area: published.area,
        description: published.description,
        latitude: published.latitude,
        longitude: published.longitude,
        operationalStatus: published.operational_status,
        typicalVisitMinutes: categoryUsesVisitFacts(published.primary_category)
          ? published.typical_visit_minutes
          : null,
        operatingHoursLabel: published.operating_hours_label,
        entryCostLabel: published.entry_cost_label,
        googleMapsUrl: published.google_maps_url,
        imageUrl: published.image_url ?? "",
        imageAltText: published.image_alt_text ?? "",
        imageRightsSource: published.image_rights_source ?? "",
      },
      new Date().toISOString(),
    );
    return this.getDraft(id)!;
  }

  publishDraft(id: string): PublishResult {
    const draft = this.getDraft(id);
    if (!draft) throw new Error("Draft Destination not found");
    const errors = validateDestinationCandidate(draft.candidate);
    if (Object.keys(errors).length > 0) return { ok: false, errors };

    this.database.transaction(() => {
      const candidate = draft.candidate;
      const existing = this.database
        .prepare("SELECT slug FROM destinations WHERE id = ?")
        .get(draft.destinationId) as { slug: string } | undefined;
      const baseSlug = slugify(candidate.name);
      const slugOwner = this.database
        .prepare("SELECT id FROM destinations WHERE slug = ? AND id != ?")
        .get(baseSlug, draft.destinationId);
      const slug =
        existing?.slug ??
        (slugOwner
          ? `${baseSlug}-${draft.destinationId.slice(0, 8)}`
          : baseSlug);

      this.database
        .prepare(
          `INSERT INTO destinations (
            id, slug, name, primary_category, area, description, latitude,
            longitude, lifecycle_status, operational_status,
            typical_visit_minutes, operating_hours_label, entry_cost_label,
            google_maps_url, image_url, image_alt_text, image_rights_source
          ) VALUES (
            @id, @slug, @name, @primaryCategory, @area, @description, @latitude,
            @longitude, 'Published', @operationalStatus,
            @typicalVisitMinutes, @operatingHoursLabel, @entryCostLabel,
            @googleMapsUrl, @imageUrl, @imageAltText, @imageRightsSource
          ) ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            primary_category = excluded.primary_category,
            area = excluded.area,
            description = excluded.description,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            lifecycle_status = 'Published',
            operational_status = excluded.operational_status,
            typical_visit_minutes = excluded.typical_visit_minutes,
            operating_hours_label = excluded.operating_hours_label,
            entry_cost_label = excluded.entry_cost_label,
            google_maps_url = excluded.google_maps_url,
            image_url = excluded.image_url,
            image_alt_text = excluded.image_alt_text,
            image_rights_source = excluded.image_rights_source`,
        )
        .run({
          ...candidate,
          id: draft.destinationId,
          slug,
          typicalVisitMinutes: candidate.typicalVisitMinutes ?? 0,
        });
      this.database
        .prepare("DELETE FROM destination_drafts WHERE id = ?")
        .run(id);
    })();

    return { ok: true, destinationId: draft.destinationId };
  }

  private createSchema(seed: boolean) {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS destinations (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        primary_category TEXT NOT NULL,
        area TEXT NOT NULL,
        description TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('Draft', 'Published', 'Archived')),
        operational_status TEXT NOT NULL CHECK (operational_status IN ('Open', 'Temporarily closed')),
        typical_visit_minutes INTEGER NOT NULL,
        operating_hours_label TEXT NOT NULL,
        entry_cost_label TEXT NOT NULL,
        google_maps_url TEXT NOT NULL,
        image_url TEXT,
        image_alt_text TEXT,
        image_rights_source TEXT
      );
    `);
    this.addColumnIfMissing("image_url", "TEXT");
    this.addColumnIfMissing("image_alt_text", "TEXT");
    this.addColumnIfMissing("image_rights_source", "TEXT");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS destination_drafts (
        id TEXT PRIMARY KEY,
        destination_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        primary_category TEXT NOT NULL DEFAULT '',
        area TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        latitude REAL,
        longitude REAL,
        operational_status TEXT NOT NULL DEFAULT '',
        typical_visit_minutes INTEGER,
        operating_hours_label TEXT NOT NULL DEFAULT '',
        entry_cost_label TEXT NOT NULL DEFAULT '',
        google_maps_url TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL DEFAULT '',
        image_alt_text TEXT NOT NULL DEFAULT '',
        image_rights_source TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
    `);

    if (seed) {
      this.database.exec(`
        INSERT OR IGNORE INTO destinations (
          id, slug, name, primary_category, area, description, latitude,
          longitude, lifecycle_status, operational_status,
          typical_visit_minutes, operating_hours_label, entry_cost_label,
          google_maps_url, image_url, image_alt_text, image_rights_source
        ) VALUES (
          'destination-barelang-bridge', 'barelang-bridge', 'Barelang Bridge',
          'Attractions & landmarks', 'Barelang',
          'An iconic Batam landmark with wide sea views and a scenic road across the islands.',
          0.9816, 104.0401, 'Published', 'Open', 60, 'Hours unknown',
          'Cost unknown',
          'https://www.google.com/maps/search/?api=1&query=Barelang+Bridge+Batam',
          'https://picsum.photos/seed/barelang-bridge/800/600',
          'Barelang Bridge spanning blue water on a clear day',
          'Mock development image; replace with rights-cleared photo'
        ), (
          'destination-maha-vihara', 'maha-vihara-duta-maitreya', 'Maha Vihara Duta Maitreya Temple',
          'Culture & worship', 'Sei Jodoh',
          'One of the largest Chinese temples in Southeast Asia, known for its peaceful halls and statues.',
          1.1347, 104.0161, 'Published', 'Open', 60, '08:00-20:00',
          'Free',
          'https://www.google.com/maps/search/?api=1&query=Maha+Vihara+Duta+Maitreya+Batam',
          'https://picsum.photos/seed/maha-vihara/800/600',
          'Temple hall with rows of statues in warm light',
          'Mock development image; replace with rights-cleared photo'
        ), (
          'destination-melur-beach', 'melur-beach', 'Pantai Melur',
          'Nature & beaches', 'Galang',
          'A calm sandy beach in Galang with shallow water, food stalls, and shaded picnic spots.',
          0.771, 104.23, 'Published', 'Open', 120, '07:00-18:00',
          'IDR 10,000',
          'https://www.google.com/maps/search/?api=1&query=Melur+Beach+Galang+Batam',
          'https://picsum.photos/seed/melur-beach/800/600',
          'Sandy beach with calm water and boats near the shore',
          'Mock development image; replace with rights-cleared photo'
        ), (
          'destination-ocarina', 'ocarina-batam', 'Ocarina Batam Theme Park',
          'Entertainment & nightlife', 'Harbour Bay',
          'A waterfront amusement park with rides, a giant ferris wheel, and evening light displays.',
          1.143, 103.979, 'Published', 'Open', 180, '11:00-21:00',
          'IDR 30,000 - IDR 50,000',
          'https://www.google.com/maps/search/?api=1&query=Ocarina+Batam+Theme+Park',
          'https://picsum.photos/seed/ocarina-batam/800/600',
          'Ferris wheel and rides lit up at dusk by the waterfront',
          'Mock development image; replace with rights-cleared photo'
        ), (
          'destination-sea-forest', 'sea-forest-adventure', 'Sea Forest Adventure Batam',
          'Nature & beaches', 'Sekupang',
          'A coastal adventure park with rope courses and sea views, currently closed for maintenance.',
          1.16, 104.04, 'Published', 'Temporarily closed', 150, 'Hours unknown',
          'IDR 50,000',
          'https://www.google.com/maps/search/?api=1&query=Sea+Forest+Adventure+Batam',
          'https://picsum.photos/seed/sea-forest/800/600',
          'Rope course platforms among coastal trees overlooking the sea',
          'Mock development image; replace with rights-cleared photo'
        ), (
          'destination-harris-batam-center', 'harris-hotel-batam-center', 'Harris Hotel Batam Center',
          'Accommodation', 'Batam Center',
          'A convenient hotel near the ferry terminal, useful as an overnight base for a short trip.',
          1.1305, 104.0125, 'Published', 'Open', 0, '',
          '',
          'https://www.google.com/maps/search/?api=1&query=Harris+Hotel+Batam+Center',
          NULL, NULL, NULL
        ), (
          'destination-wey-wey-seafood', 'wey-wey-seafood', 'Wey Wey Seafood Nagoya',
          'Food & drink', 'Nagoya',
          'A busy local seafood restaurant known for chilli crab, gonggong, and large shared tables.',
          1.141, 104.002, 'Published', 'Open', 90, '11:00-23:00',
          'Free',
          'https://www.google.com/maps/search/?api=1&query=Wey+Wey+Seafood+Nagoya+Batam',
          'https://picsum.photos/seed/wey-wey-seafood/800/600',
          'Shared seafood dishes served on a restaurant table',
          'Mock development image; replace with rights-cleared photo'
        ), (
          'destination-nagoya-hill', 'nagoya-hill-mall', 'Nagoya Hill Shopping Mall',
          'Shopping', 'Nagoya',
          'A large multi-floor mall with shops, eateries, and a supermarket in central Nagoya.',
          1.1445, 104.0045, 'Published', 'Open', 120, 'No meaningful restriction',
          'Free',
          'https://www.google.com/maps/search/?api=1&query=Nagoya+Hill+Shopping+Mall+Batam',
          'https://picsum.photos/seed/nagoya-hill/800/600',
          'Mall atrium with multiple shop floors and skylights',
          'Mock development image; replace with rights-cleared photo'
        ), (
          'destination-eska-spa', 'eska-wellness-spa', 'Eska Wellness Spa',
          'Spa & wellness', 'Batam Center',
          'A quiet spa offering massages and reflexology, popular as an evening rest stop.',
          1.131, 104.015, 'Published', 'Open', 90, '09:00-22:00',
          'IDR 150,000',
          'https://www.google.com/maps/search/?api=1&query=Eska+Wellness+Spa+Batam',
          'https://picsum.photos/seed/eska-spa/800/600',
          'Calm spa room with towels and soft lighting',
          'Mock development image; replace with rights-cleared photo'
        );
      `);
    }
  }

  private addColumnIfMissing(name: string, declaration: string) {
    const columns = this.database
      .prepare("PRAGMA table_info(destinations)")
      .all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === name)) {
      this.database.exec(
        `ALTER TABLE destinations ADD COLUMN ${name} ${declaration}`,
      );
    }
  }

  private insertDraft(
    id: string,
    destinationId: string,
    candidate: DestinationCandidate,
    updatedAt: string,
  ) {
    this.database
      .prepare(
        `INSERT INTO destination_drafts (
          id, destination_id, name, primary_category, area, description,
          latitude, longitude, operational_status, typical_visit_minutes,
          operating_hours_label, entry_cost_label, google_maps_url, image_url,
          image_alt_text, image_rights_source, updated_at
        ) VALUES (
          @id, @destinationId, @name, @primaryCategory, @area, @description,
          @latitude, @longitude, @operationalStatus, @typicalVisitMinutes,
          @operatingHoursLabel, @entryCostLabel, @googleMapsUrl, @imageUrl,
          @imageAltText, @imageRightsSource, @updatedAt
        )`,
      )
      .run({ id, destinationId, ...candidate, updatedAt });
  }
}

const databasePath =
  process.env.DATABASE_PATH ??
  path.resolve(process.cwd(), ".data", "batam-planner.sqlite");
let repository: SqliteDestinationRepository | undefined;

export function getDestinationRepository(): DestinationRepository {
  repository ??= new SqliteDestinationRepository(databasePath);
  return repository;
}
