# Wave Alpha Phase 1 — Implementation Report (2026-05-23)

Implements the safest subset of the 30-row Wave Alpha promotion candidate
list as new canonical-DB rows. **Additions authored + applied to local
DB via the existing loader; full test suite green (4,122 passing).**

## What was implemented

13 new canonical-row promotions from the Wave Alpha frontier
(`wave_alpha_promotions_2026-05-23.csv`). Filter cascade:

- `frontier_tier = 1_safest`
- `recommended_action = promote_with_notation`
- `best_notation_source = fborg` (footbag.org curator-archived)
- `best_notation_convention = canonical_brackets` (no convention translation)
- ADD-math sanity check passes (`[BRACKET]` token count == derived ADD)

Filter input: 30 candidates. Filter output: 13 promotions in Phase 1.

## Family coverage

6 of 7 original Wave Alpha families promoted in Phase 1:

| Family | Phase 1 picks | Total in WA pool |
|---|---:|---:|
| `illusion` | 3 (atomic, quantum, tapping) | 6 |
| `pickup` | 2 (double, spinning) | 6 |
| `whirl` | 3 (nuclear, quantum, symposium-reverse) | 4 |
| `eggbeater` | 2 (symposium, stepping) | 4 |
| `mirage` | 2 (quantum, pixie-symposium) | 3 |
| `osis` | 1 (atomic) | 3 |
| `legover` | 0 — all 4 were Stanford-only | 4 |

## The 13 Phase 1 promotions

| Slug | ADD | Base | Op-notation (canonical-bracket form) | ADD formula |
|---|---:|---|---|---|
| `symposium-eggbeater` | 4 | eggbeater | `SET > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL]` | symposium(+1) + eggbeater(3) = 4 |
| `stepping-eggbeater` | 4 | eggbeater | `CLIP > OP IN [DEX] (plant) > SAME OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]` | stepping(+1) + eggbeater(3) = 4 |
| `atomic-illusion` | 3 | illusion | `TOE > OP OUT [DEX] > OP OUT [DEX] > OP TOE [DEL]` | atomic(+1 non-rot) + illusion(2) = 3 |
| `quantum-illusion` | 3 | illusion | `TOE > OP IN [DEX] > OP OUT [DEX] > OP TOE [DEL]` | quantum(+1) + illusion(2) = 3 |
| `tapping-illusion` | 3 | illusion | `TOE > OP OUT [DEX] (plant) > SAME OUT [DEX] > OP TOE [DEL]` | tapping(+1) + illusion(2) = 3 |
| `quantum-mirage` | 3 | mirage | `TOE > OP IN [DEX] > OP IN [DEX] > OP TOE [DEL]` | quantum(+1) + mirage(2) = 3 |
| `pixie-symposium-mirage` | 4 | mirage | `TOE > SAME IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]` | pixie(+1) + symposium(+1) + mirage(2) = 4 |
| `atomic-osis` | 4 | osis | `TOE > OP OUT [DEX] > (FRONT) SPIN [BOD] > OP CLIP [XBD] [DEL]` | atomic(+1 non-rot) + osis(3) = 4 |
| `double-pickup` | 3 | pickup | `CLIP > OP IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]` | double(+1 productive prefix) + pickup(2) = 3 |
| `spinning-pickup` | 3 | pickup | `CLIP > (back) SPIN [BOD] > OP IN [DEX] > SAME TOE [DEL]` | spinning(+1) + pickup(2) = 3 |
| `nuclear-whirl` | 5 | whirl | `CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]` | nuclear(+2) + whirl(3) = 5 |
| `quantum-whirl` | 4 | whirl | `TOE > OP IN [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]` | quantum(+1) + whirl(3) = 4 |
| `symposium-reverse-whirl` | 4 | rev-whirl | `SET > (no plant while) OP OUT [BOD] [DEX] > OP CLIP [XBD] [DEL]` | symposium(+1) + rev-whirl(3) = 4 |

## What changed in the repo

`legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv` — +13 rows
(13 new canonical promotions).

`legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` — +29 rows:

- 13 `operational_notation` rows (canonical-bracket op_notation)
- 13 `operational_notation_source` rows (provenance citation)
- 3 `trick_family` override rows for `symposium-eggbeater`,
  `stepping-eggbeater` (both → `legover`), and `symposium-reverse-whirl`
  (→ `whirl`). Required by the loader-19 no-transitive-inheritance
  forever-rule (`feedback_loader_19_family_default`): when `base_trick`
  is itself a compound with a different `trick_family`, the new row's
  default `trick_family=base_trick` must be overridden to the
  grandparent family.

## Verification performed

1. **CSV append.** Pre-load conflict check confirmed zero existing rows
   for the 13 slugs in red_additions; zero prior `operational_notation`
   entries in red_corrections.
2. **Loader applied.**
   `python3 legacy_data/event_results/scripts/19_load_red_additions.py`
   ran cleanly. 160 Red additions (147 baseline + 13 new). 295
   corrections applied total (266 baseline + 29 new). Only pre-existing
   skips (none from this slice).
3. **DB state verified.** All 13 new rows present with `adds`,
   `base_trick`, `trick_family`, `operational_notation` populated as
   expected.
4. **Parser populated.**
   `python3 scripts/parse_freestyle_notation.py --apply` re-ran cleanly
   to refresh `structural_parse_json` + `computed_add_formula` for new
   rows. Coverage: 51 `exact_self_atom`, 2 `approximate`, 0
   `unresolved`, 5 `policy_dependent`.
5. **Tests.** `npm test` → 4,122 tests passing across 230 test files;
   no regressions.

## Phase 2 — deferred (17 candidates)

| Reason for deferral | Count | Curator-paced action |
|---|---:|---|
| Notation in Stanford-shorthand only (no canonical-bracket form available) | 14 | Curator authors canonical-bracket notation per Stanford translation rule |
| Notation in FM-parens (needs dual-convention translation) | 1 | `pixie-osis` — curator translates parens → brackets |
| fborg notation has unclosed-bracket typo `[PDX[DEX]` | 1 | `paradox-illusion` — curator fixes typo, then promote |
| Other Stanford-only (special) | 1 | `inspinning-osis` — Stanford has `X.//+X` (compact) |

**Stanford-only Phase 2 candidates (14):**

`legover` family (all 4): `fairy-legover`, `ducking-legover`, `nuclear-legover`, `pixie-legover`.
Other Stanford-only: `fairy-eggbeater`, `pixie-eggbeater`, `ducking-illusion`,
`nuclear-illusion`, `ducking-mirage`, `ducking-pickup`, `fairy-pickup`,
`nuclear-pickup`, `pixie-pickup`, `pixie-whirl`.

These remain in `wave_alpha_promotions_2026-05-23.csv` for the curator
to triage on a follow-on Phase 2 pass once the canonical-bracket form
is curator-authored.

## What's still pending

- **Re-rebuild parity.** A future `scripts/reset-local-db.sh` run will
  re-apply these promotions automatically from the curated source CSVs.
- **Production parity.** Change is in the curated source-of-truth CSVs,
  so it propagates to any environment that rebuilds the DB from curated
  inputs.
- **Doc-sync.** Per the doc-sync skill, this is curator-paced data
  promotion (no design intent shift); no canonical-doc updates required.

## What this slice does NOT do

- ❌ No UI changes
- ❌ No schema migrations
- ❌ No backwards-incompatible field changes
- ❌ No doctrine adjudication
- ❌ No automatic notation translation
- ❌ Did not promote the 17 Phase 2 candidates (deferred to curator)
- ❌ Did not modify any pre-existing canonical row (this slice is
  additions + new-row corrections only)
