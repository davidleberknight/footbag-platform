---
name: tracker-ops
description: Read, file, triage, update or draft issues in the maintainers' private tracker, and draft files in or consult the docs of the private operations checkout (footbag_private_repo). Use when checking whether work is in scope or already tracked, or for any tracker card work; degrades to a one-line note when the tracker is not wired on this machine.
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

- Use these `gh` read forms by default; they never prompt:
  - Compact one-line-per-issue listing, the same shape the viewer prints:
    `gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open --limit 200 --json number,title,labels
    --jq '.[] | "#\(.number)  [\([.labels[].name]|join(","))]  \(.title)"'`
    (append `| grep <label>` to narrow to a lane; the unblocked-doctrine view is
    `| grep doctrine | grep -v blocked`).
  - Active work: `gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open`
    (add `--label <lane>`, `--assignee <handle>`, `--milestone <name>` to narrow).
  - Detail, the whole card in one read (body and every comment, in order):
    `gh issue view <n> -R "$FOOTBAG_PRIVATE_REPO" --json number,title,state,labels,assignees,body,comments
    --jq '"#\(.number) [\(.state)] \(.title)\nLabels: \([.labels[].name]|join(", "))  Assignees:
    \([.assignees[].login]|join(", "))\n\n\(.body)\n" + ([.comments[] | "\n--- comment
    \(.author.login) \(.createdAt)\n\(.body)"] | join(""))'`.
    Never the plain form or `--comments` alone: outside a terminal the first omits the comments
    and the second omits the body.
  - "Is this tracked / in scope?": search titles and bodies with
    `gh search issues --repo "$FOOTBAG_PRIVATE_REPO" "<terms>"` or list open issues and match.
    An open issue covering the work is the scope record; its absence for significant new work is
    a question for the human, not a blocker to invent around. Before filing a "gap", classify it per
    `.claude/skills/deployed-surface/SKILL.md`; a not-yet-built status is never an issue.
- **"What's assigned to <person>":** translate the name to a GitHub handle via the assignee
  roster in the private `TRACKER_GUIDE.md` (its single home), then
  `gh issue list -R "$FOOTBAG_PRIVATE_REPO" --assignee <handle>`. Degradation: symlink absent (no roster to read) -> derive handles live
  from `gh issue list -R "$FOOTBAG_PRIVATE_REPO" --json assignees`; fully unwired -> ask the
  human for the handle. Never hard-code a handle in this file.
