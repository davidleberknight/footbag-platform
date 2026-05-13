# GLOSSARY_ARCHITECTURE_V4 — Multi-Layer Glossary Proposal

Architecture spec for the next-generation freestyle footbag glossary. Synthesizes IFPA precision + PassBack educational richness + symbolic-grammar mechanical clarity into a **multi-layered**, **non-flattening** glossary system.

**Status:** architecture proposal. **No template changes performed.** No replacement of canonical glossary yet.

**Date:** 2026-05-12

---

## 1. Why v4

The 2026-05-12 comparative analysis (`GLOSSARY_COMPARISON_MATRIX.csv`) surfaced the gap structure:

- **108 focal terms analyzed**
- **43 (40%)** are community/PassBack-only — entirely missing from IFPA glossary
- **31 (29%)** are symbolic-only — operational/topology vocabulary not surfaced in any glossary
- **13 (12%)** have PassBack + symbolic coverage but no IFPA entry — promotion candidates
- **11 (10%)** are absent across all three sources — definition gaps
- **6 complementary**, **3 broader_passback**, **1 broader_ifpa** — overlap with synthesis opportunities

**Implication:** The current IFPA glossary v2 (~25 terms across 10 sections) is materially narrower than the available vocabulary. PassBack contributes 180 educational terms; symbolic grammar contributes 62 group-defining terms + 11 archetypes + operational notation. The combined corpus is 4-7× the size of v2 — and most of the extra is not noise; it's vocabulary players actually use.

## 2. Hard constraints (carried forward; §G of brief)

| Constraint | Enforced by |
|---|---|
| Do NOT overwrite canonical IFPA entries | v4 reserves IFPA layer; never edits docs/Freestyle_Footbag_Glossary.md without James approval |
| Do NOT auto-promote PassBack definitions to IFPA text | PassBack entries surface in their own layer with attribution |
| Do NOT remove existing glossary structure | v2 stays in place; v4 sits beside it |
| Do NOT merge symbolic groups into ontology | Symbolic layer marked distinctly |
| Do NOT alter ADD rules | Modifier table read-only |
| Do NOT auto-import aliases | Alias work continues through `PASSBACK_ALIAS_CANDIDATES.csv` queue |

## 3. Four glossary layers + cross-cutting axes

```
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 1: CANONICAL                                               │
│   docs/Freestyle_Footbag_Glossary.md v2 — IFPA authoritative     │
│   ADD system / dex / set / stall / X-Dex / foundational tricks   │
│   25 terms; James-owned                                          │
│   AUTHORITATIVE — never auto-edited                              │
├──────────────────────────────────────────────────────────────────┤
│ LAYER 2: EDUCATIONAL (PassBack)                                  │
│   180 terms from passback-glossary.txt                           │
│   Strong teaching prose; community-grounded                      │
│   COMPANION — explanations enrich canonical without overriding   │
├──────────────────────────────────────────────────────────────────┤
│ LAYER 3: SYMBOLIC GRAMMAR                                        │
│   62 symbolic groups + 11 archetypes + James-shorthand notation  │
│   from SYMBOLIC-GRAMMAR-1/2 + GRAMMAR-GLOSSARY-1                 │
│   OBSERVATIONAL — descriptive mechanics; non-authoritative       │
├──────────────────────────────────────────────────────────────────┤
│ LAYER 4: OPERATIONAL NOTATION                                    │
│   83 tokens from UX1_GLOSSARY_TOKEN_MATRIX.csv                   │
│   FM-derived component flags + pre-states + structural tokens    │
│   PARSER-FACING — operational mechanics for set-arc notation     │
└──────────────────────────────────────────────────────────────────┘
```

**Cross-cutting axes** that group terms across layers:

| Axis | Examples |
|---|---|
| Concept (high-level abstraction) | ADD, dex, set, stall, contact, run, combo, drill |
| Modifier (named action that adds ADD) | spinning, paradox, pixie, ducking, atomic, blurry |
| Trick (named primitive or compound) | butterfly, whirl, mirage, osis, torque, drifter |
| Stall position | toe, clipper, inside, outside, sole, heel |
| Notation operator | xbd, ss, op, in, out, hippy, leggy, DEX, BOD, PDX, XDEX |
| Execution quality | clean, deep, thin, shoey, scoopy, pulled |
| Stance | bigfoot, sideways, strong-side, flip-side |
| ADD grouping | tiltless, guiltless, tripless, fearless, beastly, godly |

