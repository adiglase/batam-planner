import { createOwnerAuth } from "../app/auth/better-auth.server.ts";
import { readOwnerAuthConfig } from "../app/auth/auth-config.server.ts";
import { openAuthDatabase } from "../app/auth/auth-database.server.ts";
import { migrateOwnerAuth } from "../app/auth/auth-migrations.server.ts";

const config = readOwnerAuthConfig();
const database = openAuthDatabase(config);
try {
  await migrateOwnerAuth(createOwnerAuth(database, config));
  console.log("Authentication tables are ready. Existing Destinations and owner binding were preserved.");
} finally {
  database.close();
}
