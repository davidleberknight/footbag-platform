---
name: freestyle-bug-hunt
disable-model-invocation: true
description: Run a bounded adversarial bug hunt over the freestyle dictionary, its admin curation write paths, and the curated-media domain - domain invariants (layer separation, ADD math, slot governance, naming/slug/hashtag conventions, the trick-tag invariant), write-path validation and audit, cross-surface propagation, and stored-prose hygiene, with reproduced findings recorded in BUGS.md. Invoke ONLY when the user explicitly asks for a "freestyle bug hunt" or "freestyle bug sweep" by name. Generic security/correctness review of freestyle routes belongs to bug-hunt; a missing QC gate or test belongs to write-tests; doctrine decisions belong to the curator and the rules expert, never to this skill.
---

# Freestyle Bug Hunt — domain-invariant audit of the freestyle dictionary and curated media


This skill is the standing prompt for an adversarial audit of the freestyle domain: the
public dictionary surfaces, the admin curation surfaces that change freestyle data after
cutover, the freestyle data (DB tables, generated content modules, curated sidecars and
tags), and the domain invariants the freestyle governance skills define. It finds
violations of rules that generic review cannot see because they are footbag-domain rules,
not web-engineering rules.

## Shared mechanics

The `bug-hunt` skill owns the mechanics this hunt shares, and they apply here unchanged
except where this file says otherwise: plan mode in the main session, findings-only;
reproduce, then refute in fresh context, before recording; the tracked-work exclusion (a
stale tracker issue is a finding); the deployed-surface rule (not-yet-built is never a
finding); owner questions one at a time under `.claude/rules/asking.md`; the severity scale;
the `BUGS.md` sink and its no-done-tracking discipline; and the boundary with the other
audit skills (generic security and correctness, specification-layer defects and doc drift on
the freestyle surfaces are bug-hunt's or the doc syncs'; a finding grounded in a freestyle
domain rule stays here). The `pipeline-invariant-enforcer` skill governs *modifying* the
pipeline; this skill audits pipeline *outputs* as they manifest on deployed surfaces.

## Absolute rules (freestyle deltas)

1. **Subagents and writes.** The orchestrator dispatches the category sweeps to read-only
   subagents and verifies their leads itself. Each subagent brief says: "You cannot ask the
   human: return any question in your report with its context and your recommended
   answer." No code, doc, data, sidecar, CSV, or
   content-module edits, and no rebuild or server start: those are the maintainer's
   preconditions below. The only write is to the `BUGS.md` Freestyle group, after the
   finalized plan is approved.
2. **Never judge doctrine.** Whether a trick is real, what its ADD should be, whether two
   names are the same trick, family membership, and promotion-worthiness are decisions
   owned by the curator, the rules expert, and the freestyle maintainer. This skill audits
   internal CONSISTENCY against the recorded doctrine (a description that contradicts its
   own row, a surface that disagrees with the canonical source), never the doctrine itself.
   A candidate finding that requires a doctrine opinion to stand is not a finding; route it
   as an owner question in the report.
3. **Never propose schema hardening or taxonomy migrations.** Taxonomy and classification
   changes are the curator's; a missing constraint is reported only where a recorded rule
   requires a deterministic check, under §F16.
4. **Respect the recorded freeze holds, and doctrine uncertainty honestly shown.** Areas
   marked frozen pending rules-expert answers (decomposition freezes, pending readings,
   curator confirm flags) are held state, not drift; read `freestyle/doctrine/RED_QUEUE.md`
   for the current open set. A later explicit ruling on the relevant tracker card
   supersedes conflicting older doctrine; ordinary comments, status updates, and
   implementation notes do not (record any conflict as an owner question). Before treating
   a ruling in `RED_RULINGS.md` or `RED_QUEUE.md` as settled, search the tracker (all
   states, comments included) for a later ruling on the same point. An entry that
   says a reading is provisional, or presents two attested readings without picking one, is
   being honest, not buggy. A doctrine-adjacent finding is valid only when the site asserts
   *certainty it should not* — publishing a single confident value where the doctrine is
   openly unsettled, or contradicting a settled ruling in `freestyle/doctrine/RED_RULINGS.md`.
