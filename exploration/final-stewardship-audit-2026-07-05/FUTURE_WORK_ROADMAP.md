# Future Work Roadmap — Post-V1 Freestyle

The next ten tasks, ranked by return on effort, each tagged with who does it and which
kind of value it produces (public-visitor / maintainer / doctrine / cleanup / glossary-V2).
Then the owner split and the release framing. Rule applied throughout: nothing here
invents work; every task already exists in the IP, the glossary design chain, or this
audit's findings.

## The ranked ten

**1. James: run the pending commit and tag `freestyle-v1.0`.** *(release; 10 minutes)*
Everything downstream assumes a frozen V1. The planning-pass commit is staged in the
handoff script; the tag command is written. Until this runs, "V1" is not a fact.

**2. Opus: fold the accepted pilot revisions into ARCHITECTURE.md and create
INSIGHT_REGISTRY.md.** *(glossary-V2; one sitting)*
The architecture is currently frozen *pre*-review while the review's changes are
accepted — a contradiction a future session will trip on. The registry collapses the
three inconsistent insight lists into one governed file. Highest-leverage paper task
in the project.

**3. Opus: author tranche 2 — Dexterity, Osis, miraging, whirling, stepping, paradox,
blurry.** *(glossary-V2 → future public-visitor; one session)*
The seven entries that make the compressed-formula arc walkable end to end. Written
against the updated architecture and registry from task 2, in the pilot voice, as
Markdown only.

**4. Ordinary Claude: draft the freestyle skills remediation text.** *(maintainer +
cleanup; one session, drafts only)*
The skills audit (SKILLS_AND_RULES_AUDIT.md) names what is stale and dangerous in the
freestyle skills. The actual edits are `.claude/`-gated and tracked in Dave's
cross-track item; what unblocks Dave is ready-to-review replacement text per skill.
Producing those drafts is mechanical once the audit verdicts exist.

**5. James: answer the four gating hard questions.** *(all value axes; one evening)*
Of the fifteen in HARD_QUESTIONS_FOR_JAMES.md, four gate near-term work: papers public
or private (#3, gates essays), Bases ratification (#5, gates entry authoring),
migration strategy (#8, gates slice 1), voice QA (#9, gates the authoring pipeline).
The rest can wait; these four cannot.

**6. Opus: glossary slice 1 — the three-layer partial on the core-atoms section,
strangler-style.** *(glossary-V2 + public-visitor; first V1.1 code)*
Only after tasks 2, 3, and the #8 ruling. One section converted in place, per-entry
expanders, no depth toggle, existing tests for that section updated in the same slice.
This is the first visitor-visible V1.1 change.

**7. James + Opus, when Red replies: the Wave-3 doctrine-integration slice.**
*(doctrine + public-visitor; timing external)*
The blurry predicate alone touches 64 rows; the embedded-base frame and four operator
definitions follow. Preempts glossary work when it lands (per the recommended #6
policy in the hard questions). Nothing to do until the reply exists — do not simulate
it.

**8. Opus: the Name vs Structure essay.** *(glossary-V2 + public-visitor)*
First essay, after tranche 2 and the #3 ruling on citing the doctrine papers. The
front door to the whole V2 teaching arc; Blur's Reveal links to it.

**9. Ordinary Claude: the parked hygiene sweeps, batched.** *(cleanup; whenever idle)*
De-epoch the ~120 test files and strip the embedded doc references — both parked in
the Post-V1 backlog, both mechanical, both safe to batch into one boring session.
Zero urgency; do them when nothing better exists.

**10. Future Fable (if ever bought again): the pre-V1.1 adversarial audit.** *(release)*
When the glossary conversion and any doctrine integration are done and V1.1 is about
to be declared, one hostile rendered-surface audit in the exact mold of the V1 one.
That is the only freestyle task on the horizon that justifies Fable.

## By owner

- **James (decisions and git):** tasks 1, 5, 7-timing; plus the eleven non-gating hard
  questions at leisure.
- **Opus (authoring and scoped implementation):** tasks 2, 3, 6, 8; later the
  section-by-section glossary slices and remaining essays.
- **Ordinary Claude (mechanical, bounded):** tasks 4, 9; future link-checks, sweeps,
  test-suite runs, DB verifications.
- **Red (external):** Wave 3 answers; nothing else is his.
- **Future Fable:** task 10 only.

## Release framing

- **V1.1 = the educational release.** Contents: glossary V2 conversion (slices), the
  first essays, the ratified Foundational Bases treatment, plus integration of any Red
  answers that arrive (which preempt but do not redefine the release). Set-page
  authoring from the backlog fits if capacity allows.
- **V1.2 = graduation and structure.** Foundational Base pages (if the entries prove
  they want them), the remaining essays, entry-side navigation, progression ladders —
  all currently vision-tier, none to be started on impulse.
- **Long-term research (no release assigned):** runs-and-sequence vocabulary, the
  9-ADD question (external evidence, not editorial work), publishing any part of the
  dependency graph, in-app dictionary editing (platform go-live scope).

## The anti-roadmap (things that look like tasks and are not)

- "Re-audit freestyle" — done three times; gated by the stop criterion (#1 hard
  question). Not a task.
- "Integrate the dependency graph into the site" — the graph is a private instrument;
  its derivatives ship, it does not.
- "Send the doctrine papers" — a decision (#4), not a task, until James rules.
- "Fix the 16 records rows" — a decision (#7) first; the shipped label may be the end
  state.
- "Promote more tricks" — the promotion arc is closed; what remains is doctrine-blocked.
  Any session that starts promoting has misread the state.
