import type Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { readOwnerAuthConfig, type OwnerAuthConfig } from "./auth-config.server.ts";
import { openAuthDatabase, requireAuthSchema } from "./auth-database.server.ts";
import { createOwnerPolicy, OWNER_DENIED, OwnerAccessDenied } from "./owner-policy.server.ts";

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
        const allowed =
          source.method === "oauth" &&
          source.oauth?.providerId === "google" &&
          policy.acceptsGoogleIdentity({
            subject: typeof profile?.sub === "string" ? profile.sub : "",
            email: typeof profile?.email === "string" ? profile.email : "",
            verified: profile?.email_verified === true,
          });
        if (!allowed) return { error: OWNER_DENIED };
      },
    },
    databaseHooks: {
      session: {
        create: {
          async before(session) {
            try {
              policy.bindOwnerForSession(session.userId);
            } catch (error) {
              if (!(error instanceof OwnerAccessDenied)) throw error;
              throw new APIError("FORBIDDEN", {
                code: OWNER_DENIED,
                message: "Owner access denied",
              });
            }
          },
        },
      },
    },
    advanced: {
      useSecureCookies: new URL(config.baseURL).protocol === "https:",
      // Explicit settings also keep these protections enabled under Vitest.
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
    onAPIError: { errorURL: `${config.baseURL}/owner/login` },
    // Provider errors can contain tokens. Record a fixed event label only.
    logger: {
      log(level) {
        console.error(`[owner-auth] Better Auth ${level}; sign-in request failed`);
      },
    },
  });
  return { auth, policy, config, database };
}

export type OwnerAuthRuntime = ReturnType<typeof createOwnerAuth>;

let runtime: OwnerAuthRuntime | undefined;

/** Public discovery never initializes authentication or requires Google secrets. */
export function getOwnerAuth(): OwnerAuthRuntime {
  if (runtime) return runtime;
  const config = readOwnerAuthConfig();
  const database = openAuthDatabase(config);
  try {
    requireAuthSchema(database);
    runtime = createOwnerAuth(database, config);
    return runtime;
  } catch (error) {
    database.close();
    throw error;
  }
}

/** Clear the lazy runtime between tests; close only the connection it owns.
 * Runtimes returned by createOwnerAuth remain the caller's responsibility.
 */
export function resetOwnerAuthForTests() {
  runtime?.database.close();
  runtime = undefined;
}
