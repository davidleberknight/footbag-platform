---
name: doc-sync
description: Detect documentation drift against current code and confirmed decisions, then propose only the smallest accurate doc updates. Never edit docs without explicit human approval. Use when user asks whether docs need updating, code behavior has changed, interfaces or identifiers have changed, or suspected drift needs investigation. For a full-surface audit across all canonical docs, use extended-doc-sync (explicit request only), not this skill.
---

# Doc Sync

## Purpose
Check whether current documentation still matches the current codebase and confirmed decisions.

Use this skill to identify real documentation drift and propose the smallest precise edits needed to restore alignment.

This skill is for maintenance and synchronization, not broad rewriting.

## Use when
- code behavior changed
- interfaces changed
- identifiers changed
- boundaries changed
- assumptions or contracts changed
- the human asks whether docs need to be updated
- you suspect code and docs no longer match
- a public route was added, removed, renamed, or changed indexability: the sitemap's hand-maintained `STATIC_PUBLIC_PATHS` in `src/services/siteMetaService.ts` does not auto-discover routes, so a new public hub or editorial page must be added there. Entity-detail pages (events, clubs, net teams, tricks, rules, IFPA docs) are DB-derived and update automatically; the static list is the part that drifts.

Do not use this skill for:
- formatting-only changes
- wording preferences that do not change meaning
- speculative architecture work
- broad documentation improvement passes unrelated to actual drift

## Source-of-truth order

When sources conflict, evaluate in this order:

1. explicit human decisions in the current task
2. `docs/USER_STORIES.md` for functional requirements
3. the top active-slice/status block in `IMPLEMENTATION_PLAN.md` for current scope and out-of-scope boundaries
4. current local repository code and configuration for implemented behavior
5. derived local documentation (`DATA_MODEL`, etc.), the path-scoped `.claude/rules/*` files, the `.claude/skills/*` procedures, and per-service file-header JSDoc — the authoritative home for service ownership, required patterns, invariants, and side-effects. These rule and skill files are canonical and are drift-checked like any doc.

When code, plan, and derived docs disagree, surface the drift explicitly. Do not flatten the disagreement into one invented source of truth.

### Final design vs implementation deviation (apply before proposing any edit)

Canonical docs (`docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, `docs/DATA_MODEL.md`, `docs/DIAGRAMS.md`, `docs/GLOSSARY.md`, `docs/DEVOPS_GUIDE.md`, `PROJECT_SUMMARY*`, per-service JSDoc) describe the **final, target design** — not the current build state. Code and infrastructure (including `terraform/**` and `docker/**`) are authoritative ONLY for *implemented behavior*, never for *design intent*.

So when current code or infra disagrees with a canonical doc, **the default is NOT "the doc is drifted."** Classify the gap as exactly one of:

1. **The doc is genuinely wrong** — internally inconsistent, contradicts the actual final design (one canonical doc vs another, a diagram vs `DESIGN_DECISIONS.md`), or states a stale descriptive fact. → propose the smallest canonical-doc edit.
2. **The implementation has truly deviated from the final design** — a built thing works differently than the final design says. → record an `IMPLEMENTATION_PLAN.md` deviation entry. **Never edit the canonical doc down to match the current implementation.**
3. **The feature is simply not built yet** (future work). → neither a doc edit nor automatically an IP entry; it is roadmap, not drift.

This applies to design intent and target architecture. Purely descriptive facts a derived doc mirrors from code (a renamed identifier, a changed method signature, a schema column) still follow the code and are normal case-1 fixes.

Never silently pick. After verifying each gap, **present it to the human with the classification above and your recommendation, and let the human decide.** Editing a final-design doc to match a current shortcut destroys the design of record.

## Read first

Before making any recommendation, read selectively:

- `PROJECT_SUMMARY_CONCISE.md` if present
- the top active-slice/status block in `IMPLEMENTATION_PLAN.md`
- `docs/USER_STORIES.md`
- the most relevant derived documentation for the affected area
- the touched code files
- the file-header JSDoc of any touched service (the authoritative service contract; JSDoc that no longer matches the service is drift to fix in the same pass)
- the path-scoped rules in `.claude/rules/*` and the `.claude/skills/*` procedures relevant to the touched area; these are canonical and are drift-checked like any doc
- any schema/configuration needed to understand the change

## Workflow

### 1) Identify the actual change
Determine exactly what changed or is under review.

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

Prefer updating the current authoritative location rather than inventing a new place.

Before proposing an edit, scan enough surrounding context to ensure:
- the change belongs in that section
- there is not already a better place for it
- the proposed edit will not contradict nearby text
- all related mentions in the same document are accounted for

### 3) Detect real drift
Drift exists only when the docs:
- contradict confirmed decisions or the final design, or (for descriptive facts a derived doc mirrors from code) current code — but first apply *Final design vs implementation deviation* to rule out a true implementation deviation that belongs in `IMPLEMENTATION_PLAN.md`
- omit information needed to understand current behavior
- describe old behavior as if it were current
- use identifiers or boundaries that are no longer correct

Do not treat these as drift:
- style differences
- formatting differences
- wording differences that preserve meaning
- missing nice-to-have explanation when the docs are still accurate

### 4) Escalate when meaning changes
Always escalate to the human before any documentation edit (questions follow `.claude/rules/asking.md`: resolve from the source-of-truth order first, one self-contained question with a recommended answer, no codes the human was not given):
- user-visible behavior
- interfaces or interface semantics
- identifiers
- data meaning or schema meaning
- service, system, ownership, or architectural boundaries
- feature scope
- any case where the correct source of truth is not fully clear

### 5) Propose the smallest correct fix
When a doc update is appropriate, propose only the minimum necessary changes.

Requirements:
- keep edits surgical with precise before and after text
- preserve surrounding structure unless a structural move is actually required
- group all edits needed for one issue together
- review the whole doc to include every place that must change for consistency
- do not propose to rewrite entire sections when a few lines will do

For each proposed edit, provide:
- file path
- section or location
- why the edit is required or recommended, plus important context
- precise before text
- precise after text

### 6) Human-in-the-loop requirement
Never edit documentation unless the human explicitly approves.

Valid approval:
- yes / y
- ok / go
- any other reasonable affirmation

Always provide the human with the option to approve all edits in the current session.
If a human answers no to a proposed edit, ask why, then carefully adjust accordingly.

Not valid approval:
- silence
- pressing Enter
- approval of a different earlier edit in the same session

If approval is missing or ambiguous, stop after presenting findings and proposed edits.

### 7) Apply only what was approved
If the human approves, make only the agreed documentation edits:
- change only the precise text approved
- do not make opportunistic cleanup edits
- do not rewrite adjacent text unless explicitly approved
- do not modify unrelated docs in the same pass
- Always verify all modified text when you think you are done with a file; look for layout, formatting, and numbered-heading bugs.

## Guardrails
Do not:
- propose broad rewrite plans by default
- restate the entire docs suite
- infer intent not supported by code or explicit human direction
- treat comments as authoritative if code behavior differs
- edit docs without explicit human approval
- edit a canonical (final-design) doc to match current code or infrastructure; an implementation that diverges from the final design is a deviation to record in `IMPLEMENTATION_PLAN.md`, not a reason to rewrite the doc
- mix confirmed drift with speculative improvements
- expand scope beyond the area actually under review
- introduce implementation-status language into canonical docs (the canonical-vs-active-slice separation rule and the full list of protected docs live in `.claude/rules/doc-governance.md`)

## Default stance
- prefer no change over unnecessary change
- prefer one precise edit over a rewrite
- prefer escalation to human over guesswork
- prefer human approval over autonomous editing
