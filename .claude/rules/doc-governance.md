---
paths:
  - "docs/**"
  - "README.md"
  - "CONTRIBUTING.md"
  - "CODE_OF_CONDUCT.md"
  - "GOVERNANCE.md"
  - "PROJECT_SUMMARY*.md"
---

# Doc governance rules

## Canonical vs active-slice separation

Long-term canonical docs describe **design intent**, not implementation status:

- `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, `PROJECT_SUMMARY_CONCISE.md`, `docs/DATA_MODEL.md`, `docs/TESTING.md` — pure design.
- `docs/DEV_ONBOARDING.md` — permanent design + permanent operating procedure. Same no-current-slice rule applies.

Never add current-slice notes, deviation qualifiers, shortcut descriptions, completion status, "Last updated" dates, or sprint tracking to any of these.

All implementation-state language belongs exclusively in the maintainers' private tracker (the `tracker-ops` skill).

**Where implementation detail lives.** Durable design intent and rationale live in `docs/DESIGN_DECISIONS.md`; the per-service and per-page contract (ownership, rendering, audience, sensitive-page invariants) lives in each service's file-header JSDoc; cross-cutting AI coding rules live in the path-scoped `.claude/rules/*.md` files; repeatable procedures (how to add a public page, run a review, sync docs) live in `.claude/skills/*`. A canonical doc states the design; it does not restate a contract that a service JSDoc, a rule, or a skill already owns. Page-rendering contracts live in service JSDoc and `.claude/rules/view-layer.md`, the route list lives in `src/routes/publicRoutes.ts`, and durable view design intent lives in DESIGN_DECISIONS §4.

## Temporary deviations live in the tracker only

Substitute patterns, transitional shortcuts, and other deviations with explicit unblock conditions are issues labeled `bug` in the maintainers' private tracker (the `tracker-ops` skill). Never duplicate substitute-aware callouts into DEV_ONBOARDING.md or other canonical docs: a volunteer reads the tracker first for deviations, then the canonical step. When the deviation resolves, close the issue; the canonical doc needs no change.

## "Deferred to later path" is scope, not drift

In DEV_ONBOARDING and similar procedural docs, "deferred and will be added in Path E" is valid scope-sequencing language describing doc architecture. It is **not** doc-governance drift.

- **Valid scope language (leave alone):** "deferred to Path E", "not yet provisioned (see §5.3)", "deferred hardening — see Path E", "X is deferred to a later path".
- **Actual drift (flag it):** "(deferred post-sprint)", "already declared... as deferred groundwork for exactly this chain", "the drift is expected and tracked", "not yet completed as of <date>", "as of today", "currently", "pending team review".

Rule of thumb: if deferral points to another section/path/doc as the home for the work, it's scope. If it points to time, sprint, or tracking, it's drift.

## References

- **No refs to gitignored / local-only files** from any committed doc, code comment, script, or Terraform. State the underlying fact inline; name the fact, never the local-only file (the operator's AWS specifics such as account IDs, IPs, secrets, and Lightsail constraints; personal permission-setup notes).
- **No refs to temporary / sprint-scoped files** from canonical docs, even when both are committed. Temp files have short lifespans; pointing canonical docs at them creates broken references.
- **No dedicated "Cross-references" sections** or trailing "Cross-references:" bullets in DD, DATA_MODEL, MIGRATION_PLAN, or other long-term docs. Inline refs in prose are fine when they're load-bearing for comprehension. AI routing between docs is handled via CLAUDE.md + skill triggers + memory, not in-doc navigation.
- **Refs to committed `.claude/rules/*` and `.claude/skills/*` are allowed** as sources of truth, and preferred over restating their content. Pointing a canonical doc (or a service JSDoc) at the committed, stable rule, skill, or contract that owns a detail is more AI-efficient and drift-resistant than duplicating it.

## Plain words, not bare codes

In any doc or plan, describe the thing in plain words a reader understands on its own. A gate ID, section number, finding code, state number, or item label may sit beside a self-contained explanation as a locator, never replace it. A reader who would have to open another document to know what a reference means has been handed shorthand, not a description — that is the defect. The one exception is a table whose rows are labelled by ID (the go-live gate index in GO_LIVE_PLAN.md (private GitHub repo) and the Migration Plan's public pipeline gate tables): there the ID is the row's own structural label. Everywhere else, lead with the words. When a locator is genuinely useful, prefer a durable one — the target's section title or feature name — over a numeric or code locator (a section number, gate ID, or item number), which rots as the doc is edited and sections renumber; titles and names stay readable and stable. This is the cross-doc generalization of the same standard the private tracker guide sets for issue bodies, and it mirrors the code-comment standard in `.claude/rules/comments.md` and the question standard in `.claude/rules/asking.md`.

## Sensitive content

- **No hard-coded credentials or passwords** in docs, plan files, or any checked-in text. When referencing a stub auth mechanism with hard-coded values, say "hard-coded credentials" without spelling them out. The literals live only in code or local config.
- **No preview / demo / special login identifiers** (usernames, emails, literal login_email values) in checked-in docs, plans, or comments. Refer by role only ("the preview-user account"). Literals live in local operator notes or env vars.
- **Code comment / in-code text rules** (no doc references inside code, no sprint/slice/phase labels or dates, deviations as `Current:`/`Target:`, test comments never reference any doc) live in `.claude/rules/comments.md`, scoped to `src/` / `tests/` / scripts.

## Style

- **No "Last updated: <date>"** in any canonical doc header; git log is the authoritative source. Strip existing ones on audit passes.

## DD-specific rules (`docs/DESIGN_DECISIONS.md`)

- Match the existing subsection structure: Decision (terse declarative) / Rationale (bullets) / Requirements (bullets) / Trade-offs (bullets) / Impact (bullets). Do not introduce new section types or narrative paragraphs where bullets already cover the pattern.
- **Never add "this is final" meta-framing.** All DDs are final by the nature of the document. "The definitive position" / "the final stance" is noise.
- Baselines and justifications (browser support percentages, cutoff versions) belong in Rationale, not Decision.
- Prefer declarative sentences over hedging.

## Drift handling

When a drift-fix surfaces disagreement between a doc and another source:

1. **Separate the two questions:** (a) is the FACT drifted? (b) is the DESIGN drifted?
2. **Fix only (a)** unless the maintainer has explicitly approved a design change.
3. Current-slice or implementation-state language in a long-term doc is drift to delete. Design decisions in Decision/Rationale blocks are intentional and must be preserved.
4. Framework-style rewrites ("broaden X to cover three credential paths", "pick simpler option") are scope expansions, not drift fixes. Require explicit approval.
5. "Lock in final design now" in response to option-framing does NOT license replacing a long-standing design. Re-verify: does the existing design still stand? If yes, lock-in means confirming it.
6. When in doubt, ask: "I see drift X. Minimal fix Y removes the contradiction. Current design Z appears intentional. Fix only the drift, or change the design?"

## Bootstrap code is not a design signal

Current code includes bootstrap stubs that will be replaced. Code-as-it-exists is not the source of truth for design intent. Design intent lives in DD, USER_STORIES, GOVERNANCE, DATA_MODEL, and per-service file-header JSDoc. Current implementation reality lives in the maintainers' private tracker.

When reviewing DD drift, cite the design sources as evidence. Do NOT cite current code unless it's explicitly marked as the final implementation. Adapter gaps (DD specifies `SesAdapter` / `JwtSigningAdapter` / `MediaStorageAdapter` / `BallotEncryptionAdapter` / `SecretsAdapter`; code must provide it) are real parity gaps, not paper architecture to delete from the DD.

## Team-member names

Use role-based labels for internal team members in the **design docs** — DEV_ONBOARDING, DATA_MODEL, DESIGN_DECISIONS, USER_STORIES, PROJECT_SUMMARY_CONCISE, GLOSSARY, DIAGRAMS, PROJECT_SUMMARY. These describe the design, not who is doing the work, so they name no one:

- "James" / "James Leberknight" → "the historical-pipeline and freestyle maintainer" (owns all legacy work).
- "Dave" / "David" / "David Leberknight" → "the primary maintainer" / "the project maintainer".
- GitHub handles and contact emails follow the same rule; the canonical contact addresses live in DESIGN_DECISIONS and are not restated as literals elsewhere.

When replacing, preserve role/context: "James's sprint" means "the historical-pipeline sprint," not "a sprint." Translate semantically; do not delete.

**MIGRATION_PLAN follows the same role rule.** Its stakeholder-coordination layer lives in GO_LIVE_PLAN.md (private GitHub repo), so the public migration plan names no one: the same role labels as the design docs, plus "the legacy webmaster" and "the IFPA secretary" for the external stakeholders. Private-tracker issues and private-checkout documents still name people by first name. For legacy data still use "the legacy data" / "the legacy data import", not possessive constructions tied to a person — the neutral framing is about data ownership, not naming.

**Meta / governance docs** (README, CONTRIBUTING, CODE_OF_CONDUCT, GOVERNANCE) may name the maintainer for attribution and contact. Attribution is not sprint tracking.

## Tests describe long-term contracts

Test filenames, describe blocks, test names, and comments describe the long-term contract, never
the sprint that prompted them, and never reference any doc. Full rules in `.claude/rules/comments.md`.

## Tracker issues are for humans and agents

Every private-tracker issue is written to be read by both the maintainers and AI agents: self-contained enough to act on without opening another document. The issue-body standard lives in the private tracker guide (reached per the `tracker-ops` skill), never restated here.
