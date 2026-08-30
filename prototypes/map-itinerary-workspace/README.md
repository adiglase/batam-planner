# Map and itinerary workspace prototype

Throwaway UI prototype for four responsive workspace models, switchable with
`?variant=A`, `?variant=B`, `?variant=C`, or `?variant=D` on the same route.

Run it from the repository root:

```sh
./prototypes/map-itinerary-workspace/run-prototype.sh
```

Then open <http://localhost:4173>. Use the prototype toolbar to compare normal,
constrained, failure, and empty states at desktop or phone width. Nothing is
persisted and no action calls a real service.

Variant D is the validated mobile-first direction. Its map/workspace divider is
adjustable, and the same model expands from vertical regions on phones to
left/right regions on larger screens. Variants A–C remain only as decision
history.
