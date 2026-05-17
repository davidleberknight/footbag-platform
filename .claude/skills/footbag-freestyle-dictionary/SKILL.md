---
name: footbag-freestyle-dictionary
description: Use when adding, modifying, reviewing, or classifying freestyle trick / dictionary / glossary / modifier / alias / sequence data in the footbag-platform project. Enforces strict layer separation between trick dictionary, modifiers, aliases, glossary, sequence/combo analysis, and canonical competition results.
---

# Footbag Freestyle Dictionary Skill

Use this skill when adding, modifying, reviewing, or classifying freestyle trick / dictionary / glossary / sequence data in the footbag-platform project.

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

## Foundational doctrine

The four sections below (A–D) sit ABOVE the implementation layer rules. They are not optional patterns. They are durable architectural invariants that hold across every freestyle slice, regardless of which data table or template is under edit. Implementation details (sections 1–6 further down) refine these doctrines; they never override them.

### A. Four-layer ontology separation

The Core Rule above describes DATA layers (which table, which file). This section describes ONTOLOGY layers (which kind of meaning). Both apply simultaneously.

| Ontology layer | Meaning | Example surface |
|---|---|---|
| **Canonical names** | Official trick naming. The community labels. | `freestyle_tricks.canonical_name`, dictionary card titles, family slugs |
| **Symbolic decomposition** | Structural tokenization. Operators + bases + side-positionals composed into formulas. | `tokenizedEquivalences`, semantic notation tokens, `≡` readings |
| **Glossary pedagogy** | Educational explanation. Coach-tone primer prose, modifier-feel cards, definitions. | `/freestyle/glossary`, §6 modifier feel cards, §3 dex direction prose |
| **Embodied movement analogy** | Descriptive movement relationships. How body parts move; movement neighborhoods; feel. | Glossary feel-card "feel" + "intuition" fields, future movement-archetype layer |

**Rules:**

- **Layers MAY link.** A symbolic token may carry an anchor to its glossary entry. A glossary modifier card may deep-link to tricks using that modifier. Cross-layer NAVIGATION is encouraged.
- **Layers MUST NOT collapse.** Never put coach-tone prose into a token's text field. Never derive an embodied-movement description from a symbolic formula. Never canonicalize a pedagogical synonym.
- **Observational topology ≠ canonical ontology.** A trick's appearance in an observational grouping (e.g., "midtime body modifiers") is supplementary; it never reshapes the canonical family classification in `freestyle_tricks.trick_family`.

This is now one of the core architectural invariants of the entire project. When in doubt about where a piece of content belongs: identify which layer it serves, store it on that layer's surface, and link from other layers as needed.

### B. Current strategic posture (post-Slice-W, 2026-05-17)

Through Slices L1–W the freestyle dictionary reached a **legitimate pre-Red stabilization checkpoint**. The Stabilization Review (`exploration/comparative-reconciliation-2026-05/STABILIZATION_REVIEW.md`) concluded **Option C** — pause automated work; conduct live-human review while Red Wave 2 is in flight.

