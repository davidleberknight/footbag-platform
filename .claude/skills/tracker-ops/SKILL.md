---
name: tracker-ops
description: Use when reading, filing, triaging, updating, or drafting issues in the maintainers' private tracker, checking whether work is in scope or already tracked, drafting files in the private operations checkout (footbag_private_repo), or consulting the private ops docs. Claude reads and drafts; git writes stay human-run, and Claude runs a tracker gh mutation only when specifically asked, each gated by the approval prompt. Degrades to a one-line note when the tracker is not wired on this machine.
---

# Tracker operations

The maintainers' private tracker (GitHub Issues on the private operations
repository) is the sole authority for active work, current scope, defects, and
accepted implementation deviations. Claude reads it freely and drafts issue bodies,
files, and exact commands; by default a human runs every mutation, with the
specific-request exception in Mutations below.

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

## Orientation (read-only)

- **Preferred when the `footbag_private_repo/` symlink is present:** the shipped
  `footbag_private_repo/track-issues.sh` viewer — compact one-line-per-issue output whose tokens
  are all that enter context. Presets: no arg (dashboard: counts by lane and type), `<label>`,
  `mine`, `blocked`, `all`, `<number>` (single-issue detail with the Assignee line).
- **Fallback (symlink absent, env var only) or for anything the script does not cover:**
  - Active work: `gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open`
    (add `--label <lane>`, `--assignee <handle>`, `--milestone <name>` to narrow).
  - Detail: `gh issue view <n> -R "$FOOTBAG_PRIVATE_REPO"`.
  - "Is this tracked / in scope?": search titles and bodies with
    `gh search issues --repo "$FOOTBAG_PRIVATE_REPO" "<terms>"` or list open issues and match.
    An open issue covering the work is the scope record; its absence for significant new work is
    a question for the human, not a blocker to invent around.
- **"What's assigned to <person>":** translate the name to a GitHub handle via the assignee
  roster in the private `TRACKER_GUIDE.md` (its single home), then
  `gh issue list -R "$FOOTBAG_PRIVATE_REPO" --assignee <handle>` (the script's `mine` preset
  covers only yourself). Degradation: symlink absent (no roster to read) -> derive handles live
  from `gh issue list -R "$FOOTBAG_PRIVATE_REPO" --json assignees`; fully unwired -> ask the
  human for the handle. Never hard-code a handle in this file.
- Non-mutating `gh api` GETs are fine; the `gh` read forms auto-approve, run them freely.

## Drafting

- Issue bodies follow the issue-body standard in the private repo's
  `TRACKER_GUIDE.md` (single home; read it through the symlink, do not restate it):
  title = verb + exact surface; one-paragraph problem statement; concrete steps
  with exact identifiers; one "Done when" line; one screen max, bulky evidence to
  the private repo's `evidence/` directory.
- Labels: read the current vocabulary from `TRACKER_GUIDE.md` (the private repo's single
  home), or derive the live set with `gh label list -R "$FOOTBAG_PRIVATE_REPO"` (needs only
  the env var, works when the symlink is absent) — do not hard-code it here, it drifts.
  Every issue: one lane label, the applicable markers, one assignee, and the milestone when
  go-live-scoped. `blocked` needs a first body line `Blocked on: <person> - <what unblocks
  it>`. Unwired (no env var and no symlink): fall back to the labels the local `BUGS.md` or
  the human names, and note the wiring gap in one line.
- Files drafted into `footbag_private_repo/` are working drafts: a human reviews,
  commits, and pushes them.

## Graduating hunt findings

Single home for turning an approved `BUGS.md` finding into an issue; the `bug-hunt` and
`freestyle-bug-hunt` skills cite this rather than restating it. After the human approves a
hunt's findings, draft one issue per confirmed finding: an issue body meeting the issue-body
standard above, plus the exact `gh issue create -R "$FOOTBAG_PRIVATE_REPO" --title "..."
--label <lane> --label bug --body "..."` (the finding's lane, plus other markers as they
apply). By default the human runs it; when the human specifically asks Claude to file or
revise the issues, Claude runs it under the mutation policy above (the per-command approval
prompt is the human's sign-off). `BUGS.md` is the local scratch sink; a finding leaves it
when its issue is filed or its fix lands. When the tracker is not wired, skip drafting with
the one-line degradation note above.

## Mutations: drafted always, run only when asked and approved

Every mutation (`gh issue create/edit/close/comment/pin`, any `gh api` write, any git
write in the private checkout) is first prepared as an exact command. Claude never mutates
the tracker unprompted or as a side effect. Then:

- **Default:** the human runs the command; Claude prepares it and stops.
- **On specific request:** when the human specifically asks Claude to run a named tracker
  mutation (file, edit, comment, close), Claude runs the `gh` command itself. The harness
  prompts on every mutating form, and that per-command prompt is the human's approval —
  surface the exact command and let the prompt gate it; never suppress, auto-approve, or
  batch past it.
- **Failsafe:** if a mutating `gh` form somehow runs with no approval prompt appearing (a
  stray machine-local allow in `settings.local.json`), stop and report it as a config gap.
  Silent execution is never approval; the prompt is what turns "asked" into "approved".

Git writes in the private checkout stay human-run (`private-repo.md`).

## Hidden-reference rule (hard)

Committed public text never carries the private repository's slug, owner, name, or
issue numbers, in any form: prose says "the maintainers' private tracker"; commands
say `-R "$FOOTBAG_PRIVATE_REPO"`; fixtures use synthetic slugs. A public commit
message never references a private issue; the private issue cites the public commit
SHA instead. Public code comments keep the `Current:`/`Target:` convention and
never carry an issue number; the issue cites the file and line.

## Private ops docs

The private checkout carries three private ops docs. `AWS_OPERATIONS.md` (private GitHub repo)
holds concrete AWS facts, `DEVOPS_GUIDE.md` (private GitHub repo) holds operating runbooks, and
`VAULT_GOVERNANCE.md` (private GitHub repo) holds vault and board governance. Cite their content by section title, never by section number. Linking is
one-way: private text may cite public files and commit SHAs; public text names these
docs by filename and marks them private ("DEVOPS_GUIDE.md (private GitHub repo)"), because
a reader who cannot open a doc is still better served by its real name than by a vague
role. Naming a file leaks nothing: the hidden-reference rule bans the repository's slug,
owner, and issue numbers, which is why the tracker itself stays "the maintainers' private
tracker" rather than a repo name.

## Questions

Questions for the human follow `.claude/rules/asking.md`; never restate it here.
