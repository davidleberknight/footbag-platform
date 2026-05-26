# Trick-Detail Stabilization — Curator Handoff Report

**Session:** 2026-05-26 trick-detail consistency wave (audit + 6 slices)
**Status:** wave complete; remaining backlog consolidated below for curator pacing.

---

## 1. Wave summary — what shipped

6 slices closed across the trick-detail stabilization audit. All CSV-driven via `red_corrections_2026_04_20.csv` + `red_additions_2026_04_20.csv`; loader 19 applies. Cumulative test green throughout (4,608 passing; tsc clean).

| Slice | Scope | Rows | Status |
|---|---|--:|---|
| **T1** | Spin / juggling normalization + 3-bag-juggling new row | 5 + 1 new | shipped |
| **T2** | Sibling-derived JOB backfill (mechanical: `JOB = canonical_name uppercased`) | 125 | shipped |
| **T5-CSV** | Slot Governance Wave 2 — `aliases_json` cleanup (S3 → S5 leakage) | 12 | shipped (SE chain half pre-existed) |
| **T4-priority** | avalanche + spike-hammer notation backfill (user-flagged visible-weakness pages) | 2 | shipped |
| **T4-expanded-A** | 12-row sibling-derivable compound backfill (recent promotion wave + foundationals) | 12 | shipped |
| **T3-A** | 9-row sibling-derived op_notation backfill (JOB present, op missing) | 9 | shipped |

### Coverage delta (pre-audit → now)

| Field | Pre-audit | Now | Delta |
|---|---|---|---|
| JOB populated | 104 (37%) | **246 (87%)** | **+142** |
| op_notation populated | 210 (74%) | **236 (83%)** | **+26** |
| Both-empty bucket | 53 | **38** | **−15** |
| JOB-only-no-op residual | 73 → 19 → 10 | **10** | (T2 + T3-A) |

**Architectural rules established/reinforced during the wave:**
- Mechanical JOB rule: `JOB = canonical_name.replace(/[-\s]+/g, ' ').toUpperCase()` (uniform; matches mobius / paradox-mirage / atomic-butterfly conventions)
- Slot Governance forever-rule: S3 aliases_json carries spelling/regional variants ONLY; structural compressions live in S5 SE chains (see `[[project_slot_governance_doctrine]]`)
- ADD-math forever-rule: `bracket_count == asserted ADD` verified on every shipped row
- Casing preservation per sibling: lowercase `(back)`/`(front)` for IFPA-canonical; uppercase `(BACK)`/`(FRONT)` for FM-derived (T6 corpus-wide decision is open — see §2 below)

---

## 2. Curator decisions blocking specific work (5)

Each decision unblocks a concrete row count. Tagged with `[D1]`–`[D5]` for reference.

### [D1] T6 — Operational-notation casing convention

**Question:** Is `(back)` / `(front)` lowercase OR `(BACK)` / `(FRONT)` uppercase the canonical convention for body-direction prefixes in `operational_notation`?

**Current state:** Corpus has **two competing conventions**:
- **Lowercase (~10+ rows):** mobius, blender, spinning-clipper, spinning-butterfly, spinning-osis, food-processor, stepping-osis, barraging-osis, vortex, merkon — IFPA-canonical convention
- **Uppercase (8 rows):** montage, spender, mind-bender, spinal-tap, atomic-osis, pixie-osis, symposium-torque, flux — FM-derived convention

**Options:**
- **A.** Lowercase canonical → normalize the 8 uppercase rows to lowercase
- **B.** Uppercase = FM-source convention; lowercase = IFPA-canonical (preserve split)
- **C.** Pick one for all (corpus-wide normalization slice)

**Unblocks:** 0 rows for new work; **enables** a corpus-wide casing-normalization slice + a CI gate that prevents future drift.

**Plan reference:** original T6 spec at the audit; my initial single-row "fix" (spinal-tap) was reverted after this audit miss surfaced.

---

### [D2] pt9 X-Dex named-exception list

