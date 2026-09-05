import { createOwnerAuth, migrateOwnerAuth, openAuthDatabase, readOwnerAuthConfig } from "../app/auth/better-auth.server.ts";

const config = readOwnerAuthConfig();
const database = openAuthDatabase(config);
try {
  await migrateOwnerAuth(createOwnerAuth(database, config));
  console.log("Authentication tables are ready. Existing Destinations and owner binding were preserved.");
} finally {
  database.close();
}
