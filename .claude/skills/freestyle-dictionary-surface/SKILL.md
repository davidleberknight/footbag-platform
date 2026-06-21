---
name: freestyle-dictionary-surface
description: Use when building or changing public-facing freestyle dictionary surfaces — the trick list and trick-detail pages (/freestyle/tricks, /freestyle/tricks/:slug), family pages, alias rendering, decomposition/related-trick/record/media display, and Simple vs Deep-Dive disclosure controls. Covers user-facing rendering and pedagogical authoring of dictionary content.
---

# Skill: freestyle-dictionary-surface

## When to use

Invoke this skill when work touches:

- Public-facing surfaces of the freestyle dictionary (`/freestyle/tricks`, `/freestyle/tricks/:slug`, hypothetical `/freestyle/families/:name` or `/freestyle/modifiers/:name`)
- Trick-detail page rendering, including aliases, decomposition, related tricks, records, media
- Family-page rendering: collective structure, ladder views, family-level media aggregation
- Disclosure-depth controls (Simple / Deep Dive toggles)
- Alias rendering decisions across any user-facing surface
- Pedagogical authoring (family intros, trick descriptions)
- Media tier ordering on dictionary surfaces
- Cross-cutting browse views (by ADD, by modifier, by set, by surface)

If the work is purely ontology / data-layer (canonical naming decisions, alias additions, modifier table edits, dictionary CSV changes), this skill is **adjacent** but not authoritative: fall through to `footbag-freestyle-dictionary` and `CANONICALIZATION_POLICY.md`.

If the work is media pipeline (sidecar emit, gallery seeding, source registration), fall through to `footbag-curated-media`.

---

## 1. Purpose and intent

The freestyle dictionary's competitive edge is **structural ontology** (relationships, decomposition, families, sets, aliases, provenance), not trick count. This skill governs how that ontology gets projected onto user-facing surfaces without overwhelming users.

The single load-bearing finding from the 2026-05-07 sandbox exploration:

> The dictionary's structure already encodes the things UX wants to surface. The work ahead is **projection** (services + templates + curator content), not **modeling** (schema).

When future sessions encounter requests like "let's add a `family_galleries` table" or "we need a `secondary_family` relation," push back. The default answer is: project from existing ontology, do not extend the data model.

---

## 2. Phase boundaries

### Currently in scope

- The existing `/freestyle/tricks/:slug` route (production)
- Sandbox UX exploration in `exploration/freestyle-dictionary-ux/`

### Currently NOT in scope

- Family-page production routes (`/freestyle/families/:name`): exploration only as of 2026-05-07
- Modifier-page production routes (`/freestyle/modifiers/:name`): never planned
- Search disambiguation pages: exploration not started
- Landing-page redesign: exploration not started
- Schema changes (alias_kind column, secondary_family relation): explicitly deferred
- Auth-gated dictionary depth: never; depth is layered, not gated

If a request blurs these boundaries, escalate. Explicitly note the sandbox-vs-production status in the response.

---

## 3. Architectural invariants

These are the load-bearing patterns. Future work that quietly relaxes them is a regression.

### Projection over extension

The default answer to "how do we surface X about a trick?" is: query the existing ontology and shape at the service layer. New schema is the rare exception, not the norm. Three of four UX axes explored in 2026-05-07 needed zero new schema; the fourth degraded gracefully without it.

### Disclosure depth, never auth gating

Public dictionary content is public. Login is reserved for member-private surfaces (club rosters, member contact info, personal practice tracking). Depth on dictionary pages is controlled by **interaction** (Simple / Deep Dive toggle, accordions, expanders), not by role.

### Decomposition is pedagogy at the trick level

A trick-detail page shows its structural decomposition (`gyro + torque = 5 ADD ✓`) even in Simple mode. The toggle controls the *explanation* depth, not the visibility of the structural fact. At family-page level, decomposition is compact annotation; at trick level, it's content.

### Single mapping site

