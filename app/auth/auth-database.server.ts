import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { AuthNotConfigured, type OwnerAuthConfig } from "./auth-config.server.ts";

export function openAuthDatabase(config: Pick<OwnerAuthConfig, "databasePath">) {
  mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const database = new Database(config.databasePath);
  try {
    database.pragma("journal_mode = WAL");
    database.pragma("busy_timeout = 5000");
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function requireAuthSchema(database: Database.Database) {
  const tableExists = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?");
  for (const table of ["user", "account", "session", "verification", "owner_identity"]) {
    if (!tableExists.get(table)) {
      throw new AuthNotConfigured("Authentication tables are missing; run npm run auth:migrate");
    }
  }
}
