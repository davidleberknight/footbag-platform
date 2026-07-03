# Freestyle encyclopedia — editorial and IA audit (V1.0 pass)

Audit date 2026-07-03. Editor-in-chief pass over what IS rendered, building on the
de-dup blueprint (`exploration/glossary-dedup-proposal-2026-07-02/PROPOSAL.md`) and
its inbound-link census (`ORPHANS.md` in the same directory). Principle applied
throughout: one authoritative home per concept; every other surface links.

Page-level prose quality for the four foundational pages is owned by the sibling
`PHASE1_FOUNDATIONAL_EDITORIAL.md`; this audit covers the structural and
cross-surface editorial state.

## 1. Duplicated explanations (the de-dup blueprint, current status)

Verified against the code today:

- **Fix 1 (operator definitions) — partially shipped.**
  `freestyleOperatorReference.ts` declares and enforces single authority for the
  intermediate operators, and consumers derive their definition line from it. The
  open half is Tier-1 body operators: the operator board/index modules, the
  glossary's hardcoded sections plus `CoreAtomEducational`, and
  `symbolicModifierEducation` (which fully defines Paradox, Spinning, Ducking,
  Diving) still author independently. The fix design must first name the Tier-1
  authority — the natural move is extending the operatorReference pattern downward
  so one module feeds the operators page and the modifier pages' definition fields.
- **Fix 2 (ADD rules) — open.** The glossary's hardcoded ADD-accounting table and
  `freestyleAddAnalysisContent` enumerate the same component contributions
  independently. Generate the glossary table from the module.
- **Fix 3 (notation tokens) — open, the largest.** Three independent authorings:
  the glossary's ~435 hardcoded lines, the operators page's inline three-token
  vocabulary, and the Jobs notation article. One token module should feed all
  three; the operators glosses stay terser by design but derive.
- **Fix 4 (family definitions) — open, and now more urgent.** With
  `/freestyle/families/:slug` shipped, family content has FOUR homes: the family
  detail pages, `glossaryFamilyCards` (glossary-only), the
  `publicFamilies`/`familyTiers` rosters behind `?view=family`, and the
  trick-detail family ribbon. The de-dup ownership matrix anticipated this: the
  family pages become the owner, the glossary becomes gloss-plus-link, the browse
  view keeps grouping only. Execute the handoff now that the owner exists.
- **Fix 5 (dex-direction pedagogy) — mostly shipped.** Term anchors exist and
  modifier pages deep-link their glossary terms; the remaining links (operators
  paradox block into the glossary terms) are cheap.

Residual second home for ADD-range data outside the blueprint: the
symbolic-grammar DB registry carries per-group `add_range`/`min_adds`/`max_adds`
read by `symbolicGrammarService`. It is observational-layer by design, but any
change to operator weights must regenerate it — worth one line in the surface
propagation rule's checklist if not already covered.

## 2. Missing explanations

- **26 active tricks have no operational notation** — on these pages the notation
  card, the parser diagnostics, and the ADD accounting are silently thinner. The
  curator working order's "unknown-notation and deterministic-authoring" step is
  the fix; where notation genuinely cannot be authored, the page should say so
  (the Jani-Walker ADD-authority precedent gives the honest wording: value ruled,
  structure deferred).
- **Coaching depth is deliberately tiered**: 205/922 active tricks carry Technique
  Notes (the most-read set). This matches the editorial floor (at least as
  informative as the legacy footbag.org descriptions, which the description field
  meets at 916/922) — acceptable for V1, but the four unsourceable deferrals must
  keep their recorded unblock conditions.
- **Undefined-operator vocabulary is explained nowhere public**: 67 EV rows hang on
  16 undefined operator tokens (symple, slapping, phasing, fusing, sonic, slaying,
  twinspinning, twisting, twisted, leaning, frootie, wrecking, wonton, snapping,
  fyro, zipper). The EV page shows the hold state; it does not tell a reader what
  is known about each token (most have at least a folk-pair reading recorded in
  the audits). A one-line "what we know / what is missing" per token on the EV
  page would convert an opaque hold list into honest documentation. Low cost,
  high honesty.

## 3. Weak or missing introductions

- The five contextual-only surfaces (notation article, learn, walking-family
  progression, compositional sets, Holden reference table) each assume the reader
  arrived from the surface that links them; opened cold (search engines will),
  they under-introduce themselves. Criterion: every page's intro states what the
  page is, who it is for, and where the parent surface is — the compositional-sets
  page does this well ("exploratory hub" framing plus the sibling link) and is the
  model.
- The Holden reference table (`/freestyle/sets/reference`) is a flat scholarly
  table whose provenance framing ("an outside source" convention) must survive the
  prose-hygiene rule while still telling the reader why the table exists beside
  the Set Encyclopedia.
- Foundational-page intros (landing, learn, about, history): deferred to
  `PHASE1_FOUNDATIONAL_EDITORIAL.md`.

## 4. Discoverability gaps

- **Landing coverage**: five mounted surfaces are absent from the landing banners
  (notation article, learn, walking progression, compositional sets, Holden
  table). The thin-tail census pages (search, partnerships, leaders, about,
  notation-article, competition at 2-4 inbound sources) confirm the same shape.
  De-dup fixes 3 and 5 will organically add links to the notation article and
  glossary terms; the learn/progression pair needs a deliberate decision (banner
  tile under "The Language of Freestyle", or recorded contextual-only status).
