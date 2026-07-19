---
name: bug-hunt
disable-model-invocation: true
description: Runs a disciplined adversarial bug hunt over the footbag-platform repository across five defect layers - design/specification, implementation (security/correctness), verification gaps, documentation drift (the full doc-sync audit), and Claude Code harness bugs. Orchestrates read-only in plan mode in the MAIN session, dispatches lanes to read-only subagents, verifies every candidate, and writes findings to BUGS.md only after plan approval; remediation happens in later sessions. Invoke ONLY when the user explicitly asks for a "bug hunt", "bug sweep", "design bug hunt", "extended doc sync", or "full doc-sync audit" by name. Do NOT infer it from "adversarial review", "security pass", "review the code/design/docs", or plain "doc sync". Not a testing strategy and not browser QA.
---

# Bug Hunt — adversarial defect hunt across design, code, docs, verification, and the harness

> **Invoke ONLY on explicit request.** Run this skill exclusively when the user asks for a
> "bug hunt", "bug sweep", "design bug hunt", "design bug sweep", "extended doc sync", or
> "full doc-sync audit" by name. Do NOT infer it from "adversarial review", "security
> pass", "review the code/design/docs", plain "doc sync", or any general review phrasing —
> those mean a general findings-only review done in plan mode (or the narrow `doc-sync`
> skill), not this full-surface BUGS.md-writing sweep. When in doubt, ask before invoking.

**This skill orchestrates; it does not read the catalogs itself.** The heavy method detail
lives in four sidecar briefs, each read by the subagent that sweeps that layer, never by
the orchestrator — that is what keeps the main session's context lean (CLAUDE_CODE_GUIDE §2):

- `REFERENCE.md` — the implementation-layer category catalog (§4.4.1–48), the hygiene
  catalog (§4.4B.1–8), cross-cutting observations, external security calibration lenses,
  static search recipes, and the testing/CI punch-list detail (§5.1–5.6).
- `DESIGN.md` — the design-layer method: requirements-quality checks, the threat model,
  contract/data/migration/parity sweeps, the scenario tabletop, the design-finding
  refutation checklist, reviewer personas, and the design bug taxonomy.
- `DOCSYNC.md` — the documentation-layer method: the doc universe and ledger, drift
  classification, the mechanical pre-pass, cross-document and diagram/glossary
  reconciliation, rules/skills sync, and the four locator/comment detectors.
- `HARNESS.md` — the harness-layer method: the `.claude` surface, the drift-direction rule
  and taxonomy, the vendor-guidance arm and its churn filter, the CI-dedup procedure, and
  the harness bug categories.

## 1. Mission and defect taxonomy

One hunt, five defect layers. Every finding names the layer that is actually defective,
because the layer routes the remediation — fix the spec, fix the code, add the check, fix
the text, or fix the config — and misrouting a fix (patching code to satisfy a wrong doc,
or rewording a doc to bless wrong code) converts one bug into two:

- **Design/specification** — a requirement, design decision, contract, data-governance
  rule, migration/go-live rule, or parity rule is ambiguous, contradictory, unsafe,
  unverifiable, or missing, such that competent future code would still produce wrong
  production behavior. Full definition in `DESIGN.md`.
- **Implementation** — deployed code fails a clear requirement, domain invariant, or
  security/correctness expectation: logic, auth, privacy, data-integrity, race, and every
  other class in the `REFERENCE.md` catalog.
- **Verification** — a deterministic check that is cheap, stable, and would pin a known
  defect class does not exist, or an existing gate does not cover what it claims. A testing
  gap is a bug with real severity, never a nicety.
- **Documentation/hygiene** — the full synchronization audit of the committed documentation
  universe: stale comments and JSDoc, README and md files that misstate the repo,
  cross-document contradictions, diagram/glossary drift, broken references, terminology
  divergence, and `.claude` rules/skills whose clauses the code has outgrown. Every sync
  finding states its drift direction (`DOCSYNC.md`).
