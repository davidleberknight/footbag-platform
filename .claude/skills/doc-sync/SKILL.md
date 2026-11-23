---
name: doc-sync
description: Detect documentation drift against current code and confirmed decisions, then apply or propose only the smallest accurate doc updates. Settled drift your own change caused is applied and shown; any other edit needs explicit human approval. Use when user asks whether docs need updating, code behavior has changed, interfaces or identifiers have changed, or suspected drift needs investigation. Not the whole-repository audit, which is the separate extended-doc-sync skill.
---

# Doc Sync

## Purpose
Check whether documentation still matches the current codebase and confirmed decisions, and propose the smallest precise edits that restore alignment. Maintenance and synchronization, not broad rewriting.

Beyond the description's triggers, a changed boundary, assumption or contract also qualifies, and so does a public route added, removed, renamed or changed in indexability: the sitemap's hand-maintained `STATIC_PUBLIC_PATHS` drifts (the `add-public-page` skill, Step 5).

Do not use this skill for:
- formatting-only changes
- wording preferences that do not change meaning
- speculative architecture work
- broad documentation improvement passes unrelated to actual drift

## Whole-repository audit

The whole-repository drift audit is the separate `extended-doc-sync` skill, run only when the
maintainer asks for it by name. A pre-existing discrepancy this per-change pass notices goes on
its "also noticed" list for that audit.

## Source-of-truth order

Use the authority order and read order in root `CLAUDE.md`; do not restate them here. For membership, tiers, Active-Player status, voting eligibility, or published-rules content, consult the IFPA governing documents at the rank that order gives them; a genuine governance change is routed to IFPA, not edited in.

When code, plan, and derived docs disagree, surface the drift explicitly. Do not flatten the disagreement into one invented source of truth.

### Final design vs implementation deviation (apply before proposing any edit)

