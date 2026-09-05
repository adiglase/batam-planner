import path from "node:path";
import { describe, expect, it } from "vitest";
import { AuthNotConfigured, readOwnerAuthConfig } from "./auth-config.server.ts";

const env = {
  BETTER_AUTH_URL: "http://localhost:5173",
  BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  OWNER_BOOTSTRAP_EMAIL: "owner@example.com",
};

describe("owner auth configuration", () => {
  it.each(Object.keys(env))("requires %s", (key) => {
    expect(() => readOwnerAuthConfig({ ...env, [key]: "  " })).toThrow(AuthNotConfigured);
  });

  it.each([
    "not-a-url", "ftp://example.com", "https://example.com/path",
    "https://example.com?query=1", "https://example.com#fragment",
    "https://user:password@example.com",
  ])("rejects an invalid application origin: %s", (url) => {
    expect(() => readOwnerAuthConfig({ ...env, BETTER_AUTH_URL: url })).toThrow(AuthNotConfigured);
  });

  it("requires HTTPS in production", () => {
    expect(() => readOwnerAuthConfig({ ...env, NODE_ENV: "production" })).toThrow(AuthNotConfigured);
    expect(readOwnerAuthConfig({ ...env, NODE_ENV: "production", BETTER_AUTH_URL: "https://example.com/" }).baseURL).toBe("https://example.com");
  });

  it("rejects short secrets and invalid bootstrap emails", () => {
    expect(() => readOwnerAuthConfig({ ...env, BETTER_AUTH_SECRET: "short" })).toThrow(AuthNotConfigured);
    expect(() => readOwnerAuthConfig({ ...env, OWNER_BOOTSTRAP_EMAIL: "invalid" })).toThrow(AuthNotConfigured);
  });

  it("uses the persistent default database for an empty path", () => {
    expect(readOwnerAuthConfig({ ...env, DATABASE_PATH: "  " }).databasePath).toBe(path.resolve(".data", "batam-planner.sqlite"));
    expect(readOwnerAuthConfig({ ...env, DATABASE_PATH: " /tmp/custom.sqlite " }).databasePath).toBe("/tmp/custom.sqlite");
  });
});
