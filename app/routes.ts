import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/auth/*", "routes/auth-api.ts"),
  route("api/travel-estimate", "routes/travel-estimate-api.ts"),
  route("owner/login", "routes/owner-login.tsx"),
  route("owner/callback", "routes/owner-callback.ts"),
  route("owner/logout", "routes/owner-logout.ts"),
  route("owner/destinations", "routes/owner-destinations.tsx"),
  route("owner/destinations/:draftId", "routes/owner-destination-edit.tsx"),
  route(
    "owner/destinations/:draftId/preview",
    "routes/owner-destination-preview.tsx",
  ),
] satisfies RouteConfig;
