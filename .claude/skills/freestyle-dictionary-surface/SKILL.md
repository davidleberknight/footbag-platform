---
name: freestyle-dictionary-surface
description: Use when building or changing public-facing freestyle dictionary surfaces — the trick list and trick-detail pages (/freestyle/tricks, /freestyle/tricks/:slug), family pages, alias rendering, decomposition/related-trick/record/media display, and Simple vs Deep-Dive disclosure controls. Covers user-facing rendering and pedagogical authoring of dictionary content.
---

# Skill: freestyle-dictionary-surface

## When to use

Invoke this skill when work touches:

- Public-facing surfaces of the freestyle dictionary (`/freestyle/tricks`, `/freestyle/tricks/:slug`, `/freestyle/families/:slug`, `/freestyle/modifier/:slug`)
- Trick-detail page rendering, including aliases, decomposition, related tricks, records, media
- Family-page rendering: collective structure, ladder views, family-level media aggregation
- Disclosure-depth controls (Simple / Deep Dive toggles)
- Alias rendering decisions across any user-facing surface
- Pedagogical authoring (family intros, trick descriptions)
- Media tier ordering on dictionary surfaces
- Cross-cutting browse views (by ADD, by modifier, by set, by surface)

If the work is purely ontology / data-layer (canonical naming decisions, alias additions, modifier table edits, dictionary CSV changes), this skill is **adjacent** but not authoritative: fall through to `footbag-freestyle-dictionary` and the doctrine of record in `freestyle/doctrine/`.

If the work is media pipeline (sidecar emit, gallery seeding, source registration), fall through to `footbag-curated-media`.

---

## 1. Purpose and intent

The freestyle dictionary's competitive edge is **structural ontology** (relationships, decomposition, families, sets, aliases, provenance), not trick count. This skill governs how that ontology gets projected onto user-facing surfaces without overwhelming users.

The single load-bearing finding from the sandbox exploration:

> The dictionary's structure already encodes the things UX wants to surface. The work ahead is **projection** (services + templates + curator content), not **modeling** (schema).

When future sessions encounter requests like "let's add a `family_galleries` table" or "we need a `secondary_family` relation," push back. The default answer is: project from existing ontology, do not extend the data model.

---

## 2. Status of the surfaces this skill governs

These are **live production surfaces**: the trick index and detail pages (`/freestyle/tricks`, `/freestyle/tricks/:slug`), family pages (`/freestyle/families`, `/freestyle/families/:slug`), sets, glossary, operators, and search all ship and passed the V1 release audit. This skill's contract rules apply to them now — they are not exploration, and there is no "when a production phase begins" caveat.

Not in scope, by design: modifier-page production routes (`/freestyle/modifiers/:name`, never planned); schema changes such as an `alias_kind` column or a `secondary_family` relation (projection over extension); auth-gated dictionary depth (never — depth is layered, not gated). Implementation status and forward sequencing live in the maintainers' private tracker; this skill carries the durable UX contract only. The one active forward-build track is Glossary V2, whose design lives in `exploration/glossary-v2-architecture/`.

---

## 3. Architectural invariants

These are the load-bearing patterns. Future work that quietly relaxes them is a regression.

### Projection over extension

The default answer to "how do we surface X about a trick?" is: query the existing ontology and shape at the service layer. New schema is the rare exception, not the norm. Three of four UX axes explored needed zero new schema; the fourth degraded gracefully without it.

### Disclosure depth, never auth gating

Public dictionary content is public. Login is reserved for member-private surfaces (club rosters, member contact info, personal practice tracking). Depth on dictionary pages is controlled by **interaction** (Simple / Deep Dive toggle, accordions, expanders), not by role.

### Decomposition is pedagogy at the trick level

A trick-detail page shows its structural decomposition (`gyro + torque = 5 ADD ✓`) even in Simple mode. The toggle controls the *explanation* depth, not the visibility of the structural fact. At family-page level, decomposition is compact annotation; at trick level, it's content.

### Single mapping site

The single-mapping-site pattern: status enums, alias categories, media tier orderings all map to display values at **one** site in the service layer. Templates branch on field presence (`badgeLabel`, `showContact`, `decomposition_formula`), never on enum values for text rendering. New statuses or categories add a branch to the mapping function, not to templates or queries.

### Search resolves all aliases; display surfaces only what helps

Aliases categorize into Common / Historical / Technical / Typo. Search resolves any of them to the canonical slug. Display surfaces only Common (always) and Historical (in Deep Dive). Technical aliases live in expanders. Typos are never user-visible.

