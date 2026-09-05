import type { Route } from "./+types/auth-api";
import { AuthNotConfigured, getOwnerAuth } from "~/auth/better-auth.server";
import { LOGIN_NOT_CONFIGURED } from "~/auth/login-messages";

async function handle({ request }: Route.LoaderArgs | Route.ActionArgs) {
  try {
    const response = await getOwnerAuth().auth.handler(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (!(error instanceof AuthNotConfigured)) throw error;
    console.error(`[owner-auth] ${error.message}`);
    return Response.json({ code: "auth_not_configured", message: LOGIN_NOT_CONFIGURED }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}

export const loader = handle;
export const action = handle;