Canonical docs (`docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, `docs/DATA_MODEL.md`, `docs/DIAGRAMS.md`, `docs/GLOSSARY.md`, `PROJECT_SUMMARY*`, per-service JSDoc) describe the **final, target design** — not the current build state. Code and infrastructure (including `terraform/**` and `docker/**`) are evidence of implemented behavior only (the `design-intent` skill).

So when current code or infra disagrees with a canonical doc, **the default is NOT "the doc is drifted."** Classify the gap as exactly one of the cases below, and where the intent does not make the classification clear, ask the human with the case you recommend:

1. **The doc is genuinely wrong** — internally inconsistent, contradicts the actual final design (one canonical doc vs another, a diagram vs `DESIGN_DECISIONS.md`), states a stale descriptive fact, or no longer matches clear design intent (a later human decision or a governing document). → propose the smallest canonical-doc edit.
2. **The implementation has truly deviated from the final design** — a built thing works differently than the final design says. → record the deviation as a private-tracker issue labeled `bug` (drafted per the `tracker-ops` skill). **Never edit the canonical doc down to match the current implementation.**
3. **The feature is simply not built yet** (future work). → neither a doc edit nor automatically a tracker issue; it is roadmap, not drift.

A recommended case is always derived from the intent down, never defaulted to the code, even for a renamed identifier, a changed method signature or a schema column.

Never silently pick, and never silently edit. Which gaps are applied and shown and which go to the human, with the passages and the case you recommend, is "Documentation edits" in `.claude/rules/asking.md`. Name-only gaps from one run go in one table. Editing a final-design doc to match a current shortcut destroys the design of record.

## Read first

Before making any recommendation, read selectively:

- `PROJECT_SUMMARY_CONCISE.md` if present
- the maintainers' private tracker, only when deciding whether a gap is already a tracked deviation, searched by keyword (`gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open --search <term>`; if unwired, note it in one line and continue)
- the user story or background job governing the change, found through the design-intent skill's "where intent lives" map, not the whole stories file
- the most relevant derived documentation for the affected area
- the touched code files
- the file-header JSDoc of any touched service (the authoritative service contract; JSDoc that no longer matches the service is drift to fix in the same pass)
- the path-scoped rules in `.claude/rules/*` and the `.claude/skills/*` procedures relevant to the touched area; these are canonical and are drift-checked like any doc
- the private operations docs (the `tracker-ops` skill names them), whenever the change touches infrastructure, the deploy path, host configuration, a credential, or an operator procedure; when the checkout is absent, say so in one line and continue with the public half.
- any schema/configuration needed to understand the change

## Workflow

### 1) Identify the actual change
Run `npx tsx scripts/doc-sync-diff.ts --receipt <path>`, with the path the Stop gate names. It prints the changed files, every document, rule, skill, comment and private-ops line that names an added or removed entity, the entities nothing mentions, and the comments around each changed hunk. That output is the work list; a behaviour change that names no entity is judged from the diff itself. Rerun it after any further code edit.

Focus on meaningful changes:
- behavior
- interfaces
- identifiers
- boundaries
- contracts
- assumptions

Ignore cosmetic refactors unless they create real drift.

### 2) Find the matching documentation
Locate the most relevant existing document or section for the affected topic.

The matching documentation is not only prose docs. The path-scoped `.claude/rules/*` files whose glob covers the touched code, the `.claude/skills/*` procedures for that area, and the touched service's file-header JSDoc are all canonical and drift like any doc. For every changed behavior, identifier, boundary, or contract, grep these for the OLD behavior or identifier and drift-check each hit, the same as a prose doc: a change under `src/services/**` is drift in `service-layer.md` if that rule still states the old contract; a renamed identifier is drift wherever a rule or skill still names the old one. This grep is mandatory, not optional, because reading a rule for context does not by itself surface a stale clause buried in it; skipping it is how rule and skill drift survives a doc-sync pass.

Extend that same grep to code comments in the touched area: a comment that names the renamed identifier or describes the superseded behavior is stale and fixed in the same change, judged by `.claude/rules/comments.md`. Where the change renames a symbol or renumbers a section, reword the bare locators pointing at it to state the reason in words.

Run the same grep across the private operations docs whenever the change touches infrastructure, the deploy path, host configuration, a credential, or an operator procedure; an operator instruction that contradicts current code is drift of the same severity as a wrong statement in a canonical doc, because a wrong runbook is followed rather than merely read.

Prefer updating the current authoritative location rather than inventing a new place.

Before proposing an edit, scan enough surrounding context to ensure:
- the change belongs in that section
- there is not already a better place for it
- the proposed edit will not contradict nearby text
- all related mentions in the same document are accounted for

### 3) Detect real drift
Drift exists only when the docs:
- contradict confirmed decisions or the final design, or (for descriptive facts a derived doc mirrors from code) current code — but first apply *Final design vs implementation deviation* to rule out a true implementation deviation that belongs in the private tracker
- omit information needed to understand current behavior
- describe old behavior as if it were current
- use identifiers or boundaries that are no longer correct
- narrate a superseded position: a reversed ruling kept under a banner, a dated "this replaces the earlier ...", an "an earlier version of this rule" paragraph. The recommended fix is deletion, not a marker. See "No superseded history" in `.claude/rules/doc-governance.md`.

Tag each hit as caused by this change, citing the hunk, or as pre-existing. A pre-existing one goes on a one-line "also noticed" list for the next extended doc sync, not into this pass.

Do not treat these as drift:
- style differences
- formatting differences
- wording differences that preserve meaning
- missing nice-to-have explanation when the docs are still accurate

### 4) Classify each discrepancy
Settled drift this change caused is applied (step 7). Every other discrepancy goes to the human to adjudicate, with one recommended answer derived from the intent down, under `.claude/rules/asking.md`.

### 5) Propose the smallest correct fix
When a doc update is appropriate, propose only the minimum necessary changes.

Requirements:
- keep edits surgical with precise before and after text
- preserve surrounding structure unless a structural move is actually required
- group all edits needed for one issue together
- review the whole doc to include every place that must change for consistency
- do not propose to rewrite entire sections when a few lines will do
- the edit meets `.claude/rules/doc-governance.md` (no stale-language token, no broken reference)

### 6) Approval
Edit documentation only under "Documentation edits" in `.claude/rules/asking.md`. If the human declines an edit, ask why and adjust. If approval is missing or ambiguous for an edit that needs one, stop after presenting the findings.

### 7) Apply only what was approved
Change only the approved edits, or under a pre-approval only the edits this pass found: no opportunistic cleanup, no adjacent rewriting, no unrelated docs in the same pass. When a file is done, re-read the modified text for layout, formatting, and numbered-heading damage, then show every applied edit as the documentation-edit rule requires.

## Guardrails
Do not:
- infer intent not supported by the design sources or explicit human direction
- treat a comment as authoritative over the code it describes, except a `Current:`/`Target:` deviation comment, which states intent (`.claude/rules/comments.md`)
- mix confirmed drift with speculative improvements
- expand scope beyond the area actually under review
- introduce implementation-status language into canonical docs (the canonical-vs-active-slice separation rule and the full list of protected docs live in `.claude/rules/doc-governance.md`)
