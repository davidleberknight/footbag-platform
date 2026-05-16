# SYMBOLIC_DENSITY_AUDIT — Cognitive + Visual Density Analysis

UX-CONSOLIDATION-1 Task D. Per-surface audit of information density, mobile rendering, scroll rhythm, and overload risk.

**Date:** 2026-05-12

---

## 1. Density rating per surface

| Surface | Cognitive density | Visual density | Mobile density | Scroll length |
|---|:-:|:-:|:-:|:-:|
| 1 Related Topology panel | LOW | LOW | LOW | minimal |
| 2 Walking Progression page | MEDIUM | MEDIUM | MEDIUM-HIGH | long single page |
| 3 Spinning Modifier page | HIGH | HIGH | HIGH | very long |
| 4 Glossary Connective panels | MEDIUM (in aggregate) | MEDIUM (in aggregate) | HIGH (collapses to single column) | adds significantly to glossary page total |

---

## 2. Surface 1 — Related Topology panel (LOW density)

**Profile:** ~6 trick chips with name + ADD + hashtag; ~60-100 lines of rendered HTML. Sits subordinate to canonical Related Tricks.

**Mobile:** chips flex-wrap; padding reduces. Reads cleanly on small screens.

**Overload risk:** none. The panel is correctly small.

**Recommendation:** **keep always visible** (do not collapse). It's the most discoverable symbolic surface and the lowest-risk addition. Density is fine.

---

## 3. Surface 2 — Walking Progression page (MEDIUM density)

**Profile:** 7 step cards, each ~150-200 words of rationale + symbolic note + glossary links + step header (number + name + ADD + modifier-added label). Total scroll: ~1500-1800 words.

**Mobile:** step-header column-stacks; padding reduces. Still long; reader must scroll through every step sequentially.

**Overload risk:** **medium-low.** The progression is curated and linear — readers know they're climbing a 7-step ladder. Scroll length is appropriate for the educational arc.

**Density observations:**
- Rationale + symbolic note + glossary links per step = three small text blocks per step. Could merge symbolic note INTO rationale (one block instead of two).
- Glossary links per step often duplicate across steps (e.g., "butterfly" appears in 5 of 7 steps). Could surface once at the top of the page instead.

**Recommendations:**
- **Keep step structure** — the 7-step progression is the value proposition.
- **Consider merging symbolic note INTO rationale** as a "What changes mechanically" sentence — reduces from two text blocks per step to one. Minor copy edit per step; cleaner visual rhythm.
- **Consider hoisting glossary terms to a single "Key glossary terms for this progression" block at the top** instead of repeating per-step. Removes ~7 small link lines from the page.

Both are out of UX-CONS-1 scope (would require service-layer + template changes); flag for future.

---

## 4. Surface 3 — Spinning Modifier page (HIGH density)

**Profile:** Six teaching sections + anchor sentence + diagram placeholder + 3 confusion cards + 4-step progression + 5 cross-base examples + 4 related modifiers + footer. ~700-900 lines of rendered HTML; ~1800-2200 words.

**Mobile:** anchor sentence shrinks; diagram placeholder reduces; otherwise scrolls long.

**Overload risk:** **high.** This is the densest symbolic surface. A first-time reader may bounce after the mechanical-lead section without ever reaching the cross-base examples.

**Density breakdown:**

| Section | Words | Visual weight |
|---|--:|:-:|
| Subtitle | ~12 | low |
| Mechanical lead (4 paragraphs) | ~220 | medium |
| Anchor sentence | ~25 | high (visually elevated) |
| Diagram placeholder | ~15 | medium (framed) |
| Confusion cards (3) | ~250 | medium |
| Progression (4 steps) | ~350 | medium |
| Cross-base list (5 entries) | ~400 | medium |
| Related modifiers (4 entries) | ~120 | low |
| Footer | ~40 | low |

**Total:** ~1430 words in primary content. Plus ~40 lines of meta/navigation.

**Recommendations:**
- **Consider collapsing the "Common confusions" section behind a `<details>` accordion** — it's important reference content but not load-bearing for first-read teaching. Readers can expand if they care.
- **Consider collapsing the "Related modifiers" section** behind a `<details>` accordion — same logic; minor lateral references.
- **Keep always visible:** mechanical lead, anchor sentence, diagram placeholder, progression, cross-base. These are the core teaching arc.
- **Mobile-specific:** consider hiding the diagram placeholder entirely on small screens (the placeholder reserves 100px of vertical space for content that doesn't exist yet; on phone screens that's a quarter of the viewport).

**Risk-bearing observation:** the anchor sentence is intentionally elevated (italic, larger, warm-tone box). It's the page's visual centerpiece. Collapsing it would lose teaching value. **Keep always visible.**

---

## 5. Surface 4 — Glossary Connective panels (MEDIUM in isolation; HIGH in aggregate)

**Profile:** 6 panels in 2-column grid; each panel has definition + tricks chips + symbolic groups + notation hint + (sometimes) deep-link. ~400-550 lines of rendered HTML; ~600 words.

**Position:** appended as §13 of glossary page. Glossary §1-12 contributes ~700-1100 additional lines.

**Total glossary page after Phase 7:** ~1100-1600 lines of rendered HTML.

**Mobile:** 2-col grid collapses to single column. Each panel scrolls full-width. Total mobile scroll length is **considerable**.