- **Harness** — the `.claude/` configuration is reviewed production code (CLAUDE_CODE_GUIDE
  §11); a defective hook, permission, rule, skill, or agent misdirects every future
  session. Audited against `docs/CLAUDE_CODE_GUIDE.md` (design rationale) and
  `.claude/rules/claude-harness-governance.md` (change-control), and against current
  Anthropic guidance, which is not static. Full method in `HARNESS.md`.

Do not assume the docs are right. When code and a doc disagree, the defect may sit in
either, in both, or in a missing tracked deviation. Reason from the platform goal, the
domain invariants, and the authority order in root `CLAUDE.md`; never silently pick a side.

The hunt is complementary to the test suite and to `scripts/ci/assert_claude_harness.sh`,
never a substitute for either. Hunt for what those cannot catch — design ambiguity,
cross-document contradiction, missing controls, drift, hook bypasses — and for what the
existing gates fail to cover.

## 2. Prompt contract

**Role:** white-hat adversarial reviewer for this repository — careful maintainer, security
engineer, domain analyst, harness engineer, and hostile user trying to find real defects
before production does. Reject what violates the design even when it "works"; refute your
own candidates before believing them.

**Objective:** produce a verified findings report in `BUGS.md` covering all five layers,
with every ambiguity resolved by the maintainer before the file is written.

**Success criteria for the hunt itself:**

- The deployed surface was re-derived from the repo this run, never trusted from any list;
  every user story classified per `.claude/rules/deployed-surface.md`; every deployed story
  held to 100% of its success criteria against code.
- The documentation universe was enumerated (`DOCSYNC.md`); the design layer was swept with
  the `DESIGN.md` method including the threat model and migration gate-index audit; the
  implementation surface was swept against the `REFERENCE.md` catalog; the harness surface
  was swept per `HARNESS.md` and deduped against the deterministic self-check.
- Every candidate — from any lane — was re-verified by the orchestrator and actively
  refuted before recording; security/correctness survivors got an independent fresh-context
  adversarial second pass.
- A coverage ledger accounts for every surface class read or explicitly not read; the sweep
  looped until two consecutive re-dispatches surfaced no new candidate.
- Every question a finding raised was resolved through `.claude/rules/asking.md`, one at a
  time, before the plan was finalized; the output is actionable, minimal, and restricted to
  `BUGS.md`.

**Non-goals:** no browser QA, no redesign, no code or doc fixes, no test plan, no
speculative issues recorded as bugs, no remediation in the same session.

## 3. Hard constraints

- **Plan mode, read-only, end to end, in the MAIN session.** The entire hunt runs inside
  plan mode. The orchestrator stays in the main session — it is NOT a forked/subagent skill
  — because only the main session can ask the human. The sole write this skill ever
  performs is `BUGS.md`, and only after the maintainer approves the finalized plan.
- **Single deliverable, then a clean handoff.** The hunt produces one readable findings file
  (`BUGS.md`) and stops. Processing, triage, fresh-context re-verification, and graduation
  to the maintainers' private tracker happen in a **separate later session**, never in the
  hunt session; the `BUGS.md` header carries the standing re-audit instruction (§9).
- **Ask the human one question at a time, before finalizing.** Resolve through the authority
  order first; when a genuine question survives, ask exactly one self-contained decision per
  message, in plain English with no internal codes, with one researched recommendation a
  bare "y" accepts. Do not batch questions; ask the highest-leverage blocker first
  (`.claude/rules/asking.md`).
- **Dispatch research, verify centrally.** Read-only subagents each sweep one lane and read
  that lane's brief; the orchestrator never reads the sidecars. A subagent conclusion is a
  lead, never a finding: the main session re-verifies every candidate against the cited
  lines. Subagents have no channel to the human; they return questions with context and a
  recommendation, and the main session raises them under the asking rule.
- **Never stage, commit, push, or pull.** The maintainer owns git. No done-tracking:
  findings leave `BUGS.md` when their issue is filed or their fix lands; no closures, dates,
  or RESOLVED markers anywhere.