- **Three "Coming soon" tiles** on the landing history band (History Timeline,
  Historical Milestones, Evolution of Vocabulary) are public vaporware. A V1
  encyclopedia does not advertise unbuilt content: build, or remove the tiles and
  let `/freestyle/history` carry the story.
- **Gallery dead-ends**: the family browse view, the landing, and
  `/freestyle/media` do not link into `/media/browse?context=` galleries the way
  trick pages do (tracked IP item). The media hub page itself is not a gallery,
  which surprises after the trick-page pattern.

## 5. Orphan and dead-end pages

Re-verified this run by full route enumeration rather than re-running the census
script: all 27 freestyle templates are rendered by mounted routes; every
freestyle service is transitively reachable; zero orphan templates; zero orphan
services; the search-suggest endpoint's single consumer is by design. The
tt-series route retired into the named-gallery system (confirmed absent from
src). The census's zero-orphan conclusion stands.

## 6. Missing cross-links

- Operators page → glossary dexterities terms (the remaining sliver of fix 5).
- Everywhere notation tokens are re-explained → the notation article (falls out of
  fix 3).
- Family detail pages ↔ glossary family cards ↔ `?view=family` need a consistent
  triangle: detail page owns, the other two link (falls out of fix 4).
- Set detail pages already cross-link Quantum↔Miraging with the open-question note
  — the model for cross-linking under uncertainty; apply the same pattern to any
  future divergence notes (terraging, blurry) rather than inventing new framing.
- EV page → the doctrine documents. `DOCTRINE_BLOCKING_QUESTIONS` text renders on
  the page, but a reader who wants the full story has no path to the down-family
  or positional doctrine content; since `freestyle/doctrine/` is not a public
  surface, the EV page's per-gate blurbs are the public home — keep them one
  sentence but current (see Section 8).

## 7. Glossary quality

- Structure is strong (twelve sections, anchors, layer attribution). The quality
  risk is entirely the monolith problem: 2,435 hand-authored template lines where
  four content kinds are second copies (Section 1). Every future doctrine change
  (an operator ADD, a family re-tier) must currently be hand-propagated into the
  template — the exact drift class the single-authority rule exists to kill.
  De-dup is therefore an editorial-correctness task, not refactoring hygiene.
- The glossary-only corrective content ("OP is not X-Dex") is good pedagogy that
  exists nowhere else — when de-duping, preserve it as owned glossary content, not
  duplicate.
- Terminology: the glossary must be the place where the ratified positional
  vocabulary mapping (ss/os = near/far = SAME/OP) is stated for readers, since
  three source traditions collide there; verify one authoritative entry states it
  and other mentions link.

## 8. Terminology inconsistencies

- **Red-queue count drift**: the queue says ~43 blurry rows; the current universe
  gates 64 (verified this run). Counts stated in living queue documents drift;
  state them as of a named audit or verify at edit time.
- **Dex-direction wording**: the standing rule (JOB in-out/out-in, never
  in-to-out; do not spell direction the move name carries) must hold across
  glossary, operators, and modifier pages — spot-checks pass, but fix 5's
  link-instead-of-restate conversion is the structural guarantee.
- **"Family" homonym**: display tiers (Family Parent / Minor Lineage), canonical
  `trick_family`, and the Down umbrella are three related-but-distinct notions;
  the family detail page should carry the one-line disambiguation (display
  grouping versus canonical decomposition), since it is now the owner.
- **Arctic state disagreement**: the Red queue lists arctic as an undefined
  operator while two universe rows sit in `authoring` state — one of the two is
  wrong (flagged in `RED_DEPENDENCY_AUDIT.md`).

## 9. Navigation

- The single top-level Freestyle entry with a two-band landing is sound; the
  by-the-numbers tiles deep-linking `?view=` surfaces is the strongest IA element
  and explains the dictionary's 220-inbound-ref dominance.
- Breadcrumbs render consistently on detail pages (trick, set, family, modifier).
- The one structural gap is a missing "reference shelf" — a compact block linking
  the reference-grade surfaces (glossary, notation article, Holden table,
  operators, add-analysis) as one unit. Today those five are scattered across a
  banner, in-page links, and unlinked routes. One landing block (or a shared
  footer partial on reference pages) closes most of Section 4 at once.

## 10. Learning progression

- The ladder a beginner actually walks is: landing → learn → glossary basics →
  tricks by ADD → trick detail (Technique Notes) → walking-family progression.
  Every step exists; the seams are unlinked (learn and walking-progression are the
  two most under-linked pages, Section 4).
- Only ONE progression page exists (walking family). Either V1 owns "progressions"
  as a real section (add the obvious second one — the toe-stall/clipper ladder
  already implicit in the quantity-ladder modules) or the page is folded under
  learn as a worked example. A one-item section reads as abandoned.
- The trick-detail buildPath/intuition delta content is the per-trick progression
  layer and is healthy; family pages should surface their family ladder (the
  family-owns-progression ownership rule) — verify the shipped family detail page
  renders the progression slot for parents that have one.

## 11. Priority order (editorial)

1. Remove or build the three "Coming soon" landing tiles (public honesty).
2. Execute de-dup fixes 2 and 4 (module-derivation with render oracles — cheap,
   kills the highest-drift duplicates now that family pages shipped).
3. Fix 1's Tier-1 authority decision, then fix 3 (the big token move).
4. Landing "reference shelf" + link the five contextual-only surfaces or record
   their status.
5. EV undefined-operator one-liners; refresh queue counts.
6. History rewrite (curator working order; criteria in the sibling Phase-1 doc).
7. Gallery links item (tracked in IP).
