# Symbolic Surface QA Review — post-NR-1 / NR-1B

Generated 2026-05-14. Observational UX/editorial audit; no code-writing slice. Conducted by inspection of current code/templates/CSS state plus reasoning about visual rendering outcomes.

## Scope

Surfaces evaluated:
- Freestyle landing page (`landing.hbs`)
- Dictionary browse cards (`dictionary-trick-card.hbs` consumed across `?view=add`/`?view=family`/`?view=category`/`?view=component`/`?view=topology`)
- Trick-detail notation panels (`trick.hbs` + `trick-ux2.hbs` pilot)
- Glossary §3 (operator board + intermediate-operators dl + symbolic-compression flow + Execution Mechanics + modifier-reference)
- `/freestyle/sets` (moves reference page)
- Operator-board primer (shared partial)

Quantitative context:
- Chain registry: **36 compounds** with canonical ≡ readings (was 13 pre-CSR S2; +6 in CSR S2; +17 in NR-1)
- Alias allow-list: 5 atom-level entries (2 surface, 3 hidden)
- Longest reading currently rendered: **40 chars** (`spinning ducking paradox symposium whirl` — montage)
- Dictionary cards with ≡ rendering: ~38 of 160 (~24%)
- Cards still rendering 2-line atom-shape (slug + ADD): ~70 (atoms + sui-generis without canon-readings + Wave-pending)

---

## A. Strengths

### A1 — Pattern-recognition density crossed a useful threshold

Pre-NR-1: 13 chain-registered compounds. The dictionary surfaced ≡ readings sparsely; pattern repetition was barely visible. Post-NR-1: 36 chain-registered compounds. Compositional families are now visible to a scanning reader:

- **Surging-X family** (surge / surreal / surgery / venom / bigwalk): five cards in a row all leading with `≡ surging ...`. The naming pattern emerges visually without needing to read prose.
- **Atomic-X family** (atom-smasher / atomic-torque / fusion / omelette / eggbeater): six cards with `≡ atomic ...` readings; the `atomic` operator's reach across the corpus becomes legible.
- **Miraging-X family** (torque / drifter / double-leg-over / smear): the miraging-as-set-modifier pattern is visible.
- **Pixie-X family** (smoke / smog / smudge / phoenix / dimwalk): the pixie-set-modifier pattern stacks visibly.

This is the CSR breakthrough materializing: scanning the dictionary IS now a way to learn symbolic compression. The threshold for pattern-recognition to start working was crossed.

### A2 — Stopping-depth invariants held

No card over-expands. The 17 NR-1 entries each chose one canon-locked stopping depth. The 3 multi-reading cards (mobius / matador / paradox-symposium-whirl from earlier S2 + curator-edits) each layer their readings via the adjacent-sibling `-2px` rule, reading as one semantic stack rather than bullets.

No reading recursively expands beyond accepted intermediate operators. The forever-rule from PART H-pre is structurally and culturally respected.

### A3 — Cross-surface visual identity stable

Same trick (e.g., torque) renders the same symbolic-object identity on landing-glossary-dictionary. The Batch 4 typography unification + the CSS `::before { content: '#' }` slug-prefix injection ensures byte-for-byte visual parity for the four-layer primitive (slug / ≡ / notation / ADD). Identity is unmistakable.

### A4 — Two-surface contract enforced

No prose creep onto browse cards detected in the post-NR-1 state. Dictionary cards remain purely symbolic. The legacy `dict-card-aliases` row stays retired. The expanded surface (`/freestyle/tricks/:slug`) carries narrative content; the compact surface stays compact. Boundary holds.

### A5 — Operator-board restraint preserved

Operator-card deeplinks: each card carries at most one deeplink (`{{#if href}}<a class="operator-card-deeplink">...`). Operator-board landing footer: single "Full set notation reference →" link below the board. No proliferation of cross-links. The user-spec restraint goal ("operator-board footer links remain restrained enough") is intact.

### A6 — Glossary §3 still digestible

The §3 stack (operator board removed in Batch 1 → "How Tricks Are Built" prose → modifier-reference dl [render-disabled] → intermediate-operators dl with 10 entries → symbolic-compression-flow with 3 cards → Execution Mechanics with 7 PassBack micro-entries) reads top-to-bottom as a learning progression. No section is overgrown. The Batch 3 re-bloat guard (`res.text.length < 120_000`) still passes per latest test run.

### A7 — footbag.org/newmoves/list provenance elevated (NEW)

