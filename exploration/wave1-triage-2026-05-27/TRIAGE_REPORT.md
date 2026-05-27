# Wave 1 — Post-W0 Triage Report

**Read-only classification of the 2,154 state-3 observational rows in RECONCILIATION.csv. No promotions, no row edits, no ontology inference. Numbers below come from `triage_classifier.py` (deterministic, idempotent).**

---

## Headline

| Category | Count | % | Definition |
|---|---|---|---|
| **A** — safe mechanical promotion | **1,343** | 62.3% | Has recognizable structure, no doctrine token, stack depth ≤ 2 |
| **B** — alias / compression / synonym | 476 | 22.1% | Slash-pair or folk-name + parenthetical-structural-reading |
| **C** — structural-expansion variant | 104 | 4.8% | 3+ stacked canonical modifiers (mechanically derivable but coherence-sensitive) |
| **D** — doctrine-sensitive | 227 | 10.5% | Contains a doctrine-quarantine token (blurry / furious / nuclear / illusioning / shooting / weaving / pogo / rooted) |
| **E** — weak source | **4** | 0.2% | Parser leftover; not real trick names |
| **F** — trivial | 0 | 0.0% | None — W0 already filtered trivial-kick rows at the source-corpus level |

**Strategic read**: ~62% of post-W0 state-3 rows are mechanically promotable candidates. ~33% need either curator alias-merging (Cat B) or doctrine resolution (Cat D) before promotion. ~5% (Cat C) need ecosystem-coherent batch review. Cat E is negligible (4 rows; cleanup is one CSV edit).

---

## D1 — Triage taxonomy

The classifier in `triage_classifier.py` applies these rules in priority order: **F → D → B → E → C → A**.

| Rule | Signal | Examples |
|---|---|---|
| **F** | `^(toe|heel|inside|outside|knee|shoulder)\s*(kick|delay)$` (case-insensitive) | (none — empty cohort post-W0) |
| **D** | Name contains one of: `blurry, blurriest, blurrier, blurrage, furious, nuclear, illusioning, shooting, weaving, rooted, antisymposium, pogo` | `Nuclear Illusion`, `Weaving Butterfly`, `Blurry Drifter` |
| **B** | Contains `/` OR matches `<folk-name> (<structural reading>)` AND the parenthetical is NOT a directional qualifier like `(ss)`, `(same side)`, `(op)`, `(far)`, `(reverse)` | `Aeon Flux / Nucleosis`, `Atom Smasher (Atomic Mirage)` |
| **E** | Empty/too-short OR parenthetical-only OR all-lowercase-original with grammar-shorthand tokens but no canonical modifier OR known parser-leak strings | `Components of sets, but not neccesssarily sets`, `(clipper reverse whirl spinning)` |
| **C** | Stack depth ≥ 3 (count of canonical modifiers + directional tokens) | `Stepping Ducking Paradox Blender`, `Paradox Symposium Whirling Rake` |
| **A** | Default for everything that gets through | `Inspinning Osis`, `Quantum Mirage`, `Atom Bomb` |

Ecosystem assignment is independent of category — a row can belong to multiple ecosystems via token presence (e.g., `Fairy Ducking Butterfly` → fairy AND ducking AND no separate butterfly-ecosystem in this taxonomy).

---

## D2 — Ecosystem classification (sorted by total)

