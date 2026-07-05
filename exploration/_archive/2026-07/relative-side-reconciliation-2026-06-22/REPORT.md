# Relative-Side Relationships — Reconciliation Report (2026-06-22)

Read-only reconciliation of the corpus against the relative-side doctrine, then a
classification update applied to the Emerging Vocabulary audit. **No scoring, no
aliases, and no slug normalization were changed; `freestyleRecordShaping.ts` was
not modified.** Per-row data: `positional_reconciliation.csv`.

## Reconciliation (154 positional-named entries)

| Class | Meaning | Count |
|---|---|---:|
| A | name & operational notation agree (`SAME`/`OP` marker matches name) | 15 |
| B | name asserts a side but no operational side-markers (notation missing) | 123 |
| C | name & notation disagree | 3 |
| D | identity already collapsed (slug is an alias of a non-positional canonical) | 13 |

`XDEX` appears in **0** of the 154 positional-named rows; `PDX` in 4 — X-Dex and
Paradox are independent of the side-qualifier word.

## Emerging Vocabulary classification update

The EV audit (`classify.py`) previously held positional variants as a single
doctrine-blocked band ("A5 positional-variant", 131). That is corrected:

| New EV bucket | What | Count |
|---|---|---:|
| **G NEEDS-AUTHORING** | positional, missing operational notation — mechanical once authored, not a Red question | 128 |
| **E (review)** | the 3 genuine name/notation conflicts | 3 |
| D RESOLVABLE / C PROMOTED | positional with `SAME`/`OP` markers (mechanically classifiable; mostly already active) | 15 (A) |
| B ALIAS | positional already collapsed to a named canonical | 13 (D) |

EV bucket deltas: **E DOCTRINE BLOCKED 187 → 59**; new **G NEEDS-AUTHORING = 128**.
E now holds only A1 DOD/DDD (14), A2 Weaving (28), A5 atomic-rotational X-Dex (14),
and the 3 positional conflicts.

### The 3 conflicts kept in review (E)
- `inspinning-same-side-illusion` — name "same side", notation shows `OP` only.
- `inspinning-same-side-mirage` — same.
- `whirl-same-side` — same.

### The 15 mechanically-classifiable (A)
`SAME`/`OP` present and matching the name, e.g. `terraging-same-clipper` (`SAME CLIP`),
`terraging-opposite-clipper` (`OP CLIP`), `fairy-same-side-mirage`, `pixie-opposite-clipper`,
`pixie-same-clipper`. (5 active; the rest classify from existing notation.)

## Identity-stripping audit (no changes made)

| Site | Behavior |
|---|---|
| `src/services/freestyleRecordShaping.ts:9` | strips trailing `(ss\|op\|opp\|opposite\|near\|far\|same[ -]side)` before slugifying ("never changes identity") — **left untouched per instruction** |
| `freestyle_trick_aliases` (13 rows) | positional names collapsed to canonicals (the D set) |
| `src/content/freestyleObservationalUniverse.ts` | positional entries tagged `intakeBucket:"alias"` |
| `src/content/freestyleSymbolicEquivalences.ts:264` | sidewalk `near` handled as equivalence |

## The 13 already-collapsed (D) — future identity-review candidates

These remain aliases (not changed); listed for a future curator identity-review of
whether the collapse loses a distinct same-side/far form:

`stepping-opposite-osis`→`torque`, `stepping-opposite-side-butterfly`→`ripwalk`,
`stepping-opposite-side-reverse-whirl`→`stepping-rev-whirl`, `stepping-opposite-reaper`→`stepping-double-switch-over`,
`stepping-same-side-torque`→`grave-digger`, `stepping-op-squeeze`→`miraging-pincher`,
`pixie-same-legover`→`magellan`, `pixie-ss-butterfly`→`parkwalk`, `inspinning-same-side-butterfly`→`inspinning-butterfly`,
`splicing-ss-blender`→`liquifier`, `surfing-ss-blender`→`big-papa-smurf`,
`flailing-ss-symposium-eggbeater`→`bill-ted-s-excellent-adventure`, `toe-near-barrage`→`barrage`.

## First authoring batch — 6 of the 128 needs-authoring (G) entries

Authored (staged via `red_additions` + `red_corrections`): `blender-same-side` (4),
`butterfly-same-side` (3), `far-butterfly` (3), `stepping-clipper-same-side` (3),
`stepping-osis-same-side` (4), `surging-same-side-osis` (5, with `surging ss osis` alias).
Each is a side-pinned variant of an active, single-dex, non-receiver base; notation = base
with the dex set `SAME`/`OP`; ADD = base ADD (bracket-count verified); no X-Dex.

**Why only 6, not the full 128** — the rest are blocked by, in order of size:

| Blocker | Count | Why it is excluded |
|---|---:|---|
| Inactive base | 56 | the qualifier-stripped base is not an active canonical, so notation can't be derived without authoring the base first |
| Multi-dex target ambiguity | 46 | the base has more than one dex, so which dex the side qualifier pins is ambiguous |
| Alias-to-base | 10 | the qualifier equals the base's default side, so the entry is the base under a positional name (an alias, not a new trick) |
| Receiver / X-Dex ambiguity | 7 | the base is an X-Dex receiver (mirage/illusion/whirl/torque/drifter/dyno/swirl); scoring would depend on the unresolved receiver-gated X-Dex doctrine |
| Unclear direction | 3 | no single same-side/far direction is determinable from the name |

Future batches must clear one of these blockers (author the missing base, resolve the
multi-dex target, or await the X-Dex ruling) — not relax the filter.

## Recommendations (no scoring, no mass alias changes)

- **Docs (done)**: `RELATIVE_SIDE_RELATIONSHIPS.md` records the doctrine; this report + the
  EV `REPORT.md` carry the corrected counts; the EV public-copy draft no longer says
  positional variants are unsettled/blocked.
- **Highest-confidence follow-ups**:
  1. Curator review the **3 C conflicts** (name vs notation).
  2. Author operational notation for the **128 G** entries (then they auto-classify A/C).
  3. Future identity-review of the **13 D** collapses (above).
  4. The `freestyleRecordShaping.ts:9` strip vs the doctrine — flagged, **deferred** (no change now).
