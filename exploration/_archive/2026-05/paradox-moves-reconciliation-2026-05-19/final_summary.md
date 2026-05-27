# Paradox Moves Reconciliation -- Final Summary -- 2026-05-19

Single-page synthesis of the paradoxMoves.txt reconciliation slice. Top-of-stack reference for curator + future Claude sessions.

Sources:
- `exploration/fborg/paradoxMoves.txt` (footbag.org Paradox Moves catalog; 57 moves; circa 2003-2004 era)
- `exploration/fborg/paradox-tutorial.txt` (Steve Goldberg, 1999, FAQ "What does 'paradox' mean?"; 84 lines; authoritative pre-modern doctrinal source — **per curator directive, this content MUST be summarized when glossary slices PM1-PM4 are implemented**)

---

## Counts

| Metric | Value |
|---|---:|
| Total paradox-class moves inventoried | 57 |
| Moves with canonical IFPA row | 17 (30%) |
| Moves WITHOUT canonical IFPA row | 40 (70%) |
| Of missing 40: structural-form names (paradox-X derivable) | 28 |
| Of missing 40: folk-named compounds | 12 (Blizzard, Voodoo, Avalanche, Spike Hammer, Blurrage, Bedwetter, Blurry Drifter, Lotus, Whirlwind, Marius, Paratoxic, Symposium Tomahawk, Paradox High Plains Drifter) |
| Of 17 canonical: with operational notation populated in DB | 1 (blur, with token-grammar variance from source) |
| Of 17 canonical: ADD agreement with source | 17 (100%) |
| Of 17 canonical: chain-reading registry match | 9 + 2 divergent (Tomahawk reads differently; Royale/Fury/etc. confirmed) |
| Source moves with explicit [PDX] flag | 46 (81%) |
| Source moves with paradox-name but no [PDX] flag (structural encoding) | 11 (19%) |
| Source moves spanning ADD range | 3 → 7 (ADD-3: 2; ADD-4: 15; ADD-5: 25; ADD-6: 13; ADD-7: 2) |

---

## Agreement rates

| Status | Count | % |
|---|---:|---:|
| Exact agreement (canonical + chain match + ADD match) | 9 of 17 canonical | 53% of canonicals |
| Partial agreement (chain match + ADD match; missing IFPA operational) | 7 of 17 canonical | 41% of canonicals |
| Paradox doctrine divergence (Tomahawk reads differently) | 1 of 17 canonical | 6% of canonicals |
| Missing canonical row | 40 of 57 source | 70% of source |
| ADD agreement (for canonicals) | 17 of 17 | 100% |
| ADD agreement (for derivable structural-forms) | TBD (~24 of 28 expected; 4 have systematic Pogo-class +1 divergence) | varies |

---

## Major alignments

1. **Paradox(+1) doctrine confirmed.** Source uses paradox semantics consistently with modern +1 body modifier doctrine. The 1999 tutorial explicitly states "in the current difficulty-rating system, a 'paradox' move is awarded an extra 'body' add (for the double-hip-pivot)" — direct 27-year precedent for modern doctrine.
2. **Red pt11 "Blurry = Stepping Paradox" doctrine confirmed.** Source has 11 explicit folk-name/structural-reading pairs (Blurry Whirl = Stepping Paradox Whirl, Blurry Torque = Stepping Paradox Torque, etc.). This is the historical-precedent foundation for Red pt11.
3. **Red pt2 surging doctrine confirmed.** Source has 2 explicit precedents (Surge = Surging Paradox Mirage; Surreal = Surging Paradox Whirl). Cross-references CLAUDE.md "Surging Modeling Rule."
4. **Red pt5 royale doctrine confirmed.** Source confirms Royale = Paradox Reverse Drifter.
5. **Same-leg-paradox dominant pattern.** 26 of 36 paradox-segments use SAME-PDX shape (setting leg does the paradox); 10 use OP-PDX. Modern grammar uses both.
6. **Tutorial's "spinning subsumes paradox" doctrine.** 1999 source: "spinning or gyrating moves are thought of as 'taking the place' of paradox in most cases... they 'subsume' it." Example: vortex is gyrating drifter (non-paradox), not gyrating paradox drifter. Modern doctrine aligns.
7. **Tutorial's "paradox cannot apply" list.** 1999 source explicitly excludes butterfly, switch-over, leg-over, and swirl from paradox compounding. Modern doctrine: these atoms' structure does not permit paradox.

