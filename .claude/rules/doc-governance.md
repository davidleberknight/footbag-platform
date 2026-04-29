---
paths:
  - "docs/**"
  - "IMPLEMENTATION_PLAN.md"
  - "MIGRATION_PLAN.md"
  - "README.md"
  - "CONTRIBUTING.md"
  - "CODE_OF_CONDUCT.md"
  - "GOVERNANCE.md"
  - "PROJECT_SUMMARY*.md"
  - "GLOSSARY.md"
  - "DIAGRAMS.md"
---

# Doc governance rules

## Canonical vs active-slice separation

Long-term canonical docs describe **design intent**, not implementation status:

- `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, `docs/SERVICE_CATALOG.md`, `docs/PROJECT_SUMMARY_CONCISE.md`, `docs/VIEW_CATALOG.md`, `docs/DATA_MODEL.md` — pure design.
- `docs/DEV_ONBOARDING.md`, `docs/DEVOPS_GUIDE.md` — permanent design + permanent operating procedure. Same no-current-slice rule applies.

Never add current-slice notes, deviation qualifiers, shortcut descriptions, completion status, "Last updated" dates, or sprint tracking to any of these.

All implementation-state language belongs exclusively in `IMPLEMENTATION_PLAN.md`.

## Temporary deviations live in IP only

Substitute patterns, transitional shortcuts, and other deviations with explicit unblock conditions go in the `IMPLEMENTATION_PLAN.md` active-slice "Known deviation" / "Accepted temporary deviations" blocks. Never duplicate substitute-aware callouts into DEV_ONBOARDING.md or DEVOPS_GUIDE.md — a volunteer reads IP first for deviations, then the canonical step. When the deviation resolves, delete the IP entry; the canonical doc needs no change.

## "Deferred to later path" is scope, not drift

In DEV_ONBOARDING and similar procedural docs, "deferred and will be added in Path E" is valid scope-sequencing language describing doc architecture. It is **not** doc-governance drift.

- **Valid scope language (leave alone):** "deferred to Path E", "not yet provisioned (see §5.3)", "deferred hardening — see Path E", "X is deferred to a later path".
- **Actual drift (flag it):** "(deferred post-sprint)", "already declared... as deferred groundwork for exactly this chain", "the drift is expected and tracked", "not yet completed as of <date>", "as of today", "currently", "pending team review".

Rule of thumb: if deferral points to another section/path/doc as the home for the work, it's scope. If it points to time, sprint, or tracking, it's drift.

## References

- **No refs to gitignored / local-only files** from any committed doc. State the underlying fact inline. Local files include `AWS_PROJECT_SPECIFICS.md` (operator secrets + Lightsail constraints) and `approval_fatigue.md` (personal permission-setup notes).
- **No refs to temporary / sprint-scoped files** from canonical docs, even when both are committed. Temp files have short lifespans; pointing canonical docs at them creates broken references.
- **No dedicated "Cross-references" sections** or trailing "Cross-references:" bullets in DD, DATA_MODEL, MIGRATION_PLAN, SERVICE_CATALOG, or other long-term docs. Inline refs in prose are fine when they're load-bearing for comprehension. AI routing between docs is handled via CLAUDE.md + skill triggers + memory, not in-doc navigation.

## Sensitive content

- **No hard-coded credentials or passwords** in docs, plan files, or any checked-in text. When referencing a stub auth mechanism with hard-coded values, say "hard-coded credentials" without spelling them out. The literals live only in code or local config.
- **No preview / demo / special login identifiers** (usernames, emails, literal login_email values) in checked-in docs, plans, or comments. Refer by role only ("the preview-user account"). Literals live in local operator notes or env vars.
- **No doc references inside code files** (`.ts`, `.sh`, scripts). Doc and code evolve independently; hard-coded `// see docs/FOO.md §X.Y` comments rot. Write self-contained code comments that explain the requirement without pointing at a doc path.

## Style

- **H1 doc title:** use `--` (two hyphens), not `—` (em dash). Example: `# Footbag Website Modernization Project -- Data Model`. H2/H3/H4 section headers inside the body keep their existing convention.
- **Prose:** no em dashes. Use commas, parentheses, or restructure the sentence.
- **No "Last updated: <date>"** in any canonical doc header; git log is the authoritative source. Strip existing ones on audit passes. IP included.

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

Current code includes bootstrap stubs (e.g. `src/middleware/authStub.ts`) that will be replaced. Code-as-it-exists is not the source of truth for design intent. Design intent lives in DD, USER_STORIES, GOVERNANCE, SERVICE_CATALOG, DATA_MODEL. Current-sprint implementation reality lives in IP.

When reviewing DD drift, cite the design sources as evidence. Do NOT cite current code unless it's explicitly marked as the final implementation. Adapter gaps (DD specifies `SesAdapter` / `JwtSigningAdapter` / `MediaStorageAdapter` / `BallotEncryptionAdapter` / `SecretsAdapter`; code must provide it) are real parity gaps, not paper architecture to delete from the DD.

## Team-member names

Do not reference internal team members by name in **technical / design project docs**: MIGRATION_PLAN, DEV_ONBOARDING, DATA_MODEL, DESIGN_DECISIONS, USER_STORIES, PROJECT_SUMMARY_CONCISE, SERVICE_CATALOG, VIEW_CATALOG, DEVOPS_GUIDE, GLOSSARY, DIAGRAMS, PROJECT_SUMMARY. Use role-based labels.

- "James" / "James Leberknight" → "the historical-pipeline maintainer".
- "Dave" / "David" / "David Leberknight" → "the primary maintainer" / "the project maintainer".
- Email addresses / GitHub handles follow the same rule.

**Meta / governance docs** (README, CONTRIBUTING, CODE_OF_CONDUCT, GOVERNANCE) may name the maintainer for attribution and contact. Attribution is not sprint tracking.

**The root `IMPLEMENTATION_PLAN.md` and `legacy_data/IMPLEMENTATION_PLAN.md` are the only technical-doc exceptions** — sprint tracking by name (James / Dave) is expected and correct in both. The root IP routes to `legacy_data/IMPLEMENTATION_PLAN.md` for historical-pipeline detail; do not reintroduce that detail into the root.

**Steve Goldberg is a narrow preserved exception** in MIGRATION_PLAN §14 (the coordination contract with the legacy-site webmaster). Elsewhere, use "the legacy data" / "the legacy data import" — never "Steve's data" / "Steve's dump" / possessive constructions. His address `brat@footbag.org` is authoritatively listed in DD §5.5.

When replacing, preserve role/context: "James's sprint" means "the historical-pipeline sprint," not "a sprint." Translate semantically; do not delete.

## Tests describe long-term contracts

Test filenames, describe blocks, test names, and file header comments must describe the **long-term contract** being verified, not the sprint that prompted the test's creation. "Staging AWS wiring: assumed-role chain + KMS signing + SES send" beats "Phase H readiness probe." A test failing today because staging KMS/SES is not yet wired is a long-term parity test with a currently-failing precondition, not a Phase H test.

Sprint-scoped content belongs in IP or the runbook (`docs/DEV_ONBOARDING.md`). Do not embed sprint section numbers inside test code or comments that will outlive the sprint.

## IP is AI-facing

`IMPLEMENTATION_PLAN.md` is written for AI-agent consumption, not human audit. Edit with that audience in mind:

- When an item is done, **delete it outright**. No "Closed" section, no one-line tombstone, no "(COMPLETE)" markers, no strike-through.
- Keep sections as small as possible; remove empty headers after deleting their contents.
- Reserve verbose explanation for memory entries or commit messages where humans might read.
