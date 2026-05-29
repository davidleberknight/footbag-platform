# Ontology Gaps Exposed by the PassBack Media Corpus

Status: read-only analysis. No mutations. Findings feed the curator review queue and the Red Wave 2
backlog; this report does not promote, create, or alter any trick.

Method: the brief's seed cohort plus the named PassBack playlist tricks were cross-checked against
`freestyle_tricks` in `database/footbag.db` (read-only) on 2026-05-29. Dictionary-wide context:
**514 active tricks, 50 active tricks with no operational_notation, 2 inactive rows.**

A finding is "verified absent" only when neither slug nor canonical_name matched. Everything is a
candidate for curator judgment, not an assertion that a trick should exist.

---

## Bucket 1 — Not yet canonicalized (verified absent from `freestyle_tricks`)

These names from the brief / playlist returned no slug and no canonical_name match:

| Name | Likely nature | Note |
|---|---|---|
| Swifter | new trick or variant | playlist item; no row |
| Dimmiest | new trick or variant | playlist item; no row |
| Atomic Blender | compound (atomic + blender) | playlist item; `blender` exists, `atomic-blender` does not |
| Atomic Drifter | compound (atomic + drifter) | playlist item; `drifter` exists, `atomic-drifter` does not |
| Legbeater (+ chains) | trick family / chain | "Legbeater chains" in brief; no `legbeater` row (note: `eggbeater` exists and is distinct) |
| Burger (+ variants) | trick family | no `burger` row |
| Spender Walkover | compound | `spender` and `walk-over` both exist; the compound `spender-walkover` does not |

These are the promotion backlog. All are Red Wave 2 gated. Atomic Blender / Atomic Drifter are the
clearest near-term adds (both parents exist with op_notation; the loader-19 family-default rule would
need a paired family override since `blender`→osis and `drifter`→clipper-stall).

---

## Bucket 2 — Canonical but missing formula (active, `operational_notation` empty)

From the cohort specifically (subset of the 50 dictionary-wide):

| Slug | Family | Status |
|---|---|---|
| atomic | atomic | active, curated, no op_notation |
| atomic-torque | torque | active, expert_reviewed, no op_notation |
| paradox-blender | blender | active, expert_reviewed, no op_notation |
| fusion | dod | active, curated, no op_notation |
| walk-over | walk-over | active, expert_reviewed, no op_notation |

`atomic` and `walk-over` are notable: foundational/atom-adjacent names carrying no movement notation.
These are backfill candidates (derive op_notation from FB.org or sibling pattern), not promotions, and
are not Red-gated since the rows already exist.

---

## Bucket 3 — Already canonical (brief assumption corrected)

The brief flagged several as "likely needing attention" that are in fact already canonical, active,
and op_notation-bearing. Surfacing this prevents wasted promotion effort:

mobius (torque), flurricane (flurry), maelstrom (whirl), pigbeater (legover), pixie-barrage (barrage),
big-apple (torque), tombstone (drifter), spender (blender), food-processor (blender), assassin (mirage),
eggbeater (legover), paradox-symposium-eggbeater ("PS Eggbeater").

**HPD = high-plains-drifter:** the brief's "HPD" is already canonical as `high-plains-drifter`
(clipper-stall family, has op_notation). HPD is an abbreviation variant, not a missing trick (see Bucket 5).

---

## Bucket 4 — Combo-only and progression-only concepts (not single-trick entities)

The playlist names several *progressions*, which the ontology does not currently model as first-class
entities (see ARCHITECTURE §3 progression-ladder gap):

- "Food Processor progression" — `food-processor` exists as a trick; the *progression* (ordered learn
  path to it) is unmodeled.
- "Clipper to Flurry progression" — both endpoints exist; the ladder between them is unmodeled.
- "Toe Kick to Assassin progression" — `assassin` exists; the ladder is unmodeled.

Recommendation: these become `#kind-progression` + `#progression-<id>` media linkages (curated media
showing the ladder), not new trick rows. They are media-graph content, not ontology entities.

---

## Bucket 5 — Naming variants / aliases exposed by the corpus

PassBack names that map to existing canonical slugs via alias/abbreviation (evidence for the alias
layer, curator-gated):

| PassBack name | Canonical slug | Relationship |
|---|---|---|
| HPD | high-plains-drifter | abbreviation |
| ATW | around-the-world | abbreviation (already aliased) |
| Atomsmasher | atom-smasher | spelling variant (already matched) |

These are low-risk alias confirmations, still routed through curator review, not auto-applied.

---

## Bucket 6 — Ambiguous / under-matched (matcher caveats, must be human-checked)

From the existing intake reports (`exploration/passback-intake/passback_reports/`):

- **"Assassin" mis-bucketed as `new_candidate`** despite `assassin` being active in the dictionary.
  The slug matcher missed it (technical name "Pixie Ducking far Mirage"). Every `new_candidate` row
  needs an existence check before promotion routing.
- **Pogo conflict** (`conflicts.csv`): `dex_exceeds_adds`, dex 2 vs recorded adds. Held for curator.
- **Dex-vs-ADD deltas** on matched rows (atomsmasher -2, atw -1, barfly -2): the known PassBack-outlier
  pattern. Non-authoritative for ADD; linkage stays safe, delta is a note.

---

## Bucket 7 — Missing detail pages (in DB, inactive)

Only 2 rows are inactive (no rendered detail page): `rev-up` (curated), `illusioning` (pending).
Neither is in the PassBack cohort. The dictionary's active-coverage is high; "missing detail page" is
a negligible gap relative to the not-yet-canonicalized backlog (Bucket 1).

---

## Summary for the curator queue

| Bucket | Count (cohort) | Gate |
|---|---|---|
| Not yet canonicalized | 7 named | Red Wave 2 |
| Missing formula (backfill) | 5 cohort / 50 dict-wide | not gated (rows exist) |
| Already canonical (no action) | ~13 | — |
| Combo/progression (media, not ontology) | 3 | media-graph, not promotion |
| Naming variants/aliases | 3 | curator alias review |
| Ambiguous/under-matched | 3 classes | human existence check first |
| Missing detail page (inactive) | 2 dict-wide | low priority |

Highest-leverage next actions (none requiring Red Wave 2): op_notation backfill of the 5 cohort rows
in Bucket 2, and the existence-check pass over `new_candidates.csv` (Bucket 6) so the real promotion
backlog (Bucket 1) is accurately sized before the gate lifts.
