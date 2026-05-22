# FB.org Non-ADD Files — Ingest Assessment — 2026-05-21

After the FB.org 1–7 ADD ingest completed (854-row master), the
remaining `exploration/fborg/` files were assessed for ingest value.

**Headline finding: there is no trick-row ingest to perform.** The
non-ADD files are re-organizations of the already-ingested corpus plus
foundational reference documents. Ingesting the family files as rows
would create ~119 duplicates. The master is **not** modified by this
assessment.

This document is the project record so a future session does not
mistake the non-ADD files for un-ingested data.

---

## 1. The 10 non-ADD files — disposition

| File | Lines | What it is | Ingest disposition |
|---|---:|---|---|
| `blurryMoves.txt` | 161 | Blurry-family trick re-listing | **0 new rows** — all 18 in master |
| `gyroMoves.txt` | 111 | Gyro-family trick re-listing | **0 new rows** — all 9 in master |
| `pixieMoves.txt` | 171 | Pixie-family trick re-listing | **0 new rows** — all 21 in master |
| `paradoxMoves.txt` | 422 | Paradox-family trick re-listing | **0 new rows** — all 57 in master |
| `fundamentalmoves.txt` | 164 | Foundational-trick re-listing | **0 new rows** — all 14 in master |
| `footbag-sets-fborg.txt` | 114 | Chris Holden set-operator vocabulary | Reference — already in `freestyleOperatorReference.ts` |
| `JobsNotation.txt` | 129 | Ben Job's 1995 original notation proposal | Foundational reference — historical |
| `Add-Categories-move-elements.txt` | 68 | "Breakdown of Adds" — the 5 ADD primitives | Foundational reference |
| `paradox-tutorial.txt` | 84 | Pedagogical tutorial | Reference / pedagogy |
| `moves-on-video.txt` | 307 | Video index | Index — not trick definitions |

## 2. Coverage proof — the 5 family files are 100% re-listings

Every trick name in the 5 family files was extracted and matched
against the master's `move_name` + `alternate_names`:

| Family file | Entries | Already in master | Genuinely new |
|---|---:|---:|---:|
| blurryMoves.txt | 18 | 18 | **0** |
| gyroMoves.txt | 9 | 9 | **0** |
| pixieMoves.txt | 21 | 21 | **0** |
| paradoxMoves.txt | 57 | 57 | **0** |
| fundamentalmoves.txt | 14 | 14 | **0** |
| **Total** | **119** | **119** | **0** |

The family files are the *same FB.org trick corpus* presented grouped
by family instead of by ADD value. The 1–7 ADD ingest already captured
all of it. **This cross-validates that the ADD-tier ingest was
complete** — a useful completeness confirmation, not a gap.

## 3. The one non-obvious signal — multi-family membership

17 tricks appear in more than one family file:

- **15 are blurry ∩ paradox** (Blur, Blurrage, Blurry Whirl, Fog,
  Bedwetter, Gauntlet, etc.). This is structurally trivial: per the
  blurry/stepping doctrine, `blurry = stepping + paradox`, so every
  blurry trick *is* a paradox trick. The overlap confirms the
  relationship; it is not new information.
- **Mobius** — gyro ∩ fundamental.
- **Paradox Mirage, Paradox Torque** — paradox ∩ fundamental.

No multi-family membership here is surprising or actionable. The
genuinely interesting multi-axis cases (torque = osis-family AND
torque-family, etc.) are already handled by `FAMILY_DUAL_MEMBERSHIPS`
in the live codebase and are out of scope for the observational
master.

## 4. Actionable finding — `footbag-sets-fborg.txt` pre-answers Red packet items

`footbag-sets-fborg.txt` is Chris Holden's set-operator vocabulary
(~55 set prefixes, each with a notation fragment). It is already
referenced in the live `freestyleOperatorReference.ts` (see memory
`reference_legacy_move_sets`), so it needs no re-ingest — **but it
directly informs three questions in the 2026-05-21 Red packet:**

| Red packet Q | FB.org sets-list definition |
|---|---|
| **Q1 Pogo-family** | `Pogo (Symposium Whirling): CLIP > (no plant while) OP IN [DEX] >` — FB.org's own sets list classifies Pogo **as a set**, defined as "Symposium Whirling" |
| **Q4 Shooting-family** | `Shooting (Stepping Paradox Illusion): CLIP > OP IN [DEX] > OP OUT [PDX][DEX] >` — listed **as a set** |
| **Fury divergence** (5-ADD report §4) | `Furious (Barraging Paradox Miraging)` — FB.org *defines* Furious as containing barraging. So "Fury = Barraging Paradox Mirage" and "Fury = Furious Paradox Mirage" are **the same statement** in FB.org's grammar — the barraging-vs-furious divergence is FB.org being internally consistent, not a conflict. |

**Recommendation:** the Red packet's Q1 and Q4 can be sharpened from
open-ended ("what is Pogo?") to homework-shown ("FB.org's sets list
defines Pogo as the set 'Symposium Whirling' — does that classification
hold in modern understanding?"). The Fury divergence note in the 5-ADD
report can be downgraded from "decomposition-name divergence" to "FB.org
internal consistency" — barraging is a *component* of furious in
FB.org's grammar. These are optional follow-ups, not changes made here.

## 5. The reference files — what they are

- **`JobsNotation.txt`** — Ben Job's original 1995 proposal ("A List
  By the Way"), the foundational document for the entire Jobs-notation
  system the project uses. Pure history; valuable as a provenance
  anchor, not as ingest data.
- **`Add-Categories-move-elements.txt`** — the "Breakdown of Adds
  (BOA)": the authoritative FB.org definitions of the 5 ADD primitives
  — `[del]` delay, `[dex]` dexterity, `[uns]` unusual surface,
  `[bod]` body, `[xbd]` cross-body — plus move-element concepts
  (Ducking/Diving). These are the definitions every `component_flags`
  value in the master rests on. Worth citing as the canonical
  ADD-primitive source if the glossary or operator reference ever
  needs a provenance anchor.
- **`paradox-tutorial.txt`** — a how-to tutorial; pedagogy, not data.
- **`moves-on-video.txt`** — a 307-line video index; a media-coverage
  cross-reference at most, not trick definitions.

## 6. Recommendation

1. **No master-CSV change.** The FB.org trick corpus is fully ingested
   (854 rows; 1–7 ADD complete). The family files add zero rows;
   writing 119 "appears in blurryMoves.txt" provenance notes would be
   churn for self-evident family groupings.
2. **Consider the FB.org file set CLOSED for trick-row ingest.** The
   remaining files are reference/pedagogy, already known or already in
   the live operator reference.
3. **Optional follow-up (curator's call):** fold the
   `footbag-sets-fborg.txt` Pogo / Shooting / Furious definitions into
   the Red packet Q1/Q4 to sharpen them (§4). Small edit; not done here
   to avoid bundling.
4. The `Add-Categories-move-elements.txt` ADD-primitive definitions
   are a clean provenance anchor if a future glossary/operator-reference
   slice wants to cite the canonical source for `[del]/[dex]/[uns]/
   [bod]/[xbd]`.

## Files changed

```
new   exploration/footbagmoves-federation/FBORG_NON_ADD_FILES_ASSESSMENT_2026-05-21.md
```

No other files modified. `SYMBOLIC_GRAMMAR_MASTER.csv` is unchanged
(854 rows × 42 cols).
