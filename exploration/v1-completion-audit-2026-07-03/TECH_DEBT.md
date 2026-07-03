# Freestyle tech debt — census and disposition (V1.0 pass)

Audit date 2026-07-03. Evidence gathered this run (counts and line references
verified against the working tree). Ordered by risk, not by size.

## 1. Exploration-versus-freestyle residue (graduated work needing a permanent home)

`exploration/` holds ~101 live dated directories plus ~90 under `_archive/`. The
IP already carries the go-live disposition item; this census identifies what has
demonstrably graduated:

- **Graduated in substance, dir still cited as live:**
  - `emerging-vocab-generator-cleanup-spec-2026-07-01/SPEC.md` — implemented: the
    generator now emits `evState`/`holdKind`/`flags`, `classifyFrontier` is deleted
    (zero references in `src/`), and the generated file is stamped 2026-07-03.
    Banner it as consumed; close any plan references.
  - `family-pages-mvp-spec-2026-07-01/SPEC.md` — the route, controller, service
    shaper, and `family-detail.hbs` all exist and are mounted. Verify the spec's
    route-test list landed, then banner as consumed and close the IP item.
  - `frontier-calibration-2026-05-29/` and `frontier-stabilization-2026-05-29/` —
    one-shot analyses whose conclusions were absorbed; only the
    `footbag-freestyle-dictionary` skill still points at them (the skill-trim item
    removes those pointers).
