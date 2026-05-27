# GLOSSARY_V5_NAVIGATION

**Project:** GLOSSARY-V5-SYNTHESIS — Task H
**Scope:** Design the navigation surface for the V5 glossary. Support both learner-progression (the primer read top-to-bottom) and expert-lookup (alphabetical search) without compromising either. Define cross-link strategy to the trick dictionary and modifier-family pages. Mobile considerations.
**Constraints:** Static navigation only (no client-side search or JavaScript-driven progress tracking in this design). Anchor-based, URL-shareable. The glossary remains a single document — sections; not multi-page.

---

## 1. Two readers, one surface

The V5 glossary serves at least two distinct readers:

| Reader | Goal | What they need |
|---|---|---|
| **Learner** | "Teach me freestyle as a movement language" | A sequential reading path; section pacing; clear "what's next" affordances |
| **Expert / lookup** | "I forgot what X means" | Fast alphabetical access; minimum clicks to a definition; no forced curriculum |

Both must work on the same page. The navigation surface has to accommodate both modes simultaneously — and gracefully degrade on mobile, where screen real estate forces compromise.

This is achievable because the underlying content is the same. §10 is built from the primer's vocabulary; the cross-link contract from `TRADITIONAL_GLOSSARY_PRESERVATION_PLAN.md` keeps them in sync. The navigation surface is *how* the same content gets accessed by two different reader modes.

---

## 2. The page-level navigation surfaces

Four navigation affordances on the V5 glossary page:

### 2.1 The header strip — primary navigation

At the top of the page, a compact horizontal nav lists the twelve sections. On desktop:

```
[ §1 Primer ] [ §2 Surfaces ] [ §3 Dexterities ] [ §4 Timing ] [ §5 Core Tricks ]
[ §6 Modifiers ] [ §7 Notation ] [ §8 Composition ] [ §9 Topologies ]
[ §10 A-Z Reference ] [ §11 Folk ] [ §12 Pathways ]
```

Each is a hash-anchor link to the corresponding section. Sticky on scroll (`position: sticky; top: 0; z-index: 10`) so the reader always knows where they are and can jump.

The strip distinguishes between the two groups visually: §1–§9 are the **primer**, §10–§12 are **reference + pathways**. A small vertical divider (or a color shift) separates them. The learner reads §1–§9; the expert jumps to §10.

### 2.2 The pathway picker — top-of-page

Just below the header strip, a small section invites the reader to declare their starting point:

```
> I'm new to freestyle           — read §1 → §3 → §5 → dictionary
> I came from PassBack            — read §6 → §7 → §11 (cross-reference) → §9
> I want to read notation         — read §7 → §5 → §6 in a tight loop
> I want to look up a term        — go to §10
> I want to see how tricks relate — read §9 → component view
```

This is the V5 architecture's §12 (Learning Pathways) surfaced at the top. The pathway picker is *static* (no JavaScript; just deep-anchored links). A reader who clicks "I'm new" lands at §1 with §3, §5, dictionary as their hash-history.

The pathway picker is intentionally simple. It's a series of named "if you came here to do X, start here" prompts. Not interactive. Not personalized. A curator-curated set of reading orders that map common learner goals to the section sequence.

### 2.3 The §10 alphabetical index — quick lookup

§10 itself opens with its own sub-navigation: an alphabetical letter strip (A–Z) anchored to each letter's first entry. A reader who wants "paradox" clicks `P`, scrolls one short letter section, finds the entry.

The §10 sub-nav is anchored, not a search box. Plain HTML; no JavaScript needed. Stable URLs. Hash-shareable.

### 2.4 The pathway-tracking forward references

Throughout the primer (§1–§9), each section ends with a small "What's next" footer that names 1–3 forward references:

```
> Next: §3 Dexterities — hippy vs leggy in detail
> Cross-link: §5 Core Trick Structures — see Mirage as a worked example
> Related: §10 — quick lookup of any term you met here
```

These footers serve the *learner's* needs: pacing, clear continuation, no decision paralysis at the end of a section. The footer doesn't list every possible next-section; it surfaces the curator-recommended next-step.

---

## 3. The learner-first flow

