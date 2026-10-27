---
name: bug-hunt
disable-model-invocation: true
description: Runs a bounded adversarial bug hunt over the footbag-platform repository for defects against the design intent - implementation (security and correctness, checked against expected outcomes written from the stories before the code is read), unsafe design on the highest-risk surfaces, and code that breaks clear intent, including harness guards that do not guard. Runs after an extended doc sync, which owns document drift. Orchestrates read-only in plan mode in the MAIN session, dispatches lanes to read-only subagents, reproduces and refutes every candidate, and writes findings to BUGS.md only after plan approval; remediation happens in later sessions. Invoke ONLY when the user explicitly asks for a "bug hunt", "bug sweep" or "design bug hunt" by name. Do NOT infer it from "adversarial review", "security pass", "review the code", or "doc sync". Not a testing strategy, not a documentation audit and not browser QA.
---

# Bug Hunt: adversarial defect hunt across design, code and the discrepancies between them


**This skill orchestrates; it does not read the catalogs itself.** The method detail lives
in two briefs, each read by the subagent that sweeps that layer, never by the orchestrator,
which keeps the main session's context lean:

- `REFERENCE.md`: the implementation-layer category catalog (4.4.1 to 4.4.54, the last
  being the UI/UX lane's method), the design-pattern divergence catalog (4.4B),
  cross-cutting observations, calibration lenses and search recipes.
- `DESIGN.md`: the oracle lane's method, and the design-layer method: the threat model,
  the contract, data, migration and parity sweeps, the optional tabletop, the refutation
  checklist and the design bug taxonomy.

## 1. Mission and defect layers

One hunt, three defect layers. Every finding names the layer that is defective, because the
layer routes the remediation (fix the spec, fix the code, or settle which side is wrong) and
misrouting a fix converts one bug into two:

- **Design/specification**: on a five-ranked surface, a requirement, design decision,
  contract, governance rule, migration rule or parity rule is unsafe or missing, such that
  competent future code would still produce wrong production behavior. Definition in
  `DESIGN.md`. Ambiguity, contradiction and wording between documents are the
  `extended-doc-sync` skill's, run before this hunt.
- **Implementation**: deployed code fails a clear requirement, domain invariant, or
  security or correctness expectation: every class in the `REFERENCE.md` catalog.
- **Discrepancy**: the code breaks a clear design intent, or a harness guard does not
  guard. Section 7. A stale document, comment or service header met on the way is the
  extended doc sync's: list it as a hand-off, never a finding.

Every finding carries a **trace**: the story criterion, design decision or domain invariant
it breaks. A candidate with no trace is recorded as Low or as a Lead, never above.

Do not assume the docs are right. When code and a doc disagree, the defect may sit in
either, in both, or in a missing tracked deviation. Reason from the platform goal, the
domain invariants and the authority order in root `CLAUDE.md`; never silently pick a side.

A missing test or gate is handed to `write-tests` as a named defect class; a gate that does
not do what it claims is a configuration defect and stays here. Section 13 draws the other
boundaries.

## 2. Prompt contract

**Role:** white-hat adversarial reviewer for this repository: careful maintainer, security
engineer, domain analyst and hostile user trying to find real defects before production
does. Reject what violates the design even when it "works"; refute your own candidates
before believing them. The skill is written for Opus at medium reasoning effort, in the
main session and in every subagent: each step is a checklist or a measurement, and what a
checklist cannot settle is a question, not a deliberation.

**Objective:** a verified findings report in `BUGS.md` across the three layers, every
finding reproduced, every ambiguity resolved by the maintainer before the file is written.

**Success criteria for the hunt itself:** the deployed surface re-derived this run and every
story classified per `.claude/skills/deployed-surface/SKILL.md`, each deployed story's
expected outcomes written from its text before the code was read (the oracle lane); each
lane's one bounded pass run (section 11); every candidate reproduced and refuted by the
orchestrator, every survivor above Low refuted again in fresh context; a coverage ledger
for every success criterion of a deployed story; every question resolved one at a time
before the plan was finalized; output restricted to `BUGS.md`.

**Non-goals:** no browser QA, no redesign, no code or doc fixes, no test plan, no
speculative issues recorded as bugs, no remediation in the same session, and no
finding-count target: a short findings list is a valid result.

## 3. Hard constraints

- **Plan mode, read-only, end to end, in the MAIN session.** The orchestrator is not a
  forked skill, because only the main session can ask the human. The sole writes are
  `BUGS.md`, after the maintainer approves the finalized plan, and in a chunked walk the
  chunk's Walked line in `footbag_private_repo/BUG_HUNT_REVIEW.md`.
- **Single deliverable, then a clean handoff.** Triage and fresh-context re-verification
  happen in a later session; the `BUGS.md` header carries the standing re-audit
  instruction (section 9).
- **Every genuine question is answered before finalizing**, asked per
  `.claude/rules/asking.md`, each message in the shape the extended doc sync skill's Ask step
  fixes: the "Question N of M" heading, then "What this is:" in everyday words, then the
  problem, the settled lines, and the one recommended answer. Homework comes first, as that
  step also fixes: every fact about the site a question states (a page, its title and address,
  a button or link label, a notice, who sees it) is read this turn from the template, route and
  service and quoted verbatim, or checked by a fresh-context subagent; never stated from memory.
- **Dispatch research, verify centrally.** Read-only subagents each sweep one lane and read
  that lane's brief. A subagent conclusion is a lead, never a finding: the main session
  re-verifies every candidate against the cited lines. Subagents have no channel to the
  human; they return questions with context and a recommendation.
- **Reproduce before recording.** An implementation finding carries one concrete
  reproduction: a request against the local dev server (`./run_dev.sh`, local database
  only), a `sqlite3 -readonly` query against the local real-data build, a run of an existing
  test with `npx vitest run <file>`, or a throwaway probe in the session scratchpad that is
  never committed. Never staging or production. The hunters are read-only and cannot run
  one; the reproducer lane does (section 6). A candidate with no reproduction is a Lead
  naming the reproduction that would settle it.
- **Rendered confirmation for visitor-facing claims stays in the main session.** A finding
  about what a visitor sees is CONFIRMED only against rendered output, never templates
  alone; static tracing locates, the orchestrator renders. When the kickoff does not
  authorize running the app, the candidate is a Lead naming the render as its step.
- **Never stage, commit, push or pull.** No done-tracking: findings leave `BUGS.md` when
  their fix lands; no closures, dates or RESOLVED markers.
- **No diagnose-and-remediate in one step.** Diagnose, report, stop. Concise output: no
  filler, no preamble, no emojis.

## 4. Scope

- **Chunked walk, the default.** "Run the bug hunt" hunts one chunk: read
  `footbag_private_repo/BUG_HUNT_REVIEW.md`, take the first chunk in its hunt order with no
  Walked line, and take that chunk's scope from `EXTENDED_DOC_SYNC_REVIEW.md` beside it. Its
  commented files are the implementation surface and its sections the governing passages; hunt
  it as a narrow ask, under the last bullet below. A freestyle chunk goes to
  `freestyle-bug-hunt`. A whole-repository hunt runs only when the maintainer asks for one by
  name. When the private checkout is absent, say so in one line and hunt the domain the
  maintainer names.
- **Implementation layer:** the deployed surface, derived fresh every run per
  `.claude/skills/deployed-surface/SKILL.md`.
- **Design layer:** the threat model over the five-ranked surfaces and the stories behind
  them, undelivered ones included. "Not built yet" is a status fact, never a finding.
- **Discrepancy layer:** the deployed code against the clear intent of the story, decision,
  rule or service contract that governs it, and the `.claude/` guards against what they
  claim to block.
- **Tracked deviations are not findings**; a stale tracker issue is.
- **Standing exclusions:** CAPTCHA acceptance criteria (Turnstile deferred by design); the
  `legacy_data/` pipeline, hunted by its own subagent (migrated data shaping deployed routes,
  and migration and go-live design, stay in scope). Per-run exclusions come only from the
  kickoff prompt and are recorded in the scope note.
- **Post-go-live source of truth** is the production database; flag any design or code
  implying a runtime dependency on migration inputs after go-live unless a canonical doc
  retains one.
- For a narrow ask, dispatch only the relevant lanes and say which were skipped and why.
  Never print raw member PII, hashes, tokens or credential-like values.

## 5. Orient (orchestrator): load the minimum

1. This file and the two briefs' tables of contents.
2. Root `CLAUDE.md`: the authority order (do not restate it).
3. Dispatch **Lane 0** to build the tracked-work exclusion list: open issues from the
   maintainers' private tracker (`gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open`,
   read-only) plus `footbag_private_repo/BUGS.md`. The label taxonomy lives in
   `TRACKER_GUIDE.md` (private GitHub repo). If `FOOTBAG_PRIVATE_REPO` is unset, say one
   line that the tracker is not wired on this machine, proceed with `BUGS.md` alone, never
   hard-fail.
