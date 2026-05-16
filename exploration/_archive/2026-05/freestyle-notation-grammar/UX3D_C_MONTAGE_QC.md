# UX3d-c -- Montage Flagship QC

Date: 2026-05-11. Status: QC review + refinement candidates. No new features.

Sister docs: `UX3_FLAGSHIP_SYNTHESIS.md` (north-star intent); `UX3D_A_PHASE_REPORT.md` (token-coloured hero strip); `UX3D_B_PHASE_REPORT.md` (modifier-layering nested boxes).

Goal: evaluate whether the restored prototype-style surfaces now make Montage feel like the flagship north-star page; identify small refinements without expanding scope.

Out of scope per user direction: mini graph, lowered modifier-layering threshold, promoting more pages, new content fields.

---

## 1. Artifacts captured

- `legacy_data/reports/html_qc/ux3d-c/montage.html` -- 30,502 bytes / 602 lines (full server render)
- `legacy_data/reports/html_qc/ux3d-c/montage.txt` -- 6,469 chars / 242 lines (text-only extract)

The text extract is the mobile-style sequential read: it tells you exactly what a screen-reader user, or a reader who has CSS disabled, will encounter top to bottom.

---

## 2. Section-by-section walk

Top-to-bottom render order:

1. Breadcrumb: `Freestyle / Trick Dictionary / Montage`
2. Eyebrow: `7 ADD`
3. **h1**: `Montage`
4. **UX3d-a decomposition strip**: `spinning ducking paradox symposium whirl` (5 role-coloured tokens)
5. Family badge: `whirl family`
6. **Hero subtitle (sortName)**: `Spinning Whirl (op) (symp) (ducking)`
7. Hero chips: `7 ADD | compound | 3 kicks (record)`
8. **UX3c-c hero formula**: `spinning(+1) + ducking(+1) + paradox(+1) + symposium(+1) + whirl(3) = 7 ADD`
9. Hero summary: editorial 1-sentence elevator pitch
10. Featured-media preview (empty state): `Curated tutorial coming soon. See the record-holder demonstration in Passback Records below.`
11. About this trick: description + Base trick whirl (3 ADD) + ADD value 7 + family editorial note
12. Notation (semantic): role-coloured tokens
13. Set notation (operational): warm-palette tokens + source line
14. **UX3d-b modifier layering**: 5 nested boxes + Total ≡ 7 ADD
15. Execution prose (2 paragraphs)
16. Learning notes prose
17. Before you try this prose
18. Montage Family (UX3c-b tiered: 3 / 4 / 5 / 6 / 7 ADD with current highlighted)
19. Related Tricks (8 cross-family links with hashtags)
20. Media (empty-state pill repeated)
21. What you can do with this trick (pathways: Learn / Watch / Family)
22. Previous Tricks (5 lower-ADD whirl peers)
23. Passback Records (David Clavens, 3 kicks, 25 May 2008)
24. Structural decomposition (collapsed; expands to parser-grammar diagnostic)
25. Source footer

---

## 3. Evaluation against prototype intent

### 3.1 Semantic immediacy

**Strong.** From eyebrow + h1 alone, a visitor sees `7 ADD / Montage` -- the ADD weight and trick identity. The decomposition strip immediately below shows the structural breakdown in role colour. The hero formula confirms the math. Within 4 visual lines, the page communicates: what the trick is, how heavy it is, and how it decomposes.

**Verdict: prototype intent met.**

### 3.2 Color-coded structure

**Strong.** The hero decomposition strip uses cool-palette role pills. The hero formula uses cool-palette token spans. The modifier-layering panel uses the same cool-palette role classes for border + tinted background. The notation block uses the same classes for token spans. The operational notation uses the warm palette per its own contract.

Across 5 separate surfaces (decomposition strip, hero formula, notation block, modifier layering, operational notation), the role colour discipline holds. Cool stays cool. Warm stays warm. No bleed.

**Verdict: prototype intent met.**

### 3.3 Visual decomposition density

**Strong.** Three independent surfaces show the structural decomposition:
- Decomposition strip (5 coloured pills, ~1.05rem font, scan layer)
- Hero formula (mono one-liner with operators + weights, ~0.95rem)
- Modifier layering panel (5 nested boxes, ~1.05rem nested, study layer)

Each surface uses the same data with a different visual treatment: scan / inline / spatial-nested. The prototype's spatial-nesting motif is now restored. Each surface adds reading-speed signal: a viewer scanning at glance gets the strip; a viewer wanting the math gets the formula; a viewer studying structure gets the layering.

**Verdict: prototype intent met.**

### 3.4 Readability

**Strong on desktop; strong on mobile after media-query tightening.**

The hero block reads in this rhythm: eyebrow -> title -> tokens -> family -> subtitle -> chips -> formula -> summary. That is 8 elements stacked vertically before the page body begins. On desktop this is comfortable; on mobile (375px) each element wraps to its own line. The total hero block height at mobile is approximately 9-11 vertical-line-heights of content. Acceptable but stacks tall.

