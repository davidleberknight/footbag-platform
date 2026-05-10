# Notation Style Guide & Canonical Exemplars

Authoring reference for Tier 1 notation bootstrap. Establishes the house style and a set of canonical exemplars across categories.

**Status: RATIFIED 2026-05-09** for the §8 questions per James review. §6 exemplars are locked for Tier 1 authoring per the ratifications below. Tier 3 special cases (X-Dex / atom-smasher) and Tier C deferred rows (barfly/infinity) remain pending per their separate adjudication channels.

---

## 0. Governing principle — humans first, parser compatibility second

**Notation is semantic educational language for humans, not compiler syntax for machines.**

This principle sits above every other rule in this guide. When a parser-friendly form and a human-readable form diverge, the human-readable form wins. The project's distinguishing opportunity is human-readable semantic freestyle notation — not maximally precise machine grammar.

Practical consequences carried throughout this guide:

- Tier 1 authoring prefers **pedagogical clarity** over mechanical detail (refines bootstrap §4.8).
- Surface-suffix tricks preserve the suffix even when the parser doesn't need it (`HEAD STALL`, not `HEAD`).
- Community-canonical abbreviations win over expanded forms (`ATW`, not `AROUND-THE-WORLD`).
- Cultural / historical names preserve their identity (`MOBIUS`, not `GYRO TORQUE`).
- Notation vocabulary is restrained — no inventing tokens unless historically grounded, parser-necessary, or pedagogically indispensable.

The parser still consumes the notation (round-trip QC per bootstrap §5.1) and house-style discipline (§4) keeps the human form parseable. But where a tradeoff exists, humans win.

This principle is a forever-rule for the notation surface, alongside the architectural commitments in `feedback_parser_editorial_separation.md`. Future iterations of this style guide preserve it.

Builds on:
- `PROPOSAL.md` §2 + §3 (Jobs notation grammar examples; role buckets; parser strategy)
- `NOTATION_CORPUS_BOOTSTRAP_PLAN.md` (this guide is the dependency it referenced)
- `legacy_data/event_results/scripts/18_scrape_footbag_org_moves.py` (footbag.org-side notation legend)
- `docs/Freestyle_Footbag_Glossary.md` §7 (community-glossary notation form)
- `feedback_parser_editorial_separation.md` (architectural commitments preserved)

---

## 1. Reference state and source corpus

### 1.1 Current notation state

- **0 of 146 active tricks have `notation`, `jobs_notation_raw`, or `jobs_notation_normalized` populated.** Public trick pages display "Notation pending" universally.
- Scraped footbag.org corpus (`legacy_data/out/scraped_footbag_moves.csv`) currently holds 0 notation rows; the scrape script (`18_scrape_footbag_org_moves.py`) has not been re-run against the live source recently.
- Phase-0 columns exist on `freestyle_tricks` per PROPOSAL §4.1; nothing fills them.

This guide therefore CANNOT anchor exemplars on existing footbag.org notation strings. Exemplars are authored from first principles using the conventions documented across PROPOSAL examples, the scraper legend, and community glossary form. **They are proposals, not ratifications.**

### 1.2 Authoritative reference sources

| Source | Status | Used for |
|---|---|---|
| `PROPOSAL.md` §2.2 | Loaded, examples used | Bracketed-component shape (`OP IN [DEX]`, `SAME CLIP [XBD] [DEL]`) |
| `PROPOSAL.md` §3.2 | Loaded, registries cited | Token vocabulary (SET_TOKENS, MODIFIER_TOKENS, etc.) |
| `legacy_data/event_results/scripts/18_scrape_footbag_org_moves.py` | Read | Bracket primitive definitions: `[DEX]`, `[BOD]`, `[XBD]`, `[DEL]` |
| `docs/Freestyle_Footbag_Glossary.md` §7 | Read | Community-glossary form: `(clipper) > whirl > butterfly` (sequenced) |
| `legacy_data/inputs/curated/tricks/CANONICALIZATION_POLICY.md` | Loaded | §4 directionality, §10 productive multiplicity (Double X), §5 modifier vs naming-adjective |
| Red pt1–pt9 corrections | Already in dict | Modifier weights, X-Dex special case (atom-smasher), Nuclear-Mirage = Sumo |

### 1.3 What this guide does NOT use

- Footbag.org live-scrape data (column empty in current corpus).
- FootbagMoves.com (deferred Tier 4 per bootstrap plan).
- Speculative or reconstructed third-party conventions.
- AI-generated or heuristic notation (forbidden per bootstrap §8).

When the exemplar requires conjecture, this guide says so explicitly with **(unconfirmed)** annotation.

---

## 2. House style choice

### 2.1 Convention reconciliation

Two community conventions appear in the reference sources:

**Convention A — Bracketed-component form** (footbag.org-scraper-legend, PROPOSAL.md examples):
- Bracketed primitives: `[DEX]`, `[BOD]`, `[XBD]`, `[DEL]`
- Unbracketed prefix tokens: `OP` (opposite-foot), `SAME`, `IN` (in-direction), `OUT`
- Surface tokens: `CLIP`, `TOE`, `INSIDE`, `HEEL`, `OUTSIDE` (unbracketed in PROPOSAL §3.1 example `SAME CLIP [XBD] [DEL]`)
- Shape: prefix tokens + body components in brackets

**Convention B — Sequenced glossary form** (`docs/Freestyle_Footbag_Glossary.md` §7):
- Tokens lower-case, parenthesized for surfaces: `(clipper) > whirl > butterfly`
- `>` separator between sequence stages
- Reads as left-to-right narrative