4. Have Lane 0 audit every existing `BUGS.md` entry against the current repo (re-resolve
   each location, confirm the defect persists, mark landed fixes for removal) and verify the
   results centrally. Corrections land in the final approved write.
5. Have Lane 0 rank the deployed surface for the bounded pass (section 11), by rule, not by
   judgement: five, any file on auth and session, member privacy, payments, identity claim,
   erasure, or a destructive, irreversible or outward-facing action; four, any other write
   path or anything that shapes member or migrated data; three, a read path rendering
   member data; two, any other deployed read path; one, content modules and static pages.
6. Check the drift pass ran: run the extended doc sync inventory against its ledger
   (`footbag_private_repo/DOC_SYNC_LEDGER.json`); if it lists any document as changed since
   the ledger's content hashes, say so in one line and recommend running
   `extended-doc-sync` first, because the oracle reads those documents. In a chunked walk,
   check instead for the chunk's Walked line in `EXTENDED_DOC_SYNC_REVIEW.md`, and if it has
   none, say so in one line and recommend walking that chunk's doc sync first.

Governance and IFPA pre-reads (`docs/DATA_GOVERNANCE.md`, `ifpa/*`) are loaded by the lane
whose candidate touches them and re-read by the orchestrator when it verifies.

## 6. Method: dispatch, verify, resolve

