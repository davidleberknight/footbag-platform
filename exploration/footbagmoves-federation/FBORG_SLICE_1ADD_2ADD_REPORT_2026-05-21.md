# FB.org 1-ADD + 2-ADD Master Ingest — Report — 2026-05-21

Derived view of the master spreadsheet
`exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv` after
the FB.org Round 1 ingest slice. Reports are derived views; the master
is the source of truth.

---

## 1. Total trick counts

| Slice | Source file | Rows added |
|---|---|---:|
| 1-ADD | `fborg-1add.txt` | 17 |
| 1-ADD | manual curator addition (Double Knee) | 1 |
| 2-ADD | `fborg-2add.txt` | 26 |
| **Total appended** | | **44** |

**Master totals:**

| Layer | Count |
|---|---:|
| Pre-slice rows (footbagmoves + passback) | 679 |
| FB.org Round 1 rows (this slice) | 44 |
| **Total rows** | **723** |
| Schema columns (existing 26 + 16 new governance) | **42** |

## 2. First-class promotion report

| Slice | first_class=true | first_class=false |
|---|---:|---:|
| 1-ADD (incl. manual) | 17 | 1 |
| 2-ADD | 13 | 13 |
| **Total** | **30** | **14** |

### 1-ADD first-class cohort (17 rows)

Stable foundational atoms; each promoted per the user's default rule
("Promote all stable 1-add moves to first-class"):

- Around the World Kick · Clipper Kick · Cloud Kick · Flying Inside ·
  Flying Outside · Forehead Delay · Head Stall · Inside Delay · Knee
  Delay · Neck Delay · Outside Delay · Peak Delay · Shoulder Delay ·
  Sole Kick · Spin · Toe Delay · Double Knee (manual)

### 1-ADD held back from first-class (1 row)

- **Frigidosis** — `first_class=false`, `curator_review_needed=true`.
  pt11-deferred per `project_freestyle_state` memory; canonical
  decomposition awaits Red. Source description treats it as
  "non-cross-body inside-delay caught behind body" — specialized
  variant whose Jobs notation is curator-unsettled.

### 2-ADD first-class cohort (13 rows)

Tricks with explicit Jobs notation in source OR canonical foundational
stalls already in live DB:

- Around the World (`TOE > SAME IN/OUT [DEX] > SAME TOE [DEL]`)
- Bubba (`CLIP > OP OUT [DEX] > OP TOE [DEL]`; alt "Clipper set Illusion")
- Clipper (`CLIP [XBD] [DEL]`)
- Cloud Delay (foundational stall on calf)
- Fairy (`TOE > SAME OUT [DEX] > OP TOE [DEL]`)
- Heel Delay (foundational specialized stall)
- Illusion (`SET > OP OUT [DEX] > OP TOE [DEL]`)
- Leg Over (`SET > OP OUT [DEX] > SAME TOE [DEL]`)
- Mirage (`SET > OP IN [DEX] > OP TOE [DEL]`)
- Pickup (`SET > OP IN [DEX] > SAME TOE [DEL]`)
- Pincher / Squeeze (pt8-ruled = 2 ADDs)
- Pixie (`TOE > SAME IN [DEX] > OP TOE [DEL]`)
- Sole Delay (pt6-ruled Sole Stall = 2 ADD)

### 2-ADD held back from first-class (13 rows)

Folk-named compounds and observational/intake-only entries; each marked
`curator_review_needed=true` with concise unresolved-question text:

- Double Spin · Dragon · Dragonfly Kick · Flapper · Flying Clipper
  (Jester) · Hop Over · Knee Clipper · Pendulum · Probe · Rake · Toe
  Clipper · Walk Over · Wrap

## 3. Manual additions report

| Slug | source | source_file | provenance_notes |
|---|---|---|---|
| double-knee | curator | manual_curator_2026-05-21 | manual curator addition 2026-05-21 (not in fborg-1add.txt) |

