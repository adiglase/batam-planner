import type { Route } from "./+types/owner-logout";
import { endOwnerSession } from "~/auth/owner-auth.server";

export function action({ request }: Route.ActionArgs) {
  return endOwnerSession(request);
}
