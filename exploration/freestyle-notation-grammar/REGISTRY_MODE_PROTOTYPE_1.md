# REGISTRY-MODE-PROTOTYPE-1

**Status: SPEC LOCKED 2026-05-15.** Implementation deferred.

Compact, scan-oriented browse surface for `/freestyle/tricks?view=registry`. Opt-in until operational-notation coverage reaches ~60%, then a candidate for default promotion.

This document captures the architectural decisions reached during prototype evaluation after OP-NOTATION-WAVE-1B Tier-1 landed (coverage: 30.0%; chain-registry compound coverage: 56%). It is the authoritative input for whoever eventually implements registry mode.

No code lands from this document directly. It exists to preserve design intent for a future implementation slice.

---

## 1. Foundational design philosophy

### 1.1 Two cognitive modes, two surfaces

The dictionary serves two fundamentally different reader intents. Registry mode is not a redundant variant of the card view; it answers a different cognitive need.

> **The card view optimizes for "find a specific trick".**
> **The registry view optimizes for "understand the language by scanning it".**

That sentence is the load-bearing justification for registry mode's existence.

| Surface | Cognitive mode | Reader question |
|---|---|---|
| Card view (default) / trick-detail page | lookup, depth | "What is this specific trick? Show me everything about it." |
| Registry view | topology, language scanning | "What's the shape of the freestyle language? Let me read it." |

The two surfaces cooperate. Registry mode surfaces structural signature; card view surfaces context, media, records, ancestry. One click bridges them.

### 1.2 Teaching surface, not browse surface

Registry mode is a **teaching surface** as much as a browse surface. The page should make the topology of the freestyle language visible by the rhythm of its own layout. A reader scanning the registry should be able to perceive:

- "All butterfly compounds end with the same recovery."
- "Pixie openings cluster together under TOE plant."
- "Surging compounds share the `(BACK) SPIN [BOD]` opening."
- "ADD ascends through structural elaboration."

These insights are not labeled or explained. They emerge from the spatial arrangement of the rows. The design's job is to let them emerge.

### 1.3 Atom-layer vs compound-layer symbolic distinction

The §13 style guide distinguishes two coexisting notation registers:

- **Atom-layer (§13.9):** lowercase, descriptive, sentence-like. Applied to rows where `base_trick == slug` (foundational atoms).
  Example: `[set] > hippy in dex > op toe`

- **Compound-layer (§13.2-§13.8):** UPPERCASE, structured, role-tokenized. Applied to all other rows.
  Example: `CLIP > OP IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]`

Registry mode renders both. The lowercase/UPPERCASE split is itself a topology cue: a reader scanning the registry sees atoms quietly anchoring the language while compounds carry the structural rhythm above them. The visual register difference is intentional, not an accident.

---

## 2. Locked v1 spec

| Decision | Locked value |
|---|---|
| Route | `/freestyle/tricks?view=registry` |
| Default for `/freestyle/tricks` | Unchanged (card view by ADD) |
| Promotion to default | Deferred until operational-notation coverage reaches ~60% |
| Row format | Format B (two visual lines per row: slug+ADD on line 1; notation+`≡` reading(s) on line 2) |
| Chain reading depth | Max 2 `≡` lines per row; deeper readings truncate with ellipsis and surface on detail page |
| Pending rows | Filtered out by default; `?include_pending=1` opt-in for curator triage |
| Primary grouping | ADD bucket, ascending (3, 4, 5, 6, 7) |
| Secondary grouping | Family cluster inside each bucket |
| Within-family sort | Slug alphabetical |
| Family-anchor chips | Deferred (post-v1; useful only when filter/search/multi-family intersections appear) |
| Click target | Whole row navigates to `/freestyle/tricks/{slug}` |
| Terminal dim treatment | Family terminal pattern rendered at reduced opacity (~70%) within family block |
| New JS | None (pure CSS + Handlebars) |
| New endpoints | None (query-param variant of existing route) |

---

## 3. Design principles

### 3.1 Terminal-pattern principle

