---
name: freestyle-bug-hunt
disable-model-invocation: true
description: Run a disciplined adversarial bug hunt over the freestyle dictionary and curated-media domain - domain invariants (layer separation, ADD math, slot governance, naming/slug/hashtag conventions, the trick-tag invariant), cross-surface propagation, and generated-content integrity, with verified findings recorded in BUGS.md. Invoke ONLY when the user explicitly asks for a "freestyle bug hunt" or "freestyle bug sweep" by name. Generic security/correctness review of freestyle routes belongs to bug-hunt; doctrine decisions belong to the curator and the rules expert, never to this skill.
---

# Freestyle Bug Hunt — domain-invariant audit of the freestyle dictionary and curated media

> **Invoke ONLY on explicit request.** Run this skill exclusively when the user asks for a
> "freestyle bug hunt" or "freestyle bug sweep" by name. Do NOT infer it from "bug hunt"
> (that is the general skill), "review the freestyle pages", or any general review phrasing.
> When in doubt, ask before invoking.

This skill is the standing prompt for an adversarial audit of the freestyle domain: the
public dictionary surfaces, the freestyle data (DB tables, generated content modules,
curated sidecars and tags), and the domain invariants the freestyle governance skills
define. It finds violations of rules that generic review cannot see because they are
footbag-domain rules, not web-engineering rules.

## Relationship to the other audit skills

- **bug-hunt** owns everything generic on the freestyle surfaces: security/correctness on
  every deployed route (auth gates, XSS, caching, error handling), specification-layer
  defects including the design quality of freestyle stories and contracts, and doc-to-doc
  / doc-to-code synchronization including the freestyle docs. Do not duplicate those
  sweeps.
- **This skill** owns the freestyle domain layer: dictionary/media invariants,
  cross-surface propagation, naming conventions, and generated-content integrity.

The contract sources this skill audits against are the freestyle governance skills —
`.claude/skills/footbag-freestyle-dictionary/SKILL.md`,
`.claude/skills/freestyle-topology-governance/SKILL.md`,
`.claude/skills/freestyle-dictionary-surface/SKILL.md`,
`.claude/skills/footbag-curated-media/SKILL.md`,
`.claude/skills/migrate-browse-view/SKILL.md` — plus the freestyle sections of the
canonical docs and the standing surface-propagation rule in the
`footbag-freestyle-dictionary` skill.
The `pipeline-invariant-enforcer` skill governs *modifying* the pipeline; this skill
audits pipeline *outputs* as they manifest on deployed surfaces.

Overlap with the neighbors is accepted; the boundary is by nature. A finding that reduces
to generic web security goes to bug-hunt's sweep. A finding grounded in a freestyle domain
rule stays here.

## Absolute rules

1. **Plan mode, findings-only, main session.** The hunt runs read-only in plan mode. The
   orchestrator stays in the main session — only it can ask the human — and dispatches the
   category sweeps to read-only subagents, verifying their leads itself. No code, doc, data,
   sidecar, CSV, or content-module edits; the only write allowed is the findings write to
   `BUGS.md` (Freestyle group), after the finalized plan is approved.
2. **Never judge doctrine.** Whether a trick is real, what its ADD should be, whether two
   names are the same trick, family membership, and promotion-worthiness are decisions
   owned by the curator, the rules expert, and the freestyle maintainer. This skill audits
   internal CONSISTENCY against the recorded doctrine (a description that contradicts its
   own row, a surface that disagrees with the canonical source), never the doctrine itself.
   A candidate finding that requires a doctrine opinion to stand is not a finding; route it
   as an owner question in the report.
3. **Never propose schema hardening or taxonomy migrations.** The topology-governance
   reversible-governance doctrine (content modules over SQL while the ontology is in
   flight) is itself an invariant this skill enforces, not a gap it reports.
4. **Respect the recorded freeze holds, and doctrine uncertainty honestly shown.** Areas
   marked frozen pending rules-expert answers (decomposition freezes, pending readings,
   curator confirm flags) are held state, not drift; read `freestyle/doctrine/RED_QUEUE.md`
   for the current open set. An entry that says a reading is provisional, or presents two
   attested readings without picking one, is being honest, not buggy. A doctrine-adjacent
   finding is valid only when the site asserts *certainty it should not* — publishing a
   single confident value where the doctrine is openly unsettled, or contradicting a
   settled ruling in `freestyle/doctrine/RED_RULINGS.md`.
5. **Read-only DB access**: `sqlite3 -readonly` only, against the local build.
6. **Loader internals out of scope by default.** Python loader code under `freestyle/` and
   `legacy_data/` is the freestyle maintainer's domain; audit its OUTPUTS (tables, content
   modules, seeded galleries) as deployed. The kickoff prompt can pull loader code in.
