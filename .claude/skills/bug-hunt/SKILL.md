---
name: bug-hunt
disable-model-invocation: true
description: Runs a bounded adversarial bug hunt over the footbag-platform repository across three defect layers - design and specification, implementation (security and correctness), and discrepancy (code against a document's wording against clear design intent, including Claude Code harness defects). Orchestrates read-only in plan mode in the MAIN session, dispatches lanes to read-only subagents, reproduces and refutes every candidate, and writes findings to BUGS.md only after plan approval; remediation happens in later sessions. Invoke ONLY when the user explicitly asks for a "bug hunt", "bug sweep" or "design bug hunt" by name. Do NOT infer it from "adversarial review", "security pass", "review the code", or "doc sync". Not a testing strategy, not a documentation audit and not browser QA.
---

# Bug Hunt: adversarial defect hunt across design, code and the discrepancies between them

> **Invoke ONLY on explicit request.** Run this skill exclusively when the user asks for a
> "bug hunt", "bug sweep", "design bug hunt" or "design bug sweep" by name. Do NOT infer it
> from "adversarial review", "security pass", "review the code/design/docs" or any general
> review phrasing: those mean a findings-only review in plan mode. A documentation audit is
> the `doc-sync` skill's full-audit mode; a test or gate gap is the `write-tests` skill's; a
> review of the harness against vendor guidance is the `update-config` skill's. When in
> doubt, ask before invoking.

**This skill orchestrates; it does not read the catalogs itself.** The method detail lives
in two briefs, each read by the subagent that sweeps that layer, never by the orchestrator,
which keeps the main session's context lean:

- `REFERENCE.md`: the implementation-layer category catalog (4.4.1 to 4.4.54, the last
  being the UI/UX lane's method), the design-pattern divergence catalog (4.4B),
  cross-cutting observations, calibration lenses and search recipes.
- `DESIGN.md`: the design-layer method: requirements quality, the threat model, the
  contract, data, migration and parity sweeps, the optional tabletop, the refutation
  checklist, the four personas and the design bug taxonomy.

## 1. Mission and defect layers

One hunt, three defect layers. Every finding names the layer that is defective, because the
layer routes the remediation (fix the spec, fix the code, or settle which side is wrong) and
misrouting a fix converts one bug into two:

- **Design/specification**: a requirement, design decision, contract, governance rule,
  migration rule or parity rule is ambiguous, contradictory, unsafe, unverifiable or
  missing, such that competent future code would still produce wrong production behavior.
  Definition in `DESIGN.md`.
- **Implementation**: deployed code fails a clear requirement, domain invariant, or
  security or correctness expectation: every class in the `REFERENCE.md` catalog.
- **Discrepancy**: the code, a document's literal wording and the clear design intent
  disagree. Clear intent decides, never the wording, because documents are often stale.
  Every discrepancy finding names which side looks wrong: a code bug, a stale document, or
  unclear intent, which is a question to the maintainer. Harness defects (a guard that does
  not guard, a rule against the design, the guide against the configuration) are
  discrepancies of this kind. Section 7.

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
expected outcomes written from its text before the code was read; each lane's one bounded
pass run (section 11); every candidate reproduced and refuted by the orchestrator, every
survivor above Low refuted again in fresh context; a coverage ledger for every surface
class; every question resolved one at a time before the plan was finalized; output
restricted to `BUGS.md`.

**Non-goals:** no browser QA, no redesign, no code or doc fixes, no test plan, no
speculative issues recorded as bugs, no remediation in the same session, and no
finding-count target: a short findings list is a valid result.

## 3. Hard constraints

- **Plan mode, read-only, end to end, in the MAIN session.** The orchestrator is not a
  forked skill, because only the main session can ask the human. The sole write is
  `BUGS.md`, after the maintainer approves the finalized plan.
- **Single deliverable, then a clean handoff.** Triage, fresh-context re-verification and
  graduation to the maintainers' private tracker happen in a later session; the `BUGS.md`
  header carries the standing re-audit instruction (section 9).
- **Ask the human one question at a time, before finalizing.** Resolve through the
  authority order first; when a genuine question survives, ask exactly one self-contained
  decision per message, plain English, no internal codes, one researched recommendation a
  bare "y" accepts. Never batch questions (`.claude/rules/asking.md`).
- **Dispatch research, verify centrally.** Read-only subagents each sweep one lane and read
  that lane's brief. A subagent conclusion is a lead, never a finding: the main session
  re-verifies every candidate against the cited lines. Subagents have no channel to the
  human; they return questions with context and a recommendation.
- **Reproduce before recording.** An implementation finding carries one concrete
  reproduction: a request against the local dev server (`./run_dev.sh`, local database
  only), a `sqlite3 -readonly` query against the local real-data build, a run of an existing
  test with `npx vitest run <file>`, or a throwaway probe in the session scratchpad that is
  never committed. Never staging or production. A candidate with no reproduction is a Lead
  naming the reproduction that would settle it.
- **Rendered confirmation for visitor-facing claims stays in the main session.** A finding
  about what a visitor sees is CONFIRMED only against rendered output, never templates
  alone; static tracing locates, the orchestrator renders. When the kickoff does not
  authorize running the app, the candidate is a Lead naming the render as its step.
- **Never stage, commit, push or pull.** No done-tracking: findings leave `BUGS.md` when
  their issue is filed or their fix lands; no closures, dates or RESOLVED markers.
- **No diagnose-and-remediate in one step.** Diagnose, report, stop. Concise output: no
  filler, no preamble, no emojis.

## 4. Scope

- **Implementation layer:** the deployed surface, derived fresh every run per
  `.claude/skills/deployed-surface/SKILL.md`.
- **Design layer:** all user stories and canonical docs; undelivered stories for design
  quality only. "Not built yet" is a status fact, never a finding.
- **Discrepancy layer:** every canonical doc, `.claude/rules/*`, `.claude/skills/*`, service
  file-header JSDoc, `docs/CLAUDE_CODE_GUIDE.md` and the `.claude/` configuration, each read
  against the code it governs and the intent behind both.
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
   read-only) plus the local gitignored `BUGS.md`. The label taxonomy lives in
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

Governance and IFPA pre-reads (`docs/DATA_GOVERNANCE.md`, `ifpa/*`) are loaded by the lane
whose candidate touches them and re-read by the orchestrator when it verifies.

## 6. Method: dispatch, verify, resolve

Each lane is a read-only subagent (`auditor` for code and config, `Explore` for surface
mapping) that reads its brief, sweeps its dimension once, and returns a structured **lead
list**: candidate, cited lines, reproduction attempted, refutation attempted, its
read-or-sampled inventory, and any human-owned question. Never file dumps.

### Dispatch table

| Lane | Subagent | Brief | Returns |
|------|----------|-------|---------|
| 0 Orient and surface | `auditor` / `Explore` | `.claude/skills/deployed-surface/SKILL.md` | deployed surface, story classification, file ranking, existing-`BUGS.md` audit, tracked-work exclusion list |
| 1 Design | `auditor` | `DESIGN.md` | design-layer candidates (requirements quality, threat model, contracts, migration gate-index audit) |
| 2 Implementation | `auditor` (may sub-split auth/session, payments, media, admin) | `REFERENCE.md` 4.4 and 4.4B | implementation candidates traced input to controller to service to DB to response, each with its reproduction |
| 3 Discrepancy | `auditor` | section 7 of this file, `REFERENCE.md` 4.4B and 4.4.48 | code-against-doc-against-intent candidates, each naming the side that looks wrong; harness defects deduped against the self-check |
| 4 UI/UX | `general-purpose` with the Playwright MCP tools, dev stack running | `REFERENCE.md` 4.4.54 | layout and usability candidates: page, viewport (390px and 1280px), offending selector, measured number; measured with the rendered-style helper, one snapshot per page per viewport, no screenshots |

Lane 4 runs only when the kickoff authorizes the dev stack (`./run_dev.sh`); otherwise the
ledger records it as not run. It is the one lane that is not read-only in the browser sense
(it loads pages and signs in through the persona switch); it submits no form.

The orchestrator owns the coverage ledger (each surface class read in full, sampled, or not
read with reason; "read" is not "analyzed"), rendered confirmation (section 3) and
calibration (section 10); briefs carry the do-not-flag list only as a pre-filter.

### Briefing a subagent

Nothing in the main session reaches a subagent: not memory, not this conversation, not the
rules already loaded here. The brief carries everything the agent needs, and nothing it
does not. One lane per agent, and the same shape for a lane hunter and a refuter:

Spawn every hunter and refuter with the Agent tool as `model: "opus"`, `effort: "medium"`,
and say so in the brief, so the budget is explicit on both sides. The skill and its briefs
are written for that reader: no step waits on long deliberation; every decision is a
checklist item or a measurement, and a question the checklist cannot settle goes back to
the orchestrator as a marked item rather than being thought through in the lane.

```
Model: Opus, effort medium. Work through the checklist in the brief; do not deliberate
past it. Anything the checklist cannot settle is a marked question, not a guess.
Task: <one lane, one sentence>. Read-only: Read, Grep, Glob, Bash reads only; edit nothing.
Brief to read first: <this skill's brief for the lane, by repo path>.
Rules to read, by path, not restated: <.claude/rules/*.md the surface attaches>.
Surface: <the exact file list or route list, ranked one to five; never "the codebase">.
Governing passages: <quoted verbatim, or named by path and heading; never summarised>.
Already covered, skip: <the named sweeps and tracked issues whose ground is taken>.
Stop: fours and fives in full with every applicable class; ones to threes by recipe
only; one pass; stop when the list is walked. A count is never a target.
Return, and nothing else, one block per candidate:
  title | file:line | reproduction command and its output | class number |
  severity from the reproduction | confidence (reproduced | traced, not reproduced) |
  the one-line break that would prove it | refutation attempted
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
2. Run the reproduction yourself, or run the existing test that drives the exact input and
   state. A test refutes the finding only if it asserts the design intent; a test that would
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
sources first; where they clearly determine the answer, act without asking. Where they do
not, the question goes to the human BEFORE the report is finalized, one at a time, each
self-contained with a recommendation derived from design intent. Classify each open design
decision by owner (CTO (project maintainer), IFPA secretary, IFPA Board (bylaw votes only:
funds account, dues and membership levels, election timing), legacy-site webmaster,
technical design) so the right person is asked. Only when every question is answered and
the section 2 criteria have been walked as a literal checklist does the plan get finalized:
the complete proposed `BUGS.md` content, the scope note and the coverage summary. Exit plan
mode; on approval, write `BUGS.md` exactly as approved and deliver the closing summary.

## 7. The discrepancy lane

The lane reads three things side by side for each surface it covers: what the code does,
what the governing text says (a canonical doc passage, a rule, a skill step, a service
file-header JSDoc, the harness guide, or a `.claude/` configuration line), and what the
design clearly intends, worked out from the authority order in root `CLAUDE.md` with the
`design-intent` skill's standard for "clear". Three outcomes, and every finding states
which:

- **Code bug.** The intent is clear and the text carries it; the code does not. Routed to
  the implementation group with its reproduction.
- **Stale document.** The intent is clear and the code carries it; the text does not.
  Recorded in the discrepancy group with the passage quoted and the superseding code cited.
  Repair happens downstream through `doc-sync`, never here.
- **Unclear intent.** The sources leave two readings standing. This is never recorded as a
  finding: it is a question to the maintainer, asked one at a time under
  `.claude/rules/asking.md`, with the reading the intent best supports recommended.

Three shapes the lane always covers: service file-header JSDoc against its service and the
design-pattern rules against the code they govern, in both directions (`REFERENCE.md`
4.4B); harness defects (a guard hook that does not guard, a permission only a hook carries,
an agent chain drifted from `settings.json`, a rule against the design, the guide describing
behavior the configuration no longer has), deduped first against
`scripts/ci/assert_claude_harness.sh` and stopping where the guide marks a divergence
deliberate (`REFERENCE.md` 4.4.48); and a gate whose implementation covers less than its
name or comment says, which is a configuration defect here while a missing gate is a
`write-tests` hand-off. The lane returns the three readings quoted or cited and its verdict
on which side looks wrong; the orchestrator re-derives the intent itself before recording.

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

## 9. Severity, output and graduation

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

**Output.** Single sink: `BUGS.md` at the repo root, written once, after approval. Groups in
order: (1) security and correctness severity sections (Catastrophic, High, Medium, Low; a
section exists only when it has findings), implementation findings and harness guard
bypasses; (2) design bugs (specification layer), ordered by severity; (3) discrepancy and
hygiene findings (stale documents, JSDoc drift, pattern divergence, guide-against-config);
(4) Leads (unverified): the only home for suspicions, admitted only when confirmation needs
expensive deep verification or staging or production access, each naming the step that
would settle it, no ID. One running B-ID sequence across all groups, continued from the
`Next finding ID` pointer; never reuse a retired ID.

```markdown
##### B<N>: <short title>

- **Layer:** design | implementation | discrepancy
- **Side that looks wrong:** code | document | (discrepancy findings only)
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

**Fresh-context re-audit instruction.** The `BUGS.md` header carries a standing instruction
to the remediation session: before acting on any finding, a fresh context re-resolves the
cited locations, re-derives the design intent from the named sources, attempts to refute
the finding, and confirms the recommended fix is minimal at the correct layer. A finding
that fails the re-audit is returned to the maintainer with the refutation.

**Graduation.** After the human approves the findings, graduate each into an issue per the
`tracker-ops` skill, the single home for the procedure. A finding leaves `BUGS.md` when its
issue is filed or its fix lands. A test-gap hand-off goes to `write-tests` as a named defect
class, never as a `BUGS.md` finding.

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
- A mechanical hygiene hit (a doc path in a comment, a stale token, a bare section number):
  `doc-sync`'s full audit, not this hunt. A stale comment that misstates behavior is a
  discrepancy finding and stays.

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
- (d) the four personas have each taken one pass over the findings and the fours and fives
  (below).

Two disciplines are mandatory. **Invert the question**: for every invariant and control,
construct the concrete input or request sequence that would violate it and show why the
code or design defeats the attempt; the failed construction is the evidence. **The four
personas**, run as a second pass with fresh eyes, each a separate read-only subagent given
the findings so far and the five-ranked files: the hostile visitor (what can I read, link,
replay or cause to be sent without an account); the careless legitimate member, including
the legacy claimant (what do I break by doing the ordinary thing twice, out of order, or on
the wrong record); the pressed administrator or operator (what does a hurried admin or a
script run with the wrong flag destroy, and does anything stop it); the privacy and security
reviewer (what crosses an audience boundary, who can tell a record exists, what is kept
longer than its purpose). The scenario tabletop in `DESIGN.md` is optional: run it when the
kickoff names a design area, or when a lane's leads cluster on one flow.

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

## 13. Boundaries

- **`freestyle-bug-hunt`** owns trick CONTENT accuracy: the freestyle domain invariants and
  whether the doctrine is right. Everything else on the freestyle surfaces is fair game
  here. Only a candidate grounded in a freestyle domain rule hands off there.
- **`doc-sync`** owns documentation repair, and its explicit full-audit mode owns the
  mechanical detectors across the whole documentation universe. This hunt records a stale
  document as a discrepancy finding; repair happens downstream.
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
  there surfaces through the personas, the noun sweep or a later hunt.
