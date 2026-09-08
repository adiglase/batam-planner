---
status: accepted
---

# Use one full-stack React Router application with SQLite

The first production walking skeleton uses Node.js LTS, TypeScript, React, React Router Framework Mode, and Tailwind CSS as one server-rendered deployable application. The UI system uses source-owned shadcn components with Base UI primitives, the Nova preset, a neutral base theme, Geist, and Lucide icons. This gives the application consistent accessible primitives without coupling its visual design to a packaged component library. Published Destination reads cross a server boundary into SQLite through a repository interface; plain application contracts isolate map display and routing from their eventual Google adapters. This keeps initial operations and dependencies small while leaving the database and external providers replaceable.

Browser-local Trip persistence will use a versioned JSON envelope in `localStorage` behind a `TripRepository`; its small bounded data set does not yet justify IndexedDB or another dependency. Private owner access uses Google through Better Auth, with first-login email bootstrap followed by stable-subject authorization; see [ADR-0002](0002-google-owner-authentication.md). Visitor registration and multi-user owner roles remain outside the MVP.

Playwright and broad browser automation are deferred by product-owner decision because of their current time cost. Type checking, production builds, focused tests at later domain/provider seams, and manual checks at 390 × 844 and 1440 × 900 are the current walking-skeleton testing approach. The full MVP responsive targets remain 360px phone and 1280px desktop widths. The single browser-level test originally required by issue #13 therefore remains deliberately unmet.

Google Routes integration is now provided through the existing routing contract
for traffic-unaware Accommodation-to-Destination estimates required by issue
#18. The server owns its restricted API key and returns no substituted result
when Google Routes is unconfigured or unavailable.

Managed PostgreSQL, an ORM, a separate API, the owner publishing surface, deployment-provider selection, containers, queues, caches, orchestration, image storage, monitoring, and backup automation are deferred until a concrete product requirement needs them. Next.js was rejected as more framework machinery than this slice needs; TanStack Start was rejected while it remains pre-v1.
