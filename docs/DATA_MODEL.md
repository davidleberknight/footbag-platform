# Footbag Website Modernization Project -- Data Model
**Schema file:** `database/schema.sql`

---

## Table of Contents

- [1. Design Philosophy](#1-design-philosophy)
- [2. Schema Conventions](#2-schema-conventions)
  - [Standard columns](#standard-columns)
  - [Soft-delete columns](#soft-delete-columns)
  - [Enum values](#enum-values)
  - [Boolean columns](#boolean-columns)
  - [Foreign keys](#foreign-keys)
  - [Actor column convention](#actor-column-convention)
  - [Index naming](#index-naming)
- [3. DB-Enforced vs App-Enforced Rules](#3-db-enforced-vs-app-enforced-rules)
  - [DB-enforced (schema layer)](#db-enforced-schema-layer)
  - [App-enforced (application layer)](#app-enforced-application-layer)
- [4. Domain Overview](#4-domain-overview)
  - [4.1 Tags](#41-tags)
  - [4.2 Clubs](#42-clubs)
  - [4.3 Events](#43-events)
  - [4.4 Active Player Vouches](#44-active-player-vouches)
  - [4.5 Votes & Elections](#45-votes--elections)
  - [4.6 Hall of Fame](#46-hall-of-fame)
  - [4.7 News](#47-news)
  - [4.8 Mailing Lists & Email](#48-mailing-lists--email)
  - [4.9 Admin Operations](#49-admin-operations)
  - [4.10 Payments](#410-payments)
  - [4.11 System Configuration & Pricing](#411-system-configuration--pricing)
  - [4.12 Member Tier Grants](#412-member-tier-grants)
  - [4.13 Member Tier Current View](#413-member-tier-current-view)
  - [4.13a Active Player Grants](#413a-active-player-grants)
  - [4.13b Active Player Current View](#413b-active-player-current-view)
  - [4.13c Membership Status Current View](#413c-membership-status-current-view)
  - [4.13d Official IFPA Roster Current View](#413d-official-ifpa-roster-current-view)
  - [4.14 Members & Authentication](#414-members--authentication)
  - [4.14b Legacy Members](#414b-legacy-members)
  - [4.15 Member Links](#415-member-links)
  - [4.16 Registrations & Event Results](#416-registrations--event-results)
  - [4.17 Media & Galleries](#417-media--galleries)
  - [4.18 Club Leaders & Event Organizers](#418-club-leaders--event-organizers)
  - [4.19 Account Tokens](#419-account-tokens)
  - [4.20 Mailing List Subscriptions](#420-mailing-list-subscriptions)
  - [4.21 Media Flags & Tags](#421-media-flags--tags)
  - [4.22 Tag Stats Cache](#422-tag-stats-cache)
  - [4.23 Seed Data](#423-seed-data)
  - [4.24 Member Club Affiliations](#424-member-club-affiliations)
  - [4.25 Club Viability Signals](#425-club-viability-signals)
  - [4.26 Club Cleanup Resolutions](#426-club-cleanup-resolutions)
  - [4.27 Migration Staging and Bootstrap Tables](#427-migration-staging-and-bootstrap-tables)
  - [4.28 Name-matching utilities](#428-name-matching-utilities)
  - [4.29 Member Onboarding Tasks](#429-member-onboarding-tasks)
  - [4.30 Member Declared Anchors](#430-member-declared-anchors)
  - [4.31 Staged Auto-Link Candidates](#431-staged-auto-link-candidates)
  - [4.32 Pipeline-produced canonical content](#432-pipeline-produced-canonical-content-out-of-this-enumeration)
- [5. View Reference](#5-view-reference)
  - [Computed views](#computed-views)
  - [Semantic filter views](#semantic-filter-views)
  - [Multi-condition search view](#multi-condition-search-view)
  - [Admin full-rowset views](#admin-full-rowset-views)
- [6. Application-Enforced Integrity & Workflow Rules](#6-application-enforced-integrity--workflow-rules)
  - [APP-001 — Foreign key enforcement per connection](#app-001--foreign-key-enforcement-per-connection)
  - [APP-002 — ISO-8601 T-format timestamps](#app-002--iso-8601-t-format-timestamps)
  - [APP-003 — Payment status dual-write](#app-003--payment-status-dual-write)
  - [APP-004 — Payment state machine validation](#app-004--payment-state-machine-validation)
  - [APP-005 — Subscription lifecycle dual-write](#app-005--subscription-lifecycle-dual-write)
  - [APP-006 — Stripe success gating](#app-006--stripe-success-gating)
  - [APP-007 — Membership pricing config updates](#app-007--membership-pricing-config-updates)
  - [APP-008 — Max 3 member external links](#app-008--max-3-member-external-links)
  - [APP-009 — Max 5 video embeds per gallery](#app-009--max-5-video-embeds-per-gallery)
  - [APP-010 — Max 5 club leaders](#app-010--max-5-club-leaders)
  - [APP-011 — Max 5 event organizers](#app-011--max-5-event-organizers)
  - [APP-012 — Updated-at and updated-by stamping on FK-detached rows (optional)](#app-012--updated-at-and-updated-by-stamping-on-fk-detached-rows-optional)
  - [APP-013 — Competitor registration discipline completeness](#app-013--competitor-registration-discipline-completeness)
  - [APP-014 — Vote option visibility timing](#app-014--vote-option-visibility-timing)
  - [APP-014a — Vote eligibility canonical tier strings](#app-014a--vote-eligibility-canonical-tier-strings)
  - [APP-015 — Admin role prerequisites and side effects](#app-015--admin-role-prerequisites-and-side-effects)
  - [APP-016 — Membership tier and Active Player source linkage discipline](#app-016--membership-tier-and-active-player-source-linkage-discipline)
  - [APP-018 — Reconciliation issue expiry](#app-018--reconciliation-issue-expiry)
  - [APP-019 — Ballot receipt token scrubbing](#app-019--ballot-receipt-token-scrubbing)
  - [APP-020 — Tag stats recomputation](#app-020--tag-stats-recomputation)
  - [APP-021 — Seed data required on fresh DB](#app-021--seed-data-required-on-fresh-db)
  - [APP-022 — PII purge anonymized-stub workflow](#app-022--pii-purge-anonymized-stub-workflow)
  - [APP-023 — Tally authorization (can-tally-votes equivalent)](#app-023--tally-authorization-can-tally-votes-equivalent)
  - [APP-024 — Standard tags must not be hard-deleted](#app-024--standard-tags-must-not-be-hard-deleted)
- [7. Retained DB Triggers](#7-retained-db-triggers)
  - [Append-only / immutability triggers (20)](#append-only--immutability-triggers-20)
  - [Vote options lock triggers (3)](#vote-options-lock-triggers-3)
  - [State machine trigger (1)](#state-machine-trigger-1)
- [8. SQLite Runtime Requirements](#8-sqlite-runtime-requirements)
  - [Foreign key enforcement (CRITICAL)](#foreign-key-enforcement-critical)
  - [WAL mode (recommended)](#wal-mode-recommended)
  - [Timestamp format](#timestamp-format)
- [9. Clarifications](#9-clarifications)
  - [9.1 Schema Naming Conventions](#91-schema-naming-conventions)
  - [9.2 Lifecycle / Deletion Strategy](#92-lifecycle--deletion-strategy)
  - [9.3 Timestamp Storage Contract (Prominent Clarification)](#93-timestamp-storage-contract-prominent-clarification)
  - [9.4 Intentional Exceptions / Not a Bug](#94-intentional-exceptions--not-a-bug)

---

## 1. Design Philosophy

This schema is intentionally minimal for a volunteer-maintained SQLite project.

**Core principle:** the database enforces structural integrity; the application enforces workflow, business rules, and limits.

- **Declarative first.** Use `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE`, `NOT NULL`, and `CHECK` constraints before reaching for triggers. Partial `UNIQUE` indexes encode important structural invariants (a member co-leads at most one club, one current avatar per member, etc.) declaratively.

- **Triggers only for genuine integrity guards.** Triggers remain for append-only/immutability invariants on tables where a missed write or an accidental UPDATE/DELETE would corrupt auditable history that cannot be reconstructed (ballots, audit log, tier grants, transition ledgers, system config). The payment status state machine trigger is retained because multiple independent code paths mutate `payments.status`; a DB guard is the last line of defence regardless of which path runs.

- **Application owns policy.** Count caps (max 3 member links, max 5 gallery videos, max 5 leaders/organizers), workflow state machines (subscription lifecycle), transaction ordering (dual-write, payment gating), and side effects (cache sync, email, mailing list) all live in the application layer and are documented in §6.

- **Minimal view surface.** Views are defined only when they provide a semantic filter, a multi-condition search surface, or a computed projection from effective-dated or history data. Identity aliases over physical tables are not used; the table name itself serves as the direct query surface for unrestricted access.

- **Soft-delete pattern.** Tables with `deleted_at` provide a `_active` view that filters deleted rows and an `_all` view for admin queries. Tables without soft-delete use the bare table name as the query surface; semantic filter views are named with explicit suffixes (e.g., `clubs_open`, `recurring_donation_subscriptions_active`). **`clubs` is an explicit exception:** it uses status-based archival (`status = 'archived'`) instead of `deleted_at`; see §4.2.

- **Timestamps.** All timestamps are `TEXT` in ISO-8601 UTC format: `YYYY-MM-DDTHH:MM:SS.sssZ`. This format sorts lexically and chronologically identically, enabling correct `MAX()` and `WHERE … <= now` comparisons in views and triggers. Writers **must** use `strftime('%Y-%m-%dT%H:%M:%fZ','now')` (not `datetime('now')`, which produces a space-separated format that breaks sort ordering).

---

## 2. Schema Conventions

### Standard columns

Every mutable table (tables that support UPDATE, except append-only tables) carries:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | `TEXT PRIMARY KEY` | Application-generated UUID |
| `created_at` | `TEXT NOT NULL` | ISO-8601 UTC insertion timestamp |
| `created_by` | `TEXT NOT NULL` | Actor ID (member ID or system identifier) |
| `updated_at` | `TEXT NOT NULL` | ISO-8601 UTC last-update timestamp |
| `updated_by` | `TEXT NOT NULL` | Actor ID of last updater |
| `version` | `INTEGER NOT NULL DEFAULT 1` | Optimistic concurrency counter; increment on every UPDATE |

Append-only tables (audit log, ballots, transition ledgers, tier grants, system_config) omit `updated_at`, `updated_by`, and `version` because they are never updated.

### Soft-delete columns

Tables with soft-delete carry `deleted_at TEXT` and `deleted_by TEXT`. The `_active` view filters `WHERE deleted_at IS NULL`. Soft-deleted rows are never physically removed; use the `_all` view for admin queries.

> **Exception; Clubs:** `clubs` does **not** carry `deleted_at` or `deleted_by`. Club archival sets `status = 'archived'`. The `clubs_open` view filters `WHERE status IN ('active', 'inactive')`; `clubs_all` includes archived rows. See §4.2.

### Enum values

All enumerated string columns use `CHECK (col IN (…))` constraints. This catches invalid values at insert/update time with a clear error.

### Boolean columns

SQLite has no native boolean type. All boolean columns use `is_*` prefix: `INTEGER NOT NULL DEFAULT 0 CHECK (col IN (0,1))`.

Exception: columns that directly mirror an external system's field name (e.g., Stripe) retain the external naming semantics but apply the `is_` prefix (e.g., `is_cancel_at_period_end`).

### Foreign keys

Foreign keys reference the physical table directly by its bare name. `_base` suffixes have been removed from all tables in v1.5. Nullable FKs use `ON DELETE SET NULL` where the referencing column being NULL is a valid "detached" state (e.g., `members.avatar_media_id`). Hard-reference FKs use `ON DELETE CASCADE` where appropriate (e.g., `media_flags.media_id ON DELETE CASCADE`).

### Actor column convention

Two actor column patterns are used and are intentionally distinct:

- **Free-form actor** (`created_by`, `updated_by`): `TEXT NOT NULL`. Accepts member UUIDs or system process identifiers (e.g., `'system'`, `'job:active_player_expiry'`). No FK because system actors are not rows in `members`. Used on all standard metadata columns.
- **Typed member FK** (`*_member_id` role columns): `TEXT REFERENCES members(id)`. Used when the actor must be a specific, queryable platform member. Nullable where system-initiated actions are possible.

### Index naming

| Type | Prefix | Example |
|------|--------|---------|
| Non-unique index | `idx_` | `idx_members_tier` |
| Unique index | `ux_` | `ux_members_email`, `ux_clubs_hashtag` |
| Trigger | `trg_` | `trg_ballots_no_update` |

---

## 3. DB-Enforced vs App-Enforced Rules

### DB-enforced (schema layer)

| Mechanism | Examples |
|-----------|---------|
| `PRIMARY KEY` | Row identity uniqueness |
| `NOT NULL` | Required fields |
| `UNIQUE` / partial `UNIQUE` index | A member co-leads at most one club, one avatar per member, email uniqueness for un-purged members |
| `CHECK` | Enum values, boolean shape, conditional NOT NULL (PII purge invariant) |
| `FOREIGN KEY` + `ON DELETE SET NULL` | Avatar/logo/gallery detachment on media delete |
| `FOREIGN KEY` + `ON DELETE CASCADE` | Media flags/tags cascade-delete with media |
| Immutability triggers | Append-only tables: audit log, ballots, eligibility snapshot, tier grants, payment/subscription transitions, system_config |
| State machine trigger | `payments.status` forward-only transitions |

### App-enforced (application layer)

All rules in §6. Key items:

- Count caps: 3 member links, 5 gallery videos, 5 club leaders, 5 event organizers
- Config writes: INSERT a new `system_config` row; never UPDATE existing rows
- Payment dual-write: update `payments.status` and insert `payment_status_transitions` in the same transaction
- Subscription dual-write: same pattern for `recurring_donation_subscriptions` + transitions
- Stripe success gating: only write tier grants / confirmed registrations after payment succeeds
- Subscription lifecycle state machine
- Admin role prerequisites and anti-lockout
- Competitor registration discipline min-cardinality
- ISO-8601 T-format timestamp enforcement for all writers
- `PRAGMA foreign_keys = ON` on every connection

---

## 4. Domain Overview

### 4.1 Tags

**Table:** `tags`

Tags are globally unique normalized strings prefixed with `#`. The `UNIQUE INDEX ux_tags_normalized` enforces uniqueness for all currently-existing rows with no `WHERE` clause.

Standard tags (`is_standard = 1`) follow platform patterns:
- Events: `#event_{year}_{event_slug}`
- Clubs: `#club_{location_slug}`

Freeform tags are unrestricted beyond security input validation (HTML stripping, Unicode normalization, max 100 characters).

The event tag/key pattern is exact and underscore-based. Documentation and route contracts must not assume hyphen/underscore rewrites, aliasing, or fuzzy matching.

The `tag_normalized` column stores the lowercased form; `tag_display` stores the original capitalization for rendering.

**Standard-tag permanence:** Standard tags are permanent identities and must not be hard-deleted. The global unique index enforces extant-row uniqueness, but permanent reservation of standard-tag normalized forms across time is workflow/application-enforced (see APP-024). The schema carries no soft-delete mechanism for tags; permanent reservation depends entirely on delete discipline.

### 4.2 Clubs

**Table:** `clubs`  
**Views:** `clubs_open` (active and inactive), `clubs_all` (including archived)

Clubs do **not** use soft-delete. `deleted_at` and `deleted_by` are **not** present on `clubs`. Club archival sets `status = 'archived'`. `clubs_open` filters `WHERE status IN ('active', 'inactive')`; `clubs_all` includes archived rows.

`logo_media_id REFERENCES media_items(id) ON DELETE SET NULL`: deleting a media item automatically detaches it as the club logo. The application stamps `updated_at`/`updated_by` when explicitly removing a logo; the FK action covers deletion via other paths.

Each club has a unique `hashtag_tag_id` (enforced by `UNIQUE INDEX ux_clubs_hashtag`). This hashtag is the canonical club identifier for gallery auto-linking.

### 4.3 Events

**Tables:** `events`, `event_disciplines`

Events use hard-delete (US `EO_Delete_Event`; DD §2.3). Events with result rows are preserved permanently by workflow constraints; all other events are removed immediately and permanently on deletion. `event_disciplines` uses hard-delete (disciplines removed from draft events are gone immediately).

`events.host_club_id REFERENCES clubs(id)` is the canonical optional relationship for the `hostClub` display field. It represents the club publicly associated with hosting the event. It is nullable because some imported historical events may not have a confidently known host club. Public pages must derive `hostClub` from this relationship only when present. They must not infer a host club from organizer membership, tags, or other heuristics.

`discipline_category` is an application-enforced taxonomy field (the DB requires only `TEXT NOT NULL`). Canonical top-level families are `net`, `freestyle`, `golf`, and `sideline` (legacy `other` values should be normalized to `sideline`). Variant/sub-discipline structure is managed in application logic, e.g., sideline-family formats such as 2-square, 4-square, consecutives, and one-pass, plus multiple freestyle and net variants.

`team_type` encodes the participation format for each discipline: `'singles'` (default), `'doubles'`, or `'mixed_doubles'`. Used at registration time to enforce partner requirements: doubles requires partner info; mixed doubles additionally requires that both member partners have `members.gender` set to opposite binary values (`'male'` and `'female'`); an `'undisclosed'` value is ineligible.

#### Event status lifecycle (application-managed)
```
draft → published → registration_full | closed → completed | canceled
```

#### Sanction status (application-managed)
```
none → pending → approved | rejected
```

#### Payment state
`payment_enabled` is set by an admin; `competitor_fee_cents` and `attendee_fee_cents` are nullable (free events).

The US uses the term "completed" for a succeeded one-time payment. The schema uses `'succeeded'` to align with Stripe's `payment_intent` vocabulary. See §4.10.

### 4.4 Active Player Vouches

**Table:** `active_player_vouches`

Append-only ledger of vouch actions taken by Tier 2 or Tier 3 members for Tier 0 members. A vouch grants or extends Active Player status only; it never changes membership tier. Vouches against Tier 1, Tier 2, or Tier 3 targets are a no-op at the application layer and must not produce a row here.

When a vouch has effect, the resulting Active Player ledger row in `active_player_grants` carries `related_vouch_id` pointing back to this row. The `ux_active_player_grants_vouch_once` partial unique index ensures at most one grant row per vouch action.

#### DB-enforced structural constraints
- `CHECK (voucher_member_id <> target_member_id)` prevents a structurally malformed self-vouch row.
- Append-only triggers `trg_active_player_vouches_no_update` and `trg_active_player_vouches_no_delete` block all UPDATE and DELETE.

#### Application responsibilities (app-enforced values/workflow)
- Verify the voucher's effective tier is Tier 2 or Tier 3 before writing a row.
- Verify the target's effective tier is Tier 0 before writing the resulting `active_player_grants` row; for Tier 1+ targets, surface the no-op UI message and do not write a row.
- Apply the no-shorten rule: an older vouch must not shorten an existing later Active Player expiry date.
- Enforce per-voucher rate limiting using `vouch_rate_limit_max_per_hour` and `vouch_rate_limit_window_minutes` from `system_config_current`.
- Audit-log every vouch action and resulting Active Player state change with the reason code `tier2_vouch_active_player`.

### 4.5 Votes & Elections

**Tables:** `votes`, `vote_options`, `vote_eligibility_snapshot`, `ballots`, `vote_results`, `vote_result_option_totals`

#### Eligibility snapshot
`vote_eligibility_snapshot` is written once at vote-open time. UPDATE and DELETE are blocked by DB triggers. Tier expiry during an open vote does not revoke eligibility.

#### Ballots
`ballots` stores encrypted ballots. UPDATE and DELETE are blocked by triggers.

**Ballot encryption (per-ballot AES-256-GCM envelope encryption):** For each ballot submission, the server requests a fresh data key from AWS KMS (`GenerateDataKey`). The ballot payload is encrypted using AES-256-GCM with that key. The following fields are persisted together:
- `encrypted_ballot_b64`; AES-256-GCM ciphertext (base64)
- `ballot_nonce_b64`; AES-GCM nonce/IV (base64); required for decryption
- `ballot_auth_tag_b64`; AES-GCM authentication tag (base64); required for integrity verification
- `encrypted_data_key_b64`; KMS-encrypted data key (base64); decryptable only with the privileged tally role
- `kms_key_id`; KMS CMK identifier

The plaintext data key is never persisted. Decryption is available only during controlled tally operations using a separate IAM role with `kms:Decrypt` permission.

**Participation metadata (intentional, non-anonymous design):** `voter_member_id` is stored as plaintext alongside the encrypted ballot. `ballots` is **not** anonymous-ballot storage. Voter identity (participation fact) is co-located with the encrypted ballot by design. Ballot **content** confidentiality is provided by AES-256-GCM encryption; the participation fact (who voted) is not hidden.

**Receipt tokens:** stored as hashes (`receipt_token_hash`); plaintext tokens are transient and must be scrubbed from `outbox_emails.body_text` after delivery (see APP-019).

**Tally authorization (app-enforced):** Ballot decryption and tally operations must require an authorization check equivalent to a `can_tally_votes` permission. This is enforced in the application auth layer; no schema column models this permission (see APP-023). All decryption operations must be audit-logged.

#### Vote results
`vote_results` holds the tally outcome per vote. `vote_result_option_totals` provides normalized per-option counts. In addition, `result_json` (TEXT, nullable) allows the application to store the full tally result as a single JSON blob per vote. Both representations may coexist; the application is responsible for keeping them consistent if both are populated.

#### Vote window ordering (DB-enforced)
`votes` carries three table-level `CHECK` constraints that protect election integrity:
- `vote_open_at < vote_close_at`; always required.
- `nomination_open_at < nomination_close_at`; when both are non-NULL.
- `nomination_close_at <= vote_open_at`; when nomination phase is used.

These are DB-enforced because multiple admin paths can write `votes` and the invariants are critical for correct ballot acceptance windows.

#### Vote options lock (DB-enforced)
Once a vote reaches status `open`, `closed`, `published`, or `canceled`, the triggers `trg_vote_options_lock_insert`, `trg_vote_options_lock_update`, and `trg_vote_options_lock_delete` block all mutations to `vote_options` for that vote. This prevents retroactive option changes from corrupting already-cast ballots.

#### Vote options visibility
`options_visible_at` in `votes`: when set, vote options are visible from this timestamp. The application enforces `options_visible_at <= vote_open_at` (US §3.7 requirement for admin-configurable early option visibility).

### 4.6 Hall of Fame

**Tables:** `hof_nominations`, `hof_affidavits`

`hof_nominations.vote_id` links a nomination window to the HoF election vote. NULL for legacy/pre-platform nominations. `UNIQUE(nomination_year, nominee_member_id)` prevents duplicate nominations per year.

#### Nominee snapshot fields
`nominee_snapshot_name` (TEXT NOT NULL) and `nominee_snapshot_contact` (TEXT, nullable) capture the nominee's name and contact information **at submission time**. The nominee is identified by `nominee_member_id` FK, but platform member data can change or be GDPR-purged after a nomination is submitted. Snapshot fields ensure HoF records remain complete and human-readable regardless of later member data changes.

- **New nominations:** populate both fields from the member's current `real_name` and contact info at the time of form submission.
- **Legacy/migration rows:** populate `nominee_snapshot_name` from the member record at import time; `nominee_snapshot_contact` may be NULL if no contact data is available.

`idx_hof_nominations_nominee ON hof_nominations(nominee_member_id)` supports "has this member been nominated" lookups (a documented service pattern).

Affidavits are one-per-nomination (`UNIQUE` on `nomination_id`).

### 4.7 News

**Table:** `news_items`

News items are hard-deleted immediately on admin action (US `A_Moderate_News_Item`; DD §2.3). No soft-delete grace period applies.

News items are auto-generated as side effects of primary entity flows (event published, results posted, club created, HoF/BAP status granted, vote results published). Admins can also create manual announcements.

`news_type` values map to triggering events:

| Value | Triggering action |
|-------|------------------|
| `event_published` | Event reaches published status |
| `event_results` | Results uploaded for a completed event |
| `club_created` | New club created on the platform |
| `club_archived` | Admin archives a club (`A_Archive_Club`) |
| `member_honor` | HoF induction, BAP award, or board appointment |
| `vote_results` | Election/vote results published |
| `announcement` | Admin-authored manual announcement |
| `system` | System-generated operational notice |

### 4.8 Mailing Lists & Email

**Tables:** `mailing_lists`, `outbox_emails`, `email_archives`, `email_templates`  
**Views:** `email_templates_enabled`

#### Outbox pattern
All emails are written to `outbox_emails` first; a background worker sends them and updates `status`. The admin Pause Sending toggle prevents new sends without losing queued items.

`idempotency_key` prevents duplicate sends when the same outbox row is retried.

At least one of `recipient_email`, `recipient_member_id`, or `mailing_list_id` must be non-NULL (enforced by a `CHECK` constraint).

#### Voting receipt tokens
`body_text` for voting confirmation emails contains a plaintext receipt token. The sender worker **must** scrub `body_text` after successful delivery while retaining the ballot row's `receipt_token_hash`. See APP-019.

#### Email archives
`email_archives` stores a record of bulk sends (mailing list blasts, event participant emails, announcements). `CHECK` constraints enforce that mailing-list sends reference a list and event-participant sends reference an event.

#### Email templates
`email_templates` stores admin-editable subject and body templates keyed by `template_key`. The `email_templates_enabled` view exposes only templates where `is_enabled = 1`. Setting `is_enabled = 0` suppresses the corresponding automated email type without deleting the content.

#### Mailing list column
`mailing_lists.is_member_manageable` controls whether members can self-subscribe/unsubscribe. Seven core lists are seeded at initialization; see §4.23.

### 4.9 Admin Operations

**Tables:** `work_queue_items`, `system_config`, `audit_entries`, `erasure_log`, `system_job_runs`, `system_alarm_events`  
**Views:** `system_config_current`

#### Work queue
Admin task queue with `queue_category` and `task_type`. Active `task_type` values include `member_contact_request` (member-submitted IFPA-admin contact requests under `queue_category='membership'`; see `M_Contact_IFPA_Admin` and `A_Resolve_Contact_IFPA_Admin_Request`). When any task is added, the application sends a notification to the admin-alerts mailing list containing task type and entity ID only (no sensitive data).

#### System config
`system_config` is an append-only effective-dated key-value store. Each row represents the value of a config key from a given `effective_start_at` forward. The current effective value per key is provided by the `system_config_current` view (latest row with `effective_start_at <= now`). Changing a config value means inserting a new row; old rows are immutable (UPDATE and DELETE blocked by triggers).

`system_config_current` is the authoritative read surface for all runtime config lookups. All background jobs and application code MUST use this view for config reads; never query `system_config` directly unless building admin history UIs or audit reports.

Config values are admin-configurable. All numeric limits and time windows in the system are stored here rather than being hardcoded (US §1 Global Behaviors). Background jobs and application code read their thresholds from `system_config_current` at runtime; missing keys will cause runtime errors. See §4.23 for the full list of seeded defaults.

`changed_by_member_id` is a typed FK to `members` (not free-form text). System-seeded rows at initialization use NULL for this field with a documented `reason_text` explaining the system origin.

#### Audit log
`audit_entries` is an append-only, privacy-safe ledger. IP addresses and user-agent strings are **never** stored. UPDATE and DELETE are blocked by DB triggers; rows are permanent. Actor context uses `actor_type` + `actor_member_id` (NULL for system actors).

**`action_type` catalog.** The `action_type` column is application-controlled (no CHECK enum). The naming convention is dotted `domain.event` (e.g. `auth.register`, `payment.succeeded`); a small set of earlier names without the dot are grandfathered as-is because renaming shipped events would orphan their existing audit rows. The convention binds every new event.

Emitted values, grouped by namespace:

- **`auth.*`**: `register`, `register_rate_limited`, `register_notification_failed`, `email_verified`, `login_rate_limited`, `password_change`, `password_change_notification_failed`, `password_reset`, `password_reset_notification_failed`.
- **`claim.*`**: `legacy_account` (legacy-account claim completed), `historical_person` (direct historical-record claim completed).
- **`legacy.*`**: `auto_link_silent_claim`, `auto_link_confirmed`, `auto_link_revert`, `auto_link_notification_failed`, `claim_initiate_notification_failed`.
- **`wizard.*`**: `start`, `task.detour_paused`, `club_affiliations.confirmed`, `club_affiliations.declined`, `club_affiliations.promoted`.
- **`club.*`**: `created`, `member_joined`, `member_left`, `primary_swapped`, `marked_inactive`, `leader_stepped_down`, `hashtag_updated`, `active_player_grant_failed`.
- **`tier.*`**: `purchase_grant`, `legacy_claim_grant`, `governance_set`, `governance_removed`, `auto_link_revert`, `admin_override`.
- **`payment.*`**: `checkout_started`, `succeeded`, `failed`, `refunded`, `canceled`.
- **`active_player.*`**: `grant`, `expire`, `end`, `vouch_noop`, `club_join_noop`, `attendance_noop`.
- **`support.*`**: `contact_request_submitted`, `contact_request_resolved`, `contact_request_resolve_notification_failed`.
- **`roster.*`**: `list`, `summary`, `export`.
- **`member.*`**: `profile_updated`, `pii_purged`, `deceased_pii_scrubbed`, `pii_erasure_failed`.
- **`admin.club_cleanup.*`**: parameterized by the cleanup action taken.
- **Grandfathered (no namespace)**: `onboarding_task_started`, `onboarding_task_skipped`, `onboarding_task_completed`, `onboarding_task_not_applicable`, `upload_member_media`, `upload_curated_media`, `edit_member_media`, `upload_curated_url_reference`, `grant_admin_bootstrap`, `grant_admin_dev_seed`, `grant_admin_dev_register_allowlist`, `dev_admin_invariant_repair`, `dev_persona_seed`, `dev_switch_persona`.

Reserved names for designed surfaces that do not emit yet (account lifecycle, voting and recognition, content moderation) follow the same convention when they land: `auth.account_deleted`, `auth.account_restored`, `member.deceased_marked`, `member.deceased_reverted`, `vote.cast`, `vote.eligibility_snapshot_taken`, `vote.ballot_tallied`, `hof.nomination_submitted`, `hof.affidavit_submitted`, `media.flagged`, `media.deleted`.

This list is the authoritative inventory; new action_types must be added here as part of any code change that introduces a new event type, and the corresponding service entry in `SERVICE_CATALOG.md` must declare its audit emissions.

#### Erasure log
`erasure_log` is an append-only ledger of applied PII erasures (UPDATE and DELETE blocked by DB triggers). Each row records one erasure shape applied to one entity: `erasure_kind` is `account_pii_purge` (full anonymization of a deleted account) or `deceased_contact_scrub` (contact-only erasure of a deceased member's record). The ledger serves two purposes. First, any restore from backup re-applies it before restored data becomes reachable, so an erasure cannot be silently undone by routine recovery (DD §1.2). Second, it is the authority on which erasure shapes a member row has received, since both shapes must set `personal_data_purged_at` to satisfy the members credential CHECK; a contact-scrubbed row can still receive the full purge, and a fully purged row receives nothing further.

#### Alarms
`system_alarm_events` tracks infrastructure and operational alarms. `acknowledgment_note` is set alongside `acknowledged_at` when an admin acknowledges an alarm.

### 4.10 Payments

**Tables:** `stripe_events`, `recurring_donation_subscriptions`, `recurring_donation_subscription_transitions`, `payments`, `payment_status_transitions`, `reconciliation_issues`  
**Views:** `recurring_donation_subscriptions_active`

#### Two payment models (US §1 Global Behaviors)

**One-time payments** (membership dues, event registrations, one-time donations): keyed by Stripe `payment_intent_id`.

```
State machine (DB-enforced by trg_payments_status_monotonicity):
  pending → succeeded | failed | canceled
  succeeded → refunded
```

Same-status no-ops are allowed (idempotent webhook redelivery). No backward transitions.

> **Vocabulary note:** The US uses the term "completed" for a successfully processed one-time payment. This schema uses `'succeeded'` to align with Stripe's `payment_intent` status vocabulary and avoid ambiguity with the event `status` value `'completed'`. This is an intentional deviation from US terminology, documented here.

**Recurring donations** (Stripe Subscriptions): keyed by `stripe_subscription_id` + `stripe_invoice_id`. State management is application-enforced (see APP-005); the DB does not restrict subscription status transitions.

#### Stripe timestamp fields
`stripe_events.stripe_created` and `payments.last_stripe_event_created` are stored as **ISO-8601 UTC TEXT** (consistent with the schema's universal timestamp convention). Stripe delivers these as Unix epoch integers; the application must convert at write time:

```sql
strftime('%Y-%m-%dT%H:%M:%fZ', stripe_event.created, 'unixepoch')
```

#### Stripe event deduplication
`stripe_events` deduplicates all incoming webhook events by `event_id` (Stripe's globally unique event ID), regardless of payment model. On successful processing, `processing_status = 'processed'`; on failure, `processing_status = 'failed'`. The `attempts` column tracks the total number of processing attempts for the event (incremented on each retry, default 1). `last_error` stores the most recent error message for failed attempts. These fields support observability and reconciliation workflows.

#### Recurring subscriptions view
- `recurring_donation_subscriptions_active`: `WHERE status <> 'canceled'`. Use for active-subscription queries.
- Query the bare `recurring_donation_subscriptions` table directly when canceled subscriptions are relevant (e.g., reactivation, reporting).

#### Subscription lifecycle event codes (controlled vocabulary)
`lifecycle_event_code` values in `recurring_donation_subscription_transitions`:

| Code | Meaning |
|------|---------|
| `activated` | Subscription created and active |
| `charge_succeeded` | Billing cycle payment succeeded |
| `charge_failed` | Billing cycle payment failed |
| `cancel_requested` | Member or admin requested cancellation |
| `canceled` | Stripe confirmed cancellation |
| `updated` | Amount or interval changed |

#### Payment dual-write (APP-003, APP-004)
Every `payments.status` change **must** be paired with a `payment_status_transitions` INSERT in the same transaction. The DB does not enforce this pairing; the application must.

#### Reconciliation issues
`expires_at` is set at INSERT using the `reconciliation_expiry_days` config key: `strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+' || reconciliation_expiry_days || ' days')`. The cleanup job deletes rows WHERE `expires_at <= now AND status = 'resolved'`.

### 4.11 System Configuration & Pricing

**Table:** `system_config`  
**View:** `system_config_current`

Membership pricing is stored as config keys in the same `system_config` table as all operational parameters:
- `tier1_price_cents` (integer cents, e.g., `1000` = $10.00 USD)
- `tier2_price_cents` (integer cents, e.g., `5000` = $50.00 USD)

Values are stored in integer cents for consistency with payment tables. UI layers convert to USD for display.

Like all config values, pricing is changed by inserting a new row with a new `effective_start_at`. Past rows are immutable. The history of all price changes is directly queryable from `system_config` filtered by pricing keys. There are no separate pricing tables.

Price changes are audit-logged via `audit_entries` with `category = 'pricing'` and old/new values in `metadata_json`.

### 4.12 Member Tier Grants

**Table:** `member_tier_grants`

Append-only ledger of lifetime membership tier changes only. UPDATE and DELETE are blocked by DB triggers. This ledger MUST NOT carry Active Player, event-attendance, vouch, or club-join provenance; those write to `active_player_grants` (§4.13a) instead.

#### `change_type` values

| Value | Meaning |
|-------|---------|
| `grant` | New lifetime tier awarded (purchase, HoF/BAP induction, legacy claim) |
| `revoke` | Lifetime tier removed by admin (does not run on refund; see APP-006) |
| `correct` | Admin correction of an erroneous prior row |
| `governance_set` | Tier 3 governance status assigned; `new_underlying_tier_status` records the lifetime tier the member returns to when governance ends |
| `governance_removed` | Tier 3 governance status removed; `new_tier_status` reverts to `old_underlying_tier_status` (which must be set on this row) |

> **No `extend` or `expire`:** membership tiers do not expire under the current IFPA rules (US §1.2). All temporary lifecycle behavior lives in `active_player_grants` (§4.13a).

#### `reason_code` vocabulary (extensible, no DB CHECK)

| Code | Meaning |
|------|---------|
| `purchase.tier1` | Tier 1 IFPA Member purchase |
| `purchase.tier2` | Tier 2 IFPA Organizer Member purchase |
| `honor.hof_tier2_grant` | Hall of Fame induction grants Tier 2 |
| `honor.bap_tier2_grant` | Big Add Posse induction grants Tier 2 |
| `governance.tier3_set` | Tier 3 governance assigned |
| `governance.tier3_removed` | Tier 3 governance removed (reverts to underlying tier) |
| `admin.override` | Admin manual change (correction or exceptional remediation) |
| `admin.correction` | Admin correction of a prior data error |
| `legacy.claim_tier_grant` | Legacy migration claim resolved to a tier assignment |

#### Underlying tier (Tier 3 reversion)

`old_underlying_tier_status` and `new_underlying_tier_status` capture the lifetime membership tier a Tier 3 governance member returns to when governance ends. Underlying tier is restricted to `tier1` or `tier2` (DB-enforced CHECK). Tier 0 is never an underlying tier: a Tier 0 member who is granted Tier 3 has their underlying tier set to `tier1`, never reverts to Tier 0.

#### Source linkage

The only source FK retained is `related_payment_id` (purchase-origin grants). Vouch, event, and club provenance live exclusively on `active_player_grants`.

| Pattern | Pathway |
|---------|---------|
| `related_payment_id IS NOT NULL` | Purchase-origin (Tier 1 or Tier 2 buy) |
| `related_payment_id IS NULL` | HoF/BAP grant, governance change, admin action, or legacy claim |

#### DB-enforced structural constraints
- `CHECK` on `change_type IN ('grant','revoke','correct','governance_set','governance_removed')`.
- `CHECK` on `new_tier_status IN ('tier0','tier1','tier2','tier3')`.
- `CHECK` on `old_underlying_tier_status` and `new_underlying_tier_status`: NULL or `'tier1'`/`'tier2'`.
- `CHECK` requiring `new_underlying_tier_status NOT NULL` on `governance_set` rows.
- `CHECK` requiring `old_underlying_tier_status NOT NULL` on `governance_removed` rows.
- Append-only triggers `trg_tier_grants_no_update` and `trg_tier_grants_no_delete` block all UPDATE and DELETE.

#### Refund policy

A refund does NOT trigger a `revoke` row. Per APP-006, completed payments are not retroactively altered: the service writes a `payment_status_transitions` row on refund and leaves the lifetime tier untouched. Membership tier persists across refunds.

#### Application responsibilities (APP-016; app-enforced values/workflow)
- Write a single ledger row per real tier change. Use `purchase.tier1` / `purchase.tier2` for buys, `honor.hof_tier2_grant` / `honor.bap_tier2_grant` for HoF/BAP inductions, `governance.tier3_set` / `governance.tier3_removed` for board flag transitions, `admin.override` or `admin.correction` for admin actions, and `legacy.claim_tier_grant` for legacy claim resolutions.
- Set `new_underlying_tier_status` on every `governance_set` row: Tier 0 → Tier 3 sets it to `tier1`; Tier 1 → Tier 3 sets it to `tier1`; Tier 2/HoF/BAP → Tier 3 sets it to `tier2`. The DB CHECK enforces NOT NULL; the app enforces the value mapping.
- Set `old_underlying_tier_status` on every `governance_removed` row to the underlying tier from the prior `governance_set` row, and set `new_tier_status` to that same underlying value.
- When a Tier 0 Active Player buys Tier 1 or Tier 2, write a `member_tier_grants` row AND an `active_player_grants` row with `change_type = 'end'` and `reason_code = 'membership_upgrade_ended_active_player'` in the same transaction.
- When a Tier 0 Active Player becomes Tier 3, write a `governance_set` row with `new_underlying_tier_status = 'tier1'` AND an `active_player_grants` row with `change_type = 'end'` and `reason_code = 'tier3_grant_ended_active_player'` in the same transaction.
- Audit-log every tier change with old/new values, actor, and reason.

### 4.13 Member Tier Current View

**View:** `member_tier_current`

Derives the current lifetime membership tier for each member from the latest snapshot row in `member_tier_grants`. This is the authoritative read model for membership tier data. Active Player status is a separate concept tracked by `member_active_player_current` (§4.13b).

`member_tier_current` includes a row for every member. Members with no tier ledger entries (including brand-new registrations) are returned with `tier_status = 'tier0'` and `underlying_tier_status = NULL`.

#### Output columns
| Column | Type | Meaning |
|--------|------|---------|
| `member_id` | TEXT | Member primary key |
| `tier_status` | TEXT | One of `'tier0'`, `'tier1'`, `'tier2'`, `'tier3'` |
| `underlying_tier_status` | TEXT | For Tier 3 governance members, the lifetime tier they revert to when governance ends. NULL otherwise. |

#### Tier permanence

Membership tiers do not expire. There is no in-view expiry logic, no purchase-history overlay, and no fallback safety net. The latest ledger row's `new_tier_status` is authoritative.

### 4.13a Active Player Grants

**Table:** `active_player_grants`

Append-only ledger of Active Player lifecycle changes for Tier 0 members. Active Player is a temporary status that gives a Tier 0 member Tier 1 benefits while current. It does not change membership tier. UPDATE and DELETE are blocked by DB triggers.

#### `change_type` values

| Value | Meaning |
|-------|---------|
| `grant` | New Active Player period from event attendance, vouch, or one-time club-join grant |
| `extend` | Active Player extended by a later qualifying source (no-shorten rule applies) |
| `expire` | Daily expiry job marks Active Player expired |
| `end` | Active Player ended because the member became Tier 1, Tier 2, or Tier 3 |
| `correct` | Admin correction of a prior Active Player row |

#### `reason_code` vocabulary (extensible, no DB CHECK)

| Code | Meaning |
|------|---------|
| `official_event_attendance` | Marked-attended at an officially registered event |
| `tier2_vouch_active_player` | Tier 2 or Tier 3 vouch grant or extension |
| `club_join_one_time_active_player_grant` | First-club-join one-time grant for never-AP Tier 0 |
| `active_player_expired` | `SYS_Check_Active_Player_Expiry` expiry write |
| `membership_upgrade_ended_active_player` | Buyer reached Tier 1 or Tier 2; AP ends |
| `tier3_grant_ended_active_player` | Tier 0 AP became Tier 3; AP ends |
| `admin.override` | Admin manual grant or change |
| `admin.correction` | Admin correction of a prior data error |

#### Source linkage

All source FK columns are nullable. At most one of `related_registration_id`, `related_club_affiliation_id`, `related_vouch_id` may be non-NULL on any given row (DB-enforced CHECK). `related_event_id` may accompany `related_registration_id` for convenience and reporting; `related_registration_id` is the primary attendance provenance.

| Source FK | Used by reason code |
|-----------|---------------------|
| `related_registration_id` | `official_event_attendance` |
| `related_vouch_id` | `tier2_vouch_active_player` |
| `related_club_affiliation_id`, `related_club_id` | `club_join_one_time_active_player_grant` |

#### DB-enforced structural constraints
- `CHECK` on `change_type IN ('grant','extend','expire','end','correct')`.
- Provenance CHECK: at most one of registration / club-affiliation / vouch may be non-NULL.
- Append-only triggers `trg_active_player_grants_no_update` and `trg_active_player_grants_no_delete`.
- `ux_active_player_grants_registration_once`: one `official_event_attendance` row per registration.
- `ux_active_player_grants_vouch_once`: one row per vouch action.
- `ux_active_player_club_join_once`: one `club_join_one_time_active_player_grant` row per member (lifetime).

#### Application responsibilities
- Apply the no-shorten rule on every grant or extend: an older qualifying source must not write a row whose `new_active_player_expires_at` is earlier than the existing latest expiry. Compare against the latest row before inserting.
- For the one-time club-join grant, verify the member has never previously been Active Player (no prior grant rows of any kind under any reason code), not merely that they have not previously used the club-grant index. The unique index is the last-line safety net; the service is the primary control.
- Treat vouches against Tier 1, Tier 2, or Tier 3 targets as no-ops: do not write a row to `active_player_grants` and surface the no-op UI message to the voucher.
- When a Tier 0 Active Player member transitions to Tier 1, Tier 2, or Tier 3, write an `end` row in the same transaction as the `member_tier_grants` write (see §4.12 application responsibilities).
- Audit-log every grant, extend, expire, and end action.

### 4.13b Active Player Current View

**View:** `member_active_player_current`

Derives the current Active Player state for each member from the latest snapshot row in `active_player_grants`, gated on the member's current membership tier. Active Player applies only to Tier 0 members; for Tier 1+ members this view returns `is_active_player = 0` regardless of stored AP rows.

#### Output columns
| Column | Type | Meaning |
|--------|------|---------|
| `member_id` | TEXT | Member primary key |
| `is_active_player` | INTEGER | `1` iff `tier_status = 'tier0'` AND latest AP expiry is in the future |
| `active_player_expires_at` | TEXT | Latest AP expiry timestamp for Tier 0 members; NULL for Tier 1+ |
| `latest_active_player_reason_code` | TEXT | Reason code from the latest AP ledger row (informational) |

The view masks AP fields for Tier 1+ members. If a member is downgraded from Tier 1+ back to Tier 0 by admin correction, prior AP ledger rows resurface only if the recorded expiry timestamp remains in the future.

### 4.13c Membership Status Current View

**View:** `member_membership_status_current`

Combined authorization and read model. Single source of truth for the two application gates the platform cares about:

| Column | Predicate |
|--------|-----------|
| `has_tier1_benefits` | Tier 1 / Tier 2 / Tier 3 OR (Tier 0 AND `is_active_player = 1`) |
| `is_official_roster_member` | Tier 1 / Tier 2 / Tier 3 OR (Tier 0 AND `is_active_player = 1`) |

> **Two columns, identical predicate:** under current IFPA rules these two predicates evaluate to the same value. They are retained as separate columns because user stories distinguish "Tier 1 benefits" (feature-gate shorthand) from "Official IFPA Roster" (governance and reporting set), and a future rule revision may diverge them. Do not collapse them into a single column.

Other output columns: `member_id`, `tier_status`, `underlying_tier_status`, `is_active_player`, `active_player_expires_at`.

This view is the canonical join target for any feature gate or roster check. Do not reimplement the predicate inline at the call site.

### 4.13d Official IFPA Roster Current View

**View:** `official_ifpa_roster_current`

Operational roster surface for `A_View_Official_Roster_Reports`. Joins `members_active` with `member_membership_status_current` and applies two filters:

- `is_official_roster_member = 1`
- `is_deceased = 0`

#### Output columns
`member_id`, `display_name`, `city`, `region`, `country`, `tier_status`, `underlying_tier_status`, `is_active_player`, `active_player_expires_at`, `is_hof`, `is_bap`, `is_board`.

#### Access policy

The Official IFPA Roster is not public. Service-layer access is restricted to admins and admin-provisioned Tier 2 / Tier 3 organizers per US `A_View_Official_Roster_Reports`. All access and exports must be audit-logged via `audit_entries`. There is no dedicated table for tracking admin-provisioned access; admin-provisioned access is recorded directly in `audit_entries` with category `roster_access` and the actor / target / purpose captured in `metadata_json`.

#### Deceased exclusion rationale

Deceased members are excluded from this operational roster because US `A_Mark_Member_Deceased` removes deceased accounts from active member search and club rosters. HoF and BAP visibility for deceased members on profile and historical surfaces is preserved separately at the profile rendering layer; this operational roster is not the home for memorial visibility.

### 4.14 Members & Authentication

**Table:** `members`  
**Views:** `members_active` (non-deleted), `members_all` (all including deleted), `members_searchable`

#### Gender field

`gender` (`TEXT`, nullable, `CHECK (gender IN ('male','female','undisclosed'))`): member's competition-eligibility gender. Collected in the onboarding wizard's `personal_details` step alongside date of birth, defaulting to `'undisclosed'` (UI: Male / Female / Prefer not to say; stored `'male'` / `'female'` / `'undisclosed'`) and editable on profile edit; the column stays nullable to accommodate the system-member row and imported/legacy accounts. Owner-and-admin by default; a member may opt in via `show_gender` to make it visible to authenticated members on the profile, in member search, and on club rosters, but it is never shown to an unauthenticated visitor and only `'male'` / `'female'` render (`'undisclosed'` publishes nothing) (see DATA_GOVERNANCE §3). Gender-gated event categories require a declared value: mixed doubles requires one `'male'` and one `'female'` partner, Women's net requires `'female'`; `'undisclosed'` is ineligible for gender-gated categories but eligible for Open. Validation is application-enforced at discipline-selection time (see APP-013).

#### Authentication columns
- `password_version`: **session/JWT invalidation counter**. Increment on every password reset or change. All JWTs containing an older value are immediately invalid. Do not use for hash algorithm tracking.
- `password_hash_version`: hash algorithm version only. Increment when the hashing algorithm changes. Do not use for session invalidation.

#### Hall of Fame nomination / induction tracking

`hof_last_nominated_year` (`INTEGER`, nullable) stores the **most recent** Hall of Fame nomination year for the member. This preserves useful history across annual rollover/carryover cases without storing a full nomination-year list.

`hof_inducted_year` (`INTEGER`, nullable) stores the Hall of Fame induction year for members with the permanent `is_hof` badge.

`is_hof` remains the permanent Hall of Fame honor flag. Any current-cycle authorization/workflow flag equivalent to `HoF_Nominated` is application-derived from `hof_last_nominated_year` and the active nomination cycle year (US §2.1 / US §3.7).

#### Competition history

- `first_competition_year` (`INTEGER`, nullable): the member's first competition year. Editable on profile edit and wizard personal-details task. Pre-populated from `historical_persons.first_year` during legacy claim via COALESCE (member value wins if already set).
- `show_first_competition_year` (`INTEGER`, default 0): opt-in toggle controlling whether "Competing since {year}" appears on the member's public profile. Default 0 means legacy imports and HP-claim transfers do not auto-show the year; only explicit member action sets it to 1.
- `show_competitive_results` (`INTEGER`, default 1): controls whether competition results appear on the member's public profile. Own-profile view always shows results to the owner regardless of toggle state.
- `show_gender` (`INTEGER`, default 0): opt-in toggle controlling whether the member's `gender` is shown to authenticated members on the member profile, in member search, and on club rosters. Default 0 keeps gender owner-and-admin only; only explicit member action sets it to 1. Only `'male'` / `'female'` render when set.

#### Display name and slug

`display_name` and the derived slug are permanent post-registration. The `display_name` surname constraint (must share surname with `real_name`, suffix-stripped) is application-enforced at registration; imported `legacy_members` rows are exempt.

#### Stripe identity
`stripe_customer_id` is the member-level canonical Stripe Customer ID (set when a recurring donation is first created). `payments.stripe_customer_id` is a per-payment snapshot and is **not** the canonical ID.

#### Person-identity and legacy-account linkage

Two FK-style columns carry person-identity / legacy-account linkage:

- `historical_person_id` (`TEXT`, nullable, `REFERENCES historical_persons(person_id) ON DELETE NO ACTION`): direct FK to the archival historical-person identity this member claims. NULL = no HP claim. Set at claim time; either as a side effect of M_Claim_Legacy_Account (when the claimed legacy account has a matching HP) or as a direct HP claim (competitor with no legacy account claims their historical record). Partial UNIQUE index `ux_members_historical_person_id` enforces at most one live, non-purged member per HP.
- `legacy_member_id` (`TEXT`, nullable, `REFERENCES legacy_members(legacy_member_id) ON DELETE NO ACTION`): pointer into the old footbag.org user-account namespace; also the PK of `legacy_members` (§4.14b). Set at M_Claim_Legacy_Account time. Partial UNIQUE index `ux_members_legacy_id` enforces at most one member per legacy account.

`legacy_user_id` and `legacy_email` also remain as TEXT columns for backward compatibility with fields migrated into `members` at claim time; the canonical source for these is `legacy_members`. Post-claim, the member's row holds its own editable copy per `M_Claim_Legacy_Account` merge rules; the `legacy_members` row is preserved unchanged as the permanent archival record.

- `legacy_is_admin`; flag indicating the account held admin status on the legacy site. Retained for admin review and audit context only; never grants live admin privilege.
- `ifpa_join_date`, `birth_date`, `street_address`, `postal_code`; profile fields copied from `legacy_members` at claim time (COALESCE / fill-if-empty). The active member can subsequently edit them; the `legacy_members` copy remains immutable.

#### Credential-state invariant

The `members` table enforces a three-branch credential-state invariant via a `CHECK` constraint:

1. **Live non-system account**; `is_system=0`, `personal_data_purged_at IS NULL`, all credential fields (`login_email`, `login_email_normalized`, `password_hash`, `password_changed_at`) are non-NULL.
2. **Purged non-system row**; `is_system=0`, `personal_data_purged_at IS NOT NULL`, all credential fields are NULL.
3. **System member account**; `is_system=1`, `personal_data_purged_at IS NULL`, all credential fields are NULL. The system member is unauthenticatable by data shape (no email-lookup query can match) and is single-row enforced by a partial UNIQUE on `members(is_system) WHERE is_system=1`. See DD §2.8.

Imported legacy accounts live in `legacy_members` (§4.14b), not as placeholder rows in `members`.

#### PII purge (APP-022)

`login_email`, `login_email_normalized`, `password_hash`, and `password_changed_at` are nullable to support GDPR account purge.

**Anonymized-stub requirement (app-enforced):** When setting `personal_data_purged_at`, the application must produce a complete anonymized retained stub in the same transaction: clear all nullable contact fields (`phone`, `whatsapp`, `legacy_email`, `legacy_user_id`, `street_address`, `postal_code`, `birth_date`); clear both identity-linkage FK pointers (`legacy_member_id`, `historical_person_id`) so person-link dispatchers revert to archival URLs per DD §2.4 rule 5; and overwrite required non-null identity/location fields with anonymized placeholder values as needed to satisfy schema constraints. In the same transaction, clear the claim pointer on the member's `legacy_members` row (set `claimed_by_member_id` and `claimed_at` to NULL) so the legacy account becomes claimable again. Exception: for members with `is_hof = 1` or `is_bap = 1`, preserve `display_name` and `bio` per User Stories deletion policy; other required retained identity/location fields remain anonymized as needed. Schema nullability does not enforce the full anonymized-stub shape; this is application-enforced (see APP-022).

`ifpa_join_date` and `legacy_is_admin` may be retained post-purge as non-identifying administrative metadata.

Two erasure shapes set `personal_data_purged_at` (the credential CHECK requires it once credentials are NULL). The anonymized-stub requirement above describes the full account purge (`erasure_log` kind `account_pii_purge`). The deceased contact scrub (`deceased_contact_scrub`) clears credentials, contact channels (`phone`, `whatsapp`, `legacy_email`), private address lines (`street_address`, `postal_code`), and demographics (`gender`, `birth_date`) and deletes the member's declared anchors, while preserving identity, locale, honors, and both identity-linkage FKs; the legacy claim is not released. The `erasure_log` kind, not `personal_data_purged_at`, is the authority on which shapes a row has received; a contact-scrubbed row can still receive the full purge.

#### `avatar_media_id`
`ON DELETE SET NULL`: deleting a media item automatically detaches it as the member's avatar without requiring a before-delete trigger.

#### `members_searchable` view
**The member search endpoint MUST query this view.** It applies five exclusion conditions: soft-deleted, deceased, opted-out (`searchable = 0`), PII-purged, and unverified (`email_verified_at IS NULL`). The `email_verified_at IS NULL` condition is the primary mechanism preventing imported `legacy_members` rows from appearing in search results; `searchable = 0` is defense-in-depth. Do not add extra `WHERE` clauses on top of `members_active` or the bare `members` table for search.

`searchable = 1` means the member is **eligible for authenticated current-member lookup only**. It does not mean publicly discoverable, publicly contactable, or visible on public historical-person pages. Member search is authenticated Tier 0+, anti-enumeration, and never public.

### 4.14b Legacy Members

**Table:** `legacy_members`

Permanent archival table: one row per imported legacy account from the old footbag.org mirror and, going forward, the legacy data dump. Identified by `legacy_member_id` (PK); the old-site's user-account id, which is the external-namespace pointer also carried by `members.legacy_member_id` and `historical_persons.legacy_member_id`. See DD §2.4 for the three-entity identity model.

**Import population (source-validity filter).** Rows are loaded only for source-valid legacy accounts (`MemberValid > 0` in the source) plus exceptions pulled back by linkage (an otherwise-excluded row referenced by a published result, an honor, or a documented admin-recovery need); mechanically-obvious garbage and invalid rows, together with their PII, never enter this table. Pulled-back exceptions are recorded in import audit metadata. The filter and its counted/validated gate live in the MIGRATION_PLAN legacy-member import section.

#### Immutability and claim semantics

- Rows are **never deleted**. A `legacy_members` row is the permanent archival record of a legacy account's fields at import time.
- Rows are **never mutated post-import** for the legacy fields (real_name, display_name, bio, country, honor flags, etc.). Import sets these; nothing else writes them.
- **Claim marks, does not remove.** When a current member completes M_Claim_Legacy_Account, the application sets `claimed_by_member_id` (FK to `members(id)`) and `claimed_at`. The `legacy_members` row persists. `M_Claim_Legacy_Account` merge rules still govern what fields copy from `legacy_members` to `members` at claim time (COALESCE / OR-merge / fill-if-empty); the member then edits their own copy.
- **Unclaim on PII purge** (DD §2.4 rule 5): when a claiming member is purged, `claimed_by_member_id` and `claimed_at` are cleared (both NULL). The legacy account becomes claimable again.

#### Columns

- `legacy_member_id` (`TEXT`, PK): the old-site user-account id.
- `legacy_user_id`, `legacy_email`, `legacy_email2`, `legacy_email3`: migration metadata from the mirror/dump. A legacy account could hold up to three email addresses; all three participate in M_Claim_Legacy_Account matching. `legacy_email` (the primary) is used to deliver the one-time claim link; none is ever a login credential.
- Profile snapshot; `real_name`, `display_name`, `display_name_normalized`, `city`, `region`, `country`, `bio`, `birth_date`, `street_address`, `postal_code`, `ifpa_join_date`, `first_competition_year`.
- Honor flags; `is_hof`, `is_bap` (legacy-source honors; copied to members at claim per §8 OR-merge rule).
- `legacy_is_admin`; old-site admin flag. Retained for audit; never grants live admin privilege.
- Import audit; `import_source` ('mirror' | 'legacy_site_data' | NULL pre-integration), `imported_at`, `version`.
- Claim state; `claimed_by_member_id` (nullable FK to `members(id)` with `ON DELETE NO ACTION`), `claimed_at`. A CHECK constraint enforces the two-column invariant: both NULL (unclaimed) or both set (claimed).
- Gate-conditional columns, not present until their MIGRATION_PLAN §25 gates PASS at test load: `legacy_banned` (lands only if G3 PASSes; audit metadata only, never gates the claim card; MIGRATION_PLAN §15.5) and the five `legacy_*` tier-state fields (`legacy_ever_paid_tier2`, `legacy_ever_paid_tier1_lifetime`, `legacy_tier1_annual_active_at_cutover`, `legacy_was_board_at_cutover`, `legacy_board_underlying_paid_tier`; land only if G6 PASSes; MIGRATION_PLAN §15.16).

#### Indexes

- `ux_legacy_members_claimed_by`; partial UNIQUE on `claimed_by_member_id` where non-NULL. Enforces at most one current member per legacy account.
- `idx_legacy_members_legacy_email` / `idx_legacy_members_legacy_email2` / `idx_legacy_members_legacy_email3`; partial non-unique lookup indexes on the three email columns where non-NULL. Support M_Claim_Legacy_Account email matching. Non-unique because one address may be primary on one account and secondary on another; cross-account email uniqueness is enforced by the §25 G1 validation gate, not the DB.
- `ux_legacy_members_legacy_user_id`; partial UNIQUE on `legacy_user_id` where non-NULL. Supports M_Claim_Legacy_Account username lookup.

### 4.15 Member Links

**Table:** `member_links`

External profile URLs (e.g., personal website, social media). Maximum 3 per member (US §3.2 M_Edit_Profile).

**This limit is application-enforced** (see APP-008). The application must reject inserts and `member_id` reassignments that would exceed 3 rows per member.

URLs are validated by the application before insertion (must be `https`, well-formed, not targeting localhost/private addresses).

### 4.16 Registrations & Event Results

**Tables:** `registrations`, `registration_discipline_selections`, `event_results_uploads`, `event_result_entries`, `historical_persons`, `event_result_entry_participants`

#### Competitor registration completeness (APP-013)
Before a competitor registration reaches `status = 'confirmed'`, the application must ensure at least one `registration_discipline_selections` row exists for that registration.

#### Attendance as Active Player source

`registrations.attended_at` is the canonical event-attendance signal for Active Player grants and extensions. When an organizer marks a participant attended in `EO_View_Participants`, or when results upload auto-marks placing competitors in `EO_Upload_Results`, the service writes a row to `active_player_grants` (§4.13a) with `reason_code = 'official_event_attendance'` and `related_registration_id` set. The `ux_active_player_grants_registration_once` partial unique index ensures one Active Player grant per registration.

Attendance never changes membership tier. For Tier 1, Tier 2, or Tier 3 attendees, the service records `registrations.attended_at` but does not write an Active Player row.

#### Historical imported people

`historical_persons` stores imported read-only archival identity records sourced from event-data (competition results) and, going forward, mirror club-roster extraction. Rows are never deleted. A row may or may not correspond to a current `members` row and may or may not carry a `legacy_member_id` (populated only when the source data named the legacy account).

`historical_persons.is_deceased` (`INTEGER NOT NULL DEFAULT 0`) is an admin-settable, affirmative-only flag (its presence marks a person recognized as deceased; its absence asserts nothing). It is independent of `members.is_deceased`; `A_Mark_Member_Deceased` cascades to it when the member has a linked `historical_person_id`. It is consumed only to suppress the direct historical-record claim CTA (a living member cannot self-claim a deceased person's identity); no public memorial display is driven by it (deferred to a future story).

Three entity types form the identity model; see DD §2.4:

- `members`; credentialed accounts on this platform.
- `legacy_members` (§4.14b); imported legacy accounts from the old footbag.org site (mirror + legacy data dump).
- `historical_persons`; archival identity records of past participants.

Linkage is expressed via explicit FK pointers (not via shared-column derivation):

- `members.historical_person_id` → `historical_persons(person_id)` (§4.14): a current member claims their archival identity. Set at legacy-claim time when a matching HP exists, or as a direct HP claim for a competitor who had no legacy account.
- `members.legacy_member_id` → `legacy_members(legacy_member_id)` (§4.14, §4.14b): a current member claims an old-site user account.
- `historical_persons.legacy_member_id` → `legacy_members(legacy_member_id)`: archival provenance when the source data named the legacy account. Partial UNIQUE index `ux_historical_persons_legacy_member_id` enforces at most one archival person per legacy account.

Possible row combinations (all legitimate):

- `members` only; new registrant with no legacy account and no historical record.
- `legacy_members` only; imported legacy account that hasn't been claimed and wasn't linked to any historical person.
- `historical_persons` only; imported competitor whose legacy account (if any) isn't known.
- `members` + `historical_persons`; member who claims their archival identity directly (no legacy account).
- `members` + `legacy_members`; member who claims their legacy account; the legacy account had no historical-person link.
- `legacy_members` + `historical_persons`; imported legacy account linked to an archival record, not yet claimed.
- All three; member who claimed a legacy account that was already linked to a historical person.

**Governance note:** Imported `historical_persons` rows are public historical record surfaces only. They do not confer member-account status, searchability, or contactability. The imported aggregate fields (`event_count`, `placement_count`, freestyle metrics, etc.) are migration-era metadata; not automatic public statistics. Any aggregate field shown publicly must satisfy the historian-value and completeness/caveat requirements in `docs/DATA_GOVERNANCE.md`. When `members.historical_person_id` links a current member to a historical person, the historical public pages must continue to show only historical-record data; the link does not escalate the historical identity into a searchable or contactable current-member account.

#### Results
`event_result_entries.discipline_id` is nullable (NULL = discipline-agnostic / general ranking). `UNIQUE(event_id, discipline_id, placement)` prevents duplicate placements for discipline-specific rows. For general-ranking rows (`discipline_id IS NULL`), the partial unique index `ux_result_entries_general_placement` on `(event_id, placement) WHERE discipline_id IS NULL` prevents duplicates; required because SQLite treats `NULL` values as distinct in `UNIQUE` constraints.

#### Result participants and linkage semantics

`event_result_entry_participants.display_name` is the canonical always-renderable participant label for public results.

`event_result_entry_participants.member_id` remains the optional link to a current member row when known.

`event_result_entry_participants.historical_person_id` is the optional link to `historical_persons(person_id)` for imported historical identity when known.

For public rendering:
- always render `display_name`
- expose a participant link only when a supported historical-person-backed or member-backed detail target exists
- otherwise render plain text

#### Public-results clarification
The schema does not define a separate publish/unpublish state for event results. **Public results exist** in application logic only when both of the following are true:
1. the event itself is publicly visible under the public event-status rule, and
2. at least one `event_result_entries` row exists for that event.
If a future version introduces a distinct result-publication workflow, that behavior must be added explicitly to the schema and to the service/view contracts rather than inferred retroactively.

### 4.17 Media & Galleries

**Tables:** `media_items`, `member_galleries`, `member_gallery_tags`, `member_gallery_exclude_tags`, `gallery_external_links`

#### Hard-delete
Both `media_items` and `member_galleries` use **hard-delete only** (no `deleted_at`). Members own their content and can delete it immediately without leaving orphaned rows.

#### Referential cleanup (declarative FK actions)
When a media item is deleted:
- `members.avatar_media_id` → `SET NULL` (avatar detached, member row intact)
- `clubs.logo_media_id` → `SET NULL` (logo detached, club row intact)
- `media_flags` / `media_tags` → `CASCADE` delete (flags and tags removed with the media)

When a gallery is deleted:
- `member_gallery_tags` / `member_gallery_exclude_tags` → `CASCADE` (the gallery's criteria and exclude tag-link rows disappear with it)
- `gallery_external_links` → `CASCADE` delete

Member-uploaded media survives gallery deletion: galleries are saved-search bookmarks over the tag set, not content buckets, so a deleted gallery only loses its tag-link rows. The media itself remains reachable via any other gallery whose criteria still match (every member upload carries the uploader's `#by_<slug>` tag and so always remains in the owner's `#by_<slug>` view).

`media_flags.media_id ON DELETE CASCADE` and `media_tags.media_id ON DELETE CASCADE`: flags and tags are removed when their media is deleted.

`gallery_external_links.gallery_id ON DELETE CASCADE`: external link rows are removed when their gallery is deleted.

#### Video cap (APP-009)
Maximum 5 video embeds per named gallery (US §3.8 M_Organize_Media_Galleries). **Application-enforced.** The application must reject inserts and `gallery_id` reassignments that would exceed 5 `media_type = 'video'` rows per gallery.

#### Partial UNIQUE indexes
- `ux_media_avatar_per_member ON media_items(uploader_member_id) WHERE is_avatar = 1`: at most one avatar photo per member (DB-enforced).
- `ux_media_items_source_filename_per_uploader ON media_items(uploader_member_id, source_filename) WHERE source_filename IS NOT NULL AND moderation_status = 'active'`: among an uploader's active rows, source filename is unique (DB-enforced). System-member-owned rows are queried by source filename to resolve curator slots (landing-page demo loops, headline photos), since gallery membership tags are not unique identifiers.
- `ux_galleries_default_per_member ON member_galleries(owner_member_id) WHERE is_default = 1`: at most one default gallery per member (DB-enforced).

#### Avatar integrity CHECKs
- `CHECK (is_avatar = 0 OR media_type = 'photo')`: avatars must be photos (DB-enforced).
- Avatars (`is_avatar = 1`) carry exactly one `media_tags` row: the uploader marker `#by_<owner_slug>` (e.g., `#by_footbag_hacky` for the FH avatar). No `#curated`, no event/club/freeform tags. The marker is what surfaces the avatar in the owner's personal gallery via the same tag-AND match every other member upload uses; without it, avatars would be the only member-owned media that fails the personal-gallery query. Enforced by `avatarService.uploadAvatar` and `seed_fh_curator.py seed_item`; verified at smoke time by the avatar tag invariant in `scripts/ci/assert_loader_row_counts.py`.

#### Provenance and clip ranges (curator reference media)

Curator-uploaded reference media (videos/images attributed to the system-member account) shares `media_items` with member-uploaded content, distinguished by `uploader_member_id = system_member_id` and the auto-applied `#curated` tag. Three additional columns on `media_items` carry curator-specific metadata:

- `source_id TEXT NULL REFERENCES media_sources(source_id)`: provenance attribution (DVD title, channel name, creator). NULL for member uploads.
- `start_seconds INTEGER NULL`: optional clip start within the source video.
- `end_seconds INTEGER NULL`: optional clip end within the source video.

Beyond the curator-specific columns, `media_items.external_url TEXT NULL` plus `external_url_validated_at TEXT NULL` carry an optional user-supplied external link on every media item (admin curator + member uploads). Validated at the service boundary per DD §3.17.

**Table:** `media_sources`, provenance lookup. Columns: `source_id` (PK), `source_name`, `source_type` (e.g. `'dvd'`, `'website'`, `'youtube'`, `'vimeo'`), `url`, `creator`. `media_items.source_id ON DELETE NO ACTION` (sources are reference data, not deleted in normal flow).

Entity association is hashtag-driven via `media_tags`. An asset tagged `#curated #freestyle #trick #ripwalk` is the canonical trick reference media for the ripwalk trick. The trick page renders a gallery of all matching curator-tagged videos.

#### Named-gallery URL bookmarks (`member_gallery_tags`, `member_gallery_exclude_tags`)

A "named gallery" is a stable URL bookmark, not a content bucket. The `member_galleries` row provides the slug, name, description, owner, and item ordering (`sort_order`); the row itself does not carry a list of member IDs. Content membership is computed at request time by tag-AND match against `member_gallery_tags`, minus any item that carries a tag in `member_gallery_exclude_tags`.

**`member_galleries.sort_order`:** controls how items render on `/media/{gallery_id}`. Allowed values: `upload_desc` (default; newest upload first), `upload_asc` (oldest first), `caption_asc` (alphabetical by caption, used for ordered series whose captions encode the position with a zero-padded prefix). DB-enforced via `CHECK (sort_order IN (...))`.

**Table:** `member_gallery_tags(gallery_id, tag_id, created_at, created_by)` with composite primary key `(gallery_id, tag_id)`. `gallery_id ON DELETE CASCADE`: criteria rows disappear when the parent gallery is deleted. `tag_id ON DELETE NO ACTION`: tags are reference data shared with `media_tags`.

**Table:** `member_gallery_exclude_tags(gallery_id, tag_id, created_at, created_by)`, same shape and FK behaviour. Carries the gallery's exclude-tag set: items carrying any of these tags are filtered out even when they otherwise match every criteria tag.

**Semantics:** items appear in a named gallery iff they carry every tag linked via `member_gallery_tags` AND no tag linked via `member_gallery_exclude_tags`. Empty criteria → empty gallery. The same `tags` table backs both per-item tagging (`media_tags`) and per-gallery criteria/exclude sets, so a curator who tags media with `#freestyle` automatically affects every gallery whose criteria include `#freestyle`.

**Tag-only gallery membership:** named galleries do not own their content directly; `media_items` carries no gallery FK. Both curator URL-reference content and member uploads surface in a named gallery purely via tag-AND match against the gallery's `member_gallery_tags` set (minus any exclude match). One media item can appear in many galleries, and the same item is reachable through different galleries whose criteria match.

#### Curator video transcode jobs (`media_jobs`)

**Table:** `media_jobs`. Lifecycle row backing the asynchronous interactive admin video upload (DD §6.8 "Asynchronous orchestration"). The row records the full state machine of a single admin upload from sign-time through transcode-complete, plus the metadata captured on the form (caption, tags, source filename) so the worker can persist the resulting `media_items` row on success.

`kind`: discriminator. Only `'curator_video'` exists today; future variants share this table if other media paths move off the synchronous request chain.

`state`: state machine. Allowed values:
- `pending_upload`: row created at `/admin/curator/upload/sign`; the browser holds presigned PUT URLs and is uploading bytes to S3.
- `pending_transcode`: `/admin/curator/upload/finalize` confirmed both source keys exist and dispatched the job to the worker.
- `processing`: worker has claimed the row via optimistic UPDATE; ffmpeg is running.
- `succeeded`: worker wrote the corresponding `media_items` row, deleted pending sources, and recorded `media_id` on this row.
- `failed`: terminal after the configured max attempts; admin re-uploads to retry.
- `abandoned`: `pending_upload` row past its TTL (browser closed before `/finalize`).

`source_video_key`, `source_poster_key`: S3 object keys under the configured pending-upload prefix (`pending/<jobId>/source.{ext}` and `/poster.{ext}`). Both deleted by the worker on success; an S3 lifecycle rule expires anything under `pending/` after 24 hours as defense in depth.

`admin_member_id REFERENCES members(id)`: the admin who initiated the job. Used for owner-scoped status-page lookups (anti-enumeration: another admin's job appears as 404, same as a job that does not exist) and for the audit entry written on `succeeded`.

`media_id REFERENCES media_items(id) ON DELETE SET NULL`: populated when the job reaches `succeeded`. The FK action preserves the `media_jobs` audit trail if the resulting `media_items` row is later deleted.

`retry_count`, `last_error`: failure metadata. `retry_count` increments only on retryable failures; reaching the configured max transitions the job to `failed` (terminal).

`last_attempted_at`, `lease_expires_at`: dispatch lease. Set when the worker claims the row (state → `processing`). Boot-time recovery (`recoverOrphanedProcessingJobs`) compares `lease_expires_at` against the current time to distinguish a freshly-claimed row from one orphaned by a worker crash; orphaned rows are reset to `pending_transcode` for re-dispatch. This is the only sweep of this table; all other transitions are HTTP push events.

`expires_at`: TTL for `pending_upload` rows. Set at `/sign` so abandoned uploads can be reconciled to `abandoned`.

**CHECK constraints:**
- `state IN ('pending_upload','pending_transcode','processing','succeeded','failed','abandoned')`
- `state <> 'succeeded' OR media_id IS NOT NULL`; terminal-state safety: a succeeded row must point at the resulting media item.
- `kind IN ('curator_video')`

**Indexes:**
- `idx_media_jobs_state ON media_jobs(state, created_at)`; state-bucketed time-ordered listing for operator inspection.
- `idx_media_jobs_admin ON media_jobs(admin_member_id, created_at)`; admin-status-page reads.
- `idx_media_jobs_lease_recovery ON media_jobs(lease_expires_at) WHERE state = 'processing'`; partial index used by the boot-time orphan sweep.

### 4.18 Club Leaders & Event Organizers

**Tables:** `club_leaders`, `event_organizers`

#### Club leaders
A club's leadership is a flat set of equal co-leaders (all `role = 'co-leader'`), **max 5 per club** (US §5.2 CL_Manage_CoLeaders). There is no separate head-leader role.

DB-enforced structural invariants:
- `ux_one_club_leader_per_member`: a member co-leads at most one club.
- `ux_club_leaders (club_id, member_id)`: a member appears at most once per club.

**Max-5 cap is application-enforced** (APP-010). The application must reject inserts and `club_id` reassignments that would exceed 5 total rows per club.

#### Event organizers
1 organizer + up to 4 co-organizers per event = **max 5 total** (US §4.1 EO_Manage_CoOrganizers).

DB-enforced structural invariants:
- `ux_one_organizer_per_event`: only one `role = 'organizer'` row per event.
- `ux_event_organizers (event_id, member_id)`: a member appears at most once per event.

**Max-5 cap is application-enforced** (APP-011). The application must reject inserts and `event_id` reassignments that would exceed 5 total rows per event.

#### Anti-self-removal (event organizers only)
The application must prevent an event organizer from removing themselves if they are the sole organizer (UI hides the button; API validates before delete). DB does not enforce this. Clubs are exempt: a co-leader may step down or leave even as the club's last co-leader, leaving the club leaderless (a tolerated state, US §5.1).

#### Bootstrap leadership

`club_bootstrap_leaders` rows are real leaders who have not yet registered. When the leader registers and confirms (or the first affiliated member accepts leadership during onboarding), the bootstrap row is promoted to a `club_leaders` row. See §4.27 Migration Staging and Bootstrap Tables.

### 4.19 Account Tokens

**Table:** `account_tokens`

Security tokens for email verification, password reset, data export, legacy-account claim, and declared-old-email mailbox verification (`token_type` CHECK: `email_verify`, `password_reset`, `data_export`, `account_claim`, `mailbox_link`). Tokens are stored as SHA-256 hashes only; plaintext is never persisted. Target bindings are nullable FK columns per purpose: `target_legacy_member_id` for claim tokens, `target_anchor_id` (to `member_declared_anchors`) for mailbox-link tokens.

- **Email verification tokens** expire after the duration configured in `email_verify_expiry_hours` (default: 24 hours).
- **Password reset tokens** expire after the duration configured in `password_reset_expiry_hours` (default: 1 hour).
- Both TTL values are Administrator-configurable via `system_config_current` (see §4.23).
- **Multiple outstanding tokens are allowed** per member per type. The index `idx_account_tokens_active` on `(member_id, token_type)` is non-unique; it supports lookup performance but does not limit the number of active tokens.
- `token_type` represents the token purpose. Values: `email_verify`, `password_reset`, `data_export`, `account_claim`.
- `account_claim` tokens are used in the self-serve legacy account claim flow. They are single-use, time-limited (default 24 hours, configurable via `account_claim_expiry_hours`), and carry a dual binding: `member_id` (the requesting authenticated account) and `target_legacy_member_id` (the `legacy_members` row being claimed). A token may only be consumed while authenticated as the same `member_id` that initiated the request. `target_legacy_member_id` uses `ON DELETE NO ACTION`; `legacy_members` rows are never deleted in normal flow (they are marked claimed, not removed).
- `used_at` records when the token was consumed (single-use); `NULL` means not yet consumed.
- A presented token is valid only when `used_at IS NULL AND now < expires_at`.
- `idx_account_tokens_expires` supports the background cleanup job, which deletes expired or consumed tokens older than the configured threshold (`token_cleanup_threshold_days`).

**Index strategy:** `ux_account_tokens_hash` is a `UNIQUE` index on `token_hash` alone (globally unique per hash), which covers the token-validation lookup. A separate non-unique index on `(member_id, token_type)` covers per-member token listing. Multiple outstanding tokens per member per type are allowed; the per-member index is intentionally non-unique.

### 4.20 Mailing List Subscriptions

**Table:** `mailing_list_subscriptions`

One row per member per list. `status` values: `subscribed`, `unsubscribed`, `bounced`, `complained`, `suppressed`.

Admin role changes affect mailing list subscriptions as a side effect (APP-015). The admin-alerts list subscription is managed transactionally with `is_admin` changes.

### 4.21 Media Flags & Tags

**Tables:** `media_flags`, `media_tags`

Both tables use `ON DELETE CASCADE` on `media_id`: when media is hard-deleted, its flags and tags are automatically removed.

`UNIQUE(media_id, reporter_member_id)` prevents duplicate flags from the same reporter on the same item.

`UNIQUE(media_id, tag_id)` prevents duplicate tag applications.

### 4.22 Tag Stats Cache

**Table:** `tag_stats`

Denormalized read cache for the tag browse page (US §1.1). `computed_at` tracks the last recomputation time. Note: `tag_id` is the primary key; `tag_stats` has no `id` or `version` column; it follows a cache/upsert pattern rather than a standard mutable entity pattern.

This is recomputable data; the application owns recomputation cadence and may rebuild from source tables at any time. A background job upserts stats rows. `distinct_member_count` drives the "community tag" threshold: tags used by at least 2 distinct members appear on the public `/tags` browse page.

---

### 4.23 Seed Data

**Tables:** `mailing_lists`, `system_config`

Required default rows are included at the end of `schema.sql` (Section 23) and are loaded as part of schema initialization. Seed inserts use `INSERT OR IGNORE`, so **the seed INSERTs are idempotent**, but the full schema file is **not** safe to re-run on an existing database because CREATE statements are unguarded.

**Cross-table seed policy (verification and references):**
- Verify/reference `mailing_lists` seeds by `slug` (the natural primary key).
- Verify/reference `system_config` seeds by `config_key` (the semantic identifier).
- `system_config` seed rows use stable string IDs (e.g., `'seed-vouch-window-days'`) as the UUID primary key, making `INSERT OR IGNORE` re-runs idempotent without UUID generation at initialization time.

#### Mailing lists (required on fresh DB)

`slug` is the primary key. Verify seed presence and references by `slug`.

| slug | name | `is_member_manageable` |
|------|------|------------------------|
| `admin-alerts` | Admin Alerts | `0` (system-managed) |
| `all-members` | All Members | `1` |
| `newsletter` | Newsletter | `1` |
| `board-announcements` | Board Announcements | `1` |
| `event-notifications` | Event Notifications | `1` |
| `technical-updates` | Technical Updates | `1` |
| `active-player-reminders` | Active Player Reminders | `1` |

#### System config defaults

All `system_config` seed rows use `effective_start_at = '2000-01-01T00:00:00.000Z'` (platform epoch) and `changed_by_member_id = NULL` (system-seeded). The `system_config_current` view returns these as the current effective values until a new row is inserted for any key.

To change any value: INSERT a new row into `system_config` with the desired `value_json`, a new `effective_start_at`, and the acting admin's `changed_by_member_id`. Do not UPDATE existing rows.

| Key | Default | Notes |
|-----|---------|-------|
| `ballot_retention_days` | `2555` | Ballot retention window (~7 years) |
| `audit_retention_days` | `2555` | Audit log retention window (~7 years) |
| `reconciliation_expiry_days` | `90` | Resolved reconciliation issue TTL |
| `email_outbox_paused` | `0` | `1` = pause the transactional email outbox worker (DD §5.4) |
| `event_registration_reminder_days` | `7` | Days before event start to send reminder |
| `member_cleanup_grace_days` | `90` | Grace days after soft-delete before PII purge job runs |
| `payment_retention_days` | `2555` | Payment record compliance retention (~7 years) |
| `password_reset_expiry_hours` | `1` | Password reset token TTL (hours) |
| `email_verify_expiry_hours` | `24` | Email verification token TTL (hours) |
| `account_claim_expiry_hours` | `24` | Legacy account claim token TTL (hours); per `M_Claim_Legacy_Account` |
| `legacy_claim_init_rate_limit_max_per_member` | `5` | Max legacy-claim initiate attempts per requesting member per window |
| `legacy_claim_init_rate_limit_max_per_target` | `3` | Max legacy-claim emails per target legacy member per window (silent) |
| `legacy_claim_init_rate_limit_max_per_ip` | `10` | Max legacy-claim initiate attempts per source IP per window (silent) |
| `legacy_claim_init_rate_limit_window_minutes` | `60` | Sliding window (minutes) for legacy-claim initiate rate limiting |
| `active_player_duration_days` | `730` | Active Player grant duration in days (IFPA-rule-derived) |
| `active_player_expiry_reminder_days_1` | `30` | First Active Player expiry reminder offset (days before expiry) |
| `active_player_expiry_reminder_days_2` | `7` | Second Active Player expiry reminder offset (days before expiry) |
| `active_player_expiry_check_interval_seconds` | `86400` | Worker tick interval for the AP expiry sweep (seconds) |
| `vouch_rate_limit_max_per_hour` | `5` | Max vouch submissions per voucher per window |
| `vouch_rate_limit_window_minutes` | `60` | Sliding window (minutes) for counting vouch submissions per voucher |
| `outbox_max_retry_attempts` | `5` | Max email retry attempts before moving to dead-letter queue |
| `outbox_poll_interval_seconds` | `30` | Outbox worker polling interval (seconds) |
| `token_cleanup_threshold_days` | `7` | Age threshold (days) for cleanup of expired/consumed account tokens |
| `deceased_cleanup_grace_days` | `30` | Grace period (days) before PII removal after member marked deceased |
| `data_export_link_expiry_hours` | `72` | Hours before a personal data export download link expires |
| `login_rate_limit_max_attempts` | `10` | Max failed login attempts within window before lockout |
| `login_rate_limit_window_minutes` | `15` | Sliding window (minutes) for counting failed login attempts |
| `login_cooldown_minutes` | `30` | Lockout duration (minutes) after rate-limit threshold exceeded |
| `password_reset_rate_limit_max_attempts` | `5` | Max password reset requests per email per window |
| `password_reset_rate_limit_window_minutes` | `60` | Sliding window (minutes) for counting password reset requests |
| `password_change_rate_limit_max_attempts` | `10` | Max authenticated password-change attempts per member per window |
| `password_change_rate_limit_window_minutes` | `15` | Sliding window (minutes) for counting password-change attempts per member |
| `verify_resend_rate_limit_max_attempts` | `3` | Max verify-email resend requests per email per window |
| `verify_resend_rate_limit_window_minutes` | `60` | Sliding window (minutes) for counting verify-email resend requests |
| `jwt_expiry_hours` | `24` | Session JWT lifetime (hours); governs archive access expiry |
| `photo_upload_rate_limit_per_hour` | `10` | Max photo uploads per member per hour |
| `video_submission_rate_limit_per_hour` | `5` | Max video link submissions per member per hour |
| `reconciliation_summary_interval_days` | `7` | Cadence (days) for reconciliation digest email to admins |
| `primary_snapshot_version_days` | `30` | S3 versioning retention window (days) for primary backup bucket |
| `media_flag_rate_limit_per_hour` | `10` | Max media flags per member per hour |
| `cross_region_backup_retention_days` | `90` | Object Lock retention (days) for cross-region DR S3 bucket |
| `continuous_backup_interval_minutes` | `5` | Interval (minutes) between continuous SQLite backup runs |
| `tier1_price_cents` | `1000` | Tier 1 IFPA Member dues ($10.00 USD default; stored as integer cents) |
| `tier2_price_cents` | `5000` | Tier 2 IFPA Organizer Member dues ($50.00 USD default; stored as integer cents) |
| `auto_link_staged_expiry_days` | `365` | Days an open staged auto-link candidate stays offerable before the expiry sweep resolves it |
| `declared_anchor_rate_limit_max_per_member` | `10` | Max declared-anchor declare/remove writes per member per window |
| `declared_anchor_rate_limit_window_minutes` | `60` | Sliding window (minutes) for declared-anchor writes |
| `link_help_request_rate_limit_max_per_member` | `3` | Max admin link help requests per member per window |
| `link_help_request_rate_limit_window_minutes` | `1440` | Sliding window (minutes) for link help requests |
| `mailbox_link_rate_limit_max_per_member` | `5` | Max mailbox-verification link requests per member per window |
| `mailbox_link_rate_limit_max_per_target` | `3` | Max mailbox-verification links per target anchor per window (silent) |
| `mailbox_link_rate_limit_max_per_ip` | `10` | Max mailbox-verification link requests per source IP per window (silent) |
| `mailbox_link_rate_limit_window_minutes` | `60` | Sliding window (minutes) for mailbox-verification link requests |
| `bootstrap_claim_rate_limit_max_per_member` | `5` | Max first-admin bootstrap-claim attempts per member per window |
| `bootstrap_claim_rate_limit_max_per_ip` | `5` | Max first-admin bootstrap-claim attempts per source IP per window (silent) |
| `bootstrap_claim_rate_limit_window_minutes` | `60` | Sliding window (minutes) for bootstrap-claim attempts |

#### Membership pricing config keys (initial pricing, update before launch)

Pricing keys are seeded at platform-epoch defaults. Insert a new `system_config` row with the correct `effective_start_at` and value before going live. Values are integer cents; UI layers convert to USD for display.

---

### 4.24 Member Club Affiliations

**Table:** `member_club_affiliations`

Permanent operational table recording live club membership for members. Written at legacy claim time, or by admin or member self-service. Never dropped.

- Two-current-club cap: at most two `is_current = 1` rows per member, enforced at the service layer (count-before-insert in `ClubService`, matching the 5-leader-cap pattern). Joining a second club does not convert the first to former. Joining a third current club is blocked.
- `is_primary`: designates the member's primary club among current affiliations. The first current club is primary (`is_primary = 1`); the second is secondary (`is_primary = 0`). At most one primary per member, enforced by `ux_member_club_affiliations_one_primary` (partial unique index on `member_id WHERE is_primary = 1 AND is_current = 1`). When a member leaves their primary club, the secondary is not auto-promoted; the member is prompted to designate a new primary.
- `is_contact`: indicates the member is the designated club contact. Independent of `is_current`.
- `source` enum: `legacy_claim` (written during the legacy claim flow), `admin` (admin-assigned), `member_self_service` (member-initiated after claim).
- A member-club pair is unique (`UNIQUE(member_id, club_id)`); subsequent changes update the existing row.

---

### 4.25 Club Viability Signals

**Table:** `club_viability_signals`

Append-only table recording crowdsourced activity signals for clubs and club candidates. Written only during the onboarding wizard (stages 1A and 1B). One row per member per target per submission.

- `club_id` is nullable. A row is either club-keyed (`club_id` set; feeds the `crowdsource_club_viability` gates) or candidate-keyed (`club_id` NULL; an activity answer about an unpromoted `legacy_club_candidates` row, surfaced on the admin cleanup queue's candidate-flag group). A table CHECK requires candidate-keyed rows to carry `source_entity_type = 'legacy_club_candidate'` with the candidate id in `source_entity_id`. Promoting the candidate stamps the new club id onto its candidate-keyed rows, moving those votes to the live club's gates so a vote never counts on both surfaces.
- `source_stage` enum: `stage1a_contact`, `stage1b_affiliated`, `club_detail`, `dashboard`. Tracks which surface produced the signal; `club_detail` and `dashboard` are reserved values with no writing surface.
- `activity_signal` enum: `active`, `not_active`, `not_sure`, `never_heard_of_it`. The `crowdsource_club_viability` predicate uses `active` (S1), `not_active` (S2/S3), ignores `not_sure`, and stores `never_heard_of_it` without feeding the gates. A candidate whose only latest votes are `not_sure` surfaces no flag item: not-sure records no activity evidence.
- `source_entity_type` and `source_entity_id`: traceability to the wizard card. Club-keyed rows carry `legacy_person_club_affiliation` or `club_bootstrap_leader`; candidate-keyed rows carry `legacy_club_candidate` with the candidate id.
- No `updated_at`/`version`: append-only, except for the promotion stamp on `club_id`. A member who submits again writes a new row; the predicate counts one vote per member, taking the member's latest row per target.

### 4.26 Club Cleanup Resolutions

**Table:** `club_cleanup_resolutions`

Admin resolution tracking for the club cleanup queue. One row per club per predicate (`UNIQUE` constraint on `club_id, predicate_name`). Prevents resolved or deferred items from reappearing in the admin queue.

- `predicate_name`: identifies which cleanup predicate flagged the item (e.g., `crowdsource_viability`, `leaderless_active`, `stale_provisional`).
- `resolution` enum: `dismissed`, `deferred`, `demoted`, `archived`.
- `deferred_until`: ISO timestamp for deferred items. The admin queue re-surfaces deferred items after this timestamp passes.
- UPSERT semantics: re-resolving the same club-plus-predicate overwrites the prior resolution.

**Table:** `candidate_cleanup_resolutions`

Admin defer and flag-dismissal tracking for unpromoted `legacy_club_candidates` in the cleanup queue. One row per candidate per queue-item type (`UNIQUE` on `candidate_id, predicate_name`); mirrors `club_cleanup_resolutions`, which is keyed to live clubs and cannot hold candidate rows.

- `predicate_name`: the candidate queue-item type that was resolved (`promotable_candidate`, `candidate_flags`). A candidate's promotable item and its wizard-flag item resolve independently; parking one never hides the other.
- `resolution` enum: `deferred`, `dismissed`. Defer parks either item type; dismiss is the terminal resolution of a wizard-flag item only. The other candidate actions (promote, demote, archive) move the candidate itself toward a terminal state.
- `deferred_until`: ISO timestamp; the queue re-surfaces the candidate after it passes.
- `deferred_by_member_id`: the deferring admin; powers the "previously deferred by Admin X, reason ..." annotation on re-surface.
- UPSERT semantics: re-deferring the same candidate overwrites the prior window.

**Table:** `club_cleanup_claims`

Concurrent-admin coordination markers for the cleanup queue (one row per item, `UNIQUE` on `item_type, item_id`). A claim is a visible "claimed by Admin X at time T" hint, never a lock: it does not block another admin's actions.

- `item_type` enum: `club`, `candidate`; with `item_id` it addresses any queue item.
- `claimed_at`: refreshed on re-claim; markers older than 30 minutes are stale and stop rendering (staleness is evaluated in the read query; no background process; stale rows are overwritten by the next claim).
- Auto-release: every resolve, defer, dismiss, de-list, and promote action deletes the item's claim row.
- Claims are deliberately un-audited: a claim is a coordination hint, not a resolution.

---

### 4.27 Migration Staging and Bootstrap Tables

Three tables are introduced by the legacy data migration in addition to `member_club_affiliations` (§4.24). All three have explicit drop conditions. None are permanent operational tables.

| Table | Category | Drop condition |
|---|---|---|
| `legacy_club_candidates` | Migration-only staging | After every non-junk candidate has reached a terminal state per `A_Periodic_Club_Cleanup` |
| `legacy_person_club_affiliations` | Migration-only staging | After all affiliation suggestions are resolved |
| `club_bootstrap_leaders` | Operational, migration-origin | After all rows reach terminal state (`claimed`, `superseded`, or `rejected`) |

#### `legacy_club_candidates` — migration-only staging

Mirror-derived normalized club identities. Populated by the mirror-analysis pipeline before cutover per `MIGRATION_PLAN.md` §10.1. Each row represents one distinct club identity (possibly merged from multiple source legacy entries) with a `legacy_club_key`, location, classification, and the classification evidence.

Columns of design interest:

- `legacy_club_key`: the canonical mirror key for this candidate. When the curator confirms a duplicate pair (per MIGRATION_PLAN §10.1), the pipeline merges the pair into the keep-key candidate before load; merged-from keys are recorded in the pipeline's override file and outputs, not in a DB column.
- `display_name`, `city`, `region`, `country`: best-of fields from the (possibly merged) candidate per the MIGRATION_PLAN §10.1 field-merge rules.
- `classification`: enum (`pre_populate`, `onboarding_visible`, `dormant`, `junk`) assigned by the pre-cutover classifier; admin cleanup actions per `A_Periodic_Club_Cleanup` can demote an onboarding-visible candidate to dormant or return a junk candidate to dormant.
- Classification evidence: one 0/1 flag column per named rule (`r1`–`r10`) records exactly which rules fired, alongside `contact_signal_substitute_applied` and the raw rule-input columns (`last_hosted_year`, `last_updated_year`, `contact_member_last_year`, `max_affiliated_member_last_year`, `created_year`, `unique_member_names`, `linkable_member_count`, `ever_hosted`). Persisted so admin can audit the classification rationale without re-running the classifier; there is no `rules_fired`/`evidence_snapshot` JSON column.
- Force-keep / force-junk overrides live as curator-owned CSVs in `legacy_data/overrides/` consumed by the classifier, not as DB columns; admin force-keep / force-junk requests are ruled in `A_Periodic_Club_Cleanup`.
- `bootstrap_eligible`: 0/1, set iff `classification = 'pre_populate'`. Leader candidacy is independent: a pre-populated club may carry zero `club_bootstrap_leaders` rows (leadership then defers to activation path 2).
- `mapped_club_id`: FK to `clubs(id)`, populated once the candidate is promoted to a live row.
- `lifecycle_state`: NULL while the candidate is live in the cleanup queue; `archived` or `junk_confirmed` records a terminal admin decision on the row itself, so the drop condition is checkable from the rows alone.

May be dropped once every non-junk candidate has reached a terminal state per `A_Periodic_Club_Cleanup`.

#### `legacy_person_club_affiliations` — migration-only staging

Mirror-derived scored person-to-club affiliation suggestions. Each row links a person (by `historical_person_id` and/or `legacy_member_id`) to a `legacy_club_candidates` row with an inferred role (`member`, `contact`, `leader`, `co-leader`), a confidence score, and a resolution status. At least one of `historical_person_id` or `legacy_member_id` must be non-NULL (CHECK enforced).

`resolution_status` semantics:

- `pending` (schema default): the affiliation is inferred from the mirror and has not been confirmed by anyone. All loader-imported rows from the mirror pipeline arrive in this state.
- `confirmed_current`: written when a member confirms current affiliation via the wizard (Stage 1A / Stage 1B membership confirmation per `M_Complete_Onboarding_Wizard`), or when an admin manually confirms.
- `former_only`: the member acknowledges historical affiliation but is no longer involved (Stage 1A path 2, Stage 1B path 2).
- `not_mine`: the member rejects the inferred affiliation (Stage 1B path 4; Stage 1A path 4 escalates to admin).
- `needs_review`: admin has marked the row for further review.
- `promoted`: the candidate this row links to has been promoted to a live `clubs` row, and this affiliation has been carried forward to `member_club_affiliations`.
- `rejected`: admin-rejected suggestion.
- `superseded`: an admin-resolved duplicate cluster left this row no longer authoritative.

Uniqueness is enforced via two partial unique indexes rather than a single UNIQUE constraint, because SQLite treats NULLs as distinct in UNIQUE constraints and a single index would silently allow duplicate rows when `historical_person_id` is NULL.

May be dropped once all affiliation suggestions are resolved.

#### `club_bootstrap_leaders` — operational, migration-origin
Leaders for bootstrapped clubs. These are real leaders; they can manage the club once they register. `legacy_member_id` is NOT NULL on every row; it is the stable identifier that survives the lifecycle of the imported `legacy_members` row after a successful claim. `imported_member_id` is nullable with `ON DELETE SET NULL` for the same reason. `claimed_member_id` is populated when a claim confirms the leadership and the row is promoted to `club_leaders`. Classification (strong, weak, or none) per the `M_Complete_Onboarding_Wizard` combination gates is derived at read time from associated `club_bootstrap_leader_signals` rows. The `confidence_score` column is retained as a sortable informational attribute and does not drive classification. May be dropped only after all rows reach a terminal state (`claimed`, `superseded`, or `rejected`).

#### `club_bootstrap_leader_signals` — operational, migration-origin
Per-signal evidence for the combination-gate classification of bootstrap leader candidates (gates per `M_Complete_Onboarding_Wizard`). Each row records that a specific structural signal or modifier fired for a `(member, club)` candidate, captured at pipeline time. Services compute the strong / weak / none classification at read time by checking which structural signals are present on the parent bootstrap row.

`signal_type` values fall into two categories. Structural signals (`listed_contact`, `affiliation`, `hosting`, `roster`, `mirror_text`) drive classification per MP §2 gates. Modifier signals (`tier_signal`, `recent_activity`, `geographic_alignment`) display alongside structural signals in member-facing and admin surfaces but do not change classification.

`signal_payload_json` is free-form structured evidence (a last-year overlap window, a matched contact id, a narrative excerpt) captured by the pipeline emitter. `source` records which pipeline producer wrote the row (for example `legacy_affiliations`, `legacy_candidates`, `mirror_extraction`).

UNIQUE on (`bootstrap_leader_id`, `signal_type`) prevents duplicate evidence for the same signal on the same bootstrap row. Foreign key to `club_bootstrap_leaders(id)` with `ON DELETE CASCADE` so signal rows are removed when the parent bootstrap row is.

May be dropped together with `club_bootstrap_leaders` once all bootstrap rows reach a terminal state.

### 4.28 Name-matching utilities

#### `name_variants` — permanent, not migration-only

Name-equivalence pairs that support auto-link matching across `legacy_members`, `historical_persons`, and `members` (see `M_Claim_Legacy_Account` auto-link candidate staging and declared-anchor flow). Seeded at State 1 from mirror-mined pairs (~290); remains live post-cutover so admins and members may record further equivalences as new name collisions surface.

- **Columns**: `canonical_normalized` TEXT, `variant_normalized` TEXT, `source` TEXT with CHECK in (`mirror_mined`, `admin_added`, `member_submitted`), `created_at` TEXT default `datetime('now')`. Composite primary key on (`canonical_normalized`, `variant_normalized`).
- **Symmetric lookup**: storing `('robert', 'bob')` is equivalent to storing `('bob', 'robert')`. Lookups must check both columns. Never insert both directions; the self-pair CHECK and the PRIMARY KEY enforce uniqueness.
- **Normalization is application-side**: every value is NFKC-normalized, lowercased, whitespace-collapsed, and trimmed before it reaches the table. The table stores only the normalized forms. Unicode logic lives in the application to keep SQLite free of UDF registration.
- **No confidence column in v1**: seeded pairs are trusted (curator oversight), admin-added pairs are trusted (admin oversight), member-submitted pairs are distinguished via the `source` column. Per-pair scoring can be added later without breaking existing lookups.

#### Naming-convention note

This table is NOT prefixed `legacy_*`. The `legacy_*` prefix in this schema is reserved for migration-scope staging (`legacy_club_candidates`, `legacy_person_club_affiliations`) or archival data of legacy origin (`legacy_members`). Name-variant pairs are a permanent platform utility that grows over the life of the platform and has no "resolution" step, so the pairs themselves are the permanent artifact and the table is unprefixed. See §2 Schema Conventions for the general rule.

### 4.29 Member Onboarding Tasks

**Table:** `member_onboarding_tasks`

Permanent operational state for the per-member onboarding wizard (`MemberOnboardingService`; `MIGRATION_PLAN.md` §10). Carries one row per (`member_id`, `task_type`) tracking outstanding wizard tasks. The registration flow and the dashboard task widget read and write through the service.

- **Columns**: `id` PK; `member_id` FK to `members(id)`; `task_type` TEXT with CHECK in (`personal_details`, `legacy_claim`, `club_affiliations`); `state` TEXT with CHECK in (`pending`, `in_progress_paused`, `skipped`, `completed`, `not_applicable`); `created_at`, `updated_at` TEXT timestamps; `completed_at` TEXT nullable. `first_competition_year` and `show_competitive_results` are not valid task types; year input is bundled into `personal_details`.
- **`in_progress_paused`**: the task is mid-flow and the member detoured to another story (for example, `M_Join_Club` or `M_Create_Club` from the `club_affiliations` step). The dashboard task widget surfaces "Resume onboarding" while the row is in this state, and the wizard re-renders the same card on return.
- **Per-member unique**: `UNIQUE(member_id, task_type)` so the same task is not duplicated for one member.
- **Catalog evolution**: adding a new task type extends the `task_type` CHECK; existing rows are unaffected and the wizard renders the new task at its catalog position.
- **Applicability is server-determined**: `not_applicable` is written by the service when the underlying eligibility fails (e.g. no plausible legacy match for `legacy_claim`). Client cannot bypass.
- **Skipped is not blocking**: a `skipped` row does not gate sign-in. The member's dashboard surfaces all rows whose state is `pending` or `skipped`; completing transitions to `completed` and removes from the widget.
- **Audit trail**: every state transition emits an `audit_entries` row owned by the wizard service; see DATA_MODEL §4 audit_entries subsection for the `action_type` catalog.

---

### 4.30 Member Declared Anchors

**Table:** `member_declared_anchors`

Former surnames and old email addresses declared by members to broaden the identity-matching surface for auto-link and legacy-claim flows. Declared anchors are private: visible only to the member and admin.

- **Columns**: `id` PK; standard metadata columns; `member_id` FK to `members(id)`; `anchor_type` TEXT with CHECK in (`former_surname`, `old_email`); `anchor_value` TEXT NOT NULL; `verified_via_link_click_at` TEXT NULL and `verification_token_id` TEXT NULL (mailbox-control round-trip: stamped when the member clicks the single-use link delivered to the declared address while signed in, upgrading matches through the anchor to the `mailbox_control_via_link_click` evidence tier).
- **`UNIQUE(member_id, anchor_type, anchor_value)`**: prevents duplicate declarations.
- **Matching integration**: former-surname anchors feed into `findAutoLinkCandidates` as additional name inputs and into the direct historical-record claim's surname rule. Old-email anchors feed into `lookupLegacyAccount` as additional identifier lookups and into the batch classifier's email-anchor walk (verified login email first, then declared old emails; ambiguity anywhere collapses to low confidence). Both are exercised when the wizard's `legacy_claim` task renders the candidate list.
- **PII purge**: all of a member's anchors delete when the account's personal data is purged.
- **Anchor declare/remove writes are rate-limited** per member (`declared_anchor_rate_limit_max_per_member`, default 10 per `declared_anchor_rate_limit_window_minutes`, default 60).

### 4.31 Staged Auto-Link Candidates

**Table:** `auto_link_staged_candidates`

The stage-and-confirm surface for auto-link (per `M_Claim_Legacy_Account`): batch and post-claim passes stage candidate matches here; nothing mutates live tables and no mail is sent until the member confirms a wizard card. Migration-scope; droppable once all staged candidates resolve.

- **Columns**: `id` PK; standard metadata columns; `member_id` FK to `members(id)`; nullable targets `legacy_member_id` (FK `legacy_members`) and `historical_person_id` (FK `historical_persons`); `confidence` CHECK in (`high`, `medium`); `matched_anchors_json`; `proposed_evidence_strength` CHECK over the four §15.19 tiers; `source_pass` CHECK in (`batch`, `sign_in`, `registration`, `cross_source`); `status` CHECK in (`staged`, `confirmed`, `declined`, `expired`); `expires_at`; `resolved_at`.
- **CHECKs**: at least one target column is non-NULL; `(status = 'staged') = (resolved_at IS NULL)`.
- **`ux_auto_link_staged_open`**: partial UNIQUE on `(member_id, COALESCE(legacy_member_id,''), COALESCE(historical_person_id,''))` WHERE `status = 'staged'`; re-staging an open pair is a constraint no-op, making batch reruns idempotent. A declined pair is never re-staged (service-enforced against resolved rows).
- **`source_pass = 'cross_source'`** rows are post-confirm offers for the member's other identity source; they share the stage/confirm/decline/expire lifecycle but emit the `legacy.cross_source_candidate_*` audit event family instead of `legacy.auto_link_candidate_*`.
- Open candidates expire after `auto_link_staged_expiry_days` (default 365) via the worker's daily sweep.

### 4.32 Pipeline-produced canonical content (out of this enumeration)

The freestyle trick dictionary (`freestyle_tricks` and related tables), the Net team-appearance tables (`net_team` and related), and the cross-sport records tables (`freestyle_records`, `consecutive_kicks_records`) are populated from the historical-data pipeline and read read-only by `FreestyleService`, `NetService`, and `RecordsService` for the public `/freestyle/*`, `/net/*`, and `/records` surfaces. Their schema semantics are owned by the legacy_data track (`legacy_data/CLAUDE.md`); the freestyle taxonomy is governed as reversible/observational and is intentionally not hardened in this document. `given_name_variants` is a name-matching utility alongside §4.28.

---

## 5. View Reference

Physical tables are the direct query surface for unrestricted access. Views provide filtered, computed, or admin surfaces. Application code should use the semantically appropriate surface per operation.

### Computed views

These derive state from history or effective-dated tables.

| View | Backed by | Logic |
|------|-----------|-------|
| `member_tier_current` | `member_tier_grants` | Derives current lifetime membership tier per member from the latest ledger snapshot. Output: `member_id`, `tier_status`, `underlying_tier_status`. Authoritative tier read model. |
| `member_active_player_current` | `active_player_grants` + `member_tier_current` | Derives current Active Player state for Tier 0 members from the latest AP ledger snapshot. Output: `member_id`, `is_active_player`, `active_player_expires_at`, `latest_active_player_reason_code`. |
| `member_membership_status_current` | `member_tier_current` + `member_active_player_current` | Combined authorization surface. Output: tier, underlying tier, AP fields, `has_tier1_benefits`, `is_official_roster_member`. Canonical join target for feature gates and roster checks. |
| `official_ifpa_roster_current` | `members_active` + `member_membership_status_current` | Operational Official IFPA Roster surface. Filters `is_official_roster_member = 1 AND is_deceased = 0`. Not public; admin and admin-provisioned access only. |
| `system_config_current` | `system_config` | Returns the row with the latest `effective_start_at <= now` per `config_key`. Authoritative read surface for all runtime config lookups. |

### Semantic filter views

These apply a meaningful `WHERE` clause; always understand the filter before using them.

| View | Filter | Use case |
|------|--------|----------|
| `members_active` | `deleted_at IS NULL` | General member lookups (non-deleted accounts) |
| `clubs_open` | `status IN ('active','inactive')` | Render club lists and lookups (excludes archived clubs) |
| `email_templates_enabled` | `is_enabled = 1` | Templates active for automated email flows |
| `recurring_donation_subscriptions_active` | `status <> 'canceled'` | Active subscription queries |

### Multi-condition search view

| View | Filter | Use case |
|------|--------|----------|
| `members_searchable` | `deleted_at IS NULL AND is_deceased = 0 AND searchable = 1 AND personal_data_purged_at IS NULL AND email_verified_at IS NOT NULL` | **Member search endpoint only.** Applies five exclusion conditions; `email_verified_at IS NULL` is the primary guard against imported `legacy_members` rows being surfaced. |

### Admin full-rowset views

These expose all rows including archived/deleted.

| View | Use case |
|------|----------|
| `members_all` | Admin queries, PII purge workflows, soft-delete management |
| `clubs_all` | Admin queries, audit, reactivate archived clubs |

---

## 6. Application-Enforced Integrity & Workflow Rules

These rules are normative. They **must** be implemented in application code. The database does not enforce them.

---

### APP-001 — Foreign key enforcement per connection

**Every SQLite connection must execute `PRAGMA foreign_keys = ON` before any reads or writes.** SQLite disables FK enforcement by default. Setting it in the schema file is not sufficient for connection pools or new connections opened after initialization. Add a startup assertion and integration test to verify this is active.

---

### APP-002 — ISO-8601 T-format timestamps

**All timestamp writers must use `strftime('%Y-%m-%dT%H:%M:%fZ','now')` format (e.g., `2026-02-26T14:30:00.000Z`).** Do not use `datetime('now')`, which produces a space-separated format that breaks lexical sort ordering in time-based views and triggers (for example `member_tier_current`).

---

### APP-003 — Payment status dual-write

**Every `payments.status` change must be paired with a `payment_status_transitions` INSERT in the same transaction.** The DB enforces state machine validity (no backward transitions); the DB does not enforce that a transition row is always written.

---

### APP-004 — Payment state machine validation

The allowed state machine (also enforced by DB trigger):
```
pending → succeeded | failed | canceled
succeeded → refunded
```
Same-status no-ops are allowed (idempotent Stripe webhook redelivery). The application must also validate that the incoming Stripe event matches the expected transition before writing.

---

### APP-005 — Subscription lifecycle dual-write

**Every `recurring_donation_subscriptions.status` change must be paired with a `recurring_donation_subscription_transitions` INSERT in the same transaction.**

Subscription state machine (application-enforced only):
```
→ active (on customer.subscription.created)
active → past_due (on invoice.payment_failed)
past_due → active (on invoice.payment_succeeded after failure)
active | past_due → canceled (on customer.subscription.deleted)
```

---

### APP-006 — Stripe success gating

**Membership-tier grants from paid purchases and confirmed registrations must not be written before payment success is established.** Write `member_tier_grants` rows with `reason_code IN ('purchase.tier1','purchase.tier2')` and `registration.status = 'confirmed'` atomically with the `payments.status = 'succeeded'` update. Never grant access on `'pending'`, `'failed'`, or `'canceled'` payments.

**Refunds preserve membership tier.** When a previously succeeded payment is refunded, the service writes a `payment_status_transitions` row only and does NOT write a `revoke` row to `member_tier_grants`. Membership tier is permanent across refunds (US §1.2: completed payments are not retroactively altered).

---

### APP-007 — Membership pricing config updates

**Update membership pricing by calling `setConfigValue()` through AdminGovernanceService**, which inserts a new row into `system_config` with the appropriate `effective_start_at` and `changed_by_member_id`. Pricing keys are `tier1_price_cents` and `tier2_price_cents`. Values are integer cents. `system_config` is append-only; never UPDATE existing rows. Verify seeded rows by `config_key` before making changes.

---

### APP-008 — Max 3 member external links

**Reject inserts and `member_id` reassignments on `member_links` that would result in more than 3 rows per member.** Source: US §3.2 M_Edit_Profile ("External URLs on profiles (maximum 3)").

---

### APP-009 — Max 5 video embeds per gallery

**Reject inserts and `gallery_id` reassignments on `media_items` where `media_type = 'video'` that would result in more than 5 video rows per gallery.** Source: US §3.8 M_Organize_Media_Galleries ("Maximum 5 video embeds per named gallery").

---

### APP-010 — Max 5 club leaders

**Reject inserts and `club_id` reassignments on `club_leaders` that would result in more than 5 total rows per club.** Source: US §5.2 CL_Manage_CoLeaders (a flat set of up to 5 co-leaders). The DB enforces structural uniqueness (a member co-leads at most one club; a member appears at most once per club) but not the total count cap.

---

### APP-011 — Max 5 event organizers

**Reject inserts and `event_id` reassignments on `event_organizers` that would result in more than 5 total rows per event.** Source: US §4.1 EO_Manage_CoOrganizers ("Maximum 5 total organizers per event"). The DB enforces structural uniqueness (one `role='organizer'` per event) but not the total count cap.

---

### APP-012 — Updated-at and updated-by stamping on FK-detached rows (optional)

When the application explicitly deletes a media item or gallery and wants to record the detachment on affected parent rows, it should stamp `updated_at`/`updated_by`/`version` on those rows in the same transaction (before the delete). The FK `ON DELETE SET NULL` action handles the FK nullification automatically but does not stamp metadata. For detachments that occur silently (e.g., uploader self-deletes media while the club still references it as logo), the FK action is sufficient and no stamping is required.

---

### APP-013 — Competitor registration discipline completeness

**Before a `registrations` row reaches `status = 'confirmed'` for `registration_type = 'competitor'`, at least one `registration_discipline_selections` row must exist for that registration.** Enforce this validation at confirmation time (before the status write), not at insert time (multi-step UI).

---

### APP-014 — Vote option visibility timing

**If `votes.options_visible_at` is set, the application must enforce `options_visible_at <= vote_open_at`.** Source: US §3.7 voting stories.

---

### APP-014a — Vote eligibility canonical tier strings

**Vote eligibility-rule JSON (`votes.eligibility_rule_json`) and the snapshot rows it produces (`vote_eligibility_snapshot`) must use only the canonical membership-tier strings `'tier0'`, `'tier1'`, `'tier2'`, `'tier3'`.** The DB does not CHECK rule-JSON contents; the application is the sole enforcer.

---

### APP-015 — Admin role prerequisites and side effects

Admin grant/revoke is application-only logic:
1. **Target-member prerequisite:** only members whose effective tier is `tier2` or `tier3` may receive `is_admin = 1` (US §1.2, §6.6 A_Manage_Admin_Role).
2. **Who may grant/revoke:** only existing admins and IFPA Board actors (`is_board = 1`, Tier 3) may manage admin roles. Bootstrap exception: the initial system administrator may appoint the first admin during first-run setup.
3. **Anti-lockout:** the last admin may not have `is_admin` removed. Validate before the update.
4. **Mailing list side effect:** write `mailing_list_subscriptions` changes for admin-alert lists in the same transaction as `is_admin` changes.
5. All admin role changes must be audit-logged.

---

### APP-016 — Membership tier and Active Player source linkage discipline

Two ledgers, two discipline rules:

1. **`member_tier_grants` (lifetime tier).** May link to a payment via `related_payment_id`. Must NOT carry vouch, event, registration, club, or club-affiliation provenance. Write rows only for purchase upgrades, HoF/BAP grants, Tier 3 governance set/remove, admin overrides/corrections, or legacy claim resolutions.
2. **`active_player_grants` (Active Player lifecycle).** May link to a registration, event, club, club-affiliation, or vouch via the corresponding `related_*` FK. Must NOT carry payment provenance. Write rows for event attendance, vouch grants/extensions, the one-time club-join grant, system expiry, membership-upgrade end, Tier 3-grant end, and admin actions.

The DB does not CHECK `reason_code` semantics; the application is the primary validator. The DB does enforce the structural provenance rules (at most one source FK on `active_player_grants`; only `related_payment_id` on `member_tier_grants`; the governance shape constraints on `member_tier_grants`) as a last-line safety net.

---

### APP-018 — Reconciliation issue expiry

**Set `reconciliation_issues.expires_at` at insert using the `reconciliation_expiry_days` config key: `strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+' || reconciliation_expiry_days || ' days')`.** The cleanup job deletes rows WHERE `expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now') AND status = 'resolved'`.

---

### APP-019 — Ballot receipt token scrubbing

**After successfully delivering a voting confirmation email that contains a plaintext receipt token in `outbox_emails.body_text`, the sender worker must set `outbox_emails.body_text = NULL`.** The `ballots.receipt_token_hash` is the persistent record; the plaintext is transient and must not be retained in the outbox after delivery. The schema column is nullable specifically to support this scrub (see DD §5.4).

---

### APP-020 — Tag stats recomputation

**The application/background job runner owns `tag_stats` recomputation cadence.** This is recomputable cache data; the job may rebuild from source tables (`media_tags`, `members`) at any time. The `computed_at` column records the last full recomputation timestamp.

---

### APP-021 — Seed data required on fresh DB

**Schema initialization (`schema.sql`) includes all required seed rows.** Do not skip Section 23 of the schema file. The following tables must have seed rows before the application can function:

- `mailing_lists`: `admin-alerts`, `all-members`, `newsletter`, `board-announcements`, `event-notifications`, `technical-updates`, `active-player-reminders` (verify by `slug`); admin notification and member subscription workflows depend on these slugs.
- `system_config`: all keys in §4.23 (verify by `config_key`); application reads these at startup and during operations; missing keys will cause runtime errors.

**To verify seed data is present after initialization:**
```sql
SELECT count(*) FROM mailing_lists;     -- expect 7
SELECT count(*) FROM system_config;     -- expect 44
```

**Prefer semantic-key verification for publishable checks/examples:**
```sql
SELECT slug FROM mailing_lists ORDER BY slug;
SELECT config_key, value_json FROM system_config_current ORDER BY config_key;
```

---

### APP-022 — PII purge anonymized-stub workflow

**When applying the full account purge (`erasure_log` kind `account_pii_purge`) to a `members` row, the application MUST produce a complete anonymized retained stub in the same transaction.** The deceased contact scrub also sets `personal_data_purged_at` but preserves identity fields; its shape is defined in the §4.14 PII purge subsection. The full purge, specifically:

1. Clear all nullable contact fields: set `phone = NULL`, `whatsapp = NULL`.
2. For non-HoF/BAP members, overwrite retained non-null identity and location fields with anonymized placeholders as needed (`real_name`, `display_name`, `display_name_normalized`, `city`, `country`) so they do not retain identifiable values.
3. For members where `is_hof = 1` or `is_bap = 1`, preserve `display_name` and `bio` per User Stories deletion policy; continue anonymizing other required retained identity/location fields as needed.
4. Set `login_email = NULL`, `login_email_normalized = NULL`, `password_hash = NULL`, `password_changed_at = NULL` (allowed by schema once `personal_data_purged_at` is set).

This ensures the retained stub row meets data retention and anonymization requirements. The DB CHECK enforces that credential fields are NULL when purged, but the stub shape for non-nullable profile fields is entirely application-enforced.

---

### APP-023 — Tally authorization (can-tally-votes equivalent)

**Ballot decryption and tally operations MUST require an authorization check equivalent to a `can_tally_votes` permission.** This permission is not modeled as a column in `members`; enforcement is the responsibility of the application auth layer.

Requirements:
1. The admin endpoint that initiates tally operations must verify the calling admin has explicit tally authorization before proceeding.
2. Every ballot decryption operation during tally must be audit-logged via `audit_entries` with `action_type`, `actor_member_id`, `entity_type = 'vote'`, and `entity_id = vote_id`.
3. Tally initiation itself (start and complete events) must also be audit-logged.

---

### APP-024 — Standard tags must not be hard-deleted

**Tags with `is_standard = 1` are permanent identities and MUST NOT be hard-deleted.** The `UNIQUE INDEX ux_tags_normalized` enforces uniqueness for currently-existing rows but cannot prevent a deleted tag's normalized form from being recreated under a different `id` if the original row is deleted.

The application must reject any delete request targeting a `tags` row where `is_standard = 1`. Permanent reservation of standard-tag normalized forms (and therefore their redirect and identity semantics) depends entirely on this application-layer delete discipline.

---

## 7. Retained DB Triggers

The following 26 triggers are intentionally kept in the database. All enforce integrity invariants that would be materially weakened by application-only enforcement (due to multiple write paths, tamper-resistance requirements, or financial-record immutability).

### Append-only / immutability triggers (22)

These prevent UPDATE and DELETE on tables that must be permanent historical records:

| Trigger pair | Table | Reason |
|-------------|-------|--------|
| `trg_vote_eligibility_no_update` / `_no_delete` | `vote_eligibility_snapshot` | Election fairness: snapshot is frozen at vote-open time |
| `trg_ballots_no_update` / `_no_delete` | `ballots` | Ballot tamper resistance |
| `trg_audit_no_update` / `_no_delete` | `audit_entries` | Audit log integrity |
| `trg_erasure_log_no_update` / `_no_delete` | `erasure_log` | Erasure ledger integrity: backup restores re-apply recorded erasures |
| `trg_recurring_sub_transitions_no_update` / `_no_delete` | `recurring_donation_subscription_transitions` | Subscription lifecycle history |
| `trg_payment_transitions_no_update` / `_no_delete` | `payment_status_transitions` | Payment history integrity |
| `trg_tier_grants_no_update` / `_no_delete` | `member_tier_grants` | Membership tier ledger integrity |
| `trg_system_config_no_update` / `_no_delete` | `system_config` | Config history integrity; enables effective-dated audit trail |
| `trg_active_player_vouches_no_update` / `_no_delete` | `active_player_vouches` | Vouch ledger integrity |
| `trg_active_player_grants_no_update` / `_no_delete` | `active_player_grants` | Active Player grant ledger integrity |
| `trg_active_player_reminder_sent_no_update` / `_no_delete` | `active_player_reminder_sent` | Reminder-sent ledger integrity |

### Vote options lock triggers (3)

| Trigger | Table | Reason |
|---------|-------|--------|
| `trg_vote_options_lock_insert` | `vote_options` | Blocks INSERT when parent vote is `open`/`closed`/`published`/`canceled` |
| `trg_vote_options_lock_update` | `vote_options` | Blocks UPDATE when parent vote is open or later |
| `trg_vote_options_lock_delete` | `vote_options` | Blocks DELETE when parent vote is open or later |

These are kept in the DB because election integrity requires the invariant regardless of which code path (admin API, background job, or direct SQL) touches `vote_options`.

### State machine trigger (1)

| Trigger | Table | Reason |
|---------|-------|--------|
| `trg_payments_status_monotonicity` | `payments.status` | Multiple independent code paths (webhook handler, admin tools, refund worker) can mutate payment status; DB guard prevents silent backward transitions regardless of which path runs |

---

## 8. SQLite Runtime Requirements

### Foreign key enforcement (CRITICAL)

```sql
PRAGMA foreign_keys = ON;
```

**Execute this on every connection before any reads or writes.** SQLite disables FK enforcement by default. The `PRAGMA foreign_keys = ON` at the top of `schema.sql` runs once at schema initialization; it does not persist for future connections.

**Implementation checklist:**
- [ ] DB connection factory/initializer executes `PRAGMA foreign_keys = ON` immediately after opening
- [ ] Connection pool hooks run the PRAGMA on every new connection
- [ ] Integration test asserts FK enforcement is active (e.g., attempt an FK violation and verify it is rejected)

### WAL mode (recommended)

```sql
PRAGMA journal_mode = WAL;
```

WAL mode allows concurrent readers during writes and is recommended for web applications. Does not affect schema correctness.

### Prepared statement laziness

Application code calls `db.prepare()` only inside getters or function bodies, never at module top level. The single database module exports statement groups whose properties are getters that compile their SQL on first access against the connection's current schema. Importing the database module against an unmigrated database therefore does not fail at import time; failures surface at the call site of the specific statement.

**Implementation checklist:**
- [ ] No top-level `db.prepare()` calls in any application module
- [ ] Statement-group properties are getters; dynamic-SQL helpers prepare inside their function body
- [ ] A test exercises every statement-group getter against the current schema to recover the boot-time validation that eager prepares used to provide

### Timestamp format

All timestamp strings written to the database must use:
```
YYYY-MM-DDTHH:MM:SS.sssZ
```
Example: `2026-02-26T14:30:00.000Z`

In SQLite expressions: `strftime('%Y-%m-%dT%H:%M:%fZ','now')`

This format is required for lexical ordering to match chronological ordering in the `member_tier_current` view, the `system_config_current` view, and anywhere else time-based comparisons are performed.

---

## 9. Clarifications

This section documents naming conventions, view semantics, lifecycle patterns, and intentional design decisions to make existing patterns easier to understand and maintain.

### 9.1 Schema Naming Conventions

#### Table and view access policy

Physical tables are the direct query surface for unrestricted access. Views provide filtered, computed, or admin surfaces. The table name IS the authoritative reference; foreign keys target the bare table name directly.

#### Common view suffixes

| Suffix | Meaning | Example |
|--------|---------|---------|
| `_all` | All rows including archived/deleted/canceled | `members_all`, `clubs_all` |
| `_active` | Explicit non-deleted/active subset | `members_active`, `recurring_donation_subscriptions_active` |
| `_current` | Computed effective-current projection from a history or effective-dated table. Must never be used as a vanity alias over a flat non-versioned table. | `member_tier_current`, `system_config_current` |
| `_searchable` | Multi-condition search-safe surface | `members_searchable` |
| `_open` | Status-based filter: non-archived subset | `clubs_open` |
| `_enabled` | Boolean-filter subset | `email_templates_enabled` |

#### Object naming conventions

- Tables and views: `snake_case`
- Non-unique indexes: `idx_` prefix
- Unique indexes: `ux_` prefix
- Triggers: `trg_` prefix

#### Column naming conventions (common patterns)

- `*_id`; identifiers / foreign keys
- `*_at`; timestamps
- `*_by`; actor/reference for who created/updated a row
- `*_status`; lifecycle/status value
- `*_type`; type discriminator / category
- `is_*`; boolean columns (`INTEGER NOT NULL DEFAULT 0 CHECK (col IN (0,1))`)

These conventions are intentionally repetitive because they improve discoverability, grep-ability, and consistency across a large schema.

### 9.2 Lifecycle / Deletion Strategy

This schema intentionally uses different lifecycle strategies for different entities. These are not interchangeable and are chosen based on each entity's workflow and data retention needs.

#### Common patterns used

- **Soft-delete**; Rows remain stored but are hidden from default views. Represented by `deleted_at`. The `_active` view applies this filter; `_all` exposes everything. Example: `members`.

- **Status-based archival**; Rows remain stored and are considered archived via a status value (e.g., `status='archived'`). Default views may exclude archived rows. Example: `clubs` (via `clubs_open`).

- **Hard-delete**; Rows may be physically deleted when workflow rules allow it. Workflow restrictions are often enforced in application logic. Example: `events`, `news_items`, `media_items`.

- **Append-only / immutable history**; Rows are never updated or deleted after insert. Triggers enforce immutability. Used for: audit, transition history, snapshots, tier grants, system_config.

#### Database vs application responsibility

The database primarily enforces structural integrity: primary keys, foreign keys, unique constraints, check constraints, and selected triggers for critical invariants.

The application enforces workflow and policy rules: authorization/permission checks, state transition orchestration, caps/limits, business process rules, and side effects (notifications, external API workflows, etc.).

Some triggers are intentionally retained for critical safety/integrity invariants even though broader workflow logic is application-managed.

### 9.3 Timestamp Storage Contract (Prominent Clarification)

Timestamps are stored as UTC text in ISO-8601 format using a lexically sortable representation (with `T` separator and `Z` suffix).

This format is relied upon by parts of the schema (including `member_tier_current` and `system_config_current`) that compare timestamps lexically or use operations such as `MAX(...)` on timestamp text values.

Do not change timestamp storage format or timestamp-generation expressions casually. If a change is ever considered, verify that lexical ordering and all dependent view/trigger logic remain equivalent.

### 9.4 Intentional Exceptions / Not a Bug

The schema contains a few patterns that may look inconsistent at first glance but are intentional.

- **`events` and `news_items`**; These domains use hard-delete; there are no `_all` views. The bare table names are the only read surfaces for these domains.

- **`recurring_donation_subscriptions`**; Only an `_active` semantic filter view is defined; the bare table name serves as the full-rowset surface. This is intentional and reflects the preferred query surfaces for this domain.

- **`tag_stats`**; Follows a cache/recomputed-statistics pattern. `tag_id` is the primary key; no `id`, `version`, or mutable metadata columns. Always upserted by background job.

- **`stripe_events`**; External-event ingestion table. Uses `event_id TEXT PRIMARY KEY` (Stripe's event ID) rather than a surrogate UUID. Follows ingestion-oriented semantics that differ from the most common entity-table pattern.

- **`mailing_lists`**; Uses `slug TEXT PRIMARY KEY` (the natural key), not a UUID. Intentionally has no `id` column; slug is the stable semantic reference used by all foreign keys into this table.

- **Append-only ledger/history tables**; Some tables intentionally omit mutable metadata columns (`updated_at`, `updated_by`, `version`) because they are designed to be immutable after insert. This includes `audit_entries`, `erasure_log`, `ballots`, `member_tier_grants`, `payment_status_transitions`, `recurring_donation_subscription_transitions`, `vote_eligibility_snapshot`, and `system_config`.

When evaluating schema consistency, these exceptions should be treated as design choices tied to domain semantics, compatibility, or operational needs rather than as accidental inconsistencies.
