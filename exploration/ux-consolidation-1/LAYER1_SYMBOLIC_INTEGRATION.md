# LAYER1_SYMBOLIC_INTEGRATION — Strategy for Coexistence with ADD/Family Browsing

UX-CONSOLIDATION-1 Task E. Designs how the symbolic layer should coexist with the future Layer-1 trick browsing modes (ADD view + family view). Establishes which symbolic surfaces belong where.

**Date:** 2026-05-12

---

## 1. Core principle

**The symbolic layer supplements the canonical ontology; it does not replace it.**

Canonical surfaces (trick pages, glossary §1-12, ADD-view browse, family-view browse) carry authoritative claims. Symbolic surfaces (Related Topology panel, Walking Progression page, Modifier-family pages, Glossary §13 panels) carry observational claims. The two NEVER compete for the same teaching slot on the same page.

This principle has three operational consequences:

1. **Canonical surfaces own the ADD math, family classification, and dictionary entries.** Symbolic surfaces never overwrite or contradict.
2. **Symbolic surfaces own mechanical/educational framing.** Canonical surfaces don't try to BE educational; they're the dictionary.
3. **Layered attribution must remain visible.** A user reading a symbolic panel always knows it's symbolic. A user reading a canonical entry always knows it's canonical.

---

## 2. The eventual Layer-1 trick-browse modes

Per the consolidation brief, Layer 1 will eventually support:

### Mode A: ADD-view browsing

URL pattern (proposed): `/freestyle/tricks?view=adds` or `/freestyle/tricks/adds/4` etc.

Users browse all tricks at a given ADD level:
- All 2-ADD tricks: mirage, illusion, legover, pickup, ...
- All 3-ADD tricks: butterfly, whirl, swirl, osis, ...
- All 4-ADD tricks: ripwalk, dimwalk, sidewalk, parkwalk, ...
- etc.

This is a **canonical ontology surface**. The data is `freestyle_tricks.adds` (authoritative).

### Mode B: Family-view browsing

URL pattern (proposed): `/freestyle/tricks?view=family` or `/freestyle/tricks/family/whirl` etc.

Users browse all tricks in an IFPA `trick_family`:
- whirl family: whirl, spinning-whirl, paradox-whirl, mullet, montage, ...
- butterfly family: butterfly, ripwalk, dimwalk, sidewalk, matador, phoenix, ...
- mirage family: mirage, smear, blur, atom-smasher, ...

This is also a **canonical ontology surface**. The data is `freestyle_tricks.trick_family` (authoritative).

---

## 3. What symbolic surfaces belong globally (cross-page)

**Answer: none.** The symbolic layer has no global persistent surface. There is no nav element, no sidebar, no footer link that should appear on every page.

The reasoning: globally-persistent symbolic chrome would compete with canonical navigation. The canonical top-nav is already established and serves Layer 1. Adding a global symbolic surface would either (a) be ignored or (b) muddy the canonical-vs-symbolic distinction users need to make.

**Exception (mild):** a future `/freestyle/learn` or `/freestyle/symbolic` index page can be linked from the top-level `/freestyle` landing as one of several educational entry points (alongside Records, Leaders, Records, etc.). That single entry point IS appropriate global discoverability.

---

## 4. What symbolic surfaces belong on trick pages

**Already shipped:** the Related Topology panel (Surface 1), on 8 flagship slugs. It sits subordinate to canonical Related Tricks.

**Should it expand?** Carefully. Two expansion vectors:

| Vector | Add what | Risk |
|---|---|---|
| More slugs gain the panel (beyond the 8 flagship) | the same panel, with the same content shape, for more tricks | LOW — same pattern, more reach |
| Trick pages gain CTAs to symbolic surfaces (walking progression / modifier page) | "Learn more about the walking family →" or "Learn more about spinning →" | LOW-MEDIUM — small CTA, but trick pages stay canonical-first |

**Recommendation for Layer-1 integration:** when the trick page renders inside a family-view or ADD-view browse context, the Related Topology panel STAYS THE SAME. The browse mode doesn't change what's on the trick page; the trick page renders the same way regardless of how the user got there.

**One small adjustment:** the "back to results" affordance on the trick page (currently breadcrumb-based) should support `?return=family/whirl` or `?return=adds/4` query params so the user returns to the right browse context after viewing a trick. **Out of UX-CONS-1 scope** — but flag this for future ADD/family browse implementation.

