import * as oidc from "openid-client";
import { createCookieSessionStorage, redirect } from "react-router";

type OwnerSessionData = {
  ownerSubject?: string;
  codeVerifier?: string;
  state?: string;
  nonce?: string;
};

type OwnerAuthConfig = {
  issuer: URL;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  ownerSubject: string;
  sessionSecret: string;
};

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured`);
  return value;
}

function getOwnerAuthConfig(): OwnerAuthConfig {
  const sessionSecret = requiredEnvironmentValue("OWNER_SESSION_SECRET");
  if (sessionSecret.length < 32) {
    throw new Error("OWNER_SESSION_SECRET must contain at least 32 characters");
  }

  return {
    issuer: new URL(requiredEnvironmentValue("OWNER_OIDC_ISSUER")),
    clientId: requiredEnvironmentValue("OWNER_OIDC_CLIENT_ID"),
    clientSecret: requiredEnvironmentValue("OWNER_OIDC_CLIENT_SECRET"),
    redirectUri: requiredEnvironmentValue("OWNER_OIDC_REDIRECT_URI"),
    ownerSubject: requiredEnvironmentValue("OWNER_OIDC_SUBJECT"),
    sessionSecret,
  };
}

function sessionStorage(config: OwnerAuthConfig) {
  return createCookieSessionStorage<OwnerSessionData>({
    cookie: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Host-batam_owner"
          : "batam_owner",
      httpOnly: true,
      maxAge: 60 * 60 * 8,
      path: "/",
      sameSite: "lax",
      secrets: [config.sessionSecret],
      secure: process.env.NODE_ENV === "production",
    },
  });
}

let cachedClient:
  | { key: string; value: Promise<oidc.Configuration> }
  | undefined;

function getOidcClient(config: OwnerAuthConfig) {
  const key = `${config.issuer.href}|${config.clientId}`;
  if (cachedClient?.key !== key) {
    cachedClient = {
      key,
      value: oidc.discovery(
        config.issuer,
        config.clientId,
        config.clientSecret,
      ),
    };
  }
  return cachedClient.value;
}

export function isConfiguredOwner(
  authenticatedSubject: string | undefined,
  configuredSubject: string,
) {
  return Boolean(
    authenticatedSubject && authenticatedSubject === configuredSubject,
  );
}

export async function requireOwner(request: Request) {
  const config = getOwnerAuthConfig();
  const storage = sessionStorage(config);
  const session = await storage.getSession(request.headers.get("Cookie"));
  if (!isConfiguredOwner(session.get("ownerSubject"), config.ownerSubject)) {
    throw redirect("/owner/login");
  }
  return config.ownerSubject;
}

export async function beginOwnerLogin(request: Request) {
  const config = getOwnerAuthConfig();
  const client = await getOidcClient(config);
  const storage = sessionStorage(config);
  const session = await storage.getSession(request.headers.get("Cookie"));
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  session.set("codeVerifier", codeVerifier);
  session.set("state", state);
  session.set("nonce", nonce);

  const authorizationUrl = oidc.buildAuthorizationUrl(client, {
    redirect_uri: config.redirectUri,
    scope: "openid",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });

  return redirect(authorizationUrl.href, {
    headers: { "Set-Cookie": await storage.commitSession(session) },
  });
}

export async function completeOwnerLogin(request: Request) {
  const config = getOwnerAuthConfig();
  const client = await getOidcClient(config);
  const storage = sessionStorage(config);
  const session = await storage.getSession(request.headers.get("Cookie"));
  const codeVerifier = session.get("codeVerifier");
  const state = session.get("state");
  const nonce = session.get("nonce");
  if (!codeVerifier || !state || !nonce) {
    throw new Response("The owner sign-in attempt has expired.", { status: 400 });
  }

  const tokens = await oidc.authorizationCodeGrant(
    client,
    new URL(request.url),
    {
      pkceCodeVerifier: codeVerifier,
      expectedState: state,
      expectedNonce: nonce,
      idTokenExpected: true,
    },
  );
  const subject = tokens.claims()?.sub;
  if (!isConfiguredOwner(subject, config.ownerSubject)) {
    throw new Response("This identity is not the configured owner.", {
      status: 403,
    });
  }

  session.unset("codeVerifier");
  session.unset("state");
  session.unset("nonce");
  session.set("ownerSubject", subject);
  return redirect("/owner/destinations", {
    headers: { "Set-Cookie": await storage.commitSession(session) },
  });
}

export async function endOwnerSession(request: Request) {
  const config = getOwnerAuthConfig();
  const storage = sessionStorage(config);
  const session = await storage.getSession(request.headers.get("Cookie"));
  return redirect("/", {
    headers: { "Set-Cookie": await storage.destroySession(session) },
  });
}