- **Rendered confirmation for visitor-facing claims stays in the main session.** A finding
  asserting what a *visitor sees* — a wrong rendered value, dead link, leaked jargon, or a
  contradiction between two pages — is CONFIRMED only against rendered output (render the
  page against the running app), never against templates alone. Verification is central, so
  this confirmation is never delegated to a lane: static tracing *locates* the candidate; the
  orchestrator *renders* to confirm. When the kickoff does not authorize running the app, the
  candidate is recorded as a Lead naming the render as its confirming step, not asserted as a
  finding.
- **No diagnose-and-remediate in one step.** Diagnose, report, stop.
- Concise communication. No filler, no preamble, no emojis in this skill's outputs.

## 4. Scope

- **Implementation-layer scope = the deployed surface**, derived fresh every run per
  `.claude/rules/deployed-surface.md`. Everything deployed is in scope by default.
- **Design-layer scope = all user stories and canonical docs**, including undelivered
  stories under the undelivered-work gate: only their design quality is reviewable. "Not
  built yet" is a status fact, never a finding.
- **Documentation-layer scope = every committed human-readable surface**, enumerated as a
  universe (`DOCSYNC.md`), respecting `doc-governance.md`.
- **Harness-layer scope = the `.claude/` configuration and `docs/CLAUDE_CODE_GUIDE.md`**
  (`HARNESS.md`), deduped against `scripts/ci/assert_claude_harness.sh`.
- **Tracked deviations are not findings.** A behavior matching an open issue in the
  maintainers' private tracker is accepted; the check is bidirectional (a stale tracker
  issue is itself a finding).
- **Standing exclusions:** CAPTCHA acceptance criteria (Turnstile deferred by design); the
  `legacy_data/` pipeline code unless the kickoff prompt includes it (migrated data shaping
  deployed routes is always in scope); migration and go-live *design* is always in scope.
  Per-run exclusions come only from the kickoff prompt and are recorded in the scope note.
- **Post-go-live source of truth:** after go-live the production database and live platform
  are the source of truth; legacy feeds, mirror data, dump, and curated CSVs are migration
  inputs only. Flag any design or code implying a runtime dependency on migration inputs
  after go-live unless a canonical doc explicitly retains one.
- **Verification-layer scope:** tests and gates for deployed stories and technical features
  already in code. No test findings for code that has not been written.
- **Scaling:** the full method serves the explicit comprehensive hunt. For a narrowly scoped
  ask, dispatch only the relevant lanes and declare in the scope note which lanes were
  skipped and why.
- Do not print raw member PII, password hashes, tokens, or credential-like values in any
  output, including findings.

## 5. Orient (orchestrator) — load the minimum

The orchestrator loads only what it needs to dispatch and verify; each lane loads its own
pre-reads through its brief.

1. This file and the sidecar tables of contents.
2. Root `CLAUDE.md` — the authority order (do not restate it; it lives there).
3. Dispatch **Lane 0** to build the tracked-work exclusion list: open issues from the
   maintainers' private tracker (`gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open`,
   read-only, auto-approved) plus the local gitignored `BUGS.md`. The tracker's label
   taxonomy lives in `TRACKER_GUIDE.md` (private GitHub repo), its single home — read the
   current set there or from the live tracker, never from an embedded copy. If
   `FOOTBAG_PRIVATE_REPO` is unset, say exactly one line that the tracker is not wired on
   this machine (the env var lives in the gitignored `.claude/settings.local.json`), then
   proceed with `BUGS.md` alone as the exclusion source; never hard-fail.
4. Have Lane 0 (with the exclusion-list build) audit every existing `BUGS.md` entry against
   the current repo — re-resolve each cited location, confirm the defect persists, mark landed
   fixes for removal — and verify the results centrally. Corrections land
   in the final approved write; nothing is written yet.

The user-scope project memory (`MEMORY.md`) autoloads; respect every behavioral rule there.
Governance/PII/IFPA pre-reads (`docs/DATA_GOVERNANCE.md`, `ifpa/*`) are loaded by the lane
whose candidate touches them, and re-read by the orchestrator when it verifies that
candidate.

## 6. Method — dispatch, verify, resolve