**Question:** Is `atomic-torque` in the pt9 X-Dex named-exception list (atomic_rot = +2 escalation on rotational base)?

**Current state:** atomic-torque is asserted at 6 ADD. atomic_nonrot(+1) + torque(4) = 5 (does not close). atomic_rot(+2) + torque(4) = 6 ✓ — but this requires X-Dex escalation per pt9, which is named-exception-only (pt1 narrowing). Other rotational atomic compounds (e.g. atomic-osis at 4 ADD, atomic-butterfly at 4 ADD) are treated as atomic_nonrot — atomic-torque inconsistency unexplained.

**Options:**
- **A.** atomic-torque IS named-exception → derive `TOE > OP OUT [DEX] >> OP IN [DEX] [XDEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` (6 brackets ✓ per sumo pattern)
- **B.** atomic-torque is NOT named-exception → row's asserted ADD = 6 is wrong; correct to 5 OR document doctrine exception

**Unblocks:** atomic-torque op_notation backfill (1 row); clarifies the X-Dex rule for future atomic-rotational compounds.

**Reference:** pt1 "X-Dex narrowed to specific-tricks-only; atom-smasher=4 includes +1 X-Dex"; pt9 "Sumo gets an X dex ADD on the Mirage, making it a 5 ADD move."

---

### [D3] Productive-multiplicity rule — `triple-around-the-world`

**Question:** Should triple-around-the-world (4 ADD) be backfilled with notation, OR does the productive-multiplicity rule (pt8 + CANONICALIZATION_POLICY §10) require it to remain in deferred state?

**Current state:** Row exists in DB at 4 ADD with no notation. Mechanical derivation is trivial (DATW pattern + 1 more `SAME IN [DEX]` segment: `TOE > SAME IN [DEX] > SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]` = 4 brackets ✓). But pt8 + §10 require "community stabilization" before promotion to canonical — only double-leg-over and double-around-the-world currently pass. Backfilling notation could inadvertently formalize triple-around-the-world.

**Options:**
- **A.** Triple-around-the-world IS community-stabilized → backfill notation (1 row)
- **B.** Not yet community-stabilized → leave deferred; consider removing the row entirely OR explicitly marking with `review_status='pending'`

**Unblocks:** 1 row (notation backfill); clarifies productive-multiplicity gate for future tracking.

---

### [D4] pt12-Q1 — Transitive-blurry expansion

**Question:** Does `blurry-X` decompose transitively to `stepping paradox X` (where blurry = stepping + paradox per pt10)?

**Current state:** Affects 5+ rows whose JOB form is doctrine-pending:
- **blurry-whirl** (5 ADD asserted) — if Q1=transitive: `STEPPING PARADOX WHIRL` = stepping(+1)+paradox(+1)+whirl(3) = 5 ✓
- **blurry-torque** (6 ADD asserted) — if Q1=transitive: `STEPPING PARADOX TORQUE` = stepping(+1)+paradox(+1)+torque(4) = 6 ✓
- **blurrage** (4 ADD) — if Q1=transitive applies to barrage compounds: see also pt12 queue
- **food-processor** (6 ADD) — `STEPPING PARADOX BLENDER`?
- **barraging-osis** — `STEPPING PARADOX OSIS` reading (already approximate per parser)

Packet drafted at `legacy_data/inputs/curated/tricks/red-correction-pt12.txt` per `[[project_freestyle_state]]`. Awaiting Red.

**Unblocks:** ~5 rows JOB + op_notation derivation.

---

### [D5] pt12-Q2 — Atomic-symposium interaction

**Question:** When `atomic` + `symposium` combine on a rotational base, does atomic get its rotational +2 bonus, or is the rule mediated by symposium?

**Current state:** `witchdoctor` (atomic + symposium + mirage, asserted 5 ADD) is the load-bearing case. Memory says original asserted was 4 (atomic_nonrot+symposium+mirage=4), but DB now shows 5 (matches atomic_rot+symposium+mirage). Cross-reference with `fury` (furious + paradox + mirage = 5) shows asymmetry isn't universal across set+body stacks on rotational bases. 5-option packet drafted in `red-correction-pt12.txt` Q2.

