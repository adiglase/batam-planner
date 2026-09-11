export function loader() {
  return Response.json(
    { connected: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
