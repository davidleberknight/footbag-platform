# Blurry/Stepping Per-Row Coexistence Triage — 2026-05-21

Doctrine slice 2 from the Red 2026-05-21 historical-ontology ingest
(see [[HISTORICAL_ONTOLOGY_DOCTRINE]] §4, Doctrine C). A per-row pass
over the blurry-named cohort in
`exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv`,
applying the blurry/stepping coexistence framing uniformly.

Reversible: `parser_notes` + `doctrine_status` (+ minimal governance
on governance-empty rows) only. No ADD values changed. No rows added
or removed. Master integrity confirmed: 854 rows × 42 cols, unchanged.

---

## 1. What the triage did

19 blurry-named rows triaged. For each: applied a consistent
`doctrine_status`, a uniform coexistence (or polysemy-distinguishing)
`parser_notes` sentence, and `curator_review_needed` where the
structural reading is genuinely unconfirmed.

| Disposition | Count |
|---|---:|
| Rows triaged | 19 |
| doctrine_status = settled | 6 |
| doctrine_status = hedged | 13 |
| curator_review_needed = true | 5 |

## 2. The doctrine_status rule applied

The triage standardized a previously-inconsistent field. The rule:

- **`settled`** — Red explicitly ruled the structural equivalence
  *and* the ADD value.
- **`hedged`** — the structural reading is inferred / compositional,
  not individually Red-ruled. Per Doctrine C, "prefer `hedged` for
  blurry/stepping pairs until per-row curator confirmation."

**Corrections made for consistency:**

| Row | Was | Now | Reason |
|---|---|---|---|
| Blurry Torque | hedged | **settled** | Red 2026-05-15 ruled it (= Stepping Paradox Torque = 6) — was wrongly hedged |
| Food Processor | hedged | **settled** | Red 2026-05-15 ruled it (= Stepping Paradox Blender = 6) |
| Blurrier | settled | **hedged** | "Stepping Down Double Down" — not individually Red-ruled |
| Blurriest | settled | **hedged** | "stepping opposite-side barfly" — not individually Red-ruled |

The 6 `settled` rows: Blur, Blurry Whirl, Blurry Torque, Food
Processor, Toe Blur, Backside Symposium Toe Blur. The first four are
stepping-paradox-sense Red rulings; the last two are quantum-sense
Red rulings (see §4).

## 3. Coexistence framing standardized

Every stepping-paradox-sense blurry row now carries one uniform
`parser_notes` sentence:

> Blurry/stepping coexistence (Red 2026-05-21 Doctrine C): the
> 'blurry'-form name is the historically-compressed layer; the
> 'stepping (paradox)' reading is the later structurally-explicit
> layer. Both legitimate; neither supersedes the other.

Red-ruling prefixes (pt10, Red 2026-05-15) are preserved ahead of the
coexistence sentence where present. Before the triage, the framing
existed on only 7 of the 13 stepping-paradox rows and in three
slightly different wordings; it is now uniform across all 13.

## 4. Key finding — the "blur" polysemy

"Blur" is **not one operator**. The triage surfaced two
historically-real, structurally-distinct senses:

| Sense | Examples | Reading | ADD basis |
|---|---|---|---|
| **Clipper-set blur** | Blur, Blurry Whirl, Blurry Torque, all "Blurry X" | stepping + paradox | pt10 / Red 2026-05-15 |
| **Toe-set blur** | Toe Blur, Backside Symposium Toe Blur | quantum | Red pt2 |

This is itself a clean instance of the Red 2026-05-21 historical-
divergence doctrine: the same syllable "blur" carries two readings
because the vocabulary accreted at two different times. The triage
does **not** collapse them — both senses are preserved, and the
toe-set rows carry a distinguishing `parser_notes` sentence:

> Blur polysemy: this 'blur' is the QUANTUM sense (toe-set blur =
> quantum mirage), distinct from the clipper-set 'blurry' =
> stepping+paradox sense. Both readings are historically real; not the
> same operator.

**Paradox Blur** sits on the fault line — its notation is clipper-set
(suggesting the stepping+paradox sense) but its base ADD is
unresolved. Flagged `curator_review_needed=true`.

## 5. Live evidence inside PassBack's own data

Two PassBack rows are the strongest evidence for Doctrine C, because
the two layers appear in **one source's own columns**:

| Row | move_name (folk layer) | technical_name (explicit layer) |
|---|---|---|
| Alpine Blurry Whirl | "Alpine Blurry Whirl" | "Stepping Whirl (op) (ducking)" |
| Blurry Drifter (passback) | "Blurry Drifter" | "Stepping Drifter (op)" |

PassBack itself records the folk name with "Blurry" and the technical
name with "Stepping." This is the blurry → stepping shift captured
within a single source — not a cross-source divergence, an
*intra-source* generational layering. Both rows were governance-empty
before the triage; now populated with the coexistence framing.

## 6. Curator-review queue (5 rows)

| Row | Question |
|---|---|
| Blurrage (×2) | Confirm the Stepping Paradox Barrage reading; **resolve the duplicate** — two byte-identical "Blurrage" rows exist in the footbagmoves source (see §7) |
| Blurry Chainsaw Massacre | Confirm decomposition ("Blurry Illusioning Paradox Symposium Eggbeater"); the illusioning operator's ADD weight is itself unresolved |
| Paradox Blurry Whirl | Confirm whether the explicit reading carries a *doubled* paradox operator ("Paradox" + "Stepping Paradox Whirl") |
| Paradox Blur | Resolve which "blur" sense it builds on — clipper-set (stepping+paradox) or toe-set (quantum) |

## 7. Data quirk surfaced — duplicate Blurrage

The footbagmoves source contains **two byte-identical "Blurrage"
rows** (same `move_name`, `technical_name` "Blurry Barrage", and
`symbolic_notation_raw`). The 5-ADD FB.org ingest's UPDATE matched
only the first; the triage applied identical treatment to both so they
are at least consistent. Per the source-truth rule and Red's "do not
retroactively correct old sources" constraint, **neither row was
deleted** — the duplicate is preserved and flagged for curator
de-duplication. Deleting a source row is a curator decision, not an
intake-layer one.

## 8. Explicit-layer counterparts (not edited — noted for context)

Several stepping-paradox rows are the *explicit layer* of a blurry
mechanic but are not themselves blurry-named, so the triage left them
untouched: Blizzard (Stepping Paradox Illusion), Bedwetter (Stepping
Paradox Eggbeater), Fog (Stepping Paradox DLO — source description
literally reads "A Blur with extra legover"). They already sit in the
explicit layer; no coexistence note is needed on them. A future slice
could add light back-references if the curator wants the pairing
visible from both directions.

## 9. What remains open

- The 5 curator-review rows in §6.
- The duplicate-Blurrage de-duplication decision (§7).
- Doctrine C said the coexistence framing should be "per-row
  curator-confirmed." This triage applied it *uniformly and
  consistently* and recorded the framing — but uniform application is
  not the same as curator confirmation. The 13 `hedged` rows remain
  hedged precisely because they await that confirmation. A short
  curator pass over the 13 would graduate the confirmed ones to
  `settled`.

## Files changed

```
modified  exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv
            (854 rows / 42 cols unchanged; 19 rows' doctrine_status +
             parser_notes + review fields triaged)
new       exploration/red-historical-ontology-2026-05-21/BLURRY_STEPPING_TRIAGE_2026-05-21.md
```
