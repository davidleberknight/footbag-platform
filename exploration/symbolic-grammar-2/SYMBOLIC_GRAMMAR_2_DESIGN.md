# SYMBOLIC-GRAMMAR-2 — Design + Constraint Check

Educational symbolic-grammar integration layer that sits beside the canonical IFPA ontology — not replacing it. Builds atop SYMBOLIC-GRAMMAR-1 (observational master spreadsheet), GRAMMAR-GLOSSARY-1 (symbolic primitives + equivalence registry), and the PassBack dictionary intake.

**Status:** staging-only deliverable. **No DB writes, no canonical mutation, no parser change, no template change.** Observational + specification only.

**Date:** 2026-05-12

---

## Four-layer separation (forever-rule)

```
┌────────────────────────────────────────────────────────────────┐
│  Layer 1: Canonical IFPA ontology                              │
│           freestyle_tricks, freestyle_trick_modifiers,         │
│           freestyle_trick_modifier_links, freestyle_trick_aliases
│           ADD VALUES + TRICK_FAMILY = AUTHORITATIVE             │
├────────────────────────────────────────────────────────────────┤
│  Layer 2: Editorial prose                                      │
│           short_description / execution_summary /              │
│           learning_notes / prerequisite_notes (SCALE pilots)   │
│           docs/Freestyle_Footbag_Glossary.md v2 (James-owned)  │
├────────────────────────────────────────────────────────────────┤
│  Layer 3: Operational notation                                 │
│           freestyle_tricks.operational_notation column         │
│           OPERATIONAL_NOTATION_GRAMMAR.md F0 + O1a-d shipped   │
│           FM-derived; curator-reviewed                         │
├────────────────────────────────────────────────────────────────┤
│  Layer 4: Observational symbolic grammar                       │
│           SYMBOLIC_GRAMMAR_MASTER.csv (FM/PassBack corpus)     │
│           GRAMMAR_GLOSSARY_V3.md + symbolic registries         │
│           THIS PHASE: symbolic_*_groups + memberships + clusters
│           PURELY DESCRIPTIVE / EDUCATIONAL — never authoritative
└────────────────────────────────────────────────────────────────┘
```

Each layer can describe a trick differently. None overrides another. SCALE prose can cite symbolic groups for educational framing without changing the canonical IFPA reading.

---

## Deliverable inventory

All outputs under `exploration/symbolic-grammar-2/`:

### Task A — Symbolic group inventory (5 CSVs)

| File | Rows | Axis |
|---|--:|---|
| `symbolic_topology_groups.csv` | 18 | topology (shape + mechanics) |
| `symbolic_modifier_groups.csv` | 17 | modifier (set + body marker) |
| `symbolic_contact_groups.csv` | 6 | contact position (start + finish) |
| `symbolic_dex_groups.csv` | 10 | dex mechanic (hippy / leggy / spin / etc.) |
| `symbolic_execution_patterns.csv` | 11 | compositional / temporal / positional |
| **Total** | **62 groups** | **5 axes** |

Each row carries `symbolic_group_id`, `display_name`, `classification_axis`, `description`, `representative_examples`, `confidence_level`, `source_basis`, `review_status`.

### Task B — Trick-to-symbolic-group membership

`symbolic_group_membership.csv` — **323 memberships** across **142 non-modifier-stub IFPA active rows**. Each row: `trick_slug`, `symbolic_group_id`, `membership_reason`, `confidence`, `source`.

Avg ~2.3 group memberships per trick. Memberships derived from:
- Topology heuristic — base_trick → topology mapping (e.g. base=whirl → whirl-rotational-topology)
- IFPA modifier_links — direct table lookup (e.g. modifier=spinning → spinning-family)
- Contact heuristic — canonical-name pattern (e.g. -clip suffix → clipper-ending)
- Dex mechanic — base_trick → dex-mechanic mapping (e.g. base=mirage → hippy-in-dex)
- Execution pattern — slug/family rules (e.g. slug=reverse-X → directional-reverse-pair)

### Task C — Symbolic equivalence clusters

`symbolic_equivalence_clusters.csv` — **18 clusters**. Each row: `cluster_id`, `cluster_label`, `symbolic_normalization`, `member_trick_slugs`, `ifpa_decomposition_variance`, `add_range`, `anchor_topology_group`, `notes`, `review_status`.

Example clusters:
- `wing-on-butterfly` (12 members; ripwalk/dimwalk/sidewalk/dada-curve/matador/etc.; ADD 3-5)
- `hippy-in-on-mirage` (8 members; mirage/smear/blur/atom-smasher/sumo/etc.; ADD 2-5)
- `policy-3-2-trio` (nemesis/jani-walker/bullwhip; row-asserted §3.2)
- `walking-family-complete` (5/5 -walk pilots after SCALE-11)

### Task D — Glossary cross-reference graph

`glossary_crosslinks.csv` — **68 crosslinks**. Each row: `crosslink_id`, `term_a`, `term_b`, `relationship`, `cluster`, `source`, `notes`, `educational_value`.

Relationship types: `equivalence`, `variant`, `composition`, `contrast`, `cluster`.

Example crosslinks:
- `paradox ↔ xdex` (contrast; same hip-pivot pattern, different base context)
- `ducking ↔ diving ↔ weaving ↔ zulu` (cluster; 4-way head-motion family)
- `clipper ↔ xbd` (equivalence; clipper IS xbd inside-stall)
- `spinning ↔ gyro ↔ inspin` (variant; rotational-degree family)

