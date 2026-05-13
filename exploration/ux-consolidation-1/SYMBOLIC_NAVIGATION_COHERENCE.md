# SYMBOLIC_NAVIGATION_COHERENCE — Navigation Flow Audit + Philosophy

UX-CONSOLIDATION-1 Task B. Analyzes how users discover, traverse, and exit the symbolic subsystem. Proposes a unified navigation philosophy that complements the future Layer-1 ADD-view and family-view browse modes.

**Date:** 2026-05-12

---

## 1. Current navigation paths INTO symbolic surfaces

| Entry point | Lands on | Notes |
|---|---|---|
| Direct URL → `/freestyle/progression/walking-family` | Walking Progression page | No discovery surface; URL-only |
| Direct URL → `/freestyle/modifier/spinning` | Spinning Modifier page | No discovery surface; URL-only |
| `/freestyle/glossary` scroll to §13 | Glossary Connective panels | Buried below 12 canonical sections |
| Any of 8 flagship trick pages → scroll past Related Tricks | Related Topology panel | Embedded; readers find it while reading the trick page |
| Glossary §13 spinning panel → "Learn more about Spinning →" | Spinning Modifier page | Only deep-link between symbolic surfaces |

**Verdict:** The symbolic subsystem is **largely undiscoverable** from the main public surface. Three of four surfaces require either direct URL knowledge OR scrolling deep into glossary. Only the Related Topology panel is reachable through normal page-reading on the 8 flagship trick pages.

---

## 2. Current navigation paths BETWEEN symbolic surfaces

| From | To | Path |
|---|---|---|
| Walking Progression page | Glossary | "Related glossary terms: …" links (bare; no fragments) |
| Walking Progression page | Trick page | Step name link |
| Spinning Modifier page | Trick page | Progression step + cross-base example links |
| Spinning Modifier page | Glossary | "Browse the glossary →" at end |
| Glossary §13 panel | Spinning Modifier page | "Learn more about Spinning →" (spinning panel only) |
| Glossary §13 panel | Trick page | Trick chip in panel |
| Related Topology panel | Trick page | Trick chip in panel |
| Trick page → Spinning Modifier page | (NONE) | Gap |
| Trick page → Walking Progression page | (NONE) | Gap |
| Walking Progression page → Spinning Modifier page | (NONE) | Gap |
| Spinning Modifier page → Walking Progression page | (NONE) | Gap |

**Verdict:** The symbolic subsystem has **no internal cross-navigation** between the three full pages (walking progression / modifier page / glossary §13). Each is a leaf. Trick pages don't link OUT to any educational surface beyond the canonical trick dictionary.

---

## 3. Current navigation paths OUT of symbolic surfaces

Every symbolic surface offers a way back to:
- Canonical trick pages (via trick-name links)
- Canonical glossary (via "Browse the glossary" or "Related glossary terms")

**No symbolic surface offers a way to:**
- Discover sibling symbolic surfaces (walking progression doesn't mention modifier page; modifier page doesn't mention walking progression)
- See an index of symbolic surfaces

**Verdict:** Exits are clean (back to canonical), but lateral exploration between symbolic surfaces is impossible without URL knowledge.

---

## 4. Breadcrumb consistency audit

| Surface | Breadcrumb |
|---|---|
| Walking Progression | `Freestyle / Walking-family progression` |
| Spinning Modifier | `Freestyle / Modifier / Spinning` — middle "Modifier" links to `/freestyle` (root, not a modifier index) |
| Glossary | `Freestyle / Glossary` |
| Trick page (canonical, not symbolic) | varies by existing pattern |

**Issue surfaced:** the Spinning Modifier breadcrumb has a middle `Modifier` segment that links to `/freestyle` (the root). This implies an intermediate index page exists at `/freestyle/modifier` — but no such page is shipped. The breadcrumb misleads.

**Two repair options:**

| Option | Pros | Cons |
|---|---|---|
| **A: Drop the middle `Modifier` breadcrumb** — collapse to `Freestyle / Spinning` | matches what exists today (no `/freestyle/modifier` index) | loses semantic context |
| **B: Build a `/freestyle/modifier` index page** as a symbolic landing point | enables discovery; makes the breadcrumb honest; centralizes symbolic-page links | new route (out of UX-CONS-1 scope) — but the brief allows minor breadcrumb fixes |