## 4. Proposed v4 page structure

A glossary page can render any of these section orderings; preferred default is **canonical-first, educational-next, symbolic-last** to honor the layer-precedence rule.

```
1. Core canonical terms          (Layer 1: IFPA ADD system, dex, set, stall, X-Dex)
2. Symbolic grammar terms        (Layer 3: topology / dex-mechanic / contact / execution)
3. Operational notation terms    (Layer 4: DEX/DEL/BOD/XBD/PDX/XDEX/UNS + pre-states)
4. Educational mechanics         (Layer 2: PassBack teaching: components, contacts, dex styles, body)
5. Community / PassBack vocabulary  (Layer 2: drills, marathon, BSOS, midstring, LIMP/CLIMP, shred terminology)
6. Recursive compositional operators  (alpine/crispy/PS/FS/BS/full-symp/Pdx/Pdx-Whirl-Free)
7. Trick decomposition examples  (Mobius 4-layer recursive equivalence; Blur = stepping-paradox-mirage; Torque = miraging-osis)
8. Movement topology examples    (butterfly-wing topology; whirl-rotational; osis-arc; barfly-double-loop; etc.)
```

Each glossary entry in v4 can carry **up to 5 attributes**:

- **canonical_definition** — Layer 1 prose; James-curated.
- **passback_explanation** — Layer 2 prose; attribution to PassBack.
- **symbolic_interpretation** — Layer 3; mechanics and topology.
- **operational_usage** — Layer 4; how the term renders in operational notation.
- **related_terms** — cross-references to other glossary entries (per `GLOSSARY_RELATIONSHIP_GRAPH.csv`).

## 5. Navigation strategy

Three orthogonal navigation entry points:

### 5.1 Alphabetical browse
- Existing pattern: `/freestyle/glossary` with A-Z index.
- v4 adds: section filter (canonical / educational / symbolic / operational), and axis filter (concept / modifier / trick / stall / notation / execution / stance / ADD).

### 5.2 Concept-driven browse (NEW)
- Pages like `/freestyle/glossary/concept/modifier/spinning`.
- Lands on the full multi-layer entry for "spinning" with all four layers visible.
- Cross-links to `/freestyle/modifier/spinning` (the trick-list view from SG-2 nav-prototype 2).

### 5.3 Symbolic-group browse (NEW)
- Pages like `/freestyle/glossary/topology/butterfly-wing-topology`.
- Lands on the topology-group entry with all member tricks + member modifiers + canonical decomposition examples.

## 6. Cross-linking strategy

Three cross-link types renderable in v4:

| Link type | Source | Render shape |
|---|---|---|
| "Used in these tricks" | `SYMBOLIC_GLOSSARY_LINKS.csv` | Trick badges with ADD value: `ripwalk (4)`, `dimwalk (4)`, etc. |
| "Related glossary terms" | `GLOSSARY_RELATIONSHIP_GRAPH.csv` | Linked terms with relationship label: `paradox → modifier_of → mirage` |
| "Related operators" (notation) | `UX1_GLOSSARY_TOKEN_MATRIX.csv` | Operator badges: `DEX`, `BOD`, `XBD`, `PDX` |

## 7. UX concepts

### 7.1 Multi-layer entry view (single glossary term)

