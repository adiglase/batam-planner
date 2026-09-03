# Batam Trip Planning

Language for describing how a Visitor selects Batam Destinations and turns them into a feasible Trip and Itinerary.

## Language

**Visitor**:
The person using the planner to prepare and follow a Trip without requiring an account.
_Avoid_: User, traveller, customer

**Destination**:
A curated Batam place that a Visitor may select for a Trip.
_Avoid_: Place, attraction, stop

**Trip**:
The Visitor's saved selection of Destinations, planning constraints, and current Itinerary, if one has been built.
_Avoid_: Plan, journey

**Itinerary**:
A complete, feasible schedule that assigns every selected Destination to one Visit and includes the Travel between Visits.
_Avoid_: Schedule, route, plan

**Visit**:
The scheduled period at one selected Destination within an Itinerary.
_Avoid_: Stop, activity

**Destination order**:
The Visitor-defined relative order of the Destinations selected for a Trip. It constrains an Itinerary without assigning Visits to particular days or start times.
_Avoid_: Locked itinerary, fixed schedule, Visit sequence

**Rebuild**:
The Visitor-initiated replacement of an Itinerary after its Trip has changed. A Rebuild replaces the current Itinerary only when every selected Destination can be scheduled feasibly.
_Avoid_: Recalculation, automatic update, silent rebuild

**Needs rebuilding**:
The state of a Trip whose current inputs differ from those used to build its current Itinerary.
_Avoid_: Needs recalculation, unsaved, invalid itinerary