**Light-cleanup recommendation: Option A** for this consolidation phase (drop the misleading middle segment). Option B becomes the foundation of a future symbolic-index page.

---

## 5. "Learn more" / cross-link pattern audit

Three different "go deeper" affordances exist:

| Pattern | Where it appears |
|---|---|
| `Related glossary terms: paradox, stepping, butterfly.` | Walking Progression page; comma-separated inline links |
| `Browse the glossary →` | Spinning Modifier page footer |
| `Learn more about Spinning →` | Glossary Connective panel (spinning only) |

These are not strictly inconsistent — they serve different navigation intents — but they use three different visual patterns for "next step" linking.

**Recommendation:** keep visual variety BUT normalize the arrow/no-arrow convention. Currently the right-arrow `→` is used by the latter two; the inline `Related glossary terms:` pattern uses no arrow. Light cleanup could add an arrow to the inline pattern for consistency: `Related glossary terms: paradox →, stepping →, butterfly →` — but this clutters. **Better:** keep `→` reserved for "out to a different page section/surface" CTAs, and inline links for in-line cross-references. Current usage already mostly respects this; minor tightening only.

---

## 6. Glossary-link behavior

The Walking Progression page surfaces glossary terms as bare `/freestyle/glossary` links. This means clicking "stepping" on the ripwalk step lands on the glossary's top, NOT on a glossary entry for "stepping" specifically. The glossary page is long; finding "stepping" via in-page browse is friction.

**Future-state recommendation:** when the glossary supports fragment IDs per term (e.g., `<span id="term-stepping">`), update progression glossary-link `href` values to `/freestyle/glossary#term-stepping`. This is a small data-shaping change on the service side once the glossary anchors exist.

