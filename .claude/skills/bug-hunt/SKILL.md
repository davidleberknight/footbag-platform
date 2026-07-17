---
name: bug-hunt
disable-model-invocation: true
description: Runs a disciplined adversarial bug hunt over the footbag-platform repository across every defect layer - design/specification bugs (ambiguous, contradictory, unsafe, or untestable requirements and contracts), implementation bugs in deployed code (security/correctness), verification gaps (missing deterministic tests or CI checks), and documentation drift (the full doc-to-doc and doc-to-code synchronization audit, from comments and JSDoc to every committed md file, rule, skill, diagram, and glossary). Runs read-only in plan mode, resolves every ambiguity with the maintainer per the asking rule, and writes verified findings to BUGS.md only after plan approval; remediation happens in later sessions. Invoke ONLY when the user explicitly asks for a "bug hunt", "bug sweep", "design bug hunt", "extended doc sync", or "full doc-sync audit" by name. Do NOT infer it from "adversarial review", "security pass", "review the code/design/docs", or plain "doc sync". Not a testing strategy and not browser QA.
---

# Bug Hunt — adversarial defect hunt across design, code, docs, and verification

> **Invoke ONLY on explicit request.** Run this skill exclusively when the user asks for a
> "bug hunt", "bug sweep", "design bug hunt", "design bug sweep", "extended doc sync", or
> "full doc-sync audit" by name. Do NOT infer it from "adversarial review", "security
> pass", "review the code/design/docs", plain "doc sync", or any general review phrasing —
> those mean a general findings-only review done in plan mode (or the narrow `doc-sync`
> skill), not this full-surface BUGS.md-writing sweep. When in doubt, ask before invoking.

Three sidecar files carry the detail; all link from here and only from here:

- `REFERENCE.md` — the implementation-layer category catalog (§4.4.1–48), the hygiene
  catalog (§4.4B.1–8), cross-cutting observations, external security calibration lenses,
  high-signal static search recipes, and the testing/CI punch-list detail (§5.1–5.6).
- `DESIGN.md` — the design-layer method: requirements-quality checks, the threat model
  (STRIDE per element, LINDDUN GO, misuse cases), contract/data/migration/parity sweeps,
  the scenario tabletop, the design-finding refutation checklist, reviewer personas, the
  design bug definition and category taxonomy, and the project high-risk checklist.
- `DOCSYNC.md` — the documentation-layer method: the enumerated doc universe and ledger,
  drift-direction classification, the mechanical pre-pass, cross-document and
  diagram/glossary reconciliation, rules/skills sync, the four locator/comment detectors,
  the sync finding taxonomy, and the aggregation rule.

## 1. Mission and defect taxonomy

One hunt, four defect layers. Every finding names the layer that is actually defective,
because the layer routes the remediation — fix the spec, fix the code, add the check, or
fix the text — and misrouting a fix (patching code to satisfy a wrong doc, or rewording a
doc to bless wrong code) converts one bug into two:

- **Design/specification** — a requirement, design decision, contract (service JSDoc,
  view-layer rule), data-governance rule, migration/go-live rule, or parity rule is
  ambiguous, contradictory, unsafe, unverifiable, or missing, such that competent future
  code would still produce wrong production behavior. Full definition in `DESIGN.md`.
- **Implementation** — deployed code fails a clear requirement, domain invariant, or
  security/correctness expectation: logic, auth, privacy, data-integrity, race, and every
  other class in the `REFERENCE.md` catalog.
- **Verification** — a deterministic check that is cheap, stable, and would pin a known
  defect class does not exist, or an existing gate does not cover what it claims. A testing
  gap is a bug with real severity, never a nicety: prompt-level "never do X" rules are
  unreliable on their own, so every mandatory convention needs a mechanical gate.
- **Documentation/hygiene** — the full synchronization audit of the committed
  documentation universe: stale or misleading comments and JSDoc, README and other md
  files that misstate the repo, cross-document contradictions, diagram/glossary claims the
  decision docs contradict, broken references, terminology divergence, `.claude`
  rules/skills whose clauses the code has outgrown, layer-boundary divergence, and
  committed-test rule violations. These mislead the next reader (human or agent) into
  writing the next bug. Every sync finding states its drift direction — which side is
  canonical per the authority order and which drifted (`DOCSYNC.md`).