---

## Major doctrine divergences

1. **Tomahawk chain reading divergence (HIGH SEVERITY).** Source: Tomahawk = Ducking Paradox Whirl (`ducking(+1)+paradox(+1)+whirl(3)=5`). Modern: Tomahawk = blurry ducking torque / stepping ducking paradox torque (Red pt11-locked). Both produce 5 ADD via different decomposition. Surface as Red Wave 2 W2-16.
2. **Pogo-class systematic +1 ADD divergence (HIGH SEVERITY).** 5 source compounds (Pogo Paradox Mirage, Pogo Paradox Barrage, Pogo Paradox Drifter, Pogo Paradox Eggbeater, Pogo Paradox Whirl) have ADD values that exceed modern pogo(+0) + paradox(+1) + base derivations by +1. Suggests source uses "Pogo" loosely to mean "pogo + symposium" or that the (no plant while) token systematically conflated symposium and pogo. Cross-references FM audit FRP-7 + Job audit RP-7.
3. **Paradox-without-PDX-flag inconsistency (MEDIUM SEVERITY).** 11 of 57 source moves use "paradox" in the name but operational notation lacks the [PDX] flag (structural encoding via leg-switch). Reconciliation: modern doctrine should specify when [PDX] flag is explicit vs implicit.
4. **(plant) marker grammar gap (MEDIUM SEVERITY).** Source uses explicit (plant) marker in 3 moves to disambiguate support-leg-plant timing. Modern ATAM grammar §13 does NOT use (plant) marker. Curator/Red question.
5. **Inspinning operator gap (MEDIUM SEVERITY).** Source explicitly names 2 "Inspinning X" compounds with (front) SPIN operational form. Modern doctrine: "inspinning" not registered as a modifier. Cross-references FM FRP-5 + Job RP-6.
6. **OP BACK SWIRL token construct (MEDIUM SEVERITY).** Source uses "OP BACK SWIRL [DEX]" as a single compound token in 3 moves. Modern ATAM grammar would decompose this. Curator/Red question.
7. **Paradox Double Leg Over naming divergence.** Source: Paradox Double Leg Over (4 ADD; paradox+legover framing). Modern: double-leg-over (3 ADD; chain reading "miraging legover" Red pt4-locked). Cross-references Job audit RP-1.

---

## Support-leg doctrine findings

paradox-tutorial.txt's central doctrinal claim: paradox difficulty derives from two structural elements:
1. The "snake" motion of the setting leg out from cross-body position.
2. The "double-hip-pivot" body action.

The +1 ADD is awarded for the double-hip-pivot specifically. This is the 1999 source for the modern paradox(+1) doctrine.

**Implication for executable accounting:** The 1999 source's framing suggests paradox is a BODY ADD (the double-hip-pivot), not a SET ADD. Modern multiplier doctrine classifies paradox as class C/D structural multiplier with `modifier_type='body'` in the DB. **Alignment is strong.**

**Source's "set doesn't affect difficulty" quote (line 51):** "in freestyle footbag, it has always been the common thinking that 'the set doesn't affect the difficulty'. But we all know it does for 'paradox' moves." This is a foundational doctrinal observation — paradox is the exception to the general principle.

---

## Historical lineage findings

1. **paradox-tutorial.txt (1999) is the authoritative source** for paradox semantics in the modern doctrine. Steve Goldberg's framing established the "+1 body ADD for the double-hip-pivot" rule that modern multiplier doctrine continues.
2. **paradoxMoves.txt (~2003-2004) is the 57-move catalog** built ON the 1999 doctrinal framework. The catalog implements the doctrine across compound paradox families.
3. **Paul Munger** is cited (1999 tutorial) as having contributed a "list of criteria for whether or not a move is paradox" — relevant historical-attribution.
4. **The "great paradox debate"** is named in the 1999 tutorial as the community-historical dispute that led to the +1 body-ADD doctrine.
5. **Tuan Vu** is mentioned in paradoxMoves description for Pogo Paradox Torque ("just ask Tuan Vu"); **Kenny Shults** is mentioned for Pogo Paradox Whirling Swirl. These attribution markers are pedagogical history, not canonical aliases — per `feedback_no_individual_names_freestyle_views`, names should NOT propagate to public freestyle pages.