**Caveat:** the glossary §13 connective panels already have anchor IDs (`#glossary-panel-paradox` etc.). Progression / modifier pages could already link to those when relevant: e.g., the walking progression's "stepping" glossary link could become `/freestyle/glossary#glossary-panel-stepping` IF a stepping panel existed. **It doesn't** (stepping isn't one of the six terms in Phase 7). So no immediate change; flag for future.

---

## 7. Modifier-page discoverability

The Spinning Modifier page is currently the system's **deepest** educational asset — six teaching sections, coach-tone prose, diagram placeholder. Yet it's reachable from only ONE place in the application: the glossary §13 spinning panel.

| Discoverability path | Status |
|---|---|
| From `/freestyle` landing page | not linked |
| From any trick page | not linked |
| From `/freestyle/tricks` index | not linked |
| From `/freestyle/glossary` §13 spinning panel | **only path** |
| From `/freestyle/moves` (notation reference) | not linked |
| From `/freestyle/progression/walking-family` | not linked |

This is the **largest navigation-coherence gap** in the subsystem. The most-effortful surface is the hardest to find.

---

## 8. Proposed unified navigation philosophy

The symbolic subsystem complements three eventual browse modes:

### Mode A: ADD-view browsing (Layer 1, future)

Users browse all tricks at a given ADD level (e.g., "show me all 4-ADD tricks"). The symbolic layer should NOT compete with this. ADD view is a canonical ontology surface; symbolic surfaces remain supplementary.

**Symbolic complement to ADD view:** none global; tricks in the ADD-view list can carry a small icon indicating which symbolic surfaces reference them (e.g., "appears in walking progression" or "documented on spinning modifier page"). Minimal in-list adornment, not a separate symbolic browse mode.

### Mode B: Family-view browsing (Layer 1, future)

Users browse all tricks in an IFPA family (e.g., "show me all whirl-family tricks"). Symbolic surfaces should NOT compete with this. Family view IS canonical.

**Symbolic complement to family view:** a single CTA per family-view page like "Educational deep-dive on the whirl family →" pointing to whichever symbolic surface is most relevant (walking progression for butterfly family; spinning modifier page for whirl, etc.).

### Mode C: Symbolic exploratory navigation

Users want to learn HOW things compose, not just browse what exists. This is what the four symbolic surfaces serve. They should be:
- **Discoverable** from a single index page (proposed: `/freestyle/learn` or `/freestyle/symbolic`)
- **Interlinked** — modifier pages link to relevant progressions; progressions link to relevant modifier pages
- **Reversible** — every symbolic surface offers a clear path back to canonical content

---

## 9. Recommended navigation architecture

```
                       /freestyle/   (canonical landing)
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        /freestyle/      /freestyle/      /freestyle/
          tricks         glossary        progression/                      ◄── canonical Layer 1
        (canonical)     (canonical;       walking-family
          + filters       §13 has         (symbolic; reachable
          ADD/family       symbolic        via glossary link only at present)
          coming later)    panels at        │
                           bottom)          │
                              │             │
                              └─────────────┘
                                    │
                                    ▼
                            /freestyle/modifier/         ◄── proposed future symbolic-index page
                                    │
                                    ▼
                            /freestyle/modifier/spinning  ◄── deep-dive teaching surface
```

### Specifically:

1. **Trick pages stay canonical-first.** The embedded Related Topology panel (Surface 1) is the ONLY symbolic addition to trick pages and it's correctly subordinate. No additional symbolic CTAs on trick pages.
2. **Glossary §13 connective panels stay** — they're the natural lateral-exploration entry point to symbolic surfaces.
3. **Walking Progression page** stays as a curated chain; gains discoverability via glossary panel deep-link (currently absent) AND via a future butterfly/ripwalk trick-page CTA.
4. **Spinning Modifier page** stays as a deep-dive; gains discoverability via glossary panel deep-link (already shipped) AND via a future modifier-index page.
5. **Future: `/freestyle/learn` or `/freestyle/symbolic` landing** — small index page listing the symbolic surfaces. Discoverable from `/freestyle` landing. Not in this consolidation phase.

---

## 10. Specific in-page nav recommendations (no implementation here)

These are recommendations only; implementation belongs in a future UX-SHIP-2 phase.

| Recommendation | Surface affected | Risk |
|---|---|---|
| Add "Educational: walking-family progression" link on butterfly trick page (and on each walking-family trick page) | trick pages × 5-8 | low; same pattern as existing related-tricks |
| Add "Spinning modifier educational page →" link on whirl trick page + on spinning-X trick pages | trick pages × 5-10 | low |
| Drop misleading `Modifier` middle breadcrumb on `/freestyle/modifier/spinning` | spinning page | trivial cleanup; do now |
| Walking Progression page footer: add cross-link to spinning modifier page (when reader reaches matador/phoenix steps, they may want to learn about nuclear / pixie / ducking modifiers next) | walking progression page | low |
| Spinning Modifier page: add cross-link to walking progression page from the cross-base "matador on butterfly" entry | spinning page | low |
| Build `/freestyle/learn` symbolic index page listing all surfaces | new route | medium; out of scope this phase |
| Add fragment-anchor support for glossary terms | glossary | medium; out of scope this phase |

---

## 11. Unified navigation philosophy (one paragraph)

The symbolic subsystem is **a supplementary educational layer** to the canonical IFPA ontology. Canonical surfaces (trick pages, glossary §1-12, future ADD/family browse) are authoritative; symbolic surfaces (Related Topology panel, Walking Progression page, Modifier-family pages, Glossary §13 panels) supplement them. **Navigation between symbolic surfaces should be explicit and visible.** Navigation from symbolic surfaces back to canonical content is the default expectation — users always know how to return to the trick dictionary. **The future ADD-view and family-view of Layer 1 browsing should treat symbolic surfaces as referenceable destinations** (small per-trick indicators when a trick appears in a progression / modifier page) but should NOT replicate symbolic content inline. The symbolic layer remains observational; the ontology remains canonical.

---

## 12. Cross-references

- SYMBOLIC_SUBSYSTEM_AUDIT.md — surface inventory feeding this audit
- SYMBOLIC_VISUAL_CONSOLIDATION.md — light cleanup including breadcrumb fix
- LAYER1_SYMBOLIC_INTEGRATION.md — extends navigation philosophy to ADD/family browse modes
- DELIVERABLES_AND_RECOMMENDATION.md — final phase recommendation