Do not assume the docs are right. When code and a doc disagree, the defect may sit in
either, in both, or in a missing tracked deviation. Reason from the platform goal, the
domain invariants, and the authority order in root `CLAUDE.md`; never silently pick a side.
A deployed story that fails its success criteria is a bug; a success criterion that
contradicts the IFPA governing documents is a bug in the criterion.

The hunt is complementary to the test suite, never a substitute for it or a duplicate of
it. Hunt for what tests cannot catch (design ambiguity, cross-document contradiction,
missing controls, drift) and for what the existing gates fail to cover; a behavior pinned
by a correct passing test is settled, and a test that merely mirrors code against clear
design intent is itself a candidate finding.

## 2. Prompt contract

**Role:** white-hat adversarial reviewer for this repository — careful maintainer, security
engineer, domain analyst, and hostile user trying to find real defects before production
does. Reject what violates the design even when it "works"; refute your own candidates
before believing them.

**Objective:** produce a verified findings report in `BUGS.md` covering all four layers,
with every ambiguity resolved by the maintainer before the file is written.

**Success criteria for the hunt itself:**

- The deployed surface was re-derived from the repo this run, never trusted from any list.
- Every user story was classified per `.claude/rules/deployed-surface.md`; every deployed
  story was held to 100% of its success criteria against code; undelivered stories got
  design-quality review only; any gap between an in-scope story and the deployed surface
  was investigated to resolution.
- The documentation universe was enumerated (`DOCSYNC.md`) and every committed md file,
  rule, and skill is in the coverage ledger as read, scoped-out, or not-applicable.
- The design layer was swept with the `DESIGN.md` method, including the threat model and
  the migration-plan gate-index audit.
- Every service file-header JSDoc, every comment in files read, the CI/verification gate
  set, script credential handling, secrets/PII surfaces, and the rendered clickable surface
  were checked as `REFERENCE.md` specifies.
- Every candidate finding was actively refuted before recording; security/correctness
  survivors got an independent fresh-context adversarial second pass.
- A coverage ledger accounts for every surface class read or explicitly not read (with the
  reason), and the sweep looped until two consecutive passes surfaced no new candidate.
- Every question a finding raised was resolved through `.claude/rules/asking.md` before the
  plan was finalized; the output is actionable, minimal, and restricted to `BUGS.md`.

**Non-goals:** no browser QA, no redesign, no code or doc fixes, no test plan, no
speculative issues recorded as bugs, no remediation in the same session.

## 3. Hard constraints

- **Plan mode, read-only, end to end.** The entire hunt runs inside plan mode. The sole
  write this skill ever performs is `BUGS.md`, and only after the maintainer approves the
  finalized plan. Read-only investigation (git reads, DB SELECTs, file listings, `--help`,
  compile checks) needs no permission and no pause.
- **Never stage, commit, push, or pull.** The maintainer owns git.
- **No done-tracking.** Findings leave `BUGS.md` when their issue is filed in the
  maintainers' private tracker or their fix lands; no closures, dates, or RESOLVED
  markers anywhere. The working repo is authoritative for what is fixed.
- **Question discipline per `.claude/rules/asking.md`.** Resolve through the authority
  order first; when a genuine question survives, ask exactly one self-contained decision
  per message, in plain English with no internal codes, with one researched recommendation
  a bare "y" accepts. Do not batch questions; ask the highest-leverage blocker first.
- **Fan-out is encouraged; verification stays central.** Parallel read-only subagents may
  each sweep one dimension, surface, or bug class — independent lanes with different foci
  outperform one omnibus pass. But a subagent conclusion is a lead, never a finding: the
  main session re-verifies every candidate against the cited lines. Subagents have no
  channel to the human; they return their questions with context and a recommendation, and
  the main session raises them under the asking rule.
- **Rendered confirmation for visitor-facing claims.** A finding that asserts what a
  *visitor sees* — a wrong rendered value, a dead link, leaked internal jargon, or a
  contradiction between two pages — is CONFIRMED only against rendered output (render the
  page against the running app), never against templates or content modules alone. Static
  tracing *locates* a candidate; rendering *confirms* it. The hunt stays static-first;
  only public-surface confirmation requires the render, because the render is the arbiter
  for anything a visitor reads.
- **No diagnose-and-remediate in one step.** Diagnose, report, stop. The maintainer gates
  per-finding remediation in a separate slice. No backwards-compat migration plans for
  dead-code findings.
