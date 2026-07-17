---
name: tracker-ops
description: Use when reading, filing, triaging, updating, or drafting issues in the maintainers' private tracker, checking whether work is in scope or already tracked, drafting files in the private operations checkout (footbag_private_repo), or consulting the private ops docs. Claude reads and drafts; a human runs every gh or git write. Degrades to a one-line note when the tracker is not wired on this machine.
---

# Tracker operations

The maintainers' private tracker (GitHub Issues on the private operations
repository) is the sole authority for active work, current scope, defects, and
accepted implementation deviations. Claude reads it freely and drafts issue bodies,
files, and exact commands; a human runs every mutation.

## Wiring and polite degradation

Two optional machine-local pieces, wired per developer (the private repo is
optional; a dev or tester without it is a fully supported configuration):

- `FOOTBAG_PRIVATE_REPO` env var, set in the gitignored
  `.claude/settings.local.json`: `"env": { "FOOTBAG_PRIVATE_REPO": "<owner>/<repo>" }`.
  Required for any `gh` tracker call; check it is non-empty first.
- `footbag_private_repo/` gitignored repo-root symlink to the private checkout.
  Needed only for drafting files there or reading the private ops docs.

When a piece is absent, say exactly one line naming the wiring step, skip the part
that needs it, and continue the rest of the job. Never hard-fail, never repeat the
note, never block unrelated work. A scope check with no wiring means: proceed with
the human's instruction as given.

## Orientation (read-only, auto-approved)

- Active work: `gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open`
  (add `--label <lane>`, `--assignee <user>`, `--milestone <name>` to narrow).
- Detail: `gh issue view <n> -R "$FOOTBAG_PRIVATE_REPO"`.
- "Is this tracked / in scope?": search titles and bodies with
  `gh search issues --repo "$FOOTBAG_PRIVATE_REPO" "<terms>"` or list open issues
  and match. An open issue covering the work is the scope record; its absence for
  significant new work is a question for the human, not a blocker to invent around.
- Non-mutating `gh api` GETs are fine. All of these auto-approve; run them freely.

## Drafting

- Issue bodies follow the issue-body standard in the private repo's
  `TRACKER_GUIDE.md` (single home; read it through the symlink, do not restate it):
  title = verb + exact surface; one-paragraph problem statement; concrete steps
  with exact identifiers; one "Done when" line; one screen max, bulky evidence to
  the private repo's `evidence/` directory.
- Label vocabulary: one lane (`platform`, `pipeline`, `freestyle`,
  `coordination`) plus `bug` (defect or accepted deviation tracked to removal),
  `blocked` (first body line `Blocked on: <person> - <what unblocks it>`),
  `question`. One assignee; milestone when go-live-scoped.
- Files drafted into `footbag_private_repo/` are working drafts: a human reviews,
  commits, and pushes them.

## Mutations are HUMAN-RUN

Every mutation (`gh issue create/edit/close/comment/pin`, any `gh api` write, any
git write in the private checkout) is prepared as an exact ready-to-paste command
for the human, never executed by Claude (the harness prompts on every mutating
form; treat a prompt as the human's decision point, not an obstacle). Exception
only when the human explicitly authorizes a named batch in the current session.

## Hidden-reference rule (hard)

Committed public text never carries the private repository's slug, owner, name, or
issue numbers, in any form: prose says "the maintainers' private tracker"; commands
say `-R "$FOOTBAG_PRIVATE_REPO"`; fixtures use synthetic slugs. A public commit
message never references a private issue; the private issue cites the public commit
SHA instead. Public code comments keep the `Current:`/`Target:` convention and
never carry an issue number; the issue cites the file and line.

## Private ops docs

The private checkout carries `AWS_OPERATIONS.md` (concrete AWS facts), the
maintainers' operations guide (operating runbooks), and `VAULT_GOVERNANCE.md`
(vault and board governance). Cite their content by section title, never by section number. Linking is
one-way: private text may cite public files and commit SHAs; public text names the
private docs only by role ("the maintainers' private operations guide").

## Questions

Questions for the human follow `.claude/rules/asking.md`; never restate it here.
