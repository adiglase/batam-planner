import { redirect } from "react-router";
import { AuthNotConfigured, getOwnerAuth, type OwnerAuthRuntime } from "./better-auth.server.ts";

function requireSameOrigin(request: Request, origin: string) {
  if (!["GET", "HEAD"].includes(request.method) && request.headers.get("Origin") !== origin) {
    throw new Response("Owner action requires the application origin.", { status: 403 });
  }
}

export async function requireOwner(request: Request, runtime?: OwnerAuthRuntime) {
  let ownerAuth: OwnerAuthRuntime;
  try { ownerAuth = runtime ?? getOwnerAuth(); }
  catch (error) {
    if (!(error instanceof AuthNotConfigured)) throw error;
    throw redirect("/owner/login");
  }
  const session = await ownerAuth.auth.api.getSession({ headers: request.headers });
  if (!session) throw redirect("/owner/login");
  if (!ownerAuth.policy.isOwner(session.user.id)) {
    throw new Response("This Google account isn't authorized to manage Destinations.", { status: 403 });
  }
  requireSameOrigin(request, ownerAuth.config.baseURL);
  return session.user.id;
}

export async function endOwnerSession(request: Request, runtime = getOwnerAuth()) {
  requireSameOrigin(request, runtime.config.baseURL);
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  const response = await runtime.auth.handler(new Request(`${runtime.config.baseURL}/api/auth/sign-out`, {
    method: "POST", headers, body: "{}",
  }));
  if (!response.ok) return response;
  const resultHeaders = new Headers({ "Cache-Control": "no-store" });
  for (const cookie of response.headers.getSetCookie()) resultHeaders.append("Set-Cookie", cookie);
  return redirect("/", { headers: resultHeaders });
}