| # | Ecosystem | Total | A | B | C | D |
|---|---|---|---|---|---|---|
| 1 | whirl-swirl | 310 | 182 | 74 | 29 | 24 |
| 2 | symposium | 235 | 104 | 63 | 45 | 23 |
| 3 | pixie | 200 | 101 | 68 | 26 | 5 |
| 4 | ducking | 171 | 74 | 40 | 39 | 18 |
| 5 | spinning | 157 | 83 | 42 | 30 | 1 |
| 6 | blender-torque | 141 | 68 | 46 | 12 | 15 |
| 7 | dlo-double-down | 139 | 60 | 34 | 31 | 14 |
| 8 | fairy | 136 | 84 | 36 | 12 | 4 |
| 9 | **blurry-furious** | 129 | **0** | 0 | 0 | **129** |
| 10 | stepping | 117 | 63 | 27 | 14 | 13 |
| 11 | gyro-spyro | 114 | 63 | 43 | 4 | 4 |
| 12 | paradox | 108 | 42 | 35 | 16 | 15 |
| 13 | atomic | 96 | 52 | 37 | 7 | 0 |
| 14 | dragon-rake | 52 | 26 | 18 | 4 | 4 |
| 15 | quantum | 50 | 27 | 20 | 2 | 1 |
| 16 | **weaving** | 32 | **0** | 0 | 0 | **32** |
| 17 | **pogo** | 28 | **0** | 0 | 0 | **28** |
| 18 | inspinning | 24 | 20 | 3 | 0 | 1 |
| 19 | **shooting** | 19 | **0** | 0 | 0 | **19** |
| 20 | eclipse-hop-over | 15 | 12 | 2 | 0 | 1 |
| 21 | rail-rooted | 15 | 14 | 0 | 0 | 1 |

**Untagged**: 712 rows (33%) have no ecosystem token — mostly folk-named compounds (`Aeon Flux`, `Alpine Big Apple`, `69`, `84`). 583 of these are Cat A; they need a separate triage pass via curator-assigned ecosystem tags.

**Three ecosystems are 100% doctrine-blocked**: blurry-furious, weaving, pogo, shooting. No promotion path until Red rulings land.

---

## D3 — Safe-promotion candidate inventory (Cat A by ecosystem)

Top picks by ecosystem (Tier-1-style mechanical promotions). Full lists in `by_ecosystem/<name>.csv` filtered to `category=A`.

| Ecosystem | Cat A count | Recommended head-of-queue picks |
|---|---|---|
| **inspinning** | 20 | `Inspinning Osis`, `Inspinning Mirage`, `Inspinning Illusion`, `Inspinning Legover`, `Inspinning Same Side Butterfly`, `Inspinning Flail`, `Inspinning Guay`, `Inspinning Reverse Guay`, `Inspinning Symposium Mirage`, `Inspinning Toe Stall`, `Pixie Inspinning`, `Atomic Inspinning Butterfly`, `Twinspinning Illusion`, `Twinspinning Legover`, `Twinspinning Pickup` |
| **quantum** | 27 | `Quantum Illusion`, `Quantum Mirage`, `Quantum Pickup`, `Quantum Whirl`, `Quantum Osis`, `Quantum Legover`, `Quantum Drifter`, `Quantum Butterfly (same side)` |
| **pixie** | 101 | `Pixie Eclipse`, `Pixie Eggbeater`, `Pixie Legover`, `Pixie Osis`, `Pixie Ducking Legover`, `Pixie Ducking Pickup`, `Pixie Drifter`, `Pixie DSO` |
| **atomic** | 52 | `Atomic DLO`, `Atomic Drifter`, `Atomic Eclipse`, `Atomic Illusion`, `Atomic Osis`, `Atom Bomb` |
| **fairy** | 84 | `Fairy Beater`, `Fairy DLO`, `Fairy Drifter`, `Fairy Eggbeater`, `Fairy Eclipse`, `Fairy Illusion`, `Fairy Legover`, `Fairy Pickup`, `Fairy Mirage`, `Fairy Whirl`, `Fairy Spinning` |
| **ducking** | 74 | `Ducking Pickup`, `Ducking Pdx Illusion`, `Ducking Pdx Mirage`, `Spinning Ducking Mirage`, `Spinning Ducking Illusion`, `Fairy Ducking Mirage`, `Fairy Ducking Illusion` |
| **gyro-spyro** | 63 | `Gyro Barfly`, `Gyro Blender`, `Gyro DLO`, `Gyro Mirage`, `Gyro Drifter`, `Gyro Whirl`, `Spyro Illusion`, `Spyro Mirage` |
| **spinning** | 83 | `Spinning Paradox Mirage`, `Spinning Paradox Illusion`, `Spinning Paradox Whirl`, `Spinning Paradox Blender`, `Double Spinning Clipper`, `Double Spinning Osis` |