- **No remaining pre-Red blockers.** 9-dimension holistic assessment scored 6 Strong + 3 Good + 1 Adequate; zero Weak or Failing. Every concern is either Wave 2-blocked, curator-paced triage, audit-deferred, or already shipped.
- **Branch-family ontology is now durable.** `FAMILY_DUAL_MEMBERSHIPS` (Slice M) handles additive multi-membership (torque/blender/drifter in lineage family AND own branch). `RETIRED_FAMILIES` (Slice M) hides browse-surface families without DB changes (clipper-stall). `UNRESOLVED_COMPOUNDS` (Slice M; pilot of 7 post Pre-Red tomahawk removal) honestly flags folk-derived rows with `pendingDecomposition` pill. `MODIFIER_COMPOSITION_GLOSSES` (Slices M+N) supplies 6-modifier pilot pedagogical glosses on Movement System view. All curator-authored TypeScript content modules; zero SQL.
- **Movement System view shipped** (Slices L1/L2). 4 curator-confirmed axes (Set/Uptime; Entry Topologies; Midtime Body; No-Plant & Suspension); 11 pilot modifiers. Renders via canonical `dictionary-trick-card` partial in registry density. Empty axes prune.
- **Symbolic-first / op-notation-fallback precedence reinforced.** Chain registry at 71 entries post Slices N + Pre-Red sweep; 51% of cards on `/freestyle/tricks` render chain readings, 18% fall through to op-notation fallback (muted), 31% have neither (base tricks; pending DB rebuild for Pre-Red stall additions).
- **Comparative-reconciliation arc complete** (Slices O–S). Five research outputs at `exploration/comparative-reconciliation-2026-05/` queue curator triage: branch-family candidates (Slice O: barfly + borderline double-leg-over); chain-external alignment (Slice P: 94 rows; 28 N+1 chain candidates); ADD-divergence reclassification (Slice Q: 277 rows); missing-move triage (Slice R: 191 rows); embodied-analogy notes (Slice S: observational only).
- **Audit slices V + W shipped.** Slice V fixed a real mobile-grid bug (`.dict-card-equivalence--inline` + `.dict-card-notation--inline` now carry `grid-area: reading` at ≤520px). Slice W softened trick-detail Notation + Equivalent-readings prose to remove implementation-flavored language; the hybrid review then found and fixed a missed section-intro. Diagnostic-details admin-gating decision remains a Wave 2-adjacent curator decision.
- **Avoid ontology over-hardening.** Premature SQL freezes, rigid taxonomy commitments, and "final" canonical structures are still the primary risk — bigger than missing content. The Slice M dual-membership pattern is the model for any future taxonomy-shaped work.
- **Reversible TS governance preferred.** Curator content lives in TypeScript content modules (allow-lists, chain registries, kind overrides, dual-membership maps, retirement sets, composition glosses, unresolved-compound pilot). Schema migrations come AFTER Wave-2 + curator triage stabilize the ontology — never before.
- **Batch 5 (symbolic / topology visuals) remains paused.** Do not resume until live-human review complete + Wave-2 Red answers integrated.
- **Observational surfaces remain explicit.** Connective panels, movement-neighborhood groups (renamed from "topology" in the stabilization slice), dex archetypes, feel cards, embodied-analogy notes — all carry explicit "observational" labels and do not collapse into canonical layers.
- **Parser aesthetics forbidden.** No AST views, no token soup, no interaction-heavy symbolic UI on public surfaces. The structural-decomposition panel stays collapsed-by-default behind `<details>`. Restraint remains the principal design constraint.

**What to do next (when starting freestyle work):**

  1. Check whether the curator has triaged Slices O–R queues or whether Red Wave 2 answers have arrived. If neither: do not initiate new automated work; consult [[project_freestyle_post_slice_e_posture]] for the queued post-Red follow-up list.
  2. If Wave 2 answers have landed: integrate per the queued post-Red follow-up slices.
  3. If the curator has flagged a specific surface in human review: address that surface only; do not expand scope.

See [[project_freestyle_post_slice_e_posture]] for the full updated sequencing recommendation, deferred-doctrine list, and post-Red follow-up queue.

### C. Family / topology caution

The Red side-question consultation surfaced that movement relationships involve multiple overlapping axes — symbolic structure, modifier lineage, dex archetypes, embodied feel, timing/body-path topology, catch/surface relationships. These do not collapse cleanly into one classification.

Explicit warnings:

- **`family` ≠ `topology`.** A `trick_family` value names the structural anchor (whirl, butterfly, mirage). A topology group is an observational grouping by movement mechanic (midtime body modifiers, ducking/diving family). Same trick, different lenses; do not unify them.
- **`family` ≠ catch surface.** Clipper-as-surface and clipper-as-family are not the same concept; many unrelated tricks land on clipper without belonging to a "clipper family." Treat surfaces as their own facet.
- **Multi-axis movement relationships exist.** A trick can be primary-family `legover` AND secondary-related to `mirage` (via `miraging legover` reading). A trick can appear in multiple topology groups. Single-value `trick_family` columns express ONE axis; do not pretend they express all of them.
- **Descriptive shorthand ≠ canonical decomposition.** Coach-tone descriptions ("body drops under the bag") are pedagogical content; they are NOT structural decomposition (`pixie ducking butterfly`). Keep them on separate layers (see doctrine A).
- **Embodied analogies are pedagogical, not canonical.** Movement-feel cards describe how a trick feels in the body. They are teaching material; they never freeze into canon. Future curator iteration should be expected.

When a slice proposal collapses any of these distinctions, **stop and surface the conflict to the curator** before writing code.

### D. Symbolic restraint doctrine

Symbolic-surface design has firm constraints. These hold across every public template, partial, and view.

- **No token soup.** Tokens render only on surfaces that explicitly carry symbolic-decomposition content (trick cards, glossary §7, compression flow). Other surfaces stay prose.
- **No AST / parser visuals.** No tree views, no parser-style decomposition trees, no interactive symbolic editors on public pages.
- **No interaction-heavy symbolic UI.** Token hover affordances are restrained (underline-on-hover, no popovers, no rich tooltips). No drag, no expand-on-click, no animation.
- **No visual overload.** The 4-color budget (core-family green / modifier olive / side-positional neutral / unknown inherit) holds. Do not introduce additional role colors without curator approval.
- **Replace, don't add.** When refining a symbolic surface, prefer replacing an existing element over stacking a new one. Visual density is already at the ceiling.
- **Chips localized to symbolic surfaces only.** ADD chips, formula chips, glyph chips render on dictionary / glossary symbolic surfaces. Do not propagate them to event pages, records, member surfaces, or competition tables.

