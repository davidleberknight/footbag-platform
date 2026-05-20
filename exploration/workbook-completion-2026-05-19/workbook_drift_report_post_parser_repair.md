# Workbook Drift Report — Post-Parser-Repair -- 2026-05-19 (session 2)

Intermediate drift artifact capturing the workbook state after the parser-repair + blurry-doctrine session, relative to the documented snapshot in `project_reconciliation_governance_gate.md` (memory; written against commit `8e6d78b`).

**Purpose.** Workbook reconciliation state is fast-moving: parser repair is still changing source-coverage rates, Wave 3 doctrine is unresolved, and several numbers will shift again before the workbook stabilizes. Memory is not yet updated — this markdown is the intermediate layer.

**Scope.** Code-only changes shipped this session:
- `e646eab` — parser-level fixes (fborg paren-split + embedded `*`; FM alt-key + paren-strip; PB slash-split + paren-qualifier-strip; hyphen-to-space in normalize_name).
- `02d2854` — moves-on-video.txt reconciliation deliverable (no code change).
- Staged (uncommitted) — blurry-doctrine application via MODIFIER_COMPOSITIONS + per-trick allowlist on derive_add_math.

---

## Governance Insight

**Recent parser normalization and alias-resolution improvements produced larger workbook-quality gains than additional source ingestion would have.**

