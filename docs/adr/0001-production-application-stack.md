---
status: accepted
---

# Use one full-stack React Router application with SQLite

The first production walking skeleton uses Node.js LTS, TypeScript, React, React Router Framework Mode, and Tailwind CSS as one server-rendered deployable application. Published Destination reads cross a server boundary into SQLite through a repository interface; plain application contracts isolate map display and routing from their eventual Google adapters. This keeps initial operations and dependencies small while leaving the database and external providers replaceable.

Browser-local Trip persistence will use a versioned JSON envelope in `localStorage` behind a `TripRepository`; its small bounded data set does not yet justify IndexedDB or another dependency. Private owner access will use one configured OIDC identity, allowlisted by stable subject, without introducing Visitor accounts or multi-user roles.

Playwright and broad browser automation are deferred by product-owner decision because of their current time cost. Type checking, production builds, focused tests at later domain/provider seams, and manual checks at 360px and 1280px are the current testing approach. The single browser-level test originally required by issue #13 therefore remains deliberately unmet.

Managed PostgreSQL, an ORM, a separate API, Google Routes integration, the owner publishing surface, deployment-provider selection, containers, queues, caches, orchestration, image storage, monitoring, and backup automation are deferred until a concrete product requirement needs them. Next.js was rejected as more framework machinery than this slice needs; TanStack Start was rejected while it remains pre-v1.
