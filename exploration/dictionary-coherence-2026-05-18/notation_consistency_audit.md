# Notation Consistency Audit -- dictionary trick cards

Covers brief Parts 4 (notation consistency) + 5 (core trick policy).

Supports `FINAL_RECOMMENDATION.md` cross-cutting recommendation CR-5.

This doc audits the current notation rendering on dictionary trick cards
across all browse views, formalizes a 4-tier suppression hierarchy, and
removes the `coreAtomLabel` "core atom -- X" prose render from public
surfaces while preserving its metadata for non-public utility.

---

## 1. Current state

### 1.1. Rendering surface

One partial renders every trick card across every browse view:

`src/views/partials/dictionary-trick-card.hbs`

Two density modes are switched by the partial parameter `density`:

- `registry` -- single-line scan-oriented row (lines 22-64). Most browse
  views (`?view=add`, `?view=family`, `?view=category`, `?view=topology`,
  `?view=movement-system`) render in this density.
- `browse` -- vertical stack (lines 65-end). Reserved for surfaces that
  want more vertical real estate per card.

Both densities share the same `DictionaryTrickCard` view-model interface
(`src/services/freestyleService.ts:1627-1678`).

### 1.2. Current rendering fallback chain (de facto hierarchy)

**Registry density** (`dictionary-trick-card.hbs:37-46`):

| Tier | Trigger | Renders as | Notes |
|---|---|---|---|
| 1 | `tokenizedEquivalences.length > 0` | `≡ <tokenized reading>` (line 38-41); only the first reading | Family-anchor underline applied per token via `isFamilyAnchor` |
| 2 | `operationalNotation != null` | role-tagged token spans (line 43); muted styling | Fallback when no chain reading |
| 3 | `coreAtomLabel != ''` | `<span class="dict-card-equivalence--core-atom">` (line 45) plain prose | Renders the literal value, e.g. "core atom -- rotational dex" |
| 4 | (none of the above) | nothing | Registry density suppresses "Notation pending" -- correct per partial docstring lines 14-16 |

**Browse density** (`dictionary-trick-card.hbs:79-92`):

| Tier | Trigger | Renders as | Notes |
|---|---|---|---|
| 1 | `tokenizedEquivalences.length > 0` | ALL readings rendered as `≡` lines (lines 79-85) | Multi-reading aware |
| 2 | `operationalNotation != null` | role-tagged token spans (line 87) | |
| 3 | `coreAtomLabel != ''` | core-atom prose paragraph (line 89) | Same as registry tier 3 |
| 4 | (none of the above) | italic "Notation pending" (line 91) | Implementation-flavored language exposed to public |

Both densities then render: ADD chip (line 48 / 94), pending-decomposition
pill (lines 50-52 / 96-98), media chip (lines 54-56 / 100+), status badge
+ placeholder note (lines 58-63 / further down).

### 1.3. Data sources behind the tiers

**Tier 1 (`tokenizedEquivalences`)** -- merged from two curator-authored,
restraint-governed content modules per interface note at
`freestyleService.ts:1640-1645`:

- `src/content/freestyleSymbolicEquivalences.ts` -- compound chains
  (mobius, paradox-mirage chains, walking-family, etc.). 71 entries
  post Slices N + Pre-Red sweep per skill posture.
- `src/content/freestyleAliasGovernance.ts` -- atom-level canonical
  aliases (ATW, etc.). Restraint allow-list.

Both modules are reversible TypeScript; no SQL.

**Tier 2 (`operationalNotation`)** -- parser-derived from
`freestyle_tricks.notation` via the symbolic notation parser (script
`scripts/parse_freestyle_notation.py`). Stored in the DB via the
parser-population pipeline. Read-only at the service layer.
`operationalNotationStatus` field exposes `'available' | 'pending'` for
shaping.