**Inspinning + quantum = cleanest small ecosystems** (47 rows combined, 47 Cat A, 0 doctrine blockers). Recommended W1 starting point.

---

## D4 — Alias / compression inventory (Cat B)

476 rows total. Two sub-cohorts:

| Sub-cohort | Count | Examples |
|---|---|---|
| **B1 — slash-alt pairs** | ~80 (estimated; precise count via `grep "/" by_category/B-alias.csv`) | `Aeon Flux / Nucleosis`, `84 / Wiggle Walk`, `Leviathan / Christina Aguilera`, `Johny Quest / Neutron Smasher` |
| **B2 — folk-name + structural-reading pairs** | ~400 | `Atom Smasher (Atomic Mirage)`, `Blender (Whirling Osis)`, `Eggbeater (Atomic Legover)`, `Drifter (Miraging Clipper)`, `Smear (Pixie Mirage)`, `Witchdoctor (Atomic Symposium Mirage)` |

**Governance path for Cat B**:
1. **For B1 (slash-alts)**: each pair needs a curator decision on which name is canonical. The other becomes a `state-2 Covered via alias/equivalence` row pointing at the canonical via `equivalent_to`. Methodology already proven by DK-4 (pixie-ducking-mirage → assassin).
2. **For B2 (folk + structural)**: if the structural reading is ALREADY canonical (e.g., `Atomic Mirage` exists), the folk side (e.g., `Atom Smasher`) becomes a state-2 alias OR an SE-chain reading (S5 slot per `project_slot_governance_doctrine`). Many of these are already wired in `freestyleSymbolicEquivalences.ts`; the triage just needs to confirm.

**Risk**: do NOT auto-merge. Several "structural readings" in Cat B disagree with their canonical row's curator-locked SE-chain (e.g., omelette/atomic-illusion vs illusioning-pickup). Curator review per pair.

---

## D5 — Doctrine-sensitive inventory (Cat D)

227 rows blocked. Distribution by blocker token:

| Blocker token | Count | Red question status | Unblock path |
|---|---|---|---|
| **blurry** + variants (blurriest/blurrier/blurrage) | 73 | Wave-2 Q1 (transitivity); partial answers 2026-05-15 | Integrate 2026-05-15 rulings into RECONCILIATION + clear per-row |
| **nuclear** | 43 | Wave-2 Q3 (hidden X-Dex / nuclear-count) | Pending Wave-2 reply |
| **weaving** | 32 | No prior Red consultation | **NEW Red packet needed** (flagged in audit) |
| **pogo** | 28 | State-5 governance batch 2026-05-21 | Curator policy ruling on pogo-as-modifier-axis |
| **furious** | 20 | Wave-2 Q2 (furious-as-count) | Pending Wave-2 reply |
| **shooting** | 19 | No prior consultation | **NEW Red packet needed** (Q19 from prior audit) |
| **illusioning** | 15 | 2026-05-26 packet DRAFTED (omelette) | Send packet; await reply |
| **rooted** + antisymposium | 2 | Doctrine-sensitive batch 2026-05-21 | Curator policy clarification |

**Three new Red packets warranted** (none yet drafted): weaving doctrine, shooting definition, pogo classification. Each is a single-page packet like the 2026-05-26 omelette packet. Drafting in one session is feasible.

---

## D6 — Weak-source inventory (Cat E)

4 rows. Manual cleanup candidates:

| Name | Source | Notes |
|---|---|---|
| `(clipper reverse whirl spinning)` | fborg | Holden's parenthetical-only entry (the asterisk-tentative entry minus its tentative `*` marker). Drop or rename. |
| `Components of sets, but not neccesssarily sets` | fborg | Section-header parser leak from `footbag-sets-fborg.txt`. Drop. |
| `Diving` | fborg | Singleton-word ambiguous (modifier? trick? family?). Curator clarify. |
| `Footbag Moves` | stanford | File-title leak from `stanford-2.txt`. Drop. |

