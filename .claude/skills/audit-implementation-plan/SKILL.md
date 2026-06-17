---
name: audit-implementation-plan
description: Audit and rewrite an AI-facing IMPLEMENTATION_PLAN.md (or similar AI-facing planning doc) into strict operational-only form. Use when asked to clean, prune, operationalize, or de-clutter an IP file. Output sections are limited to active work, current substitute mechanisms, external blockers, release-readiness criteria, and an optional deferred/parked section. Always pauses for approval before writing.
---

# Skill: Operational Implementation Plan Audit (IP Audit)

## Purpose

Audit and rewrite AI-facing implementation plan documents (e.g. `IMPLEMENTATION_PLAN.md`) into a **strict operational state**.

These documents are **not user-facing docs**. They are working control surfaces for AI and must remain:
- Minimal
- Accurate
- Actionable
- Free of historical clutter

---

## What the IP must contain

Only:

- Active work (prioritized)
- Current substitute mechanisms (with unblock conditions)
- External blockers
- Release-readiness criteria
- (Optional) Deferred / parked work, non-blocking visibility only

Deferred items are NOT part of active work and NOT part of release gating. Keep that section minimal; no expansion.

---

## What must be removed

Hard delete, no tombstones:

- Completed work ("Already done" entries)
- Historical notes, sprint logs, change commentary
- Stale deliverables, duplicate sections
- Long-term ideas with no execution path
- Hypothetical or speculative items
- "Next sprint" speculation
- Vague "improve X later" items
- Multiple overlapping task lists for the same work

Removal is hard delete: no "Closed" sections, no strike-through, no "(COMPLETE)" markers, no one-line tombstones. Git history is the source of truth for removed content.

---

## Keep / delete heuristics

Keep if the item: blocks execution, enables release, reflects a current system constraint, or has a clear owner and action.

Delete if the item: is already done, is hypothetical, is redundant, is historical, or is not tied to execution.

---

## Other invariants

- **No scope expansion.** Do not introduce new work, invent tasks, or reframe project direction. Only reflect reality already implied by the system.
- **Accurate system grounding.** All content must reflect actual system behavior, not assumptions: gating logic matches code, pipeline dependencies match real execution order, DB requirements match schema reality.
- **Consolidate overlapping sections.** "Still to do" + "Known gaps" → Active work. "Release checklist" → Release-readiness criteria.
- **Style.** Concise structured prose, prefer bullets, general prose rules per `.claude/rules/doc-governance.md` (no emojis).

---

## Output protocol

Always produce, in order:

1. **Plan** — sections to delete, merge, rewrite; any structural changes.
2. **Proposed result** — full rewritten file OR clean diff.
3. **Assumptions and risks** — anything removed that may matter later; ambiguity in interpretation; misplaced-but-useful content.
4. **Pause for approval** — never apply changes without explicit approval.

---

## Invocation examples

- "Audit IMPLEMENTATION_PLAN.md using the audit-implementation-plan skill"
- "Clean this file into operational-only form. Apply IP audit rules."

---

## Notes

- This skill enforces **discipline over completeness**.
- Missing ideas are acceptable; incorrect or stale items are not.
- Git history is the source of truth for removed content.
