# High-Value Notation Gaps -- 2026-05-19

Output of the Job-IFPA reconciliation. Identifies missing formulas, missing notations, missing canonical rows, and curator-decision queues, ranked by ROI.

Source: `job_example_inventory.csv` (15 rows) + `job_ifpa_reconciliation.csv` (15 rows).

---

## 1. Aggregate reconciliation statistics

| Status | Count |
|---|---:|
| Exact agreement | 8 (Mirage, Flurry, Ripwalk, Eggbeater, Symposium Mirage, Symposium Whirl, Barfly, Dada Curve) |
| Naming disagreement | 2 (Paradox Dbl Legover, Pdx Blur) |
| Missing canonical row | 3 (Double Over Down, Double Pickup, Gyro Ripwalk) |
| Not applicable (illustration) | 2 (Clipper to Clipper, Pogo Paradox Symposium Blur) |
| **Total** | **15** |

Cross-cut statistics:

| Coverage | Count |
|---|---:|
| Has IFPA canonical row | 10 of 15 (67%) |
| Has IFPA compact notation | 4 of 10 (40% of canonicals: MIRAGE, STEPPING BUTTERFLY, BARFLY, STEPPING PARADOX MIRAGE) |
| Has IFPA operational notation | 2 of 10 (20% of canonicals: barfly, blur) |
| Has IFPA resolved formula | 2 of 10 (20%: symposium-mirage, symposium-whirl) |
| Has chain reading in registry | 5 of 10 (50%: ripwalk, eggbeater, flurry, dada-curve, [implicit for mirage and the rest via family]) |

---

## 2. Quick wins (low risk, high pedagogical value)

| # | Gap | Action | Risk | Impact |
|---|---|---|---|---|
| QW-1 | `flurry` operational_notation column blank | Author IFPA operational notation matching Job's grammar reading: `CLIP > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > SAME TOE` | Low | Fills a 4-ADD compound's notation; aligns with chain reading 'barraging legover' |
| QW-2 | `ripwalk` operational_notation column blank | Author IFPA operational notation matching Job: `CLIP > OP IN [DEX] > OP OUT [DEX] > OP CLIP` (already implied by STEPPING BUTTERFLY compact form) | Low | Notation already implicit from canonical name; codify per ATAM grammar §13 |
| QW-3 | `eggbeater` operational_notation column blank | Author IFPA operational notation: `TOE > OP OUT [DEX] > OP OUT [DEX] > SAME TOE` | Low | Fills 3-ADD compound's notation; aligns with chain reading 'atomic legover' |
| QW-4 | `symposium-mirage` operational_notation column blank | Author IFPA operational notation: `TOE > OP IN [DEX] [DEL] > OP TOE` with no-plant marker | Medium | Symposium operator's no-plant element needs operational-grammar token; defer pending curator confirmation of token form |
| QW-5 | `symposium-whirl` operational_notation column blank | Author IFPA operational notation: `TOE > OP IN [DEX] [DEL] > OP CLIP` with no-plant marker | Medium | Same as QW-4 |
| QW-6 | `dada-curve` operational_notation column blank | Author IFPA operational notation matching chain reading 'miraging far symposium butterfly' | Medium | Most complex of the canonicals; needs curator review of no-plant + far token placement |

**Quick-wins ROI summary:** 6 gaps are mechanical-author-only; 3 are pure low-risk (QW-1, QW-2, QW-3); 3 are medium-risk pending symposium-token form (QW-4, QW-5, QW-6).

### 2.1 Notation-form pattern-uncertainty caveats (added 2026-05-19 post-audit research)

Pre-application research against existing butterfly-family operational notations surfaced pattern-matching uncertainty NOT visible from the chain readings alone. The richer notation forms below were modeled on the closest existing analogues; the simpler forms in the QW table above are also defensible. Curator picks the form.

| QW | Simpler form (table above) | Richer form (pattern-modeled) | Pattern source | Uncertainty |
|---|---|---|---|---|
| QW-1 (flurry) | `CLIP > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > SAME TOE` | (same) | Job 1995 grammar; legover-base 5-token chain | Low. No existing barraging-legover compound in DB to model against. Simpler form preserves Job's structure |
| QW-2 (ripwalk) | `CLIP > OP IN [DEX] > OP OUT [DEX] > OP CLIP` | `CLIP > OP IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]` | `matador` (NUCLEAR BUTTERFLY) + `tripwalk` (QUANTUM BUTTERFLY): both use `>>` between dexes + `[XBD]` cross-body + `[DEL]` terminal flags | Medium. `>>` may encode stepping marker per `blur` notation; `[XBD]` cross-body terminal may not apply for stepping butterfly specifically (vs nuclear / quantum butterfly which are differently set-modified). Curator picks |
| QW-3 (eggbeater) | `TOE > OP OUT [DEX] > OP OUT [DEX] > SAME TOE` | (same) | Job 1995 grammar; legover-base 4-token chain | Low. Atomic operator is encoded structurally (same as nuclear in matador / quantum in tripwalk: no explicit flag token), so no enrichment needed |

