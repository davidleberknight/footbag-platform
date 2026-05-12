# SCALE-11 Coverage Refresh — Post-SCALE-10 Pool Inventory

Refresh of the SCALE-eligible candidate pool against the current DB state after SCALE-10 close (2026-05-12; pilot tier 86 → 92 of 160 / 57.50%). Identifies the remaining cohort, classifies by SCALE-fitness, and proposes a candidate-batch composition for SCALE-11.

**Date:** 2026-05-12
**Method:** Direct DB scan against `freestyle_tricks` where `is_active=1 AND (short_description IS NULL OR short_description='')`, cross-referenced against `freestyle_trick_modifiers` (modifier-stub exclusion), against `freestyle_trick_modifier_links` (modifier-bridge potential), and against pilot rows' `base_trick` (inbound prereq pressure).

---

## 1. Top-line distribution

| Cohort | Rows |
|---|--:|
| Total active rows in dictionary | 160 |
| Pilot tier (populated prose) | 92 (57.50%) |
| **Non-pilot rows (target for analysis)** | **68** |

Of the 68 non-pilot rows:

| Sub-cohort | Rows | SCALE-fitness |
|---|--:|---|
| **Modifier-stub rows** (also entries in `freestyle_trick_modifiers`) | 18 | PERMANENTLY EXCLUDED per modifier-visibility rule (`feedback_modifier_public_visibility.md`) |
| **Pt12-blocked rows** (Red-blocked or pt12-deferred) | 6 | BLOCKED until Red pt12 Q1+Q2 answers or policy unblock |
| **SCALE-eligible** (Red-independent; not modifier-stub) | 44 | Available for SCALE-11 selection |

**Modifier-stub list (18):** barraging, blazing, ducking, gyro, paradox, spinning, stepping, symposium, tapping (9 rotational/body modifiers) + pogo, rooted (2 set modifiers) + atomic, fairy, furious, pixie, quantum (5 set/body 2-ADD) + shooting, terraging (2 modifier-only 3-ADD).

**Pt12-blocked list (6):**
- blur (4) — base of transitive-blurry cluster (pt11 ruling: Stepping Paradox Mirage)
- blurry-whirl (5) — pt12 Q1 transitive-blurry candidate decomp Stepping Paradox Whirl
- blurry-torque (6) — pt12 Q1 transitive-blurry candidate decomp Stepping Paradox Torque
- food-processor (6) — pt12 Q1 transitive-blurry candidate decomp Stepping Paradox Blender
- blurriest (5) — pt12 blurry-family blocked
- barraging-osis (5) — DEFERRED 2026-05-12 as baroque-legacy (§3 CANONICALIZATION_POLICY)

---

## 2. SCALE-eligible cohort — tier classification

The 44 SCALE-eligible rows partition into four tiers by educational density + strategic value. Tier-1 has the highest pilot-tier impact; Tier-3/4 close the pool but carry low prose density.

### Tier 1 — Strong SCALE-11 candidates (6 rows)

High pilot-tier impact: opens new family at pilot, extends modifier-bridge, completes a policy class, or grounds canonical decomposition for adjacent pilot rows.

| # | Slug | ADD | Base / family | Strategic role |
|--:|---|--:|---|---|
| 1 | **fusion** | 5 | `dod` (double-over-down) | **Opens dod family at pilot** — task brief §5 family categories explicitly names "double-over-down family" as a topology cluster. First dod-base pilot. |
| 2 | **flurry** | 4 | `legover` (furious+legover) | **Furious modifier-bridge extension** — furious cohort 2 → 3 (after fury and nemesis). Math: furious(+2 rotational) + legover(2) = 4 ✓. |
| 3 | **parkwalk** | 4 | `butterfly` | **Walking-family extension** — 5th walking-family pilot after ripwalk + sidewalk + bigwalk + dimwalk. Closes the butterfly-walking topology family. |
| 4 | **bullwhip** | 5 | (no base; self-atom) | **§3.2 policy-class trio completion** — nemesis (SCALE-9) + jani-walker (SCALE-10) + bullwhip would form the three "stated ADD without stated structure" exemplars in pilot tier. Strong cohort-coherence prose value. |
| 5 | **barrage** | 3 | `barrage` (self) | **Barraging-modifier foundation** — promotes the barrage base whose canonical decomposition grounds jani-walker (SCALE-10 "Barraging Butterfly") prose. Closes the inferred-barraging chain. |
| 6 | **omelette** | 3 | `pickup` | **Pickup-family extension** — 5th pickup-family pilot after paste + legeater + pigbeater + scrambled-eggbeater. Modifier-derived (modifier+pickup composition; ADD math clean at 3). |

