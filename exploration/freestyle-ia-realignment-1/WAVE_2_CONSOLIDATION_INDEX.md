# Wave-2 Consolidation Index — Freestyle Symbolic-Governance Ecosystem

Generated 2026-05-14. Maintainer-facing orientation document. No file moves, no deletions, no rewrites. Purely an information-architecture map of where authority lives across the freestyle symbolic-governance ecosystem.

## Preamble

After IA-REALIGNMENT 1–4 + CSR-1 (S1+S2+S3) + EXP-1 + CSR-2 (NR-1, NR-1B, NR-1C, VIS-TUNE-1, FBORG-AUDIT-1) + SYMBOLIC-COVERAGE-ROADMAP-1, the project has accumulated a substantial body of governance documents and code-level authorities. This index is the single entry point for a maintainer (or future contributor) opening cold and asking: **where does authority live, what's canonical, what's exploration, and what depends on what?**

---

## A. Authoritative document map

### A1 — Canonical docs (in `docs/`; consulted before any change)

Long-term design intent. Pure target patterns; no implementation-state language. Owned per `.claude/rules/doc-governance.md`.

| File | Owns | Modified in this session? |
|---|---|---|
| `docs/VIEW_CATALOG.md` | Public-page rendering contracts; required page-matrix entries; two-surface contract; compact symbolic-object visual system section-conventions | **Yes** — Batch 1 (landing entry), Batch 2 (Language structure), Batch 3 (glossary §3 surfaces), Batch 4 (visual-system note), CSR-1 (equivalence-reading sources), EXP-1 (two-surface contract) |
| `docs/SERVICE_CATALOG.md` | Service-layer ownership; required patterns; method rosters | **Yes** — Batch 1 (operator-board surface count 3→2; intermediate-operator count 9→10) |
| `docs/USER_STORIES.md` | Functional acceptance criteria | No |
| `docs/DESIGN_DECISIONS.md` | Long-term architectural commitments | No |
| `docs/DATA_MODEL.md` | Schema semantics | No |
| `docs/GOVERNANCE.md` | Security / privacy / historical-data policy | No |
| `docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md` | Six requirements gating canonical trick promotion | (predates this session; referenced repeatedly) |
| `docs/IMPLEMENTATION_PLAN.md` | Active-slice / deviation tracker (AI-facing) | No |
| `docs/PROJECT_SUMMARY_CONCISE.md` | Project orientation routing | No |

### A2 — Content-file authorities (in `src/content/` and `src/services/`)

These are TypeScript modules that act as **single sources of truth** for symbolic-system content. Modifying them is the canonical pattern for governance changes during ontology refinement (per `feedback_reversible_content_governance`).

| File | Owns | Current count |
|---|---|---:|
| `src/content/freestyleOperatorReference.ts` | NF-2A operator-reference entries (compositional operators with curator-confirmed semantics) | 10 entries (post-S1 Inspinning) |
| `src/content/freestyleSymbolicEquivalences.ts` | NF-2B chain registry (curator-authored compositional readings; stopping-depth-aware) | 37 entries (post-NR-1C) |
| `src/content/freestyleAliasGovernance.ts` | Alias allow-list (restraint-first browse-surface filter) | 5 entries (2 surface, 3 hidden) |
| `src/content/freestyleLandingContent.ts` | Landing-page Basic Components + Core Tricks + Demonstration Slots | 6 + 11 + 5 |
| `src/services/glossaryAnchors.ts` | `FOUNDATIONAL_TRICK_TERMS` (11) + `SET_MODIFIER_ANCHOR_TERMS` (2) + `MODIFIER_REFERENCE_TERMS` (6); lookup function `glossaryHrefForTerm` | 19 anchors total |

### A3 — Memory authorities (in `~/.claude/projects/-home-james-projects-footbag-platform/memory/`)

Load-bearing memory entries for the freestyle ecosystem. Updated per `.claude/rules/memory.md`.

