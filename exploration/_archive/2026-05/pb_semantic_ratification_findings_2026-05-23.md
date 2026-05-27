# PB Semantic-Ratification Pass — Findings & Frontier
**Date:** 2026-05-23
**Status:** Read-only investigation; no promotions in this slice
**Frame:** First true "folk semantic publication" wave (user 2026-05-23). The architecture is now stable enough that the main task is no longer deriving ADDs but ratifying movement-language meaning.

---

## §0. Headline finding

**Zero PassBack rows in the strict single-reading + non-null-total + stable-vocabulary cohort mechanically converge with their PB-claimed ADD total.**

This is a positive finding, not a regression. The audit-architecture is mature enough to surface the structural disagreement between PassBack-source ADD claims and IFPA-canonical modifier × base derivations. The bottleneck has shifted:
- ✅ **Parser vocabulary** — recognizes 17 of 30 readings completely.
- ❌ **Scoring doctrine** — even where vocabulary is clean, the PB-claimed total never matches the IFPA-derived total.

The wave's true work is now **a doctrine decision** (which ADD interpretation to publish?), not a parser-expansion task.

---

## §1. Methodology

Applied the four user-specified filters to the 63 PB folk-ambiguous entries in `OBSERVATIONAL_TRICKS`:

1. **Single `proposedReading`** — exactly one candidate decomposition; no folk ambiguity.
2. **Non-null `proposedAddTotal`** — curator-assigned PB-source ADD claim.
3. **Stable modifier vocabulary** — every leading token resolves to one of:
   - A row in `freestyle_trick_modifiers` (+N ADD)
   - A directional / positional operator (`far`, `near`, `op`, `os`, `ss`, `uptime`, `downtime`, `midtime`, `reverse`, `rev`; +0 per established convention)
   - The bucket token `xbody` (+1)
   - And the **base** resolves to a canonical `freestyle_tricks.slug`.
4. **Mechanically convergent derivation** — the modifier × base math closes; the derivation produces a specific ADD number.

**The fourth filter requires interpretation:** does "convergent" mean (a) the math closes to *some* number, or (b) the derived number matches the PB-claimed total? Under (a) all 17 vocab-clean rows qualify. Under (b) zero qualify.

---

## §2. The 30 single-reading PB rows

After applying filter #1 + #2 (single proposedReading + non-null proposedAddTotal), 30 rows surface. Categorizing each by filters #3 + #4:

### §2.1 Vocabulary-blocked rows (13 — cannot mechanically derive)

These have either an unknown base or a doctrine-blocked base/modifier; the parser would fail:

| slug | PB | reading | block reason |
|---|---|---|---|
| `anonymous` | 3 | Spinning far Miraging Symp. Miraging Refraction | `refraction` is `DOCTRINE_BLOCKED_SLUGS` (curator_hold) |
| `bling-blang` | 2 | (uptime) Whirling near Whip | base `whip` not canonical |
| `blurrier` | 3 | Stepping near Double Down | `Double Down` is doctrine-pending (Q8) |
| `dimmier` | 3 | Pixie near Double Down | same |
| `dimmiest` | 3 | Pixie far Double Down | same |
| `flurricane` | 3 | Gyro Flurry | `flurry` is missing-notation (not yet canonical) |
| `green-eggs-and-ham` | 2 | Stepping Ducking far Swivel | base `swivel` not canonical |
| `leviathon` | 3 | Stepping Ducking far Double Down | Double Down doctrine |
| `locomotion` | 3 | Stepping far Motion | base `motion` not canonical |
| `motion-sickness` | 2 | Spinning far Motion | base `motion` not canonical |
| `scorpion-s-tail` | 2 | Spinning far Double Down | Double Down doctrine |
| `spanishfly` | 2 | Clipper Ducking far Double Down | `clipper` not modifier; Double Down doctrine |
| `superduperfly` | 2 | Spinning Superfly | base `superfly` not canonical |

**Stuck on:** doctrine-pending bases (Q8 down-family; existing `DOCTRINE_BLOCKED_SLUGS`) or missing canonical base trick rows. Not parser-grammar problems; vocabulary problems.