- Concise communication. No filler, no preamble, no emojis in this skill's outputs.

## 4. Scope

- **Implementation-layer scope = the deployed surface**, derived fresh every run per
  `.claude/rules/deployed-surface.md`. Everything deployed is in scope by default.
- **Design-layer scope = all user stories and canonical docs**, including undelivered
  stories, under the undelivered-work gate: only their design quality (ambiguity,
  contradiction, unsafety, unverifiability, missing acceptance criteria) is reviewable.
  "This feature is not built yet" is a status fact, never a finding, and the hunt never
  proposes building an unbuilt feature.
- **Documentation-layer scope = every committed human-readable surface**, enumerated as a
  universe (`git ls-files '*.md'` plus `.claude/rules/*`, `.claude/skills/*`, `ifpa/**`,
  `.github/` templates): code comments and JSDoc, every README, the canonical docs,
  diagrams and glossary, governance/meta docs, script comments, test names and comments —
  accuracy against the repo as it is, respecting `doc-governance.md` (canonical docs state
  design intent, not status; implementation state belongs only in the maintainers'
  private tracker). Standing scoped-out buckets are recorded in the ledger with
  their reason, never skipped silently (`DOCSYNC.md`).
- **Tracked deviations are not findings.** A behavior matching an open issue in the
  maintainers' private tracker is accepted; do not re-report it. The check is
  bidirectional: an open issue describing a state the repo has outgrown is itself a
  finding (stale tracker issue).
- **Standing exclusions:** CAPTCHA acceptance criteria (Turnstile is deferred by design);
  the `legacy_data/` pipeline code unless the kickoff prompt includes it — migrated data
  shaping deployed routes is always in scope. Migration and go-live *design* is always in
  scope. Per-run exclusions come only from the kickoff prompt and are recorded in the
  `BUGS.md` scope note.
- **Post-go-live source of truth:** after go-live the production database and live platform
  are the source of truth; legacy feeds, mirror data, the raw dump, and curated CSVs are
  migration inputs and audit evidence only. Flag any design or code that implies a runtime
  dependency on migration inputs after go-live, unless a canonical doc explicitly retains
  one.
- **Verification-layer scope:** tests and gates for deployed stories and technical features
  already in code. No test findings for code that has not been written.
- **Scaling:** the full method serves the explicit comprehensive hunt. For a narrowly
  scoped ask ("hunt the payment surface", "design-review the migration plan"), read only
  what bears on it, run only the relevant phases, and declare in the scope note which
  phases were skipped and why.
- Do not print raw member PII, password hashes, tokens, or credential-like values in any
  output, including findings.

## 5. Mandatory pre-reads

Load before sweeping, in this order; read targeted sections, not whole books, for scoped
runs:

1. This file plus the three sidecars' tables of contents.
2. Root `CLAUDE.md` — authority order (do not restate it; it lives there).
3. The tracked-work exclusion list, built fresh from the maintainers' private tracker
   via `gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open` (read-only,
   auto-approved), plus the local gitignored `BUGS.md`. Each open issue carries one lane label
   (`platform`, `pipeline`, `freestyle`, `coordination`) plus `bug` (a defect or an
   accepted deviation tracked to removal), `blocked` (body opens
   `Blocked on: <person> - <what>`), or `question`. If `FOOTBAG_PRIVATE_REPO` is unset,
   say exactly one line, that the tracker is not wired on this machine (the env var
   lives in the gitignored `.claude/settings.local.json`), then proceed with `BUGS.md`
   alone as the exclusion source; never hard-fail.
4. **Every rule in `.claude/rules/*.md`** — enumerate the directory fresh; the set changes.
   These are both operational constraints on the hunt and audited surfaces of it.
5. `docs/DATA_GOVERNANCE.md` — mandatory before any finding touching members, historical
   persons, search, auth, contact fields, exports, stats, or privacy.
6. The IFPA governing documents (`ifpa/*`) — mandatory before any finding on membership
   tiers, Active Player status, voting eligibility, or published rules; they outrank
   `docs/USER_STORIES.md`, which defers to them.