**SCALE-11 default proposal: these 6 rows.** Pilot tier 92 → 98 of 160 (61.25%).

### Tier 2 — Medium candidates (5 rows; SCALE-12 pool)

Foundation extension or standalone with limited cohort growth.

| Slug | ADD | Base / family | Role |
|---|--:|---|---|
| rev-whirl | 3 | `whirl` (direction variant) | Supports surgery (SCALE-8 pilot, rev-whirl + paradox + spinning compound). Only non-pilot row currently referenced as `base_trick` by a pilot compound. |
| rev-up | 3 | `whirl` (direction variant) | Paired with rev-whirl as the up-direction variant. |
| double-around-the-world | 3 | `around-the-world` | Multiplicity-policy exception per pt8 (alongside DLO + double-spin — DLO is already pilot via SCALE-9). |
| paradon | 4 | (no base) | Standalone compound; clean math (paradon(4) = 4 modifier-derived). |
| high-plains-drifter | 4 | `clipper-stall` | Standalone compound on the clipper-stall base. |

### Tier 3 — Foundation primitives (16 rows; low priority)

1-ADD stalls + kicks. Foundation completeness candidates but low educational density. Mostly serve as referenced contacts in prose without needing their own dedicated pages.

| Cluster | Slugs |
|---|---|
| Stalls | toe-stall, head-stall, heel-stall, knee-stall, neck-stall, outside-stall, shoulder-stall, sole-kick, forehead-stall, inside-stall, sole-kick |
| Kicks | clipper, cloud-kick, flying-inside, flying-outside, spyro |
| Rotational primitive | spin (1-ADD; flat per pt10 rotational ruling) |

`spin` is the highest-value of these — referenced extensively across pilot prose as a 1-ADD rotational primitive. Could be promoted alongside Tier-1 if SCALE-11 is widened to 7 rows.

### Tier 4 — Direction variants + obscure standalones (17 rows)

| Slugs |
|---|
| cloud-stall, double-spin, dragonfly-kick, flying-clipper, guay, hop-over, knee-clipper, pendulum, reverse-around-the-world, sailing, sole-stall, squeeze, surging, walk-over, cross-body-sole-stall, refraction, fusion (5 — moved to Tier-1) |

These are heterogeneous low-priority rows: direction variants (reverse-around-the-world, walk-over), obscure 2-ADD self-atoms (cloud-stall, dragonfly-kick), modifier-derived 2-ADD rows that may or may not be in regular use (guay, sailing, squeeze, surging, pendulum).

---

## 3. Cohort impact projection

If SCALE-11 = Tier-1 6 rows (default proposal):

| Metric | Before | After | Delta |
|---|--:|--:|--:|
| Pilot tier | 92 / 160 (57.50%) | 98 / 160 (61.25%) | +6 rows |
| Modifier-bridge cohort | 13 modifiers | 13 (unchanged; furious extends 2→3 base count, but cohort count is per-modifier) | +0 cohort, +1 furious base |
| Flagship-density rows (≥3 mod_links) | 6 | 6 (unchanged; no Tier-1 row carries 3+ modifier_links) | +0 |
| New family bases at pilot | — | dod (via fusion), barrage (via barrage self) | +2 |
| Walking-family pilots | 4 | 5 (parkwalk) | +1 |
| Pickup-family pilots | 4 | 5 (omelette) | +1 |
| §3.2 policy-class trio at pilot | 2/3 (nemesis + jani-walker) | 3/3 (+bullwhip) | trio complete |
| SCALE-eligible pool remaining (Tier 2+3+4) | 44 | 38 | −6 |

---

## 4. Pre-write cadence considerations for SCALE-11

If Tier-1 6-row batch is approved, the per-row cadence-design pre-write should attend to:

**Carry-forward avoid list (SCALE-1 through SCALE-10 cumulative):**
- `From a toe set` opener (avoid; cap mid-sentence ≤3)
- `Practitioners with clean / coming from X tend to…` (avoid)
- `tend to` verb (cap ≤3)
- `is the foundation` exact phrase (avoid)
- `(The/A) common miss is` (cap ≤3, diversify)
- Cohort-opener celebration ("first X pilot") (avoid)
- `extends the X bridge to Y` formulaic openers (avoid)
- Record-opener spam (cap ≤2; SCALE-10 rule)
- pt##/Red/James/adjudication/federation-not-adoption/curator-reviewed (avoid; prose hygiene)

**SCALE-11-specific concerns:**