Curator interpretation: `flying(1) → 1 ADD`; first_class=true; single
flying-body movement (not a compound).

## 4. Curator-review queue (14 rows)

Each row carries `curator_review_needed=true` + a concise
`unresolved_questions` string. Listed in master-row order:

| Move | Slice | Unresolved question |
|---|:---:|---|
| Frigidosis | 1 | Canonical Jobs notation; whether the "freeze without spin" qualifier counts as a distinct atom or a positional cue on inside-delay |
| Double Spin | 2 | Canonical 2-ADD trick vs strictly a modifier on body-spin (live DB classification shifted 2026-05-19) |
| Dragon | 2 | Distinct canonical trick vs alias for a cross-body outside stall variant |
| Dragonfly Kick | 2 | Whether the dex precedes or follows the flying body action structurally |
| Flapper | 2 | Distinction between Flapper (kick, 2 ADD) and pt6-ruled Flapper Stall (3 ADD) |
| Flying Clipper | 2 | Canonical naming preference: Flying Clipper vs Jester |
| Hop Over | 2 | Canonical trick vs instructional technique alias |
| Knee Clipper | 2 | (no specific question recorded; intake state) |
| Pendulum | 2 | Whether Pendulum + Rake should be canonical or remain folk-named techniques |
| Probe | 2 | Canonical trick vs folk name for a blind-set clipper variant |
| Rake | 2 | ADD divergence: IFPA 2 vs FM 3 |
| Toe Clipper | 2 | (no specific question recorded; intake state) |
| Walk Over | 2 | Whether Walk Over is canonical or instructional |
| Wrap | 2 | Whether Wrap is a canonical trick or an instructional wrap-around mechanic |

## 5. Duplicate / alias candidates

### Alternate-name preservation (parentheticals + asterisks)

| FB.org move | Source artifact | Captured in |
|---|---|---|
| Bubba | "(Clipper set Illusion)" parenthetical | `alternate_names` = `Clipper set Illusion`; `provenance_notes` records parenthetical |
| Pincher | "(Squeeze)" parenthetical | `alternate_names` = `Squeeze` |
| Flying Clipper | "also called Jester" in description | `alternate_names` = `Jester` |
| Inside Delay\* | trailing `*` indicates video demo | preserved in move_name; `alternate_names` = `inside-stall` |
| Outside Delay\* | trailing `*` | preserved + `alternate_names` = `outside-stall` |
| Toe Delay\* | trailing `*` | preserved + `alternate_names` = `toe-stall` |
| Clipper\* | trailing `*` | preserved + `alternate_names` = `clipper-stall` |
| Leg Over\* | trailing `*` | preserved + `alternate_names` = `legover` |
| Mirage\* | trailing `*` | preserved (no alt-name needed) |

### Live-DB equivalence (`equivalent_to` field populated)

Tricks that already exist in live `freestyle_tricks` carry an explicit
cross-reference:

| FB.org row | equivalent_to |
|---|---|
| Toe Delay\* | `toe-stall (live DB)` |
| Clipper Kick (1-add) | `clipper-stall (live DB; with stall finish at 2 ADD)` |
| Clipper\* (2-add) | `clipper-stall (live DB; displaySlug clipper)` |
| Around the World (2-add) | `around-the-world (live DB)` |
| Mirage\* | `mirage (live DB; family-anchor)` |
| Leg Over\* | `legover (live DB)` |
| Pickup | `pickup (live DB)` |
| Illusion | `illusion (live DB)` |
| Pixie | `pixie (live DB; pixie-as-base; pixie-as-modifier is +1)` |
| Fairy | `fairy (live DB; fairy-as-base only)` |

### Within-FB.org pairings (1-add kick ↔ 2-add stall)

| 1-ADD (kick form) | 2-ADD (with stall finish) |
|---|---|
| Around the World Kick | Around the World |
| Clipper Kick | Clipper\* |
| Cloud Kick | Cloud Delay |
| Sole Kick | Sole Delay |