A new reader arriving at the V5 glossary page experiences:

1. **Lands at top of page.** The header strip is visible at the top; the pathway picker invites them to declare a starting point.
2. **Clicks "I'm new to freestyle."** Hash anchor jumps to §1.
3. **Reads §1 top-to-bottom.** Encounters terms in bold-on-first-use. Each bolded term has a small inline anchor link (e.g., a `superscript ↗ §10`) for lookup without losing position.
4. **At the end of §1, sees the "What's next" footer pointing to §3.**
5. **Continues to §3.** Reads §3 with the dexterity vocabulary now in place.
6. **Continues to §5 — encounters core trick structures.** Now reads tricks as compositions instead of opaque names.
7. **Optionally continues to §6 (modifiers), §7 (notation), §8 (composition), §9 (topologies).** Or jumps to the dictionary with the language they have.
8. **At any point, can jump to §10 for a lookup.** Returns via browser back-button or direct anchor.
9. **At the end of §9, the "What's next" points to the dictionary's component view + the modifier-family pages.** The glossary's job is done; the dictionary's job begins.

This is the **progressive learner pathway**. It works because:

- The header strip orients without overwhelming.
- The pathway picker reduces decision paralysis at entry.
- The "What's next" footers pace the reading.
- The §10 link is always one click away — the learner never feels trapped.

---

## 4. The expert / lookup flow

A returning expert who forgot what "magic hop" means experiences:

1. **Lands at top of page.** Sees the header strip.
2. **Clicks `§10 A-Z Reference`** — jumps to §10.
3. **Clicks `M`** in the letter strip — jumps to the M section of §10.
4. **Scans for "magic hop."** Finds it.
5. **Reads the 2-sentence definition.** Sees an inline "see §11 — magic hop timing variance" cross-reference, ignores it because they got their answer.
6. **Closes the page** OR **clicks a related-tricks link** in the entry to land on a dictionary page.

Three clicks to definition. No forced curriculum. No primer to scroll past.

Variations:

- **Searching browser-side (Ctrl+F)** — works because §10 entries are flat anchored elements. The user types "magic hop" into browser search; the page jumps.
- **Coming from an external link with hash anchor** — `/freestyle/glossary#term-magic-hop` opens directly to the entry. The deep-link resolver from `glossaryAnchors.ts` already supports this.
- **Coming from a dictionary trick page** — clicking "paradox" on a trick card lands the reader at `#glossary-panel-paradox` (the §9 connective panel) per the existing resolver, where they get richer context.

The expert flow uses the same underlying anchor system as the learner flow. The reader's *intent* determines which path they take through it.

---

## 5. Cross-link strategy

The glossary cross-links to two external surfaces: the trick dictionary and the modifier-family pages. Each crosslink follows a consistent contract.

### 5.1 Glossary → dictionary

A glossary entry that lists representative tricks always links to the dictionary trick page:

```
paradox
  A hip pivot between two dexes on the same set...
  Common tricks: paradox-mirage, paradox-whirl, paradox-blender
  Browse all paradox tricks → /freestyle/tricks?view=component#paradox
```

Three or four named example tricks (deep-linked to their detail pages) + one "browse all" deep-link to the component view. The "browse all" deep-link delegates the exhaustive enumeration to the dictionary; the glossary entry stays compact.

This is the **"by example, not by exhaustion"** principle from `GLOSSARY_BOUNDARY_STRATEGY.md` §4.1. The glossary never tries to be a complete trick browser.

### 5.2 Glossary → modifier-family page

A glossary entry for an operator that has a shipped modifier-family page (`/freestyle/modifier/spinning`, `/freestyle/modifier/paradox`, `/freestyle/modifier/ducking`) links to it as the "embodied teaching surface":

```
spinning (operator)
  Full-body 360° rotation through the dex moment...
  Learn the spinning modifier → /freestyle/modifier/spinning
```

One link. The modifier-family page is the *deeper teaching surface*; the glossary entry is the *quick definition*. The reader who wants more depth follows the link.

### 5.3 Dictionary → glossary (inbound)

