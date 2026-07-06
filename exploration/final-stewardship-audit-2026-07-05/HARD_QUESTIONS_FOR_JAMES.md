# Hard Questions for James

The decisions you are avoiding, or have not yet noticed you owe. Fifteen, each with why
it matters. These are yours; no Claude session should answer them for you. Where I have
a recommendation I state it, but the point of this file is that each needs an actual
ruling, recorded somewhere a future session will find.

## Release and freeze

**1. What is the stop criterion for polishing freestyle?**
You have run three "final" audits. Each found real things, which is seductive — it
proves auditing works, so why stop? Because every hour of polish is an hour not spent
on the glossary, and the release audit already answered the only question that gates
shipping. Proposed rule: after the V1 tag, only defects meeting the release-audit
blocker standard (public contradiction, dead navigation, rendered artifact, jargon
leak) reopen freestyle; everything else parks. Without this rule, "one more audit"
will consume V1.1. **Decide the rule and write it down.**

**2. When do you actually run the tag?**
`freestyle-v1.0` is recommended, agreed, and not run. Every day it isn't tagged, the
freeze point drifts as commits land on main, and "V1" becomes a vibe instead of a
commit hash. This is a two-minute action gated only on you.

## Doctrine

**3. Are the doctrine papers public artifacts or private correspondence?**
This is the biggest unmade decision in the project. The six papers are written to be
durable scholarship, but they name Red throughout, discuss him in third person, and
carry internal framing. If they are *public*: they need the public-prose treatment
(the same one that just stripped pt-codes from rendered pages) and a decision about
where they render. If they are *private*: the History page and future essays cannot
cite them as if readers can follow the link. The glossary V2 essays will force this
question within weeks — Name vs Structure wants to cite the reconciliation series.
Decide the audience before the essays are written, not after.

**4. What is the trigger for sending the remaining five papers to Red?**
"Deliberately unsent" is a decision to wait, but nothing defines what you are waiting
*for* — Wave 3 answers? A calmer month? Never (they were really for you)? An unsent
letter with no send condition is a decision avoided. Options: send on Wave-3 reply;
send on V1.1 ship; declare them internal foundations and stop framing them as mail.

**5. Ratify the Foundational Bases list.**
The dependency graph corrected your intuitive list: Toe Stall and Clipper Stall
confirmed; ATW, Inside Stall, Rake, Pendulum demoted (gateways, not hubs); Dexterity
and the compositional premise promoted (the real hubs, but they are concepts, not
tricks). The public "Foundational Base" badge needs a ratified member list from you —
the graph proposes, the curator disposes. This gates the Bases treatment in every
glossary entry authored from now on.

## V1.1 shape

**6. Is V1.1 an educational release or a maintenance release?**
If Red's Wave 3 answers arrive mid-V1.1, doctrine integration (the blurry predicate
alone touches 64 rows) and glossary authoring will compete for the same attention.
Decide the priority now: recommendation — doctrine integration preempts, because it
changes published values (correctness beats pedagogy), and the glossary track pauses
cleanly at any slice boundary. But that is a policy you should set, not inherit.

**7. Records: is the "ADD (recorded)" label the end state, or do the 16 drifted rows
also get reconciled?**
The release fix relabeled the records column as a source claim and explained the
divergence — honest and shipped. Left open: whether the 16 rows whose recorded ADD
disagrees with canonical should *also* be individually annotated or corrected at the
data layer. The label may be genuinely sufficient. Decide, so no future audit re-flags
it as unfinished.

**8. Glossary migration strategy: strangler or parallel page?**
The stewardship review recommends converting the existing glossary section-by-section
in place (strangler), never a rewrite. The alternative — building a parallel new page
and cutting over — is cleaner to develop but risks two divergent glossaries live at
once. This must be decided before the first line of glossary V2 code; it determines
what "slice 1" even means.

**9. Who is the voice QA for glossary V2 content?**
The pilot voice is distinctive and will be imitated by many future sessions. Either
you read every entry before it ships (high quality, slow), or you ratify the voice
standard plus the pilot as exemplars and spot-check batches (scales, drifts). Pick
one; the authoring pipeline needs to know which gate it passes through.

**10. Freeze the insight registry as a governed file?**
The ~10 insights are about to become the spine of every Reveal, essay, and teaching
sequence. Recommendation: INSIGHT_REGISTRY.md becomes a curator-governed file like the
canonical docs — additions and rewordings need your explicit sign-off. Cheap now;
prevents insight sprawl (the exact failure the pilot caught) forever.

## Repository and stewardship

**11. What is exploration/'s end state?**
The active item asks its go-live disposition, but you have been deciding it by drift:
archive passes shrink it, then new sessions (including this one) add fresh directories.
Pick the policy: (a) working scratch that archives aggressively and leaves the repo at
go-live, or (b) the project's permanent historical record, curated and kept. Both are
defensible; the oscillation between them is not.

**12. Who owns freestyle/CLAUDE.md?**
Root CLAUDE.md is Dave's; legacy_data/CLAUDE.md is yours. freestyle/CLAUDE.md governs
the pipeline subtree and its ownership was never declared. The skills-and-rules audit
proposes stewardship edits to the instruction layer; whether that file is in scope
depends on this answer. Ask Dave once; record it.

**13. Authorize a memory-index pruning session?**
The persistent memory index is over its size limit and carries entries that now
duplicate committed docs (promotion-arc state, doctrine status that RED_RULINGS and
the IP now own). Stale memory misleads future sessions exactly like stale skills do.
One session of pruning against the memory rules fixes it; it needs your go-ahead since
memory writes are gated.

## Meta

**14. What is Fable for, from now on?**
You bought one day and spent it well (audit, architecture, synthesis). Set the policy
before habit sets it for you: Fable for adversarial audits and cross-cutting synthesis
only; Opus for authoring and implementation; ordinary Claude for sweeps and
verification. Never Fable for anything a checklist can do.

**15. Does the dependency graph stay private?**
Recommendation: yes — it is the lesson plan, and you publish the lessons (ladders,
essays, ordering) rather than the plan. But it is genuinely novel work and the
temptation to publish it will recur. Decide once: private design instrument, revisit
no earlier than V2.
