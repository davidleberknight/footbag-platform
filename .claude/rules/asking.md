# Asking rule

Single home for putting questions to the human and for approving documentation edits. Skills link
here, never restate.

## Resolve before asking

Before any message that puts a question to the human, do this in the turn, in order:

1. List every candidate question.
2. Settle each from the sources first, starting from the design intent: the governing passage
   (`design-intent`), then the code, the tracker card, and for any fact about an outside system
   (AWS, Google, an IFPA rule, a library) a live documentation lookup, never memory. Design
   documents can be stale or incomplete, so check the passage against the facts; a discrepancy
   the intent does not resolve is a genuine question for the human, asked with each side and its
   source. Broad research goes to a subagent. Establish what the choice actually changes before
   offering options.
3. Write each settlement in the message as a `Settled from the sources:` line, with its source.
4. Ask only what survives step 2 and still leaves you unable to act if the human answered
   "I don't know". If you would still know what to do, decide it and let them overrule. Ask the
   person the record names as decider, never the maintainer for a call the record gives to
   someone else. Never ask for an opinion or a preference, or offer options, on a point the
   facts or the design settle. A settled decision is never silent or buried either: state each
   one, with its source, where the human will see it. When a settled decision matters enough
   to confirm, ask only to ratify it, and say so plainly: "Settled by <source>; asking only to
   ratify." Ask for an opinion only when the decision is genuinely a human preference no source
   determines.

Asking is the last resort. Work every answer through the authority order in root `CLAUDE.md`, which
is never restated here, and prefer live research, reading the actual docs and code now, over memory
or assumption. Confirm what "done" means before starting: the success criteria from the user story
or design intent. If the design supplies none, that is itself a genuine question. Derive the answer
rather than guessing it, from the passages the pre-design gate in root `CLAUDE.md` names; what
counts as clear intent is the `design-intent` skill. `docs/DATA_GOVERNANCE.md` is mandatory
for members, historical persons, search, auth, contact fields, exports, stats, and privacy.
Triangulate across more than one source and re-read the cited passages yourself. A ruling that
ratifies text you drafted is not primary grounding: trace any new surface (route, page, table, flag)
to a user story, a governance document, or an explicit human decision, and never build feature-scale
work inside a fix or remediation batch.

Bright line: if analysis makes the answer certain, do not ask; act on it or state it settled.
The one exception is a disagreement between code, a code comment, a document and the intent:
it always goes to the human to adjudicate, never settled silently, with one recommended answer
derived from the intent down: the functional requirements and the solution architecture that
supports them first; then the design decisions, probably right but possibly stale; then the
code, which is derived from both and is never the default winner. When the sources make the
recommendation certain, present it as settled from the sources, asking only to validate it. If
genuine doubt survives the sources, ask; never guess or assume. Multi-step analysis is not
grounds to ask; only genuine undeterminability is. A design or implementation
detail that precedent or the standard settles is never put to the human as a choice. Read-only investigation needs no permission:
git reads, DB SELECTs, HTTP GETs through WebFetch, file listings, compile-checks. Run them, never ask.

Ask only when materially different interpretations survive the sources, a conflict stays unclear
after the design-intent skill's resolution, or the call needs an
external fact, an IFPA or governance authority, a human preference the design does not determine,
or the task would create or choose a canonical artifact the design does not already fix: a new
document, the single home for a body of content, or the relocation or consolidation of content
between documents. That last case is always the human's; never settle it by picking the most
plausible option. When two or more interpretations genuinely remain, name each and stop, and push
back when the evidence warrants rather than defaulting to the human's framing.

A reply of "no preference", "I don't know", a bare Enter, or a tool-level plan approval is not a
decision on any question and not consent to proceed. Settle it yourself from the sources, or ask
once more with your recommendation; never treat it as a go-ahead.

Scoping questions belong to plan mode, under the plan-mode rule in root `CLAUDE.md`. Once the plan
is approved, a genuine new material decision still gets a question; "should I keep going" never does.

## Form the question well

The human must be able to answer without opening another doc, scrolling back, or decoding a label.
Before any message containing "?":

