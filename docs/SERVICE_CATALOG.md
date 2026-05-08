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
  - [6.8 Legacy migration](#68-legacy-migration)
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
2. `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, and `docs/GOVERNANCE.md`, for functional and policy requirements.
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

**Adapter pattern:** Adapters are the only seam between app code and external services. Interface name: `<Purpose>Adapter`; implementation name: `<Backend><Purpose>Adapter`. Current adapters: `JwtSigningAdapter` (`LocalJwtSigningAdapter` for dev with HS256, `KmsJwtSigningAdapter` for staging and production with AWS KMS); `SesAdapter` (`StubSesAdapter` for dev with in-process capture, `LiveSesAdapter` for staging and production); `MediaStorageAdapter` (local filesystem for dev, S3 for staging and production; content-agnostic, handles photos, system-account video bytes, and posters identically). Adapters fail-fast at boot when required env vars are absent. Integration tests stand up an injected fake client against the adapter interface; tests never mock the AWS SDK package itself. See `tests/CLAUDE.md` for the required three-test parity pattern (boot-time, interface parity, staging smoke).

**Catalog scope and tiers:** This catalog covers four organizational tiers:
1. Adapters under `src/adapters/<purpose>Adapter.ts`.
2. Permanent product services under `src/services/<domain>Service.ts`.
3. Dev-mode shaping services (e.g. `simulatedEmailService.ts`) whose only job is to produce fallback view-models when an adapter is in stub or sandbox mode; the name carries the "not for production delivery" signal and env config gates the behavior.
4. Internal-only subsystems are **not cataloged**. The current QC-only subsystem (`src/internal-qc/**`, with views under `src/views/internal-qc/**`) carries the `// ---- QC-only (delete with pipeline-qc subsystem) ----` banner on every source file and retires with the pipeline-qc subsystem; future role-gated internal-admin tooling will get its own subtree (`src/internal-admin/`) and its own catalog treatment when built.

**Rate limiting:** Rate-limit enforcement (`rateLimitHit` plus `throw new RateLimitedError(...)`) lives in services. Controllers catch `RateLimitedError` and map it to HTTP 429 with `Retry-After` set from `retryAfterSeconds`. Never implement rate limits in middleware or inline in controllers. All bucket sizes and windows come from `system_config_current` keys.

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
| `IdentityAccessService` | Account entry and auth: register, verify-email, credential check, password change/reset, archive passthrough | Member profile CRUD, historical-person reads, tier calculation, session-cookie HTTP glue | Anti-enumeration; rate limiting in service; `password_version` invalidates JWTs; SHA-256 token storage | Web auth controllers; auth middleware; `OperationsPlatformService` | `src/services/identityAccessService.ts` |
| `MemberService` | Member-account page shaping; soft-delete and PII purge; deceased handling; GDPR export; member search | Login/registration credential check; legacy-claim flow; tier writes; payments | `members_searchable` for search; S3-deletion-before-`deleted_at`; PII purge atomic; deceased and soft-deleted are distinct grace paths; owner-only profile routes | Member controllers; `AdminGovernanceService`; `OperationsPlatformService` (purge) | `src/services/memberService.ts` |
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
| `PaymentService` | All Stripe interactions: one-time payments, recurring donations, webhook processing, reconciliation | Tier grant logic; registration confirmation | Stripe success gating (tier grants and confirmed registrations only after `succeeded`); paired `payment_status_transitions` insert in same transaction; webhook dedupe via `stripe_events.event_id`; refund preserves tier grant; canonical `members.stripe_customer_id` distinct from per-payment snapshot | `MembershipTieringService`; `CompetitionParticipationService`; `AdminGovernanceService`; webhook controller | `src/services/paymentService.ts` |
| `MembershipTieringService` | Membership-tier ledger writes; HoF/BAP Tier 2 grants; Tier 3 governance set/remove; admin-role grants; sole authoritative tier read path | Payment processing; registration; Active Player lifecycle; official roster reads | Append-only ledger; `getTierStatus` reads `member_tier_current`; source-linkage discipline (no event/vouch/club FK on `member_tier_grants`); refund does not write a `revoke` row; admin role requires Tier 2 or Tier 3, anti-lockout enforced; admin-alerts subscription updated atomically with `is_admin`; news via `NewsService.emitNewsItem` only | `PaymentService`; `AdminGovernanceService`; `ActivePlayerService` (tier checks) | `src/services/membershipTieringService.ts` |
| `ActivePlayerService` | Active Player ledger; vouch action table; sole authoritative AP read path | Membership-tier writes; event registration; club affiliations | Append-only ledger; `getStatus` reads `member_active_player_current`; Tier 0 only (Tier 1+ no-op with audit log); no-shorten rule; club-join lifetime-once; vouch rate-limited; self-vouch rejected at DB and APP | `CompetitionParticipationService`; `ClubService`; member controllers (vouch); `MembershipTieringService` (end-on-upgrade in same transaction); `OperationsPlatformService` (expiry job) | `src/services/activePlayerService.ts` |
| `OfficialRosterService` | Official IFPA Roster reads (`list`, `summary`, `exportCsv`); roster is not public | Membership-tier writes; Active Player lifecycle; admin orchestration | Roster includes Tier 1+ plus Tier 0 with current Active Player; deceased excluded; sole surface for roster reads; all access audit-logged with `category = 'roster_access'` | `AdminGovernanceService`; admin controllers | `src/services/officialRosterService.ts` |
| `VotingElectionService` | Vote lifecycle; ballot submission and encryption; eligibility snapshots; tally and publish; HoF nomination and affidavit flows | Admin role management; HoF inductee display | Append-only ballots; write-once eligibility snapshot; options lock at open; tally requires `can_tally_votes` permission and `status = 'closed'` AND `now > vote_close_at`; receipt token plaintext never persisted, SHA-256 stored, body scrubbed after delivery; ballot non-anonymity by design; news via `NewsService.emitNewsItem` only | Admin and member controllers; `OperationsPlatformService` (open/close jobs) | `src/services/votingElectionService.ts` |
| `HallOfFameService` | HoF landing page read for `GET /hof`; service-shaped, no DB | HoF tier promotion or `is_hof` writes; nomination/affidavit/election lifecycle | Read-only; service provides `content.externalLink` so templates do not construct the standalone HoF URL | Public HoF controller | `src/services/hofService.ts` |
| `BigAddPosseService` | BAP landing page read for `GET /bap`; service-shaped, no DB | BAP tier promotion or `is_bap` writes | Read-only; service provides `content.externalLink` so templates do not construct the standalone BAP URL | Public BAP controller | `src/services/bapService.ts` |
| `MediaGalleryService` | Member photo upload and processing; member video link submission; gallery management; media tagging; flag and moderation | Curator-attributed uploads; tag stats recomputation; S3 lifecycle | HD media (no soft-delete); photo re-encode plus EXIF/ICC strip plus resize is mandatory; max 5 video embeds per gallery; one avatar per member; tag validation delegated to `HashtagDiscoveryService.validateAndResolveTag`; tag stats not recomputed here; uploader-attribution `#by_<slug>` namespace is system-managed at upload, never via picker | Member controllers; `AdminGovernanceService` | `src/services/mediaService.ts` (and `createAvatarService` factory in `avatarService.ts`) |
| `HashtagDiscoveryService` | Tag creation and validation; tag browse and search; tag stats cache; teaching moments | Media tagging operations | Global tag uniqueness via `ux_tags_normalized`; standard tags (`is_standard = 1`) must not be HD; community-tag threshold `distinct_member_count >= 2`; `rebuildTagStats` reads both `media_tags` (usage count) and `members` (distinct count); `rebuildTagStats` is invoked only by `OperationsPlatformService.runTagStatsRebuild` | `MediaGalleryService`; `EventService`; `ClubService`; member controllers; `OperationsPlatformService` | `src/services/hashtagDiscoveryService.ts` |
| `NewsService` | News item creation (auto and admin); moderation; public feed | Generating its own news (calling services invoke `emitNewsItem`) | HD news; `emitNewsItem` is the only auto-write path, controlled vocabulary; deletion requires mandatory reason; future-dated items invisible until publish | `EventService`; `ClubService`; `MembershipTieringService`; `VotingElectionService`; `AdminGovernanceService` | `src/services/newsService.ts` |
| `LegalService` | Static page view-model for `/legal` (Privacy, Terms of Use, Copyright and Trademarks as three anchored sections) | Policy decisions themselves (authored out-of-band) | Static content, no DB; fixed section order with stable anchor IDs; `content.lastUpdated` updated on substantive changes | Web controller (`legalController.index`) | `src/services/legalService.ts` |
| `CuratorMediaService` | Admin upload, edit, delete, list of curator-attributed media on behalf of the system member account; named-gallery editing for FH-owned and member-owned `member_galleries`; magic-byte and format validation; ffmpeg curator transcode | Member-attributed uploads | `uploader_member_id` is always the system member id (admin actor recorded only in audit); curator video bytes use `video_platform='s3'` (member video routes reject this as defensive boundary); auto-applies `#curated`; rejects `#by_*` from input on gallery edits (uploader-attribution is system-managed at upload time); FH-owned gallery JSON sidecars at `/curated/galleries/<slug>.json` are source of truth; member-owned galleries auto-prepend `#by_<owner_slug>` to criteria tags | Admin controllers; `CuratorSeedService`; member gallery controllers (member-owned editing path) | `src/services/curatorMediaService.ts` |
| `CuratorSeedService` | Reconciliation of curator media against `/curated/`-style source directories paired with sidecar `.meta.json` siblings | Direct DB or storage writes (delegates to `CuratorMediaService`) | Idempotent reconcile; orphan detection scoped to system-uploader rows with non-NULL `source_filename`; member-uploaded rows never touched; per-file errors do not abort the run | Deploy scripts; local-dev incremental seeds | `src/services/curatorSeedService.ts` |
| `MediaJobService` | Lifecycle of `media_jobs` rows backing the asynchronous interactive admin video upload | ffmpeg execution; S3 I/O; event publication (the in-process `JobEventBus` module owns subscriptions) | Optimistic-locked state transitions (UPDATE WHERE state=expected); `getJobForAdmin` returns `null` for both unknown and not-owned (anti-enumeration); boot-time recovery is the only sweep (no steady-state polling) | Admin curator upload controller; transcode worker dispatch handler | `src/services/mediaJobService.ts` |
| `CommunicationService` | Outbox polling and sending via SES; mailing list management; subscription management; email archival; SES bounce/complaint; email template management | Triggering sends directly (other services enqueue) | Outbox pattern (no service calls SES directly); receipt-token scrub on `body_text` after delivery; DB-stored email templates; `email_templates_enabled` view for active templates; `admin-alerts` is system-managed; idempotency key on enqueue prevents duplicate sends; `sendAnnounceEmail` is Tier 2+ (distinct from admin-only list sends) | All services (enqueue); `AdminGovernanceService`; `OperationsPlatformService` (worker, webhook routing) | `src/services/communicationService.ts` |
| `SimulatedEmailService` | Dev-mode view-model for `simulated-email-card` partial on email-gated public pages | Any outbox write or production delivery path | Three-mode env switch (`dev` / `sandbox` / `null`); reads in-memory `StubSesAdapter.sentMessages`, never `outbox_emails`; returns `null` in production | `authController` (via `auth/check-email` template) | `src/services/simulatedEmailService.ts` |
| `AdminGovernanceService` | Admin dashboard; work-queue management; audit log viewing; system health view; alarm management; official roster report and export orchestration; reconciliation digest data assembly; system config writes | Domain business logic; runtime config reads (jobs and services read `system_config_current` directly) | Append-only `system_config`; admin UI read path only (not the runtime config read path); roster reads delegated to `OfficialRosterService`; pricing keys integer cents | Admin controllers | `src/services/adminGovernanceService.ts` |
| `OperationsPlatformService` | Background job orchestration; system job-run logging; alarm raise/ack; backup jobs; static asset cleanup; readiness composition | Domain business logic (delegates to named domain services); row-level PII purge logic | All jobs read `system_config_current` at runtime (no hardcoded thresholds); webhook handlers idempotent; PII purge has separate soft-deleted vs deceased branches with distinct grace configs; events with published results and clubs preserved permanently; backup health surfaced via logs/alarms not `/health/ready` | Job scheduler; system-role processes | `src/services/operationsPlatformService.ts` |
| `LegacyMigrationService` | Self-serve and admin legacy account claim flows (legacy email, username, member-id, direct historical-person); merge transaction; bootstrap club leadership resolution | Club lifecycle; tier-grant writes (delegates); club-leader promotion beyond bootstrap | Non-revealing claim response; atomic merge marks target `legacy_members` row claimed without deleting it; sets `members.historical_person_id` when target's `legacy_member_id` matches an HP back-link; rate-limited per requesting account, per target row, and per session/IP; token consumable only by initiating `member_id`; single tier grant via `MembershipTieringService` with `reason_code = 'legacy.claim_tier_grant'`; `legacy_is_admin` never auto-promoted; one-current-club invariant on affiliation writes; bootstrap promotion only when no conflicting live `club_leaders` row | Member profile controllers; historical detail controllers; admin controllers | `src/services/legacyMigrationService.ts` |

## 6. Service-specific target notes

Each entry below is self-contained: it states ownership boundaries, required patterns the service must follow, the method roster (names only; signatures and return shapes are authoritative in the cited source file), and side effects. Cross-references to other services use service or method names inline; this section deliberately avoids "see X entry" routing so services can be split into per-file documents without rewrites.

### 6.1 Identity and account

**`IdentityAccessService`** (`src/services/identityAccessService.ts`)

Owns account entry and authentication flows: registration, email verification, credential verification, password change and reset, legacy archive passthrough JWT. Does not own member profile CRUD, historical-person reads, tier calculation, data exports, or session-cookie HTTP glue (controllers set and clear cookies; the service returns a signed JWT string).

Required patterns: anti-enumeration on every account-existence-leaking path (login, register, password reset, email verify or resend, legacy claim) by running the same code path for "exists" and "does not exist", same timing, same response. Rate limiting is enforced in-service; controllers map `RateLimitedError` to HTTP 429 with `Retry-After`. Tokens are stored as SHA-256 hashes only; plaintext is never persisted. JWT payload embeds `password_version`; middleware verifies it on every authenticated request. Bumping `password_version` on password change or reset invalidates all existing JWTs immediately. The archive passthrough is an accepted operational trade-off: the archive edge does not re-check `password_version`; archive JWTs expire naturally at `jwt_expiry_hours`. Deceased members cannot log in regardless of credentials; soft-deleted members within `member_cleanup_grace_days` get a restoration screen rather than normal login.

Method roster: `register`, `verifyEmail`, `verifyMemberCredentials`, `changePassword`, `requestPasswordReset`, `resetPassword`, `generateLegacyArchiveAccess`, `restoreAccount`.

Persistence: `members`, `members_active`, `account_tokens`, `audit_entries`, `outbox_emails`.

Side effects: outbox enqueue (verification, reset), audit append.

**`MemberService`** (`src/services/memberService.ts`)

Owns member-account page shaping for `/members/*` surfaces (members landing with search, own-profile, limited public HoF/BAP profile, profile edit including inline avatar upload), and member-account lifecycle (soft-delete, deceased handling, GDPR export, member search). Owns the row-level PII clearing logic (`purgeAccountPII`). Does not own login/registration credential verification, legacy-claim flow, or tier grants and ledger calculation. Does not orchestrate purge eligibility (`OperationsPlatformService` decides which members qualify and calls into the row-level purge).

Required patterns: search must use `members_searchable` view; do not add WHERE clauses on top of `members_active` or the bare table. `searchMembers` is authenticated Tier 0+ only; it is never callable from public routes; minimum 2-character query; substring match on display name; 20-result cap with `hasMore` flag and "refine your query" signal for broad queries; no browse-all pagination. Account deletion requires S3 photo deletion to succeed before `deleted_at` is set; gallery HD is part of the same atomic operation. PII purge runs in one transaction, callable only by `OperationsPlatformService`. Deceased and soft-deleted are distinct lifecycle paths: `deceased_cleanup_grace_days` applies only after `markDeceased`; `member_cleanup_grace_days` applies only after `deleteAccount`. Own-profile routes are owner-only; non-owner public profile viewing is limited to the explicit HoF/BAP exception; no contact-field leakage on public profiles. Max 3 external URLs per member; one avatar per member (partial UNIQUE index). Avatar upload validates JPEG/PNG only with 5 MB size limit, processes to thumb and display sizes, atomically replaces existing avatar.

Method roster: `getMembersLandingPage`, `searchMembers`, `getOwnProfile`, `getPublicProfile`, `getProfileEditPage`, `updateOwnProfile`, `deleteAccount`, `requestDataExport`, `generateDataExport`, `markDeceased`, `revertDeceasedFlag`, `purgeAccountPII`. Avatar upload via `createAvatarService` factory in `avatarService.ts`: `uploadAvatar`.

Persistence: `members`, `members_active`, `members_all`, `members_searchable`, `member_links`, `media_items`, `member_galleries`, `account_tokens`, `audit_entries`, `outbox_emails`, `work_queue_items`.

Side effects: outbox enqueue (export-link, deceased notifications), audit append, work-queue insert (sole-leader or organizer flags on deceased) with admin-alerts notification.

**`HistoryService`** (`src/services/historyService.ts`)

Owns historical-person index and detail page reads, historical-results page shaping, and the service-layer distinction between imported historical people and current member accounts. Does not own current member-account lifecycle, profile CRUD, member search, or claim flow.

Required patterns: read-only; pages must not imply current-member ownership or contactability; public honor visibility for HoF/BAP historical persons is bounded and explicit; route handlers stay thin and page shaping belongs in the service.

Method roster: `getHistoricalPlayerPage`.

Persistence: `historical_persons`, `event_result_entry_participants`, supporting event/result reads.

Side effects: none.

### 6.2 Clubs and events

**`HomeService`** (`src/services/homeService.ts`)

Owns the service-shaped landing-page composition for `GET /`. Home is the one intentional composition-page exception. Does not own generic event browse, club-directory logic, layout chrome, or controller concerns.

Required patterns: Home stays within the thin-controller and service-owned-shaping architecture; Home may be richer than ordinary list/detail pages but the page-composition contract belongs in the service, not in templates; no `publicController` abstraction; no separate Home-specific front-end stack.

Method roster: `getPublicHomePage`.

Persistence: none directly; composes public read models from service-owned reads.

Side effects: none.

**`ClubService`** (`src/services/clubService.ts`)

Owns club lifecycle (create, edit, activate/deactivate, archive), leader and co-leader management, roster management, and operability enforcement. Does not own media or payments.

Required patterns: SA only (no `deleted_at` on `clubs`; use `clubs_all` for archived queries); one `role='leader'` per club; member can be leader of at most one club; max 5 leaders per club; anti-self-removal (sole leader cannot remove themselves); standard hashtag reserved via `HashtagDiscoveryService.reserveStandardTag()` at creation, permanent and not HD; club display names are not required to be globally unique (the hashtag is the canonical identifier); club with zero leaders inserts "Needs Leader" work-queue item; club with no contact email inserts "Needs Contact" work-queue item; news items emitted via `NewsService.emitNewsItem` only.

Method roster: `createClub`, `editClub`, `setClubStatus`, `archiveClub`, `addCoLeader`, `removeCoLeader`, `joinClub`, `leaveClub`, `reassignLeader`.

Persistence: `clubs`, `clubs_open`, `clubs_all`, `club_leaders`, `members`, `tags`, `news_items`, `audit_entries`, `outbox_emails`, `work_queue_items`.

Side effects: outbox enqueue (join/leave/co-leader/archive emails), news emission (`club_created`, `club_archived`), audit append, work-queue insert with admin-alerts notification.

**`EventService`** (`src/services/eventService.ts`)

Owns event lifecycle (create through completion or cancellation), discipline management, co-organizer management, sanction requests, results upload, and the service-layer reads that power public event browse and detail pages. Does not own registration payments or competition participation records.

Required patterns: public eventKey parsing and validation belong in this service; the public underscore form `event_{year}_{event_slug}` maps to stored standard-tag form `#event_{year}_{event_slug}` before DB lookup with no aliasing or fuzzy match. Status state machine `draft -> pending_approval -> published -> registration_full | closed -> completed | canceled` with `completed` and `canceled` terminal. Public detail visibility limited to `published`, `registration_full`, `closed`, `completed`. HD guard: events with public result rows are preserved permanently; draft and canceled events HD immediately; cannot delete event with confirmed registrations. Sanction approval requires organizer active Tier 2 at approval time. Max 5 organizers per event; one `role='organizer'` per event; anti-self-removal. Standard tag reserved at creation via `HashtagDiscoveryService.reserveStandardTag()`; permanent. News items emitted via `NewsService.emitNewsItem` only. Public archive year derived from `events.start_date`; year archives are not paginated. `participantHref` set via `personHref(participant_member_slug, participant_historical_person_id)` so templates render plain name when null. Public reads use prepared statements directly; no repository layer or ORM. SQLite busy/locked failures translate to temporary-unavailable for controller-level safe handling. The canonical public event page is one route and one template; render emphasis is expressed through page-model fields (e.g. `primarySection`), not through alternate URLs.

Method roster: `createEvent`, `editEvent`, `deleteEvent`, `closeRegistration`, `cancelEvent`, `completeEvent`, `addCoOrganizer`, `removeCoOrganizer`, `requestSanction`, `approveSanctionRequest`, `uploadResults`, `correctResults`, `reassignOrganizer`, `getPublicEventsLandingPage`, `getPublicEventsYearPage`, `getPublicEventPage`, plus internal lower-level helpers.

Persistence: `events`, `event_disciplines`, `event_organizers`, `event_results_uploads`, `event_result_entries`, `event_result_entry_participants`, `tags`, `news_items`, `audit_entries`, `outbox_emails`, `work_queue_items`.

Side effects: outbox enqueue (organizer confirmations, participant notices, sanction decisions), news emission (`event_published`, `event_results`), audit append, work-queue insert with admin-alerts notification.

**`CompetitionParticipationService`** (`src/services/competitionParticipationService.ts`)

Owns event registration, discipline selections, attendance marking, and participant list management. Does not own event creation, payment processing, vouching, or official roster reporting and export.

Required patterns: competitor registration requires at least one discipline selection before `status = 'confirmed'`. Attendance marking delegates Active Player effect to `ActivePlayerService.applyAttendance()`; this service never writes to `member_tier_grants` or `active_player_grants` directly. Capacity enforcement transitions event status to `registration_full` when reached. Participant email is rate-limited 1 per event per day. Roster reporting and export are not exposed here (`OfficialRosterService` for read paths; `AdminGovernanceService` for admin orchestration).

Method roster: `registerForEvent`, `confirmRegistration`, `markAttendance`, `getParticipants`, `exportParticipants`, `emailParticipants`.

Persistence: `registrations`, `registration_discipline_selections`, `events`, `member_membership_status_current`, `members`, `email_archives`, `audit_entries`, `outbox_emails`.

Side effects: outbox enqueue (registration confirmation, reminder, participant emails), audit append.

**`FreestyleService`** (`src/services/freestyleService.ts`)

Owns all public freestyle section page reads (`GET /freestyle*`): landing, world records grouped by record type, leaders, about, moves reference, and individual trick detail pages. Does not own event lifecycle, result ingestion, or other sport domains.

Required patterns: read-only against canonical tables; `NotFoundError` on unknown trick slug routed to a 404 by the controller; trick detail reference video gallery filters to curator-uploaded media (`#curated` plus `#freestyle` plus `#trick` plus the slug tag) joined to `media_sources` for provenance.

Method roster: `getLandingPage`, `getRecordsPage`, `getLeadersPage`, `getTrickDetailPage`, `getAboutPage`, `getMovesPage`.

Persistence: `freestyle_records`, `freestyle_tricks`, `freestyle_trick_modifiers`, `freestyle_competition`, `freestyle_partnerships`, `media_items`, `media_tags`, `media_sources` (all read-only).

Side effects: none.

**`RecordsService`** (`src/services/recordsService.ts`)

Owns the public cross-sport records page read for `GET /records`, aggregating records across sport domains (consecutive kicks, freestyle passback) into a single page view-model. Does not own event lifecycle or per-sport detail pages.

Required patterns: read-only against canonical tables; cross-sport read contract (future record sources become additional fields on `RecordsContent` and additional persistence touchpoints; per-sport detail pages still belong on their section services).

Method roster: `getRecordsPage`.

Persistence: `consecutive_kicks_records`, `freestyle_records` (all read-only).

Side effects: none.

**`NetService`** (`src/services/netService.ts`)

Owns public Footbag Net page reads: portal landing (`GET /net`), team list (`GET /net/teams`), and team detail (`GET /net/teams/:teamId`). Does not own canonical result ingestion, freestyle, or consecutive domain reads.

Required patterns: statistics firewall, all appearance reads use `net_team_appearance_canonical` view; `inferred_partial` data is never exposed in public routes. Conflict-flag-aware discipline label resolution: when `conflict_flag = 1` on a `net_discipline_group` row, render the raw `discipline_name` instead of the canonical group label. Disclaimer "Team identities are algorithmically constructed from placement data and may not reflect official partnerships" rendered always on both pages, not conditioned on a flag. No win/loss, head-to-head, or ranking data of any kind. `NotFoundError` on unknown team ID.

Method roster: `getNetHomePage`, `getTeamsPage`, `getTeamDetailPage`.

Persistence: `net_team`, `net_team_member`, `net_team_appearance_canonical` (view), `net_discipline_group`, `historical_persons` (read for display names and country).

Side effects: none.

**`SidelineService`** (`src/services/sidelineService.ts`)

Owns the public sideline section page read for `GET /sideline` (the "Sideline" portal landing). Does not own competitive event lifecycle, results ingestion, or record aggregation.

Required patterns: static content, no DB; game list, copy, asset paths, and links fixed in code; demo videos served as static `.webm` from `src/public/video/sideline/` with missing assets degrading to no-video render; all `moreInfo` links are `external: false`; the page contains zero offsite links.

Method roster: `getSidelineLandingPage`.

Persistence: none.

Side effects: none.

**`RulesService`** (`src/services/rulesService.ts`)

Owns the public rules section reads (`GET /rules` index and `GET /rules/:disciplineSlug/:ruleSlug` detail). Does not own competitive event lifecycle, results ingestion, governance editing, or record aggregation.

Required patterns: rule text source of truth in `ifpa/rules/{discipline}.md`; rendered HTML is derived (verbatim from canonical IFPA source, no paraphrasing). YAML frontmatter applies to every rule split out of a discipline file (`discipline`, `disciplineLabel`, `authority`, `effective`, `parentHref`, `parentLabel`, optional `alternateLanguageLabel` plus `alternateLanguageHref`); the alternate-language pair drives the cross-language toggle. H1 headings become rule pages with `slugify(headingText)` slugs; H2 headings receive matching `id` attributes. Markdown rendered with `marked` v14 by `src/lib/rulesLoader.ts`; cache is process-lifetime; `_resetRulesCache()` test hook exported. Rule pages render zero offsite hyperlinks. `NotFoundError` on unknown discipline or slug.

Method roster: `getRulesIndexPage`, `getRulePage`.

Persistence: none (filesystem-backed).

Side effects: none.

### 6.3 Payments and membership

**`PaymentService`** (`src/services/paymentService.ts`)

Owns all Stripe interactions: one-time payments (dues, registration fees, donations), recurring donation subscriptions, webhook processing, reconciliation. Does not own tier grant logic or registration confirmation.

Required patterns: Stripe success gating, tier grants and confirmed registrations written only after `payments.status = 'succeeded'`. Every `payments.status` change writes a paired `payment_status_transitions` row in the same transaction; same dual-write rule for subscription transitions. DB trigger enforces `pending -> succeeded | failed | canceled; succeeded -> refunded` with no backward transitions. All webhook processing idempotent via `stripe_events.event_id` deduplication. `members.stripe_customer_id` is the canonical member-level customer ID; `payments.stripe_customer_id` is the per-payment snapshot; the two are distinct fields. Reconciliation amount discrepancy compares both `amount` and `currency` fields. Reconciliation issue rows carry `expires_at = created_at + reconciliation_expiry_days` at INSERT. Refund does not write a `revoke` row; tier purchases are preserved on refund. HoF/BAP donation comment defaults: HoF "HoF Fund"; BAP "BAP Fund"; both "HoF Fund". `is_cancel_at_period_end` reflects Stripe's flag; set on cancel_requested, confirmed via `customer.subscription.deleted` webhook.

Method roster: `createCheckoutSession`, `createRecurringDonationSubscription`, `cancelRecurringDonation`, `handleStripeWebhook`, `processPaymentIntentSucceeded`, `processPaymentIntentFailed`, `processChargeRefunded`, `processSubscriptionInvoiceSucceeded`, `processSubscriptionInvoiceFailed`, `processSubscriptionDeleted`, `processSubscriptionUpdated`, `getPaymentHistory`, `getAllPayments`, `runReconciliation`, `resolveReconciliationIssue`.

Persistence: `payments`, `payment_status_transitions`, `recurring_donation_subscriptions`, `recurring_donation_subscriptions_active`, `recurring_donation_subscription_transitions`, `stripe_events`, `reconciliation_issues`, `members`, `audit_entries`, `outbox_emails`.

Side effects: outbox enqueue (receipts, failure notices, cancellation), audit append, nightly reconciliation digest delegated through `OperationsPlatformService`.

**`MembershipTieringService`** (`src/services/membershipTieringService.ts`)

Owns the membership-tier ledger (`member_tier_grants`), HoF/BAP Tier 2 grants, Tier 3 governance set/remove, admin tier corrections, admin-role grants. `getTierStatus(memberId)` is the sole authoritative membership-tier read path. Does not own payment processing, registration, Active Player lifecycle, or official roster reads.

Required patterns: append-only ledger (UPDATE/DELETE blocked by triggers). `getTierStatus` derives from `member_tier_current`. Source-linkage discipline: membership-tier grants link only to `related_payment_id`, admin overrides, HoF/BAP grants, Tier 3 governance changes, or legacy migration; no event/vouch/club source FK. `governance_set` requires non-null `new_underlying_tier_status`; `governance_removed` requires non-null `old_underlying_tier_status`. HoF/BAP grant: if member is at Tier 3, write `governance_set` updating `new_underlying_tier_status = tier2`; otherwise write a plain Tier 2 grant. Refund does not write a `revoke` row. Admin-role prereqs: target must be Tier 2 or Tier 3; anti-lockout (last admin cannot be revoked); admin-alerts mailing list subscription updated atomically with `is_admin` change. Tier 0 Active Player ending on purchase or Tier 3 grant runs in the same transaction as the tier write (calls `ActivePlayerService.endOnTierUpgrade` or `endOnTier3Grant`). News items emitted via `NewsService.emitNewsItem` only.

Method roster: `getTierStatus`, `applyPurchaseGrant`, `applyHonorGrant`, `setGovernanceTier3`, `removeGovernanceTier3`, `adminOverride`, `adminManageRole`.

Persistence: `member_tier_grants`, `member_tier_current`, `members` (flag and role fields), `mailing_list_subscriptions`, `news_items`, `audit_entries`, `outbox_emails`.

Side effects: outbox enqueue (tier change, congratulatory HoF/BAP), news emission (`member_honor`), audit append.

**`ActivePlayerService`** (`src/services/activePlayerService.ts`)

Owns the Active Player lifecycle ledger (`active_player_grants`) and the direct vouch action table (`active_player_vouches`). `getStatus(memberId)` is the sole authoritative Active Player read path. Does not own membership-tier writes, event registration, or club affiliations.

Required patterns: append-only ledgers (UPDATE/DELETE blocked by triggers). `getStatus` derives from `member_active_player_current`. Active Player applies to Tier 0 only; Tier 1+ vouches and attendances are no-ops with audit-log only. No-shorten rule: an older event, vouch, or club-join must not shorten an existing later expiry. Idempotency via `ux_active_player_grants_registration_once` (per registration), `ux_active_player_grants_vouch_once` (per vouch), `ux_active_player_club_join_once` (per member, lifetime). Self-vouch rejected at DB and APP. Vouch rate limit throws `RateLimitedError` from `system_config_current`. `endOnTierUpgrade` and `endOnTier3Grant` execute in the same transaction as the corresponding `member_tier_grants` write.

Method roster: `getStatus`, `applyAttendance`, `applyVouch`, `applyClubJoin`, `endOnTierUpgrade`, `endOnTier3Grant`, `applyExpiry`, `adminCorrectExpiry`.

Persistence: `active_player_grants`, `active_player_vouches`, `member_active_player_current`, `member_membership_status_current`, `members`, `system_config_current`, `audit_entries`, `outbox_emails`.

Side effects: outbox enqueue (vouch confirmations, expiry reminders), audit append.

**`OfficialRosterService`** (`src/services/officialRosterService.ts`)

Owns Official IFPA Roster read paths (`list`, `summary`, `exportCsv`). The roster is not public. Does not own membership-tier writes, Active Player lifecycle, or admin orchestration.

Required patterns: roster includes Tier 1, Tier 2, Tier 3 plus Tier 0 with current Active Player; deceased members excluded per view definition. Sole surface for accessing membership roster data; controllers must not bypass to read the underlying view directly. All access (view and export) audit-logged with `category = 'roster_access'`. Filename pattern `official_roster_YYYYMMDD.csv`; CSV header comment line per the user-story acceptance criteria.

Method roster: `list`, `summary`, `exportCsv`.

Persistence: `official_ifpa_roster_current` (read-only view), `members_active`, `audit_entries`.

Side effects: audit append.

### 6.4 Voting and recognition

**`VotingElectionService`** (`src/services/votingElectionService.ts`)

Owns vote lifecycle, ballot submission and encryption, eligibility snapshots, tally and publish, HoF nomination and affidavit flows. Does not own admin role management or HoF inductee display.

Required patterns: ballot append-only (UPDATE/DELETE blocked); eligibility snapshot write-once. Date ordering enforced (`vote_open_at < vote_close_at`; nomination ordering); `options_visible_at <= vote_open_at`. Tally requires `can_tally_votes` permission, not just `is_admin`; tally allowed only when `status = 'closed'` AND `now > vote_close_at`. Vote options locked once vote is `open` or later. Receipt token: plaintext never persisted; `SHA-256(token)` stored; outbox `body_text` scrubbed after delivery. Ballot non-anonymity by design: `voter_member_id` plaintext alongside encrypted ballot. Ballot encryption uses AES-256-GCM with per-ballot KMS data keys. After tally, ballot contents discarded immediately; only totals retained. Audit logs TALLY_VOTE_START and TALLY_VOTE_COMPLETE record totals only, never individual ballot contents. Any single snapshot timestamp exposed by the service derives from `vote_eligibility_snapshot.created_at` values for that vote using one consistent rule. News items emitted via `NewsService.emitNewsItem` only.

Method roster: `createVote`, `openVote`, `submitBallot`, `closeVote`, `tallyAndPublish`, `cancelVote`, `verifyReceipt`, `nominateHoFCandidate`, `approveHoFNomination`, `submitHoFAffidavit`, `getVoteOptions`.

Persistence: `votes`, `vote_options`, `vote_eligibility_snapshot`, `ballots`, `vote_results`, `vote_result_option_totals`, `hof_nominations`, `hof_affidavits`, `members`, `news_items`, `audit_entries`, `outbox_emails`, `work_queue_items`.

Side effects: outbox enqueue (vote-open, receipt, cancellation), news emission (`vote_results`), audit append, work-queue insert with admin-alerts notification.

**`HallOfFameService`** (`src/services/hofService.ts`)

Owns the HoF landing page read for `GET /hof` (service-shaped, no DB queries). Does not own HoF tier promotion or `is_hof` writes; does not own nomination, affidavit, or election lifecycle.

Required patterns: read-only with no DB queries; service provides `content.externalLink` so templates do not construct the standalone HoF URL.

Method roster: `getHofLandingPage`.

Persistence: none.

Side effects: none.

**`BigAddPosseService`** (`src/services/bapService.ts`)

Owns the BAP landing page read for `GET /bap` (service-shaped, no DB queries). Does not own BAP tier promotion or `is_bap` writes.

Required patterns: read-only with no DB queries; service provides `content.externalLink` so templates do not construct the standalone BAP URL.

Method roster: `getBapLandingPage`.

Persistence: none.

Side effects: none.

### 6.5 Content and discovery

**`MediaGalleryService`** (`src/services/mediaService.ts`, with avatar via `createAvatarService` factory in `avatarService.ts`)

Owns member photo upload and processing, member video link submission, gallery management, media tagging, and media flag and moderation workflows. Does not own curator-attributed (system-member) photo and video upload, tag stats recomputation, or S3 lifecycle management.

Required patterns: HD media (no soft-delete); flags and tags cascade-delete with media; gallery contents cascade with gallery delete; avatar and club logo detach on media delete (`ON DELETE SET NULL`). Photo security pipeline mandatory: re-encode as JPEG 85%, strip EXIF/ICC, generate 300x300 thumbnail and 800px display variant, discard original. Max 5 video embeds per gallery. One avatar per member (partial UNIQUE index `ux_media_avatar_per_member`). Standard tags must not be HD. Tag validation delegated to `HashtagDiscoveryService.validateAndResolveTag`; this service does not normalize or create tags directly. Tag stats recomputation is not triggered here; `HashtagDiscoveryService.rebuildTagStats` runs independently via `OperationsPlatformService`. Uploader-attribution `#by_<slug>` namespace is system-managed at upload time, never via picker; `addMediaToGallery` filters tags in this namespace before stamping. Per-item ownership enforced on picker actions (non-admin actor cannot attach another member's media). Named-gallery and browse page reads filter `moderation_status = 'active'` and `is_avatar = 0`; default ordering follows `member_galleries.sort_order`. `/media/browse` accepts repeatable `?tag=` and `?exclude=`, normalized to `#<lowercase>`, deduplicated, include winning over same-token exclude; mode is `browse` (form pane only) when no token resolves, otherwise `results` (form pane plus paginated tile grid); pagination prev/next reproduce the canonical repeated-arg form. Hero `byMember` chip lifts from any `#by_<slug>` criterion (auth-gated profile link) so the template renders "by *Member Name*" attribution distinct from gallery ownership.

Method roster: `uploadPhoto`, `submitVideo`, `editMediaTags`, `deleteMedia`, `deleteGallery`, `flagMedia`, `adminDeleteMedia`, `getGallery`, `getTagGallery`, `getEventGallery`, `getClubGallery`, `getMediaHubPage`, `getNamedGalleryPage`, `getMediaBrowsePage`. Avatar: `uploadAvatar`.

Persistence: `media_items`, `member_galleries`, `member_gallery_tags`, `member_gallery_exclude_tags`, `gallery_external_links`, `media_tags`, `media_flags`, `tags`, `members`, `work_queue_items`, `audit_entries`, `outbox_emails`.

Side effects: audit append, work-queue insert (media flag) with admin-alerts notification, outbox enqueue (admin takedown notification).

**`HashtagDiscoveryService`** (`src/services/hashtagDiscoveryService.ts`)

Owns tag creation and validation, tag browse and search, tag stats cache, and teaching moments data. Does not own media tagging operations.

Required patterns: global tag uniqueness via `ux_tags_normalized`. Standard tags (`is_standard = 1`) must not be HD; reject any delete request. Community-tag threshold for public browse: `distinct_member_count >= 2`. `rebuildTagStats` reads both `media_tags` (usage count) and `members` (distinct member count); omitting either produces incorrect community-tag results. `rebuildTagStats` is invoked only by `OperationsPlatformService.runTagStatsRebuild`. `reserveStandardTag` enforces case-insensitive uniqueness and is permanent.

Method roster: `validateAndResolveTag`, `reserveStandardTag`, `browseAllTags`, `getTagGalleryMeta`, `rebuildTagStats`, `getPopularTags`.

Persistence: `tags`, `tag_stats`, `media_tags`, `members`.

Side effects: audit append (standard tag creation).

**`NewsService`** (`src/services/newsService.ts`)

Owns news item creation (auto-generated and admin-authored), moderation, and public feed. Does not generate its own news; calling services invoke `emitNewsItem` as a side effect of their own domain actions.

Required patterns: HD news (no soft-delete). `emitNewsItem` is the only auto-write path; domain services do not write `news_items` directly. News types are a controlled vocabulary (`event_published`, `event_results`, `club_created`, `club_archived`, `member_honor`, `vote_results`, `announcement`, `system`). News moderation queries use `news_items` directly (hard-delete domain; no `_all` alias). Deletion requires mandatory reason. Future-dated items invisible until publish date.

Method roster: `emitNewsItem`, `createManualNewsItem`, `editNewsItem`, `deleteNewsItem`, `getNewsFeed`, `getNewsItem`.

Persistence: `news_items`, `audit_entries`.

Side effects: audit append.

**`LegalService`** (`src/services/legalService.ts`)

Owns the static page view-model for `/legal`, composing Privacy, Terms of Use, and Copyright and Trademarks as three anchored sections on a single page. Does not own policy decisions themselves (authored and approved out-of-band, updated by editing service source).

Required patterns: content is static, no DB. Section order fixed: Privacy, Terms of Use, Copyright and Trademarks. Anchor IDs stable (`privacy`, `terms`, `copyright`). Substantive content changes require updating `content.lastUpdated`. Operator identity, governing law, and copyright year range require deliberate review when changed.

Method roster: `getLegalPage`.

Persistence: none.

Side effects: none.

**`CuratorMediaService`** (`src/services/curatorMediaService.ts`)

Owns admin upload, edit, delete, and list of curator-attributed photos and videos on behalf of the system member account; magic-byte and format validation; ffmpeg curator transcode pipeline; storage key construction matching the curator seed; auto-application of the `#curated` uploader marker; admin and member named-gallery editing for FH-owned and member-owned `member_galleries` rows. Does not own member-attributed uploads.

Required patterns: `uploader_member_id` is always the system member id (`is_system=1`); admin actor recorded only in `audit_entries`. Curator video bytes use `video_platform='s3'`; member video routes reject `video_platform='s3'` as a defensive boundary. Storage keys match the curator-seed layout (`{systemMemberId}/detached/{mediaId}-...`) so offline seed and admin upload produce identical row shape. Auto-applies `#curated`; `#curated` rejected from input. URL-reference uploads write a sidecar JSON file under `/curated/{category}/<primarySlug>_<sha1(videoUrl)[:8]>.meta.json` (atomic temp-file plus rename) and do not write a `media_items` row; the seeder regenerates rows from sidecars. Photo upload uses Sharp (aspect-preserving thumb, 800px-wide display, EXIF/ICC stripped); video upload uses ffmpeg curator transcode (re-encode plus metadata strip). Magic-byte rejection for unsupported formats. Audit entries are append-only. All DB writes for one upload (`media_items` plus `media_tags` plus `audit_entries`) land in one transaction; storage `put` calls happen before the transaction opens; if any storage put fails the transaction never runs. Asynchronous interactive admin video upload uses the `media_jobs` flow per `MediaJobService`; `finalizeTranscodeForJob` is the worker-side finalize. For sidecar-backed rows (`video_platform IN ('youtube','vimeo')`), edits and deletes resolve the sidecar at runtime from `(video_platform, video_url)`, rewrite or unlink atomically, then update the DB row inline so reads reflect changes without waiting for the next seeder run. Named-gallery editing: actor must be admin OR owner of the affected gallery (the service enforces this on every mutating call). FH-owned creation requires admin actor and explicit `suggestedId` matching `gallery_[a-z0-9_]+`; member-owned derives id `gallery_<owner_slug>_<gallery_name_slug>` (`_2`, `_3` suffixes on collision). Member-owned galleries auto-prepend `#by_<owner_slug>` to validated criteria tags on every create or update so the owner-scoping criterion survives DELETE-then-INSERT and cannot be removed by editing; the `>=1 criteria tag` invariant is enforced after auto-prepend; user-supplied `#by_*` tags rejected from input. FH-owned writes the JSON sidecar at `/curated/galleries/<slug>.json` after commit (sidecar I/O failure logged but does not roll back DB); member-owned never touches the filesystem. `addMediaToGallery` applies CURRENT criteria tags to picked items, idempotent on already-applied tags; `#by_*` tags filtered out before stamping; per-item ownership enforced (mismatched items skipped); cap 50 ids per call (`ValidationError` above cap). `listMediaForPicker` reads by `uploader_member_id` (the authoritative ownership signal). `getSystemMemberId` exposes the system member id resolution for callers that need to pass `ownerMemberId`.

Method roster: `uploadPhoto`, `uploadVideo`, `finalizeTranscodeForJob`, `uploadUrlReference`, `editMedia`, `deleteMedia`, `listMedia`, `getMediaItem`, `listExistingCategories`, `listOwnedGalleries`, `getGalleryForEdit`, `createGallery`, `updateGallery`, `deleteGallery`, `listGalleriesForOwner`, `listMediaForPicker`, `addMediaToGallery`, `getSystemMemberId`.

Persistence: `media_items`, `media_tags`, `tags`, `audit_entries`, `members`, `member_galleries`, `member_gallery_tags`, `member_gallery_exclude_tags`. Filesystem: `/curated/{category}/*.meta.json` (URL-reference sidecars) and `/curated/galleries/<slug>.json` (FH gallery sidecars; source of truth).

Side effects: audit append per upload or gallery mutation.

**`CuratorSeedService`** (`src/services/curatorSeedService.ts`)

Walks a directory of curator source files paired with sidecar `.meta.json` siblings and drives `CuratorMediaService` to insert, update, or delete `media_items` plus `media_tags` rows so the persisted state matches the directory's current contents. Does not perform direct DB or storage writes; all mutations go through `CuratorMediaService`.

Required patterns: source bytes not re-checked for content drift (caption and tags reconciled against sidecar; file replacement requires explicit delete plus new upload). Orphan detection scoped to system-uploader rows with non-NULL `source_filename`; member-uploaded rows never touched. Video sidecars must specify a `poster` filename pointing at a sibling poster image; missing poster reported as a per-file error and does not abort the run. Re-running `reconcile` against unchanged inputs produces zero DB writes and zero S3 calls. Each per-file upload, edit, or delete uses a single transaction (delegated to `CuratorMediaService`).

Method roster: `reconcile`.

Persistence: inherited from `CuratorMediaService`: `media_items`, `media_tags`, `tags`, `audit_entries`. Reads `media_items` directly to enumerate existing rows for orphan detection.

Side effects: S3 PUT for variants on new uploads; S3 DELETE for orphans; no emails or webhooks.

**`MediaJobService`** (`src/services/mediaJobService.ts`)

Owns the lifecycle of `media_jobs` rows backing the asynchronous interactive admin video upload. Pure persistence and state-transition logic. Does not run ffmpeg, does not talk to S3, does not push events. Companion in-process `JobEventBus` module (`src/services/jobEventBus.ts`) is a small `EventEmitter` keyed by jobId, used by the SSE handler to subscribe and the IPC controller to publish; not a service in the catalog sense.

Required patterns: state transitions are optimistic-locked via `UPDATE...WHERE...state=expected` so two simultaneous claimers cannot double-process. `getJobForAdmin` returns `null` for both unknown jobs and jobs owned by another admin so the surface cannot be enumerated. `markSucceeded` requires a non-null `mediaId` (DB CHECK). Boot-time recovery is the only sweep; all other transitions are HTTP-event-triggered. Idempotent re-dispatches are filtered at `claimForProcessing` (returns `null` if not in `pending_transcode`); duplicate finalize POSTs filtered at `markPendingTranscode` via `ConflictError`.

Method roster: `createPendingUploadJob`, `markPendingTranscode`, `claimForProcessing`, `markSucceeded`, `markFailed`, `getJobForAdmin`, `recoverOrphanedProcessingJobs`, `markAbandoned`, `findExpiredPendingUploads`.

Persistence: `media_jobs`. Reads `members(id)` via FK only; never writes member rows.

Side effects: none. Event publication onto `jobEventBus` happens in the IPC controller.

### 6.6 Communication

**`CommunicationService`** (`src/services/communicationService.ts`)

Owns outbox polling and sending via SES, mailing list management, subscription management, email archival, SES bounce and complaint handling, and email template management. Does not trigger sends directly; all other services enqueue to outbox and this service owns the worker (invoked by `OperationsPlatformService.runEmailWorker`).

Required patterns: outbox pattern, no service calls SES directly; all sends via `enqueueEmail` plus worker. Idempotency key on enqueue prevents duplicate sends on retry. Receipt-token scrub: `body_text` in voting confirmation emails scrubbed after successful delivery. Email templates DB-stored and admin-editable without code deployment; changes audit-logged old/new content. `email_templates_enabled` view exposes only `is_enabled = 1` templates. `admin-alerts` list is system-managed (`is_member_manageable = 0`); subscription driven by `is_admin` changes in `MembershipTieringService.adminManageRole`. Bounce and complaint rates tracked; alarm raised via `OperationsPlatformService.raiseAlarm` on threshold breach. `sendAnnounceEmail` authz is Tier 2+ (distinct from `sendMailingListEmail` which is admin-only for all other lists). Worker skips sending when `email_outbox_paused = 1` from `system_config_current`. CloudWatch logs include template ID, member ID, outbox ID, timestamp, result; never raw email addresses.

Method roster: `processSendQueue`, `enqueueEmail`, `sendAnnounceEmail`, `sendMailingListEmail`, `createMailingList`, `archiveMailingList`, `updateMemberSubscription`, `adminAdjustSubscription`, `updateEmailTemplate`, `handleSESBounce`, `handleSESComplaint`, `getMailingListStats`, `getEmailArchive`.

Persistence: `outbox_emails`, `mailing_lists`, `mailing_list_subscriptions`, `email_archives`, `email_templates`, `email_templates_enabled`, `audit_entries`, `system_config_current`.

Side effects: audit append (list management, template updates, bulk sends), alarm raise (bounce and complaint thresholds).

**`SimulatedEmailService`** (`src/services/simulatedEmailService.ts`)

Dev-mode shaping service that produces the view-model for the `simulated-email-card` Handlebars partial rendered on email-gated public pages (`/register/check-email` and its post-resend landing). Does not enqueue, send, or mutate `outbox_emails`.

Required patterns: three-mode env switch driven by `SES_ADAPTER` plus `SES_SANDBOX_MODE`. `dev` (`SES_ADAPTER=stub`) returns captured in-memory messages from `StubSesAdapter.sentMessages` so a developer can finish an email flow without leaving the page. `sandbox` (`SES_ADAPTER=live` plus `SES_SANDBOX_MODE=1`) returns a marker view-model so the page renders a one-line staging notice. `null` (`SES_ADAPTER=live` plus `SES_SANDBOX_MODE=0`) returns no view-model; the page omits the card entirely in production. Dev-mode reads the stub adapter's in-memory `sentMessages` array, which is independent of `outbox_emails.body_text` (the DB row is scrubbed post-send for PII hygiene; the stub's memory array retains the original message content so dev visibility is preserved after the DB scrub). Calling `getEmailPreview` in dev mode is safe to repeat: no network calls, idempotent outbox drain via `OperationsPlatformService.runEmailWorker`.

Method roster: `getEmailPreview`.

Persistence: none.

Side effects: invokes `OperationsPlatformService.runEmailWorker` in dev mode to drain the outbox before reading the stub array.

### 6.7 Governance and operations

**`AdminGovernanceService`** (`src/services/adminGovernanceService.ts`)

Owns admin dashboard, work-queue management, audit log viewing, system health view, alarm management, official roster report and export orchestration, reconciliation digest data assembly, and system config writes. Orchestrates cross-service admin actions that do not fit a single domain service. Does not own the business logic of services it coordinates; does not serve as the runtime config read path (application code and jobs read `system_config_current` directly).

Required patterns: append-only `system_config` (UPDATE/DELETE blocked by triggers); `setConfigValue` and `updateMembershipPricing` INSERT new rows, never UPDATE or DELETE existing ones; `system_config_current` picks up new values immediately. `getSystemConfig` is the admin UI read path only; runtime config reads by jobs and services go directly to `system_config_current`. Pricing keys are integer cents (`tier1_price_cents`, `tier2_price_cents`); UI layer converts to display currency. Work-queue items remain visible post-resolution with status, resolver, timestamp, decision, and reason. Roster report and export read paths are owned by `OfficialRosterService`; this service handles admin orchestration. System health reads `system_job_runs` surfaced by `OperationsPlatformService.recordJobRun`; no direct AWS console links. `buildReconciliationDigestData` is read-only payload assembly and does not send email; enqueue happens in `OperationsPlatformService.runNightlyReconciliation`.

Method roster: `getDashboard`, `getWorkQueue`, `resolveWorkQueueItem`, `getAuditLogs`, `getSystemHealth`, `viewStripeHealth`, `acknowledgeAlarm`, `getSystemConfig`, `setConfigValue`, `updateMembershipPricing`, `getOfficialRosterReport`, `exportOfficialRoster`, `getReconciliationIssues`, `buildReconciliationDigestData`.

Persistence: `work_queue_items`, `audit_entries`, `system_config`, `system_config_current`, `system_alarm_events`, `reconciliation_issues`, `members`, `members_all`.

Side effects: audit append.

**`OperationsPlatformService`** (`src/services/operationsPlatformService.ts`)

Owns background job orchestration, system job-run logging, alarm raise and ack, backup jobs, static asset cleanup, and application-level readiness composition for operational health checks. Does not own domain business logic (delegates to named domain service methods); does not own row-level PII purge logic.

Required patterns: all jobs read configuration from `system_config_current` at runtime; no hardcoded thresholds. All webhook handlers idempotent. PII purge has separate soft-deleted vs deceased branches with distinct grace configs (`member_cleanup_grace_days` and `deceased_cleanup_grace_days`); the two are separate grace rules and must not be collapsed; events with published results and clubs preserved permanently; payment records use `payment_retention_days`; ballots use `ballot_retention_days`; member-row PII work delegated to `MemberService.purgeAccountPII`. Resolved reconciliation issues deleted by `runNightlyReconciliation` after `expires_at`. Backup health is surfaced through logs, job-run history, and alarms, not through `/health/ready`. All SYS jobs write `system_job_runs` via `recordJobRun` on every run for admin visibility. This service contains no domain logic; substantive work delegates to named domain service methods.

Method roster: `runActivePlayerExpiryCheck`, `runEmailWorker`, `openPendingVotes`, `closePendingVotes`, `runPaymentWebhookProcessor`, `runSESWebhookProcessor`, `runNightlyReconciliation`, `runPIIPurgeJob`, `runTokenCleanup`, `runTagStatsRebuild`, `runNightlyBackupSync`, `cleanupStaticAssets`, `recordJobRun`, `raiseAlarm`, `getJobHistory`, `runContinuousBackup`, `checkReadiness`.

Persistence: `system_job_runs`, `system_alarm_events`, `system_config_current`, `audit_entries`, `reconciliation_issues`.

Side effects: audit append (tier expiry, PII purge, tally operations, reconciliation), alarm raise (backup failures, bounce rates, consecutive webhook failures), outbox enqueue (tier reminders, expiry notifications, scheduled reconciliation digest; all delegated to domain services).

### 6.8 Legacy migration

**`LegacyMigrationService`** (`src/services/legacyMigrationService.ts`)

Owns all self-serve and admin legacy account claim flows (legacy email, legacy username, legacy member ID, direct historical-person claim), merge transaction execution, and bootstrap club leadership resolution. Does not own club lifecycle, tier-grant writes (delegates to `MembershipTieringService`), or club-leader promotion beyond bootstrap confirmation.

Required patterns: claim initiation always returns a non-revealing response; no distinction between zero matches, multiple matches, ineligible rows, or blocked rows. Recommended message: "If an eligible legacy record was found, a claim email will be sent." Merge transaction is atomic; the target `legacy_members` row is MARKED CLAIMED (`claimed_by_member_id` plus `claimed_at` set) and is not deleted (permanent archival record). Member-editable fields copy to the claiming `members` row per the MIGRATION_PLAN merge rules (COALESCE, OR-merge, fill-if-empty). When the target's `legacy_member_id` matches a `historical_persons.legacy_member_id`, `members.historical_person_id` is set to that HP's `person_id` in the same transaction and the HP-sourced field merge runs (country fill-if-empty; `is_hof`/`is_bap` OR; `hof_inducted_year`/`first_competition_year` fill-if-empty). All outstanding `account_claim` tokens targeting the claimed `legacy_members` row are marked consumed in the same transaction. Rate limiting applies per requesting account, per target row, and per session/IP. A token may only be consumed by the same `member_id` that initiated the request. Single tier grant via `MembershipTieringService` with `reason_code = 'legacy.claim_tier_grant'` applying the blanket mapping in `MIGRATION_PLAN.md`; no conditional "exceeds current" logic. `legacy_is_admin` metadata is never auto-promoted to live admin role in any flow. One-current-club invariant: when writing a confirmed current affiliation to `member_club_affiliations`, any existing current row for that member is converted to `is_current = 0` in the same transaction. Bootstrap leadership promotion only when no conflicting live `club_leaders` row exists for the club; conflicts leave the bootstrap row provisional and create an admin work-queue item. Direct HP claim eligibility requires surname match between `members.real_name` and `historical_persons.person_name`; first-name variance (e.g. Dave/David) is permitted with a `firstNameWarning` flag on the preview.

Method roster: `initiateAccountClaim`, `consumeAccountClaim`, `lookupHistoricalPersonForClaim`, `claimHistoricalPerson`, `manualLegacyClaimRecovery`, `confirmBootstrapLeadership`, `resolveBootstrapLeadership`.

Persistence: `members`, `legacy_members`, `historical_persons` (read-only for HP-match), `account_tokens`, `member_tier_grants` (via `MembershipTieringService`), `member_club_affiliations`, `club_bootstrap_leaders`, `club_leaders`, `audit_entries`, `outbox_emails`.

Side effects: outbox enqueue (claim email, resend), audit append (all claim and bootstrap events).

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
