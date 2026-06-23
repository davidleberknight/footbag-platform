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

### B. Current strategic posture (post 2026-06-05/06 clean-Tier-1 exhaustion)

**2026-06-05/06 promotion arc + clean-Tier-1-runway EXHAUSTION (supersedes the promotion-state notes below; memory [[project_fm_promotion_arc]]).** Five curator definitions SETTLED — `whirling` = "uptime whirl" (chassis: prepend `OP IN [DEX]` after entry + FLIP the base's leading dex parity; the flip is what distinguishes it from `miraging`, which prepends the same dex WITHOUT flipping; one precedent only → whirling on a `[BOD]`/`[PDX]`-leading base is HELD); `guay` = BASE `pickup -> inside-stall` (`SET > OP IN [DEX] > SAME INSIDE [DEL]`, was prose); `rake` = BASE `scoop -> toe-stall` = REVERSE of pendulum (swing-element exception, 2 ADD / 1 bracket; shipped a glossary note); `spyro` (plant-before-dex gyro, not inspin) + `warping` clarified. guay/rake were already-canonical bases needing notation completion (set `base_trick=self` + an `ATOMIC_FLAG_DECOMPOSITIONS` entry to fire the convergence isAtomic gate), NOT new rows. **Batches:** whirling-X (5), guay/rake notation, a **26-trick clean Tier-1 sweep** (settled operator on already-canonical base, no cascade), `gyro-diving-clipper`. **Method forever-rule: MIRROR an existing same-operator resolvedFormula exemplar for chassis — parity (SAME/OP, `(plant)`) differs per operator and is NOT re-derivable from first principles (spinning keeps OP, gyro flips); bracket-count==ADD is the hard gate; parity is best-effort and curator-refinable in TS without affecting ADD or first-class.** **State: first-class 536 -> 651; clean no-cascade Tier-1 runway EXHAUSTED (regenerated queue = 0); frontier 1844.** Frontier no longer broadly curator-blocked: remaining curator surface = ~24 enumerable items (~279 slugs) — biggest lever **crossbody/xbd register + xbd-rake base (~47)**, then blazing/terraging undefined tokens, ~20 recurring folk operators (zulu/flailing/slapping/motion/...), DOD-policy; **atomic-rotational-Q3 = ALREADY ASKED (pending), do not re-raise.** The rest is OURS not the curator's: ~924 authorable runway needs CASCADE (one base-layer at a time), ~605 opaque folk-names need structural DECOMPOSITION, ~63 notation-leakage cleanup. **DO-NOT-RE-PROMOTE exclusion list (8):** paradox-blur (double-paradox), paradox-whirling-rake (paradox dex-direction unsettled = preserve-on-mirage/flip-on-whirl, unconfirmed), whirling-gyro-mirage + whirling-paradox-mirage (whirling parity held), fairy-spinning (malformed), symposium-blizzard + symposium-down-double-down (base notation empty), spinning-symposium-double-over-down (base notation unverified).

**2026-05-29/30 ruling-resolution + frontier-stabilization + media + glossary-planning session (supersedes the "parked"/"Wave-2-routed" notes below).** Three curator rulings SHIPPED: `illusioning` == `rev(0) miraging` (registered +1 in `trick_modifiers`, freestyle_tricks row activated, omelette modifier-link now resolves); `walk-over` ≡ `wrap` (identical adds+topology — foot-on-ground = unbracketed `(plant foot)` annotation; shared op_notation `SET > SAME INSIDE [DEL] > OP OUT [DEX] > (into clipper)` + `step-over` alias + wrap JOB=WRAP); `rev(0)` glossary explainer added to the Direction subsection (the 5-entry `REVERSE_PAIR_TRANSFORMS` trick-detail cohort stays curator-locked). All via red_corrections/red_additions/trick_modifiers + loaders 17/19 + parser-populate; 4929 tests green. **Frontier calibration** (`exploration/frontier-calibration-2026-05-29/`): PassBack Bucket-6 sized 187→129 genuine (−31% inflation = 42 already-canonical + 16 concept/notation leakage); method FOREVER-RULE = collapse derived projections (tracked_names_ts/observational_ts/canonical_db) + same-source multi-tables to INDEPENDENT source families before counting attestation (naive 94 "strong" → 41). **Frontier stabilization** (`exploration/frontier-stabilization-2026-05-29/`, commit 7dfe97ca): FM↔Stanford PARTIALLY DEPENDENT (Stanford re-notated a found move list; 166 obscure tricks shared only by the two; byte-identical raw spellings) → FM∩Stanford = PARTIAL corroboration, not strong; the 41 "strong" re-weights to 3 strong (fborg-attested Paratoxic/Torch-R-Rack/Whirr) + 38 partial; weight corroboration by INDEPENDENT LINEAGE, not source count. Two-band demoted-family design (terminal-identity Families vs "minor & derived neighborhoods" — never call the latter "family"; 3 of 4 resurface, `infinity` folds under `barfly`). **READY for Red Wave 2; first doctrine cluster = atomic family scope (X-dex/hidden-carry "Q3")**, then blurry-transitivity → operator-vs-trick boundary (settles flailing/railing) → compression-intent/hidden-vs-flat. **Media-stabilization** (`exploration/media-stabilization-2026-05-29/`): media = TEACHING layer not ontology (tier=claim-scope; advances while Wave 2 open); 4 exemplar packets (flurry GAP; barrage/blender/mobius tutorial UPGRADE) governance-cleared pre-Wave-2-safe; external-link FootbagSpot ingestion BLOCKED on Dave (`seed_fh_curator.py:695` hard-reject + `schema.sql:2160` CHECK) — Dave-ready `EXTERNAL_LINK_MEDIA_SPEC.md`; YouTube-Shorts URL normalization LANDED (commit 05e61dee, 1 sidecar=drifter). **Glossary evolution plan** (`exploration/glossary-evolution-2026-05-29/GLOSSARY_EVOLUTION_PLAN.md`, commit 6221f315): 6-layer progressive-disclosure architecture extending 3 existing glossary seeds (compositional premise / vocabulary relationships / "tracking is not canonization"); doctrine-free phases 2-4/6 can precede Red Wave 2; high-ADD case studies tagged SAFE-now vs HOLD-until-Wave-2; folk names + structural decompositions = two projections of one movement structure.

**2026-05-29 Frontier Canonicalization Initiative + public-family-layer refinement.** Charter for a post-media macro-sprint (proposal; phases 1-2 done) at `exploration/frontier-canonicalization-initiative/` (memory [[project_frontier_canonicalization]]): frontier intake pipeline, Tier A-D outlier model, a unified frontier-status taxonomy that CONSOLIDATES review_status + parser add_formula_status + policy_dependent + observational intakeBucket (no parallel framework). 7-ADD base verified solid (12/12 ADD-math clean); above-7 is an adjudication problem (0 official/fborg-attested), not a discovery problem. **Load-bearing doctrines (see also §C):** symbolic novelty != structural novelty (new folk name over existing structure = ALIAS, not a new row); duplication/equivalence resolves on DECOMPOSED STRUCTURE (modifier-set + base), not the folk-name string (gauntlet = stepping-ducking-paradox-torque; alpine-big-apple = gyro-ducking-symposium-torque); terminal-identity family-base test; public-family HARD RULE >2 members. Alias-wiring = verify-before-wire, gauntlet pattern (alias on the existing red_additions row's aliases column populates BOTH aliases_json + freestyle_trick_aliases). FM>=7 cohort is ALL FM-single-source (frequency != authority -> none Tier-A). Standing Red threads: DOD-policy / blurry-transitivity / atomic-rotational-Q3 doctrine clusters; eagle theory still curator-undefined (no intake schema until defined). Public family layer refined 23->18 (ATW reclassified out as an entry-side primitive; trick_family atw->around-the-world reconciled).

**2026-05-29 Freestyle Media Ingestion sprint (staging/design only).** Chose to extend the unified `media_items` + `media_tags` + curated-sidecar + `SOURCE_TIER` model; do NOT build curated media on the deprecating `freestyle_media_*` graph (see §5b). All media writes (media_items, galleries, placement) are Dave's gallery-edit-tool track; this track stops at candidate manifests. **Single load-bearing handoff: `exploration/freestyle-media-ingestion-2026-05-29/HANDOFF.md`** (+ memory [[project_freestyle_media_ingestion]]). Standing curator threads carried there: `illusioning` accepted as a modifier-form operator but registry write routed through Red Wave 2; `walk-over` op_notation parked; `atomic`/`atomic-torque` Red-Wave-2-Q3 blocked; 146-row unresolved PassBack promotion queue; proposed `teaches`/`components-covered` indirect-coverage relationship layer (ARCHITECTURE §3a). op_notation backfill landed: `paradox-blender` + `fusion`.

**2026-05-26 trick-detail stabilization wave shipped: 6 mechanical-backfill slices (T1 + T2 + T5-CSV + T4-priority + T4-expanded-A + T3-A).** Lifted JOB coverage 37% → 87% (+142 rows) and op_notation 74% → 83% (+26 rows) across 283 active non-modifier tricks. Both-empty bucket 53 → 38. Earlier 2026-05-26 work (Glossary Phase 1 polish + Set Encyclopedia Phase 1: see section B.2 playbook; Adrian-prep + S3/S5 governance + 21 promotions: see [[project_freestyle_state]] body) preserved. **Single load-bearing handoff reference for next session: `exploration/trick-stabilization-handoff/REPORT.md`** (324 lines; 5 curator decisions [D1]–[D5], ~11 FB.org-ready rows in T4-expanded-B queue, Set Encyclopedia Phase 2 backlog, recommended ROI-ordered next-session queue). Read this first if continuing trick-detail work. See [[project_freestyle_state]] section "2026-05-26 (continued)" for the wave inventory and [[project_set_encyclopedia_surface]] for encyclopedia-specific state. Section B.3 below documents the trick-detail stabilization methodology forever-rules (mechanical JOB rule + sibling-pattern op_notation derivation + 5-class derivation taxonomy + description-column-as-FB.org-source pattern). 4,608 tests green; tsc clean.

**Earlier 2026-05-25 / 2026-05-26 work** (preserved as B.1 below context, still load-bearing for trick-detail slot governance):
21 new canonical rows across ~10 family slices (pixie / inspinning / down / paradox / standalone) + 2 alias re-points (toe-blizzard, backside-symposium-toe-blur). S3/S5/S8/S9 slot governance migration locked in trick-detail page slot ownership — see [[project_slot_governance_doctrine]] for the forever-rule. Glossary §composition gained "Vocabulary relationships" subsection (4-way taxonomy). New S8 "Compressed from" pedagogy line on flagship pages (FAMOUS_COMPRESSION_SLUGS allowlist). New PEDAGOGICAL_COMPRESSION_EXEMPLARS cohort gates S5 ladder authoring. R4 parent-base rule added to buildRelatedTricks. Pre-Adrian polish wave (notation normalization at render, ?view=emerging redirect, set-encyclopedia category one-liners). Adrian review-navigation guide at `exploration/adrian-prep-2026-05-26/REVIEW_GUIDE.md`. TRACKED_UNPUBLISHED_TOTAL 553→534.

**Slot governance forever-rule (load-bearing):** Trick-detail pages have four distinct relationship-rendering slots — S3 aliases / S5 SE-chain structural compressions / S8 Compressed-from pedagogy / S9 EQUIVALENCE_TOPOLOGY alternate derivations. Strict slot ownership: a reading appears in exactly one. Atom-level S5 primary readings preferred over compressed intermediaries. Two curator-locked cohorts (FAMOUS_COMPRESSION_SLUGS gates S8; PEDAGOGICAL_COMPRESSION_EXEMPLARS gates S5 ladder authoring). Common mistakes documented in [[project_slot_governance_doctrine]]. Read before any slice touching aliases_json, SE chains, EQUIVALENCE_TOPOLOGY, or trick-compressed-from.hbs.

---

### B.1 Pre-2026-05-26 historical context (Wave Alpha + notation-display audit, 2026-05-24)

Wave Alpha (Phases 1-10) shipped 2026-05-23/24 against the comprehensive symbolic corpus (4,178 rows across 10 source systems at `exploration/symbolic-master/comprehensive_symbolic_trick_corpus_2026-05-23.csv`). 162 canonical rows touched = 74 backfills + 88 promotions. Foundational atoms (illusion / mirage / osis / whirl / swirl / butterfly / drifter / blender / dyno / nemesis / atomic-butterfly) now carry op_notation. 16 trick families exercised. 17 of 27 registered modifiers exercised. All work curator-paced, ADD-math verified per row, no test regressions across 10 phases.

**Wave Alpha per-phase reports** (all in `exploration/promotion-cohorts/`):

| Phase | Operation | Count |
|---|---|---:|
| Mini-Wave | foundational op_notation backfill | 15 |
| Phase 1 | safest copy-as-is fborg-bracket promotions | 13 |
| Phase 2 | Stanford / FM-parens translation promotions | 16 |
| Phase 3 | mechanical backfill translations (FM-parens + Stanford) | 20 |
| Phase 4 | Wave Beta + completion (folk-named base extensions) | 14 |
| Phase 5 | folk-named FM-parens wave (Lotus / Yoda / Aeon-Flux family) | 19 |
| Phase 6 | Tier-2 foundational-atom backfill (operationalized PassBack-outlier doctrine) | 11 |
| Phase 7 | Tier-2 FM-parens backfill | 27 |
| Phase 8 | Tier-2 new-promotion wave (folk-named) | 18 |
| Phase 9 | gyro family promotion | 5 |
| Phase 10 | folk-named extension promotion | 4 |

**Notation-display audit + browse-taxonomy work (2026-05-24)** — parallel slice at `exploration/notation-display-audit-2026-05-24/AUDIT.md` (5-phase roadmap):

- **Phase 1+3 shipped:** Browse / detail presentation contract pinned via `tests/integration/freestyle.browse-detail-contract.routes.test.ts`. ALT row + scoring-divergence prose stay off browse surfaces (canonical view + family + movement-system + topology + observational); ALT renders on detail page for the 5 rev(0)-locked entries only.
- **Phase 2 shipped:** Notation labels normalized. Detail-page section headings now "Movement notation" (was "Notation") and "Set notation" (was "JOB notation"). Comparative-row keeps compact `JOB:` / `ADD:` / `ALT:` labels (notational table on first-class detail; compact is correct).
- **Phase 4.1 shipped:** `?view=dex-count` browse mode at `/freestyle/tricks`. Buckets active rows by `[DEX]` token count in operational_notation (0 / 1 / 2 / 3+ / unknown). Distribution at ship time: 28 / 65 / 94 / 19 / 2 / 62. Pre-shaped `bucketId` on the view-model avoids the Handlebars 0-is-falsy footgun.
- **Phase 4.2 (`?view=entry-surface`) + Phase 5 (family lattice + symbolic search) deferred** — explicit future work, not yet started.

**Nonstandard-topology audit (2026-05-24)** — parallel data-driven slice at `exploration/nonstandard-topology-audit-2026-05-24/AUDIT.md`:

- Data: 270 active canonical rows analyzed; ~94% toe-or-clipper-dominant; 11 unusual-surface rows scattered across 6 sub-categories (head / knee / sole / heel / cloud / shoulder etc.); 8 flying / airborne; 87 with any body-token (too broad to be an "exception" signal).
- Decision (curator-accepted): Build a `/freestyle/alternative-surfaces` REFERENCE PAGE in a future slice. Do NOT build `?view=alternative-surfaces` browse toggle.
- Forever-rule ratified (see memory `feedback_browse_view_distributional_density`): browse views earn their `?view=` slot by distributional density. Continuous-broad data (dex-count) → browse axis. Sparse-categorical data (11 rows / 6 sub-categories) → reference page or glossary cross-link.

**Load-bearing architectural contracts now in effect (Wave-Alpha-era forever-rules):**

- **PassBack outlier non-authoritative for ADD** (memory `feedback_passback_outlier_non_authoritative`). When canonical_db + fm + fborg agree on a trick's ADD and PassBack is the sole divergent source, PassBack's claim is non-authoritative observational data. Row is safely backfillable/promotable using the agreed canonical-bracket notation. Operationalized across Wave Alpha P6+7+8 (56 rows) without controversy.
- **Loader-19 no-transitive-inheritance forever-rule** (memory `feedback_loader_19_family_default`) heavily exercised across Wave Alpha. When `red_additions` row's `base_trick` is itself a compound with a different `trick_family`, the new row's default `trick_family = base_trick` must be overridden via a paired `red_corrections` row. Wave Alpha added 25+ such overrides; pattern is now battle-tested.
- **ADD-math sanity check (forever-rule, used in every phase):** every new row or backfilled op_notation must satisfy `bracket_count([DEX]/[BOD]/[XBD]/[PDX]/[DEL]/[UNS]/[XDEX]) == official_add`. Pre-write Python sanity check caught 5+ transcription errors across Wave Alpha. Use programmatic FM-parens → canonical-bracket translation (not manual transcription) for FM-source rows.
- **Browse / detail presentation contract** (pinned by `freestyle.browse-detail-contract.routes.test.ts`). Browse cards: name + hashtag + ADD chip + primary notation only. Detail pages: free to layer all rich content (movement notation, ADD breakdown, ALT, operational, equivalent readings, source provenance, scoring notes). ALT row stays detail-only.
- **Browse-view distributional density rule** (memory `feedback_browse_view_distributional_density`). New `?view=` modes require distributional density; sparse-categorical exception data routes to reference pages or glossary cross-links instead.
- **Notation label scheme:** public-facing surfaces use "Movement notation" / "Set notation" / "Movement notation" headings + `ADD breakdown` / `Alternate reading` body labels. Advanced/reference contexts (comparative-row, glossary) keep compact `JOB` / `ADD` / `ALT` / `Stanford` abbreviations. ADD term itself stays — community-canonical, do not rename.
- **Restraint doctrine D unchanged.** No parser aesthetics, no token soup, no AST, no interaction-heavy symbolic UI.

**Still pending / curator-paced (handed off by Wave Alpha):**

- **Bracket-vs-official-ADD deferrals (~11 rows):** torque, ripwalk, blizzard + 7 from Phase 7 (need curator doctrine on `[PDX]` token: is it counted in ADD or descriptive?). Documented in `WAVE_ALPHA_PHASE6/7/10_*.md`.
- **Unregistered-modifier compounds (~5 rows):** blistering-whirl, inspinning-{butterfly, paradox-illusion, paradox-mirage}, inspinning-osis. Need curator decision on registering `blistering` (+2 universal?) and `inspinning` (+1 like spinning?).
- **Passback-prose rows (3 rows):** walk-over, rake, inspinning-osis. Source is pedagogical prose, not structural notation; need curator-authored canonical-bracket form.
- **Audit Phase 4.2 (`?view=entry-surface`)** — deferred per the notation-display roadmap. Stanford-shorthand data is ready.
- **Audit Phase 5 (family lattice + symbolic search)** — deferred. Power-user surfaces; foundation work complete.
- **`/freestyle/alternative-surfaces` reference page** — recommended by topology audit; not yet implemented.

**What to do next (when starting freestyle work):**

  1. Read `[[project_freestyle_state]]` for the latest cumulative state + `[[project_slot_governance_doctrine]]` if the slice touches trick-detail relationship slots (aliases / SE chains / Compressed-from / Alternate derivations).
  2. **Before promoting any candidate to a new canonical row**, verify it isn't already represented by an existing slug (clipper-kick already covered by `clipper`; da-da-curve already `dada-curve`; check DB + RECONCILIATION audit notes). Folk-name candidates may need alias-wiring on an existing canonical instead of a new row.
  3. **For deferred-candidate promotions (the dominant pattern):** backup DB → red_additions row + RESOLVED_FORMULAS entry + FIRST_CLASS_TIER_2 + RECONCILIATION governance_state flip → loader 19 → tracked-names regen → test → stage. JOB derivation: prefer FB.org-confirmed (fborg-*add.txt + gyroMoves.txt / paradoxMoves.txt / pixieMoves.txt); sibling-derive only when FB.org silent.
  4. **Slot leakage is the most common audit failure.** When red_additions / red_corrections / SE chains carry a value that's a structural compression: it goes in S5 only, not aliases_json. When it's an alternate-derivation path: S9 only. Pure aliases (spelling variants, historical naming): S3 only.
  5. **New SE chain entries default to single-depth atom-level reading.** Multi-depth ladders are PEDAGOGICAL_COMPRESSION_EXEMPLARS-only and curator-locked.
  6. If curator wants a new browse axis: check `[[feedback_browse_view_distributional_density]]` first. Measure candidate axis's row distribution before proposing a `?view=` toggle vs reference page.
  7. If Red Wave 2 / 3 answers land: integrate per the queued post-Red follow-up slices (see [[project_red_consultation_state]]).
  8. Pre-Wave-Alpha Wave Alpha follow-on deferrals (the 11+5+3 cohort) are still curator-doctrine-blocked; see B.1 below.

### B.2 Phase 1 polish playbook (2026-05-26 — methodology for future surface refinement)

The 2026-05-26 polish wave converged on a repeatable 5-stage pattern across both the glossary and the Set Encyclopedia. Future Phase 1-style work on any other public freestyle surface (Compositional Sets hub, Operators page, etc.) should follow the same sequence and discipline.

**Stage 1 — Onboarding orientation.** Add an intro card above the first section with: what-the-surface-is paragraph + reading-flow map + sidebar/nav pointer. Add tier-break rulers at major reading-arc transitions with one-line "you can stop here" microcopy. Sidebar groupings (if any) should be made visible in the main column at the same break points.

**Stage 2 — Density relief on the heaviest section.** Identify the surface's biggest density spike (glossary §7 / set-detail's modifier-interactions section / etc.). Apply: mini-TOC pill row at section top + `<details>`/`<summary>` collapse on the heaviest sub-block (preserve all child anchors; browsers auto-open `<details>` on hash navigation). Test contract change pattern: when an anchor migrates from `<h3>` to `<details>`, update the existing assertion to a title-proximity regex + add a new shape assertion for the collapse.

**Stage 3 — Prose density tightening.** Sentence-level edits to remove repetition + tighten transitions. Targets: lead paragraphs above tables/grids (often expandable to one sentence); worked-example paragraphs (frequently repeat the same framing phrase); intro paragraphs that double the same concept. Apply public-prose hygiene at the same time (strip `pt##` / `Red` / `adjudication` / dated `curator-reviewed` per `[[feedback_public_facing_prose]]`).

**Stage 4 — Pathway scaffolding.** Three small additive moves:
- **Read-next footers** (`.glossary-section-next`) at section / subsection boundaries pointing forward to the next conceptually-adjacent concept. Right-aligned italic 1-line; reuse existing CSS.
- **★ flagship markers** (`.glossary-flagship-marker`) on canonical teaching exemplars. Per-marker tooltip naming the pedagogical role. Restrained cohort (3-5 markers per surface; flagship dilution is the failure mode).
- **Section-purpose micro-intros** (1-2 sentences) under abrupt h3 subsections that currently jump straight to content.

**Stage 5 — Cross-link polish.** Make worked-example trick-name surfaces clickable into the dictionary. Sidebar refresh — add deep sub-anchors to formerly-section-only sidebar entries. Sharpen 2-3 generic crosslinks (e.g. `/freestyle/tricks` → `/freestyle/tricks?view=family`) where a query-param-narrowed link better matches the reader's mental state at the link point.

**Link-density discipline (load-bearing across surfaces).**

- **Link:** first meaningful mention per subsection · canonical examples used to illustrate a concept · flagship exemplars · worked-example outputs · derivation anchors
- **Don't link:** 10-item family-anchor enumerations · repeated mentions of the same trick · retired-alias left-sides · every inline operator/trick occurrence · data-driven panels (would require service-layer changes for marginal gain)

The discipline matters. Wikipedia-density linking is the failure mode; surgical linking that turns worked-example surfaces into gateways into the dictionary is the success mode.

**Reusable cross-surface CSS primitives (architectural fact).**

Three classes are now general-purpose despite the `glossary-` prefix:

- `.glossary-mini-toc` + `-label` + `-list` — pill row of in-section anchors
- `.glossary-section-next` — one-line italic right-aligned "Next —" footer
- `.glossary-flagship-marker` — tiny inline ★ chip with title tooltip

Future Phase 1-style work should **reuse these classes, not create duplicates**. If a sufficiently-coordinated rename becomes worthwhile (e.g. to drop the `glossary-` prefix), do it as a single coordinated refactor across all current usages, not piecemeal.

**Architectural principles (forward-applicable):**

- **Cards stay compact; pedagogy lives on detail pages.** When a refinement pressure pushes card content past ~8 visible lines, the right move is to move that content to the detail page, not to expand the card.
- **Sibling surfaces share rhythm.** When refining a surface (Set Encyclopedia), mirror the rhythm of the sibling that's already mature (Trick Dictionary detail pages). Same shell flow, different content axis. Preserves visual + conceptual coherence.
- **Cheap structural slices ship first; content-heavy slices defer to curator pace.** The Set Encyclopedia plan's S1+S4+S5 (structural) shipped in one session; S2+S3 (curator-authored content for 8 flagship sets) deferred to Phase 2. Order matters: structural lifts give the surface visible improvement BEFORE the content-authoring backlog opens.
- **Slug audit before every cross-link slice.** Verify each target slug exists in `freestyle_tricks` before wrapping `<strong>NAME</strong>` in `<a>`. Slice 5 caught one missing slug (quantum-butterfly) — left unlinked rather than shipping a 404. Pattern: `sqlite3 footbag.db "SELECT slug FROM freestyle_tricks WHERE slug IN (...);"`.

**When to apply this playbook.** Any time a freestyle surface feels "comparatively thin and under-realized relative to the rest of the system" — the framing the curator used for the Set Encyclopedia in its Phase 1 planning brief. The same framing is likely to recur for the Compositional Sets hub and the Operators page when their turn comes.

### B.3 Trick-detail stabilization methodology (2026-05-26 — mechanical backfill forever-rules)

The 2026-05-26 trick-detail stabilization wave established four forever-rules for mechanical notation backfill. Apply to any future slice that touches `freestyle_tricks.notation` (JOB) or `operational_notation` (op).

**Rule 1 — Mechanical JOB rule (uniform across all 283 active tricks):**

```
JOB = canonical_name.replace(/[-\s]+/g, ' ').toUpperCase()
```

Applies uniformly to: modifier+base compounds (`paradox-mirage` → `PARADOX MIRAGE`), folk-name compounds (`surge` → `SURGE`; `mobius` → `MOBIUS`), sui-generis primitives (`bullwhip` → `BULLWHIP`), multi-modifier compounds (`stepping-ducking-paradox-blender` → `STEPPING DUCKING PARADOX BLENDER`). For folk-name compounds the compositional decomposition lives in SE chain (S5), not JOB — per the slot-governance forever-rule. Curator can override individual rows on a per-row basis if a different JOB form is preferred; the mechanical rule applies in absence of override. T2 shipped 125 rows via this rule with zero post-hoc corrections.

**Rule 2 — Sibling-pattern op_notation derivation:**

1. Identify the closest single-modifier sibling with populated op_notation (e.g. for `spinning-whirl`, sibling = `spinning-butterfly`)
2. Substitute the differing operator's bracketed segment (whirl's `OP IN [DEX]` for butterfly's `OP OUT [DEX]`)
3. **Verify bracket count == asserted ADD** per the ADD-math forever-rule (`[DEX]/[BOD]/[XBD]/[PDX]/[DEL]/[UNS]/[XDEX]` count must match canonical `adds`)
4. Document the sibling source in the red_correction's source_note column

Special derivation patterns established this wave:
- **pt7 direction-flip:** inspinning-X = spinning-X with `(back) SPIN` → `(front) SPIN`, dex side `OP` → `SAME`. Other axes unchanged.
- **Stepping leading-[DEX]:** sidewalk pattern `CLIP > OP IN [DEX] >> {base body}` for stepping-X compounds
- **Symposium no-plant + [BOD]:** symposium-whirl pattern `SET > (no plant while) OP IN [BOD] [DEX] > {terminal}`
- **pt9 X-Dex placement:** for X-Dex named-exception compounds, `[XDEX]` flag goes on the BASE's dex (sumo `> OP IN [DEX] [XDEX] >` pattern; atom-smasher follows)
- **Direction-reverse (rev-X):** flip dex direction (`OP IN` → `OP OUT`); make entry explicit (`SET` → `CLIP`)

Additional chassis patterns established by the 2026-05-27 comprehensive-coverage wave (W1–W8, 131 promotions across inspinning/quantum/pixie/atomic-pilot/fairy/spinning/gyro/ducking):

- **Gyro chassis flip rule:** gyro = `(back) SPIN [BOD]` + flip base's FIRST dex from `OP` → `SAME` (half-spin same-side reading). Distinct from spinning which keeps `OP` direction. For multi-dex bases only the first dex flips. For zero-dex bases (clipper-stall, toe-stall) gyro and spinning collapse to identical structure — DO NOT promote separate `gyro-clipper` / `gyro-toe` rows. Folk-aliased: `gyro-torque` = `mobius` (5 ADD canonical).
- **Spinning vs gyro asymmetry:** both use `(back) SPIN [BOD]` notation; differentiator is the dex-direction flip rule above. `spinning-mirage` has `OP IN [DEX]`; `gyro-mirage` has `SAME IN [DEX]`.
- **Double-spinning / twinspinning = +2 modifier weight** (two back-spin events at the front of the chain). Folk names sonic / peeking / twinspinning are NOT canonical in DB; promote as bare structural slugs `double-spinning-X` / `twinspinning-X`. modifier_links left blank (parallel to inspinning convention — not registered in `freestyle_trick_modifiers`).
- **Jump-class double-[DEL] terminal:** `pixie-eclipse` / `fairy-eclipse` / `ducking-eclipse` / `gyro-eclipse` share the chassis `... (JUMP) [BOD] > SAME INSIDE [DEL] > SAME TOE [DEL]` — mid-flight inside-stall + landing toe-stall, NO final dex. For `ducking-eclipse` / `gyro-eclipse`, the body modifier (DUCK / SPIN) precedes the JUMP, yielding double-[BOD] front-of-chain.
- **Triple-[BOD] construction:** when stacking a body modifier (spinning / ducking / symposium) on a base trick that already carries its own body-spin (osis / blender / torque), three `[BOD]` events appear in sequence. Examples: `spinning-ducking-osis` = `CLIP > (back) SPIN [BOD] > DUCK [BOD] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]`; `gyro-symposium-torque` (triple BOD via spin + no-plant + base spin); `double-spinning-osis`.
- **Atomic = +1 on every base; any X-Dex is separate (stored-ADD migration still pending):** atomic contributes +1 ADD on every base, with no rotational class. Any X-Dex is a separate, receiver-gated +1 on a *following* far-form dex (receivers: mirage / illusion / whirl / torque / drifter), never inferred from the atomic name; where it fires, that dex carries the `[XDEX]` bracket (atom-smasher pattern: `TOE > OP OUT [DEX] > OP IN [DEX] [XDEX] > OP TOE [DEL]`). The prose doctrine is settled and `operatorReference.ts` is canonical for it; what is still pending is migrating the stored ADD values of the affected rotational-base compounds (the standalone atomic modifier registry is already +1 on every base).

Additional chassis patterns established by the 2026-05-27 W9 continuation wave (W9a–W9o, 75 promotions across stepping/symposium/paradox/fairy/pixie/spinning/quantum/blender-torque/multi-modifier + new miraging/tapping ecosystems):

- **Stepping leading-[DEX] chassis (W9a/b):** `CLIP > OP IN [DEX] >` prefix on base body, dropping the base's leading `SET` or `TOE` entry. Examples: `stepping-barfly` = `CLIP > OP IN [DEX] >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]`; `stepping-pickup` = `CLIP > OP IN [DEX] > OP IN [DEX] > SAME TOE [DEL]`.
- **Symposium [BOD] no-plant injection (W9c/d/n/o):** `(no plant while) <direction> [BOD] [DEX]` merged into base's first dex event — combines body and dex into a single no-plant event. Matches symposium-mirage / symposium-eggbeater / symposium-whirl / symposium-torque chassis. Examples: `symposium-illusion` = `SET > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]`; `symposium-double-over-down` = `TOE > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]`.
- **Spinning-paradox direction-retention (W9f/h):** spinning-paradox-X keeps `OP` direction on the first dex (pre-spin consumes paradox's direction-flip rule). Contrast with single-paradox-X which flips `OP` → `SAME`. Examples: `spinning-paradox-mirage` = `CLIP > (back) SPIN [BOD] > OP IN [PDX] [DEX] > OP TOE [DEL]`; `spinning-paradox-drifter` keeps the same OP IN.
- **Cat C doctrine-clean strip-or-swap (W9h opening precedent):** stack=3+ multi-modifier rows ship under Class A criteria when the chassis directly derives from a canonical sibling. Examples: `ducking-paradox-symposium-whirl` = `stepping-ducking-paradox-symposium-whirl` canonical (7 ADD) with `stepping` prefix stripped → 6 ADD; `spinning-paradox-symposium-whirl` = ducking-paradox-symposium-whirl with `DUCK [BOD]` swapped for `(back) SPIN [BOD]`. Bracket-count = ADD verification still required.
- **Miraging chassis (W9k opening):** `SET > OP IN [DEX] >` prefix (+1 ADD). Mirage-style movement adds an IN-direction dex at the front of the base body. Only one existing canonical sibling (`miraging-eclipse` — jump-class, special chassis); the IN-prefix rule on non-jump bases is mechanically-consistent but curator-refinable. Composes with symposium injection: `miraging-symposium-mirage` = `SET > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]`.
- **Tapping chassis (W9l/m/n/o):** `TOE > OP OUT [DEX] >>` prefix (+1 ADD). Two patterns observed in canonical siblings:
  - **tapping-whirl precedent (direction preserved):** base's first dex direction kept when no OP-OP duplication. Used for `tapping-mirage`/`-pickup`/`-drifter`/`-twirl`/`-mobius`/`-torque`.
  - **tapping-illusion precedent (direction flipped):** `OP OUT` → `SAME OUT` on second dex when base's first dex would duplicate the OUT prefix. Used for `tapping-butterfly`/`-leg-over`.
  Composes with symposium injection: `tapping-symposium-whirl` = `TOE > OP OUT [DEX] >> (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]`.
- **Pixie + miraging stack precedent (W9o pixie-miraging-flail):** first DB compound stacking pixie + miraging. Composition is mechanical and doctrinally compatible: pixie entry-side prefix (`TOE > SAME IN [DEX]`) + miraging dex-injection (`OP IN [DEX]`) + base body. Sets the precedent for future multi-set-system stacks.
- **Atomic + miraging on non-rotational base (W9o atomic-miraging-butterfly):** `atomic-butterfly` canonical (4 ADD; non-rotational, atomic = +1 per W4a) + miraging `OP IN [DEX]` injection between atomic prefix and butterfly's OUT-dex → 5 ADD. Rotational-atomic remains Q3-blocked; non-rotational extensions are open.

**Wave-based promotion methodology (2026-05-27 W1–W9 pattern):** Each promotion wave runs as 5-row pilot batches via idempotent apply scripts at `exploration/wave1-triage-2026-05-27/wN<letter>_apply.py`. Per batch: derive sibling chassis → verify bracket count = asserted ADD → run apply (which appends to `red_additions` + `red_corrections` via `csv.QUOTE_MINIMAL` append, with row-existence idempotency checks) → `npm run build` → `npm test` (4,690+ tests must pass) → `git add` → hand off commit. Apply scripts are checked into `exploration/wave1-triage-2026-05-27/`; the per-batch staged state IS the audit trail.

**Source-attestation forever-rule (W9 codification):** only promote slugs that appear in the triage corpus (`exploration/wave1-triage-2026-05-27/triage_classified.csv`). Promotion of non-attested speculative compounds (e.g. `gyro-paradox-mirage`, `fairy-paradox-X`, `quantum-symposium-illusion`) is deferred even when chassis is mechanically derivable. The triage represents the documented vocabulary corpus — promoting outside it would invent canonical rows beyond what sources document.

**Observational page post-wave cleanup (W9 cleanup hygiene, see [[feedback_observational_canonical_promotion_cleanup]]):** After any wave that adds to `red_additions_2026_04_20.csv`, check `RECONCILIATION.csv` for stale rows whose slug is now canonical but `governance_state` still starts with anything other than `"1"`. Bulk-update via `sed` (NEVER `csv.DictReader → csv.DictWriter`). Regenerate `freestyleTrackedNames.ts` via `python3 legacy_data/scripts/build_tracked_names_content.py`. The generator's dual-gate filter (2026-05-27 hardening) provides a safety net by also reading canonical CSVs directly.

**Per-row slug normalization** (see [[feedback_freestyle_slug_normalization]]): slugs use the underscore as the only word separator (no hyphens), so the slug equals its hashtag body — "DLO" → `double_leg_over`; "Pdx" → `paradox`; "PS" → `paradox_symposium`; "Symp." → `symposium`; "(same side)" / "(ss)" / "(op)" / "(far)" / "(near)" qualifiers drop from slug (bare structural form is canonical; qualifier becomes alias if needed); "rev_X" preferred over "reverse_X" where rev_X exists in DB.

**Folk-name canonical overlap registry** (always check before promoting a structural-name compound; the structural-form slug should NOT be promoted as a separate row when the folk-form is already canonical — register as state-2 alias or S5 SE-chain reading instead):
| Structural form | Canonical folk slug | ADD |
|---|---|---|
| `pixie-butterfly` | `dimwalk` | 4 |
| `pixie-mirage` | `smear` | 3 |
| `pixie-illusion` | (set-system `sailing`, not a trick) | (2 set) |
| `pixie-ducking-butterfly` | `phoenix` | 5 |
| `pixie-ducking-mirage` | `assassin` | 4 |
| `pixie-diving-near-butterfly` | `darkwalk` | 5 |
| `atomic-legover` | `eggbeater` | 3 |
| `atomic-pickup` | `omelette` | 3 (Q1 doctrine-conflicted; 2026-05-26 Red packet pending) |
| `atomic-mirage` | `atom-smasher` | 4 |
| `atomic-double-over-down` | `fusion` | 5 |
| `atomic-symposium-mirage` | `witchdoctor` | 5 |
| `atomic-double-leg-over` | `predator` | 4 |
| `atomic-ducking-whirl` | `ego` | 6 |
| `atomic-butterfly` | (canonical as `atomic-butterfly`; folk `legbeater` not canonical) | 4 |
| `gyro-torque` | `mobius` | 5 |
| `fairy-torque` | `forque` | 5 |
| `fairy-ducking-mirage` | `guillotine` | 4 |
| `reverse-swirling-osis` | `twirl` | 4 (note: `twirl` is NOT `fairy-osis`) |
| `stepping-torque` | `grave-digger` | 4 (W9 source-form skip) |
| `stepping-double-leg-over` | `haze` | 4 (W9 source-form skip) |
| `stepping-drifter` | `tombstone` | 4 (W9 source-form skip) |
| `whirling-osis` | `blender` | 4 (W9 source-form skip; folk canonical takes precedence) |

**Self-reference semantic-suspect (W9):** `atomic-eggbeater` is semantically suspect: eggbeater IS `atomic-legover` per the registry, so "atomic atomic-legover" doesn't compose. Do NOT promote `atomic-eggbeater` as a separate row. Same applies to any "X-Y-Z" compound where Y-Z is already folk-aliased to a single-modifier-on-base form.

**Rule 3 — 5-class derivation taxonomy (classify before shipping):**

| Class | Definition | Action |
|---|---|---|
| **A** Safe-mechanical | Sibling-derivable; clear bracket-count closure; no doctrine ambiguity | Ship in slice; bundle ~10 at a time |
| **B** Sibling-derivable moderate-risk | Sibling pattern exists but some judgment (which side flips, ambiguous bracket placement) | Ship with curator spot-check; document the judgment call |
| **C** Truly sui-generis | No clean sibling; canonical_name doesn't decompose into known modifiers + base | Curator-authored JOB needed; defer |
| **D** Missing evidence | Row exists but source-confirmed formula unavailable (no fb.org / FM / PassBack / Holden reading) | Source research needed; defer |
| **Blocked** | Doctrine question pending (specific Red question; pt## queue) | Defer until ruling; tag with [D#] reference |

Default scope rule: **ship Class A only**; flag Class B/C/D/Blocked in the slice's deliverable with explicit reasons. The 6-slice wave shipped ~167 rows of Class A work; deferred ~30 rows across Class B/C/D/Blocked.

**Rule 4 — Description-column-as-FB.org-source pattern:**

When auditing the both-empty bucket, **read the `description` column carefully** — recent promotion-wave rows often carry their FB.org-confirmed JOB form verbatim in description (e.g. `pixie-swirl` description = "FB.org-confirmed. JOB TOE > SAME IN [DEX] > SAME/OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]"). This is **pure mechanical migration**, not derivation — copy from description to `notation` / `operational_notation` via red_corrections. Bracket-count verification still required. ~11 rows surfaced via this pattern in the handoff report (T4-expanded-B queue) — saved for next session.

**Operational forever-rules also reinforced this wave:**
- All CSV-driven via `red_corrections_2026_04_20.csv` + `red_additions_2026_04_20.csv`; loader 19 applies. Never direct DB UPDATE.
- DB backup before each major slice (`database/footbag.db.bak-pre-{slice}-{timestamp}`)
- Parser-populate after each loader 19 run (`python3 freestyle/scripts/parse_freestyle_notation.py --apply`) per `[[feedback_parser_population_after_rebuild]]`
- Casing preservation per sibling (no casing normalization without curator decision per T6 deferral)
- ADD-math sanity check on every row (forever-rule from Wave Alpha)

**When to apply this methodology:** any future stabilization slice on the `freestyle_tricks` dictionary — backfilling notation, normalizing format, migrating fields. The 4 rules + 5-class taxonomy give a repeatable framework. The handoff report at `exploration/trick-stabilization-handoff/REPORT.md` is the single load-bearing reference for the next-session queue.

### B.4 Compact-layer audit + notation conventions (2026-06-01)

Auditing the compact / notation / ADD-line layer (cards, browse rows, `op_notation`, `derivation`): **verify before normalizing.** Most apparent inconsistency is intentional notation layering (atom `component(1)+…` vs compound `modifier(+N) + base(N)` — different by trick *type*), curator-locked doctrine, unresolved ontology, or a historically meaningful distinction — not drift. **Forever-rule: normalize formatting drift aggressively; never normalize unresolved ontology.** Before any normalization check (a) the tokenizer/renderer (`src/services/operationalNotationRendering.ts`) for an existing label/role, (b) the row's provenance / `source_note` for a lock, (c) whether the variation is type-based or ontology-gated. See memory `[[feedback_dictionary_compact_layer_audit]]`.

Ratified `op_notation` / ADD-line / copy conventions (do NOT re-litigate):
- Side compression = **`SAME/OP`** (single slash form); `IN/OUT` is the separate direction axis.
- Scored body verbs are **bare CAPS** (`JUMP`, `DUCK`, `SPIN`); parenthetical annotations are **lowercase** (`(back)`, `(front)`, `(no plant while)`, `(land)`).
- `>>` is a **documented** token — "Major sequence boundary (often a no-plant break)" (tooltip + CSS `sequence-op-major` in `operationalNotationRendering.ts`); `>` is "Sub-step (continuous flow)". Never collapse `>>` → `>`. Distinct from the within-step `(no plant while)` annotation.
- **Kicks self-family** (`trick_family = slug`), not the stall family they resemble (butterfly-kick / around-the-world-kick reclassified to match cloud / dragonfly / sole-kick); `base_trick` retained for derivation provenance; kick grouping via kind-overrides.
- Pending public copy: JOB placeholder **"canonical decomposition pending"**; pill / badge **"decomposition under review"**.
- Descriptions: strip phase / promotion provenance (Wave Alpha / Tier-2-promotion / curator-paced); **keep** genuine source attribution (FB.org-confirmed). Template `{Modifier}-modified {base}.`; folk → "Folk name; decomposes to X."

**Open — pending curator ruling (do NOT mechanically normalize):** `BOD(1)` (locked body-modifier bucket) vs `bod(1)` (additive component); `surging(+2 = spinning + stepping per Red pt2)` provenance-in-ADD-line. Packet: `exploration/freestyle-p2c-add-line-packet/CURATOR_PACKET.md`.

### C. Family / topology caution

The Red side-question consultation surfaced that movement relationships involve multiple overlapping axes: symbolic structure, modifier lineage, dex archetypes, embodied feel, timing/body-path topology, catch/surface relationships. These do not collapse cleanly into one classification.

Explicit warnings:

- **`family` ≠ `topology`.** A `trick_family` value names the structural anchor (whirl, butterfly, mirage). A topology group is an observational grouping by movement mechanic (midtime body modifiers, ducking/diving family). Same trick, different lenses; do not unify them.
- **`family` ≠ catch surface.** Clipper-as-surface and clipper-as-family are not the same concept; many unrelated tricks land on clipper without belonging to a "clipper family." Treat surfaces as their own facet.
- **Multi-axis movement relationships exist.** A trick can be primary-family `legover` AND secondary-related to `mirage` (via `miraging legover` reading). A trick can appear in multiple topology groups. Single-value `trick_family` columns express ONE axis; do not pretend they express all of them.
- **Descriptive shorthand ≠ canonical decomposition.** Coach-tone descriptions ("body drops under the bag") are pedagogical content; they are NOT structural decomposition (`pixie ducking butterfly`). Keep them on separate layers (see doctrine A).
- **Embodied analogies are pedagogical, not canonical.** Movement-feel cards describe how a trick feels in the body. They are teaching material; they never freeze into canon. Future curator iteration should be expected.
- **Public family-base qualification (the `?view=family` / `freestylePublicFamilies.ts` layer).** A public family ROOT must (a) have MORE THAN 2 active members (>=3) — HARD RULE — and (b) express a terminal/downside structural identity: a landing signature descendants preserve even as modifiers stack on the entry (paradox-whirl still "is" a whirl). Entry-side dexterity primitives / operators (ATW is the canonical example) are NOT family roots — they belong in the components / movement-system / glossary-fundamentals layer. Distinguish TOPOLOGY ROOTS (terminal identity) from OPERATORS/COMPONENTS/PRIMITIVES (entry-side, used not inherited). Sparse 2-member derivative micro-clusters demote to minor/derived; this is the public-display layer only and never changes canonical `trick_family`.

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

1. **Named identity persistence.** The name is used independently of its decomposition (e.g. `dyno`, `paradon`, `bigwalk`, `surreal`: each known by community name in competition / tutorials, not as "spinning stepping butterfly").
2. **Not losslessly decomposable.** Base + modifiers do not fully describe it. If they do, model via `modifier_links` on a compound row instead of creating a new canonical.
3. **Historical / competitive significance.** Appears in competition results, widely-recognized tutorials, or community canonical lists. Records-only appearance is weak signal; competition / TT lesson / Red's curated set is strong signal.
4. **Structural ambiguity resolver.** Multiple valid decompositions exist for the same physical move; the name is the canonical anchor that resolves the ambiguity.
5. **Alias collapse check.** Before creating a new row, check whether the name maps to an existing canonical slug. If so, it's an alias on the existing row, NOT a new row.

Do NOT create canonical rows for:

- **Pure modifier chains** (e.g. `spinning paradox mirage`). Model via `modifier_links` on the base or on an existing compound canonical such as `paradox-mirage`.
- **Surface-only variants** (e.g. `kick` vs `stall` for the same motion). Pick one canonical surface; the other is alias-only.
- **Direction-only variants**: unless direction is globally structural per the "Direction is structural" rule below, in which case the reversed form is its own canonical.
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

Stalls (toe-stall, inside-stall, clipper-stall, osis, and similar delay surfaces) are **common anchor positions** used in many tricks. This is descriptive, not prescriptive. Red pt5's "base set of tricks such as toe stall, inside stall, clipper stall, and osis" comment names specific frequent anchors; it does not generalize to a universal rule.

The ontology must also support:

- **Non-stall tricks**: kick-based moves (`flying-clipper`, `dragonfly-kick`), surface-less compounds (`double-knee`), dexterity-only sequences with no stall anchor.
- **Body tricks**: `spin`, `double-spin`, `hop-over`, `walk-over`, `flying-inside`, `flying-outside`, `spyro`: pure body motion primitives.
- **Sets**: `pixie`, `fairy`, `atomic`, `quantum`: bag-launch primitives that precede a trick rather than serving as a stall anchor.
- **Modifiers**: `paradox`, `ducking`, `symposium`, etc.: applied on top of any base, stall-or-not.
- **Standalone compounds without explicit stall base**: `drifter`, `ripwalk`, `butterfly`, etc.: the structural skeleton may include stall delays internally but the canonical row stands on its own.

Do NOT force tricks into stall-based decomposition during classification or QC. When a trick's base is unclear, defer rather than invent a stall ancestor.

### Jobs notation is the structural backbone

Trick names are labels; Jobs notation describes the actual movement. Store as opaque text in `freestyle_tricks.notation`. Do not parse, do not regenerate. Mismatches between description and notation are flagged in QC, never silently rewritten.

When canonical notation is blank and footbag.org has notation, promote it onto canonical (script 20 does this automatically). When canonical and footbag.org disagree on notation, preserve the disagreement in `freestyle_trick_source_links.asserted_notation`; never silently overwrite.

### Description policy

Public-facing trick descriptions are neutral and instructional. No reviewer names ("per Red", "by X", "confirmed by", "Husted"), no internal modifier shorthand ("= 4 ADD", "barraging legover"), no provenance attribution. Reviewer / expert provenance lives in `freestyle_trick_source_links.notes`, source-registry rows, or QC reports: not in `description`.

When ADD math is referenced in a description, it must agree with the row's `adds` value or be removed. Self-contradictions (description says "= 3 ADD" while `adds=4`) are HIGH-severity QC failures.

Aliases never appear in the description text. Aliases live in the row's `aliases` column or in `trick_aliases.csv`. Mentioning an alias in the description (e.g. `"atomic butterfly = leg beater = 4 ADD"`) is a policy violation: strip on sight.

#### Established description templates (Phases 1-3, 2026-04-30)

The active dictionary descriptions follow these templates. Apply the same templates when adding new active rows or normalizing future ones:

- **Compound = modifier + base:** `"{Modifier}-modified {base}."`: e.g. `Paradox-modified torque.`, `Blurry-modified mirage.`, `Whirl-modified osis.`
- **Multi-modifier compound:** nest by treating the innermost named compound as the base, then `"{Outer}-modified {Inner} {base}."`. Examples: `Paradox-modified symposium whirl.` (= paradox + symposium-whirl), `Ducking-modified paradox whirl.` (= ducking + paradox-whirl), `Paradox-modified barraging mirage.` (= paradox + barraging-mirage).
- **Modifier noun-form rule:** when a modifier shares its name with a trick (mirage, whirl, swirl), drop the gerund `-ing` for descriptions: `miraging→mirage`, `whirling→whirl`. Other gerund modifiers stay as-is (`Ducking-`, `Spinning-`, `Stepping-`, `Tapping-`, `Barraging-`, `Symposium-`).
- **Stalls / delay surfaces:** `"X-based delay surface."`: e.g. `Toe-based delay surface.`, `Heel-based delay surface.`, `Outside-of-foot delay surface.`
- **Body primitives:** short mechanical motion sentence: e.g. `Inside-leg jumping motion.`, `Jumping leg-over motion.`, `Double rotational body spin.`, `Inward rotational body move.`
- **Base tricks (irreducible):** terse mechanical sentence: e.g. `Cross-body inside delay.` (clipper), `Rotational dexterity move.` (whirl), `Inside-to-outside delay combination.` (osis).
- **Sentence form:** capitalized first word, terminating period. One sentence.

#### Write surfaces for active descriptions

The active dictionary descriptions live in two CSVs, both loaded into `freestyle_tricks.description`:

- `freestyle/inputs/noise/tricks.csv`: canonical baseline, loaded by `freestyle/loaders/17_load_trick_dictionary.py`. Holds most active tricks. Rows with notes containing commas must be CSV-quoted.
- `freestyle/inputs/curated/tricks/red_additions_2026_04_20.csv`: Red Husted overlays, loaded by `freestyle/loaders/19_load_red_additions.py`. Holds body primitives (`flying-inside`, `flying-outside`, `hop-over`, `walk-over`, `double-spin`, `spyro`), set primitives (`toe-stall`, `heel-stall`, `outside-stall`), and a handful of compounds (`sidewalk`, `tombstone`, `fury`, `vortex`, `surging`).

**Never write descriptions directly to `database/footbag.db`**: `scripts/reset-local-db.sh` wipes them on next reload. Edit the canonical CSV; verify by running script 17 (and 19 if applicable) against a fresh schema-only temp DB before claiming the change is durable.

---

## 2. Modifier Layer

**Single-authority rule (operator / modifier doctrine).** `src/content/freestyleOperatorReference.ts`
is the CANONICAL source for every operator / modifier's ADD value, structure, and X-Dex behavior.
All other operator/modifier-describing surfaces are SECONDARY and must stay consistent with it:
`freestyleMovementSystems.ts` (composition glosses), `freestyleStructuralFactNotes.ts`,
`freestyleOperatorGrammar.ts`, the DB `freestyle_trick_modifiers` registry, and the public glossary
operator/modifier text. When operator doctrine changes, edit `operatorReference.ts` first, then bring
the secondary surfaces into line; never let a secondary surface assert a value or behavior that
contradicts it. Drift between them is a bug (this is what produced the retired "+2 rotational" /
"hidden dex" / X-Dex-conflation text on the atomic detail pages).

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
- **The `surging` row in the dictionary** remains a standalone compound (decomposes to `spinning + stepping`, no base trick); it is NOT a modifier. As a standalone trick it is **3 ADD** (`surging` + toe stall, following the pixie / fairy / pendulum / double-fairy set-standalone convention); its operator/set contribution stays **+2** (spinning + stepping). This preserves the named-trick identity while keeping the modifier table strict.

---

## 3. Alias / Naming Layer

Use aliases for naming evolution, abbreviations, and alternate terms.

Examples:

- Toe Blur → Stepping Paradox Mirage (per James pt10 adjudication 2026-05-10; supersedes the earlier Red pt2 "Quantum Mirage" reading which gave 3 ADD vs asserted 4: see pt10 candidate-core resolution)
- Toe Ripwalk → Quantum Butterfly
- Spyro → Inspin
- PS Whirl → Paradox Symposium Whirl

Rules:

- Modern community name should generally be canonical.
- Older names become historical aliases.
- Descriptive names can be aliases for named tricks.
- Do not merge identities silently when terminology is ambiguous.

### 3a. Positional identity by configuration (resolver contract + invariant)

Positional qualifiers (`same-side` / `near` / `far` / `opposite` / `ss` / `op`)
are STRUCTURAL, not lexical. They are never stripped from the slug. A positional
name's identity is its resolved side-configuration (the SAME/OP markers across its
side-bearing components), not the qualifier-stripped name. App-side slug
resolution preserves the qualifier, matching the loaders. Full doctrine:
`CANONICALIZATION_POLICY.md` companion note `POSITIONAL_IDENTITY_BY_CONFIGURATION.md`.

**Core rule:** a fixed relationship in notation is INSUFFICIENT evidence for
multi-component identity collapse. Multi-component positional aliases require an
explicit curated equivalence row; the resolver may not infer them autonomously.

A component is a side-bearing DEX or the CATCH; "independently variable" means
there are >= 2 dexes, or a marker is ambiguous (SAME/OP). The configuration
resolver classifies a positional name into exactly one status:

- **SAFE_ALIAS** — resolves to the base. Autonomous only for single-component
  identities (component_count <= 1); multi-component requires a curated equivalence.
- **DISTINCT_VARIANT_CANDIDATE** — multi-component, unique target, new config not
  matching any existing canonical.
- **AMBIGUOUS_MULTI_COMPONENT** — multi-component with >= 2 candidate targets.
- **COLLISION** — derived config equals an existing different canonical (alias to
  that canonical, not the base) or the positional slug is already taken.
- **NO_NOTATION** — base has no operational notation; cannot resolve.
- **NEEDS_CURATED_EQUIVALENCE** — fixed/redundant-looking multi-component config
  with no curated equivalence row; held until a curator asserts the equivalence.

**Invariant (regression guard for future contributors):** the resolver MUST NEVER
emit SAFE_ALIAS when `component_count > 1` unless an explicit curated equivalence
exists (a `freestyle_trick_aliases` row mapping the positional slug to the base).
The resolver READS curated equivalences from the materialized
`freestyle_trick_aliases` (sourced from `trick_aliases.csv` + `red_additions`); it
never writes them, and is authoritative for classification only, never for
automatic multi-component collapsing.

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

**Status (2026-05-29 media ingestion sprint, curator-ruled):** the three `freestyle_media_*` tables described below are the LEGACY curated-media graph and are being DEPRECATED under Phase E (table + loaders 21/22/23 removal). The TARGET is the unified `media_items` + `media_tags` + curated-sidecar + `SOURCE_TIER` model; the polymorphic media→entity edge concept is preserved as namespaced tag conventions, not as the legacy tables. Do NOT build new curated media on `freestyle_media_*`. See `exploration/freestyle-media-ingestion-2026-05-29/ARCHITECTURE.md` (target model + §3a indirect-coverage layer) and HANDOFF.md. The paragraph below is retained as historical context for migration/reconciliation only.

Curated reference media (videos and images) attached to tricks, players, events, and records lives in three tables: `freestyle_media_sources`, `freestyle_media_assets`, `freestyle_media_links`. Member-uploaded gallery content (`media_items`, `media_flags`, `media_tags`) is a separate, parallel system: never merge the two.

Rules:

- **Curated trick media stays separate from member `media_items`.** Two parallel layers, never merged. Mixing breaks GOVERNANCE layer separation.

- **`end_seconds` is load-bearing for multi-trick media sources.** May be NULL on simple full-asset clips, but is the only mechanism by which one source asset (TT1/TT2 DVD, multi-section tutorial, slow-mo extract) spawns many distinct clip-links. Snippet timing lives on `freestyle_media_links`, never a separate segments table. Never drop the column.

- **Trick-primary clip logic is provisional.** The partial unique index `(entity_type, entity_id) WHERE is_primary=1` enforces one primary per entity. Current generator picks primary by record `value_numeric` desc, tiebreak by `media_id` asc: biased toward record clips over tutorials. Will need refinement when tutorial / slow-mo / demo clips arrive in volume. Do not solve speculatively.

- **Verify external URLs before reviewer sign-off.** Extrapolated URLs sit in staging with `reviewer` blank; they must be HTTP-confirmed before promotion. Pattern-form-from-a-working-URL is a guess, not verification.

- **Two-lane staging model.** `freestyle/tools/trick_video_discovery/video_coverage.csv` is the record-clip lane. `freestyle/tools/trick_video_discovery/snippet_candidates.csv` is the trick-tutorial lane. Generator filters on `reviewed=YES` and `reviewer != ''` respectively; nothing else promotes.

- **`clip_type` is staging-only.** Values `tutorial / demo / record / slow_mo / compilation`. Drives reviewer triage and primary-policy biasing. Not persisted to DB.

### Source URL patterns (verified)

- **FootbagSpot tutorials**: `https://footbagspot.com/tutorials/v/{hash-or-slug}` for individual videos. `/tutorials/{category}` for category landing pages. Speculative `/tutorials/{slug}` URLs all 404: do not extrapolate.

- **YouTube oembed verification**: `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={id}&format=json` returns title + author_name in JSON; HTTP 400 if id is malformed (YouTube IDs are exactly 11 chars; 12-char inputs are typos). Use this to confirm any new YouTube URL before append.

- **WorldFootbag channel inventory recipe**: `yt-dlp --flat-playlist --dump-json https://www.youtube.com/@WorldFootbag/videos` is the authoritative way to enumerate the Tricks-of-the-Trade lesson series (42 lessons #1-#42, no gaps). See memory `reference_worldfootbag_channel.md`. Google web search returns ~10-15 of the 42 only.

### Source registry (`media_sources.csv`) and tutorial-tier classification

The `tutorial-tier` set in `freestyle/loaders/24_qc_freestyle_media_coverage.py` `TUTORIAL_SOURCES` is load-bearing for the coverage dashboard: a primary link counts as `STRONG_TUTORIAL` only if its `source_id` is in this set. Update both `media_sources.csv` and the script's set when registering a new trusted-tutorial source.

Currently registered (2026-05-03): `anz_trikz`, `tt_youtube`, `footbagspot_passback`, `footbagspot_tutorials`, `shred_global`, `footbag_foundations`, `polini_pointers`, `everything_footbag`, `flipsider_footbag`, `footbag_finland`. Record / performance source: `passback_records` (classified `WEAK_RECORD`).

Source priority for primary selection:
1. AnzTrikz single/double-trick tutorial (`anz_trikz`)
2. TT / Tricks of the Trade single-trick lesson (`tt_youtube`)
3. PassBack tutorial (`footbagspot_passback`)
4. Other verified tutorial source (`footbagspot_tutorials`, `polini_pointers`, `footbag_foundations`, `everything_footbag`)
5. Demonstration-tier source (`shred_global`, `flipsider_footbag`, `footbag_finland`): single-trick demos; no teaching breakdown. Per Phase 2b 2026-05-10, `shred_global` moved from tutorial-tier to demo-tier; SOURCE_TIER in `freestyleService.ts` is the load-bearing classification.
6. Record / performance clip (`passback_records`): never primary if a tutorial alternative exists

### Primary-promotion rules (load-bearing: applied before every media-link write)

A media row may be promoted to `is_primary=1` only if all five hold:

1. The target trick is **active** (`is_active=1`).
2. The video clearly teaches or demonstrates that specific trick.
3. The source is in the `TUTORIAL_SOURCES` tier above.
4. The current primary is missing OR is a record / demo / performance clip.
5. Promotion creates no duplicate primary (partial unique index enforces, but plan around it).

Do NOT promote if:
- Target trick is pending (`is_active=0`); use `is_primary=0` only.
- Video is a montage, drill, record, or shred run.
- Title is generic (e.g., "Double Dexes": does not name a specific trick).
- Target trick is not explicitly central to the video.
- Current primary is already a strong tutorial.

Multi-trick tutorials: promote only when each target trick is **explicitly named in the title** (e.g., "Mirage & Illusion" → primary for both; "Pixie & Fairy" → primary for both; "DLO & Eggbeater" → primary for both). Generic titles like "Double Dexes" stay secondary regardless of source.

### Reset-compatibility classification (HOLD / STAGED / SAFE)

Before appending any `media_links.csv` row, classify the target slug against a fresh-reset load (scripts 17 + 19 + 21-media + 22 + 23: note `script 21_load_footbag_org_pending_tricks.py` is **not** in `reset-local-db.sh`):

- **SAFE**: target slug active in `freestyle_tricks` after reset (loaded via 17 or 19). Append immediately; primary or secondary per the promotion rules.
- **STAGED**: target slug exists as pending after reset (`is_active=0`). Append only with `is_primary=0`; loader allows pending links; public UI hides via the `is_active=1` filter on `freestyleTricks.listAll/getBySlug/listByFamily`.
- **HOLD**: target slug does NOT exist after reset. Do NOT append yet. First add the canonical row to `red_additions_2026_04_20.csv` (or `tricks.csv` for curated baseline) so it loads via 17/19; only then is the link SAFE or STAGED.

The 193 footbag.org pending rows (loaded historically by `21_load_footbag_org_pending_tricks.py`) survive in live prod DB but vanish on any reset. Do not assume their slugs exist; check via the dashboard.

### Coverage dashboard

`freestyle/loaders/24_qc_freestyle_media_coverage.py`: read-only dashboard generator. Default mode builds a fresh schema-only temp DB and runs the reset-compatible loader chain; `--db <path>` runs against an existing DB. Outputs `legacy_data/reports/freestyle_media_coverage.csv` (one row per `freestyle_tricks` slug; 17 columns including `primary_strength`, `status`, `priority_bucket`) and a markdown summary on stdout.

Four validation checks (non-zero exit if any fail): run before every media commit:
1. No duplicate primary per `(entity_type='trick', entity_id)`.
2. No `media_links.entity_id` points to a missing trick slug after reset (catches orphans from HOLD-tier targets).
3. Pending tricks with media all have `is_primary=0`.
4. Report row count == `freestyle_tricks` total.

Status values: `ACTIVE_STRONG_PRIMARY`, `ACTIVE_WEAK_PRIMARY`, `ACTIVE_NO_PRIMARY`, `PENDING_WITH_MEDIA`, `PENDING_NO_MEDIA`. Priority buckets: `COMPLETE`, `CORE_GAP` (core trick with no primary), `WEAK_CORE` (core with record-only), `PENDING_REVIEW`, `LOW_PRIORITY`. Core-trick set is a load-bearing constant in the script; update there when the editorial definition shifts.

---

## 5c. Navigation Layer (trick detail page)

The trick detail page (`/freestyle/tricks/:slug`) ships three navigation sections plus the family ladder, all driven by the active dictionary alone (no new tables, no new queries: the helpers run against the in-memory `allDictRows` already loaded for composition shaping).

Helpers live in `src/services/freestyleRelatedTricks.ts`. All three exclude `category='modifier'` and the current trick. Display order on the page: **Related Tricks → Previous Tricks → Next Tricks → Trick Family ladder.**

### Hashtag, trick name, and family navigation (load-bearing UX rule)

These surfaces have **different semantics**. Do not collapse them:

- **Trick name** = display text only, never a link.
- **Hashtag** = media-gallery link. `#spinning_whirl` (the slug `spinning_whirl` with a leading `#`) links to the trick's media gallery at `/media/browse?context=<slug>` when the trick has at least one media item, and renders as a plain non-clickable token otherwise; a clickable hashtag is the sole signal that media exists. The token is derived from the slug via `slugToHashtag(slug)` in `freestyleRecordShaping.ts`.
- **Trick Detail** = detail-page link. A distinct "Trick Detail" link beside the name opens `/freestyle/tricks/<slug>`, so name, hashtag, and Trick Detail are three explicit controls and a click's destination is never guessed.
- **Family navigation** = separate UI element. A small `family-badge` in the trick-detail hero links to `/freestyle/tricks?family={trick_family}`. Family-card titles on the dictionary index also link there. The filter pill at the top of a filtered index includes a clear-filter link.

Forbidden:
- Hashtags must NOT trigger family filtering.
- Slug-prefix matching for filtering (e.g. a `paradox` slug prefix) is NOT used. Filter narrows on `trick_family` only.
- Family selection must NOT be derived from a hashtag.

### `buildRelatedTricks`: broad navigation, cap = 8

Three rules in priority order. Within each rule's candidate set, ADD-bucket round-robin sampling (slug ASC tiebreak) ensures a low/mid/high mix; display order is concatenation R1 picks → R2 picks → R3 picks.

- **R1 same-family**: `trick_family = current.trick_family`. Strongest relationship.
- **R2 modifier-prefix**: slug starts with `{first-hyphen-segment}-` AND `trick_family != current.trick_family`. Yields nothing for single-segment slugs (base tricks). Captures cross-family modifier siblings (e.g. `paradox-mirage` ↔ `paradox-torque`).
- **R3 grandparent**: `current.base_trick → that row's base_trick → if active, non-modifier, family differs → include`. Gated: fires only when **R1 + R2 < 6** and the candidate is not already included. Yields at most 1 result. Captures structural ancestors (e.g. `atomic-torque → torque → osis`).

### `buildNextTricks`: family-scoped progression by ADD, cap = 5

Strict same-family. `adds > current.adds`. Group by ADD, slug ASC within bucket, **take ≤2 per bucket**, flatten ASC. The per-bucket cap is load-bearing: without it, a heavily-populated 4-ADD bucket (whirl family has five) would fill the cap and bury 5+ ADD tiers entirely. With per-bucket-2, `spinning-symposium-whirl` (6 ADD) stays visible.

**Cross-family progression is intentionally out of scope.** ADD comparisons across families would imply real-world difficulty equivalence we cannot guarantee. Cross-family exploration belongs in `buildRelatedTricks`.

### `buildPreviousTricks`: family-scoped regression by ADD, cap = 5

Mirror of Next Tricks. `adds < current.adds`. Same per-bucket-2 sampling, but flattened **DESC** (closest easier first).

**Family-base tiebreaker** (only on Previous Tricks): within each bucket, the row whose `slug == current.trick_family` is sorted first, then alphabetical for the rest. This guarantees foundational base tricks like `whirl` surface in their compounds' Previous Tricks lists. Without it, `spinning-whirl`'s 3-ADD bucket would alphabetically yield `rev-up, rev-whirl` and bury `whirl` (the family base, also 3 ADD) entirely.

The tiebreaker is intentionally **not** applied to Next Tricks: base tricks have the lowest ADD in their family by definition and are never eligible as "next" candidates.

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

`freestyle_tricks` rows with `category='modifier'` (e.g. `paradox`, `gyro`, `barraging`, `blazing`) are excluded from the public category groupings on `/freestyle/tricks`. The historical reason `freestyle_tricks` carries modifier-category rows is composition: they're FK targets for `freestyle_trick_modifier_links`. They stay in the table; they just don't render as tricks.

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