```
┌─────────────────────────────────────────────────────────────────┐
│ Spinning                          [modifier]  [rotation modifier] │
├─────────────────────────────────────────────────────────────────┤
│ ┌────── CANONICAL (IFPA) ───────────────────────────────────┐  │
│ │ Rotation modifier adding +1 ADD (flat per pt10; was       │  │
│ │ previously +2 on rotational base; flattened in pt10).     │  │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌────── EDUCATIONAL (PassBack) ─────────────────────────────┐  │
│ │ Spins are performed by rotating the entire body to        │  │
│ │ various degrees: gyro means to spin 180 degrees, while    │  │
│ │ spinning means to spin 360 degrees. The two terms can be  │  │
│ │ combined ... [continued]                                  │  │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌────── SYMBOLIC GRAMMAR ───────────────────────────────────┐  │
│ │ Group: spinning-family (modifier axis)                    │  │
│ │ Topology context: whirl-rotational-topology (cross-cuts)  │  │
│ │ Composition: spinning + base = +1 ADD                     │  │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌────── OPERATIONAL NOTATION ───────────────────────────────┐  │
│ │ Component flag: BOD when present on body-action beat       │  │
│ │ Pre-state: (spinning) — see also "(back) Spin (BOD)"      │  │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌────── USED IN THESE TRICKS (15 pilots) ──────────────────┐  │
│ │ spinning-whirl(4)  spinning-osis(4)  spinning-torque(5)   │  │
│ │ spender(6)  montage(7)  ... [more]                        │  │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│ ┌────── RELATED GLOSSARY TERMS ─────────────────────────────┐  │
│ │ → gyro (educational_pair; rotational degree)               │  │
│ │ → inspinning (educational_pair; rotational direction)      │  │
│ │ → paradox (related_to; both body modifiers)                │  │
│ │ → whirl (modifier_of; spinning + whirl = spinning-whirl)   │  │
│ └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Layer toggle

A header toggle lets readers hide layers they don't want to see:
- `[Canonical only]` — strictest IFPA reading
- `[Canonical + Educational]` — default; canonical + PassBack
- `[All layers]` — full multi-layer view (default for trick-decomposition pages)

### 7.3 Layer-conflict surfacing

When a term has conflicting readings across layers (rare but worth surfacing), v4 explicitly shows the conflict rather than hiding it:

> **Note on this term:** PassBack defines X as Y; IFPA pt10 ruled X as Z. Both readings are preserved here; the IFPA canonical reading takes precedence for ADD math and trick decomposition.

This honors the "DO NOT auto-promote PassBack definitions into authoritative IFPA text" constraint while not hiding the educational alternative.

## 8. Search + filter ideas

| Search type | Behavior |
|---|---|
| Term name | Exact + fuzzy match across all layers; show layer-coverage chips on results |
| Axis filter | Filter to concept / modifier / trick / etc. |
| Layer filter | Show only canonical / only educational / only symbolic / etc. |
| "Used in trick" reverse-search | Enter a trick name, see all glossary terms relevant to it |
| Section filter | One of the 8 v4 sections |
| Confidence filter | Hide low-confidence symbolic-only entries from default browse |

## 9. "Related symbolic concepts" panel

Beneath each entry, render a panel of related symbolic-grammar concepts:

```
Related symbolic concepts
  Topology: butterfly-wing-topology (12 members)
  Modifier family: spinning-family (15 members)
  Dex mechanic: front-spin-dex (cross-references)
  Execution archetype: spinning-drifter-rotational
```

Each linkable; lands on the symbolic-group page (per SG-2 nav-prototype 2/4 specs).

## 10. "Used in these tricks" rendering

For modifier terms (spinning/paradox/pixie/etc.): list pilot tricks first, then non-pilot. For trick terms (mirage/whirl/osis/etc.): list compound members of the same topology group, then direction variants, then equivalence-cluster siblings.

## 11. "Related operators" panel

For terms that have operational-notation counterparts:

```
Related operators (operational notation)
  DEX  — dex flick component flag
  BOD  — body-action component flag (for spin/duck/dive beats)
  XBD  — cross-body component flag (recovery position)
