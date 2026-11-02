---
name: legacy-delivery
description: Process a legacy footbag.org database delivery from the legacy webmaster's repository end to end (refresh, publish, re-audit, re-fit, member-load rehearsal with the final-load gate), settling every finding from the sources and asking the maintainer only genuine person or club judgements. Use when a new delivery is pulled, and at the cutover final refresh. Not for the mirror or freestyle pipelines.
disable-model-invocation: true
---

# Legacy delivery

The authority order is root `CLAUDE.md`; questions follow `.claude/rules/asking.md`.
Two inputs, never mixed: the legacy database dump (this skill) and the mirror (the
historical pipeline). They meet only where member accounts link to people.

## Run

1. Confirm the maintainer has pulled the delivery, then run
   `bash legacy_data/scripts/run_legacy_delivery.sh --cutover-date YYYY-MM-DD`
   in the background, logging to the scratchpad (the freeze date at cutover; the
   last publish's date in a rehearsal). It refreshes twice, publishes, runs the
   pre-build audit and the member-load rehearsal with the final-load gate, re-fits
   the rulings, and prints what is left.
2. Settle each finding below, record it in its durable home, and re-run until it
   prints nothing left. Then the staging deploy, then the tracker comments.

## Settle from the sources, never ask

- Curated data outranks the dump: check the identity-lock files, the person-alias
  overrides, the held-decisions ledger and the existing rulings first.
- Removed tables or rows: footbag-ops history keeps them; report, and draft a
  question for the webmaster.
- A keep entry whose account now arrives in the delivery: remove it.
- A figure a delivery moved for a stated reason: re-audit it with that reason.
- Rulings marked restamp only: `refit_rulings.py --apply`.
- Shared-email new accounts and refresh flags with no downstream effect: report.
- A membership-only person whose only matching account carries the same first and
  last name plus a middle name or initial, with standing matching the roster: the
  same person. No valid account bearing the name at all: no account.

## Cautions

- A duplicate-account ruling is written with
  `propose_person_dispositions.py --stage-a-rulings`, never by hand, and
  `reconcile_legacy_members.py --dry-run-merge` must show every row applied.
- A duplicate competition-record merge is an identity-lock `patch_pt_*` patch,
  then `--soup-to-nuts` regenerates the committed results; the git diff must show
  the events file unchanged and only the intended people changed. The identity-lock
  folder is read-only: lift the protection for that run only, with the
  maintainer's go, and restore it.
- Stop the dev stack before any rebuild: `./run_dev.sh` seeds test personas at
  every launch, and a launch during a rebuild makes the results load refuse.
- A figure moved by a ruling made in the same session is re-audited with that
  reason.
- Ask only about people or clubs the facts cannot settle; never about mechanical
  consequences.

## Ask the maintainer

Only what a person with the facts would decide: two accounts that may or may not be
one human, a person who may or may not own an account, a club that would be lost.
One per message, naming the people or club, the evidence from each record, and a
recommended ruling. Never bare ids.

## Durable homes

Rulings: `private_data/stage_a_overrides/*.csv`. Figures:
`legacy-publish/audit/audited_figures.json`. Verified account links:
`legacy_data/inputs/identity_lock/member_id_supplement.csv`. Nothing settled lives
only under the git-ignored `out/`. Git writes are the maintainer's.

## Stop when

The rehearsal passes every member-data audit with nobody awaiting a decision, the
staging deploy passes, and the webmaster questions are drafted for the coordinator.
