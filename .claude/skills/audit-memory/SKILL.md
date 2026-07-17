---
name: audit-memory
disable-model-invocation: true
description: Audit the whole project auto-memory store for hygiene - classify every entry keep / rewrite / promote / delete against the memory.md pre-save gate, and flag stale doc citations, dead [[links]], malformed frontmatter, duplicates of an existing rule / hook / doc, and MEMORY.md index mismatches. Invoke ONLY when the user explicitly asks to audit, prune, clean, or re-baseline memory, or after a major harness or docs change. Not for saving one new memory (that is the memory.md write gate). Read-only until the user approves; executes deletes and promotions in review batches.
---

# Skill: Audit the auto-memory store (audit-memory)

## Purpose

Keep the project auto-memory store honest. `.claude/rules/memory.md` gates memory at
*write* time, one entry at a time; nothing reviews the store as a whole afterwards, so it
drifts — duplicates of rules/hooks/docs accumulate, entries cite deleted docs, `[[links]]`
go dead, and the `MEMORY.md` index falls out of sync with the files. This skill runs the
`memory.md` checklist over every entry on demand and proposes a clean store.

## When to use / stop condition

Use only when the human explicitly asks to audit, prune, clean, or re-baseline memory, or
right after a major harness or docs change (deleted docs, promoted rules) that could strand
citations. Not for saving a single new memory — that is the `memory.md` write gate, not this
skill. Stop once the human has approved a batch and the executed changes are verified (index
matches files; no dead links or stale citations remain); do not keep sweeping.

## Authority

`.claude/rules/memory.md` is the single source for what may live in memory (the five-step
pre-save audit and the exclusion list). This skill applies that rule at review scale; it does
not restate or fork the exclusion list — read `memory.md` and use it verbatim.

## Method

**Phase 1 — Inventory.** Read `MEMORY.md` end to end and list every entry file in the memory
directory. Note any file with no `MEMORY.md` pointer and any pointer with no file (index drift).

**Phase 2 — Per-entry classification.** For each entry, apply the `memory.md` exclusion list
and decide exactly one verdict:
- DELETE — already stated or mechanically enforced by root/nested `CLAUDE.md`, a `.claude/rules/*`,
  a `.claude/hooks/*`, or a committed `docs/*`; or a one-off incident; or state re-derivable from
  code; or implementation status (belongs in the maintainers' private tracker).
- PROMOTE — a real, durable lesson with a repo home it is not yet in. Name the destination
  (root `CLAUDE.md`, a specific rule, a doc, a hook, or a CI check) and the exact text to add.
- REWRITE — the lesson is sound but the entry is stale: it cites a deleted doc, carries a dead
  `[[link]]`, has malformed frontmatter, or states more than the machine-local nucleus. Trim to
  the part with no repo home.
- KEEP — a machine-local or Claude-product fact with no repo home (tooling behavior, a local
  file pointer, a secret-bearing pointer), passing every exclusion.

To decide DELETE-vs-KEEP, grep the harness for the entry's keywords across root and nested
`CLAUDE.md`, every `.claude/rules/*`, every `.claude/hooks/*`, and every committed `docs/*`. A
match means the lesson has a home already — DELETE or PROMOTE, never keep a duplicate.

**Phase 3 — Structural checks (across the whole store).**
- Stale doc citations: for every `docs/…` (or other repo path) named in an entry body, confirm
  the file still exists; a dead name is a REWRITE (state the concept in words, drop the name).
- Dead `[[links]]`: for every `[[name]]`, confirm a `name.md` entry exists; flag misses.
- Malformed frontmatter: every entry has non-empty `name`, `description`, and a valid
  `metadata.type` (user | feedback | project | reference); flag violations.
- Index sync: every file has exactly one `MEMORY.md` pointer and vice versa.
- Reverse citations: grep the harness (root and nested `CLAUDE.md`, `.claude/**`) for `memory/`
  path references. A harness file citing a memory entry means the fact needs a repo home —
  promote it; a citation of a nonexistent entry is a defect to fix in the citing file.

**Phase 4 — Present the ledger, then pause.** Output the per-entry verdict table (below) plus
the structural-check findings. Make no change yet. Recommend an execution order and stop for
approval.

**Phase 5 — Execute in review batches.** On approval, execute in this order, pausing for the
human between batches (batch-by-batch review is the standing preference): (1) DELETEs; (2)
REWRITEs; (3) PROMOTEs — each promotion is a committed-file edit shown as literal before/after
and separately approved, since it touches a rule/doc/CLAUDE.md. After each batch, rewrite the
`MEMORY.md` index to match the surviving files. Every Write/Edit to the memory directory still
follows the `memory.md` announce-the-audit format (it is gated by `permissions.ask`).

## Secret safety

Some entries are pointers to gitignored, secret-bearing files (for example
`reference_aws_project_specifics`). Refer to such an entry by name and verdict only — never
echo its body, paths, IPs, keys, or credentials into the conversation or into any committed
file. A secret-bearing pointer with a valid target is a KEEP.

## Output format

A per-entry ledger, one row each:

`<entry-name> — <KEEP|REWRITE|PROMOTE|DELETE> — <one-line reason>[; destination for PROMOTE][; stale-citation/dead-link/frontmatter note]`

Followed by the structural-check summary (index drift, dead links, malformed frontmatter, stale
citations) and a recommended batch order. No file changes until the human approves.
