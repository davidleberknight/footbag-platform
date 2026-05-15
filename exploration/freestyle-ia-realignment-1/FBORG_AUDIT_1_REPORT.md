# FBORG-AUDIT-1 — High-ADD Compositional Move Corpus Audit

Generated 2026-05-14. Audit-only deliverable per spec: "current goal is NOT bulk import. The goal is structured extraction and curator-guided classification." No DB writes, no parser changes, no automatic promotions.

## Sources audited

| Source | Location | Coverage |
|---|---|---|
| footbag.org/newmoves/list | Already-extracted at `legacy_data/reports/freestyle_dict_coverage_diff.csv` (254 rows) | All ADD tiers; 28 entries at ADD≥6, 6 at ADD≥7 |
| footbagmoves.com sample | `legacy_data/inputs/curated/tricks/footbagmoves-sample.txt` | Sample-tier with high-ADD focus; 39 ADD-7 entries, 2 ADD-8, 2 ADD-9 |
| Live web fetch (both sources) | Attempted; failed | footbag.org cert verification error; footbagmoves.com is JS-rendered SPA |

The pre-cached `freestyle_dict_coverage_diff.csv` + the curator-extracted `footbagmoves-sample.txt` together give substantially more coverage than live fetch would have provided — both are local, both are inspectable.

## Headline finding

**DB has only 2 active tricks at ADD≥7** (`gauntlet`, `montage`). The FM sample alone surfaces **43+ named compounds at ADD≥7** (39 at ADD 7; 2 at ADD 8; 2 at ADD 9). The high-ADD lane is the largest single canonical-coverage gap in the dictionary — substantially larger than the previously-audited 93-row "no notation" gap, because here the gap is not just notation but **named-trick absence**.

This audit's scope: characterize the gap, identify safe vs Red-blocked vs ontologically-risky candidates, produce curator-gated shortlists.

---

## A. Inventory of uncovered or underrepresented high-ADD tricks

### A1 — FBORG ADD-7 uncovered (4 truly absent + 2 mis-matched)

| Name | ADD | FBORG decomposition / alt | DB status |
|---|---:|---|---|
| Shooting Star | 7 | Shooting Double Over Down | **absent** |
| Stepping Ducking PS Whirl | 7 | (name is the decomposition) | **absent** |
| Stepping P.S. Whirling x-body Rake | 7 | uses "x-body Rake" (unfamiliar operator) | **absent** |
| Shooting Torque | 7 | name is the decomposition | **mis-matched** to `torque` (DB ADD 4) — automatic resolver collapsed to base |
| Stepping Ducking Paradox Blender | 7 | name is the decomposition | **mis-matched** to `paradox-blender` (DB ADD 5) — same |
| gauntlet | 7 | Stepping Ducking Paradox Torque | **present** (only ADD-7 row in DB besides montage) |

### A2 — FBORG ADD-6 uncovered (6 truly absent)

| Name | ADD | Alt / decomposition | DB status |
|---|---:|---|---|
| Big Apple | 6 | Gyro Symposium Torque | **absent** |
| Paratoxic | 6 | Paradox Miraging Symposium Whirl | **absent** |
| Pogo Paradox Da Da Curve | 6 | Pogo Op Da Da Curve | **absent** |
| Pogo Voodoo | 6 | Pogo Paradox Symposium Blur (description) | **absent** |
| Spinning Symposium Down Double Down | 6 | name = decomposition | **absent** |
| Torch-r Rack | 6 | Stepping Superfly | **absent** |

### A3 — FM-sample ADD-7+ corpus highlights

39 distinct ADD-7 named compounds in the sample. Spot-list of the most clearly canon-readable (clean compositions of existing locked operators):