| Risk | Mitigation |
|---|---|
| Bullwhip + barrage prose risks repeating jani-walker / nemesis cadence verbatim (same §3.2 policy class) | Vary at least 4 vocabulary choices for the policy-class disposition phrasing. Trio (nemesis + jani-walker + bullwhip) at pilot tier should read as three distinct rows, not three iterations of one pattern. |
| Parkwalk prose risks repeating the dual-anchor framing introduced on dada-curve (sidewalk semantic + ripwalk op) | Treat parkwalk as the 5th walking-family row — cross-reference dada-curve as a peer rather than building a new structural-twin diagram. |
| Fusion prose risks treating dod as a new ontology branch | DOD is folk-canonical shorthand for "Double Over Down" — established naming. Prose should ground dod's mechanics without ontology-language ("opens family at pilot" goes in the review doc, not the public prose). |
| Flurry prose risks confusing flurry / fury (homophone family with overlapping furious modifier) | Explicit disambiguation: fury (5-ADD furious+paradox+mirage) vs flurry (4-ADD furious+legover). Both are furious-modifier compounds but distinct base + compound count. |
| Barrage prose risks treating "barraging" the modifier as the same as "barrage" the trick | Mirror the terrage/terraging disambiguation pattern from SCALE-10 — terrage:trick :: terraging:modifier :: barrage:trick :: barraging:modifier. |
| Omelette prose risks repeating SCALE-1 pickup-family cadence (paste/legeater/pigbeater/scrambled-eggbeater were SCALE-1 prose) | SCALE-1 had templated-opener tells ("From a toe set" 8/10 rows). Omelette must avoid that opener completely. |

---

## 5. Alternative batch compositions (for reference)

If James prefers a different cut than Tier-1 default:

**Option A — Tier-1 + spin (7 rows; +1 foundation primitive)**
Adds spin (1-ADD rotational primitive); marginal pilot-tier value but closes a heavily-referenced contact.

**Option B — Tier-1 minus omelette + Tier-2 rev-whirl (6 rows; surgery prereq close)**
Substitutes omelette (low-density pickup extension) for rev-whirl (closes a direct base_trick reference to surgery — the only such reference in the non-pilot pool).

**Option C — Smaller batch of 4 (pool-conservation)**
Tier-1 minus omelette + barrage (low-density rows). Keeps 2 Tier-1 rows in reserve for SCALE-12. Useful if James wants to pace toward Red pt12 answers.

**Option D — Tier-1 + Tier-2 (11 rows)**
Larger sweep matching SCALE-9's 12-row size. Pilot tier 92 → 103 of 160 (64.4%). Exhausts both Tiers in one batch.

---

## 6. Post-SCALE-11 outlook

After Tier-1 SCALE-11:

- SCALE-12 pool (Tier-2; 5 rows): rev-whirl, rev-up, double-around-the-world, paradon, high-plains-drifter. Smaller batch; could be paired with Red pt12 unblock for a bigger combined batch.
- SCALE-13+ pool (Tier-3 foundation primitives + Tier-4 obscure standalones; 33 rows): closeout territory; will hit diminishing-returns on educational density.
- Pt12-blocked cohort (6 rows): unblocked when Red answers Q1 (transitive-blurry: blurry-whirl, blurry-torque, food-processor, blurriest) + barraging-osis policy review + frigidosis Red answer.

**Pilot-tier ceiling under current rules:** 160 − 18 (modifier-stubs permanently excluded) = 142 max pilot rows. Current 92 + Tier-1 (6) + Tier-2 (5) + Tier-3 (16) + Tier-4 (17) + pt12-blocked (6) = 142. The path to 100% pilot coverage of non-modifier-stub rows is sequential through these tiers + Red unblock.

---

## 7. Cross-references

- `SCALE9_CANDIDATE_BATCH.md` — most recent multi-tier batch composition reference
- `SCALE10_CANDIDATE_BATCH.md` — standalone-with-records closeout pattern
- `SCALE7_COVERAGE_MATRIX.csv` — original 106-row pool decomposition (pre-SCALE-7)
- `feedback_modifier_public_visibility.md` — modifier-stub exclusion rule
- `feedback_phased_scope_control.md` — phased workflow discipline (coverage refresh before candidate batch)
- `feedback_public_facing_prose.md` — prose hygiene rules
- `project_freestyle_state.md` — current state memory (modifier-bridge cohort, flagship-density cohort, cadence-evolution note)
- `CANONICALIZATION_POLICY.md` §3.2 — stated-ADD-without-stated-structure policy class (nemesis + jani-walker + bullwhip)
