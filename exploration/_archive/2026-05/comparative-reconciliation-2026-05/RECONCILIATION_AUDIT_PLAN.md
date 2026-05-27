# Pre-Red Comparative Reconciliation — Audit Plan (2026-05-16)

## Framing — what's new vs what exists

This is NOT a fresh audit. Substantial prior comparative work already exists in the repository and will be **re-triaged through the post-Slice-N ontology lens**, not redone:

| Prior artifact | What it already has |
|---|---|
| `exploration/footbagmoves-federation/FM_MATH_DIVERGENCES.csv` | 22 rows of FM↔IFPA ADD divergences with governing-rule + disposition fields |
| `exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv` | Cross-source symbolic-grammar master per Wave-1+W2c work |
| `exploration/footbagmoves-federation/WAVE2_INSERTION_MATRIX.csv` | FM Wave-2 candidate inserts (curator-deferred) |
| `exploration/passback-intake/passback_reports/new_candidates.csv` | 187 PB rows with no IFPA match — Phase 2 input |
| `exploration/passback-intake/passback_reports/matched_existing.csv` | 95 PB rows that match an IFPA row by name |
| `exploration/passback-fbm-symbolic-analysis/EQUIVALENCE_CHAIN_CANDIDATES.csv` | PB+FM cross-source equivalence-chain candidates |
| `exploration/passback-fbm-symbolic-analysis/ONTOLOGY_CONFLICTS.md` | Cross-source ontology disagreements catalog |
| `exploration/passback-fbm-symbolic-analysis/COMPRESSION_PATTERN_TAXONOMY.md` | Symbolic-compression pattern types |
| `exploration/add-conflict-audit/ADD_CONFLICT_MATRIX.csv` | Inter-source ADD divergence matrix |
| `exploration/red-consolidation/RED_WAVE2_PACKET.md` | Grammar-level questions sent to Red 2026-05-15 |

The **least-mined** external source is footbag.org/newmoves/list — per memory `reference_fborg_newmoves_list`, a future `FBORG-AUDIT-1` lane is anticipated but not yet executed. Treating FBORG as the high-noise / curator-guided source for this phase.

What is **genuinely new** in the current directive:

1. PHASE 5 — branch-family candidate discovery through the lens of Slice M's root/branch family ontology (torque + blender + drifter became branch families with dual membership). Prior work was pre-Slice-M and did not classify by branch-family productivity.
2. PHASE 6 — set-system embodied-movement analogy notes (pixie ↔ ATW-like, fairy ↔ orbit-like). Not previously documented.
3. Re-triage of prior artifacts through the **6-modifier Movement System axis pilot** + the **unresolved-compound allow-list** + the **canonical-trick publication contract**.
4. A unified candidate-queue convention across phases (Slice O–S deliverables share CSV schema where possible).

## 1. Highest-value audit targets (ranked)

| Rank | Phase | Why this ranks high |
|---|---|---|
| 1 | PHASE 5 — branch-family candidates | Within-canonical signal (DB queries only); directly extends Slice M dual-membership; near-zero external noise; clear curator-actionable output |
| 2 | PHASE 3 — symbolic equivalence | EQUIVALENCE_CHAIN_CANDIDATES.csv is a head-start; extends Slice N's 4-chain addition; alignment vs divergence is largely binary |
| 3 | PHASE 4 — ADD divergence | ADD_CONFLICT_MATRIX.csv + FM_MATH_DIVERGENCES.csv already classified; need post-Slice-M re-categorization only |
| 4 | PHASE 2 — missing-move triage | 187-row PB queue already exists; pure curator-content classification work |
| 5 | PHASE 1 — comprehensive reconciliation | Best executed AFTER 1-4 because phases 1-4 establish the classification taxonomy needed |
| 6 | PHASE 6 — embodied analogy notes | Lowest priority; observational doc only; no curator-actionable output |

## 2. Recommended sequencing — 5 research slices

Five research slices, executed in order. Each produces a **categorized CSV queue + a markdown summary**. Zero code changes to the canonical dictionary. The curator triages the outputs at their pace.