1. Plain English, self-contained. No internal reference the human was not handed: section numbers, "§", audit gate or finding codes, "item N", operational-state numbers, prior-message labels, or doc-path pointers. A reference the human DOES have is fine: a concrete identifier they must act on (path, route, env var), or a finding ID in an artifact they are reading, paired with its title so it stands alone.
2. Context inline: what it is, where it bites, the options.
3. One recommended answer, researched from the canonical docs and code and grounded in design intent, verified and never guessed. Every factual claim cites the source read this turn, or is marked UNVERIFIED. Pros and cons when the trade-offs are real.
4. One decision per message. A trailing "open questions" or "decisions for you" list carrying a second ask is the same violation.
5. Ask in plain prose in the message text, never through a multiple-choice tool, in plan mode and outside it, so the human can answer by voice: one question per message, the recommended answer first, with the context and load-bearing assumptions in the message.
6. Explain before any approval prompt; never spring a bare approval. Before a command that an ask rule or an ask-returning hook gates, say in the message what it runs and why, write the Bash description as that why, and run it as its own call with no trailing plumbing, so any rule the prompt offers names that command.
7. Structure it so a bare "y" or "go" means take the recommended answer: exactly one recommendation to affirm, never an ambiguous "y".
8. State the load-bearing assumptions behind the recommendation, so a wrong one can be corrected before you act.
9. Propose any surgical edit as literal BEFORE/AFTER text, verbatim with enough surrounding context to locate it, never an abstract description. A documentation edit follows Documentation edits below instead.
10. When showing literal doc or canonical text, before or after applying it, show the text itself with no trailing style or conformance commentary.
11. In a multi-question pass, present exactly one question per message, headed "Question N of M: " plus a short bold title.

A Stop hook (`.claude/hooks/guard-question-quality.sh`) backstops this section and the
`Settled from the sources:` line; text in fenced blocks is exempt from it. It is a backstop, not the
standard.

## Subagents

A spawned agent has no channel to the human: it never asks, and never resolves a genuinely
human-owned ambiguity by silently picking an interpretation. It returns the question, with context,
options, and its recommended answer, as a clearly marked item in its report, and the main agent
raises it under this rule.

## Documentation edits

Covers documentation, `.github/` and the harness (`.claude/`, every `CLAUDE.md`), the files root
`CLAUDE.md` rule 1 names.

- Approval is explicit. Any reasonable affirmation counts; silence, a bare Enter, plan approval and
  approval of a different edit do not.
- One ask may cover a whole batch: every doc edit for a task, a card or a doc-sync pass. It is one
  decision. It opens with what Claude wants to edit and why, the point and the big picture, then a
  concise summary of each edit: the document and section in words, and what changes. The literal
  text need not be in the ask, except for a harness edit; show it first if the human asks.
- The human may pre-approve doc edits for a scope they name ("the doc edits for this card", at
  most "this session"). Within it, Claude applies surgical edits without a further ask, opening the
  message with the same what-and-why summary. The pre-approval lapses when its scope ends.
- A pre-approval never covers a change of meaning or design, IFPA governing documents, public UI
  wording, `.github/` or the harness, unless the human names that class. Each of those gets its own
  ask; a harness ask carries the literal before/after, under the harness governance rule. A
  tool-level "allow edits to .claude this session" answer is not a pre-approval.
- One standing pre-approval: the maintainer's working walk files in the private operations
  checkout, `footbag_private_repo/issue_review.md`, `EXTENDED_DOC_SYNC_REVIEW.md` and
  `BUG_HUNT_REVIEW.md`, are edited without an ask, whatever the edit.
- Every applied edit is surgical: the smallest change, untouched text left as it was. In the same
  turn that applies them, show every applied edit in the message itself as literal BEFORE/AFTER,
  with the document and enough context to locate it; never a summary, a file or a link. A change or
  revert the human then asks for is applied and shown the same way.

## During execution

Run an approved plan to completion, through its deferred and follow-on tasks; do not pause for
continuation or trivial review. Re-gate only for a real reason:

- A new material decision the plan did not anticipate, or a finding that contradicts the plan's premise or makes the work materially larger or different than approved.
- Finished UI work: have the human review the new or changed UI visually, giving them `./run_dev.sh` to start it (or starting it if they ask); discuss significant visual changes before building them.
- Destructive, irreversible, or outward-facing actions (deleting data, overwriting, retiring resources, sending mail, deploying), behind one consolidated approval per batch, never many prompts. Exception: when a plan or runbook names its own per-step approval points (an arming table's approver column, a phase marked "each its own approval"), those override the batch default; ask at each named point, and never treat one go for a sequence as consent to every irreversible step inside it.
- Editing canonical docs, `.claude` or `.github` (under Documentation edits above, so an edit a pre-approval in force covers needs no re-gate), or public UI wording.
- A design, redesign, or remediation task starts with diagnosis: establish the current state and get the problem set ratified before proposing fixes. Plan approval is not blanket consent to mutate canonical docs.
- On a review or audit punch-list, apply the best fix and show the diff without asking per item; pause only for a genuine design choice, a destructive or outward-facing action, a scope change, or anything touching AWS or production.
