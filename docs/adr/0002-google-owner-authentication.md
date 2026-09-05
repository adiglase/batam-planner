---
status: accepted
---

# Use Better Auth with Google and SQLite for owner access

Replace the custom OIDC session implementation with Better Auth and Google as the
only provider. Use Better Auth's built-in Kysely adapter with the existing SQLite
driver and database, keeping Destination queries unchanged. Persistent account
and session tables prepare for future Visitor accounts without adding public
registration, an ORM, or another database service now.

The first verified Google identity matching the configured bootstrap email is
bound atomically to its stable Google subject. Subsequent authorization compares
that subject; changing the bootstrap email never transfers ownership. Both
identity admission and session creation enforce the owner policy, and all private
route loaders/actions independently enforce owner access. Sessions last eight
hours without rolling refresh. The owner opens `/owner/login` directly; the public
workspace has no login controls. This supersedes ADR-0001's custom OIDC choice.

Authentication tables have an explicit repeatable migration command rather than
request-time migrations. Existing Destination data and owner bindings survive
migration. Visitor registration, Trip account migration, and owner transfer are
separate future decisions.