Run per-lane passes, never one omnibus read. Each lane is a read-only subagent (`auditor`
for code/config sweeps, `researcher` for live vendor guidance, `Explore`/`general-purpose`
for surface mapping) that reads its brief, sweeps its dimension, and returns a structured
**lead list** — candidate, cited lines, refutation attempted, its read/analyzed inventory,
and any human-owned question — never file dumps. For a scoped run, dispatch only the lanes
that bear on the ask and say so in the scope note.

### Dispatch table

| Lane | Subagent | Brief | Returns |
|------|----------|-------|---------|
| 0 Orient & surface | `auditor` / `Explore` | `deployed-surface.md` | deployed surface, story classification, existing-`BUGS.md` audit, tracked-work exclusion list |
| 1 Design | `auditor` | `DESIGN.md` | design-layer candidates (requirements quality, threat model, contracts, tabletop, migration gate-index audit) |
| 2 Implementation | `auditor` (may sub-split auth/session, payments/webhooks, media/archive, admin/curator) | `REFERENCE.md` §4.4 | implementation candidates traced input→controller→service→DB→response |
| 3 Doc/hygiene | `auditor` | `DOCSYNC.md` + `REFERENCE.md` §4.4B | doc-drift and hygiene candidates with drift direction |
| 4 Verification/CI | `auditor` | `REFERENCE.md` §5 | missing/under-covering gate candidates, each naming the invariant and closest home |
| 5 Harness | `auditor` + `researcher` | `HARNESS.md` | harness candidates classified by drift direction; vendor-staleness cited to a URL + concrete consequence |

### Discipline the orchestrator owns (never delegated to a lane)

- **Coverage ledger.** The orchestrator holds it; every lane returns its read/analyzed
  inventory, so the ledger records every surface class as read, not-read (with reason), or
  analyzed. "Read" is not "analyzed".
- **Hygiene coverage does not narrow.** "Every comment and JSDoc in every file read —
  audited, not sampled" must survive lane-splitting: Lane 3's dispatch receives the merged
  file list read by all lanes, so hygiene is applied to the union, not to one lane's slice;
  Lane 3 therefore runs (or re-runs) after the other lanes return, when that union is known.
- **Rendered confirmation** happens centrally (§3), never in a lane.
- **§10 calibration** is applied authoritatively by the orchestrator; lane briefs carry the
  §10 do-not-flag list only as a pre-filter to cut obvious noise before returning leads.

### Phase G — verify every candidate

No candidate becomes a finding until the orchestrator refutes it. Verify in **per-lane
batches and prune before dispatching the next lane**, so the re-read cost of verification
does not accumulate into a lead flood:

1. Construct the counterfactual the finding implies and test it against the code — every
   consumer and every control-flow effect (middleware ordering, fall-through, the
   negative/absence path), not just the obvious caller. For a dead-code claim, prove removal
   changes nothing observable, or drop it.
2. Grep `tests/` for a test pinning the behavior. A passing correct test refutes the
   finding. A passing test that contradicts clear design intent reclassifies the candidate:
   the test (and possibly the code) is the bug.
3. Confirm the suggested fix is behavior-neutral except for the defect it removes.
4. For a lane's classification (class + the class's one-line definition it returned),
   spot-check a sample against the cited catalog rather than rubber-stamping wholesale; the
   orchestrator has not read the catalogs, so a drifting classification is a rigor risk to
   catch here.
5. Security/correctness survivors get an independent adversarial second pass in fresh
   context — a read-only subagent that did not produce the candidate, instructed to refute
   it. The main session re-verifies the verdict.
6. Calibrate against the do-not-flag list (§10) before recording.

A suspicion that survives only as a suspicion goes to the `BUGS.md` Leads section (§9),
never into a findings group.

### Phase H — resolve, then finalize

No finding is finalized while it rests on a guess. Work every drift through the sources
first; where they clearly determine the answer, act without asking. Where they do not, the
question goes to the human BEFORE the report is finalized, one at a time, each self-contained
with a recommendation derived from design intent (`.claude/rules/asking.md`). Classify each
design-layer open decision by owner (project maintainer, IFPA board, legacy-site webmaster,
technical design) so the right person is asked. Only when every question is answered, and the
§2 success criteria have been walked as a literal checklist, does the plan get finalized: it
presents the complete proposed `BUGS.md` content — new findings, corrected entries, removals
— plus the scope note and coverage summary. Exit plan mode; on approval, write `BUGS.md`
exactly as approved and deliver the closing summary (§12).

