# Memory write rules

## When to use

Before any Write or Edit tool call against the project memory directory, including edits to `MEMORY.md`.

## Pre-save audit

Saving memory is high-stakes. Default = do not save. Before any Write or Edit to the memory directory, perform and announce this audit in the response, in this exact format so it can be grepped at approval time:

```
Memory audit: lesson = <one sentence>; checked entries <list of MEMORY.md entries reviewed>; no overlap; not in exclusion list.
```

The audit has five steps:

1. State the lesson in one sentence.
2. Read `MEMORY.md` end-to-end. Identify any existing entry that touches the same surface area. If overlap exists, UPDATE the existing entry or SKIP; do not add a new entry.
3. Confirm the lesson is not one of these exclusions:
   - One-incident observation.
   - Code, file path, naming convention, or repo structure re-derivable from the codebase.
   - Ephemeral task state or in-progress work.
   - Anything CLAUDE.md or `.claude/rules/` already covers.
   - Generic engineering principle (YAGNI, separation of concerns, "don't over-engineer").
4. Announce the audit in the response, before the Write or Edit call, in the exact format above.
5. If any check fails, do not save.

## Enforcement

A `permissions.ask` rule on Write and Edit to the memory directory gates the action at tool-call time (user-scope settings, since the path is per-machine absolute). The audit must already be visible in the conversation when the user reviews the prompt; otherwise the user defaults to deny.