Each lane is a read-only subagent (`auditor` for code and config, `Explore` for surface
mapping) that reads its brief, sweeps its dimension once, and returns a structured **lead
list**: candidate, cited lines, reproduction attempted, refutation attempted, its
read-or-sampled inventory, and any human-owned question. Never file dumps.

### Dispatch table

| Lane | Subagent, model | Brief | Returns |
|------|-----------------|-------|---------|
| 0 Orient and surface | `auditor` / `Explore`, Sonnet | `.claude/skills/deployed-surface/SKILL.md` | deployed surface, story classification, file ranking, existing-`BUGS.md` audit, tracked-work exclusion list |
| O Oracle | `auditor`, Opus medium, reads no code | `DESIGN.md` "Oracle" | the expectation table: one row per success criterion of each deployed story, and per design decision a five-ranked surface rests on: story or decision, criterion, expected observable, probe; a criterion it cannot turn into an observable is a gap row |
| 1 Design | `auditor`, Opus medium | `DESIGN.md` | threat-model candidates on the five-ranked surfaces, and the migration gate-index audit |
| 2 Implementation | `auditor`, one per feature domain (auth and session, membership and payments, clubs and events, media, admin, public read paths) | `REFERENCE.md` 4.4 and 4.4B, plus the domain's oracle rows | implementation candidates traced input to controller to service to DB to response, each naming the oracle row or invariant it breaks |
| 3 Discrepancy | `auditor`, Opus medium | section 7 of this file and `REFERENCE.md` 4.4.48 | code-breaks-intent candidates and harness guards that do not guard, deduped against the self-check |
| 4 UI/UX | `general-purpose` with the Playwright MCP tools, dev stack running | `REFERENCE.md` 4.4.54 | layout and usability candidates: page, viewport (390px and 1280px), offending selector, measured number; measured with the rendered-style helper, one snapshot per page per viewport, no screenshots |
| R Reproducer | `general-purpose`, Sonnet, dev stack and a scratch copy of the local database | the candidate block and its oracle row | a failing probe or test in the session scratchpad, its command and output, or "could not reproduce" with what was tried |