| Slice | Phase | Title | Primary deliverable |
|---|---|---|---|
| O | 5 | Branch-Family Candidate Discovery | `branch_family_candidates.csv` |
| P | 3 | Symbolic-Equivalence Cross-Source Audit | `chain_external_alignment.csv` |
| Q | 4 | ADD-Divergence Reclassification | `add_divergence_reclassified.csv` |
| R | 2 | Missing-Move Triage Pass | `missing_move_triage.csv` |
| S | 6 | Set-System Embodied-Analogy Notes | `embodied_analogy_notes.md` (no CSV) |

Slice 1 (PHASE 1 comprehensive) is deliberately omitted. After O–S land, the comprehensive picture emerges as the union of their outputs.

## 3. Low-noise / high-signal domains

- **Internal DB queries**: descendant counts per row, modifier-link frequency, families with anchor missing, rows with N≥2 descendants but no own family — zero ambiguity, all live data
- **Red-locked equivalences cross-referenced to FM/PB shorthand**: torque=miraging osis is Red pt11-locked; FM/PB alignment is binary
- **ADD divergences with curator-locked governing rule** (SS=+0, blurry=stepping paradox, far/reverse=+0, Atom Smasher carries X-dex per Red 2026-05-15): unambiguous category assignment
- **Compounds with operational_notation in both our DB and FM**: direct structural comparison
- **Compressed-vs-expanded reading pairs already in Slice N+chain registry**: ground truth exists for verification

## 4. High-noise domains (defer or scope carefully)

- **Folk-derived names without op-notation**: structural classification inherently uncertain — must stay on the unresolved-compound surface, never auto-classified
- **Compressed-set vocab relationships** (pixie ↔ atomic ↔ fairy ↔ surging): Red Wave 2 pending; do not lock cross-source mappings while operator-vs-trick boundary is open
- **Embodied-movement analogy claims** (PHASE 6): inherently descriptive, not falsifiable; observational only, never canonical
- **FBORG corpus**: least-formatted source; per-row curator triage required; do not auto-import in this phase
- **PB technical-name field**: free-form curator prose, not parser-validated; treat as suggestion not authority

## 5. Expected ontology stress points

Anticipated areas where audit findings will be ambiguous and should be flagged rather than resolved:

1. **Operator-vs-trick boundary** — Fairy specifically; Red Wave 2 packet sent. External sources may classify differently than IFPA.
2. **Compressed-set vocab relationships** — pixie/atomic/fairy/surging as parallel set primitives is not yet fully formalized.
3. **Hidden X-dex preservation** — Red 2026-05-15 ruling on Atom Smasher carrying X-dex from a toe; cross-source readings may not encode this.
4. **Branch-family vs movement-neighborhood threshold** — when does a productive cluster become a branch family? Slice M established a 4-anchor pattern; more candidates need a principle.
5. **Direction-variant pairs** — drifter/reverse-drifter, whirl/rev-whirl are canonical pairs at IFPA; FM/PB may not name the variant.
6. **Stepping/blurry compression** — pt11-locked but multiple external sources still use both expanded and compressed forms inconsistently.
7. **Multi-dex tricks** — rows like atom-smasher carry implicit X-dex per Red; external readings often elide this.

## 6. Categories for findings (the 8-category taxonomy)

Applied uniformly across phases 2-5. Extends the user's PHASE 2 list:

| Category | Definition | Action |
|---|---|---|
| `duplicate-synonym` | Different name, identical structure (e.g., FM "Hurl" = our "Nuclear ss Whirl") | Curator decision: alias add or omit |
| `unresolved-decomposition` | Structure unclear; no canonical reading authored | Defer; mark unresolved if not already |
| `folk-derived-unstable` | Folk name; no op-notation; mechanical decomposition uncertain | Add to `UNRESOLVED_COMPOUNDS` if missing |
| `hidden-branch-family` | External source has productive descendants of an IFPA-canonical row | Slice O candidate output |
| `unsupported-symbolic-compression` | External uses a shorthand we don't recognize | Slice P candidate output |
| `parser-limitation` | Row exists; op-notation parser cannot tokenize | Already tracked in parser; flag for parser team |
| `intentional-omission` | Curator already decided to exclude | Document in audit; no action |
| `canonical-gap` | Legitimate gap; the row should exist in IFPA canonical | Curator-confirmed addition queue |

## 7. Candidate queues (CSV schemas)

Each Slice produces a CSV with curator-triage columns. Common columns shared across queues:

