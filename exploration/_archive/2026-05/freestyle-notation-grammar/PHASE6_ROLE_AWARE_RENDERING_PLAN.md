# Phase 6 — Role-Aware Notation Rendering

**Status: RATIFIED 2026-05-10** for implementation per James review. §3 / §5 / §7 carry the ratifications. Implementation begins per §9.

---

## 0. Governing principle — semantic typography, not maximal decoration

**Restraint is a feature.** The notation renderer's job is to TEACH structural roles, not to maximally decorate every token. Saturated colors, badges, outlines, italics, borders, and underlines stacked together turn a learning tool into visual noise.

The recipe: **calm, elegant, readable, low-density emphasis**.

**Visual hierarchy:**
- **Primary roles** (carry full color saturation) — the four roles that distinguish the major freestyle structural categories: `core_family`, `set`, `rotation`, `modifier`. These are the load-bearing semantic insights.
- **Secondary roles** (muted gray with subtle tint, no hard saturation) — `multiplicity`, `footedness`, `suffix`, `body_component`, `directionality`, `delay_surface`, `unusual_surface`. They participate in the notation but should feel secondary.
- **Unresolved** — soft amber dashed underline. Communicates "notation may be evolving / community ambiguity," NOT "parser error." Honest signal without alarm.

This is **semantic typography** territory: visual language design layered on top of the parser/ontology stack. Not a maximal-metadata coloring palette.

The Phase-6 implementation MUST honor restraint. Future enrichments (legends, popovers, animations) are deferred indefinitely unless the restrained baseline proves insufficient in real reader testing.

Builds on:
- `PROPOSAL.md §5` (semantic highlighting design — color palette, role taxonomy, accessibility)
- `NOTATION_STYLE_GUIDE.md` (token vocabulary + house style)
- `NOTATION_CORPUS_BOOTSTRAP_PLAN.md` (Tier 1 corpus that this phase renders; 25 rows currently authored)
- `feedback_parser_editorial_separation.md` (forever-rules carried forward)

---

## 1. Goal and UX scope

**Goal.** Render the populated `notation` field on trick-detail pages with role-aware color coding. Each whitespace-separated token gets classified into a semantic role (core_family, set, rotation, modifier, etc.) and rendered with role-specific styling + accessible role labels.

**Pedagogical purpose.** Reading `STEPPING DUCKING PARADOX TORQUE` as four uniformly-styled words gives the reader no structural signal. Coloring `STEPPING DUCKING PARADOX` (modifiers) vs `TORQUE` (core family) makes the structural decomposition visually parseable in one glance — exactly the "humans-first" principle from `NOTATION_STYLE_GUIDE.md §0`.

**Scope is bounded.** Display-only enhancement. Reads the existing `notation` column (Tier 1 populated 25 rows; future tiers expand). Does NOT:
- modify the parser
- modify ADD math
- author new notation
- change the notation column itself
- introduce semantic claims the data doesn't already support

**Out of scope.** No parser changes, no token registry restructuring, no schema changes, no migration between media channels, no FootbagMoves ingestion, no new tricks. Parser still tokenizes `canonical_name` only; this phase renders a separate field (`notation`) at the template layer.

---

## 2. Where role classification should live

Per `src/services/template-conventions.md`: "Templates are logic-light Handlebars. Branch only on pre-shaped data from the service layer. No business rules, no computed values, no direct DB access." Token classification is computed; therefore service-layer.

### 2.1 Three architectural options for the token-role registry

**Option A — Parser-mirror static registries (TypeScript-side).** A new TS file (e.g. `src/services/notationRoleRegistry.ts`) mirrors the parser's hardcoded sets: `ROTATION_TOKENS`, `DIRECTION_TOKENS`, `DELAY_SURFACE_TOKENS`, `UNUSUAL_SURFACE_TOKENS`, plus phase-6-specific additions (`BODY_COMPONENT_TOKENS = {[DEX], [BOD], [XBD], [DEL]}`, `MULTIPLICITY_TOKENS = {DOUBLE, TRIPLE, QUADRUPLE, QUINTUPLE}`, `FOOTEDNESS_TOKENS = {SAME, OP, IN, OUT}`, `SUFFIX_TOKENS = {STALL, KICK}`).

- Pros: no DB query needed for these registries; maps cleanly to PROPOSAL §5 visual roles.
- Cons: parallel-registry maintenance burden — when `parse_freestyle_notation.py` registries change, the TS mirror must update too.

