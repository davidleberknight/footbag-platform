# Nav Prototype 1 — Related Topology Tricks

**Spec only.** No template changes.

## Purpose

Browse all tricks that share the same symbolic-topology group as a given trick. Educational discovery: "I just hit Ripwalk; what else uses the butterfly wing-motion topology?"

## UX sketch

Embedded on `/freestyle/tricks/:slug`, below the existing Prerequisites section:

```
┌─────────────────────────────────────────────────────────┐
│ Related topology — butterfly-wing-topology              │
├─────────────────────────────────────────────────────────┤
│ All 12 tricks share butterfly's outside-wing motion +   │
│ cross-body clipper recovery.                            │
│                                                         │
│ Walking-family variants (same modifier→base, different  │
│ direction or modifier):                                 │
│   ripwalk (stepping)   sidewalk (stepping ss)           │
│   dimwalk (pixie)      parkwalk (pixie ss)              │
│   bigwalk (multi-mod)  tripwalk (quantum)               │
│                                                         │
│ Other butterfly-wing compounds:                         │
│   phoenix (pixie+ducking)   matador (nuclear)           │
│   dada-curve (self-atom; no foot plant)                 │
│   arcwalk (Frigidosis-prefix)                           │
│                                                         │
│ Anchor: butterfly (3-ADD base)                          │
└─────────────────────────────────────────────────────────┘
```

## Data sources

- `symbolic_topology_groups.csv` — group definition (id, label, description)
- `symbolic_group_membership.csv` — filter `WHERE symbolic_group_id = '<group>' AND trick_slug != '<current>'`
- `freestyle_tricks` — pull canonical_name + adds for display

## URL pattern (proposed)

- `/freestyle/topology/:group_id` — group landing page; lists all members
- Group widget on trick page is server-rendered (no client JS)

## Filter behavior

- Sort: members in current group ordered by ADD asc, then canonical_name
- Tricks the user has already visited (if session tracking exists) deprioritized below unvisited (optional future enhancement)
- Modifier-stub rows excluded (per `feedback_modifier_public_visibility.md`)

## Edge cases

- Trick belongs to multiple topology groups (most do): show **primary** group prominently, list secondary groups as smaller chips. Primary = first group emitted by the generator's rule order (topology → modifier → dex → contact → execution).
- Trick belongs to a topology group with only 1 member: hide widget (no related items).

## Effort estimate (when build phase begins)

- Service method: `getRelatedTricksByTopology(slug)` — ~30 lines
- Controller wiring: pass into existing trick-detail view-model — ~10 lines
- Template partial: ~50 lines Handlebars
- Tests: 5-8 route + service tests
- Total: ~half-day for a developer

## Constraint check

- No DB schema change (reads from staging CSVs OR a future symbolic_group_membership table)
- No canonical mutation
- Read-only on `freestyle_tricks`
- Educational layer; never overrides IFPA family display