| Column | Type | Notes |
|---|---|---|
| `slug` | string | Our canonical slug if matched, else proposed slug |
| `source` | enum | `fbm` / `passback` / `fborg` / `internal` |
| `external_name` | string | Source's canonical name (if external row) |
| `category` | enum | One of the 8 categories above |
| `confidence` | enum | `red-locked` / `curator-prose-confirmed` / `pattern-derived` / `speculative` |
| `pending_red` | bool | True if Red Wave 2 ruling is required before action |
| `curator_action` | enum | `accept` / `reject` / `defer` / (blank = pending review) |
| `notes` | string | One-line curator comment |

Slice-specific columns added per queue.

## 8. Areas that should remain unresolved pending Red

Do NOT attempt resolution in this phase. The Red Wave 2 packet (sent 2026-05-15) has these open:

1. Operator-vs-trick boundary (Fairy specifically)
2. Compression-intent doctrine (when does a compound become a "trick" vs an alternate reading)
3. Hidden X-dex preservation rules across compositions
4. Folk-stabilization adjudication threshold
5. Blurry transitivity (can `blurry` apply to compounds, or only base tricks?)
6. Barraging operator class (modifier vs operator vs branch-family-generator)

Slice outputs MUST mark `pending_red=true` for any candidate whose triage depends on any of these.

## 9. Risks of premature hardening

| Risk | Mitigation |
|---|---|
| Auto-importing FM rows creates false alignment when FM is internally inconsistent (FM_MATH_DIVERGENCES shows this on Hurl/Barfry) | All slices produce queues, never automatic INSERTs |
| Locking new branch families before Red Wave 2 settles operator-vs-trick boundary may collapse the wrong axes | Slice O marks all candidates `pending_red=true` until Red settles operator boundary; curator decides post-ruling |
| Adding new branch families without invariants risks the Clipper-Stall retirement pattern (Slice M had to retire one such family) | Each candidate carries an invariant draft or explicit `null` flag; curator approves before promotion |
| Importing PB technical names as canonical without parser validation creates a notation-debt pile | Slice P explicitly separates educational-shorthand from parser-validated forms |
| Promoting embodied analogies (pixie ↔ ATW-like) to nomenclature collapses the four-layer ontology rule | Slice S deliverable is a markdown observational doc, never a content module |
| Re-triaging existing artifacts may produce overlapping or contradictory categorizations | Single canonical taxonomy (§6) applied uniformly; cross-slice diff checked in Slice 1 (deferred PHASE 1) |
| Mining FBORG without curator pacing creates a 100+-row review queue all at once | FBORG out of scope for Slice O–R; future FBORG-AUDIT-1 lane handles it independently |

## 10. Suggested research slices — Slice O–S detail

### Slice O — Branch-Family Candidate Discovery (PHASE 5)

**Inputs**: live DB (freestyle_tricks, freestyle_trick_modifier_links), `freestyleFamilyOverrides.ts`, `FAMILY_INVARIANTS`.

**Method**: SQL query for rows where the row itself has N≥2 descendants whose `base_trick` or chain reading references this row, AND the row sits in a non-self family (i.e., is structurally a candidate branch anchor). Cross-reference FM `SYMBOLIC_GRAMMAR_MASTER.csv` for productive cluster signals.

**Output**: `branch_family_candidates.csv`:
- slug, current_family, descendant_count, descendant_slugs, has_anchor_invariant_draft, pending_red, curator_action
- Candidates from the user's prompt to verify: barfly, blur, ripwalk, phoenix, mobius, ripstein, blurry-torque, nemesis.

**Restraint**: queue only. No DB write. No new FAMILY_DUAL_MEMBERSHIPS entries.

### Slice P — Symbolic-Equivalence Cross-Source Audit (PHASE 3)

**Inputs**: `freestyleSymbolicEquivalences.ts` (64 chains post-Slice-N), `EQUIVALENCE_CHAIN_CANDIDATES.csv`, `SYMBOLIC_GRAMMAR_MASTER.csv`, PB `passback_trick_sources.csv`.

**Method**: For each chain in our registry, find the matching FM / PB row by slug or alias. Compare readings. Classify alignment as: `identical` / `equivalent-shorthand` / `divergent` / `external-only` / `our-only`.