- Non-mutating `gh api` GETs are fine.
- **Reading and working a card.** Read the card itself, body and every comment, before stating,
  relying on or acting on anything it says; a handover, plan, evidence file, doc, subagent report,
  or the body alone is a lead to check, not the card, and a subagent that relies on a card is
  briefed to read it the same way. The comments are the body's change log, read in order: one that
  supersedes, rewrites, corrects or rules on something overrides what it names, and a later "body
  corrected" or "rewritten" comment puts the body back on top. Report the merged current state and
  name any conflict the card leaves unresolved rather than picking a side; a card rewrite folds the
  live comment content into the body. A card is never design intent: before planning, asking, or
  repeating its claims (its `Settled from the sources` lines, its descriptions of code and
  mechanisms, the consequences it draws from a ruling), list the load-bearing ones, your own
  included, and check each in the same turn: a design claim against its governing passage (the
  `design-intent` skill, read now), a code claim against the current code, an outside fact against
  live documentation. Report each as checked or as a discrepancy; one a passage contradicts goes to
  the human under the asking rule's disagreement exception, with the answer the intent supports.
  This governs the card itself, not a summary of it in the walk file.

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
  it>`. Unwired (no env var and no symlink): fall back to the labels the human names,
  and note the wiring gap in one line.
- Files drafted into `footbag_private_repo/` are working drafts: a human reviews,
  commits, and pushes them.
- **Companion-doc sync (hard rule).** Nothing drafted into the private checkout — a
  dataset, artifact directory, script, or document — is finished until the repo's
  primary docs account for it in the same pass: the `README.md` "What lives where"
  map; `DATA_INVENTORY.md` (the placement-homes list, plus a dataset row for anything
  private, sensitive, or archival); the applicable governance doc when the material is
  governance-scoped; and a roadmap home (`GO_LIVE_PLAN.md`, `POST_GO_LIVE_PLAN.md`, or
  `V2_SCOPE.md`) when it changes or defers planned work. Check for those mentions
  before declaring the drafting done, and draft any missing ones yourself. An
  undocumented stash in an access-controlled repo is invisible data — the failure
  mode this rule exists to prevent.

## Mutations: prepared always, one ask per batch

Every mutation (`gh issue create/edit/close/comment/pin`, any `gh api` write) is first
prepared as an exact command. Claude never mutates the tracker unprompted or as a side
effect. Then:

- **Ask once per batch, then run the whole batch.** One question covers every command
  carrying out one decision: state plainly what each will change, ask once, and run the
  lot. A directive from the human ("rewrite it", "close it", "reassign it") is itself the
  sign-off for every command implementing it, including the accompanying comment and the
  follow-through on cards it merges into or from. Never one question per issue, never a
  second question for the same decision, never a pause between the commands of an agreed
  batch, and never treat a permission prompt as a question to answer in prose.
- **A card the human picked to work is the decision for its comments and body edits.** In the
  private issue review, the pick authorizes Claude to comment on that card and edit its body
  without an ask; Claude shows each written text, a body edit as BEFORE and AFTER, in the same
  message. Any other card, a new card, a close the human has not ruled, and everything the
  floor below forbids still take the ask.
- **Write the repo flag first** in every mutating command
  (`gh issue edit -R "$FOOTBAG_PRIVATE_REPO" <number> …`): the committed allow rules for
  tracker issue writes match only that prefix, so the flag anywhere else prompts.
- **Post a comment or body from a file.** Write the text to the session scratchpad and pass it
  with `--body-file`, never inline after `--body`: auto mode's safety check can refuse a long
  inline body even though the repo-flag rule allows the command, and a file keeps the posted
  text exactly the text the human approved.
- **Every new card names its owner: the maintainer, unless he names someone else for that
  card.** A `gh issue create` without `--assignee` is not run: an unowned card is invisible to
  every per-person read and accrues silently against the milestone. A card whose next action
  is someone else's still goes to the maintainer, naming that person on its `Blocked on:` line.
- **Someone else's work is taken over one slice at a time.** Each slice is offered on its own
  and moved onto the maintainer only on his approval of that slice; nothing on a card, in a
  priorities file or in a plan records a slice as his before then.
- **The floor that does not move.** No mutation without the human's decision behind it;
  no bulk mutation; no issue deletion (denied outright); no invented label or assignee;
  and a new card only on the human's explicit ask, which still prompts by design.

Git writes in the private checkout stay human-run (`private-repo.md`).

## Hidden-reference rule (hard)

Committed public text and public commit messages never carry the private repository's
slug, owner, name, or issue numbers: prose says "the maintainers' private tracker";
commands say `-R "$FOOTBAG_PRIVATE_REPO"`; fixtures use synthetic slugs. Linking is
one-way (`private-repo.md`); code comments follow `comments.md`. A card closes when its
work is verified, never waiting on a commit.

## Private ops docs

Reached through the `footbag_private_repo/` symlink, all private: `AWS_OPERATIONS.md` (concrete
AWS facts), `DEVOPS_GUIDE.md` (private runbooks), `VAULT_GOVERNANCE.md` (custody rulings),
`VAULT_README_V<n>.md` (the vault's entry map and schema, no secret value; the highest n in the
checkout is current), and `GO_LIVE_PLAN.md` (gate rows). Citing and naming them follows
`.claude/rules/private-repo.md`.

## Questions

Questions for the human follow `.claude/rules/asking.md`; never restate it here.