---

## Glossary opportunities (curator-paced; PM1-PM4 + paradox-tutorial.txt summary required)

Top 5 from `paradox_glossary_candidates.csv` (13 total):

| ID | Topic | Section | Priority |
|---|---|---|---|
| PG-1 | Paradox as side-change operator with "tight S shape" kinematic | §3 or §6 | High |
| PG-3 | Symposium / (no plant while) doctrine | §3 or §6 | High |
| PG-5 | Folk-name lineage table for paradox-family (26 pairs) | §5 or §7 | High |
| PG-6 | Blurry = Stepping Paradox equivalence with paradoxMoves precedent | §3 or §6 | High |
| (NEW) | **Paradox tutorial summary** per curator directive 2026-05-19 — "snake", "double-hip-pivot", "spinning subsumes paradox", "wrong clipper" framings | §3 or §6 | High |

Per curator directive: when PM1-PM4 are implemented, the paradox-tutorial.txt summary (captured in paradox_glossary_integration.md §7) MUST be included as content source alongside paradoxMoves.txt material.

---

## Quick wins (HELD pending curator notation-token review)

14 of 17 canonical paradox-rows could ship operational notation from this source once Red Wave 2 answers settle token grammar (FM audit FRP-3/4/6):

| Slug | Source operational notation | Quick-win status |
|---|---|---|
| paradox-mirage | `CLIP > SAME IN [PDX] [DEX] > OP TOE [DEL]` | HELD |
| paradox-whirl | `CLIP > SAME IN [PDX] [DEX] > OP CLIP [XBD] [DEL]` | HELD |
| paradox-drifter | `CLIP > SAME IN [PDX] [DEX] > SAME CLIP [XBD] [DEL]` | HELD |
| paradox-torque | `CLIP > SAME IN [PDX] [DEX] > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL]` | HELD |
| paradox-blender | `CLIP > SAME IN [PDX] [DEX] > (BACK) SPIN [BOD] > SAME CLIP [XBD] [DEL]` | HELD |
| paradox-symposium-whirl | `CLIP (plant) > (no plant while) SAME IN [BOD] [PDX] [DEX] > OP CLIP [XBD] [DEL]` | HELD ((plant) marker + token) |
| royale | `CLIP > SAME OUT [PDX] [DEX] > SAME CLIP [XBD] [DEL]` | HELD |
| fury | `CLIP > OP IN [DEX] > SAME IN [DEX] > OP IN [PDX] [DEX] > OP TOE [DEL]` | HELD |
| blurry-whirl | `CLIP > OP IN [DEX] > OP IN [PDX] [DEX] > OP CLIP [XBD] [DEL]` | HELD |
| fog | `CLIP > OP IN [DEX] > OP IN [PDX] [DEX] > OP OUT [DEX] > SAME TOE [DEL]` | HELD |
| surge | `CLIP > (back) SPIN [BOD] > SAME IN [DEX] > OP IN [PDX] [DEX] > OP TOE [DEL]` | HELD |
| blurry-torque | `CLIP > OP IN [DEX] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` | HELD |
| surreal | `CLIP > (back) SPIN [BOD] > SAME IN [DEX] > OP IN [PDX] [DEX] > OP CLIP [XBD] [DEL]` | HELD |
| gauntlet | `CLIP > OP IN [DEX] > DUCK [BOD] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` | HELD |

---

## Red-question additions (Wave 2 packet)

18 candidates surfaced in `paradox_wave2_candidates.csv`. Combined audit packet totals across 4 audit packages:

| Audit | Red packet candidates |
|---|---:|
| Multiplier doctrine audit | 11 |
| Job notation audit | 7 |
| Fundamental moves audit | 11 |
| Paradox moves audit | 18 |
| **Total** | **47** |

Cross-cutting questions (appearing across multiple audits):
- spinning/gyro full/half vs back/front axis (FM FRP-5; Job RP-6; Paradox W2-15 → 3 audits)
- pogo/symposium (no plant while) ambiguity (FM FRP-7; Job RP-7; Paradox W2-3 → 3 audits)
- ATAM operational-notation token grammar — flag order, step marker, surface-stall opener (FM FRP-3/4/6; Paradox PD-4 → 2 audits)
- Tomahawk reading divergence (Paradox W2-16 — new from this audit)
- (plant) marker grammar (Paradox W2-14 — new from this audit)
- Inspinning operator class (Paradox W2-15 — new from this audit; resonates with FM FRP-5)