### 2.2 House style: hybrid favoring Convention A

The bootstrap adopts **Convention A as primary**, with two community-form accommodations:

1. **Bracketed-component primary form** — `[DEX]`, `[BOD]`, `[XBD]`, `[DEL]` as the structural body components per scraper legend.
2. **Uppercase tokens for grammar elements** — `PARADOX`, `CLIP`, `IN`, `OUT`, `SAME`, `OP` per PROPOSAL convention.
3. **Whitespace-separated** — single space between major elements; no `>` sequencer (Convention B's `>` form is reserved for community-glossary documentation only, NOT for `jobs_notation_raw` authoring).
4. **Surface tokens unbracketed** — `CLIP`, `TOE`, `HEAD` etc., matching PROPOSAL §3.1's `SAME CLIP [XBD] [DEL]` shape (CLIP unbracketed) and Convention B's `(clipper)`-style parenthesization is NOT used in `jobs_notation_raw` (the parser doesn't treat parens as separators).

### 2.3 Reasons for choosing Convention A

Per the §0 governing principle (humans first), the choice is grounded primarily in human-readability:

- Bracketed primitives `[DEX] [BOD] [XBD] [DEL]` are documented vocabulary — community readers learn them once, then read every notation.
- The shape pattern (modifier-prefix + base + body-component-brackets) reads left-to-right as a sentence.
- The form generalizes cleanly across complexity tiers — `WHIRL` reads as easily as `STEPPING DUCKING PARADOX TORQUE`.

Secondary (parser-side) benefits, kept as supporting rationale:

- Maps to parser role buckets (PROPOSAL §2.1).
- Round-trip QC works without invented sequence-mode parsing.
- Aligns with footbag.org if/when Tier 4 reconciliation resumes.

### 2.4 Convention B's role

Reserved for **public glossary copy and pedagogical narrative**, NOT authoring. The glossary already documents `(clipper) > whirl > butterfly` style; this guide doesn't change that. The `notation` column on `freestyle_tricks` and its `jobs_notation_raw` Phase-0 sibling carry Convention A.

### 2.5 Hyphen vs space — discrimination rule

The most-asked authoring question. Q2 + Q8 ratifications establish:

**Use a SPACE between tokens when at least one token carries operative structural role meaning.** Examples:
- `HEAD STALL` — HEAD is a recognized unusual_surface; STALL is the structural suffix
- `CLOUD KICK` — CLOUD is a recognized unusual_surface; KICK is the body action
- `FLYING INSIDE` — FLYING and INSIDE both descriptive (a body primitive); space-form reads more naturally
- `PARADOX WHIRL` — PARADOX is a registered modifier; WHIRL is the core family

**Use a HYPHEN within multi-token forms when the canonical name has atomic cultural identity beyond its decomposition.** Examples:
- `DADA-CURVE` — community-stabilized canonical name; the hyphen preserves the named identity
- `DRAGONFLY-KICK` — DRAGONFLY is a name (not a surface); the trick's identity is the compound
- `FLYING-CLIPPER` — alias `jester`-tier name; canonical-named per pt8 activation
- `FOOD-PROCESSOR`, `ATOM-SMASHER`, `GRAVE-DIGGER`, `JANI-WALKER` — all named compounds with cultural identity

**Tie-breaker for ambiguous cases: humans first.** Default to space when both readings are defensible — human readers parse word-separated text faster than hyphenated compounds. Hyphen reserves are for names that genuinely act as a single identity unit.

Worked discrimination on edge cases:
- `hop-over`, `walk-over`: both tokens descriptive; space-form `HOP OVER`, `WALK OVER` read more naturally per humans-first → **space**.
- `flying-inside`, `flying-outside`: descriptive body primitives; space form → **space**.
- `cloud-kick`, `sole-kick`: surface + structural suffix; space → **space**.
- `dragonfly-kick`: dragonfly is a name, not a surface; → **hyphen**.
- `flying-clipper`: cultural identity (jester); → **hyphen**.
- `mobius`: single-word atomic identity; no separator question.
- `double-around-the-world`: stabilized productive multiplicity AND ATW abbreviation per Q3 → **space form `DOUBLE ATW`** (combines productive-multiplicity prefix with abbreviated base).

The rule favors readability without abandoning structural fidelity. When in doubt, space.

---

## 3. Token vocabulary

The complete authoring vocabulary, grouped by role. Tokens come from `scripts/parse_freestyle_notation.py` registries (already in production) and the scraper legend.

### 3.1 Bracketed body primitives

| Token | Meaning | Authoring use |
|---|---|---|
| `[DEX]` | Dexterity component — leg passes over/under bag | Most tricks include at least one |
| `[BOD]` | Body component — rotation or positional motion | Whirl, butterfly, body-spin family |
| `[XBD]` | Cross-body delay — catching leg behind support leg | Cross-body stall surfaces (clipper-stall, cross-body-sole) |
| `[DEL]` | Delay/stall surface — landing position | Stall-surface tricks |

### 3.2 Set primitives (unbracketed prefix tokens)

From `SET_TOKENS` registry per `parse_freestyle_notation.py:67-71`:

`ATOMIC`, `PIXIE`, `FAIRY`, `POGO`, `ROOTED`, `FURIOUS`, `QUANTUM`, `NUCLEAR`, `SHOOTING`

Authoring: prepended to base trick form. E.g. `ATOMIC [OUT IN] [DEX] BUTTERFLY`.

### 3.3 Rotation modifiers (unbracketed prefix tokens)

From `ROTATION_TOKENS`:

`SPINNING`, `INSPINNING`, `SWIRLING`, `WHIRLING`, `GYRO`

Authoring: prepended. E.g. `SPINNING [OUT IN] [DEX] WHIRL`.

### 3.4 Body-positional modifiers (unbracketed prefix tokens)

From `MODIFIER_TOKENS`:

`DUCKING`, `STEPPING`, `SYMPOSIUM`, `PARADOX`, `TAPPING`, `BLAZING`, `WEAVING`, `BARRAGING`, `MIRAGING`, `DIVING`, `BLURRY`, `TERRAGING`, `XDEX`, `BACKSIDE`

Note: `BACKSIDE` was added per Red pt9 (Phase 5e rebuild confirmed it lives in MODIFIER_TOKENS). `XDEX` is the documented X-Dex modifier (atom-smasher origin).

### 3.5 Direction tokens (unbracketed)

From `DIRECTION_TOKENS`:

`REV`, `REVERSE`

Per CANONICALIZATION_POLICY §4: direction is structural, NEVER a modifier. These tokens propagate into the trick's notation but DO NOT contribute ADD bonus.

### 3.6 Delay-surface tokens (unbracketed)

From `DELAY_SURFACE_TOKENS`:

`CLIP` (clipper), `TOE`, `INSIDE`, `HEEL`, `OUTSIDE`

### 3.7 Unusual surface tokens (unbracketed)

From `UNUSUAL_SURFACE_TOKENS`:

`SOLE`, `KNEE`, `HEAD`, `NECK`, `SHOULDER`, `FOREHEAD`, `CLOUD`

### 3.8 Footedness / direction-of-dex (unbracketed prefix tokens)

Per PROPOSAL §3.1 examples (`OP IN [DEX]`, `SAME CLIP [XBD] [DEL]`):

| Token | Meaning |
|---|---|
| `SAME` | Same-foot execution |
| `OP` | Opposite-foot execution |
| `IN` | In-direction dex (outside-to-inside) |
| `OUT` | Out-direction dex (inside-to-outside) |

(unconfirmed: `FAR` and `NEAR` may also be Jobs-tradition tokens — flagged as open question in §8.)

### 3.9 Multiplicity prefix tokens (unbracketed)

Per CANONICALIZATION_POLICY §10 productive multiplicity:

`DOUBLE`, `TRIPLE`, `QUADRUPLE`, `QUINTUPLE`

Used ONLY for stabilized productive-multiplicity rows (`double-leg-over`, `double-around-the-world`, `double-spin`). Per Red pt3, descriptive-multiplicity rows (Double Fairy, Double Blender) get NO notation entry — they aren't in the dictionary.

### 3.10 Core-family tokens (unbracketed)

From PROPOSAL §3.2 (and verified live via parser's `family_canonical_tokens`): every active trick slug. The most common in Tier 1 candidates:

`WHIRL`, `BUTTERFLY`, `MIRAGE`, `ILLUSION`, `OSIS`, `TORQUE`, `DRIFTER`, `BLENDER`, `SWIRL`, `LEGOVER`, `PICKUP`, `EGGBEATER`, `BARFLY`, `BLUR`, `CLIPPER` (kick form), `ATW` (around-the-world)

Authoring uses uppercase canonical-name-as-slug form. `ATW` is community-canonical short form; preferred over the full `AROUND-THE-WORLD` per pedagogical-clarity rule (NOTATION_CORPUS_BOOTSTRAP_PLAN §4.8).

---

## 4. Syntactic rules

### 4.1 Casing

- **All grammar tokens UPPERCASE.** `PARADOX`, `WHIRL`, `[DEX]`, `CLIP`.
- **Lowercase prohibited** in `jobs_notation_raw`. The lowercase form lives in `jobs_notation_normalized` (derived).
- Mixed case prohibited.

### 4.2 Whitespace

- **Single ASCII space** separates major elements.
- No tabs, no double spaces, no leading/trailing whitespace.
- No newlines (notation is one-line).

### 4.3 Brackets

- **`[...]`** = body component primitive (DEX/BOD/XBD/DEL).
- **No other bracket forms** in `jobs_notation_raw`. Parens, braces, angle brackets all prohibited.
- Nested brackets prohibited (e.g. `[[DEX] [BOD]]`).

### 4.4 Token ordering (left-to-right narrative)

Per PROPOSAL §3.3 ambiguity rules + scraper convention:

```
[set] [rotation] [modifier(s)] [footedness] [direction] [surface] [body components]
[BASE-FAMILY]
```

Examples:
- `BUTTERFLY` — base alone
- `PARADOX BUTTERFLY` — modifier + base
- `SPINNING SYMPOSIUM WHIRL` — rotation + modifier + base
- `ATOMIC SAME OUT [DEX] BUTTERFLY` — set + footedness + direction + body + base

The parser doesn't strictly enforce order; per PROPOSAL §3.3 it logs an ordering warning. Authoring discipline keeps order canonical.

### 4.5 Modifier ordering within the same role

When multiple body modifiers stack (e.g. paradox + symposium), order them in the conventional Red-documented form. House rule:

- `PARADOX` before `SYMPOSIUM` (per Red's documented sequence in fury, surreal, etc.)
- `SPINNING` before `STEPPING` (per surging expansion)
- `STEPPING` before `DUCKING` before `PARADOX` (per gauntlet decomposition)

When in doubt, preserve the order Red uses in the documentation that introduced the trick.

### 4.6 No empty tokens

- No `[]` (empty brackets).
- No `[ ]` (whitespace-padded brackets).
- A token that doesn't apply is OMITTED, not nullified.

### 4.7 No commas, no punctuation

`jobs_notation_raw` is unpunctuated. No periods, commas, semicolons, exclamation points, question marks. Editorial uncertainty surfaces in `description` (Phase 4 Editorial context block) or `review_note`, not in the notation.

### 4.8 Length

- Tier 1 notation: typically 1–4 tokens (e.g. `WHIRL`, `PARADOX WHIRL`).
- Tier 2 notation: 3–8 tokens (e.g. `STEPPING DUCKING PARADOX TORQUE`).
- Tier 3 notation: variable. Longer notations are acceptable when structurally accurate; brevity is not a virtue if it loses information.

### 4.9 Normalization

`jobs_notation_normalized = lowercase(strip(jobs_notation_raw))`. Mechanical; do not author the normalized form separately.

---

## 5. Authoring philosophy per category

Category-level discipline that informs the §6 exemplars.

### 5.1 Surface delays — minimal canonical form

Surface delays are the simplest case. Their notation is just:

```
{SURFACE} {[DEL] | STALL}
```

Recommendation: omit `[DEL]` for the bare-surface tricks since "stall" is implicit in the canonical name. Just `TOE`, `HEEL`, etc.

### 5.2 Pure base tricks — atom-form

Base tricks (whirl, butterfly, mirage, etc.) get the family-anchor form:

```
{BASE-FAMILY}
```

Just the name, uppercased. The trick IS the structural identity; structural decomposition lives in family ancestry, not in the notation.

Trade-off: this loses the mechanical detail (what dex direction, what footedness) the canonical Jobs notation might encode. Resolution: Tier 1 prefers pedagogical clarity (NOTATION_CORPUS_BOOTSTRAP_PLAN §4.8); the structural detail can be added later via Tier 2/3 enrichment.

### 5.3 Body primitives — descriptive form

Body primitives (spin, hop-over, walk-over) get a body-component-prefixed form:

```
{[BOD] | DESCRIPTOR} {NAME}
```

Recommendation: use the canonical_name-as-name form for these (`SPIN`, `HOP-OVER`). They're already self-descriptive; no Jobs-tradition mechanical form is documented.

### 5.4 Single-modifier compounds — modifier-prefix form

Single-modifier compounds (paradox-whirl, spinning-whirl, blur, etc.) get:

```
{MODIFIER} {BASE}
```

E.g. `PARADOX WHIRL`, `SPINNING WHIRL`, `BLURRY MIRAGE` (for blur).

### 5.5 Multi-modifier compounds — stacked-modifier-prefix form

```
{MODIFIER_1} {MODIFIER_2} ... {MODIFIER_N} {BASE}
```

E.g. `SPINNING SYMPOSIUM WHIRL`, `STEPPING DUCKING PARADOX TORQUE` (gauntlet).

### 5.6 Productive-multiplicity rows — multiplicity-prefix form

```
{DOUBLE | TRIPLE} {BASE-OR-CANONICAL}
```

E.g. `DOUBLE LEGOVER`, `DOUBLE ATW`, `DOUBLE SPIN`.

Per CANONICALIZATION_POLICY §10, only stabilized productive-multiplicity rows get notation. Descriptive ones (Double Fairy etc.) are NOT in the dictionary.

### 5.7 Self-atom named compounds — name-as-notation

For named compounds whose canonical_name isn't structurally decomposable in the dictionary's modifier-vocabulary (sumo, fury, surge, surreal, mobius, food-processor, etc.), the bootstrap notation uses the canonical-name form:

```
{CANONICAL-NAME-AS-SLUG-UPPERCASED}
```

E.g. `SUMO`, `FURY`, `MOBIUS`, `BARFLY`. The structural decomposition (Nuclear Mirage, Furious-Paradox-Mirage, Gyro-Torque, Double-Infinity) lives in the row's `description` (Phase 4 Editorial context) and `freestyle_trick_modifier_links` (Phase 5a Editorial decomposition), NOT in the notation.

This is a deliberate authoring choice: notation = name; structure = description + editorial decomp. Avoids encoding contested ontology in the notation.

---

## 6. Canonical exemplars (LOCKED 2026-05-09)

§8 Q1–Q9 ratifications baked in. Tier 1 authoring uses these exemplars as templates. Tier 3 deferred items (atom-smasher X-Dex per Q7, barfly per Tier C) carry name-form per §5.7 until their separate adjudications complete.

### 6.1 Surface delays (Tier 1, 12 rows)

Q8 ratification: surface-suffix preserved per humans-first principle. Beginner-readability + semantic-clarity considerations override minimalism.

| Slug | Asserted ADD | Locked notation | Rationale |
|---|---:|---|---|
| `toe-stall` | 1 | `TOE STALL` | surface + structural suffix per Q8 |
| `heel-stall` | 1 | `HEEL STALL` | parallel |
| `inside-stall` | 1 | `INSIDE STALL` | parallel |
| `outside-stall` | 1 | `OUTSIDE STALL` | parallel |
| `knee-stall` | 1 | `KNEE STALL` | unusual_surface |
| `head-stall` | 1 | `HEAD STALL` | unusual_surface (Q8 anchor case) |
| `neck-stall` | 1 | `NECK STALL` | unusual_surface |
| `forehead-stall` | 1 | `FOREHEAD STALL` | unusual_surface |
| `shoulder-stall` | 1 | `SHOULDER STALL` | unusual_surface |
| `sole-stall` | 2 | `SOLE STALL` | unusual_surface; ADD=2 (high-density surface exception per CANONICALIZATION_POLICY) |
| `cloud-stall` | 2 | `CLOUD STALL` | unusual_surface; ADD=2 |
| `clipper-stall` | 2 | `CLIPPER STALL` | delay_surface; cross-body structural information lives in trick_family / category, not in notation token form per humans-first |

### 6.2 Pure base tricks (Tier 1, 12 rows)

| Slug | Asserted ADD | Proposed notation | Notes |
|---|---:|---|---|
| `mirage` | 2 | `MIRAGE` | core-family |
| `whirl` | 3 | `WHIRL` | core-family |
| `butterfly` | 3 | `BUTTERFLY` | core-family |
| `osis` | 3 | `OSIS` | core-family |
| `illusion` | 2 | `ILLUSION` | core-family (mirage-direction-reversed per §4) |
| `legover` | 2 | `LEGOVER` | core-family |
| `pickup` | 2 | `PICKUP` | core-family |
| `clipper` | 1 | `CLIPPER` | core-family (kick form per pt8 migration) |
| `blender` | 4 | `BLENDER` | core-family (Red pt3 productive-multiplicity tension; notation stays as-name pending Red review per §5.7) |
| `drifter` | 3 | `DRIFTER` | core-family |
| `swirl` | 3 | `SWIRL` | core-family |
| `torque` | 4 | `TORQUE` | core-family |

### 6.3 Body primitives & directional families (Tier 1, ~10 rows)

| Slug | Asserted ADD | Proposed notation | Notes |
|---|---:|---|---|
| `spin` | 1 | `SPIN` | body primitive |
| `double-spin` | 2 | `DOUBLE SPIN` | productive multiplicity stabilized |
| `hop-over` | 2 | `HOP OVER` | body primitive; default-to-space per §2.5 (both tokens descriptive) |
| `walk-over` | 2 | `WALK OVER` | body primitive; parallel |
| `flying-inside` | 1 | `FLYING INSIDE` | body primitive (modifier-prefix-style) |
| `flying-outside` | 1 | `FLYING OUTSIDE` | parallel |
| `spyro` | 1 | `SPYRO` | body primitive |
| `around-the-world` | 2 | `ATW` | community-canonical short form per §3.10 / §4.8 pedagogical preference |
| `double-around-the-world` | 3 | `DOUBLE ATW` | productive multiplicity |
| `reverse-around-the-world` | 2 | `REV ATW` | direction-as-structural per §4 |

**Resolved per Q2 / §2.5:** `DADA-CURVE` (hyphen, atomic cultural identity).

### 6.4 Single-modifier compounds — Whirl family (Tier 1, ~6 rows)

| Slug | Asserted ADD | Proposed notation |
|---|---:|---|
| `paradox-whirl` | 4 | `PARADOX WHIRL` |
| `spinning-whirl` | 5 | `SPINNING WHIRL` |
| `symposium-whirl` | 4 | `SYMPOSIUM WHIRL` |
| `ducking-whirl` | 4 | `DUCKING WHIRL` |
| `stepping-whirl` | 4 | `STEPPING WHIRL` |
| `tapping-whirl` | 4 | `TAPPING WHIRL` |

### 6.5 Single-modifier compounds — Mirage / Butterfly / Osis / Torque family (Tier 1, ~10 rows)

| Slug | Asserted ADD | Proposed notation |
|---|---:|---|
| `paradox-mirage` | 3 | `PARADOX MIRAGE` |
| `smear` (`pixie mirage`) | 3 | `PIXIE MIRAGE` |
| `blur` (`blurry mirage`) | 4 | `BLURRY MIRAGE` |
| `atomic-butterfly` | 4 | `ATOMIC BUTTERFLY` |
| `dimwalk` (`pixie butterfly`) | 4 | `PIXIE BUTTERFLY` |
| `ripwalk` (`blurry butterfly`) | 4 | `BLURRY BUTTERFLY` |
| `ducking-osis` | 4 | `DUCKING OSIS` |
| `paradox-torque` | 5 | `PARADOX TORQUE` |
| `atomic-torque` | 6 | `ATOMIC TORQUE` |
| `mobius` (`gyro torque`) | 5 | `GYRO TORQUE` (per row description; pedagogical-clarity name-form alternative `MOBIUS` also acceptable; choose ONE per §5.7) |

`mobius` exemplifies the §5.7 named-identity rule: `MOBIUS` (name-as-notation) preserves cultural / historical meaning; the `gyro torque` structural lineage lives in `freestyle_trick_modifier_links` per Phase 5e backfill. **Locked per Q1.**

### 6.6 Multi-modifier compounds (Tier 2 anchor; some may be Tier 1 stretch)

| Slug | Asserted ADD | Proposed notation |
|---|---:|---|
| `spinning-symposium-whirl` | 6 | `SPINNING SYMPOSIUM WHIRL` |
| `paradox-symposium-whirl` | 5 | `PARADOX SYMPOSIUM WHIRL` |
| `gauntlet` | 7 | `STEPPING DUCKING PARADOX TORQUE` (per row description; structural form preferred over name-as-notation `GAUNTLET` because the row's editorial decomposition exposes all four modifiers cleanly) |
| `tomahawk` | 5 | `DUCKING PARADOX WHIRL` |

**Note**: `gauntlet`'s exemplar deliberately uses structural form (not `GAUNTLET`) because the modifier_link backfill in Phase 5e gives this row clean editorial decomposition. The notation reinforces that decomposition. Same logic does NOT apply to `mobius`, which has only one modifier link — `MOBIUS` carries equivalent information with less verbosity.

### 6.7 Self-atom named compounds (Tier 1 partial, Tier 2 mostly)

These rows have rich editorial state (per Phase 5e cleanup) but the notation uses name-as-form per §5.7:

| Slug | Asserted ADD | Proposed notation | Why name-form |
|---|---:|---|---|
| `sumo` | 5 | `SUMO` | Nuclear Mirage with X-Dex; structure contested, name preserves identity |
| `fury` | 5 | `FURY` | Furious-Paradox-Mirage; Red-stabilized name |
| `surge` | 5 | `SURGE` | Surging-Paradox-Mirage; Red-stabilized |
| `surreal` | 6 | `SURREAL` | Surging-Paradox-Whirl; Red-stabilized |
| `barfly` | 4 | `BARFLY` | Double Infinity; broken upstream — Tier C deferred per Phase 5e §6 |
| `nemesis` | 6 | `NEMESIS` | Furious-Barfly per Red pt8 |
| `smoke` | 4 | `SMOKE` | Pixie-Drifter per Red pt8 |
| `plasma` | 5 | `PLASMA` | Quantum-Double-Down per Red pt8 |
| `food-processor` | 6 | `FOOD-PROCESSOR` | Blurry-Blender per Red pt8 |
| `atom-smasher` | 4 | `ATOM-SMASHER` | Atomic Mirage with X-Dex per Red pt1; X-Dex makes this a Tier 3 (policy-sensitive) candidate, NOT Tier 1 |

### 6.8 Productive-multiplicity stabilized rows (Tier 1 inclusion)

| Slug | Asserted ADD | Proposed notation |
|---|---:|---|
| `double-leg-over` | 3 | `DOUBLE LEGOVER` (per Red pt3; productive multiplicity stabilized) |
| `double-around-the-world` | 3 | `DOUBLE ATW` |
| `double-spin` | 2 | `DOUBLE SPIN` |

These are the ONLY productive-multiplicity rows with notation. Per CANONICALIZATION_POLICY §10, descriptive-multiplicity rows (Double Fairy etc.) are not in the dictionary.

### 6.9 Pt9-stabilized rows (Tier 1 anchor — Red-confirmed within last sprint)

| Slug | Asserted ADD | Proposed notation | Notes |
|---|---:|---|---|
| `sailing` | 2 | `SAILING` | name-form per §5.7; Pixie-Quantum equivalence in description |
| `sumo` | 5 | `SUMO` | (already in §6.7) |

Pt9-confirmed modifier `BACKSIDE` will appear in Tier 2/3 compound rows when authored; no Tier 1 row uses it directly.

### 6.10 Recently-activated rows (potentially Tier 1 anchor)

Per the §2.5 hyphen-vs-space discrimination rule: surface + structural-suffix → space; canonical named-compound atomic identity → hyphen.

| Slug | Asserted ADD | Locked notation | Status |
|---|---:|---|---|
| `cloud-kick` | 1 | `CLOUD KICK` | surface + KICK suffix → space-form (parallel to surface-stall pattern) |
| `dragonfly-kick` | 2 | `DRAGONFLY-KICK` | named-compound (DRAGONFLY is a name, not a surface) → hyphen |
| `flying-clipper` | 2 | `FLYING-CLIPPER` | named-compound (`jester`-tier cultural identity) → hyphen |
| `whirling-swirl` | 4 | `WHIRLING SWIRL` | modifier + base → space |
| `dada-curve` | 4 | `DADA-CURVE` | named-compound (atomic identity) → hyphen |
| `sole-kick` | 1 | `SOLE KICK` | surface + KICK suffix → space-form |

---

## 7. Special cases

### 7.1 X-Dex and atom-smasher (Tier 3 — defer)

Atom-smasher's notation question per Red pt1:
- Structural: `ATOMIC MIRAGE` — but math closes only as +2 rot, not +1 atomic + +1 X-Dex per Red's framing
- X-Dex-explicit: `ATOMIC XDEX MIRAGE` — but the parser's `xdex` modifier is registered with +1 weight; double-application is non-trivial

**Recommendation: defer to Tier 3.** Tier 1 candidate `atom-smasher` uses name-form `ATOM-SMASHER`. Tier 3 revisits with a James/Red adjudication on X-Dex notation form.

### 7.2 Policy-token rows (quantum, shooting, sumo) — Tier 3 honest uncertainty

- `quantum` (POLICY_TOKEN): proposed `QUANTUM` (name-as-set-primitive). The policy-token tagging surfaces via parser, not via notation form.
- `shooting`: proposed `SHOOTING` (name-as-set-primitive per §3.2; pt9 confirmed +3 rotational). Notation is straightforward; the policy concern lives elsewhere.
- `sumo`: covered in §7.1 (Tier 3).

### 7.3 Broken-upstream-link rows (barfly) — Tier C deferred

`barfly` has `base_trick='infinity'` (no `infinity` row in dictionary). Its notation per §5.7 is just `BARFLY`. The structural lineage assertion (Double Infinity) lives in description + the broken-link signal Phase 5a surfaces. Per Phase 5e §4 Tier C, do NOT add an `infinity` notation row pending Red consultation.

### 7.4 Direction-as-structural (rev-* family)

Per CANONICALIZATION_POLICY §4: direction is structural, NEVER a modifier. Notation reflects that:

- `rev-up`: proposed `REV UP` (rev as direction prefix, up as core-family token — though `up` isn't in any registry; falls through to unresolved per parser behavior; that's correct honest behavior)
- `rev-whirl`: proposed `REV WHIRL`
- `reverse-around-the-world`: proposed `REV ATW`

Direction tokens (`REV`, `REVERSE`) DON'T contribute ADD; the notation purely signals direction.

### 7.5 Compound surface delays

Per the §6.1 / Q8 ratification, surface-suffix takes the space-form. Cross-body structural information lives in `trick_family` / category / editorial decomposition, not in the notation token form (humans-first).

- `clipper-stall` (ADD=2): `CLIPPER STALL`
- `cross-body-sole-stall` (ADD=3): `CROSS-BODY SOLE STALL` — three units, with `CROSS-BODY` itself hyphenated as a unitary structural qualifier per §2.5

Earlier draft proposed bracketed body-component forms (`CLIP [XBD]`, `SOLE [XBD]`). Withdrawn per humans-first principle and Q8 ratification: bracketed body components are reserved for cases where they convey information not derivable from the row's family / category. For `clipper-stall` and `cross-body-sole-stall`, the cross-body fact is downstream of the trick family; the notation can stay readable.

### 7.6 Multi-token canonical compounds (dada-curve, food-processor)

Multi-word names — `dada curve`, `food processor`, `atom smasher`, `cloud kick`, `dragonfly kick` — get the slug-as-notation form with hyphen:

- `DADA-CURVE`, `FOOD-PROCESSOR`, `ATOM-SMASHER`, `CLOUD-KICK`, `DRAGONFLY-KICK`

**Resolved per Q2 / §2.5:** atomic-identity multi-word names use hyphen (`DADA-CURVE`, `FOOD-PROCESSOR`); structural-role compounds use space (`PARADOX WHIRL`, `HEAD STALL`).

---

## 8. Ratified decisions (James review 2026-05-09)

All Q1–Q9 are resolved. §6 exemplars are locked per these ratifications.

### Q1. `mobius` — RATIFIED `MOBIUS` (name-form)

Mobius is culturally canonical; collapsing to structural form `GYRO TORQUE` would lose historical/community meaning. The parser-semantics vs public-notation-language distinction matters here. Treat `mobius` like `BLUR`, `RIPWALK`, `BARFLY` — recognized named canonicals. (§6.5 reflects this.)

### Q2. Multi-word names — RATIFIED hyphen-vs-space discrimination

- Hyphen for canonical named compounds with atomic identity: `DADA-CURVE`, `DRAGONFLY-KICK`, `FLYING-CLIPPER`, `FOOD-PROCESSOR`.
- Space for structural role-token combinations: `PARADOX WHIRL`, `STEPPING DUCKING TORQUE`, `HEAD STALL`, `CLOUD KICK`.

The discrimination rule is codified in §2.5. Default to space when both readings are defensible (humans-first §0).

### Q3. ATW abbreviation — RATIFIED `ATW`

`ATW` is canonical, compact, culturally universal, and readable. Optimize notation for human semantic fluency, not maximal expansion. (§3.10 + §6.3 reflect.)

### Q4. Tier 1 detail level — RATIFIED name-form

Tier 1 is pedagogical stabilization, not mechanical formalism. `WHIRL` is vastly better than `[OUT IN] [DEX] [BOD]` for the bootstrap. (§5.2 + §6.2 reflect.) Mechanical detail can layer in at Tier 2/3 if ground-truth reference data becomes available.

### Q5. `gauntlet` — RATIFIED `STEPPING DUCKING PARADOX TORQUE` (structural)

The hardest and most important question. Gauntlet is **the showcase exception** — its decomposition is structurally meaningful, its modifier layering is one of the cleanest demonstrations that notation can expose semantic structure. Unlike Mobius (deeply culturally atomic), Gauntlet's identity is not undermined by the structural form.

Rationale per James:
- Gauntlet is not deeply culturally atomic.
- Its decomposition is structurally meaningful.
- Its modifier layering is one of the coolest demonstrations of the system.

(§6.6 reflects.)

### Q6. `FAR` / `NEAR` — RATIFIED omission

Restraint principle: do NOT invent notation vocabulary unless historically grounded, parser-necessary, or pedagogically indispensable. (§3.8 reflects; vocabulary stays narrow.)

### Q7. X-Dex (atom-smasher) — RATIFIED Tier 3 defer

Too unstable, too ontology-sensitive, too hard to teach cleanly yet. Tier 1 uses `ATOM-SMASHER` name-form per §6.7. Tier 3 revisits with James/Red adjudication.

### Q8. Surface-suffix retention — RATIFIED `HEAD STALL` (override)

James override. Beginner readability + semantic clarity + public-facing pedagogy outrank minimalism, especially in Tier 1.

Updated §6.1 reflects: every surface-stall row carries the `STALL` suffix space-separated. Same logic extends to surface-kick rows in §6.10 (`CLOUD KICK`, `SOLE KICK`).

### Q9. `REV` vs `REVERSE` — RATIFIED `REV`

Readable, compact, conventional-looking — good balance. (§3.5 + direction-as-structural exemplars in §6.3 + §7.4 reflect.)

---

## 9. Forbidden patterns

Per architectural commitments, these patterns must not appear in any bootstrap notation:

- **Lowercase tokens** in `jobs_notation_raw` (lowercase is the normalized form).
- **Sequencer characters** (`>`, `→`, `,`, `;`, etc.). Whitespace is the only separator.
- **Parens around tokens** — Convention B's `(clipper) > whirl > butterfly` form is glossary copy, NOT bootstrap notation.
- **Slug-internal characters** other than ASCII letters and `-`. No underscores in notation tokens (slug `head-stall` becomes notation `HEAD`, NOT `HEAD_STALL`).
- **ADD numerics** in notation (`PARADOX(+1) WHIRL(3) = 4` is parser-formula form; NOT notation form).
- **Comments** or annotations inside notation. Editorial text lives in `description`.
- **Slug-specific markers** (e.g. `(unconfirmed)`, `(pending)`). Editorial state surfaces in `review_status` / `review_note` / Phase 5a editorial-decomposition layer; NOT in notation.
- **AI-generated tokens** the parser doesn't recognize. Authoring is constrained to the registries in §3.

---

## 10. Authoring checklist (per row)

Before submitting a notation row to the staging CSV, the curator (James) verifies:

1. ☐ All tokens uppercased.
2. ☐ Whitespace is single-space only; no leading/trailing.
3. ☐ Brackets are `[DEX] | [BOD] | [XBD] | [DEL]` only.
4. ☐ Token order follows §4.4 (set / rotation / modifier / footedness / direction / surface / body-components / family-base).
5. ☐ Every token is in §3 vocabulary OR is a recognized core-family slug uppercased.
6. ☐ Modifier slugs match `freestyle_trick_modifiers` table (parser registries are the source of truth).
7. ☐ Productive-multiplicity rows use stabilized prefixes only (per CANONICALIZATION_POLICY §10).
8. ☐ Self-atom named compounds use name-form per §5.7 unless §6 exemplar table specifies otherwise.
9. ☐ Special cases (X-Dex, broken-link, policy-token) deferred to Tier 3 if any.
10. ☐ Author has consulted §8 open questions and resolved per James decision.

If any item fails: do NOT submit. Either author per the rule, or escalate to James as a §8-style new open question.

---

## 11. Future open questions (residual)

§8 Q1–Q9 are ratified. The remaining open questions sit in the deferred tiers and don't block Tier 1 authoring:

- **X-Dex / `atom-smasher` notation form** — Tier 3 adjudication (Q7 ratified as deferred).
- **`barfly` / `infinity` ontology** — Tier C deferred per Phase 5e §6 (Red consultation).
- **Tier 4 reconciliation against FootbagMoves.com** — defers form-level decisions for tricks not in the current dictionary.
- **Mechanical-detail enrichment beyond Tier 1** — Q4 ratification deferred mechanical form to Tier 2/3 if ground-truth references emerge. No urgency.

These do not need resolution to begin Tier 1 authoring. Tier 1 rows that touch any of them either use name-form per §5.7 or are explicitly excluded from Tier 1 (atom-smasher, barfly).

---

## 12. Summary of locked decisions

For Tier 1 authoring (RATIFIED 2026-05-09):

| Decision area | Locked form |
|---|---|
| Governing principle | Humans first, parser compatibility second (§0) |
| Convention | A (bracketed-component) per §2 |
| Casing | All UPPERCASE |
| Sequencer | Whitespace only |
| Brackets | `[DEX] [BOD] [XBD] [DEL]` only |
| Hyphen vs space | Per §2.5 discrimination rule (Q2) |
| Surface delays | `{SURFACE} STALL` form per Q8 |
| Surface kicks | `{SURFACE} KICK` form (cloud-kick, sole-kick) |
| Pure base tricks | Name-form (`WHIRL`, `BUTTERFLY`) per Q4 |
| Single-modifier compounds | Modifier-prefix form (`PARADOX WHIRL`) |
| Multi-modifier compounds | Stacked-prefix form, ordered per §4.5; `GAUNTLET` is structural-form exception per Q5 |
| Self-atom named compounds | Name-as-notation per §5.7 |
| Productive multiplicity | `DOUBLE X` form for stabilized rows only; descriptive multiplicity NOT in dictionary |
| ATW | `ATW` per Q3 |
| `mobius` | `MOBIUS` per Q1 |
| Multi-word slugs | Hyphen-form when atomic identity (`DADA-CURVE`); space-form when structural roles (per §2.5) |
| X-Dex / `atom-smasher` | Tier 3 defer per Q7 |
| Broken-link rows (`barfly`) | `BARFLY` name-form; ontology deferred to Tier C / Red |
| Direction (`rev-*`) | `REV` token + base name per Q9 |
| Footedness vocabulary | `SAME`, `OP`, `IN`, `OUT` only; `FAR`/`NEAR` omitted per Q6 |

**§6 exemplars are locked for Tier 1 authoring.** Tier 1 rollout per `NOTATION_CORPUS_BOOTSTRAP_PLAN §3` can begin when ready. Per-row authoring follows §10 checklist.

---

## Cross-references

| File / Path | Role |
|---|---|
| `exploration/freestyle-notation-grammar/PROPOSAL.md` | Jobs notation grammar examples + parser strategy |
| `exploration/freestyle-notation-grammar/PHASE_2_5_REFINEMENTS.md` | Status vocabulary; descriptive vs ADD-contributing layers |
| `exploration/freestyle-notation-grammar/NOTATION_CORPUS_BOOTSTRAP_PLAN.md` | The bootstrap this guide enables |
| `exploration/freestyle-notation-grammar/PHASE5E_EDITORIAL_DATA_CLEANUP_PLAN.md` | Editorial layer cleanup that anchors §6 exemplars (e.g. gauntlet structural form) |
| `legacy_data/inputs/curated/tricks/CANONICALIZATION_POLICY.md` | §4 directionality, §5 modifier vs naming-adjective, §10 productive multiplicity |
| `legacy_data/event_results/scripts/18_scrape_footbag_org_moves.py` | Bracket primitive legend |
| `docs/Freestyle_Footbag_Glossary.md` §7 | Community Convention B form (NOT used in bootstrap notation; reserved for glossary copy) |
| `scripts/parse_freestyle_notation.py` | Token registries (§3) |
| `feedback_parser_editorial_separation.md` (memory) | Forever-rules carried forward |
| `feedback_parser_population_after_rebuild.md` (memory) | QC step after each Tier batch |
