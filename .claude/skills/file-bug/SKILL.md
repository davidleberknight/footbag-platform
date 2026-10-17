---
name: file-bug
description: Use when a developer or tester wants to report a bug, an error, or confusing wording they saw in the footbag.org app, including a bare "file a bug", or wants to answer a maintainer's questions on a bug report of theirs. Questions the tester one question at a time until the report or answer holds everything the maintainer needs to reproduce it, removes any secret, shows it, and posts it to the private dev-tester repository only after the tester approves. Never fixes the bug and never triages it.
---

# File a bug report

A dev-and-tester files bug reports in the private dev-tester repository. The GitHub form is one
way in; this skill is the better one. The maintainer triages each report once, on the spot, and
a report that cannot be reproduced from what it says goes back to its reporter with questions and
waits. So this skill does not file until the report is complete: its job is to get every fact the
maintainer will need out of the tester now, while they still remember it.

## Wiring and polite degradation

Two pieces, the same on every machine (a contributor not invited to the repository has neither
working, and is a supported configuration):

- `FOOTBAG_DEVTESTER_REPO` env var, set for every checkout by the committed `.claude/settings.json`.
  Required for any `gh` call; check it is non-empty first. Empty means the session started before
  the setting existed: a restart of Claude Code loads it.
- `footbag_dev_tester_repo/` gitignored repo-root symlink to the repository's clone, made by
  `scripts/setup-dev-workstation.sh` once the invitation is accepted. Needed only for reading the
  repository's own files, which this skill follows rather than restates where they differ:
  `footbag_dev_tester_repo/README.md` (the single home for how to report a bug, including "What a
  complete report holds" and "No secrets") and its bug form, `bug.yml` among the clone's GitHub
  issue forms (its headings and their order; `idea.yml` for an idea). This skill only reads them; Claude edits the clone's files only when the maintainer asks, and every commit and push there is the maintainer's. The clone can
  lag GitHub; a difference that matters is reported, not guessed around.

When a piece is absent, say exactly one line naming the wiring step, skip the part that needs it,
and carry on: without the link, use the list and headings below; without the variable, or without
an accepted invitation, still run the questions and hand the tester the finished draft to paste
into the repository's GitHub form or send to the maintainer.

## What a complete report holds

This mirrors the list of the same name in the repository's README; where they differ, the README
wins and the difference is reported. Every item is required. "Not sure" is accepted only after
one follow-up has tried to get the answer, and the report then says what was tried.

1. **What went wrong**, and the exact words of any message on the screen, copied, not
   paraphrased.
2. **What they expected instead.** A page that works but shows the wrong thing is only a bug
   against what it should have shown.
3. **Which site:** their own computer, or the shared test site.
4. **Which page:** the web address, or the path after the site name, starting with `/`.
5. **Who they were signed in as:** a test persona's display name, a real member's record id, or
   not signed in.
6. **The steps**, starting from a page anyone can reach, one action per line: which link or
   button by its words, which box, and the exact made-up value typed. A step like "filled in the
   form" is not a step.
7. **Any record involved:** the id of the member, club, event or other record the steps touched.
8. **Whether it happens again:** they repeat the steps once now, unless that would change real
   data, and say every time, sometimes, or once only.
9. **When:** date, time and time zone. On the test site this is how the matching log lines are
   found.
10. **Browser and device.**

On their own computer, Claude also reads, without asking: the commit (`git rev-parse --short
HEAD`), whether the working tree has uncommitted changes, and the matching line from the dev
server's output when there is one.

## Procedure

1. **Let them tell it first**, in their own words. Do not start fixing, and do not argue whether
   it is a bug: that is triage.
2. **Fill in what Claude can already see** from the conversation and the machine, so the tester
   is never asked for something Claude can read.
3. **Ask for each missing item, one question per message**, in the order above. Never send a
   list of questions. A vague answer gets one specific follow-up ("which button, by the words on
   it?") before it is taken as given. Help the tester find an answer they do not know how to get:
   where the address bar is, how to read the persona's name, how to see the browser's version.
4. **Read the steps back** as a numbered list and ask the tester to confirm that following them
   exactly would show the problem. Fix the list until they say yes.
5. **Check completeness** against the ten items. Anything still missing goes back to step 3.
6. **Draft the report** with the bug form's headings, in its order, read from the linked form's
   `label:` lines, so a report filed here reads the same as one filed through the form. Without
   the link, these are the headings:

   ```
   Title: Bug: <page or feature>: <what goes wrong>

   ### What went wrong?
   ### What did you expect to happen instead?
   ### Which site were you using?
   ### Which page?
   ### Who were you signed in as?
   ### How can someone make it happen again?
   ### Does it happen again if you repeat those steps?
   ### How much did it get in your way?
   ### When did it happen?
   ### Browser and device
   ### Screenshots or anything else
   ```

   The record ids go in the steps; the commit, the dirty-tree flag and any server output line go
   under "Screenshots or anything else". A report that is an idea or unclear wording, not
   something broken, is titled `Idea: ...` and needs only what would change, where, and as whom.
7. **Remove secrets before showing.** The repository and the team Discord are private, so member
   names and details may stay where they help reproduce the problem. Remove any password, key,
   token or other secret, including inside a pasted log line, and say so if anything was removed.
   Screenshots cannot be attached from here; tell the tester to add any on GitHub after filing.
8. **Show the full draft** and ask once whether to file it.
9. **File it** on a yes, writing the body to a scratchpad file first:

   ```bash
   gh issue create -R "$FOOTBAG_DEVTESTER_REPO" --label bug \
     --title "Bug: <page or feature>: <what goes wrong>" --body-file <scratchpad file>
   ```

   An idea uses `--label enhancement`. The create always prompts; that prompt is the tester's
   last look, never something to route around. Give them the issue URL it prints.

## Answering a maintainer's questions

When triage cannot reproduce a report, the maintainer labels it `needs-info` and comments with
numbered questions; the report waits, open, until its reporter answers. When a tester asks to
answer them, or asks what is waiting on them:

1. List their open reports carrying `needs-info`:
   `gh issue list -R "$FOOTBAG_DEVTESTER_REPO" --state open --label needs-info --author @me --json number,title,url`
2. Read the chosen report whole, with every comment
   (`gh issue view <n> -R "$FOOTBAG_DEVTESTER_REPO" --json number,title,body,comments`), and take
   the questions from the maintainer's latest comment.
3. Ask them one at a time, with the same follow-up and help as above, and for any steps, read
   them back for confirmation.
4. Draft one comment answering each question by its number, remove any secret as above, show it, and on a
   yes post it:
   `gh issue comment -R "$FOOTBAG_DEVTESTER_REPO" <n> --body-file <scratchpad file>`
5. Tell the tester that their answer puts the report back in front of the maintainer, and that
   nothing else is needed from them. If the report was closed for want of an answer, they reopen
   it after commenting (`gh issue reopen -R "$FOOTBAG_DEVTESTER_REPO" <n>`, once they agree).

## Stop when

The report or the answer is posted and its URL given, or the tester declined. Never edit, label
or close a report, and never comment except to answer its questions: everything else belongs to
the `triage-bugs` skill.
