# Nav Prototype 2 — All Spinning Tricks

**Spec only.** No template changes.

## Purpose

Public landing page listing every trick carrying a given modifier. Generalizes to `/freestyle/modifier/:modifier_slug` for spinning, paradox, pixie, ducking, etc. Educational discovery: "Show me everything that involves spinning."

## UX sketch

Page at `/freestyle/modifier/spinning`:

```
Spinning modifier — 23 tricks at pilot tier
─────────────────────────────────────────────────────────
Rotation modifier adding +1 ADD per Red pt10 ruling
(was +2 on rotational base; flattened in pt10).

Filter by base trick:  [ all ] [ whirl ] [ osis ] [ ... ]
Filter by ADD:         [ 3 ] [ 4 ] [ 5 ] [ 6 ] [ 7 ]

Whirl base (rotational)        ADD
  spinning-whirl                 4
  spinning-paradox-whirl         5
  spinning-symposium-whirl       5
  spinning-ducking-whirl         5
  spinning-paradox-symposium-w   6  ← Montage anchor

Osis base                      ADD
  spinning-osis                  4
  ...

Torque base                    ADD
  spinning-torque                5  ← canonical Mobius

Drifter base                   ADD
  spender (paradox + spinning)   6
```

## Data sources

- `symbolic_modifier_groups.csv` — group definition for spinning-family
- `symbolic_group_membership.csv` — `WHERE symbolic_group_id = 'spinning-family'`
- `freestyle_tricks` — canonical_name + adds + base_trick
- `freestyle_trick_modifier_links` — to verify modifier membership (cross-check against staging)

## URL pattern

- `/freestyle/modifier/:modifier_slug` — e.g. `/freestyle/modifier/spinning`
- Server-rendered list; no client filtering required for MVP
- Optional: `?base=whirl` query param for base-trick filtering

## Filter behavior

- Default sort: group by base_trick (alphabetical), within group sort by ADD asc
- Pilot tier rows displayed with prose-excerpt; non-pilot rows displayed as name-only
- Modifier-stub rows hidden

## Modifier coverage (per `symbolic_modifier_groups.csv`)

17 modifier groups would each support a `/freestyle/modifier/X` page:
spinning, paradox, pixie, ducking, diving, symposium, stepping, tapping, atomic, furious, quantum, nuclear, gyro, whirling, barraging, blurry, miraging

## Effort estimate

- Service method: `getTricksByModifier(modifier_slug)` — ~40 lines (joins membership + tricks)
- Public route: `/freestyle/modifier/:slug` — ~30 lines
- Template: ~120 lines Handlebars
- Tests: 8-12 route + service tests
- Total: ~day for a developer

## Constraint check

- No DB schema change required (membership joins through staging CSV or future table)
- No canonical mutation
- Public surface, but reads only from existing tables + observational staging
