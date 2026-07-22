---
name: footbag-freestyle-dictionary
description: Use when adding, modifying, reviewing, or classifying freestyle trick / dictionary / glossary / modifier / alias / sequence data in the footbag-platform project. Enforces strict layer separation between trick dictionary, modifiers, aliases, glossary, sequence/combo analysis, and canonical competition results.
---

# Footbag Freestyle Dictionary Skill

Use this skill when adding, modifying, reviewing, or classifying freestyle trick / dictionary / glossary / sequence data in the footbag-platform project.

Detailed procedures (description templates, media-linkage mechanics, navigation-helper internals) live in the sidecar `REFERENCE.md` in this folder; this skill carries the durable rules.

## Core Rule

Do not mix these layers:

- Trick Dictionary
- Modifier System
- Alias / Naming System
- Glossary / Terminology
- Sequence / Combo Analysis
- Canonical Competition Results

Each has different truth rules.

---

## Operating posture

The freestyle encyclopedia is release-ready and in **stewardship mode**. There is no active promotion campaign; the promotion arc is closed, and what remains unpromoted is blocked on doctrine questions recorded in `freestyle/doctrine/RED_QUEUE.md`.

This skill carries **no project status**. For what is done, active, parked, or blocked, read the open freestyle issues in the maintainers' private tracker (`gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open --label freestyle`; if unwired, note it in one line and rely on the human's instruction). For what is currently held pending the rules expert's answers, read `freestyle/doctrine/RED_QUEUE.md`; for what is settled, `freestyle/doctrine/RED_RULINGS.md`. Never trust a remembered or skill-embedded status or hold list.

Do not begin promotion, authoring, or restructuring work from this skill. Start only from a scoped item the maintainer has pulled from the tracker. The one sanctioned forward-build track is Glossary V2 (`exploration/glossary-v2-architecture/`), and it is content-first and gated on maintainer approval. The public freestyle surfaces (trick index and detail, family pages, sets, glossary, operators, browse, search) are **live production**, not exploration.

## Surface propagation (definition of done for every freestyle slice)

A standing rule, not a task. Any freestyle update — a promotion, a doctrine change, a classifier change, or a content backfill — must propagate to every affected surface before the slice is complete; a change is not complete merely because the source row was edited. Affected surfaces, as applicable: canonical trick data; aliases / duplicate archive; Emerging Vocabulary; the observational universe; tracked names; ADD analysis; trick detail pages; browse / search; operator / modifier pages; set pages; family surfaces; media / related-trick projections; metrics / counts / copy; generated content files (`src/content/freestyleObservationalUniverse.ts`, `freestyleTrackedNames.ts`, and their peers); and tests / QC gates. For every slice, explicitly verify one of: (1) all affected surfaces were updated and regenerated, or (2) a surface is intentionally unchanged, with the reason documented. This applies to human and AI work alike.

---

## Foundational doctrine

The sections below (A, plus C and D) are durable architectural invariants that hold across every freestyle slice, regardless of which data table or template is under edit. The implementation-layer rules (sections 1–6) refine these; they never override them.

### A. Four-layer ontology separation

The Core Rule above describes DATA layers (which table, which file). This section describes ONTOLOGY layers (which kind of meaning). Both apply simultaneously.

| Ontology layer | Meaning | Example surface |
|---|---|---|
| **Canonical names** | Official trick naming. The community labels. | `freestyle_tricks.canonical_name`, dictionary card titles, family slugs |
| **Symbolic decomposition** | Structural tokenization. Operators + bases + side-positionals composed into formulas. | `tokenizedEquivalences`, semantic notation tokens, `≡` readings |
| **Glossary pedagogy** | Educational explanation. Coach-tone primer prose, modifier-feel cards, definitions. | `/freestyle/glossary`, modifier feel cards, dex direction prose |
| **Embodied movement analogy** | Descriptive movement relationships. How body parts move; movement neighborhoods; feel. | Glossary feel-card "feel" + "intuition" fields, future movement-archetype layer |

**Rules:**