**Tier 3 (`coreAtomLabel`)** -- populated from `CORE_TRICK_SPEC.equivalences[0]`
when the slug is in the curator-authoritative core-atom set AND no chain
reading or op-notation exists. Per interface note at
`freestyleService.ts:1670-1676`. Empty string when no atom reading
applies. Added in the Formula Accountability Slice (2026-05-17).

**Tier 4 (registry: nothing; browse: "Notation pending" italic)** --
hard-coded in template.

### 1.4. Other render-layer fields on `DictionaryTrickCard`

Present in the interface (`freestyleService.ts:1627-1678`) but NOT
currently rendered by the partial:

- `commonAliases` (line 1657) -- service-side filtered, future-reserved.
- `trickFamily` (line 1665) -- "reserved for future family-axis affordance".
- `hasRecords` (line 1661) -- explicitly marked "tiny indicator only; not
  visually load-bearing".

Present in interface AND rendered:

- `slug`, `displayName`, `href`, `adds`, `addsLabel`, `pendingDecomposition`,
  `hasReferenceMedia`, `mediaCoverage`, `mediaCoverageLabel`, `statusBadge`,
  `placeholderNote`, `isExternalOnly`.

---

## 2. Problem evidence (what the brief identifies, validated against code)

### 2.1. "core atom -- rotational dex" prose appears on public cards

Confirmed. `dictionary-trick-card.hbs:45` (registry) and `:89` (browse)
both render `coreAtomLabel` as plain prose when tiers 1 + 2 produce
nothing. The class `dict-card-equivalence--core-atom` exists in CSS for
styling. Card examples in production today (e.g. for `whirl`, `mirage`,
`osis`, `butterfly` when the chain-registry / parser-population is stale)
show the literal text "core atom -- rotational dex" or similar.

This is implementation-flavored language: the term "core atom" leaks
from the curator-authored content-module naming convention
(`CORE_TRICK_SPEC.equivalences[0]`) into public copy. A learner reading
this card has no schema for "core atom"; the term feels like
incomplete-display-template debris.

### 2.2. "Notation pending" appears in browse density

Confirmed. `dictionary-trick-card.hbs:91`. Same implementation-leak
problem: the user is told a backend status, not given useful information.
Registry density correctly suppresses; browse density does not.

### 2.3. The brief's Part 5 mandate

> Core tricks should display:
> - movement notation first
> - ADD separately
> - optional core-atom supplemental marker
> - future executable accounting only as secondary layer

> Examples:
> mirage: `[set] > hippy in dex > op toe`
> whirl: `[set] > leggy in dex > ss clipper`

> NOT: `core atom -- rotational dex`

Current state partially meets this -- when a Core Trick has a chain
reading in `freestyleSymbolicEquivalences.ts`, the `≡` tokenized form
renders correctly (tier 1). The failure case is Core Tricks whose
canonical notation lives ONLY in `freestyle_tricks.notation` (parser
hasn't populated; or chain registry doesn't carry an entry; or the
parser-population script hasn't run after the most recent DB rebuild --
see memory entry `feedback_parser_population_after_rebuild`). Those
cards fall through to tier 3 and render "core atom -- X".

### 2.4. Brief Part 4: "preserve shorthand elegance"

Validated. Tier 1's `≡` notation with role-tagged tokens IS the
shorthand-elegance form. Tier 3 prose is its opposite. Removing tier 3
public rendering serves the brief's preserve-shorthand-elegance
constraint directly.

---

## 3. Options considered

### Option A: Leave the hierarchy as-is

REJECTED. Brief Part 5 is explicit. The "core atom -- X" prose is the
named example of what NOT to render.

### Option B: Replace `coreAtomLabel` rendering with the row's `notation` field directly

REJECTED. Mixes layers (template would need to know whether a row's
`notation` is parser-grade vs canonical). Bypasses the `tokenizedEquivalences`
+ `operationalNotation` shaping pipeline. Creates a third data path the
service layer doesn't shape.

### Option C: Promote curator-authoritative core-atom canonical notation into the chain registry