These are NOT collapsed in the master — both rows preserved per
"do NOT aggressively normalize" + "preserve source truth" rules.

### Notes on potential confusion (NOT collapsed)

- **Flapper** appears in the 2-ADD source AND was pt6-ruled
  "Flapper Stall = 3 ADD" elsewhere. Both readings preserved; curator
  review queued.
- **Spin** (1-ADD) is distinct from the spin-flag primitive in
  `osis` decomposition AND from the spinning body operator (a +1
  modifier). Three concepts share the word "spin"; the 1-ADD Spin
  entry's `parser_notes` documents the disambiguation per the
  ADD-analysis Phase 1 doctrine.

## 6. Schema extension (column additions)

16 new columns appended to the master after the existing 26:

```
canonical_slug · display_name · add_formula · add_confidence ·
decomposition_status · doctrine_status · primary_operator ·
modifier_chain · source_description · parser_notes · equivalent_to ·
publication_status · first_class · curator_review_needed ·
unresolved_questions · provenance_notes
```

**Defaults for existing 679 rows:** all 16 new columns empty (intake
state). These rows have not yet been governance-classified; that is
follow-up curator work.

**Default values for the 44 new FB.org rows:**

- `publication_status = 'intake'` (default for this layer)
- `add_confidence = 'high'` for all canonical Jobs-notation rows;
  `medium` or `low` for hedged entries
- `doctrine_status = 'settled'` for canonical atoms; `pending` /
  `hedged` for observational/folk-named rows
- `decomposition_status = 'atom'` for foundational primitives;
  `compound` for explicit operator stacks; `specialized` for folk
  named one-off mechanics

## 7. Suggested next slice — 3-ADD ingestion

The 3-ADD source file `exploration/fborg/fborg-3add.txt` is next.
Anticipated scope based on file inventory:

- Likely ~30–50 entries (footbag.org 3-ADD listings)
- Includes the canonical family-anchor atoms `whirl`, `butterfly`,
  `swirl`, `osis` (each 3 ADD per live DB `freestyle_tricks`)
- Will overlap with several existing master rows from the
  `footbagmoves-3-4adds.txt` ingest (currently 120 rows in master).
  The 3-ADD slice will be the first slice with UPDATE potential rather
  than purely additive — some FB.org tricks will already have FM
  counterparts in the master.

**Recommended 3-ADD slice scope:**

1. Read `fborg-3add.txt` source.
2. For each entry, check the master for existing rows by name
   (footbagmoves source) and decide UPDATE vs APPEND per row.
3. Apply the same 16-column governance population pattern established
   in this slice.
4. First-class promotion rule for 3-ADD: stable canonical atoms
   (whirl / butterfly / swirl / osis) → first_class=true. Curator
   adjudication for the remainder.
5. Surface alias candidates (e.g. footbagmoves "Atom Smasher" ↔
   fborg-equivalent) for explicit `equivalent_to` linkage.

**Carry-over questions for the curator:**

- Should within-FB.org kick/stall pairings (1-add kick + 2-add stall)
  be linked via `equivalent_to`? Currently not linked; preserved as
  separate rows.
- Should the 14 curator-review entries in this slice be triaged in
  parallel with the 3-ADD ingest, or sequenced after the full
  1-add/2-add/3-add round 1 lands?
- The schema-extension default for the existing 679 footbagmoves +
  passback rows leaves all 16 new columns empty. Should there be a
  backfill pass (e.g., minimum `publication_status='intake'` +
  `first_class='false'` defaults) so the column semantics are
  uniform across the master?

## Master row provenance (file path)

`exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv` —
723 rows × 42 columns. The ingest script lived at `/tmp/fb_ingest_slice1.py`
(one-shot; not committed; superseded by direct CSV edits going forward
per the spreadsheet-first governance posture).
