# Asking rule

Single home for putting questions to the human. Skills link here, never restate.

## Resolve before asking

Asking is the last resort. Work every answer through the authority order in root `CLAUDE.md`, which
is never restated here, and prefer live research, reading the actual docs and code now, over memory
or assumption. Confirm what "done" means before starting: the success criteria from the user story
or design intent. If the design supplies none, that is itself a genuine question. Derive the answer
rather than guessing it: design intent gives the ruling, the user stories and data model give the
details that follow from it, and code shows current reality. `docs/DATA_GOVERNANCE.md` is mandatory
for members, historical persons, search, auth, contact fields, exports, stats, and privacy.
Triangulate across more than one source and re-read the cited passages yourself. A ruling that
ratifies text you drafted is not primary grounding: trace any new surface (route, page, table, flag)
to a user story, a governance document, or an explicit human decision, and never build feature-scale
work inside a fix or remediation batch.

Bright line: if analysis makes the answer certain, DO NOT ASK, act on it or state it settled. If
genuine doubt survives the sources, DO ASK, never guess or assume. Multi-step analysis is not
grounds to ask; only genuine undeterminability is. Read-only investigation needs no permission:
git reads, DB SELECTs, curl GETs, file listings, compile-checks. Run them, never ask.

Ask only when materially different interpretations survive the sources, or the call needs an
external fact, an IFPA or governance authority, a human preference the design does not determine,
or the task would create or choose a canonical artifact the design does not already fix: a new
document, the single home for a body of content, or the relocation or consolidation of content
between documents. That last case is always the human's; never settle it by picking the most
plausible option. When two or more interpretations genuinely remain, name each and stop, and push
back when the evidence warrants rather than defaulting to the human's framing.

Scoping belongs to plan mode: surface and resolve every real scoping question before exiting, as
many as it takes to exhaust material doubt. Once the plan is approved, continuation defaults to
completion; carry the work through its deferred and follow-on tasks. A genuine new material
decision still gets a question; "should I keep going" never does.

## Form the question well

The human must be able to answer without opening another doc, scrolling back, or decoding a label.
Before any message containing "?":

1. Plain English, self-contained. No internal reference the human was not handed: section numbers, "§", audit gate or finding codes, "item N", operational-state numbers, prior-message labels, or doc-path pointers. A reference the human DOES have is fine: a concrete identifier they must act on (path, route, env var), or a finding ID in an artifact they are reading, paired with its title so it stands alone.
2. Context inline: what it is, where it bites, the options.
3. One recommended answer, researched from the canonical docs and code and grounded in design intent, verified and never guessed. Pros and cons when the trade-offs are real.
4. One decision per message. A trailing "open questions" or "decisions for you" list carrying a second ask is the same violation.
5. Prose by default. Use the multiple-choice tool only when the human explicitly asks to pick from options.
6. Explain before any approval prompt; never spring a bare approval.
7. Structure it so a bare "y" or "go" means take the recommended answer: exactly one recommendation to affirm, never an ambiguous "y".
8. State the load-bearing assumptions behind the recommendation, so a wrong one can be corrected before you act.
9. Propose any surgical edit as literal BEFORE/AFTER text, verbatim with enough surrounding context to locate it, never an abstract description.
10. When presenting a doc or canonical-text draft, show only the literal text plus a one-line approval prompt, with no trailing style or conformance commentary.
11. In a multi-question pass, present exactly one question per message, headed "Question N of M: " plus a short bold title, and never finalize a plan while any queued question remains unasked.

A Stop hook (`.claude/hooks/guard-question-quality.sh`) blocks a question still carrying a section
sign, a state number, a documentation-file pointer, or a code used as a bare label. It is a
backstop, not the standard.

## Subagents

A spawned agent has no channel to the human: it never asks, and never resolves a genuinely
human-owned ambiguity by silently picking an interpretation. It returns the question, with context,
options, and its recommended answer, as a clearly marked item in its report, and the main agent
raises it under this rule.

## During execution

Run an approved plan to completion; do not pause for continuation or trivial review. Re-gate only
for a real reason:

- A new material decision the plan did not anticipate, or a finding that contradicts the plan's premise or makes the work materially larger or different than approved.
- Finished UI work: run `./run_dev.sh` and have the human review the new or changed UI visually; discuss significant visual changes before building them.
- Destructive, irreversible, or outward-facing actions (deleting data, overwriting, retiring resources, sending mail, deploying), behind ONE consolidated approval per batch, never many prompts. Exception: when a plan or runbook names its own per-step approval points (an arming table's approver column, a phase marked "each its own approval"), those override the batch default; ask at each named point, and never treat one go for a sequence as consent to every irreversible step inside it.
- Editing canonical docs, `.claude`, `.github`, or public UI wording.
- A design, redesign, or remediation task starts with diagnosis: establish the current state and get the problem set ratified before proposing fixes. Plan approval is not blanket consent to mutate canonical docs.
- On a review or audit punch-list, apply the best fix and show the diff without asking per item; pause only for a genuine design choice, a destructive or outward-facing action, a scope change, or anything touching AWS or production.
