# SCALE-11 Candidate Batch — Mixed-Composition Tier-1 (6 rows)

Eleventh scalable enrichment wave. Strategic focus: **§3.2 policy-class trio completion + walking-family closure + multiplicity-exception cohort + direction-variant + standalone-with-records**. Composition: 3 original Tier-1 rows (parkwalk + bullwhip + barrage) + 3 substitutions after verification surfaced data-quality issues on fusion/omelette/flurry (modifier-decomposition unresolved or modifier-table conflict).

**Date:** 2026-05-12
**Pilot tier target:** 92 → 98 of 160 (61.25%)
**Batch size:** 6
**Source:** `SCALE11_COVERAGE_REFRESH.md` (Tier-1 default) with substitutions surfaced during per-row verification

---

## 1. Final composition (6 rows)

| # | Slug | ADD | Family | Strategic role |
|--:|---|--:|---|---|
| 1 | **parkwalk** | 4 | butterfly | **Walking-family 5th pilot.** Pixie + same-side butterfly. Closes the butterfly-walking cluster (ripwalk + sidewalk + bigwalk + dimwalk + parkwalk). Same modifier as dimwalk (pixie + butterfly) but with explicit same-side variant. |
| 2 | **bullwhip** | 5 | bullwhip (self) | **§3.2 policy-class trio completion.** Bullwhip joins nemesis (SCALE-9) + jani-walker (SCALE-10) as the third "stated ADD without stated structure" exemplar at pilot tier. Strong cohort-coherence prose; closes the trio referenced in CANONICALIZATION_POLICY §3.2. |
| 3 | **barrage** | 3 | barrage (self) | **Trick-vs-modifier distinction (terrage analog).** Standalone 3-ADD trick distinct from the barraging modifier. Description literally lists "Barraging Leg Over = Flurry" and "Barraging Paradox Mirage = Fury" as modifier-action examples — surfaces the distinction directly. |
| 4 | **rev-whirl** | 3 | whirl | **Surgery (SCALE-8) prereq + direction-variant exemplar.** Only non-pilot row currently referenced as `base_trick` by a pilot compound (surgery = rev-whirl + paradox + spinning). Reverse-direction whirl — pairs with drifter / reverse-drifter (SCALE-5 / SCALE-10) as the second canonical direction-variant pilot pair in the dictionary. |
| 5 | **double-around-the-world** | 3 | around-the-world (atw) | **Pt8 multiplicity-exception trio.** Joins double-leg-over (SCALE-9) as the second of three community-stabilized "double X" exceptions (third = double-spin, deferred). Records sort_name "ATW (in) (double)" — multiplicity explicit. |
| 6 | **high-plains-drifter** | 4 | clipper-stall | **Standalone clipper-stall compound.** 4-ADD self-atom; description: "Two-dex compound from clipper stall." Clipper-stall (2-ADD) is already pilot via SCALE-6; this row anchors clipper-stall as a base for compound expansion. No modifier-table dependencies. |

---

## 2. Substitutions from original Tier-1 default (verification findings)

Three original Tier-1 candidates were dropped after per-row data verification:

| Original | Issue surfaced | Substitute |
|---|---|---|
| **fusion** (5-ADD, base=`dod`) | `dod` row does not exist in `freestyle_tricks` as an active row. Asserted=5 has no clean decomposition target. Promoting would require prose referencing a non-pilot, non-existent base. | rev-whirl |
| **omelette** (3-ADD, base=`pickup`) | Modifier `illusioning` is flagged in dictionary as "ADD contribution is an open question." Canonical decomposition unresolved. | double-around-the-world |
| **flurry** (4-ADD, base=`legover`) | `barraging` modifier table example explicitly states `flurry = 3 (legover 2 + 1)`, but `freestyle_tricks.adds = 4`. Asserted-vs-modifier-math conflict. Not in published §3.2 policy-class list (nemesis + jani-walker + bullwhip per `CANONICALIZATION_POLICY` §3.2). Would need internal-process language in prose to navigate. | high-plains-drifter |

