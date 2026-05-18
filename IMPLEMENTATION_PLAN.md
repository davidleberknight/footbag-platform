# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent for bootstrapping, security follow-ups, and near-term sprint planning scope for AI. 
Long-term design: `docs/`. 
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md` (even if they are also in Design Decisions as a long-term intent). Documented future work and intentional development versus staging versus production asymmetries are not deviations.

## Active deviations

### Auto-link batch behavior diverges from MIGRATION_PLAN §6 design

**Current code:** `OperationsPlatformService.runBatchAutoLink` (`src/services/operationsPlatformService.ts`) queues both high-confidence and medium-confidence matches into `work_queue_items` for admin review, and skips low-confidence cases. Asserted by `tests/integration/operationsPlatform.batchAutoLink.test.ts` and `tests/integration/operationsPlatform.systemJobRuns.reap.test.ts`. The silent-and-notified surfaces (notification email, first-login confirmation card, revert handler) and the HoF/BAP daily admin digest are not yet built.

**Design intent** (`docs/MIGRATION_PLAN.md` §6 "Batch auto-link at cutover", "Notification and confirmation surface for silent auto-link", "Report-incorrect revert handler", "Post-cutover monitoring"; `docs/USER_STORIES.md` `M_Confirm_Auto_Linked_Identity`, `A_Review_Auto_Link_Matches`): auto-link high-confidence and medium-confidence matches silently in audit-logged transactions; enqueue notification emails on every silent claim; persist `AutoLinkConfirmContent` first-login cards for medium-confidence claims; implement the report-incorrect revert handler; emit a daily HoF/BAP admin digest during the post-cutover monitoring window.

**To close the gap:**

- Rewrite `runBatchAutoLink` to perform the silent claim transaction for high and medium matches (writes `members.legacy_member_id`, `legacy_members.claimed_by_member_id`, `members.historical_person_id` when the legacy row has an HP back-link, `member_tier_grants` row with `reason_code = 'legacy.claim_tier_grant'`, merge fields per `docs/MIGRATION_PLAN.md` §8) instead of inserting a `work_queue_items` row.
- Enqueue the silent-claim notification email through the existing outbox path for both high and medium claims (see also the separate "Member notification email surface" deviation below).
- Persist `AutoLinkConfirmContent` first-login cards for medium-confidence claims (see the separate "First-login confirmation card persistence" deviation below). High-confidence claims emit notification only, no card.
- Implement the report-incorrect revert handler per MIGRATION_PLAN §6 (see the separate "Report-incorrect revert handler" deviation below).
- Continue routing low-confidence cases into `work_queue_items` for `A_Review_Auto_Link_Matches`.
- Implement the HoF/BAP daily admin digest covering silent claims with `reason_code='legacy.claim_tier_grant'` AND HoF or BAP honor flag for a configurable monitoring window, default 56 days from cutover (see the separate "HoF/BAP daily admin digest" deviation below).
- Rewrite `tests/integration/operationsPlatform.batchAutoLink.test.ts` and the reap test to assert the new behavior: silent claim + audit row + notification queued + (medium only) card persisted; low-confidence routes to admin queue; report-incorrect path reverts state.
- Rewrite the `runBatchAutoLink` JSDoc to document the silent-and-notified design and the surfaces it triggers.
- Verify with `npm test` and `npm run build`.

Risk: silent identity and tier writes at scale. The silent-and-notified design retains user agency (notification + first-login confirmation card + report-incorrect with revert) and a daily HoF/BAP admin digest as a back-stop, but cutover is the highest-volume single moment for this path; spot-check the audit log for the first 24 hours.

### First-login confirmation card persistence and surfaces missing

**Current code:** `AutoLinkConfirmContent` interface exists at `src/services/identityAccessService.ts:184-192` but is ephemeral page-state, used only by the registration-time onboarding wizard (`src/controllers/memberOnboardingController.ts:333`). No persistence row is written, so the card cannot surface on a later first login after a silent cutover-batch claim. No dashboard card surface renders pending `AutoLinkConfirmContent`. No profile-settings "Linked legacy accounts" surface exists.

**Design intent** (`docs/USER_STORIES.md` `M_Confirm_Auto_Linked_Identity`; `docs/MIGRATION_PLAN.md` §6 "Notification and confirmation surface"): dashboard surfaces an `AutoLinkConfirmContent` card on first login after a silent medium-confidence batch claim, persists across logins until member confirms, dismisses, or reports incorrect, and is re-reachable from profile settings.

**To close the gap:**

- Schema: add either a `member_dashboard_cards` table or a `members.pending_auto_link_card_json` column to persist card state (`card_type`, `card_data_json`, `dismissed_at`).
- Service: dashboard load checks for pending card; render path emits the card with three actions (Confirm, Dismiss, Report incorrect).
- Service: Confirm writes `audit_entries` row with `action_type='legacy.auto_link_confirmed'` and dismisses the card. Dismiss marks the card dismissed without an audit entry; subsequent logins do not re-surface it. Report incorrect invokes the revert handler.
- Profile settings page: list claimed legacy identities (members with non-NULL `legacy_member_id`) with a per-row "Report incorrect" affordance routed to the same revert handler.
- Tests: dashboard card lifecycle (surface on first login, persist across logins, dismiss-and-do-not-resurface, confirm-and-dismiss); profile-settings re-report path.
- Verify with `npm test` and `npm run build`.

### Member notification email surface for silent auto-link missing

**Current code:** `CommunicationService.enqueueEmail()` at `src/services/communicationService.ts:57-100` and the `outbox_emails` table support enqueuing transactional emails. The `email_templates` table at `database/schema.sql:681-695` supports template storage. No silent-auto-link template is seeded. `runBatchAutoLink` at `src/services/operationsPlatformService.ts:244-249` enqueues only an admin-alerts mailing-list email per queued match, not a member-facing notification. No enqueue call exists in the registration-time auto-link path either.

**Design intent** (`docs/MIGRATION_PLAN.md` §6 "Notification and confirmation surface", "Batch auto-link at cutover"): every silent auto-link (high and medium) enqueues a notification email to the linked member's verified address, identifying the linked legacy member by display name, summarizing what the link enables (history attribution, tier grant, HoF or BAP if applicable), and offering a report-incorrect link bound to the audit row identifier and the member's session.

**To close the gap:**

- Define a `legacy_auto_link_notification` email template in `email_templates` with parameter slots for legacy member display name, tier-grant summary, HoF and BAP flags, and the report-incorrect token.
- Wire `runBatchAutoLink` and the registration-time auto-link path to call `CommunicationService.enqueueEmail()` for every silent claim with an idempotency key (for example `auto_link_notification:<claim_audit_id>`) so reruns do not duplicate the send.
- Bind the report-incorrect link to a tokened route consumed by the revert handler.
- Tests: enqueue assertions for high and medium claims; idempotency assertion on rerun; low-confidence assertion (no member-facing email enqueued; only admin queue).
- Verify with `npm test` and `npm run build`.

### Report-incorrect revert handler

**Current code:** No revert path. Zero hits in `src/` for "revert", "unclaim", "report incorrect", or `auto_link_revert` in the auto-link context. Schema supports the required writes: `member_tier_grants.change_type` accepts `'revoke'` at `database/schema.sql:1278`; `reason_code`, `work_queue_items.task_type`, and `audit_entries.action_type` are all free-text.

**Design intent** (`docs/MIGRATION_PLAN.md` §6 "Report-incorrect revert handler"; `docs/USER_STORIES.md` `M_Confirm_Auto_Linked_Identity`): a "report incorrect" action from the notification email, the first-login confirmation card, or the profile-settings affordance triggers an atomic revert: clears `members.legacy_member_id` and the matching `legacy_members.claimed_by_member_id` and `claimed_at`; conditionally clears `members.historical_person_id` (preserve direct-HP claims); appends `member_tier_grants` row with `change_type='revoke'` and `reason_code='legacy.auto_link_reported_incorrect'`; enqueues `work_queue_items` row with `task_type='auto_link_revert_review'`; audit-logs `legacy.auto_link_revert` with `metadata_json.original_claim_audit_id`. A second report against an already-reverted link returns a uniform non-revealing response.

**To close the gap:**

- New service method (for example `IdentityAccessService.revertAutoLink(memberId, originalClaimAuditId)`) performing the atomic transaction.
- New tokened controller route for the notification-email "report incorrect" link with anti-enumeration uniform 200 response on already-reverted or unrecognized token.
- New authenticated controller route for the dashboard card and profile-settings affordance.
- Tests: revert clears claim state and reverses tier grant; conditional `historical_person_id` clearing (preserved when claim came from direct-HP path, cleared when back-linked from legacy claim); idempotent second-report; audit chain includes `original_claim_audit_id`.
- Verify with `npm test` and `npm run build`.

### HoF/BAP daily admin digest

**Current code:** No daily admin-digest mechanism. The only scheduled daily job is `SYS_Check_Active_Player_Expiry` (`src/services/activePlayerExpiryService.ts`). Admin-alerts mailing-list infrastructure exists via `CommunicationService.enqueueMailingListEmail()` at `src/services/communicationService.ts:102-136`.

**Design intent** (`docs/MIGRATION_PLAN.md` §6 "Post-cutover monitoring"): daily digest covers the prior 24 hours of silent claims that produced a `member_tier_grants` row with `reason_code='legacy.claim_tier_grant'` AND HoF or BAP honor flag, delivered to the admin-alerts mailing list, runs from cutover for a configurable monitoring window (default 56 days, extensible).

Status: not blocking T+0. Runs from cutover, so should land by T+1 day; may slip to T+1 week if admin coverage at T+0 is adequate without the digest.

**To close the gap:**

- New scheduled job modeled on `SYS_Check_Active_Player_Expiry` querying recent `member_tier_grants` rows with the matching `reason_code` and HoF/BAP flags.
- New email template for the digest payload (row identifiers and decision-relevant attributes only; no sensitive contact fields per `docs/GOVERNANCE.md`).
- Configuration: monitoring window duration (default 56 days from cutover) and digest enable/disable.
- Tests: digest payload shape (no PII leakage); window-boundary behavior; idempotency across reruns within the same 24-hour window.
- Verify with `npm test` and `npm run build`.

### Club leader bootstrap classification and wizard step (W2)

**Current code:** `submitTaskResponse()` throws `NotImplementedError` for the `club_affiliations` task at `src/services/memberOnboardingService.ts:140-156`. No service function computes (strong / weak / none) classification from structural signals. `member_onboarding_tasks.state` enum at `database/schema.sql:3162` is `pending | skipped | completed | not_applicable` (no `in_progress_paused`). No tier-gate advisory on club creation. No wrap-up "Find or create your club" landing. No detour state transitions in the wizard. `club_bootstrap_leaders` schema at `database/schema.sql:3356-3381` lacks structural-signal evidence columns. `legacy_person_club_affiliations.inferred_role` is hardcoded `'member'` upstream at `legacy_data/clubs/scripts/03_build_legacy_person_club_affiliations.py:126`; contact and leader inference do not run.

**Design intent** (`docs/MIGRATION_PLAN.md` §2 "Bootstrap rule" and "Leadership model"; `docs/USER_STORIES.md` `M_Complete_Onboarding_Wizard` detour, tier-advisory, and wrap-up acceptance criteria; `docs/USER_STORIES.md` `A_Review_Club_Cleanup_Signals` new task type): combination-gate classification over five structural signals (`listed_contact`, `affiliation`, `hosting`, `roster`, `mirror_text`) with three context-only modifiers (`tier_signal`, `recent_activity`, `geographic_alignment`); strong + user-confirms → silent promotion to `club_leaders`; weak + user-evidence → admin queue with `task_type='club_leader_evidence_review'`; user declines → `status='rejected'`. Wizard supports detour to `M_Join_Club` or `M_Create_Club` with task transition to `in_progress_paused`; Tier 0 sees tier-gate advisory before routing to `M_Create_Club`; wrap-up landing presents three options when no affiliations were written.

**To close the gap:**

- Schema: extend `member_onboarding_tasks.state` enum to include `in_progress_paused`. Extend `club_bootstrap_leaders` with structural-signal evidence persistence (either per-signal columns or a `club_bootstrap_leader_signals` child table). Pipeline changes tracked separately in `legacy_data/IMPLEMENTATION_PLAN.md`.
- Service: new classification function returning `(classification, evidence)` per `(member, club)` pair using the combination gates from MP §2.
- Service: implement `submitTaskResponse('club_affiliations', ...)` driving the strong / weak / declined branches (silent promotion to `club_leaders` and `club_bootstrap_leaders.status='claimed'`; evidence enqueue with `task_type='club_leader_evidence_review'`; `status='rejected'`).
- Service: detour state transition with audit logging (member id, target story, source wizard card, timestamp). Dashboard task widget renders "Resume onboarding" for `in_progress_paused`.
- Controllers: tier-gate advisory for Tier 0 on club creation detour; wrap-up "Find or create your club" landing; detour routing from any Stage 1/2/3 card. `M_Create_Club` route accepts return-to-wizard origin; successful upgrade through `M_Purchase_Tier_1_IFPA_Member` returns to the advisory with a "Continue to Create Club" option.
- Tests: classification matrix (strong / weak / none × confirm / correct / decline = 9 cells); wizard POST per branch; detour state and audit; dashboard widget per state; tier advisory; wrap-up landing; idempotency; two-member-same-club conflict rejection.
- Verify with `npm test` and `npm run build`.

### Pre-cutover orchestrator script and validation-gate scripts missing

**Current code:** `scripts/` contains discrete diagnostic scripts (`audit-auto-link.ts`, `audit-dev-admin-shortcuts.sh`, `audit-email-collision-risk.ts`, `audit-unresolved-cohort.ts`, `report-autolink-metrics.ts`, `smoke-local.sh`, `test-smoke.sh`) but no orchestrator that sequences them as a cutover preflight gate. No executable enforces the validation gates G1–G12 documented in `docs/MIGRATION_PLAN.md` §24.

**Design intent** (`docs/MIGRATION_PLAN.md` §24 validation gates; `docs/DEVOPS_GUIDE.md` §16.6 cutover preflight checklist): a single orchestrator wraps the existing diagnostic scripts plus new gate validators, sequences them in dependency order, and exits non-zero on any gate failure. The operator runs the orchestrator as the final preflight before issuing the cutover go signal.

**To close the gap:**

- Add `scripts/pre-cutover-checklist.sh` orchestrator that wraps the existing diagnostic scripts and invokes the new gate validators below in dependency order.
- Add `scripts/validate-legacy-import-gates.sh` for G1–G6 (legacy email uniqueness, `legacy_user_id` uniqueness, banned-field reliability, profile-field shape, `legacy_member_id` quality, tier-mapping inputs).
- Add `scripts/validate-club-candidates.sh` for G7 (mirror-derived club normalization quality, duplicate detection, leader candidate confidence distribution).
- Add `scripts/validate-bootstrap-leaders.sh` for G8 (high-confidence bootstrap leader count by club classification).
- Add `scripts/validate-name-variants.sh` for G11 (row count ≥ 250, bidirectional sample lookups, per-category counts).
- Add `scripts/validate-legacy-tiers.sh` for the tier-mapping inputs portion of G6 (deferred tier columns present on expected row count; honors-only fallback decision).
- Add `scripts/take-pre-cutover-snapshot.sh` that takes the database snapshot and emits a manifest (snapshot id, byte size, row counts for `members`, `legacy_members`, `historical_persons`, `name_variants`, `club_bootstrap_leaders`).
- Add `scripts/dns-ttl-preflight.sh` that drops TTL on the legacy zone via Route 53 API at T-48 hours.
- Orchestrator sequence: snapshot + manifest, then G1–G6, then G7–G8, then G9 (club page render smoke), then G10 (SES end-to-end test send), then G11, then G12+ per `MIGRATION_PLAN.md` §24, then `audit-dev-admin-shortcuts.sh`, then DNS TTL drop, then `npm run test:smoke` and `npm run test:e2e`, then pass/fail summary with non-zero exit on any failure.
- Tests: dry-run against staging produces a green report and exits 0; fault-injection (for example zero rows in `name_variants`) produces a red report and a non-zero exit.
- Verify with `npm test` and `npm run build`.

### External cutover-readiness runbooks not yet authored in DEVOPS_GUIDE

**Current docs:** `docs/DEVOPS_GUIDE.md` §16.6 cutover preflight checklist names the external preconditions (ACM cert issuance, SES production readiness, DNS TTL reduction, Route 53 coordination) but does not contain step-by-step operator runbooks for each.

**Design intent** (`docs/MIGRATION_PLAN.md` §28 external blockers EX3 and EX4; `docs/MIGRATION_PLAN.md` §18.12 webmaster coordination; `docs/DEVOPS_GUIDE.md` §16.6's role as the cutover preflight gate): each external blocker carries an operator runbook covering precondition verification, the operator steps, expected response, validation, and rollback if the step fails. Runbooks are dry-run-testable against staging zones and staging SES where feasible.

**To close the gap:**

- Author SES production readiness runbook (suggested location: new `docs/DEVOPS_GUIDE.md §EX3` adjacent to §4.5 SES operations): domain verification, SPF/DKIM/DMARC records, sandbox-exit ticket, test send from production account to operator mailbox, bounce/complaint baseline capture.
- Author ACM cert for footbag.org runbook (suggested location: new `docs/DEVOPS_GUIDE.md §EX4` adjacent to §4.2 Networking and TLS): issuance request in us-east-1 (covering both apex and `www.`), DNS validation records, attachment to the production CloudFront distribution, post-attachment verification.
- Author DNS cutover sequence runbook (suggested location: new `docs/DEVOPS_GUIDE.md §DNS` adjacent to §16.6): T-48 hours TTL drop, T-0 record swap, T+1 hour propagation check across three resolvers, T+24 hours TTL restore.
- Author webmaster coordination runbook (suggested location: new `docs/DEVOPS_GUIDE.md §ROUTE53` adjacent to §16.6): zone-authority handoff checklist, communication touchpoints, emergency rollback steps with the webmaster's contact path.
- Each runbook dry-run-tested against staging where feasible (SES staging account, staging Route 53 zone) before treating the cutover preflight as ready.

