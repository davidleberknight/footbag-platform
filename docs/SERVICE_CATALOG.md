# Footbag Website Modernization Project -- Service Catalog

This catalog defines the target service-layer design: ownership boundaries, required patterns, and invariants for every permanent service under `src/services/**` and every adapter under `src/adapters/**`. It describes durable design intent; current shapes (signatures, return types, in-progress implementation state) live in TypeScript, tests, and `IMPLEMENTATION_PLAN.md`. When this catalog and `IMPLEMENTATION_PLAN.md` disagree, the plan wins for current-state questions; this catalog wins for target-design questions. Never silently reconcile them.

## Table of Contents

- [1. Purpose and authority](#1-purpose-and-authority)
- [2. How to use this catalog](#2-how-to-use-this-catalog)
- [3. Global service-layer rules](#3-global-service-layer-rules)
- [4. Non-negotiable target invariants](#4-non-negotiable-target-invariants)
- [5. Service ownership matrix](#5-service-ownership-matrix)
- [6. Service-specific target notes](#6-service-specific-target-notes)
  - [6.1 Identity and account](#61-identity-and-account)
  - [6.2 Clubs and events](#62-clubs-and-events)
  - [6.3 Payments and membership](#63-payments-and-membership)
  - [6.4 Voting and recognition](#64-voting-and-recognition)
  - [6.5 Content and discovery](#65-content-and-discovery)
  - [6.6 Communication](#66-communication)
  - [6.7 Governance and operations](#67-governance-and-operations)
- [7. Target architecture and deferred surfaces](#7-target-architecture-and-deferred-surfaces)
- [8. Catalog update rules](#8-catalog-update-rules)

---

## 1. Purpose and authority

This catalog owns: target service ownership, target service boundaries, target required patterns, and target invariants. It is authoritative for design questions about which service owns which domain, what patterns each service must follow, and which invariants apply across all services.

This catalog does not own: current method signatures, current return shapes, current call graphs, current bug behavior, or current implementation status. Those live in TypeScript, tests, and `IMPLEMENTATION_PLAN.md` respectively. It also does not own bookmarkable page-route contracts or page-layout contracts; those belong to `docs/VIEW_CATALOG.md`.

This catalog is intentionally partial. A capability may still be part of the broader product because it is defined elsewhere in the project docs even when it is not yet cataloged here.

There is no target-design `publicController` layer. Public controllers and routes stay thin and delegate to services.

## 2. How to use this catalog

Read order for any task that touches the service layer:

1. `IMPLEMENTATION_PLAN.md` active-slice block, for current scope and known deviations.
2. `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, and `docs/DATA_GOVERNANCE.md`, for functional and policy requirements.
3. This catalog, for the target service ownership and required patterns.
4. TypeScript, tests, and `database/schema.sql`, for current shapes and current behavior.

When a current shape disagrees with a target pattern, that is a deviation, not drift in this catalog. Track the deviation in `IMPLEMENTATION_PLAN.md`. Do not edit the target pattern here unless the maintainer has approved a design change.

## 3. Global service-layer rules

**Rule notation:** `[DB]` enforced by schema or trigger; `[APP]` application-enforced; `[DB+APP]` both layers.

**Delete semantics:** `HD` hard-delete (row gone); `SD` soft-delete (`deleted_at` set); `SA` status-archive (`status='archived'`; clubs only, no `deleted_at` column).

**Naming conventions:**
- Service files: `<domain>Service.ts`.
- Controller files: `<domain>Controller.ts`.
- Prepared-statement groups: object exports in `src/db/db.ts` named after the domain or feature; QC-only groups carry the `// ---- QC-only (delete with pipeline-qc subsystem) ----` banner.
- Service errors: `<Kind>Error` extending `ServiceError` in `src/services/serviceErrors.ts`. Canonical classes: `ValidationError`, `NotFoundError`, `ServiceUnavailableError`, `ConflictError`, `RateLimitedError` (carries `retryAfterSeconds`).

**Thin controllers:** Public controllers and routes do not contain business logic. They delegate route interpretation, validation, and page shaping to services. Page-oriented read methods on services return view-models that controllers render directly.

**SQL surface:** All SQL lives in `src/db/db.ts` as named prepared-statement objects. Services call `db.ts` methods; controllers, templates, and other code never touch SQL directly. Repository layers and ORMs are not authorized.

**Page model shaping:** Services own `PageViewModel<TContent>` shaping for the routes they back. Templates receive shaped models and render them; templates do not derive fields, build URLs, map enums to labels, or reach into raw DB rows.

**Timestamps:** All writers must use `strftime('%Y-%m-%dT%H:%M:%fZ','now')`, not `datetime('now')`. The space-separated format breaks lexical ordering in views, triggers, and timestamp string comparisons.

**Transactions and idempotency:** Coupled local writes (dual-write pairs, multi-row updates with referential constraints) must run in a single atomic transaction. Webhook and job handlers must be idempotent. Domain services own idempotency behavior even when DB unique indexes assist. Outbox enqueue uses stable idempotency keys.

**Adapter pattern:** Adapters are the only seam between app code and external services. Interface name: `<Purpose>Adapter`; implementation name: `<Backend><Purpose>Adapter`. Current adapters: `JwtSigningAdapter` (`createLocalJwtAdapter` for dev/test with a file-based RSA keypair and RS256, `createKmsJwtAdapter` for staging and production via AWS KMS Sign/GetPublicKey with RS256); `SesAdapter` (`StubSesAdapter` for dev with in-process capture, `LiveSesAdapter` for staging and production); `MediaStorageAdapter` (local filesystem for dev, S3 for staging and production; content-agnostic, handles photos, system-account video bytes, and posters identically); `SecretsAdapter` (`StubSecretsAdapter` for tests, `LocalSecretsAdapter` reading a gitignored `.local/secrets.json` for dev, `LiveSecretsAdapter` reading SSM SecureString parameters with KMS decryption and lazy in-process cache for staging and production); `SafeBrowsingAdapter` (`StubSafeBrowsingAdapter` for dev/test with an in-memory deny list, `LiveSafeBrowsingAdapter` for staging and production via the Google Safe Browsing v4 threatMatches:find endpoint; API key resolved through `SecretsAdapter` at first lookup); `HttpReachabilityAdapter` (`StubHttpReachabilityAdapter` for dev/test, `LiveHttpReachabilityAdapter` for staging and production with outbound HEAD probes, redirect-follow + per-hop SSRF re-check, and a 24-hour closure cache; `DisabledHttpReachabilityAdapter` for deployments that opt out of all outbound HTTP from the validation path); `ImageProcessingAdapter` (`HttpImageAdapter` calling the in-cluster image worker container in all environments; tests inject test doubles via `setImageProcessingAdapterForTests`); `VideoTranscodingAdapter` (`HttpVideoTranscodingAdapter` calling the in-cluster image worker container in all environments; tests inject test doubles via `setVideoTranscodingAdapterForTests`). Adapters fail-fast at boot when required env vars are absent. Integration tests stand up an injected fake client against the adapter interface; tests never mock the AWS SDK package itself. See `tests/CLAUDE.md` for the required three-test parity pattern (boot-time, interface parity, staging smoke).

**Catalog scope and tiers:** This catalog covers four organizational tiers:
1. Adapters under `src/adapters/<purpose>Adapter.ts`.
2. Permanent product services under `src/services/<domain>Service.ts`.
3. Dev-mode shaping services (e.g. `simulatedEmailService.ts`) whose only job is to produce fallback view-models when an adapter is in stub mode; the name carries the "not for production delivery" signal and env config gates the behavior.
4. Internal-only subsystems are **not cataloged**. The current QC-only subsystem (`src/internal-qc/**`, with views under `src/views/internal-qc/**`) carries the `// ---- QC-only (delete with pipeline-qc subsystem) ----` banner on every source file and retires with the pipeline-qc subsystem; future role-gated internal-admin tooling will get its own subtree (`src/internal-admin/`) and its own catalog treatment when built.

**Rate limiting:** Per DESIGN_DECISIONS.md §1, rate-limit enforcement (`rateLimitHit` plus `throw new RateLimitedError(...)`) lives in the same layer as the action being limited: controllers when the keying is request-shape-derived (per-IP, per-session, per-target), state-changing services when the keying belongs to the action itself. Controllers catch `RateLimitedError` and map it to HTTP 429 with `Retry-After` set from `retryAfterSeconds`. Never implement rate limits in a per-route blanket middleware. All bucket sizes and windows come from `system_config_current` keys.

**Read-model conventions:**
- `member_tier_current` is the authoritative membership-tier projection. There are no tier cache columns on `members`. The sole authoritative tier read path is `MembershipTieringService.getTierStatus(memberId)`.
- `member_active_player_current` is the authoritative Active Player projection; the sole read path is `ActivePlayerService.getStatus(memberId)`.
- `member_membership_status_current` is the combined gate composed from the two preceding views.
- `system_config_current` is the authoritative read surface for runtime config; never query the bare `system_config` table for operational use.
- `members_searchable` is the only authorized surface for member search; it applies five exclusion conditions (soft-deleted, deceased, opted-out, PII-purged, unverified).
- `members_active` filters `deleted_at IS NULL` for general member lookups.
- `clubs_open` filters `status IN ('active','inactive')`; `clubs_all` includes archived (no `deleted_at` column on clubs).
- `email_templates_enabled` filters `is_enabled = 1` for active template lookups.
- `recurring_donation_subscriptions_active` is for non-canceled subscription queries; the bare table is queried directly only when canceled rows are needed.
- `news_items` and `events` are the canonical read surfaces for those hard-delete domains; no `_all` aliases.

**Side-effect categories:** Each service entry documents which apply: audit append, outbox enqueue, news emission, work-queue insert, alarm raise or ack.

## 4. Non-negotiable target invariants

**Anti-enumeration.** Any endpoint that could leak account existence (login, register, password-reset request, email-verify or resend, member lookup, legacy claim) returns identical UX and identical timing for "exists" vs "does not exist". Services enforce this by running the same code path in both cases (always hitting hash-compare, always running the rate-limit bucket); controllers must not short-circuit around an earlier existence check. Controllers may perform request-level gating that does not depend on account existence (Turnstile CAPTCHA, basic input validation) before invoking the service; such gating returns identical UX for both paths and therefore does not violate the no-short-circuit rule.

**Member, current-account, vs historical-person distinction.** Current `members` rows and `historical_persons` rows are distinct entity classes. A single physical person may have a current member account, a historical-person row, or both linked via `members.historical_person_id`. Historical pages must not imply current-member ownership or contactability. Public honor visibility for HoF/BAP historical persons is bounded and explicit.

**Tier 0 vs Active Player distinction.** Active Player is a temporary status for Tier 0 members only; Tier 1+ members never accrue Active Player rows. Vouches and attendance for Tier 1+ targets are no-ops with audit-log only. The no-shorten rule prevents an older event, vouch, or club-join from shortening an existing later expiry.

**Auth and role boundaries.** Registration is open. Login enforces rate limiting and lockout. Deceased members cannot log in regardless of credentials. Soft-deleted members within grace period get a restoration screen, not normal login. JWT payload embeds `password_version`; middleware verifies it on every authenticated request; bumping `password_version` on password change or reset invalidates all outstanding sessions immediately. Session cookies are `HttpOnly`, `Secure` in production, `SameSite=Lax`. Controllers set or clear cookies via `issueSessionCookie` / `clearSessionCookie`; never write `Set-Cookie` directly.

**Claim, reset, and password rules.** Claim initiation responses are non-revealing (no distinction between zero matches, multiple matches, ineligible rows, blocked rows). Tokens are stored as SHA-256 hashes only, never plaintext. Token TTLs come from `system_config_current` (`email_verify_expiry_hours`, `password_reset_expiry_hours`). `password_version` is the session/JWT invalidation counter, incremented on every password reset or change. `password_hash_version` tracks hash algorithm version only; the two are never conflated.

**Audit log append-only.** `audit_entries` UPDATE and DELETE are blocked by triggers. Every administrative action with reason text writes a row. Reason text is mandatory where the contract requires it.

**Ballot non-anonymity by design.** `ballots.voter_member_id` is stored in plaintext alongside the encrypted ballot. The participation fact (who voted) is intentionally non-anonymous. Ballot content is confidential via AES-256-GCM encryption with per-ballot KMS data keys.

**Work-queue admin-alerts coupling.** Every `work_queue_items` INSERT triggers an admin-alerts mailing-list notification (slug `admin-alerts`; task type and entity ID only, no sensitive data).

**Event hard-delete rule.** Draft and canceled events are HD immediately. Events with published results are preserved permanently and must never be deleted. Application guards on every delete path before execution.

**System config writes are append-only.** Config values change by inserting a new `system_config` row with the new `value_json`, `effective_start_at`, and `changed_by_member_id`. Existing rows are immutable (UPDATE and DELETE blocked by DB triggers). `system_config_current` automatically reflects the latest effective value per key. Application code never UPDATEs or DELETEs `system_config` rows.

## 5. Service ownership matrix

| Service | Owns | Does not own | Required patterns | Key callers | Source |
|---|---|---|---|---|---|
| `IdentityAccessService` | Account entry and auth: register, verify-email, credential check, password change/reset, archive passthrough. Legacy-account claim flows (two-step token + email-equality fast path), direct historical-person claim (surname rule honors declared former surnames), auto-link classification over the member's email-anchor set (verified login email, then declared old emails), staged-candidate lifecycle (stage / confirm / decline / expire) including cross-source offers, declared identity anchors with the mailbox-control round-trip, registration-time conflict detection, member link help requests (intake + admin approve/reject), auto-link revert and the admin dispute revert | Member profile CRUD, historical-person reads, tier calculation, session-cookie HTTP glue, club lifecycle, tier-grant writes (delegates to `MembershipTieringService`) | Anti-enumeration; rate limiting in service; `password_version` invalidates JWTs; SHA-256 token storage; non-revealing claim response with discriminated outcome for controller-only consumption; atomic legacy-claim merge that marks `legacy_members` row claimed without deleting; transitive HP-claim through `legacy_member_id` back-link; surname-match precondition on direct HP claim with first-name-variant warning; atomic auto-link revert that clears linkage, conditionally clears HP back-link, writes a revoke tier-grant row, enqueues admin review, and returns a non-revealing discriminated status | Web auth controllers; auth middleware; claim controller; `OperationsPlatformService` | `src/services/identityAccessService.ts` |
| `MemberService` | Member-account page shaping; soft-delete; row-level PII purge primitive (`purgeAccountPII`: one transaction clearing credentials/contact/links/anchors, HoF/BAP display preserved); deceased handling; GDPR export; member search | Login/registration credential check; legacy-claim flow; tier writes; payments | `members_searchable` for search; S3-deletion-before-`deleted_at`; PII purge atomic; deceased and soft-deleted are distinct grace paths; owner-only profile routes | Member controllers; `AdminGovernanceService`; `OperationsPlatformService` (purge) | `src/services/memberService.ts` |
| `HistoryService` | Historical-person index/detail page reads; historical-results page shaping | Current member-account lifecycle; profile CRUD; member search; claim flow | Read-only; historical vs current-member distinction; no contact-leakage on historical pages | Public history controller; event-result participant-link flows | `src/services/historyService.ts` |
| `HomeService` | Service-shaped landing-page composition for `GET /` | Generic event browse; club-directory logic; layout chrome | Composition-page exception (intentional); no `publicController` layer; no separate front-end stack | Public home controller | `src/services/homeService.ts` |
| `ClubService` | Club lifecycle (create through archive); leader and co-leader management; roster; operability | Media; payments | SA only (no `deleted_at`); one leader per club, one club leader per member; max 5 leaders; anti-self-removal; standard-tag reservation via `HashtagDiscoveryService`; news via `NewsService.emitNewsItem` only | Member controllers; `AdminGovernanceService`; `MemberService` (deceased) | `src/services/clubService.ts` |
| `EventService` | Event lifecycle; discipline management; co-organizer management; sanction requests; results upload; public event reads | Registration payments; competition participation records | Public eventKey normalization (`event_{year}_{slug}`) before DB lookup; status state-machine; HD guard on published-results events; sanction requires organizer Tier 2; max 5 organizers; news via `NewsService.emitNewsItem` only | Public event controllers; member and organizer controllers; `AdminGovernanceService`; `CompetitionParticipationService` | `src/services/eventService.ts` |
| `CompetitionParticipationService` | Event registration; discipline selections; attendance marking; participant list management | Event creation; payment processing; vouching; official roster export | Discipline-completeness gate before `confirmed`; attendance delegates Active Player effect to `ActivePlayerService.applyAttendance`; capacity transitions event to `registration_full`; participant email rate-limited 1/event/day | Member controllers; `EventService` (results auto-attendance); `AdminGovernanceService` | `src/services/competitionParticipationService.ts` |
| `FreestyleService` | All public freestyle section page reads | Event lifecycle; canonical result ingestion; net or consecutive domain reads | Read-only against canonical tables; `NotFoundError` on unknown trick slug; trick detail gallery filters to curator-uploaded media joined to `media_sources` | Public freestyle controller | `src/services/freestyleService.ts` |
| `RecordsService` | Public cross-sport records page read for `GET /records` | Event lifecycle; per-sport detail pages | Read-only against canonical tables; cross-sport aggregation in one view-model | Public records controller | `src/services/recordsService.ts` |
| `NetService` | Public Footbag Net portal, team list, and team detail page reads | Canonical result ingestion; freestyle or consecutive domain reads | Statistics firewall (`canonical_only` only); conflict-flag-aware discipline label resolution; algorithmic-team disclaimer always rendered; no win/loss, head-to-head, or rankings; `NotFoundError` on unknown team ID | Public net controller | `src/services/netService.ts` |
| `SidelineService` | Public sideline section page read for `GET /sideline` | Competitive event lifecycle; record aggregation | Static content; fixed game list with optional asset paths and links; zero offsite links | Public sideline controller | `src/services/sidelineService.ts` |
| `RulesService` | Public rules section reads (`GET /rules` and `GET /rules/:disciplineSlug/:ruleSlug`) | Event lifecycle; governance editing; record aggregation | Filesystem-backed (`ifpa/rules/*.md` parsed via `marked` v14, in-memory cache); H1-per-rule with `slugify(headingText)` slugs; YAML frontmatter applies to every rule split from a discipline file; `NotFoundError` on unknown slug; zero offsite hyperlinks in rendered pages | Public rules controller | `src/services/rulesService.ts` |
| `IfpaService` | Public IFPA governance hub reads (`GET /ifpa` and `GET /ifpa/:docSlug`) | Sport rules (delegated to `RulesService`); membership ledger writes; governance editing | Filesystem-backed (`ifpa/*.md` parsed via `marked`, in-memory cache); one doc per top-level markdown file under `ifpa/`; hard-coded short-summary copy on the hub for editorial control; `NotFoundError` on unknown slug | Public ifpa controller | `src/services/ifpaService.ts` |
| `ContactRequestService` | Member contact requests: submit, list-open-for-admin, resolve (status + audit + email reply) | Member field mutations (admin performs those through their own tools); routing visitor-side contact (visitor surface remains `/legal` mailto:) | All writes go through `work_queue_items` with `task_type='member_contact_request'` and `audit_entries` with `category='support'`; per-member open-count cap of 3 enforced via `workQueue.countOpenForMember`; resolution emails enqueued via `CommunicationService.enqueueEmail` with idempotency key `contact-request-resolve:<queueItemId>` and the `corrected|denied|duplicate|out_of_scope` decision label | `contactRequestController`; `adminWorkQueueController` | `src/services/contactRequestService.ts` |
| `PaymentService` | All Stripe interactions: one-time payments, recurring donations, webhook processing, reconciliation; member-facing payment-page shaping | Tier grant logic; registration confirmation | Stripe success gating (tier grants and confirmed registrations only after `succeeded`); paired `payment_status_transitions` insert in same transaction; webhook dedupe via `stripe_events.event_id`; refund preserves tier grant; canonical `members.stripe_customer_id` distinct from per-payment snapshot | `MembershipTieringService`; `CompetitionParticipationService`; `AdminGovernanceService`; webhook controller | `src/services/paymentService.ts` |
| `MembershipTieringService` | Membership-tier ledger writes; HoF/BAP Tier 2 grants; Tier 3 governance set/remove; admin-role grants; sole authoritative tier read path | Payment processing; registration; Active Player lifecycle; official roster reads | Append-only ledger; `getTierStatus` reads `member_tier_current`; source-linkage discipline (no event/vouch/club FK on `member_tier_grants`); refund does not write a `revoke` row; admin role requires Tier 2 or Tier 3, anti-lockout enforced; admin-alerts subscription updated atomically with `is_admin`; news via `NewsService.emitNewsItem` only | `PaymentService`; `AdminGovernanceService`; `ActivePlayerService` (tier checks) | `src/services/membershipTieringService.ts` |
| `ActivePlayerService` | Active Player ledger; vouch action table; sole authoritative AP read path | Membership-tier writes; event registration; club affiliations | Append-only ledger; `getStatus` reads `member_active_player_current`; Tier 0 only (Tier 1+ no-op with audit log); no-shorten rule; club-join lifetime-once; vouch rate-limited; self-vouch rejected at DB and APP | `CompetitionParticipationService`; `ClubService`; member controllers (vouch); `MembershipTieringService` (end-on-upgrade in same transaction); `OperationsPlatformService` (expiry job) | `src/services/activePlayerService.ts` |
| `ActivePlayerExpiryService` | SYS_Check_Active_Player_Expiry daily pass: Tier 0 candidate scan, per-offset reminder enqueue with per-(member, expires_at, offset) dedup, `applyExpiry` invocation for lapsed grants | `system_job_runs` lifecycle (wrapped by `OperationsPlatformService.recordJobRun`); scheduler invocation; AP ledger writes (delegates to `ActivePlayerService.applyExpiry`) | Idempotent per-(member, expires_at, offset_label) via `active_player_reminder_sent`; `email_status='ok'` and `active-player-reminders` subscription gate (absence = subscribed by default); admin-configured offsets from `system_config_current`; T+0 day-of built-in; tier1+ filtered at the candidate view | `OperationsPlatformService` (job orchestration); worker daily-tick loop | `src/services/activePlayerExpiryService.ts` |
| `HofBapAdminDigestService` | SYS_HoF_BAP_Admin_Digest daily pass: scans the prior 24 hours of `member_tier_grants` rows with `reason_code = 'legacy.claim_tier_grant'` AND HoF or BAP honor flag, enqueues one digest email to the `admin-alerts` mailing list summarizing each match | `system_job_runs` lifecycle (wrapped by `OperationsPlatformService.recordJobRun`); scheduler invocation; mailing-list enqueue (delegates to `CommunicationService.enqueueMailingListEmail`) | Window-gated by `hof_bap_digest_cutover_at_iso` and `hof_bap_digest_window_days` in `system_config_current` (absent or empty disables the job; outside-window is a no-op); per-UTC-day idempotency key prevents duplicate sends on same-day rerun; payload contains row identifiers and decision-relevant attributes only, never member contact fields | `OperationsPlatformService` (job orchestration); worker daily-tick loop | `src/services/hofBapAdminDigestService.ts` |
| `SesFeedbackService` | SES bounce/complaint feedback intake: SNS notification parsing, escalation-only `members.email_status` writes (`bounced` from ok; `complained` from ok/bounced; admin-set `suppressed` never overwritten), per-recipient audit rows | Transport auth (shared-secret query key checked by the IPC controller); SNS subscription confirmation (recorded for the operator, never auto-fetched) | Permanent bounces only (transient bounces change nothing); every processed notification appends `email.bounce_recorded` / `email.complaint_recorded` with a masked address | Public webhook route (`/webhooks/ses-feedback`) | `src/services/sesFeedbackService.ts` |
| `AdminBootstrapService` | Production first-admin bootstrap: single-shot SSM-token claim with constant-time comparison; atomic `is_admin=1` + Tier 2 invariant grant + `grant_admin_bootstrap` audit; parameter deletion closes the path | Steady-state admin grants (`A_Manage_Admin_Role`); dev/staging allowlist bootstrap | Non-revealing result for every failure shape; rate-limited per member and per IP; deletion failure raises an operational error rather than failing the grant | Bootstrap-claim route above the admin gate | `src/services/adminBootstrapService.ts` |
| `AdminClubLeadershipService` | Admin leadership remediation: Needs Leader / Needs Contact queue (computed fresh on open), assign from the member base (affiliation created or reactivated), leader/co-leader role changes with same-club swap in one transaction, demotion with mandatory reason, five-row cap with explicit cap-override reason, contact-email remediation | Member-facing leadership flows (ClubService, onboarding paths 1 and 2); club viability cleanup (ClubCleanupService) | Schema leadership invariants stand (one leader per club, one leader role per member); resolving leadership supersedes the club's provisional `club_bootstrap_leaders` rows; every action audit-logged with before/after and reason | Admin club-leadership routes | `src/services/adminClubLeadershipService.ts` |
| `OfficialRosterService` | Official IFPA Roster reads (`list`, `summary`, `exportCsv`); roster is not public | Membership-tier writes; Active Player lifecycle; admin orchestration | Roster includes Tier 1+ plus Tier 0 with current Active Player; deceased excluded; sole surface for roster reads; all access audit-logged with `category = 'roster_access'` | `AdminGovernanceService`; admin controllers | `src/services/officialRosterService.ts` |
| `VotingElectionService` | Vote lifecycle; ballot submission and encryption; eligibility snapshots; tally and publish; HoF nomination and affidavit flows | Admin role management; HoF inductee display | Append-only ballots; write-once eligibility snapshot; options lock at open; tally requires `can_tally_votes` permission and `status = 'closed'` AND `now > vote_close_at`; receipt token plaintext never persisted, SHA-256 stored, body scrubbed after delivery; ballot non-anonymity by design; news via `NewsService.emitNewsItem` only | Admin and member controllers; `OperationsPlatformService` (open/close jobs) | `src/services/votingElectionService.ts` |
| `HallOfFameService` | HoF landing page read for `GET /hof`; service-shaped, no DB | HoF tier promotion or `is_hof` writes; nomination/affidavit/election lifecycle | Read-only; service provides `content.externalLink` so templates do not construct the standalone HoF URL | Public HoF controller | `src/services/hofService.ts` |
| `BigAddPosseService` | BAP landing page read for `GET /bap`; service-shaped, no DB | BAP tier promotion or `is_bap` writes | Read-only; service provides `content.externalLink` so templates do not construct the standalone BAP URL | Public BAP controller | `src/services/bapService.ts` |
| `MediaGalleryService` | Member photo upload and processing; member video link submission; gallery management; media tagging; flag and moderation | Curator-attributed uploads; tag stats recomputation; S3 lifecycle | HD media (no soft-delete); photo re-encode plus EXIF/ICC strip plus resize is mandatory; max 5 video embeds per gallery; one avatar per member; tag validation delegated to `HashtagDiscoveryService.validateAndResolveTag`; tag stats not recomputed here; uploader-attribution `#by_<slug>` namespace is system-managed at upload | Member controllers; `AdminGovernanceService` | `src/services/mediaService.ts` (and `createAvatarService` factory in `avatarService.ts`) |
| `HashtagDiscoveryService` | Tag creation and validation; tag browse and search; tag stats cache; teaching moments | Media tagging operations | Global tag uniqueness via `ux_tags_normalized`; standard tags (`is_standard = 1`) must not be HD; community-tag threshold `distinct_member_count >= 2`; `rebuildTagStats` reads both `media_tags` (usage count) and `members` (distinct count); `rebuildTagStats` is invoked only by `OperationsPlatformService.runTagStatsRebuild` | `MediaGalleryService`; `EventService`; `ClubService`; member controllers; `OperationsPlatformService` | `src/services/hashtagDiscoveryService.ts` |
| `NewsService` | News item creation (auto and admin); moderation; public feed | Generating its own news (calling services invoke `emitNewsItem`) | HD news; `emitNewsItem` is the only auto-write path, controlled vocabulary; deletion requires mandatory reason; future-dated items invisible until publish | `EventService`; `ClubService`; `MembershipTieringService`; `VotingElectionService`; `AdminGovernanceService` | `src/services/newsService.ts` |
| `LegalService` | Static page view-model for `/legal` (Privacy, Terms of Use, Copyright and Trademarks as three anchored sections) | Policy decisions themselves (authored out-of-band) | Static content, no DB; fixed section order with stable anchor IDs; `content.lastUpdated` updated on substantive changes | Web controller (`legalController.index`) | `src/services/legalService.ts` |
| `CuratorMediaService` | Admin upload, edit, delete, list of curator-attributed media on behalf of the system member account; named-gallery editing for FH-owned and member-owned `member_galleries`; magic-byte and format validation; ffmpeg curator transcode | Member-attributed uploads | `uploader_member_id` is always the system member id (admin actor recorded only in audit); curator video bytes use `video_platform='s3'` (member video routes reject this as defensive boundary); auto-applies `#curated`; rejects `#by_*` from input on gallery edits (uploader-attribution is system-managed at upload time); FH-owned gallery JSON sidecars at `/curated/galleries/<slug>.json` are source of truth; member-owned galleries auto-prepend `#by_<owner_slug>` to criteria tags | Admin controllers; `CuratorSeedService`; member gallery controllers (member-owned editing path) | `src/services/curatorMediaService.ts` |
| `CuratorSeedService` | Reconciliation of curator media against `/curated/`-style source directories paired with sidecar `.meta.json` siblings | Direct DB or storage writes (delegates to `CuratorMediaService`) | Idempotent reconcile; orphan detection scoped to system-uploader rows with non-NULL `source_filename`; member-uploaded rows never touched; per-file errors do not abort the run | Deploy scripts; local-dev incremental seeds | `src/services/curatorSeedService.ts` |
| `MediaJobService` | Lifecycle of `media_jobs` rows backing the asynchronous interactive admin video upload | ffmpeg execution; S3 I/O; event publication (the in-process `JobEventBus` module owns subscriptions) | Optimistic-locked state transitions (UPDATE WHERE state=expected); `getJobForAdmin` returns `null` for both unknown and not-owned (anti-enumeration); boot-time recovery is the only sweep (no steady-state polling) | Admin curator upload controller; transcode worker dispatch handler | `src/services/mediaJobService.ts` |
| `CommunicationService` | Outbox polling and sending via SES; mailing list management; subscription management; email archival; SES bounce/complaint; email template management | Triggering sends directly (other services enqueue) | Outbox pattern (no service calls SES directly); receipt-token scrub on `body_text` after delivery; DB-stored email templates; `email_templates_enabled` view for active templates; `admin-alerts` is system-managed; idempotency key on enqueue prevents duplicate sends; `sendAnnounceEmail` is Tier 2+ (distinct from admin-only list sends) | All services (enqueue); `AdminGovernanceService`; `OperationsPlatformService` (worker, webhook routing) | `src/services/communicationService.ts` |
| `SimulatedEmailService` | Dev-mode view-model for `simulated-email-card` partial on email-gated public pages | Any outbox write or production delivery path | Two-mode env switch (`dev` / `null`); reads in-memory `StubSesAdapter.sentMessages`, never `outbox_emails`; returns `null` in production | `authController` (via `auth/check-email` template) | `src/services/simulatedEmailService.ts` |
| `AdminGovernanceService` | Admin dashboard; work-queue management; audit log viewing; system health view; alarm management; official roster report and export orchestration; reconciliation digest data assembly; system config writes | Domain business logic; runtime config reads (jobs and services read `system_config_current` directly) | Append-only `system_config`; admin UI read path only (not the runtime config read path); roster reads delegated to `OfficialRosterService`; pricing keys integer cents | Admin controllers | `src/services/adminGovernanceService.ts` |
| `OperationsPlatformService` | Background job orchestration; system job-run logging; alarm raise/ack; backup jobs; static asset cleanup; readiness composition | Domain business logic (delegates to named domain services); row-level PII purge logic | All jobs read `system_config_current` at runtime (no hardcoded thresholds); webhook handlers idempotent; PII purge has separate soft-deleted vs deceased branches with distinct grace configs; events with published results and clubs preserved permanently; readiness composition is SQLite connectivity plus container memory pressure only; backup health, SES, KMS, Stripe, and S3 are alarm-surfaced, not part of `/health/ready` | Job scheduler; system-role processes | `src/services/operationsPlatformService.ts` |

## 6. Service-specific target notes

Each entry below is self-contained: it states ownership boundaries, required patterns the service must follow, and side effects. Method names live in the cited source file; SC §6 does not mirror them. Cross-references to other services use service or method names inline; this section deliberately avoids "see X entry" routing so services can be split into per-file documents without rewrites.

### 6.1 Identity and account

**`IdentityAccessService`** (`src/services/identityAccessService.ts`)

Owns account entry and authentication flows (registration, email verification, credential verification, password change and reset, legacy archive passthrough JWT) and the legacy-migration claim mechanics (legacy-account claim via two-step emailed-token flow with email-equality fast path, direct historical-person claim, auto-link classification). The post-verify rendering surface that unifies these flows is owned by `MemberOnboardingService` (the `legacy_claim` task). Does not own member profile CRUD, historical-person reads, tier calculation (delegates to `MembershipTieringService`), data exports, session-cookie HTTP glue (controllers set and clear cookies; the service returns a signed JWT string), club lifecycle, or club-leader promotion beyond bootstrap confirmation.

Auth-path: the archive passthrough is an accepted operational trade-off; the archive edge does not re-check `password_version`, so archive JWTs expire naturally at `jwt_expiry_hours`.

Legacy-claim required patterns: claim initiation always returns a non-revealing response; no distinction between zero matches, multiple matches, ineligible rows, or blocked rows. Recommended message: "If an eligible legacy record was found, a claim email will be sent." Merge transaction is atomic; the target `legacy_members` row is MARKED CLAIMED (`claimed_by_member_id` plus `claimed_at` set) and is not deleted (permanent archival record). Member-editable fields copy to the claiming `members` row per the MIGRATION_PLAN merge rules (COALESCE, OR-merge, fill-if-empty). When the target's `legacy_member_id` matches a `historical_persons.legacy_member_id`, `members.historical_person_id` is set to that HP's `person_id` in the same transaction and the HP-sourced field merge runs (country fill-if-empty; `is_hof`/`is_bap` OR; `hof_inducted_year`/`first_competition_year` fill-if-empty). All outstanding `account_claim` tokens targeting the claimed `legacy_members` row are marked consumed in the same transaction. Rate limiting applies per requesting account, per target row, and per session/IP. A token may only be consumed by the same `member_id` that initiated the request. Single tier grant via `MembershipTieringService` with `reason_code = 'legacy.claim_tier_grant'` applying the blanket mapping in `MIGRATION_PLAN.md`; no conditional "exceeds current" logic. `legacy_is_admin` metadata is never auto-promoted to live admin role in any flow. Two-current-club cap: when writing a confirmed current affiliation to `member_club_affiliations`, the service checks the member's current-affiliation count; if the count is already at the cap (2), the insert is skipped. The first current club is primary; the second is secondary. Joining a second club does not convert the first to former. Bootstrap leadership promotion only when no conflicting live `club_leaders` row exists for the club; conflicts leave the bootstrap row provisional and create an admin work-queue item. Direct HP claim eligibility requires surname match between `members.real_name` and `historical_persons.person_name`; first-name variance (e.g. Bob/Robert) is permitted with a `firstNameWarning` flag on the preview.

Email-equality fast path: when the requesting member's verified `login_email` equals the matched legacy row's `legacy_email` (normalized: lowercase, trim), mailbox control has already been proven by registration verification and the second token-email step is skipped; the merge runs synchronously inside the initiation call. Anti-enumeration is preserved because the fast path is reachable only after a positive lookup; a non-matching identifier still produces the silent no-match outcome and the generic banner. A stub `legacy_members` row with no `legacy_email` is still claimable through the historical-person card-confirm path; the mailbox-control email roundtrip is optional and only upgrades the audit evidence tier. Admins requiring manual recovery use `manualLegacyClaimRecovery`.

Initiation outcome surfacing: the initiate call returns a discriminated outcome (`enqueued`, `no_match`, `target_rate_limited`, `auto_linked`) for controller consumption. The public HTTP response is invariant across the three non-`auto_linked` kinds (anti-enumeration). The outcome is used only at the controller layer to (a) redirect on `auto_linked`, and (b) surface a dev-mode operator note on the simulated-email card when no email was actually enqueued; production behavior is unchanged because the simulated card itself does not render in production.

Unified linking surface: the onboarding wizard's `legacy_claim` task (owned by `MemberOnboardingService`) is the single post-verify page. It mixes `legacy_members` + `historical_persons` + back-linked "both" cases into one candidate list with neutral provenance labels, plus a manual-id input that tries both tables in sequence. High/medium classifier output appears as a one-click "This is me" card at the top; low-confidence registrants see a banner plus the same candidate list; no-match registrants see an empty list plus the manual-id input. On completion the wizard advances to the `club_affiliations` task. The wizard's POST endpoints (`/register/wizard/legacy_claim/find`, `/auto-link/confirm`, `/claim/confirm`, `/claim/confirm/:token`) own the manual-id flow, auto-link commit, and token-consume merge. Per DD §5.2, every POST 303-redirects to a wizard GET route and carries transient result state in signed flash cookies (`WIZARD_LEGACY_CLAIM_RESULT`, `WIZARD_AUTO_LINK_DRIFT`); the receiving GET renders the transition's result inline within the wizard. Profile-edit's CTA points to the wizard task whenever either link is missing.

Transactional variants: `consumeAndClaimLegacyInTx` and `claimHistoricalPersonInTx` accept caller-owned transactions so the wizard orchestrator can run the merge and the `member_onboarding_tasks` row transition inside one transaction (the atomicity invariant in §6.2 below). The `consumeAndClaimLegacy` and `claimHistoricalPerson` wrappers open their own transactions for callers outside the wizard.

Auto-link revert: `revertAutoLink(memberId, originalClaimAuditId, actor)` performs an atomic revert of a confirmed batch auto-link claim when the member reports it incorrect (from the wizard's staged-candidate card or the profile-settings affordance; under stage-and-confirm there is no silent-claim path and no auto-link notification email). Clears `members.legacy_member_id`, `legacy_members.claimed_by_member_id`, and `legacy_members.claimed_at` in a single transaction. `members.historical_person_id` is conditionally cleared: when the linked HP's `legacy_member_id` matches the cleared linkage the HP back-link is removed (preserving direct-HP claims, which retain their `historical_person_id`). Appends a `member_tier_grants` row with `change_type = 'revoke'` and `reason_code = 'legacy.auto_link_reported_incorrect'` via `MembershipTieringService.applyAutoLinkRevertGrantInTx`. Enqueues a `work_queue_items` row with `task_type = 'auto_link_revert_review'` referencing the original audit row. Emits an `audit_entries` row with `action_type = 'legacy.auto_link_revert'` carrying `metadata_json.original_claim_audit_id`. Idempotent and anti-revealing: a second report against an already-reverted link or an unknown member returns a discriminated status (`already_reverted` / `not_found`) and writes nothing.




**`MemberOnboardingService`** (`src/services/memberOnboardingService.ts`)

Owns the per-member outstanding-tasks list for the post-registration wizard and the member dashboard task widget. Acts as the single entry point that both the registration wizard route family and the dashboard call to render and complete onboarding tasks. Does not own the underlying task logic; delegates legacy-claim mechanics to `IdentityAccessService`, club affiliation business rules to the clubs service, tier mapping to `MembershipTieringService`, and member-field validation to `MemberService`.

Required patterns: tasks are skippable at registration and resumable from the member dashboard; a `skipped` task does not block sign-in. Each task carries state in `member_onboarding_tasks` (`pending`, `skipped`, `completed`, `not_applicable`). Server determines applicability at list construction (e.g., no plausible legacy match → `not_applicable`, never rendered); client cannot bypass. Submission writes the underlying state via the owning service, then transitions the task row to `completed` in the same transaction. Every wizard transition (`start`, `submit`, `skip`, `complete`) emits an `audit_entries` row so the §9.3 signals table is captured uniformly across both entry points. The `legacy_claim` task renders the unified candidate-list view that mixes `legacy_members`, `historical_persons`, and the manual-id lookup; the underlying claim mechanics remain in `IdentityAccessService` and are delegated to.

Task catalog at cutover: `personal_details` (city (required), region (optional), country (required), date of birth (required), competition year, and optional `show_first_competition_year` toggle); `legacy_claim` (delegates to `IdentityAccessService.initiateLegacyClaim` / `consumeAndClaimLegacy` or auto-link); `club_affiliations` (two-stage flow: Stage 1 legacy-linked cards then Stage 2 region-level geographic matching, delegating to the clubs service; wrap-up links to clubs browse page); `show_competitive_results` (optional metadata, writes to `members`). Task ordering is fixed: `personal_details` first, `legacy_claim` second, `club_affiliations` third, `show_competitive_results` last. Adding a task type registers a new handler in the service-internal catalog; the public interface does not change.


Persistence: `member_onboarding_tasks` (owned), plus writes via delegated services (`members`, `member_club_affiliations`, `legacy_members.claimed_by_member_id`, etc.). `audit_entries` append.

Side effects: audit append per transition; outbox enqueue is delegated (e.g. `IdentityAccessService` enqueues claim emails when the `legacy_claim` task runs through the token path).

**`MemberService`** (`src/services/memberService.ts`)

Owns member-account page shaping for `/members/*` surfaces (public members welcome with tier explainer, own-profile as authenticated personal home composing membership tier, identity links, quick actions, member search, and coming-soon blocks; limited public HoF/BAP profile; profile edit including inline avatar upload), and member-account lifecycle (soft-delete, deceased handling, GDPR export, member search). Owns the row-level PII clearing logic (`purgeAccountPII`). Does not own login/registration credential verification, legacy-claim flow, or tier grants and ledger calculation. Does not orchestrate purge eligibility (`OperationsPlatformService` decides which members qualify and calls into the row-level purge).

Required patterns: search must use `members_searchable` view; do not add WHERE clauses on top of `members_active` or the bare table. `searchMembers` is authenticated Tier 0+ only; it is never callable from public routes; minimum 2-character query; substring match on display name; 20-result cap with `hasMore` flag and "refine your query" signal for broad queries; no browse-all pagination. Account deletion requires S3 photo deletion to succeed before `deleted_at` is set; gallery HD is part of the same atomic operation. PII purge runs in one transaction, callable only by `OperationsPlatformService`. Deceased and soft-deleted are distinct lifecycle paths: `deceased_cleanup_grace_days` applies only after `markDeceased`; `member_cleanup_grace_days` applies only after `deleteAccount`. Own-profile routes are owner-only; non-owner public profile viewing is limited to the explicit HoF/BAP exception; no contact-field leakage on public profiles. Max 3 external URLs per member; one avatar per member (partial UNIQUE index). Avatar upload validates JPEG/PNG only with 5 MB size limit, processes to thumb and display sizes, atomically replaces existing avatar.




**`HistoryService`** (`src/services/historyService.ts`)

Owns historical-person index and detail page reads, historical-results page shaping, and the service-layer distinction between imported historical people and current member accounts. Does not own current member-account lifecycle, profile CRUD, member search, or claim flow.

Required patterns: read-only; pages must not imply current-member ownership or contactability; public honor visibility for HoF/BAP historical persons is bounded and explicit; route handlers stay thin and page shaping belongs in the service.


Persistence: `historical_persons`, `event_result_entry_participants`, supporting event/result reads.

Side effects: none.

### 6.2 Clubs and events

**`HomeService`** (`src/services/homeService.ts`)

Owns the service-shaped landing-page composition for `GET /`. Home is the one intentional composition-page exception. Does not own generic event browse, club-directory logic, layout chrome, or controller concerns.

Required patterns: Home stays within the thin-controller and service-owned-shaping architecture; Home may be richer than ordinary list/detail pages but the page-composition contract belongs in the service, not in templates; no `publicController` abstraction; no separate Home-specific front-end stack.


Persistence: none directly; composes public read models from service-owned reads.

Side effects: none.

**`ClubService`** (`src/services/clubService.ts`)

Owns club lifecycle (create, edit, activate/deactivate, archive), leader and co-leader management, roster management, and operability enforcement. Does not own media or payments.

Required patterns: SA only (no `deleted_at` on `clubs`; use `clubs_all` for archived queries); one `role='leader'` per club; member can be leader of at most one club; max 5 leaders per club; anti-self-removal (sole leader cannot remove themselves); standard hashtag reserved via `HashtagDiscoveryService.reserveStandardTag()` at creation, permanent and not HD; club display names are not required to be globally unique (the hashtag is the canonical identifier); club operability is computed: zero current leaders surfaces the club in the admin leadership queue, plus the contact queue when it also has no club contact email; a successful leadership claim returns a club of any status to `'active'` (a new current affiliation does the same for an inactive club); leader contact email is member-visible by role; news items emitted via `NewsService.emitNewsItem` only.




**`ClubCleanupService`** (`src/services/clubCleanupService.ts`)

Owns club viability evaluation (`crowdsource_club_viability` predicate with G1-G4 gates per `A_Periodic_Club_Cleanup`), the `leaderless_active_club` and `stale_provisional_leader` predicates, admin club cleanup queue page shaping, cleanup resolution tracking (defer/dismiss/demote/archive), de-listing of unconfirmed legacy residue (`legacy_person_club_affiliations` 'pending' rows to 'former_only', per club and cascaded on demote/archive), and club detail page signal submission. Predicates are evaluated on demand when an admin opens the queue; there is no unattended background process. Does not own club lifecycle (ClubService) or signal collection during onboarding (MemberOnboardingService writes signals).

Required patterns: signal aggregation queries derive S1/S2/S3/L1/O1 from `club_viability_signals`, `legacy_club_candidates`, `club_leaders`, and `member_club_affiliations` at evaluation time. Resolutions tracked per club-plus-predicate in `club_cleanup_resolutions` (UNIQUE constraint); deferred items reappear after expiry. Admin queue never exposes which member submitted which signal (signal counts only). All resolutions audit-logged.

Persistence: `club_viability_signals` (read + write for detail page signals), `club_cleanup_resolutions` (owned), `clubs` (status write on resolution), `legacy_person_club_affiliations` (residue read + de-list write), `club_leaders` (read), `member_club_affiliations` (read), `club_bootstrap_leaders` (read), `legacy_club_candidates` (read), `audit_entries` (append).

Side effects: audit append per resolution and per residue de-list.

**`EventService`** (`src/services/eventService.ts`)

Owns event lifecycle (create through completion or cancellation), discipline management, co-organizer management, sanction requests, results upload, and the service-layer reads that power public event browse and detail pages. Does not own registration payments or competition participation records.

Required patterns: public eventKey parsing and validation belong in this service; the public underscore form `event_{year}_{event_slug}` maps to stored standard-tag form `#event_{year}_{event_slug}` before DB lookup with no aliasing or fuzzy match. Status state machine `draft -> pending_approval -> published -> registration_full | closed -> completed | canceled` with `completed` and `canceled` terminal. Public detail visibility limited to `published`, `registration_full`, `closed`, `completed`. HD guard: events with public result rows are preserved permanently; draft and canceled events HD immediately; cannot delete event with confirmed registrations. Sanction approval requires organizer active Tier 2 at approval time. Max 5 organizers per event; one `role='organizer'` per event; anti-self-removal. Standard tag reserved at creation via `HashtagDiscoveryService.reserveStandardTag()`; permanent. News items emitted via `NewsService.emitNewsItem` only. Public archive year derived from `events.start_date`; year archives are not paginated. `participantHref` set via `personHref(participant_member_slug, participant_historical_person_id)` so templates render plain name when null. Public reads use prepared statements directly; no repository layer or ORM. SQLite busy/locked failures translate to temporary-unavailable for controller-level safe handling. The canonical public event page is one route and one template; render emphasis is expressed through page-model fields (e.g. `primarySection`), not through alternate URLs.




**`CompetitionParticipationService`** (`src/services/competitionParticipationService.ts`)

Owns event registration, discipline selections, attendance marking, and participant list management. Does not own event creation, payment processing, vouching, or official roster reporting and export.

Required patterns: competitor registration requires at least one discipline selection before `status = 'confirmed'`. Attendance marking delegates Active Player effect to `ActivePlayerService.applyAttendance()`; this service never writes to `member_tier_grants` or `active_player_grants` directly. Capacity enforcement transitions event status to `registration_full` when reached. Participant email is rate-limited 1 per event per day. Roster reporting and export are not exposed here (`OfficialRosterService` for read paths; `AdminGovernanceService` for admin orchestration).


Persistence: `registrations`, `registration_discipline_selections`, `events`, `member_membership_status_current`, `members`, `email_archives`, `audit_entries`, `outbox_emails`.

Side effects: outbox enqueue (registration confirmation, reminder, participant emails), audit append.

**`FreestyleService`** (`src/services/freestyleService.ts`)

Owns all public freestyle section page reads (`GET /freestyle*`): landing, world records grouped by record type, leaders, about, Set Encyclopedia (`/freestyle/sets`), per-set detail pages (`/freestyle/sets/:slug`), set-notation reference (`/freestyle/sets/reference`; legacy `/freestyle/moves` 301-redirects here), compositional-sets hub (`/freestyle/compositional-sets`), glossary, operators reference (`/freestyle/operators`), observational layer (`/freestyle/observational`), the trick dictionary (`/freestyle/tricks` renders the By ADD browse view directly; `?view=*` selects alternate browse modes, `?family=*` filters to one family), individual trick detail pages, walking-family progression (`/freestyle/progression/walking-family`), per-modifier pedagogy (`/freestyle/modifier/:slug`), educational pathways index (`/freestyle/learn`), ADD accounting & analysis (`/freestyle/add-analysis`), and combo & run architecture (`/freestyle/combo-analysis`). Does not own event lifecycle, result ingestion, or other sport domains.

Required patterns: read-only against canonical tables; `NotFoundError` on unknown trick slug routed to a 404 by the controller; trick detail reference video gallery filters to curator-uploaded media (`#curated` plus `#freestyle` plus `#trick` plus the slug tag) joined to `media_sources` for provenance; operator-board partial is reused across two surfaces (landing and `/freestyle/learn`) as the movement-language primer (thirteen Tier-1 operators in set / body / structural tiers); `getOperatorBoard(surface: OperatorBoardSurface)` returns surface-invariant tier data and surface-specific heading and lede prose. Not a browse axis; educational infrastructure. Operator cards carry at most one deep-link to a mature destination (glossary entry, moves-page notation anchor, or modifier-family page); cards without a mature destination render with pure absence (no synthesized placeholder, no multi-link stacks). Restrained discoverability cue, not a navigation surface. Glossary §5 family-tree visuals render `FreestyleFamilyTree` entries shaped by `shapeFamilyTrees` against `freestyle_tricks.trick_family` for curator-selected pilot families. Glossary §6 Surface A (Common Advanced Modifiers) renders `ModifierFeelCard` entries from a service-module constant, anchored `id='modifier-{slug}'`. Glossary §6 Surface B (Advanced Decomposition & Operator Theory) carries an intermediate-operator reference subsection (`id='intermediate-operators'`) rendering `OperatorReferenceEntry` rows from `src/content/freestyleOperatorReference.ts`, each anchored `id='term-{slug}'` for equivalence-chain deep-linking with a `curatorConfirmPending` flag rendered as a pending badge when the decomposition is still under curator adjudication. Glossary §7 abbreviations subsection renders `FreestyleGlossaryAbbreviations` (split into `trickNames` and `operationalTokens`). The trick-dictionary landing portal-card grid and the `?view=sets` cluster grouping read two curator-authored reversible display layers (`src/content/freestylePublicFamilies.ts`, the 18-entry public family browse list (>2-member terminal-identity families; entry-side primitives such as ATW excluded from the family-root layer); `src/content/freestyleModifierClusters.ts`, the modifier clusters); these are navigation/display groupings only and never mutate or substitute for the canonical `freestyle_tricks.trick_family` taxonomy. `/freestyle/observational` renders a governance surface for the observational vocabulary universe: a three-layer ontology banner (canonical tricks / promotion frontier / lexical archive, distinct-structure counts) plus five governance sections (Ready-for-Promotion grouped by ecosystem, an ecosystem-frontier matrix with curator-confirm cards, doctrine-bottleneck clusters, folk-name unresolved, and parser uncertainty), shaped from the generated `freestyleObservationalUniverse.ts` content module (regeneration entry point `legacy_data/scripts/build_observational_universe_content.py`), with curator notes merged as an override layer from `freestyleObservationalTricks.ts`. Each row carries an 8-way `intakeBucket` (frontier: promotion_ready / doctrine_pending / unresolved_candidate; archive: alias / equivalence / duplicate_variant / low_confidence / doctrine_unresolved) and a `layer` field; the public metrics `canonicalOntology` / `promotionFrontier` / `lexicalArchive` are distinct-structure counts. Overlap-safe by construction (only `in_db=false` rows outside the published/aliased governance states); reversible and schema-free; provisional ADD and decomposition are observationally extrapolated, never canonical.

Persistence: `freestyle_records`, `freestyle_tricks`, `freestyle_trick_modifiers`, `freestyle_competition`, `freestyle_partnerships`, `media_items`, `media_tags`, `media_sources` (all read-only).

Side effects: none.

**`RecordsService`** (`src/services/recordsService.ts`)

Owns the public cross-sport records page read for `GET /records`, aggregating records across sport domains (consecutive kicks, freestyle passback) into a single page view-model. Does not own event lifecycle or per-sport detail pages.

Required patterns: read-only against canonical tables; cross-sport read contract (future record sources become additional fields on `RecordsContent` and additional persistence touchpoints; per-sport detail pages still belong on their section services).


Persistence: `consecutive_kicks_records`, `freestyle_records` (all read-only).

Side effects: none.

**`NetService`** (`src/services/netService.ts`)

Owns public Footbag Net page reads: portal landing (`GET /net`), team list (`GET /net/teams`), and team detail (`GET /net/teams/:teamId`). Does not own canonical result ingestion, freestyle, or consecutive domain reads.

Required patterns: statistics firewall, all appearance reads use `net_team_appearance_canonical` view; `inferred_partial` data is never exposed in public routes. Conflict-flag-aware discipline label resolution: when `conflict_flag = 1` on a `net_discipline_group` row, render the raw `discipline_name` instead of the canonical group label. Disclaimer "Team identities are algorithmically constructed from placement data and may not reflect official partnerships" rendered always on both pages, not conditioned on a flag. No win/loss, head-to-head, or ranking data of any kind. `NotFoundError` on unknown team ID.


Persistence: `net_team`, `net_team_member`, `net_team_appearance_canonical` (view), `net_discipline_group`, `historical_persons` (read for display names and country).

Side effects: none.

**`SidelineService`** (`src/services/sidelineService.ts`)

Owns the public sideline section page read for `GET /sideline` (the "Sideline" portal landing). Does not own competitive event lifecycle, results ingestion, or record aggregation.

Required patterns: static content, no DB; game list, copy, asset paths, and links fixed in code; demo videos served as static `.webm` from `src/public/video/sideline/` with missing assets degrading to no-video render; all `moreInfo` links are `external: false`; the page contains zero offsite links.


Persistence: none.

Side effects: none.

**`RulesService`** (`src/services/rulesService.ts`)

Owns the public rules section reads (`GET /rules` index and `GET /rules/:disciplineSlug/:ruleSlug` detail). Does not own competitive event lifecycle, results ingestion, governance editing, or record aggregation.

Required patterns: rule text source of truth in `ifpa/rules/{discipline}.md`; rendered HTML is derived (verbatim from canonical IFPA source, no paraphrasing). YAML frontmatter applies to every rule split out of a discipline file (`discipline`, `disciplineLabel`, `authority`, `effective`, `parentHref`, `parentLabel`, optional `alternateLanguageLabel` plus `alternateLanguageHref`); the alternate-language pair drives the cross-language toggle. H1 headings become rule pages with `slugify(headingText)` slugs; H2 headings receive matching `id` attributes. Markdown rendered with `marked` v14 by `src/lib/rulesLoader.ts`; cache is process-lifetime; `_resetRulesCache()` test hook exported. Rule pages render zero offsite hyperlinks. `NotFoundError` on unknown discipline or slug.


Persistence: none (filesystem-backed).

Side effects: none.

**`IfpaService`** (`src/services/ifpaService.ts`)

Owns the public IFPA governance hub reads (`GET /ifpa` index and `GET /ifpa/:docSlug` detail). Renders the canonical IFPA membership rules, bylaws, and articles of incorporation. Does not own sport rules (delegated to `RulesService`), membership-tier ledger writes, or governance editing.

Required patterns: governance doc source of truth in `ifpa/{IFPAMembershipStructure_2026,BYLAWS,ArticlesOfIncorporation}.md`; rendered HTML is derived (verbatim from canonical IFPA source). Slug is the file basename without `.md`, lowercased (`membership-structure`, `bylaws`, `articles`). Markdown rendered with `marked` by `src/lib/ifpaLoader.ts`; H1-H6 headings receive `id` attributes via post-process; H2 entries surface as the on-page TOC. Cache is process-lifetime; `_resetIfpaCache()` test hook exported. Hub-page summaries are hard-coded in the service for editorial control (not pulled from markdown). `NotFoundError` on unknown doc slug.


Persistence: none (filesystem-backed).

Side effects: none.

### 6.3 Payments and membership

**`PaymentService`** (`src/services/paymentService.ts`)

Owns all Stripe interactions: one-time payments (dues, registration fees, donations), recurring donation subscriptions, webhook processing, reconciliation; and member-facing payment-page shaping (checkout, success, cancel, payment-history). Does not own tier grant logic or registration confirmation.

Required patterns: Stripe success gating, tier grants and confirmed registrations written only after `payments.status = 'succeeded'`. Every `payments.status` change writes a paired `payment_status_transitions` row in the same transaction; same dual-write rule for subscription transitions. DB trigger enforces `pending -> succeeded | failed | canceled; succeeded -> refunded` with no backward transitions. All webhook processing idempotent via `stripe_events.event_id` deduplication. `members.stripe_customer_id` is the canonical member-level customer ID; `payments.stripe_customer_id` is the per-payment snapshot; the two are distinct fields. Reconciliation amount discrepancy compares both `amount` and `currency` fields. Reconciliation issue rows carry `expires_at = created_at + reconciliation_expiry_days` at INSERT. Refund does not write a `revoke` row; tier purchases are preserved on refund. HoF/BAP donation comment defaults: HoF "HoF Fund"; BAP "BAP Fund"; both "HoF Fund". `is_cancel_at_period_end` reflects Stripe's flag; set on cancel_requested, confirmed via `customer.subscription.deleted` webhook.


Persistence: `payments`, `payment_status_transitions`, `recurring_donation_subscriptions`, `recurring_donation_subscriptions_active`, `recurring_donation_subscription_transitions`, `stripe_events`, `reconciliation_issues`, `members`, `audit_entries`, `outbox_emails`.

Side effects: outbox enqueue (receipts, failure notices, cancellation), audit append, nightly reconciliation digest delegated through `OperationsPlatformService`.

**`MembershipTieringService`** (`src/services/membershipTieringService.ts`)

Owns the membership-tier ledger (`member_tier_grants`), HoF/BAP Tier 2 grants, Tier 3 governance set/remove, admin tier corrections, admin-role grants. `getTierStatus(memberId)` is the sole authoritative membership-tier read path. Does not own payment processing, registration, Active Player lifecycle, or official roster reads.

Required patterns: append-only ledger (UPDATE/DELETE blocked by triggers). `getTierStatus` derives from `member_tier_current`. Source-linkage discipline: membership-tier grants link only to `related_payment_id`, admin overrides, HoF/BAP grants, Tier 3 governance changes, or legacy migration; no event/vouch/club source FK. `governance_set` requires non-null `new_underlying_tier_status`; `governance_removed` requires non-null `old_underlying_tier_status`. HoF/BAP grant: if member is at Tier 3, write `governance_set` updating `new_underlying_tier_status = tier2`; otherwise write a plain Tier 2 grant. Refund does not write a `revoke` row. Admin-role prereqs: target must be Tier 2 or Tier 3; anti-lockout (last admin cannot be revoked); admin-alerts mailing list subscription updated atomically with `is_admin` change. Tier 0 Active Player ending on purchase or Tier 3 grant runs in the same transaction as the tier write (calls `ActivePlayerService.endOnTierUpgrade` or `endOnTier3Grant`). News items emitted via `NewsService.emitNewsItem` only.




**`ActivePlayerService`** (`src/services/activePlayerService.ts`)

Owns the Active Player lifecycle ledger (`active_player_grants`) and the direct vouch action table (`active_player_vouches`). `getStatus(memberId)` is the sole authoritative Active Player read path. Does not own membership-tier writes, event registration, or club affiliations.

Required patterns: append-only ledgers (UPDATE/DELETE blocked by triggers). `getStatus` derives from `member_active_player_current`. Active Player applies to Tier 0 only; Tier 1+ vouches and attendances are no-ops with audit-log only. No-shorten rule: an older event, vouch, or club-join must not shorten an existing later expiry. Idempotency via `ux_active_player_grants_registration_once` (per registration), `ux_active_player_grants_vouch_once` (per vouch), `ux_active_player_club_join_once` (per member, lifetime). Self-vouch rejected at DB and APP. Vouch rate limit throws `RateLimitedError` from `system_config_current`. `endOnTierUpgrade` and `endOnTier3Grant` execute in the same transaction as the corresponding `member_tier_grants` write.




**`ActivePlayerExpiryService`** (`src/services/activePlayerExpiryService.ts`)

Owns the daily-pass orchestration for SYS_Check_Active_Player_Expiry: candidate scan over `member_membership_status_current` (Tier 0, non-null `active_player_expires_at`), per-offset reminder enqueue with per-(member, expires_at, offset_label) idempotency, and `ActivePlayerService.applyExpiry` invocation for lapsed grants. Does not own AP ledger writes (delegates to `ActivePlayerService`), `system_job_runs` row writes (wrapped by `OperationsPlatformService.recordJobRun`), or scheduling (worker invokes on a daily-tick loop).

Required patterns: idempotency via the `active_player_reminder_sent` table with `UNIQUE(member_id, expires_at, offset_label)`; reminder enqueue plus dedup row write wrapped in `transaction()` so an enqueue failure rolls back the dedup row, letting the next pass retry. Reminders honor `members.email_status='ok'` and the `active-player-reminders` mailing-list subscription (absence treated as subscribed by default; explicit `unsubscribed`, `bounced`, `complained`, or `suppressed` blocks send). Tier1+ members filtered at the candidate view (`tier_status='tier0'`); per-candidate `getTierStatus` re-check catches mid-pass upgrades. Reads administrator-configured offsets from `system_config_current` (`active_player_expiry_reminder_days_1`, `active_player_expiry_reminder_days_2`); T+0 day-of reminder is built-in. UTC date floor for offset comparisons.


Persistence: `active_player_reminder_sent`, `outbox_emails` (via `CommunicationService.enqueueEmail`), `mailing_list_subscriptions`, `system_config_current`, `member_membership_status_current`, `member_active_player_current`, `members_active`, `active_player_grants` (via `applyExpiry`).

Side effects: outbox enqueue (AP expiry reminders), audit append (via `applyExpiry`).

**`HofBapAdminDigestService`** (`src/services/hofBapAdminDigestService.ts`)

Owns the daily-pass orchestration for SYS_HoF_BAP_Admin_Digest: scans the prior 24 hours of `member_tier_grants` rows whose `reason_code = 'legacy.claim_tier_grant'` and whose member carries an HoF or BAP honor flag, then enqueues a single digest email to the `admin-alerts` mailing list summarizing each match. Provides operators a post-cutover safety net for honors-bearing claims on any path (staged-candidate confirmations, wizard legacy claims, direct historical-record claims). Does not own ledger writes, audit writes, or scheduling (worker invokes on a daily-tick loop wrapped by `OperationsPlatformService.recordJobRun`).

Required patterns: window-gated by two `system_config_current` keys. `hof_bap_digest_cutover_at_iso` anchors the monitoring window; if absent, empty, or unparseable the job returns `window_disabled` and no-ops. `hof_bap_digest_window_days` (default 56) sets the window length. Outside the window the job returns `outside_window` and no-ops. Inside the window the lookback is exactly the prior 24 hours from the configured `now`. Idempotency: the mailing-list enqueue uses an idempotency-key prefix of `hof_bap_digest:<yyyy-mm-dd>` so a same-day rerun reports `duplicates` equal to subscriber count and produces zero new outbox rows. Anti-PII: the digest payload contains row identifiers (member_id, legacy_member_id, tier_grant_id) and decision-relevant attributes (display_name, honor flags, new tier status) only; `login_email` and other contact fields are never included.

Persistence: `member_tier_grants` (read), `members` (read), `system_config_current` (read), `outbox_emails` (via `CommunicationService.enqueueMailingListEmail`), `mailing_list_subscriptions` (read).

Side effects: outbox enqueue (HoF/BAP digest emails to the `admin-alerts` list).

**`OfficialRosterService`** (`src/services/officialRosterService.ts`)

Owns Official IFPA Roster read paths (`list`, `summary`, `exportCsv`). The roster is not public. Does not own membership-tier writes, Active Player lifecycle, or admin orchestration.

Required patterns: roster includes Tier 1, Tier 2, Tier 3 plus Tier 0 with current Active Player; deceased members excluded per view definition. Sole surface for accessing membership roster data; controllers must not bypass to read the underlying view directly. All access (view and export) audit-logged with `category = 'roster_access'`. Filename pattern `official_roster_YYYYMMDD.csv`; CSV header comment line per the user-story acceptance criteria.


Persistence: `official_ifpa_roster_current` (read-only view), `members_active`, `audit_entries`.

Side effects: audit append.

### 6.4 Voting and recognition

**`VotingElectionService`** (`src/services/votingElectionService.ts`)

Owns vote lifecycle, ballot submission and encryption, eligibility snapshots, tally and publish, HoF nomination and affidavit flows. Does not own admin role management or HoF inductee display.

Required patterns: ballot append-only (UPDATE/DELETE blocked); eligibility snapshot write-once. Date ordering enforced (`vote_open_at < vote_close_at`; nomination ordering); `options_visible_at <= vote_open_at`. Tally requires `can_tally_votes` permission, not just `is_admin`; tally allowed only when `status = 'closed'` AND `now > vote_close_at`. Vote options locked once vote is `open` or later. Receipt token: plaintext never persisted; `SHA-256(token)` stored; outbox `body_text` scrubbed after delivery. Ballot non-anonymity by design: `voter_member_id` plaintext alongside encrypted ballot. Ballot encryption uses AES-256-GCM with per-ballot KMS data keys. After tally, ballot contents discarded immediately; only totals retained. Audit logs TALLY_VOTE_START and TALLY_VOTE_COMPLETE record totals only, never individual ballot contents. Any single snapshot timestamp exposed by the service derives from `vote_eligibility_snapshot.created_at` values for that vote using one consistent rule. News items emitted via `NewsService.emitNewsItem` only.


Persistence: `votes`, `vote_options`, `vote_eligibility_snapshot`, `ballots`, `vote_results`, `vote_result_option_totals`, `hof_nominations`, `hof_affidavits`, `members`, `news_items`, `audit_entries`, `outbox_emails`, `work_queue_items`.

Side effects: outbox enqueue (vote-open, receipt, cancellation), news emission (`vote_results`), audit append, work-queue insert with admin-alerts notification.

**`HallOfFameService`** (`src/services/hofService.ts`)

Owns the HoF landing page read for `GET /hof` (service-shaped, no DB queries). Does not own HoF tier promotion or `is_hof` writes; does not own nomination, affidavit, or election lifecycle.

Required patterns: read-only with no DB queries; service provides `content.externalLink` so templates do not construct the standalone HoF URL.


Persistence: none.

Side effects: none.

**`BigAddPosseService`** (`src/services/bapService.ts`)

Owns the BAP landing page read for `GET /bap` (service-shaped, no DB queries). Does not own BAP tier promotion or `is_bap` writes.

Required patterns: read-only with no DB queries; service provides `content.externalLink` so templates do not construct the standalone BAP URL.


Persistence: none.

Side effects: none.

### 6.5 Content and discovery

**`MediaGalleryService`** (`src/services/mediaService.ts`, with avatar via `createAvatarService` factory in `avatarService.ts`)

Owns member photo upload and processing, member video link submission, gallery management, media tagging, and media flag and moderation workflows. Does not own curator-attributed (system-member) photo and video upload, tag stats recomputation, or S3 lifecycle management.

Required patterns: HD media (no soft-delete); flags and tags cascade-delete with media; gallery contents cascade with gallery delete; avatar and club logo detach on media delete (`ON DELETE SET NULL`). Photo security pipeline mandatory: re-encode as JPEG 85%, strip EXIF/ICC, generate 300x300 thumbnail and 800px display variant, discard original. Max 5 video embeds per gallery. One avatar per member (partial UNIQUE index `ux_media_avatar_per_member`). Standard tags must not be HD. Tag validation delegated to `HashtagDiscoveryService.validateAndResolveTag`; this service does not normalize or create tags directly. Tag stats recomputation is not triggered here; `HashtagDiscoveryService.rebuildTagStats` runs independently via `OperationsPlatformService`. Uploader-attribution `#by_<slug>` namespace is system-managed at upload time. Named-gallery and browse page reads filter `moderation_status = 'active'` and `is_avatar = 0`; default ordering follows `member_galleries.sort_order`. `/media/browse` accepts repeatable `?tag=` and `?exclude=`, normalized to `#<lowercase>`, deduplicated, include winning over same-token exclude; mode is `browse` (form pane only) when no token resolves, otherwise `results` (form pane plus paginated tile grid); pagination prev/next reproduce the canonical repeated-arg form. Hero `byMember` chip lifts from any `#by_<slug>` criterion (auth-gated profile link) so the template renders "by *Member Name*" attribution distinct from gallery ownership.




**`HashtagDiscoveryService`** (`src/services/hashtagDiscoveryService.ts`)

Owns tag creation and validation, tag browse and search, tag stats cache, and teaching moments data. Does not own media tagging operations.

Required patterns: global tag uniqueness via `ux_tags_normalized`. Standard tags (`is_standard = 1`) must not be HD; reject any delete request. Community-tag threshold for public browse: `distinct_member_count >= 2`. `rebuildTagStats` reads both `media_tags` (usage count) and `members` (distinct member count); omitting either produces incorrect community-tag results. `rebuildTagStats` is invoked only by `OperationsPlatformService.runTagStatsRebuild`. `reserveStandardTag` enforces case-insensitive uniqueness and is permanent.


Persistence: `tags`, `tag_stats`, `media_tags`, `members`.

Side effects: audit append (standard tag creation).

**`NewsService`** (`src/services/newsService.ts`)

Owns news item creation (auto-generated and admin-authored), moderation, and public feed. Does not generate its own news; calling services invoke `emitNewsItem` as a side effect of their own domain actions.

Required patterns: HD news (no soft-delete). `emitNewsItem` is the only auto-write path; domain services do not write `news_items` directly. News types are a controlled vocabulary (`event_published`, `event_results`, `club_created`, `club_archived`, `member_honor`, `vote_results`, `announcement`, `system`). News moderation queries use `news_items` directly (hard-delete domain; no `_all` alias). Deletion requires mandatory reason. Future-dated items invisible until publish date.


Persistence: `news_items`, `audit_entries`.

Side effects: audit append.

**`LegalService`** (`src/services/legalService.ts`)

Owns the static page view-model for `/legal`, composing Privacy, Terms of Use, and Copyright and Trademarks as three anchored sections on a single page. Does not own policy decisions themselves (authored and approved out-of-band, updated by editing service source).

Required patterns: content is static, no DB. Section order fixed: Privacy, Terms of Use, Copyright and Trademarks. Anchor IDs stable (`privacy`, `terms`, `copyright`). Substantive content changes require updating `content.lastUpdated`. Operator identity, governing law, and copyright year range require deliberate review when changed.


Persistence: none.

Side effects: none.

**`ContactRequestService`** (`src/services/contactRequestService.ts`)

Owns the member-to-IFPA-admin support flow per `M_Contact_IFPA_Admin` and `A_Resolve_Contact_IFPA_Admin_Request`: contact-request submission, admin work-queue listing, and resolution (status transition plus audit plus email reply). Does not own member field mutations (the admin performs those through their own tools; this service only transitions queue state and writes audit), nor the visitor-side contact path (visitors continue to use the `/legal` `admin@footbag.org` mailto:).

Required patterns: contact requests persist as `work_queue_items` rows with `queue_category='membership'`, `task_type='member_contact_request'`, and `entity_type='member'`. Categories are an enumerated TypeScript constant (`display_name_correction`, `profile_url_correction`, `tier_status_question`, `identity_link_issue`, `other`). Decision labels are an enumerated TypeScript constant (`corrected`, `denied`, `duplicate`, `out_of_scope`); no thread or clarification loop in the first cut. Per-member open-count cap of 3 enforced via `workQueue.countOpenForMember`; the 4th submission throws `RateLimitedError`. Message body length capped at 2000 characters; resolution note length capped at 500. Full message body lives in `audit_entries.metadata_json` (immutable ledger), not in `work_queue_items.reason_text` (which carries the category label + first 200 chars). Resolution emails dispatched via `SesAdapter.sendEmail` with the decision-label-keyed subject and a self-contained reply body that includes the original request text. Categories enum stays in TypeScript until shape stabilizes; DB CHECK constraint deferred.


Persistence: `work_queue_items`, `audit_entries`, `members_active` (read-only for resolution email lookup).

Side effects: audit append (member-side submit + admin-side resolve); SES email send on resolve.

**`CuratorMediaService`** (`src/services/curatorMediaService.ts`)

Owns admin upload, edit, delete, and list of curator-attributed photos and videos on behalf of the system member account; magic-byte and format validation; ffmpeg curator transcode pipeline; storage key construction matching the curator seed; auto-application of the `#curated` uploader marker; admin and member named-gallery editing for FH-owned and member-owned `member_galleries` rows. Does not own member-attributed uploads.

Required patterns: `uploader_member_id` is always the system member id (`is_system=1`); admin actor recorded only in `audit_entries`. Curator video bytes use `video_platform='s3'`; member video routes reject `video_platform='s3'` as a defensive boundary. Storage keys match the curator-seed layout (`{systemMemberId}/detached/{mediaId}-...`) so offline seed and admin upload produce identical row shape. Auto-applies `#curated`; `#curated` rejected from input. URL-reference uploads write a sidecar JSON file under `/curated/{category}/<primarySlug>_<sha1(videoUrl)[:8]>.meta.json` (atomic temp-file plus rename) and do not write a `media_items` row; the seeder regenerates rows from sidecars. Photo and video uploads, when called with a `category`, additionally write the source binary plus a file-paired `<slug>.meta.json` sidecar under `/curated/{category}/` (video also writes `<slug>.poster.<ext>`); the inline `media_items` insert is the read-path UX optimization per DD §1.13. The admin upload controller passes `category` in local-adapter mode and omits it in S3-adapter mode; the curator seeder always omits it. Photo upload uses Sharp (aspect-preserving thumb, 800px-wide display, EXIF/ICC stripped); video upload uses ffmpeg curator transcode (re-encode plus metadata strip). Magic-byte rejection for unsupported formats. Audit entries are append-only. All DB writes for one upload (`media_items` plus `media_tags` plus `audit_entries`) land in one transaction; storage `put` calls happen before the transaction opens; if any storage put fails the transaction never runs. Asynchronous interactive admin video upload uses the `media_jobs` flow per `MediaJobService`; `finalizeTranscodeForJob` is the worker-side finalize. For sidecar-backed rows (`video_platform IN ('youtube','vimeo')`), edits and deletes resolve the sidecar at runtime from `(video_platform, video_url)`, rewrite or unlink atomically, then update the DB row inline so reads reflect changes without waiting for the next seeder run. Named-gallery editing: actor must be admin OR owner of the affected gallery (the service enforces this on every mutating call). FH-owned creation requires admin actor and explicit `suggestedId` matching `gallery_[a-z0-9_]+`; member-owned derives id `gallery_<owner_slug>_<gallery_name_slug>` (`_2`, `_3` suffixes on collision). Member-owned galleries auto-prepend `#by_<owner_slug>` to validated criteria tags on every create or update so the owner-scoping criterion survives DELETE-then-INSERT and cannot be removed by editing; the `>=1 criteria tag` invariant is enforced after auto-prepend; user-supplied `#by_*` tags rejected from input. FH-owned writes the JSON sidecar at `/curated/galleries/<slug>.json` after commit (sidecar I/O failure logged but does not roll back DB); member-owned never touches the filesystem. Gallery edit never mutates item tags: `getGalleryForEdit` returns the gallery's metadata, current-items display rows (derived from criteria/exclude tags via `listGalleryItemsForDisplay`), and persisted external links. `createGallery` and `updateGallery` accept an `externalLinks` array; each URL passes `validateExternalUrl` (DD §3.17) inside the same transaction as the metadata + tag-set rewrite, then `gallery_external_links` rows are replaced via DELETE-then-INSERT. The per-gallery cap is `config.galleryMaxExternalLinks`. FH-owned sidecars include the `externalLinks` field; sidecar I/O is gated on `config.allowCuratedSidecarWrites` (dev only). Member-gallery form uploads carry user-supplied `uploadTags` (never auto-stamped from gallery criteria); auto-applied tags are exactly `#by_<slug>` (member uploads) and `#curated` (FH-owned uploads). `getSystemMemberId` exposes the system member id resolution for callers that need to pass `ownerMemberId`.




**`CuratorSeedService`** (`src/services/curatorSeedService.ts`)

Walks a directory of curator source files paired with sidecar `.meta.json` siblings and drives `CuratorMediaService` to insert, update, or delete `media_items` plus `media_tags` rows so the persisted state matches the directory's current contents. Does not perform direct DB or storage writes; all mutations go through `CuratorMediaService`.

Required patterns: source bytes not re-checked for content drift (caption and tags reconciled against sidecar; file replacement requires explicit delete plus new upload). Orphan detection scoped to system-uploader rows with non-NULL `source_filename`; member-uploaded rows never touched. Video sidecars must specify a `poster` filename pointing at a sibling poster image; missing poster reported as a per-file error and does not abort the run. Re-running `reconcile` against unchanged inputs produces zero DB writes and zero S3 calls. Each per-file upload, edit, or delete uses a single transaction (delegated to `CuratorMediaService`).


Persistence: inherited from `CuratorMediaService`: `media_items`, `media_tags`, `tags`, `audit_entries`. Reads `media_items` directly to enumerate existing rows for orphan detection.

Side effects: S3 PUT for variants on new uploads; S3 DELETE for orphans; no emails or webhooks.

**`MediaJobService`** (`src/services/mediaJobService.ts`)

Owns the lifecycle of `media_jobs` rows backing the asynchronous interactive admin video upload. Pure persistence and state-transition logic. Does not run ffmpeg, does not talk to S3, does not push events. Companion in-process `JobEventBus` module (`src/services/jobEventBus.ts`) is a small `EventEmitter` keyed by jobId, used by the SSE handler to subscribe and the IPC controller to publish; not a service in the catalog sense.

Required patterns: state transitions are optimistic-locked via `UPDATE...WHERE...state=expected` so two simultaneous claimers cannot double-process. `getJobForAdmin` returns `null` for both unknown jobs and jobs owned by another admin so the surface cannot be enumerated. `markSucceeded` requires a non-null `mediaId` (DB CHECK). Boot-time recovery is the only sweep; all other transitions are HTTP-event-triggered. Idempotent re-dispatches are filtered at `claimForProcessing` (returns `null` if not in `pending_transcode`); duplicate finalize POSTs filtered at `markPendingTranscode` via `ConflictError`.


Persistence: `media_jobs`. Reads `members(id)` via FK only; never writes member rows.

Side effects: none. Event publication onto `jobEventBus` happens in the IPC controller.

### 6.6 Communication

**`CommunicationService`** (`src/services/communicationService.ts`)

Owns outbox polling and sending via SES, mailing list management, subscription management, email archival, SES bounce and complaint handling, and email template management. Does not trigger sends directly; all other services enqueue to outbox and this service owns the worker (invoked by `OperationsPlatformService.runEmailWorker`).

Required patterns: outbox pattern, no service calls SES directly; all sends via `enqueueEmail` plus worker. Idempotency key on enqueue prevents duplicate sends on retry. Receipt-token scrub: `body_text` in voting confirmation emails scrubbed after successful delivery. Email templates DB-stored and admin-editable without code deployment; changes audit-logged old/new content. `email_templates_enabled` view exposes only `is_enabled = 1` templates. `admin-alerts` list is system-managed (`is_member_manageable = 0`); subscription driven by `is_admin` changes in `MembershipTieringService.adminManageRole`. Bounce and complaint rates tracked; alarm raised via `OperationsPlatformService.raiseAlarm` on threshold breach. `sendAnnounceEmail` authz is Tier 2+ (distinct from `sendMailingListEmail` which is admin-only for all other lists). Worker skips sending when `email_outbox_paused = 1` from `system_config_current`. CloudWatch logs include template ID, member ID, outbox ID, timestamp, result; never raw email addresses.


Persistence: `outbox_emails`, `mailing_lists`, `mailing_list_subscriptions`, `email_archives`, `email_templates`, `email_templates_enabled`, `audit_entries`, `system_config_current`.

Side effects: audit append (list management, template updates, bulk sends), alarm raise (bounce and complaint thresholds).

**`SimulatedEmailService`** (`src/services/simulatedEmailService.ts`)

Dev-mode shaping service that produces the view-model for the `simulated-email-card` Handlebars partial rendered on email-gated public pages (`/register/check-email` and its post-resend landing). Does not enqueue, send, or mutate `outbox_emails`.

Required patterns: two-mode env switch driven by `SES_ADAPTER`. `dev` (`SES_ADAPTER=stub`, the dev and staging adapter) returns captured in-memory messages from `StubSesAdapter.sentMessages` so a developer or paid tester can finish an email flow without leaving the page. `null` (`SES_ADAPTER=live`, production only) returns no view-model; the page omits the card entirely. Dev-mode reads the stub adapter's in-memory `sentMessages` array, which is independent of `outbox_emails.body_text` (the DB row is scrubbed post-send for PII hygiene; the stub's memory array retains the original message content so dev visibility is preserved after the DB scrub). Calling `getEmailPreview` in dev mode is safe to repeat: no network calls, idempotent outbox drain via `OperationsPlatformService.runEmailWorker`.


Persistence: none.

Side effects: invokes `OperationsPlatformService.runEmailWorker` in dev mode to drain the outbox before reading the stub array.

### 6.7 Governance and operations

**`AdminGovernanceService`** (`src/services/adminGovernanceService.ts`)

Owns admin dashboard, work-queue management, audit log viewing, system health view, alarm management, official roster report and export orchestration, reconciliation digest data assembly, and system config writes. Orchestrates cross-service admin actions that do not fit a single domain service. Does not own the business logic of services it coordinates; does not serve as the runtime config read path (application code and jobs read `system_config_current` directly).

Required patterns: append-only `system_config` (UPDATE/DELETE blocked by triggers); `setConfigValue` and `updateMembershipPricing` INSERT new rows, never UPDATE or DELETE existing ones; `system_config_current` picks up new values immediately. `getSystemConfig` is the admin UI read path only; runtime config reads by jobs and services go directly to `system_config_current`. Pricing keys are integer cents (`tier1_price_cents`, `tier2_price_cents`); UI layer converts to display currency. Work-queue items remain visible post-resolution with status, resolver, timestamp, decision, and reason. Roster report and export read paths are owned by `OfficialRosterService`; this service handles admin orchestration. System health reads `system_job_runs` surfaced by `OperationsPlatformService.recordJobRun`; no direct AWS console links. `buildReconciliationDigestData` is read-only payload assembly and does not send email; enqueue happens in `OperationsPlatformService.runNightlyReconciliation`.


Persistence: `work_queue_items`, `audit_entries`, `system_config`, `system_config_current`, `system_alarm_events`, `reconciliation_issues`, `members`, `members_all`.

Side effects: audit append.

**`OperationsPlatformService`** (`src/services/operationsPlatformService.ts`)

Owns background job orchestration, system job-run logging, alarm raise and ack, backup jobs, static asset cleanup, and application-level readiness composition for operational health checks. Does not own domain business logic (delegates to named domain service methods); does not own row-level PII purge logic.

Required patterns: all jobs read configuration from `system_config_current` at runtime; no hardcoded thresholds. All webhook handlers idempotent. PII purge has separate soft-deleted vs deceased branches with distinct grace configs (`member_cleanup_grace_days` and `deceased_cleanup_grace_days`); the two are separate grace rules and must not be collapsed; events with published results and clubs preserved permanently; payment records use `payment_retention_days`; ballots use `ballot_retention_days`; member-row PII work delegated to `MemberService.purgeAccountPII`. Resolved reconciliation issues deleted by `runNightlyReconciliation` after `expires_at`. Readiness composition is SQLite connectivity plus container memory pressure only; backup health, SES, KMS, Stripe, and S3 are alarm-surfaced, not part of `/health/ready`. Backup health specifically is surfaced through logs, job-run history, and alarms. All SYS jobs write `system_job_runs` via `recordJobRun` on every run for admin visibility. SYS jobs whose work runs in a loop reap stale `status='running'` rows from prior aborted invocations at the start of each new pass, so a SIGKILL or OOM during an earlier run does not leave a permanently 'running' row that misleads admin tooling. This service contains no domain logic; substantive work delegates to named domain service methods.


Persistence: `system_job_runs`, `system_alarm_events`, `system_config_current`, `audit_entries`, `reconciliation_issues`.

Side effects: audit append (Active Player expiry, PII purge, tally operations, reconciliation), alarm raise (backup failures, bounce rates, consecutive webhook failures), outbox enqueue (Active Player expiry reminders, scheduled reconciliation digest; all delegated to domain services).

## 7. Target architecture and deferred surfaces

The following surfaces are deferred out of scope by design, captured here as scope language rather than implementation status. They remain intentional gaps in the target product, not active deviations.

- In-site Hall of Fame inductee display pages, roster reads, and historical-record surfaces. The current target is the editorial landing page only; full inductee surfaces require curation work outside this catalog's scope.
- In-site Big Add Posse roster pages, induction-year pages, and historical-record surfaces. Same scope frame as HoF.
- Future role-gated internal-admin tooling that outlives the QC retirement. When built, it lands in its own `src/internal-admin/` subtree with its own catalog treatment; the current QC-only subsystem is not cataloged and retires with the pipeline-qc subsystem.

## 8. Catalog update rules

Update this catalog when any of the following changes:

- A service gains, drops, or transfers an ownership boundary.
- A required pattern is added, removed, or strengthened.
- An invariant in §4 changes.
- A read-model convention in §3 changes.
- A new service is added, retired, or split.

Do not update this catalog for:

- Method signature changes that preserve ownership and patterns.
- Return-shape changes that preserve the contract.
- Internal helper additions that are not service-public.
- Implementation-state notes ("currently", "in progress", "not yet wired"); those belong in `IMPLEMENTATION_PLAN.md`.
- Deviation tracking; those belong in `IMPLEMENTATION_PLAN.md`.
- Sprint-scoped or status-tracking language of any kind.

When in doubt: the catalog describes durable design intent. If the change is durable and design-level, update the catalog. If the change is shape-level, update TypeScript and tests; the catalog already covers the boundary that constrains the shape.
