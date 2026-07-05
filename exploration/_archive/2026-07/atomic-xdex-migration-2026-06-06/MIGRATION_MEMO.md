# Atomic / X-Dex ADD Migration Memo

Audit + migration plan for Red's ruling on atomic ADD attribution. **No code or data has been changed.** This memo is the pre-change deliverable; every edit below awaits go-ahead.

## The ruling

- **Atomic set is always 1 ADD.** It is never a 2-ADD set.
- The extra ADD seen in certain compounds is **not** attached to Atomic. It is attached to the **subsequent downtime far dex, which gains an X-Dex (+1)**.
- General form: **`atomic set (1) + subsequent far dex gains X-Dex (+1)`**, replacing **`atomic becomes a 2-ADD set on rotational bases`**.
- Generalization: **certain set families can create an X-Dex opportunity on the following far dex** (atomic is the named case; quantum and nuclear are adjacent and flagged below).

## The single most important invariant

This is a **re-attribution, not a re-scoring**. For every affected trick the ADD **total is unchanged**:

```
old:  atomic(+2 rot) + mirage(2)            = 4
new:  atomic(+1) + mirage(2) + X-Dex(+1)    = 4      (atom smasher / atomic-mirage)

old:  atomic(+2 rot) + whirl(3)             = 5
new:  atomic(+1) + whirl(3) + X-Dex(+1)     = 5      (atomic-whirl)

old:  atomic(+2 rotational) + torque(4)     = 6
new:  atomic(+1) + torque(4) + X-Dex(+1)    = 6      (atomic-torque / silo)
```

**Verification gate for the whole migration:** re-run `parse_freestyle_notation.py` before and after and diff `computed_adds`. The expected diff is **zero total changes**. Any trick whose total moves is an open-question case (see §Open questions) and must halt the migration and escalate, not ship.

Corollary: the EV3 Emerging-Vocabulary ADD ordering and every published canonical ADD value are **safe** — they key on totals, which do not change. Only decomposition strings, the modifier-table weighting, the parser mechanism, and prose change.

## Where the OLD interpretation lives (inventory)

Ordered by layer, deepest first. `KEEP` = already correct. `FIX` = old model. `OPEN` = needs Red before touching.

### Layer 1 — Data + parser (source of truth; fix here first)
- **`legacy_data/inputs/curated/tricks/trick_modifiers.csv`** — `atomic,1,2,set` with notes "+2 ADD on rotational bases ... atomic mirage = atom smasher = 4 (mirage 2 + 2)" and the "atomic + torque (silo) = 6 ... open case". `FIX`: `add_bonus_rotational` 2 → 1; rewrite the note to atomic-always-+1 + X-Dex-on-following-far-dex. The silo "open case" likely resolves (see §Open Q4).
- **`scripts/parse_freestyle_notation.py`** — `ROTATIONAL_BASES = {whirl, mirage, torque, swirl}` (line 61); weight selection `m["add_bonus_rotational"] if is_rotational else m["add_bonus"]` (line 350); the rotational-escalation `parse_warnings` (lines 317-352); `PARSER_VERSION = "2.5"`. `FIX`: replace the "atomic +2 on rotational base" mechanism with "atomic contributes +1; emit an X-Dex (+1) on the following far dex." This is the compute change; bump `PARSER_VERSION`. Whether the X-Dex set equals today's `ROTATIONAL_BASES` is Open Q1.
- **Scripts that read `add_bonus_rotational`** — `legacy_data/scripts/build_trick_reconciliation_workbook.py:932` ("atomic / furious +2 bonus"), `audit_derived_add_from_notation.py`, `build_fborg_reconciliation_xlsx.py`, `build_structural_alias_adjudication.py`, `build_glossary_synthesis_1.py:423`. `FIX`: align with the new model after the parser/data change.

