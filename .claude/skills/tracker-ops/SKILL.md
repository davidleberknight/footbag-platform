---
name: tracker-ops
description: Use when reading, filing, triaging, updating, or drafting issues in the maintainers' private tracker, checking whether work is in scope or already tracked, drafting files in the private operations checkout (footbag_private_repo), or consulting the private ops docs. Claude reads and drafts; git writes stay human-run, and Claude runs tracker gh mutations itself once the human has agreed to the set, without pausing again between the commands in it. Degrades to a one-line note when the tracker is not wired on this machine.
---

# Tracker operations

The maintainers' private tracker (GitHub Issues on the private operations
repository) is the sole authority for active work, current scope, defects, and
accepted implementation deviations. Claude reads it freely and drafts issue bodies,
files, and exact commands, and runs tracker mutations itself once the human has
agreed to the specific change, per Mutations below. Git writes stay human-run.

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

- **Preferred, and approval-free on every machine:** the `gh` read forms below. The committed
  read-only approver grants them on their own merits, so they never prompt, on any developer's
  machine, with no absolute path anywhere. Use these by default:
  - Compact one-line-per-issue listing, the same shape the viewer prints:
    `gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open --limit 200 --json number,title,labels
    --jq '.[] | "#\(.number)  [\([.labels[].name]|join(","))]  \(.title)"'`
    (append `| grep <label>` to narrow to a lane; the unblocked-doctrine view is
    `| grep doctrine | grep -v blocked`).
  - Active work: `gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open`
    (add `--label <lane>`, `--assignee <handle>`, `--milestone <name>` to narrow).
  - Detail: `gh issue view <n> -R "$FOOTBAG_PRIVATE_REPO"`.
  - "Is this tracked / in scope?": search titles and bodies with
    `gh search issues --repo "$FOOTBAG_PRIVATE_REPO" "<terms>"` or list open issues and match.
    An open issue covering the work is the scope record; its absence for significant new work is
    a question for the human, not a blocker to invent around.
- **Optional convenience when the `footbag_private_repo/` symlink is present:** the shipped
  `footbag_private_repo/track-issues.sh` viewer wraps these same read-only API calls behind
  presets (no arg dashboard, `<label>`, `actionable`, `mine`, `blocked`, `all`, `<number>`).
  It costs one approval prompt per call, because the private checkout resolves outside the
  project tree and no portable repo rule can cover a per-developer path. Reach for it only
  when the human asks for it by name.
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
- **Companion-doc sync (hard rule).** Nothing drafted into the private checkout — a
  dataset, artifact directory, script, or document — is finished until the repo's
  primary docs account for it in the same pass: the `README.md` "What lives where"
  map; `DATA_INVENTORY.md` (the placement-homes list, plus a dataset row for anything
  private, sensitive, or archival); the applicable governance doc when the material is
  governance-scoped; and a roadmap home (`GO_LIVE_PLAN.md`, `PARKED.md`, or
  `V2_SCOPE.md`) when it changes or defers planned work. Check for those mentions
  before declaring the drafting done, and draft any missing ones yourself. An
  undocumented stash in an access-controlled repo is invisible data — the failure
  mode this rule exists to prevent.

## Graduating hunt findings

Single home for turning an approved `BUGS.md` finding into an issue; the `bug-hunt` and
`freestyle-bug-hunt` skills cite this rather than restating it. After the human approves a
hunt's findings, draft one issue per confirmed finding: an issue body meeting the issue-body
standard above, plus the exact `gh issue create -R "$FOOTBAG_PRIVATE_REPO" --title "..."
--label <lane> --label bug --assignee <handle> --body "..."` (the finding's lane, plus other
markers as they apply). Claude runs it under the mutation policy above once the human has
agreed to the set: ask once, listing each issue's title, lane and proposed owner, rather than
one question per issue.
`BUGS.md` is the local scratch sink; a finding leaves it
when its issue is filed or its fix lands. When the tracker is not wired, skip drafting with
the one-line degradation note above.

## Mutations: prepared always, one ask per batch

Every mutation (`gh issue create/edit/close/comment/pin`, any `gh api` write) is first
prepared as an exact command. Claude never mutates the tracker unprompted or as a side
effect. Then:

- **Ask once, per batch.** One question covers the whole set of changes that carries out
  one decision: state plainly what each command will change, ask once, and run the lot
  once the human agrees. Never one question per issue, and never a second question for
  the same decision.
- **A directive is the agreement.** When the human says what to do to a card ("rewrite
  it", "close it", "reassign it", "revise it for that"), that is the sign-off for every
  command implementing it, including the accompanying comment and the follow-through on
  the cards it merges into or from. Prepare the commands, say what they do, and run them.
- **The batch is then settled.** Run every command in an agreed batch straight through:
  never pause between them for confirmation, never restate the remaining ones as a fresh
  question, and never read a permission prompt as a question to answer in prose.
- **Retitle, rewrite, reassign, relabel, comment, close and reopen never prompt at the
  tool layer.** They are allowed in the committed settings, scoped to the private tracker
  by an exact repo-flag prefix, which is why every mutating command writes the repo flag
  first: `gh issue edit -R "$FOOTBAG_PRIVATE_REPO" <number> …`. Put the flag anywhere else
  and the rule stops matching and the prompt returns.
- **Every new card names its owner, and the human confirms it.** A `gh issue create` without
  `--assignee` is not run: an unowned card is invisible to every per-person read and accrues
  silently against the milestone. The owner is never inferred and filed silently, not even
  when the lane makes it obvious. Put the proposed owner beside each card in the one batch
  ask that already covers the set, so a run of cards costs one question rather than one per
  card.
- **The floor that does not move.** No mutation without the human's decision behind it;
  no bulk mutation; no issue deletion (denied outright); no invented label or assignee;
  and a new card only on the human's explicit ask, which still prompts by design.

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
