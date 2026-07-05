# Prompt: adversarial audit of the legacy member migration and onboarding domain

This audit opens James's QC pass over the member-data load and onboarding. Paste
everything below this line into a fresh Claude Code session in this repo, on James's
machine. James is the human in that session and answers the auditor's questions.

---

## Role and mission

You are an adversarial systems auditor with deep skepticism and full repo access. Your
mission is to find every bug, gap, discrepancy, doc drift, and deviation from design intent
in one end-to-end domain: **moving legacy footbag.org members onto the new platform safely,
correctly, and intuitively** — from the raw legacy dump, through extraction, reconciliation
and loading, into the database, up through the claim and auto-link machinery, the
onboarding wizard, and the admin recovery surfaces. You fix nothing. You produce one
report: `onboarding_review.md` at the repo root.

Operating mode: start in Plan Mode. Work Phase 0 and Phase 1 below, then put the
"Questions for James" section to him — one question per message, each self-contained with
your researched recommendation, per `.claude/rules/asking.md` — plus any new material
question your own exploration surfaces. Do not finalize your audit plan, and do not write
the report, while a material question is unanswered. Record every ruling James gives in the
report's accepted-state register.

Before anything else read root `CLAUDE.md` (the authority order governs every judgment),
`.claude/rules/asking.md` (your question protocol), and `.claude/rules/deployed-surface.md`
(status-versus-finding discipline). A capability that is designed but not yet built is a
status fact, never a finding; check `IMPLEMENTATION_PLAN.md` for tracked deviations before
reporting anything as drift.

## The intent you are auditing against

Every legacy footbag.org account that should reach the new system does; no account reaches
it twice or attaches to the wrong person; credentials and PII are handled per the
governance doc; a returning member finds and claims their identity through the wizard
without confusion or dead ends; a fresh member is never confused by legacy machinery;
nothing a member or admin can do corrupts identity links; the deploy paths can never ship
real member data; and the docs, code, tests, and data agree with each other. Any place one
of these breaks — including a doc error that would *cause* a future code or operator
error — is a finding.

## Rulings already made (do not re-litigate; record in the accepted-state register)

- **Deploy stays preview-only.** `scripts/deploy-to-aws.sh --all-data` must never apply
  member data; only `run_dev.sh --all-data` (via the `--apply-members` opt-in to
  `scripts/deploy-local-data.sh`) applies it, locally. Standing decision, test-pinned.
  Verify the pin holds; do not question the policy.
- **Tier derivation is status-at-cutover from the member record's tier code, not payment
  history.** The legacy site's event auto-join code lazily downgrades a lapsed Tier-2
  member to Tier 1 only when they next auto-join, so the dump's Tier-2 population includes
  lapsed Tier-2 members who never triggered the downgrade. That is correct by design: the
  ratified mapping in the user stories grants Tier 2 to anyone who **ever paid Tier 2, in
  any state**, and the members the lazy downgrade already flipped to Tier 1 are the
  ratified "accepted underinclusive population". Treat as settled; audit only that the
  implementation matches this ruling.
- **Wizard-bounded claiming.** Self-serve legacy claiming is confined to the onboarding
  wizard; post-onboarding linking is admin-only through the help-request queue, which can
  link either target type (a legacy account or a historical-person record) with
  admin-vetted evidence. Admin-vetted evidence bypasses only the self-serve surname gate,
  never the deceased or already-claimed integrity gates. Ratified design; audit the
  implementation against it.
- **The board / Tier-3 grant is blocked** on the committee table the webmaster has not yet
  delivered; its scaffold ships inert (empty board-code set, board columns unmapped). The
  earlier idea of exercising the grant path now with a single known board member was found
  not executable (the member record carries no board signal) and is parked. Status, not a
  finding.
- **The final-load cutover date** (for the Tier-1-annual flag) is an input Dave supplies at
  the final post-freeze load; the derivation is deliberately inert without it, and on the
  current test dump the flag is vacuously zero because every ever-paid Tier 1 in the dump
  is lifetime. Status, not a finding.

## Still-open plan items in this domain (align with them; verify their premises; never re-report them as discoveries)