**Action**: 4 row removals or renames via `sed -i` on RECONCILIATION.csv. Low-risk follow-up.

---

## D7 — Primitive-completeness audit (truncated post-governance-correction)

Per the kick-canonical-vocabulary-scope governance rule (memory: `feedback_kick_canonical_vocabulary_scope`), the prior "27 obvious primitive gaps" finding is **withdrawn**. The trivial body-contact kicks (toe-kick / heel-kick / inside-kick / outside-kick / knee-kick) are NOT canonical vocabulary.

**Remaining true primitive gaps from the original audit (the meaningful-topology subset)**:

| Gap | Source corpus | Status |
|---|---|---|
| `around-the-world-heel` | (not in corpus) | Sibling-symmetric to `double-around-the-world-heel`; possibly fborg-listed under another name. Audit + verify before promoting. |
| `reverse-around-the-world` | Stanford (`Reverse ATW`) | Now in reconciliation as state-3 (Wave 0 added). Cat A; ecosystem-untagged (needs `whirl-swirl` or new `atw` ecosystem). |
| `Around The World Kick` | fborg-1add | Already canonical as `around-the-world-kick` (1 ADD). |
| `Reverse ATW` | Stanford | Same Stanford row from Wave 0. |
| `clipper-kick` | fborg-1add (`Clipper Kick`) | Already canonical. |
| `flying-X` family | fborg + RECONCILIATION canonical (`flying-clipper`, `flying-inside`, `flying-outside`) | Already complete; bare `flying-x` is not a real primitive. |

**Conclusion**: D7 produces ~1-2 actionable items (around-the-world-heel + reverse-around-the-world verification). The "primitive completeness" theme is much smaller post-governance-correction.

---

## D8 — Promotion-wave recommendations (post-W0)

Wave plan, ordered by risk:

| Wave | Scope | Est. rows | Risk |
|---|---|---|---|
| **W1 — Inspinning + Quantum complete** | All Cat-A rows in both ecosystems | ~47 | XS (cleanest small ecosystems; 0 doctrine blockers; methodology proven) |
| **W2 — 4 small Red packets** | Weaving doctrine + shooting definition + pogo classification + the 2026-05-26 omelette packet (already drafted, not sent) | 4 packets, ~0 rows | XS — packet drafting + handoff (unblocks ~94 rows in subsequent waves) |
| **W3 — Pixie complete** | Cat A pixie + pixie-compound rows | ~101 | S (XS pixie ecosystem has 0 doctrine blockers but heavy parenthetical/folk-alt presence; mix of A and B) |
| **W4 — Atomic + Fairy complete** | Cat A atomic + fairy rows | ~136 | S (atomic 0-blockers; fairy has 4 doctrine blockers — fairy-furious or similar — skip those) |
| **W5 — Cat-B alias resolution (B1 slash-alts)** | The ~80 slash-pair rows; curator decides canonical name + creates state-2 alias rows | ~80 rows touched | M (per-pair curator decisions; methodology already proven by DK-4) |
| **W6 — Cat-B alias resolution (B2 folk-+-structural)** | The ~400 folk-name + structural-reading pairs | ~400 rows touched | M (curator review per pair; some are already SE-chain wired) |
| **W7 — Spinning + Gyro + Ducking** | Cat A rows; defer doctrine-token-containing rows to post-Red-reply | ~220 | M (large ecosystems; coordinate with Wave-2 reply integration) |
| **W8 — Cat-C structural-expansion batch** | 104 Cat-C rows reviewed in ecosystem-coherent groups | ~104 | M-L (high modifier-stack depth; cross-ecosystem coherence pass needed) |
| **W9 — Post-Red unblocked rows** | After Red packets land, promote the now-unblocked Cat-D rows (mostly blurry-family + nuclear + furious from Wave-2 answers) | ~227 | Variable — depends on rulings |
| **W10 — Untagged Cat-A** | 583 Cat-A rows without ecosystem tags (Alpine-X folk names, year names, etc.) | 583 | M — needs curator ecosystem tagging pass first |