The modifier-layering panel renders 5 nested boxes; on mobile each box is ~340px wide with progressive insets. The deepest box (`core: whirl (3)`) is ~280px wide at 375px. Readable, no horizontal overflow.

The family lineage's 5 ADD tiers stack to single-column at <600px. Members within each tier wrap on the same line as long as the tier is short; the dense 4-ADD tier (8 members) wraps to 2 lines at 375px.

**Verdict: readable in all surfaces; mobile hero stacks tall but does not break.**

### 3.5 Mobile wrapping

All surfaces verified for `flex-wrap: wrap` + `padding tightens at <600px`. No horizontal overflow on any surface. The Montage 5-token decomposition strip wraps to 2 lines at 375px; the 5-layer modifier-layering panel preserves visual nesting via progressive HTML containment.

**Verdict: clean.**

---

## 4. Refinement candidates

Five candidates identified. I'd implement (1) and (2) as small cosmetic refinements; flag (3)-(5) for human review.

### 4.1 (small) "ADD value: 7" row is redundant when modifier_links exist

In the About-this-trick `<dl>`, the row `ADD value | 7` renders for Montage because `addComposition` is null (Wave-2 single-token canonical names don't populate it). With UX3c-c's hero formula and UX3d-b's modifier-layering panel both surfacing the total prominently, the `<dt>ADD value</dt>` row is the 4th place the same `7` appears in close proximity.

**Refinement:** suppress the `ADD value` dl row when `modifierLinks.length >= 1`. Hero formula + modifier layering carry the math; the redundant row is noise.

**Risk:** for atom rows (no modifier links), the row continues to render. Sparse-friendly.

### 4.2 (small) "Modifier layering" intro is technical

Current intro: `Outermost first; core last. Each modifier wraps the next and contributes its weight to the total.`

The "each modifier wraps the next" phrasing is HTML-structure-language; not pedagogically useful for a learner. The intro can be shorter and more inviting.

**Refinement:** `Each modifier stacks onto the base; weights add to the total.`

### 4.3 (medium) sortName subtitle reads as records-side jargon

Hero subtitle currently shows: `Spinning Whirl (op) (symp) (ducking)` -- this is the `sort_name` column on the records-side, used internally for searchability. The `(op)`, `(symp)`, `(ducking)` abbreviations are not learner-facing IFPA notation; they look like records-side annotation leaking onto a public surface.

The UX3d-a decomposition strip (4 role-coloured tokens above the subtitle) already conveys structural identity. The sortName subtitle adds visual noise without adding signal.

**Refinement (recommended; not implemented):** suppress `content.sortName` when `content.heroDecomposition` is non-null. Atom rows (sparse pages) without a decomposition strip can continue to show sortName.

**Risk:** affects every UX3d-a-activated page (Phoenix, Mind Bender, Spender, Montage). Tradeoff is reduced visual stack for those flagships vs preserving sortName as a search-style fallback. Recommendation slants toward suppression because the decomposition strip is the modern surface for this signal.

### 4.4 (medium) Hero formula vs modifier layering -- data shown twice

UX3c-c's hero formula (`spinning(+1) + ducking(+1) + paradox(+1) + symposium(+1) + whirl(3) = 7 ADD`) and UX3d-b's modifier layering panel render the same modifier+weight+base data in two different visual forms. For a flagship the duality is intentional (scan vs study layer); for a sparse 2-modifier compound (Phoenix), if it ever activated the layering panel, the duplication would feel redundant.

**Refinement (recommended; not implemented):** keep both for the >= 3-modifier case (the duality is editorially valuable at high density), but if the threshold ever drops to >= 2 (a separate decision), reconsider whether to keep both. For now, no action. The current Montage-only activation pairs the two surfaces well.

### 4.5 (medium) Media section: intro + empty-state pill duplicate

Current Media section:
```
Media
[intro] "Tutorials and demonstrations referencing this trick will appear here as they are added."
[empty pill] "Curated tutorial coming soon. See the record-holder demonstration in Passback Records below."
```

Both lines say the same thing. The intro is the section's `<p class="section-intro">`; the pill is the `featuredMediaEmptyState` text. For a flagship with no curated tutorial yet, two stacked empty-state messages reads heavy.

**Refinement (recommended; not implemented):** when `content.ux2Pilot.featuredMedia` is null (empty state active), suppress the section-intro `<p>`. The pill becomes the single empty-state surface. The intro line returns when actual media gets tagged.

**Risk:** mild template-shell change; touches the shell's media block.

---

## 5. Implemented refinements (small, in this QC pass)

### 5.1 Suppress "ADD value" dl row when modifier_links present

`src/views/partials/trick-about.hbs`:

The existing logic shows the `ADD value` row only when `addComposition` is absent AND row isn't a modifier AND `adds` is non-null. Tighten the condition: also require `modifierLinks.length === 0` (no compound structure). Since the partial does not currently have access to `modifierLinks.length`, surface a pre-shaped flag on the dictEntry or use a new `content.hasModifierLinks` boolean.

(See implementation in §6.)

### 5.2 Tighten modifier-layering intro

`src/views/partials/trick-modifier-layering.hbs`:

`Outermost first; core last. Each modifier wraps the next and contributes its weight to the total.`
→ `Each modifier stacks onto the base; weights add to the total.`

---

## 6. Implementation

### 6.1 Service: add `content.hasModifierLinks: boolean`

A pre-shaped gate signal so the trick-about partial can conditionally suppress the redundant `ADD value` row without recomputing modifier-link counts.

### 6.2 Template change: trick-about.hbs

```diff
- {{#unless content.dictEntry.addComposition}}
-   {{#unless content.dictEntry.isModifier}}
-     {{#if content.dictEntry.adds}}
-     <dt>ADD value</dt>
-     <dd>{{content.dictEntry.adds}}</dd>
-     {{/if}}
-   {{/unless}}
- {{/unless}}
+ {{#unless content.dictEntry.addComposition}}
+   {{#unless content.dictEntry.isModifier}}
+     {{#unless content.hasModifierLinks}}
+       {{#if content.dictEntry.adds}}
+       <dt>ADD value</dt>
+       <dd>{{content.dictEntry.adds}}</dd>
+       {{/if}}
+     {{/unless}}
+   {{/unless}}
+ {{/unless}}
```

For atoms / single-modifier-but-no-link rows, the `ADD value` row continues to render. For compound rows with link-table entries, the row suppresses since the hero formula + modifier layering already convey the value.

### 6.3 Template change: trick-modifier-layering.hbs

```diff
- <p class="section-intro">Outermost first; core last. Each modifier wraps the next and contributes its weight to the total.</p>
+ <p class="section-intro">Each modifier stacks onto the base; weights add to the total.</p>
```

---

## 7. Validation (post-refinement)

To be confirmed after §6 lands:

| Check | Expected |
|-------|---------|
| TypeScript build | clean |
| Freestyle integration tests | 244 / 244 green |
| Montage page: `ADD value: 7` row | suppressed |
| Atom page (Toe Stall): `ADD value` row | continues to render |
| Montage page: `Modifier layering` intro | shortened |
| HTML snapshot diff vs UX3d-b | bounded to the 2 edits above |

---

## 8. Verdict

Montage now feels like the flagship north-star page:

| Surface | Status |
|---------|--------|
| Hero scan-layer density | ✓ (decomposition strip + formula + summary all active) |
| Notation discipline (warm/cool palette) | ✓ (5 surfaces use role colours consistently) |
| Modifier-layering visualisation (prototype's distinctive surface) | ✓ (5-layer nested panel) |
| Editorial prose depth | ✓ (execution + learning + prereq) |
| Family lineage by ADD tier (prototype's vertical progression) | ✓ |
| Empty-state honesty | ✓ (featured media empty-state pill) |
| Media block honesty | ✓ (renders with empty state; will populate when curated) |
| Records discovery | ✓ (David Clavens, 3 kicks, 25 May 2008 in Passback Records) |
| Diagnostic accessibility | ✓ (Structural decomposition collapsed; expandable for grammar-aware visitors) |
| Mobile responsiveness | ✓ (no horizontal overflow; all surfaces wrap or stack at 375px) |

Two small refinements were identified and implemented in §5-6 (`ADD value` row suppression + modifier-layering intro tightening). Three medium refinements were recommended for human review (sortName suppression, hero-formula/layering duality discussion, media empty-state deduplication).

The page now demonstrates the UX3 north-star: a learner arriving cold reads identity, decomposition, math, and editorial guidance in a coherent top-to-bottom flow; a grammar-aware reader can drill into operational mechanics, modifier-layering nesting, and the collapsed parser diagnostic. Both audiences are served on a single shared shell.

---

## 9. What was NOT done

Per scope:
- No mini relationship graph (UX3e)
- No lowered modifier-layering threshold (still >= 3; Montage only)
- No promotion of additional pages
- No new content fields (no schema growth)
- No ontology mutation
- No parser changes

---

## 10. Decision points awaiting human input

1. **Approve the 2 small refinements** in §5 / §6? (`ADD value` row suppression + modifier-layering intro tightening)
2. **Approve `sortName` suppression** when `heroDecomposition` is non-null? Removes the records-side jargon line from Phoenix / Mind Bender / Spender / Montage heroes.
3. **Approve Media empty-state deduplication?** Suppress the `section-intro` `<p>` when `featuredMedia` is null and the empty-state pill carries the message.
4. **Approve QC verdict?** Or further refinement pass before claiming Montage as the north-star flagship reference?