- **Still load-bearing (must survive or be relocated with repointing):**
  - `freestyle-media-ingestion-2026-05-29/` (HANDOFF.md + ARCHITECTURE.md — the
    curated-media skill's named handoff) and `glossary-evolution-2026-05-29/`
    (cited as the active glossary plan).
  - `dictionary-symbolic-card/` — the `migrate-browse-view` skill both reads specs
    from and WRITES slice reports into it; any relocation must update that skill.
  - Doctrine evidence packets cited by `freestyle/doctrine/*`:
    `dod-ddd-evidence-pass-2026-07-02/`, `positional-evidence-audit-2026-06-23/`
    (including the reference resolver implementation and the live curator
    worklist), `red-reduction-audit-2026-07-02/`,
    `zulu-weaving-notation-2026-06-27/`, `pogo-add-doctrine-packet/`,
    `curator-rulings-2026-07-02/`.
  - Live queues: `doctrine-audit-2026-06-19/DECISION_PACKET.md`,
    `emerging-vocab-taxonomy-2026-06-20/UNDEFINED_OPERATOR_INVENTORY.md`, the
    incomplete-authoring queue, and this directory.
- **Disposition principle** (matches the curator working order's "consolidation
  architecture" step): evidence chains that doctrine documents cite move under
  `freestyle/` (or get a stable archive home) with citations repointed in the same
  change; superseded scratch moves to `_archive/`; nothing is deleted while a
  skill, plan, or doctrine doc names it.

## 2. Skill-trim item and its CI allowlist exceptions

- `.claude/skills/footbag-freestyle-dictionary/SKILL.md` is 858 lines (ceiling
  ~500) and carries the dated status journal plus pointers to superseded
  exploration dirs; `freestyle-dictionary-surface` carries dated framing and three
  dangling references to the deleted club-leadership-surface skill;
  `freestyle-topology-governance` and `footbag-curated-media` carry dated
  snapshots.
- The harness self-check `scripts/ci/assert_claude_harness.sh` waives exactly two
  findings (its `FREESTYLE_PENDING_OVERSIZE` and `FREESTYLE_PENDING_MISSING_REF`
  entries, lines 24-25, consumed at lines ~100 and ~135). Completing the trim
  deletes both waivers so the 500-line ceiling and dangling-reference checks
  enforce again. The IP item (Dave's cross-track pickup, after James's content
  audit) is accurate; this audit supplies the content audit it was waiting on:
  the four 2026-05-29 pointers split as in Section 1 (two removable, two
  load-bearing).

## 3. Database backup pile

- 59 gitignored backup files under `database/` totaling ~2.5 GB (each snapshot
  45-48 MB; 22 from one 2026-05-25/26 session, 12 from 2026-07-02 alone), plus
  three zero-byte stragglers (`footbag.sqlite`, `footbag_dev.db`, `freestyle.db`)
  and a stray `dev-jwt-keypair.pem`. Gitignore coverage is correct, so this is
  disk hygiene, not repo bloat.
- Disposition: keep the newest one or two snapshots, delete the rest (destructive
  — needs the maintainer's one consolidated approval), and adopt a retention
  convention (backups older than N days or beyond the last M are fair game).

## 4. The scraped-CSV twin

- `legacy_data/out/scraped_footbag_moves.csv` (257 lines; consumed by loader 20
  and the coverage-diff script) sits beside
  `legacy_data/out/scraped_footbagmoves.csv` (574 lines; consumed only by
  `parse_footbagmoves_corpus.py`) — near-identical names, different corpora
  (footbag.org moves versus the FootbagMoves federation corpus), both gitignored.
  A loader pointed at the wrong one would fail quietly.
- Note the committed snapshot the pipeline actually rebuilds from is
  `freestyle/inputs/footbag_org_moves_snapshot.csv`; the `legacy_data/out/` copy
  is the legacy-side artifact. Disposition: rename the FootbagMoves one to carry
  its corpus name (or fold both under the pipeline doc-sync item), and record
  which artifact is canonical in the script headers.

## 5. Stale comments and epoch labels in shipped code

- `src/services/freestyleService.ts`: nine "slice" comments (lines ~2578, 2913,
  2917, 4354, 4670, 4768, 4881, 5124, 8714) violating the comments rule.
- `src/content/freestyleObservationalTricks.ts:383` and
  `freestyleSymbolicEquivalences.ts:101` carry pt10-framed notes — these two are
  the deliberately-kept Q7 (atomic-implicit-paradox) notes; keep the substance,
  but reword to plain self-contained English without the pt label.
- `freestyleResolvedFormulas.ts:873` ("same slice") and `src/db/db.ts:24`
  (borderline "use-case slice") — reword.
- ~120 freestyle test files keep delivery-epoch labels in body comments and
  describe text; 8 test files embed doc/section references. Both already itemized
  in the IP (two separate items); no new scope found.

## 6. Duplicated logic after the shipped de-dups

- **Done and clean**: intermediate-operator definitions single-authority
  (`freestyleOperatorReference.ts`); `classifyFrontier` fully deleted; EV
  classification now lives once, in the generator.
- **Open (drift-risk order)**: Tier-1 operator definitions (three homes), the
  glossary ADD table versus `freestyleAddAnalysisContent`, notation tokens (three
  homes), family cards versus the roster modules — the de-dup blueprint's fixes
  1-4 (see `ENCYCLOPEDIA_AUDIT.md` Section 1).
- **Watch item**: the symbolic-grammar DB registry carries per-group ADD ranges —
  observational by design, but it is a second numeric home that must regenerate on
  operator-weight changes.

## 7. Monoliths

- `src/services/freestyleService.ts` is 11,291 lines — every freestyle page's
  shaper in one file. It works and is well-tested; the cost is merge surface and
  agent context. Post-V1 candidate: split by page family (browse/detail/
  glossary/sets) behind the existing service contract. Do not do this during the
  V1 push; it conflicts with surgical-change discipline.
- `src/views/freestyle/glossary.hbs` (2,435 lines / 147 KB) shrinks substantially
  as de-dup fixes 2-4 convert hardcoded sections to module-driven rendering — do
  it via the de-dup, not as a separate refactor.
- `src/content/freestyleObservationalUniverse.ts` (1,156 lines) and
  `freestyleTrackedNames.ts` (1,424 lines) are generated — fine as-is; the debt is
  the missing freshness check (a test asserting generated stats match the DB, or a
  documented regeneration procedure).

## 8. Pipeline and environment footguns (known, inventoried here for the roadmap)

- Records loader is additive (INSERT OR IGNORE): record edits need a fresh DB
  build — documented in `freestyle/CLAUDE.md` and `run_freestyle.sh`; make sure
  the curator-facing procedure states it.
- `scripts/reset-local-db.sh` (David-owned, off-limits) omits parser population
  and the leader-signals loader; both are recorded; the standing workaround is
  `run_dev.sh`/manual steps.
- Committed-adjacent `__pycache__/` under `freestyle/scripts/`,
  `freestyle/loaders/`, and several exploration dirs — gitignore and remove.
- `freestyle/tools/trick_video_discovery/seed_from_records.py` is referenced only
  by its own README — confirm still wanted (curator tool) or archive.
- `freestyle/out/` and `freestyle/reports/` artifacts: gitignored by design;
  no action.

## 9. Plan-of-record drift (belongs in the doc-sync, listed here for completeness)

- Family Pages MVP item: shipped, item stale (verify done-conditions, close).
- EV generator cleanup: shipped in substance; the working-order step and the spec
  should be marked consumed.
- Red-queue blurry count (~43 stated, 64 gated now) — refresh or date the counts.
- The PRE-KANBAN post-refactor pipeline doc-sync has not run; it is the umbrella
  under which Sections 4 and 9 items land.
