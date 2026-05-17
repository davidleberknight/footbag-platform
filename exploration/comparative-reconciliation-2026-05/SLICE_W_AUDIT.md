# Slice W — Trick-Detail UX + Pedagogy Audit

**Status**: audit findings + minimal commit-ready refinement.
**Date**: 2026-05-17.
**Position in arc**: Slice V closed the readability + operator-boundary audit. Slice W extends the same discipline to the trick-detail surface — the per-trick public educational page at `/freestyle/tricks/:slug`.

> **Discipline reminder**: no ontology expansion, no parser grammar work, no new symbolic doctrine, no ADD changes, no Wave 2 resolutions, preserve the 4-color sem-token budget, preserve four-layer separation. Reversible UI/content refinements only.

## 1. Executive summary

The trick-detail page is rendered through `src/views/freestyle/trick-shell.hbs` — a 22-section vertical scan composed of curator-gated partials. Each partial gates internally on its own data, so sparse tricks skip cleanly. The page already has restraint discipline in place: the structural-decomposition panel is collapsed by default; the Diagnostic Details panel is nested behind a second collapse; layer-2 prose source attributions are quiet.

| Focus area | Headline finding | Ship-now action |
|---|---|---|
| Visual hierarchy | 22 sections; order is scan → study → diagnostic. Notation precedes prose, which is correct for canonical-first orientation. | **No change** |
| Parser leakage | Structural decomposition uses parser-internal vocabulary ("self-canonical-atom collapse", "ADD math", "atom resolved", "policy tokens"). All inside the collapsed-by-default `<details>` panel labeled "Parser diagnostic". Restraint discipline holds for default state; expanded state is technical. | **Defer** admin-gate decision to curator |
| Pedagogical onboarding | Two intro paragraphs in `trick-notation.hbs` use terse implementation-flavored language: "A token-level reading…color-coded by structural role" and "Editorial layer. Each reading is curator-authored". Newcomer-unfriendly. | **Shipping** prose softening |
| Visual density | 22-section count is heavy but each section internally gates. Mobile breakpoint already handles vertical stacking. Slice V mobile-grid fix carries through to trick-detail surfaces. | **No change** |
| Anti-overhardening | The page reads as educational at the top (hero, about, notation), shifts to structural mid-page (modifier-layering, family), and ends with diagnostic. Structural-decomposition's parser language is the only "compiler-like" surface; the collapse default mitigates. | **No change** |

**Minimal implementation slice**: two prose edits in `src/views/partials/trick-notation.hbs` (~6 lines of text). Audit doc captures the deferred recommendations for curator triage.

## 2. Trick-detail page structure inventory

`src/views/freestyle/trick-shell.hbs` composes 22 partials in this order:

| # | Partial | Role | Gating |
|---|---|---|---|
| 1 | trick-hero | title + summary line | always |
| 2 | trick-featured-preview | curator-authored hero media | `content.ux2Pilot` |
| 3 | trick-about | "About this trick" — description, ADD composition, aliases, family note | always (sparse gating internal) |
| 4 | **trick-notation** | Layer 1 (parser-tokenized) + Layer 2 (equivalence chain readings) + Layer 3 (base-lineage) + Layer 5b (curation-gap cue) | `content.notationDisplay` / `content.semanticNotation` |
| 5 | **trick-operational** | Set notation (operational) — warm palette; execution mechanics | `content.operationalNotation` |
| 6 | trick-modifier-layering | Nested-box visualization of modifier stacking | `modifier_links.length >= 3` |
| 7 | trick-prose Execution | Plain-English walkthrough paragraphs | `executionParagraphs.length` |
| 8 | trick-prose Learning notes | curator paragraphs | `learningParagraphs.length` |
| 9 | trick-prose "Before you try this" | prerequisite paragraphs | `prerequisiteParagraphs.length` |
| 10 | trick-family | family membership | always (gating internal) |
| 11 | trick-related | curator-authored related-tricks list | sparse-gated |
| 12 | symbolic-related-topology | observational symbolic-grammar cohort | `symbolicRelatedTopology` |
| 13 | trick-semantic-memberships | reverse-membership panels (UX-SHIP-1 Phase 5) | sparse-gated |
| 14 | trick-parallels | parallel-trick suggestions | sparse-gated |
| 15 | trick-substitutions | substitution options | sparse-gated |
| 16 | Media block | featured video + grid | `content.hasMediaBlock` |
| 17 | trick-pathways | educational pathways cross-links | sparse-gated |
| 18 | trick-previous | previous trick in difficulty ladder | sparse-gated |
| 19 | trick-next | next trick in difficulty ladder | sparse-gated |
| 20 | trick-records | passback / world-record table | sparse-gated |
| 21 | trick-progression | learning-progression cross-link | sparse-gated |
| 22 | **trick-structural** (collapsed) | parser diagnostic — collapsed-by-default | `content.notationGrammar` |

