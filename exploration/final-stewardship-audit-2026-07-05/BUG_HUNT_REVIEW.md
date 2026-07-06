# Bug-Hunt Review — How the Hunt Should Behave After V1

Assessment of `bug-hunt` (499 lines + reference sidecars) and `freestyle-bug-hunt`
(202 + 263 reference) for the post-release era.

## Verdict

**Both skills are in excellent shape — the cleanest part of the instruction layer.**
Zero dated content, explicit non-goals, explicit severity rubric, explicit "not-yet-
built is a status fact, never a finding," and freestyle-bug-hunt's "never judge
doctrine" and "respect recorded freeze holds" rules. Keep both as-is, with **two small
calibrations** the V1 release created and the skills predate, and **one posture note**
about the stopping rule.

## What already works

- **Blockers vs polish: yes.** The severity rubric is explicit and the anti-patterns
  section excludes exactly the right things (style preferences, "could be friendlier,"
  anything that stops mattering after go-live).
- **Infinite polish: structurally prevented, with a caveat.** The stopping condition is
  *exhaustion* — coverage ledger complete, two dry passes, completeness-critic empty.
  That bounds a single hunt honestly. What it does not bound is *how often hunts are
  commissioned* — that is a James policy, not a skill defect (see the stop-criterion
  hard question). The skill should not be edited to "stop early"; the maintainer should
  simply stop ordering hunts absent a trigger.
- **Doctrine and data: handled.** Generic bug-hunt defers freestyle domain judgment to
  freestyle-bug-hunt; freestyle-bug-hunt never judges doctrine and re-derives tracked-
  work exclusions fresh every run ("never trust a remembered list" — exactly right).

## Gap 1 — two missing calibrations (real risk of bogus future findings)

The V1 release deliberately shipped two surfaces where *two different numbers about the
same trick are both correct*, and neither bug-hunt skill knows it:

1. **Records "ADD (recorded)".** The records column is the difficulty the recording
   source assigned at log time, relabeled and captioned as such; the canonical ADD on
   the trick page is authoritative. Sixteen tricks legitimately show different values
   on the two surfaces. freestyle-bug-hunt's reference explicitly lists "the same trick
   shows different ADDs on two surfaces" as a propagation-drift signal — a literal run
   WILL re-flag this as a bug.
2. **Divergence registries and scoring notes.** Registry entries, provenance
   divergences, and the reconciliation series record outside sources' conflicting
   numbers *on purpose* (record-don't-adopt). Bladerunner's documented outside-5 vs
   canonical-4 is scholarship, not drift.

**Proposed addition** (one short block in `freestyle-bug-hunt/REFERENCE.md`, human-
approved since it's `.claude/`-gated):

> Two numbers, both correct — not findings: (a) a record row's "ADD (recorded)" is the
> source's claim at log time and may differ from the trick's canonical ADD; the caption
> on the records surfaces explains this — flag only a *missing caption/label*, never
> the difference itself. (b) A divergence-registry entry, scoring note, or
> reconciliation document records an outside source's conflicting value deliberately
> (record-don't-adopt); flag only an *undocumented* divergence, never a documented one.

## Gap 2 — rendered-page verification is not required

Both skills are static-analysis-first by design (code/template/DB tracing; no browser).
The V1 release audit demonstrated why that's insufficient *for public-surface claims*:
its four blockers (wrong glossary table cells, the dead `/members` links, the records
self-contradiction, the pt-code leaks) were all found by **curling rendered HTML**, and
at least one stale-skill claim this audit caught ("family pages don't exist") would
never self-correct through static tracing alone.

**Proposed addition** (one sentence in bug-hunt's verification standard): a finding
that asserts what a *visitor sees* (wrong rendered value, dead link, leaked jargon,
contradiction between two pages) is CONFIRMED only against rendered output (curl the
running app), never against templates alone. Static tracing locates; rendering
confirms.

This is a verification-bar addition, not a method change — the hunt stays static-first;
only public-surface *confirmation* requires the render.

## What counts as a real blocker after V1 (the calibration for future hunts)

Adopt the release audit's proven standard as the permanent bar. A finding blocks only
if it is one of:

1. **A public contradiction** — two rendered surfaces (or one surface with itself)
   disagreeing on a fact, unlabeled.
2. **Dead navigation** — a 404/broken affordance on a visitor path.
3. **A rendered artifact** — null/undefined/placeholder/unresolved template text a
   visitor sees.
4. **An internal leak** — ruling codes, tooling names, non-sanctioned source names in
   public prose.
5. **A data-integrity break** — bracket-count ≠ ADD, an active row violating a hard QC
   invariant.

Everything else — style, wording taste, "could be richer," missing nice-to-have
content, honestly-labeled gaps — parks in the Post-V1 backlog at most. And the standing
exclusions bear repeating because they are where bogus reports will come from:
**not-yet-built is a status fact; a held doctrine question is a held state; parked
backlog items are parked; documented divergences are documented.**

## What should be ignored or parked on sight

- The 59 em-dash prose rows, the diagnostic-panel machine codes, the one all-caps event
  title — all classified ACCEPTABLE FOR V1 by the release audit; re-reporting them is
  noise.
- Anything in the Post-V1 backlog or vision sections of the IP.
- Anything blocked in RED_QUEUE.md.
- Any "the glossary should teach more" observation — that is the V1.1 program, not a
  bug.

## Summary of asks

1. Add the two-numbers calibration block to freestyle-bug-hunt's reference (small,
   gated, high value — prevents the most predictable future false positive).
2. Add the rendered-confirmation sentence to bug-hunt's verification standard.
3. No other edits. Do not touch the stopping rule; govern hunt *frequency* by
   maintainer policy instead.