**Options span the rule space:**
- atomic-symposium interaction-specific (witchdoctor only)
- All-set-with-body rule on rotational
- Combined-set composition
- Asserted reassignment (back to 4 ADD)
- Culturally-atomic activation

**Unblocks:** witchdoctor JOB + op_notation (1 row); clarifies atomic + body-modifier rule on rotational bases for future compounds.

---

## 3. Mechanically derivable from description column (~11 rows) — READY FOR NEXT-CLAUDE-SESSION SLICE

These rows are in the **both-empty bucket** but their `description` column ALREADY contains an FB.org-confirmed JOB form (and often op_notation tokens too). They were promoted in the 21-row pre-Adrian wave but never had their notation migrated from description into the `notation` / `operational_notation` columns. Pure mechanical migration; no doctrine questions.

| Slug | ADD | JOB from description | Notes |
|---|---|---|---|
| double-over-down | 4 | `TOE > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]` (4 brackets ✓) | FB.org-confirmed JOB in description |
| down-double-down | 4 | clipper-entry variant of DOD (per description) | FB.org-confirmed |
| pixie-swirl | 4 | `TOE > SAME IN [DEX] > SAME/OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` (4 brackets ✓) | FB.org-confirmed; description verbatim |
| double-over-down-swirl | 5 | `[DEX] + [DEX] + [DEX] + [XBD] + [DEL]` (5 brackets ✓) | FB.org-confirmed |
| down-diver | 5 | `TOE > DIVE [BOD] > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]` (5 brackets ✓) | FB.org alias "Diving Down Double-Down" |
| flurricane | 5 | `CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` (5 brackets ✓) | FB.org-confirmed alias "Gyro Flurry" |
| paradox-da-da-curve | 5 | `CLIP > SAME IN [PDX] [DEX] > (NO PLANT WHILE) OP OUT [DEX] > OP CLIP [XBD] [DEL]` (5 brackets ✓) | FB.org-confirmed |
| paradox-whirling-swirl | 5 | `CLIP > SAME IN [PDX] [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` (5 brackets ✓) | FB.org-confirmed |
| pixie-double-over-down | 5 | `TOE > SAME IN [DEX] (plant) > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]` (5 brackets ✓) | FB.org-confirmed |
| ricochet | 5 | `TOE > OP OUT [DEX] > SAME OUT [DEX] > OP SOLE [XBD] [UNS] [DEL]` (5 brackets ✓) | FB.org-confirmed |
| scorpions-tail | 5 | `CLIP > (back) SPIN [bod] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]` (5 brackets ✓) | FB.org alias "Spinning Down Double-Down"; **casing note: `[bod]` is lowercase in description — normalize to `[BOD]` per corpus convention** |

**Recommended slice name:** **T4-expanded-B** — "description-column FB.org JOB migration" (mechanical; ~11 rows). Each row's JOB derives directly from its description text. JOB per T2 rule = canonical_name uppercased. Op_notation = description's bracketed form. ADD-math closes for all 11 per the description content.

**Note on `scorpions-tail` casing:** the description has `[bod]` lowercase which is non-canonical — should be `[BOD]` uppercase per the corpus convention used everywhere else. Single fix at migration time.

---

## 4. Sibling-derivable but moderate-risk (~7 rows)

Have base_trick / modifier_links suggesting sibling pattern but with some judgment:

| Slug | ADD | Derivation question |
|---|---|---|
| bigwalk | 5 | "Surging-modified butterfly" — but surging is informal-only per Surging Modeling Rule; need to decide if bigwalk gets explicit decomposition or stays primitive |
| sole-survivor | 5 | "Spinning + symposium whirl" per description — but spinning-symposium-whirl JUST shipped (T3-A) at 5 ADD; is sole-survivor a TRUE distinct trick OR an alias of spinning-symposium-whirl? |
| predator | 4 | "Atomic-modified DLO" — atomic+DLO=1+3=4 ✓; but is this atomic_nonrot or X-Dex? DLO isn't rotational so probably _nonrot; mechanical |
| schmoe | 3 | "Stepping-modified legover" (PassBack folk-name); modifier_links empty in DB; sibling: stepping-eggbeater pattern adjusted for legover base |
| blizzard | 3 | "Stepping-far illusion" (PassBack folk-name); needs `far` token decision |
| double-around-the-world-heel | 3 | DATW with heel terminal; doctrine block per audit "canonical vs DATW heel-variant alias" |
| paradox-blender | 5 | paradox + blender = 1 + 4 = 5; mechanical from paradox-mirage / paradox-drifter pattern + blender body |
| paradox-torque | 5 | paradox + torque (torque just shipped); should be derivable |
| spinning-torque | 5 | spinning + torque (torque just shipped); should be derivable |
| fury op_notation | 5 | fury = furious paradox mirage per pt6; op_notation derivation needs furious pattern (no furious-X sibling op_notation populated currently) |
| fusion | 5 | "Atomic-modified down-over-down (DOD)" — DOD row is `double-over-down` per §3 above (depends on §3 shipping first) |

**Recommended slice name:** **T4-expanded-C** — "sibling-derivable with moderate judgment". Ship AFTER §3 (which provides FB.org JOB for the DOD-family rows used as bases here). Curator spot-check per row recommended.

---

## 5. Truly sui-generis / curator-JOB needed (~3 rows)

Compound rows with no FB.org JOB in description and no clean sibling:

| Slug | ADD | Status |
|---|---|---|
| jani-walker | 5 | Description = "Compound trick." (opaque). Per pilot prose: canonical decomposition "Barraging Butterfly" revealed via records sort_name — but barraging is a modifier we haven't formalized for butterfly. Curator JOB needed. |
| plasma | 5 | Description = "Compound trick." (opaque). Per pilot prose: 3rd quantum-family pilot. Curator JOB needed. |
| bullwhip | 5 | Self-atom JOB = `BULLWHIP` already shipped in T2 (so JOB-only-no-op). Op_notation needs curator (sui-generis stated-ADD-without-stated-structure per §3.2 policy class). |

**Recommended slice:** Curator-paced; not a Claude slice.

---

## 6. Missing-evidence rows (~5 rows) — source research needed

| Slug | ADD | Need |
|---|---|---|
| rake | (unknown) | PassBack / Job-1995 source confirmation; class D in original audit |
| orbit | 2 | Memory: "small future backfill opportunity; needs curator on entry/exit direction" |
| wrap | 2 | Held-delay leg-over family (sibling to hop-over jump variant); need fb.org or Job-1995 confirmation |
| refraction | 3 | Description "Dexterity, 3 ADD" — needs source-confirmed compositional formula |
| surging | 2 | Primitive; no base_trick per Surging Modeling Rule (Red pt5); needs different treatment than compound backfill |

**Recommended slice:** Curator-paced source research; not a Claude slice.

---

## 7. Set / body primitives + held-delay chassis (~10 rows) — framing decision

These rows have JOB but no op_notation. Op_notation for primitives that COMPOSE INTO OTHER TRICKS (rather than being complete tricks) means something different than for compound rows. Needs curator framing decision.

| Slug | ADD | Category | JOB | Question |
|---|---|---|---|---|
| clipper | 1 | body | `CLIPPER` | Set primitive — op_notation = `CLIP [DEL]`? Or render-hidden per modifier-visibility rule? |
| spyro | 1 | body | `SPYRO` | Body primitive — `SPYRO [BOD]`? |
| atomic | 2 | set | `ATOMIC` | Set primitive — `TOE > OP OUT [DEX] > (op side component)`? (incomplete per CANONICAL_SETS) |
| quantum | 2 | set | `QUANTUM` | Set primitive — `TOE > OP IN [DEX] > (op side component)`? (incomplete) |
| furious | 2 | set | `FURIOUS` | Composite modifier; render-hidden? |
| sailing | 2 | set | `SAILING` | Composite set per pt9 (pixie + quantum) |
| hop-over | 2 | body | `HOP OVER` | Held-delay leg-over chassis; special structure |
| walk-over | 2 | body | `WALK OVER` | Held-delay leg-over chassis; special structure |
| pogo | 0 | set | (empty) | 0-ADD set; render-hidden per modifier-visibility |
| rooted | 0 | set | (empty) | 0-ADD set; render-hidden per modifier-visibility |
| shooting | 3 | set | `SHOOTING` | pt9 +3 rotational; sui-generis bracket placement |
| around-the-world-kick | 1 | dex | (empty) | Kick variant; needs kick notation per `[[feedback_op_notation_kick_vs_stall]]` |

