# NOTATION_LAYER_STRATEGY

**Project:** DICTIONARY-SYMBOLIC-CARD-1 — Task C
**Scope:** Define the representation-layer model that underlies the symbolic dictionary. Document the relationship between semantic notation, operational notation, folk / community names, compressed and expanded forms, aliases, and external community renderings (PassBack, FootbagMoves).
**Companion docs:** [`SYMBOLIC_CARD_SPEC.md`](./SYMBOLIC_CARD_SPEC.md) consumes this model. [`OPERATIONAL_NOTATION_STYLE_GUIDE.md`](./OPERATIONAL_NOTATION_STYLE_GUIDE.md) normalises one specific layer.
**Out of scope:** Implementation, schema migrations, parser changes. This document is conceptual architecture only.

---

## 0. Why this matters

The 8-layer representation model defined below is the single most important conceptual breakthrough in the freestyle-dictionary project so far. It separates **movement structure**, **semantic compression**, **folk naming**, **aliases**, **operational mechanics**, and **educational rendering** without conflating them. Each becomes its own first-class concept.

That separation unlocks almost everything downstream:

- **Symbolic search** — a query for "spinning" returns every trick that has spinning at any representation layer, not just tricks whose name contains the word
- **Decomposition** — a trick can be rendered from any layer back to its underlying structure, then forward to any other layer
- **Progression** — symbolic progressions become first-class chains anchored on operational deltas, not prose narratives
- **Alternate notation rendering** — PassBack and FM renderings cohabit with canonical without competing for primacy
- **Glossary integration** — glossary terms map directly to layers; definitions become layer-attribution rather than ad-hoc prose
- **Future parser work** — the parser produces and consumes layer values explicitly; it doesn't have to invent ad-hoc shapes
- **Multi-view rendering** — every browse mode (By ADD, By Family, By Component, By Category) consumes the same layered view-model and chooses which layers to surface
- **Topology relationships** — symbolic equivalence clusters (already shipped) sit *above* the layer model: members share an underlying structure even when their layer values differ

Everything in `SYMBOLIC_CARD_SPEC.md`, `COMPONENT_VIEW_REDESIGN.md`, `UNIFIED_DICTIONARY_VIEW_PLAN.md`, and (later) the future-capabilities deliverable depends on this model. Without it, the dictionary remains a flat list of named things with prose decorations. With it, the dictionary becomes a symbolic movement-language system.

The model is conceptual architecture, not schema. No DB columns are added in Batch 1. The 5-phase migration path in §10 is the long-form roadmap; none of it is in scope yet. The point of this document is to make the architecture *explicit* so subsequent code, schema, and UI work can reference one shared model rather than inventing per-feature representations.

---

## 1. Reframing the question

The original Task C scoped the layer question as **semantic vs operational**. The architectural correction received with Batch 1 reframes this:

> Alternate notation and aliases are NOT exceptional showcase content. The system should move toward a normalised multi-representation model where canonical names, semantic decompositions, operational notation, folk names, compressed names, PassBack/FM renderings, and alias names are treated as **alternate readable representations of the same movement structure.**

The Mobius / Torque examples in the original spec (`MOBIUS` with `gyro torque` as semantic alongside operational; `TORQUE` with `miraging osis` as semantic alongside operational) are **evidence of the future direction, not one-off special cases**. Every compound trick is expected to support the same set of layers eventually.

This document defines that representation model.

---

## 2. The representation layers (long form)

For any given freestyle trick (= any row in `freestyle_tricks`), the system can in principle hold up to **eight distinct readable representations** of the same underlying movement structure. They are alternate *renderings*, not alternate *tricks*.

