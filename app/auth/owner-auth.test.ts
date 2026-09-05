import { requireAuthSchema } from "./auth-database.server.ts";
import { AuthNotConfigured, readOwnerAuthConfig } from "./auth-config.server.ts";
import { migrateOwnerAuth } from "./auth-migrations.server.ts";
import Database from "better-sqlite3";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOwnerAuth, getOwnerAuth, resetOwnerAuthForTests, type OwnerAuthRuntime } from "./better-auth.server.ts";
import { endOwnerSession, requireOwner } from "./owner-auth.server.ts";
import { loginErrorMessage, LOGIN_DENIED, LOGIN_FAILED } from "./login-messages";
import { SqliteDestinationRepository } from "~/destinations/sqlite-destination-repository.server";
import { loader as listLoader, action as listAction } from "~/routes/owner-destinations";
import { loader as editLoader, action as editAction } from "~/routes/owner-destination-edit";
import { loader as previewLoader } from "~/routes/owner-destination-preview";
import { loader as loginLoader } from "~/routes/owner-login";
import { loader as oldCallback } from "~/routes/owner-callback";

const origin = "http://localhost:5173";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: "jwk" }), kid: "test-google-key", alg: "RS256", use: "sig" };
const owner = { sub: "google-owner-123", email: "owner@example.com", email_verified: true, name: "Owner" };
const config = {
  baseURL: origin, secret: "test-only-secret-6940ac8f-c54b-4b6b-9f50-27ddc598b1c3",
  clientId: "test-client.apps.googleusercontent.com", clientSecret: "test-client-secret",
  bootstrapEmail: "  OWNER@EXAMPLE.COM ", databasePath: "unused",
};

