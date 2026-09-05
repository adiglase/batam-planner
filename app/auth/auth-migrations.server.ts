import { getMigrations } from "better-auth/db/migration";
import type { OwnerAuthRuntime } from "./better-auth.server.ts";
import { createOwnerIdentityTable } from "./owner-policy.server.ts";

/** Explicit migration only: never run schema changes while serving requests. */
export async function migrateOwnerAuth(runtime: OwnerAuthRuntime) {
  const { runMigrations } = await getMigrations(runtime.auth.options);
  await runMigrations();
  createOwnerIdentityTable(runtime.database);
}

