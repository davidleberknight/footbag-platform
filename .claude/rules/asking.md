# Asking rule

Single home for putting questions to the human. Skills link here, never restate.

## Resolve before asking

Asking is the last resort. Work every answer through the authority order first; ask only
if material ambiguity survives it. Prefer live research — read the actual docs and code
now — over memory or assumption. Confirm what "done" means before starting — the success
criteria from the user story or design intent; if none exists and the design does not
supply them, that is a genuine question.

Order, highest authority first: (1) explicit human decisions in this task; (2)
the maintainers' private tracker, whose open issues are the current ratified scope and
the accepted, tracked deviations (`tracker-ops` skill; skip if unwired); (3) clear design intent — `docs/DESIGN_DECISIONS.md`
(durable intent and rationale), `docs/USER_STORIES.md` (intended behavior, success
criteria), `docs/DATA_MODEL.md` (schema semantics), and the path-scoped `.claude/rules/*`
and service file-header JSDoc (target per-file contract); `docs/DATA_GOVERNANCE.md`
mandatory for members, persons, search, auth, contact, exports, stats, privacy; (4)
current code and `database/schema.sql` — what is actually built. Code is reality, not
authority for intent: clear design intent outranks code, and where they conflict with no
tracked deviation explaining the gap, the code is drift / a bug, not the answer.

Derive the answer: `docs/DESIGN_DECISIONS.md` gives the design intent; `docs/USER_STORIES.md`
and `docs/DATA_MODEL.md` give the details that follow from it; code shows current reality.
Build the recommendation from the design intent — never from code-as-found alone, never a
guess — and triangulate across more than one source, re-reading cited passages yourself. A
ruling that ratifies text you drafted is not primary grounding: trace any new surface (route,
page, table, flag) to a user story, `docs/DATA_GOVERNANCE.md`, or an explicit human decision, and
never build feature-scale work inside a fix or remediation batch.

Bright line: if analysis makes the answer certain, DO NOT ASK — act on it (or state it
settled). If genuine doubt survives the sources, DO ASK — never guess or assume.
Multi-step analysis is not grounds to ask; only genuine undeterminability is.
Read-only investigation needs no permission: git reads, DB SELECTs, curl GETs, file
listings, `--help`, compile-checks — run them, never ask. Ask the human only when
materially different interpretations survive the sources, or the call needs an external
fact, an IFPA/governance authority, or a human preference the design does not determine.
When two or more interpretations genuinely remain, name each and stop; push back when the
evidence warrants rather than defaulting to the human's framing.

Scoping belongs to plan mode. Surface and resolve every real scoping question before
exiting plan mode — ask as many as it takes to exhaust material doubt. Once the plan is
approved, scoping and continuation default to completion: carry the work through its
deferred and follow-on tasks until done, and do not pause to ask permission to proceed or
to review trivial work. A genuine new material decision still gets a question; "should I
keep going / do the next part" never does.

## Form the question well

When a question survives, the human must answer it without opening another doc, scrolling
back, or decoding a label. Before any message containing "?":

1. Plain English, self-contained. Use no internal reference the human was not handed —
   section numbers, "§", audit gate/finding codes, "item N", operational-state numbers,
   prior-message labels, or doc-path pointers. A reference the human DOES have is fine: a
   concrete identifier they must act on (path, route, env var), or a finding ID in an
   artifact they are reading (e.g., a `BUGS.md` row) — name it, and pair an ID with its
   title so it stands alone.
2. Context inline: what it is, where it bites, the options.
3. One recommended answer, researched from the canonical docs and code and grounded in
   design intent — verified, never guessed; research it before asking if unverified. Pros
   and cons when the trade-offs are real.
4. One decision per message. A trailing "open questions" / "decisions for you" list with a
   second ask is the same violation.
5. Prose by default — context and recommendation in the message itself. Use the
   multiple-choice tool only when the human explicitly asks to pick from options.
6. Explain before any approval prompt — never spring a bare approval; state what and why
   first.
7. Make the recommendation the default. Structure every question so a bare "y", "go", or
   "yes" from the human means take the recommended answer: exactly one recommendation to
   affirm, never an ambiguous "y". A bare "y" / "go" is always read as "proceed as
   recommended."
8. State the load-bearing assumptions behind your recommendation, so the human can correct
   a wrong one before you act.
9. Propose any surgical edit as literal BEFORE/AFTER text — verbatim, with enough surrounding
   context to locate it — never an abstract description ("tighten X").
10. When presenting a doc or canonical-text draft, show only the literal text plus a one-line
   approval prompt; no trailing "Style notes" or conformance commentary — the draft conforms on
   its own merit.

A Stop hook (`.claude/hooks/guard-question-quality.sh`) blocks a question still carrying a
section sign, a state number, a documentation-file pointer, or a code used as a bare label;
it is a backstop, not the standard.

## Subagents

A spawned agent has no channel to the human: it never asks, and it never resolves a
genuinely human-owned ambiguity by silently picking an interpretation. It returns the
question — context, options, and its recommended answer — as a clearly marked item in its
report, and the main agent raises it under this rule.

## During execution

Run an approved plan to completion; do not pause for continuation or trivial review.
Re-ask or re-gate only for a real reason:

- A new material decision surfaces that the plan did not anticipate.
- What you find contradicts the plan's premise, or the work is materially larger or
  different than approved — surface it rather than pressing on.
- Finished UI work: run `./run_dev.sh` and have the human review the new or changed UI
  visually; discuss significant visual changes before building them.
- Destructive, irreversible, or outward-facing actions (deleting data, overwriting,
  retiring resources, sending mail, deploying) — gate them behind ONE consolidated
  approval per batch, never many prompts.
- Editing canonical docs, `.claude`, `.github`, or public UI wording always needs explicit
  approval.
- A design, redesign, or remediation task starts with diagnosis: establish the current state and
  get the problem set ratified before proposing fixes. Plan approval is not blanket consent to
  mutate canonical docs; each canonical-doc edit stays gated.
- On a review or audit punch-list, apply the best fix and show the diff without asking per item;
  pause only for a genuine design choice, a destructive/irreversible/outward-facing action, a
  scope change, or anything touching AWS or production.