**Output**: `chain_external_alignment.csv`:
- slug, ifpa_readings, fm_form, passback_form, alignment, divergence_type, pending_red, candidate_new_chain_entry, notes
- Also output: rows where FM/PB suggest a chain entry we lack (Slice N+1 input queue).

**Restraint**: queue only. No new chain entries.

### Slice Q — ADD-Divergence Reclassification (PHASE 4)

**Inputs**: `ADD_CONFLICT_MATRIX.csv`, `FM_MATH_DIVERGENCES.csv` (22 rows), post-Slice-M ontology.

**Method**: Re-classify each divergence row through the post-Slice-M lens. Distinguish:
- `governing-rule-resolved` (already settled per Red 2026-05-15 or earlier)
- `branch-family-implicit` (divergence reveals an unrecognized branch-family member)
- `compressed-vs-expanded-reading` (same trick, different stopping depth on the chain)
- `hidden-dex-discrepancy` (X-dex preservation issue)
- `unresolved-pending-red` (Wave 2 dependency)
- `historical-drift` (external source has stabilized a deprecated form)
- `folk-stabilization` (community-named row with no canonical reading)

**Output**: `add_divergence_reclassified.csv` — extends the existing 22-row CSV with `slice_q_category` + `slice_q_action` columns. Side-by-side counts per category.

**Restraint**: re-categorize only; no ADD changes to canonical rows.

### Slice R — Missing-Move Triage Pass (PHASE 2)

**Inputs**: `exploration/passback-intake/passback_reports/new_candidates.csv` (187 rows), `exploration/footbagmoves-federation/WAVE2_INSERTION_MATRIX.csv`.

**Method**: For each external-only row, assign one of the 8 categories (§6). Where category is `canonical-gap`, draft a curator-actionable proposal: slug + canonical-name + adds + base_trick + trick_family + proposed-chain (if any). Where category is `folk-derived-unstable`, propose addition to `UNRESOLVED_COMPOUNDS`.

**Output**: `missing_move_triage.csv` — 187 PB rows + WAVE2 candidates with category + proposed action.

**Restraint**: queue only. No additions to `freestyle_tricks`. No additions to `UNRESOLVED_COMPOUNDS`.

### Slice S — Set-System Embodied-Analogy Notes (PHASE 6)

**Inputs**: curator observation; existing `SET-uptime` axis members; movement-language conceptual layer.

**Method**: For each set primitive (pixie, atomic, fairy, surging, stepping), draft a single observational paragraph describing the embodied movement analogy (e.g., pixie ↔ ATW-like compression of the leg trajectory). Explicitly mark each as `OBSERVATIONAL — not canonical nomenclature`.

**Output**: `embodied_analogy_notes.md` — single markdown file. Never imported into a content module without explicit curator approval. Never rendered on any browse surface.

**Restraint**: markdown only. No code. No content module. No rendering.

## 11. What this phase does NOT do

- ❌ Blind synchronization with FM / PB / FBORG
- ❌ Doctrine hardening
- ❌ Auto-import of external moves
- ❌ Auto-classification of unresolved compounds
- ❌ Architecture changes
- ❌ Glossary system rewrites
- ❌ New schema / SQL migrations
- ❌ Code changes to the canonical dictionary surface
- ❌ Resolution of Red Wave 2 pending items
- ❌ Promotion of embodied analogies to nomenclature
- ❌ FBORG corpus mining (deferred to a separate `FBORG-AUDIT-1` lane)

## 12. Preservation contract

All Slice A–N gains remain intact. This phase produces evidence and queues only; no commit touches:
- `src/services/` (dictionary or glossary services)
- `src/content/` (chain registry, family overrides, unresolved compounds, movement systems)
- `src/views/` (any browse surface)
- `database/schema.sql`
- existing test files (except to add new comparative-analysis tests if a slice's deliverable script warrants them — and only at the slice's own boundary, never modifying behavior tests)

If any proposed Slice O–S change contradicts the above, the proposal is wrong — not the contract.

## 13. Out of scope (deferred)

- FBORG full corpus audit (`FBORG-AUDIT-1` lane)
- Comprehensive PHASE 1 reconciliation (post-O–R synthesis)
- Red Wave 2 ruling integration (waits on Red response)
- Parser-team work on operational-notation gaps surfaced by Slice P
- Trick-detail page lineage breadcrumb (separate detail-surface audit)

---

## End