REJECTED at this slice (too much curator triage scope), but recommended
as a follow-on slice. Specifically: for every Core Trick slug currently
relying on `coreAtomLabel`, author a corresponding entry in
`freestyleSymbolicEquivalences.ts` with the canonical structural reading
(e.g. for `whirl`, the entry `[set] > leggy in dex > ss clipper`). That
moves the load-bearing canonical notation into tier 1, where it
naturally renders correctly.

### Option D: Suppress `coreAtomLabel` rendering only; preserve metadata

RECOMMENDED. Removes the public-facing leak. Preserves the curator-authored
core-atom registry for glossary utility, curator-side internal display,
future trick-detail-page prose, and any other non-public-card use case.

Aligns with curator decision locked at session-level (open question #3
in `FINAL_RECOMMENDATION.md`).

### Option E: Replace tier-4 "Notation pending" prose with silence

RECOMMENDED. Browse density should match registry density's
silent-when-empty behavior. The user infers "primitive trick" or
"pending decomposition" from the absence of a reading + the optional
`pendingDecomposition` pill (rendered separately on line 50-52 / 96-98).

---

## 4. Recommended approach

### 4.1. Formal 4-tier notation suppression hierarchy

Re-formalized from the FINAL_RECOMMENDATION.md table. This is the
contract; the template change in §5 implements it.

| Tier | Source | Trigger | Renders as |
|---|---|---|---|
| 1 | `tokenizedEquivalences` (chain registry + alias governance) | array non-empty | `≡ <reading>` lines, role-tagged tokens, family-anchor underline |
| 2 | `operationalNotation` (parser-derived) | not null AND tier 1 empty | role-tagged token spans, muted styling |
| 3 | `pendingDecomposition` pill | flag true | small italic pill rendered SEPARATELY (already exists; no change to placement) |
| 4 | -- | -- | nothing (silent) |

Key changes vs current state:

- **Tier 3 prose (`coreAtomLabel`) removed from rendering.** Both
  densities. Metadata stays.
- **Tier 4 "Notation pending" prose removed.** Browse density. Match
  registry density's existing silent behavior.
- **`pendingDecomposition` pill remains.** It is observational-labeled
  ("pending decomposition refinement"), not implementation-flavored,
  and curator-authored via `freestyleUnresolvedCompounds.ts`. No change.

### 4.2. Core trick policy (brief Part 5)

Core Tricks (mirage, whirl, osis, butterfly, etc. -- the curator-authored
set in `CORE_TRICK_SPEC`) shall display canonical notation FIRST. Path:

1. **Preferred (post-slice):** chain registry entry in
   `freestyleSymbolicEquivalences.ts` carrying the canonical structural
   reading. Renders tier 1.
2. **Fallback (current):** parser-derived `operationalNotation` from the
   row's `notation` column. Renders tier 2. Acceptable; muted styling
   signals "parser-derived, not curator-curated".
3. **Otherwise:** silent. The card shows `displayName` + ADD chip, no
   notation row. This is acceptable for Core Tricks during the transition
   window because the absence is honest.

Authoring the canonical structural readings for every Core Trick into
the chain registry (Option C above) is a curator-paced follow-on slice,
NOT in scope here. This audit's recommendation is template-only: stop
rendering tier 3 prose. The chain-registry authoring can proceed at
curator pace; until each Core Trick has its entry, the card falls
through to tier 2 or silence.

### 4.3. Executable ADD accounting is secondary and expandable

Confirmed per brief Part 4 + 5. No executable-accounting render lands
on the public dictionary trick card in this slice. When that work
arrives (separate future slice), the accounting belongs in:

- The trick-detail page (`/freestyle/tricks/:slug`), as a collapsible
  `<details>` section -- mirrors the existing `structural-decomposition`
  collapsed-by-default pattern per skill doctrine D.
- NOT on the registry / browse card.