**Total Cat-A promotable across W1+W3+W4+W7+W10 (mechanical, no doctrine dependency): ~1,090 rows.**

---

## D9 — Risk-ranked implementation sequencing

```
Wave 1   → Inspinning + Quantum (XS risk, ~47 rows, immediate visible win)
Wave 2   → Send omelette packet + draft 3 new Red packets (weaving / shooting / pogo)
            ↓
            ↓  packets pending Red reply (no blocking work here)
            ↓
Wave 3   → Pixie complete (~101 rows)
Wave 4   → Atomic + Fairy (~136 rows)
Wave 5   → Cat-B slash-alt resolution (~80 pairs)
Wave 6   → Cat-B folk+structural resolution (~400 pairs)
Wave 7   → Spinning + Gyro + Ducking (~220 rows; defer doctrine-flagged)
Wave 8   → Cat-C structural-expansion (~104 rows)
Wave 9   → Post-Red unblocked promotions (~227 rows; conditional)
Wave 10  → Untagged Cat-A with curator ecosystem tagging (~583 rows)
            ↓
[parallel from W3 onward: Cat-E cleanup (4 rows, 1 session)]
```

**Path-dependent**: W2's packets unblock W9. W5/W6 alias resolution should land before W3-W4 promotions to avoid duplicating canonicalization work on rows that turn out to be aliases.

---

## D10 — Suggested next promotion wave

**Wave 1: Inspinning + Quantum complete.**

| Why | Detail |
|---|---|
| Smallest scope | 47 Cat-A rows total |
| Zero doctrine blockers | Both ecosystems have 0 state-5 entries |
| Methodology proven | DK-1/2/3/4 + Bucket A wave establish the safe-promotion recipe |
| Visible coverage win | Two complete ecosystems move from "incomplete" to "comprehensive" |
| Reversible | Each row's promotion is a CSV row-state change + canonical-CSV-row addition; backout is a revert |
| Sets up rest of plan | Cleanest possible first wave; failure here would signal methodology issue before bigger waves |

**Acceptance criteria for W1**:
- All 20 inspinning Cat-A rows have either (a) state-1 canonical published, or (b) explicit per-row curator-deferral with reason
- Same for all 27 quantum Cat-A rows
- For each promoted row: JOB + op_notation + ADD math + sibling-pattern derivation logged
- Per-row methodology: same as DK-3/4 — append to `red_additions_2026_04_20.csv`, populate `red_corrections_2026_04_20.csv` with JOB + op_notation, run loader 19, run tests, stage

**Recommended commitment for W1**: 47 rows is roughly 2 sessions of focused work, comparable to DK-1 Wave 2's scope (~5 rows per session × 9 sessions for DK-1+2+3+4 combined). At ~5 rows/session: 9-10 sessions. At higher cadence with ecosystem-batching: 4-6 sessions.

---

## Artifacts produced by this triage

| Path | Contents |
|---|---|
| `triage_classifier.py` | The deterministic classifier (~280 lines). Re-runnable; idempotent. |
| `triage_classified.csv` | Per-row triage output (2,154 rows × 6 columns) |
| `by_category/A-safe.csv` | 1,343 Cat-A candidates |
| `by_category/B-alias.csv` | 476 Cat-B aliases |
| `by_category/C-structural.csv` | 104 Cat-C structural-expansion variants |
| `by_category/D-doctrine.csv` | 227 Cat-D doctrine-blocked |
| `by_category/E-weak.csv` | 4 Cat-E weak-source |
| `by_ecosystem/<name>.csv` | 21 per-ecosystem partitions |
| `summary.txt` | Aggregate counts |

**No RECONCILIATION.csv writes.** This is pure classification; the column shape and 2,461 row count are unchanged.

---

**Single question before W1 lands**: confirm the inspinning + quantum priority, or pick a different starting ecosystem (pixie is bigger but also clean; atomic is bigger still)?
