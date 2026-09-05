import { redirect } from "react-router";
import { AuthNotConfigured } from "./auth-config.server.ts";
import { getOwnerAuth, type OwnerAuthRuntime } from "./better-auth.server.ts";

function requireSameOrigin(request: Request, origin: string) {
  if (!["GET", "HEAD"].includes(request.method) && request.headers.get("Origin") !== origin) {
    throw new Response("Owner action requires the application origin.", { status: 403 });
  }
}

/** One authorization decision for both the login page and private routes. */
export async function getOwnerAccess(request: Request, runtime = getOwnerAuth()) {
  const session = await runtime.auth.api.getSession({ headers: request.headers });
  if (!session) return { status: "anonymous" } as const;
  if (!runtime.policy.isOwnerUser(session.user.id)) return { status: "denied" } as const;
  return { status: "owner", userId: session.user.id } as const;
}

export async function requireOwner(request: Request, runtime?: OwnerAuthRuntime) {
  let ownerAuth: OwnerAuthRuntime;
  try {
    ownerAuth = runtime ?? getOwnerAuth();
  } catch (error) {
    if (!(error instanceof AuthNotConfigured)) throw error;
    throw redirect("/owner/login");
  }
  const access = await getOwnerAccess(request, ownerAuth);
  if (access.status === "anonymous") throw redirect("/owner/login");
  if (access.status === "denied") {
    throw new Response("This Google account isn't authorized to manage Destinations.", { status: 403 });
  }
  requireSameOrigin(request, ownerAuth.config.baseURL);
  return access.userId;
}

export async function endOwnerSession(request: Request, runtime?: OwnerAuthRuntime) {
  if (request.method !== "POST") {
    throw new Response("Sign-out requires POST.", {
      status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" },
    });
  }
  const ownerAuth = runtime ?? getOwnerAuth();
  requireSameOrigin(request, ownerAuth.config.baseURL);
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  const response = await ownerAuth.auth.handler(new Request(`${ownerAuth.config.baseURL}/api/auth/sign-out`, {
    method: "POST", headers, body: "{}",
  }));
  response.headers.set("Cache-Control", "no-store");
  if (!response.ok) return response;
  const resultHeaders = new Headers({ "Cache-Control": "no-store" });
  for (const cookie of response.headers.getSetCookie()) resultHeaders.append("Set-Cookie", cookie);
  return redirect("/", { headers: resultHeaders });
}