| Memory file | Type | Role |
|---|---|---|
| `MEMORY.md` | index | Always loaded; entry pointers for every memory below |
| `project_symbolic_ux_rollout.md` | project | **Master state pointer** for the symbolic-UX track; current as of 2026-05-14; references this entire ecosystem |
| `project_canonical_trick_publication_contract.md` | project | Six-requirement promotion gate |
| `project_red_consultation_state.md` | project | Red consultation status (Wave-1 sent; Wave-2 deferred) + consolidate-before-send methodology |
| `project_freestyle_state.md` | project | Broader pilot-tier state (pt12 close + earlier waves) |
| `project_freestyle_federation.md` | project | FM federation track (SG-1/SG-2/GG-1) |
| `project_freestyle_core_atoms.md` | project | 12-atom curator-authoritative registry |
| `reference_fborg_newmoves_list.md` | reference | **NEW** — footbag.org/newmoves/list as structured audit source (FBORG-AUDIT-1 lane) |
| `reference_legacy_move_sets.md` | reference | Chris Holden compilation at /freestyle/sets (sibling corpus) |
| `feedback_frequency_not_authority.md` | feedback | Corpus recurrence is evidence not authority |
| `feedback_reversible_content_governance.md` | feedback | **NEW** — content modules over SQL during ontology refinement |
| `feedback_phased_scope_control.md` | feedback | Slice-by-slice cadence + approval-by-artifact-path |
| `feedback_modifier_public_visibility.md` | feedback | Modifier-reference dl render-disabled |
| `feedback_public_facing_prose.md` | feedback | Strip curator-internal language from rendered prose |
| `feedback_git_commit_boundary.md` | feedback | Stage-only; human owns commits |

---

## B. Superseded / historical record (NOT deprecated; preserved for institutional memory)

Nothing is flat-deprecated in this ecosystem. Several documents are **historical records** — they served a specific phase and are now reference-only. They remain because their reasoning is load-bearing for understanding current state.

| Doc | Phase served | Why preserved |
|---|---|---|
| `exploration/red-consolidation/RED_PACKET_DRAFT.md` | Wave-1 + Wave-2 packet drafting | Themes 2/6/7/8 are still active Wave-2 inputs; Themes 1/3/4/5 are SENT (Wave-1 packet) — frozen draft of sent questions |
| `exploration/red-consolidation/RED_NO_LONGER_NEEDED.md` | Wave-1 noise removal (~40%) | Historical record of which questions Red rulings already closed |
| `exploration/passback-fbm-symbolic-analysis/*` (12 deliverables) | Wave-1 evidence base + ADD-conflict audit input | Active reference; cited by FBORG-AUDIT-1 + NOTATION_RECONCILIATION_AUDIT |
| `exploration/add-conflict-audit/*` (7 deliverables) | Wave-1 Q4 evidence + ADD-math discrepancy surfacing | Active reference; cited by NOTATION_RECONCILIATION_AUDIT + Wave-2 Theme 10 |
| `exploration/safe-promotion-1/*` (queue + recommendations) | Pre-CSR safe-promotion governance | CSR work superseded most items; the queue itself remains as restraint-posture documentation |

**None of these should be deleted.** Their existence documents WHY current state looks the way it does. Future maintainers reading current code without the historical context would re-derive (worse) versions of the same decisions.

---

## C. Exploration-only documents (stay in `exploration/`)

The full `exploration/freestyle-ia-realignment-1/` cluster (10 documents after this index lands):

| Doc | Purpose | Status |
|---|---|---|
| `FREESTYLE_IA_REALIGNMENT_PLAN.md` | Parent IA plan for IA-REALIGNMENT batches 1-4; PART H-pre compact-symbolic-object rule | Shipped; contract continues to govern |
| `GLOSSARY_PEDAGOGY_REALIGNMENT_PLAN.md` | Batch 3 pedagogy plan | Shipped |
| `COMPACT_SYMBOLIC_OBJECT_VISUAL_REFINEMENT_PLAN.md` | Batch 4 typography plan | Shipped |
| `CANONICAL_SURFACE_REALIGNMENT_PLAN.md` | CSR-1 audit + S1-S7 sequence | S1+S2+S3 shipped; S4/S5/S6 deferred |
| `COMPACT_SYMBOLIC_BROWSE_PLAN.md` | Cross-surface consolidation + EXP-1 + EXP-2 | EXP-1 shipped; EXP-2 deferred |
| `NOTATION_RECONCILIATION_AUDIT.md` | Pre-NR-1 audit identifying canonical-surface gaps | NR-1 + NR-1B shipped; NR-2/NR-3/NR-4/NR-5 deferred |
| `SYMBOLIC_SURFACE_QA_REVIEW.md` | Post-NR-1 / NR-1B QA review | Findings shipped (VIS-TUNE-1) |
| `FBORG_AUDIT_1_REPORT.md` | Structured audit of footbag.org/newmoves/list corpus | NR-1C shipped; remainder is Wave-2 input |
| `SYMBOLIC_COVERAGE_ROADMAP.md` | Long-range planning + governance review | Forward-pointer; no implementation flows from it |
| `WAVE_2_CONSOLIDATION_INDEX.md` | (this document) | Entry-point index |