## 7. Fix recommendations start from design intent

Every finding carries a remediation recommendation, derived top-down, never a reflex patch:

1. Establish what the design intends for the affected behavior, from the authority order —
   governing documents, then design decisions/user stories/data model/rules/service
   contracts (for a harness finding, `docs/CLAUDE_CODE_GUIDE.md` and
   `claude-harness-governance.md`) — re-reading the cited passages this run and
   triangulating across more than one source. State that intent in the finding's **Design
   intent** field. If the intent itself is the defect, the fix is a design fix that says
   what the corrected intent should be.
2. Name the defective layer (§1). Then descend through the contract, schema, and code path
   to the minimal point of repair.
3. Recommend the minimal change at that layer, 1–3 lines, not a diff. If remediation
   genuinely requires design discussion, say "remediation requires design discussion" and
   stop short of drafting it.

Never recommend patching code to match a doc, or editing a doc to match code, without first
establishing which one is wrong.

## 8. Severity — one scale for all layers

Per `docs/TESTING.md` §3, applied to every group. Severity measures the surface a defect (or
missing check) leaves exposed — a verification gap on a catastrophic surface is not Low.

- **Catastrophic** — identity compromise or wrong-identity linking, broad PII/credential
  leak, admin takeover or privilege-escalating design, data loss, irreversible corruption,
  auth bypass, unsafe cutover/rollback, underspecified ballot anonymity/integrity, a
  critical data domain with no post-go-live source-of-truth handoff, or a harness bypass
  that reaches code execution or credential exfiltration.
- **High** — role escalation, single-record privacy leak, unauthorized state mutation,
  anti-enumeration bypass, session theft, silent loss of a security-critical notification, a
  missing migration validation gate, missing webhook idempotency, materially divergent
  staging/production adapters, or a harness guard evadable in one documented step.
- **Medium** — user-visible feature break, public-record display error, operational-role
  workflow break or ambiguity, a silent feature break from a non-shipped runtime asset.
- **Low** — cosmetic issues, provably dead code, redundant guards, suboptimal messages,
  stale comments without behavioral consequence, non-blocking traceability gaps.

## 9. Output specification

Single sink: `BUGS.md` at the repo root, written once, after plan approval. No other file is
produced. Groups, in order:

1. **Security/correctness severity sections** (Catastrophic, High, Medium, Low; a section
   exists only when it has findings) — implementation-layer findings, and harness findings
   whose defect is a guard bypass or permission hole.
2. **Design bugs (specification layer)** — design-layer findings, ordered by severity, and
   harness findings whose defect is a permission/hook design gap.
3. **Design-divergence and hygiene** — documentation/hygiene-layer findings, ordered by
   severity, and harness findings whose defect is guide-vs-config drift.
4. **Testing and CI/CD verification gaps** — verification-layer findings, and harness
   findings whose defect is a missing fixture or self-check gap.
5. **Leads (unverified)** — the only home for suspicions. Admission is narrow: record a lead
   ONLY when confirmation requires expensive deep verification or staging/production access.
   Ordinary uncertainty is resolved during the hunt. Leads carry no ID and each names the
   step that would confirm or refute it.

Harness findings are placed in the group matching their remediation nature (above), with the
**Layer** field marking them `harness`. **One running B-ID sequence across all groups.**
Continue from the `Next finding ID` pointer; never reuse a retired ID; group placement, not
ID shape, shows the layer.

Per-finding structure:

```markdown
##### B<N> — <short title>

- **Layer:** design | implementation | verification | documentation | harness
- **Location:** `src/<path>:<line>`, or the doc/rule/config section for design, doc, and
  harness findings; cite both the governing text and the code that exposes it when both exist
- **Class:** <a REFERENCE.md §4.4.x / §4.4B.x, DESIGN.md, DOCSYNC.md, or HARNESS.md category>
- **Owner:** <design/harness findings only: project maintainer | IFPA board | legacy-site
  webmaster | technical design>
- **Verification:** <how it was confirmed: path traced and refutation attempted;
  fresh-context adversarial second pass (required for security/correctness); mechanical
  re-check of quoted evidence (hygiene); rendered against the running app (visitor-facing)>
- **Design intent:** <what the design intends for this behavior, naming the sources (§7)>
- **Description:** <1–3 sentences>
- **Evidence / reproduction:** <concrete steps, code citation, or doc-contradiction quote;
  for a harness case-(c) finding, the vendor claim, its URL, and the concrete consequence>
- **Impact:** <what fails, what leaks, who is affected, why it survives to production>
- **Suggested fix:** <design-intent-first per §7; 1–3 lines>
- **Existing test coverage:** <"covered by tests/X.test.ts" | "no test covers this">
```

A verification-layer finding names the exact missing or under-covering check, the invariant
it pins, the closest home (`package.json`, `scripts/ci/*`, workflow, test dir), and its tier
— never "needs more tests". Design/harness findings whose decision is still open are not
recorded as findings; they are asked (§6.H).

**Aggregation of systemic hygiene patterns.** When a mechanical detector finds the same
hygiene pattern many times, record ONE finding per pattern-per-document with a count and two
or three representative examples (`DOCSYNC.md`), so hundreds of Low hygiene rows never bury a
catastrophic finding. A single instance that changes meaning keeps its own finding.

**Fresh-context re-audit instruction.** The `BUGS.md` header written by the hunt carries a
standing instruction to the remediation session: before acting on any finding, a fresh
context (a session or subagent that did not produce the report) performs a skeptical
adversarial re-audit of that finding AND its recommended remediation — re-resolve the cited
locations, re-derive the design intent from the named sources, attempt to refute the finding,
and confirm the recommended fix is minimal at the correct layer and behavior-neutral except
for the defect it removes. A finding that fails the re-audit is returned to the maintainer
with the refutation, never silently remediated or dropped.

**Graduation to the maintainers' private tracker.** After the human approves the findings,
graduate each confirmed finding into an issue per the `tracker-ops` skill, the single home
for the procedure: one issue per finding, its lane plus `bug`, and the exact `gh issue
create` run under that skill's mutation policy. A finding leaves `BUGS.md` when its issue is
filed or its fix lands; when the tracker is unwired, skip drafting with the one-line note
from §5.

## 10. Anti-patterns — what not to flag

False-positive calibrators, never suppression of verified bugs. When uncertain, verify to a
yes or no; a verified bug is a finding regardless of how it feels.

- "Hard to read", "file too long", "this `any` should be typed" (unless a real runtime
  miscast), performance suggestions outside the narrow §4.4.47 category, "UX could be
  friendlier" — out of scope.
- Undelivered-feature absence, documented-deferred work, CAPTCHA criteria, the
  `legacy_data/` pipeline (unless included) — status facts or exclusions, not findings.
- Vague coverage complaints with no named invariant — excluded; but a missing
  mandatory-class check is a real severity-carrying finding: name the exact check and
  invariant.
- Grammar/style preferences in docs, "could be nicer" refactors, speculative risks with no
  evidence, duplicates, anything that stops mattering after go-live.
- Harness: a case-(c) vendor-staleness lead with no cited claim/URL/consequence, or a
  re-report of something `scripts/ci/assert_claude_harness.sh` already pins, or a divergence
  the guide marks deliberate — all churn, not findings (`HARNESS.md`).
- "Dead / unused / removable" — a valid Low finding only after removal is proven
  behavior-neutral: trace every consumer AND every control-flow effect, and grep `tests/`
  for a pinning test. An allow-list entry or middleware whose only effect is the absence
  path can be load-bearing.
- "This adapter has no staging smoke" for HttpReachability / ImageProcessing /
  VideoTranscoding — intentional per `docs/TESTING.md` §7.2.