The notation hierarchy ratified here is intentionally
accounting-layer-agnostic. Adding executable accounting later does not
require revisiting this hierarchy.

### 4.4. "New to the notation?" glossary primer placement

Decided at session-level: the small primer is a LANDING-PAGE element
(brief Part 1.6), placed near the operators/sets card. It is NOT a
trick-card affordance. This audit does not change trick-card rendering
to introduce primer copy. The primer pathway is specified in
`dictionary_landing_page_plan.md`.

---

## 5. Implementation sketch

NOT actual code; enough detail to scope a slice.

### 5.1. Template change

`src/views/partials/dictionary-trick-card.hbs`:

- **Lines 44-46** (registry density tier 3 block) -- delete the
  `{{else if coreAtomLabel}}` branch entirely. Registry density already
  defaults to silence; the delete simplifies the chain to two branches
  + silent fallthrough.
- **Lines 88-92** (browse density tier 3 + tier 4 blocks) -- delete the
  `{{else if coreAtomLabel}}` branch AND the trailing `{{else}}` "Notation
  pending" branch. Browse density falls through silent on no notation.

Both densities then have a 2-branch notation block:

```
{{#if tokenizedEquivalences.length}}
  <tier 1 render>
{{else if operationalNotation}}
  <tier 2 render>
{{/if}}
```

Net effect: tier 3 prose disappears; tier 4 prose disappears; the rest
of the card (title, ADD chip, pending-decomposition pill, media chip,
status badge, placeholder note) is unchanged.

### 5.2. Service change

`src/services/freestyleService.ts`:

- `coreAtomLabel` field stays on `DictionaryTrickCard` interface
  (line 1677). Service still populates it from `CORE_TRICK_SPEC`. The
  template just stops rendering it.
- No other shaping change.

This is intentional: the field's metadata utility (glossary, curator
internal, future trick-detail prose, future audit tooling) survives.
Only the public-card rendering is removed.

### 5.3. CSS

`.dict-card-equivalence--core-atom` rule (if it exists in
`src/views/freestyle/` CSS) can be left in place or removed. Removing
it is a cleaner cleanup, but harmless to defer. Recommend: leave for
this slice; sweep in a follow-on cosmetic pass.

`.dict-card-notation--pending` rule (browse density tier 4) -- same.

### 5.4. Test impact

`tests/integration/freestyle.tricks-insights.routes.test.ts` -- check
for any assertion on the "core atom -- " text or "Notation pending"
text. Likely none, but the assertion sweep is the only test work in
scope. Update or remove any assertion that pins the deleted prose.

Card-uniformity contract (mechanically tested across all browse views,
per the `migrate-browse-view` skill) -- already covered by existing
tests. No new test needed.

### 5.5. Verification

Manual spot-check on each browse view post-deploy:

- A Core Trick that currently relies on `coreAtomLabel` rendering
  (whirl / mirage / osis / butterfly if they don't yet have chain-registry
  entries) -- card shows title + ADD chip, no notation row. Cleanly
  silent.
- A compound trick with a chain reading -- card unchanged (still tier 1).
- A compound trick with parser notation but no chain reading -- card
  unchanged (still tier 2).
- A `pendingDecomposition: true` trick -- pill still renders.

`scripts/ci/assert_conventions.sh` -- no relevant guard for this
change; the convention-gate covers SQL location + adapter imports + env
reads. Card-uniformity is template-test territory.

---

## 6. Curator decision points

Decisions the curator should make (or has made) before this slice
implements:

- **(DECIDED at session-level)** `coreAtomLabel` metadata preserved;
  rendering removed only.
- **(DEFER)** Authoring canonical structural readings for Core Tricks
  into `freestyleSymbolicEquivalences.ts`. Separate curator-paced slice.
  Until done, Core Trick cards lacking chain entries render silently
  (or fall through to tier 2 parser notation).
- **(DEFER)** Whether to delete `.dict-card-equivalence--core-atom` CSS
  rule in the same slice or in a cosmetic sweep. Recommend: defer.
