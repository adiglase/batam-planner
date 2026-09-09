# Batam Trip Planning

Language for describing how a Visitor selects Batam Destinations and turns them into a feasible Trip and Itinerary.

## Language

**Visitor**:
The person using the planner to prepare and follow a Trip without requiring an account.
_Avoid_: User, traveller, customer

**Destination**:
A curated Batam place that a Visitor may select for a Trip.
_Avoid_: Place, attraction, stop

**Draft Destination**:
A private candidate version of a Destination that the product owner may edit and preview. It is never available to a Visitor.
_Avoid_: Draft (ambiguous with a Draft Trip), unpublished place

**Published Destination**:
The current validated version of a Destination available to Visitors. Editing a replacement Draft Destination does not change it until the replacement is explicitly Published.
_Avoid_: Live place, public draft

**Trip**:
The Visitor's saved selection of Destinations, planning constraints, and current Itinerary, if one has been built.
_Avoid_: Plan, journey

**Active Trip**:
The one saved Trip the Visitor is currently viewing or editing. A Visitor may keep multiple Trips, with exactly one active while saved Trips exist; the others remain saved when the active Trip changes.
_Avoid_: Trip list (the collection of saved Trips, not the active Trip), current Itinerary (a result belonging to a Trip)

**Accommodation**:
The optional Published Destination where the Visitor stays during a Trip. It belongs to the Trip separately from selected Destinations and is never a Visit.
_Avoid_: Hotel (an Accommodation may have another form), stay, overnight anchor

**Primary transport**:
The Trip-wide way the Visitor expects to travel, used to estimate Travel and build the Itinerary.
_Avoid_: Transport mode, travel mode, vehicle

**Itinerary**:
A complete, feasible schedule that assigns every selected Destination to one Visit and includes the Travel between Visits.
_Avoid_: Schedule, route, plan

**Visit**:
The scheduled period at one selected Destination within an Itinerary.
_Avoid_: Stop, activity

**Travel**:
Movement between two Destinations using Primary transport, described by distance and duration.
_Avoid_: Route (the provider calculation or geometry, not the domain event), transfer

**Destination order**:
The Visitor-defined relative order of the Destinations selected for a Trip. It constrains an Itinerary without assigning Visits to particular days or start times.
_Avoid_: Locked itinerary, fixed schedule, Visit sequence

**Rebuild**:
The Visitor-initiated replacement of an Itinerary after its Trip has changed. A Rebuild replaces the current Itinerary only when every selected Destination can be scheduled feasibly.
_Avoid_: Recalculation, automatic update, silent rebuild

**Needs rebuilding**:
The state of a Trip whose current inputs differ from those used to build its current Itinerary.
_Avoid_: Needs recalculation, unsaved, invalid itinerary