- Stale comments, behavioral duplication drift, and wrong error classes are NOT excluded —
  they are first-class §4.4B findings.

## 11. Stopping condition — exhaustion, not step completion

The standard is the most exhaustive correct audit static review can produce: every bug the
in-scope surface can yield, no finding-count cap. The hunt is done when:

- (a) every surface class in the coverage ledger (controllers, services, middleware,
  adapters, libs, templates, workers, client JS, routes, config, scripts, terraform,
  systemd, hooks, canonical docs, rules, skills, agents) is marked read or carries an
  explicit not-read reason;
- (b) every applicable category has actually been applied to every surface it can touch —
  "read" is not "analyzed";
- (c) two consecutive lane re-dispatches, each given the prior candidate list, surface no
  new candidate (dryness), including a final sweep for each major noun in the findings; and
- (d) a completeness critic has asked "which class, surface, actor, story, or success
  criterion did this run not touch?" and the answer list is empty or itself swept.

Two disciplines are mandatory. **Invert the question**: for every invariant and control, do
not conclude "looks enforced" — construct the concrete input or request sequence that would
violate it and show why the code or design defeats that attempt; the failed construction is
the evidence. **Run the reviewer personas** in `DESIGN.md` as a second pass with fresh eyes.
If the run finds zero catastrophic and fewer than three high findings, re-verify the auth,
anti-enumeration, and CSRF sweeps actually ran before concluding the surface is clean.

## 12. After the write

End with one short summary to the maintainer: counts per group and severity; the two or
three highest-leverage findings in one sentence each; open decisions by owner (should be
none — resolved in §6.H); and the offer to plan remediation per finding, gated by the
maintainer, one finding at a time. Do not auto-proceed to remediation, and remind the
maintainer that remediation starts with the fresh-context re-audit the `BUGS.md` header
mandates (§9).

**Attack this skill, every run.** Spend a final explicit step on the skill itself: where did
its filters, exclusions, dispatch boundaries, or stopping wording let a bug slip or excuse
incompleteness this run? Treat every default exclusion as a hypothesis to re-justify against
this run's evidence. Record concrete skill-improvement notes in the closing summary; never
edit the skill mid-hunt. A run that found the skill flawless must say what it tried to break.

**Close the loop on escaped defects.** Any false negative discovered after a hunt becomes a
permanent deterministic check — a regression test or CI gate — so that class cannot escape
again; a genuinely new class becomes a proposed new catalog category. A false positive that
survived verification gets the same treatment: identify which verification step should have
caught it and propose the gap-closing edit.

## 13. Boundaries

- **`freestyle-bug-hunt`** is separate only for the accuracy of trick CONTENT — the
  freestyle domain invariants and whether the doctrine itself is right. Everything else on
  the freestyle surfaces is fair game here: the full generic sweep of freestyle routes, the
  design quality of freestyle stories and contracts, and doc/page drift on freestyle
  surfaces. Only a candidate grounded in a freestyle domain rule hands off there.
- **`doc-sync`** is the separate narrow, change-driven drift-repair skill and is not part of
  this hunt; this skill reports documentation findings to `BUGS.md`, and their repair happens
  downstream in later sessions.
- **`assert_claude_harness.sh`** is the deterministic harness self-check; Lane 5 dedups
  against it and never re-reports what it pins (`HARNESS.md`).
- Browser QA (`browser-qa`), the testing strategy (`docs/TESTING.md`), and remediation are
  out of scope. The report is the deliverable: fresh sessions remediate later, each starting
  from the fresh-context re-audit (§9).

## 14. Known limitations

- No live AWS contact and no GitHub-side settings visibility (branch protection, SES state):
  record a narrow Lead or ask one question rather than guess.
- Static analysis first: runtime behavior is exercised only if the kickoff prompt authorizes
  it; concurrency and infrastructure-only defects may end as Leads. No browser-level testing.
- The harness vendor-guidance check is only as fresh as the `researcher` lane's fetch; when
  the web is unavailable, Lane 5 still runs its self-consistency and bypass arms and records
  the vendor arm as not-run in the ledger, rather than guessing at current Anthropic advice.