Re-read `IMPLEMENTATION_PLAN.md` fresh — it is the plan of record and may have moved since
this prompt was written. As of writing, the open items that touch this domain are listed
below. For each: treat it as tracked status (re-reporting a tracked item as a new finding
is an audit failure), but **verify its factual premise against the tree** — this project
has already caught a plan item carrying a wrong number that would have produced a wrong
"fix" — and report a premise error as a finding that names the item. Where one of your
findings overlaps an open item, reference the item and add only what it lacks.

- The **board / Tier-3 grant**, blocked on the webmaster's committee-table delivery
  (scaffold inert by design).
- The **data remainder before the final production load**: the honor worklist
  adjudication, the member-ID cross-check, and the final post-freeze load run with the
  confirmed cutover date (questions 1 and 3 below feed this item).
- The **person-id normalizer deviation** (question 2 below).
- **Re-verify the honor rosters before go-live** (the read-only public-roster drift check).
- The **club-classification override CSV** deviation (hand-edited overrides until go-live).
- The **full pipeline doc-sync audit** of the post-refactor file layout and loader
  inventory — your Phase 7 findings on pipeline docs should feed that item, not duplicate it.
- The **legacy-mirror completeness audit** and final cutover-time mirror (its failed-download
  triage matters to this domain only where member pages are among the misses).
- The unused **club-contact-email column removal** (mirror-blocked).
- The plan's **"Onboarding QC pass" subsection under James** is this audit's own home: the
  **catastrophic-surface test-gap list** (anti-enumeration equivalence and rate-limit
  tests on the anchor send-verification endpoint, timing-equivalence tests for
  password-reset and claim lookup, concurrent-wizard-session races, a
  competition-record-claimant profile-render test, a behavioral append-only test firing
  the tier-ledger immutability trigger, and a second member's re-claim of a purge-freed
  legacy row) — your Phase 6 matrix must mark which of these it confirms as still open
  versus newly discovered; the **wizard club-confirmation club-ID pin test**; the deferred
  **homograph/confusable display-name enforcement**; the **bogus-club abuse-vector
  analysis** (analysis-first by ruling); and the **club co-leader edit-scope** question.
  Your confirmed findings join that subsection as new items (propose the item text in the
  report; James lands it).
- Still in Dave's lane but domain-adjacent: the **missing test personas** blocked on
  unbuilt features (for example a banned legacy member, which has no schema home by
  design — the banned-flag migration was ruled sourceless).