The simpler forms were the originally-audit-proposed values; the richer forms surfaced from this turn's pattern research. Both are pedagogically defensible; the choice between them depends on whether the operational_notation column should encode stepping/cross-body/terminal flags explicitly or implicitly. Curator decision.

---

## 3. Medium-risk doctrine areas

| # | Doctrine question | Why medium risk |
|---|---|---|
| MR-1 | Should `paradox-double-legover` be added as an alias of `double-leg-over`? | Job's 1995 name predates the miraging-vs-paradox doctrine. Modern chain reading 'miraging legover' is Red pt4-locked. Adding paradox-double-legover as alias would propagate a 1995 framing into modern alias namespace, potentially confusing the miraging doctrine |
| MR-2 | Should `paradox-blur` (or `pdx-blur`) be added as an alias of `blur`? | Same shape as MR-1 but for the blur compound. Modern doctrine resolves blur as 'stepping paradox mirage' (Red pt6 + pt11). Job's 'Pdx Blur' name foregrounds paradox; modern doctrine treats blur as folk-name without paradox prefix |
| MR-3 | Should `double-pickup` be canonicalized? | Job's 1995 use is community-usage evidence. CANONICALIZATION_POLICY.md §10 (Productive Multiplicity) requires Red-tier endorsement OR substantial documented community use. Job's 1995 letter is documented community use; whether it qualifies as 'substantial' is a curator judgment |
| MR-4 | Should `double-over-down` be canonicalized? | Same as MR-3. Plus: existing alias `quantum-double-over-down` → `plasma` implies a base trick exists structurally; the curator question is whether the base IS itself canonical (independently of plasma) |
| MR-5 | Should `gyro-ripwalk` be canonicalized? | Compound math: `gyro(+1) + ripwalk(4) = 5 ADD`. If multiplier doctrine (per add-multiplier-doctrine-2026-05-19.md) ratifies, this is a derivable phrase, not a canonical row. Pre-emptive canonical row would lock the multiplier doctrine before Red confirms |

**Medium-risk approach:** None of MR-1 through MR-5 should be applied as cleanup. All are Red Wave 2 packet candidates.

---

## 4. Red-packet candidates (Wave 2 additions)