The three dropped rows remain SCALE-eligible once their data inconsistencies are resolved — fusion (add `dod` row or reclassify base), omelette (resolve illusioning ADD bonus in modifier table), flurry (either correct the modifier-table worked example OR add flurry to the §3.2 policy class).

---

## 3. Family + cohort expansion summary

SCALE-11 is a mixed-composition closeout batch (not a single-family deep-dive); cohort growth is selective.

| Cohort / metric | Before | After | Delta |
|---|--:|--:|--:|
| Walking-family pilots | 4 (ripwalk + sidewalk + bigwalk + dimwalk) | 5 (+parkwalk) | +1 |
| §3.2 policy-class pilots | 2 (nemesis + jani-walker) | 3 (+bullwhip) | trio complete |
| Pt8 multiplicity-exception pilots | 1 (DLO) | 2 (+double-around-the-world) | +1; third (double-spin) remains non-pilot |
| Direction-variant pilot pairs | 1 (drifter + reverse-drifter) | 2 (+whirl + rev-whirl) | +1 |
| Modifier-bridge cohort (per memory) | 13 modifiers | 13 (unchanged — no new bridge modifier introduced this batch) | +0 |
| Flagship-density rows (≥3 mod_links) | 6 | 6 (no row in this batch carries 3+ modifier_links) | +0 |
| New family bases at pilot | — | barrage (self-family) + bullwhip (self-family) | +2 |

**Strategic accomplishments:**
- §3.2 policy class trio fully at pilot — durable teaching cohort for "stated ADD without stated structure" disposition.
- Walking-family complete at pilot tier (5 of 5 known -walk variants).
- Direction-variant canonical-row pattern reinforced (drifter/reverse-drifter + whirl/rev-whirl).

---

## 4. Per-row ADD math + decomposition

All rows are pt-rules-clean (no pt12 dependencies, no expanded-decomposition gaps).

| Slug | Asserted | Composition reading | Math | Parser status |
|---|--:|---|---|---|
| parkwalk | 4 | pixie + butterfly (ss direction; ss=+0) | pixie(+1 universal) + butterfly(3) + ss(0) = 4 | exact_modifier_derived |
| bullwhip | 5 | self-atom (§3.2 stated-ADD-without-stated-structure) | bullwhip(5) | exact_modifier_derived (self-row) |
| barrage | 3 | self-atom (own family parallel to barraging modifier) | barrage(3) | exact_modifier_derived |
| rev-whirl | 3 | whirl base, reverse-direction variant (direction-is-structural rule) | whirl(3) | exact_modifier_derived |
| double-around-the-world | 3 | self-atom (pt8 multiplicity exception) | dotw(3) | exact_self_atom |
| high-plains-drifter | 4 | self-atom on clipper-stall base; two-dex compound | hpd(4) | exact_self_atom |

---

## 5. Per-row pre-write notes (cadence + content seeds)

### 1. parkwalk

- Description: "Pixie-modified same-side butterfly."
- Aliases: "pixie ss butterfly | park-walk"
- 0 records on file.
- **Walking-family 5th pilot.** Siblings already at pilot: ripwalk (stepping butterfly per pt11 / Blurry Butterfly per Jobs notation), sidewalk (stepping butterfly same-side), bigwalk (5-ADD; multi-modifier), dimwalk (pixie + natural-direction butterfly, SCALE-4).
- **Pairs directly with dimwalk:** same modifier (pixie) + same base (butterfly) + different direction (ss vs natural). The dimwalk:parkwalk pair is the 2nd canonical direction-variant pair in the walking family (sidewalk:ripwalk is the 1st: both stepping + butterfly, same-side vs natural-direction).
- Cadence note: open with body mechanics or naming-origin; do NOT lead with "5th walking-family pilot" framing (cohort-celebration anti-pattern per SCALE-9). The walking-family closure is a content fact for prereq_notes, not a prose-opener hook.

### 2. bullwhip