- **16 hidden agreements surfaced** (rows that always agreed with external sources but couldn't be matched due to name-parsing artifacts).
- **16 false `missing_external_formula` rows removed** (the same 16, viewed from the other side of the ledger).
- **2 hidden disagreements surfaced honestly** (`sailing`, `shooting`) — these were silently invisible before; now they're queueable for Red Wave 3 Q5.
- **fborg coverage** more than doubled (15% → 32%) without ingesting a new source.
- **FM coverage** rose 49% → 58% from alt-name registration alone.
- **add_formula / computed_add** went 16% → 44%, exposing previously-uncomputable derivations.

**This validates the workbook-first governance approach before broader FM ingestion.** A new source layered onto a parser with paren-pair handling errors would have amplified the same name-mismatch class, not resolved it. The repair was prerequisite to honest coverage measurement, and it landed without requiring any DB schema change, modifier-table mutation, or canonical CSV write.

The implication for Phase 4 (FootbagMoves) sequencing: the FM parser was previously reported at 0% match rate, then 49% after the status-semantics fix on 2026-05-19. Today's 58% reflects the alt-name registration. Further FM-side gains likely require name-canonicalization at parse time (not new entries) — a continuation of the same repair pattern, not new ingestion work.

---

## Coverage drift (per-field)

| Field | Snapshot (8e6d78b) | Current | Δ | Driver |
|---|---:|---:|---:|---|
| `fborg_status` | 15% | **32%** | **+17pp** | Parser: paren-pair split + embedded `*` strip |
| `fm_status` | 49% | **58%** | **+9pp** | Parser: alt-name as key + paren-qualifier strip |
| `pb_status` | 45% | **47%** | +2pp | Parser: slash-split + paren-qualifier strip |
| `add_formula_status` | 16% | **44%** | **+28pp** | Decomposition formula display + resolved-formula loader |
| `computed_add_status` | 16% | **44%** | **+28pp** | Same |
| `compact_status` | 65% | **70%** | +5pp | derive_chain_reading fallback chain |
| `full_status` | 21% | 24% | +3pp | — |
| `name_status` | 84% | 84% | — | Unchanged |
| `family_status` | 79% | 79% | — | Unchanged |
| `official_add_status` | 80% | 80% | — | Unchanged |
| `aliases_status` | 43% | 43% | — | Unchanged |
| `job_status` | 0% | 0% | — | Unchanged (universally needs_curator) |

---

## Status-distribution drift

| Status | Snapshot | Current | Δ | Notes |
|---|---:|---:|---:|---|
| `agreement` | 103 | **119** | **+16** | 12 parser-surfaced + 4 blurry-doctrine |
| `missing_external_formula` | 46 | **30** | **−16** | Mirror of agreement gain |
| `derived_add_mismatch` | 6 | **4** | **−2** | Net: −4 blurry-doctrine resolved, +2 parser-surfaced (barraging-osis, witchdoctor) |
| `add_disagreement` | 3 | **5** | **+2** | New: `sailing`, `shooting` |
| `add_disagreement_doctrine_locked` | 2 | 2 | 0 | Unchanged (atom-smasher, rake) |
| `alias_of_canonical` | 8 | 8 | 0 | Unchanged |
| `derivable_structural_form` | 19 | 19 | 0 | Unchanged |
| `wave2_blocked` | 4 | 4 | 0 | Unchanged (bullwhip, double-down, terrage, datw) |
| `curator_hold` | 6 | 6 | 0 | Unchanged (jani-walker, guay, reaper, refraction, blistering, nuclear) |

---

## Key new findings

### 1. `sailing` add_disagreement (IFPA=2 vs fborg=3, fm=3)

Newly visible after the fborg parser fix. **Both external sources agree on 3 ADD; IFPA stands alone at 2.** This is a stronger signal than the existing open ADD disagreements because there's two-source corroboration on the external side.

Sailing's chain reading per NAME_ALIASES: `["Sailing", "Pixie Illusion"]`. If structurally `sailing = pixie + illusion`, naive math: pixie(+1) + illusion(2) = 3 ADD — agreeing with external. IFPA's 2 ADD reading may reflect a Sprint-era simplification that doesn't survive scrutiny.

**Recommendation:** add to Red Wave 3 Q5 alongside fury / omelette / surging. Higher confidence than surging (which had only FM corroboration); arguably the strongest of the queue.

### 2. `shooting` add_disagreement (IFPA=3 vs fborg=4)

Newly visible after parser fix. Single-source divergence (fborg only); lower confidence than sailing. Shooting is in NAME_ALIASES as `["Shooting", "Stepping Paradox Illusion"]` — if that decomposition is correct, naive math would be stepping(+1) + paradox(+1) + illusion(2) = 4 ADD, matching fborg.

**Recommendation:** flag for curator review; may indicate that `shooting` belongs in the same composite-modifier class as `blurry` (i.e., MODIFIER_COMPOSITIONS candidate). Do not add to MODIFIER_COMPOSITIONS without explicit Red confirmation per the project's restraint discipline.

### 3. `fury` consensus shift toward IFPA

Previously the workbook showed `fury: IFPA=5 vs FM=6` as a 1-row external-vs-IFPA disagreement. After the parser fix, fborg=5 is now visible — agreeing with IFPA. **The new framing is `IFPA=5, fborg=5, FM=6` — two-source consensus for IFPA against FM's outlier reading.**

**Strategic significance.** This materially strengthens IFPA's position in the Wave 3 Q5 packet. The Q5 framing in `RED_WAVE3_PACKET.md` currently reads:

> Q5. Open ADD disagreement triage (omelette IFPA=3 vs FM=4; fury IFPA=5 vs FM=6; surging IFPA=2 vs FM=5).

Should be re-framed as:

> Q5. Open ADD disagreement triage (omelette IFPA=3 vs FM=4; **fury IFPA=5 / fborg=5 vs FM=6**; **surging IFPA=2 vs fborg=5, FM=5**; **sailing IFPA=2 vs fborg=3, FM=3**; **shooting IFPA=3 vs fborg=4**).

— the cross-source evidence on fury and surging changes the question Red is being asked.

### 4. `witchdoctor` — potentially important doctrine anomaly

| Slug | base | modifiers | base_add | derive sum | official | direction |
|---|---|---|---:|---:|---:|---|
| `witchdoctor` | mirage | atomic + symposium | 2 | 5 | 4 | computed > official |

**Reverse-direction mismatch.** Every other current `derived_add_mismatch` row has `computed < official` (the composite-modifier shorthand pattern). Witchdoctor is the opposite: computed=5 exceeds official=4 by 1.

Possible causes (not adjudicated):
- atomic on a rotational base (mirage) uses `add_bonus_rotational = +2`, yielding 2 + 2 + 1 = 5. If atomic is intended as +1 on this compound (overriding the rotational rule), official=4 makes sense.
- The modifier_link list may be wrong — maybe witchdoctor is `atomic + symposium` only in folk reading but structurally `atomic` alone with a different base.
- Witchdoctor may be a doctrine outlier — atomic+symposium does NOT compose additively here.

**Importance.** This is the first row in the workbook that has computed > official. If it indicates a broader pattern (modifier-table rotational bonus over-counting on multi-modifier stacks), it could affect other rows currently in `agreement`. Worth a focused investigation before further composite-modifier work.

**Recommendation:** add to Red Wave 3 as a separate question (Q8 candidate); do NOT bundle with sumo (Q7) because the doctrine class is different.

### 5. `barraging-osis` joining the composite-modifier mismatch class

Newly visible (FM ADD=5 was hidden by parser before). The pattern matches blurry exactly:
- DB: base=osis (3 ADD) + modifier=barraging (+1) = 4 computed
- Official: 5
- FM: 5 (corroborates official)

If `barraging = high-stepping = stepping + ducking` (or similar composite per [[reference_legacy_move_sets]] — Chris Holden's compilation has "Barraging = High Stepping"), then the same composite-modifier doctrine applies. But Red has not explicitly ruled on barraging's atomic decomposition.

**Recommendation:** include in the same Red consultation as nemesis (furious composition); both are HIGH-confidence-but-Red-implicit cases parallel to the blurry pattern. Do not apply via MODIFIER_COMPOSITIONS until explicit ruling.

### 6. Blurry doctrine safely resolved 4 rows without destabilizing architecture

The staged (uncommitted) `MODIFIER_COMPOSITIONS` + per-trick allowlist change resolved exactly 4 rows (blur, blurry-whirl, blurry-torque, food-processor) from `derived_add_mismatch` to `agreement`, without:
- Mutating the DB modifier table (`blurry` remains +1 for chain-reading + glossary surfaces)
- Mutating any canonical CSV
- Affecting any other row's classification
- Surfacing any regression (blurriest, the would-be-collateral-damage row, stays at correct +1 via the per-trick allowlist)

The per-trick allowlist is load-bearing: a universal `blurry → stepping + paradox` rule would have moved `blurriest` from 5 to 6 (wrong). This validates the design pattern for future composite-modifier doctrine application (nemesis / barraging-osis / sumo when their decompositions land).

---

## Remaining `derived_add_mismatch` rows (4)

| Slug | direction | disposition |
|---|---|---|
| `nemesis` | computed < official by 1 | Red-implicit: furious = barraging + paradox = +2; awaits explicit Red confirmation |
| `sumo` | computed < official by 1 | Open Wave 3 Q7 candidate (nuclear composition unconfirmed) |
| `barraging-osis` | computed < official by 1 | New this session; same composite-modifier pattern; pending curator |
| `witchdoctor` | **computed > official by 1** | New this session; reverse-direction; requires separate doctrine investigation |

---

## Open questions raised by this drift

1. **Should `MODIFIER_COMPOSITIONS` be language-portable?** Currently Python-only (workbook script). The TS-side `MODIFIER_COMPOSITION_GLOSSES` is prose-only. If/when curator UI needs to render decomposed ADD derivations, a shared schema would matter. Not urgent.

2. **Witchdoctor's rotational-bonus question** — does it indicate a broader over-counting class in `agreement` rows? Suggested check: identify all multi-modifier rows with rotational bases, recompute with and without each modifier's rotational bonus, flag the differential. Not done this session.

3. **Should sailing-shooting be promoted into MODIFIER_COMPOSITIONS-style trick-specific overrides instead of Red Wave 3 Q5 items?** Sailing's `pixie + illusion` decomposition and shooting's `stepping + paradox + illusion` decomposition are both arithmetically clean against external sources. If Red later confirms these, they're MODIFIER_COMPOSITIONS rows, not Q5 disagreements. **Restraint:** do not move them without Red.

4. **Wave 3 packet refresh** — Q5 framing is now materially out of date (fury+surging both have new fborg evidence; sailing+shooting are new candidates). The packet was drafted before the parser repair; sending it as-is would ask Red about a 3-row queue when the actual queue is 5 rows with shifted evidence. Worth a revision pass before send.

---

## What this drift document does NOT propose

- Does not modify memory (per curator direction; memory stays anchored to 8e6d78b until reconciliation stabilizes).
- Does not modify the Red Wave 3 packet (revision is a separate deliverable).
- Does not commit the staged blurry-doctrine change (human owns the commit).
- Does not add new MODIFIER_COMPOSITIONS entries beyond blurry.
- Does not investigate witchdoctor's doctrine question (flagged only).
- Does not apply nemesis / sumo / barraging-osis decompositions (Red-required).

---

## Cross-references

- Workbook generator: `legacy_data/scripts/build_trick_reconciliation_workbook.py`
- Workbook output (gitignored): `legacy_data/reports/trick_reconciliation.csv` + `trick_reconciliation_summary.md`
- Sibling deliverables in this directory:
  - `next_step_recommendation.md` — sequencing plan (still valid; this session executed steps 3+4+6 of that plan)
  - `derived_add_mismatch_triage.md` — pre-doctrine-application document (still valid; supplemented by this drift report)
  - `footbag_org_mapping_report.md` — pre-parser-repair fborg coverage analysis (now superseded by current 32% rate)
  - `workbook_coverage_completeness_report.md` — pre-parser-repair coverage snapshot (now superseded)
- Moves-on-video audit: `exploration/moves-on-video-reconciliation-2026-05-19/`
- Red Wave 3 packet (pending revision): `exploration/red-wave-3-packet-2026-05-19/RED_WAVE3_PACKET.md`
- Governance memory (NOT updated this session): `project_reconciliation_governance_gate.md`

---

## When this drift document becomes stale / when to fold into memory

Fold this drift report's findings into `project_reconciliation_governance_gate.md` memory when ALL of the following hold:

1. Wave 3 Q5 packet has been revised and sent (or the decision to defer is captured)
2. Witchdoctor's doctrine question is either resolved or formally parked
3. Nemesis / barraging-osis composite-modifier doctrine has Red ruling (HIGH-confidence-implicit → explicit)
4. No further parser repair is expected (the repair pattern is exhausted)

Until then, treat this document as the authoritative current state and treat memory as historical snapshot.
