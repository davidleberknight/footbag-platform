# Glossary Phase 1 — Family + Entry Histogram Implementation Plan

Scope: exactly two additions, the Entry histogram in Timing & Sets and the Family histogram in Core Trick Families, each with one explanatory paragraph. Nothing else moves. No taxonomy, family, modifier, route, or definition changes.

Note on prose: per the root IP em-dash cleanup item, all new copy below uses commas/colons/parentheses, no em dashes, so it passes the planned `assert_conventions.sh` text gate.

---

## 1. Exact insertion points in `glossary.hbs`

**Entry histogram** — Timing & Sets section (`<section>` closes at line 513). Insert after the term-list `</dl>` (line 512), before `</section>` (513), so the chart caps the section after Set / Uptime / Midtime / Downtime are defined:
```
    </dl>                                    <-- line 512
    {{! NEW: entry histogram + paragraph }}  <-- insert here
  </section>                                 <-- line 513
```

**Family histogram** — Core Trick Families section, `First-class families` subsection. The admission-rule intro paragraph runs ~621-634; the roster renders at line 636. Insert after the intro `</p>` and before the roster `<p class="glossary-family-roster">`:
```
      ...glossary roster and the dictionary roster always match:
    </p>                                     <-- end of admission-rule intro (~634)
    {{! NEW: family histogram + paragraph }} <-- insert here
    <p class="detail-muted glossary-family-roster">  <-- roster (~635)
      {{#each content.firstClassFamilyRoster}} ...
```
Rationale: the reader meets the empirical rule, sees the chart that proves it, then the roster. The family paragraph references the entry chart shown one section earlier, closing the entry/terminal symmetry.

---

## 2. Final histogram copy

### Family histogram (recursive descendants; surfaces first, then all 24 first-class families)
```
Clipper Stall  328        Eggbeater         13
Toe Stall      252        Double-Over-Down  12
Osis            84        Inside Stall      11
Whirl           74        Eclipse            9
Legover         71        Flail              9
Mirage          69        Barrage            8
Butterfly       48        Paradon            6
Illusion        34        Butterfly-Swirl    5
Swirl           29        Dyno               5
Pickup          27        Dada-Curve         4
Blender         22        Flurry             3
Torque          22
Double Legover  16
Drifter         14
Barfly          13
```
- Swirl is **29** (recursive descendants: swirl + twirl + whirling-swirl). The "24" in the request was Swirl's *direct* count; using recursive descendants keeps Swirl above Pickup (27), matching the requested ordering and the committed `RANKING.md`.
- Clipper Stall (328) / Toe Stall (252) are landing-surface counts; the families are recursive-descendant counts. Both are "how many tricks resolve into this," so they share one bar scale.
- Branch families (Blender, Torque, Double Legover, Eggbeater) appear at their own counts; a one-line note (in the paragraph) states their tricks are also within their parent root's bar.

### Entry histogram (set surfaces + set/timing systems)
```
Toe set     207        Stepping  50
Clip set    197        Quantum   21
Symposium    79        Atomic    11
Paradox      63        Blurry     6
Pixie        60        Nuclear    6
Fairy        55        Furious    2
```
- Toe set (207) / Clip set (197) are formula position-0 surfaces; the systems are curated modifier membership.
- The generic/unspecified set (60 tricks whose notation does not name the surface) is **omitted** as a notation artifact, not an entry system.
- Body modifiers (spinning, ducking, gyro, diving) and operator overlays are intentionally absent: per the entry audit they are body topology, not entry.

---

## 3. Final explanatory copy

**Entry paragraph (Timing & Sets):**
> Two set surfaces dominate how tricks begin: toe (207) and clipper (197). Beneath them a handful of set systems recur, the named ways a trick is initiated: symposium and paradox (timing), pixie, fairy, and stepping (set ecosystems). The set surface itself is too broad to be a system; the systems are what players layer on top of it. Remember this shape, because the ending mirrors it.

**Family paragraph (Core Trick Families):**
> Just as two surfaces dominate how tricks begin, two dominate how they end: clipper stall (328) and toe stall (252) catch nearly every trick. The families below are the largest distinct lineages that resolve onto those two surfaces, which are themselves too broad to be families (that is why they are not family cards). This roster is not curator-picked; it is what the documented vocabulary measures. Branch families such as Torque and Blender are sub-lineages of their root, so their tricks are counted within the parent's bar as well.

---

## 4. Hard-coded vs derived

**Recommendation: hard-code as a content-module snapshot** (`src/content/freestyleTopologyHistograms.ts`), with a drift-guard test.