- Description: "Compound trick" (sparse).
- No aliases, no modifier_links, base_trick empty.
- 0 records on file.
- **§3.2 policy-class trio third member.** CANONICALIZATION_POLICY §3.2 names three rows in the "stated ADD without stated structure" class: nemesis (6-ADD; row-specific furious+barfly inference per SCALE-9), jani-walker (5-ADD; barraging+butterfly inference per SCALE-10 records sort_name), bullwhip (5-ADD; canonical decomposition not in public docs).
- **Prose challenge:** asserted = 5 with no canonical modifier+base composition exposed. Description sparse. Mechanical content needs sourcing from external evidence or framed at the §3.2 policy-class disposition level.
- Cadence note: must align with nemesis + jani-walker disposition phrasings but use distinct vocabulary (4+ replacement phrasings for the §3.2 reading per SCALE-9 / SCALE-10 methodology rule). Trio at pilot tier should read as three rows, not three iterations.

### 3. barrage

- Description: "Standalone trick distinct from the existing 'barraging' modifier; barrage is its own mechanical family. Barraging Paradox Mirage = Fury; Barraging Leg Over = Flurry."
- 1 record: Norek 2010-03-17, sort_name "Barrage (op)".
- **Trick-vs-modifier distinction (terrage analog from SCALE-10):**
  - terrage (trick) :: terraging (+3 modifier) — SCALE-10 prose pattern
  - barrage (trick) :: barraging (+1 universal modifier) — SCALE-11 prose pattern
- **Crucial data-context note:** The description's parenthetical examples ("Barraging Leg Over = Flurry" and "Barraging Paradox Mirage = Fury") are illustrations of the BARRAGING MODIFIER's action on other bases, NOT canonical decompositions of barrage itself. Barrage as a standalone trick stands in its own family (3-ADD self-atom); the description's examples surface how the modifier-form works elsewhere in the dictionary.
- Cadence note: mirror terrage's SCALE-10 prose discipline. Open with body mechanics or naming-origin; introduce the trick-vs-modifier distinction in learning_notes as an aside, not as the prose's structural backbone.

### 4. rev-whirl

- Description: "Reverse-direction whirl."
- Aliases: "reverse whirl | revwhirl | whip"
- 1 record: Norek 2009-11-02, sort_name "Whirl (rev) (ss)".
- **Direction-variant exemplar — 2nd pair in the dictionary:** drifter (3-ADD natural direction) / reverse-drifter (3-ADD reverse, SCALE-10 pilot) is the 1st canonical direction-variant pair. whirl (3-ADD natural, SCALE foundation pilot) / rev-whirl (3-ADD reverse, this batch) is the 2nd. Both pairs apply the direction-is-structural rule.
- **Pilot dep:** surgery (SCALE-8 pilot) has rev-whirl as a base_trick reference (surgery = rev-whirl + paradox + spinning per memory). Promoting rev-whirl closes that prereq landing.
- Records sort_name "Whirl (rev) (ss)" — both direction (rev) and side (ss) qualifiers explicit. ss=+0 per pt12 ruling so the math is unaffected by the same-side execution recorded.
- Cadence note: discuss the reverse-direction canonical-row rule (same kick mechanics, opposite directional travel = different dictionary row). Pairs with reverse-drifter's SCALE-10 prose on the same axis; vary the phrasing to avoid cadence echo.

### 5. double-around-the-world

- Description: "two consecutive full leg circles"
- Aliases: "double atw | datw"
- 1 record: Norek 2010-03-17, sort_name "ATW (in) (double)".
- **Pt8 community-stabilized multiplicity exception (2nd at pilot).** Pt8 ruling names three "double X" canonical exceptions: double-leg-over (DLO, 3-ADD, SCALE-9 pilot), double-around-the-world (3-ADD, this batch), double-spin (2-ADD, remains non-pilot). After SCALE-11, two of three are at pilot.
- Cadence note: mirror DLO's SCALE-9 prose discipline on the multiplicity-doubling angle. Discuss the canonical-row treatment (community-stabilized doubling earns its own row instead of collapsing to "double X" descriptor) without referencing pt8 by name (prose hygiene per `feedback_public_facing_prose.md`).