| Name | Decomposition | Canon-readiness |
|---|---|---|
| Alpine Big Apple | Gyro Ducking Symposium Torque | CLEAN (all operators locked) |
| Apocalypse | Pixie Miraging Symposium Miraging Legover | clean but deep |
| Clown Face | Furious Eggbeater | CLEAN (canon-locked operators) |
| Cold Fusion | Nuclear Double Over Down | CLEAN |
| Gangsta Party | Spinning Ducking Paradox Blender | CLEAN (also FBORG's mis-matched entry) |
| Overlord | Pixie Spinning Paradox Blender | CLEAN |
| Rage | Furious Symposium Mirage | CLEAN (note: pt6 Fury = Furious Paradox Mirage = 5; Rage at 7 is a different composition) |
| Super Ego | Atomic Ducking Blender | CLEAN |
| Superdeeduperfly | Spinning Ducking Symposium Double Over Down | CLEAN |
| Swirlwind | Spinning Paradox Symposium Whirling Swirl | CLEAN |
| Your Mom | Atomic os Symposium Double Over Down | uses positional `os` (Q3 pending; but as direction marker only, not ADD claim) |
| Stepping Ducking PS Whirl | (name = decomposition) | CLEAN (matches FBORG) |
| Nemesis Swirl | Barraging Barfly Swirl | clean but barfly-swirl base needs verification |
| Redwetter | Shooting Eggbeater | uses Shooting operator (pt2 ruled `Shooting set = CLIP > OP IN [DEX] > OP OUT [PDX][DEX]`; effectively `paradox-mirage` compressed) |

### A4 — FM-sample ADD-8 / 9

| Name | ADD | Decomposition | Notes |
|---|---:|---|---|
| (unnamed in extract) | 8 | Surging Ducking Paradox Torque | uses Surging (canon-locked compression per pt1) |
| Your Sister | 8 | Flailing ss Symposium Double Over Down | uses Flailing (Q4 FM-vocab pending) |
| Big Apple Sauce / Chilly Pilly Sauce | 9 | Spinning Paradox Miraging Symposium Torque | CLEAN |
| Carousel | 9 | Surging Ducking Paradox Symposium Whirling Rake | uses "Rake" (new operator?) + Surging |

---

## B. Candidate equivalence readings (chain-registry candidates)

Per the chain-registry conventions (`freestyleSymbolicEquivalences.ts`): curator-authored multi-reading compositional decompositions; stopping-depth at canon-locked intermediate operators; max-3 readings; `curatorConfirmPending` flag honest.

### B1 — Strict canon-locked candidates (high-confidence chain readings)

For these compounds, every operator in the proposed reading is already canon-locked (`RED_RESOLVED_CANON.md` B-tier modifiers, C-tier equivalence-chain compounds, or pt-ruled named tricks). All operators in CORE_TRICKS or the intermediate-operator list. No Wave-1 dependence beyond what gauntlet already encodes (gauntlet uses Paradox + Torque, both canon-locked).

| Trick (slug if existed) | Proposed `≡ reading(s)` | Source |
|---|---|---|
| **gauntlet** (ALREADY IN DB; not yet in chain registry) | `≡ stepping ducking paradox torque` (FBORG + DB notation) + `≡ blurry ducking torque` (FM sample; demonstrates Blurry-compression) | FBORG canon + pt11 Blurry definition |
| **montage** (ALREADY in DB + chain registry) | already has `≡ spinning ducking paradox symposium whirl` | (no change) |
| Shooting Star | `≡ shooting double over down` (FBORG alt) | FBORG |
| Stepping Ducking PS Whirl | `≡ stepping ducking paradox symposium whirl` (PS expansion) | name = decomposition |
| Clown Face (if promoted) | `≡ furious eggbeater` | FM |
| Cold Fusion (if promoted) | `≡ nuclear double over down` | FM |
| Gangsta Party (if promoted; OR rename FBORG's Stepping Ducking Paradox Blender) | `≡ spinning ducking paradox blender` | FM |
| Overlord (if promoted) | `≡ pixie spinning paradox blender` | FM |
| Super Ego (if promoted) | `≡ atomic ducking blender` | FM |
| Superdeeduperfly (if promoted) | `≡ spinning ducking symposium double over down` | FM |
| Swirlwind (if promoted) | `≡ spinning paradox symposium whirling swirl` | FM |
| Big Apple Sauce (ADD 9) | `≡ spinning paradox miraging symposium torque` | FM |
| **(unnamed)** ADD-8 | `≡ surging ducking paradox torque` | FM — but rename needed (anonymous entry) |
| Big Apple (FBORG) | `≡ gyro symposium torque` | FBORG alt |
| Alpine Big Apple (FM) | `≡ gyro ducking symposium torque` (extends Big Apple with ducking-via-alpine) | FM |
| Paratoxic (FBORG) | `≡ paradox miraging symposium whirl` | FBORG alt |
| Spinning Symposium Down Double Down (FBORG) | (name = decomposition) | FBORG |

### B2 — Chain-registry expansion shortlist (curator-gated)

If the maintainer wants an **NR-1C-style follow-up** to expand chain registry with high-ADD canon-locked readings, this is the shortlist (10 entries; all use exclusively locked operators):

1. **gauntlet** — `stepping ducking paradox torque` + `blurry ducking torque` (TWO readings; demonstrates Blurry compression pedagogically). Highest-leverage entry — gauntlet is ALREADY in DB at 7 ADD as the flagship high-ADD example. Surfacing two readings on its dict card teaches Blurry-as-compression with no new canonical row needed.
2. **superfly** (if `superfly` exists in DB at 5 ADD; verify) — relevant because Torch-r Rack ≡ Stepping Superfly
3. **tomahawk** — already in DB; alt-name evidence from FBORG suggests reading `≡ ducking paradox symposium whirl`
4. **paradox-symposium-whirl** — already in registry with single reading `ps whirl`; could add `≡ paradox symposium whirl` (the unfolded form)
5. **drifter** — already in registry; FBORG alt evidence consistent
6. **bigwalk** — already in registry; FBORG evidence consistent
7. **food-processor** — Wave-1 Q1 BLOCKED; do not touch
8. **food-processor** alternative reading `≡ blurry blender` exists in FBORG but Q1 pending

The most concrete S2-style expansion is **gauntlet** (already-in-DB + add to chain registry with two readings).

---

## C. Alias / conflict findings

### C1 — Cross-source canon disagreement on gauntlet

| Source | Reading | ADD math |
|---|---|---|
| DB `freestyle_tricks.notation` | `STEPPING DUCKING PARADOX TORQUE` | 1+1+1+4 = 7 ✓ |
| FBORG alt | `Stepping Ducking Paradox Torque` | matches DB |
| FM sample | `Blurry Ducking Torque` | per pt11: Blurry = Stepping Paradox; so this expands to Stepping Paradox Ducking Torque ≡ Stepping Ducking Paradox Torque (operator order: Blurry is a flat-merged operator, the canonical position relative to Ducking is curator-readable) |

**Verdict**: NOT a conflict — two equivalent readings at different stopping depths. The cleanest pedagogical handling is gauntlet's chain entry surfacing BOTH (shorter "Blurry Ducking Torque" + longer "Stepping Ducking Paradox Torque"). Demonstrates Blurry-compression in compact-symbolic-object form.

### C2 — Mis-matched canonical resolutions in FBORG diff CSV (artifacts of automatic resolver)

The pre-cached `freestyle_dict_coverage_diff.csv` automatic matcher resolved these FBORG entries to the WRONG canonical row:

| FBORG name | FBORG ADD | Auto-matched to (DB row, DB ADD) | Issue |
|---|---:|---|---|
| Shooting Torque | 7 | torque (4) | Shooting is a separate set-prefix operator (pt2: Shooting = CLIP > OP IN [DEX] > OP OUT [PDX][DEX]); shooting-torque is structurally `torque with shooting prefix` — different trick |
| Stepping Ducking Paradox Blender | 7 | paradox-blender (5) | name is composition; matcher resolved to deepest-component canonical. The whole trick is paradox-blender + stepping + ducking modifiers = different trick |
| Atomic Eclipse | 4 | eclipse (3) | atomic-eclipse is `atomic mirage + eclipse` per FBORG decomposition; matcher saw `eclipse` |
| Blurry Drifter | 5 | drifter (3) | name = blurry+drifter; matcher resolved to drifter |
| Blurry Symposium Whirl | 6 | symposium-whirl (4) | name = blurry+symposium-whirl; matcher saw symposium-whirl |
| Blurry Whirling Swirl | 6 | whirling-swirl (4) | same pattern |
| Symposium Tomahawk | 6 | tomahawk (5) | tomahawk + symposium = different trick |

**Verdict**: not curator concerns; CSV-pipeline artifacts. The `match_type='likely structural alias'` field already flags these correctly. No canon mutation needed.

### C3 — Alias surfacing opportunities (allow-list candidates)

Per the restraint-first allow-list module pattern (`freestyleAliasGovernance.ts`), these are candidates for browse-surface display IF curator approves promotion:

| Existing trick | Alias candidate | Source | Why surface |
|---|---|---|---|
| Sasquatch | Warlock | FM (`Sasquatch / Warlock`) | Paired-name pair |
| Big Apple Sauce | Chilly Pilly Sauce | FM (paired) | Paired-name pair |

Neither of these underlying tricks is currently in DB; the alias-pair question is moot until canonical promotion happens. Flagged for completeness.

---

## D. Operator / decomposition insights

### D1 — Newly-surfaced operators (curator clarification candidates; do NOT promote)

The FM sample surfaces several operator tokens not in current canon. Per `feedback_frequency_not_authority`, NONE of these auto-promote:

| Operator | Surfaced in | Status |
|---|---|---|
| **Motion** | Atomotion = "Atomic Motion"; Syberian Express = "Stepping Ducking Far Motion" | Unknown; possibly a synonym for an existing operator. Curator clarification needed. |
| **Nova** | Oh Wheely = "Nuclear Nova" | Unknown; may be a body-modifier or compound base |
| **XBD Rake** / **X-body Rake** | Sasquatch/Warlock; Carousel | Operational-layer flag pattern, not a semantic operator |
| **Floating** | Floatation = "Floating Butterfly" | Body-modifier candidate; Q4 FM-vocab dependent |
| **Warping** | Warp = "Warping Mirage" | Body-modifier candidate; Q4 FM-vocab |
| **Zulu** (as modifier) | Odula = "Blurry Zulu Blender" | Zulu is documented in glossary §3 Execution Mechanics as a ducking-family component; modifier use is curator-readable |
| **Da Da Curve** | Pogo Paradox Da Da Curve | DB has `dada-curve` row (no notation; ADD 4); this would be `pogo + dada-curve = 4+1+1 = 6` — math checks |
| **Alpine** (as modifier) | Alpine Big Apple | Alpine IS in glossary §3 Execution Mechanics (PassBack-adapted) as an uptime/downtime divider with duck/dive insertion — could be canon-locked as a curator-authored chain reading |

### D2 — Q4 FM-vocab operators surfacing in high-ADD compositions

Per `project_red_consultation_state` Wave-1 Q2 (Q4 FM-vocab batch): the 14 FM-vocab modifiers (fairy, gyro, blazing, surging, railing, flailing, splicing, surfing, neutron, bubba, twinspinning, jolimont, smiling, spyro-as-modifier) are Red-pending. Several surface in the high-ADD corpus:

| Q4-vocab operator | Surfaced in (ADD 7+) |
|---|---|
| Surfing | Big Papa Smurf = "Surfing ss Blender" |
| Flailing | Bill & Ted's Excellent Adventure, Your Sister |
| Bubba | Chainsaw Massacre = "Bubba Paradox Symposium Eggbeater" |
| Railing | Dorshanatrix, Flying Fish, Rail Warrior |
| Surging | Carousel (ADD 9), (unnamed ADD 8) |

**Verdict**: do NOT surface chain readings for these compounds until Q2 ruling lands. Restraint-first.

### D3 — Down-family operator activity (Wave-2 Theme 6 pending)

Many high-ADD compounds use "Down Double Down" or "Down Diver" as base. Per `RED_RESOLVED_CANON.md` E (NOT in resolved canon): "Down family: down, double-over-down, down-diver are DISTINCT tricks per pt7 (canonicalization-as-bases is the open follow-up question)".

| Compound | Reading | Down-family element |
|---|---|---|
| Cold Fusion | Nuclear Double Over Down | uses "Double Over Down" |
| Spinning Symposium Down Double Down (FBORG) | name = decomposition | uses "Down Double Down" |
| Superdeeduperfly | Spinning Ducking Symposium Double Over Down | "Double Over Down" |
| Your Mom | Atomic os Symposium Double Over Down | "Double Over Down" |
| Your Sister | Flailing ss Symposium Double Over Down | "Double Over Down" |

**Verdict**: Wave-2 Theme 6 BLOCKS canonical promotion of these compounds. The chain-registry can still surface readings if it stops at "double over down" as a curator-authored intermediate operator (existing precedent: `plasma → quantum double over down`, `fusion → atomic double over down` in NR-1).

---

## E. Likely safe promotions

Three discrete promotion-candidate categories, ordered by risk:

### E1 — Chain-registry expansion (lowest risk; content-only)

**E1-a — gauntlet two-reading entry** (HIGHEST ROI):
```typescript
{
  slug:     'gauntlet',
  readings: ['blurry ducking torque', 'stepping ducking paradox torque'],
  curatorConfirmPending: false,   // both readings pt11-locked via Blurry-compression
},
```
Already-in-DB row gets canonical `≡` readings — surfaces Blurry-compression pedagogy on dict card without new ontology.

**E1-b — montage two-reading enrichment** (low risk):
The current single reading `spinning ducking paradox symposium whirl` is canon-locked. The FBORG mullet entry's alt reads `Ducking Paradox Symposium Whirling Rake` — a parallel compound, not a montage alias. No second reading proposed.

### E2 — New canonical candidate queue (medium risk; curator-gated)

A shortlist of high-ADD names from the FM sample with clean canon-locked compositional readings (every operator already in `RED_RESOLVED_CANON.md`):

| Candidate name | Proposed reading | ADD | Notes |
|---|---|---:|---|
| Clown Face | `furious eggbeater` | 7 | Furious +2 + Eggbeater 3 + adjustment per Q1c; pending precise math |
| Cold Fusion | `nuclear double over down` | 7 | Nuclear locked; double-over-down Wave-2 Theme 6 pending; defer |
| Gangsta Party | `spinning ducking paradox blender` | 7 | all locked; CLEAN |
| Overlord | `pixie spinning paradox blender` | 7 | all locked; CLEAN |
| Super Ego | `atomic ducking blender` | 7 | atomic +1 non-rot + ducking +1 + blender 4 = 6 (math 1 off); curator review |
| Superdeeduperfly | `spinning ducking symposium double over down` | 7 | Wave-2 Theme 6 blocked |
| Swirlwind | `spinning paradox symposium whirling swirl` | 7 | all locked; CLEAN; math: 1+1+1+1+3 = 7 ✓ |
| Big Apple Sauce | `spinning paradox miraging symposium torque` | 9 | all locked; math: 1+1+1+1+4 = 8 (1 off); curator review |
| Big Apple | `gyro symposium torque` | 6 | gyro Q2-pending |
| Alpine Big Apple | `gyro ducking symposium torque` | 7 | gyro Q2 + Alpine curator-readable |
| Stepping Ducking PS Whirl | name = reading | 7 | all locked; math: 1+1+2+3 = 7 ✓; clean addition |
| Shooting Star | `shooting double over down` | 7 | Wave-2 Theme 6 blocked + Shooting depends on pt2 |

**Of these, the 3 cleanest (no Wave-pending dependence, math validates) are**:
- Gangsta Party (7) — `spinning ducking paradox blender`
- Overlord (7) — `pixie spinning paradox blender`
- Swirlwind (7) — `spinning paradox symposium whirling swirl`
- Stepping Ducking PS Whirl (7) — name = decomposition (the name IS canonical-readable)

Plus the math-off Super Ego + Big Apple Sauce should be curator-reviewed before promotion.

### E3 — Alias ingestion (none recommended)

Per the restraint-first allow-list approach: no alias additions recommended from this audit. The Sasquatch/Warlock and Big-Apple-Sauce/Chilly-Pilly-Sauce pairs are moot until canonical promotion of the parent rows.

---

## F. Unresolved / high-risk cases

| Case | Risk | Recommendation |
|---|---|---|
| Q4 FM-vocab compounds (Surfing/Flailing/Bubba/Railing/etc.) | Wave-1 Q2 pending | DO NOT promote; defer until reply |
| Down-family base compounds (Double Over Down, Down Diver, etc.) | Wave-2 Theme 6 pending | DO NOT promote; pt7 canonicalization-as-bases open |
| Furious-led compounds (Clown Face, Rage, Redwetter) | Wave-1 Q1c pending | Furious on rotational base (Eggbeater non-rotational; Mirage non-rotational) — defer until Q1c |
| Atomic-led compounds (Super Ego, Your Mom) | Wave-1 Q4 atomic-set polysemy pending | Defer |
| "Motion" / "Nova" / "X-body Rake" / "Floating" / "Warping" / "Rake" operators | Ontology-expansion question | Surface to curator; do not auto-promote any |
| Gauntlet's cross-source decomposition disagreement (Stepping Paradox vs Blurry) | NONE — two readings at different stopping depths (Blurry = Stepping Paradox per pt11) | Safe; chain-registry can carry both |
| Math discrepancies on a few candidates (Super Ego 6 vs 7; Big Apple Sauce 8 vs 9) | Curator math audit needed | Flag in promotion-queue; do not auto-resolve |

---

## G. Recommendations

### G1 — NR-1C: gauntlet chain-registry entry (HIGHEST ROI; smallest scope)

**Single chain-registry append**. Pedagogically the highest-leverage entry in this entire audit.

```typescript
{
  slug:     'gauntlet',
  readings: ['blurry ducking torque', 'stepping ducking paradox torque'],
  curatorConfirmPending: false,
},
```

- Gauntlet IS in DB at 7 ADD (only ADD-7 row besides montage).
- The two readings demonstrate Blurry-compression on the symbolic-object surface — a flagship pedagogical example.
- All operators locked (pt11 Blurry definition; Ducking, Paradox, Torque canon-locked).
- File change: one entry append to `freestyleSymbolicEquivalences.ts`.
- Test impact: add one assertion to existing chain-registry hygiene test.
- Risk: zero.

**Recommend ship as NR-1C single-entry slice.**

### G2 — NR-1D (deferred): clean compositional shortlist

When curator has bandwidth, the four clean compositional candidates from E2 above (Gangsta Party / Overlord / Swirlwind / Stepping Ducking PS Whirl) could each:
1. Get a canonical row inserted in DB (curator-authored migration)
2. Get a chain-registry entry surfacing the compositional reading
3. Be cross-referenced against `freestyle_trick_aliases` for folk-name aliases

Each row is small but represents a NEW canonical promotion (not just notation backfill). Per the canonical-trick publication contract, each needs:
- Symbolic representation ✓ (proposed)
- Structural composition ✓ (decomposition is the name)
- Discoverability ✓ (browse-surface render)
- Alias governance ✓ (no problematic aliases surfaced)
- Honest incompleteness — operational notation pending; render "Notation pending" honestly
- No fabricated structure ✓

**Recommend curator + maintainer review before any new canonical row insertion.** This is bulk-canonical promotion in spirit even at 4 rows; the audit's restraint posture says defer.

### G3 — Wave 2 Red consultation packet candidates

Per `project_red_consultation_state` (Wave 1 sent / pending; Wave 2 themes 2/6/7/8 enumerated): this audit reveals a 6th theme worth consideration:

**Wave 2 Theme 9 — High-ADD compositional naming**

Specific questions for Red consultation (when Wave 2 drafting begins):

1. **Gauntlet readings**: confirm both `Blurry Ducking Torque` and `Stepping Ducking Paradox Torque` are the canonically equivalent readings (assistant believes yes per pt11 Blurry-compression; curator confirmation requested).

2. **Down-family canonicalization** (already Theme 6): high-ADD compounds depending on `Double Over Down` as a canonical base form the biggest concrete blocker for the dictionary's high-ADD lane. Resolving Theme 6 unblocks ~7 candidates.

3. **Furious non-rotational reading** (already Q1c): Clown Face (Furious Eggbeater), Rage (Furious Symposium Mirage), Redwetter (Shooting Eggbeater = `furious paradox eggbeater`?) all depend on Furious-on-non-rotational-base behavior.

4. **New operator clarifications**:
   - Motion (Atomotion, Far Motion in Syberian Express)
   - Nova (Nuclear Nova)
   - X-body Rake / Rake (Sasquatch/Warlock, Carousel)
   - Floating (Floatation)
   - Warping (Warp)
   
   Per `feedback_frequency_not_authority`: surface as Red question, do not auto-promote. Even if the curator has high-confidence readings, formalizing them in NF-2A requires Red ruling.

5. **Alpine as modifier**: Alpine appears in `Alpine Big Apple = Gyro Ducking Symposium Torque`. PassBack glossary line 269 defined Alpine as a structural transformation (insert duck/dive between uptime+downtime). Is Alpine an NF-2A operator? Curator review.

### G4 — FBORG-AUDIT-1 deliverable publication strategy

This audit document itself serves the maintainer's stated FBORG-AUDIT-1 goal. No automatic promotion follows from publication.

**Restraint posture preserved**:
- No DB writes proposed
- No parser changes
- No ontology mutation
- No bulk import
- No automatic canonicalization
- All recommended slices are curator + maintainer gated

**The single tiny ship-now recommendation is NR-1C (gauntlet two-reading chain entry)** — content-only, all-canon-locked, zero risk, highest-leverage symbolic-pedagogy payoff.

---

## Audit constraints summary (all preserved)

- No bulk import ✓ (only G1 NR-1C is a ship-recommendation; one entry)
- No parser changes ✓
- No ontology mutation ✓ (operators surfaced are flagged for curator clarification, not promoted)
- No automatic canonicalization ✓ (E2 candidates are queue, not promotions)
- No generated recursive chains ✓ (stopping-depth honored; chain readings stop at canon-locked operators)
- Publication-contract standards preserved ✓ (six requirements gating any future canonical promotion documented in G2)

---

## Memory implications

This audit document, plus the existing `reference_fborg_newmoves_list` memory entry, completes the structured-evidence-corpus picture for the next phase of work. No memory writes proposed from this audit; the deliverable is the document itself.

If maintainer approves G1 NR-1C ship, that's one chain-registry append + one test assertion — same shape as the NR-1 slice. Otherwise the audit stands as forward-pointer for Wave 2 Red consultation drafting + curator-content roadmap.