| # | Layer | Example (MOBIUS) | Audience | Authored or derived? |
|--:|---|---|---|---|
| 1 | **Canonical name** | `Mobius` | All readers | Authored (curator-owned in `freestyle_tricks.canonical_name`) |
| 2 | **Semantic notation (compressed)** | `gyro torque` | Glossary/dictionary readers; experienced freestylers | Authored OR derived from base + modifier links + canonical compression rules |
| 3 | **Semantic notation (expanded)** | `spinning ss miraging op osis` | Notation pedagogy; decomposition learners | Derived from base_trick + ordered modifier_links + side/direction flags |
| 4 | **Operational notation** | `[clip] > spinning > ss miraging op osis` | Mechanical / execution learners | Authored (`operational_notation` column) |
| 5 | **Folk / community names** | `Gyro Torque` (the trick's most-used name in records) | Community communication | Authored (alias rows) |
| 6 | **PassBack rendering** | (per PassBack glossary conventions; e.g., `Gyro Torque (op)`) | PassBack-community readers | Authored or matched-to via PassBack intake pipeline |
| 7 | **FootbagMoves rendering** | (per FM federation naming; e.g., `Gyro Torque`) | FM-community readers | Authored or federation-mapped |
| 8 | **Alias names** | `gyro torque` | Search / typo-resilience | Authored (`freestyle_trick_aliases`) |

These are not mutually exclusive. For Mobius, layers 2, 5, 6, 7, and 8 all happen to render the same surface string (`Gyro Torque` / `gyro torque`) because the folk name *is* the compressed semantic form for this trick. For Torque, layer 2 (`miraging osis`) is distinct from layers 5–8 (Torque has no widely-used folk name distinct from its canonical name). For Ripwalk, layer 2 (`stepping butterfly`) is distinct from layer 5 (`Blurry Butterfly`, a historical folk name).

The layers are *roles*, not necessarily distinct strings.

---

## 3. Mobius and Torque as the documented pattern

The architectural correction states these tricks are evidence of the future direction. Recast:

### 3.1 Mobius (full representation set)

```
canonical name:        Mobius
ADD:                   5
semantic (compressed): gyro torque
semantic (expanded):   spinning ss miraging op osis
operational:           [clip] > spinning > ss miraging op osis
folk:                  Gyro Torque
aliases:               gyro torque
PassBack rendering:    (matched to "Gyro Torque (op)" in records-master)
FootbagMoves render:   (mapped to "Gyro Torque" if present in FM-FREE dictionary)
```

What this exposes:

- The canonical name (`Mobius`) is the *identity*. It doesn't appear in any other layer.
- The compressed semantic form (`gyro torque`) is what a glossary reader most often sees. It happens to coincide with the folk name and the alias.
- The expanded form (`spinning ss miraging op osis`) is what decomposition learners see. It's the full modifier-link composition.
- The operational notation (`[clip] > spinning > ss miraging op osis`) is what mechanical learners see. It adds the entry bracket `[clip]` and the sequence operator `>` that the expanded semantic form omits.

The card surface in `SYMBOLIC_CARD_SPEC.md` §8.3 already accommodates all of these on detail-density mode.

### 3.2 Torque (subset representation)

```
canonical name:        Torque
ADD:                   4
semantic (compressed): miraging osis
semantic (expanded):   miraging osis        (== compressed; no further decomposition)
operational:           [clip] > ss miraging op osis
folk:                  (none distinct from canonical)
aliases:               (none)
PassBack rendering:    "Torque (op)" or similar
FootbagMoves render:   "Torque"
```

What this exposes:

- A trick MAY have fewer distinct layers. Torque's compressed and expanded semantic forms are identical because torque is itself a "base trick" with only one structural modifier (miraging) layered onto the underlying osis base.
- The absence of aliases / folk names is itself information. The card simply omits empty slots.

### 3.3 Ripwalk (different distribution again)

```
canonical name:        Ripwalk
ADD:                   4
semantic (compressed): stepping butterfly
semantic (expanded):   stepping op butterfly
operational:           [clip] > op in dex > butterfly wing > ss clipper
folk:                  Blurry Butterfly (historical, deprecated by pt11)
aliases:               stepping butterfly, blurry butterfly
```

Ripwalk has a *historically deprecated* folk name (`Blurry Butterfly`) that pt11 ruled is now a structural alias rather than a primary name. The folk row may still surface in alias listings — community readers continue to recognise it — even though new structural references use Ripwalk + stepping-butterfly.

---

## 4. Equivalence handling

The fundamental claim of the layer model: **all 8 layers refer to the same movement structure.** A card rendering any one of them is rendering the same trick. Search, alias resolution, and cross-references all operate on the underlying structure, not the surface string.

### 4.1 Identity in the model

The **canonical name** (layer 1) is the unique identifier. Two different canonical names = two different tricks, regardless of how much their other layers overlap. Two different layers for the *same* canonical name = the same trick under alternate renderings.

This is already enforced in the database: `freestyle_tricks.slug` is the primary key for trick identity. Aliases live in `freestyle_trick_aliases` and point at slugs.

### 4.2 Equivalence in surface strings

Two surface strings are *equivalent* when they resolve to the same canonical slug. Examples:

| Surface string | Layer | Resolves to |
|---|---|---|
| `Mobius` | canonical | mobius |
| `gyro torque` | semantic compressed | mobius |
| `Gyro Torque` | folk | mobius |
| `gyro torque` | alias | mobius |
| `spinning ss miraging op osis` | semantic expanded | mobius |
| `[clip] > spinning > ss miraging op osis` | operational | mobius |
| `gyro-torque` | URL-slug variant | mobius |

A symbolic-search system over this model should accept any of these and route the reader to the trick page. The current alias resolver already does this for layers 1 + 8; the symbolic-grammar layer extends the resolution to layers 2 + 3 + 4 (semantically equivalent compositions).

### 4.3 Layer-to-layer derivation rules

Some layers can in principle be **derived** from others:

| Source | Target | Derivation |
|---|---|---|
| Canonical name + `base_trick` + `freestyle_trick_modifier_links` | Semantic expanded | Concatenate ordered modifier-link names + base name with appropriate side/direction flags |
| Semantic expanded | Semantic compressed | Apply canonical compression rules (e.g., `spinning ss miraging op osis` → `gyro torque`); curator-defined rule set |
| Semantic expanded + `[entry-bracket]` + sequence operators | Operational | Insert entry bracket; insert `>` between major-step boundaries; insert `>>` at no-plant breaks; respect modifier→operational vocabulary mapping |
| Operational | Semantic expanded | Lossy reverse — operational tokens may not all carry semantic equivalents (e.g., `(no plant while)` has no semantic counterpart) |

Today, only the *canonical name* and *operational notation* are authored independently in the DB. The semantic forms are partially derivable from `freestyle_trick_modifier_links` but the *compression rules* (layer 2 ← layer 3) are not yet codified.

**Codifying compression rules is a future schema/parser concern, NOT in scope this phase.** Batch 1 documents the model; later phases can add the derivation logic.

### 4.4 Equivalence clusters

The symbolic-grammar-2 layer already maintains `symbolic_equivalence_clusters.csv`. Example cluster:

```
"hippy-in-on-mirage", "Hippy-in dex on mirage base",
  members: mirage, smear, blur, atom-smasher, sumo, witchdoctor, paradox-mirage,
  pattern: pixie/atomic+xdex/nuclear+xdex/stepping+paradox; ADD 2-5
```

This is the **structural equivalence layer**: tricks that share an underlying topology even though their canonical names and compressed semantic forms differ. The representation-layer model lives one rung above equivalence clusters: each cluster member has its own full set of representation layers, but the cluster identity is the *shared movement structure* across multiple tricks.

Equivalence-cluster membership is separate from intra-trick layer equivalence. The card surface in §3 above represents one trick across its 8 layers; the equivalence cluster represents a *group* of tricks that share a topology.

---

## 5. Alias-vs-notation distinction

This is the cleanest place to be precise.

| Concept | Definition | Lives in |
|---|---|---|
| **Alias** | An alternate *name* used to identify or reference a trick. Aliases route to the canonical name for the same trick. Aliases are *names*. | `freestyle_trick_aliases` |
| **Notation** | A *structural rendering* of the trick — a composition of named components according to a grammar. Notation is a *reading* of the trick's structure. | `freestyle_tricks.notation` (semantic), `freestyle_tricks.operational_notation` (operational) |
| **Folk name** | A culturally-rooted name that may or may not be a structural reading. Often coincides with semantic compressed form for some tricks; stands independent for others. | `freestyle_trick_aliases` (folk names are a subset of aliases) |

**Concretely:**

- `Mobius` is a canonical name (layer 1).
- `gyro torque` is *both* a semantic compressed notation (layer 2) AND an alias (layer 8). It plays two roles. The card surface in `SYMBOLIC_CARD_SPEC.md` §8.3 explicitly renders both rows even though the surface string is identical, because the conceptual roles differ.
- `Gyro Torque` (display-cased) is a folk name (layer 5). The folk name has cultural weight independent of structural meaning.
- `[clip] > spinning > ss miraging op osis` is operational notation (layer 4). It is NOT an alias and cannot be used in conversation as a name. It is purely a structural reading.

A card never shows two layers as "the same thing" — they are conceptually distinct even when textually identical. Future search may accept all of them and resolve to the trick; the card SHOWS the role each plays.

---

## 6. Compressed semantic forms

The compressed semantic form is **the shortest reading of the trick's structure that preserves enough information to identify it within the freestyle vocabulary.**

### 6.1 Examples of compression

| Expanded form | Compressed form | What's compressed |
|---|---|---|
| `spinning ss miraging op osis` | `gyro torque` | `spinning` → `gyro` (canonical short form for full-spin); `ss miraging op osis` → `torque` (the trick name *is* the compression of "miraging osis" with side flags) |
| `stepping op butterfly` | `stepping butterfly` | Side flag `op` is implicit on the default reading; dropped |
| `pixie ducking op butterfly` | `pixie ducking butterfly` | Same — `op` is the default |
| `paradox op symposium op whirl` | `paradox symposium whirl` (or `PS whirl`) | Side flags dropped; `PS` is a further compressed shorthand |
| `furious op paradox op mirage` | `fury` | Full collapse to a folk single-token name; community vocabulary owns this collapse |

Compression rules are partly *grammatical* (drop default side flags) and partly *cultural* (use folk single-tokens for known compounds). The cultural compressions are the source of most ambiguity: `gyro torque` is a structural reading; `fury` is a name. Both compress the same expanded form down to a shorter rendering.

### 6.2 Where compressed forms come from

Compressed semantic forms are:

- **Authored** when curator-owned (e.g., Red's pt-rulings declaring "fury = furious + paradox + mirage")
- **Derived** when grammatically obvious (drop default `op` side flag)
- **Inferred** when a long-standing community name corresponds to a compositional pattern (e.g., the PassBack glossary's "PS X = Paradox Symposium X")

The codification is a curator task; the *display* of compressed forms on cards is a UI task. Batch 1 documents the layer; later phases populate it.

### 6.3 Multiple compressed forms

A single trick may admit *multiple* compressed semantic forms:

```
RIPWALK (canonical)
semantic compressed (modifier+base): stepping butterfly
semantic compressed (folk):           blurry butterfly       (deprecated)
expanded:                              stepping op butterfly
```

When multiple compressed forms exist, the card surface may render them as a list under `semantic:` with the primary form first and others italicised or muted. UI choices are in `SYMBOLIC_CARD_SPEC.md` §8.

---

## 7. Expanded operational forms

Symmetric question: what does the "expanded operational" form look like?

The current operational notation already IS the expanded form — every token is explicit, every flag is bracketed, every side and direction is named. There is no "compressed operational" form in widespread use.

### 7.1 Possible compressed operational forms (future)

Some implicit compressions might be useful in card density modes:

- Drop the `[clip]` entry bracket when the entry is unambiguous from the base trick (default behaviour for most tricks)
- Drop default side flags (`ss`, `op`) that match the base trick's default
- Collapse multi-word fusions to community shorthand (`FRONT WHIRL` → `FW`)

These are aesthetic compressions for mobile / dense browse cards. They lose information. **They are NOT recommended for Batch 1.** A card should show the full operational notation; if space is tight, the *card itself* shrinks (font size, breakpoint stacking), not the notation.

### 7.2 Future: operational decomposition

The reverse direction — turning a compact operational string into a teaching-friendly decomposition — is a different feature. A trick like `montage` with 7 operational tokens benefits from a step-by-step breakdown where each operational element gets a sentence of prose. This is a *decomposition view*, not an expanded operational form, and it lives on detail pages, not browse cards.

---

## 8. Future rendering hierarchy

How does a future renderer decide *which* layers to surface?

### 8.1 By surface context

| Surface | Layers shown |
|---|---|
| Browse card (default density) | 1 (title), 4 (operational), 8 (aliases) |
| Trick detail header | 1 (title), 4 (operational) |
| Trick detail body — semantic section | 2 (compressed), 3 (expanded) |
| Trick detail body — alias section | 5 (folk), 8 (aliases) |
| Glossary entry | 2 (compressed) + cross-link to detail |
| Symbolic progression step | 1 (title), 4 (operational), and *only* operational — the point is to show structural deltas |
| Modifier-family cross-base example | 1 (title), 2 (compressed), 4 (operational) |
| Search results | 1 (title) + the matched layer |
| External federation export (PassBack / FM) | 1 (title), 6 or 7 (rendering for that community) |

### 8.2 By layer availability

Not every trick has all 8 layers populated. The renderer falls through:

1. Show what's populated.
2. Hide empty slots silently (no "—" placeholder; the absence is itself information).
3. Distinguish between "no folk name exists" (omit silently) and "folk name exists but not surfaced" (don't omit; this case shouldn't happen in well-curated data).

### 8.3 By user-facing layer priority (proposed)

When multiple layers are available, prefer them in this order:

1. **Canonical name** — always shown
2. **Operational notation** — primary visual anchor; the central object
3. **Aliases** — anchored at card foot; secondary
4. **Semantic compressed** — shown on detail; promoted to browse when the trick is best identified by it (curator-flagged exception, e.g., Mobius)
5. **Semantic expanded** — detail only
6. **Folk name** — detail only when distinct from canonical
7. **PassBack / FM rendering** — federation-export and external-link contexts only
8. **Alias names (technical)** — search resolution; never the primary surface

This hierarchy is for the renderer; it does NOT imply that some layers are "more correct" than others. All eight render the same movement structure.

---

## 9. Cohabitation with the symbolic-grammar layer

The representation-layer model lives **above the symbolic-grammar layer.** Concretely:

- Symbolic-grammar layer (already shipped): groups of tricks share a *structure* (butterfly-wing-topology, paradox-family, whirl-rotational-topology, etc.). 62 groups × 323 memberships.
- Representation-layer model (proposed here): each individual trick has up to 8 *renderings* of its own structure.

A topology group like `butterfly-wing-topology` contains tricks. Each trick in the group has its own canonical name, operational notation, semantic forms, etc. The group says "these tricks share a topology"; the layer model says "this trick admits these renderings."

The two are complementary and never compete. A card on the related-topology panel (8 flagship trick pages) shows the same representations as a card on the By Component view — only the grouping wrapper differs.

---

## 10. Migration path (NOT implementation; conceptual)

The current codebase supports layers 1 (canonical), 4 (operational, when populated), and 8 (aliases). The conceptual migration path:

| Phase | Adds | DB cost |
|---|---|---|
| Now (status quo) | Layers 1, 4, 8 in use; layer 2/3 partial via parser | None — already in service shape |
| A | Layer 2 (compressed) authored for the ~10 canonical "compressed-distinct" tricks (Mobius, Torque, Fury, Blur, Nuclear-family, Phoenix, etc.) | New column `freestyle_tricks.semantic_compressed_notation` (nullable); curator-authored |
| B | Layer 3 (expanded) derived from `base_trick` + `freestyle_trick_modifier_links` | No DB change; service-layer derivation |
| C | Layer 5 (folk) explicitly tagged on alias rows | New column `freestyle_trick_aliases.alias_kind` (folk / structural / typo) |
| D | Layers 6, 7 (PassBack, FM) mapped via existing federation pipelines | No new schema; existing `federation_math_divergences` + glossary intake |
| E | Symbolic-search resolver accepts all 8 layers and resolves to canonical | Service-layer; existing alias resolver extended |

Each phase is independently shippable and reversible. Phase A is the highest-leverage and is the natural next step *after* Batch 1 ships.

**Reminder:** none of these phases are in scope for Batch 1. The document records the *direction*; implementation is later.

---

## 11. Constraints honoured

- No DB schema changes proposed (only described as future)
- No canonical-data mutation
- No ontology changes
- No ADD changes
- No parser changes
- No alias insertion
- The two-layer separation (semantic vs operational) is preserved AND extended into a richer model
- The shipped symbolic-grammar layer is referenced as the underlying group/equivalence layer; it is not modified

---

## 12. Cross-references

- `SYMBOLIC_CARD_SPEC.md` — visual realisation of the layers (Task B)
- `OPERATIONAL_NOTATION_STYLE_GUIDE.md` — operational notation normalisation (Task D)
- `NOTATION_SURFACE_AUDIT.md` — current-state surface map (Task A)
- `exploration/symbolic-grammar-2/symbolic_equivalence_clusters.csv` — structural-equivalence layer
- `exploration/glossary-synthesis-1/GLOSSARY_ARCHITECTURE_V4.md` — 4-layer glossary architecture (canonical / educational / symbolic / operational); cohabits with this model
- `feedback_parser_editorial_separation.md` — parser / editorial-decomposition layer separation (load-bearing forever-rule)

---

*End of NOTATION_LAYER_STRATEGY.md*