| # | Question for Red |
|---|---|
| RP-1 | Is "Paradox Double Legover" (Job's 1995 name) and "Miraging Legover" (modern Red pt4-locked chain reading) the same trick? If yes, can the paradox-prefix name be documented as historical alternate? |
| RP-2 | Is "Pdx Blur" / "Paradox Blur" (Job 1995) the same trick as modern "blur" (= stepping paradox mirage, per Red pt6 + pt11)? If yes, doctrinal status of the paradox-prefix name |
| RP-3 | "Double Pickup" appears in Job's 1995 paper as a named example. Does it have stabilized community usage warranting canonical-row promotion per CANONICALIZATION_POLICY.md §10? |
| RP-4 | "Double Over Down" appears in Job's 1995 paper. Plus existing alias `quantum-double-over-down` → `plasma`. Is "Double Over Down" itself a canonical base trick? |
| RP-5 | "Gyro Ripwalk" appears in Job's 1995 paper with `(back)spin` operator. Does gyro contribute +1 to ripwalk (= 5 ADD) and warrant canonical-row promotion? Or is it a derivable phrase that does NOT need a canonical row? |
| RP-6 | Job's `(for | back)spin` operator distinction uses forward/backward axis; modern doctrine uses full-turn (spinning, 360°) vs half-turn (gyro, 180°) axis. Are these the same distinction expressed differently, or genuinely different distinctions? |
| RP-7 | Job uses `(no plant while)` as a single operator covering both symposium AND pogo (depending on whether the no-plant element appears once or multiple times in the formula). Modern doctrine distinguishes symposium (+1) from pogo (+0). When Job writes 'Pogo Paradox Symposium Blur' the no-plant element appears twice — is that a structural distinction (modern would have two operator tokens) or a notational quirk (modern would have one)? |

---

## 5. Glossary-only opportunities

| # | Opportunity | Section | Risk |
|---|---|---|---|
| GO-1 | Add "Notation philosophies" sidebar comparing Job grammar vs modern chain reading | §7 | Low |
| GO-2 | Add Job grammar formula block (Formula 2 with no-plant + spin) as historical reference | §7 | Low |
| GO-3 | Add 4-example side-by-side comparison (Job grammar vs modern reading) for Mirage, Ripwalk, Symposium Mirage, Pdx Blur | §8 | Low |
| GO-4 | Add "Historical origins" footnote in §1 noting Job's 1995 letter as earliest structural-notation proposal | §1 (or §12 when it lands) | Low |
| GO-5 | Document the for/back-spin vs full/half-turn doctrinal divergence as a learner-facing distinction in §3 | §3 | Medium (pending RP-6 Red answer) |

All glossary-only opportunities are reversible TypeScript content edits to `glossary.hbs`-shaped data; zero canonical mutation.

---

## 6. Workbook-only opportunities

| # | Opportunity | Risk |
|---|---|---|
| WB-1 | Add Job-grammar-reading column to reconciliation workbook for the 10 canonical examples (alongside existing IFPA / fborg / PB / FM columns) | Low |
| WB-2 | Add agreement_with_job column (boolean / enum) | Low |
| WB-3 | Add Job-source-evidence column for not-yet-canonical examples (Double Pickup, Double Over Down, Gyro Ripwalk) | Low |
| WB-4 | Surface the 5-not-found-canonical examples as a new workbook tab "Job-1995 historical names" | Medium |

All workbook-only opportunities are additive columns / sections in `build_trick_reconciliation_workbook.py`; no DB or content change.

---

## 7. Movement-language blind spots surfaced

Job's grammar surfaces structural distinctions that the modern Movement System view does NOT yet make explicit:

| Distinction | Job grammar | Modern Movement System | Gap |
|---|---|---|---|
| Set-vs-catch shape | Explicit (set token + catch token) | Implicit (trick-by-trick) | Movement System view could add "set/catch shape" axis at §6 of modifier_feel layer |
| Side-change events | Explicit (same/op transitions) | Implicit (encoded in paradox operator) | Movement System view already has "Entry Topologies" axis; could surface paradox-without-naming-it as a same/op transition count |
| Same-side persistence | Explicit (same-same chains) | Not modeled | Movement System could add "side persistence" sub-axis |
| Dex direction sequencing | Explicit (in/out token sequences) | Modeled via dex-archetype taxonomy | Decent coverage; Job's framing is more granular |

These are NOT immediate-implementation gaps; they are observations for future Movement System slice-design work.

---

## 8. Unresolved operator semantics

| Operator | Job's reading | Modern reading | Resolution status |
|---|---|---|---|
| `(no plant while)` (single occurrence) | Symposium-class | Symposium (+1) | Aligned |
| `(no plant while)` (multiple occurrences) | Pogo-or-Symposium-stack | Distinct between pogo (+0) and symposium (+1); stacking unclear | RP-7 question |
| `(for)spin` | Forward-rotation modifier | Spinning (+1; full turn) | RP-6 question; same-axis or different-axis? |
| `(back)spin` | Backward-rotation modifier | Gyro (+1; half turn) | RP-6 question |
| Same/op transitions | Side-change grammar element | Paradox operator (+1) | Aligned; Job is descriptive, modern is named |
| Toe/clip terminals | Surface-anchor grammar element | Surface taxonomy + base atom resolution | Aligned |

---

## 9. Ranking summary

Items ordered by recommended attention:

1. **Quick wins QW-1, QW-2, QW-3** (3 mechanical operational-notation authorings; low risk; high pedagogical value)
2. **Red-packet RP-1, RP-2** (naming-disagreement doctrine; medium risk; surfaces clean Red questions)
3. **Workbook-only WB-1, WB-2, WB-3** (additive workbook columns; low risk; strengthens reconciliation governance)
4. **Glossary-only GO-1, GO-2, GO-3** (low risk; high pedagogical value; J1/J3 implementation slices)
5. **Quick wins QW-4, QW-5, QW-6** (operational-notation authoring with symposium-token form pending; medium risk)
6. **Red-packet RP-3, RP-4, RP-5, RP-6, RP-7** (canonicalization + operator-axis questions; medium-to-high risk; Red Wave 2 packet)
7. **Glossary-only GO-4, GO-5** (deferred to §12 landing or RP-6 Red answer)
8. **Movement-language blind spots §7** (observational only; no immediate action)

The 1-2-3-4 prioritization yields ~12 actionable items spread across glossary content + workbook columns + Red-packet additions. Zero canonical mutation; zero schema change; zero UI redesign.