Section count averages ~10-12 visible sections per trick (well-documented compounds like `mobius` or `paradox-whirl`; sparse rows skip many).

## 3. Parser leakage audit

### 3.1 Structural decomposition panel (`trick-structural.hbs`)

The entire panel is **labeled "Parser diagnostic"** in its `<summary>` element and **collapsed by default**. Inside, it surfaces:

| Surface | Vocabulary | Pedagogical risk |
|---|---|---|
| Status / Asserted ADD / Computed ADD | "Asserted ADD is editorial truth", "(agrees with asserted)", "(disagrees with asserted; asserted value is editorial truth)" | LOW — curator-readable; explicit framing |
| Derivation formula | `<code>{{formula}}</code>` (e.g., `paradox(1) + whirl(3) = 4`) | LOW — formulaic but readable |
| Descriptive roles | "Per-token classification before any self-canonical-atom collapse. Preserves what the parser saw at each position." | **MEDIUM** — "self-canonical-atom collapse" is parser-internal vocabulary |
| ADD-contributing roles | "Tokens whose weights feed the ADD math. May differ from the descriptive layer when a self-atom subsumes its components." | **MEDIUM** — "self-atom subsumes", "ADD math", "descriptive layer" |
| Editorial decomposition | "Curator-asserted lineage from this row's `base_trick` and modifier links. Independent of the parser-derived structural decomposition above." | LOW — clearly pedagogical |
| Policy tokens | "Tokens whose ADD weight or ontology placement is contested and pending expert review." | LOW — appropriately ontology-flavored |
| Diagnostic details (nested `<details>`) | "Jobs notation", "Parse warnings" | **HIGH** — pure parser-internal |

**Verdict**: The diagnostic-details inner collapse contains content (Jobs notation, Parse warnings) that is **pure parser-internal** — these are debugging artifacts. They have no pedagogical value for the public. They should ideally be admin-gated.

**Curator decision (deferred)**:
- **Option A** — keep as-is (nested-collapse pattern provides sufficient restraint)
- **Option B** — admin-gate the Diagnostic details collapse (visible only to curators / admins)
- **Option C** — remove from public page entirely (still available in internal QC tooling)

Slice W flags this; no change in this slice.

### 3.2 Notation section intros (`trick-notation.hbs`)

Layer 1 intro:
> "A token-level reading of this trick, color-coded by structural role."

Layer 2 source line:
> "Editorial layer. Each reading is curator-authored; tokens link to the glossary's operator entries where recognized."