> **The terminal of a compound row encodes its family. Within a family cluster, the terminal is a visual constant; the differentiating action lives in the middle.**

Observed terminal patterns:

| Terminal | Family |
|---|---|
| `OP CLIP [XBD] [DEL]` | butterfly family |
| `OP TOE [DEL]` | mirage family |
| `SAME CLIP [XBD] [DEL]` | drifter family |
| `SAME TOE [DEL]` | pickup / legover family |

When rows are clustered by family, the terminal repeats across every row in the cluster. The reader's eye does not need to re-parse the family signature on each row; it is established by the cluster header.

**Render-side implication:** the terminal is dimmed inside a family block. The differentiating middle pops. The dimmed terminal still teaches, still confirms topology, still resolves on close reading; it simply stops competing for attention with the row's unique content.

This is **informational compression, not data hiding.** The data is fully present. The visual weight reflects the information's role in scanning.

### 3.2 Family-topology emergence

Grouping by family inside an ADD bucket is not an organizational scheme; it is the pedagogical mechanism by which the language teaches itself.

A reader scanning a 4-ADD bucket organized alphabetically sees a flat list. The same bucket grouped by family reveals:

```
─── 4 ADD ─────────────────

butterfly family
  #dimwalk, #ripwalk, #parkwalk, ...

osis family
  #blender, #torque

drifter family
  #smoke, #vortex
```

Suddenly "butterfly family" teaches ripwalk + dimwalk + parkwalk + phoenix + bigwalk as a coherent movement neighborhood. The 4-ADD bucket stops being a difficulty stratum and becomes a window onto the family topology at that level.

This emergence is the strongest pedagogical lever in the design.

### 3.3 Terminal dimming as informational compression

A dimmed terminal pattern (e.g., 70% opacity on `OP CLIP [XBD] [DEL]` inside a butterfly cluster) is not data redaction. The dimmed text is fully readable on close inspection. It is **visual prioritization**: the eye is guided to the differentiator first, the family confirmation second.

This treatment matters because it preserves the **honesty** of the notation while reducing its **scanning friction**. The row is complete; the row is also fast to scan. Both properties hold simultaneously.

### 3.4 Restraint over completeness

Registry mode shows enough symbolic content to scan the structural signature. It does not show everything the dictionary knows about a row. The discipline is:

- Operational notation: yes
- Slug + ADD + family hint: yes
- Up to 2 `≡` readings: yes
- Media, records, ancestry, modifier links, decomposition prose, pathway crosslinks: **no** (those belong on the detail page)

If a reader needs the depth, one click. If a reader needs the scan, registry mode delivers it without depth.

---

## 4. Behavioral rules

### 4.1 Pending rows are filtered out by default

Why: registry mode is the **scan surface**. A scan surface with half-populated rows visually dilutes:

- symbolic confidence
- density
- rhythm
- topology clarity

The reader should feel that what they are scanning is authoritative. A `?include_pending=1` switch exists for curator triage, but it is not the default. Registry mode reads as a finished corpus, even when the corpus is still growing.

### 4.2 Registry remains opt-in until ~60% coverage

Coverage thresholds (per OP-NOTATION-COVERAGE-WAVE-1 §E):

| Coverage | Registry mode state |
|---|---|
| <25% | Curator dashboard; not viable as user-facing browse |
| ~25-40% | Opt-in; useful for early-adopter readers + curator coverage tracking |
| ~40-60% | Opt-in but recommended; surfaces meaningful portion of the dictionary |
| ~60-80% | Candidate for default; first-12-row scroll mostly populated |
| >80% | Default; card view becomes the alternate |

Current state (post Wave-1B Tier-1): 30.0%. Registry mode is positioned in the "opt-in; useful for early-adopter readers" band. Promotion to default is a separate downstream decision triggered by coverage crossing the threshold, not by elapsed time.

