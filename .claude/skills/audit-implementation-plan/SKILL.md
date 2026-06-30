---
name: audit-implementation-plan
description: Audit and rewrite an AI-facing IMPLEMENTATION_PLAN.md (or similar AI-facing planning doc) into strict operational-only form: a clean baseline that seeds a kanban board, with every active item categorized by a tag. Use when asked to clean, prune, operationalize, de-clutter, or re-baseline an IP file. Output sections are limited to active work (tagged), current substitute mechanisms, open questions, external blockers, release-readiness criteria, and an optional deferred/parked section; the audit also cross-checks MIGRATION_PLAN for consistency. Always pauses for approval before writing.
---

# Skill: Operational Implementation Plan Audit (IP Audit)

## Purpose

Audit and rewrite AI-facing implementation plan documents (e.g. `IMPLEMENTATION_PLAN.md`) into a **strict operational state**.

These documents are **not user-facing docs**. They are working control surfaces for AI and must remain:
- Minimal
- Accurate
- Actionable
- Free of historical clutter

The IP is the clean baseline that seeds the go-live kanban board, so every active item is tagged with its category (below), not merely listed.

---

## What the IP must contain

Only:

- Active work (prioritized), each tagged by category
- Current substitute mechanisms (with unblock conditions)
- Open questions (coordination / governance decisions that gate scope)
- External blockers
- Release-readiness criteria
- (Optional) Deferred / parked work, non-blocking visibility only

Per-item category tags, so the plan seeds the board directly:

- `[BUG]` a verified defect in running code
- `[DEVIATION]` running code intentionally differs from design via a substitute mechanism, with a removal / unblock condition
- `[KANBAN]` an unbuilt forward feature, test, or gate (a board card)
- `[PRE-KANBAN]` must be cleared this sprint to make the baseline trustworthy
- `[BLOCKED]` waiting on external input
- `[Q]` an open question (decision)

These map onto the sections: the substitute mechanisms are the `[DEVIATION]` items; external blockers carry `[BLOCKED]`; release-readiness and deferred are unchanged.

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

Trim, don't just delete: when a kept item carries completed-work narrative (status reporting, "already did X", dry-run stats), cut it down to the remaining action plus its unblock condition. Done-context is clutter even inside a live item.

---

## Other invariants

- **No scope expansion.** Do not introduce new work, invent tasks, or reframe project direction. Only reflect reality already implied by the system.
- **Accurate system grounding.** All content must reflect actual system behavior, not assumptions: gating logic matches code, pipeline dependencies match real execution order, DB requirements match schema reality.
- **Consolidate overlapping sections.** "Still to do" + "Known gaps" → Active work. "Release checklist" → Release-readiness criteria.
- **Style.** Concise structured prose, prefer bullets, general prose rules per `.claude/rules/doc-governance.md` (no emojis).

---

## MIGRATION_PLAN cross-check

Every IP audit cross-checks the IP against `docs/MIGRATION_PLAN.md` (MP):

- **No contradiction.** Verify no IP item contradicts MP design or coordination. MP is the master for migration design and for the webmaster/secretary coordination questions (§19, §20a); the IP mirrors those in actionable form with status.
- **Manage duplication.** Where an IP item re-copies MP background, keep the IP item actionable (decision + status) and let MP hold the full detail, pointing to the MP section so the two cannot drift.
- **Possibly update MP.** If the audit reveals MP itself is stale or contradicted by code, propose an MP update with literal before/after and get approval. MP is canonical; never silently edit it.

---

## Output protocol

Always produce, in order:

1. **Plan** — sections to delete, merge, rewrite; any structural changes.
2. **Proposed result** — full rewritten file OR clean diff.
3. **Assumptions and risks** — anything removed that may matter later; ambiguity in interpretation; misplaced-but-useful content.
4. **Pause for approval** — never apply changes without explicit approval. Questions to the human follow `.claude/rules/asking.md`.

---

## Invocation examples

- "Audit IMPLEMENTATION_PLAN.md using the audit-implementation-plan skill"
- "Clean this file into operational-only form. Apply IP audit rules."

---

## Notes

- This skill enforces **discipline over completeness**.
- Missing ideas are acceptable; incorrect or stale items are not.
- Git history is the source of truth for removed content.
