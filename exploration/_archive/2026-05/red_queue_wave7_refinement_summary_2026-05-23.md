# Red Queue Refinement — Wave 7 Doctrine-Divergence Evidence Integration

**Date:** 2026-05-23
**Source slice:** Wave 7 — Doctrine Divergence Architecture (shipped 2026-05-23)
**Scope:** Doctrine-question refinement only. No code changes, no promotions,
no DB writes, no glossary rewrites. Pure Red queue editorial.

---

## 1. Posture (unchanged)

Red interprets competing conventions; he does not validate the parser. Every
question framing in this refinement treats:

- **PassBack** as a documented external scoring convention,
- **FB.org `/newmoves`** as a documented external trick listing,
- **IFPA-grammar derivation** as the parser-canonical baseline,

and asks Red to **rule on which convention applies in which context**, not on
"is the parser correct." The Wave 7 framework ships PassBack divergences as
first-class provenance metadata — Red's role is to explain the structural
mechanism that produces the divergence, not to certify a derivation as
"correct."

---

## 2. What Wave 7 evidence revealed

The PassBack semantic-ratification pass (2026-05-23) produced a vocab-clean
cohort of 17 rows with single proposedReading + non-null proposedAddTotal +
stable modifier vocabulary. Gap distribution (PB-total vs IFPA-derived):

| Gap | Count | Representative rows |
|-----|-------|---------------------|
| +1  | 3     | blurrage, predator, schmoe (Wave 7 pilots) |
| +2  | 7     | pandora-s-box, gdlo, darkwalk, reactor, … |
| +3  | 6     | colossus, whirlygig, flare, slapdown, … |
| +5  | 1     | (one outlier compound) |

**Three structural findings emerged:**

1. **Positional `far`/`near` weight does NOT explain the +1 gap.** On all three
   Wave 7 pilot rows, the gap survives under both candidate weights (+0 and
   +1). This eliminates Q6.A's +1 hypothesis as the structural source.

2. **A single implicit-operator hypothesis cannot uniformly explain the gap.**
   The "atomic ⇒ implicit paradox" reading (per pt10) fits `predator` but not
   `blurrage` or `schmoe` (those use `stepping`, not `atomic`).

3. **Gap distribution is incompatible with uniform +1 baseline.** Gaps of +2,
   +3, +5 require either (a) modifier-specific weight disagreement, (b)
   diminishing-returns modifier composition in PB, or (c) PB-as-distinct-
   scoring-system. None of these are positional-weight questions.

These findings prompt the four refinement actions below.

---

## 3. Before / After summary

### Question Set 6 — Positional `far`/`near` weight

| Aspect | Before (pt12-era) | After (Wave 7 refinement) |
|--------|-------------------|---------------------------|
| Q6.A framing | "Does `far` carry +0 ADD universally?" | Same framing |
| Posture | Open ruling sought | **Near-resolved** — likely +0 (consistent with pt12 `ss=+0`) |
| Priority | Standard Red queue | Lower-priority confirmation |
| Rationale | n/a | Wave 7 evidence eliminates +1 as the gap source on all three positional pilot rows |

**Why deprioritized, not retired:** confirmation from Red still strengthens
the doctrine; the binary hasn't been ruled formally. We just no longer expect
the answer to close the larger gap.

### Question Set 7 — IFPA implicit-operator gap

| Hypothesis | Before | After |
|-----------|--------|-------|
| A. PassBack `far` carries +1 ADD | Open | **ELIMINATED** — gap survives under both positional weights |
| B. IFPA `Atomic X` reads as `Paradox Atomic X` (pt10) | Open | **PARTIAL-FIT** — fits `predator`; does NOT fit `blurrage` or `schmoe` |
| C. IFPA stated values include named-trick baseline +1 | Open | **STRONGEST UNIFIER** — applies to all three pilots; flagged for "applies to a subset, not universally" inquiry |
| D. IFPA `Atomic` reading varies by trick | Open | **ELIMINATED** — incompatible with cross-row pattern |
| E (new). PB uses distinct scoring convention orthogonal to IFPA-grammar | n/a | **NEW** — lifted to standalone Q11 |

**Net effect on Q7:** binary count reduced from 4 hypotheses to 2 live (B
partial, C primary); 2 eliminated; 1 promoted to its own question set.

### Question Set 9 — Inspinning ADD weight revisit (no change to framing)

Q7 cross-reference updated to reflect the Wave 7 hypothesis eliminations.
Inspinning's own hypothesis (curator-flagged +0→+1 revisit) is independent
and not affected by the Wave 7 cohort findings; the cross-reference simply
notes that the simple positional-weight explanation is no longer on the
table for the inspinning-paradox-mirage / inspinning-paradox-illusion
mismatch either.

### Question Set 10 — Multi-modifier compounding effects (NEW)

A new question set introduced to capture the +2/+3/+5 gap pattern that the
Wave 7 evidence makes structurally undeniable. Four hypotheses:

- **10.A** PB applies modifier-diminishing-returns (each additional modifier
  adds less than its declared weight).
- **10.B** PB carries a different modifier-weight table (specific tokens —
  notably `gyro` — weighted lower than IFPA-grammar).
