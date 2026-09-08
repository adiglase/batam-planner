---
version: "alpha"
name: Batam Planner Coastal Workspace
description: A calm, map-led travel planning interface with coastal color and restrained warmth.
colors:
  background: "#FAF8F3"
  surface: "#FFFFFF"
  foreground: "#172B2D"
  muted-foreground: "#5F6F6E"
  primary: "#0F766E"
  primary-soft: "#E8F4F2"
  highlight: "#E7684B"
  border: "#DCE4DF"
  map-water: "#DDEFEF"
  map-land: "#FFFDF8"
typography:
  display:
    fontFamily: "Geist Variable"
    fontSize: "2.25rem"
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Geist Variable"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Geist Variable"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
---

# Batam Planner Design System

## Overview

Batam Planner is a calm coastal planning workspace, not a promotional tourism site. It should feel useful first and inviting second: map-led, clear, warm, and quietly optimistic. The visual language combines editorial restraint with cues from Batam's water, islands, and tropical warmth.

The interface stays predominantly neutral so Destination information remains easy to scan. Coastal teal establishes identity and interaction. Warm coral provides a single point of energy. Neither color should become decoration without meaning.

## Colors

Use **ocean teal** {colors.primary} for the brand mark, primary actions, active navigation, links, and keyboard focus. Use **pale aqua** {colors.primary-soft} for selected or supportive surfaces such as status badges and gentle hover states.

Use **warm coral** {colors.highlight} sparingly for map markers and exceptional travel highlights. It is not the default button color and should not fill large surfaces. A screen should normally contain fewer coral elements than teal elements.

Use **warm sand** {colors.background} as the application canvas and **soft white** {colors.surface} for cards and raised content. This quiet contrast replaces a stark white-on-white interface. Text uses **blue charcoal** {colors.foreground}; secondary text must retain readable contrast through {colors.muted-foreground}.

The illustrated map belongs to the same system: pale coastal water {colors.map-water}, warm land {colors.map-land}, teal labels and controls, and coral markers. Provider maps may keep their native cartography, but application overlays must use these semantic roles.

Dark mode uses the same relationships rather than literal inverted colors: deep blue-green canvases, lighter teal interaction, softened coral highlights, and cool off-white text.

## Typography

Geist Variable is the sole interface family. Headings are compact and confident, with tight tracking and moderate weight rather than oversized display treatment. Body copy is concise, comfortable, and slightly muted. Labels communicate hierarchy through size and weight; avoid unnecessary all-caps outside small map labels.

Use the display token for primary page questions, the body token for descriptions, and the label token for metadata and compact facts. Prefer sentence case throughout the product.

## Layout

The map and planning workspace are persistent peers.

- On larger screens, the map begins on the left at roughly 60% width and the workspace occupies the right.
- On phones, the map begins above the workspace at roughly 45% height.
- The divider is pointer- and keyboard-operable and constrains each available region to 35–65%.
- Discover, Trip details, and Itinerary remain in one stable tab location so changing planning surfaces does not reset map context.
- My Trips switches between saved Trips; the active Trip name appears beside it. Trip details and Itinerary show only that active Trip. Each saved Trip is one selectable row with name, known dates, Destination count, status, and an explicit Active indicator.
- Workspace content uses a readable maximum width, generous outer padding, and compact spacing inside data-heavy cards.

Responsive design preserves the relationship between map and content; it does not collapse the application into a conventional page with the map removed.

## Elevation & Depth

Depth is quiet. Cards use borders and surface contrast before shadows. Shadows are reserved for floating map elements, menus, dialogs, and other content that genuinely overlaps another layer. Avoid stacking multiple elevated card levels.

## Shapes

Corners are softly rounded, following the Nova preset's compact geometry. Interactive shapes should look precise rather than pill-heavy. Pills are appropriate for Badge and status elements; ordinary containers and buttons retain moderate radii.

The map marker may use a distinctive pin silhouette because it communicates location. Other controls should continue using standard shadcn shapes.

## Components

Use source-owned shadcn components built on Base UI with the Nova preset. Compose established primitives such as Tabs, Card, Badge, Button, ScrollArea, Separator, and Empty before introducing custom UI. Use component variants and semantic tokens instead of local color overrides.

Primary actions use ocean teal. Outline actions remain neutral until hover or focus. Line tabs show active text and the indicator in ocean teal. Status and context badges normally use pale aqua; coral badges require a genuinely exceptional state.

Every interactive control must retain a visible keyboard focus state. Color cannot be the only indicator of selection or status. Touch targets, readable contrast, and reduced-motion preferences apply at every viewport.

## Do's and Don'ts

Do:

- Let the map and planning content share attention.
- Use teal consistently for interaction and coral selectively for location emphasis.
- Keep cards white against the warm sand canvas.
- Prefer semantic shadcn tokens and existing component variants.
- Keep Destination facts concise and scannable.

Don't:

- Turn the interface into a saturated tropical advertisement.
- Use coral for routine buttons, broad backgrounds, or long text.
- Add arbitrary colors directly in component class names.
- Remove the map from phone layouts when the map remains available.
- Add decorative shadows, gradients, or rounded containers without a structural reason.