Mirroring the pattern from `club-leadership-surface` and the CD-1 caption rewrite: status enums, alias categories, media tier orderings all map to display values at **one** site in the service layer. Templates branch on field presence (`badgeLabel`, `showContact`, `decomposition_formula`), never on enum values for text rendering. New statuses or categories add a branch to the mapping function, not to templates or queries.

### Search resolves all aliases; display surfaces only what helps

Aliases categorize into Common / Historical / Technical / Typo. Search resolves any of them to the canonical slug. Display surfaces only Common (always) and Historical (in Deep Dive). Technical aliases live in expanders. Typos are never user-visible.

### The ontology is the joint model

Galleries, browse views, related-trick lists are projections of `freestyle_tricks + modifier_links + base_trick + trick_family + aliases + tags`. They are not stored as separate entities. New "views" are queries, not tables.

---

## 4. Canonical UX contract patterns

The 2026-05-07 mockups (Whirl family + Mobius trick) established these patterns. They are validated in exploration; they are not yet production-shipped.

### Multi-family membership = primary + modifier association

The dictionary stores `trick_family` as a single value. A trick "in two families" is actually:

- **Primary family** (`trick_family` value, navigable badge)
- **Modifier association** (via `modifier_links`, informational text only: not a clickable alternative family destination unless a modifier-aggregator surface exists)

Mobius example: primary family `torque` (data) + modifier association `gyro` (via `modifier_links = 'gyro'`). The "gyro family" is narrative, not structural.

Render both honestly. Do not invent a `secondary_family` field; do not show two equal family badges.

### Hero-media inversion between scales

| Surface | Hero choice |
|---|---|
| Family page | Multi-trick representative (e.g., AnzTrikz "Whirl and Reverse Whirl" pair) |
| Trick page | Focused single-trick demo (e.g., Footbag Finland "Mobius") |

Same source data; different curatorial choice. The family page wants breadth; the trick page wants focus. Source-priority ordering (`anz_trikz > tt_youtube > footbagspot_passback > ...`) is the same; the *selection* differs.

### Alias five-category taxonomy

| Category | Render rule | Example |
|---|---|---|
| Common alias | Inline always | `Reverse Whirl` → rev-whirl; `PS Whirl` → paradox-symposium-whirl |
| Historical name | Inline in Deep Dive only; with provenance | `Whirlwind` → spinning-symposium-whirl; `Whip` → rev-whirl |
| **Structural alias** | Inline in Deep Dive (alongside the decomposition block) | `Gyro Torque` → mobius; `Atomic Legover` → eggbeater; `Blurry Mirage` → blur |
| Technical decomposition | Search-only / "abbreviations" expander | `pdx-whirl`, `BW`, `bs-magellan` |
| Typo / misspelling | Search-only; **never displayed** | `blury-whirl`, `m-bius`, `spinning-symposium-wirl` |

Categorization isn't in the schema today. Heuristics (length, vowel-edit-distance, word-count, abbreviation-token detection, known-name lookup) categorize most cases; a single optional curator-asserted `alias_kind` column would clean it up. Until then, render only the most-confidently-named Common aliases and degrade gracefully.

#### Structural alias category (added 2026-05-07; validated dictionary-wide)

A **structural alias** is a string that decomposes the canonical compositionally AND is in active community use as a name for the trick. The two dimensions distinguish it from each neighbor:

- vs Common: a Common alias is a synonym (different label for the same thing). A Structural alias is the *decomposition* (the modifier-stack expressed in noun-phrase form) used as a name.
- vs Historical: a Historical alias has been superseded by a different canonical name. A Structural alias coexists with the canonical: both forms are in current use.
- vs Technical decomposition: a Technical decomposition is an abbreviation or slug-form (`gyro-torque`, `pdx-whirl`). A Structural alias is the full noun phrase (`Gyro Torque`, `Atomic Legover`).

Validated examples from the alias audit (2026-05-07):