Models: in Lane 2, a five-ranked domain gets two independent hunters at Opus high, which
never see each other's leads; fours get one at Opus medium; ones to threes one at Sonnet.

Lanes 4 and R run only when the kickoff authorizes the dev stack (`./run_dev.sh`); otherwise
the ledger records them as not run and unreproduced candidates stay Leads. They are the
lanes that are not read-only in the browser sense: Lane 4 loads pages and signs in through
the persona switch and submits no form; Lane R may submit forms, only against the local dev
stack and its scratch database, never staging or production. Every Catastrophic and High
candidate goes to Lane R; Medium and Low ones are spot-checked, and the ledger says which.

The orchestrator owns the coverage ledger, one row per success criterion of a deployed
story: probe-verified, test-verified (an existing test asserts it), traced (followed
through the code, not run) or unchecked. It also owns rendered confirmation (section 3)
and calibration (section 10); briefs carry the do-not-flag list only as a pre-filter.

### Briefing a subagent

Nothing in the main session reaches a subagent: not memory, not this conversation, not the
rules already loaded here. The brief carries everything the agent needs, and nothing it
does not. One lane per agent, and the same shape for a lane hunter and a refuter:

Spawn every agent with the Agent tool at the model and effort the dispatch table gives its
lane (refuters: Opus medium for a Catastrophic or High candidate, Sonnet below), and say so
in the brief, so the budget is explicit on both sides. The skill and its briefs
are written for that reader: no step waits on long deliberation; every decision is a
checklist item or a measurement, and a question the checklist cannot settle goes back to
the orchestrator as a marked item rather than being thought through in the lane.

```
Model: <the lane's>. Work through the checklist in the brief; do not deliberate
past it. Anything the checklist cannot settle is a marked question, not a guess.
Task: <one lane, one sentence>. Read-only: Read, Grep, Glob, Bash reads only; edit nothing.
Brief to read first: <this skill's brief for the lane, by repo path>.
Rules to read, by path, not restated: <.claude/rules/*.md the surface attaches>.
Surface: <the exact file list or route list, ranked one to five; never "the codebase">.
Governing passages: <quoted verbatim, or named by path and heading; never summarised>.
Oracle rows: <the expectation-table rows for this surface, verbatim>.
Already covered, skip: <the named sweeps and tracked issues whose ground is taken>.
Stop: fours and fives in full with every applicable class; ones to threes by recipe
only; one pass; stop when the list is walked. A count is never a target.
Return, and nothing else, one block per candidate:
  title | file:line | trace (oracle row, decision or invariant broken) | class number |
  expected severity | the reproduction that would prove it |
  the one-line break that would prove it | refutation attempted
Then, for each oracle row you were given: traced (with the file:line that meets or
breaks it) or not reached.
Then: the files read in full, the files sampled, and any human-owned question as a
marked item with context, options and your recommendation. Never guess an answer.
```

A refuter gets only the candidate block, its reproduction and the governing passage, and
is asked one question: is this real and does it matter. A lane hunter never sees another
lane's leads. Keep the brief under a screen; a brief that restates a rule the agent could
read is context spent twice.

### Phase G: verify every candidate

No candidate becomes a finding until the orchestrator refutes it. Verify in per-lane
batches and prune before dispatching the next lane:

1. Construct the counterfactual the finding implies and test it against the code: every
   consumer and every control-flow effect (middleware order, fall-through, the absence
   path), not only the obvious caller. For a dead-code claim, prove removal changes nothing
   observable, or drop it.
