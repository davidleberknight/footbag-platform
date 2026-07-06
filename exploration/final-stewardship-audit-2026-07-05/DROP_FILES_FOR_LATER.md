# Drop File — Handoff for a Future Session

You are a future Claude session picking up freestyle work with no memory of how V1 was
made. This file is your orientation. Read it before acting; it will save you from the
three most likely mistakes.

## The state of freestyle, in six sentences

The freestyle encyclopedia is **release-ready at Version 1** and operating in
**stewardship mode**: it passed an adversarial rendered-surface audit, its blockers
were fixed and re-verified, and the full test suite is green. The promotion arc is
**closed** — everything derivable from sources is promoted; what remains unpromoted is
blocked on doctrine questions with the rules expert (Red, Wave 3 packet sent, answers
pending). The source-reconciliation scholarship (FootbagMoves, PassBack, Stanford) is
**complete** — one genuine contradiction ever found, resolved (Bladerunner, canonical
4). The doctrine papers are drafted and committed, **deliberately unsent**. The one
sanctioned forward track is **Glossary V2** — a layered teaching system, designed and
piloted but not yet implemented. Nothing else freestyle-flavored is active unless the
maintainer pulls it from the IP's parked sections.

## Read these, in this order

1. `IMPLEMENTATION_PLAN.md` — the "State of freestyle (standing summary)" block, then
   the freestyle section. This is the only authoritative status surface.
2. `exploration/glossary-v2-architecture/` — ARCHITECTURE.md, then PILOT_REVIEW.md
   (its accepted changes amend the architecture), then DEPENDENCY_GRAPH.md, then
   PILOT_ENTRIES.md for the voice. If you are doing glossary work, this is your world.
3. `freestyle/doctrine/RED_QUEUE.md` — what is currently held on external answers.
   Never trust a hold list embedded in a skill or memory; this file is live truth.
4. `freestyle/doctrine/AUTHORITY.md` and `reconciliation/RECONCILIATION_SUMMARY.md` —
   who owns which datum, and how source disagreements are handled (record-don't-adopt).
5. This directory's other files — SKILLS_AND_RULES_AUDIT.md before trusting any
   freestyle skill; BUG_HUNT_REVIEW.md before running any hunt.

## Do NOT reopen (closed, decided, or deliberately parked)

- **Release readiness.** Audited three times; the standard for reopening is a true
  public embarrassment (contradiction, dead nav, rendered artifact, jargon leak,
  integrity break) — nothing less.
- **Bladerunner.** Canonical ADD 4, atomic(+1) + eggbeater(3); the outside 5 is
  recorded as non-authoritative. Settled with full provenance.
- **The reconciliation series.** Complete scholarship. Do not re-audit sources.
- **The promotion arc.** Closed. If you find yourself preparing red_additions rows
  without a scoped maintainer request, stop — you have been misled by a stale skill.
- **Records "ADD (recorded)" vs canonical ADD.** Two numbers, both correct, labeled
  and captioned. Not a contradiction. Sixteen tricks differ legitimately.
- **The doctrine holds.** Blurry predicate, down-family labeling, four operator
  definitions, cross-body rake, terraging, the rider list — Red's, not yours. Held
  state, not drift.
- **Quantum vs Miraging.** Open by design; both stay distinct until ruled.
- **The three "final" audits.** Do not commission a fourth without a trigger.

## Known traps (verified during the stewardship audit)

- **`freestyle-dictionary-surface` skill claims family pages don't exist. They do** —
  live, mounted, release-audited. Until the skill is rewritten, distrust its status
  claims (its contract *rules* are still good).
- **`footbag-freestyle-dictionary` skill contains ~250 lines of promotion-campaign
  marching orders.** The campaign is over. Take posture from the IP, never from that
  skill's status sections.
- **`freestyle-topology-governance` cites Wave 2 as in-flight.** It is not; Wave 3 is.
  RED_QUEUE.md is the only live hold list.
- The records loader is **additive** (INSERT OR IGNORE): record-row edits need a fresh
  DB build. And after any rebuild, the parser-population step must run or diagnostic
  panels render empty.

## If you are here to do glossary V2 work

The sequence is fixed: (1) fold PILOT_REVIEW's accepted changes into ARCHITECTURE.md +
create the single INSIGHT_REGISTRY.md; (2) author tranche 2 in Markdown (Dexterity,
Osis, miraging, whirling, stepping, paradox, blurry) in the pilot voice; (3) joint
read + maintainer sign-off; (4) only then code, and only as the strangler slice (one
section of the existing page, per-entry expanders, no depth toggle, no rewrite).
Reveals are rare (~6 per 15 entries); insights come only from the registry; operators
before compounds; notation late. The dependency graph is a private design tool — its
derivatives ship, it does not.

## Standing constraints (they will bite you)

- Never run git add/commit/push/pull — write a `commit.sh` handoff; the human commits.
- `.claude/` and canonical docs are approval-gated; propose, never apply unprompted.
- Public freestyle prose: no pt-codes, no "Red" as a person (glossary thanks-roll and
  Job's article are the sanctioned exceptions), outside-source names generalize to "an
  outside source" except on sanctioned surfaces.
- Doc-only changes verify by re-reading; code changes verify by `npm test` +
  `npm run build`; public-surface claims verify against **rendered HTML**, not
  templates.
- Asking the human is the last resort; when you must, one decision per message, plain
  English, one recommendation.

## The one-sentence posture

Freestyle is a finished first edition being stewarded, with one authorized building
site (Glossary V2) whose plans are drawn; act like a caretaker with a single
construction permit, not like the crew that built the house.