---

## 5. What symbolic surfaces belong in modifier pedagogy (modifier-family pages)

**Already shipped:** `/freestyle/modifier/spinning` (Surface 3). Pilot scope: one modifier.

**Should it expand?** Per the user's brief: paradox + ducking are next, but ONLY AFTER consolidation. This phase explicitly defers their build.

**Layer-1 integration question:** when ADD-view or family-view shipping happens, should modifier-family pages link to either browse mode?

- A spinning modifier-family page's "cross-base" section already references `spinning-osis`, `spinning-torque`, `spinning-clipper`, etc. Each trick name is a hyperlink to its canonical trick page.
- A natural future addition: at the bottom of the cross-base section, add a "See all spinning compounds →" link that resolves to a Layer-1 filtered view (e.g. `/freestyle/tricks?view=family&modifier=spinning`). This delegates exhaustive browsing to the canonical surface; the modifier page stays focused on teaching.

**Recommendation:** the modifier-family page is a **teaching destination**, not a browse alternative. When ADD/family view ships, modifier pages can link OUT to filtered Layer-1 views for users who want to browse the full cohort. Modifier pages do not need to grow internally to list every modifier compound.

---

## 6. What symbolic surfaces belong in glossary/progression layers

**Already shipped:**
- Glossary §13 Connective panels (Surface 4) — 6 high-value terms
- Walking Progression page (Surface 2) — curated 7-step chain

**Layer-1 integration question:** when ADD-view or family-view shipping happens, how do glossary panels and progression pages integrate?

- Glossary panels can link OUT to family-view or ADD-view filtered surfaces (e.g., "Used in these tricks: spinning-whirl(4), spinning-osis(4), ..." each link is already canonical). They already integrate seamlessly.
- Progression pages can link OUT similarly (each step links to canonical trick page).
- Inverse direction: family-view pages (when they ship) can show a small "See the walking-family progression →" link when viewing the butterfly family. Same pattern as proposed CTAs from trick pages.

**Recommendation:** symbolic pages remain teaching-led. They link OUT to canonical surfaces (already do). Future canonical surfaces (ADD/family view) link IN to symbolic surfaces with small CTAs where mechanically relevant.

---

## 7. Coexistence matrix

| Symbolic surface | Canonical surface that complements | How they coexist |
|---|---|---|
| Related Topology panel | trick page | embedded; subordinate; observational-attributed |
| Walking Progression page | future family-view (butterfly family) | family-view page gains a "See the walking-family progression →" CTA |
| Spinning Modifier page | future family-view (whirl family) AND future ADD-view (4-7 ADD compounds with spinning) | both family-view and ADD-view gain CTAs to this page |
| Glossary Connective panels | glossary §1-12 (canonical) | physical co-location; ordered after canonical; visually subordinate |

---

## 8. Things the symbolic layer must NEVER do

To preserve the canonical-vs-symbolic distinction:

| Don't | Why |
|---|---|
| Display ADD math contradicting `freestyle_tricks.adds` | the modifier table + Red rulings are authoritative; symbolic surfaces never reinterpret |
| Display `trick_family` contradicting `freestyle_tricks.trick_family` | family classification is canonical; symbolic topology is a separate axis |
| Be the primary surface for "find me a trick at 4 ADD" | that's ADD-view's job (future canonical surface) |
| Be the primary surface for "find me a whirl-family trick" | that's family-view's job (future canonical surface) |
| Compete with canonical glossary entries on the same page | glossary §1-12 stays authoritative; §13 panels point to canonical for definitive terminology |
| Add a top-nav menu item competing with `/freestyle/tricks` | symbolic exists as supplementary; canonical owns top-nav |

---

## 9. Things the symbolic layer SHOULD do as Layer-1 evolves

| Should | Why |
|---|---|
| Maintain explicit layer attribution (badge + footer) on every surface | the canonical-vs-symbolic distinction is the user's mental anchor |
| Link OUT to canonical surfaces aggressively | symbolic teaches; canonical defines |
| Render the SAME on a trick page regardless of how user arrived | the trick page's content shouldn't change based on browse mode |
| Provide deep-links to symbolic surfaces from canonical surfaces where helpful | discoverability of the teaching layer |
| Stay observational-only across all phases | no auto-promotion to canonical; ever |
| Continue using staging CSVs OR migrate to an additive DB schema (never overwriting canonical) | data isolation preserved |