Per the maintainer note delivered with NR-1B: the historical footbag.org move list at <http://www.footbag.org/newmoves/list/> is now confirmed as the verbatim source for the pendulum + squeeze curator-provided text. This materially upgrades the source from "incidental legacy reference" to a **structured high-value audit source** suitable for terminology / operational-notation / alias / decomposition / provenance / candidate-trick evidence. Recommend a future dedicated FBORG-AUDIT-1 lane (see PART G).

---

## B. Weaknesses

### B1 — Long-reading wrap behavior is uneven on narrow viewports

Five readings exceed 23 characters:

| Slug | Reading | Length |
|---|---|---:|
| montage | `spinning ducking paradox symposium whirl` | 40 |
| surgery | `surging symposium reverse whirl` | 31 |
| mobius | `spinning ss miraging op osis` | 28 |
| plasma / fusion | `quantum/atomic double over down` | 24 |
| matador | `paradox atomic butterfly` | 24 |

At desktop widths the dict-card-stack column is full container width — no wrap concern. At mobile (≤480px) the card padding (10px 12px 8px 12px) leaves ~456px content area at 480px, ~296px at 320px. The Georgia italic 0.96rem averages ~7-8px/char → a 40-char reading consumes ~280-320px. At 320px viewport, montage wraps to 2 lines; at narrow column widths in a future faceted-grid view, more readings would wrap.

The CSS for the mobile rule on `.core-trick-notation` carries `overflow-wrap: anywhere` (Batch 4); the equivalent rule on `.core-trick-equivalence` does NOT. Notation has the safety net; equivalence doesn't. The asymmetry is a small gap — natural-word-break wrapping is OK for tokens like `surging paradox mirage` (spaces) but would fail on hypothetical hyphenated-compound tokens.

### B2 — Glossary §3 mobius rendering diverges from chain registry

`glossary.hbs §3 symbolic-compression-flow` hardcodes mobius's readings as:
- `≡ spinning ss torque`
- `≡ spinning ss miraging osis`

Chain registry (consumed by dictionary cards) shows mobius's readings as:
- `≡ gyro torque`
- `≡ spinning ss torque`
- `≡ spinning ss miraging op osis`

The glossary intentionally surfaces 2 readings (educational subset). The dictionary surfaces all 3. Same trick, different rendered depth across surfaces. **This was flagged in CSR PART 7 / NR-4 in the notation-reconciliation audit and deferred ("current dual state works"). NR-1 does not change this divergence. Re-flagging for awareness.**

The risk is editorial drift — if the curator updates mobius's registry chain (e.g., removes `gyro torque`), the glossary's hardcoded readings continue rendering. Not currently drifted; the dual-source maintenance burden grows the longer it persists.

### B3 — /freestyle/sets visual language is unaligned

The set-notation reference at `/freestyle/sets` (template: `moves.hbs`) renders as a **legacy two-column `<table class="moves-table">`** with Set Name + Notation columns. The page predates the symbolic-object visual unification and was not updated in Batch 4.

This is appropriate for a token-reference page (table format suits operational-notation lookup), and the page is correctly NOT pretending to be a compact-symbolic-object surface. But: the cross-surface visual identity established by Batch 4 doesn't extend here. A reader navigating from a dict-card's `Full set notation reference →` link arrives at a visually-disjoint surface.

Not crisis-priority. The page serves a specific purpose (set-notation reference lookup); table format is functional for that. Future modernization is a candidate but not urgent.

### B4 — Body-stall family stays visually uneven (NR-2/NR-3 deferred)

Per the notation-reconciliation audit PART 1 Category B, 8 body-stall siblings still lack notation while `head-stall|HEAD STALL` / `toe-stall|TOE STALL` have it. NR-1 focused on chain-registry expansion; NR-2/NR-3 (body-stall + sui-generis backfill) deferred. NR-1B addressed only pendulum + squeeze (the two unresolved sui-generis primitives from Category C). The body-stall visual unevenness persists.

Not user-blocking. Visible only when a reader compares head-stall to forehead-stall side-by-side.

### B5 — Operator-card action text variance (minor)

Spot check: most operator-board action lines are concise (one sentence). The Symposium action text (Batch 1 C-7 fix; PassBack-verbatim "A component where an active leg performs an action in a single-leg jump: the symposium leg jumps and lands on its own while the other leg remains in the air.") is materially longer than peer action texts. Visual asymmetry on the operator-board grid — one card is taller than siblings.

Acceptable per Batch 1 maintainer decision (substance over uniformity); flagged here for completeness, not as a fix candidate. The longer text is the load-bearing definitional fix; shortening would re-introduce the ontology error that Batch 1 retired.

---

## C. Overload risks

### C1 — Pattern-blindness as ≡ becomes ubiquitous