7. `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, `docs/DATA_MODEL.md`,
   `docs/TESTING.md` (§15.2 anti-patterns especially), `docs/MIGRATION_PLAN.md` (gate
   index), DEVOPS_GUIDE.md (private GitHub repo) (in the private operations
   checkout `footbag_private_repo/`, present only when that checkout is wired),
   `legacy_data/CLAUDE.md`, per the scope of the run.
8. The external security calibration lenses listed in `REFERENCE.md` (OWASP, ASVS, WSTG,
   NIST SSDF, CISA, CWE Top 25, CI/CD and secrets guidance) — blind-spot prevention, never
   a compliance exercise and never an override of project rules.

The user-scope project memory (`MEMORY.md`) autoloads; respect every behavioral rule there.

## 6. Method — the hunt, phase by phase

Run per-dimension passes, never one omnibus read: a pass with one question in mind finds
what a general read glides past. For a scoped run, keep only the phases that bear on the
ask and say so in the scope note.

**A. Orient.** Complete the pre-reads. Audit every existing `BUGS.md` entry against the
current repo: re-resolve each cited location, confirm the defect still exists, note drifted
line numbers, and mark entries whose fix has landed for removal. Corrections land in the
final approved write; nothing is written yet.

**B. Surface and traceability.** Derive the deployed surface fresh (routes, mounted
middleware, service-only runtime call sites, workers, webhook/IPC paths, templates, client
JS, scheduled tasks). Build a scratch traceability matrix classifying every story and every
deployed no-story feature per `.claude/rules/deployed-surface.md`; for each complete or
partial deployed story, list and check every success criterion against code. The gray area
between deployed and merely-documented resolves one way: a story that is deployed at all
is held to 100% of its success criteria, so every criterion the code does not satisfy is a
finding, unless an open private-tracker issue already covers exactly that
gap, in which case it is never duplicated here. Audit the
`docs/MIGRATION_PLAN.md` go-live gate index for accuracy (every referenced artifact
resolves), completeness (every named risk maps to a gate), and consistency (index, detail
table, and the tracker's Launch v1 milestone issues agree). Hold all of it in scratch notes;
never commit them.

**C. Design-layer sweep** (method and checklists in `DESIGN.md`). Requirements quality over
every story and design decision; STRIDE-per-element and LINDDUN GO over reconstructed data
flows plus a misuse case per story; service-contract and view-layer contract sweeps; data
model vs governance; migration/go-live and cutover design; dev/staging/prod parity from the
deployment artifacts; cross-document contradiction sweep; the adversarial scenario
tabletop. Evidence at this layer is doc sections and data flows, not file:line.

**D. Implementation-layer sweep** (catalog in `REFERENCE.md` §4.4.1–48). Threat-model the
high-risk flows (login/session, register/verify/reset, legacy claim and auto-link,
profile/media, clubs/groups, admin/curator, payments/webhooks, outbox/email, contact-admin,
archive boundary, worker IPC), then sweep each surface class against every category that
can touch it: route files and `src/app.ts`, middleware, each deployed controller with its
services, adapters, `src/lib`, templates (`{{{ }}}`, CSP, inline scripts), client-side JS,
workers and entry points, operational scripts and systemd units, terraform and docker,
`.claude` harness guards. Use the `REFERENCE.md` search recipes as accelerators; a grep hit
alone is never a finding — trace request input through controller, service, DB/adapters,
and response before believing anything.

**E. Documentation sweep** (hygiene catalog in `REFERENCE.md` §4.4B; sync method in
`DOCSYNC.md`). Two halves, both mandatory in a comprehensive run. Hygiene: layer-boundary
divergence across controllers, templates, services, and db statements; every comment and
JSDoc in every file read — audited, not sampled; the dedicated service file-header JSDoc
contract sweep; committed-test rule violations. Synchronization: enumerate the full
documentation universe into the coverage ledger, run the mechanical pre-pass, then the
per-doc internal-consistency, cross-document, diagram/glossary, rules/skills,
data/testing/DevOps/migration sync angles and the terminology/reference detectors,
classifying every gap's drift direction per `DOCSYNC.md` — doc wrong, implementation
deviated (belongs in the maintainers' private tracker), or not built yet (reportable
only as a false deployment claim). Drift is checked in both directions, and the
code-changed-text-stale direction gets its own dedicated pass, because reviewers (human
and model) reliably under-detect it: for every identifier or behavior the code has moved
past, grep `README.md`, `docs/`, `.claude/rules/*`, and `.claude/skills/*` for the
superseded term and flag stale clauses where they sit.

**F. Verification-layer sweep** (detail in `REFERENCE.md` §5). Audit the existing gate set
— `package.json` scripts, `scripts/ci/*`, `.github/workflows/*`, `run_all_tests.sh`, git
hooks — for coverage, not presence: read each gate's implementation and record the part of
its class it does not pin. Then hunt missing checks: convention gates, security automation,
secrets/PII scanners, script-credential checkers, the route/link/form smoke harness,
property and invariant tests, deploy-asset COPY checks. Every mandatory "never X"
convention should have a deterministic gate; a judgment-only rule with a mechanically
checkable core is a gap finding.

**G. Verify every candidate.** No candidate becomes a finding until it survives active
refutation:

1. Construct the counterfactual the finding implies and test it against the code — every
   consumer and every control-flow effect (middleware ordering, fall-through, the
   negative/absence path), not just the obvious caller. For a dead-code claim, prove
   removal changes nothing observable, or drop it.
2. Grep `tests/` for a test pinning the behavior. A passing correct test refutes the
   finding. A passing test that contradicts clear design intent reclassifies the candidate:
   the test (and possibly the code) is the bug.
3. Confirm the suggested fix is behavior-neutral except for the defect it removes.
4. Security/correctness survivors get an independent adversarial second pass in fresh
   context — a read-only subagent that did not produce the candidate, instructed to refute
   it, so it cannot rationalize its own prior reasoning. The main session re-verifies the
   verdict.
5. Calibrate against the do-not-flag list (§10) before recording.

A suspicion that survives only as a suspicion goes to the `BUGS.md` Leads section under its
narrow admission rule (§9), never into a findings group.

**H. Resolve, then finalize.** No finding is finalized while it rests on a guess. First
work every drift and discrepancy through the sources — the authority order, the tracked
deviations, the governing documents — and where they clearly determine the answer, act on
it without asking. Where they do not, the question goes to the human BEFORE the report is
finalized: code vs story, story vs governing document, conflicting canonical docs, drift
whose direction the repo leaves undefined, a policy the design leaves open. Ask per the
asking rule, one question at a time, each self-contained with a recommendation derived
from design intent and triangulated across sources, never from code-as-found alone.
Classify each design-layer open decision by owner (project maintainer, IFPA board
governance, legacy-site webmaster factual, technical design) so the right person is asked.
Only when every such question is answered, and the §2 success criteria have been walked
as a literal checklist with any failure sent back to its phase, does the plan get
finalized: it presents the complete proposed `BUGS.md` content — new findings, corrected
entries, removals — plus the scope note and coverage summary. Exit plan mode; on approval,
write `BUGS.md` exactly as approved and deliver the closing summary (§12).

## 7. Fix recommendations start from design intent

Every finding carries a remediation recommendation, and each one is the product of deep
per-finding analysis, derived top-down — never a reflex patch:

1. Establish what the design intends for the affected behavior, from the authority order —
   governing documents, then design decisions/user stories/data model/rules/service
   contracts — re-reading the cited passages this run and triangulating across more than
   one source. State that intent in the finding's **Design intent** field with the sources
   that establish it. If the intent itself is the defect (ambiguous, contradictory,
   unsafe), the fix is a design fix and says what the corrected intent should be.
2. Name the defective layer (§1). Only then descend to detail: follow the intent down
   through the contract, the schema, and the code path until the minimal point of repair
   is identified — the fix that makes the repo perfect against the intent, not merely
   quiet.
3. Recommend the minimal change at that layer, 1–3 lines, not a diff. If remediation
   genuinely requires design discussion, say "remediation requires design discussion" and
   stop short of drafting it.

Never recommend patching code to match a doc, or editing a doc to match code, without
first establishing which one is wrong.

## 8. Severity — one scale for all layers

Per `docs/TESTING.md` §3, applied to every group:

- **Catastrophic**: identity compromise or wrong-identity linking, broad PII leak or
  credential/PII import exposure, admin takeover or privilege-escalating role design, data
  loss, irreversible state corruption, auth bypass, unsafe rollback or cutover email loss,
  underspecified ballot anonymity/integrity, a critical data domain with no post-go-live
  source-of-truth handoff.
- **High**: role escalation, single-record privacy leak, unauthorized state mutation,
  anti-enumeration bypass, session theft, silent loss of a security-critical notification,
  a missing migration validation gate, missing webhook idempotency criteria, materially
  divergent staging/production adapters.
- **Medium**: user-visible feature break, public-record display error, operational-role
  workflow break or ambiguity, a silent feature break from a non-shipped runtime asset.
- **Low**: cosmetic issues, provably dead code, redundant guards, suboptimal messages,
  stale comments without behavioral consequence, non-blocking traceability gaps.

Severity measures the surface a defect (or missing check) leaves exposed — a verification
gap on a catastrophic surface is not Low by default.

## 9. Output specification

Single sink: `BUGS.md` at the repo root, written once, after plan approval. No other file
is produced. Groups, in order:

1. **Security/correctness severity sections** (Catastrophic, High, Medium, Low; a section
   exists only when it has findings) — implementation-layer findings.
2. **Design bugs (specification layer)** — design-layer findings, ordered by severity.
3. **Design-divergence and hygiene** — documentation/hygiene-layer findings (§4.4B),
   ordered by severity.
4. **Testing and CI/CD verification gaps** — verification-layer findings, unless a gap has
   already produced a concrete failure (then the failure goes in its severity section with
   the missing gate named as the prevention gap).
5. **Leads (unverified)** — the only home for suspicions. Admission is narrow: record a
   lead ONLY when confirmation requires expensive deep verification or staging/production
   access. Ordinary uncertainty is resolved during the hunt, not parked. Leads carry no ID
   and each names the step that would confirm or refute it.

**One running B-ID sequence across all groups.** Continue from the `Next finding ID`
pointer; never reuse a retired ID; group placement, not ID shape, shows the layer.

Per-finding structure:

```markdown
##### B<N> — <short title>

- **Layer:** design | implementation | verification | documentation
- **Location:** `src/<path>:<line>`, or the doc/rule section for design and documentation
  findings; cite both the governing text and the code that exposes it when both exist
- **Class:** <a REFERENCE.md §4.4.x / §4.4B.x, DESIGN.md, or DOCSYNC.md category>
- **Owner:** <design findings only: project maintainer | IFPA board | legacy-site
  webmaster | technical design>
- **Verification:** <how it was confirmed: path traced and refutation attempted;
  fresh-context adversarial second pass (required for security/correctness); mechanical
  re-check of quoted evidence (hygiene)>
- **Design intent:** <what the design intends for this behavior, in one or two sentences,
  naming the sources that establish it (per §7)>
- **Description:** <1–3 sentences>
- **Evidence / reproduction:** <concrete steps, code citation, or doc-contradiction quote>
- **Impact:** <what fails, what leaks, who is affected, why it survives to production>
- **Suggested fix:** <design-intent-first per §7; 1–3 lines>
- **Existing test coverage:** <"covered by tests/X.test.ts" | "no test covers this">
```

A verification-layer finding names the exact missing or under-covering check, the invariant
it pins, the closest home for it (`package.json`, `scripts/ci/*`, workflow, test dir), and
its tier (pre-merge, fast local, nightly-deep, manual staging) — never "needs more tests".
Design findings whose decision is still open are not recorded as findings; they are asked
(§6.H) and either resolved into findings or into decisions.

**Aggregation of systemic hygiene patterns.** When a mechanical detector finds the same
hygiene pattern many times, record ONE finding per pattern-per-document with a count and
two or three representative examples (`DOCSYNC.md`), so hundreds of Low hygiene rows never
bury a catastrophic finding. A single instance that changes meaning keeps its own finding
at its own severity.

**Fresh-context re-audit instruction.** The `BUGS.md` header written by the hunt must
carry a standing instruction to the remediation session: before acting on any finding, a
fresh context (a session or subagent that did not produce the report) performs a skeptical
adversarial re-audit of that finding AND its recommended remediation — re-resolve the
cited locations, re-derive the design intent from the named sources, attempt to refute the
finding, and confirm the recommended fix is minimal at the correct layer and
behavior-neutral except for the defect it removes. A finding that fails the re-audit is
returned to the maintainer with the refutation, never silently remediated or silently
dropped. The report author cannot certify its own findings; the fresh eyes are the
control.

**Graduation to the maintainers' private tracker.** After the human approves the
findings, draft for each confirmed finding an issue body meeting the tracker's
issue-body standard — title = verb + exact surface; a one-paragraph problem statement;
exact identifiers; one "Done when" line — plus an exact ready-to-run HUMAN-RUN command
of the form `gh issue create -R "$FOOTBAG_PRIVATE_REPO" --title "..." --label <lane>
--label bug --body "..."`. Claude never runs the create; the human does. `BUGS.md`
remains the local scratch sink findings are written to first; a finding leaves `BUGS.md`
when its issue is filed or its fix lands. If `FOOTBAG_PRIVATE_REPO` is unset, skip issue
drafting with the same one-line degradation note as the pre-reads.

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
in-scope surface can yield, no finding-count cap, no count-based stopping. The hunt is done
when:

- (a) every surface class in the coverage ledger (controllers, services, middleware,
  adapters, libs, templates, workers, client JS, routes, config, scripts, terraform,
  systemd, hooks, canonical docs, rules, skills) is marked read or carries an explicit
  not-read reason;
- (b) every applicable category has actually been applied to every surface it can touch —
  "read" is not "analyzed";
- (c) two consecutive passes surface no new candidate (dryness), including a final sweep
  for each major noun in the findings; and
- (d) a completeness critic has asked "which class, surface, actor, story, or success
  criterion did this run not touch?" and the answer list is empty or itself swept.

Two disciplines are mandatory, not optional. **Invert the question**: for every invariant
and control, do not conclude "looks enforced" — construct the concrete input or request
sequence that would violate it and show why the code or design defeats that attempt; the
failed construction is the evidence. **Run the reviewer personas** in `DESIGN.md` as a
second pass with fresh eyes. If the run finds zero catastrophic and fewer than three high
findings, re-verify the auth, anti-enumeration, and CSRF sweeps actually ran before
concluding the surface is clean.

## 12. After the write

End with one short summary to the maintainer: counts per group and severity; the two or
three highest-leverage findings in one sentence each; open decisions by owner (should be
none — they were resolved in §6.H); and the offer to plan remediation per finding, gated by
the maintainer, one finding at a time. Do not auto-proceed to remediation, and remind the
maintainer that remediation starts with the fresh-context re-audit the `BUGS.md` header
mandates (§9).

**Attack this skill, every run.** Spend a final explicit step on the skill itself: where
did its filters, exclusions, or stopping wording let a bug slip or excuse incompleteness
this run? Treat every default exclusion as a hypothesis to re-justify against this run's
evidence. Record concrete skill-improvement notes in the closing summary; never edit the
skill mid-hunt. A run that found the skill flawless must say what it tried to break.

**Close the loop on escaped defects.** Any false negative discovered after a hunt (a real
bug a sweep read past) becomes a permanent deterministic check — a regression test or CI
gate — so that class cannot escape again; a genuinely new class becomes a proposed new
catalog category. A false positive that survived verification gets the same treatment:
identify which verification step should have caught it and propose the gap-closing edit.

## 13. Boundaries

- **`freestyle-bug-hunt`** is separate only for the accuracy of trick CONTENT — the
  freestyle domain invariants (dictionary layer separation, ADD math, slot governance,
  naming/slug/hashtag conventions, the trick-tag invariant, propagation) and whether the
  doctrine itself is right. Everything else on the freestyle surfaces is fair game here:
  the full generic sweep of freestyle routes, the design quality of freestyle stories and
  contracts, and doc/page drift on freestyle surfaces. Only a candidate grounded in a
  freestyle domain rule hands off there.
- **`doc-sync`** is the separate narrow, change-driven drift-repair skill and is not part
  of this hunt; this skill reports documentation findings to `BUGS.md`, and their repair
  happens downstream in later sessions.
- Browser QA (`browser-qa`), the testing strategy (`docs/TESTING.md`), and remediation are
  out of scope. The report is the deliverable: fresh sessions remediate later, each
  starting from the fresh-context re-audit (§9).

## 14. Known limitations

- No live AWS contact and no GitHub-side settings visibility (branch protection, SES
  state): record a narrow Lead or ask one question rather than guess.
- Static analysis first: runtime behavior is exercised only if the kickoff prompt
  authorizes it; concurrency and infrastructure-only defects may end as Leads. No
  browser-level testing — static accessibility review and a11y-harness coverage auditing
  are in scope, live axe runs are not.
- External standards are calibration lenses, never source-of-truth overrides.
