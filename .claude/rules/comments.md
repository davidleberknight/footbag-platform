---
paths:
  - "src/**"
  - "tests/**"
  - "scripts/**"
  - "legacy_data/scripts/**"
  - "legacy_data/tools/**"
---

# Code comment & human-readable-text rules

## Scope

All human-readable text authored in code files: `//` and `/* */` comments, JSDoc, Handlebars
`{{! }}` / `{{!-- --}}` comments, CSS comments, AND human-readable string VALUES (governance
`reason:` fields, editorial / content strings, labels, descriptions). The rules below apply to
all of it, not just `//` lines.

## Standard

Human-readable text states the WHY in plain words a future reader understands on its own. It is
self-contained. Forbidden everywhere:

- **Sprint / slice / phase / wave labels** — `UX-SHIP-1`, `Phase 6`, `Phase 2.5`, `Slice 1`,
  `Slice X`, `Wave 2`, `NCR-1`, `*-REFACTOR-N`, `SET-SYSTEM-REFACTOR`, task-letter labels
  (`Task B`), `Architecture B1`, and similar delivery-epoch tags.
- **Dates / dated change-markers** — `(2026-05-25)`, "corrected 2026-05-22", "added on …".
  (A date that is genuine DATA — a seeded timestamp, a citation year, a displayed last-updated
  value — is fine; the ban is on dating a change or decision in the text.)
- **Historical change notes** — "was X, now Y", "removed in …", "renamed from …", "earlier
  sketch used …".
- **Caller references** — "called by X", "see also `fooController`". Same-file helper names used
  as inline navigation are tolerated only when they do not replace the explanation.
- **Doc references.** Doc PATHS (`docs/FOO.md §X`, `see BAR.md`, `exploration/…`) are ALWAYS
  forbidden — doc and code evolve independently and the reference rots. Bare section shorthands
  (`DD §2.9`, `US §198`) are tolerated only as a locator sitting beside a complete
  self-contained explanation, never as a substitute for one.
- **Preview / demo / special login identifiers** (usernames, emails, literal `login_email`
  values). Refer by role ("the preview-user account"); literals live in env vars / local notes.

## Deviations

Code that does X today but is intended to do Y uses `Current:` / `Target:` lines, self-contained,
AND the deviation is recorded in `IMPLEMENTATION_PLAN.md` (root or `legacy_data/`). No other
planning-style content is permitted in code text.

This applies to built code that behaves differently from its target. A feature not yet written
is not a deviation: a comment or JSDoc stating its correct target contract is design intent and
takes no `Current:` / `Target:` markers.

## Test comments (stricter)

Test filenames, `describe` blocks, test names, file-header comments, and inline comments describe
the **long-term contract** being verified in plain words ONLY — "Staging AWS wiring: assumed-role
chain + KMS signing + SES send" beats "Phase H readiness probe". A test failing today because a
precondition is not yet wired is a long-term parity test with a failing precondition, not a
sprint test.

Test comments must NEVER reference any doc or finding id: no `BUG_HUNT` / `B##` /
`Regression for B##` / `(B##)`, no `DD §` / `US §` / `DATA_GOVERNANCE §`, no `docs/*.md`
or bare `*.md` filenames, no sprint or section numbers. This is stricter than `src`: in tests even
a section shorthand beside prose is not allowed.

## Logging

Application code logs through the structured `logger` (`src/config/logger`), never `console.*` —
console output bypasses the CloudWatch pipeline and the test `logger.error` guard. The audit-row +
`logger.error` pairing via `recordOperationalError` is specified in `service-layer.md`.

Pick the level deliberately, because production runs at `LOG_LEVEL=warn` and drops `info`/`debug`:

- `error` — a failure an operator must act on (pairs with an audit row via `recordOperationalError`
  for governance-sensitive failures).
- `warn` — an operationally-significant condition that must be visible in production: a backlog, a
  degraded or failing dependency, an exhausted retry. Anything a production operator needs to see
  lives at `warn` or above.
- `info` — normal-operation milestones useful in development and staging (startup, a completed job),
  not worth production noise.
- `debug` — high-frequency or diagnostic detail (per-cycle heartbeats, per-request traces); shown
  only in development.

A line that feeds a CloudWatch metric filter MUST emit at a level production shows (`warn` or above)
or the metric is silently starved. A high-frequency per-cycle line belongs at `debug` (or as a
metric), never `info`.
