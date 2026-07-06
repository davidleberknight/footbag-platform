# Bug-Hunt Calibration Patch

Ready-to-insert text for the two bug-hunt skills, so a future hunt does not re-report the
things the V1 release deliberately shipped. Drafts for the maintainers — `.claude/` is
approval-gated; do not apply unprompted. The bug-hunt skills are otherwise excellent
(explicit non-goals, explicit stop condition, "not-yet-built is a status fact never a
finding"); these are the only gaps, and all four stem from the same source: the release
made two-numbers-both-correct and documented-divergence into first-class design, and the
skills predate it.

---

## Calibration 1 — "ADD (recorded)" is a source claim, not a contradiction

**Where:** `freestyle-bug-hunt/REFERENCE.md`, in the ADD-propagation signal section
(the "same trick shows different ADDs on two surfaces" heuristic, which will otherwise
fire on this by design).

**Insert:**

> **Not a finding: a record's "ADD (recorded)" differing from the trick's canonical
> ADD.** The records surfaces (a trick's Consecutive Records table and `/freestyle/records`)
> show "ADD (recorded)" — the difficulty the recording source assigned when the record was
> logged, which is historical evidence and may differ from the trick's current canonical
> ADD. This is deliberate and captioned. Sixteen tricks legitimately differ (e.g.
> Bladerunner: canonical 4, recorded 5). **Flag only a *missing or misleading caption/
> label* on those surfaces, never the numeric difference itself.** The canonical ADD on
> the trick page is authoritative; the recorded value is a labeled source claim.

---

## Calibration 2 — documented source divergence is scholarship, not drift

**Where:** `freestyle-bug-hunt/REFERENCE.md`, alongside Calibration 1.

**Insert:**

> **Not a finding: a documented outside-source divergence.** Divergence-registry entries,
> per-trick scoring notes, in-row provenance strings, and the reconciliation series
> (`freestyle/doctrine/reconciliation/`) record outside sources' conflicting numbers *on
> purpose* — the "record, don't adopt" policy. An outside source listing a different ADD,
> shown as that source's divergent claim, is scholarship, not a contradiction (Bladerunner's
> documented outside-5 vs canonical-4 is the worked example). **Flag only an *undocumented*
> divergence — a second value that appears with no provenance, registry entry, or note
> explaining it.** A documented one is the system working as designed.

---

## Calibration 3 — public-surface findings require rendered-page confirmation

**Where:** `bug-hunt/SKILL.md`, in the verification standard (the confirm-before-report
step). This is a verification-bar addition; the hunt stays static-analysis-first, only
public-surface *confirmation* changes.

**Insert:**

> **Rendered confirmation for visitor-facing claims.** A finding that asserts what a
> *visitor sees* — a wrong rendered value, a dead link, leaked internal jargon, or a
> contradiction between two pages — is CONFIRMED only against rendered output (curl the
> running app, or otherwise render the page), never against templates or content modules
> alone. Static tracing *locates* a candidate; rendering *confirms* it. This is why the V1
> release audit's four blockers were all found by curling HTML, and why a static-only claim
> like "family pages don't exist" (a real stale-skill error) would never self-correct: the
> render is the arbiter for anything a visitor reads.

---

## Calibration 4 — doctrine uncertainty is not a bug

**Where:** `freestyle-bug-hunt/REFERENCE.md`, near the existing "never judge doctrine"
and "respect recorded freeze holds" rules (this sharpens them).

**Insert:**

> **Not a finding: an open doctrine question, honestly presented.** The encyclopedia holds
> unresolved questions on purpose (the items in `freestyle/doctrine/RED_QUEUE.md`, the
> Quantum-vs-Miraging distinction, the divergence registries). An entry that says a reading
> is provisional, or presents two attested readings without picking one, is being honest,
> not buggy. **A doctrine-adjacent finding is valid only when the site asserts *certainty it
> should not* — publishing a single confident value where the doctrine is openly unsettled,
> or contradicting a settled ruling in `RED_RULINGS.md`.** Uncertainty faithfully labeled is
> a feature; false certainty, or a value that contradicts a settled ruling, is the bug.

---

## The post-V1 blocker standard (adopt as the permanent bar for freestyle hunts)

Not a patch to a skill file — a calibration for whoever *commissions* a hunt. A freestyle
finding blocks release only if it is one of: (1) a public contradiction, unlabeled; (2)
dead navigation; (3) a rendered artifact (null/undefined/placeholder a visitor sees); (4)
an internal leak (ruling codes, tooling names, non-sanctioned source names in public
prose); (5) a data-integrity break (bracket-count ≠ ADD, an active row breaking a hard QC
invariant). Everything else parks. The standing exclusions where bogus reports come from:
**not-yet-built is a status fact; a held doctrine question is a held state; parked backlog
items are parked; documented divergences and labeled source claims are the system working.**

## Summary

| # | Calibration | Target file | Prevents |
|---|---|---|---|
| 1 | "ADD (recorded)" ≠ canonical is intentional | freestyle-bug-hunt/REFERENCE.md | re-flagging 16 records rows |
| 2 | documented divergence is scholarship | freestyle-bug-hunt/REFERENCE.md | re-flagging the reconciliation series |
| 3 | rendered confirmation for visitor claims | bug-hunt/SKILL.md | false public-surface findings; stale-doc claims |
| 4 | doctrine uncertainty is not a bug | freestyle-bug-hunt/REFERENCE.md | re-flagging honest open questions |

Do not touch the stopping rule or the severity rubric — they are correct. Govern hunt
*frequency* by maintainer policy (the stop-criterion decision), not by editing the skill.
