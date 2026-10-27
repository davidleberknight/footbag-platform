---
name: triage-bugs
disable-model-invocation: true
description: Maintainer-only. Triage the bug reports developers and testers file in the private dev-tester repository, one at a time, oldest first, each settled on the spot - fixed now, carded into the private tracker, closed as not-a-bug or duplicate, or, the one exception, sent back to the reporter with specific questions. Invoke only when the human explicitly asks to triage bug reports.
---

# Triage bug reports

Developers and testers file bug reports in the private dev-tester repository, through its GitHub
form or the `file-bug` skill. The maintainer triages them with Claude doing the reading,
reproducing and drafting.

**One touch.** A bug report taken off the list is dealt with completely, then and there: it is
fixed now, turned into a tracker card, or dismissed, and each of those closes it. The one
exception is a report that cannot be reproduced or judged from what it says. That one goes back
to its reporter with specific questions, labelled `needs-info`, and leaves the list until they
answer. Their answer puts it back on the list, where it is triaged again like any other report.
Questions with no answer for 14 days close it.

## Wiring and polite degradation

Three pieces:

- `FOOTBAG_DEVTESTER_REPO` env var, set for every checkout by the committed `.claude/settings.json`.
  Required for every `gh` call; check it is non-empty first. Empty means the session started
  before the setting existed: a restart of Claude Code loads it.
- `footbag_dev_tester_repo/` gitignored repo-root symlink to the repository's clone, made by
  `scripts/setup-dev-workstation.sh`. Needed only for reading the repository's README, whose "What
  happens after you report" is what testers are told: the labels and comments below keep to it,
  and a difference is reported rather than acted on. Triage only reads it; Claude edits the
  clone's files only when the maintainer asks, and every commit and push there is the
  maintainer's.
- The private tracker's wiring, per the `tracker-ops` skill, for carding.

When a piece is absent, say exactly one line naming the wiring step. Without the variable there is
nothing to triage, so stop. Without the link, triage carries on from this skill alone. Without the
tracker's wiring, a report that should be carded waits until the card exists: stop there and say
so rather than close it.

## Reading (approval-free)

- Every open report, bug or idea, oldest first:
  `gh issue list -R "$FOOTBAG_DEVTESTER_REPO" --state open --limit 200 --json number,title,labels,createdAt`
- One bug report whole, body and every comment in order:
  `gh issue view <n> -R "$FOOTBAG_DEVTESTER_REPO" --json number,title,state,labels,author,body,comments`

## The list

The list is every open report, bug or idea, except those waiting on their reporter. Build it at the start
of each run:

- An open report without `needs-info` is on the list.
- An open `needs-info` report whose reporter has commented after the questions is answered: remove
  the label (`gh issue edit -R "$FOOTBAG_DEVTESTER_REPO" <n> --remove-label needs-info`) and it is
  on the list, triaged afresh with the answer as part of the report.
- An open `needs-info` report with no answer and questions 14 days old or more closes now, as not
  planned, with a comment that answering and reopening it, or filing a new report with the
  `file-bug` skill, brings it back.
- Any other `needs-info` report is waiting, and is left alone.

## The loop

Take the oldest bug report on the list. Carry it all the way through these steps before looking
at the next. Then take the next, until the list is empty or the human stops.

1. **Read it whole**, every comment included: a reporter's later comment often corrects the
   first.
2. **Secrets first.** If it carries a password, key, token or other secret, the first action
   proposed is an edit removing it (`gh issue edit -R "$FOOTBAG_DEVTESTER_REPO" <n> --body-file
   <file>`), and the human is told the secret needs replacing. A secret in a comment, which Claude
   cannot edit, goes to the human to remove in GitHub, with the same warning: GitHub keeps earlier
   versions of an edited report or comment, so removing it does not retire it. Member names and
   details may stay: the repository is private.
3. **Check for a duplicate** among open and closed bug reports and open tracker cards.
4. **Reproduce it** by following the steps exactly: on the local dev stack (`./run_dev.sh`,
   persona switching, lightweight Playwright driving), or on staging read-only. Never deploy to
   staging or reset its data to reproduce a report. Record what was done and what happened.
5. **Judge it against the design**, not the code: the governing user story or design decision
   says whether the behaviour is wrong (the pre-design gate in root `CLAUDE.md`). Name the passage.
6. **Propose exactly one outcome**, with its label, the exact comment, and the fix or the card:

   | Outcome | When | Label |
   |---|---|---|
   | fixed | reproduced, wrong against the design, and small enough to fix now | `fixed` |
   | carded | reproduced and wrong, but work to plan | `carded` |
   | not-a-bug | works as the design says | `not-a-bug` |
   | duplicate | already reported, or already on a card | `duplicate` |
   | needs-info | it cannot be reproduced or judged from what the report says | `needs-info` |

   An idea takes the same outcomes: fixed when the change is small enough to make now, carded when
   it needs planning, not-a-bug when it is declined (the comment says why, from the governing story
   or decision), duplicate when already suggested or planned, needs-info when it is unclear. An idea
   is not reproduced; it is read against the page it names.

   Comments, in plain words a tester understands:
   - fixed: what was wrong, that it is fixed in the code, and that the fix reaches the site with the next deploy.
   - carded: that it is real and now tracked by the maintainers. No card number: testers cannot
     see the tracker.
   - not-a-bug: why it works as intended, from the governing story or decision.
   - duplicate: the earlier bug report's number, or that it is already being worked on.
   - needs-info: exactly what was tried and what happened, then each question, numbered and
     specific ("which button did you press, by the words on it?", never "more details please"),
     and how to answer: reply on this report, or ask Claude Code to answer it with the `file-bug`
     skill. GitHub notifies the reporter of the comment.
7. **Ask once**, for this one bug report, then carry the outcome out without pausing:
   - **fixed:** load the matching skill and rules, make the fix with the regression test the
     testing rule requires, run the targeted verification, then label, comment and close. The fix
     stays in the working tree for the human to commit.
   - **carded:** file the tracker card per `tracker-ops` "Drafting" and "Mutations" (its body carries the reproduction and
     cites the bug report's URL; filing it prompts), then label, comment and close.
   - **not-a-bug, duplicate:** label, comment and close.
   - **needs-info:** label and comment; it stays open, off the list until answered.

   ```bash
   gh issue edit -R "$FOOTBAG_DEVTESTER_REPO" <n> --add-label <label>
   gh issue comment -R "$FOOTBAG_DEVTESTER_REPO" <n> --body-file <file>
   gh issue close -R "$FOOTBAG_DEVTESTER_REPO" <n> --reason "<completed|not planned>"
   ```

   `completed` for fixed and carded; `not planned` for not-a-bug and duplicate.

If the human changes the outcome, carry out theirs. If a bug report cannot be settled now, say so
and stop the run there rather than skipping it: the list is worked in order, and a skipped report
is the one that rots.

Never delete or transfer a bug report, create or change labels, or edit the triage board: closing
a report moves it to Done there by itself.

## Stop when

The list is empty, with only reports waiting on their reporters left open, or the human stops.
Report one line per bug report: its number, the outcome, and the card or fix.