**Overload risk:** **medium-high in aggregate.** The connective panels alone are well-paced (per-panel density is appropriate). But they sit at the bottom of a long canonical glossary, adding scroll commitment.

**Density breakdown per panel:**

| Element | Words / lines |
|---|---|
| Term heading | 1 |
| Definition | ~30 |
| "Used in these tricks" header + chips | up to 6 chips |
| "Related symbolic groups" header + chips | 2 chips |
| "Notation hint" | ~20 |
| Optional deep-link | 1 |

Each panel: ~80 words + ~10 mini-blocks. Stacked × 6 panels.

**Recommendations:**
- **Keep grid layout on desktop** — 2-col is correct density.
- **Consider collapsing on mobile** — at 1-column, panels stack sequentially and add ~6 × 80 words = 480 words of scroll. Could be improved with a per-panel `<details>` accordion (collapsed by default; tap to expand) OR a per-panel "more →" affordance that scrolls to a fuller view.
- **Critical:** the panels currently REQUIRE the user to be reading the glossary. They're not discoverable as standalone reference. Consider linking from `/freestyle` landing page directly to `/freestyle/glossary#connective-panels` so users can jump to them. Defer to future nav consolidation.

---

## 6. Cross-page density summary

If a user reads through the symbolic subsystem end-to-end:

| Step | Page | Approximate words |
|---|---|--:|
| 1 | Reads any of 8 flagship trick pages (canonical + 1 small symbolic panel) | ~2000 (most canonical; ~80 symbolic) |
| 2 | Clicks to walking progression | ~1700 (symbolic) |
| 3 | Clicks to spinning modifier page | ~1800 (symbolic) |
| 4 | Clicks to glossary | ~3000 (canonical §1-12) + 600 (symbolic §13) |
| **Total** | | ~9100 words |

**Verdict:** A motivated learner spends ~30-40 minutes traversing the full symbolic subsystem at typical reading speeds. That's a substantial educational asset, but no single page is the bottleneck — each is appropriately scoped.

---

## 7. Sections users likely skip

Speculation based on typical educational-content reading patterns:

| Section | Skip likelihood | Why |
|---|:-:|---|
| Walking Progression — per-step "Symbolic note" | high | duplicates rationale; readers may register "step explanation" once and skim subsequent ones |
| Spinning Modifier — Common confusions (after first read) | medium | reference material; revisited only as needed |
| Spinning Modifier — Related modifiers (bottom) | high | end-of-page list; far from anchor sentence |
| Glossary Connective panels — Notation hint per panel | medium | terse + technical; readers may not parse `(PDX)` etc. without help |
| Glossary Connective panels — Related symbolic groups chips | medium | unlabelled cluster; readers may not know what to do with them |

**Recommendations:**
- For "skip likely" sections, consider collapsing OR moving to "Reference" subsections clearly distinct from the teaching narrative.
- Notation hints could link to a single notation glossary entry that explains what `(PDX)` means. Currently they reference operators without explaining them in-place.

---

## 8. Overall density verdict

| Surface | Verdict | Action |
|---|---|---|
| 1 Related Topology panel | well-calibrated | keep always visible |
| 2 Walking Progression page | medium-low; could tighten | minor copy consolidation could help (future) |
| 3 Spinning Modifier page | high; teaching surface | progressive disclosure recommended (future); keep core arc visible |
| 4 Glossary Connective panels | medium in isolation; high in aggregate | desktop fine; mobile could use accordion (future) |

**Top three highest-density risks:**
1. Spinning Modifier page on mobile (long single-column scroll)
2. Glossary connective panels on mobile (appended to already-long glossary)
3. Walking Progression page — 7 step cards × 200 words each

**No collapse-now recommendation** in UX-CONS-1 scope; this is observational. Future consolidation can apply `<details>` accordions to "Common confusions" and "Related modifiers" sections of the modifier page; that's a single-template change.

---

## 9. Symbolic-vs-canonical balance

On any given page, how much of the visible content is symbolic-layer vs canonical-layer?

| Page | Canonical lines | Symbolic lines | Symbolic % |
|---|--:|--:|--:|
| Trick page (e.g. ripwalk) | ~1500 | ~80 (Related Topology panel) | ~5% |
| `/freestyle/glossary` | ~1000 (§1-12) | ~500 (§13) | ~33% |
| `/freestyle/progression/walking-family` | 0 | ~600 | 100% (dedicated page) |
| `/freestyle/modifier/spinning` | 0 | ~800 | 100% (dedicated page) |

**Verdict:** trick pages stay overwhelmingly canonical-first (5% symbolic). The glossary page is the most-blended (1/3 symbolic). Dedicated symbolic pages are 100% symbolic by definition.

This balance is RIGHT for the current architecture. The symbolic layer never visually competes with canonical content on the canonical trick page; it complements where co-located and stands alone where dedicated.

---

## 10. Cross-references

- SYMBOLIC_SUBSYSTEM_AUDIT.md — surface inventory
- SYMBOLIC_VISUAL_CONSOLIDATION.md — light-cleanup actions for visual issues
- LAYER1_SYMBOLIC_INTEGRATION.md — density considerations when ADD/family browsing ships
- DELIVERABLES_AND_RECOMMENDATION.md — phase decision