- **Layers MAY link.** A symbolic token may carry an anchor to its glossary entry. A glossary modifier card may deep-link to tricks using that modifier. Cross-layer NAVIGATION is encouraged.
- **Layers MUST NOT collapse.** Never put coach-tone prose into a token's text field. Never derive an embodied-movement description from a symbolic formula. Never canonicalize a pedagogical synonym.
- **Observational topology ≠ canonical ontology.** A trick's appearance in an observational grouping (e.g., "midtime body modifiers") is supplementary; it never reshapes the canonical family classification in `freestyle_tricks.trick_family`.

When in doubt about where a piece of content belongs: identify which layer it serves, store it on that layer's surface, and link from other layers as needed.

### C. Family / topology caution

Movement relationships involve multiple overlapping axes: symbolic structure, modifier lineage, dex archetypes, embodied feel, timing/body-path topology, catch/surface relationships. These do not collapse cleanly into one classification.

- **`family` ≠ `topology`.** A `trick_family` value names the structural anchor (whirl, butterfly, mirage). A topology group is an observational grouping by movement mechanic (midtime body modifiers, ducking/diving family). Same trick, different lenses; do not unify them.
- **`family` ≠ catch surface.** Clipper-as-surface and clipper-as-family are not the same concept; many unrelated tricks land on clipper without belonging to a "clipper family." Treat surfaces as their own facet.
- **Multi-axis movement relationships exist.** A trick can be primary-family `legover` AND secondary-related to `mirage` (via `miraging legover` reading). A trick can appear in multiple topology groups. Single-value `trick_family` columns express ONE axis; do not pretend they express all of them.
- **Descriptive shorthand ≠ canonical decomposition.** Coach-tone descriptions ("body drops under the bag") are pedagogical; they are NOT structural decomposition (`pixie ducking butterfly`). Keep them on separate layers.
- **Embodied analogies are pedagogical, not canonical.** Movement-feel cards are teaching material; they never freeze into canon.
- **Public family-base qualification (`?view=family` / `freestylePublicFamilies.ts`).** A public family ROOT must (a) have MORE THAN 2 active members (>=3) — HARD RULE — and (b) express a terminal/downside structural identity: a landing signature descendants preserve even as modifiers stack on the entry (paradox-whirl still "is" a whirl). Entry-side dexterity primitives / operators (ATW is the canonical example) are NOT family roots — they belong in the components / movement-system / glossary-fundamentals layer. This is the public-display layer only and never changes canonical `trick_family`.

When a slice proposal collapses any of these distinctions, **stop and surface the conflict to the curator** before writing code.

### D. Symbolic restraint doctrine

Symbolic-surface design has firm constraints that hold across every public template, partial, and view.

- **No token soup.** Tokens render only on surfaces that explicitly carry symbolic-decomposition content (trick cards, glossary composition section, compression flow). Other surfaces stay prose.
- **No AST / parser visuals.** No tree views, no parser-style decomposition trees, no interactive symbolic editors on public pages.
- **No interaction-heavy symbolic UI.** Token hover affordances are restrained (underline-on-hover, no popovers, no rich tooltips). No drag, no expand-on-click, no animation.
- **No visual overload.** The 4-color budget (core-family green / modifier olive / side-positional neutral / unknown inherit) holds. Do not introduce additional role colors without curator approval.
- **Replace, don't add.** When refining a symbolic surface, prefer replacing an existing element over stacking a new one.
- **Chips localized to symbolic surfaces only.** ADD chips, formula chips, glyph chips render on dictionary / glossary symbolic surfaces. Do not propagate them to event pages, records, member surfaces, or competition tables.

When a slice proposes a new symbolic-surface affordance, evaluate against these six constraints first.

---

## 1. Trick Dictionary Layer

Use `freestyle_tricks` only for actual physical moves (butterfly, whirl, ripwalk, atom smasher, flurry). A trick should generally have: canonical name, slug, ADD value, category / family, description, source / provenance, review status. Do not store glossary terms here.

### Canonical vs compositional row rule

A trick deserves its own row in `freestyle_tricks` only when at least one of:

1. **Named identity persistence.** The name is used independently of its decomposition (`dyno`, `paradon`, `bigwalk`: known by community name, not as "spinning stepping butterfly").
2. **Not losslessly decomposable.** Base + modifiers do not fully describe it. If they do, model via `modifier_links` on a compound row instead.
3. **Historical / competitive significance.** Competition results, widely-recognized tutorials, or community canonical lists. Records-only appearance is weak signal; competition / TT lesson / Red's curated set is strong signal.
4. **Structural ambiguity resolver.** Multiple valid decompositions exist for the same physical move; the name is the canonical anchor.
5. **Alias collapse check.** Before creating a new row, check whether the name maps to an existing canonical slug. If so, it's an alias on the existing row, NOT a new row.

