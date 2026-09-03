import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

import type { Destination } from "./destination";
import type { DestinationRepository } from "./destination-repository.server";

type DestinationRow = {
  id: string;
  slug: string;
  name: string;
  primary_category: string;
  area: string;
  description: string;
  latitude: number;
  longitude: number;
  operational_status: "Open" | "Temporarily closed";
  typical_visit_minutes: number;
  operating_hours_label: string;
  entry_cost_label: string;
  google_maps_url: string;
};

const databasePath =
  process.env.DATABASE_PATH ??
  path.resolve(process.cwd(), ".data", "batam-planner.sqlite");

mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.exec(`
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
    google_maps_url TEXT NOT NULL
  );

  INSERT OR IGNORE INTO destinations (
    id,
    slug,
    name,
    primary_category,
    area,
    description,
    latitude,
    longitude,
    lifecycle_status,
    operational_status,
    typical_visit_minutes,
    operating_hours_label,
    entry_cost_label,
    google_maps_url
  ) VALUES (
    'destination-barelang-bridge',
    'barelang-bridge',
    'Barelang Bridge',
    'Attractions & landmarks',
    'Barelang',
    'An iconic Batam landmark with wide sea views and a scenic road across the islands.',
    0.9816,
    104.0401,
    'Published',
    'Open',
    60,
    'Hours unknown',
    'Cost unknown',
    'https://www.google.com/maps/search/?api=1&query=Barelang+Bridge+Batam'
  );
`);

class SqliteDestinationRepository implements DestinationRepository {
  listPublished(): Destination[] {
    const rows = database
      .prepare(
        `SELECT
          id,
          slug,
          name,
          primary_category,
          area,
          description,
          latitude,
          longitude,
          operational_status,
          typical_visit_minutes,
          operating_hours_label,
          entry_cost_label,
          google_maps_url
        FROM destinations
        WHERE lifecycle_status = 'Published'
        ORDER BY name COLLATE NOCASE ASC`,
      )
      .all() as DestinationRow[];

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      primaryCategory: row.primary_category,
      area: row.area,
      description: row.description,
      coordinates: {
        latitude: row.latitude,
        longitude: row.longitude,
      },
      operationalStatus: row.operational_status,
      typicalVisitMinutes: row.typical_visit_minutes,
      operatingHoursLabel: row.operating_hours_label,
      entryCostLabel: row.entry_cost_label,
      googleMapsUrl: row.google_maps_url,
    }));
  }
}

const repository = new SqliteDestinationRepository();

export function getDestinationRepository(): DestinationRepository {
  return repository;
}