The opt-in posture is not a rollout caution; it is a **truthfulness posture**. Defaulting to registry mode at 30% would misrepresent the dictionary's symbolic completeness. The card view at 30% notation coverage is honest: most cards say "Notation pending" and the reader understands. Registry mode at 30%, filtering pending, hides what is still under construction. That tradeoff is appropriate as a curator/scholar surface but inappropriate as the public default.

### 4.3 No new symbolic grammar in registry mode

Registry mode is purely a **render** of existing data. It introduces no new fields, no new tokens, no new parser hooks, no new ontology, and no new symbolic vocabulary. The 12+ months of accumulated symbolic-grammar work is what makes registry mode possible; registry mode adds zero work to that grammar.

---

## 5. What registry mode is NOT

This list exists because the system has repeatedly avoided drifting into compiler-style notation. The restraint is part of the design philosophy now and deserves explicit naming.

Registry mode is **not**:

- **Not parser output.** The notation strings rendered are curator-authored, not parser-emitted.
- **Not AST visualization.** No tree structure, no node hierarchy, no nested expression display.
- **Not machine serialization.** The rendered form is for human reading, not for downstream programmatic consumption. The strings in `operational_notation` are stable for storage but their rendering is freely typographic.
- **Not exhaustive decomposition display.** Registry mode shows max 2 `≡` readings per row; deeper transitivity belongs on detail pages and symbolic-depth surfaces.
- **Not ontology debugging.** Curator tools (the coverage-diff report, the audit CSVs, the alias-review queue) live elsewhere. Registry mode is for readers, not for curators inspecting data quality.
- **Not a competitor to the card view.** The two modes serve different cognitive intents. Registry mode does not replace cards; the two surfaces cooperate.

If a proposed feature pushes registry mode toward any of the above, it is out of scope. The discipline is to keep registry mode **a movement-language scan surface**, nothing more.

---

## 6. Open questions deferred to post-v1

These do not block v1 implementation. Logged for future consideration.

| Question | Trigger for revisit |
|---|---|
| Family-anchor chip layer | When filter/search/multi-family intersections appear |
| Family-shared-prefix dimming (e.g., dim the `CLIP > (BACK) SPIN [BOD] >` opening shared by surging compounds within their family block) | Phase-2 visual polish after v1 ships |
| Density toggle (`?density=tight` ultra-wide, `?density=loose` accessibility) | Reader feedback after v1 ships |
| Sort variants (descending ADD, family-first, slug-first) | Reader feedback after v1 ships |
| Pending-row coverage dashboard | When operational-notation coverage drives become an active curator workflow |
| Search / filter UI | When the populated row count exceeds ~100 |
| Saved-view links / linkable filter URLs | Same threshold |

---

## 7. Implementation deferral note

This document does not authorize implementation. The implementation slice (REGISTRY-MODE-V1) will:

1. Add `?view=registry` to `/freestyle/tricks` route handling
2. Service-shape a new view-model (`FreestyleRegistryContent`) that buckets active rows with non-null `operational_notation` by ADD then by family
3. Render via a new Handlebars partial (`registry-row.hbs`) and a registry-only stylesheet block
4. Cover with integration tests asserting: bucket headers present, family clusters present, pending rows absent by default, `?include_pending=1` toggle works, terminal-dim CSS class applied, click-target on whole row
5. Update `VIEW_CATALOG.md` Freestyle tricks index entry to document the new view

Implementation is deferred until the human explicitly initiates that slice.

---

## 8. Cross-references

- `NOTATION_STYLE_GUIDE.md` §13 — operational-notation grammar (compound-layer + atom-layer)
- `OPERATIONAL_NOTATION_GRAMMAR.md` — FM corpus grammar analysis (federation track)
- `OP_NOTATION_WAVE_1A_DRAFT.csv` — atom-layer authoring; Wave-1A
- `OP_NOTATION_WAVE_1B_DRAFT.csv` — compound-layer authoring; Wave-1B
- `coreTrickRegistry.ts` — irreducible-atom set (12 slugs)
- `freestyleSymbolicEquivalences.ts` — curator chain decompositions (39 entries)
- `freestyleOperatorReference.ts` — intermediate-operator reference (10 entries)