Do NOT create canonical rows for: pure modifier chains (`spinning paradox mirage` → model via `modifier_links`); surface-only variants (`kick` vs `stall`); direction-only variants (unless direction is structural per the rule below); combinatorial expansions (every modifier×base tuple does NOT deserve a row).

### Direction is structural

A direction-reversed movement is its own dictionary entry, not the same trick with a qualifier. Red-confirmed: mirage ≠ illusion; spinning ≠ inspinning; ATW ≠ reverse ATW. If two moves differ in spin / dex / movement direction, they get separate rows even when their structural skeleton is otherwise identical.

Within-trick CW/CCW or in/out execution variants stay in one canonical row when the community treats them as the same trick (e.g. `around_the_world` notation `TOE > SAME IN/OUT [DEX] > SAME TOE [DEL]`).

### Stall ontology rule (Red pt5 clarification)

Stalls (toe-stall, inside-stall, clipper-stall, osis) are **common anchor positions** used in many tricks. This is descriptive, not prescriptive; it does not generalize to a universal rule. The ontology must also support non-stall tricks (kicks, surface-less compounds, dexterity-only sequences), body tricks (spin, hop-over, spyro), sets (pixie, fairy, atomic, quantum), modifiers, and standalone compounds without an explicit stall base. Do NOT force tricks into stall-based decomposition; when a base is unclear, defer rather than invent a stall ancestor.

### Jobs notation is the structural backbone

Trick names are labels; Jobs notation describes the actual movement. Store as opaque text in `freestyle_tricks.notation`. Do not parse, do not regenerate. Mismatches between description and notation are flagged in QC, never silently rewritten. When canonical notation is blank and footbag.org has notation, promote it (script 20). When they disagree, preserve the disagreement in `freestyle_trick_source_links.asserted_notation`; never silently overwrite.

### Description policy

Public-facing descriptions are neutral and instructional. No reviewer names ("per Red", "by X", "Husted"), no provenance attribution (that lives in `freestyle_trick_source_links.notes` or QC reports, not `description`). Descriptions must not enumerate aliases or append bare "also called," "also known as," or equivalent alias clauses. Alias wording may appear when it is necessary to explain the trick's structure, historical provenance, or established usage, provided the description is not merely duplicating the alias display. ADD-derivation shorthand ("3 ADD = pixie(+1) + mirage(2)") is permitted in `description` as curator provenance: the placeholder suppressor `isDescriptionStructuralPlaceholder` hides any description carrying it from public render, and the ADD math renders instead from the structured "How it's built" composition. Any ADD math a description carries must still agree with the row's `adds` value (self-contradictions are HIGH-severity QC failures). Because the suppressor hides the whole description, prose meant to render must not carry shorthand, or it is suppressed along with it. **The established description templates and write-surface details are in `REFERENCE.md`.**

---

## 2. Modifier Layer

**Single-authority rule (operator / modifier doctrine).** `src/content/freestyleOperatorReference.ts` is the CANONICAL source for every operator / modifier's ADD value, structure, and X-Dex behavior. All other operator/modifier-describing surfaces are SECONDARY and must stay consistent with it: `freestyleMovementSystems.ts`, `freestyleStructuralFactNotes.ts`, the DB `freestyle_trick_modifiers` registry, and the public glossary operator text. When operator doctrine changes, edit `operatorReference.ts` first, then bring the secondary surfaces into line; never let a secondary surface assert a contradicting value. Drift between them is a bug.

Use the modifier system for structural components that alter tricks (atomic, paradox, gyro, spinning, stepping, symposium, pogo).

- Some modifiers add ADDs; some do not (Pogo is a set but does not add ADD).
- Some concepts exist both as a trick and a modifier form (Barrage is a standalone trick; barraging modifies another trick).
- Do not enforce ADD math globally unless expert-reviewed.

### Surging modeling rule

`surging` is NOT a primitive modifier. Always decompose: **surging = spinning + stepping**.