2. Have Lane R run the reproduction, re-run its command yourself, or run the existing test
   that drives the exact input and state. A test refutes the finding only if it asserts the design intent; a test that would
   still pass with the behavior broken refutes nothing. A passing test that contradicts
   clear design intent reclassifies the candidate: the test, and possibly the code, is the
   bug, and that is a `write-tests` hand-off plus a finding here.
3. Confirm the suggested fix is behavior-neutral except for the defect it removes.
4. Spot-check a sample of the lane's classifications against the cited catalog; the
   orchestrator has not read the catalogs, so a drifting classification is caught here.
5. Every survivor above Low gets one independent refutation pass in fresh context: one
   read-only subagent per lane batch that did not produce the candidates, given only the
   candidate, its reproduction and the governing passage, asked whether each is real and
   matters. The main session re-verifies each verdict.
6. Calibrate against the do-not-flag list (section 10) before recording.

A suspicion that survives only as a suspicion goes to the Leads section (section 9).

### Phase H: resolve, then finalize

No finding is finalized while it rests on a guess. Work every discrepancy through the
sources first; where they clearly determine the answer, record the finding with that
answer as its recommendation, for the maintainer to rule on with the plan. Where they do
not, the question goes to the human BEFORE the report is finalized, one at a time, each
self-contained with a recommendation derived from design intent. Classify each open design
decision by owner (CTO (project maintainer), IFPA secretary, IFPA Board (bylaw votes only:
funds account, dues and membership levels, election timing), legacy-site webmaster,
technical design) so the right person is asked. Only when every question is answered and
the section 2 criteria have been walked as a literal checklist does the plan get finalized:
the complete proposed `BUGS.md` content, the scope note and the coverage summary. Exit plan
mode; on approval, write `BUGS.md` exactly as approved and deliver the closing summary.

## 7. The discrepancy lane

The lane reads what the code does beside what the design clearly intends, worked out from
the authority order in root `CLAUDE.md` with the `design-intent` skill's standard for
"clear". The extended doc sync has already brought the documents, comments and code into
agreement or put each disagreement to the maintainer, so this lane looks for behavior, not
wording. Two outcomes:

- **Code bug.** The intent is clear; the code does not carry it. Routed to the
  implementation group with its trace and reproduction.
- **Unclear intent.** The sources leave two readings standing. This is never recorded as a
  finding: it is a question to the maintainer, asked one at a time under
  `.claude/rules/asking.md`, with the reading the intent best supports recommended.

Two shapes the lane always covers: harness guards that do not guard (a guard hook
bypassable by substitution or reordering, a permission only a hook carries, an agent chain
drifted from `settings.json`), deduped first against `scripts/ci/assert_claude_harness.sh`
and stopping where the guide marks a divergence deliberate (`REFERENCE.md` 4.4.48); and a
gate whose implementation covers less than its name or comment says, which is a
configuration defect here while a missing gate is a `write-tests` hand-off. The
orchestrator re-derives the intent itself before recording.

## 8. Fix recommendations start from design intent

Every finding carries a remediation recommendation, derived top-down:

1. Establish what the design intends from the authority order (governing documents, then
   design decisions, user stories, data model, rules and service contracts; for a harness
   finding, `docs/CLAUDE_CODE_GUIDE.md` and `claude-harness-governance.md`), re-reading the
   cited passages this run. State it in the finding's **Design intent** field. If the intent
   itself is the defect, the fix is a design fix saying what the corrected intent should be.
2. Name the defective layer (section 1), then descend to the minimal point of repair.
3. Recommend the minimal change, 1 to 3 lines, not a diff. If remediation needs design
   discussion, say so and stop short of drafting it.

Never recommend patching code to match a doc, or editing a doc to match code, without first
establishing which one is wrong.

## 9. Severity and output

**Severity** is one scale for all layers, per the risk rubric in `docs/TESTING.md`, and it
is calibrated from the reproduction: what the reproduction showed decides, not what the
class could in principle do. A class that can be Catastrophic lands as Medium when the
reproduction shows a cosmetic effect, and the finding says why.