### The ontology is the joint model

Galleries, browse views, related-trick lists are projections of `freestyle_tricks + modifier_links + base_trick + trick_family + aliases + tags`. They are not stored as separate entities. New "views" are queries, not tables.

---

## 4. Canonical UX contract patterns

These UX contract patterns (established via the Whirl family and Mobius trick mockups) govern the live dictionary surfaces.

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
| Common alias | Inline always | `Reverse Whirl` → rev_whirl; `PS Whirl` → paradox_symposium_whirl |
| Historical name | Inline in Deep Dive only; with provenance | `Whirlwind` → spinning_symposium_whirl; `Whip` → rev_whirl |
| **Structural alias** | Inline in Deep Dive (alongside the decomposition block) | `Gyro Torque` → mobius; `Atomic Legover` → eggbeater; `Pixie DLO` → smog |
| Technical decomposition | Search-only / "abbreviations" expander | `pdx_whirl`, `BW`, `bs_magellan` |
| Typo / misspelling | Search-only; **never displayed** | `blury_whirl`, `m_bius`, `spinning_symposium_wirl` |

Categorization isn't in the schema today. Heuristics (length, vowel-edit-distance, word-count, abbreviation-token detection, known-name lookup) categorize most cases; a single optional curator-asserted `alias_kind` column would clean it up. Until then, render only the most-confidently-named Common aliases and degrade gracefully.

#### Structural alias category (validated dictionary-wide)

A **structural alias** is a string that decomposes the canonical compositionally AND is in active community use as a name for the trick. The two dimensions distinguish it from each neighbor:

- vs Common: a Common alias is a synonym (different label for the same thing). A Structural alias is the *decomposition* (the modifier-stack expressed in noun-phrase form) used as a name.
- vs Historical: a Historical alias has been superseded by a different canonical name. A Structural alias coexists with the canonical: both forms are in current use.
- vs Technical decomposition: a Technical decomposition is an abbreviation or slug-form (`gyro_torque`, `pdx_whirl`). A Structural alias is the full noun phrase (`Gyro Torque`, `Atomic Legover`).

Validated examples from the alias audit:

| Structural alias | Canonical | ADD math |
|---|---|---|
| Gyro Torque | mobius | gyro(+1) + torque(4) = 5 |
| Atomic Legover | eggbeater | atomic(+1) + legover(2) = 3 |
| Atomic Mirage | atom_smasher | atomic(+1) + mirage(2) + [XDEX](1) = 4 |
| Blurry Butterfly | ripwalk | blurry(+1) + butterfly(3) = 4 |
| Barraging Legover | flurry | furious(+2) + legover(2) = 4 |
| Pixie DLO | smog | pixie(+1) + double_leg_over(3) = 4 |
| Stepping DLO | haze | stepping(+1) + double_leg_over(3) = 4 |

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

## 6. Future direction

Forward sequencing for these surfaces (alias-category surfacing, a modifier-aggregator surface, search disambiguation, curated learning paths, and the Glossary V2 layering track) is tracked in the maintainers' private tracker, not here. The dictionary's data and the existing `freestyleService.getFreestyleTrickPage` shape already support most enrichment with zero schema work — projection over extension.

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
- **Coupling status enums to template-rendered text.** Single mapping site at the service layer.
- **Rendering broken links.** "Modifier association" text without a destination is acceptable; a link to a non-existent page is not.
- **Linking a trick hashtag with no media, or making the name a link.** On a trick page the hashtag links to its gallery only when the trick has media, else a plain token (a clickable hashtag is the sole media signal); the name is never a link; a separate "Trick Detail" link opens the detail page. Rule: `.claude/rules/view-layer.md`.

---

## 8. Source-of-truth references

For design intent, not implementation:

- `docs/FREESTYLE.md`: the freestyle maintainer guide (authority tiers, table-level data model, publication gate, doc map)
- `freestyle/doctrine/` (index: its `README.md`): the doctrine of record for ontology governance and alias policy
- `.claude/skills/footbag-freestyle-dictionary/SKILL.md`: ontology layer rules (dictionary / modifiers / aliases / glossary / sequence / canonical results / media / navigation)
- `.claude/skills/footbag-curated-media/SKILL.md`: media pipeline + tier semantics + source registry

For implementation specifics (current production routes, service signatures, template paths), consult the codebase at the time of work. Those details rot; the principles in this skill do not.
