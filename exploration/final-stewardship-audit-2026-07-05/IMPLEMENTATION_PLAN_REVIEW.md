# IMPLEMENTATION_PLAN.md — Truth Review

Is the plan of record telling the truth about freestyle after the V1 planning pass?

## Verdict

**Yes — the IP is the healthiest instruction surface in the project right now.** It was
restructured this week and it says the true things plainly: freestyle is release-ready;
four active items remain, each blocking something real; everything else is explicitly
parked (Post-V1 backlog) or explicitly aspirational (Post-V1 vision); the doctrine
remainder is isolated under a "blocked on external answers" heading that a future
session cannot mistake for a to-do list. The State of Freestyle standing summary is
exactly the artifact a context-free session needs first.

What follows are the residual inaccuracies — all small — and the proposed edits.

## Accurate (verified, leave alone)

- **"Release-ready" is stated and true.** The adversarial audit, its fixes, and the
  re-verification are faithfully summarized.
- **The four active items are truly active.** User stories (gates the go-live QC
  board via the deployed-surface rule); exploration/ disposition (a cutover decision);
  the two [BLOCKED] doctrine items (genuinely waiting on Red and the curator).
- **Parked is parked.** The backlog section's framing line ("nothing here blocks the
  Version 1 freeze"; items activate by being pulled back) is the right guard against a
  future session treating parked work as unfinished work.
- **Doctrine framing is right.** Packet sent / papers drafted-and-deliberately-unsent /
  unresolved questions isolated — matches reality.
- **Source reconciliation** is correctly described as complete scholarship, not open
  work.

## Stale or missing (proposed edits, all minor)

1. **Dave's "Freestyle hashtag conventions and dictionary UX" section opener** says
   "These pair with James's freestyle implementation items below" — the paired items
   moved to the Post-V1 backlog, so "below" now points at nothing in the active lane.
   One-line fix: "These pair with the PassBack difficulty-tag deviation in James's
   freestyle section."
2. **The Post-V1 vision's glossary theme predates the design work that now exists.**
   Vision theme A describes the collapsible glossary as a direction; four design
   documents, fifteen pilot entries, and a dependency graph now exist at
   `exploration/glossary-v2-architecture/`. When the first V1.1 kanban card is cut, the
   vision entry should gain one sentence pointing at that directory as the design home
   (not before — the IP shouldn't track exploration work-in-progress).
3. **The skills cross-track pickup in Dave's lane** ("Tidy and relocate the freestyle
   skills... Do this after James audits the content") is now unblocked: this
   stewardship audit IS the James-side content audit it was waiting on
   (SKILLS_AND_RULES_AUDIT.md in this directory carries the per-skill verdicts). One-
   line edit when convenient: point the item at the audit as its input.
4. **Nothing in the IP marks freestyle's operating mode.** The State of Freestyle says
   "release-ready"; it does not say "stewardship — do not start unscoped freestyle
   build work." A future session reading only the IP could still interpret the vision
   section as an invitation. Proposed one-sentence addition to the State block:
   "Operating mode: stewardship. New freestyle build work starts only as a scoped item
   pulled from the backlog or vision sections by the maintainer." This is the cheapest
   protection against the biggest future failure mode.

## Active vs parked vs future — the classification audit

| Bucket | Contents | Correct? |
|---|---|---|
| Active (4) | user stories; exploration/ disposition; 2 doctrine-blocked | Yes — each blocks go-live, cutover, or is externally gated |
| Parked backlog (7) | set pages, sole-survivor video, BAP tagging, tips remainder, 4 technique-notes tricks, 2 hygiene sweeps | Yes — none blocks anything; each has full context to reactivate |
| Vision (6 themes) | glossary layering, bases, algebra, frontier, history, navigation | Yes — explicitly "not implementation tasks" |
| Deviations (2) | count-token rendering; PassBack compound tags | Yes — drift records with unblock conditions, correctly not tasks |
| Deferred/parked (global) | incl. Quantum-vs-Miraging doctrine isolation | Yes |

No item is in the wrong bucket. The one structural gap is #4 above (no explicit
operating-mode sentence).

## What should be deleted

Nothing. The planning pass already deleted what deserved deletion; the plan is lean
(four active freestyle items, down from ~14). Deleting the vision or backlog sections
would lose reactivation context for no benefit.

## Summary of proposed edits (all need James's approval; none urgent)

1. One-line pointer fix in Dave's hashtag-conventions opener.
2. One-line design-home pointer in vision theme A — deferred until the first V1.1 card.
3. One-line unblock note on Dave's skills cross-track item, citing this audit.
4. One-sentence "Operating mode: stewardship" addition to the State of Freestyle block
   — the only edit with real protective value; do this one.