**Option B — DB-driven dynamic registry only.** Pull all modifier slugs + `modifier_type` from `freestyle_trick_modifiers`. Pull all canonical slugs from `freestyle_tricks` (already in service shape via `allDictRows`). Pull aliases from `freestyle_trick_aliases`.

- Pros: single source of truth; modifier registry stays in sync with Red-ratified additions automatically.
- Cons: `modifier_type` only distinguishes `body` vs `set`. The richer parser distinction (rotation vs body-modifier — e.g. SPINNING is body-type but rotation-class per PROPOSAL §5) is invisible to the DB. Phase 6 cannot render rotation as its own color class without a separate source.

**Option C — Hybrid (recommended).** Static TS registries for the parser's vocabulary that's not in the DB (rotation, direction, delay_surface, unusual_surface, body_component, footedness, multiplicity, suffix); DB queries for the parts that ARE in the DB (modifier slugs + types, core family slugs, aliases).

- Pros: each piece of vocabulary read from its natural source. DB-tracked changes (new modifiers, new tricks, new aliases) automatically propagate. Static parser-mirror sets are small and stable, and explicitly documented as parser-mirror with a sync rule.
- Cons: introduces ONE new TS file with ~30 lines of registry constants. Document the sync rule as part of `feedback_parser_editorial_separation.md` future-extensions, OR as a comment in the new file.

### 2.2 Recommendation

**Option C — Hybrid.** Each registry stays at its natural authority:
- Static TS (mirror parser): `ROTATION_TOKENS`, `DIRECTION_TOKENS`, `DELAY_SURFACE_TOKENS`, `UNUSUAL_SURFACE_TOKENS`.
- Static TS (Phase 6 specific): `BODY_COMPONENT_TOKENS`, `FOOTEDNESS_TOKENS`, `MULTIPLICITY_TOKENS`, `SUFFIX_TOKENS`.
- DB-driven: modifier slugs + types from `freestyle_trick_modifiers`; canonical slugs from `freestyle_tricks`; aliases from `freestyle_trick_aliases`.

Sync rule (codified): when `scripts/parse_freestyle_notation.py` adds or modifies a token in any of `ROTATION_TOKENS`, `DIRECTION_TOKENS`, `DELAY_SURFACE_TOKENS`, `UNUSUAL_SURFACE_TOKENS`, the new TS mirror must update accordingly. Capture in a code comment AND in `feedback_parser_editorial_separation.md` as a Phase 6 extension.

---

## 3. Token-role taxonomy

Per PROPOSAL §5.1 + `NOTATION_STYLE_GUIDE.md §3`. Final taxonomy for Phase 6:

| Role | Tokens | Visual treatment (PROPOSAL §5.1 guideline) |
|---|---|---|
| `core_family` | trick canonical slugs (WHIRL, MIRAGE, BUTTERFLY, OSIS, TORQUE, ...) + aliases (ATW → around-the-world) | green, bold |
| `set` | ATOMIC, PIXIE, FAIRY, QUANTUM, NUCLEAR, BLURRY, FURIOUS, POGO, ROOTED, SHOOTING (DB modifier_type='set') | blue |
| `rotation` | SPINNING, INSPINNING, SWIRLING, WHIRLING, GYRO (parser ROTATION_TOKENS) | orange |
| `modifier` | DUCKING, STEPPING, SYMPOSIUM, PARADOX, TAPPING, BLAZING, WEAVING, BARRAGING, MIRAGING, DIVING, TERRAGING, BACKSIDE, XDEX (DB modifier_type='body' AND not in rotation set) | yellow |
| `delay_surface` | TOE, INSIDE, HEEL, OUTSIDE, CLIPPER (parser DELAY_SURFACE_TOKENS) | purple |
| `unusual_surface` | SOLE, KNEE, HEAD, NECK, SHOULDER, FOREHEAD, CLOUD (parser UNUSUAL_SURFACE_TOKENS) | pink |
| `directionality` | REV, REVERSE (parser DIRECTION_TOKENS) | muted, italic |
| `body_component` | [DEX], [BOD], [XBD], [DEL] (Phase 6 static) | gray, monospace |
| `footedness` | SAME, OP, IN, OUT (Phase 6 static — community-canonical per `NOTATION_STYLE_GUIDE.md §3.8`) | gray, italic |
| `multiplicity` | DOUBLE, TRIPLE, QUADRUPLE, QUINTUPLE (CANONICALIZATION_POLICY §10) | dark-italic |
| `suffix` | STALL, KICK (Phase 6 static) | unstyled / muted |
| `unresolved` | anything that didn't classify | red dotted underline |

