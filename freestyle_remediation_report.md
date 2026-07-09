# Freestyle Remediation Report

Adversarial audit of the entire Footbag Freestyle area against this repository's own standards, plus a consolidation of every Freestyle-related `IMPLEMENTATION_PLAN.md` item. Produced 2026-07-07. The audit itself ran read-only (live dev server on localhost:3000, read-only SQLite queries, static analysis); after the maintainer ratified the consolidation the same day, one companion edit was executed with explicit approval: the freestyle to-do items were deleted from `IMPLEMENTATION_PLAN.md` (the complete accounting is section 14). The repository artifacts of this work are therefore this report and that plan edit, nothing else. This report is standalone: a reader with only this file and the repository can act on every item.

Severity scale: P0 must fix before go-live; P1 must fix before launch signoff; P2 should fix before launch or external testing; P3 non-blocking cleanup. Each backlog task carries audience and action-type tags.

---

## 1. Executive verdict

**Launch readiness: no P0 defects on the deployed surface; launch now gates on the freestyle curation cutover (ratified as launch scope, see below) plus four P1 clusters.**

**Maintainer-ratified decisions (2026-07-07 plan review).** These were open questions when the audit ran; they are now decided and every affected item below reads accordingly:

1. **One source of truth.** Pre-go-live the curated CSVs under `freestyle/inputs/` are the source of truth and the database is disposable. At go-live the live database becomes the single source of truth for freestyle content, mirroring the curated-media cutover model, and the CSV pipeline permanently retires from the production path.
2. **The full in-app freestyle curation feature is launch scope.** The plan's deferred item "there is no in-app way to edit the trick dictionary" moves into the launch track: curated-media-style admin writes, production guard, audit log, and rollback, built and tested before go-live. Without it, content would be frozen after cutover; the maintainer chose to close that gap before launch rather than accept a freeze.
3. **Cleanest final model, minimal redirects.** One canonical URL per trick; internal links always use canonical slugs; alias redirects exist only as a safety net for external links; no duplicate rendering; data stored in its correct form rather than repaired at render time.
4. **`exploration/` must prove a real use or be retired at go-live.** Live dependencies (the symbolic-grammar generator inputs, the curator worklist the plan cites, the Glossary V2 track) are relocated out first; the remaining corpus is retired at go-live with one consolidated approval.

An honest correction surfaced during review: the audit's original "launch-viable" wording understated the CSV-to-database cutover question. The deploy tooling replaces the entire database from a local rebuild (`scripts/deploy-rebuild.sh`), which stops being viable the moment production holds real member data; with in-app curation deferred, there would have been no defined way to ship a freestyle content change after go-live at all. Decision 2 closes that hole.

- **Live page coherence: strong.** All 29 mounted routes serving freestyle (28 `/freestyle/*` route paths, counting the search page and its JSON suggest endpoint separately, plus the `/media/freestyle-tutorials` redirect) return correct statuses on localhost: 200s, the designed redirects (the `/freestyle/families` 302 to the family browse view, the `/media/freestyle-tutorials` 301, and the slug-level 301s on modifier and migrated-set slugs), and 404s on garbage slugs. No dead internal links were found on any audited page; no stale "Coming soon" labels exist (the one on `/freestyle/media` is accurate). Novice on-ramps (landing, learn, about, tricks-index onboarding) are genuinely good; expert trust signals (provenance footers, recorded-vs-canonical ADD caveats, source citations) are consistently present.
- **Repo-standard compliance: good bones, four real defect clusters.** SQL discipline, `is_active` filtering, error classes, template mechanics, CSS vocabulary, and logging are all clean. The defects: trick-alias URLs render duplicate pages instead of redirecting (FS-01); rendered copy uses em dashes at scale, which the view-layer rule bans (FS-05); the controller copy-pastes its 404 literal four times (FS-07); a sprint label is baked into an exported identifier used at 10+ sites (FS-08). Freestyle test files carry epoch/date labels in 86 of 198 files (already tracked in the plan, quantified here).
- **DB / source-of-truth: proven clean at runtime, unguarded at build time.** Runtime provably reads only SQLite and compiled content modules; no code in `src/` reads pipeline CSVs or writes `freestyle_*` tables. But no loader has any production guard (FS-02), two generated content files have no drift guard and one is an orphan (FS-10), and the symbolic-grammar CSVs become unregenerable if `exploration/` is archived (ratified DC-5: relocate the generator inputs first).
- **Pre/post-go-live curation: the pre-go-live model is coherent (edit committed CSVs, rebuild); the post-go-live half does not exist and is now LAUNCH SCOPE (ratified decision 2, task FS-19).** The database becomes the single source of truth at cutover, so in-app curation must exist before launch; the production guard (FS-02) is its first piece.
- **User stories: 0 of 29 routes have a dedicated story;** four are partially touched by `V_View_Trick_Reference_Videos`. Story authoring is now a launch blocker (FS-16): the launch-scope curation feature cannot be built without grounding stories, per the repo rule that no schema or service code lands without one. Section 9 supplies the proposed story list.
- **Tests: deep on routes and rendering contracts (118 integration + 30 unit freestyle files), but the safety nets have holes:** the dead-link crawl deliberately excludes freestyle pages; the browser click-through and the accessibility scan each include the freestyle landing as their only freestyle page (the scans themselves cover about ten public pages); no mobile-viewport assertions exist anywhere in the e2e suite; the alias-URL behavior is unpinned; and the naming invariant is not enforced (the search suite even seeds slugs in the wrong convention).
- **Freestyle to-do items live HERE, not in IMPLEMENTATION_PLAN.md.** The audit found and verified 35 freestyle-related plan items: 27 actionable items (26 verified accurate, 1 materially stale), 2 standing context blocks, and 6 post-V1 vision directions. All of them are now consolidated into this report's backlog (section 13, tasks FS-01..FS-36 plus the vision block; per-item mapping in section 14) and deleted from the plan. The plan retains only the freestyle standing rule, the standing summary, and a pointer to this report.
- **Top risks:** (1) an accidental `run_freestyle.sh` against the production DB after go-live silently DELETE+INSERTs every dictionary table with no guard; (2) the freestyle skills teach a wrong slug convention and cite eight dead memory files, actively misleading future agents; (3) duplicate-content alias URLs at launch.
- **Top fixes:** Batch E (stories, gating everything schema-shaped) and Batch A (alias redirect + loader guard) first, then Batch J (the launch-scope curation cutover feature), Batch F (crawl inclusion + e2e/a11y/mobile + naming-invariant test), Batch H (skills corrections), and Batch B (copy standard sweep). Full batch definitions in section 15.

## 2. Scope and method

**In scope:** all 28 mounted `/freestyle/*` route paths (the search page and its JSON suggest endpoint counted separately) plus the `/media/freestyle-tutorials` redirect, 29 mounted routes in all; `freestyleController.ts`; `mediaController.freestyleMedia`; `freestyleService.ts` and 18 supporting services; 52 `src/content/freestyle*.ts` modules; 27 views in `src/views/freestyle/` and ~45 freestyle partials; `freestyle-trick-search.js`; freestyle statement groups in `src/db/db.ts`; the `freestyle/` pipeline (orchestrator, 8 loaders, 3 QC scripts, scripts, inputs, symbolic_grammar, doctrine, tools); 20 freestyle/symbolic tables in `database/schema.sql`; the freestyle test corpus (118 integration + 30 unit freestyle-named files; 198 freestyle-touching); the five freestyle-relevant skills (audited as subjects, not used as authority, per maintainer instruction in this run); all freestyle docs and doctrine; `exploration/` disposition; every Freestyle-related `IMPLEMENTATION_PLAN.md` item.

**Out of scope (dropped per the audit charter):** delivery infrastructure (CDN, DNS, hosting), non-freestyle code, re-architecture beyond conforming to existing repo standards, external/web research. Curated-media code was consulted only as the conformance yardstick.

**Method:** standards loaded first (root and nested `CLAUDE.md`, the eight path-scoped rules whose globs reach freestyle paths, canonical docs including `docs/DATA_GOVERNANCE.md`, `docs/TESTING.md`, `docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md`, `freestyle/doctrine/*`). Then: live curl sweep of every route and variant against `./run_dev.sh` (code-only mode); read-only `sqlite3` queries against `database/footbag.db` (row counts, orphan joins, naming-invariant scans); grep-based static analysis (runtime disk reads, SQL discipline, comment rules, em dashes, exploration references); template and service reading for the persona walkthroughs; six parallel read-only exploration subagents whose findings were re-verified in the main thread before entering this report. Localhost URLs exercised: every route in section 3, all 8 `?view=` variants, alias/garbage slug probes, and representative trick/set/family/modifier detail pages. During the audit no file outside this report was written, no loader, migration, or DB-mutating command was run, no git commands, no browser automation. The one post-audit exception, executed after ratification under explicit maintainer direction: the `IMPLEMENTATION_PLAN.md` consolidation edit described in section 14.

**Terms used in this report** (defined so a reader needs no prior project context):
- **ADD** ("adds"): the additive difficulty value of a trick, the number of difficulty components it contains; stored per trick in `freestyle_tricks.adds`. Modifier ADD bonuses live in the separate `freestyle_trick_modifiers` registry.
- **Dex**: a dexterity component (circling the bag with a foot mid-trick), one of the countable difficulty components.
- **Jobs notation**: the community's structural movement notation (named for Ben Job's 1995 proposal, reproduced at `/freestyle/notation-article`); stored as opaque text per trick.
- **Set**: a named entry movement primitive (pixie, fairy, atomic, quantum, ...) that tricks compose from; sets have their own encyclopedia pages.
- **Operator / modifier**: a transformation applied to a base trick (spinning, ducking, paradox, ...). "Operator" and "modifier" are used interchangeably on the public surface.
- **Trick family**: the structural grouping keyed by a trick's terminal mechanic (whirl, butterfly, mirage, ...), stored in `freestyle_tricks.trick_family`.
- **Slug / hashtag / display name**: a trick's URL token (lowercase underscore form, e.g. `around_the_world`), its media hashtag (`#` plus the slug), and its human-readable name (the same words with spaces). The naming invariant says the three must correspond.
- **Curated media model**: the repository's reference curation architecture. Before go-live, committed files seed the database and object store; at go-live the database and object store become the source of truth, the seeder is barred from production, and edits happen through an admin surface with an actor guard and audit logging. It is the yardstick the freestyle dictionary now follows (ratified decision 1).
- **Cutover**: the go-live moment at which the live database replaces the committed CSVs as the source of truth for freestyle content.
- **The plan / IP**: `IMPLEMENTATION_PLAN.md`, the repository's operational to-do document. Line references (line 94, etc.) refer to its state on 2026-07-07, before the consolidation edit this report directed; after that edit the plan carries no freestyle to-do items and this report is the single home for freestyle work.
- **Red (Red Husted)**: the sport's rules expert; open doctrine questions await his answers in `freestyle/doctrine/RED_QUEUE.md`.
- **The curator / James**: the historical-pipeline and freestyle content maintainer. **Dave**: the primary platform maintainer.
- **Personas**: "novice" is a hacky-sack-curious visitor with zero freestyle knowledge; "expert" is a top competitive player who needs precise trick identity, ADD, notation, records, and sources.
- **`run_dev.sh` / `run_freestyle.sh`**: the local development launcher, and the freestyle database rebuild orchestrator that loads the committed CSVs.
- **IFPA**: the International Footbag Players Association, the sport's governing body and the owner of footbag.org; this platform is its site rebuild.
- **Sick 3 / Shred 30**: timed freestyle competition formats; the IFPA owes the official rules wording for Sick 3 (task FS-33). "Sick3 sequences" on the insights page are archived competition sequences from that format.
- **BAP (Big Add Posse)**: the community honor roster for players who have hit high-difficulty milestones; its "Individual Shred Collection" is a curated set of 72 player videos (task FS-30).
- **PassBack**: an external freestyle tutorial video source whose clips are curated into the media galleries; also the origin of the "PassBack" trick-name readings the dictionary reconciles against.
- **Holden**: an external archival reference of freestyle sets (the "Holden archive"), used as a source and consistency yardstick on the sets pages.
- **Plan tags** ([KANBAN], [PRE-KANBAN], [BLOCKED], [DEVIATION], [Q]): `IMPLEMENTATION_PLAN.md`'s category tags, which seed the go-live kanban board; "pre-Kanban" means "must be resolved before that board launches".
- **Deployed-surface taxonomy**: the repo rule (`.claude/rules/deployed-surface.md`) that classifies every feature by deployment status; its bucket "runtime feature without a story id" means deployed code with no covering user story, which is a coverage gap to close by writing the story.

**Verification discipline:** every finding below was re-checked against its evidence in a post-pass; conflicting subagent claims were resolved by direct re-testing (notably: one agent reported zero rendered em dashes by grepping the literal character; the `&amp;mdash;` entity count and a live page fetch proved the violations real). Speculative items were dropped or explicitly downgraded to "for author confirmation."

## 3. Freestyle surface inventory

All routes are mounted on the public router in `src/routes/publicRoutes.ts`; literal routes register before `:slug` catch-alls (correct ordering, test-pinned). Handler is `freestyleController` unless noted. Live status from this run's curl sweep. Counting convention used throughout this report: 29 mounted routes serving freestyle, being 28 `/freestyle/*` route paths (the table below groups `/freestyle/search` with its JSON suggest endpoint on one row) plus the `/media/freestyle-tutorials` redirect.

| Route | Live | Template | Test coverage (representative) | Dedicated story |
|---|---|---|---|---|
| `/freestyle` | 200 | `landing.hbs` | `freestyle.tricks-landing.routes`, `landing-cards.routes` | none |
| `/freestyle/tricks` (+8 `?view=`) | 200 all | `tricks.hbs` | per-view suites + `dictionary-trick-card.routes` (card contract) | partial (filters/search as links only) |
| `/freestyle/tricks/:slug` | 200; 301 for modifier/operator and migrated-set slugs; 404 garbage | `trick-shell.hbs` + ~40 partials | `trick-detail-*.routes` + many per-trick probes | partial (media section only) |
| `/freestyle/search` + `/search/suggest` | 200 | `search.hbs` + JSON | `trick-search.routes` | partial (search box is a link) |
| `/freestyle/records` | 200 | `records.hbs` | `freestyle.routes` | none |
| `/freestyle/leaders` | 200 | `leaders.hbs` | `freestyle.routes` | none |
| `/freestyle/competition` | 200 | `competition.hbs` | `record-linkage.routes` | none |
| `/freestyle/partnerships` | 200 | `partnerships.hbs` | `freestyle.routes` | none |
| `/freestyle/history` | 200 | `history.hbs` | `freestyle.routes` | none |
| `/freestyle/about` | 200 | `about.hbs` | `freestyle.routes` | none |
| `/freestyle/add-analysis` | 200 | `add-analysis.hbs` | `add-analysis.routes`, `add-view-*.routes` | none |
| `/freestyle/combo-analysis` | 200 | `combo-analysis.hbs` | `combo-analysis.routes` | none |
| `/freestyle/insights` | 200 | `insights.hbs` | `tricks-insights.routes` | none |
| `/freestyle/sets` | 200 | `sets-encyclopedia.hbs` | `sets-encyclopedia.routes` | none |
| `/freestyle/sets/:slug` | 200; 301 legacy alias; 404 garbage | `set-detail.hbs` | `set-detail.routes` | none |
| `/freestyle/sets/reference` | 200 | `moves.hbs` | `freestyle.routes` | none |
| `/freestyle/compositional-sets` | 200 | `compositional-sets.hbs` | `compositional-sets.routes` | none |
| `/freestyle/glossary` | 200 | `glossary.hbs` | 20 `glossary-*.routes` files | none |
| `/freestyle/notation-article` | 200 | `jobs-notation-article.hbs` | `notation-article.routes` | none |
| `/freestyle/operators` | 200 | `operators.hbs` | `operators.routes` | none |
| `/freestyle/observational` | 200 | `observational.hbs` | `observational.routes`, `emerging-view-redirect.routes` | none |
| `/freestyle/learn` | 200 | `learn.hbs` | `symbolic-*` suites | none |
| `/freestyle/progression/walking-family` | 200 | `walking-progression.hbs` | `walking-progression.routes` | none |
| `/freestyle/modifier/:slug` | 200 (family or stub); 404 garbage | `modifier-family.hbs` / `modifier-stub.hbs` | `modifier-family.routes` | partial (redirect target named) |
| `/freestyle/families/:slug` | 200; 404 garbage | `family-detail.hbs` | `family-detail.routes` + named-family probes | none |
| `/freestyle/families` | 302 to `?view=family` | (redirect) | controller test | none |
| `/freestyle/media` | 200 | `media.hbs` (mediaController) | `trick-media-link.routes` | none |
| `/media/freestyle-tutorials` | 301 to `/freestyle/media` | (redirect) | route test | n/a |

