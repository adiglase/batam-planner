# MVP release verification

Use this sheet for the final owner-run verification of GitHub issue #29. Do
not close the issue until every required row has an explicit result or a
documented, owner-approved exception.

## Automated release evidence

Run from a clean checkout with Node.js 24 and npm 11:

```bash
npm install
npm test
npm run test:e2e
npm run typecheck
npm run build
```

`npm run test:e2e` builds and serves the production application against an
isolated SQLite database. It exercises installed Google Chrome at 360 × 800 and
1280 × 800. External routing is replaced at its HTTP boundary with deterministic
distance, duration, geometry, warning, and failure responses. No Google key or
production data is used. Optional WebKit regression coverage runs with
`npx playwright install --with-deps webkit && npm run test:e2e:webkit`; it is
useful engine coverage but does not count as an actual Safari result.

Record a reusable desktop walkthrough with:

```bash
npm run demo:record
```

The recording is written to `artifacts/batam-planner-demo.webm` and is ignored
by Git because it is generated evidence.

Firefox is excluded from the MVP support matrix by product-owner decision on
2026-09-11. This intentionally narrows the original issue #29 wording.

## Actual-browser matrix

Playwright WebKit is useful regression coverage but is not Safari. Record the
actual browser version and date below. “Previous” means the previous major
version available to the owner at verification time.

| Browser | Version | Viewport/device | Input | Result | Date / notes |
| --- | --- | --- | --- | --- | --- |
| Chrome current |  | 360px phone | Touch | ☐ |  |
| Chrome current |  | 1280px desktop | Mouse + keyboard | ☐ |  |
| Chrome previous |  | 360px phone | Touch | ☐ |  |
| Chrome previous |  | 1280px desktop | Mouse + keyboard | ☐ |  |
| Safari current |  | 360px phone | Touch | ☐ |  |
| Safari current |  | 1280px desktop | Mouse + keyboard | ☐ |  |
| Safari previous |  | 360px phone | Touch | ☐ |  |
| Safari previous |  | 1280px desktop | Mouse + keyboard | ☐ |  |
| Edge current |  | 360px phone emulation | Touch | ☐ |  |
| Edge current |  | 1280px desktop | Mouse + keyboard | ☐ |  |
| Edge previous |  | 360px phone emulation | Touch | ☐ |  |
| Edge previous |  | 1280px desktop | Mouse + keyboard | ☐ |  |

For every row, verify the complete smoke scenario below plus:

- Divider reaches but never exceeds its 35% and 65% snap positions.
- Pointer or touch dragging and keyboard arrow control both work.
- Discover search, selected filters, focused Destination, map viewport, active
  Trip, and selected workspace tab retain their intended context.
- Trip editing controls are absent outside edit mode and visible inside it.
- Build or Rebuild stays reachable while the Itinerary timeline scrolls.
- A dense day route remains readable without hiding the map.
- Focusing a Visit or Travel in the timeline updates the map, and selecting a
  map marker or route leg updates and reveals the timeline entry.

## Five-minute Visitor smoke scenario

Run once at 360px phone size and once at 1280px desktop size. Start the timer
when the home screen is ready and stop when the two-day Itinerary is visible.

1. Search for a Destination, clear the search, and create a Trip named
   **Batam highlights**.
2. Add Barelang Bridge, Maha Vihara Duta Maitreya Temple, Pantai Melur, and
   Wey Wey Seafood Nagoya exactly once.
3. Set Harris Hotel Batam Center as Accommodation.
4. Set arrival to Batam Centre Ferry Terminal on 2026-10-10 at 08:30 and
   departure from Harbour Bay Ferry Terminal on 2026-10-11 at 18:00.
5. Choose Car / taxi / ride-hailing, a ten-minute short-walk tolerance, and
   the current Destination order.
6. Build the Itinerary, inspect both days, and focus one Visit and one Travel
   leg from both the map and timeline.
7. Enter edit mode, change Barelang Bridge to an impossible 2,000-minute Visit,
   and Rebuild. Confirm the failed Rebuild leaves the previous Itinerary intact.

| Run | Target | Completion time | Result | Date / notes |
| --- | --- | --- | --- | --- |
| Phone | ≤ 5:00 |  | ☐ |  |
| Desktop | ≤ 5:00 |  | ☐ |  |

## Owner publishing smoke

Use the configured owner Google account and production-like durable SQLite
storage. Never use the automated test database for this check.

- [ ] Sign in through `/owner/login`; a different Google account is denied.
- [ ] Create a private Draft Destination and confirm it is absent from Discover.
- [ ] Complete validation, preview it, and Publish it.
- [ ] Start a replacement Draft and confirm the existing Published Destination
      remains unchanged until the replacement is Published.
- [ ] Temporarily close the Destination and confirm Visitors cannot select it.
- [ ] Archive it and confirm it disappears from Discover.
- [ ] Edit and republish it, then sign out and confirm private pages redirect.

## Representative Batam route plausibility

Run with the production Google Maps and Routes configuration. Compare the
displayed distance, duration, geometry, warning, and Primary transport with the
provider result. Estimates are traffic-unaware; live traffic is not expected.

| Route | Primary transport | Distance plausible | Duration plausible | Geometry / warnings correct | Date / notes |
| --- | --- | --- | --- | --- | --- |
| Batam Centre Ferry Terminal → Maha Vihara Duta Maitreya Temple | Car | ☐ | ☐ | ☐ |  |
| Harris Hotel Batam Center → Barelang Bridge | Motorcycle | ☐ | ☐ | ☐ |  |
| Nagoya Hill Shopping Mall → Wey Wey Seafood Nagoya | Walking | ☐ | ☐ | ☐ |  |

## Published Destination content review

Check name, category, area, description, coordinates, operational status,
Visit duration, hours, entry cost, address, practical notes, links, image alt
text, and image-rights source. Development mock images must be replaced with
rights-cleared launch assets.

| Published Destination | Facts | Links / route point | Image / rights | Approved by / date |
| --- | --- | --- | --- | --- |
| Barelang Bridge | ☐ | ☐ | ☐ |  |
| Eska Wellness Spa | ☐ | ☐ | ☐ |  |
| Harris Hotel Batam Center | ☐ | ☐ | N/A |  |
| Maha Vihara Duta Maitreya Temple | ☐ | ☐ | ☐ |  |
| Nagoya Hill Shopping Mall | ☐ | ☐ | ☐ |  |
| Ocarina Batam Theme Park | ☐ | ☐ | ☐ |  |
| Pantai Melur | ☐ | ☐ | ☐ |  |
| Sea Forest Adventure Batam | ☐ | ☐ | ☐ |  |
| Wey Wey Seafood Nagoya | ☐ | ☐ | ☐ |  |

## Release sign-off

- Automated verification commit: `____________________________`
- Browser matrix complete: ☐
- Phone and desktop smoke runs under five minutes: ☐
- Owner publishing smoke complete: ☐
- Representative routes plausible: ☐
- Every Published Destination approved: ☐
- Owner approval and date: `____________________________`