**Question for curator:** What does `operational_notation` MEAN for these primitive / chassis rows? Three positions:
- **A.** Same as the modifier's own pattern (incomplete formula form per CANONICAL_SETS)
- **B.** Empty; render-hidden via existing modifier-visibility rule
- **C.** A new form-class specific to primitives (e.g. `[set]` placeholder)

Resolution unblocks ~10 rows of structural work.

---

## 8. Set Encyclopedia — Phase 2 backlog (curator-content lift)

Phase 1 (S1 + S4 + S5) shipped earlier in this session. Phase 2 (S2 + S3) is content-heavy and explicitly curator-paced. See `[[project_set_encyclopedia_surface]]` and `exploration/adrian-prep-2026-05-26/REVIEW_GUIDE.md` for context.

### S2 — Movement Intuition + Mechanical Comparison detail-page sections

**Scope:** 2 new prose-bearing surfaces per set-detail page. Curator authors for the 5 literal-primitive true-core flagships first (pixie / fairy / stepping / atomic / quantum), then expand. Each flagship: ~2-3 paragraphs of Movement Intuition (what the bag does + what the body feels) + 3-4 line Mechanical Comparison (vs nearest neighbors).

**Per-set content table (8 candidate flagships):**

| Set | Movement Intuition (where bag travels + what body feels) | Mechanical Comparison (vs neighbors) |
|---|---|---|
| pixie | TODO | vs Fairy: dex direction flips inward→outward; vs Atomic: set side stays SAME; vs Bubba: set surface TOE→CLIP |
| fairy | TODO | vs Pixie: direction-mirror (outward dex); vs Atomic: same direction, different terminal side |
| stepping | TODO | vs Bubba: directional mirror; vs Blurry: blurry adds paradox |
| atomic | TODO | vs Fairy: terminal side flips to OP; vs Quantum: same direction, OP terminal vs SAME |
| quantum | TODO | vs Atomic: same direction, terminal side flips; vs Pixie: direction flips |
| bubba | TODO | vs Pixie: surface CLIP→TOE; CLIP-led directional mirror of stepping |
| slapping | TODO | TBD |
| tapping | TODO | TBD |

### S3 — Modifier Interactions + Pairs Naturally With detail-page sections

**Scope:** 2 surfaces per set-detail page answering the encyclopedia's pedagogical question ("what does this set produce when modifiers stack on it?"). Each flagship: ~5-8 modifier interaction rules (paradox / spinning / ducking / symposium / atomic) + 3-5 canonical combinations with 1-line "why" each.

**Per-set content scaffolding:**

| Set | Modifier interactions (5-8 rules per set) | Pairs naturally with (3-5 canonical combinations) |
|---|---|---|
| pixie | + paradox: no canonical (paradox needs CLIP); + stepping: pixie-illusion family; + ducking: phoenix-family; + symposium: pixie-symposium chains; + atomic: sibling system, does not stack | + butterfly = dimwalk; + mirage = smear; + illusion = pixie-illusion |
| fairy | TBD per modifier | + atomic = fairy-atomic; + spinning = fairy-spinning |
| stepping | TBD | + butterfly = ripwalk / sidewalk; + osis = stepping-osis; + DLO = haze |
| atomic | + paradox = nuclear (per pt10); + symposium: open per [D5]; + mirage with X-Dex = atom-smasher | + mirage = atom-smasher; + butterfly = atomic-butterfly; + osis = atomic-osis |
| quantum | TBD | + mirage = quantum-mirage; + illusion = quantum-illusion; + symposium + mirage = quantum-symposium-mirage |
| bubba | TBD | TBD |
| slapping | TBD | TBD |
| tapping | TBD | + whirl = tapping-whirl; + mirage = tap |