**Why exploration-only?** These documents include:
- Implementation-state language ("shipped 2026-05-14", "S1 shipped", "deferred")
- Slice-specific reasoning (Batch 1, NR-1, EXP-1 etc. naming)
- Decision-trail prose (maintainer dialogue, approval moments)

Per `doc-governance.md`, implementation-state language belongs only in `IMPLEMENTATION_PLAN.md` or exploration docs. None of these documents should graduate to `docs/` as-is.

---

## D. Graduation candidates (content that could eventually move to `docs/`)

The substance of certain exploration documents IS load-bearing target pattern. The current docs/ surface absorbs that substance correctly today via:

| Substance | Currently lives in | Graduation status |
|---|---|---|
| Compact symbolic-object rendering rule | `docs/VIEW_CATALOG.md §6 section-conventions` (one paragraph) + `exploration/.../FREESTYLE_IA_REALIGNMENT_PLAN.md PART H-pre` (full rule) | **Adequately graduated.** The VIEW_CATALOG paragraph carries the contract; the exploration doc carries the rationale. |
| Two-surface contract (canonical compact / expanded narrative) | `docs/VIEW_CATALOG.md §6 section-conventions` (EXP-1 paragraph) | **Adequately graduated.** |
| Equivalence-reading sources | `docs/VIEW_CATALOG.md §6` (chain registry + allow-list cited) | **Adequately graduated.** |
| Six-requirement publication contract | `docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md` (existed pre-session) | **Already graduated.** |
| Stopping-depth philosophy | `src/content/freestyleSymbolicEquivalences.ts` file-header (the load-bearing rules) + exploration plan docs (rationale) | **Adequately graduated.** File-header is the canonical location for content-module governance rules. |
| Chain-registry max-3 readings rule | Same file-header | **Adequately graduated.** |
| Restraint-first allow-list pattern | `src/content/freestyleAliasGovernance.ts` (the module IS the rule) + `feedback_reversible_content_governance` memory | **Adequately graduated.** |

**Verdict**: no further `docs/` graduation needed at this time. The substance lives where it's most useful: contracts in VIEW_CATALOG / SERVICE_CATALOG; governance rules in content-file headers; rationale in exploration; behavioral rules in memory feedback entries.

**Future graduation candidates** (NOT urgent):
1. If `freestyleSymbolicEquivalences.ts` grows past ~80 entries, consider a `docs/CHAIN_REGISTRY_CONTRACT.md` that documents the file-header rules in canonical form. Today the file-header is sufficient.
2. If the audit-source pattern expands beyond 2-3 reference memories, consider a `docs/AUDIT_SOURCE_CATALOG.md`. Today reference memories are sufficient.

---

## E. Red-packet dependency graph

Visualizes which exploration documents feed into which Red consultation packets.