type Profile = Record<string, unknown>;
function token(profile: Profile) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: publicJwk.kid, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: config.clientId, iat: now, exp: now + 3600, ...profile })).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}
function cookies(response: Response) {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
}
function request(url: string, method = "GET", cookie = "", body?: unknown, requestOrigin = origin) {
  return new Request(`${origin}${url}`, {
    method,
    headers: { Origin: requestOrigin, Cookie: cookie, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("Google-only owner authentication", () => {
  let database: Database.Database;
  let directory: string;
  let runtime: OwnerAuthRuntime;
  let tokenResponses: Map<string, Profile>;

  beforeEach(async () => {
    directory = mkdtempSync(path.join(tmpdir(), "batam-owner-auth-"));
    resetOwnerAuthForTests();
    vi.stubEnv("BETTER_AUTH_URL", config.baseURL);
    vi.stubEnv("BETTER_AUTH_SECRET", config.secret);
    vi.stubEnv("GOOGLE_CLIENT_ID", config.clientId);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", config.clientSecret);
    vi.stubEnv("DATABASE_PATH", path.join(directory, "test.sqlite"));
    database = new Database(path.join(directory, "test.sqlite"));
    runtime = createOwnerAuth(database, config);
    await migrateOwnerAuth(runtime);
    resetOwnerAuthForTests();
    vi.stubEnv("OWNER_BOOTSTRAP_EMAIL", runtime.config.bootstrapEmail);
    tokenResponses = new Map();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [publicJwk] });
      if (url === "https://oauth2.googleapis.com/token") {
        const body = input instanceof Request ? await input.text() : String(init?.body);
        const profile = tokenResponses.get(new URLSearchParams(body).get("code") ?? "");
        if (!profile) return Response.json({ error: "invalid_grant" }, { status: 400 });
        return Response.json({ access_token: "test-access-token", token_type: "Bearer", expires_in: 3600, id_token: token(profile) });
      }
      throw new Error(`Unexpected network request in auth test: ${new URL(url).origin}`);
    }));
  });

  afterEach(() => {
    resetOwnerAuthForTests();
    database.close();
    rmSync(directory, { recursive: true, force: true });
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function begin() {
    const response = await runtime.auth.handler(request("/api/auth/sign-in/social", "POST", "", {
      provider: "google", callbackURL: "/owner/destinations", errorCallbackURL: "/owner/login",
    }));
    expect(response.status).toBe(200);
    const authorization = new URL((await response.json()).url);
    expect(authorization.origin).toBe("https://accounts.google.com");
    expect(authorization.searchParams.get("prompt")).toBe("select_account");
    expect(authorization.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/callback/google`);
    return { authorization, cookie: cookies(response) };
  }

  async function login(profile: Profile = owner) {
    const flow = await begin();
    const code = randomUUID();
    tokenResponses.set(code, { ...profile, ...(flow.authorization.searchParams.has("nonce") ? { nonce: flow.authorization.searchParams.get("nonce") } : {}) });
    return runtime.auth.handler(request(`/api/auth/callback/google?code=${code}&state=${flow.authorization.searchParams.get("state")}`, "GET", flow.cookie));
  }

  function count(table: string) {
    return (database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count;
  }

  it("registers the verified owner through the real Google callback and protects the workspace", async () => {
    // Better Auth reads the clock separately for creation and expiration.
    vi.useFakeTimers({ toFake: ["Date"] });
    const response = await login();
    expect(response.headers.get("Location")).toBe("/owner/destinations");
    expect(count("user")).toBe(1);
    expect(count("session")).toBe(1);
    expect(database.prepare("SELECT google_subject FROM owner_identity").get()).toEqual({ google_subject: owner.sub });
    const cookie = cookies(response);
    const userId = await requireOwner(request("/owner/destinations", "GET", cookie), runtime);
    expect(userId).toEqual(expect.any(String));
    expect((await loginLoader({ request: request("/owner/login", "GET", cookie) } as never) as Response).headers.get("Location")).toBe("/owner/destinations");
    const row = database.prepare("SELECT createdAt, expiresAt FROM session").get() as { createdAt: string; expiresAt: string };
    expect(new Date(row.expiresAt).getTime() - new Date(row.createdAt).getTime()).toBe(8 * 60 * 60 * 1000);
  });

  it.each([
    ["wrong email", { ...owner, email: "someone@example.com" }],
    ["unverified email", { ...owner, email_verified: false }],
    ["missing subject", { email: owner.email, email_verified: true, name: "Owner" }],
  ])("rejects %s before registration or session issuance", async (_, profile) => {
    const response = await login(profile);
    expect(response.headers.get("Location")).toContain("/owner/login?error=");
    expect(count("user")).toBe(0);
    expect(count("session")).toBe(0);
    expect(count("owner_identity")).toBe(0);
  });

  it("uses the bound subject after email changes and never transfers ownership via bootstrap email", async () => {
    await login();
    const denied = await login({ ...owner, sub: "different-google-account" });
    expect(loginErrorMessage(new URL(denied.headers.get("Location")!, origin).searchParams.get("error"))).toBe(LOGIN_DENIED);
    runtime = createOwnerAuth(database, { ...config, bootstrapEmail: "new@example.com" });
    resetOwnerAuthForTests();
    vi.stubEnv("OWNER_BOOTSTRAP_EMAIL", runtime.config.bootstrapEmail);
    const allowed = await login({ ...owner, email: "changed@example.com" });
    expect(allowed.headers.get("Location")).toBe("/owner/destinations");
    const other = await login({ ...owner, sub: "other", email: "new@example.com" });
    expect(other.headers.get("Location")).toContain("owner_not_authorized");
    expect(count("user")).toBe(1);
  });

  it("cannot overwrite the binding during concurrent first sign-ins", async () => {
    const responses = await Promise.all([login(), login({ ...owner, sub: "competitor", email: "OWNER@example.com" })]);
    expect(responses.filter((r) => r.headers.get("Location") === "/owner/destinations")).toHaveLength(1);
    expect(count("owner_identity")).toBe(1);
    expect(count("session")).toBe(1);
  });

  it("revokes the session on sign-out and preserves all clearing cookies", async () => {
    const cookie = cookies(await login());
    const response = await endOwnerSession(request("/owner/logout", "POST", cookie), runtime);
    expect(response.headers.get("Location")).toBe("/");
    expect(response.headers.getSetCookie().length).toBeGreaterThan(0);
    expect(count("session")).toBe(0);
    await expect(requireOwner(request("/owner/destinations", "GET", cookie), runtime)).rejects.toMatchObject({ status: 302 });
  });

  it("rejects non-POST and missing-origin sign-out without revoking the session", async () => {
    const cookie = cookies(await login());
    for (const method of ["GET", "HEAD", "PUT", "DELETE"]) {
      await expect(endOwnerSession(request("/owner/logout", method, cookie), runtime))
        .rejects.toMatchObject({ status: 405 });
    }
    const missingOrigin = request("/owner/logout", "POST", cookie);
    missingOrigin.headers.delete("Origin");
    await expect(endOwnerSession(missingOrigin, runtime)).rejects.toMatchObject({ status: 403 });
    expect(count("session")).toBe(1);
  });

  it("checks schema readiness without creating missing tables", () => {
    expect(() => requireAuthSchema(database)).not.toThrow();
    database.exec("DROP TABLE verification");
    expect(() => requireAuthSchema(database)).toThrow(AuthNotConfigured);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'verification'").get()).toBeUndefined();
  });

  it("resets the cached runtime and closes only its own database connection", () => {
    const cached = getOwnerAuth();
    expect(getOwnerAuth()).toBe(cached);
    resetOwnerAuthForTests();
    expect(cached.database.open).toBe(false);
    expect(database.open).toBe(true);
    expect(getOwnerAuth()).not.toBe(cached);
  });

  it("rejects expired, forged, and legacy cookies", async () => {
    const cookie = cookies(await login());
    database.prepare("UPDATE session SET expiresAt = 0").run();
    for (const rejected of [cookie, "better-auth.session_token=forged", "batam_owner=old-cookie", "__Host-batam_owner=old-cookie"]) {
      await expect(requireOwner(request("/owner/destinations", "GET", rejected), runtime)).rejects.toMatchObject({ status: 302 });
    }
  });

  it("rejects authenticated non-owners and cross-origin mutations", async () => {
    const cookie = cookies(await login());
    const ownerId = await requireOwner(request("/owner/destinations", "GET", cookie), runtime);
    await expect(requireOwner(request("/owner/destinations", "POST", cookie, {}, "https://elsewhere.example"), runtime)).rejects.toMatchObject({ status: 403 });
    await expect(endOwnerSession(request("/owner/logout", "POST", cookie, {}, "https://elsewhere.example"), runtime)).rejects.toMatchObject({ status: 403 });
    database.prepare("UPDATE owner_identity SET google_subject = 'replacement'").run();
    await expect(requireOwner(request("/owner/destinations", "GET", cookie), runtime)).rejects.toMatchObject({ status: 403 });
    const context = await runtime.auth.$context;
    await expect(context.internalAdapter.createSession(ownerId)).rejects.toMatchObject({
      body: { code: "owner_not_authorized" },
    });
    expect(count("session")).toBe(1);
  });

  it("guards every private loader and every editor action before accessing Destination data", async () => {
    for (const handler of [listLoader, editLoader, previewLoader]) {
      await expect(handler({ request: request("/owner/destinations"), params: { draftId: "private" } } as never)).rejects.toMatchObject({ status: 302 });
    }
    for (const [handler, intent] of [[listAction, "create"], [listAction, "edit-published"], [editAction, "save"], [editAction, "preview"], [editAction, "publish"]] as const) {
      await expect(handler({ request: request("/owner/destinations/private", "POST", "", { intent }), params: { draftId: "private" } } as never)).rejects.toMatchObject({ status: 302 });
    }
  });

  it("rejects direct password/provider bypasses and invalid OAuth state", async () => {
    const password = await runtime.auth.handler(request("/api/auth/sign-up/email", "POST", "", { email: owner.email, name: "Owner", password: "long-test-password" }));
    expect(password.ok).toBe(false);
    const otherProvider = await runtime.auth.handler(request("/api/auth/sign-in/social", "POST", "", { provider: "github" }));
    expect(otherProvider.ok).toBe(false);
    const invalid = await runtime.auth.handler(request("/api/auth/callback/google?code=fake&state=forged"));
    expect(invalid.headers.get("Location")).toContain("/owner/login");
    expect(count("user")).toBe(0);
  });

  it("verifies Google signatures on direct token sign-in and ignores caller-supplied profile claims", async () => {
    const forged = await runtime.auth.handler(request("/api/auth/sign-in/social", "POST", "", {
      provider: "google", idToken: { token: `${token(owner).split(".").slice(0, 2).join(".")}.forged` },
    }));
    expect(forged.ok).toBe(false);
    expect(count("user")).toBe(0);
    const outsider = await runtime.auth.handler(request("/api/auth/sign-in/social", "POST", "", {
      provider: "google",
      idToken: { token: token({ ...owner, email: "outsider@example.com" }), user: owner },
    }));
    expect(outsider.ok).toBe(false);
    expect(count("user")).toBe(0);
    const valid = await runtime.auth.handler(request("/api/auth/sign-in/social", "POST", "", {
      provider: "google", idToken: { token: token(owner) },
    }));
    expect(valid.ok).toBe(true);
    expect(await requireOwner(request("/owner/destinations", "GET", cookies(valid)), runtime)).toEqual(expect.any(String));
  });

  it("rejects foreign origins and external callback redirects at the authentication handler", async () => {
    const crossOrigin = await runtime.auth.handler(request("/api/auth/sign-in/social", "POST", "", {
      provider: "google", callbackURL: "/owner/destinations",
    }, "https://outsider.example"));
    expect(crossOrigin.ok).toBe(false);
    const externalRedirect = await runtime.auth.handler(request("/api/auth/sign-in/social", "POST", "", {
      provider: "google", callbackURL: "https://outsider.example/steal",
    }));
    expect(externalRedirect.ok).toBe(false);
    expect(count("user")).toBe(0);
  });

  it("handles Google cancellation and maps errors to fixed messages", async () => {
    const flow = await begin();
    const response = await runtime.auth.handler(request(`/api/auth/callback/google?error=access_denied&state=${flow.authorization.searchParams.get("state")}`, "GET", flow.cookie));
    expect(response.headers.get("Location")).toContain("/owner/login");
    expect(loginErrorMessage("access_denied")).toBe(LOGIN_FAILED);
    expect(loginErrorMessage("<script>untrusted provider text</script>")).toBe(LOGIN_FAILED);
    expect(loginErrorMessage("owner_not_authorized")).toBe(LOGIN_DENIED);
    expect(oldCallback().headers.get("Location")).toBe("/owner/login");
  });

  it("migrates repeatedly without changing existing Destinations or the owner binding", async () => {
    const repository = new SqliteDestinationRepository(path.join(directory, "test.sqlite"));
    const before = repository.listPublished();
    expect(before.length).toBeGreaterThan(0);
    await login();
    const binding = database.prepare("SELECT * FROM owner_identity").get();
    await migrateOwnerAuth(runtime);
    await migrateOwnerAuth(runtime);
    expect(repository.listPublished()).toEqual(before);
    expect(database.prepare("SELECT * FROM owner_identity").get()).toEqual(binding);
    repository.close();
  });

  it("fails closed on missing configuration and rejects invalid origins", async () => {
    expect(() => readOwnerAuthConfig({})).toThrow(AuthNotConfigured);
    resetOwnerAuthForTests();
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    const result = await loginLoader({ request: request("/owner/login") } as never);
    expect(result).toMatchObject({ data: { configured: false, message: "Owner sign-in is not configured yet." }, init: { status: 503 } });
  });
});