- **Modifier table:** do NOT add a `surging` row to `freestyle_trick_modifiers`. Only `spinning` and `stepping` belong there.
- **Compound rows:** when a trick is named "Surging X", set `modifier_links=spinning|stepping|...`. The "surging X" form lives in the `aliases` column.
- **The `surging` row in the dictionary** remains a standalone compound (decomposes to `spinning + stepping`, no base trick); it is NOT a modifier. As a standalone trick it is **3 ADD** (`surging` + toe stall); its operator/set contribution stays **+2**.

---

## 3. Alias / Naming Layer

Use aliases for naming evolution, abbreviations, and alternate terms. Rules:

- Modern community name should generally be canonical; older names become historical aliases.
- Descriptive names can be aliases for named tricks.
- Do not merge identities silently when terminology is ambiguous.

### 3a. Positional identity by configuration (resolver contract + invariant)

Positional qualifiers (`same-side` / `near` / `far` / `opposite` / `ss` / `op`) are STRUCTURAL, not lexical. They are never stripped from the slug. A positional name's identity is its resolved side-configuration (the SAME/OP markers across its side-bearing components), not the qualifier-stripped name. Full doctrine: `freestyle/doctrine/POSITIONAL_IDENTITY.md`.

**Core rule:** a fixed relationship in notation is INSUFFICIENT evidence for multi-component identity collapse. Multi-component positional aliases require an explicit curated equivalence row; the resolver may not infer them autonomously. The configuration resolver classifies a positional name into exactly one status: SAFE_ALIAS (autonomous only for single-component identities), DISTINCT_VARIANT_CANDIDATE, AMBIGUOUS_MULTI_COMPONENT, COLLISION, NO_NOTATION, NEEDS_CURATED_EQUIVALENCE.

**Invariant (regression guard):** the resolver MUST NEVER emit SAFE_ALIAS when `component_count > 1` unless an explicit curated equivalence exists (a `freestyle_trick_aliases` row mapping the positional slug to the base). The resolver READS curated equivalences from the materialized `freestyle_trick_aliases`; it never writes them, and is authoritative for classification only, never for automatic multi-component collapsing.

---

## 4. Glossary / Terminology Layer

Glossary terms describe runs, style, scoring concepts, or community vocabulary (guiltless, tiltless, fearless, density, shred circle). They are not tricks and not modifiers.

Definitions: Tiltless = all tricks 2+ ADD; Guiltless = 3+; Tripless = 4+; Fearless = 5+; Beastly = 6+; Godly = 7+; BOP = Butterfly / Osis / Paradox Mirage.

Rules: do not store glossary terms in `freestyle_tricks` or `freestyle_trick_modifiers`; prefer editorial markdown / static content first; only create a glossary DB table if there is a clear product need.

---

## 5. Sequence / Combo Layer

Sequence and combo analysis is future work (streaks, transitions, connector tricks, ADD density, run-quality labels). Do not treat records-based difficulty metrics as true combo metrics. Current safe proxy: the Freestyle Difficulty Index is a records-based ADD profile, not true combo/sequence analysis, which requires sequence-level data.

---

## 5b. Media Linkage Layer

Curated trick media (videos/images attached to tricks, players, events, records) and member-uploaded gallery content are **two parallel systems; never merge them.** Mixing breaks GOVERNANCE layer separation.

Do not build new curated media on the legacy `freestyle_media_*` tables; the unified `media_items` + `media_tags` + curated-sidecar + `SOURCE_TIER` model is authoritative, and the polymorphic media→entity edge is expressed as namespaced tag conventions. The **media pipeline, source registry, tutorial-tier classification, primary-promotion rules, reset-compatibility, and coverage dashboard are owned by the `footbag-curated-media` skill and detailed in `REFERENCE.md`.**

---

## 5c. Navigation Layer (trick detail page)

The trick detail page ships three navigation sections plus the family ladder, driven by the active dictionary alone. Helpers live in `src/services/freestyleRelatedTricks.ts`; all exclude `category='modifier'` and the current trick. Display order: **Related Tricks → Previous Tricks → Next Tricks → Trick Family ladder.** Helper internals (the buildRelatedTricks / buildNextTricks / buildPreviousTricks specifications) are in `REFERENCE.md`.

