# SYMBOLIC-UX-1 — Design Overview

Experimental UX validation of the SYMBOLIC-GRAMMAR-2 educational integration layer. **Spec + mockups only.** No production template changes, no DB writes, no schema migration, no canonical mutation. Goal: validate the layer publicly + educationally BEFORE freezing it into schema.

**Date:** 2026-05-12

---

## Frame

Builds atop:
- SYMBOLIC-GRAMMAR-1 (679-row observational master spreadsheet)
- GRAMMAR-GLOSSARY-1 (symbolic primitives + equivalence registry)
- SYMBOLIC-GRAMMAR-2 (62 symbolic groups + 11 movement archetypes + 5 nav-prototype specs)
- PassBack dictionary + glossary intake (180 educational terms)
- GLOSSARY-SYNTHESIS-1 (4-layer architecture v4)

**This phase relationship to SG-2 nav-prototypes:** SUX-1 extends the 5 SG-2 nav-prototype specs (`01_related_topology_tricks` / `02_all_spinning_tricks` / `03_modifier_ladder` / `04_mechanical_progression` / `05_symbolic_decomposition`) with:
- **Flagship example specifics** — matador / phoenix / ripwalk / spinning-whirl / paradox-mirage / montage / torque
- **3 new panel types** beyond the 5 already spec'd — modifier bridges / cross-family bridges / symbolic family browse
- **2 new navigation queries** beyond the modifier-page pattern — unusual-surface filter / uptime-dex+clipper-end pattern
- **Public-surface usefulness evaluation** — surface-by-surface assessment
- **Final implementation recommendation** — Path A (CSV staging longer) / Path B (DB schema support) / Path C (hybrid)

---

## Hard constraints (per task brief)

| Constraint | Enforced by |
|---|---|
| Zero DB writes | All output is markdown + ASCII mockups |
| Zero schema migration | No table proposals; only references to `freestyle_tricks` for sample data |
| Zero canonical family rewrites | `trick_family` column read-only |
| Zero parser changes | Parser unmodified |
| Zero ADD changes | Read-only on `freestyle_tricks.adds` |
| Zero alias insertion | No `freestyle_trick_aliases` writes |
| Symbolic layer remains observational/educational | Every mockup carries explicit Layer-3 attribution |
| Use staging CSVs only | Data sources: SG-2 + GS-1 + SCALE pilot prose |

---

## Deliverable inventory

```
exploration/symbolic-ux-1/
├── DESIGN_OVERVIEW.md                        (this file)
├── 01_PANEL_MOCKUPS.md                       (Task A — 8 panel types × flagship examples)
├── 02_NAVIGATION_MOCKUPS.md                  (Task B — 5 navigation queries)
├── 03_GLOSSARY_INTEGRATION.md                (Task C — glossary-page integration)
├── 04_DECOMPOSITION_EXAMPLES.md              (Task D — 4 worked examples)
├── 05_PROGRESSION_CONCEPTS.md                (Task E — 3 progression chains)
└── EVALUATION_AND_RECOMMENDATION.md          (Tasks F + G)
```

All artifacts are observational + educational. No surfaces shipped publicly in this phase.

---

## Flagship examples used throughout

| Slug | ADD | Base | Family | Why flagship? |
|---|--:|---|---|---|
| matador | 5 | butterfly | butterfly | Nuclear + butterfly; 2nd nuclear-family pilot; flagship-density anchor |
| phoenix | 5 | butterfly | butterfly | Pixie + ducking + butterfly; teaches multi-modifier composition |
| ripwalk | 4 | butterfly | butterfly | Stepping + butterfly per pt11; walking-family anchor; structural-twin to dada-curve |
| spinning-whirl | 4 | whirl | whirl | Spinning bridge to whirl; foundational modifier-base compound |
| paradox-mirage | 3 | mirage | mirage | One of the BOP foundational guiltless tricks |
| montage | 7 | whirl | whirl | Spinning + paradox + symposium + ducking + whirl; 5-component flagship-density anchor |
| torque | 4 | osis | osis | Miraging-osis canonical (pt11); rotational topology anchor |

All seven are pilot tier (have populated prose). The progression + decomposition examples in §04 + §05 reference these flagships consistently.

---

## Cross-references

- `exploration/symbolic-grammar-2/symbolic_navigation_prototypes/` — 5 nav-prototype specs from SG-2 (this phase extends + evaluates)
- `exploration/symbolic-grammar-2/symbolic_topology_groups.csv` — 18 topology groups (Layer 3 source)
- `exploration/symbolic-grammar-2/symbolic_modifier_groups.csv` — 17 modifier groups
- `exploration/symbolic-grammar-2/symbolic_group_membership.csv` — 323 memberships
- `exploration/symbolic-grammar-2/symbolic_equivalence_clusters.csv` — 18 equivalence clusters
- `exploration/symbolic-grammar-2/movement_archetype_registry.csv` — 11 archetypes
- `exploration/glossary-synthesis-1/GLOSSARY_ARCHITECTURE_V4.md` — 4-layer architecture
- `exploration/glossary-synthesis-1/GLOSSARY_SYNTHESIS_DRAFTS.md` — 17 best-of glossary drafts
- SCALE pilot prose (98 tricks; via `freestyle_tricks.short_description` + companion columns) — Layer 2 source

---

## Constraint check

Pre-flight:

| Constraint | Status |
|---|---|
| Zero DB writes | ✓ — all output is markdown |
| Zero schema migration | ✓ — no schema proposals |
| Zero canonical mutation | ✓ — read-only `freestyle_tricks` access |
| Zero parser changes | ✓ — parser unmodified |
| Zero ADD changes | ✓ — adds column read-only |
| Zero alias insertion | ✓ — no alias-table writes |
| Symbolic layer observational | ✓ — every mockup carries Layer-3 attribution |
| Staging CSVs only | ✓ — no new staging tables proposed |
| Four-layer separation | ✓ — preserved in every mockup |