### §2.2 Vocabulary-clean rows (17) — derivation closes; PB claim diverges

These resolve cleanly under the current grammar (modifiers + positionals + canonical base). Each carries an IFPA-canonical derived ADD that **differs from the PB-claimed total**.

Sorted by gap (derived − PB-claim):

| slug | PB | reading | derived IFPA ADD | gap | derivation |
|---|---|---|---|---|---|
| **gap = 1 cohort** (Q6/Q7 systemic-gap pattern) | | | | | |
| `blurrage` | 3 | Stepping far Barrage | **4** | +1 | `stepping(+1) + barrage(3) = 4` |
| `predator` | 3 | Atomic far DLO | **4** | +1 | `atomic(+1 non-rot) + dlo(3) = 4` |
| `schmoe` | 2 | Stepping near Legover | **3** | +1 | `stepping(+1) + legover(2) = 3` |
| **gap = 2 cohort** | | | | | |
| `flare` | 2 | Symp. Whirling far Mirage | **4** | +2 | `symposium(+1) + whirling(+1) + mirage(2) = 4` |
| `gdlo` | 2 | Gyro DLO | **4** | +2 | `gyro(+1) + dlo(3) = 4` |
| `pandora-s-box` | 1 | Gyro Pickup | **3** | +2 | `gyro(+1) + pickup(2) = 3` |
| `slapdown` | 2 | Quantum near Butterfly | **4** | +2 | `quantum(+1) + butterfly(3) = 4` |
| `spikehammer` | 2 | Stepping Ducking Mirage | **4** | +2 | `stepping(+1) + ducking(+1) + mirage(2) = 4` |
| `swifter` | 2 | Stepping far Swirl | **4** | +2 | `stepping(+1) + swirl(3) = 4` |
| `whirlwalk` | 2 | Whirling far Whirl | **4** | +2 | `whirling(+1) + whirl(3) = 4` |
| **gap = 3 cohort** | | | | | |
| `darkwalk` | 2 | Pixie Diving near Butterfly | **5** | +3 | `pixie(+1) + diving(+1) + butterfly(3) = 5` |
| `golden-shower` | 3 | Stepping Ducking far Symp. Eggbeater | **6** | +3 | `stepping(+1) + ducking(+1) + symposium(+1) + eggbeater(3) = 6` |
| `gybas` | 2 | Stepping far Dyno | **5** | +3 | `stepping(+1) + dyno(4) = 5` |
| `mortal-kombat` | 2 | Stepping Ducking far Grifter | **5** | +3 | `stepping(+1) + ducking(+1) + grifter(=rev-drifter, 3) = 5` (alias-dependent) |
| `reactor` | 2 | Atomic far Whirl | **5** | +3 | `atomic(+2 rot) + whirl(3) = 5` |
| `whirlygig` | 2 | Stepping far Symp. Whirl | **5** | +3 | `stepping(+1) + symposium(+1) + whirl(3) = 5` |
| **gap = 5 cohort** (likely data error) | | | | | |
| `colossus` | 1 | Spinning Diving near Symp. Whirl | **6** | +5 | `spinning(+1) + diving(+1) + symposium(+1) + whirl(3) = 6` |

### §2.3 Summary

| filter level | count |
|---|---|
| Total PB observational entries | 67 |
| Single `proposedReading` + non-null `proposedAddTotal` | **30** |
| Single + non-null + stable modifier vocabulary | **17** |
| Single + non-null + stable vocab + **mechanically converges with PB-claimed total** | **0** |

---

## §3. The doctrine question

Every vocab-clean row has the PB-claimed total **lower than** the IFPA-derived total. The gap pattern is non-random:

- **3 rows with gap = 1** — exactly the pattern Q6.A and Q7 documented (systemic 1-ADD gap between PassBack literal decompositions and IFPA stated values; explanation hypotheses include `far` carrying +1 implicitly, IFPA's `Atomic X` reading as `Paradox Atomic X`, or IFPA dictionary-tier baselines that literal modifier formulas don't capture).
- **7 rows with gap = 2** — more systemic; suggests either a different scoring convention in PB or one of the larger Q7 hypotheses applies.
- **6 rows with gap = 3** — even larger gap; harder to explain via a single implicit operator.
- **1 row with gap = 5** — colossus; almost certainly a typo or stale data in `proposedAddTotal`.