When a slice proposes a new symbolic-surface affordance, evaluate against these six constraints first. If the affordance violates any, propose a restraint-preserving alternative before implementing.

---

## 1. Trick Dictionary Layer

Use `freestyle_tricks` only for actual physical moves.

Examples:

- butterfly
- whirl
- ripwalk
- vortex
- atom smasher
- flurry

A trick should generally have:

- canonical name
- slug
- ADD value
- category / family
- description
- source / provenance
- review status

Do not store glossary terms here.

### Canonical vs compositional row rule

A trick deserves its own row in `freestyle_tricks` only when at least one of:

1. **Named identity persistence.** The name is used independently of its decomposition (e.g. `dyno`, `paradon`, `bigwalk`, `surreal` — each known by community name in competition / tutorials, not as "spinning stepping butterfly").
2. **Not losslessly decomposable.** Base + modifiers do not fully describe it. If they do, model via `modifier_links` on a compound row instead of creating a new canonical.
3. **Historical / competitive significance.** Appears in competition results, widely-recognized tutorials, or community canonical lists. Records-only appearance is weak signal; competition / TT lesson / Red's curated set is strong signal.
4. **Structural ambiguity resolver.** Multiple valid decompositions exist for the same physical move; the name is the canonical anchor that resolves the ambiguity.
5. **Alias collapse check.** Before creating a new row, check whether the name maps to an existing canonical slug. If so, it's an alias on the existing row, NOT a new row.

Do NOT create canonical rows for:

- **Pure modifier chains** (e.g. `spinning paradox mirage`). Model via `modifier_links` on the base or on an existing compound canonical such as `paradox-mirage`.
- **Surface-only variants** (e.g. `kick` vs `stall` for the same motion). Pick one canonical surface; the other is alias-only.
- **Direction-only variants** — unless direction is globally structural per the "Direction is structural" rule below, in which case the reversed form is its own canonical.
- **Combinatorial expansions.** Every (modifier × base) tuple does NOT deserve a row. Only the named / significant subset does.

### Direction is structural

Direction changes create new canonical tricks. A direction-reversed movement is its own dictionary entry, not the same trick with a qualifier.

Examples (Red-confirmed):

- mirage ≠ illusion
- spinning ≠ inspinning
- ATW ≠ reverse ATW

If two moves differ in spin / dex / movement direction, they get separate dictionary entries even when their structural skeleton is otherwise identical.

Within-trick CW/CCW or in/out execution variants stay in one canonical row when the community treats them as the same trick. The canonical notation captures the dominant or both-allowed forms (e.g. `around-the-world` notation `TOE > SAME IN/OUT [DEX] > SAME TOE [DEL]`).

### Stall ontology rule (Red pt5 clarification)

Stalls — toe-stall, inside-stall, clipper-stall, osis, and similar delay surfaces — are **common anchor positions** used in many tricks. This is descriptive, not prescriptive. Red pt5's "base set of tricks such as toe stall, inside stall, clipper stall, and osis" comment names specific frequent anchors; it does not generalize to a universal rule.

The ontology must also support:

- **Non-stall tricks**: kick-based moves (`flying-clipper`, `dragonfly-kick`), surface-less compounds (`double-knee`), dexterity-only sequences with no stall anchor.
- **Body tricks**: `spin`, `double-spin`, `hop-over`, `walk-over`, `flying-inside`, `flying-outside`, `spyro` — pure body motion primitives.
- **Sets**: `pixie`, `fairy`, `atomic`, `quantum` — bag-launch primitives that precede a trick rather than serving as a stall anchor.
- **Modifiers**: `paradox`, `ducking`, `symposium`, etc. — applied on top of any base, stall-or-not.
- **Standalone compounds without explicit stall base**: `drifter`, `ripwalk`, `butterfly`, etc. — the structural skeleton may include stall delays internally but the canonical row stands on its own.

Do NOT force tricks into stall-based decomposition during classification or QC. When a trick's base is unclear, defer rather than invent a stall ancestor.

### Jobs notation is the structural backbone

Trick names are labels; Jobs notation describes the actual movement. Store as opaque text in `freestyle_tricks.notation`. Do not parse, do not regenerate. Mismatches between description and notation are flagged in QC, never silently rewritten.

When canonical notation is blank and footbag.org has notation, promote it onto canonical (script 20 does this automatically). When canonical and footbag.org disagree on notation, preserve the disagreement in `freestyle_trick_source_links.asserted_notation`; never silently overwrite.