5. **Read-only DB access**: `sqlite3 -readonly` only, against the precondition build.
6. **Structured fields decide; names only suggest.** A finding rests on a structured column
   or link row (`adds`, `operational_notation`, `base_trick`, `trick_family`, modifier
   links, alias type and display flag). A name or string-pattern match (shared prefix,
   slug folding, "looks like modifier + base") is a Lead routed to the curator, never a
   finding: the design forbids inferring structure from names.
7. **Loader internals out of scope by default.** Python loader code under `freestyle/` and
   `legacy_data/` is the freestyle maintainer's domain; audit its OUTPUTS (tables, content
   modules, seeded galleries) as deployed. The kickoff prompt can pull loader code in.
8. **Reproduction, freestyle specifics.** Reproductions run against the precondition build
   and server. For an admin write path the reproduction is a run of the named route test,
   quoting its assertion that the refusal happened and nothing was written; with no such
   test the clause is a `write-tests` hand-off, never a clean cell, and a finding that is
   traced but not reproduced is capped at Medium. A query that errors, or returns zero rows
   where the population says rows exist, stops that category; it is never a clean result.
   The fresh-context refutation is a read-only subagent per category batch that did not
   produce the candidates, given only the candidate, its reproduction and the governing
   clause. One bounded pass per category. Planned freestyle work tracked as an open issue
   (for example a family landing page) is roadmap, not a gap.

## Preconditions (maintainer-run, before the hunt starts)

The hunt cannot prove anything about the site unless it inspects a fresh build and the
pages a visitor sees. The maintainer supplies both, and the orchestrator checks them first:

1. **A fresh build from a clean, recorded HEAD.** The local database rebuilt from a clean
   working tree (`./run_dev.sh --reset`, or the reset then `deploy-local-data.sh --from-csv`;
   the freestyle loader alone is not enough). The orchestrator records the HEAD SHA, the
   database file's modification time, the build mode, and the row count of every freestyle
   table, and stops if `git status --porcelain` is not empty, or if the database is older
   than the latest commit touching `database/schema.sql`, `database/migrations`,
   `freestyle/inputs`, `freestyle/symbolic_grammar`, `freestyle/loaders`, `curated/`, or a
   generated `src/content` module.
2. **The dev server running against that build**, so every visitor-facing claim is checked
   on rendered HTML. The orchestrator confirms the server process started after the HEAD
   commit and after the database was built, and stops otherwise: an older server serves
   stale code and assets. It records the archive and media host values the server
   resolved from configuration, for §F18.
3. **The tracker wired** (`FOOTBAG_PRIVATE_REPO` set). A go-live hunt without it cannot apply
   the tracked-work exclusion or find stale issues, so the orchestrator stops and says so in
   one line rather than degrading.

The report is labelled "local build clean, not verified against the cutover database": the
cutover load and any staging-only data are outside this hunt.

## Scope

In scope: the freestyle surface Method step 1 derives fresh each run, the freestyle tables
and generated content modules behind it, curated intake artifacts as they manifest publicly,
and the freestyle `audit_entries` rows the admin write paths append.

Out of scope by default: loader Python internals; the `exploration/` working corpus;
doctrine judgment calls; editorial voice and wording of curator-authored prose (the
attribution and internal-language rules are in scope; style is not); screenshot-based
visual QA; and QC-gate or test coverage, which is the `write-tests` skill's: a category
with no deterministic check is handed there as a named defect class, never recorded here.

## Mandatory pre-reads (in this order)

1. This file, and REFERENCE.md in full. The orchestrator reads the §F catalog too, so it
   can check a lane's classifications first-hand.
2. Root `CLAUDE.md` — authority order.
3. The maintainers' private tracker: list the open `freestyle` and `pipeline` issues, then
   read every one in full (body and every comment, in order) with
   `gh issue view <n> -R "$FOOTBAG_PRIVATE_REPO" --json number,title,state,labels,body,comments`,
   plus every card a doctrine file cites, plus the
   `footbag_private_repo/BUGS.md`. Build the tracked-work exclusion list fresh from them
   (REFERENCE.md describes how); never trust a title, a description elsewhere, or a
   remembered list.
4. The four freestyle governance skills, which carry the invariants:
   `footbag-freestyle-dictionary` (including its surface-propagation rule),
   `freestyle-dictionary-surface`, `footbag-curated-media` and `add-browse-view`.
5. The path-scoped rules: enumerate `.claude/rules/` fresh and read every rule that
   governs a surface this run touches (at minimum `view-layer.md` for template mechanics, `testing.md`, `comments.md`).
