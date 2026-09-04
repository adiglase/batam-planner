import type { Route } from "./+types/owner-login";
import { beginOwnerLogin } from "~/auth/owner-auth.server";

export function loader({ request }: Route.LoaderArgs) {
  return beginOwnerLogin(request);
}