- **10.C** Folk-name atomicity extended — multi-modifier folk names
  (`pandora-s-box`, `colossus`) treated as single semantic units rather than
  the sum of their notation parts.
- **10.D** Combination of the above.

### Question Set 11 — PassBack-as-distinct-scoring-system (NEW META)

The architectural meta-question lifted from Q7's E branch. Four hypotheses:

- **11.A** PB-as-baseline — PB is a community-tournament-scoring snapshot
  authored under a baseline ADD framework, not the IFPA-grammar framework.
- **11.B** PB-as-floor — PB documents a minimum / conservative scoring
  reading.
- **11.C** PB-as-different-formula — PB scoring is a fully independent
  convention.
- **11.D** PB-as-stale-snapshot — PB predates pt8/pt10/pt12 IFPA-grammar
  refinements; the gap reflects timeline drift.

**Marked HIGHEST-LEVERAGE** because a 11.A or 11.D ruling resolves the entire
Wave 7 doctrine-divergence framework architecturally (frames every PB
divergence as provenance metadata rather than parser disagreement). 11.B and
11.C are harder to operationalize — they require additional registry metadata
per slug.

---

## 4. Evidence-row mapping

| Question | Pilot rows directly supporting | Distinguishing rows | Strongest test |
|----------|-------------------------------|---------------------|----------------|
| Q6.A (refined) | blurrage, predator, schmoe (eliminates +1) | none — Wave 7 closes this | n/a — near-resolved |
| Q7-B (partial-fit) | predator (`atomic` token present) | blurrage, schmoe (no `atomic` — falsify B if Red rules atomic-only) | predator vs schmoe |
| Q7-C (primary) | blurrage, predator, schmoe (all gap=+1) | the 30+ already-clean Tier-2 compounds (subset-applies requirement) | any Tier-2 compound where PB=IFPA on a named trick |
| Q10.A (PB-diminishing) | gdlo, darkwalk, reactor (mid-gap rows) | pandora-s-box (gap=2 with NO positionals; gyro-isolating) | pandora-s-box |
| Q10.B (PB-modifier-table) | pandora-s-box (isolates `gyro`); whirlygig | colossus (multi-modifier no `gyro`) | pandora-s-box |
| Q10.C (folk-atomicity-extended) | colossus, slapdown (folk-name origin) | reactor (notation-derived name) | colossus |
| Q11.A (PB-baseline) | All 17 vocab-clean PB rows | none — universal pattern | the statistical same-direction observation |
| Q11.B (PB-floor) | the +5 outlier; +3 rows | the +1 pilots (if floor, gap should be larger and more uniform) | the outlier |
| Q11.D (PB-stale) | rows where IFPA pt8/pt10/pt12 refinements account for the delta | rows untouched by post-2020 rulings | any pre-pt8 PB entry on a post-pt8-refined trick |

---

## 5. Retirement / deprioritization list

| Item | Disposition | Rationale |
|------|-------------|-----------|
| Q6.A (positional +1 hypothesis) | **Deprioritized — near-resolved** | Wave 7 eliminates +1 as the structural source; +0 reading aligns with pt12 `ss=+0`. Still ask Red for formal confirmation, but at low priority. |
| Q7-A (PB `far` carries +1) | **Retired** | Eliminated by Wave 7 evidence; folded into the broader Q11 framing. |
| Q7-D (Atomic reading varies by trick) | **Retired** | Incompatible with cross-row pattern; if it varied per trick, blurrage and schmoe wouldn't have the same gap as predator. |

**Net change to active Red queue:** Q6.A demoted; 2 Q7 hypotheses retired; 2
new question sets (Q10, Q11) added; 1 hypothesis (Q7-C) sharpened with the
"applies to subset, not universally" caveat.

---

## 6. Files changed in this slice

1. `exploration/red-consolidation/RED_OPEN_QUESTIONS_REFORMULATED.md` —
   refined Q6 and Q7 framings; added Q10 and Q11; updated Q9 cross-references
   to Q7 eliminations.

2. `exploration/red-consolidation/RED_QUESTION_STATUS_MATRIX.csv` — added
   four rows: `q6-far-near-weight-refined` (status: near-resolved),
   `q7-implicit-operator-refined` (status: pending-red, refined hypotheses),
   `q10-multi-modifier-compounding` (status: pending-red, new),
   `q11-pb-distinct-scoring-system` (status: pending-red, new, highest
   leverage).

3. `exploration/red_queue_wave7_refinement_summary_2026-05-23.md` — this doc.

No code changes. No promotions. No DB writes. No glossary edits.

---

## 7. What this enables for Red consultation

The next Red consultation packet can lead with Q11 — a single meta-question
("is PassBack the same scoring system as IFPA-grammar, or a parallel
convention?") whose answer determines the disposition of dozens of pending
divergence rows. If Red rules 11.A or 11.D, the doctrine-divergence registry
becomes the long-term home for these rows and the parser-canonical value
ships as published; if Red rules 11.B or 11.C, additional per-slug metadata
work follows.

Q10 is the secondary follow-up — only relevant once Q11 lands a non-A/non-D
ruling.

Q7-C remains the residual question if Q11 reads as 11.A: "what is the named-
trick baseline mechanism and which subset of compounds carries it?"

Q6.A can be confirmed at any future Red consultation as a low-priority
formal close.