**Curator authoring effort estimate:** ~24 paragraphs across 8 flagships (S2: 16; S3 prose: 8 + table cells). Service + template + CSS are already designed in the Set Encyclopedia plan (`[[project_set_encyclopedia_surface]]` §Phase 2); shipping is content-load-only after curator authoring lands.

---

## 9. Recommended next sessions

In ROI order:

1. **T4-expanded-B (FB.org JOB migration)** — ~11 rows; pure mechanical; description-column → notation/op_notation columns. Closes most of the both-empty bucket without curator input. **Highest ROI; ready for next Claude session.**

2. **Curator-decision packet** (this report's §2) — resolve [D1]–[D5] in one consolidated curator session. Each decision unblocks 1–5+ specific rows.

3. **T4-expanded-C** (sibling-derivable moderate-risk; ~7 rows) — ship AFTER #1 (DOD-family bases come from §3) and after [D5] (atomic-symposium for some rows).

4. **Set Encyclopedia Phase 2 S2/S3** — curator-content authoring (~24 paragraphs); pure curator work. Sets the next major surface improvement.

5. **Set/body primitive framing decision** (this report's §7) — unblocks ~10 rows of structural work; small decision, big downstream effect.

6. **Source research for missing-evidence rows** (this report's §6) — 5 rows; curator-paced.

7. **Set Encyclopedia Phase 2 S2/S3 (expanded coverage)** — once 5 flagships ship, extend to remaining sets.

---

## Appendix A: All 38 both-empty rows (reference snapshot)

Categorized for reference. Rows already handled in §3–§7 above. Snapshot taken post-T3-A.

```
0-ADD set primitives (2):       pogo, rooted
1-ADD:                          around-the-world-kick (kick variant)
2-ADD (5):                      orbit, surging, wrap (chassis) + clipper, spyro
3-ADD (8):                      blizzard, dou-ATW-heel, omelette, pixie-opp-clipper (✓ T4-A), pixie-same-clipper (✓ T4-A),
                                refraction, schmoe, symposium-mirage (✓ T4-A), symposium-pixie (✓ T4-A)
4-ADD (14):                     atom-smasher (✓ T4-A), bedwetter, blurrage, double-over-down*, down-double-down*,
                                ducking-whirl (✓ T4-A), flux (✓ T4-A), inspinning-butterfly (✓ T4-A),
                                inspinning-paradox-illusion (✓ T4-A), inspinning-paradox-mirage (✓ T4-A),
                                pixie-swirl*, predator, quantum-symposium-mirage (✓ T4-A), stepping-whirl (✓ T4-A),
                                triple-around-the-world [D3]
5-ADD (16):                     bigwalk, blurry-whirl [D4], double-over-down-swirl*, down-diver*, flurricane*,
                                fury (op only), fusion, jani-walker, paradox-blender, paradox-da-da-curve*,
                                paradox-torque, paradox-whirling-swirl*, pixie-double-over-down*, plasma,
                                ricochet*, scorpions-tail*, sole-survivor, spinning-torque, witchdoctor [D5]
6-ADD:                          blurry-torque [D4]
```

`* = FB.org-confirmed JOB in description column; ready for T4-expanded-B mechanical migration`
`✓ T4-A = already shipped in this wave's T4-expanded-A slice`

## Appendix B: 10 JOB-only-no-op rows (reference snapshot)

Categorized in §7 above.

```
clipper, spyro, atomic, furious, hop-over, quantum, sailing, walk-over, shooting, atomic-torque [D2]
```

---

**Report end. Wave complete; curator pacing recommended on §2 + §6 + §8.**