| Structural alias | Canonical | ADD math |
|---|---|---|
| Gyro Torque | mobius | gyro(+1) + torque(4) = 5 |
| Atomic Legover | eggbeater | atomic(+1) + legover(2) = 3 |
| Atomic Mirage | atom-smasher | atomic(+2 rot) + mirage(2) = 4 |
| Blurry Mirage | blur | blurry(+2 rot) + mirage(2) = 4 |
| Blurry Butterfly | ripwalk | blurry(+1) + butterfly(3) = 4 |
| Miraging Clipper | drifter | miraging(+1) + clipper(2) = 3 |
| Miraging Legover | double-leg-over | miraging(+1) + legover(2) = 3 |
| Barraging Legover | flurry | barraging(+1) + legover(2) = 3 |
| Pixie DLO | smog | pixie(+1) + double-leg-over(3) = 4 |
| Stepping DLO | haze | stepping(+1) + double-leg-over(3) = 4 |

Roughly 10–15 dictionary aliases fit this pattern. The audit found them clustered in the Common bucket under the prior four-category taxonomy; the fifth category surfaces them honestly.

#### Render rule for Structural aliases

- **Inline rendering only in Deep Dive mode**, alongside (not duplicated by) the decomposition block. The decomposition formula (`gyro(+1) + torque(4) = 5 ✓`) and the structural-alias name (`Gyro Torque`) are two presentations of the same fact; both can appear because they reach different reader populations:
  - The formula reaches structural / curator audiences
  - The noun-phrase name reaches community-vocabulary audiences
- **Search resolves them.** A user typing "Atomic Legover" lands on `eggbeater`, just as one typing "eggbeater" does.
- **Do NOT promote them to Simple mode.** Simple mode preserves the canonical name's authority; surfacing both `Eggbeater` and `Atomic Legover` in Simple risks confusing beginners.

#### Heuristic for auto-classification

A structural alias is detected when ALL of:

1. The alias is a multi-token noun phrase (≥ 2 words; not slug-form, not all-caps, not single-letter prefix)
2. Each leading token (except the last) matches a row in `freestyle_trick_modifiers`
3. The trailing token matches an active or pending `freestyle_tricks.slug` (the base)
4. The ADD math (sum of modifier bonuses + base.adds) equals the canonical's adds (math validates the decomposition)

If any condition fails, the alias is NOT structural: fall through to Common / Historical / Technical / Typo classification.

#### Edge case: structural alias that's ALSO Historical

Some structural aliases are also superseded names (Toe Blur → Quantum Mirage per Red pt2). Pick the **more useful** category for rendering:

- If active community usage is current, classify as Structural (rendered in Deep Dive)
- If the alias is fading from use AND replaced by a new canonical, classify as Historical

Curator override via `alias_kind` (when added) is the tiebreaker.

### Disclosure model

- Single URL serves both Simple and Deep Dive
- localStorage-based persistence (no auth, no URL state)
- Toggle persists across pages: Deep Dive on a family page carries to clicked trick pages
- Default first-visit lands in Simple
- Decomposition stays visible in Simple at trick level (formula content, not depth)
- Pedagogical intro shortens; structural blocks compress; ladders abbreviate; expanders close

---

## 5. Pedagogical philosophy

### Five-question intro framework

A good intro paragraph (family or trick) answers in 1-3 sentences:

1. **Mechanical signature**: what does the leg/body do?
2. **Distinctiveness**: vs neighboring families or sibling tricks
3. **Why care**: entry point in progression, community recognition
4. **Common confusion**: pre-empt the FAQ ("distinct from a swirl, where...")
5. **Branching / connection**: preview modifiers, derivatives, or related families

Family pages weight Q3 high (selling the family). Trick pages downweight Q3 (interest already established by user navigation).

### Voice norms

- Warm and structural, not encyclopedic
- Names neighbors before naming variants
- Ontology-anchored: every claim verifiable from dictionary data
- Short sentences (1–2 clauses each); this is signage, not prose
- No expert hedges ("it's said to be...", "some consider...": erodes trust)
- No editorialized difficulty ("hard tricks ahead!"): ADD numbers speak

### "Show me your work" expander depth

The ontology-details expander is for trust, not information density. It includes:

