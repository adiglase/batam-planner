# Batam Planner

An English-first, responsive planner for discovering owner-curated Batam
Destinations and turning them into a feasible Trip and Itinerary.

## Requirements

- Node.js 24 LTS
- npm 11

## Development

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

The application is available at <http://localhost:5173>. On first startup it
creates `.data/batam-planner.sqlite`, applies the initial schema, and adds the
first Published Destination when that seed record is absent.

UI primitives are source-owned shadcn components using Base UI and the Nova
preset. Add another component from the project root with:

```bash
npx shadcn@latest add <component>
```

Set `DATABASE_PATH` to use a different SQLite file:

```bash
DATABASE_PATH=/absolute/path/to/batam-planner.sqlite npm run dev
```

Set a browser-restricted Google Maps JavaScript API key to use the production
map adapter. Without one, development uses the provider-independent illustrated
map fallback:

```bash
VITE_GOOGLE_MAPS_API_KEY=your-browser-key npm run dev
```

## Verification

```bash
npm run typecheck
npm run build
```

Browser-level automation is deliberately deferred for the initial walking
skeleton. This slice was checked manually at 390 × 844 and 1440 × 900. The full
MVP responsive targets remain 360px phone and 1280px desktop widths.

## Production

Build and run the single Node.js application:

```bash
npm run build
npm start
```

The production host must provide durable storage for the SQLite file.
