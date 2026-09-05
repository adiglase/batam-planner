import { redirect } from "react-router";

// The previous OIDC callback must never process an authorization code.
export function loader() {
  return redirect("/owner/login");
}
