import type { Route } from "./+types/owner-callback";
import { completeOwnerLogin } from "~/auth/owner-auth.server";

export function loader({ request }: Route.LoaderArgs) {
  return completeOwnerLogin(request);
}
