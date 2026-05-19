# Job Notation Reconciliation -- Final Summary -- 2026-05-19

Single-page synthesis of the Job notation reconciliation slice. Top-of-stack reference for curator + future Claude sessions.

Source: `exploration/fborg/JobsNotation.txt` (Ben Job's 1995 letter "By the Way, Not the Name" to footbag@footbag.org).

---

## Counts

| Metric | Value |
|---|---:|
| Total Job examples inventoried | 15 |
| Job examples with canonical IFPA row | 10 (67%) |
| Job examples missing canonical IFPA row | 5 (Clipper-to-Clipper illustration; Pogo-Paradox-Symposium-Blur illustration; Double-Over-Down; Double-Pickup; Gyro-Ripwalk) |
| Job examples with exact agreement | 8 |
| Job examples with naming disagreement | 2 (Paradox Dbl Legover; Pdx Blur) |
| Job examples in IFPA chain registry | 5 (ripwalk, eggbeater, flurry, dada-curve, symposium-mirage [implicit via family resolution]) |
| Job examples with IFPA operational_notation populated | 2 (barfly, blur) |
| Job examples with IFPA resolved formula | 2 (symposium-mirage, symposium-whirl) |

---

## Agreement statistics

| Status | Job count | Job % | Notes |
|---|---:|---:|---|
| Exact agreement | 8 | 53% | Including all 4 symposium/whirl/mirage/ripwalk paradigm examples |
| Naming disagreement | 2 | 13% | Paradox Dbl Legover (= miraging legover); Pdx Blur (= blur / stepping paradox mirage) |
| Missing canonical row | 3 | 20% | Double-Over-Down, Double-Pickup, Gyro-Ripwalk |
| Not applicable | 2 | 13% | Clipper-to-Clipper (grammar illustration); Pogo-Paradox-Symposium-Blur (compound illustration) |

---

## Unresolved doctrine list

| # | Doctrine | Resolution path |
|---|---|---|
| UD-1 | "Paradox Double Legover" (Job 1995) vs "miraging legover" (modern Red pt4-locked) — same trick, two doctrinal framings | Red Wave 2 question RP-1 |
| UD-2 | "Pdx Blur" / "Paradox Blur" (Job 1995) vs "blur" / "stepping paradox mirage" (modern Red pt6 + pt11) — same trick, two framings | Red Wave 2 question RP-2 |
| UD-3 | Job's `(for | back)spin` axis (forward/backward) vs modern spinning/gyro axis (full/half-turn) — same distinction expressed differently, or different distinctions? | Red Wave 2 question RP-6 |
| UD-4 | Job conflates Pogo and (no plant while) in one example; modern doctrine distinguishes pogo (+0) from symposium (+1) — Job's framing accommodates which? | Red Wave 2 question RP-7 |
| UD-5 | Does "Double Pickup" (Job 1995) have stabilized community usage warranting canonical-row promotion per CANONICALIZATION_POLICY.md §10? | Red Wave 2 question RP-3 |
| UD-6 | Does "Double Over Down" (Job 1995) qualify as canonical base trick (vs subsumed by plasma)? | Red Wave 2 question RP-4 |
| UD-7 | Does "Gyro Ripwalk" (Job 1995) warrant canonical-row promotion, or treated as derivable phrase gyro(+1) + ripwalk(4) = 5 ADD? | Red Wave 2 question RP-5 |

---

## Glossary opportunities (curator-paced)

| ID | Opportunity | Section | Risk |
|---|---|---|---|
| GO-1 | "Notation philosophies" sidebar (Job grammar vs modern chain) | §7 | Low |
| GO-2 | Job grammar formula block (Formula 2) as historical reference | §7 | Low |
| GO-3 | 4-example side-by-side comparison (Mirage, Ripwalk, Symposium Mirage, Pdx Blur) | §8 | Low |
| GO-4 | "Historical origins" footnote (Job 1995 as earliest structural-notation proposal) | §1 or §12 | Low |
| GO-5 | for/back-spin vs full/half-turn doctrinal divergence | §3 | Medium (pending UD-3 Red) |

---

## Workbook enhancements (additive; low risk)

| ID | Enhancement | Risk |
|---|---|---|
| WB-1 | Add Job-grammar-reading column for the 10 canonical examples | Low |
| WB-2 | Add agreement_with_job column (boolean / enum) | Low |
| WB-3 | Add Job-source-evidence column for not-yet-canonical examples | Low |
| WB-4 | New "Job-1995 historical names" workbook tab | Medium |

---

## Recommended next implementation slices (ranked)

| Rank | Slice | Risk | Scope |
|---|---|---|---|
| 1 | **QW-1, QW-2, QW-3** — author operational_notation for flurry, ripwalk, eggbeater | Low | 3 DB column updates via red_corrections; 5-edit pattern per the rake/orbit precedent |
| 2 | **AI-2 (J1)** — add "Notation philosophies" sidebar to glossary §7 | Low | Single .hbs template edit + service content addition |
| 3 | **AI-4 (WB-1)** — add Job-grammar-reading column to reconciliation workbook | Low | Single `build_trick_reconciliation_workbook.py` edit |
| 4 | **AI-3 (J3)** — add 4-example side-by-side glossary §8 block | Low | Glossary content addition |
| 5 | **AI-5** — surface RP-1 through RP-7 in Red Wave 2 packet | N/A | Pre-packet curator review |
| 6 | **AI-6** — append Job-confirmed-swing-primitive note to multiplier doctrine audit | Low | Audit doc addendum |
| 7-DEFERRED | **QW-4, QW-5, QW-6** — author operational_notation for symposium-mirage / symposium-whirl / dada-curve | Medium | Pending symposium-token operational-grammar form |
| 8-DEFERRED | **MR-1 through MR-5** — naming-disagreement + canonicalization decisions | Medium | Pending Red Wave 2 answers |

---

## Red-question queue (full set added by this audit)

The audit adds 7 questions to the Red Wave 2 packet candidate list:

- **RP-1** Paradox Double Legover vs miraging legover
- **RP-2** Pdx Blur vs blur
- **RP-3** Double Pickup canonicalization
- **RP-4** Double Over Down canonicalization
- **RP-5** Gyro Ripwalk canonicalization
- **RP-6** for/back-spin axis vs full/half-turn axis
- **RP-7** Pogo / symposium conflation in Job's notation

Combined with the multiplier-doctrine audit's 11 candidates (2-R1 through 2-R5; 6-R1 through 6-R6), the Red Wave 2 packet candidate pool now stands at **18 questions** across two audit packages.

---

## Constraints honored (full list)

| Constraint from brief | How honored |
|---|---|
| No schema migration | All recommendations are TS content / workbook generator / red_corrections rows |
| No parser rewrite | Parser layer untouched. Job grammar lives in glossary + workbook only |
| No mass canonicalization | Zero new canonical rows proposed. 5 not-in-DB examples remain not-in-DB |
| No ontology hardening | The five-class multiplier audit's taxonomy framing is observational; Job intersection adds evidence, not doctrine |
| No automatic doctrine resolution | All 7 RP questions surface as Red-packet candidates, not as applied doctrine |
| No broad UI redesign | Recommended UI surfaces are glossary §1/§3/§7/§8 additions; no template restructuring |
| No hybrid notation collapse | Job grammar and modern chain reading remain peer surfaces |
| No automatic alias rewrites | "Paradox Double Legover" and "Pdx Blur" alias decisions surface as MR-1 / MR-2 curator questions, not applied |
| No fake formulas | Every formula cited in the audit is from Job's 1995 source OR from existing `freestyleResolvedFormulas.ts` |
| Workbook-first architecture | Workbook enhancements (WB-1 through WB-4) are the recommended primary integration surface |

---

## Doctrinal-alignment highlights

Three findings particularly worth flagging for the curator:

1. **Job's 1995 paper directly names "swing" as a future-formula primitive listing "Pendulum, Rake".** This is the original 1995 evidence for the swing-element doctrine that the 2026-05-19 curator-locked decision ratified for Sprint 5 (pendulum) + Sprint 6 (rake). Job pre-dated the curator's swing-element doctrine by 31 years. Documenting this in the multiplier-doctrine audit's §1.3 corrective addendum (AI-6) strengthens the doctrine's pedigree.

2. **Job's grammar has a Barfly notation that near-exactly matches the modern operational notation.** Job: `clip > same out dex > same out dex > op clip`. Modern: `CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]`. The only differences are the doubled `>>` (modern stepping marker), the terminal `[DEL]` (modern delimiter flag), and the terminal `[XBD]` (cross-body flag). 30 years of refinement preserved the core structure.

3. **The ATAM grammar §13 (modern operational notation) is structurally a descendant of Job's 1995 grammar.** The lineage was not previously documented in the dictionary; surfacing this in glossary §7 (the "Notation philosophies" sidebar) would honor the pedagogical roots of the modern notation.

---

## Files in this deliverable

```
exploration/job-notation-reconciliation-2026-05-19/
├── job_example_inventory.csv           — 15 Job examples; grammar form + operator tokens
├── job_ifpa_reconciliation.csv         — IFPA reconciliation for each example
├── job_glossary_integration_plan.md    — Pedagogical integration plan (glossary §3/§7/§8)
├── high_value_notation_gaps.md         — Ranked gap queue (quick wins, doctrine, Red packet)
├── job_accounting_intersections.md     — Executable-accounting intersection audit
└── final_summary.md                    — This file
```

---

## Single most important takeaway

Job's 1995 notation is structurally compatible with modern IFPA architecture and provides educational + pedigree value. It does NOT compete with modern doctrine; it predates and motivates much of it. Three actionable items are low-risk + high-pedagogical-value (operational notation authoring for flurry/ripwalk/eggbeater; notation-philosophies glossary sidebar; workbook Job-grammar-reading column). All other items are curator-paced or Red Wave 2 packet candidates.