Both are functional but **implementation-flavored**:
- "token-level reading" — newcomer doesn't know what a token is
- "color-coded by structural role" — abstract; the four roles (base / modifier / positional / unknown) aren't named here
- "Editorial layer" — implementation language (the four-layer system isn't visible to readers)
- "curator-authored" — internal-process language
- "the glossary's operator entries" — assumes the reader knows what an "operator entry" is

**These are the targets of the Slice W shipped refinement** (see §6).

### 3.3 Other partials — sampled

- `trick-about.hbs` — newcomer-friendly: "How it's built", "Base trick", "Also known as". No parser leakage.
- `trick-operational.hbs` — "Execution mechanics — how the body performs the trick. Independent of the semantic notation above." Good pedagogical framing.
- `trick-modifier-layering.hbs` — "Each modifier stacks onto the base; weights add to the total." Excellent pedagogical phrasing.
- `trick-family.hbs` — sampled lightly; family-anchor cross-links surface naturally.

No parser leakage in these surfaces.

### 3.4 Summary

Parser leakage is **concentrated inside the structural-decomposition panel**, which is already collapsed-by-default and labeled "Parser diagnostic". The only public-facing leakage is in `trick-notation.hbs` intro prose — addressed in §6 below.

## 4. Pedagogical onboarding evaluation

**Newcomer scenario**: User arrives at `/freestyle/tricks/paradox-whirl` via a Google search or friend's link. They have NO prior symbolic-system knowledge.

What they see (top of page, scrolling down):

| Position | Section | Pedagogical clarity |
|---|---|---|
| 1 | Hero: "Paradox Whirl" + summary | ✅ Clear — they read what the trick is |
| 2 | About: description, "How it's built: paradox(1) + whirl(3) = 4 ADD", aliases, family note | ✅ Good — first introduction to operator decomposition |
| 3 | Notation: tokenized reading with colored tokens, "A token-level reading…color-coded by structural role" | ⚠ **Newcomer-unfriendly intro** — terse, abstract, no example of what the colors mean |
| 4 | Operational: "Execution mechanics — how the body performs the trick" | ✅ Good framing |
| 5 | Modifier layering: nested-box visualization | ✅ Strong pedagogical illustration |
| 6 | Execution paragraphs | ✅ Plain English |
| 7 | Learning notes | ✅ Curator prose |
| 8 | Prerequisites | ✅ Curator prose |
| 9–21 | Various cross-links + media | ✅ Discoverability surfaces |
| 22 | Structural decomposition (collapsed) | ⚠ Collapsed; advanced users only |

**Verdict**: Onboarding is solid except for the Notation section intro at position #3. By the time a newcomer reaches it, they've already seen the ADD composition in plain prose in §2 (About). The Notation section then shows the same information in token-colored form, but the intro doesn't connect the dots ("These same parts, color-coded so you can see the shape").

The Slice W refinement (§6) addresses this by replacing the terse intro with prose that:
- Explicitly names what the colors represent
- Connects to the About section's prose decomposition

## 5. Visual density audit

### 5.1 Section count

22 sections is high but each gates. Sparse tricks (e.g., a basic stall) might render ~6 visible sections; well-documented compounds render ~14-16.

### 5.2 Mobile readability

Vertical stacking is appropriate. The Slice V `dict-card--registry` grid-area fix applies only to the dictionary listing, not the detail page (detail page uses different layout).

Sampled CSS for trick-detail-related classes: standard `content-section` padding, no horizontal overflow risks at 480px observed. The structural-decomposition `<details>` collapse behaves correctly on touch.

### 5.3 Scroll fatigue

A 22-section page can feel long. Two mitigations are already in place:
- Many sections are sparse-gated
- The structural decomposition is collapsed (doesn't contribute to scroll length until expanded)

Further reduction would require **content consolidation** (e.g., merging Family / Related / Topology / Memberships / Parallels into a single "Related & cross-references" hub). **High-effort UX restructure; defer to a dedicated trick-detail-IA slice.**

### 5.4 Repeated metadata

- ADD value appears in: Hero summary, About "How it's built", Structural Asserted ADD, Structural Computed ADD
- Family appears in: About "family note", trick-family section
- Aliases appear in: About "Also known as"

ADD repetition across hero + about is intentional (top-of-page-scan vs detail-view). Structural ADD repetition is diagnostic (asserted vs computed). Family repetition is intentional (note in about + dedicated section).

**Verdict**: repetition is purposeful, not redundant. No action.

## 6. Anti-overhardening QC

The trick-detail page reads in **three phases**:

1. **Educational phase** (Hero → About → Notation → Operational → Modifier Layering)
   The hero + about + operational sections feel movement-oriented and human-readable. The Notation section's intro IS the weakest link here — implementation-flavored, not movement-flavored.

2. **Prose phase** (Execution → Learning → Prerequisites)
   Plain curator prose. Movement-oriented. No taxonomic feel.

3. **Cross-reference phase** (Family → Related → Topology → Memberships → Parallels → Substitutions → Media → Pathways → Prev/Next → Records → Progression)
   Discoverability links. Quiet, navigational.

4. **Diagnostic phase** (Structural decomposition, collapsed)
   Parser-flavored. Acceptable because labeled and collapsed.

**Verdict**: the page is movement-oriented overall, with one weak intro that pulls it briefly toward taxonomic feel. Slice W shipped refinement (§6) brings phase 1's Notation intro back into the educational register.

## 7. Recommended refinements — ranked by risk

| Recommendation | Risk | Action |
|---|---|---|
| **Soften the two `trick-notation.hbs` intro paragraphs** (Layer 1 + Layer 2 source) | LOW (HBS prose only; no test assertions match) | **Shipped this slice** |
| Admin-gate the Diagnostic details inner collapse (Jobs notation, Parse warnings) | MEDIUM (auth-context decision; new condition gate) | **Defer to curator** |
| Soften "Editorial decomposition" label inside structural panel | LOW (HBS prose) | **Defer to curator** |
| Consolidate Family / Related / Topology / Memberships / Parallels into a single hub | HIGH (UX restructure; ~5 partials affected) | **Reject — anti-overload posture** |
| Reorder so Execution prose precedes Notation | HIGH (canonical-first orientation is the existing contract) | **Reject — would invert the design intent** |
| Remove repeated ADD values (e.g., hide structural ADD section entirely) | MEDIUM (loses diagnostic signal for curators) | **Reject** |
| Add inline tooltips explaining "operator", "base", "modifier" on first encounter | MEDIUM (markup/CSS complexity; not anti-overload-aligned) | **Defer to curator** |

## 8. Mockups (ASCII)

### 8.1 Notation section — current intro

```
┌─────────────────────────────────────────────────────────────┐
│ Notation                                                    │
│ A token-level reading of this trick, color-coded by         │
│ structural role.                                            │
│                                                             │
│ <code>paradox  whirl</code>                                 │
│ Token reference →                                           │
└─────────────────────────────────────────────────────────────┘
```

Newcomer reaction: "What's a token? What roles? Why are some colored differently?"

### 8.2 Notation section — after Slice W refinement

```
┌─────────────────────────────────────────────────────────────┐
│ Notation                                                    │
│ The name broken into named parts. Each colored term is a    │
│ piece of structure — the base trick, a modifier, or a       │
│ positional cue.                                             │
│                                                             │
│ <code>paradox  whirl</code>                                 │
│ Token reference →                                           │
└─────────────────────────────────────────────────────────────┘
```

Newcomer reaction: clearer connection to the About section's prose decomposition.

### 8.3 Equivalent readings source — current

```
1. paradox whirl
2. paradox spinning ss osis

Editorial layer. Each reading is curator-authored; tokens
link to the glossary's operator entries where recognized.
```

### 8.4 Equivalent readings source — after Slice W refinement

```
1. paradox whirl
2. paradox spinning ss osis

Different ways to express the same trick's composition.
Tap any term to jump to its glossary entry.
```

## 9. Minimal implementation slice — shipped

**Single edit**: `src/views/partials/trick-notation.hbs` — replace two intro paragraphs with newcomer-friendlier prose.

| Location | Before | After |
|---|---|---|
| Layer 1 intro | "A token-level reading of this trick, color-coded by structural role." | "The name broken into named parts. Each colored term is a piece of structure — the base trick, a modifier, or a positional cue." |
| Layer 2 source | "Editorial layer. Each reading is curator-authored; tokens link to the glossary's operator entries where recognized." | "Different ways to express the same trick's composition. Tap any term to jump to its glossary entry." |

**Lines changed**: 2 prose lines (existing `<p>` elements; no markup change).
**Risk**: LOW.
**Tests touched**: 0 (no integration test asserts on these exact strings; grep verified).
**Build / type-check**: untouched.

## 10. What this slice does NOT do

- ❌ No ontology expansion
- ❌ No parser-grammar work
- ❌ No new symbolic doctrine
- ❌ No ADD changes
- ❌ No Wave 2 resolutions
- ❌ No expansion of the 4-color sem-token budget
- ❌ No new content-module entries
- ❌ No new test files
- ❌ No new partials, no new sections
- ❌ No admin-gating decisions (Diagnostic details remain visible per current behavior)
- ❌ No UX restructure of the 22-section flow
- ❌ No reorder of canonical vs prose precedence
- ❌ No removal of "Editorial decomposition" label

## 11. Cross-slice context

Slice W closes the trick-detail audit complement to Slice V's browse-surface audit:

| Slice | Surface | Output |
|---|---|---|
| V | Browse views (dictionary cards) | Audit + mobile grid-area fix |
| **W** | **Trick-detail page** | **Audit + notation intro prose softening** |

Combined with Slices O–S (comparative reconciliation) and the Pre-Red completion sweep, the dictionary system is now at a fully audited pre-Red checkpoint. No further automated pre-Red work is scheduled.

---

## End