The pattern reinforces existing open Red questions:
- **Q6.A** — positional `far`/`near`/`op`/`os` ADD weight (currently presumed +0 by analogy; if +1, the 1-gap rows close).
- **Q7** — implicit-operator hypothesis (most consistent with the systematic gap; pt10 nuclear=paradox+atomic framing supports the IFPA-reads-implicit-paradox reading).

**The wave's finding: PassBack rows cannot be ratified to canonical without resolving the ADD-attribution question.** The work has shifted from "can we parse?" to "which ADD interpretation is canonical?"

---

## §4. Three publication paths

### Path A — defer pending Red Q6/Q7 resolution (conservative)

Do not promote any PB rows in this wave. Surface the findings; wait for Red to rule on Q6.A (positional ADD weight) and Q7 (implicit-operator gap). Once Red rules, the 17 vocab-clean rows resolve into one of two clean states:
- If Red rules `far=+1` and the implicit-operator pattern holds → PB-claimed totals match the new derivation; 17 rows promote cleanly.
- If Red confirms `far=+0` and rejects the implicit operator → PB-source ADDs are simply wrong; 17 rows promote with derived IFPA ADDs (Path C-flavored).

**Pros:** preserves doctrine authority; defers editorial decision until Red speaks.
**Cons:** observational frontier remains stuck at 65 entries indefinitely; "first folk semantic publication wave" produces zero output.

### Path B — adopt the "PB-claim authoritative" policy (preserve source)

Treat PB-claimed totals as canonical. Promote each vocab-clean row with `adds = PB-claim`. Accept that the audit will classify each as `mismatch` (derived ≠ official), and treat that mismatch as "PassBack scoring divergence, documented."

**Pros:** preserves source attribution; honors community-tradition scoring.
**Cons:** introduces 17 new mismatches into the audit; violates the "zero mismatches" invariant that all prior waves preserved; the `first-class` cohort would no longer be derivable-clean.

**This path is incompatible with the existing audit's quality contract.**

### Path C — adopt the "IFPA-derived authoritative" policy (publish derived)

Promote each vocab-clean row with `adds = derived IFPA-canonical value`. The PB-claimed total becomes provenance metadata, not the official ADD. Each promotion documents the PB-source divergence in the curator note.

**Pros:** mechanically clean; preserves the audit's zero-mismatch invariant; the 17 rows promote with parser-validated derivations; the PB folk-name → IFPA-structural-reading mapping is preserved.
**Cons:** editorially aggressive — we are publishing 17 ADD values that diverge from a documented community source. If Red later rules in favor of the PB convention (via Q6.A or Q7), these ADDs would need to revise.

### Recommended:

**Hybrid: Path A for gap≥2 + selective Path C for gap=1.** The three gap=1 rows (`blurrage`, `predator`, `schmoe`) align cleanly with Q6.A's leading hypothesis (positional far/near carries +0; PB just got the formula slightly off). They are also the lowest-risk publication batch — if Red later rules differently, a 1-ADD revision is small. Publishing them documents the IFPA-canonical reading + acknowledges the PB-source divergence.

The 7 gap=2 and 6 gap=3 rows have wider gaps that warrant per-row curator review or Red resolution before publication.

`colossus` (gap=5) is almost certainly a data error — separate-track investigation (PB-source verification).

---

## §5. Vocabulary-blocked rows — separate cleanup tracks

The 13 vocab-blocked rows split:

| block | rows | unblock path |
|---|---|---|
| `Double Down` family (5 rows) | blurrier, dimmier, dimmiest, leviathon, scorpion-s-tail | Q8 down-family canonicalization (existing Red queue) |
| `Motion` / `Whip` / `Swivel` / `Superfly` (4 rows) | locomotion, motion-sickness, bling-blang, green-eggs-and-ham, superduperfly | Per-base curator decision (each base needs canonical row with curator-locked ADD) |
| `Refraction` (1 row) | anonymous | Refraction is in `DOCTRINE_BLOCKED_SLUGS` curator_hold; release via the 5-step pattern (guay precedent) |
| `flurry` (1 row) | flurricane | Wait for `flurry` itself to promote (currently missing-notation; needs curator decomposition of "three consecutive dexes from clipper to same toe") |
| `clipper` as modifier (1 row) | spanishfly | `clipper` is a surface stall, not a modifier; the proposedReading "Clipper Ducking far Double Down" appears to misuse it. Needs curator review. |