---

## 10. Concrete integration steps for future ADD/family view phases

When ADD-view ships:

1. **No symbolic-surface changes required.** Symbolic surfaces remain as-is.
2. **ADD-view trick listings can carry a small icon per row indicating "this trick has educational content"** — links to relevant modifier page or progression page. Single icon; no exhaustive sub-list.
3. **`/freestyle` landing page can promote the existence of educational deep-dives** — one paragraph + 2-3 links to walking progression / spinning modifier / glossary panels.

When family-view ships:

1. **No symbolic-surface changes required.** Symbolic surfaces remain as-is.
2. **Family-view trick listings for butterfly family can carry a CTA: "See the walking-family progression →"**
3. **Family-view trick listings for whirl family can carry a CTA: "Learn about the spinning modifier →"** (and eventually paradox / symposium / etc.)
4. **Cross-cutting symbolic groups (per `symbolic_topology_groups.csv`)** can become a SECOND view on the trick listings: alongside ADD view + family view, "topology view" — but this is genuinely a future Layer-2 phase, not a current consolidation concern.

---

## 11. Future-state diagram

```
                            /freestyle/ (canonical landing)
                                    │
              ┌──────────┬──────────┼──────────┬──────────┐
              │          │          │          │          │
        /freestyle/  /freestyle/  /freestyle/  /freestyle/  /freestyle/
          tricks       glossary     records      leaders      learn        ◄── future
          │  (canonical Layer 1)   │            │            │
          │                        │            │            │
       ┌──┴──┐                     │            │            │
       ▼     ▼                     │            │            │
  ?view=adds ?view=family          │            │            │
  (canonical) (canonical)          │            │            │
       │     │                     │            │            │
       │     ▼                     │            │            │
       │   each family-view CTA    │            │            │
       │   ───────────────────►    │            │            │
       │                           ▼            │            ▼
       │                  /freestyle/                /freestyle/
       │                   glossary  ◄────────────── learn (index)
       │                   (§1-12 canonical)              │
       │                   (§13 connective panels)        │
       │                                                  │
       └────────────────────────────────────────────────►
                              │
                              ▼
              ┌──────────────┬──────────────┬──────────────┐
        /freestyle/   /freestyle/   /freestyle/   /freestyle/
        modifier/     progression/  topology/     archetype/
        spinning/     walking-      (future)      (future)
        paradox/      family/
        ducking/      (future)
        (current+future)

                       ALL symbolic surfaces
                       (observational layer)
```

The arrow from family-view → symbolic surfaces is the key future integration point. Family-view stays canonical; symbolic stays observational; the link makes both discoverable.

---

## 12. Summary — what consolidates, what stays the same, what expands later

### Consolidates in UX-CONS-1 (this phase)

- Observational badge tooltip: unified across 4 surfaces
- Misleading `Modifier` breadcrumb on spinning page: removed
- ADD-value chip styling: unified
- `.symbolic-card` shared base class: added (HTML refactor deferred)
- (All audit docs delivered; no other code changes)

### Stays the same

- Surface 1 (Related Topology panel): structure unchanged; subordinate role preserved
- Surface 2 (Walking Progression page): structure unchanged
- Surface 3 (Spinning Modifier page): structure unchanged
- Surface 4 (Glossary Connective panels): structure unchanged; §13 placement preserved
- All observational-layer attribution: preserved everywhere

### Expands later (future phases, not this one)

- Paradox + ducking modifier pages (after pedagogy framework validated)
- `/freestyle/learn` symbolic index page
- Trick-page CTAs to walking progression / modifier pages
- ADD-view + family-view browse modes (Layer 1, separate work)
- Per-glossary-term fragment anchors
- Progressive disclosure (`<details>` accordions) on dense modifier-page sections
- DB schema migration for symbolic CSVs (only after public usage data confirms patterns hold)

---

## 13. Cross-references

- SYMBOLIC_SUBSYSTEM_AUDIT.md — surface inventory
- SYMBOLIC_NAVIGATION_COHERENCE.md — nav philosophy
- SYMBOLIC_VISUAL_CONSOLIDATION.md — light cleanup
- SYMBOLIC_DENSITY_AUDIT.md — density observations
- DELIVERABLES_AND_RECOMMENDATION.md — final phase decision
