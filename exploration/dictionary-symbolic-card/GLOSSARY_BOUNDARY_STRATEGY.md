# GLOSSARY_BOUNDARY_STRATEGY

**Project:** DICTIONARY-SYMBOLIC-CARD-1 — Task G
**Scope:** Clarify the role of the glossary relative to the dictionary, modifier-family pedagogy pages, and the symbolic surfaces. Define the cross-link contract (anchors in both directions), the role of the symbolic §13 connective panels, and how the PassBack glossary intake integrates without competing with canonical surfaces.
**Companion docs:** [`SYMBOLIC_CARD_SPEC.md`](./SYMBOLIC_CARD_SPEC.md), [`NOTATION_LAYER_STRATEGY.md`](./NOTATION_LAYER_STRATEGY.md), [`COMPONENT_VIEW_REDESIGN.md`](./COMPONENT_VIEW_REDESIGN.md), [`UNIFIED_DICTIONARY_VIEW_PLAN.md`](./UNIFIED_DICTIONARY_VIEW_PLAN.md).
**Out of scope:** Glossary content authoring, schema changes, PassBack pipeline modifications. This document specifies boundaries and contracts; later phases write content within them.

---

## 1. The core distinction

| Surface | Question it answers | Primary unit | Anchor concept |
|---|---|---|---|
| **Glossary** | What does this term *mean*? | The term | Vocabulary, mechanics, definitions |
| **Dictionary** | What tricks exist; what are they made of? | The trick | Canonical structural identity |
| **Modifier-family pedagogy pages** | How does this modifier work, physically and mechanically? | The modifier | Embodied teaching |
| **Symbolic browse views** | What tricks share this structural ingredient? | The component group | Symbolic relationship |

These are four jobs. Each surface does one job well. The boundary between them is **load-bearing for the user's mental model**: a reader who knows where each kind of question is answered scrolls confidently. A reader who finds tricks browsed in three different places stops trusting any of them.

**The glossary is the vocabulary layer.** It tells the reader what a word means. It does NOT browse tricks; the dictionary does. When the glossary needs to reference tricks, it points at the dictionary; it never embeds a browse experience.

---

## 2. What the glossary explains

The glossary's job is **terminology and mechanics**. The set of terms the glossary owns:

### 2.1 Modifier vocabulary
- alpine, atomic, blurry, ducking, diving, weaving, zulu, paradox, pixie, fairy, furious, gyro, inspin, nuclear, quantum, spinning, stepping, swirl, symposium, xdex

### 2.2 Movement and mechanics vocabulary
- dex, hippy, leggy, muted, symple, x-dex, set, midtime, downtime, uptime, plant, stall, delay, kick, catch

### 2.3 Body-region vocabulary
- toe, clipper, inside, outside, knee, head, hip

### 2.4 Notation / structural vocabulary
- ADD, base trick, modifier, set primitive, family, anchor, family ladder, run, density, drop, dropless, clean, sloppy, thin, slurry, froggy

### 2.5 Notation reference (§8 + §9)
- Jobs notation reference: tokens, roles, three worked semantic examples
- Operational notation reference: tokens, flags, sides, directions, sequence operators, pre-state flags

### 2.6 Run-quality vocabulary
- Tiltless, Guiltless, Tripless, Fearless, Beastly, Godly, Genuine, BOP

The glossary explicitly does NOT own:
- Trick-level definitions (those live in the dictionary)
- Trick lists by component (those live in the component view)
- Modifier teaching ("how do I learn to do paradox") — that's the modifier-family page

### 2.7 What "explanation" means here

A glossary entry is a **definition plus mechanical context**. Not a tutorial. Not a step-by-step. Examples:

- **paradox** (good): "A hip pivot between two dexes on the same set. The body shifts sides while the set leaves and returns to the same foot. +1 ADD as a universal body modifier."
- **paradox** (wrong, too long): "Paradox is one of the most important body modifiers in freestyle. To learn it, start by practicing the hip pivot in slow motion. Once you have the timing, layer it onto mirage..." — that's a teaching page, not a definition.

The glossary's tone is **descriptive and compact**. Teaching tone lives on `/freestyle/modifier/{slug}`.

---

## 3. What the dictionary browses

