import path from "node:path";

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
  if (secret.length < 32) {
    throw new AuthNotConfigured("BETTER_AUTH_SECRET must have at least 32 characters");
  }
  let url: URL;
  try {
    url = new URL(required("BETTER_AUTH_URL"));
  } catch {
    throw new AuthNotConfigured("BETTER_AUTH_URL must be an absolute URL");
  }
  if (
    url.pathname !== "/" || url.search || url.hash || url.username || url.password ||
    !["http:", "https:"].includes(url.protocol) ||
    (env.NODE_ENV === "production" && url.protocol !== "https:")
  ) {
    throw new AuthNotConfigured("BETTER_AUTH_URL must be an application origin (HTTPS in production)");
  }
  const bootstrapEmail = required("OWNER_BOOTSTRAP_EMAIL");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bootstrapEmail)) {
    throw new AuthNotConfigured("OWNER_BOOTSTRAP_EMAIL must be an email address");
  }
  return {
    baseURL: url.origin,
    secret,
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"),
    bootstrapEmail,
    databasePath: env.DATABASE_PATH?.trim() || path.resolve(process.cwd(), ".data", "batam-planner.sqlite"),
  };
}