### Description policy

Public-facing trick descriptions are neutral and instructional. No reviewer names ("per Red", "by X", "confirmed by", "Husted"), no internal modifier shorthand ("= 4 ADD", "barraging legover"), no provenance attribution. Reviewer / expert provenance lives in `freestyle_trick_source_links.notes`, source-registry rows, or QC reports — not in `description`.

When ADD math is referenced in a description, it must agree with the row's `adds` value or be removed. Self-contradictions (description says "= 3 ADD" while `adds=4`) are HIGH-severity QC failures.

Aliases never appear in the description text. Aliases live in the row's `aliases` column or in `trick_aliases.csv`. Mentioning an alias in the description (e.g. `"atomic butterfly = leg beater = 4 ADD"`) is a policy violation — strip on sight.

#### Established description templates (Phases 1-3, 2026-04-30)

The active dictionary descriptions follow these templates. Apply the same templates when adding new active rows or normalizing future ones:

- **Compound = modifier + base:** `"{Modifier}-modified {base}."` — e.g. `Paradox-modified torque.`, `Blurry-modified mirage.`, `Whirl-modified osis.`
- **Multi-modifier compound:** nest by treating the innermost named compound as the base — `"{Outer}-modified {Inner} {base}."` — e.g. `Paradox-modified symposium whirl.` (= paradox + symposium-whirl), `Ducking-modified paradox whirl.` (= ducking + paradox-whirl), `Paradox-modified barraging mirage.` (= paradox + barraging-mirage).
- **Modifier noun-form rule:** when a modifier shares its name with a trick (mirage, whirl, swirl), drop the gerund `-ing` for descriptions: `miraging→mirage`, `whirling→whirl`. Other gerund modifiers stay as-is (`Ducking-`, `Spinning-`, `Stepping-`, `Tapping-`, `Barraging-`, `Symposium-`).
- **Stalls / delay surfaces:** `"X-based delay surface."` — e.g. `Toe-based delay surface.`, `Heel-based delay surface.`, `Outside-of-foot delay surface.`
- **Body primitives:** short mechanical motion sentence — e.g. `Inside-leg jumping motion.`, `Jumping leg-over motion.`, `Double rotational body spin.`, `Inward rotational body move.`
- **Base tricks (irreducible):** terse mechanical sentence — e.g. `Cross-body inside delay.` (clipper), `Rotational dexterity move.` (whirl), `Inside-to-outside delay combination.` (osis).
- **Sentence form:** capitalized first word, terminating period. One sentence.

#### Write surfaces for active descriptions

The active dictionary descriptions live in two CSVs, both loaded into `freestyle_tricks.description`:

- `legacy_data/inputs/noise/tricks.csv` — canonical baseline, loaded by `event_results/scripts/17_load_trick_dictionary.py`. Holds most active tricks. Rows with notes containing commas must be CSV-quoted.
- `legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv` — Red Husted overlays, loaded by `event_results/scripts/19_load_red_additions.py`. Holds body primitives (`flying-inside`, `flying-outside`, `hop-over`, `walk-over`, `double-spin`, `spyro`), set primitives (`toe-stall`, `heel-stall`, `outside-stall`), and a handful of compounds (`sidewalk`, `tombstone`, `fury`, `vortex`, `surging`).

**Never write descriptions directly to `database/footbag.db`** — `scripts/reset-local-db.sh` wipes them on next reload. Edit the canonical CSV; verify by running script 17 (and 19 if applicable) against a fresh schema-only temp DB before claiming the change is durable.

---

## 2. Modifier Layer

Use the modifier system for structural components that alter tricks.

Examples:

- atomic
- paradox
- gyro
- spinning
- stepping
- symposium
- pogo

Important:

- Some modifiers add ADDs.
- Some do not. Example: Red clarified that Pogo is a set but does not add ADD.
- Some concepts can exist both as a trick and a modifier form. Example: Barrage can be a standalone trick, while barraging can modify another trick.

Do not enforce ADD math globally unless expert-reviewed.

### Surging modeling rule

`surging` is NOT a primitive modifier. Always decompose:

    surging = spinning + stepping

Apply this rule everywhere `surging` appears in a trick name or composition:

- **Modifier table:** do NOT add a `surging` row to `freestyle_trick_modifiers`. Only `spinning` and `stepping` belong there.
- **Compound rows:** when a trick is named "Surging X" (e.g. `bigwalk`, `surge`, `surreal`, `surgery`, `venom`), set `modifier_links=spinning|stepping|...` on the compound row. The "surging X" form lives in the `aliases` column.
- **Description templates:** "Surging-modified {base}" is acceptable prose shorthand, but the structural decomposition (spinning + stepping) must appear in the row's note field for ADD-math validation.
- **The `surging` row in the dictionary** remains a standalone compound (`spinning + stepping = 2 ADD`, no base trick); it is NOT a modifier. This preserves the named-trick identity while keeping the modifier table strict.