```
Wave-1 packet (SENT 2026-05-14; awaiting reply)
├── Themes 1+3+4+5 (rotational bonus / Q4 batch / positional weights / atomic polysemy)
├── Source: exploration/red-consolidation/RED_WAVE1_PACKET.md (approved + frozen)
└── Evidence base:
    ├── exploration/passback-fbm-symbolic-analysis/* (12 deliverables)
    ├── exploration/add-conflict-audit/* (7 deliverables)
    └── RED_RESOLVED_CANON.md (50+ prior rulings)

Wave-2 packet (NOT YET DRAFTED; SYMBOLIC-COVERAGE-ROADMAP-1 G1 recommended next phase)
├── Theme 2 — Witchdoctor / Frigidosis / Scrambled Eggbeater
│   └── Source: exploration/red-consolidation/RED_PACKET_DRAFT.md
├── Theme 6 — Down-family canonicalization
│   └── Source: exploration/red-consolidation/RED_PACKET_DRAFT.md
├── Theme 7 — Double-quantifier default
│   └── Source: exploration/red-consolidation/RED_PACKET_DRAFT.md
├── Theme 8 — Equivalence-chain educational promotion
│   └── Source: exploration/red-consolidation/RED_PACKET_DRAFT.md
├── NEW Theme 9 — High-ADD compositional naming + new operators
│   └── Source: exploration/freestyle-ia-realignment-1/FBORG_AUDIT_1_REPORT.md
└── NEW Theme 10 — ADD-math discrepancies
    ├── Source: exploration/freestyle-ia-realignment-1/NOTATION_RECONCILIATION_AUDIT.md
    └── Cross-reference: exploration/freestyle-ia-realignment-1/FBORG_AUDIT_1_REPORT.md

Post-Wave-1 protocol (per project_red_consultation_state)
├── 1. Re-run legacy_data/tools/build_add_conflict_audit.py
├── 2. Update RED_RESOLVED_CANON.md with new rulings
├── 3. Append newly-locked entries to src/content/freestyleSymbolicEquivalences.ts
├── 4. Allow-list newly-canonical aliases in src/content/freestyleAliasGovernance.ts
└── 5. Compact cards surface new readings on next deploy

Post-Wave-2 protocol
├── Same five steps as Wave-1
├── Plus: if new operators promote, update src/content/freestyleOperatorReference.ts
└── Plus: if down-family resolves, the deferred CSR S4 (orbit insert) + Theme-6-dependent canonical promotions become unblocked
```

**Critical reading order before drafting Wave-2:**
1. `RED_RESOLVED_CANON.md` — what's already closed
2. `RED_QUESTION_STATUS_MATRIX.csv` — every historical question with status
3. `RED_PACKET_DRAFT.md` Themes 2/6/7/8 — pre-existing drafts
4. `FBORG_AUDIT_1_REPORT.md` PART G3 — Theme 9 inputs
5. `NOTATION_RECONCILIATION_AUDIT.md` — Theme 10 inputs
6. `SYMBOLIC_COVERAGE_ROADMAP.md` PART G1 — recommended packet shape

---

## F. Glossary / operator authority graph

Visualizes precedence among glossary-surface authorities. Top = highest authority; bottom = evidence corpora.

```
1. RED rulings (external)
   ├── RED_RESOLVED_CANON.md (~50 rulings)
   └── Wave-1 / Wave-2 pending questions (project_red_consultation_state)
        │
        ▼
2. NF-2A operator reference (src/content/freestyleOperatorReference.ts; 10 entries)
   ├── Each entry cites pt-number from Red rulings
   ├── curatorConfirmPending flag honest where readings are partial
   └── Read by glossary §3 + operator board partial
        │
        ▼
3. NF-2B chain registry (src/content/freestyleSymbolicEquivalences.ts; 37 entries)
   ├── Each entry cites pt-number from Red rulings
   ├── Stopping-depth rules in file-header
   ├── Max-3 readings per entry
   └── Read by dictionary cards + glossary §3 compression-flow + trick-detail Layer-2
        │
        ▼
4. Alias governance allow-list (src/content/freestyleAliasGovernance.ts; 5 entries)
   ├── Restraint-first default (hidden unless explicitly approved)
   ├── displayAs override (e.g., ATW uppercase)
   └── Read by dictionary cards
        │
        ▼
5. Foundational anchor terms (src/services/glossaryAnchors.ts)
   ├── FOUNDATIONAL_TRICK_TERMS (11 anchors for glossary §10)
   ├── SET_MODIFIER_ANCHOR_TERMS (2 anchors for pixie/fairy preservation)
   ├── MODIFIER_REFERENCE_TERMS (6 anchors for §3 modifier-reference dl)
   └── glossaryHrefForTerm() resolves trick names to glossary deep-links
        │
        ▼
6. Glossary template content (src/views/freestyle/glossary.hbs)
   ├── §3 Execution Mechanics (7 PassBack-adapted concepts)
   ├── §8 Symbolic Compression (renamed from Jobs Notation; thesis sentence)
   ├── §9 Operational Notation (semantic-vs-operational contrast table)
   └── §13 connective panels (positioning note; transitional)
        │
        ▼
7. PassBack source corpus (legacy_data/inputs/curated/tricks/passback-glossary.txt)
   ├── 613-line source of execution-mechanics definitions
   ├── Evidence for §3 Execution Mechanics entries
   └── NOT canon authority
        │
        ▼
8. FBORG corpus (footbag.org/newmoves/list via reference_fborg_newmoves_list)
   ├── 254-row evidence corpus (cached at legacy_data/reports/freestyle_dict_coverage_diff.csv)
   ├── FBORG-AUDIT-1 surfaced high-ADD canonical-coverage gap
   └── NOT canon authority; never bulk-import
        │
        ▼
9. FootbagMoves corpus (footbagmoves.com; partially cached)
   ├── ~569-trick target; sample-tier cached at legacy_data/inputs/curated/tricks/footbagmoves-sample.txt
   ├── FM-sample surfaced 43+ ADD-7+ entries
   └── NOT canon authority; never bulk-import
```