Currently ~24% of dict-cards render ≡ readings. Future curator expansion (per the audit's identified ~15+ pt-locked-but-not-yet-registered compounds) could push this to ~40-50%. At that point, ≡ may become visual wallpaper — readers stop processing the sigil and miss its meaning.

Mitigation: the symbolic compression IS the point. The risk of ≡ becoming "expected" is the desired end-state — pattern recognition kicks in. Not an overload to mitigate; an outcome to plan for. The risk only becomes real if ≡ is over-applied to non-canon-locked readings (e.g., a future contributor adds speculative chains). The restraint-first allow-list + chain-registry forever-rules already guard this.

### C2 — Multi-reading cards getting tall

Mobius renders 3 readings + ADD chip (4 visible rows + slug + chip = 5-line card). Matador renders 2 readings + operational notation + ADD = 5-line card. At mobile widths with hanging-indent notation wrap, these cards consume meaningful vertical space.

Mitigation: this is the natural expression of compositional depth. The tight-stack rule (`margin-top: -2px` on consecutive `≡` lines) compresses the readings into a layered look rather than bullet-list look. Card height variance signals trick complexity at a glance, which is the symbolic-object philosophy.

Risk threshold: if a future curator-authored entry tries to surface 4+ readings on a single card, the visual rhythm would degrade. The file-header rule "Max 3 readings per chain" in `freestyleSymbolicEquivalences.ts` enforces this.

### C3 — Long readings overflow narrow columns (B1 revisited)

40-char montage reading on a 320px viewport: wraps to 2 lines. On a 768px tablet: fits on one line. The wrap is visually clean (Georgia italic, generous line-height) but produces a tall card for that one row. Same concern as C2 but driven by reading-length not reading-count.

Mitigation candidate (B1 + C3 share): add `overflow-wrap: anywhere` parity rule for `.core-trick-equivalence` on mobile, matching the existing rule on `.core-trick-notation`.

### C4 — Card uniformity test may need to broaden

The card-uniformity test (mentioned in `project_symbolic_ux_rollout` memory) enforces consistent dict-card structure across browse views. With ≡ rendering now active, the test's assertions remain valid (≡ row is optional via `{{#if symbolicEquivalences.length}}`), but a future contributor adding a new view (e.g., a hypothetical `?view=archetype`) needs to know the ≡ row must conditionally render. The contract is encoded in the partial; future-proof via continued single-partial use.

---

## D. Typography / layout recommendations

In order of leverage (highest first):

### D1 — Mobile overflow-wrap parity on `.core-trick-equivalence` (HIGH ROI, tiny)

One CSS rule. Brings equivalence-row mobile behavior to parity with notation-row behavior. Plugs the B1 edge case.

```css
@media (max-width: 480px) {
  .core-trick-equivalence {
    overflow-wrap: anywhere;
  }
}
```

Zero risk. Doesn't change desktop rendering (where `.core-trick-equivalence` doesn't carry `overflow-wrap` currently and works because natural word breaks suffice). Mobile gains safety net for edge cases.

### D2 — Optional: subtle column-min increase on dict-card-stack (LOW ROI, small)

Today the dict-card-stack is full container width — long readings fit fine on desktop. If a future faceted-view introduces a grid layout (e.g., 2-column compounds vs 1-column), the minmax should be ≥260px to accommodate readings up to ~36 chars without wrap. No change needed today; flag for future browse-facet work.

### D3 — Optional: glossary §3 mobius-flow refactor to consume registry (MEDIUM ROI, medium effort)

Per B2 — fold the §3 mobius/torque/osis hardcoded readings into a service-layer shaping that pulls from `freestyleSymbolicEquivalences.ts`. Resolves the dual-source maintenance burden. Risk: glossary's intentional 2-reading subset for pedagogical compactness vs dictionary's 3-reading registry default. Requires a per-surface filter rule.

Recommend deferring unless registry-drift incident occurs.

### D4 — `[UNS]` flag formalization in glossary §9 (deferred from NR-1B; LOW priority)

NR-1B introduced `[UNS]` as a curator op-flag for squeeze without adding it to the §9 component-flags dl. A future small slice would: add `[UNS]` as a labeled flag in glossary §9 with curator-authored definition, OR rename it to an existing flag (if appropriate). Maintainer call. No urgency — current rendering treats `[UNS]` as an unknown-role token gracefully.

### D5 — /freestyle/sets compact-object treatment (DEFERRED — large)

Per B3. Modernizing the moves-table page to use symbolic-object cards (or a hybrid table-with-symbolic-rows pattern) would unify visual language across all freestyle surfaces. Large change; ROI is consistency, not pedagogical breakthrough. **Not justified as next-slice.**

---

## E. Is follow-up justified?

**Yes, one tiny slice. No major follow-up.**