### Layer 2 — Generated promotion data (regenerate, never hand-edit)
- **`src/content/freestyleObservationalUniverse.ts`** — **18** decomposition strings of the form `"atomic(+2 rot) + X = N"` (atomic-mirage, atomic-ducking-mirage, atomic-whirl, atomic-reverse-swirl, atomic-swirl, atomic-symposium-mirage, atomic-ducking-whirl, atomic-symposium-whirl, atomic-ducking-torque, atomic-gyro-torque, and their duplicate-variant rows). `FIX via regeneration`: the upstream reconciliation packet emits these; fix the generator/source then re-run `build_observational_universe_content.py`. `provisionalAdd` totals stay (4/5/6/7).
- **Upstream source of those strings** — e.g. `legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv:213` (atomic-torque "atomic(+2 rotational) + torque(4) = 6 ADD"). `FIX` the authored decomposition string.

### Layer 3 — Hand-authored content modules (`src/content/`)
- `freestyleTrickMechanicalDelta.ts:134` — "The atomic operator adds **+2 ADD** on the mirage chassis ... atomic(+2) + mirage(2)". `FIX`.
- `freestyleTrickProgressiveReadings.ts:234` — "atomic(+2) + mirage(2) = 4 ADD". `FIX`.
- `freestyleResolvedFormulas.ts:525` — "atomic(+2 rotational) + torque(4) = 6 ADD". `FIX`.
- `freestyleAddAnalysisContent.ts:169, 331` — "triggers the **atomic +2-rotational rule**" / "the rotational-character property that triggers atomic +2-rotational". `FIX` (the rule itself is being retired).
- `freestyleOperatorGrammar.ts:313` — "Atomic also acts as a set primitive (**standalone 2 ADD**)". `FIX` → standalone +1.
- `freestyleOperatorGrammar.ts:439` — "+2 rotational base (parallel to atomic)". `FIX/VERIFY`.

