# Memory write rules

## When to use

Before any Write or Edit tool call against the project memory directory, including edits to `MEMORY.md`.

## What memory may hold

Two classes only: a machine-local fact (a path, symlink target or tool quirk true of this one machine) and the user's personal preference about how they like to work. Anything about the project (a rule, a convention, a design fact, a lesson about the code or the process) goes to its canonical home instead: a rule, a skill, a hook, a `CLAUDE.md`, a committed doc, the private operations checkout, or the private tracker. Memory is per-machine and is not loaded into subagents, so a project fact kept there is invisible to every other developer and agent. A request to "remember" a project fact is a request to propose that home.

## Pre-save audit

Saving memory is high-stakes. Default = do not save. Before any Write or Edit to the memory directory, perform and announce this audit in the response, in this exact format so it can be grepped at approval time:

```
Memory audit: lesson = <one sentence>; class = <machine-local|user preference>; checked entries <list of MEMORY.md entries reviewed>; no overlap; not in exclusion list.
```

The audit has five steps:

1. State the lesson in one sentence and name its class (machine-local or user preference); if it is neither, go to step 5.
2. Read `MEMORY.md` end-to-end, and grep the harness for the lesson's keywords — root and nested `CLAUDE.md`, `.claude/rules/*`, `.claude/hooks/*`, and committed `docs/*`. If an existing memory, rule, hook, or doc already states or enforces it, UPDATE that home or SKIP; never add a duplicate note.
3. Confirm the lesson is not one of these exclusions:
   - One-incident observation.
   - Code, file path, naming convention, or repo structure re-derivable from the codebase.
   - Ephemeral task state or in-progress work.
   - Anything already stated or enforced by root or nested `CLAUDE.md`, any `.claude/rules/*`, any `.claude/hooks/*`, or any committed doc under `docs/` (for example DEV_ONBOARDING, TESTING, DESIGN_DECISIONS, USER_STORIES, DATA_GOVERNANCE, DATA_MODEL).
   - Implementation status or dated progress (which belongs in the maintainers' private tracker, never in memory).
   - A `docs/` filename cited as live truth in the body: docs get deleted and the note goes stale, so state the concept in words; needing to name a doc is itself a signal to promote, not save.
   - Generic engineering principle (YAGNI, separation of concerns, "don't over-engineer").
4. Announce the audit in the response, before the Write or Edit call, in the exact format above.
5. If any check fails, do not save. If the lesson is about the project, propose it for its canonical home as literal BEFORE/AFTER text and apply it only once the human approves.

## Pruning

The store is not append-only. On any `audit-memory` run, and opportunistically whenever you touch memory, delete entries that now duplicate a rule/hook/doc, cite a deleted doc, or record one-off status.

## Enforcement

A `permissions.ask` rule on Write and Edit to the memory directory gates the action at tool-call time (user-scope settings, since the path is per-machine absolute). The audit must already be visible in the conversation when the user reviews the prompt; otherwise the user defaults to deny.
