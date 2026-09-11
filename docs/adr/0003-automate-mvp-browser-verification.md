---
status: accepted
---

# Automate MVP browser verification with Playwright

The walking-skeleton decision in ADR-0001 deferred browser automation while the
product shape was still changing. For the MVP release, use Playwright against a
production build with isolated SQLite data and deterministic external routing,
covering the exact phone and desktop viewport targets while keeping actual
branded-browser and owner-operated checks in a written release matrix. This
supersedes ADR-0001's browser-automation deferral; it accepts the added runtime
and maintenance cost in exchange for repeatable workflow and interaction
evidence.