---

## 3. Alias / Naming Layer

Use aliases for naming evolution, abbreviations, and alternate terms.

Examples:

- Toe Blur → Stepping Paradox Mirage (per James pt10 adjudication 2026-05-10; supersedes the earlier Red pt2 "Quantum Mirage" reading which gave 3 ADD vs asserted 4 — see pt10 candidate-core resolution)
- Toe Ripwalk → Quantum Butterfly
- Spyro → Inspin
- PS Whirl → Paradox Symposium Whirl

Rules:

- Modern community name should generally be canonical.
- Older names become historical aliases.
- Descriptive names can be aliases for named tricks.
- Do not merge identities silently when terminology is ambiguous.

---

## 4. Glossary / Terminology Layer

Glossary terms describe runs, style, scoring concepts, or community vocabulary.

They are not tricks and not modifiers.

Examples:

- guiltless
- tiltless
- fearless
- tripless
- beastly
- godly
- BOP
- dropless
- shuffle
- density
- shred circle

Important definitions:

- Tiltless = run where all tricks are 2+ ADD
- Guiltless = run where all tricks are 3+ ADD
- Tripless = run where all tricks are 4+ ADD
- Fearless = run where all tricks are 5+ ADD
- Beastly = run where all tricks are 6+ ADD
- Godly = run where all tricks are 7+ ADD
- BOP = Butterfly / Osis / Paradox Mirage

Rules:

- Do not store glossary terms in `freestyle_tricks`.
- Do not store glossary terms in `freestyle_trick_modifiers`.
- Prefer editorial markdown / static content first.
- Only create a glossary DB table if there is a clear product need.

---

## 5. Sequence / Combo Layer

Sequence and combo analysis is future work.

This layer describes how tricks are used in runs:

- streaks
- transitions
- connector tricks
- ADD density
- longest 5+ ADD streaks
- run quality labels

Do not treat records-based difficulty metrics as true combo metrics.

Current safe proxy:

- Freestyle Difficulty Index = records-based ADD profile
- It is not true combo / sequence analysis.

True combo analysis requires sequence-level data.

---

## 5b. Media Linkage Layer

Curated reference media (videos and images) attached to tricks, players, events, and records lives in three tables: `freestyle_media_sources`, `freestyle_media_assets`, `freestyle_media_links`. Member-uploaded gallery content (`media_items`, `media_flags`, `media_tags`) is a separate, parallel system — never merge the two.

Rules:

- **Curated trick media stays separate from member `media_items`.** Two parallel layers, never merged. Mixing breaks GOVERNANCE layer separation.

- **`end_seconds` is load-bearing for multi-trick media sources.** May be NULL on simple full-asset clips, but is the only mechanism by which one source asset (TT1/TT2 DVD, multi-section tutorial, slow-mo extract) spawns many distinct clip-links. Snippet timing lives on `freestyle_media_links`, never a separate segments table. Never drop the column.

- **Trick-primary clip logic is provisional.** The partial unique index `(entity_type, entity_id) WHERE is_primary=1` enforces one primary per entity. Current generator picks primary by record `value_numeric` desc, tiebreak by `media_id` asc — biased toward record clips over tutorials. Will need refinement when tutorial / slow-mo / demo clips arrive in volume. Do not solve speculatively.

- **Verify external URLs before reviewer sign-off.** Extrapolated URLs sit in staging with `reviewer` blank; they must be HTTP-confirmed before promotion. Pattern-form-from-a-working-URL is a guess, not verification.

- **Two-lane staging model.** `legacy_data/tools/trick_video_discovery/video_coverage.csv` is the record-clip lane. `legacy_data/tools/trick_video_discovery/snippet_candidates.csv` is the trick-tutorial lane. Generator filters on `reviewed=YES` and `reviewer != ''` respectively; nothing else promotes.

- **`clip_type` is staging-only.** Values `tutorial / demo / record / slow_mo / compilation`. Drives reviewer triage and primary-policy biasing. Not persisted to DB.

### Source URL patterns (verified)

- **FootbagSpot tutorials**: `https://footbagspot.com/tutorials/v/{hash-or-slug}` for individual videos. `/tutorials/{category}` for category landing pages. Speculative `/tutorials/{slug}` URLs all 404 — do not extrapolate.