### 3.1 Notes on classification edge cases

- **BLURRY** (DB modifier_type='set') renders as `set`, even though parser's MODIFIER_TOKENS contains it. Phase 6 leans on the DB's specific tier; PROPOSAL §5 colors set / rotation / modifier separately by design.
- **SPINNING** (DB modifier_type='body', parser ROTATION_TOKENS) renders as `rotation` — the parser ROTATION_TOKENS set wins precedence over the DB body-bucket.
- **ATW** (alias of around-the-world) renders as `core_family` because the alias resolves to a slug in `freestyle_tricks`. Pedagogically equivalent to rendering the full slug; visually treated identically.
- **STALL** (suffix) doesn't carry an ADD bonus and isn't a registered role token. Render unstyled or muted; pairs with a delay/unusual surface token preceding it.
- **HYPHENATED COMPOUNDS** (DADA-CURVE, FOOD-PROCESSOR, ATOM-SMASHER): one token, classified as `core_family` (the whole hyphenated form is a slug in `freestyle_tricks`).
- **MULTI-MODIFIER NOTATION** (STEPPING DUCKING PARADOX TORQUE): each whitespace-separated token classified independently. Multi-class output in the same notation block.

---

## 4. Tokenization & classification algorithm

### 4.1 Tokenization (whitespace split)

Per James's spec: simple whitespace tokenization. Inputs:
- `notation: string` (raw notation field; uppercase per `NOTATION_STYLE_GUIDE.md §4.1`)

Output: `string[]` of tokens, preserving order, no normalization beyond `trim()`.

```
tokens = notation.trim().split(/\s+/);
```

That's it. No clever multi-word atom resolution. Phase 6 is intentionally the simplest tokenizer that delivers the visual win.

### 4.2 Classification (per token)

For each token, classify in this precedence order. First match wins.