- **(DEFER)** Whether to delete the `coreAtomLabel` field from
  `DictionaryTrickCard` interface in some future slice once non-public
  utility is confirmed gone. Not for now per the curator's decision.

---

## 7. Risks and mitigations

### 7.1. Risk: Core Tricks render visually empty

After the rendering removal, any Core Trick whose canonical notation is
NOT in `freestyleSymbolicEquivalences.ts` AND has no parser-derived
`operationalNotation` will render with just title + ADD chip. Visually
"empty" relative to compound cards.

**Mitigation:** Acceptable for the transition window. The absence is
honest (the slice doesn't have a curator-authored canonical reading for
this trick yet). The follow-on chain-registry authoring slice fills in
each Core Trick.

If the visual void is a concern in the meantime, a one-time pass to
ensure every Core Trick has at least a parser-derived `notation` in the
DB (tier 2 fallback) would close the gap. Per memory
`feedback_parser_population_after_rebuild`, running
`python3 scripts/parse_freestyle_notation.py --apply` after every DB
rebuild is already a known requirement; doing so after this slice
exposes any Core Tricks with stale parser state.

### 7.2. Risk: Test regressions

Possible if any test pins the deleted prose strings. Mitigation: grep
for `"core atom"` and `"Notation pending"` in `tests/` before opening
the PR; update assertions.

### 7.3. Risk: Visual-uniformity check fails

The card-uniformity contract (cards render the same across browse
views) does not depend on the deleted prose strings. No risk.

### 7.4. Risk: Curator perceives tier 3 deletion as data loss

It is not data loss. The `CORE_TRICK_SPEC` content module is unchanged.
The `coreAtomLabel` field on the view-model is unchanged. Only the
template's render of that field is removed. Curator-side / glossary /
internal tooling can continue to consume the metadata.

### 7.5. Risk: Browse density tier 4 ("Notation pending") removal exposes empty cards

Same mitigation as 7.1. The absence is honest; the user-facing UX
benefit (no implementation language exposed) outweighs the visual void.

### 7.6. Risk: Future executable-accounting slice has nowhere to land

Not a risk. The hierarchy is accounting-agnostic. The recommended
landing for executable accounting is the trick-detail page collapsed
`<details>` section. The registry / browse card remains accounting-free,
per the skill doctrine D restraint constraint + the brief Part 4 + 5
mandate.

---

## 8. Out of scope

- Authoring canonical structural readings into `freestyleSymbolicEquivalences.ts`
  for Core Tricks lacking them. Curator-paced; separate slice.
- Any change to the `pendingDecomposition` pill render.
- Any change to operational-notation parser behavior.
- Any change to chain registry entries already present.
- Any executable ADD accounting implementation.
- Any change to `freestyle_tricks.notation` column data.
- Trick-detail page (`/freestyle/tricks/:slug`) notation rendering --
  separate surface, not affected by the dictionary-card partial.
- CSS rule cleanup (deferred to cosmetic sweep).

---

## 9. Cross-references

- `FINAL_RECOMMENDATION.md` -- CR-5 cross-cutting recommendation.
- `dictionary_landing_page_plan.md` -- where the "New to the notation?"
  primer lives (NOT on cards).
- `category_view_retirement_review.md` -- similar template-side
  retirement pattern; structurally analogous.
- `family_and_neighborhood_governance.md` -- topology label rename to
  "Movement Neighborhoods"; render-layer change only, structurally
  similar.

---

## 10. Summary

Two template branches deleted; one interface field's render removed
while metadata preserved; no schema change; no service shaping change;
no parser change; no chain-registry change. The dictionary card
hierarchy becomes: chain reading -> op-notation fallback -> silent.
"Core atom -- X" prose disappears from public surfaces. "Notation
pending" prose disappears from browse density. Restraint doctrine D
preserved. Brief Parts 4 + 5 satisfied without ontology hardening.