Catastrophic: identity compromise or wrong-identity linking, broad PII or credential leak,
admin takeover, data loss, auth bypass, unsafe cutover, a harness bypass reaching code
execution or credential exfiltration. High: role escalation, single-record privacy leak,
unauthorized mutation, anti-enumeration bypass, session theft, silent loss of a
security-critical notification, missing webhook idempotency, divergent staging and
production adapters, a harness guard evadable in one step. Medium: a user-visible feature
break, public-record display error, operational workflow break, a silent break from a
non-shipped asset. Low: cosmetic issues, dead code, redundant guards, stale comments with
no behavioral consequence.

**Output.** Single sink: `BUGS.md` in the private operations checkout
(`footbag_private_repo/BUGS.md`, gitignored there), written once, after approval; on a machine
without that checkout, the session scratchpad. Groups in
order: (1) security and correctness severity sections (Catastrophic, High, Medium, Low; a
section exists only when it has findings), implementation findings and harness guard
bypasses; (2) design bugs (specification layer), ordered by severity; (3) pattern
divergence (`REFERENCE.md` 4.4B); (4) Leads (unverified): the only home for suspicions, admitted only when confirmation needs
expensive deep verification or staging or production access, each naming the step that
would settle it, no ID. One running B-ID sequence across all groups, continued from the
`Next finding ID` pointer; never reuse a retired ID.

```markdown
##### B<N>: <short title>

- **Layer:** design | implementation | discrepancy
- **Trace:** <the story criterion, design decision or domain invariant it breaks; none
  caps the finding at Low>
- **Location:** `src/<path>:<line>`, or the doc, rule or config section; cite both the
  governing text and the code when both exist
- **Class:** <a REFERENCE.md 4.4.x / 4.4B.x category, or a DESIGN.md category>
- **Owner:** <design and harness findings only: CTO (project maintainer) | IFPA secretary |
  IFPA Board (bylaw votes only) | legacy-site webmaster | technical design>
- **Verification:** <path traced and refutation attempted; fresh-context refutation
  (required above Low); rendered against the running app (visitor-facing)>
- **Design intent:** <what the design intends, naming the sources (section 8)>
- **Description:** <1 to 3 sentences>
- **Confidence:** reproduced | traced end to end, not reproduced
- **Evidence / reproduction:** <the command or request run and what it returned; a code
  citation alone is not a reproduction; or the two quoted passages for a discrepancy>
- **Impact:** <what fails, what leaks, who is affected, why it survives to production>
- **Suggested fix:** <design-intent-first; 1 to 3 lines>
- **Existing test coverage:** <"covered by tests/X.test.ts" | "no test covers this">
```

Design findings whose decision is still open are not recorded; they are asked (Phase H).

**Header.** The `BUGS.md` header records the coverage ledger's counts per status.

**Fresh-context re-audit instruction.** The `BUGS.md` header carries a standing instruction
to the remediation session: before acting on any finding, a fresh context re-resolves the
cited locations, re-derives the design intent from the named sources, attempts to refute
the finding, and confirms the recommended fix is minimal at the correct layer. A finding
that fails the re-audit is returned to the maintainer with the refutation.

**Remediation.** No finding is fixed in the hunt session. A finding leaves `BUGS.md` when
its fix lands. A test-gap hand-off goes to `write-tests` as a named defect class, never as
a `BUGS.md` finding.

## 10. Anti-patterns: what not to flag

False-positive calibrators, never suppression of verified bugs. When uncertain, verify to a
yes or no.

- "Hard to read", "file too long", untyped `any` without a runtime miscast, performance
  outside 4.4.47, "UX could be friendlier".
- Undelivered-feature absence, documented-deferred work, CAPTCHA criteria, the
  `legacy_data/` pipeline: status facts or exclusions.
- A missing test or gate with no named invariant; and even with one, it is a `write-tests`
  hand-off, not a finding here.
- Grammar or style preferences, speculative risks with no evidence, duplicates, anything
  that stops mattering after go-live.