---

## Recommended next reconciliation sources

The four notation/governance source documents reviewed so far:
- Multiplier doctrine (internal audit, no external source)
- Ben Job 1995 notation document
- footbag.org fundamentalmoves.txt (18-move foundational catalog)
- footbag.org paradoxMoves.txt (57-move paradox-family catalog) + paradox-tutorial.txt (1999 doctrinal source)

Remaining sources in `exploration/fborg/`:
- `blurryMoves.txt` — folk-named blurry compounds catalog (cross-references the paradox-blurry equivalence)
- `gyroMoves.txt` — gyro-class compound catalog (would resolve the spinning/gyro axis ambiguity)
- `pixieMoves.txt` — pixie-class set-primitive catalog
- `footbag-sets-fborg.txt` — set primitives + their compound usage
- `Add-Categories-move-elements.txt` — foundational ADD-counting doctrine
- `moves-on-video.txt` — video-demonstration cross-reference

Natural next priorities (ranked):
1. **gyroMoves.txt** — directly resolves the spinning/gyro axis question (Wave 2 priority cross-audit)
2. **Add-Categories-move-elements.txt** — foundational ADD doctrine; would anchor multiplier-class auditing
3. **blurryMoves.txt** — cross-validates the Red pt11 blurry doctrine and the paradox-blurry equivalence
4. **footbag-sets-fborg.txt** — set primitives (pixie / fairy / atomic / quantum); cross-references multiplier audit's class-C set-modifier classifications

---

## Constraints honored

| Constraint | How honored |
|---|---|
| No schema migration | Zero `database/schema.sql` change |
| No parser rewrite | Parser layer untouched |
| No mass canonicalization | Zero new canonical rows proposed; 40 source-only paradox compounds remain non-canonical |
| No broad FM ingestion | Audit covers only the 57-move paradox catalog + 84-line tutorial |
| No broad UI redesign | Glossary section additions only |
| No automatic alias rewrites | Zero alias changes proposed |
| No fake formulas | Every formula cited is from paradoxMoves source or existing IFPA content |
| No automatic doctrine resolution | All 18 W2 candidates surface as Red packet questions, not as applied doctrine |
| Workbook-first architecture | 7 CSV deliverables + 2 markdown deliverables; CSVs are primary reconciliation surface |

---

## Files in this deliverable

```
exploration/paradox-moves-reconciliation-2026-05-19/
├── paradox_examples.csv             — 57 paradox compounds inventory
├── paradox_ifpa_reconciliation.csv  — IFPA reconciliation per compound
├── paradox_operator_inventory.csv   — 23 paradox-family operators audited
├── paradox_formula_patterns.csv     — 24 recurring paradox formula structures
├── paradox_discrepancy_queue.csv    — 12 specific discrepancies with curator actions
├── paradox_wave2_candidates.csv     — 18 Red Wave 2 candidates
├── paradox_glossary_candidates.csv  — 13 glossary integration opportunities
├── paradox_glossary_integration.md  — Pedagogical integration plan + paradox-tutorial.txt summary
└── final_summary.md                 — This file
```

---

## Single most important takeaway

paradoxMoves.txt is the 2003-era catalog of 57 paradox-family compounds; paradox-tutorial.txt (1999) is the underlying doctrinal source authored by Steve Goldberg. The audit confirms the 1999 doctrine ("paradox = +1 body ADD for the double-hip-pivot from the wrong clipper") aligns strongly with modern multiplier doctrine. 14 of 17 canonical paradox rows could ship authoritative operational notation from this source once Red Wave 2 token-grammar answers settle. The audit's 18 Wave 2 candidates focus on three high-severity areas: Tomahawk reading divergence, Pogo-class +1 ADD math, and the paradox-without-PDX-flag inconsistency.

Per curator directive 2026-05-19: when glossary slices PM1-PM4 are implemented, the content MUST include a summary of paradox-tutorial.txt (captured in this audit's `paradox_glossary_integration.md` §7) alongside the paradoxMoves.txt material.