**Alias behavior on `/freestyle/tricks/:slug` (finding FS-01):** naming-alias slugs (`atw`, `leg_over`, `catwalk`, `datw`; 380 alias rows exist) render the full canonical trick page at 200 under the alias URL, with a self-referencing canonical tag pointing at the alias URL. Modifier/operator slugs and migrated sets do 301 (`freestyleService.trickRouteRedirectTarget`, `src/services/freestyleService.ts:10082-10091`).

**Data behind the surface (this run's counts):** `freestyle_tricks` 962 rows (922 active: 886 expert_reviewed + 36 curated; 40 inactive including 9 pending), `freestyle_trick_aliases` 380, `freestyle_trick_modifiers` 35, `freestyle_trick_modifier_links` 1007, `freestyle_trick_sources` 3, `freestyle_trick_source_links` 1240, `freestyle_trick_relations` 0, `freestyle_trick_tips` 419 (409 published), `freestyle_records` 204, `consecutive_kicks_records` 138, six `symbolic_*` tables populated. Referential integrity clean: zero orphan aliases, modifier links, or source links. All nine active no-ADD rows are `category='modifier'`, consistent with modifier doctrine (their ADD rules live in `freestyle_trick_modifiers`).

**Readiness by route:** every route is launch-ready as rendered today, subject to the cross-cutting fixes in this report (alias redirect, copy sweep). No route is broken, empty, or misleading at the P0 level.

## 4. Persona UX audit

### 4.1 Page-flow graph

Nodes: the 27 rendered pages above. Edge summary (from template link/form analysis, spot-confirmed live; every checked destination resolved 200):

- **Landing** fans out to: tricks, glossary, sets, operators, observational, add-analysis (tile grid 1); records, leaders, competition, partnerships, combo-analysis, insights, about (tile grid 2); foundations mosaic (media gallery + trick links); by-the-numbers cards to `?view=` states; media; history (+3 anchors).
- **Tricks index** carries: search form to `/freestyle/search`; a 6-entry view toggle (By ADD, By family, By movement system, Movement Neighborhoods, By dex count, By modifier); onboarding links to learn and four glossary anchors; per-row trick detail links; family-filter state with "Clear the filter"; source-note to add-analysis. `?view=component` and `?view=category` are soft-retired by design (retirement notices link forward; reachable only by bookmark; not a gap).
- **Trick detail** carries: media-gallery chip (only when media exists, per the hashtag rule), family chip, structural links to movement-system/topology anchors and modifier pages, pathways (Learn/Watch/Family), glossary notation anchor, records table, source-note to records + tricks.
- **Reference pages** interlink densely (sets encyclopedia to set details to compositional sets to operators to modifier pages; glossary anchors are the connective tissue; about links out to five surfaces).
- **Dead ends: none**, with one near-exception: `/freestyle/search` with no query renders only the search box, with no suggestions or onward links (finding FS-09e).
- **Links to non-mounted routes: none found.**

### 4.2 Per-page dual-persona findings

Every page was reviewed under both personas (novice hacky-sack visitor; expert/top pro). Pages with no findings under a lens are listed as clean. Quotes are exact rendered text.

| Page | Novice lens | Expert lens |
|---|---|---|
| Landing | **Strong.** Plain subtitle ("Learn the movements, watch the sport, and explore the trick vocabulary."), plain lede, glossed tiles ("Emerging Vocabulary" tile carries the blurb "New trick names still being confirmed."). | Good jump-offs to records/leaders/add-analysis. Clean. |
| Tricks index (default) | **Best-in-class.** Orientation-first intro, then a "New to freestyle? Start here." onboarding block with plain ADD/Dex/Family/Modifier definitions and a build-up example, then the corpus count. | ADD tiers, formulas, jump chips all present. Clean. |
| Tricks `?view=family` | **Fails the plain-words standard.** Intro reads "Family groupings cluster tricks that preserve a conserved terminal mechanic... same shallow structural skeleton (entry + dex + terminator)" (`freestyleService.ts:9360-9367`); "conserved terminal mechanic", "terminator" unglossed. The minor-lineages band ("Conserved-terminal lineages below the current first-class threshold of documented descendants", `tricks.hbs:399`) is worse. | Precise. Clean. |
| Tricks `?view=sets` / `movement-system` | Cross-lens notes say "different lenses on the same tricks" (`tricks.hbs:282, 575`); "lens" is exactly the internal vocabulary the view-layer copy standard names as to-avoid. | Clean; the topology and movement-system views correctly self-label "An exploratory view, not an official grouping." (`tricks.hbs:523, 573`). |
| Trick detail | Structural-facts rows carry plain-English notes (good). The visible "observational" badge is unglossed on-page (gloss lives only in a hover tooltip; hover is invisible on touch devices). | **Strong.** Movement then execution notation, expanded form, ADD derivation, records table distinguishing recorded vs canonical ADD with the canonical marked authoritative. Provenance deliberately curator-internal (designed). |
| Search | Intro orients well; empty initial state is a near dead-end (form only, no popular-tricks suggestions or onward links); empty-result copy is clear. | Alias match surfaced ("also: ..."), ADD shown, truncation honest ("Refine your search to narrow it."). Clean. |
| Glossary | 16 anchored sections and a reading-tier sidebar; the "observational" badge appears ~125 times with tooltip-only gloss. | Rich and precise. Clean. |
| Family detail (whirl) | **Strong** hook ("Whirl became the trick freestyle is built around, because it ends exactly where it begins..."). Eyebrow "Family Parent" is mild internal taxonomy, low harm. | Canonical formula, evolution axes, ADD-labeled members. Clean. |
| Modifier family (spinning) | Subtitle uses "operator" and "dex" unglossed on this surface (glossed elsewhere). | Concept-first, notation section, IFPA-classification disclaimer. Clean. |
| Modifier stub (flying) | **Trust failure for both personas:** the status pill renders the raw internal label "Platform-tracked" (`modifier-stub.hbs:25`) with no plain meaning. Body copy itself is plain. | Same pill issue; otherwise precise. |
| Records | **Strong**: defines "consecutive record" in plain words before the table. | **Strong**: recorded-vs-canonical ADD caveat, unlinked-legacy-name note, unverified-attempt disclaimer. |
| Leaders | **No body intro**: hero straight to ranked table (`leaders.hbs:17-52`); a newcomer hits data cold. | Honest framing ("one lens on the sport", which also carries an em dash and the "lens" term). |
| Competition / Partnerships / History / About | Good intros, glossary links, plain definitions. Partnerships: "Apps" column header unglossed in the first table (spelled out only in the second). | Honest framing throughout. Clean. |
| ADD analysis | **Heavy for novices**: opens on a philosophy paragraph, "IFPA" unglossed, "stopping-depth equivalence" and similar terms undefined. | **Excellent**: mechanical derivations, source-labeled discrepancy cases, PassBack reconciliation. |
| Combo analysis / Insights | Good leads; insights hero-subtitle leads with a raw count and unglossed term: "Patterns observed in a documented archive of 395 Sick3 sequences". | Honest archive-scoped framing ("They describe the archive on hand, not the sport as a whole"). |
| Sets encyclopedia | Intro jargon-forward: "named uptime movement primitives the rest of the language composes from"; "uptime", "primitives" unglossed. Count correctly placed below intro. | **Strong**: provenance pills, flagship stars, question-led cross-nav. |
| Set detail | Dense but well-sectioned; migrated sets carry a genuinely novice-friendly "What it is / Why it exists" branch. | **Excellent** info order and audit-status footer. |
| Sets reference (moves) | Good "Reading Set Notation" primer mitigates inherently advanced content. | External source cited. Clean. |
| Compositional sets | **Most jargon-dense page in scope**: "compose from a small grammar", "uptime reinterpretation" with no beginner gloss. | **Strong**: Holden-vs-platform consistency audit, per-ladder citations. |
| Notation article | **No orientation at all**: h1 "By the Way, Not the Name", no subtitle or intro, only a muted "reproduced verbatim" line. A newcomer has no idea why this page exists. | High-value primary source (1995 Ben Job proposal) with full citation. |
| Operators | Good lead ("Modifiers are the transformations that turn one trick into many: a spin, a duck..."). | Decomposition notes, notation, detail links. Clean. |
| Observational | h1 is the internal term "Emerging Vocabulary" (the view-layer rule names this exact term as to-avoid in orientation copy); the hero-subtitle is one dense multi-sentence block against the short-sentences standard. | **Excellent**: nine-state distance-to-canonical ladder, per-row provenance, "not an official trick yet" repeated. |
| Learn | **Strongest novice on-ramp**: ordered six-foundations path, per-step lessons, planned entries clearly marked. | Canonical-reference footer. Clean. |
| Walking progression | Good; honest "does not change official IFPA family classifications" footer. | Clean. |
| Media | Clear card grid; the one "Coming soon" (Footbag.org folder) is accurate, not stale. | Clean. |

### 4.3 Whole-journey assessment

- **Novice journey (landing to understanding a first trick): passes.** Landing → Learn (ordered path) or About (plain-language definitions) or the tricks-index onboarding block → trick detail with plain structural notes. The weak spots are secondary pages a novice can wander into (compositional-sets, observational, notation-article, family view) where the copy assumes the internal vocabulary. None of these is on the primary on-ramp, so the journey passes with the copy fixes filed as FS-09.
- **Expert journey (precise identity, ADD, notation, records, sources): passes with no dead ends.** Records and leaders carry honest caveats; add-analysis, set-detail, and observational carry citations and audit tables; the notation article provides the primary source. The single expert-trust issues are the raw "Platform-tracked" pill and the tooltip-only "observational" gloss.

### 4.4 Coverage exceptions (explicit)

- Glossary: hero, structure, anchors, and badge prevalence reviewed; the ~2,400-line data-driven body was not read entry-by-entry under both personas.
- Trick detail: shell and all ~40 partials reviewed structurally plus three representative tricks live (core, compound, positional); the per-trick matrix of which optional partials render was not diffed for every trick.
- Soft-retired `?view=component` / `?view=category`: retirement notices reviewed; populated grids not evaluated as first-class experiences (by design).
- Search typeahead reviewed as server contract + JS source; live JS interaction not driven (browser automation disallowed this run).
- History and Learn bodies are service-data-driven; intros and structure reviewed, per-item link targets spot-checked, not exhaustively followed.

## 5. Code-pattern and repo-standard audit

Each finding names the violated standard. Clean checks listed at the end.

**FS-01 (P1, code + test; audience: novice/expert/maintainer). Trick-alias URLs render duplicate pages instead of redirecting.**
Evidence: `/freestyle/tricks/atw`, `/leg_over`, `/catwalk`, `/datw` return 200 with the canonical trick's full page and a self-referencing canonical tag pointing at the alias URL (live curl this run). `trickRouteRedirectTarget` (`src/services/freestyleService.ts:10082-10091`) redirects only modifier/operator-category rows and migrated sets. Sets DO 301 legacy aliases (`setDetail`), so alias handling is inconsistent across freestyle surfaces. 380 alias rows exist. No test pins the alias-URL behavior either way (`toe-blur-alias-collapse.routes.test.ts` pins alias display on the canonical page only). Not a tracked deviation in `IMPLEMENTATION_PLAN.md`.
Standard violated: slug/canonical handling as practiced by the repo (sets 301, modifiers 301) and the view-layer rule's single-canonical-token principle; SEO duplicate content with wrong canonicals.
Fix: extend `trickRouteRedirectTarget` to resolve `freestyle_trick_aliases` and 301 alias slugs to the canonical trick URL; add route tests for alias 301, canonical 200, garbage 404. (The alternative, keeping 200 rendering with a corrected canonical tag, was considered and rejected when DC-1 was ratified: one canonical URL per trick, minimal redirects.)

**FS-05 (P2, UX-copy; audience: novice/expert). Em dashes render in user-facing copy at scale.**
Evidence: 188 `&amp;mdash;` entities in freestyle templates outside Handlebars comments (grep this run), plus ~154 em-dash occurrences in service-shaped strings in `freestyleService.ts`; live confirmation on `/freestyle/leaders` ("who holds the most &amp;mdash; one lens on the sport", `leaders.hbs:55`). Further examples: `about.hbs:64`, `competition.hbs:121`, `moves.hbs:24,29`, `add-analysis.hbs:33,137,...`, `tricks.hbs:646`, `trick-shell.hbs:192`, `trick-equivalence-topology.hbs:45`, `sets-encyclopedia.hbs:97`. Also `--` double-hyphen dash substitutes in `trick-about.hbs:26`, `trick-next.hbs:8`, `trick-parallels.hbs:11`, `trick-substitutions.hbs:11`. Table empty-cell `&amp;mdash;` placeholders (records, leaders, competition, trick-records, trick-structural) are a judgment call; recommend keeping placeholders but standardizing them, since the ban targets prose.
Standard violated: view-layer rule, "Em dashes are restricted in the user-facing text a site visitor reads" (its sole home).
Fix: one sweep replacing prose em dashes with commas/parentheses/restructure across freestyle templates and service-authored copy; leave or standardize table placeholders per maintainer preference.

**FS-07 (P2, code; audience: implementing-developer). Controller inlines the same 404 literal four times and duplicates the delegate's mapping.**
Evidence: `freestyleController.ts:79-83` (trick), `:245-249` (setDetail), `:267-271` (familyDetail), `:364-368` (modifierFamily) each inline `res.status(404).render('errors/not-found', {...})`; `handleControllerError` (`src/lib/controllerErrors.ts:33-38`) already maps `NotFoundError` to the identical render, making the local branches dead-equivalent. `memberController.ts:54` shows the repo pattern (one shared `renderNotFound(res)` helper). Also `tricksIndex` (`freestyleController.ts:156-164`) carries a legacy-view redirect branch and a sort-mode ternary that controller conventions push into the service.
Standard violated: controller-conventions (thinness, error routing).
Fix: delete the redundant `NotFoundError` branches (delegate to `handleControllerError`), or if the explicit branch is preferred, factor one `renderNotFound` helper; move the `emerging` alias redirect decision and `addSort` derivation into the service.

**FS-08 (P2, code; audience: implementing-developer). Delivery-epoch labels in identifiers and comments.**
Evidence: exported identifier `RESOLVED_FORMULAS_SPRINT_1` (`src/content/freestyleResolvedFormulas.ts:116`), consumed at `src/content/freestyleAddAnalysisContent.ts:42,664` and 7 sites in `src/services/freestyleService.ts`. "Phase E" in the generated header of `src/content/freestyleObservationalUniverse.ts:3` (fix belongs in the generator, `freestyle/scripts/build_observational_universe_content.py`, which writes the header). Caller reference in `src/content/freestyleLandingContent.ts:15` ("see freestyleService.getLandingPage for the array"). The `S3/S5` labels in `freestyleSymbolicEquivalences.ts:38,648` may be domain set-slot notation rather than epoch labels; author to confirm before touching.
Standard violated: comments rule (sprint/slice/phase/wave labels forbidden everywhere, including identifiers as human-readable text; caller references forbidden).
Fix: rename the constant (e.g. `RESOLVED_ADD_FORMULAS`), regenerate the observational header without the phase label, drop the caller reference.

**FS-13 (P3, IP-cleanup; audience: implementing-developer). Test-comment epoch/date residue, quantified.**
Evidence: 86 of 198 freestyle-touching test files carry at least one violation of the stricter test-comment rule: 43 files with epoch labels (Slice A2/R1b, Wave 1-7, Phase C, Batch), 70 files with dates as change markers (e.g. `freestyleSymbolicEquivalences.test.ts:74` "flurry SE chain removed 2026-05-26 per S3/S5 governance migration"), 19 files with section-sign shorthands (the test rule bans them outright even for glossary anchors), finding/slot IDs (NR-1, R4, S9, R1b). Worst files: `freestyle.family-view-identity.routes.test.ts` (+extended), `freestyle.dictionary-trick-card.routes.test.ts:304-334` (a dated Wave changelog block), `freestyleSymbolicEquivalences.test.ts`.
Standard violated: comments rule, test section (stricter).
Status: already tracked as the post-V1 de-epoch item in `IMPLEMENTATION_PLAN.md`; this quantification feeds it. Not re-litigated per item.

**FS-15 (P3, code, post-V1; audience: maintainer). `freestyleService.ts` is a 2.6x size outlier.**
Evidence: 11,339 lines vs next-largest `identityAccessService.ts` 4,365, `curatorMediaService.ts` 3,145. It already delegates to 18 sibling modules and conforms to every mechanical rule; the size is a maintainability concern, not a correctness one.
Recommendation: no pre-launch action; a post-V1 extraction (records shaping, browse views, and trick detail are natural seams) if and when a slice touches those areas. Filed to keep the decision explicit.

**Checked and clean (all verified this run or by the conformance subagent with spot re-checks):** zero `db.prepare()` outside `db.ts` in freestyle code; positional `?` params only; the one SQL interpolation is a constant literal whitelist mirroring the events pattern; every public `freestyle_tricks` statement filters `is_active = 1` (the two status-agnostic statements are documented and minimal); all service throws are `NotFoundError` (ServiceError subclass); zero `console.*`; singleton object-literal service shape with conforming `get<Page>Page` methods returning `PageViewModel`; zero inline style/script/handlers, zero nested forms, zero multi-variable URL construction in templates; all `eq` branching is on pre-shaped view-state enums; all 814 distinct template classes resolve in `style.css`; the em-dash characters inside `{{!-- --}}` comments do not render.

---

## 6. CSV / database / source-of-truth audit

**Chain map (verified end to end):**

```
freestyle/inputs/curated/records/records_master.csv
  -> loaders/10 (INSERT OR IGNORE, additive)          -> freestyle_records
freestyle/inputs/curated/records/consecutives_records.csv
  -> loaders/11 (DELETE + INSERT)                     -> consecutive_kicks_records
freestyle/inputs/noise/{tricks,trick_modifiers,trick_aliases}.csv   [the curated BASE dictionary]
  -> loaders/17 (whole-table DELETE + INSERT)         -> freestyle_tricks, _modifiers,
                                                         _modifier_links, _sources, _source_links,
                                                         _aliases, _relations
freestyle/inputs/curated/tricks/red_*.csv -> loaders/19 (scoped by source_id)
freestyle/inputs/footbag_org_moves_snapshot.csv -> loaders/20, 21 (scoped)
freestyle/inputs/footbag_org_member_tips.ndjson -> loaders/27     -> freestyle_trick_tips
freestyle/scripts/parse_freestyle_notation.py --apply             -> structural_parse_json, computed_adds
freestyle/symbolic_grammar/*.csv -> loaders/26 (DELETE + INSERT)  -> symbolic_* (6 tables)
QC: 22 (HARD gate, aborts rebuild), 24 + 25 (advisory, `|| echo` in run_freestyle.sh:47-48)
  -> src/db/db.ts freestyle statement groups (SELECT-only, :1806-2427)
  -> freestyleService and siblings -> rendered pages
```

**Proven clean:**
- **Runtime reads DB only.** No `readFileSync`/`fs.` call in `src/` touches `freestyle/inputs|out|reports`, `exploration/`, or any CSV; every such string is a provenance comment (e.g. `src/db/db.ts:2028`). `src/content/freestyle*.ts` are compiled static imports. No `INSERT/UPDATE/DELETE` on `freestyle_*` tables exists anywhere in `src/`.
- **Idempotency matches the documented contract.** All loaders DELETE+INSERT (or scoped-delete) except loader 10, the documented additive exception (`freestyle/CLAUDE.md:19-23`).
- **The rebuild never reads `exploration/`.** The only `exploration/` strings in the pipeline are a comment in `run_freestyle.sh:12-15` and a docstring in the notation parser.
- **`out/` and `reports/` are correctly gitignored** (git ls-files empty).

**Findings:**

**FS-02 (P1, production-safety; audience: go-live-operator, maintainer). No loader has any production guard.**
Evidence: every loader writes a hardcoded `database/footbag.db` (`--db` from `run_freestyle.sh` or `REPO_ROOT/database/footbag.db` default, e.g. loader 17:426-428); zero env checks, zero refuse-guards, zero confirmation prompts across all loaders and the orchestrator (grep this run). If `run_freestyle.sh` runs against the production DB after go-live it silently DELETE+INSERTs every dictionary and symbolic table. Today the blast radius is bounded because no in-app write path to `freestyle_*` exists, but `docs/DESIGN_DECISIONS.md` (1.13, Curator Content Source of Truth) states the freestyle dictionary follows the same pre-go-live-curate-then-cut-over-to-database model as curated media, whose seeder is explicitly barred from the persistent production DB. The moment the planned in-app curation lands, an accidental rebuild destroys live edits with no warning.
Standard violated: the curated-media production-safety yardstick (design decision 1.13); the db-write-safety principle (its rule glob does not currently reach `freestyle/`, which is itself finding FS-14b).
Fix: add a refuse-guard to `run_freestyle.sh` and/or the loaders' shared entry (refuse when the target DB is not a dev-mode database, with no in-band bypass flag, mirroring the fixture-stager guard pattern in the testing rule); one pytest per guard. The mechanism is ratified (DC-3): blanket refusal against any non-development database, no in-band bypass.

**FS-10 (P2, test + data; audience: maintainer). Generated content files have no drift guard; one is an orphan.**
Evidence: `src/content/freestyleObservationalUniverse.ts` is guarded only by an internal-consistency test (`tests/unit/observational-universe-consistency.test.ts` checks totals against itself, never reads the source CSVs), so a stale regeneration passes. `src/content/freestyleTrackedNames.ts` is generated, committed, and imported nowhere in `src/` (grep: only self-reference). CI never runs the generators. The repo already owns the right pattern: `tests/unit/freestyleEmbeddedCoverage.test.ts:45-52` reads its source CSV and asserts the TS mirrors it row-for-row.
Fix: apply the embedded-coverage drift-guard pattern to `freestyleObservationalUniverse.ts`; wire or retire `freestyleTrackedNames.ts` (decision card DC-4).

**FS-17 (P3, data + docs; audience: curator, go-live-operator). Records-correction workflow is fresh-build-only and easy to trip over.**
Evidence: loader 10 `INSERT OR IGNORE` (10:276) counts an edited existing row as `skipped_dup` (10:306-331); a curator correcting `records_master.csv` and re-running sees success but no change. Documented in `freestyle/CLAUDE.md`, so it is an accepted deviation, not drift; but no QC or counter warns that an edited row was skipped.
Fix (minimal): make loader 10 report edited-but-skipped rows (compare incoming row hash vs DB) or add a `--rebuild-records` scoped DELETE mode; document the correction procedure where a curator will find it.

**Cross-freeze coupling (resolved by ratified decision DC-5: relocate the generator inputs before retiring the exploration corpus).** The committed `freestyle/symbolic_grammar/*.csv` are consumed by loader 26 with no live dependency on `exploration/` or `legacy_data/`. But both regenerators (`legacy_data/scripts/build_symbolic_grammar_master.py`, `build_symbolic_grammar_2.py`) read `exploration/` registries (build_2 lines 37-41), so archiving `exploration/` (the disposition decision already tracked in the plan) or freezing `legacy_data/` makes the symbolic-grammar CSVs permanently unregenerable; future changes would be hand-edits.

**FS-14 / FS-14b (P3; audience: maintainer). Naming and rule-coverage hygiene in the pipeline.**
(a) `freestyle/inputs/noise/` holds the authoritative curated base dictionary (74 tricks; loader 17:56-58 with the header comment confirming it) under a name that says the opposite. Rename or document (decision card DC-7).
(b) No `.claude/rules/*` glob covers `freestyle/**`: `comments.md`, `db-write-safety.md`, and `script-secret-safety.md` scope `scripts/**` and `legacy_data/**` only, so the freestyle loaders and scripts sit outside every enforced rule. Extending those globs is a harness change requiring explicit approval; filed in Batch H.

## 7. Pre/post-go-live curator audit

**Pre-go-live (today, coherent):** a curator edits a committed CSV under `freestyle/inputs/` (base dictionary in `inputs/noise/`, expert overlays in `inputs/curated/tricks/red_*.csv`, records in `inputs/curated/records/`), then re-runs `freestyle/run_freestyle.sh`. The dictionary QC (script 22) hard-gates the rebuild. Provenance is preserved in `freestyle_trick_sources` / `_source_links`. Git history is the audit trail; git revert plus rebuild is the rollback.

**At go-live:** whatever is in the committed CSVs at cutover becomes canonical DB content. No cutover-specific step exists for freestyle (unlike curated media, which has a tracked cutover-test item).

**Post-go-live (not yet built; now launch scope):** design decision 1.13 assigns freestyle the same cutover-to-database model as curated media and email templates. The plan formerly parked the in-app editing work as deferred (verified during the audit: no admin route or service writes `freestyle_*` tables); the maintainer's ratified decision 2 pulls it into launch scope as FS-19.

**Comparison against the media-curator yardstick (the gaps):**

| Capability | Curated media | Freestyle dictionary |
|---|---|---|
| Actor/permission guard | `assertCuratorActorMayWriteCurated` on every write (`curatorMediaService.ts:1060` + 8 call sites) | none (no actor concept in loaders) |
| Audit log | curator deletes logged to `audit_entries` | none (`auditLogService.ts` has zero freestyle references) |
| Approval workflow | admin UI flow | none (git review is the de-facto gate) |
| Rollback | DB + S3 model with sidecar source of truth | git revert + full rebuild (works, uncodified) |
| Production guard | seeder barred from persistent production DB | **none** (FS-02) |
| Destructive-rebuild overwrite risk | protected | **latent** (FS-02; bounded today by the absence of in-app writes) |

Ratified: the entire right-hand column closes before launch. The freestyle curation cutover (admin writes, actor guard, audit log, rollback, production guard) is launch scope (decision 2), built on the curated-media patterns in the table; FS-02's guard is the first piece of it. Stories come first per the repo's grounding rule: the curation stories (edit a trick / alias / record / tip; audit trail; rollback; guard behavior) join the dictionary stories in section 9.

**Doctrine intake model:** open doctrine lives in `freestyle/doctrine/RED_QUEUE.md` (Wave 3 letter sent 2026-07-02; blurry-expansion predicate gating 64 rows, operator structural definitions, cross-body rake, terraging chain, rider list) with rulings integrated into `RED_RULINGS.md` and topic docs, and curator-owned questions listed separately (POD vs Dimmier, Kiwi, Clipper Symposium Whirl, atomic-pickup alias target). This is a healthy, delete-on-answer queue. One embedded caveat needs maintainer action: the queue itself records that nothing in the repository proves the terraging-chain rider email actually reached Red; confirm it was sent or send it (backlog FS-18).

## 8. Data and doctrine correctness audit

**Naming invariant.** The intended forms: slug is a lowercase underscore token; the hashtag is `#` plus the slug (derived at render, no stored hashtag column); the display name is the same words with neither underscores nor hyphens.

- **Slugs: 100% conforming.** 0 of 962 slugs contain hyphens, uppercase, or spaces; alias slugs likewise (0 of 380).
- **Display names: 543 of 962 rows fail the form** (the check: lowercasing the stored name and replacing its spaces with underscores must reproduce the slug). Of the 543 failures, 535 contain hyphens: mostly lowercase hyphenated tokens (`spinning-paradox-mirage`, `high-plains-drifter`), including 7 capitalized hyphenated forms ("Blender Same-Side", "Leg-Over Flapper Stall", "Stepping P.S. Whirling x-body Rake"). The other 8 failures have no hyphen: seven "(same side)" parenthetical names whose slugs use a `_same_side` suffix instead, and one trick, `big_apple_sauce`, whose stored name is a different name entirely ("spinning paradox miraging symposium torque", its structural reading). Of the 419 rows that pass, 360 are lowercase and 59 are capitalized, so case is inconsistent even among the passing rows. Render-time shaping hides all of this publicly (verified live: h1 "Spinning Paradox Mirage"), so it is a data-hygiene defect, not a visitor-facing one. Genuine-hyphen names ("cross-body sole stall") need a curator-recognized exception list.
- **Nothing enforces the invariant.** QC script 22 does not check it; no test asserts it; and the trick-search test suite actively seeds hyphenated slugs (`paradox-whirl` at `freestyle.trick-search.routes.test.ts:19`), encoding the wrong convention into the test corpus (FS-06).

**FS-06 (P2, data + loader + test; audience: curator, implementing-developer).** Normalize `canonical_name` in the curated source CSVs to the display form (mechanical hyphen-to-space transform plus a curator pass over the genuine-hyphen exceptions), add the invariant to QC 22 as a hard gate with an explicit exception list, add a dataset-wide regression test, and reseed the search suite with underscore-form slugs. The data change is ratified (DC-2); the curator's genuine-hyphen exception list is collected at execution.

**Activation and publication contract: verified healthy.** All 922 active rows are `curated` or `expert_reviewed` (the 9 pending rows are inactive); active modifier-category rows correctly carry no ADD (their rules live in `freestyle_trick_modifiers`); zero orphan aliases/links; tips gated on `status='published'` (409 of 419). The held-not-published posture for contested structures matches `docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md` ("when the number is settled but the structure is contested, the trick is held, not published").

**Records linkage.** 204 record rows; the unresolved trick names match the plan's blocked item exactly: six await Red (Blink, Double Dyno, Double Whip, Toe Spinning Toe, Solestice, Stepping Ducking Blurry Whirl), six await the curator (the same-side multi-component set: Double Leg Over(ss), Eggbeater(ss), Fairy Double Leg Over(ss), Pigbeater(ss), Smog(ss), Pixie DSO(ss)), and three "Unique N-Dex/N-ADD" categories correctly badge nowhere. These are human decisions, tracked, not defects.

**Doctrine classification.** Everything contested is correctly held as human/curator decision (Red queue, positional atom-level foundations in `POSITIONAL_IDENTITY.md`). No case was found of uncertain doctrine asserted as code fact. The operator single-authority rule was not contradicted anywhere the audit looked (the modifier stub/family pages read from the operator reference and DB registry).

## 9. User-story coverage audit

Confirmed: only `V_View_Tutorials` (USER_STORIES.md:395) and `V_View_Trick_Reference_Videos` (:436) touch freestyle, both from the media angle. Per the deployed-surface taxonomy every freestyle route is **deployed**; 25 of 29 land in "runtime feature without a story id" and 4 are partially covered (tricks index, trick detail, search+suggest, modifier redirect: the media/link semantics only). The absence was tracked in the plan before this audit, so it is a status fact rather than a newly-discovered defect; with the ratified launch-scope decision it became the launch-gating task FS-16 (the curation feature cannot be built without grounding stories), which the map and proposed headings below feed.

Proposed story set (headings under a new "2.x Freestyle Encyclopedia" epic; James to draft bodies with success criteria):

- `V_Browse_Trick_Dictionary` — index, 6 active views, family filter, corpus stats, onboarding block.
- `V_View_Trick_Detail` — identity, ADD derivation, notation, structure, related/next/previous, records, tips, media; alias URL canonicalization (per DC-1 outcome); modifier-slug redirect.
- `V_Search_Tricks` — search page + suggest endpoint, alias matching, min-length, truncation.
- `V_View_Trick_Records` — records + leaders, recorded-vs-canonical ADD, verification disclaimers.
- `V_View_Freestyle_Reference` — glossary, operators, notation article, add-analysis, combo-analysis, insights.
- `V_View_Set_Encyclopedia` — sets hub, set detail, sets reference, compositional sets.
- `V_Learn_Freestyle` — learn path, walking progression, family pages, about, history, competition, partnerships.
- `V_View_Emerging_Vocabulary` — observational page and its distance-to-canonical ladder.
- `V_View_Freestyle_Media_Hub` — /freestyle/media and gallery links (extends `V_View_Trick_Reference_Videos`).

## 10. Test gap audit

Coverage strengths first: every mounted route and all 8 view variants have route tests; the card-uniformity contract is mechanically pinned across views; search/suggest behavior is well covered; garbage-slug 404s are pinned for family/set/modifier routes.

Gaps by bug class:

| # | Class | Status | Evidence / fix |
|---|---|---|---|
| 1 | Route coverage | COVERED | all 29 routes + 8 views mapped to suites |
| 2 | Link integrity | **GAP (deliberate exclusion)** | `route-wiring.crawl.test.ts:156-159` skips every `/freestyle/.+` path; only the landing is dead-link-checked. Fix: lift the exclusion or add a freestyle-scoped crawl (FS-03a) |
| 3 | Search/filter | COVERED (caveat) | suite seeds hyphenated slugs contrary to production convention (FS-06d) |
| 4 | Slug/alias | **PARTIAL** | alias-URL 200-vs-301 behavior unpinned (FS-01 tests); modifier 301s and garbage 404s pinned |
| 5 | DB-backed runtime | **GAP** | nothing asserts no-disk-reads at request time; add a regression test forbidding runtime imports/reads from `freestyle/inputs|out|reports`/`exploration` (FS-03 sub-item e) |
| 6 | Loader idempotency | **PARTIAL** | records loader covered (`legacy_data/tests/test_loader_idempotency.py`); dictionary loaders 17/19 have no pytest (FS-11) |
| 7 | Production loader guards | **GAP** | no guard exists to test; test lands with FS-02 |
| 8 | Curation safety | **GAP** | no test pins CSV-is-source-of-truth / overwrite protection for the dictionary (FS-11) |
| 9 | Persona flows | **GAP** | `click-through.spec.ts:164` includes `/freestyle` as its only freestyle page; no trick index/detail/search/glossary/sets click-through (FS-03 sub-item b) |
| 10 | Accessibility + mobile | **GAP** | the axe scan set covers ten public pages and the freestyle landing is its only freestyle page (`tests/e2e/accessibility.spec.ts`); the color-contrast rule is disabled globally; zero viewport/mobile assertions in any e2e spec (FS-03 sub-items c and d) |
| 11 | Empty/error states | **PARTIAL** | empty search covered; trick with no records and no media unpinned (the media-section-omitted criterion from `V_View_Trick_Reference_Videos`); empty-family unpinned (FS-12) |
| 12 | Naming invariant | **GAP + contradicted** | no dataset-wide invariant test; search suite seeds the wrong convention (FS-06) |

**FS-03 (P1, test; audience: implementing-developer, tester)** bundles 2, 9, 10, and 5 above: include freestyle in the dead-link crawl, extend e2e click-through and the axe scan beyond the landing (at least: tricks index, one trick detail, glossary, one set detail, search), add one mobile-viewport smoke pass, and add the runtime-disk-read regression guard.

## 11. Exploration disposition audit

- **Rebuild and runtime: no dependency.** Verified by grep: no `src/` or pipeline-execution reference reads `exploration/` (the two hits in `freestyle/` are a comment and a docstring).
- **Load-bearing references that must survive any archive:** the plan cites `exploration/positional-evidence-audit-2026-06-23/CURATOR_WORKLIST.md` (line 223); the sanctioned Glossary V2 track lives at `exploration/glossary-v2-architecture/`; the symbolic-grammar regenerators read `exploration/footbagmoves-federation/` and `exploration/freestyle-notation-grammar/` (DC-5); skills reference exploration paths.
- **Stale references found:** three exploration scratch files cite the deleted `legacy_data/IMPLEMENTATION_PLAN.md` (`exploration/symbolic-grammar-2/SYMBOLIC_GRAMMAR_2_DESIGN.md:155`, `exploration/freestyle-notation-grammar/GRAMMAR_GLOSSARY_V3.md:269`, `exploration/freestyle-media-ingestion-2026-05-29/ARCHITECTURE.md:22`) — the surviving real part of the plan's reference-stripping item (see section 12, L288).
- **Corpus size:** 1,072 tracked files, 41 top-level dirs plus `_archive/`.
- **Ratified disposition (decision 4):** `exploration/` must prove a real use or be retired at go-live. Execution order: relocate the live dependencies first (the two symbolic-grammar generator input registries into `freestyle/inputs/`; re-home or absorb the curator worklist the plan cites; move the sanctioned Glossary V2 track to a durable home if it is still active at go-live), fix the three stale references above, then retire the remaining corpus at go-live behind one consolidated approval (deletion is destructive and gets its own gate).

## 12. Current IMPLEMENTATION_PLAN freestyle task audit

35 freestyle-related items were found reading the plan end to end (the 34 expected plus one adjacent). Every one is accounted for below. Verification was against code, DB, and localhost this run. Line numbers refer to the current file.

**Consolidation ratified 2026-07-07:** the maintainer directed that this report absorb EVERY actionable freestyle item, leaving no freestyle to-do items in `IMPLEMENTATION_PLAN.md` at all. The per-item verification in this table stands; where the Disposition column says "Keep", that is superseded: every actionable freestyle item is absorbed into the section 13 backlog (mapping in section 14), the standing rule and standing summary remain in the plan as context, and the plan gains one pointer entry to this report. Items that are broader than freestyle (curator cutover tests at line 72, Net gallery at line 95, the media `mime_type` column at line 96, and the multi-pipeline doc-sync at line 146) stay in the plan.

| Line | Item (abbreviated quote) | Tag / section | Verified state | Disposition (audit-time; where it says "Keep", the later full consolidation superseded it — final home per section 14) |
|---|---|---|---|---|
| 72 | "Build the curator source-of-truth cutover tests." | KANBAN, Gaps | Accurate; no such test exists | **Keep** (also feeds DC-6 sequencing) |
| 94 | "Link the remaining freestyle pages to their galleries." | PRE-KANBAN | Accurate; only trick row/detail shape `context=` links | **Keep** |
| 95 | "Bring Net into the gallery model." | PRE-KANBAN | Accurate; no `#net` gallery tag | **Keep** (not freestyle-core) |
| 96 | "Add a `mime_type` column to `media_items`." | KANBAN | Accurate; column absent from schema and seeder | **Keep** |
| 102 | "Finish tidying the freestyle skills." | KANBAN | Accurate; all four leftovers remain | **Absorbed** into FS-04, which expands it (the audit found more: wrong slug convention, 8 dead memory references, stale mechanism claims) |
| 108 | "Record the difficulty-tag design once the PassBack compound tags are split." | KANBAN | Accurate; blocked behind L230 | **Keep** |
| 146 | "Full audit and doc-sync of the post-refactor pipeline reality." | PRE-KANBAN, Other pipeline | Accurate; names freestyle loaders/CSVs/skills | **Keep** (flagged: freestyle-adjacent; my initial sweep missed it) |
| 162 | Surface propagation rule | standing rule | n/a | **Keep** (standing) |
| 164-196 | "State of freestyle (standing summary)." | standing summary | Spot-verified consistent | **Keep** (standing) |
| 198 | "Author the missing freestyle-dictionary user stories." | PRE-KANBAN | Accurate; 0 dedicated stories | **Keep**; section 9 supplies the proposed story list |
| 199 | "Supply the freestyle-demo poster frames... convert the .mov" | PRE-KANBAN | Accurate; 17 .mov, 0 posters, 0 mp4, all skip | **Keep** |
| 203 | "Trick-promotion decisions (Red Wave 3, sent; curator)." | BLOCKED | Accurate; RED_QUEUE.md current | **Keep** (add FS-18: confirm the terraging rider email was actually sent, per the queue's own caveat) |
| 216 | "The last ~10 unresolved world-record trick names." | BLOCKED | Accurate; 12 names + 3 unique-categories enumerated and DB-verified | **Keep** |
| 226 | "Decide the go-live disposition of the exploration/ corpus." | KANBAN | Accurate; 1,072 tracked files | **Absorbed** into FS-25 (decided: retire at go-live after relocating live dependencies; execution order in section 11) |
| 229 | Count-bearing tokens render as operators | DEVIATION | Accurate (`semanticNotationRendering.ts:115-120` Current/Target) | **Keep** |
| 230 | PassBack compound difficulty tags | DEVIATION | Accurate (tags still present in `media_tags`) | **Keep** |
| 237 | Remaining Set Encyclopedia teaching pages | post-V1 backlog | Accurate; 8 authored, the 5 named remain | **Keep** |
| 250 | Sole survivor replacement demo | post-V1 backlog | Accurate; `#unavailable_embed` suppressed | **Keep** |
| 257 | Tag the BAP Shred clips by trick/set | post-V1 backlog | Accurate; 72 clips, collection-tagged only | **Keep** |
| 263 | Member Tips remainder | post-V1 backlog | Accurate; 409/7/1/2 by status | **Keep** |
| 274 | Technique Notes for four source-blocked tricks | post-V1 backlog | Accurate; still blocked (ties L420) | **Keep** |
| 281 | De-epoch freestyle test labels | post-V1 backlog | Accurate; 86 files quantified (section 5, FS-13) | **Keep**; absorb the glossary-section-sign and dated-comment residue from L288 |
| 288 | Strip embedded design-doc references | post-V1 backlog | **STALE**: parts (1)/(2) already done (zero design-doc refs remain in freestyle tests/content; the "18 in freestyle.routes.test.ts" are glossary page anchors); part (3) real (three exploration files cite the deleted legacy plan) | **Absorbed**: the real remainder (the three exploration files) into FS-25; the test-side residue into FS-13 |
| 315-366 | Post-V1 vision A-F (glossary layering, foundational bases, algebra, frontier, history, navigation) | vision | Correctly framed as directions, unbuilt | **Keep** (vision) |
| 386 | Freestyle rules wording from the IFPA | blocker | Accurate; `ifpa/rules/freestyle.md` holds Routine/Shred/Circle, no Sick 3 | **Keep** |
| 387 | Wave 3 answers from Red Husted | blocker | Accurate | **Keep** |
| 417 | No in-app way to edit the trick dictionary | deferred | Accurate; verified no write path | **Absorbed** into FS-19 (launch scope per decision 2; the item left Deferred/parked and became the launch-track feature) |
| 418 | Local MP4 trick clips | deferred | Accurate | **Keep** |
| 419 | Movement Systems completeness audit | deferred | Accurate | **Keep** |
| 420 | Quantum and Miraging: one set or two? | deferred | Accurate; still distinct | **Keep** |

Every item above appears here; none was dropped. Items entering the consolidated backlog as replacements or expansions: L102 (as FS-04), L288 (rewritten). All others keep their current home; the new tasks in section 13 are additive and none duplicates a live plan item.

## 13. Consolidated remediation backlog

Template fields: ID; title; severity; category; owner; status; context; evidence; why it matters; remediation; rationale; alternatives; likely files; tests required; done condition; replaces IP item; new-from-audit. Common fields are stated once per task; every task is self-contained for a developer with no background. Ownership default: where a task names no owner, the owner is Dave (platform code, tests, harness) with James advising on freestyle content and data; the "audience" tags describe who a defect affects, not who fixes it.

---

**FS-01 — 301-redirect trick-alias URLs to the canonical trick page**
P1 | code + test | audience: novice/expert/maintainer | status: launch blocker (ratified: 301, decision 3) | new-from-audit: yes | replaces IP item: none
Ratified addendum: also verify no internal template or service emits an alias href (internal links always canonical, so the redirect is a safety net that rarely fires).
Context: the dictionary stores 380 alias names (historical names, abbreviations like `atw`) mapped to canonical tricks. The trick-detail route resolves an alias and renders the canonical trick's full page at the alias URL with a self-referencing canonical tag, so `/freestyle/tricks/atw` and `/freestyle/tricks/around_the_world` are two indexable copies. Sets and modifier slugs already 301 to their canonical page, so freestyle handles the same problem three different ways.
Evidence: live curls this run (atw/leg_over/catwalk/datw all 200 with `rel="canonical"` pointing at the alias URL); `src/services/freestyleService.ts:10082-10091` (redirect helper covers only modifier/operator/migrated-set slugs); no pinning test.
Why it matters: duplicate content with wrong canonicals at launch; inconsistent slug handling violates the repo's own sets/modifiers pattern; unpinned behavior can flip silently.
Remediation: in `trickRouteRedirectTarget`, resolve the incoming slug against `freestyle_trick_aliases` (a prepared statement exists for alias resolution in the detail path; reuse it) and return `/freestyle/tricks/<canonical>` for a pure-alias slug. Add tests: alias slug 301s to canonical; canonical renders 200; garbage 404s; modifier slug still 301s to its modifier page.
Alternatives: keep 200 rendering but emit the canonical tag pointing at the canonical URL (smaller change, keeps alias URLs working without a hop; weaker consistency with sets/modifiers). DC-1 records the choice.
Likely files: `src/services/freestyleService.ts`, `src/controllers/freestyleController.ts` (no change if the helper covers it), `tests/integration/freestyle.trick-detail-*.routes.test.ts` (new alias suite).
Done: all 380 alias slugs redirect (or canonicalize per DC-1); tests pin it; `npm test` and `npm run build` pass.

**FS-02 — Production refuse-guard for the freestyle rebuild**
P1 | production-safety | audience: go-live-operator/maintainer | status: launch blocker | new-from-audit: yes | replaces: none
Context: `freestyle/run_freestyle.sh` DELETE+INSERTs every freestyle and symbolic table into whatever DB it is pointed at (default `database/footbag.db`); no loader checks what it is writing to. The curated-media seeder, the repo's stated yardstick, is explicitly barred from the persistent production DB.
Evidence: loaders 17:426-428 and siblings (hardcoded/default DB path, no env reads, no guards; grep this run); design decision 1.13 (freestyle follows the curated-media cutover model).
Why it matters: after go-live, one habitual rebuild against the wrong DB silently destroys the production dictionary (and, once in-app curation exists, live curator edits).
Remediation: add a guard at the top of `run_freestyle.sh` (and a shared check in the loaders' DB-open helper) that refuses to run unless the target DB is a development database, with no in-band bypass flag; the operator who genuinely must run it moves the guard condition out-of-band (the fixture-stager guard pattern in the testing rule). Add a pytest per guard.
Ratified (decision 1 + DC-3): blanket refuse-guard against any non-dev database, no in-band bypass, mirroring the media-seeder rule; the one sanctioned final CSV rebuild happens on the pre-cutover database immediately before the switch. This guard is the first piece of the launch-scope curation cutover (FS-19).
Likely files: `freestyle/run_freestyle.sh`, a small shared helper under `freestyle/loaders/`, `legacy_data/tests/` or a new `freestyle/tests/` pytest.
Done: pointing the rebuild at a non-dev DB refuses with a clear message; test proves it; the guard has no bypass flag.

**FS-03 — Close the freestyle safety-net test gaps (crawl, e2e, a11y, mobile, runtime-reads)**
P1 | test | audience: implementing-developer/tester | status: launch blocker | new-from-audit: yes | replaces: none
Context: freestyle rendering contracts are deeply tested, but the cross-cutting nets exclude the area: the dead-link crawl skips every `/freestyle/.+` path; browser click-through and the axe accessibility scan visit only the landing; no e2e spec anywhere asserts a mobile viewport; nothing pins that request handling never reads pipeline files from disk.
Evidence: `tests/integration/route-wiring.crawl.test.ts:156-159` (exclusion); `tests/e2e/click-through.spec.ts:164` (landing only); `tests/e2e/accessibility.spec.ts:28` (landing only; color-contrast disabled globally); viewport grep empty; no runtime-disk-read guard.
Remediation: (a) lift the crawl exclusion or add a freestyle-scoped dead-link crawl over index/detail/browse/glossary/sets; (b) extend click-through to tricks index, one trick detail, glossary, one set detail, search; (c) extend the axe scan to the same pages; (d) add one mobile-viewport smoke pass over the same pages; (e) add a regression test that fails on any `src/` import or fs read of `freestyle/inputs|out|reports` or `exploration/`.
Likely files: the three test files above plus one new unit guard test.
Done: crawl covers freestyle; e2e/a11y/mobile cover the five representative pages; guard test in place; suite green.
CLOSED (2026-07-07), with the delivered shape recorded honestly. The dead-link crawl now seeds a minimal freestyle corpus and covers every freestyle surface across all three personas, with one narrow documented skip: trick-detail links outside the seeded corpus, because the reference pages are content modules authored against the full real dictionary; that residual is closed by a deterministic companion test validating every content-authored trick link (literal hrefs across src/ plus the links the thirteen content-driven pages render) against the dictionary's committed source CSVs, which also surfaced and drove the alias-aware ADD-analysis link fix. The runtime-disk-read guard pins that src/ never references the pipeline input, output, report, or research trees. The browser layer: the click-through walk covers the landing, dictionary index, a seeded trick detail, both records surfaces, glossary, learn, and the media hub; the axe scan adds the dictionary index, a seeded trick detail, the set encyclopedia, learn, and records, and its first run surfaced a real serious violation (in-prose links distinguishable only by color), fixed by the prose-link underline rule rather than by disabling the flagging rule; a new mobile-viewport spec covers the landing, index, seeded detail, records, and glossary at phone width with a no-horizontal-overflow assertion, all passing. Set-detail and search-page coverage lives in the crawl (wiring) rather than the browser specs, and the axe scan's globally disabled color-contrast rule predates this work and remains the one tracked accessibility follow-up (the underline treatment its note called for now exists, so revisiting that disable is a cheap future check).

**FS-04 — Correct the freestyle skills (wrong slug convention, dead memory references, stale claims, dated status)**
P1 | docs-stories (harness) | audience: maintainer (approval required: `.claude/` edits) | status: launch blocker for agent-facing correctness | replaces IP item: L102 (expands it) | new-from-audit: partially (four leftovers were tracked; the rest is new)
Context: the skills that govern freestyle work contain errors that would mislead any future agent: two skills teach hyphen-form slugs while the DB and code are underscore-form; eight referenced memory files do not exist; one skill describes a template mechanism that is no longer in the template; several carry dated status notes the harness rules forbid.
Evidence: `.claude/skills/footbag-freestyle-dictionary/REFERENCE.md:80` (`paradox-mirage` ↔ `paradox-torque`, `{first-hyphen-segment}-` rule; DB has 0 hyphen slugs); `freestyle-dictionary-surface/SKILL.md:106-134` (hyphenated examples; also `:12` calls the live families route "hypothetical" while `:41` says it passed release audit); `footbag-freestyle-dictionary/SKILL.md:233` ("Modifier Reference section is a Handlebars block comment": `tricks.hbs` contains no such section or `content.modifiers` reference; and it cites the absent memory `feedback_modifier_public_visibility.md`); dead memory references also in `freestyle-topology-governance` (:147, :151), `migrate-browse-view` (:91, :203, :242-243), `footbag-curated-media` (:295, :300, :301), `REFERENCE.md:48`; dated status/epoch notes at `freestyle-dictionary-surface:31,53,113,121`, `footbag-curated-media:81,258,286`, `freestyle-topology-governance:59` ("Slice D", "Wave-2"), `footbag-freestyle-dictionary:29`.
Why it matters: skills are the agent-facing contract; a skill teaching the wrong slug convention causes broken data authoring, and dead memory pointers make cited authority unverifiable.
Remediation: fix slug examples to underscore form; delete or re-home the dead memory references (state the decision inline in the skill; memory files were pruned); replace the stale modifier-reference mechanism claim with the current fact (no such section renders; public modifier editorial content lives on the glossary); strip dated status/epoch notes; relocate `freestyle-dictionary-surface` per the plan item. Each edit shown as before/after for approval per harness governance.
Likely files: the five skill folders named above.
Done: no hyphen slug examples anywhere in skills; no dead memory references; no dated status; claims spot-verified against code; approved edit-by-edit.
CLOSED (2026-07-08). The two live components the second pass reduced FS-04 to are fixed and committed (`docs(skills): correct two stale freestyle-dictionary skill statements`): the related-tricks R2 rule now describes the underscore slug separator (`{first-underscore-segment}_`) with the `paradox_mirage` / `paradox_torque` examples (was hyphen-form), and the Modifier Reference note now states the reference renders on `/freestyle/glossary` through the modifier-reference partial and is absent from the trick index (`tricks.hbs`) and the trick detail (`trick-shell.hbs`), preserving the do-not-re-enable-on-trick-pages-without-approval rule. Approved edit-by-edit per harness governance. The dead-memory-reference component was void (recorded in the second pass); the broader originally-listed items (the exploration-stage `freestyle-dictionary-surface` illustrative examples and the dated-status notes) sat outside that reduced scope and are not reopened here.

**FS-05 — Em-dash sweep of freestyle user-facing copy**
P2 | UX-copy | audience: novice/expert | status: should-fix-before-launch | new: yes | replaces: none
Context/evidence/remediation: section 5 (FS-05). 188 template entities outside comments plus ~154 service-string occurrences; replace prose em dashes with commas/parentheses/restructure; decide table-placeholder treatment once.
Likely files: ~15 freestyle templates, `freestyleService.ts` copy strings, trick partials.
Done: zero rendered em dashes in freestyle prose (grep + live spot-check); placeholder convention consistent.

**FS-06 — Enforce the trick naming invariant in data, QC, and tests**
P2 | data + loader + test | audience: curator/implementing-developer | status: should-fix-before-launch | new: yes | replaces: none
Context/evidence: section 8. 543/962 `canonical_name` rows are not in display form (render shaping hides it); QC 22 does not check the invariant; no test enforces it; the search suite seeds hyphenated slugs.
Remediation: (a) mechanical normalization of `canonical_name` in `freestyle/inputs/noise/tricks.csv` and the red-addition CSVs (hyphen-to-space; curator confirms the genuine-hyphen exception list, e.g. "cross-body sole stall"); (b) QC 22 hard-gates: slug lowercase-underscore, display name contains no `_`/`-` except listed exceptions, `lower(name with spaces as underscores) == slug` modulo exceptions; (c) dataset-wide vitest regression; (d) reseed `freestyle.trick-search.routes.test.ts` with underscore slugs. Ratified (decision 3 / DC-2): normalize in the source CSVs; must land before the final pre-cutover rebuild.
Likely files: `freestyle/inputs/noise/tricks.csv`, `freestyle/inputs/curated/tricks/*.csv`, `freestyle/loaders/22_qc_trick_dictionary.py`, new `tests/unit/freestyle-naming-invariant.test.ts`, `tests/integration/freestyle.trick-search.routes.test.ts`.
Done: rebuild passes with the new hard gate; DB scan returns zero unlisted violations; tests pin both conventions.
CLOSED (2026-07-07). 540 display names normalized in the additions CSV (separator hyphens to spaces, the seven parenthetical same-side names to spaced forms, capitalization preserved), with fold-equivalence programmatically asserted per row so every slug is byte-identical; the base dictionary needed nothing and the one corrections rename is itself an exception. The curator ruled the exception list at execution: genuine-hyphen tokens `cross-body` and `x-body`, plus two verbatim rows, the big-apple-sauce row (whose structural display name is a standing curator ruling binding the folk name to the paradox-free reading, so renaming it would have reversed doctrine) and the rake row whose abbreviation periods and x-body compound cannot mechanically reproduce the slug. The exceptions live in one committed file (`freestyle/inputs/curated/tricks/display_name_exceptions.csv`) read by both the Python QC gate and the TypeScript regression. The dictionary QC script now hard-aborts the rebuild on a non-conforming name, its first check that fails on content rather than emitting a review CSV; a dataset-wide unit test derives every row's final name from the committed CSVs (corrections applied) and enforces the same rule in CI with no database; a gate pytest exercises the check function directly; and the search suite's fixture slugs moved to underscore form, removing the last test data encoding the wrong convention. Slugs, hashtags, tags, URLs, and alias behavior are untouched by construction (no hashtag path reads the display name). The local rebuild ran clean with the gate live: 962 rows, zero violations modulo the exceptions. This also lands the one-time normalization the trick-edit story's write-time naming check was waiting on; that check itself is a future slice.

**FS-07 — Controller 404/branching cleanup**
P2 | code | audience: implementing-developer | status: should-fix-before-launch | new: yes | replaces: none
Evidence/remediation: section 5 (FS-07). Delete the four dead-equivalent `NotFoundError` branches or factor one helper; move the `emerging` redirect decision and `addSort` derivation into the service.
Likely files: `src/controllers/freestyleController.ts`, `src/services/freestyleService.ts`.
Done: one 404 path; controller methods are HTTP glue; route tests unchanged and green.

**FS-08 — Remove delivery-epoch labels from identifiers and generated headers**
P2 | code | audience: implementing-developer | status: should-fix-before-launch | new: yes | replaces: none
Evidence/remediation: section 5 (FS-08). Rename `RESOLVED_FORMULAS_SPRINT_1` (10+ sites), regenerate `freestyleObservationalUniverse.ts` header without "Phase E" (edit the generator), drop the caller reference in `freestyleLandingContent.ts:15`; author confirms whether `S3/S5` is domain notation before touching it.
Likely files: `src/content/freestyleResolvedFormulas.ts`, `freestyleAddAnalysisContent.ts`, `freestyleService.ts`, `freestyle/scripts/build_observational_universe_content.py`, `src/content/freestyleLandingContent.ts`.
Done: grep for sprint/phase tokens in freestyle `src/` is clean (S3/S5 resolved either way); build green.

**FS-09 — Copy and orientation fixes from the persona walkthrough**
P2 | UX-copy | audience: novice (primarily) | status: should-fix-before-launch | new: yes | replaces: none
Sub-items (each a small copy change; public-UI wording, so each shown before/after for approval): (a) add a one-sentence body intro to `/freestyle/leaders`; (b) retitle or subtitle `/freestyle/observational` in plain words (keep "Emerging Vocabulary" as a secondary label) and split its dense hero-subtitle into short sentences; (c) rewrite the insights hero-subtitle to lead with orientation, gloss "Sick3", move the count down; (d) add a two-sentence orientation intro to the notation article (what this document is, why it matters); (e) give `/freestyle/search`'s empty state onward links (browse views, learn, glossary); (f) gloss or replace: the family-view intro jargon (`freestyleService.ts:9360-9367`), the minor-lineages band (`tricks.hbs:399`), "lenses" (`tricks.hbs:282,575`), the "Platform-tracked" pill (`modifier-stub.hbs:25`, plain label + title), the "observational" badge (visible gloss once per page, not tooltip-only); (g) gloss "Apps" in the first partnerships table; (h) add a beginner gloss line to sets-encyclopedia and compositional-sets intros; (i) gloss "IFPA" on first use in add-analysis.
Done: each approved wording landed; persona re-walk of the touched pages reads clean; route tests asserting copy updated in the same change.

**FS-10 — Drift guards for generated content; resolve the orphan**
P2 | test + data | audience: maintainer | status: should-fix-before-launch | new: yes | replaces: none
Evidence/remediation: section 6 (FS-10). Apply the `freestyleEmbeddedCoverage` CSV-parity pattern to `freestyleObservationalUniverse.ts`; retire `freestyleTrackedNames.ts` and its generator (`freestyle/scripts/build_tracked_names_content.py`) per ratified DC-4 (a committed generated file nobody consumes is a second source of truth by definition).
Done: a stale regeneration fails the suite; the orphan file and its generator are deleted.

**FS-11 — Pytest coverage for the dictionary loaders and curation safety**
P2 | test | audience: implementing-developer | status: should-fix-before-launch | new: yes | replaces: none
Context: only the records loader has an idempotency pytest; loaders 17 (whole-table rebuild) and 19 (Red overlay scoping) have none, and no test pins the CSV-is-source-of-truth overwrite contract.
Remediation: pytests against a temp DB: 17 is idempotent (two runs, identical table state); 19 scopes deletes to its source_id (rows from other sources survive); the QC 22 hard gate actually aborts `run_freestyle.sh` on violation (fixture with a bad row).
Likely files: `legacy_data/tests/` (or a new `freestyle/tests/`), fixtures under temp dirs only.
Done: three green pytests; `./run_all_tests.sh` includes them without touching real data.

**FS-12 — Empty-state route tests for trick detail and family pages**
P2 | test | audience: implementing-developer | status: should-fix-before-launch | new: yes | replaces: none
Remediation: pin the trick page with zero records and zero media (records table and media section omitted, page coherent); pin a family page whose members all went inactive (or assert the suppression rule that prevents it).
Likely files: `tests/integration/freestyle.trick-detail-*.routes.test.ts`, `freestyle.family-detail.routes.test.ts`.
Done: both states pinned; suite green.

**FS-13 — De-epoch freestyle test comments (execute the tracked item, scope enlarged)**
P3 | IP-cleanup/code | audience: implementing-developer | status: post-V1 (as tracked) | replaces: absorbs the residue of IP L288 into L281 | new: no (quantified)
Scope from this audit: 86 files (43 epoch labels, 70 dated change-markers, 19 section-sign shorthands, finding/slot IDs); worst files listed in section 5. Mechanical rewrite to plain contract descriptions.
Done: grep for epoch/date/section tokens in freestyle test files returns only genuine data values.

**FS-14 — Rename or document `inputs/noise/`; extend rule globs to `freestyle/**`**
P3 | data + harness | audience: maintainer (approval: `.claude/` edit for the glob part) | status: post-V1 acceptable | new: yes | replaces: none
(a) Ratified (DC-7): rename `freestyle/inputs/noise/` to `freestyle/inputs/base_dictionary/`, updating the three path constants in `freestyle/loaders/17_load_trick_dictionary.py` (lines 56-58) in the same change. Rationale: the folder holds the authoritative 74-trick curated base dictionary; the name "noise" invites a future contributor to treat it as discardable. (b) Extend the `paths:` globs of `.claude/rules/comments.md` and `.claude/rules/db-write-safety.md` to cover `freestyle/loaders/**`, `freestyle/scripts/**`, and `freestyle/tools/**`, because today no path-scoped rule reaches the freestyle pipeline directory at all, leaving its loaders outside every enforced standard.
Done: rename landed and rebuild passes; rule globs cover the pipeline; each harness edit approved as literal before/after.

**FS-15 — Post-V1: freestyleService extraction seams** — P3 | owner: Dave | status: post-V1, parked. Context and evidence in section 5 (the service is a 2.6x size outlier at 11,339 lines; records shaping, browse views, and trick detail are the natural seams). No pre-launch action. Done: revisited at post-V1 planning; extraction happens only when a slice touches those seams, never as freestanding refactoring.

**FS-16 — Draft the freestyle user stories: nine dictionary stories plus the curation stories**
P1 (raised from P3 by the launch-scope decision) | docs-stories | owner: James drafts, Dave approves | status: launch blocker (stories gate the curation build under the repo rule that no schema or service code lands without a grounding story) | replaces IP item: line 198 | new-from-audit: no (expanded)
Context: `docs/USER_STORIES.md` contains no dedicated story for any of the 29 freestyle routes (section 9 has the route-to-story map and the nine proposed dictionary story headings). The ratified launch-scope decision adds curation stories covering every freestyle content type the database holds (tricks, aliases, modifiers and their links, relations, sources, records, consecutive-kicks records, tips, and the symbolic layers): each edit surface, every edit writing an audit entry, rollback, the CSV pipeline refusing production (guard behavior), and the cutover moment itself (final CSV rebuild, then database-only).
Progress (2026-07-07): the launch-gating portion is closed. Merged into `docs/USER_STORIES.md`: the three curation stories (`A_Browse_Freestyle_Content` for the admin curation browse, `A_Edit_Freestyle_Trick` for the trick row plus its aliases, sources, and modifier links with the validation and audit criteria, and `SYS_Freestyle_Content_Source_Of_Truth_Cutover` for the go-live source-of-truth switch); the three record and tip write-path stories (`A_Edit_Freestyle_Record`, `A_Edit_Consecutive_Kicks_Record`, `A_Moderate_Freestyle_Trick_Tip`), which grounded the shipped record and consecutive-kicks curation slices; and the nine visitor dictionary stories, landed as a new visitor epic named Freestyle Encyclopedia (`V_Browse_Trick_Dictionary`, `V_View_Trick_Detail`, `V_Search_Tricks`, `V_View_Trick_Records`, `V_View_Freestyle_Reference`, `V_View_Set_Encyclopedia`, `V_Learn_Freestyle`, `V_View_Emerging_Vocabulary`, `V_View_Freestyle_Media_Hub`), each with success criteria grounded in the verified deployed behavior and with the shared hashtag and media-link semantics left owned by `V_View_Trick_Reference_Videos`. Every mounted freestyle route now traces to a named story. Still open: stories for the write paths that are themselves deferred (the modifier registry, relations, and the symbolic layers, parked until their authoring and validation model is designed); those stories gate only those deferred slices, not launch.
Done: every mounted freestyle route and every curation write path traces to a named story with success criteria, merged into `docs/USER_STORIES.md` with Dave's approval.

**FS-17 — Records-correction ergonomics** — P3, section 6; edited-but-skipped detection or a scoped rebuild mode plus documented procedure; done when a curator correcting a record row gets either the change or a loud warning.

**FS-18 — Confirm the terraging-chain rider reached Red**
P3 | external-decision support | audience: maintainer | status: SUPERSEDED (2026-07-07) by a queue-wide delivery reset | new: yes (surfaced from the queue's own caveat) | replaces: none
Originally: `freestyle/doctrine/RED_QUEUE.md` recorded that no committed artifact proves the terraging rider email was sent. Superseded: the queue now applies that posture to every open question — nothing is treated as delivered to Red until delivery is explicitly confirmed, and the queue carries one standing to-do (assemble the current packet, send or resend it, and only then mark items pending with Red). The narrow terraging check is absorbed into that queue-wide to-do; the work item lives in the queue file itself, owned by James (see FS-23).

---

### Absorbed from IMPLEMENTATION_PLAN.md (consolidation ratified 2026-07-07)

The maintainer directed that this report absorb every actionable freestyle item from `IMPLEMENTATION_PLAN.md`, leaving the plan with no freestyle to-do items. Each entry below is the complete, self-contained statement of the absorbed work; line numbers refer to the plan as it stood on 2026-07-07, before the consolidation edit. The audit verified every item's claimed state against code, database, and the live localhost pages (verification detail in section 12); nothing here is carried on trust.

**FS-19 — Build the in-app freestyle curation feature (the cutover feature)**
P1 | code + curator-workflow + production-safety | owner: Dave (platform) with James (content model) | status: LAUNCH BLOCKER (ratified decision 2) | replaces plan item: line 417 ("There is no in-app way to edit the trick dictionary") | new-from-audit: no (was deferred; scope decision is new)
Context: freestyle content is read-only at runtime today; every change is made by editing committed CSVs under `freestyle/inputs/` and re-running the rebuild (`freestyle/run_freestyle.sh`), which deletes and reloads the freestyle tables. That workflow dies at go-live: the ratified model makes the live database the single source of truth at cutover (matching the curated-media architecture in `docs/DESIGN_DECISIONS.md` section 1.13), the CSV pipeline is barred from production (FS-02's guard), and the whole-database replacement used by `scripts/deploy-rebuild.sh` becomes impossible once real member registrations exist in production. Without this feature, freestyle content would be frozen after launch; the maintainer chose to build it before launch instead.
Scope (maintainer-clarified): ALL freestyle database-backed content becomes admin-curatable, because after cutover the database is the single source of truth and anything without an edit path is frozen. That means every table the pipeline loads: `freestyle_tricks`, `freestyle_trick_aliases`, `freestyle_trick_modifiers` and `freestyle_trick_modifier_links`, `freestyle_trick_relations`, `freestyle_trick_sources` and `freestyle_trick_source_links`, `freestyle_records`, `consecutive_kicks_records`, `freestyle_trick_tips`, and the six `symbolic_*` tables (the doctrine-bearing layers get curator-grade validation in the service layer, equivalent to what QC script 22 enforces at load time today). Every write goes through prepared statements added to `src/db/db.ts` (the first INSERT/UPDATE statements for `freestyle_*` tables; today there are none, verified by grep); an actor guard reusing the curated-media pattern (`assertCuratorActorMayWriteCurated` in `src/services/curatorMediaService.ts:1060`, which `tests/CLAUDE.md` already anticipates freestyle inheriting); audit logging via `appendAuditEntry` with new namespaced `freestyle.*` action types; a rollback story; and the documented cutover procedure (final CSV rebuild, verify QC gates, deploy the database, in-app-only from then on). Editorial content compiled into the application (`src/content/freestyle*.ts`) stays code-authored and ships via code deploys; it is application code, not database data.
Sequencing: stories first (FS-16) per the repo rule that no schema or service code lands without a grounding story; then implementation; then cutover tests mirroring the curated-media cutover-test item that remains in the plan (freestyle tables survive a deploy, the rebuild refuses production, the admin path is the sole write surface). The production guard is built once, as FS-02 in Batch A; this task lists it as a component because the feature is incomplete without it, not as duplicate work.
Done: an admin can edit dictionary content in the running app with an audit trail; the CSV pipeline refuses production; the cutover procedure is documented and rehearsed on a disposable database.
Progress (2026-07-07): the `freestyle_tricks` scalar-row edit slice is built and tested. An admin-only surface at `/admin/freestyle/tricks` browses every row regardless of status, with text search and active/review-status filters; `/admin/freestyle/tricks/:slug/edit` edits one trick's nine scalar fields (canonical name, ADD, movement notation, execution notation, family, base trick, category, active flag, review status). The save path (`freestyleCurationService.updateTrickScalars` plus the `freestyleTricks.updateScalars` prepared statement in `src/db/db.ts` — the first UPDATE against a `freestyle_*` table, so the "today there are none" note above is now historical for this one table) commits the row update and one `freestyle.trick.updated` audit entry in a single transaction, redirects post-save with a saved indicator, re-renders at 422 with submitted values and per-field errors on invalid input, and 404s an unknown slug. Validation is field-shape (required canonical name, ADD empty/numeric/"modifier", category and review status within the existing values, active a boolean) plus one structural doctrine check ported from the pipeline's scoring vocabulary: scoring-bracket parity, where a numeric ADD must equal the count of scoring brackets (`[BOD] [DEX] [XBD] [DEL] [UNS] [PDX] [XDEX]`; `[KICK]` non-scoring) in the execution notation, enforced only when at least one scoring bracket is present so no existing row is blocked. The three attached-relationship write paths are now built and tested on the same edit page: adding and removing a trick's aliases (the alias slug derived to the lowercase-underscore form, and rejected when it equals any canonical trick slug regardless of status or an existing alias slug); attaching and detaching links to the existing registry sources (with an optional external URL and asserted ADD, duplicate links rejected, detach scoped to the trick and source); and adding and removing modifier links (an admin-supplied apply order defaulting to 1 when blank, with the resolved value stored and audited, the exact trick/modifier/apply-order triple rejected as a duplicate while the same modifier at a different order is allowed, and detach scoped to the full triple). Each is one transaction with one `freestyle.trick_alias.*` / `freestyle.trick_source_link.*` / `freestyle.trick_modifier_link.*` audit entry; a validation failure re-renders the form with the submitted values. The curator-identity guard is now shipped: every freestyle write path (scalar trick update, alias add/remove, source-link attach/detach, and modifier-link attach/detach) first runs a pre-go-live persona guard that refuses a seeded test-persona admin in a developer checkout (keyed on the same `allowCuratedSidecarWrites` flag as the curated-media guard: on in dev and the integration-test fixture, a no-op in staging and production), mirroring `assertCuratorActorMayWriteCurated`. The admin remains the audit actor, with no owner column, no on-behalf-of audit metadata, and no schema change; the guard is covered by a 403 test on each of the seven write paths. Freestyle world-record curation is now built, implementing `A_Edit_Freestyle_Record`'s edit and create criteria (the story's browse search-by-holder/trick/type refinement is the one small listing criterion not yet built; the browse lists all rows unfiltered): `/admin/freestyle/records` browses every record including the superseded and low-confidence rows the public page hides, one record's fields are editable (holder as a validated historical-person id and/or free-text name, record type constrained to the existing types, confidence and date precision constrained to the column's allowed values, superseded-by validated as a real other record), and a New Record form creates a row with a generated id. Edit and create share one form template and one validation helper; each save is one transaction with one `freestyle.record.updated` / `freestyle.record.created` audit entry, behind the same persona guard. There is deliberately no hard delete: a beaten record retires via its superseded-by pointer and a questionable one via its confidence rating, per the story. Consecutive-kicks curation is also built, implementing `A_Edit_Consecutive_Kicks_Record` in full: the durable-identity prerequisite shipped first (a stable surrogate id primary key plus created/updated timestamps, with the former display-order integer demoted to a mutable-but-unique display position), then `/admin/freestyle/consecutive-records` browses every row grouped by section and division, one row's fields are editable keyed on the stable id (with the display position validated as a unique positive whole number), a New Record form creates a row with a generated id, and a single-POST hard delete removes one by id. Each write is one transaction with one `freestyle.consecutive_record.created` / `.updated` / `.deleted` audit entry, behind the persona guard. Still open in FS-19: trick-tip moderation, grounded by its drafted story (`A_Moderate_Freestyle_Trick_Tip`) and post-launch acceptable (the tips are display-only legacy-imported advice). Trick-tip moderation is post-launch acceptable: the tips are display-only legacy-imported community advice, and the small number of unresolved tips can be finalized in the final pre-cutover rebuild. The `symbolic_*` and observational tables stay deferred until their authoring and validation model is designed; no story is drafted for them in this batch. The cutover mechanics are now built and documented. Tests pin the source-of-truth contracts: an integration suite proves app boot and the public read surfaces leave the freestyle trick, world-record, and consecutive-kicks tables byte-identical (the runtime half of edits surviving a deploy); a unit suite pins that the code-only deploy script (`scripts/deploy-code.sh`, the routine post-cutover deploy) never references the database or the rebuild tooling (the transport half); and the rebuild-guard pytest pins that the freestyle rebuild orchestrator invokes its dev-db guard before any loader. The destructive rebuild deploy is mechanically retired post-cutover: a guard prepended into its root ssh stream refuses any host whose `/srv/footbag/env` carries `FOOTBAG_CUTOVER_COMPLETE=1`, before any live mutation and with no bypass flag, covered by its own pytest. The operations guide documents the procedure end to end: the freestyle source-of-truth model, the final sanctioned CSV rebuild in the cutover preflight, freestyle row counts in the snapshot manifest and the post-restore checks, the marker-setting closing step of the DNS cutover sequence, and the corrective-in-app-edit-first rollback model. Also still open: the operator-run staging rehearsal (make one edit of each kind via the admin surfaces, run the code-only deploy, verify all three edits persist, and demonstrate one guard refusal), which closes the cutover story's rehearsal requirement; the remaining write-time validation (operator-reference ADD consistency; terminal-atom stays deferred pending a maintainer ruling; the name-to-slug check's one-time normalization prerequisite has landed with its committed exception file, so that check is now buildable as a future slice); and creating new provenance-source registry rows (only existing sources are linkable today).

**FS-20 — Link the remaining freestyle pages to their media galleries**
P2 | UX-copy/code | owner: Dave | status: pre-launch nice-to-have (was pre-Kanban) | replaces plan item: line 94 | new-from-audit: no
Context: trick browse rows and trick detail pages already link to media galleries (`/media/browse?context=<slug>` shaped at `src/services/freestyleService.ts:5676` and `:7213-7214`), but the family browse view, the `/freestyle` landing page, and the `/freestyle/media` hub do not emit gallery links (verified: no other `media/browse?context` occurrence in the service). The intent is that every surface showing a trick with media offers the gallery path.
Done: family view, landing, and media hub emit gallery links where media exists, following the existing display-and-href pair pattern (services build hrefs; templates render them); route tests assert the links.

**FS-21 — Record the difficulty-tag design once the PassBack compound tags are split**
P3 | docs-stories | owner: Dave | status: blocked behind FS-27 | replaces plan item: line 108 | new-from-audit: no
Context: the curated PassBack tutorial galleries currently use compound difficulty tags (`#passback_advanced`, 20 media rows; `#passback_beginner`, 14 rows; verified in `media_tags` this run). The target design makes difficulty (`#advanced`, `#beginner`) its own tag kind, separate from source tags. Once FS-27 executes the split, record the difficulty-tag design in `docs/USER_STORIES.md` and `docs/DATA_GOVERNANCE.md` so the tag vocabulary is governed.
Done: the split has happened and both documents state the design (doc edits individually approved).

**FS-22 — Freestyle demo poster frames and MP4 conversion**
P2 | data/curated-media | owner: James | status: pre-launch (was pre-Kanban) | replaces plan item: line 199 | new-from-audit: no
Context: 17 freestyle demo videos sit in `curated/freestyle_demos/` as `.mov` files with `.meta.json` sidecars but no poster frames and no MP4s (verified this run: 17 `.mov`, 17 `.meta.json`, 0 `.poster.jpg`, 0 `.mp4`). The curated-media seeder (`scripts/seed_fh_curator.py`) requires both a video source and a poster source, so all 17 demos skip seeding and never reach the site.
Done: each demo has a poster frame and an MP4 source; the seeder ingests all 17; the demos render on their trick pages.

**FS-23 — Red Wave 3 doctrine decisions (external blocker)**
P-external | external-decision | owner: Red Husted (rules expert), routed by James | status: blocked on external answers | replaces plan items: line 203 and blocker line 387 | new-from-audit: no
Context: the open freestyle doctrine questions were consolidated into a packet (the "Wave 3" letter) after the 2026-07-02 reduction audit. Delivery-status reset (2026-07-07): the repository does not prove the packet reached Red, so the queue now treats every open question as not yet delivered until delivery is explicitly confirmed; the queue's standing to-do is to assemble the current packet, send or resend it, and only then mark items pending with Red. The live tracker is `freestyle/doctrine/RED_QUEUE.md` (the list of record, maintained delete-on-answer): the blurry-expansion predicate (gating 64 candidate rows), the embedded-base labeling frame for down-family compounds, four operator structural definitions (blazing, flailing, slapping, blistering), the cross-body rake base, the terraging chain, and a combined rider list. Answers are integrated into `RED_RULINGS.md` and the topic doctrine documents as they arrive.
Done: this item closes question-by-question as rulings land; it blocks the gated promotion rows, three record badges, and FS-24 in part. The only repository-side work is supporting the send; everything else waits on answers.

**FS-24 — The unresolved world-record trick names**
P2 | data + external-decision | owner: James (curator) + Red | status: blocked on FS-23 and curator viewings | replaces plan item: line 216 | new-from-audit: no (enumeration verified)
Context: 204 world-record rows exist in `freestyle_records`; most link to a dictionary trick. The audit re-derived the unresolved set by joining record trick names against `freestyle_tricks` and `freestyle_trick_aliases`: six names await Red (Blink, Double Dyno, Double Whip, Toe Spinning Toe, Solestice, Stepping Ducking Blurry Whirl), six await curator video viewings (the same-side multi-component set: Double Leg Over(ss), Eggbeater(ss), Fairy Double Leg Over(ss), Pigbeater(ss), Smog(ss), Pixie DSO(ss)), and three "Unique N-Dex / N-ADD" record categories correctly badge no single trick by design. ("Scorpion's Tail" looks unresolved at first glance but resolves to slug `scorpions_tail`; apostrophe normalization is the trap.)
Done: each name either gains a dictionary resolution (row or alias) or a recorded ruling that it stays unresolved; the record badges render accordingly.

**FS-25 — Retire the exploration corpus at go-live (after relocating live dependencies)**
P2 | data + docs | owner: James + Dave | status: pre-cutover, decided (ratified decision 4) | replaces plan items: line 226, plus the surviving part of line 288 | new-from-audit: no (decision is new)
Context: `exploration/` holds 1,072 tracked files across 41 top-level directories of freestyle research scratch. The runtime and the rebuild provably never read it (grep-verified; the two references inside `freestyle/` are a comment and a docstring). Live dependencies that must be relocated before retirement: (a) the two symbolic-grammar generator input registries read by `legacy_data/scripts/build_symbolic_grammar_2.py` from `exploration/freestyle-notation-grammar/` (script lines 38-39) and by `build_symbolic_grammar_master.py` from `exploration/footbagmoves-federation/`, which move under `freestyle/inputs/` so the committed `freestyle/symbolic_grammar/*.csv` remain regenerable (otherwise they freeze permanently); (b) any surviving citation from active documents (the plan cited one curator worklist inside `exploration/`); (c) the Glossary V2 design corpus (`exploration/glossary-v2-architecture/`) if that track is still active at go-live, which moves to a durable home. The three exploration files citing the deleted `legacy_data/IMPLEMENTATION_PLAN.md` (listed in section 11) need no fixing if retirement deletes them; fix them only if they are among the survivors.
Done: dependencies relocated and regeneration re-verified; the corpus retired at go-live behind one consolidated approval (deletion is destructive and gets its own gate); no active document or script references a retired path.

**FS-26 — Tracked deviation: count and quantifier tokens render as operators in symbolic notation**
P3 | code (deviation, not yet scheduled) | owner: James | status: accepted deviation, carried here as the tracked record | replaces plan item: line 229 | new-from-audit: no
Context: in the symbolic notation renderer, count-bearing and quantifier tokens (`double`, `triple`, `surging`, `high`) render with the same visual treatment as operators. The code carries the deviation honestly with Current/Target markers at `src/services/semanticNotationRendering.ts:115-120` (verified). Target: render count/quantifier tokens distinctly from operators. This report is now the tracked home for the deviation (the maintainer consolidated all freestyle items here; the in-code Current/Target comment stays).
Done: the renderer distinguishes the token classes and the Current/Target comment is removed, or the deviation is explicitly re-accepted at cutover review.

**FS-27 — Tracked deviation: split the PassBack compound difficulty tags**
P3 | data/curated-media (deviation) | owner: James | status: accepted deviation, carried here as the tracked record | replaces plan item: line 230 | new-from-audit: no
Context: the PassBack tutorial galleries use compound tags (`#passback_advanced` 20 rows, `#passback_beginner` 14 rows; the consolidated `#passback_tutorials` gallery tag, 38 rows, also exists; all verified in `media_tags` this run). Target: difficulty becomes its own tag kind (`#advanced`, `#beginner`) alongside the source tag, per the tag-vocabulary design that FS-21 then records.
Done: compound tags replaced by source + difficulty tags; galleries re-keyed; FS-21 unblocked.

**FS-28 — Author the five remaining Set Encyclopedia teaching pages**
P3 (post-V1, parked) | UX-copy/content | owner: James | replaces plan item: line 237 | new-from-audit: no
Context: the Set Encyclopedia's concept-first teaching pages exist for eight sets (stepping, pixie, fairy, whirling, swirling, floating, surfing, warping; verified as the `slug:` entries in `src/services/symbolicSetEducation.ts`). Five named sets remain without teaching pages: Atomic, Miraging, Quantum, Barraging (Furious), and Nuclear. Note the Quantum page is entangled with FS-36 (whether Quantum and Miraging are one set or two).
Done: all five pages authored in the established education-branch format and rendering on their set-detail routes.

**FS-29 — Source a replacement demo video for sole survivor**
P3 (post-V1, parked) | curated-media | owner: James (curator) | replaces plan item: line 250 | new-from-audit: no
Context: the trick `sole_survivor` has no usable demo; its one candidate clip is tagged `#unavailable_embed` (2 media rows carry that tag), which the service suppresses from galleries (`MEDIA_TAG_SUPPRESS` at `src/services/freestyleService.ts:329`; filtered again at `src/db/db.ts:5731`). The page renders without a demo until a replacement is sourced.
Done: a usable clip is curated and tagged; the suppression tag is removed from the replaced item; the trick page shows its demo.

**FS-30 — Tag the BAP Individual Shred Collection clips by trick and set**
P3 (post-V1, parked) | curated-media | owner: James (human viewing pass) | replaces plan item: line 257 | new-from-audit: no
Context: 72 curated player videos carry the `#individual_shred_videos` collection tag (verified in `media_tags`), tagged only by collection and era (`#bap`, `#bap_expansion` 31, `#bap_golden_age` 20). Until someone watches each clip and adds trick and set tags, these videos cannot surface on trick pages (the trick-tag invariant keys galleries by trick tags).
Done: each of the 72 clips carries the trick and set tags a viewing supports; tagged clips appear on the corresponding trick pages.

**FS-31 — Member Tips remainder**
P3 (post-V1, parked) | data | owner: James | replaces plan item: line 263 | new-from-audit: no (counts verified)
Context: the legacy footbag.org Member Tips were recovered and loaded by `freestyle/loaders/27_load_trick_tips.py`; current state in `freestyle_trick_tips` (verified this run): 409 published, 7 unresolved_freestyle (tip text that could not be confidently matched to a trick), 1 unresolved_frontier, 2 future_net (Net-discipline tips parked until a Net surface exists). Only `status='published'` rows render.
Done: the 8 unresolved tips are matched or explicitly rejected; the 2 Net tips move when a Net home exists.

**FS-32 — Technique Notes for the four source-blocked tricks**
P3 (post-V1, parked) | content | owner: James, partly blocked externally | replaces plan item: line 274 | new-from-audit: no
Context: four tricks lack Technique Notes because no reliable execution source exists yet: `atomic_reverse_guay`, `paradox_whirling_swirl`, `quantum_guay`, `quantum_legover`. The two quantum entries are additionally entangled with FS-36 (Quantum vs Miraging doctrine).
Done: notes authored from a real source (video or expert description) for each, or the gap recorded on the page as honest incompleteness per the publication contract.

**FS-33 — IFPA freestyle rules wording (external blocker)**
P-external | external-decision | owner: IFPA (via Dave) | replaces plan item: blocker line 386 | new-from-audit: no (state verified)
Context: the freestyle pages' rules buttons are held back pending official wording for the competition formats. `ifpa/rules/freestyle.md` currently holds Routine (section 505), Shred / Timed Technical Variety (506), and Circle Contest (507); the Sick 3 format wording is absent (verified by header scan this run). When the IFPA supplies it, the freestyle-page rules buttons re-enable.
Done: Sick 3 wording lands in `ifpa/rules/freestyle.md`; the rules buttons on the freestyle pages are re-enabled and route-tested.

**FS-34 — Local MP4 trick-clip ingestion**
P3 (post-V1, parked) | code/curated-media | owner: Dave | replaces plan item: line 418 | new-from-audit: no
Context: the curated pipeline ingests embeds and the seeder's own transcode path, but there is no general way to ingest a local, non-embed MP4 as a trick clip. Needed before local clips (for example, curator-shot demos) can join trick galleries.
Done: a documented ingest path accepts a local MP4 with poster, stores per the media model, and the clip renders on its trick page.

**FS-35 — Movement Systems completeness audit**
P3 (post-V1, parked) | data/topology | owner: James | replaces plan item: line 419 | new-from-audit: no
Context: the Movement Systems browse view groups tricks by movement concept; Flying already has its movement-neighborhood surface (pinned by `tests/integration/freestyle.flying-neighborhood.routes.test.ts`). The completeness audit inventories the remaining movement concepts (Alpine, Zulu, Weaving, Tapping, and others) and decides which get neighborhood surfaces. Gated behind current doctrine work.
Done: the inventory exists with a per-concept decision; approved neighborhoods are built with the same observational (non-canonical) framing as Flying.

**FS-36 — Quantum and Miraging: one set or two (maintainer working ruling)**
P3 | doctrine-wording | owner: James (maintainer) | replaces plan item: line 420 | new-from-audit: no
Context: the platform treats Quantum and Miraging as distinct sets (verified in `symbolicSetEducation.ts` and content), and the Identity doctrine paper now places this pair under James's working ruling rather than as an external decision. The working ruling treats Quantum and Miraging parallel to Atomic and Illusioning: Quantum is the uptime set concept, and Miraging is downtime or descriptive mirage-family language, so the two stay distinct rather than merging. They are already distinct in the data, so the ruling settles wording, not structure. This is not escalated to the rules expert unless a real contradiction survives a source-and-notation audit. The stale wording to reconcile is the operator reference's description of miraging as an uptime set (it should read as the downtime or descriptive mirage-family reading under this ruling). Touches parts of FS-28 and FS-32 as a wording dependency, not an external block.
Needed: reconcile the miraging set/operator wording across the set encyclopedia, operator reference, and teaching content so Quantum reads as the uptime set and Miraging reads as the downtime or descriptive mirage-family reading. No dictionary rows should merge. This is a maintainer-owned wording task, not an external Red block. The working ruling is already reflected in the Identity paper.

**FS-37 — Tracked deviation: Butterfly stored notation keeps SAME/OP while the public atom is opposite-side (far) by default**
P3 | code/data (deviation) | owner: James | status: accepted deviation, tracked here | new-from-audit: yes (post-audit consistency slice)
Context: the `freestyle_tricks` butterfly row stores `SET > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]` (either-side entry), but the public trick page, glossary/family card, and browse surfaces render the opposite-side (far) default `SET > OP OUT [DEX] > OP CLIP [XBD] [DEL]` via the core-atom spec override in `src/content/freestyleLandingContent.ts` (resolved by `resolveOperationalNotationRaw`). The stored row is intentionally left unchanged; the atom spec is the guard. Butterfly Same Side is the named same-side variant.
Done: the stored butterfly notation is normalized to the far default (so the DB row and the atom-spec override agree), or the deviation is explicitly re-accepted at cutover review.

**FS-38 — Tracked deviation: Around the World stored notation keeps IN/OUT while the public atom is inward-only**
P3 | code/data (deviation) | owner: James | status: accepted deviation, tracked here | new-from-audit: yes (post-audit consistency slice)
Context: the `freestyle_tricks` around_the_world row stores `TOE > SAME IN/OUT [DEX] > SAME TOE [DEL]` (direction-either), while the public atom spec and prose now treat Around the World as the inward circle only, with Orbit as the outward/reverse circle (its own canonical atom). The notation card renders the inward-only spec; the stored IN/OUT is latent and not surfaced. The description prose was already reconciled to inward-only.
Done: the stored ATW notation is normalized to `TOE > SAME IN [DEX] > SAME TOE [DEL]`, removing the latent IN/OUT so the DB row matches the public inward-only reading.

**FS-39 — Butterfly-family compound notations: decide whether the far default propagates**
P3 | doctrine/data | owner: James (maintainer) | new-from-audit: yes (post-audit consistency slice)
Context: the base Butterfly renders far/opposite by default, but the eleven butterfly-family compound notations still carry the side-either `SAME/OP` entry dex (for example `butterfly_swirl`, and the notation-derivation test fixtures). Whether the far default should propagate to those compounds is an open doctrine/data question; the base-Butterfly slice deliberately did not migrate them.
Done: a ruling on whether butterfly-family compounds adopt the far default, and if so a single migration of the eleven compound notations (source CSVs, family cards, resolved-formula content, and the parser-derivation tests); or an explicit decision to keep them side-either.

**FS-40 — Decide the Infinity / Far Butterfly model**
P3 | doctrine/data | owner: James (maintainer) | new-from-audit: yes (post-audit consistency slice)
Context: Infinity is currently a display-suppressed alias of Butterfly (governance `surfaceOnBrowse: false`), and Far Butterfly is a retired canonical row that 301-redirects to Butterfly. The open question is whether Infinity / Far Butterfly should become a distinct clipper-set canonical row (its own trick) or a named subform of Butterfly, rather than staying a suppressed alias.
Done: a ruling on the Infinity / Far Butterfly model, and the alias/row/subform change it implies, with the alias governance and any redirect updated to match.

**FS-41 — Polish: Barfly terminal bracket order**
P3 (post-V1, parked) | data/notation | owner: James | new-from-audit: yes (post-audit consistency slice)
Context: the barfly family-card `canonicalFormula` (and the matching stored row) terminates in `OP CLIP [DEL] [XBD]`, the reverse of the standard `[XBD] [DEL]` order used elsewhere. Cosmetic; no ADD or structural impact.
Done: the barfly terminal bracket order is normalized to `[XBD] [DEL]`, or the reversed order is confirmed intentional.

**FS-42 — Polish: Orbit atom label calls itself an "alias" of reverse Around the World**
P3 (post-V1, parked) | copy | owner: James | new-from-audit: yes (post-audit consistency slice)
Context: the Orbit core-atom `equivalences[0]` reads "core atom: alias of reverse around-the-world" in `src/content/freestyleLandingContent.ts`. Orbit is the canonical atom for the outward/reverse circle, not an alias, so the label frames the canonical entry backwards.
Done: the Orbit equivalences label reads as the reverse-direction counterpart of Around the World (for example "core atom: reverse-direction around-the-world"), not as an "alias".
CLOSED (2026-07-08). The Orbit core-atom label now reads "core atom: dex with reverse full bag orbit", describing orbit by its own mechanic in parallel with around-the-world's "core atom: dex with full bag orbit", rather than framing it as an alias. Content string only in `src/content/freestyleLandingContent.ts`; no notation, ADD, slug, alias, or route changed.

**Post-V1 vision (carried from the plan; directions, not tasks).** Each becomes a scoped task only when the maintainer pulls it: (A) Glossary layering: a layered, collapsible glossary as the flagship of version 1.1 (the sanctioned Glossary V2 design track). (B) Foundational Bases: teaching pages for the anchor positions (Toe Stall, Clipper Stall, and peers) as a pedagogical layer, not an ontology change. (C) Teaching the algebra: Mirror Law, operator algebra, and notation walkthroughs with a running ADD sum. (D) Frontier as a story: the 8-ADD ceiling, 9-ADD claims, and open doctrine as narrative. (E) History by mechanism: rewrite the history page around vocabulary-evolution mechanisms. (F) Navigation for learners: progression ladders derived from the operator lattice, absorbing the symbolic-grammar UI rollout and the Movement Systems audit (FS-35).

## 14. IP consolidation: the executed edit and the complete mapping

The maintainer ratified full consolidation on 2026-07-07: every actionable freestyle item leaves `IMPLEMENTATION_PLAN.md` and lives here instead; the plan keeps only non-freestyle items, the freestyle standing rule and standing summary (context, not to-dos), and one pointer entry to this report. This section is the complete accounting; nothing was dropped silently. Line numbers refer to the plan before the edit.

**Removed from the plan and absorbed into section 13 (one-to-one; no item maps to two tasks, no task absorbs two items except where stated):**

| Plan line | Item | Absorbed as |
|---|---|---|
| 94 | Link the remaining freestyle pages to their galleries | FS-20 |
| 102 | Finish tidying the freestyle skills | FS-04 |
| 108 | Record the difficulty-tag design after the PassBack tag split | FS-21 |
| 198 | Author the missing freestyle-dictionary user stories | FS-16 |
| 199 | Freestyle-demo poster frames and MP4 conversion | FS-22 |
| 203 | Trick-promotion decisions (Red Wave 3; doctrine block) | FS-23 |
| 216 | The last ~10 unresolved world-record trick names | FS-24 |
| 226 | Go-live disposition of the exploration corpus | FS-25 |
| 229 | Deviation: count/quantifier tokens render as operators | FS-26 |
| 230 | Deviation: PassBack compound difficulty tags | FS-27 |
| 237 | Remaining Set Encyclopedia teaching pages | FS-28 |
| 250 | Sole survivor replacement demo | FS-29 |
| 257 | Tag the BAP Individual Shred clips | FS-30 |
| 263 | Member Tips remainder | FS-31 |
| 274 | Technique Notes for four source-blocked tricks | FS-32 |
| 281 | De-epoch the freestyle test labels | FS-13 |
| 288 | Strip embedded design-doc references | FS-13 (test-side residue) + FS-25 (the three exploration files; the freestyle test/content parts were verified already done) |
| 315-366 | Post-V1 vision directions A-F | carried verbatim as the "Post-V1 vision" block at the end of section 13 |
| 386 | Blocker: IFPA freestyle rules wording | FS-33 |
| 387 | Blocker: Wave 3 answers from Red Husted | FS-23 |
| 417 | Deferred: no in-app way to edit the trick dictionary | FS-19 (now launch scope) |
| 418 | Deferred: local MP4 trick clips | FS-34 |
| 419 | Deferred: Movement Systems completeness audit | FS-35 |
| 420 | Deferred: Quantum and Miraging, one set or two | FS-36 |

**Kept in the plan (not freestyle to-dos):** the freestyle surface-propagation standing rule (line 162; explicitly marked "do not delete when items close") and the "State of freestyle" standing summary (lines 164-196; context, updated with the pointer below). Items broader than freestyle also stay: the curated-media cutover tests (line 72), the Net gallery (line 95), the media `mime_type` column (line 96), and the multi-pipeline doc-sync (line 146; its freestyle-specific evidence is in this report, but the item spans the legacy and Net pipelines too).

**Added to the plan (one pointer entry):** "All freestyle work is consolidated in `freestyle_remediation_report.md` (repo root): backlog FS-01..FS-36 with the launch-scope curation cutover (FS-19), implementation batches, ratified decisions, and the two tracked freestyle deviations (FS-26, FS-27). This plan carries no freestyle to-do items; new freestyle work starts from the report."

**Note on the two deviations (FS-26, FS-27):** the repo's comment rule normally records Current/Target deviations in the plan. By the maintainer's consolidation decision, this report is the tracked home for these two freestyle deviations; the Current/Target comments in the code stay unchanged and now correspond to FS-26 and FS-27 here.

## 15. Implementation batches

Each batch is a coherent unit of work a fresh session can pick up alone; per the maintainer's standing preference, work runs batch-by-batch with human review between batches. Public-wording, canonical-doc, and `.claude/` edits inside any batch are shown as literal before/after for individual approval at execution time.

- **Batch E — Stories (run FIRST; gates Batch J).** Goal: every deployed route and every planned curation write path traces to a story with success criteria, because the repo forbids schema or service code without a grounding story. Tasks: FS-16 (nine dictionary stories from section 9 plus the curation stories). Owner: James drafts, Dave approves. Done: stories merged into `docs/USER_STORIES.md`.
- **Batch A — Launch blockers (code).** Goal: nothing duplicate-content or data-destructive at go-live. Tasks: FS-01 (alias 301 canonicalization plus internal-link audit), FS-02 (production refuse-guard, the first piece of FS-19). Files: `src/services/freestyleService.ts`, `freestyle/run_freestyle.sh`, a shared loader helper, new route tests and pytest. Done: alias URLs 301; rebuild refuses non-dev databases. Verify: `npm test`, `npm run build`, guard pytest.
- **Batch J — Freestyle curation cutover (launch scope; the largest batch).** Goal: the database can become the single source of truth at go-live because in-app editing exists. Tasks: FS-19 (admin write surface, actor guard, audit logging, rollback, cutover procedure, cutover tests). Gated on Batch E stories. Done: FS-19's done condition; cutover rehearsed on a disposable database.
- **Batch F — Test nets.** Goal: the cross-cutting safety nets cover freestyle. Tasks: FS-03 (crawl, e2e, accessibility, mobile, runtime-reads guard), FS-06 parts (c) and (d) (naming-invariant regression test; reseed the search suite with underscore slugs), FS-11 (dictionary-loader pytests), FS-12 (empty-state route tests). Done: all new suites green in `./run_all_tests.sh`.
- **Batch B — Copy standard sweep.** Goal: freestyle copy meets the view-layer content standard. Tasks: FS-05 (em-dash sweep), FS-09 (nine orientation/jargon fixes). Every wording change individually approved. Done: zero prose em dashes; fixes landed; persona spot re-walk reads clean.
- **Batch G — Code-pattern cleanup.** Goal: freestyle code indistinguishable from repo conventions. Tasks: FS-07 (controller 404/branching), FS-08 (epoch-label identifiers), FS-06 parts (a) and (b) (CSV name normalization plus the QC hard gate; curator confirms the genuine-hyphen exception list). Done: conventions grep clean; rebuild passes with the new gate.
- **Batch C — Source-of-truth hardening.** Goal: generated artifacts provably match inputs; pre-cutover records corrections safe. Tasks: FS-10 (drift guard; retire the orphan), FS-17 (records-loader edited-but-skipped detection), FS-22 (demo posters and MP4s). Done: drift guard fails on stale regeneration; records edits warn or land; demos seed.
- **Batch D — Pipeline hygiene and exploration retirement.** Goal: the pipeline is self-contained and the scratch corpus is gone at go-live. Tasks: FS-14 (rename `inputs/noise/`, extend rule globs), FS-25 (relocate generator inputs and any surviving citations, then retire `exploration/` behind one consolidated approval), FS-20 (gallery links). Done: rebuild green after the rename; regeneration works from relocated inputs; corpus retired; gallery links live.
- **Batch H — Harness truthfulness.** Goal: agent-facing surfaces tell the truth. Tasks: FS-04 (skills corrections), FS-18 (confirm the terraging rider email). Every `.claude/` edit individually approved. Done: skills verified claim-by-claim against code; queue caveat resolved.
- **Batch I — Post-V1 (parked until pulled).** Tasks: FS-13 (test de-epoch), FS-15 (service-size seams), FS-21, FS-26, FS-27, FS-28, FS-29, FS-30, FS-31, FS-32, FS-34, FS-35, FS-36 (Quantum/Miraging wording, maintainer-owned), and the vision directions. External blockers FS-23, FS-24, FS-33 close as answers arrive, independent of batches.

Suggested order: E first (longest human lead time; gates J), then A, then J in parallel with F, then B, G, C, D, H; I stays parked. The IP consolidation edit itself (section 14) is already executed alongside this report.

## 16. Human decisions: ratified outcomes (2026-07-07)

Every decision card raised by the audit was answered by the maintainer during plan review. The outcomes, with their rationale, so no future session re-litigates them:

**DC-1 — Alias URL policy: RATIFIED, 301-redirect.** Alias slugs permanently redirect to the canonical trick URL, and internal links must always use canonical slugs so the redirect is only a safety net for external links. Rationale: the maintainer's governing principle is the cleanest final model with minimal redirects and one canonical URL per trick; this also matches how sets and modifiers already behave. Executed by FS-01.

**DC-2 — Stored display names: RATIFIED, normalize the data.** The 543 non-conforming `canonical_name` values are normalized in the source CSVs (mechanical hyphen-to-space), with a curator-confirmed exception list for genuine hyphens, then a QC hard gate keeps the invariant. Rationale: one source of truth means the data is correct in storage, not repaired at render. Executed by FS-06; the curator exception list is the one remaining human input, collected at execution.

**DC-3 — Rebuild guard: RATIFIED, blanket refusal.** `run_freestyle.sh` and the loaders refuse any non-development database with no in-band bypass, mirroring the curated-media seeder rule, because at cutover the database becomes the single source of truth and the CSV pipeline retires from the production path permanently. The one sanctioned final CSV rebuild happens on the pre-cutover database immediately before the switch. Executed by FS-02 as the first piece of FS-19.

**DC-4 — Orphaned generated file: RATIFIED, retire.** `src/content/freestyleTrackedNames.ts` and its generator are deleted; a committed generated artifact nobody consumes is a second source of truth by definition. Executed by FS-10.

**DC-5 — Symbolic-grammar regenerability: RATIFIED, relocate before retiring.** The two generator input registries move from `exploration/` into `freestyle/inputs/` before the exploration corpus is retired, so the committed symbolic-grammar CSVs remain regenerable and the freestyle pipeline honors its own self-containment invariant. Executed by FS-25.

**DC-6 — Curation parity timing: SUPERSEDED by the launch-scope decision.** The full in-app curation feature (writes, actor guard, audit log, rollback, production guard, cutover procedure) is launch scope, not post-launch. Executed by FS-19, stories-first via FS-16.

**DC-7 — `inputs/noise/` naming: RATIFIED, rename.** The folder becomes `freestyle/inputs/base_dictionary/`, with loader 17's three path constants updated in the same change. Executed by FS-14.

**Additional maintainer directives ratified in the same review:** the live database becomes the single source of truth at go-live (decision 1); `exploration/` proves a real use or is retired at go-live (decision 4); and ALL freestyle to-do items leave `IMPLEMENTATION_PLAN.md` and live in this report (section 14).

**Still-open human inputs (tracked as tasks, not decisions for this report):** the Red Wave 3 doctrine answers (FS-23), the curator video viewings behind the same-side record names (FS-24), the IFPA Sick 3 rules wording (FS-33), and the demo poster/MP4 assets (FS-22). (The genuine-hyphen exception list was ruled and committed at FS-06's execution; the terraging-rider question folded into the queue-wide delivery reset under FS-23; and the Quantum-vs-Miraging question is no longer an awaited external input, having moved to a maintainer-owned wording reconciliation under FS-36.)

## 17. Approval record and starting point for a fresh session

The audit ran 2026-07-07 in a read-only session. The maintainer approved the remediation plan the same day, ratified the decisions in sections 1 and 16, and directed the full consolidation; the `IMPLEMENTATION_PLAN.md` edit was then executed with approval, so the work's artifacts are exactly two: this report and that plan edit. **No remediation code has been written**: the maintainer explicitly ordered "report only, do not fix now," so every task FS-01..FS-36 is untouched work.

A fresh session should start here: read sections 1, 13, and 15; pick up Batch E (stories, human-gated, longest lead) and Batch A (the two launch-blocking code fixes) per the section 15 order; honor the per-edit approval gates (public wording, canonical docs, `.claude/` files); and re-verify any file:line citation before editing, since the codebase may have moved since this report was written.

## 18. Reconciliation addendum — second verification pass (2026-07-07)

A second pass re-verified every launch-relevant finding against the repository HEAD, which by now carried three freestyle commits made after the original audit ran (the blurry per-trick fix, the flat-chapter glossary rebuild, and the release-blocker remediation). Under explicit maintainer direction, the two launch-blocking Batch A code fixes were executed in this pass; the rest of the backlog stands. Where the fix or the tree has moved past the original prose, trust the tree; the corrections below say where.

**Executed this pass (Batch A):**

- **FS-01 (alias 301) — DONE, verified.** `trickRouteRedirectTarget` (`src/services/freestyleService.ts`) now resolves a slug that has no canonical trick row against `freestyle_trick_aliases` (reusing the existing `getCanonicalForAlias` statement) and returns `/freestyle/tricks/<canonical>`, which the controller already serves as a 301. A canonical row always wins, so a canonical slug that also appears as an alias still renders its own page. New suite `tests/integration/freestyle.trick-alias-redirect.routes.test.ts` pins alias-301-to-canonical, canonical-200, canonical-wins-over-a-shadowing-alias, modifier-301-unchanged, and garbage-404. The DC-1 internal-link addendum was checked: no service or trick template constructs an alias href, so the redirect is a safety net that rarely fires.

- **FS-02 (production refuse-guard) — DONE, verified.** New standalone guard `freestyle/_assert_dev_db.sh` refuses the rebuild unless FOOTBAG_ENV is unset or exactly "development" AND the canonicalized target database is one of this checkout's own disposable databases; `freestyle/run_freestyle.sh` calls it before any loader; there is no bypass flag. Pytest `legacy_data/tests/test_freestyle_rebuild_guard.py` pins allow-dev-path, allow-CI-path, refuse-non-development-environment, refuse-alternate-path, and refuse-alternate-path-with-a-missing-environment. Placed as a standalone script (not inside a loader's DB-open helper) so it unit-tests without running a loader.
  - **Scope note, a deviation from the DC-3 wording.** DC-3 said the guard allows "database/footbag.db". The guard as built allows two in-checkout databases: `database/footbag.db` (the dev default) and `database/footbag-ci.db`, because the CI loader-smoke gate sets `FOOTBAG_DB_PATH=./database/footbag-ci.db` (`.github/workflows/ci.yml`), so a footbag.db-only guard would have refused and broken that gate. Both are disposable in-checkout databases under `database/`; a production database never is, so the safety intent (refuse any live database) is preserved. Paths are canonicalized, so a relative or symlinked path cannot slip a live database past the check.

**Evidence corrections to the original report (trust the tree):**

- **FS-01's "no test pins the alias-URL behavior either way" was wrong.** A test pinned the pre-DC-1 behavior: `tests/integration/freestyle.record-linkage.routes.test.ts` asserted the alias URL `2_bag_juggle` renders 200 (a duplicate page), the exact behavior DC-1 forbids. It is corrected in this pass to assert the 301-to-canonical contract.

- **Accessibility coverage is broader than the report states.** The axe scan (`tests/e2e/accessibility.spec.ts`) now includes `/freestyle/glossary` alongside the freestyle landing (added with the flat-chapter glossary work). FS-03's accessibility sub-item shrinks accordingly: the scan still omits tricks index, trick detail, and set detail, and the color-contrast rule is still globally disabled, but the glossary is covered.

- **The "eight dead memory references" in FS-04 do not exist.** An existence check of every prefix-named memory reference across the five freestyle skills found zero missing files (for example `feedback_modifier_public_visibility.md`, cited as absent, is present and live). The FS-04 dead-memory-pointer component is void. The other FS-04 components remain real and verified: the hyphen-form slug examples (`footbag-freestyle-dictionary/REFERENCE.md:80`) and the stale "Modifier Reference section is a Handlebars block comment" claim (`footbag-freestyle-dictionary/SKILL.md:233`; `tricks.hbs` has no such section and no `content.modifiers` reference).

- **FS-05 and FS-06 counts re-run essentially unchanged:** naming invariant 543 of 962 (identical); em dashes 183 template entities (was 188) plus 154 service strings.

**New P3 notes (non-blocking; recorded so they are not rediscovered as new findings):**

- **P3 — barrage concept-card wording.** The concept card in `src/content/freestyleGlossaryCoreConcepts.ts` calls barrage and barraging "the same two-dex structure named twice," but the trick `barrage` (`CLIP > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]`) and the operator `barraging` prefix (`OP IN [DEX] > SAME IN [DEX]`, consistent across all fourteen barraging compounds and the operator reference) differ in the first dex's side. Both are internally correct in the data; this is a copy nicety, not a contradiction, and not a launch blocker.

- **P3 — latent hyphenated registry entries.** `src/services/glossaryAnchors.ts:42` and `src/services/semanticNotationRendering.ts:65` still list a hyphenated `around-the-world` / `atw` term while the rendered anchor id is the underscore form (`term-around_the_world`). No live caller passes the hyphenated form, and `semanticNotationRendering.ts:28` documents the hyphen form as deliberate for CSS/data attributes, so removal is not clearly safe. Unreachable dead-ish code, not a defect on the deployed surface; left as-is.

- **P3 — the glossary deep-link opener does not move focus.** `src/public/js/glossary-details.js` opens the `<details>` ancestors of a URL fragment and scrolls to the target, but does not move keyboard focus to it. A minor accessibility nicety, not a defect: content is revealed and scrolled correctly for every user.

**Verdict, updated.** No P0. FS-01, FS-02, FS-03, and FS-06 are closed (FS-03's delivered shape, including the crawl's narrow documented skip, its deterministic content-link companion test, and the prose-link underline fix its axe expansion forced, is recorded on the task; FS-06's closure record covers the 540-name normalization, the curator-ruled exception file, the QC hard gate, and the CI regression, clearing the pre-cutover naming prerequisite). FS-16's launch-gating portion is closed: the three curation stories (admin browse, trick edit, source-of-truth cutover), the three record and tip write-path stories, and the nine visitor dictionary stories (the Freestyle Encyclopedia epic) are all merged, so every mounted freestyle route and every built curation write path traces to a named story; the only open story tail covers the write paths that are themselves deferred (modifier registry, relations, symbolic layers) and gates only those deferred slices. Remaining P1: FS-04 (reduced to the slug-convention and stale-mechanism components), FS-19 (in-app curation cutover, in progress — the `freestyle_tricks` scalar-row edit slice, all three attached-relationship write paths (alias add/remove, source-link attach/detach, and modifier-link attach/detach), and the pre-go-live persona guard on every write path are shipped, each with field-shape validation, scoping, and one audit entry per operation; freestyle world-record curation (browse, edit, and create, with no hard delete by design) and consecutive-kicks curation (browse, edit, add, and hard-delete, on the stable id from its durable-identity schema slice) are both shipped, so every launch-relevant record write path now exists. The cutover mechanics are built and documented: the source-of-truth cutover tests, the post-cutover refusal guard on the destructive rebuild deploy, and the operations-guide procedure (final sanctioned rebuild, marker step, snapshot and restore coverage, rollback model). The remaining launch-signoff curation work is the operator-run staging rehearsal: admin edits surviving a code-only deploy, plus one guard-refusal demonstration. Trick-tip moderation stays post-launch acceptable, and the symbolic and observational tables stay deferred until their authoring and validation model is designed; see the FS-19 progress note). Freestyle is ready for external testing; launch signoff still gates on FS-19's remaining piece, the operator-run staging rehearsal. This supersedes section 17's "no remediation code has been written," which was true only of the original audit session.

## 19. Reconciliation addendum — third pass (2026-07-08)

A third pass reconciles this report with the repository HEAD, which now carries the freestyle commits made since the second pass: the naming-invariant normalization and its closure record, the Freestyle Encyclopedia visitor stories, the doctrine timing-ruling record, the set-taxonomy alignment, the trick-detail variant-cluster consistency fix, the six follow-up-debt entries, and the two freestyle-dictionary skill corrections. Trust the tree; the updates below say where.

- **FS-04 (skills corrections) — DONE, committed. CLOSED.** The two live, agent-misleading components the second pass reduced FS-04 to are fixed and committed: the related-tricks R2 rule now describes the underscore slug separator with the `paradox_mirage` / `paradox_torque` examples, and the Modifier Reference note now states the reference renders on `/freestyle/glossary` through the modifier-reference partial and is absent from the trick index (`tricks.hbs`) and the trick detail (`trick-shell.hbs`), keeping the do-not-re-enable-on-trick-pages rule. This supersedes the second pass's "Remaining P1: FS-04."

- **FS-06 (naming invariant) — confirmed committed and enforced.** The normalization, the shared `display_name_exceptions.csv`, the QC hard gate in loader 22, and the CSV-derived regression are all committed; a fresh QC run and the naming regression pass, with exactly two hyphenated display names remaining (both approved exceptions, `cross-body sole stall` and `Stepping P.S. Whirling x-body Rake`) and zero slugs carrying a hyphen. Already recorded closed in the second pass; restated here as confirmed against the tree.

- **FS-16 (visitor stories) — the nine Freestyle Encyclopedia visitor stories are committed** in `docs/USER_STORIES.md` (`V_Browse_Trick_Dictionary` through `V_View_Freestyle_Media_Hub`, authored bodies, not just headings). The launch-gating story portion is closed; the only open story tail remains the deferred write-path stories (modifier registry, relations, symbolic layers), which gate only those deferred slices, not launch.

- **FS-03 (safety-net tests) — confirmed closed** against the tree (freestyle-scoped dead-link crawl, e2e click-through, axe scan, mobile-viewport smoke, and the runtime-disk-read guard), with the one tracked color-contrast follow-up unchanged.

- **FS-19 (curation cutover) — still open on the operator-run staging rehearsal only.** No other committed gap was found: the record and consecutive-kicks curation write paths, the persona guard, the cutover mechanics, the post-cutover rebuild-deploy refusal guard, and the operations-guide procedure are all committed. The remaining launch-signoff work is unchanged and NOT done: an operator makes one edit of each kind through the admin surfaces, runs the code-only deploy, verifies the edits persist, and demonstrates one guard refusal.

- **Other recent doctrine/consistency commits (not launch blockers).** The timing-ruling doctrine record, the set-taxonomy alignment, and the trick-detail variant-cluster consistency fix executed FS-36's miraging-wording reconciliation across the operator reference, the movement systems, the set encyclopedia (`symbolicSetEducation.ts`), and the teaching content: Quantum reads as the uptime set, Miraging and Illusioning as distinct downtime/descriptive terms, Furious and Barraging distinct by timing, and Atomic and Illusioning distinct, with no dictionary rows merged. The Quantum/Miraging set-encyclopedia teaching pages remain under FS-28 (post-V1, parked). The same consistency work added the six post-release follow-up items FS-37 through FS-42 (the Butterfly and Around-the-World stored-notation deviations, the butterfly-family compound far-default decision, the Infinity / Far Butterfly model decision, and the barfly bracket-order and orbit-label polish items).

**Launch-signoff picture, updated.** No P0. FS-01, FS-02, FS-03, FS-04, and FS-06 are closed, and FS-16's launch-gating stories are merged. The single remaining launch-signoff gate is FS-19's operator-run staging rehearsal, which has not yet been run. Freestyle is ready for external testing.

## 20. FS-19 staging rehearsal — status (2026-07-08)

The staging rehearsal splits by authorization. The admin-UI portion was completed by the freestyle maintainer, whose access is limited to the admin application. The AWS deploy and host-level portions require an authorized deploy/server operator and remain open; the maintainer neither ran nor was authorized to run the AWS deploy path.

- **Admin-authored freestyle content edits — DONE (maintainer, admin UI only).** Two freestyle content surfaces were edited through the admin curation pages, verified, and then restored so staging is left clean:
  - Freestyle trick `3_bag_juggling`, Movement-notation field: a reversible rehearsal marker saved successfully and appeared on the public trick-detail page (public verification surface).
  - Freestyle world record `2_bag_juggling`, Notes field: the marker saved successfully. Record Notes is admin-only (the public record queries fetch it but no public template renders it), so the admin edit page is the verification surface, and the marker was confirmed there on reload.
  Both fields were restored to their captured pre-edit values after verification.

- **Code-only deploy persistence check — OPEN (needs an authorized AWS deploy operator).** An authorized operator must run the code-only deploy path (which preserves the host env and never touches the live database), then confirm both markers survive on their respective surfaces. Not run.

- **Destructive-rebuild refusal demo — OPEN (needs an authorized staging/server operator).** An authorized operator must add, then remove, the post-cutover marker on the host env file and confirm the database-replacing deploy refuses on a marked host before any live mutation, with no bypass. Not run.

- **Scope ruling — consecutive-kicks excluded from freestyle rehearsal.** Maintainer product ruling: consecutive-kicks records are not freestyle content, so they are excluded from the freestyle curation cutover rehearsal. The admin-authored-freestyle-content persistence test therefore covers the trick and world-record surfaces only; the earlier "one edit of each kind, all three persist" framing is superseded, and two independent freestyle surfaces (trick, world record) satisfy the persistence contract.

**FS-19 remains open.** The admin-edit half is rehearsed; launch signoff still gates on the two operator-run halves above, which an authorized deploy/server operator must run. FS-19 is NOT closed.

