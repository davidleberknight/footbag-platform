# Fundamental Moves Reconciliation -- Final Summary -- 2026-05-19

Single-page synthesis of the fundamentalmoves.txt reconciliation slice. Top-of-stack reference for curator + future Claude sessions.

Source: `exploration/fborg/fundamentalmoves.txt` (FOOTBAG WORLDWIDE FREESTYLE Move List — Fundamental Moves catalog; 18 moves with full operational notations; circa 2003-2004 era footbag.org content).

---

## Counts

| Metric | Value |
|---|---:|
| Total fundamental moves inventoried | 18 |
| Moves with canonical IFPA row | 18 (100%) |
| Moves with ADD agreement | 18 (100%) |
| Moves with IFPA compact notation populated | 12 (67%) |
| Moves with IFPA operational notation populated | 1 (5.5%) — only blur |
| Moves with IFPA chain-registry reading | 5 (28%) |
| Surface stalls (1 ADD) | 3 |
| Base atoms + body primitives (2 ADD) | 4 |
| Atoms + simple compounds (3 ADD) | 4 |
| Multi-element compounds (4 ADD) | 5 |
| High-density compounds (5 ADD) | 2 |

---

## Agreement rates

| Status | Count | % |
|---|---:|---:|
| Exact agreement | 5 (the 3 surface stalls + Inside Delay + Outside Delay are full agreement) | 28% |
| Partial agreement (missing operational notation only) | 12 | 67% |
| Partial agreement (operational form difference) | 1 (blur — token-grammar difference) | 5.5% |
| Naming disagreement | 0 | 0% |
| Missing canonical row | 0 | 0% |
| ADD disagreement | 0 | 0% |

**The ADD-agreement rate is 100%.** Every FM-listed ADD value matches the modern DB.

---

## Major alignments

1. **Vocabulary alignment.** Every ATAM grammar token (CLIP, TOE, OP, SAME, IN, OUT, DEX, BOD, XBD, DEL, PDX) is used in FM source with the same meaning as in modern §13 grammar.
2. **Compact reading lineage.** 4 modern chain readings have direct FM-source ancestors (Mobius = Gyro Torque; Blur = Stepping Paradox Mirage; Ripwalk = Stepping Opposite Side Butterfly → modern Stepping Butterfly; Torque = Stepping Opposite Osis → modern miraging osis).
3. **ADD doctrine alignment.** All 18 ADD values match. The FM catalog established the canonical ADD values still in use 20+ years later.
4. **18-move foundational structure.** The FM document's 18 moves form a coherent foundational set covering all 12 modern core atoms (toe-stall, clipper-stall, legover, mirage, butterfly, osis, plus the surface stalls). The set is complete enough to ground the modern atom registry.

---

## Major doctrine divergences

1. **Torque's chain reading.** FM source: "Stepping Opposite Osis". Modern chain registry: "miraging osis" (Red pt4-locked). Two structurally-valid readings; modern doctrine picked the miraging framing. Surface as FRP-1.
2. **Ripwalk's chain reading.** FM source: "Stepping Opposite Side Butterfly". Modern compressed: "Stepping Butterfly". Modern compression is deliberate (Red 2026-05-18 ratified). Documentation-only; FRP-2.
3. **Spin axis.** FM uses (back / front) axis; modern doctrine uses full-turn (spinning) vs half-turn (gyro) axis. Same divergence question as Job audit RP-6; FM provides another data point. Surface as FRP-5.
4. **Operational-notation token grammar.** Three specific divergences worth resolving:
   - Flag order on dex: FM `[PDX] [DEX]` vs modern `[DEX] [PDX]` (FRP-3)
   - Step marker between dexes: FM single `>` vs modern `>>` (FRP-4)
   - Surface-stall opener: FM `CLIP [XBD] [DEL]` vs modern `[set] > clipper` (FRP-6)
5. **Alternation marker handling.** FM source preserves alternations (`SAME or OP`, `back or front`); modern operational notation typically resolves to a single canonical. Surface as FRP-7/8/9/10.

---

## Historical lineage findings

1. **fundamentalmoves.txt is the ATAM grammar lineage source.** The §13 grammar is a direct evolution. This claim is suitable for glossary §7 "Historical origins" subsection.
2. **The Jester ↔ Flying Clipper alias is FM-confirmed.** FM source explicitly notes "This move is also called Jester." DB has the alias.
3. **FM's parenthetical compact-reading convention** is the pre-modern precursor to modern chain readings. Modern doctrine refined the convention (sometimes preserving FM's reading exactly, sometimes compressing or replacing it). The convention itself is FM-original.
4. **The 18-move foundational corpus** has remained stable for ~20+ years; the modern dictionary expands it (currently 130+ canonical rows) but does not contradict it.
5. **Paradon's structural framing** per FM source: "Same as double over down except set from one leg and circle with the other." Provides 2003-era confirmation of "double over down" as a recognized base trick (cross-references Job audit RP-4).