- Structural decomposition with ADD math validation
- Modifier-table provenance reference
- Alias provenance with category labels
- Family-membership honesty (primary vs modifier association)
- Source attribution / curator trail

It does NOT include:

- Full git-blame of dictionary rows
- Every cross-source disagreement
- Validation results, data-quality flags
- Test data

### ADD-math as competitive trust signal

Surfacing `gyro 1 + torque 4 = 5 ✓` doesn't add information for a casual viewer but signals "this site checks itself." Competitors lack the structural model to do this. Worth keeping in the expander even if rarely viewed.

---

## 6. Future direction (non-binding sequencing)

Likely future work, in approximate order:

1. **Family-page MVP** ← highest leverage; surfaces the ontology advantage; data exists
2. **Trick-detail enrichment** (already partially built; progressive-disclosure layering)
3. Alias-category surfacing (curator-asserted `alias_kind` or heuristics)
4. Modifier-aggregator surface (`/freestyle/modifiers/:name`)
5. Search disambiguation UX
6. Landing-page redesign (multi-door)
7. Curated learning paths ("if you know X, try Y")

Each phase is independently shippable. None blocks the others. The dictionary's data and the existing canonical service shape `freestyleService.getFreestyleTrickPage` already support most of phase 1 and 2 with zero schema work.

---

## 7. Anti-patterns

- **Auth-gating dictionary depth.** Login is for member-private data; trick depth stays public.
- **Inventing schema for UX wants.** Three of four UX axes require zero new schema. The fourth degrades gracefully.
- **Hiding decomposition as "advanced only"** at trick level. The formula IS pedagogy.
- **Rendering typo aliases publicly.** Search resolves; display omits.
- **Treating modifier associations as parallel families.** Primary family is data; modifier association is narrative+modifier_links.
- **Editorializing difficulty in prose.** ADD numbers speak.
- **Per-relationship database tables** ("family_galleries", "secondary_families", "progression_paths"). Galleries and views are projections of ontology + tags, not new entity types.
- **Inventing tricks, aliases, or relationships not in the dictionary.** Use real data only.
- **Fragmenting depth across multiple URLs.** One trick = one URL; one family = one URL. Disclosure controls layered content, not routing.
- **Coupling status enums to template-rendered text.** Single mapping site at the service layer (per `club-leadership-surface` pattern).
- **Rendering broken links.** "Modifier association" text without a destination is acceptable; a link to a non-existent page is not.

---

## 8. Source-of-truth references

For design intent, not implementation:

- `legacy_data/inputs/curated/tricks/CANONICALIZATION_POLICY.md`: ontology governance, alias policy §6, freeze philosophy §9
- `.claude/skills/footbag-freestyle-dictionary/SKILL.md`: ontology layer rules (dictionary / modifiers / aliases / glossary / sequence / canonical results / media linkage / navigation layer)
- `.claude/skills/footbag-curated-media/SKILL.md`: media pipeline + tier semantics + source registry
- `.claude/skills/club-leadership-surface/SKILL.md`: parallel pattern: read-only projection with privacy gate + single mapping site
- `exploration/freestyle-dictionary-ux/EXPLORATION_CHARTER.md`: sandbox lane charter
- `exploration/freestyle-dictionary-ux/FAMILY_PAGE_WHIRL_MOCK.md`: family-page pattern source
- `exploration/freestyle-dictionary-ux/TRICK_DETAIL_MOBIUS_MOCK.md`: trick-detail pattern source

For implementation specifics (current production routes, service signatures, template paths), consult the codebase at the time of work. Those details rot; the principles in this skill do not.

---

## 9. Status

**Exploration-derived. Not production-shipped.** The patterns in this skill emerged from sandbox mockups conducted 2026-05-07. The /freestyle/tricks/:slug production page exists and works at a thinner layout than the mockups; family pages do not yet exist.

When a production phase begins, the skill becomes load-bearing for that work. Until then, it serves as anchor for future exploration sessions and as a defense against scope creep in adjacent surfaces.
