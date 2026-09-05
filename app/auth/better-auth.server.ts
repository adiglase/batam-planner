import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createOwnerIdentityTable, createOwnerPolicy, OWNER_DENIED, OwnerAccessDenied } from "./owner-policy.server.ts";

export type OwnerAuthConfig = {
  baseURL: string;
  secret: string;
  clientId: string;
  clientSecret: string;
  bootstrapEmail: string;
  databasePath: string;
};

export class AuthNotConfigured extends Error {}

export function readOwnerAuthConfig(env: NodeJS.ProcessEnv = process.env): OwnerAuthConfig {
  function required(name: string) {
    const value = env[name]?.trim();
    if (!value) throw new AuthNotConfigured(`${name} is missing`);
    return value;
  }
  const secret = required("BETTER_AUTH_SECRET");
  if (secret.length < 32) throw new AuthNotConfigured("BETTER_AUTH_SECRET must have at least 32 characters");
  let url: URL;
  try { url = new URL(required("BETTER_AUTH_URL")); }
  catch { throw new AuthNotConfigured("BETTER_AUTH_URL must be an absolute URL"); }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password ||
      !["http:", "https:"].includes(url.protocol) ||
      (env.NODE_ENV === "production" && url.protocol !== "https:")) {
    throw new AuthNotConfigured("BETTER_AUTH_URL must be an application origin (HTTPS in production)");
  }
  const bootstrapEmail = required("OWNER_BOOTSTRAP_EMAIL");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bootstrapEmail)) {
    throw new AuthNotConfigured("OWNER_BOOTSTRAP_EMAIL must be an email address");
  }
  return {
    baseURL: url.origin, secret,
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"), bootstrapEmail,
    databasePath: env.DATABASE_PATH ?? path.resolve(process.cwd(), ".data", "batam-planner.sqlite"),
  };
}

export function createOwnerAuth(database: Database.Database, config: OwnerAuthConfig) {
  const policy = createOwnerPolicy(database, config.bootstrapEmail);
  const auth = betterAuth({
    appName: "Batam Planner",
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    database,
    trustedOrigins: [config.baseURL],
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        prompt: "select_account",
        requireEmailVerification: true,
      },
    },
    account: {
      accountLinking: { enabled: false },
      encryptOAuthTokens: true,
    },
    session: {
      expiresIn: 8 * 60 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    user: {
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
      validateUserInfo({ source }) {
        const profile = source.oauth?.profile;
        const allowed = source.method === "oauth" && source.oauth?.providerId === "google" &&
          policy.accepts({
            subject: typeof profile?.sub === "string" ? profile.sub : "",
            email: typeof profile?.email === "string" ? profile.email : "",
            verified: profile?.email_verified === true,
          });
        if (!allowed) return { error: OWNER_DENIED };
      },
    },
    databaseHooks: {
      session: { create: { async before(session) {
        try { policy.bindForSession(session.userId); }
        catch (error) {
          if (!(error instanceof OwnerAccessDenied)) throw error;
          throw new APIError("FORBIDDEN", { code: OWNER_DENIED, message: "Owner access denied" });
        }
      } } },
    },
    advanced: {
      useSecureCookies: new URL(config.baseURL).protocol === "https:",
      // Explicit settings also keep these protections enabled under Vitest.
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
    onAPIError: { errorURL: `${config.baseURL}/owner/login` },
    // Provider errors can contain tokens. Record a fixed event label only.
    logger: { log(level) { console.error(`[owner-auth] Better Auth ${level}; sign-in request failed`); } },
  });
  return { auth, policy, config, database };
}

export type OwnerAuthRuntime = ReturnType<typeof createOwnerAuth>;

export async function migrateOwnerAuth(runtime: OwnerAuthRuntime) {
  const { runMigrations } = await getMigrations(runtime.auth.options);
  await runMigrations();
  createOwnerIdentityTable(runtime.database);
}

export function openAuthDatabase(config: OwnerAuthConfig) {
  mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const database = new Database(config.databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  return database;
}

let runtime: OwnerAuthRuntime | undefined;

/** Public discovery never initializes authentication or requires Google secrets. */
export function getOwnerAuth(): OwnerAuthRuntime {
  if (runtime) return runtime;
  const config = readOwnerAuthConfig();
  const database = openAuthDatabase(config);
  try {
    for (const table of ["user", "account", "session", "verification", "owner_identity"]) {
      if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
        throw new AuthNotConfigured("Authentication tables are missing; run npm run auth:migrate");
      }
    }
    runtime = createOwnerAuth(database, config);
    return runtime;
  } catch (error) { database.close(); throw error; }
}