### Hashtag, trick name, and family navigation (load-bearing UX rule)

These surfaces have **different semantics**; do not collapse them:

- **Trick name** = display text only, never a link.
- **Hashtag** = media-gallery link. `#<slug>` links to `/media/browse?context=<slug>` when the trick has at least one media item, and renders as a plain non-clickable token otherwise; a clickable hashtag is the sole signal that media exists.
- **Trick Detail** = a distinct link beside the name that opens `/freestyle/tricks/<slug>`. Name, hashtag, and Trick Detail are three explicit controls; a click's destination is never guessed.
- **Family navigation** = a separate `family-badge` linking to `/freestyle/tricks?family={trick_family}`.

Forbidden: hashtags must NOT trigger family filtering; slug-prefix matching is NOT used for filtering (narrow on `trick_family` only); family selection must NOT be derived from a hashtag.

---

## 6. Canonical Competition Results Layer

Canonical results (events, disciplines, placements, participants, doubles partnerships, leaders) remain separate. Never write trick dictionary or glossary content into canonical competition tables.

---

## Source / Truth Rules

Priority: (1) expert-reviewed corrections from Red Husted; (2) curated project dictionary; (3) footbag.org as source/provenance; (4) scraped data as pending/unreviewed. footbag.org is an important source, but not automatic truth. When sources disagree: canonical field wins; preserve source disagreement in provenance; emit/report QC conflicts; do not silently overwrite.

---

## Red Husted Clarifications

Known Red-reviewed points: Atom Smasher = 4 ADD (X-Dex); Flurry = 4 ADD; Sidewalk / Tombstone should be added; Flail and Omelette are common names and should be added; Merkon is standalone; Terrage and Barrage are standalone and can also be used compositionally; Royale and Ripstein are primary entries; Eclipse is 3 ADD (hop-over portion counts); 1 ADD delay / body tricks should be included; Spyro is a trick, not a general modifier (name shifted toward Inspin); Surging = spinning + stepping; Pogo is a set and does not add ADD; Quantum is modern naming replacing older "toe" naming; Gyro = spinning and dexing with the same foot that set the bag; Atomic can be modeled as a standard modifier.

---

## Activation / Review Rules

A trick row is active only when: ADD value is known (if a trick); canonical name is accepted; ambiguity is resolved; source/provenance is preserved; `review_status` is `curated` or `expert_reviewed`. Pending rows keep `is_active=0`, preserve source links, include review notes, and do not surface publicly.

### Public-surface invariant

All public queries on `freestyle_tricks` MUST filter `is_active = 1`. Enforced in `src/db/db.ts` (`freestyleTricks.listAll`, `getBySlug`, `listByFamily`) and covered by regression tests. When adding a new public query, copy the pattern. When adding an admin-only surface, use a separate prepared statement without the filter; do not relax the existing filter.

### Modifier rows are not tricks

`freestyle_tricks` rows with `category='modifier'` (paradox, gyro, barraging, blazing) are excluded from public category groupings; they exist only as FK targets for `freestyle_trick_modifier_links`. The proper rules table for modifier ADD bonuses is `freestyle_trick_modifiers`; do not derive modifier ADD math from `freestyle_tricks` rows.

**The Modifier Reference does not render on the trick pages** (neither the trick dictionary index `tricks.hbs` nor the trick detail `trick-shell.hbs` carries a Modifier Reference section — editorial decision). The reference table renders on `/freestyle/glossary` (the `freestyle-modifier-reference` partial). Do not add it to the trick pages without explicit human approval. Public modifier editorial content belongs on `/freestyle/glossary` only, in plain language.

---

## Implementation Rules

Before changing schema or loading data: (1) classify the concept layer; (2) check whether it is a trick, modifier, alias, glossary term, or future sequence concept; (3) preserve provenance; (4) avoid UI changes unless explicitly requested; (5) avoid mass-importing scraped rows without review; (6) keep changes additive and reversible.

---

## Product Goal

Build a freestyle reference better than footbag.org by combining complete dictionary coverage, aliases and historical naming, expert validation, provenance, relationships, records, player links, and future combo analytics. Do not copy footbag.org text wholesale: extract concepts, rewrite clearly, attribute generously, and connect the data.