6. `docs/FREESTYLE.md` (the maintainer guide, including its publication gate and
   terminology sections), the freestyle user stories in `docs/USER_STORIES.md` (public,
   admin curation, and the freestyle content source-of-truth story), and the freestyle
   sections of `docs/DATA_MODEL.md` as the categories require.
7. `freestyle/CLAUDE.md` and any per-subtree `CLAUDE.md` for paths the run inspects.

## Method

0. **Audit the existing `BUGS.md` Freestyle group.** Re-verify every existing `FBH-###`
   entry against the current repo, and put each correction or deletion in the plan as a
   proposal; it lands with the approved findings write. Audit only the Freestyle group;
   never edit the other groups.
1. **Derive the freestyle surface fresh** per the deployed-surface method: every public
   `/freestyle` and admin `/admin/freestyle` and `/admin/curator` route, view, browse
   `?view=` variant, gallery, and the services and content modules behind them, plus the
   freestyle reads on routes outside `/freestyle` (grep `src/services` and `src/views` for
   the freestyle tables and services) and the freestyle entries in `/sitemap.xml`. Cross-check the inventory against the
   route files and a listing of the freestyle views and content modules, and record the
   counts. The inventory becomes the rows of the coverage grid the report carries.
2. **Build the tracked-work exclusion list** from the full card reads and the `BUGS.md`
   entries step 0 re-verified (an entry that failed re-verification excludes nothing;
   method in REFERENCE.md), and verify each open issue still describes reality; a stale
   tracker issue is a finding.
3. **Build the sample matrix** deterministically: REFERENCE.md gives the axes and the
   selection queries. Every-row invariants run over the whole population, never a sample.
   Record the sampled slugs in the report.
3a. **Invariant-discovery pre-pass (the catalog is the floor, not the fence).** Dispatch a
   read-only subagent to enumerate the *recorded* freestyle invariant surface fresh — every
   ratified rule, propagation clause, publication gate, story criterion, and settled ruling
   in the four governance skills, the freestyle stories, `docs/FREESTYLE.md`,
   `freestyle/doctrine/RED_RULINGS.md`, and the path-scoped rules this run touches — and diff
   it against the §F catalog. It returns a bounded delta list: each uncatalogued invariant
   with its recorded home cited and the closest §F category, or "new". The orchestrator vets
   each delta against the absolute rules — an item that needs a doctrine opinion to stand,
   or has no recorded home, is an owner question, never a sweep dimension — and adds the
   survivors as ad-hoc categories. The §F catalog always runs in full regardless; the
   pre-pass may add categories, never remove, narrow, or reorder them.
4. **Dispatch the category sweeps** §F1–§F25 to a read-only `auditor` subagent that reads
   this skill's REFERENCE.md §F category catalog and sweeps the matrix and surfaces, returning
   a structured lead list (candidate, cited surface, the §F category, the reproduction
   command or rendered URL with the exact observed string, refutation attempted,
   per-category counts of queries run and rows or pages examined, any owner question) —
   never file dumps. A category returned without counts is "not checked". Every category is
   applied to every surface it can touch; a surface is covered only when the applicable
   categories were applied. Visitor-facing categories (§F1, §F3, §F6, §F9, §F12, §F14,
   §F15, §F17, §F18, §F21, §F22, §F23, §F24, §F25) run on the rendered HTML from the
   precondition server: the orchestrator crawls every route and `?view=` variant, every
   active trick detail page, every set, family and modifier page, and every freestyle URL
   in `/sitemap.xml` (lightweight page fetches, no screenshots; sampling narrows analysis,
   never extraction), records pages fetched against each population, and hands the lanes
   the extraction.
5. **Name and grade the check that pins each category** (loader QC, CI gate, route test)
   in the coverage ledger, then check the check: read the check itself, never this skill's
   description of it, and find a negative test or case in which it fails on a violating
   row. Record each pin as "pinned (fail-tested)", "pinned (presence
   only)" or "warn-only". A category with no deterministic check, only a presence-only or
   warn-only one, or a check covering only part of the invariant, is a `write-tests`
   hand-off listed in the report, not a finding here. A check that exits clean on missing
   input, or otherwise does not do what its name or comment claims, is a configuration
   defect and stays a finding here.