```

Click → operational-notation glossary entry (Layer 4).

## 12. Implementation phasing

If v4 is approved for build:

**Phase A — Static v4 page (READ-ONLY from staging CSVs)**
- New page at `/freestyle/glossary-v4` (or replaces existing if approved).
- Reads from staging CSVs (comparison matrix + symbolic links + relationship graph).
- No DB writes. No schema change.
- Effort: ~1.5 days for page + service + tests.

**Phase B — DB schema migration**
- Three additive tables: `glossary_entries` + `glossary_layer_attributes` + `glossary_relationships`.
- Loader script (transaction-wrapped) ingests staging CSVs.
- Existing IFPA glossary v2 (the `.md` doc) stays as the AUTHORITATIVE source for canonical_definition column.
- Effort: ~2-3 days for migration + loader + tests.

**Phase C — Author + curator workflow**
- Admin UI for adding educational/symbolic entries.
- Curator-approval gate before any entry is rendered publicly.
- Effort: ~3-4 days.

**Phase D — Integration with trick pages**
- Inline glossary tooltips on trick-detail pages.
- Decomposition section uses v4 entries (replaces hand-curated tooltip definitions).
- Effort: ~1-2 days.

**Recommended sequence:** A → C → B → D. Static page first to validate UX; then curator workflow; then DB migration once entries stabilize; then trick-page integration last.

## 13. Quality gates

Before any v4 entry promotes from staging to public:

| Gate | Check |
|---|---|
| Canonical-layer authority | Canonical_definition column is sourced from `docs/Freestyle_Footbag_Glossary.md` v2 (James-curated). Never overwritten by automated process. |
| Educational-layer attribution | PassBack_explanation column always carries "Source: PassBack glossary" attribution; never presented as IFPA-authored. |
| Symbolic-layer disclaimer | Symbolic_interpretation column carries "observational" status badge; never claimed as canonical structure. |
| Operational-layer parser-precision | Operational_usage column matches the existing UX1 token matrix or operational notation grammar; no invented operators. |
| Relationship-link bidirectional | If A → related_to → B is rendered on A's page, B's page must render the reverse link (B → related_to → A). |
| ADD-math non-mutation | No glossary entry can change a trick's `adds` value or modifier table bonuses. ADD-math is read-only from canonical tables. |

## 14. What v4 does NOT do

- It does NOT replace the canonical IFPA glossary (Layer 1 stays as authoritative source).
- It does NOT modify any DB row beyond additive new tables (Phase B).
- It does NOT auto-promote symbolic groups or PassBack terms into the canonical layer.
- It does NOT collapse the four-layer separation (Layer 1 / Layer 2 / Layer 3 / Layer 4 remain distinctly attributed).
- It does NOT enforce a single "right" definition for terms where layers diverge; explicit layer-conflict surfacing preserves all readings.

## 15. Open architecture questions

1. **Layer-conflict resolution policy.** When IFPA and PassBack assign different ADD values or different decompositions (e.g., XDEX broad-vs-narrow), v4 shows both. Should there be a curator-controlled "preferred reading" flag for tooltip rendering?
2. **Stale glossary entries.** PassBack glossary entries may become outdated as freestyle vocabulary evolves. Should v4 track entry-freshness (e.g., last-validated-date column) and surface aging entries?
3. **Source-of-truth shift over time.** If v4 grows in coverage and quality, does the canonical IFPA layer eventually adopt some v4 entries? This is a long-term curator question, not an architecture concern for this phase.
4. **Cross-language support.** PassBack is English-only; the IFPA glossary is English-only. Future Finnish/Spanish/Polish support would require translation layer architecture; deferred.

## 16. Cross-references

- `GLOSSARY_COMPARISON_MATRIX.csv` — 108-term comparative inventory across IFPA / PassBack / symbolic / operational
- `GLOSSARY_SYNTHESIS_DRAFTS.md` — best-of synthesized drafts for 17 high-value terms (Task C)
- `GLOSSARY_GAP_ANALYSIS.md` — gap analysis (Task E)
- `SYMBOLIC_GLOSSARY_LINKS.csv` — symbolic-group ↔ glossary-term ↔ trick-membership graph
- `GLOSSARY_RELATIONSHIP_GRAPH.csv` — 102-row term-to-term relationship graph
- `docs/Freestyle_Footbag_Glossary.md` — IFPA glossary v2 (Layer 1; authoritative)
- `legacy_data/inputs/curated/tricks/passback-glossary.txt` — PassBack glossary (Layer 2 source)
- `exploration/freestyle-notation-grammar/GRAMMAR_GLOSSARY_V3.md` — observational symbolic glossary v3 (Layer 3 input)
- `exploration/freestyle-notation-grammar/UX1_GLOSSARY_TOKEN_MATRIX.csv` — operational token inventory (Layer 4)
- `exploration/symbolic-grammar-2/` — SG-2 group registries + nav-prototype specs

---

## Constraint check

| Constraint (per §G) | Status |
|---|---|
| Do NOT overwrite canonical glossary entries | ✓ (v4 sits beside v2; never edits) |
| Do NOT auto-promote PassBack to IFPA text | ✓ (PassBack layer always attributed; never auto-merged) |
| Do NOT remove existing glossary structure | ✓ (v2 doc and existing UI surface unchanged in this phase) |
| Do NOT merge symbolic groups into ontology | ✓ (symbolic groups stay observational; v4 references them) |
| Do NOT alter ADD rules | ✓ (modifier table + canonical adds read-only) |
| Do NOT auto-import aliases | ✓ (alias work continues via existing PASSBACK_ALIAS_CANDIDATES.csv queue) |
| Four-layer separation preserved | ✓ (each entry has up to 5 attribute fields with explicit layer attribution) |