The dictionary's symbolic-trick cards (`DSC-2`) and the modifier-family pages already deep-link into the glossary via `glossaryAnchors.ts`. The V5 architecture extends this:

- Each new §10 entry has a stable `id="term-{slug}"` anchor.
- Each §9 connective panel keeps its existing `id="glossary-panel-{slug}"` anchor.
- The resolver continues to prefer §9 panel anchors over §10 entry anchors when the term has a richer panel (paradox, spinning, ducking, symposium, whirl, pixie).
- Future symbolic vocabulary added at §10 gets its anchor automatically; the resolver picks it up.

The bidirectional cross-link contract is already partly implemented today. V5 extends it to the new vocabulary without changing the underlying mechanism.

### 5.4 Modifier-family page → glossary (inbound)

Each modifier-family page's footer carries a deep-link to its §9 connective panel and (where applicable) its §6 operator entry. This already exists today; V5 preserves it.

The full round-trip: a learner reads the spinning modifier-family page, follows the footer cross-link to §9 for the connective panel, jumps to §6 for the operator framework, jumps to §10 for the alphabetical entry, returns to the modifier page. Each surface serves its own job; the cross-links keep the reader moving freely.

---

## 6. Mobile considerations

On mobile (<480px), the navigation surfaces compress:

### 6.1 Header strip

The 12-section horizontal strip collapses to a vertical accordion or a select dropdown. Two options for curator review:

**Option A — Accordion at top:** the strip becomes a `<details>` element that opens on tap. Closed by default; opens to reveal the 12 section anchors as a vertical list.

**Option B — Dropdown:** a `<select>` element with the 12 section options. On change, the page jumps to the chosen anchor.

Option A preserves the visual layout of the page (header strip → pathway picker → content); B is mechanically simpler. Either is acceptable. Recommended: **Option A** (accordion) — the visual layout is consistent across viewports.

### 6.2 Sticky behavior

The header strip's `position: sticky` works on most mobile browsers but eats vertical space. On narrow viewports (<480px), it should either:

- Drop sticky and become a regular top-of-page element (the reader scrolls back up to use it); OR
- Remain sticky but as the collapsed accordion (small footprint)

Recommended: the collapsed accordion remains sticky. ~30px of vertical space, always accessible.

### 6.3 Pathway picker

The pathway picker collapses to a single-column list on narrow viewports. Each pathway row stacks the description + the "read X → Y → Z" sequence on two lines.

### 6.4 §10 letter strip

The letter strip on §10 wraps to a 2-row layout on narrow viewports. Letters are tap targets (minimum 44×44 px per accessibility guidance); the strip remains usable.

### 6.5 "What's next" footers

The footers display naturally on mobile (each is 2–3 lines of text). No special treatment needed.

---

## 7. URL fragment-anchor conventions

The glossary uses URL fragments for direct navigation. Conventions:

| Fragment pattern | Lands on |
|---|---|
| `#section-{N}` (e.g., `#section-1`, `#section-6`) | The top of section N |
| `#term-{slug}` (e.g., `#term-paradox`) | A §10 alphabetical entry |
| `#glossary-panel-{slug}` (e.g., `#glossary-panel-paradox`) | A §9 connective panel |
| `#modifier-reference` | The §6 (operator) heading (existing convention from `glossaryAnchors.ts`) |
| `#operational-notation` | The §7 (operational notation) section |
| `#notation` | The §7 (semantic / Jobs notation) section |
| `#pathway-newcomer`, `#pathway-passback`, `#pathway-notation`, etc. | A specific pathway in §12 |

The conventions extend the existing ones rather than replacing them. The `glossaryAnchors.ts` resolver is already case-insensitive and falls through gracefully on unknown terms; new conventions slot in.

---

## 8. The "what's next" footer micro-design

A consistent footer at the end of each primer section:

```
─────────────────────────────────────────────
NEXT: §3 Dexterities — hippy vs leggy in detail

Cross-link: §10 (entry: 'dex') for the quick lookup form
Related: §5 (Core Trick Structures) — see Mirage as a worked example
─────────────────────────────────────────────
```

Three components:

1. **NEXT** — the curator-recommended continuation of the primer
2. **Cross-link** — typically points back to §10 for the lookup version of the section's key term
3. **Related** — typically points forward to a section that builds on the current one

Three lines max. The footer doesn't compete with the section's prose; it sits at the bottom as a quiet "where to go next" affordance.

The footer's specific text is curator-authored, not auto-generated. The curator decides which 3 destinations are most useful at the end of each section.

---

## 9. Search behavior

V5 deliberately uses **browser-native search (Ctrl+F)** as the primary search mechanism. No JavaScript search box, no client-side index. Rationale:

- §10 entries are flat anchored elements; Ctrl+F finds them instantly.
- A custom search box adds complexity (JavaScript, indexing, ranking) for marginal gain.
- The pathway picker handles "I don't know what to look for" cases.
- The alphabetical letter strip handles "I know the term, I want to scroll to it" cases.

If user research surfaces a need for client-side search later, it can be added as a progressive enhancement. The V5 navigation works without it.

---

## 10. Accessibility

Three accessibility commitments:

### 10.1 Keyboard navigation

- The header strip is a keyboard-navigable list of links. Tab moves between section anchors; Enter activates.
- The pathway picker is keyboard-navigable.
- All anchor jumps work without JavaScript (the only requirement is browser fragment-anchor support, which is universal).
- The §10 letter strip is keyboard-navigable.

### 10.2 Screen reader

- The header strip is wrapped in `<nav aria-label="Glossary section navigation">`.
- The pathway picker is wrapped in `<section aria-label="Reading pathways">` with each pathway as a discrete element.
- §10 letter strip is `<nav aria-label="Alphabetical index">`.
- Each section's heading is a sequenced `<h2>` (no skip-levels); subheadings are `<h3>`.

### 10.3 Color and contrast

- The header strip's primer-vs-reference visual distinction uses both color AND a vertical divider (so colorblind users still distinguish the two groups).
- The notation-rendering role colors meet WCAG AA contrast minimum.
- The pathway picker uses underline + color for link affordance (color is supplementary).

---

## 11. What V5 navigation does NOT do

- **No client-side search.** Browser-native Ctrl+F + §10's alphabetical strip is sufficient.
- **No progress-tracking.** The glossary doesn't remember which sections you've read.
- **No personalization.** All readers see the same navigation; the pathway picker provides reader-declared starting points without storing them.
- **No JavaScript-driven sectional collapse/expand on desktop.** The page is read as a long document; sections aren't gated.
- **No mobile dedicated navigation app.** The same HTML works across viewports; mobile-specific tweaks are CSS-only.

These exclusions are deliberate. The glossary is a *reading surface*, not an app. Heavier navigation tooling adds complexity without proportionate benefit.

---

## 12. Constraints honoured

- Static navigation (no JavaScript required for any navigation primitive)
- Anchor-based and URL-shareable
- Both learner-first and expert-first flows work on the same page
- §10 lookup remains fast (one click from the header strip)
- Existing anchor conventions (`#term-{slug}`, `#glossary-panel-{slug}`, `#modifier-reference`, etc.) preserved
- The `glossaryAnchors.ts` deep-link resolver continues to work
- Mobile compresses the navigation surfaces; doesn't replace them
- Accessibility commitments documented
- No personalization or progress tracking
- No canonical-ontology changes

---

## 13. Cross-references

- `GLOSSARY_V5_ARCHITECTURE.md` — defines the 12 sections this navigation orients
- `TRADITIONAL_GLOSSARY_PRESERVATION_PLAN.md` — defines §10 and §11; this document navigates them
- `MOVEMENT_LANGUAGE_PRIMER_DRAFT.md` — §1; the entry point for the learner-first flow
- `SYMBOLIC_GLOSSARY_INTEGRATION.md` — §7 + §9 navigation lives within this design
- `src/services/glossaryAnchors.ts` — the resolver every cross-link flows through
- `exploration/dictionary-symbolic-card/SYMBOLIC_CARD_SPEC.md` — the dictionary's card the glossary cross-links to via component-view deep-links
- `feedback_phased_scope_control.md` — curator-led pathway authoring

---

*End of GLOSSARY_V5_NAVIGATION.md*