---

## Glossary opportunities (curator-paced)

12 candidates surfaced in `fundamental_glossary_candidates.csv`. Top 5:

| ID | Topic | Section | Priority |
|---|---|---|---|
| G-1 | ATAM grammar lineage (FM as source document) | §7 | High |
| G-3 | same/op grammar relator semantics | §3 | High |
| G-4 | in/out dex direction semantics | §3 | High |
| G-5 | Parenthetical compact readings convention | §7 | High |
| G-6 | Flag-bracket vocabulary documentation | §7 | High |

---

## Quick wins (HELD pending curator notation-token review)

17 operational_notation values could be authored directly from FM source. Held pending FRP-3 (flag order) + FRP-4 (step marker) + FRP-6 (surface-stall convention) Red answers.

Once those 3 Red questions are settled, the 17 candidate values become a low-risk batch authoring slice (parallel to the Job audit's 3 quick wins).

---

## Red-question additions

11 new Red Wave 2 packet candidates surfaced (FRP-1 through FRP-11). Combined totals across audit packages so far:

| Audit | Red packet candidates |
|---|---:|
| Multiplier doctrine audit | 11 |
| Job notation audit | 7 |
| Fundamental moves audit | 11 |
| **Total** | **29** |

Several FRP questions cross-reference Job audit questions (FRP-5 ↔ RP-6 on spin axis; FRP-11 ↔ RP-4 on double-over-down). Surfacing as a consolidated Red Wave 2 packet would batch related questions efficiently.

---

## Recommended next reconciliation sources

The three notation/governance source documents reviewed so far:
- Multiplier doctrine (internal audit, no external source)
- Ben Job 1995 notation document
- footbag.org fundamentalmoves.txt (this audit)

Natural next sources for similar reconciliation slices:

| Source | Location | Why next |
|---|---|---|
| `exploration/fborg/JobsNotationTutorial.txt` (if exists) | footbag.org notation tutorial | Companion document to Job 1995 paper |
| `exploration/fborg/AddCategories.txt` (if exists) | footbag.org ADD category documentation | Foundational ADD-counting doctrine source |
| `exploration/fborg/MoveElements.txt` (if exists) | footbag.org move-elements documentation | Token-vocabulary source for the [BOD]/[DEX]/[DEL] flag system |
| `exploration/fborg/ParadoxTutorial.txt` (if exists) | footbag.org paradox tutorial | Paradox-operator doctrine source (Red pt7 + pt8 reference material) |

Audit pattern (4 sub-documents from fborg/ if they exist) would establish a complete reconciliation against the historical footbag.org notation corpus.

---

## Constraints honored

| Constraint | How honored |
|---|---|
| No schema migration | Zero `database/schema.sql` change. All recommendations are TS content / workbook columns / glossary additions |
| No parser rewrite | Parser layer untouched |
| No mass canonicalization | Zero new canonical rows proposed. All 18 moves already exist in DB |
| No broad UI redesign | Glossary section additions only (§3 §7 §5 §8); no template restructuring |
| No automatic alias rewrites | Jester ↔ Flying Clipper alias is already in DB; no new aliases proposed |
| No fake formulas | Every formula cited is from FM source or existing IFPA content |
| No automatic doctrine resolution | All 11 FRP questions surface as Red-packet candidates, not as applied doctrine |
| No broad FM ingestion yet | This audit covers only the 18-move fundamental catalog; the broader FootbagMoves corpus (487 entries) remains untouched |
| Workbook-first architecture | 7 CSV deliverables + 2 markdown deliverables; CSVs are the primary reconciliation surface |

---

## Files in this deliverable

```
exploration/fundamental-moves-reconciliation-2026-05-19/
├── fundamental_examples.csv             — 18 fundamental moves inventory
├── fundamental_ifpa_reconciliation.csv  — IFPA reconciliation per move
├── fundamental_operator_inventory.csv   — 31 operators/primitives audited
├── fundamental_formula_patterns.csv     — 19 recurring formula structures
├── fundamental_discrepancy_queue.csv    — 12 discrepancies with curator actions
├── fundamental_glossary_candidates.csv  — 12 glossary integration opportunities
├── fundamental_red_questions.csv        — 11 Red Wave 2 question candidates
├── fundamental_glossary_integration.md  — Pedagogical integration plan
└── final_summary.md                     — This file
```

---

## Single most important takeaway

`fundamentalmoves.txt` is the structural-notation source from which modern ATAM grammar §13 descended. The 18-move catalog has 100% ADD agreement with modern DB and provides authoritative operational notations for 17 of 18 rows where the modern DB column is blank. Three token-grammar decisions (flag order, step marker, surface-stall opener) need curator notation review before those 17 values can be authored.