### 6. high-plains-drifter

- Description: "Two-dex compound from clipper stall."
- No aliases, no modifier_links, base_trick = clipper-stall.
- 0 records on file.
- **Standalone compound on clipper-stall base.** Clipper-stall is 2-ADD pilot (SCALE-6); high-plains-drifter is a 4-ADD self-atom on top of it. No modifier-table dependency.
- **Mechanical content cue:** "two-dex compound from clipper stall" — execution is two consecutive dexes starting from a clipper-stall plant. Different rhythm than the butterfly-walking family (whose wings are single-arc); the two-dex sequence is sequential dex action without a body-position change between them.
- Cadence note: open with the two-dex sequence framing. The clipper-stall base is a 2-ADD foundation pilot (already authored at SCALE-6); cross-reference but don't rebuild its prose.

---

## 6. Cadence-design pre-write (carry-forward avoid list + SCALE-11 specific)

### Carry-forward avoid list (10 batches of accumulated lessons)

| Pattern | Status | Surfaced in |
|---|---|---|
| `From a toe set` opener | Avoid (mid-sentence OK; cap ≤3/batch) | SCALE-1 cadence QC |
| `Practitioners with clean / coming from X tend to…` | Avoid | SCALE-5 cadence QC |
| `tend to` verb (any form) | Cap ≤3/batch | SCALE-5 cadence QC |
| `is the foundation` exact phrase | Avoid | SCALE-6+ |
| `(The/A) common miss is` | Cap ≤3/batch; diversify | SCALE-9 (rewrite-driver) |
| Cohort-opener celebration ("first X pilot" / "5th walking-family pilot") | Avoid | SCALE-9 framing rule |
| `extends the X bridge to Y` formulaic openers | Avoid | SCALE-9 framing rule |
| Record-opener spam ("Athlete X set the record in YYYY…") | Cap ≤2/batch | SCALE-10 rule |
| pt##/Red/James/adjudication/federation-not-adoption/curator-reviewed | Avoid (prose hygiene) | `feedback_public_facing_prose.md` |

### SCALE-11-specific concerns