- Harness: anything `scripts/ci/assert_claude_harness.sh` already pins, a divergence the
  guide marks deliberate, or a vendor-guidance observation (that is `update-config`'s).
- "Dead / unused / removable": a valid Low finding only after removal is proven
  behavior-neutral; an allow-list entry or middleware whose only effect is the absence path
  can be load-bearing.
- Document, comment and service-header drift, and every mechanical hygiene hit: the
  `extended-doc-sync` skill's, listed as a hand-off. Code that breaks the intent the stale
  text once carried is a code bug and stays.
- A pattern `scripts/ci/assert_conventions.sh` already gates: a hit means the gate is
  broken, a configuration defect, never a pattern finding.

## 11. Stopping condition: bounded, not exhaustive

One pass per lane. Lane 0 ranks every in-scope file one to five by the cost of a defect
there; fours and fives are read in full with every applicable category applied; ones to
threes are swept by the search recipes and by the categories their surface class invites,
and the ledger says so. The hunt is done when:

- (a) every surface class in the coverage ledger is marked read in full, sampled, or
  not-read with reason;
- (b) every category applicable to a four or five has been applied to it;
- (c) each lane's one pass has returned and been verified, and a final sweep for each
  major noun in the findings has run;
- (d) no criterion of a story behind a five-ranked surface is unchecked in the coverage
  ledger.

One discipline is mandatory. **Invert the question**: for every invariant and control,
construct the concrete input or request sequence that would violate it and show why the
code or design defeats the attempt; the failed construction is the evidence. The scenario
tabletop in `DESIGN.md` is optional: run it when the kickoff names a design area, or when a
lane's leads cluster on one flow.

A short findings list is a valid result. Never re-sweep to reach a count. Before closing,
confirm from the ledger that the auth, anti-enumeration, CSRF and member-state categories
were applied to every five.

## 12. After the write

End with one short summary: counts per group and severity; the two or three
highest-leverage findings in one sentence each; the `write-tests` hand-offs by defect
class; open decisions by owner (should be none); and the offer to plan remediation per
finding, gated by the maintainer, one at a time, starting from the fresh-context re-audit.

**Attack this skill, every run.** Where did its filters, exclusions, ranking or stopping
wording let a bug slip this run? Record concrete skill-improvement notes in the closing
summary; never edit the skill mid-hunt. **Close the loop on escaped defects**: a false
negative found after a hunt becomes a permanent deterministic check through `write-tests`;
a new class becomes a proposed catalog category. A false positive that survived
verification names the verification step that should have caught it.

**Calibration.** Every escaped defect becomes a seeded one in the replay corpus
(`footbag_private_repo/BUG_HUNT_CORPUS.md`): the one-line break that reintroduces it, its
file, its trace and the lane that should have caught it. After a change to this skill or
its briefs, apply each break to a scratch copy of the current tree, run the changed lanes
on it, and record each lane's recall in the corpus file. A lane or a discipline earns its
place by what it catches there.

## 13. Boundaries

- **`freestyle-bug-hunt`** owns trick CONTENT accuracy: the freestyle domain invariants and
  whether the doctrine is right. Everything else on the freestyle surfaces is fair game
  here. Only a candidate grounded in a freestyle domain rule hands off there.
- **`extended-doc-sync`** owns drift between documents, design intent, comments and code,
  and runs first; `doc-sync` owns the per-change check. This hunt lists a stale document
  as a hand-off to them, never a finding.
- **`write-tests`** owns every test and gate gap, including the escaped-defect check.
- **`update-config`** owns the harness review against vendor guidance and every harness
  edit; this hunt reports harness defects, edits nothing.
- **`scripts/ci/assert_claude_harness.sh`** is the deterministic harness self-check; the
  discrepancy lane dedups against it.
- Browser QA (`browser-qa`), the testing strategy (`docs/TESTING.md`) and remediation are
  out of scope.

## 14. Known limitations

- No live AWS contact and no GitHub-side settings visibility: record a narrow Lead or ask
  one question rather than guess.
- The bounded pass samples ones to threes; the ledger says what was sampled, and a defect
  there surfaces through the oracle rows, the noun sweep or a later hunt.