The dictionary at `/freestyle/tricks` (and all its `?view=` variants) browses **tricks**. Each trick is a single row in `freestyle_tricks`. Browse views differ only in grouping (per `UNIFIED_DICTIONARY_VIEW_PLAN.md` and `COMPONENT_VIEW_REDESIGN.md`); every card is a trick.

The dictionary does NOT define terminology. When a card shows `paradox` as a modifier in its operational notation, the reader who doesn't know what paradox means follows the link to the glossary entry for paradox. The dictionary never embeds the definition inline; it points to it.

---

## 4. The cross-link contract (both directions)

Each surface links *at* the other surface where the reader's next question naturally lives.

### 4.1 Glossary → Dictionary

When a glossary entry references tricks, it does so **by example, not by exhaustion**:

> **paradox** — A hip pivot between two dexes on the same set. The body shifts sides while the set leaves and returns to the same foot. +1 ADD as a universal body modifier. Common compounds: [paradox mirage](/freestyle/tricks/paradox-mirage), [paradox whirl](/freestyle/tricks/paradox-whirl), [paradox blender](/freestyle/tricks/paradox-blender). [Browse all paradox tricks →](/freestyle/tricks?view=component#paradox)

Three named examples + one "browse all" deep-link. The glossary entry never tries to enumerate every paradox compound; it provides a starting point and points at the dictionary's exhaustive view.

### 4.2 Dictionary → Glossary

Per [`feat(freestyle/glossary): per-term fragment anchors + deep-link resolver`](../../src/services/glossaryAnchors.ts) (already shipped):

- Walking-progression glossary-links use `glossaryHrefForTerm()` to deep-link
- Modifier-family `glossaryHref` deep-links to the term's §13 panel
- Future trick-detail pages may surface inline glossary anchors for in-card modifier tokens (operational notation linkified token-by-token)

The dictionary uses **fragment anchors**, not bare URLs:
- `/freestyle/glossary#term-paradox` for §3 quick-reference entries
- `/freestyle/glossary#glossary-panel-paradox` for §13 connective panels (richer entries)

### 4.3 Modifier-family pages ↔ glossary

Already shipped (Phase 4: glossary fragment anchors). Modifier-family pages link to the modifier's §13 connective panel; §13 panels' "Learn more about X →" link returns the reader to the modifier page when one exists. The round-trip works.

### 4.4 Modifier-family pages ↔ dictionary

Not yet shipped. Future enhancement: each modifier-family page's "cross-base examples" section could include a "Browse all X tricks →" link to the component view (`/freestyle/tricks?view=component#X`). Recommended for the next phase that touches modifier-family pages; not in scope for Batch 3.

---

## 5. Anchor strategy (recap of shipped + future)

### 5.1 Currently shipped

The glossary page carries two anchor families:

| Family | Format | Source | Count |
|---|---|---|---|
| Foundational-trick anchors | `id="term-{slug}"` | §10 list items | 12 (clipper, mirage, legover, pickup, illusion, whirl, butterfly, swirl, osis, pixie, fairy, around-the-world) |
| Modifier quick-reference | `id="term-{slug}"` | §3 dl block | 6 (stepping, paradox, spinning, ducking, symposium, cross-body) |
| Connective-panel anchors | `id="glossary-panel-{slug}"` | §13 panels | 6 (paradox, symposium, ducking, spinning, whirl, pixie) |
| Operational notation references | `id="op-flag-{slug}"`, `id="op-side-{slug}"`, etc. | §9 dl entries | ~20 |

The resolver in `glossaryAnchors.ts` prefers §13 panel anchors over `term-` anchors when a panel exists. Bare URL fallback for unknown terms.

### 5.2 Anchor strategy for the future

The boundary strategy assumes glossary anchors are the **authoritative landing point** for any in-prose modifier reference site-wide. Future enhancements:

| When new vocabulary is added | What gets added |
|---|---|
| A new body modifier joins the symbolic-modifier-groups registry | A new `term-{slug}` anchor in §3 (or a richer §13 panel if richness warrants); resolver updated |
| A new foundational trick (rare) joins the canonical roster | A new `term-{slug}` anchor in §10 |
| A new operational-notation token is accepted by the tokenizer | A new `op-{role}-{slug}` anchor in §9 |
| A glossary §13 connective panel is added for a new term | The §13 dl gains an entry with `glossary-panel-{slug}` |

The resolver is updated alongside; coverage is sustained.

### 5.3 Anchor stability invariant

Glossary anchors are **public API**. Renaming an anchor breaks every link site-wide. Once shipped:
- Anchor slugs do not change.
- If a term's anchor needs to move (e.g., promoting `term-paradox` to a richer §13 panel), the old anchor stays as a redirect (HTML id on a `<span>` element next to the new one) so existing inbound links keep working.
- The resolver maps both stale and new term keys to the current canonical anchor.

This is the same stability discipline applied to URLs.

---

## 6. The symbolic §13 role

The §13 connective panels are a **first-class glossary surface**, not a sidebar feature. They exist because some terms are richer than a one-line definition and want a structured panel:

- A short coach-tone definition (1–3 sentences)
- A list of representative tricks that use the term
- Related symbolic groups (cross-axis affordances)
- A notation hint (when applicable)
- A "Learn more about X →" deep-link to the modifier-family page (when one exists)

§13 panels are **observational** — they layer onto the dictionary's canonical structure without rewriting it. The badge + footer attribution makes this explicit.

The §13 connective panels and the modifier-family pages are **NOT** the same thing:

| Surface | Purpose | Length | Voice |
|---|---|---|---|
| §13 panel | Connect a term to its tricks and groups | ~10 lines | Definition + lists |
| Modifier-family page | Teach the modifier physically | 6 sections (~3 pages) | Coach-tone embodied prose |

A user who lands on §13 has the question *"where does this term show up?"* answered. A user who lands on the modifier-family page has the question *"how do I do this modifier?"* answered. Each surface serves one job. The boundary is preserved.

---

## 7. PassBack glossary integration role

The PassBack glossary intake (`exploration/passback-intake/passback_glossary_staging.csv`, 180 terms) is a **separate corpus**. It is read-only relative to the IFPA-canonical glossary; it does not auto-import into the canonical glossary template.

The integration model:

### 7.1 PassBack as comparison source

`GLOSSARY_COMPARISON_MATRIX.csv` (from `glossary-synthesis-1`) cross-references each PassBack term against IFPA canonical state. The matrix outputs decisions per term: PROMOTE / STAGE / REVIEW / canonical-aligned / community-only. Curator triage of those decisions is a separate workstream.

### 7.2 PassBack-canonical alignment as a long-running project

GLOSSARY-SYNTHESIS-1 projected v4 of the glossary at ~170 entries (vs the current v3 at ~25 prose entries + 6 §13 panels + 12 §10 items + 6 §3 items). That growth is curator-led, not auto-generated. Each new entry crosses a review gate; PassBack terms are sources of evidence, not authoritative additions.

### 7.3 The boundary

**PassBack vocabulary does NOT appear in the canonical glossary surface until it's curator-promoted.** The PassBack staging CSV is exploration-only data; the glossary page reads from the canonical IFPA glossary structure (currently the static §1–§13 content + symbolic-grammar-2 CSV for §13 panels).

When PassBack terms ARE promoted, they join via:
- §3 modifier quick-reference (terms that map to existing modifiers)
- §13 connective panels (terms rich enough to warrant a panel)
- New top-level §X sections (only when a whole new category of vocabulary emerges; rare)

### 7.4 PassBack-specific renderings (representation layer 6)

Per `NOTATION_LAYER_STRATEGY.md` §2, layer 6 is the PassBack rendering of a trick name. This is **trick-level**, not glossary-level. PassBack renderings of trick names live on trick-detail pages as alternate display strings; PassBack vocabulary of terms lives in the comparison-matrix workflow, not the glossary surface.

---

## 8. What must NOT happen

These are anti-requirements. Each one would break the boundary.

### 8.1 No trick browsing in the glossary

The glossary must never become a place where users browse tricks. It can name examples (§4.1) and deep-link to the component view; it must never:

- Render a list of all tricks containing a term
- Render trick cards inline within a glossary entry
- Build its own browse-mode toggle (`?view=by-glossary-term` and similar)

The component view at `/freestyle/tricks?view=component` is the home for "browse all tricks with X". The glossary's job is the definition.

### 8.2 No moving modifier pedagogy into the glossary

Modifier-family pages (`/freestyle/modifier/{slug}`) stay as separate surfaces. Their content is intentionally longer-form and embodied. Merging that content into a glossary §X section would compromise the glossary's compactness and the pedagogy's discovery (the modifier page is a destination; the glossary is a reference).

### 8.3 No content duplication in both directions

A modifier definition lives in **one** authoritative place:
- The §3 / §13 glossary entry is the definition
- The modifier-family page is the teaching surface

If the modifier-family page wants to show the definition, it does so by deep-linking to the glossary anchor, not by copying the prose. Drift between two copies will eventually surface as a curator-time bug.

### 8.4 No auto-injection of PassBack content

The PassBack glossary intake must never write into the canonical glossary template. Curator review is the gate; without it, contradictory or community-only terminology lands in a surface that purports to be authoritative.

---

## 9. Glossary content roadmap (informational; not in scope for Batch 3)

The trajectory the boundary supports:

| Phase | Add | Approach |
|---|---|---|
| Now (shipped) | 12 foundational-tricks anchors + 6 §3 modifier quick-ref + 6 §13 panels + 13-section static content | Curator-authored |
| 1 | Expand §3 to cover all currently-named modifiers in `symbolic_modifier_groups.csv` (≈10–12 entries; adds atomic, alpine, blurry, gyro, inspin, nuclear, pixie, quantum, swirl, weaving, diving, zulu, xdex) | Curator-authored; rich entries get §13 panels |
| 2 | Add §13 panels for new high-value terms (atomic, alpine, nuclear, gyro, inspin) | Curator-authored; richer than §3 quick-ref |
| 3 | Promote PassBack-only canonical-aligned terms via curator review (per GLOSSARY-SYNTHESIS-1 outputs) | Curator-led; PassBack staging → review → promotion |
| 4 | Add a §14 "Glossary index" — a flat alphabetical index of every defined term linking back to its definition anchor | Auto-generated from glossary structure; one curator review pass |

None of these phases is in scope for Batch 3. The boundary strategy ensures each phase can land safely without compromising the dictionary's role.

---

## 10. Summary table — surface boundaries

| Question | Surface |
|---|---|
| "What does the term *paradox* mean?" | `/freestyle/glossary#term-paradox` or `#glossary-panel-paradox` |
| "How do I learn to do paradox?" | `/freestyle/modifier/paradox` |
| "Show me a paradox trick I can try." | Glossary deep-link to a representative trick (§4.1) |
| "Show me all paradox tricks." | `/freestyle/tricks?view=component#paradox` |
| "What's the canonical structure of paradox mirage?" | `/freestyle/tricks/paradox-mirage` |
| "What's the PassBack convention for naming this?" | PassBack-rendering field on trick-detail (when populated) |
| "How is paradox related to xdex?" | §13 paradox panel "Related symbolic groups" list |

Each row has exactly one surface as its primary home. Cross-links between surfaces preserve the boundary while letting the reader navigate.

---

## 11. Constraints honoured

- No glossary content rewritten in this document
- No canonical-data mutation
- No schema changes
- No parser changes
- No PassBack auto-import
- Observational-layer separation preserved on §13 panels
- Modifier-family pedagogy pages remain at `/freestyle/modifier/{slug}` — never merged into glossary

---

## 12. Cross-references

- `SYMBOLIC_CARD_SPEC.md` — the card the dictionary uses (Task B)
- `NOTATION_LAYER_STRATEGY.md` — the 8-layer model (Task C; representation layer 8 = alias, layer 6 = PassBack rendering)
- `COMPONENT_VIEW_REDESIGN.md` — where "browse all paradox tricks" lives (Task E)
- `UNIFIED_DICTIONARY_VIEW_PLAN.md` — the unified browse surface (Task F)
- `NOTATION_SURFACE_AUDIT.md` — current state of §8 + §9 + §13 (Task A)
- `src/services/glossaryAnchors.ts` — the deep-link resolver (shipped)
- `exploration/passback-intake/passback_glossary_staging.csv` — PassBack staging corpus
- `exploration/glossary-synthesis-1/GLOSSARY_ARCHITECTURE_V4.md` — the 4-layer glossary architecture (canonical / educational / symbolic / operational)
- `feedback_modifier_public_visibility.md` — modifier-stub exclusion rule
- `feedback_phased_scope_control.md` — curator-led promotion path for PassBack terms

---

*End of GLOSSARY_BOUNDARY_STRATEGY.md*