7. **One question at a time** when blocked, per `.claude/rules/asking.md`.
8. **Deployed-surface discipline** per `.claude/rules/deployed-surface.md`: not-yet-built
   is never a finding. Planned freestyle work (for example a family landing page tracked
   as an open issue in the maintainers' private tracker) is roadmap, not a gap.
9. **Tracked work is not re-flagged.** Re-derive the tracked freestyle items from the
   maintainers' private tracker every run (see the tracked-work step below); an item
   already covered by an open issue is excluded. The inverse IS a finding: an open issue
   whose described state no longer matches the repo is a stale-tracker-issue finding.
10. **Active refutation** before recording anything; loop to dryness (two consecutive
    passes with no new candidate).
11. No emojis, no dates-as-status, concise output.

## Scope

In scope:

- Deployed freestyle routes and pages (`/freestyle/**` in `src/routes/publicRoutes.ts`,
  `freestyleController`, `freestyleService` and its sibling freestyle services,
  `src/views/freestyle/**`).
- Freestyle DB tables as loaded (`freestyle_tricks`, `freestyle_trick_modifiers`,
  `freestyle_trick_aliases`, modifier/source link tables, `freestyle_trick_tips`,
  `media_items` / `media_tags` for curated media).
- Generated content modules (`src/content/freestyle*.ts` and peers) and their agreement
  with the services that consume them.
- Curated intake artifacts as they manifest publicly: sidecars under
  `curated/freestyle_*/**`, gallery JSON, tags, source tiers.
- The freestyle maintainer guide (`docs/FREESTYLE.md`: authority tiers, the
  publication gate, terminology ownership) and the freestyle governance skills, as
  contracts to audit code against (deep doc-to-doc sync stays with bug-hunt).
- Deterministic QC/test coverage for every category in `REFERENCE.md`: a missing
  mandatory-class check is a first-class finding, not advice.

Out of scope by default: loader Python internals; the `exploration/` working corpus;
doctrine judgment calls; editorial voice and wording of curator-authored prose; browser QA.

## Mandatory pre-reads (in this order)

1. This file, and REFERENCE.md's orchestrator-facing sections — the tracked-work exclusion
   method, the sample-matrix shape and query recipes, and the report structure. The §F1–§F17
   category catalog in REFERENCE.md is the lane's brief; the orchestrator does not read it.
2. Root `CLAUDE.md` — authority order.
3. The maintainers' private tracker, via `gh issue list -R "$FOOTBAG_PRIVATE_REPO"
   --state open --label freestyle` and again with `--label pipeline` (read-only,
   auto-approved), plus the local gitignored `BUGS.md`. Build the tracked-work
   exclusion list fresh from them (REFERENCE.md describes how); never trust a
   remembered list. If `FOOTBAG_PRIVATE_REPO` is unset, say exactly one line, that
   the tracker is not wired on this machine (the env var lives in the gitignored
   `.claude/settings.local.json`), then proceed with `BUGS.md` alone as the exclusion
   source; never hard-fail.
4. The five freestyle-domain skills named above — they carry the invariants.
5. The path-scoped rules: enumerate `.claude/rules/` fresh and read every rule that
   governs a surface this run touches (at minimum `view-layer.md` for the hashtag and
   dictionary-filter link rules, `template-conventions.md`, `testing.md`, `comments.md`,
   `deployed-surface.md`).
6. `docs/FREESTYLE.md` (the maintainer guide, including its publication gate and
   terminology sections) and the freestyle sections of `docs/DATA_MODEL.md` as the
   categories require.
7. `freestyle/CLAUDE.md` and any per-subtree `CLAUDE.md` for paths the run inspects.

## Method

0. **Audit the existing `BUGS.md` Freestyle group before touching it.** Re-verify every
   existing `FBH-###` entry against the current repo; correct drifted references; delete
   entries whose fix landed. Audit only the Freestyle group; never edit the other groups.
1. **Derive the deployed freestyle surface fresh** per the deployed-surface rule: every
   `/freestyle` route, view, browse `?view=` variant, gallery, and the services and content
   modules behind them. Hold it in scratch notes.
2. **Build the tracked-work exclusion list** from the maintainers' private tracker and
   the local `BUGS.md` (method in REFERENCE.md), and verify each open issue still
   describes reality; a stale tracker issue is a finding.
3. **Build the sample matrix**: tricks sampled across status, kind, family, ADD range, and
   alias shape; media items across source and tier; every browse view; every named gallery.
   REFERENCE.md gives the matrix shape and read-only query recipes.
3a. **Invariant-discovery pre-pass (the catalog is the floor, not the fence).** Dispatch a
   read-only subagent to enumerate the *recorded* freestyle invariant surface fresh — every
   ratified rule, forever-rule, propagation clause, publication gate, and settled ruling in the
   five governance skills, `docs/FREESTYLE.md`, `freestyle/doctrine/RED_RULINGS.md`, and the
   path-scoped rules this run touches — and diff it against the §F1–§F17 catalog. It returns a
   bounded delta list: each uncatalogued invariant with its recorded home cited and the closest
   §F category, or "new". The orchestrator vets each delta against the absolute rules — an item
   that needs a doctrine opinion to stand, or has no recorded home, is an owner question, never
   a sweep dimension — and adds the survivors as ad-hoc categories. The §F catalog always runs
   in full regardless; the pre-pass may add categories, never remove, narrow, or reorder them.
4. **Dispatch the category sweeps** §F1–§F17 to a read-only `auditor` subagent that reads
   this skill's REFERENCE.md §F category catalog and sweeps the matrix and surfaces, returning
   a structured lead list (candidate, cited surface, the §F category plus its one-line
   definition, refutation attempted, read/analyzed inventory, any owner question) — never file
   dumps. The orchestrator never reads the §F category catalog itself. Every category is
   applied to every surface it can touch; a surface is not covered because it was read, only
   because the applicable categories were applied. A visitor-facing claim (a wrong rendered
   value on a public freestyle page) is confirmed centrally against the running app — or, when
   the app is not run, recorded as a Lead naming the render as its confirming step — never
   delegated to a read-only lane.
5. **QC-gate coverage sweep**: for each category, identify the deterministic check that
   pins it (loader QC, CI gate, route test). A category with no deterministic check, or a
   check that covers only part of the invariant, is a finding — a testing gap is a bug.
6. **Verify centrally (orchestrator).** A subagent lead is never a finding until the main
   session refutes it: for each candidate, attempt to prove it false — re-read the governing
   skill clause, check the tracked-work list, check whether the behavior is a frozen hold,
   grep `tests/` for a test pinning the behavior, and re-derive the cited data by direct
   inspection. Drop what cannot be reproduced. Spot-check a sample of the lane's §F
   classifications against the one-line definition it returned — the orchestrator has not read
   the catalog, so a mislabeled category is caught here.
7. **Second pass and dryness loop**: re-dispatch per category, each time giving the subagent
   the prior candidate list, until two consecutive re-dispatches surface no new candidate.
8. **Report** (output spec below), then stop. No remediation in the same run.

## Output specification

Single sink: `BUGS.md` at the repo root — the same file bug-hunt uses.
Freestyle findings go in a dedicated **Freestyle bugs (domain invariants)** group, placed
after the bug-hunt skill's groups and before Leads. The group follows the established
discipline:

- Ephemeral entries: remove each finding once its issue is filed in the maintainers'
  private tracker or its fix lands; no closures, dates, or RESOLVED markers.
- Own sub-sequence `FBH-###` with a `Next freestyle finding ID:` pointer at the top of the
  group; never reuse or renumber. A separate counter prevents contention with the `B-###`
  sequence, which a different skill and owner produce.
- This skill owns only the Freestyle group; never edit the other groups.

Per-finding format:

```markdown
##### FBH-<N> — <short title>

- **Category:** <one of §F1–§F17 in this skill's REFERENCE.md>
- **Owner:** curator | rules expert | freestyle maintainer | primary maintainer
- **Evidence:** <path:line / table+row / rendered surface, concrete>
- **Verification:** <how it was confirmed and what refutation was attempted>
- **Description:** <1-3 sentences: which invariant, violated how>
- **Impact:** <what a visitor or maintainer sees wrong, or what silently corrupts>
- **Suggested fix:** <1-2 lines; for data findings name the correct write surface
  (CSV / sidecar / generator / content module), never a direct DB edit>
- **Existing check coverage:** <"pinned by <test/QC gate>" | "no deterministic check">
```

**Owner routing:** identity/doctrine content questions go to the curator or the rules
expert; pipeline/generator/data findings to the freestyle maintainer; platform service,
template, and test findings to the primary maintainer. A finding needing a doctrine
decision is not recorded as a bug; it goes in the report's owner-question list, one
decision per question, per `.claude/rules/asking.md`.

**Severity** follows the risk rubric in `docs/TESTING.md` §3, with domain calibrations:
a wrong SOURCE_TIER is presentation (`inconsistent`, Low/Medium — per the curated-media
skill, never `broken`); a naming/slug/hashtag violation on a public page is Medium; a
propagation miss that shows a visitor wrong canonical data is Medium/High; a tag-invariant
break that corrupts gallery membership is High; anything that crosses into privacy,
security, or payment territory is bug-hunt's rubric and severity.

**Graduation to the maintainers' private tracker.** Graduate each confirmed finding into an
issue per the `tracker-ops` skill, the single home for the procedure, using the `freestyle`
lane plus `bug`. Claude drafts the issue body and the exact `gh issue create`, run under that
skill's mutation policy. A finding leaves `BUGS.md` when its issue is filed or its fix lands;
when the tracker is unwired, skip drafting with the one-line degradation note from the
pre-reads.

## Stopping condition and self-review

The sweep is done when the derived freestyle surface is exhausted: every surface in the
scratch inventory carries every applicable §F category and every vetted delta category, the QC-coverage sweep ran, and two
consecutive passes surfaced nothing new. Close with a short adversarial review of this
skill itself: name what the category catalog, exclusions, or sampling let slip this run,
and propose (never apply) any gap-closing edit to the maintainer, including each pre-pass delta category that survived this run, proposed as a new §F entry. A false negative
discovered later is converted into a deterministic check and, if it is a new class, a
proposed new §F category.

## After delivering

End with a short summary: counts by category and severity, the two or three
highest-leverage findings in one sentence each, the owner-question list (one decision per
question), and an offer to plan remediation for a named finding. Do not auto-remediate.