| Risk | Mitigation |
|---|---|
| Bullwhip prose risks repeating nemesis (SCALE-9) / jani-walker (SCALE-10) §3.2 disposition cadence verbatim | Vary at least 4 vocabulary choices for the §3.2 reading: e.g., "stated-ADD-without-stated-structure" / "row-specific math closure" / "self-atom by editorial truth" / "asserted reading not reducible to modifier+base table math". Trio at pilot tier should read as three rows, not three iterations. |
| Barrage prose risks echoing terrage (SCALE-10) trick-vs-modifier cadence | Use distinct framing: terrage's prose surfaced the distinction via mechanical-parallel-to-barrage framing. Barrage's prose can surface the distinction via the description's literal modifier-action examples (Barraging Leg Over / Barraging Paradox Mirage) as the teaching device. |
| Parkwalk prose risks repeating dimwalk's pixie+butterfly material | dimwalk (SCALE-4) prose focuses on the pixie-modifier-bridge framing. Parkwalk's prose can focus on the same-side execution variant — what makes parkwalk a distinct canonical row from dimwalk despite same modifier+base. Direction-as-canonical-distinguisher angle parallels the drifter/reverse-drifter pattern. |
| Rev-whirl prose risks repeating reverse-drifter (SCALE-10) direction-mechanic cadence | Reverse-drifter's prose led with "miraging-clipper line executed in the opposite directional travel." Rev-whirl's prose should lead with body mechanics specific to rotational direction reversal (whirl's continuous rotation runs counter-direction). Use distinct vocabulary axis. |
| Double-around-the-world prose risks repeating DLO (SCALE-9) multiplicity-exception cadence | DLO's prose leads with "Two consecutive leg-passes from a single set." Datw should use distinct cadence: "Two consecutive full leg circles" matches the dictionary description and offers different vocabulary terrain. |
| Single-replacement-vocabulary >2x per batch becoming the next tell (SCALE-9 methodology rule) | If any cadence pattern appears ≥3x in drafts, rewrite during pre-load review with diversified replacements. |

---

## 7. Verification action items (READ-only checks; pre-Phase-3)

1. **parkwalk ss=+0 framing.** Surface as canonical math ("same-side execution does not change the ADD"), NOT as "ss=+0 per pt12 ruling" (prose hygiene).
2. **bullwhip canonical decomposition.** Source-light row; prose anchors on the §3.2 policy-class disposition rather than on a specific modifier+base reading. Pair with nemesis + jani-walker as cohort.
3. **barrage description examples.** The description's "Barraging Leg Over = Flurry" / "Barraging Paradox Mirage = Fury" examples MUST be presented as modifier-action illustrations, not as canonical decompositions of barrage. Flurry remains non-pilot (data-quality issue surfaced in §2); fury is pilot (SCALE-7) so cross-reference is durable.
4. **rev-whirl surgery prereq.** Surgery (SCALE-8) uses rev-whirl as base_trick. Promoting rev-whirl closes that inbound landing. Surgery's prose currently treats rev-whirl as a structural component without dedicated cross-reference; that's fine.
5. **double-around-the-world third multiplicity exception.** Double-spin remains non-pilot; mention it as a sibling in datw prose only if it adds educational value, not as a checklist item.
6. **high-plains-drifter description.** "Two-dex compound from clipper stall" is plain-English mechanics; prose can expand into the rhythm of two consecutive dexes without inventing structural claims beyond the description.

---

## 8. Post-SCALE-11 projection

| Metric | Before | After | Delta |
|---|--:|--:|--:|
| Pilot tier | 92 / 160 (57.50%) | 98 / 160 (61.25%) | +6 rows |
| Walking-family complete at pilot | 4 of 5 | 5 of 5 | family closed |
| §3.2 policy-class trio at pilot | 2 of 3 | 3 of 3 | trio closed |
| Pt8 multiplicity-exceptions at pilot | 1 of 3 | 2 of 3 | +1 (double-spin remains) |
| Direction-variant pilot pairs | 1 | 2 | +1 |
| SCALE-eligible pool remaining | 44 | 38 | −6 |

**After SCALE-11:** SCALE-12 pool is the remaining Tier-2 (4 rows: rev-up / paradon — and fusion/omelette/flurry IF data issues resolve) plus Tier-3 foundation primitives (16 rows, mostly stalls) plus Tier-4 obscure standalones (17 rows). The high-density cohort is largely exhausted; SCALE-12 onward is closeout territory.

---

## 9. Cross-references

- `SCALE11_COVERAGE_REFRESH.md` — Phase-1 deliverable (Tier-1/2/3/4 classification of the 44 SCALE-eligible non-pilot rows)
- `SCALE10_CANDIDATE_BATCH.md` — most recent prior batch, format reference (terrage/barrage trick-vs-modifier pattern; jani-walker §3.2 disposition)
- `SCALE9_CANDIDATE_BATCH.md` — nemesis §3.2 disposition reference; cadence-design methodology origin
- `CANONICALIZATION_POLICY.md` §3.2 — stated-ADD-without-stated-structure policy class (nemesis + jani-walker + bullwhip)
- `feedback_phased_scope_control.md` — phased workflow discipline; verification-before-build pattern (drove the 3-row substitution this batch)
- `feedback_verify_need_before_building.md` — premise-verification rule (drove the fusion/omelette/flurry data check)
- `feedback_public_facing_prose.md` — prose hygiene (no pt##, no Red references, no curator-reviewed language, no internal-process leak)
- `project_freestyle_state.md` — current state memory (pilot tier counts, cadence-evolution note, modifier-bridge cohort, flagship-density cohort)
