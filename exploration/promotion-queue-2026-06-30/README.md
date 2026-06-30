# Promotion queue — 2026-06-30

A merged, waved queue of the canonical-promotion opportunity, drawn from the two reclassification
artifacts and gated by a `depends_on_parent` DB pass. **Analysis only — nothing is promoted or
written to canonical data.**

## Inputs

- `exploration/frontier-reclassification-2026-06-30/CLASSIFICATION.csv` (ready/frontier/doctrine)
- `exploration/unknown-notation-reclassification-2026-06-30/CLASSIFICATION.csv` (dex "Unknown")
- live `freestyle_tricks` (active canonical slugs + aliases, for the parent check)
- `src/content/freestyleObservationalUniverse.ts` (name → slug + ecosystem for frontier rows)

`PROMOTION_QUEUE.csv` contains **only `Ready for Authoring` rows** from both artifacts. Columns:
`slug, source_bucket, ADD, family_operator_group, flags, missing_parent_slug, recommended_wave,
rationale, next_action`.

## depends_on_parent pass

For every Ready row, the immediate base/parent was resolved (decomposition terminal base → explicit
DB `base_trick` → longest canonical suffix of the name) and checked against active `freestyle_tricks`
(slug / underscore-compact / canonical-name / alias). **Result: essentially no genuine parent
dependencies** — the Ready bases are canonical core atoms. Only **3** rows are flagged
`depends_on_parent`, and all three are genuine edge cases, held in `wave_3`:

- `nuclear` (bare) — no canonical base; operator-as-trick.
- `blurry-stepping-paradox` ("Blurry (Stepping Paradox)") — a stale alias of stepping-paradox.
- `rooting-rooted` — `rooted` is a settled set-primitive (0 ADD), not a dex-trick base.

## Waves

| recommended_wave | meaning | count |
|---|---|---:|
| `wave_1_no_dependency_no_verification` | promote/author now; no parent dep, no verification | **221** |
| `wave_2_no_dependency_verification_flag` | needs a verification check first (approximate ADD, far X-Dex +1) | 15 |
| `wave_3_parent_dependency` | the 3 edge rows above | 3 |
| `hold_curator_review` | `duplicate_or_alias_candidate` — dedupe/alias decision before promotion | 16 |
| `hold_parser` / `hold_doctrine` | reserved (none in the Ready set) | 0 |

Within `wave_1`, a `decomposition_present` flag distinguishes effort:
- **89** already have a derived ADD + decomposition → lightest (write op_notation + promote).
- 132 are settled-operator rows whose ADD is not yet authored → heavier (author ADD + notation).

## Promotion opportunity summary

- **Total Ready-for-Authoring:** 255 (frontier 237 + unknown 18).
- **Immediately promotable (wave_1):** 221; of those **89 with ADD/decomposition already written.**
- **Depend on a parent trick:** 3 (all edge cases).
- **Carry a verification flag:** 16 (15 in wave_2 + 1 in wave_3).
- **Held for curator dedupe (alias candidates):** 16.

### Top family / operator groups (full queue)
blurry/furious 45 · whirl/osis/other 37 · symposium/paradox 35 · ducking 25 · spinning/gyro 16 ·
pixie 15 · pogo 15 · (unclassified) 15 · atomic 10 · shooting 9 · stepping 9 · fairy 6.

### Recommended first batch — 73 rows
**Filter: `wave_1` + `decomposition_present` + not `positional_variant`.** These have a settled
operator, a derived ADD and decomposition already written, no dependency, no verification, and no
side-qualifier ambiguity — the lowest-risk promote-now set. By group:
whirl/osis/other 14 · spinning/gyro 12 · symposium/paradox 9 · ducking 5 · (unclassified) 5 ·
mirage 4 · pixie 4 · atomic 3 · plus small tails (fairy, eggbeater, legover, stepping…).

Suggested execution: take it as **one coherent ~73-row batch**, or split by family (e.g.
whirl/osis/other 14 first, then spinning/gyro 12) if smaller reviewable chunks are preferred. Each
row's `next_action` is "Promote: notation + promote to red_additions" — no human decision required.

After the first batch, the natural second pass is the **132 wave_1 rows without an ADD yet**
(settled operator, author ADD + notation), then **wave_2** (verification), then resolve the
**16 alias candidates** and the **3 edge rows**.

## Caveats

- A few `wave_1`-without-decomposition rows are folk names that still want a curator eye on the exact
  reading (e.g. `bs-blurriest`, `butterfly-down`); they're settled-operator but not yet decomposed.
- The parent check uses the **terminal base** (what a `red_additions` row references), not a full
  intermediate-cascade walk; deep multi-operator compounds whose *intermediate* layer isn't canonical
  are not separately flagged. That refinement can layer on later if cascade-ordering becomes needed.
- Held / blocked rows (Doctrine Blocked, Parser Limitation, Needs Curator Review) are **excluded**
  from this queue by design; see the two source reclassification artifacts for them.

## Reproduction

`python3 exploration/promotion-queue-2026-06-30/build_promotion_pipeline.py` (from repo root) —
regenerates both `unknown-notation-reclassification/CLASSIFICATION.csv` and this `PROMOTION_QUEUE.csv`
deterministically; summary prints to stderr.