**Authority-precedence rule** (forever-rule):

> Anything at a lower layer can supersede or contradict an entry at a higher layer ONLY via a Red ruling that elevates it. Higher layers always win in cases of disagreement. Layer 7+ (evidence corpora) is read-only from the canonical-surface perspective.

---

## G. Symbolic-governance dependency graph

Six pillars of the symbolic-governance system. Each interlocks with the others; removing any one weakens the whole.

```
                    ┌──────────────────────────────────────┐
                    │  Symbolic-Governance Pillars (6)     │
                    └──────────────────────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
   ┌──────────▼──────────┐  ┌─────────▼──────────┐  ┌──────────▼──────────┐
   │  1. Publication     │  │  2. Restraint-     │  │  3. Two-surface     │
   │     Contract        │  │     first          │  │     contract        │
   │                     │  │     principle      │  │                     │
   │ Six-requirement     │  │                    │  │ Canonical compact / │
   │ gate for canonical  │  │ Corpus recurrence  │  │ expanded narrative  │
   │ promotion           │  │ is evidence not    │  │                     │
   │                     │  │ authority          │  │ Browse cards never  │
   │ docs/CANONICAL_     │  │                    │  │ carry prose         │
   │ TRICK_PUBLICATION_  │  │ Content modules    │  │                     │
   │ CONTRACT.md         │  │ over SQL during    │  │ docs/VIEW_CATALOG   │
   │                     │  │ ontology refining  │  │ §6 section-         │
   │                     │  │                    │  │ conventions         │
   │                     │  │ feedback_*         │  │                     │
   └─────────────────────┘  └────────────────────┘  └─────────────────────┘
              │                        │                        │
              └────────────────────────┼────────────────────────┘
                                       │
                                       ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │           4. Stopping-depth philosophy                               │
   │                                                                      │
   │           Curator-authored stopping points; no recursive             │
   │           auto-expansion. Max 3 readings per chain.                  │
   │                                                                      │
   │           src/content/freestyleSymbolicEquivalences.ts               │
   │           file-header rules                                          │
   └──────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
   ┌────────────────────────────────────┬─────────────────────────────────┐
   │  5. Red consultation methodology   │  6. Audit-source corpora        │
   │                                    │                                 │
   │  Consolidate-before-send           │  Evidence corpora, not canon    │
   │  Resolved-canon as source of truth │                                 │
   │  Wave-1 / Wave-2 packets           │  FBORG (newmoves/list)          │
   │  Pause-before-fresh-packets        │  Holden /freestyle/sets         │
   │                                    │  PassBack glossary              │
   │  project_red_consultation_state    │  FootbagMoves (cached sample)   │
   │  RED_RESOLVED_CANON.md             │                                 │
   │                                    │  reference_* memory entries     │
   └────────────────────────────────────┴─────────────────────────────────┘
```