- The *direct* family counts are already derivable in the service (`familyTrickCounts`), but the *recursive* counts (fold rollup) and the *surface landing* counts (328/252, formula parse) are not, and the *set-system* counts come from membership. Deriving all of these at render time means porting the four audits' logic into `freestyleService`: real complexity, and it couples a public page to the audit method.
- A content-module snapshot is reversible TypeScript content (the governance default), low-risk, and the roster is currently stable (just ratified at 24). Each entry: `{ label, count, bucket: 'surface'|'core'|'branch'|'lineage', parent? }`.
- **Drift guard (cheap):** a unit test asserts the snapshot's direct-count-derived ordering still matches the live `familyTrickCounts` head, so a future trick-data change that would invalidate the chart fails CI loudly. The module header documents the measurement basis and the "as-of" nature.
- Future option (not Phase 1): a derived renderer once the audit logic is worth productionizing.

---

## 5. Markup approach (CSP-safe, accessible)

No inline `style` is permitted (CSP `style-src 'self'`), so bar widths cannot be `style="width:26%"`. Two viable options:

- **A (recommended): quantized width classes.** The service buckets each count to the nearest 5% of the max and the template applies `gloss-bar-fill--w{{bucket}}` (20 classes `--w5 … --w100` in `style.css`, plus a `min-width` so the smallest bars stay visible). Full visual control, matches the design system.
- **B: native `<meter>`.** `<meter min="0" max="328" value="84">` is semantic and screen-reader-friendly with no width class, but cross-browser styling (`::-webkit-meter-*`) is fiddly. Acceptable if exact styling is not required.

Markup shape (option A), as a definition list so the data is real text, the bar is decoration:
```
<dl class="gloss-histogram" aria-label="Terminal surfaces and family lineages by descendant count">
  <div class="gloss-histogram-row gloss-histogram-row--surface">
    <dt>Clipper Stall</dt>
    <dd><span class="gloss-bar" aria-hidden="true"><span class="gloss-bar-fill gloss-bar-fill--w100"></span></span>
        <span class="gloss-bar-count">328</span></dd>
  </div>
  ...
</dl>
```

---

## 6. Mobile rendering considerations

- Bars are percentage-width inside a fluid container, so they reflow at any viewport; no fixed pixel widths, no horizontal scroll (unlike an ASCII `<pre>`, which would overflow on phones).
- Row layout: label and bar+count on one line at >=480px; at narrow widths the label sits on its own line above the bar (a single `flex-wrap` rule). The count stays adjacent to the bar end.
- The 24-family chart is long; on mobile it reads as a clean vertical list of bars, which is fine. Consider a two-column grid only at >=768px (optional; single column is acceptable and simpler).
- Surface rows get a subtle separator/emphasis (`--surface` modifier) so the two grandparent bars read as a distinct tier even when the bars are tall.

---

## 7. Size-budget impact

- The glossary re-bloat guard is currently `< 285_000` bytes (`tests/integration/freestyle.routes.test.ts`).
- Estimated additions: ~26 family rows + ~12 entry rows = ~38 rows at ~160-200 bytes of markup each (~6.5-7.5 KB), plus two paragraphs (~1.6 KB). Total ~8-9 KB.
- This likely pushes the page over 285 KB. **Plan: raise the ceiling to `295_000`** in the same change, with a one-line comment noting the two histograms, and confirm the actual rendered size during implementation. (The guard is a re-bloat tripwire, not a hard product limit; a measured, intentional addition is the legitimate reason to move it.)

---

## 8. Accessibility considerations

- **Data is real text, not encoded in bar length.** Every row exposes the label (`<dt>`) and the numeric count (`<span class="gloss-bar-count">`) as readable text; the bar element is `aria-hidden="true"` decoration. Screen-reader users get "Clipper Stall 328" regardless of the visual.
- The chart container carries an `aria-label` describing what it measures.
- Bars must not be the only signal: the count text carries the value; surface vs family tiers are conveyed by the `--surface` label/heading, not color alone. Bar fill meets contrast against its track.
- If option B (`<meter>`) is chosen instead, the element is natively announced ("84 out of 328") and the visible count span becomes redundant but harmless.
- No JS required: bars render server-side; the page is fully usable without scripts (progressive-enhancement rule).

---

## 9. New CSS classes required (`style.css`)

`.gloss-histogram`, `.gloss-histogram-row`, `.gloss-histogram-row--surface`, `.gloss-bar`, `.gloss-bar-fill`, `.gloss-bar-fill--w5 … --w100` (20 steps), `.gloss-bar-count`. All must be added to `style.css` and grep-verified (per template-conventions). Tokens (color/radius) reuse the existing freestyle palette, not new hex literals (aligns with David's tokenization work).

---

## 10. Open decisions for sign-off

1. **Recursive vs direct counts** for the family chart: recommend **recursive** (Swirl 29, matches the requested ordering and `RANKING.md`). Confirm.
2. **Markup**: option A (quantized width classes, recommended) vs option B (`<meter>`).
3. **Size budget**: confirm raising the guard to 295 KB.
4. **Generic set (60)** omitted from the entry chart: confirm.

On sign-off, implementation is: one content module, one service field per histogram, two `glossary.hbs` blocks, the CSS classes, the size-budget bump, and tests (render assertions + the drift guard).