None of these 13 are addressable by parser-expansion work. Each requires curator decision or doctrine resolution.

---

## §6. Pareto cut on the 67 PB cohort

After this wave's filtering:
- **30 single-reading + non-null total** — initial candidate pool
- **17 vocab-clean** — derivation closes mechanically
- **3 gap=1** — most pareto-optimal publication batch (1-ADD revision risk; aligns with leading Red hypothesis)
- **0 gap=0** — no rows where PB-claim matches derivation

The remaining **37 PB entries** (67 − 30) have at least one of: multiple proposedReadings (folk-ambiguous), null proposedAddTotal (no curator quantity), or both. They require per-row curator review of the reading before any mechanical analysis applies.

---

## §7. Recommended next slice

**Wave 6-A (selective Path C, 3-row batch):** Publish `blurrage`, `predator`, `schmoe` to canonical with derived IFPA-canonical ADDs (4, 4, 3) and provenance notes documenting the PB-source divergence as Q6/Q7-related. Per-row curator confirmation before execution.

**Wave 6-B (Red queue surfaces):**
- Confirm/refine the existing **Q6.A** entry in `RED_OPEN_QUESTIONS_REFORMULATED.md` with this PB-cohort evidence (17 vocab-clean rows, gap pattern).
- Confirm/refine **Q7** (implicit-operator hypothesis) with the gap=2/3 row evidence.
- Either question's resolution unlocks 7-17 additional promotions.

**Wave 6-C (vocabulary-blocked separate tracks):**
- Q8 down-family canonicalization unlocks 5 PB rows.
- Per-base curator decisions for Motion/Whip/Swivel/Superfly unlocks 5 more.
- `refraction` curator_hold release (guay 5-step pattern) unlocks `anonymous`.
- `flurry` canonical promotion unlocks `flurricane`.

---

## §8. State summary

- First-class cohort: **125** (unchanged from Wave 5).
- Observational module: **65 entries** (unchanged; 63 PB folk-ambiguous + 2 inspinning-*).
- Red queue: 1 new question would be added if Wave 6-B proceeds (refining Q6.A + Q7 with this evidence).
- **No code changes, no DB writes, no promotions in this wave.** Pure analytical pass; the deliverable is this document.

---

## §9. Cross-references

- `exploration/red-consolidation/RED_OPEN_QUESTIONS_REFORMULATED.md` Q6.A + Q7 — the open Red questions this wave's findings reinforce.
- `exploration/red-consolidation/RED_RESOLVED_CANON.md` — for the existing ruling history.
- `exploration/red-consolidation/SEMANTIC_COMPRESSION_DOCTRINE.md` — for the 4-locution-level framework that classifies how readings are surfaced.
- `exploration/composite_modifier_expansion_framework_2026-05-22.md` — for the parallel "publication-depth modes" architecture that applies to composite-modifier compounds.
- `src/content/freestyleObservationalTricks.ts` — the source of the 67 PB entries surveyed.
- `feedback_frequency_not_authority.md` — corpus recurrence (FM, PassBack) never auto-promotes; ratification requires multi-axis scoring.
- `feedback_observational_canonical_promotion_cleanup.md` — the 5-step layer-separation pattern for promoting observational → canonical.

---

## §10. Posture

This wave's findings vindicate the user's framing: **the architecture is stable enough that the main task is no longer deriving ADDs.** The parser closes derivations on 17 of 30 PB rows. The remaining work is curator-level scoring doctrine — which ADD reading is canonical when PB-source and IFPA-derivation disagree?

Until that decision is made (per-row, per-wave, or globally via Red Q6/Q7), the conservative posture is to defer publication and surface the doctrine question. The deliverable of this slice is the categorized frontier — a tractable curator-review queue rather than a brute-force promotion batch.