**Forever-rule:** every governance change must pass through ALL SIX pillars. If a proposed change weakens any pillar (e.g., bulk import bypasses #2; mass-decomposition bypasses #4; auto-promote bypasses #1), it does not ship.

---

## H. Future doc-hygiene recommendations

### H1 — `exploration/freestyle-ia-realignment-1/` cluster density

10 documents currently (after this index). Maintainable for now. Watch thresholds:

- **At 15 docs**: consider sub-directory split by phase (`ia-realignment/`, `canonical-surface/`, `notation-audit/`, `roadmap/`, etc.)
- **At 20 docs**: split is overdue; the cluster becomes navigation noise without a directory hierarchy
- **Today (10 docs)**: this consolidation-index is the entry point; the directory is digestible

### H2 — Per-cluster index docs

Pattern observed: each major phase (IA realignment / CSR / Audit / Roadmap) produces a primary plan + secondary derivative documents. Each cluster benefits from one entry-point document. This consolidation-index fills that role for the entire ecosystem; future clusters could carry their own.

**Convention proposal** (not enforcement): when a cluster exceeds 3 documents, the most recent doc should ALSO be (or include a section that is) the cluster's index.

### H3 — Memory entry hygiene

22+ project / reference / feedback entries plus an index. Healthy density for a complex project. Watch:

- **Project memory entries are descriptive, not prescriptive** — keep them updated to current state when work changes the state materially (this session updated `project_symbolic_ux_rollout` for that reason)
- **Reference memory entries are pointers** — verify on update that the pointed-to resource still exists
- **Feedback memory entries are behavioral rules** — verify on update that the rule still applies; outdated rules should be deleted not patched

### H4 — Cross-reference link integrity

Many documents in this cluster cross-reference each other via plain filename references. As docs accumulate, broken cross-references become a maintenance burden.

**Convention proposal**: when adding a new exploration doc that references existing docs in the cluster, use the filename verbatim (no path). When moving docs (out of scope for THIS slice but eventually), preserve filenames.

### H5 — Implementation-state language hygiene (REINFORCEMENT)

Per `doc-governance.md`: implementation-state language belongs ONLY in `IMPLEMENTATION_PLAN.md` and exploration docs. Canonical docs (VIEW_CATALOG, SERVICE_CATALOG, etc.) describe TARGET patterns, not current state.

The session's doc-sync passes (Batch 1, Batch 2, Batch 3, Batch 4, EXP-1) consistently respected this rule. Watch: future doc-sync passes must continue to test edits against this rule.

### H6 — Wave-2 packet drafting workflow (PROPOSED)

When the maintainer is ready to draft Wave-2 (per `SYMBOLIC_COVERAGE_ROADMAP.md` G1):

1. Read this index first (single entry point for the ecosystem)
2. Then `RED_RESOLVED_CANON.md` end-to-end
3. Then `RED_QUESTION_STATUS_MATRIX.csv`
4. Then the 5 theme-source documents: `RED_PACKET_DRAFT.md` (Themes 2/6/7/8) + `FBORG_AUDIT_1_REPORT.md` PART G3 (Theme 9) + `NOTATION_RECONCILIATION_AUDIT.md` (Theme 10)
5. Then draft following the same shape as `RED_WAVE1_PACKET.md` (4-question template extended to ~15)
6. Final output: `exploration/red-consolidation/RED_WAVE2_PACKET.md` (maintainer-approved before sending)

This index supports that workflow as the canonical orientation surface.

---

## I. Summary

The freestyle symbolic-governance ecosystem is mature, well-organized, and bounded by clear governance rules. Six interlocking pillars (publication contract, restraint-first, two-surface contract, stopping-depth philosophy, Red consultation methodology, audit-source corpora) maintain the boundary between **canon** (Red-authoritative + curator-authored) and **evidence** (corpus-derived + maintained as audit material).

Authority lives in five layered surfaces:
1. Canonical docs (`docs/`) — target patterns
2. Content-file modules (`src/content/`) — single source of truth for symbolic content
3. Memory entries (`~/.claude/.../memory/`) — behavioral guidance + state pointers
4. Exploration plan documents (`exploration/`) — phase-specific rationale
5. Evidence corpora (`legacy_data/inputs/curated/tricks/`) — read-only audit material

The next major phase is **Wave-2 consolidated Red packet drafting** (per `SYMBOLIC_COVERAGE_ROADMAP.md` G1). This index is the entry point for that work and for any future contributor opening the ecosystem cold.

No file moves. No deletions. No rewrites. Future cleanup work can rely on this index as the orientation surface.