The post-NR-1 surfaces are working as designed. The dictionary's symbolic-language breakthrough is materializing (per A1). Stopping-depth philosophy holds. Cross-surface identity stable. The two-surface contract enforced. The substantive concerns (B2 mobius dual-source, B3 /freestyle/sets visual alignment) are already deferred items with explicit "current state works" maintainer rulings.

The one genuine plug-the-edge-case opportunity is D1: mobile overflow-wrap parity.

---

## F. Single highest-ROI slice proposal

**VIS-TUNE-1 — mobile overflow-wrap parity for symbolic-object equivalence layer**

| Aspect | Detail |
|---|---|
| Scope | One CSS rule addition: `@media (max-width: 480px) { .core-trick-equivalence { overflow-wrap: anywhere; } }` |
| File | `src/public/css/style.css` (one block in the existing `@media (max-width: 480px)` section) |
| Risk | Zero. Doesn't change desktop. Provides mobile parity with `.core-trick-notation`. |
| Test impact | Zero. No existing assertion measures equivalence wrap behavior. |
| User-visible benefit | Edge-case: future hypothetical hyphenated-compound tokens (e.g., a curator adds a reading with a long unbreakable token) wrap cleanly on mobile instead of overflowing the card horizontally. Currently the rendered readings (max 40 chars, all whitespace-separated) wrap cleanly via natural word break; this rule is a safety net not a current-state fix. |
| Time | <5 minutes of curator review + apply |

This is the only justified follow-up slice. Anything larger should wait for a specific maintainer need.

---

## G. FBORG-AUDIT-1 provenance elevation (forward-pointer)

Per the NR-1B provenance clarification 2026-05-14: <http://www.footbag.org/newmoves/list/> is now a confirmed **structured high-value audit source** materially upgraded from "incidental legacy reference."

### What it is

The historical footbag.org move list (Chris Holden-era + community-extended) hosting per-trick descriptions, operational-notation hints, alias relationships, and decomposition language. Predates the modern dictionary. Verbatim source for NR-1B's pendulum + squeeze descriptions.

### What treating it as an audit source means

| Treat as | Why |
|---|---|
| Terminology evidence | Historical naming conventions visible |
| Operational-notation evidence | Curator-authored op-flag patterns ([DEL], [DEX], [UNS], etc.) |
| Alias evidence | Folk-name and synonym relationships |
| Decomposition precedent | Compositional readings that pre-date Red rulings |
| Provenance source | When citing curator-provided text, this source can be the lineage |
| Candidate-trick audit source | Tricks present in the list but not in `freestyle_tricks` |

### What NOT to treat it as

| Forbidden treatment | Why |
|---|---|
| Automatic ontology authority | Red rulings supersede; some entries on the list are folk-names or community drift |
| Bulk-import source | Quality varies; per-row curator review required |
| Auto-promotion source | Frequency in this list ≠ canonical status (per `feedback_frequency_not_authority`) |
| Ontology-mutation source from source text alone | Curator + maintainer review still gates promotions |

### Proposed FBORG-AUDIT-1 lane (future curator slice)

Eight audit dimensions worth investigating:
1. Missing canonical tricks (entries on fbORG list, absent from `freestyle_tricks`)
2. Alias relationships (folk-names linking known canonical tricks)
3. Glossary/operator terminology (definitions that complement/conflict with current glossary)
4. Operational-notation patterns (recurring flag sequences across many tricks)
5. Decomposition clues (compositional readings pre-Red)
6. Conflicts with current canon (rare; flag-and-defer)
7. Historical naming conventions (era-tagged terminology)
8. Body/surface primitives (stalls, contact treatments unique to the list)
9. Media/tutorial opportunity gaps (entries with associated video archives)

**Out of scope for this QA review.** Surfaced as a future-work pointer. Curator + maintainer decide if/when to run FBORG-AUDIT-1.

Saving the source-elevation as a reference memory so future sessions know this corpus exists as a structured audit source.

---

## Summary

NR-1 + NR-1B worked. The dictionary surfaces compositional structure visibly for ~24% of canonical tricks; pattern-recognition density has crossed the threshold where scanning ≡ readings teaches operator-stacking and family-topology without prose. Stopping-depth invariants intact. Cross-surface identity holds. Two-surface contract enforced.

One small mobile-typography edge case worth fixing (VIS-TUNE-1). Two pre-existing deferred items (glossary §3 dual-source; /freestyle/sets visual alignment) remain deferred — current state works. No crisis-priority follow-up justified.

The footbag.org/newmoves/list elevation is the most consequential forward-pointer: a structured curator-guided audit lane (FBORG-AUDIT-1) is now warranted as a future work item, gated on maintainer go-ahead.
