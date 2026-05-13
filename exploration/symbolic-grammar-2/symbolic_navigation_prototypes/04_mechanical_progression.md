# Nav Prototype 4 — Mechanical Progression

**Spec only.** No template changes.

## Purpose

Walk learners through a movement archetype's progression from foundation primitives to complex compounds. Educational discovery: "Starting from butterfly's wing motion, how do I build up through the walking-family compounds?"

## UX sketch

Page at `/freestyle/archetype/:archetype_id`:

```
Movement archetype — Uptime dex + Downtime butterfly wing
─────────────────────────────────────────────────────────
A movement shape where a dex flick (uptime) opens into a
butterfly wing motion that completes (downtime) with
cross-body clipper recovery.

   Anchor (3-ADD foundation)
   └─ butterfly                            3

   ┌─ Modifier additions (4-ADD tier) ────────┐
   ├─ stepping → ripwalk (natural-direction)  4
   ├─ stepping → sidewalk (same-side)         4
   ├─ pixie → dimwalk (natural-direction)     4
   ├─ pixie → parkwalk (same-side)            4
   ├─ quantum → tripwalk                      4
   ├─ ducking → ducking-butterfly             4
   └─ atomic → atomic-butterfly = legbeater   4

   ┌─ Multi-modifier (5-ADD tier) ───────────┐
   ├─ pixie + ducking → phoenix              5
   ├─ nuclear → matador                      5
   └─ bigwalk (multi-mod)                    5

   No-modifier no-step variant
   └─ dada-curve (4-ADD self-atom; no plant) 4
```

## Data sources

- `movement_archetype_registry.csv` — archetype definition
- `symbolic_group_membership.csv` — members of the relevant topology + modifier groups
- `freestyle_tricks` — canonical_name + adds + base_trick
- `freestyle_trick_modifier_links` — to identify modifier composition

## URL pattern

- `/freestyle/archetype/:archetype_id` — e.g. `/freestyle/archetype/uptime-dex-downtime-butterfly`
- Index page at `/freestyle/archetype` lists all 11 archetypes

## Filter behavior

- Tier ordering: anchor (lowest ADD) → modifier compounds (sorted by ADD asc, then alphabetical)
- Multi-modifier compounds in a separate higher tier
- Variant rows (same ADD, different mechanics) called out explicitly (e.g., dada-curve = no-step variant)

## Educational angle

The progression visualizes how a movement archetype scales from foundation to flagship: each row adds a body discipline. Connects to SCALE pilot data — readers see prose-authored rows highlighted, non-pilot rows as future-additions.

## Effort estimate

- Service method: `getArchetypeProgression(archetype_id)` — ~50 lines
- Public route + index — ~40 lines
- Template: ~150 lines Handlebars (tier rendering)
- Tests: 10-15 route + service tests
- Total: ~1-1.5 day for a developer

## Constraint check

- No DB schema change
- No canonical mutation
- Educational layer; archetype taxonomy is observational, never overrides IFPA family