### Layer 4 — Glossary
- `src/views/freestyle/glossary.hbs:1246` — modifier-table row `atomic | +1 | +2 | set` (non-rotational +1, rotational +2). `FIX`: atomic becomes +1 / +1, with the X-Dex-on-following-far-dex expressed separately (the table's two-column "non-rot / rot" shape no longer fits atomic; needs a small restructure or a footnote). Doctrine-display change; pair with any glossary prose on atomic.

### Layer 5 — Service / render layer
- `src/services/notationRendering.ts:149` — `ATOMIC: 'Atomic, set modifier (+1 / +2 on rotational base)'`. `FIX`.
- `src/services/freestyleService.ts:3832` — code comment "atomic(+2 rot) + torque(4) = 6 ADD". `FIX`.
- `src/services/symbolicModifierEducation.ts:369` — "atomic produces the nuclear set (+2)" (nuclear = paradox+atomic). `VERIFY` (adjacent, see Open Q5).

### Layer 6 — Already correct (KEEP; verify they stay consistent)
- `freestyleAddAnalysisContent.ts:357-359, 476-478` — atom-smasher "atomic(+1) + mirage(2) + xdex(+1) = 4". `KEEP` (this is the target form).
- `freestyleOperatorReference.ts:71` — "X-Dex fires on the following dex only when it is a far miraging/illusioning move (Atomic or Quantum set, identical trigger); legovers and pickups never carry it." `KEEP` as the canonical statement (but it raises Open Q1 + Q2).
- `freestyleCompositionalSets.ts:450` — "operator reference treats atomic as a primitive +1 set with x-dex character." `KEEP`.
- `red_additions_2026_04_20.csv` predator / atomic-illusion / atomic-osis, `red_corrections...:1237` fusion — all "atomic(+1 non-rotational) + base". `KEEP` totals; the "non-rotational" qualifier becomes redundant once atomic is always +1 (optional copy-edit).

### Layer 7 — Unresolved / doctrine notes (this ruling resolves or reframes them)
- `freestyleObservationalTricks.ts:31, 67, 113` — lists "atomic-family X-dex scope" as an **unresolved-doctrine** dependency. This ruling **resolves** it; update these notes (and any observational doctrine cluster keyed on the atomic/X-dex question).
- `freestyleTrickDoctrine.ts:127-128` — predator / Q7 ("Atomic X may read as Paradox Atomic X per pt10"). `OPEN` (see Q3): the ruling bears directly on Q7.
- `legacy_data/inputs/curated/tricks/OPEN_QUESTIONS.md:31` — nuclear / Sumo X-Dex. `OPEN` (Q5).

### Layer 8 — Memory (update after the code/data migration lands)
`project_pt14_rulings_nuclear_deferred`, `project_red_consultation_state`, `project_frontier_canonicalization`, `project_freestyle_state`, `project_semantic_compression_doctrine` all carry the old atomic/X-dex framing. Update once the migration ships (memory is point-in-time).

## Open questions for Red / curator (do NOT adjudicate in the migration)

1. **X-Dex eligibility scope.** The ruling and the operator reference describe the X-Dex on a "far miraging/illusioning move." But the current `+2` applies to **all** of `{whirl, mirage, torque, swirl}`. Do whirl / swirl / torque (rotational but not miraging) get the following-far-dex X-Dex (keeping their totals), or is the rotational `+2` a separate mechanism? If the latter, total-preservation breaks for those and they need their own ruling.
2. **Quantum divergence.** Operator reference says "Atomic or Quantum set, identical trigger," but `trick_modifiers.csv` has `quantum,1,1` and the worked example "quantum mirage = 3 (mirage 2 + 1)" — i.e. **no** X-Dex today. If quantum now also triggers the X-Dex, quantum-mirage becomes 4: a **total change**, not just re-attribution. Which is correct?
3. **Q7 / predator.** Predator = atomic(+1) + dlo(3) = 4 today. Does the trailing dlo qualify as a far dex that gains an X-Dex (predator → 5), or not (stays 4)? This directly answers the still-open Q7.
4. **silo / atomic-torque = 6.** The data flags this as an "open case ... beyond the +2 weight." Under the new model it reads cleanly as atomic(1) + torque(4) + X-Dex(1) = 6. Confirm the open case is now closed.
5. **Nuclear.** `trick_modifiers.csv` says "nuclear = paradox dex (+1) + downtime illusioning dex (+1) = +2 ... nuclear itself carries no X-Dex" (Sumo is the pt9 exception). Nuclear contains an atomic component, yet is declared X-Dex-free. Does the atomic-component X-Dex apply inside nuclear, or is nuclear genuinely exempt?
6. **Furious / barraging.** `furious,2,2` is a genuine two-dex uptime set (= barraging, Red pt14). It appears unaffected (not an X-Dex mechanism), but the workbook comment pairs "atomic / furious +2 bonus." Confirm furious is **out of scope**.

## Proposed migration sequence (after Q1–Q6 are answered)

1. **Data + parser** (Layer 1): `trick_modifiers.csv` atomic weight; the parser's rotational→X-Dex mechanism; bump `PARSER_VERSION`. Add the X-Dex emission to the structural parse.
2. **Re-derive + assert the invariant:** run the parser, diff `computed_adds` vs the pre-change snapshot. **Zero total changes expected.** Halt on any non-zero (open-question case).
3. **Regenerate** Layer 2 (`build_observational_universe_content.py` and the reconciliation workbook) from the fixed sources; confirm only decomposition strings changed, not totals.
4. **Hand-authored prose** (Layers 3, 5) and the **glossary table** (Layer 4): reword to atomic-+1 + X-Dex-on-far-dex.
5. **Resolved-notes cleanup** (Layer 7): retire "atomic-family X-dex scope" from the unresolved set; reframe Q7 per Red's answer.
6. **Memory** (Layer 8): update the doctrine records.
7. Build + convention gate + `npm test`; the comment standard (`.claude/rules/comments.md`) applies to every reworded string (no dates / phase labels in the new prose).

## Scope notes
- This is curator/doctrine territory; the parser + `trick_modifiers.csv` are the substantive changes, the rest is propagation.
- Touches `scripts/reset-local-db.sh`-adjacent reseeding (the parser-population step `parse_freestyle_notation.py --apply` must run after any rebuild for the structural parse to reflect the new X-Dex emission).
- `.claude/` and doc edits (if the glossary doctrine summary or DD references the old rule) need the usual approval.