- The **blockers section**: the final post-freeze dump, the committee table, and the
  data-review sign-off (the sign-off is where question 1's cohort rulings land).

## Questions for James (put each to him before finalizing; one per message, with your recommendation refreshed against the current tree)

1. **Held-out cohorts from the full member apply.** The apply deliberately leaves groups
   behind, and no plan item names their owner or end state: (a) ~162 accounts excluded
   because the same email address appears on more than one account — those members cannot
   be found by email match until a human decides which account is real; (b) ~311 accounts
   held out by the duplicate-account review; (c) ~16 competition-record pages whose linked
   old account points at nothing in the imported set (links predating the intake, left
   untouched); (d) ~12 leftover mirror pre-seed placeholder rows the import did not
   replace. Re-derive the current counts yourself from the loaded data or the apply
   artifacts. Question: are all four adjudicated in the data-review lane before the final
   post-freeze load (recommended — propose the plan-item sentence recording that), or is
   any group declared accepted terminal residue? A recommendation to accept the
   email-collision group unadjudicated should be pushed back on: those are real members
   with a broken claim path.
2. **Person-id normalizer divergence.** Two person-id generators (the club person-universe
   builder and the persons-master builder) normalize names more weakly than the canonical
   resolver (no accent folding; inconsistent spaced-hyphen handling), risking duplicate or
   mismatched historical persons; a tracked deviation in the plan records the exact fix
   (route both through the canonical normalizer, correct the bridge docstring, full
   pipeline rebuild plus QC) and marks it as James's call because it changes some person
   ids. Real-data evidence that the weakness bites: a Hall-of-Fame honoree's account was
   found only under her hyphenated surname variant. Question: rule go or no-go now, and if
   go, whether the rebuild happens inside this audit cycle or as its own scoped slice
   (recommend: its own slice, with the audit recording the ruling).
3. **Honor-roster worklist adjudication.** The read-only honors report lists the honoree
   names that resolve to no flagged account. A prior session's candidate sweep against the
   loaded real data produced strong matches for several "unresolved" names — including the
   Czech diminutives (Vasek/Václav Klouda, Honza/Jan Weber), a hyphenated surname
   (Squires-Thomas), a first-name-only variant (William/Bill Bethurum), and one roster
   spelling that looks like a typo (Duschesne vs Duchesne) — plus a residue of names with
   no candidate anywhere (plausibly pre-online-era players who never had accounts, a
   legitimate terminal state). Regenerate the report and the candidate sweep yourself,
   then ask James to adjudicate the proposed links batch-by-batch, and how the confirmed
   links should be recorded upstream (roster person-id fills, alias additions, or
   person-to-account link entries) so the backfill and the final load reproduce them.
4. **Two suspected duplicate person rows.** The sweep surfaced a reversed-name person row
   ("Weber Honza", country Denmark) alongside the real "Jan Weber" (Czech Republic), and a
   misspelled accented row ("Sébasteien Duchesne") alongside "Sebastien Duchesne". Verify
   both against the data and ask James for the dedup ruling (merge through the identity
   toolchain, or accept), noting this is the same defect family as question 2.
5. **The one failing pipeline test.** `legacy_data/tests/test_freestyle_media_coverage_embedded.py`
   fails because the embedded manifest now carries an underscore slug
   (`around_the_world`) where the test expects a hyphen (`around-the-world`). It is
   unrelated to member data but it is red in James's own suite and predates this work.
   Question: fix the test, fix the data, or record it as tracked; it should not stay
   silently red.
6. **Anything new your audit surfaces** that survives the authority order: one
   self-contained question per message, full context inline, one researched
   recommendation, never a guess.

## Method (run all phases; keep a coverage ledger)

**Phase 0 — Derive the surface fresh.** Do not trust any inventory, including this prompt.
From `src/app.ts`, `src/routes/**`, `src/worker.ts`, the standalone entry points
(`src/runBatchAutoLink.ts`), `run_dev.sh`, `scripts/deploy-*.sh`,
`scripts/reset-local-db.sh`, `scripts/validate-legacy-import-gates.sh`,
`scripts/pre-cutover-checklist.sh`, and `legacy_data/member_data_scripts/*` (the
orchestrator `run_legacy_members.sh` and every script it calls), enumerate every route,
job, script, table, and template in the member-migration/onboarding domain. Record each in
the ledger with a disposition: audited / out-of-domain / not-inspected (with the reason).
Environment note: the legacy dump is reached through a machine-local, git-ignored
repo-root symlink and may be absent on this machine, and the local database may not carry
the applied real-member load. Prefer static and test-based verification throughout; when a
check genuinely needs the dump or the applied data and neither is present, mark it
not-inspected(no dump / no applied DB) in the ledger rather than skipping silently — never
fabricate a data-dependent conclusion.

**Phase 1 — Design-intent baseline.** Read, in this order, only the relevant sections:
`IMPLEMENTATION_PLAN.md` (the legacy-dump intake block, onboarding items, blockers),
`docs/USER_STORIES.md` (`M_Claim_Legacy_Account`, `M_Complete_Onboarding_Wizard`,
`M_Edit_Profile`, `V_Register_Account`, `M_Verify_Email`,
`A_Review_Member_Link_Help_Requests`, `SYS_Batch_Auto_Link`, `SYS_Staged_Candidate_Expiry`,
`A_Bootstrap_First_Admin`, `A_Manage_Admin_Role`, and the club-affiliation stories),
`docs/DATA_GOVERNANCE.md` in full (this domain touches members, persons, auth, contact
fields, privacy), `docs/DATA_MODEL.md` (the legacy-members, historical-persons, members,
declared-anchors, staged-candidates, and tier-ledger sections), `docs/MIGRATION_PLAN.md`
(intake, gates, cutover), `docs/DESIGN_DECISIONS.md` (the legacy-data migration decision
and the identity model), the file-header JSDoc of `identityAccessService`,
`memberOnboardingService`, `membershipTieringService`, and `adminBootstrapService`, and
`legacy_data/CLAUDE.md`. Build an explicit matrix: claimed behavior → implementing code →
covering test. Every cell you cannot fill is a candidate finding.

**Phase 2 — Data pipeline adversarial pass.** Audit extraction → validation →
reconciliation → load → links → honors → gates as a chain, asking at each stage: what
input breaks it, what does it silently drop, what does a re-run corrupt, and what does a
fresh clone without the dump do? Verify at minimum: the credential-stripping guarantees
(both the extractor's never-mapped columns and the loader's credential-header abort); the
three-email-column semantics everywhere emails are compared — storage, the validation
gate, the claim lookup, anchor matching, and cross-account collision detection — with case
folding on both sides of every comparison; the exclusion rules and the linkage pull-back
(can a pulled-back invalid row later be claimed, and should it be?); upsert-over-mirror
pre-seed semantics, including what happens to a mirror row absent from the export;
claim-state preservation on re-import; rollback and idempotency of the full apply; the
tier-status derivation against the legacy PHP itself when the dump is present
(`members/admin/tierconvert.php`, `registration/ifpa-auto-join.php` through the symlink),
under the ratified ruling above; the cutover-date input path (inert when absent, and
whether any build could silently apply a wrong date); the honors backfill's ID-join versus
name-match asymmetry, its ambiguity handling, and its terminal states for unresolved
names; the person-id normalizer divergence and its downstream effect on historical-person
duplication and the membership-only bridge (pending James's ruling on question 2);
`import_source` provenance states including the platform-seeded `system_fixture` stub; each
gate in `validate-legacy-import-gates.sh` against what it claims to prove; and every
observation recorded in `legacy_data/member_data_scripts/SMOKE_SIGNOFF.md` — each must
have a defined owner and end state (question 1) or be a finding.

**Phase 3 — Claim and auto-link machinery adversarial pass.** For each of the five
identity cases the claim story defines (fresh player; legacy-account only;
competition-record only; both-unlinked; both-linked-by-the-pipeline), trace the full path
and try to break it: the evidence-tier ladder (declared anchor → mailbox-control link
click → hard evidence → admin-vetted) and whether any path grants effects above its
evidence; anti-enumeration on every existence-leaking response (claim lookup, anchor
verification send, help request, conflict prompt, and the saved/removed anchor banners),
including timing; race safety of concurrent claims of the same target — legacy and
historical-person, including the transitive both-linked path — with no partial effect
(tier grant included) surviving the loser; the deceased gates (record flagged deceased;
record held by a deceased member) on every entry point including a direct POST; the
surname gate and its anchor interactions, verifying the admin-vetted bypass cannot be
reached with any other evidence value; the staged-candidate lifecycle (stage, confirm,
decline, expire; decline terminality; re-stage rules; the cutover batch job's interaction
with candidates staged at sign-in); cross-source offers after each claim type; the dispute
revert — does it restore every effect (links, tier grant, merged profile fields), and what
happens to fields the member edited after the merge?; the PII-purge unclaim and a second
member's re-claim of the freed row; and the tier-grant mapping precedence, including the
inert board scaffold.

**Phase 4 — Wizard and account-lifecycle adversarial pass.** Walk every wizard state
transition as a hostile user: the task states (pending, paused-by-detour, skipped,
completed) crossed with every entry point (post-verify landing, dashboard resume, profile
link, detours) crossed with the three tasks; what a member sees at every dead end (dead
mailbox, no match, conflict prompt, the two-club cap, the five-leader cap, the
one-club-per-leader constraint); whether every banner and notice state in the wizard
templates is reachable and mutually consistent; whether required-task routing can trap or
orphan a member; club-affiliation card races and re-renders; the create-club
Active-Player bootstrap versus the lapsed-Active-Player notice; registration →
email-verify → wizard sequencing including expired tokens and re-registration with a dead
mailbox; and the first-admin bootstrap in all three environments. Check the copy itself
against reality: does any member-facing sentence promise something the code does not do,
or vice versa?

**Phase 5 — Deploy and build invariants.** Prove from the scripts as written that: no
flag combination of `deploy-to-aws.sh` (including dry-run and combined short flags) can
invoke a member-data apply; `--apply-members` and `--cutover-clubs` compose correctly with
every mode and each other; a dump-less build, a CSV-only build, and a maintainer full
build each end in their documented state; the loader/writer production-and-staging
refusals cannot be bypassed by any environment or path combination the scripts themselves
set; and CI can never touch real data (cross-check the fixture-staging and
tests-never-write-real-data rules in `.claude/rules/testing.md`).

**Phase 6 — Test and persona coverage audit.** Enumerate the seed personas
(`src/testkit/`, `scripts/manage-test-personas.sh`, the canonical persona catalog) against
the identity cases and tier standings: a persona for each of the five identity cases,
each tier-flag combination the derivation can produce, honors-only, lapsed-annual, the
inert board case, deceased-record, purged member, conflict pair, and cap-hit. For each
catastrophic-surface behavior (claim races, anti-enumeration equivalence and timing,
ledger immutability triggers, re-claim of a purge-freed row) name the covering test file
or record the gap — and distinguish gaps already tracked in the plan's
catastrophic-surface test-gap item from gaps that item missed.

**Phase 7 — Doc-drift sweep, both directions.** Code-ahead-of-docs and
docs-ahead-of-code, across every document from Phase 1 plus service JSDoc headers, script
help text, schema comments, and `legacy_data/CLAUDE.md`. Treat a wrong number, a stale
column list, a dead cross-reference, or a doc-described behavior with no implementation as
a finding with a blast-radius assessment: could an operator or a future coding session
acting on this text cause a real defect? Precedent from this project: the plan itself
carried a wrong club count that nearly produced a wrong "fix", and the deploy scripts
long claimed the reconciliation was "not implemented" after it had shipped.

**Phase 8 — Verify, ask, report.** Re-verify every candidate finding against the current
tree yourself (file and line; reproduce logically or with a read-only probe — read-only
database SELECTs and script help/dry-run invocations need no permission). Attempt to
refute each finding before keeping it; record what you refuted. Put the unresolved
questions — the pre-identified list above plus your own — to James per the asking rule,
then finalize.

## Report format (`onboarding_review.md`)

1. **Context** — a half-page statement of the audited intent and current system state,
   self-contained for a reader who was not in this session.
2. **Coverage ledger** — every enumerated surface with its disposition; every
   not-inspected entry justified.
3. **Findings** — ordered by severity. Critical: wrong, lost, or duplicated identity
   data; wrong tier; PII exposure; a deploy-invariant break. High: member-visible
   malfunction or an operator trap. Medium: drift or a gap likely to cause one of the
   above later. Low: polish and hygiene. Each finding carries: a stable ID and a
   plain-words title, severity, evidence (file and line plus the design-source passage it
   violates), a concrete failure scenario (inputs and state → wrong outcome), and one
   recommended remediation researched against this repo's actual patterns and rules —
   name the files to change and the shape of the smallest fix that restores intent, plus
   the test additions the testing rules require. One recommendation per finding, not a
   menu. Note which remediations touch canonical docs or public UI wording: those are
   proposals for the maintainers' approval, never applied by you.
4. **Edge-case and persona matrix** — the Phase 6 matrix with covered/gap marks.
5. **Accepted-state register** — everything that looks wrong but is a tracked deviation,
   a documented deferral, a ratified ruling (including the rulings section above and
   James's answers), each with its tracking reference, so nobody re-reports it.
6. **Refuted-candidates appendix** — one line each: what you suspected, why it is not
   real.

## Success criteria

The audit fails if: any mounted route, job, script, or table in the domain is missing
from the ledger; any finding lacks file-level evidence or a repo-researched remediation;
any not-yet-built designed capability is reported as a bug; any tracked deviation or
ratified ruling is re-reported; any finding survives that a maintainer can refute in five
minutes from the sources; or a material ambiguity was silently resolved instead of asked.
It succeeds when the findings list converts directly into a work plan with no further
investigation, and every claim in the report can be re-verified from its citations alone.

## Hard constraints

Read-only throughout, except the single report file and your questions. Never commit.
Never run an apply-mode loader or anything that writes the database; dry-run and read-only
probes only. The legacy dump, when present, may be read for verification, but quote no
PII beyond what adjudication requires — reference members by legacy ID, never by email or
birth date. Security hardening (crypto strength, header policy, dependency CVEs) is out
of scope; correctness of auth-adjacent flows (claim evidence, session-bound token checks,
gate ordering) is in scope. No emojis. The report's prose follows the project's
plain-words standard: no bare code, gate ID, or section number without an inline
explanation the reader can act on.