### Task E — Symbolic navigation prototypes (5 spec MDs)

Subdirectory `symbolic_navigation_prototypes/`:
1. `01_related_topology_tricks.md` — browse tricks sharing a topology group (embedded widget on trick page)
2. `02_all_spinning_tricks.md` — `/freestyle/modifier/:slug` modifier-family landing page
3. `03_modifier_ladder.md` — ADD-tiered ladder view per modifier
4. `04_mechanical_progression.md` — `/freestyle/archetype/:id` archetype walkthrough
5. `05_symbolic_decomposition.md` — extended decomposition section on trick-detail (4-layer view)

Each prototype: UX sketch + data sources + URL pattern + filter behavior + effort estimate + constraint check. **No template changes performed.**

### Task F — IFPA family × symbolic-topology cross-cut analysis

`symbolic_vs_ifpa_family_analysis.csv` — **59 IFPA families analyzed**. Each row: family + size + pilot count + topology coverage + coherence score + cross-cutting topologies + diagnostic notes.

### Task G — Movement archetype registry

`movement_archetype_registry.csv` — **11 archetypes**. Each row: `archetype_id`, `archetype_label`, `uptime_pattern`, `midtime_pattern`, `downtime_pattern`, `anchor_topology_group`, `anchor_modifier_groups`, `member_examples`, `min_adds`, `max_adds`, `educational_value`, `notes`.

### Generator + analysis docs

- `legacy_data/scripts/build_symbolic_grammar_2.py` — read-only script that emits Tasks A/B/C/F/G. ~700 lines.
- `SYMBOLIC_GRAMMAR_2_ANALYSIS.md` — deliverable I summary (group inventory + topology clusters + cross-family bridges + future features + next-phase recommendation).

---

## Constraint check (per task brief §H)

| Hard rule | Status |
|---|---|
| Do NOT modify canonical ADDs | ✓ (no DB writes; ADDs read-only) |
| Do NOT mutate freestyle_tricks | ✓ (no writes) |
| Do NOT insert aliases automatically | ✓ (no alias insertions) |
| Do NOT rewrite canonical trick families | ✓ (trick_family column untouched; symbolic groups are SEPARATE registry) |
| Do NOT change parser logic | ✓ (parser unmodified; observational layer is downstream of parser output) |
| Do NOT auto-promote symbolic groups into ontology | ✓ (all outputs are CSVs; no migration to DB schema; review_status='observational' on every group row) |
| Do NOT merge symbolic groups with canonical families | ✓ (Task F's analysis EXPLICITLY separates ifpa_trick_family from symbolic topology; the analysis surfaces correspondence but does not collapse) |

---

## Author-decisions log (for reviewer transparency)

Decisions made during build that the user can override if needed:

1. **62-group ceiling for Task A.** Could go higher with finer granularity (e.g. separate spin-arc-angle groups). Held back to keep the registry navigable. Adding more groups is a data-only change.
2. **323 memberships derived from heuristic rules.** Some memberships are high-confidence (modifier-link-based: 98 of 323 ≈ 30%); others are medium-confidence (canonical-name heuristic). Each row carries a `confidence` column for reviewer filtering.
3. **18 equivalence clusters hand-curated.** Generated programmatically would require more data; hand-curation is appropriate for observational pattern surfacing.
4. **68 glossary crosslinks hand-curated** from PassBack glossary + UX1 + memory. Comprehensive coverage of the observational layer but NOT exhaustive — a future expansion could add 50+ more lower-priority terms.
5. **5 navigation prototypes are specs, not implementations.** Per task brief §E: "Specification + staging only."
6. **No DB schema migration proposed.** This phase deliberately stops at staging CSVs. A future SG-3 phase could propose a `symbolic_groups` + `symbolic_group_memberships` table pair, but that decision requires curator sign-off + Dave-coordination per `feedback_root_claudemd_dave_owned.md`.

---

## Cross-references

- `exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv` — 679-row observational corpus (input)
- `exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_ANALYSIS.md` — SG-1 analysis with §10 placeholder (this phase fulfills part of it)
- `exploration/freestyle-notation-grammar/SYMBOLIC_FAMILY_REGISTRY.csv` — GRAMMAR-GLOSSARY-1 40-family registry (input)
- `exploration/freestyle-notation-grammar/SYMBOLIC_DECOMPOSITION_REGISTRY.csv` — GRAMMAR-GLOSSARY-1 equivalence-cluster precursor (input; extended here)
- `exploration/freestyle-notation-grammar/CORE_TRICK_SYMBOLIC_TABLE.csv` — 12-row symbolic anchor table (input)
- `exploration/freestyle-notation-grammar/GRAMMAR_GLOSSARY_V3.md` — observational glossary v3 (input)
- `exploration/passback-intake/passback_glossary_staging.csv` — 180-term PassBack glossary (input; crosslink source)
- `exploration/freestyle-notation-grammar/UX1_GLOSSARY_TOKEN_MATRIX.csv` — 83-row token inventory (input)
- `legacy_data/IMPLEMENTATION_PLAN.md` — SYMBOLIC-GRAMMAR-2 deferred entry (now partially fulfilled; will note completion + scope for SG-3)
- `feedback_phased_scope_control.md` — phased workflow rule (followed: design doc first, then build, then analysis)
- `feedback_paused_crosstrack_no_writes.md` — no writes to contested surface (honored)
- `.claude/rules/db-write-safety.md` — read-only diagnostic; never executed beyond staging (honored)