1. **Empty/whitespace token** → skip (shouldn't happen post-split, but defensive).
2. **Bracketed body component** (matches `^\[[A-Z]+\]$`) → `body_component` (preserve token text including brackets).
3. **Multiplicity prefix** (DOUBLE, TRIPLE, QUADRUPLE, QUINTUPLE) → `multiplicity`.
4. **Footedness** (SAME, OP, IN, OUT) → `footedness`.
5. **Directionality** (REV, REVERSE) → `directionality`.
6. **Body component static map** if any other phase-6-specific tokens are added.
7. **Suffix** (STALL, KICK) → `suffix`.
8. **Rotation registry** (parser-mirror) → `rotation`.
9. **Delay surface registry** (parser-mirror) → `delay_surface`.
10. **Unusual surface registry** (parser-mirror) → `unusual_surface`.
11. **Modifier registry** (DB-driven from `freestyle_trick_modifiers`) → `set` if modifier_type='set'; otherwise `modifier`.
12. **Core family registry** (DB-driven from `freestyle_tricks` slugs, lowercased + aliases via `freestyle_trick_aliases`) → `core_family`.
13. **Fallback** → `unresolved`.

Token text preserved verbatim. Classification is a tag, not a transformation.

### 4.3 Service-layer shape

```typescript
export interface NotationToken {
  text:  string;       // verbatim from input (uppercase)
  role:  NotationRole; // 'core_family' | 'set' | 'rotation' | ... | 'unresolved'
  label: string;       // human-readable role for tooltip ("Core family", "Body modifier", etc.)
}

export interface NotationDisplay {
  rawNotation: string;          // the original notation field
  tokens:      NotationToken[]; // ordered, one per whitespace-separated chunk
}
```

`shapeNotationDisplay(notation, ctx)`:
- Returns `null` if `notation` is null/empty/whitespace.
- Uses caller-supplied `ctx` carrying pre-built lookups: `Set<string>` of slugs, modifier slug→type map, alias→slug map, plus the static registries.
- Returns `NotationDisplay`.

`ctx` is built once per request in the trick-detail page-shape function (similar to how Phase 5a built `dictBySlug` for editorial decomposition).

---

## 5. Rendering strategy

### 5.1 Where the new block lives in `trick.hbs`

**Recommended placement:** new "Notation" section near the top of trick-detail, below the page header and ABOVE the structural-decomposition diagnostic panel. Position rationale:
- Notation is content-tier (what the trick IS), not diagnostic-tier (what the parser computed).
- A reader scanning the page sees the colored notation FIRST, then the parser/editorial decompositions BELOW that elaborate it.
- The structural-decomposition panel already references notation tokens; reading them in color upstream eases comprehension downstream.

Visible only when `content.notationDisplay` is non-null. When `notation` is NULL, the section is omitted entirely (the dictionary index already conveys "Notation pending"; trick-detail can stay clean).

### 5.2 HTML structure

```handlebars
{{#if content.notationDisplay}}
<section class="notation-display" aria-label="Trick notation">
  <h2 class="notation-display-title">Notation</h2>
  <p class="notation-display-caption">A token-level reading of this trick, color-coded by structural role. Parser-derived structural decomposition appears below.</p>
  <code class="notation-display-tokens">
    {{#each content.notationDisplay.tokens}}<span class="notation-token notation-{{role}}" data-role="{{role}}" title="{{label}}">{{text}}</span>{{#unless @last}} {{/unless}}{{/each}}
  </code>
</section>
{{/if}}
```

Notes on the markup:
- Outer `<code>` preserves monospace presentation.
- Each token wrapped in `<span class="notation-token notation-{role}" data-role="{role}" title="{label}">`.
- `data-role` attribute = machine-readable role (Phase 6 + future scripting).
- `title` attribute = human-readable role for hover tooltip (Phase 6 minimum).
- `class="notation-token"` = base class for shared styling (font-size, spacing).
- `class="notation-{role}"` = role-specific styling.
- Whitespace between spans rendered via `{{#unless @last}} {{/unless}}` — preserves visual word separation.

### 5.3 CSS approach (ratified palette, restraint-first)

Per §0 governing principle: only the **primary four** roles carry color saturation. Secondary roles render in muted gray with subtle differentiation. Unresolved is soft amber dashed (not red error-styling).

```css
/* Shared baseline */
.notation-token             { padding: 0 0.15em; border-radius: 2px; }

/* Primary four — color-saturated, load-bearing semantic distinctions */
.notation-core-family       { color: #2a7a3a; font-weight: bold; }   /* green: anchor */
.notation-set               { color: #1f5fa8; }                       /* blue: set primitive */
.notation-rotation          { color: #c46a1a; }                       /* orange: rotation */
.notation-modifier          { color: #8a7a14; }                       /* yellow-olive: body modifier */

/* Secondary — muted, low-saturation; visible but recede */
.notation-delay-surface     { color: #555; }
.notation-unusual-surface   { color: #555; }
.notation-directionality    { color: #777; font-style: italic; }
.notation-body-component    { color: #666; }
.notation-footedness        { color: #777; font-style: italic; }
.notation-multiplicity      { color: #555; font-weight: 600; }
.notation-suffix            { color: #888; }

/* Unresolved — soft amber dashed; "evolving" not "error" */
.notation-unresolved        { color: #8a6a14; text-decoration: underline dashed #c4a73c; text-underline-offset: 2px; }
```

Colors above are starting candidates. Implementation phase reconciles with site palette + verifies WCAG AA contrast on the body background. The HIERARCHY (primary 4 colored, others muted, unresolved amber-not-red) is locked per §0.

### 5.4 Accessibility

Per PROPOSAL §5.3 + §0 restraint principle:
- Color is supplementary; `data-role` + `title` provide non-color signal for screen readers.
- `unresolved` carries dashed underline + soft amber (visible without color cue).
- `core_family` carries bold (visible without color).
- `directionality` and `footedness` carry italic (visible without color).
- `multiplicity` carries weight (600).
- Each role has a non-color-dependent visual cue.

### 5.4a Tooltip text (educational phrasing, ratified)

The `title` attribute on each token's `<span>` should TEACH, not just label. Phrasings:

| Role | Default `title` text |
|---|---|
| `core_family` | `Core trick family: {resolved canonical name}` (e.g. `Core trick family: around-the-world` for ATW) |
| `set` | `Set primitive` |
| `rotation` | `Rotation modifier` |
| `modifier` | `Body modifier` |
| `delay_surface` | `Delay surface` |
| `unusual_surface` | `Surface (non-standard)` |
| `directionality` | `Direction marker` |
| `body_component` | `Body component` |
| `footedness` | `Footedness` |
| `multiplicity` | `Repetition prefix` |
| `suffix` | `Surface suffix` |
| `unresolved` | `Unrecognized — community notation may be evolving` |

For `core_family` tokens, the tooltip resolves the alias when applicable: `ATW` → tooltip `"Core trick family: around-the-world"`. For non-aliased tokens, tooltip uses the slug verbatim: `WHIRL` → `"Core trick family: whirl"`.

Other roles use the static label without per-token enrichment for now (avoids tooltip-bloat creep).

### 5.5 Optional legend

A small inline legend ("Color key: green = core family, blue = set, ...") can appear once per page above the notation. Implementation phase decides if it's helpful or noise. Phase 6 does NOT block on the legend; it's a follow-up enhancement.

### 5.6 Dictionary-list secondary opportunity

The dictionary index (`tricks.hbs:104-107`) renders notation as a plain `<code>` block. Phase 6 could optionally apply the same `<span>` shaping there. RECOMMENDED: defer to Phase 6 follow-up. Trick-detail is the priority surface; dictionary-list rendering is a parallel rendering target that uses the same service-layer shape but in a denser layout (one row per trick). Doing both at once doubles the test surface and may need different abbreviation rules. Keep Phase 6 narrow.

---

## 6. Edge cases and graceful degradation

### 6.1 Notation NULL or empty

`notation IS NULL` OR `length(trim(notation)) == 0` → `shapeNotationDisplay` returns `null`. Template's `{{#if content.notationDisplay}}` guard suppresses the entire section. Reader sees no notation block — same as today's trick-detail page.

### 6.2 Notation has only unresolved tokens

If every token classifies as `unresolved`, the section still renders — but every token wears the unresolved style (red dotted underline). This is a visual signal that the row's notation has unrecognized tokens; pairs naturally with the row potentially needing curator attention.

NOT an error condition. Render as authored.

### 6.3 Mixed known + unknown tokens

E.g. notation `WEIRD-TOKEN PARADOX WHIRL`:
- WEIRD-TOKEN → unresolved (dotted underline)
- PARADOX → modifier
- WHIRL → core_family

Rendered as colored mix. Reader sees that one token wasn't recognized.

### 6.4 Notation contains characters not in any registry

Symbols, numbers, mixed case (lowercase): the renderer treats them as unresolved. No fatal failure. Display preserves verbatim.

### 6.5 Renderer error

If `shapeNotationDisplay` itself throws (defensive-programming consideration): caller catches and falls back to rendering the raw notation as plain text inside `<code>` without spans. The new section becomes equivalent to the dictionary-index display: just `<code>{{rawNotation}}</code>`. Service layer logs the error for QC.

### 6.6 Null/empty token after split

`notation = "  WHIRL  "` → `["", "WHIRL", ""]` after split (no, `split(/\s+/)` doesn't produce empties for leading/trailing whitespace if `trim()` was called first). Defensive: filter out any empty-string tokens.

### 6.7 Future-tier notations with bracketed components

When Tier 2/3 introduces bracketed forms (`SPINNING [OUT IN] [DEX] WHIRL`), the renderer handles each bracket as one token (regex `^\[[A-Z]+\]$` matches). Phase 6 doesn't block on Tier 2; the tokenizer is already future-compatible.

### 6.8 Aliases that resolve to deactivated tricks

Edge case: an alias points to a trick with `is_active=0`. The alias→slug lookup succeeds, but the slug has no public detail page. For Phase 6 rendering purposes, treat as `core_family` regardless — the slug exists in editorial state; the rendered span uses the alias text (`ATW`) but the role classification is based on the resolved slug.

---

## 7. Test plan

Per James's request: WHIRL, PARADOX WHIRL, BLURRY MIRAGE, ATW, HEAD STALL, GAUNTLET. Each test asserts:
1. Trick-detail page returns 200.
2. The new notation section renders.
3. Each token in the notation has the expected role class on its span.
4. Token order in HTML matches token order in input.
5. `data-role` attribute and `title` text are present on each span.

### 7.1 Test fixture setup

Add fixtures for the 6 trick rows + their notations:

| Slug | notation | Expected token classifications |
|---|---|---|
| `whirl` | `WHIRL` | [(WHIRL, core_family)] |
| `paradox-whirl` | `PARADOX WHIRL` | [(PARADOX, modifier), (WHIRL, core_family)] |
| `blur` | `BLURRY MIRAGE` | [(BLURRY, set), (MIRAGE, core_family)] |
| `around-the-world` | `ATW` | [(ATW, core_family)] (via alias resolution) |
| `head-stall` | `HEAD STALL` | [(HEAD, unusual_surface), (STALL, suffix)] |
| `gauntlet` | `STEPPING DUCKING PARADOX TORQUE` | [(STEPPING, modifier), (DUCKING, modifier), (PARADOX, modifier), (TORQUE, core_family)] |

(Most of these already exist in DB post-Tier-1 authoring; tests may reuse the dev-DB rows or seed test-DB equivalents.)

### 7.2 Specific test assertions

**Test 1 — WHIRL (single core_family token):**
```typescript
const res = await request(app).get('/freestyle/tricks/whirl');
expect(res.text).toContain('class="notation-display"');
expect(res.text).toMatch(/<span class="notation-token notation-core-family"[^>]*>WHIRL<\/span>/);
```

**Test 2 — PARADOX WHIRL (modifier + core_family):**
```typescript
const res = await request(app).get('/freestyle/tricks/paradox-whirl');
const idxParadox = res.text.indexOf('>PARADOX<');
const idxWhirl   = res.text.indexOf('>WHIRL<');
expect(idxParadox).toBeGreaterThan(-1);
expect(idxWhirl).toBeGreaterThan(idxParadox); // order preserved
expect(res.text).toMatch(/<span class="notation-token notation-modifier"[^>]*>PARADOX<\/span>/);
expect(res.text).toMatch(/<span class="notation-token notation-core-family"[^>]*>WHIRL<\/span>/);
```

**Test 3 — BLURRY MIRAGE (set + core_family):**
```typescript
expect(res.text).toMatch(/<span class="notation-token notation-set"[^>]*>BLURRY<\/span>/);
expect(res.text).toMatch(/<span class="notation-token notation-core-family"[^>]*>MIRAGE<\/span>/);
```

**Test 4 — ATW (alias resolution to core_family):**
```typescript
const res = await request(app).get('/freestyle/tricks/around-the-world');
expect(res.text).toMatch(/<span class="notation-token notation-core-family"[^>]*>ATW<\/span>/);
```

**Test 5 — HEAD STALL (unusual_surface + suffix):**
```typescript
const res = await request(app).get('/freestyle/tricks/head-stall');
expect(res.text).toMatch(/<span class="notation-token notation-unusual-surface"[^>]*>HEAD<\/span>/);
expect(res.text).toMatch(/<span class="notation-token notation-suffix"[^>]*>STALL<\/span>/);
```

**Test 6 — GAUNTLET (multi-modifier showcase):**
```typescript
const res = await request(app).get('/freestyle/tricks/gauntlet');
// All four modifiers + base render in order
const expectedSequence = ['STEPPING', 'DUCKING', 'PARADOX', 'TORQUE'];
const indices = expectedSequence.map(t => res.text.indexOf(`>${t}<`));
expect(indices).toEqual([...indices].sort((a, b) => a - b)); // monotonic
expect(indices.every(i => i > -1)).toBe(true);
expect(res.text).toMatch(/<span class="notation-token notation-modifier"[^>]*>STEPPING<\/span>/);
expect(res.text).toMatch(/<span class="notation-token notation-modifier"[^>]*>DUCKING<\/span>/);
expect(res.text).toMatch(/<span class="notation-token notation-modifier"[^>]*>PARADOX<\/span>/);
expect(res.text).toMatch(/<span class="notation-token notation-core-family"[^>]*>TORQUE<\/span>/);
```

### 7.3 Edge-case tests

- **No notation** (a row with `notation=NULL`): assert the new section is OMITTED entirely (no `class="notation-display"` in HTML).
- **All-unresolved tokens** (a row with notation `XXX YYY ZZZ`): assert each token has class `notation-unresolved`; section still renders.
- **Mixed known + unknown** (a row with notation `MYSTERY PARADOX WHIRL`): assert MYSTERY is unresolved; PARADOX is modifier; WHIRL is core_family.
- **Bracketed token** (a row with notation `[OUT IN] [DEX] WHIRL` — Tier 2/3 future-format): assert `[OUT` and `IN]` are NOT classified together (whitespace splits them); each handled as bracket-prefixed/suffixed unresolved tokens (Phase 6's tokenizer is intentionally simple). The full Phase-2-style bracket-grouped parsing is deferred.

Per the deferred-tier rule above, bracket-grouped notation handling is NOT in Phase 6's commitments; only the bracketed primitive `[DEX]` (single-bracket-pair single-token) is recognized.

### 7.4 Regression tests

- Parser status breakdown unchanged (`exact_modifier_derived`=89, etc.) — Phase 6 doesn't touch the parser.
- Existing notation-grammar diagnostic panel unchanged — Phase 6 adds a NEW section above it, doesn't modify the panel.
- Editorial decomposition layer unchanged.
- Asserted ADD column unchanged.
- Full test suite passes.

---

## 8. Forever-rules carried forward

Phase 6 inherits and preserves every rule in `feedback_parser_editorial_separation.md`:

1. **Parser still tokenizes `canonical_name` only.** Phase 6's renderer reads the SEPARATE `notation` column. Parser code untouched.
2. **Editorial layer unchanged.** Phase 5a `shapeEditorialDecomposition` continues reading `base_trick` + `freestyle_trick_modifier_links`. No interaction.
3. **Asserted_adds is editorial truth.** Phase 6 doesn't compute or display ADD math; pure visual rendering of authored notation strings.
4. **No slug-specific code branches.** Token classification is generic — runs the same algorithm for every notation. Slug-specific behavior would only exist in the static parser-mirror sets (which describe TOKEN classes, not slug-specific rules).
5. **`sourceLabel: 'editorial'` const literal preserved.** Phase 6's new view-model field is `notationDisplay`, with no source label (it's a rendering of an authored field, not a derivation).
6. **Architecture C (parser metadata-seeding) permanently rejected** — Phase 6 doesn't bring it back.

New Phase 6 rule (extension):
7. **Static parser-mirror registries in TS must stay in sync with `parse_freestyle_notation.py`.** When a token is added to `ROTATION_TOKENS`, `DIRECTION_TOKENS`, `DELAY_SURFACE_TOKENS`, or `UNUSUAL_SURFACE_TOKENS` in the parser, the TS mirror updates in the same change. Codified as a comment in `notationRoleRegistry.ts` AND added to `feedback_parser_editorial_separation.md` future-extensions.

---

## 9. Recommended minimal implementation path

If Phase 6 is approved, sub-phases:

**Phase 6a — service-layer shape.**
- New file `src/services/notationRendering.ts` with:
  - Static parser-mirror sets (ROTATION_TOKENS, etc.)
  - Phase-6-specific static sets (BODY_COMPONENT_TOKENS, FOOTEDNESS_TOKENS, MULTIPLICITY_TOKENS, SUFFIX_TOKENS)
  - `NotationToken`, `NotationDisplay` interfaces
  - `NotationRole` type union
  - `shapeNotationDisplay(notation, ctx)` function
  - `ROLE_LABELS: Record<NotationRole, string>` for tooltip text
- Wire into `getFreestyleTrickDetailPage` (`freestyleService.ts`):
  - Build the lookup context once per request (slugs, modifiers, aliases)
  - Pass to `shapeNotationDisplay`
  - Add `notationDisplay: NotationDisplay | null` to the page view-model
- Pass-through tests: input/output assertions for `shapeNotationDisplay` directly (unit test, no HTTP).

**Phase 6b — template render.**
- Add the `<section class="notation-display">` block to `trick.hbs` near the top of trick-detail.
- Wrap each token in role-classed `<span>` per §5.2.
- Verify HTML parses correctly; integration tests for the 6 cases.

**Phase 6c — CSS.**
- Add `.notation-token` + per-role classes to the existing freestyle CSS file (identify path during implementation).
- Placeholder colors per PROPOSAL §5.1 guideline; final palette per WCAG AA contrast check.
- Accessibility verification: color-blind safe palette test; dotted-underline visible on `unresolved`; bold visible on `core_family`.

**Phase 6d — tests (Phase 6a-c land first).**
- Integration tests for the 6 cases James named.
- Edge-case tests per §7.3.
- Regression tests per §7.4.

**Phase 6e — re-audit.**
- `scripts/audit-notation-grammar.ts` already captures the diagnostic-grammar panel; the new notation block is OUTSIDE that panel. The audit script does NOT need to change — but a separate ad-hoc audit (manual page review) of the 25 Tier-1 rows verifies the rendered colors match expected role classifications.

Each sub-phase is approval-gated. Phase 6a–c can land in one commit if the changes are coherent; Phase 6d can be the same commit (integration tests with the implementation per `tests/CLAUDE.md` "Tests land in the same change as the code they cover"). Phase 6e is a one-time manual verification, not a code change.

---

## 10. Out of scope for Phase 6

Per the proposal constraints + the "no broad copy edits" pattern from prior phases:

- **Parser changes** (preserving forever-rule).
- **ADD math changes**.
- **New notation authoring** — Phase 6 renders the 25 Tier-1 rows + whatever future-tier rows have populated `notation`. Authoring more rows is a separate Tier 2/3 batch.
- **Red ingestion** (no pt10 etc.).
- **FootbagMoves ingestion** (deferred per bootstrap §6 Tier 4).
- **Ontology changes** (productive multiplicity, Tier C resolution, X-Dex notation form).
- **Glossary tooltip enrichment** — beyond the `title` attribute, no popovers, no reverse-lookup.
- **Notation as alternative parser input** — the parser still tokenizes `canonical_name`; Phase 6 doesn't change that.
- **Notation similarity in `buildRelatedTricks`** — flagged in `NOTATION_CORPUS_BOOTSTRAP_PLAN §7.5` as future-value but separate scope.
- **Animation, transitions, JavaScript interactivity** — Phase 6 is server-rendered HTML + CSS only. No client-side logic.
- **Dictionary-list rendering** (deferred per §5.6).

---

## 11. Estimated effort

| Sub-phase | Activity | Time |
|---|---|---|
| 6a | Service shape (notationRendering.ts + wire-in) | ~3 hours |
| 6b | Template change (trick.hbs section) | ~1 hour |
| 6c | CSS (palette + accessibility check) | ~2 hours |
| 6d | Integration tests (6 cases + edge + regression) | ~3 hours |
| 6e | Manual audit of Tier 1 rendered output | ~1 hour |

**Total: ~10 hours active-time.** Comparable to Phase 5a (which similarly added a service-shape + template + tests). No DB schema change; no migration; no parser change.

---

## 12. Recommended decision

**Approve Phase 6 as a single batched implementation** (6a-d landing together, 6e as manual verification post-merge). Reasons:

1. The pieces are tightly coupled: service shape feeds template feeds CSS feeds tests. Splitting risks half-shipped state.
2. The implementation surface is small and well-bounded (~3 files: service, template, CSS, plus test file).
3. Phase 6 builds on a clean stack: parser preserved, editorial layer preserved, audit infrastructure unchanged. Risk surface is the new render path only.
4. Tier 1 authoring (25 rows) is already in production — Phase 6 immediately materializes the educational value of those rows.

**Recommended scope** (final):
- Trick-detail page only (defer dictionary-list per §5.6).
- Static + DB hybrid registries per Option C (§2.2).
- 6 named test cases per James + edge cases per §7.3.
- Service layer + template + CSS in one batch.

**Reject Architecture A** (full TS-side mirror): higher maintenance burden than necessary.
**Reject Architecture B** (DB-only): cannot render rotation as its own visual class, losing PROPOSAL §5 design intent.

---

## 13. What this proposal does NOT propose

- No code authored in this document.
- No CSS values committed.
- No service-shape implementation.
- No template changes.
- No tests authored.
- No new tokens added to any registry.
- No parser modifications.
- No data writes.

Implementation begins only after Phase 6 approval.

---

## Cross-references

| File / Path | Role |
|---|---|
| `exploration/freestyle-notation-grammar/PROPOSAL.md` §5 | Color/role mapping + accessibility guideline |
| `exploration/freestyle-notation-grammar/NOTATION_STYLE_GUIDE.md` | Token vocabulary + house style; LOCKED 2026-05-09 |
| `exploration/freestyle-notation-grammar/NOTATION_CORPUS_BOOTSTRAP_PLAN.md` | The 25-row Tier 1 corpus this phase renders |
| `exploration/freestyle-notation-grammar/PHASE5_STATUS_SHAPE_CONSULTS.md` §7 | Forever-rules carried forward (Phase 6 extends) |
| `scripts/parse_freestyle_notation.py` | Parser whose static registries Phase 6 mirrors (sync rule per §8) |
| `src/services/freestyleService.ts` | Where `shapeNotationDisplay` will live |
| `src/views/freestyle/trick.hbs` | Template that gains the new notation section |
| `legacy_data/inputs/curated/tricks/CANONICALIZATION_POLICY.md` | §10 productive multiplicity (DOUBLE/TRIPLE prefix tokens) |
| `feedback_parser_editorial_separation.md` (memory) | Forever-rules; Phase 6 extends with the parser-mirror sync rule |
| `feedback_parser_population_after_rebuild.md` (memory) | Existing operational reminder; unaffected by Phase 6 |