- **YouTube oembed verification**: `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={id}&format=json` returns title + author_name in JSON; HTTP 400 if id is malformed (YouTube IDs are exactly 11 chars; 12-char inputs are typos). Use this to confirm any new YouTube URL before append.

- **WorldFootbag channel inventory recipe**: `yt-dlp --flat-playlist --dump-json https://www.youtube.com/@WorldFootbag/videos` is the authoritative way to enumerate the Tricks-of-the-Trade lesson series (42 lessons #1-#42, no gaps). See memory `reference_worldfootbag_channel.md`. Google web search returns ~10-15 of the 42 only.

### Source registry (`media_sources.csv`) and tutorial-tier classification

The `tutorial-tier` set in `legacy_data/event_results/scripts/24_qc_freestyle_media_coverage.py` `TUTORIAL_SOURCES` is load-bearing for the coverage dashboard: a primary link counts as `STRONG_TUTORIAL` only if its `source_id` is in this set. Update both `media_sources.csv` and the script's set when registering a new trusted-tutorial source.

Currently registered (2026-05-03): `anz_trikz`, `tt_youtube`, `footbagspot_passback`, `footbagspot_tutorials`, `shred_global`, `footbag_foundations`, `polini_pointers`, `everything_footbag`, `flipsider_footbag`, `footbag_finland`. Record / performance source: `passback_records` (classified `WEAK_RECORD`).

Source priority for primary selection:
1. AnzTrikz single/double-trick tutorial (`anz_trikz`)
2. TT / Tricks of the Trade single-trick lesson (`tt_youtube`)
3. PassBack tutorial (`footbagspot_passback`)
4. Other verified tutorial source (`footbagspot_tutorials`, `polini_pointers`, `footbag_foundations`, `everything_footbag`)
5. Demonstration-tier source (`shred_global`, `flipsider_footbag`, `footbag_finland`) — single-trick demos; no teaching breakdown. Per Phase 2b 2026-05-10, `shred_global` moved from tutorial-tier to demo-tier; SOURCE_TIER in `freestyleService.ts` is the load-bearing classification.
6. Record / performance clip (`passback_records`) — never primary if a tutorial alternative exists

### Primary-promotion rules (load-bearing — applied before every media-link write)

A media row may be promoted to `is_primary=1` only if all five hold:

1. The target trick is **active** (`is_active=1`).
2. The video clearly teaches or demonstrates that specific trick.
3. The source is in the `TUTORIAL_SOURCES` tier above.
4. The current primary is missing OR is a record / demo / performance clip.
5. Promotion creates no duplicate primary (partial unique index enforces, but plan around it).

Do NOT promote if:
- Target trick is pending (`is_active=0`); use `is_primary=0` only.
- Video is a montage, drill, record, or shred run.
- Title is generic (e.g., "Double Dexes" — does not name a specific trick).
- Target trick is not explicitly central to the video.
- Current primary is already a strong tutorial.

Multi-trick tutorials: promote only when each target trick is **explicitly named in the title** (e.g., "Mirage & Illusion" → primary for both; "Pixie & Fairy" → primary for both; "DLO & Eggbeater" → primary for both). Generic titles like "Double Dexes" stay secondary regardless of source.

### Reset-compatibility classification (HOLD / STAGED / SAFE)

Before appending any `media_links.csv` row, classify the target slug against a fresh-reset load (scripts 17 + 19 + 21-media + 22 + 23 — note `script 21_load_footbag_org_pending_tricks.py` is **not** in `reset-local-db.sh`):

- **SAFE**: target slug active in `freestyle_tricks` after reset (loaded via 17 or 19). Append immediately; primary or secondary per the promotion rules.
- **STAGED**: target slug exists as pending after reset (`is_active=0`). Append only with `is_primary=0`; loader allows pending links; public UI hides via the `is_active=1` filter on `freestyleTricks.listAll/getBySlug/listByFamily`.
- **HOLD**: target slug does NOT exist after reset. Do NOT append yet. First add the canonical row to `red_additions_2026_04_20.csv` (or `tricks.csv` for curated baseline) so it loads via 17/19; only then is the link SAFE or STAGED.

The 193 footbag.org pending rows (loaded historically by `21_load_footbag_org_pending_tricks.py`) survive in live prod DB but vanish on any reset. Do not assume their slugs exist; check via the dashboard.

### Coverage dashboard

`legacy_data/event_results/scripts/24_qc_freestyle_media_coverage.py` — read-only dashboard generator. Default mode builds a fresh schema-only temp DB and runs the reset-compatible loader chain; `--db <path>` runs against an existing DB. Outputs `legacy_data/reports/freestyle_media_coverage.csv` (one row per `freestyle_tricks` slug; 17 columns including `primary_strength`, `status`, `priority_bucket`) and a markdown summary on stdout.

Four validation checks (non-zero exit if any fail) — run before every media commit:
1. No duplicate primary per `(entity_type='trick', entity_id)`.
2. No `media_links.entity_id` points to a missing trick slug after reset (catches orphans from HOLD-tier targets).
3. Pending tricks with media all have `is_primary=0`.
4. Report row count == `freestyle_tricks` total.

Status values: `ACTIVE_STRONG_PRIMARY`, `ACTIVE_WEAK_PRIMARY`, `ACTIVE_NO_PRIMARY`, `PENDING_WITH_MEDIA`, `PENDING_NO_MEDIA`. Priority buckets: `COMPLETE`, `CORE_GAP` (core trick with no primary), `WEAK_CORE` (core with record-only), `PENDING_REVIEW`, `LOW_PRIORITY`. Core-trick set is a load-bearing constant in the script; update there when the editorial definition shifts.

---

## 5c. Navigation Layer (trick detail page)

The trick detail page (`/freestyle/tricks/:slug`) ships three navigation sections plus the family ladder, all driven by the active dictionary alone (no new tables, no new queries — the helpers run against the in-memory `allDictRows` already loaded for composition shaping).

Helpers live in `src/services/freestyleRelatedTricks.ts`. All three exclude `category='modifier'` and the current trick. Display order on the page: **Related Tricks → Previous Tricks → Next Tricks → Trick Family ladder.**

### Hashtag identity vs. family navigation (load-bearing UX rule)

Two visually-similar surfaces have **different semantics**. Do not collapse them:

- **Hashtag** = identity link. `#spinningwhirl` always links to `/freestyle/tricks/spinning-whirl` (its own detail page). Each trick has a unique hashtag derived from its slug via `slugToHashtag(slug)` in `freestyleRecordShaping.ts` (`'#' + slug.replace(/-/g, '')`).
- **Family navigation** = separate UI element. A small `family-badge` in the trick-detail hero links to `/freestyle/tricks?family={trick_family}`. Family-card titles on the dictionary index also link there. The filter pill at the top of a filtered index includes a clear-filter link.

Forbidden:
- Hashtags must NOT trigger family filtering.
- Slug-prefix matching for filtering (e.g. "tricks starting with `paradox-`") is NOT used. Filter narrows on `trick_family` only.
- Family selection must NOT be derived from a hashtag.

### `buildRelatedTricks` — broad navigation, cap = 8

Three rules in priority order. Within each rule's candidate set, ADD-bucket round-robin sampling (slug ASC tiebreak) ensures a low/mid/high mix; display order is concatenation R1 picks → R2 picks → R3 picks.

- **R1 same-family**: `trick_family = current.trick_family`. Strongest relationship.
- **R2 modifier-prefix**: slug starts with `{first-hyphen-segment}-` AND `trick_family != current.trick_family`. Yields nothing for single-segment slugs (base tricks). Captures cross-family modifier siblings (e.g. `paradox-mirage` ↔ `paradox-torque`).
- **R3 grandparent**: `current.base_trick → that row's base_trick → if active, non-modifier, family differs → include`. Gated: fires only when **R1 + R2 < 6** and the candidate is not already included. Yields at most 1 result. Captures structural ancestors (e.g. `atomic-torque → torque → osis`).

### `buildNextTricks` — family-scoped progression by ADD, cap = 5

Strict same-family. `adds > current.adds`. Group by ADD, slug ASC within bucket, **take ≤2 per bucket**, flatten ASC. The per-bucket cap is load-bearing — without it, a heavily-populated 4-ADD bucket (whirl family has five) would fill the cap and bury 5+ ADD tiers entirely. With per-bucket-2, `spinning-symposium-whirl` (6 ADD) stays visible.

**Cross-family progression is intentionally out of scope.** ADD comparisons across families would imply real-world difficulty equivalence we cannot guarantee. Cross-family exploration belongs in `buildRelatedTricks`.

### `buildPreviousTricks` — family-scoped regression by ADD, cap = 5

Mirror of Next Tricks. `adds < current.adds`. Same per-bucket-2 sampling, but flattened **DESC** (closest easier first).

**Family-base tiebreaker** (only on Previous Tricks): within each bucket, the row whose `slug == current.trick_family` is sorted first, then alphabetical for the rest. This guarantees foundational base tricks like `whirl` surface in their compounds' Previous Tricks lists. Without it, `spinning-whirl`'s 3-ADD bucket would alphabetically yield `rev-up, rev-whirl` and bury `whirl` (the family base, also 3 ADD) entirely.

The tiebreaker is intentionally **not** applied to Next Tricks — base tricks have the lowest ADD in their family by definition and are never eligible as "next" candidates.

### Adding a new navigation surface

Default to extending `freestyleRelatedTricks.ts` rather than spawning new files. The existing helpers share a common shape (filter → bucket-by-ADD → sort within bucket → flatten with cap) and live well together.

When in doubt about scope:
- "What's structurally similar to this trick?" → Related Tricks (rule extension).
- "What's a harder trick in the same family?" → Next Tricks.
- "What's an easier trick in the same family?" → Previous Tricks.
- "Show me all whirl tricks in one place" → family filter on `/freestyle/tricks?family=`.

---

## 6. Canonical Competition Results Layer

Canonical results remain separate.

Use canonical results for:

- events
- disciplines
- placements
- participants
- freestyle doubles partnerships
- competition leaders

Never write trick dictionary or glossary content into canonical competition tables.

---

## Source / Truth Rules

Use this priority:

1. Expert-reviewed corrections from Red Husted
2. Curated project dictionary
3. footbag.org as source / provenance
4. scraped data as pending / unreviewed

footbag.org is an important source, but not automatic truth.

When sources disagree:

- canonical field wins
- preserve source disagreement in provenance
- emit / report QC conflicts
- do not silently overwrite

---

## Red Husted Clarifications

Known Red-reviewed points:

- Atom Smasher = 4 ADD due to X-Dex
- Flurry = 4 ADD
- Sidewalk should be added
- Tombstone should be added
- Flail and Omelette are common names and should be added
- Merkon is standalone
- Terrage and Barrage are standalone and can also be used compositionally
- Royale and Ripstein are primary / popular entries
- Eclipse is 3 ADD; hop-over portion counts
- 1 ADD delay / body tricks should be included
- Spyro is a trick, not a general modifier concept; name has largely shifted toward Inspin
- Surging = spinning + stepping
- Pogo is a set and does not add ADD
- Quantum is modern naming replacing older "toe" naming
- Gyro = spinning and dexing with the same foot that set the bag
- Atomic can be modeled as a standard modifier

---

## Activation / Review Rules

A trick row should be active only when:

- ADD value is known, if it is a trick
- canonical name is accepted
- ambiguity is resolved
- source / provenance is preserved
- `review_status` is `curated` or `expert_reviewed`

Pending rows:

- keep `is_active=0`
- preserve source links
- include review notes
- do not surface publicly

### Public-surface invariant

All public queries on `freestyle_tricks` MUST filter `is_active = 1`. This is enforced in `src/db/db.ts` (`freestyleTricks.listAll`, `getBySlug`, `listByFamily`) and covered by regression tests in `tests/integration/freestyle.tricks-insights.routes.test.ts` ("pending row visibility" describe block).

When adding a new public query against the table, copy the pattern. When adding a new public surface (e.g. an admin-only review page), use a separate prepared statement that does NOT have the filter. Do not relax the existing filter to support a new caller.

### Modifier rows are not tricks

`freestyle_tricks` rows with `category='modifier'` (e.g. `paradox`, `gyro`, `barraging`, `blazing`) are excluded from the public category groupings on `/freestyle/tricks`. The historical reason `freestyle_tricks` carries modifier-category rows is composition — they're FK targets for `freestyle_trick_modifier_links`. They stay in the table; they just don't render as tricks.

The proper rules table for modifier ADD bonuses is `freestyle_trick_modifiers` (modifier_name, add_bonus, add_bonus_rotational, modifier_type). Do not derive modifier ADD math from `freestyle_tricks` rows; use this table.

**Modifier Reference rendering is currently disabled on the public surface.** The `/freestyle/tricks` template's "Modifier Reference" section is wrapped in a Handlebars block comment (editorial decision: advanced/internal, conflicts with the public glossary, pending/uncertain content weakens presentation). The service still shapes `content.modifiers` for future reuse, and the markup is preserved as inline reference. Do not re-enable the section without explicit human approval. See memory entry `feedback_modifier_public_visibility.md` for the load-bearing context. Modifier-related editorial content for the public belongs on `/freestyle/glossary` only and must stay plain-language.

---

## Implementation Rules

Before changing schema or loading data:

1. Classify the concept layer.
2. Check whether it is a trick, modifier, alias, glossary term, or future sequence concept.
3. Preserve provenance.
4. Avoid UI changes unless explicitly requested.
5. Avoid mass-importing scraped rows without review.
6. Keep changes additive and reversible.

---

## Product Goal

Build a freestyle reference better than footbag.org by combining:

- complete dictionary coverage
- aliases and historical naming
- expert validation
- provenance
- relationships
- records
- player links
- future combo analytics

Do not copy footbag.org text wholesale. Extract concepts, rewrite clearly, attribute generously, and connect the data.