6. **Verify centrally (orchestrator).** A subagent lead is never a finding until the main
   session reproduces and refutes it: for each candidate, re-run its reproduction command
   or re-fetch its URL and observe the string itself, re-read the governing clause, check
   the tracked-work list, check whether the behavior is a frozen hold, and run any test
   pinning the behavior (a test refutes the candidate only if it asserts the recorded
   doctrine; a test that would still pass with the surface wrong refutes nothing, and is
   itself a `write-tests` hand-off). Keep what cannot be reproduced as a Lead naming the
   reproduction that would settle it, and list every refuted candidate with its refutation in
   the report, so a mistaken refutation is visible. Check
   the lane's §F classifications against the catalog, and re-run one query or fetch per
   category to compare its count with the lane's. Every survivor above Low then gets
   the fresh-context refutation of absolute rule 8.
7. **Independent cross-check lane**, once, after the category pass: a differently briefed
   lane diffs the database against the rendered pages for the sample matrix, without the
   catalog. Its new candidates go through step 6; nothing is re-swept to reach a count.
8. **Report** (output spec below), then stop. No remediation in the same run.

## Output specification

The sink and its discipline are bug-hunt's (`BUGS.md`). Freestyle findings go in a dedicated
**Freestyle bugs (domain invariants)** group, placed after the bug-hunt skill's groups and
before Leads:

- Own sub-sequence `FBH-###` with a `Next freestyle finding ID:` pointer at the top of the
  group; never reuse or renumber.
- This skill owns only the Freestyle group; never edit the other groups. A candidate that
  belongs to bug-hunt is named in the report as a handoff, not written into its groups.

Per-finding format:

```markdown
##### FBH-<N> — <short title>

- **Category:** <one of §F1–§F25 in this skill's REFERENCE.md>
- **Severity:** Catastrophic | High | Medium | Low
- **Owner:** curator | rules expert | freestyle maintainer | primary maintainer
- **Evidence:** <path:line / table+row / rendered URL, concrete>
- **Reproduction:** <the read-only command or URL, and the exact string observed>
- **Verification:** <how it was confirmed and what refutation was attempted; the
  fresh-context refutation above Low>
- **Confidence:** reproduced | traced end to end, not reproduced
- **Description:** <1-3 sentences: which invariant, violated how>
- **Impact:** <what a visitor or maintainer sees wrong, or what silently corrupts>
- **Suggested fix:** <1-2 lines; for data findings name the correct write surface
  for the phase (before cutover: CSV / sidecar / generator / content module; after
  cutover: the admin editor, a reviewed database migration, or the content module),
  never a direct DB edit>
- **Existing check coverage:** <"pinned (fail-tested) by <check>" | "pinned (presence
  only) by <check>" | "warn-only" | "no deterministic check">
```

**Owner routing:** identity/doctrine content questions go to the curator or the rules
expert; pipeline/generator/data findings to the freestyle maintainer; platform service,
template, and test findings to the primary maintainer. A finding needing a doctrine
decision is not recorded as a bug; it goes in the report's owner-question list.

**Severity** uses bug-hunt's scale and calibration, with these freestyle calibrations: a
wrong content-type tag on a clip is a
curator-judgment review item (Low); a missing one on a curated clip that names a trick is High, because the
media-tag invariant refuses it and the refresh stops; a naming/slug/hashtag violation on a
public page is Medium; a propagation miss that shows a visitor wrong canonical data is
Medium or High; a tag-invariant break that corrupts gallery membership is High; an admin
write path that accepts a row its story refuses, or writes without its audit row, is High;
anything that crosses into privacy, security, or payment territory is bug-hunt's rubric and
severity.

## Stopping condition and self-review

The sweep is bounded and done when the coverage grid has no empty cell: one pass per
category over the sample matrix, every surface in the inventory carrying every applicable
§F category and every vetted delta category as checked, not applicable (with the reason)
or not checked (with the reason); the pinning check named and graded for each category;
the cross-check lane run once; and every candidate reproduced and refuted. A not-checked
cell in §F17, §F18, §F19, §F21, §F24 or §F25, or more than five not-checked cells overall,
makes the hunt incomplete, and the report says so instead of reporting a clean result. The
closing self-review follows bug-hunt's "Attack this skill" step, and proposes each pre-pass
delta category that survived this run as a new §F entry; a false negative found later that
is a new class becomes a proposed new §F category.

## After delivering

Bug-hunt's closing summary, plus the build identity line and the coverage label, counts by
§F category, and as `write-tests` hand-offs the categories with no pinning check or only a
presence-only or warn-only one.
