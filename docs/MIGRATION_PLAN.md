# Footbag Website Modernization Project -- Migration Plan

**Document Purpose:**

This document is the source of truth for go-live readiness: legacy data migration design (streams, claim flow, auto-link, merge rules, club bootstrap, name model, competition history), operational readiness gates (backup, observability, edge security, IAM, email ops, maintenance jobs, secrets rotation, pre-cutover reverts), and the phasing, operational states, and validation gates that govern both. For functional requirements, see `USER_STORIES.md`. For privacy and visibility policy, see `GOVERNANCE.md`.

---

## Table of contents

### Part A -- Design

1. [Executive summary](#1-executive-summary)
2. [Migration sources](#2-migration-sources)
3. [Name model](#3-name-model)
4. [Competition history fields](#4-competition-history-fields)
5. [Identity and person links](#5-identity-and-person-links)
6. [Auto-link: matching legacy_members, historical_persons, and members](#6-auto-link-matching-legacy_members-historical_persons-and-members)
7. [Self-serve legacy claim flow](#7-self-serve-legacy-claim-flow)
8. [Merge rules](#8-merge-rules)
9. [Club bootstrap and onboarding](#9-club-bootstrap-and-onboarding)
10. [Onboarding wizard service](#10-onboarding-wizard-service)
11. [Security model summary](#11-security-model-summary)
12. [Admin flows](#12-admin-flows)
13. [User stories summary](#13-user-stories-summary)

### Part B -- Contracts

14. [Required schema changes](#14-required-schema-changes)
15. [Data pipeline inventory](#15-data-pipeline-inventory)
16. [Migration vs operational table classification](#16-migration-vs-operational-table-classification)
17. [Audit requirements](#17-audit-requirements)
18. [What we need from the legacy-site webmaster](#18-what-we-need-from-the-legacy-site-webmaster)
19. [What we need from the historical-pipeline maintainer](#19-what-we-need-from-the-historical-pipeline-maintainer)
20. [Design decisions affected](#20-design-decisions-affected)

### Part C -- Go-live

21. [Go-live blocker index](#21-go-live-blocker-index)
22. [Phasing](#22-phasing)
23. [Operational states](#23-operational-states)
24. [Validation gates](#24-validation-gates)
25. [Data quality from persons.csv analysis](#25-data-quality-from-personcsv-analysis)
26. [Rollback posture](#26-rollback-posture)
27. [Open issues deferred to test load](#27-open-issues-deferred-to-test-load)
28. [Operational readiness for go-live](#28-operational-readiness-for-go-live)
29. [QC subsystem retirement (go-live gate)](#29-qc-subsystem-retirement-go-live-gate)

---

## Part A -- Design

## 1. Executive summary

This plan covers everything required to reach production go-live for the new footbag.org platform. Three workstreams run in parallel:

1. **Historical pipeline**: persons, events, results, honors (Hall of Fame, BAP), clubs, club affiliations, and club leadership. Person truth comes from human-curated CSV. Club data comes from mirror extraction scripts that are part of the same pipeline. The pipeline also creates historical person records for ~1,600 club-only members who never competed in events.
2. **Legacy member accounts**: login-bearing accounts from the current live legacy site. Require a one-time legacy-account export from the legacy webmaster and a secure voluntary claim flow.
3. **Operational readiness** (primary maintainer + AWS + GitHub): backup/restore, observability, edge security, IAM scope-down, email deliverability operations, scheduled maintenance jobs, secrets rotation, and the pre-cutover revert checklist. See §28.

The two data sources share the same identity key (`legacy_member_id`) and converge at cutover when historical persons are auto-linked to imported members by email. Go-live completes when all data is reconciled, operational readiness gates are green, and the DNS switch has occurred.

Additionally, the platform introduces a name model, competition history fields, and an auto-link system that connects historical persons to modern member accounts. These are described in detail in sections 3 through 6.

---

## 2. Migration sources

### Historical pipeline

**What it covers:** Historical events, results, persons, honors, clubs, club affiliations, and club leadership. Person truth comes from human-curated CSV. Club data comes from mirror extraction scripts.

**Key invariant:** A historical person may exist without a claimed modern account. Historical data is published regardless of whether the underlying person has ever claimed a legacy account. The `legacy_member_id` on a `historical_persons` row becomes the bridge to a modern account only after a successful claim.

**Remaining work:**
- Integrate club extraction scripts into the pipeline
- Extract ~1,600 club-only members from mirror into `historical_persons`
- Club identity normalization, affiliation inference, leadership inference
- Bootstrap eligibility decisions for go-live club population

The live system needs clubs on day one. The mirror is the best available source of club identity and prior leadership information.

#### Pipeline outputs (required before the legacy-account export)

The historical-data pipeline must produce:

- Normalized legacy club candidates (one row per distinct club identity)
- Inferred person-to-club affiliation rows with confidence scores
- Inferred role classifications: `member`, `contact`, `leader`, `co-leader`
- Linkage from inferred persons to `historical_persons.person_id` where possible
- Preserved `legacy_member_id` when known from the mirror
- Club classification per section 9.1 rules (pre-populate, onboarding-visible, dormant, or junk)
- Bootstrap eligibility decision for pre-populated clubs, based on leader candidate availability (section 2 bootstrap rule)
- Review report including:
  - Per-club classification with which rule(s) matched
  - Clubs with no credible leader candidate
  - Clubs with multiple competing leader candidates
  - People with multiple apparent current-club indications (store all affiliations with `resolution_status = 'pending'`; the member resolves at claim time by choosing one current club and marking others as former)
  - Unmapped club aliases or duplicate club identities
  - Recommended split per classification rules (section 9.1): pre-populate / onboarding-visible / dormant / junk

#### Bootstrap rule

A pre-populated club (per section 9.1 rules PP1-PP4) receives bootstrap leader rows when all of the following hold:

- At least one leader candidate with `club_bootstrap_leaders.confidence_score >= 0.70`
- That candidate maps to a `legacy_member_id` that will exist in the imported member rows (verified provisionally from `legacy_member_id` presence; confirmed at test load when the legacy-account export arrives)

Leader candidate confidence is distinct from club classification. It measures how certain we are that a specific person is the right leader for this club. The historical-data pipeline assigns this score based on:

- Listed as contact on club page with matching `historical_persons` row and `legacy_member_id`: high (>= 0.70)
- Listed as contact but no `historical_persons` match: medium (0.40 to 0.69)
- Inferred from member roster (most active or most events) but not listed as contact: lower (< 0.40)

The 0.70 threshold is tunable at test load via validation gate G8.

Pre-populated clubs that do not meet the leader requirement are pre-populated without a provisional leader (first member with membership Tier 1+ to confirm affiliation is offered co-leadership; see leadership activation path 2 below).

Clubs that fail the pre-populate rules (PP1-PP4) are classified as onboarding-visible, dormant, or junk per section 9.1.

#### Leadership model

Bootstrap-eligible clubs are created with:

- A live `clubs` row
- One or more `club_bootstrap_leaders` rows representing leaders

`club_bootstrap_leaders` rows are leaders (and co-leaders). They can manage the club once they register.

**Leadership activation paths:**

1. **Bootstrap leader registers and claims**: the claim flow presents the leadership for confirmation. On confirmation, the system promotes the bootstrap row to a live `club_leaders` row, and the leader can manage the club.
2. **First affiliated member accepts leadership**: if no bootstrap leader has yet registered, the first member who registers and confirms affiliation with that club is offered leadership during onboarding (if membership Tier 1+). On acceptance, the member is added as a co-leader. Any existing bootstrap leader assignments remain provisional until those candidates register and claim. Clubs may have multiple leaders.
3. **Admin resolution**: admin can supersede bootstrap assignments and appoint any registered member as leader through the standard `club_leaders` workflow.

---

### Legacy member import

**What it covers:** All legacy registered member accounts from the live legacy site.

**Source:** One-time export from the legacy webmaster, used twice: first as a test load, then as the final production import after write freeze.

#### Imported-row model

Each imported legacy member is a **row in `legacy_members`** (see DATA_MODEL §4.14b and DD §2.4). `legacy_members` is a distinct entity from `members`: it does not grant authentication, does not appear on any current-member surface, and is never deleted. It persists as the permanent archival record of a legacy account even after a current member claims it (claim sets `claimed_by_member_id` + `claimed_at`; the row itself is not mutated further).

Fields present on imported rows:

| Field | Notes |
|---|---|
| `legacy_member_id` | Primary key; the old-site user-account id |
| `legacy_user_id` | Legacy username; migration metadata only |
| `legacy_email` | Migration metadata only; used to deliver the one-time claim link. Never a login credential |
| `real_name` | Best available name from export; required (use display_name as fallback). See section 3 for name model notes on imports |
| `display_name` | From export |
| `display_name_normalized` | Derived |
| `city`, `region`, `country` | From export; nullable |
| `bio` | From export if available |
| `birth_date` | From export if available |
| `street_address`, `postal_code` | From export if available |
| `ifpa_join_date` | From export if available |
| `first_competition_year` | Pre-populated from `historical_persons.first_year` via COALESCE at import if a match exists |
| `is_hof` | From export; carries to the claiming member at claim time per §8 OR-merge |
| `is_bap` | From export; carries to the claiming member at claim time per §8 OR-merge |
| `legacy_is_admin` | Old-site admin flag; retained for audit only, never grants live admin |
| `import_source` | `'mirror'` or `'legacy_site_data'` -- indicates origin batch |
| `imported_at` | Timestamp of import |
| `legacy_banned` | Always present in schema with `NOT NULL DEFAULT 0`; populated from export when G3 PASSes (§24), otherwise stays `0` |

Fields explicitly absent from `legacy_members`:

- Login credentials of any kind (no login_email / password_hash / email_verified_at)
- Any live authentication state
- Any mailing list subscriptions
- Any club-governance permissions
- Any current-platform flags (is_admin, is_board, is_deceased, searchable, tier state, Stripe identity, avatar)

The three-table design (DD §2.4) means imported rows never occupy the `members` table; there is no pre-credential placeholder state on `members`. All the above "current-platform" fields belong to the claiming `members` row that is created at registration time and linked to `legacy_members` at claim time via `members.legacy_member_id`.

**Name model note for imports:** The surname constraint (display name must share surname with real_name) applies only to new registrations and profile edits. `legacy_members` rows are exempt because legacy data may contain names that do not conform to the new model. Use "legacy member" (or "imported legacy account") terminology consistently when referring to these rows; the older "imported placeholder" / "pre-credential placeholder" phrasing refers to the superseded two-table design and should not be used in new writing.

#### Tier handling at claim

Under the three-table design, `member_tier_grants` is a ledger keyed by `member_id` — so no ledger row exists for an unclaimed legacy account (there is no member yet). The mapping below is applied at **claim time**: when `M_Claim_Legacy_Account` (or the direct-historical-person claim, or admin manual recovery) completes for a given `legacy_members` row, the claim transaction writes one `member_tier_grants` row with `reason_code = 'legacy.claim_tier_grant'` using the legacy state captured on `legacy_members`. No `active_player_grants` row is written at migration; Active Player is earned post-cutover via the new sources (IFPA-website event attendance, vouching, or first IFPA club join).

The mapping is a single blanket policy approved by IFPA: any legacy state that was active or paid at cutover maps to its lifetime equivalent under the 2026 rules (annual to lifetime); honors override paid history; default is `tier0`.

Tier mapping rules (apply in precedence order; first match wins):

| Precedence | Legacy state at cutover | New `tier_status` | `underlying_tier_status` |
|---:|---|---|---|
| 1 | HoF or BAP (regardless of paid history) | `tier2` | n/a |
| 2 | Was Tier 3 / board at cutover | `tier3` | derived (see below) |
| 3 | Ever paid Tier 2 (annual or lifetime, any state) | `tier2` | n/a |
| 4 | Paid Tier 1 Lifetime (no Tier 2 history) | `tier1` | n/a |
| 5 | Tier 1 Annual currently active at cutover (last attendance or vouch ≤ 365 days before cutover) | `tier1` | n/a |
| 6 | All other legacy states (including expired Tier 1 Annual and members with no IFPA history) | `tier0` | n/a |

Tier 3 underlying derivation (precedence 2 only):

- Old fallback paid tier was Tier 1 (any kind), undefined, or Tier 0 → `underlying_tier_status = 'tier1'` (per IFPA rule §1: a Tier 0 to Tier 3 upgrade gives `tier1` underlying).
- Old fallback paid tier was Tier 2 (any kind), HoF, or BAP → `underlying_tier_status = 'tier2'`.

Required inputs on `legacy_members` (or a migration-only staging table joined to it):

| Field | Type | Purpose |
|---|---|---|
| `legacy_ever_paid_tier2` | INTEGER 0/1 | True if member ever paid any Tier 2 dues. Drives precedence 3. |
| `legacy_ever_paid_tier1_lifetime` | INTEGER 0/1 | True if member explicitly bought Tier 1 Lifetime. Drives precedence 4. |
| `legacy_tier1_annual_active_at_cutover` | INTEGER 0/1 | True if free-earned Tier 1 Annual was active at cutover. Drives precedence 5. |
| `legacy_was_board_at_cutover` | INTEGER 0/1 | True if Tier 3 / board at cutover. Drives precedence 2. |
| `legacy_board_underlying_paid_tier` | TEXT NULL | For board members only: `'none'`, `'tier1'`, or `'tier2'`. Drives underlying derivation. |

These fields are a deferred schema extension on `legacy_members` (or staging), gated on test-load validation of the legacy export. If the extension does not land, the mapping falls back to the **honors-only path** using `legacy_members.is_hof` and `legacy_members.is_bap` (which already exist): HoF/BAP grants `tier2`; everything else grants `tier0`. The honors-only fallback degrades gracefully and remains correct under the 2026 rules.

---

## 3. Name model

Two registration fields:

- **Full legal name** (`real_name`): required. Validation: two words minimum, no digits, no capitalization policing (caps normalized on save).
- **Display name** (`display_name`): optional, defaults to `real_name` if not provided.

**Surname constraint:** Display name must share a surname with real_name. Surname extraction uses suffix stripping (Jr, Sr, II, III, IV). This constraint applies to new registrations and profile edits only. Imported placeholders are exempt.

**Semantic asymmetry:** For new registrations, `real_name` is the legal name supplied by the member. For imported placeholders, `real_name` is the best-available name from the legacy export, which may be a display name, a username, or something else entirely. The field name is the same but the quality and provenance differ.

**Slug lifecycle:** `display_name` and the derived slug are permanent post-registration.

---

## 4. Competition history fields

Two fields on `members`:

- `first_competition_year` (INTEGER, nullable): editable on profile edit. Pre-populated from `historical_persons.first_year` during claim (COALESCE; member value wins if already set). Shown as "Competing since {year}" on profile. Leave blank to hide (opt-out by clearing).
- `show_competitive_results` (INTEGER, default 1): toggle controlling whether results show on public profile. Own profile always shows results to the owner regardless of toggle state.

**Caveat text on results section:** "Published event results only. Historical records may be incomplete."

**Onboarding prompt:** During registration/onboarding, ask the member to confirm their first competition year. (Deferred to onboarding flow implementation.)

---

## 5. Identity and person links

- A single `personHref()` helper generates all person links. If the person has a linked member account (via `members.historical_person_id` FK per DD §2.4 rule 3), the link points to `/members/:slug`. Otherwise, it points to `/history/:personId`. This is implemented at the service contract level; slug resolution uses the FK directly per DD §2.4.
- When a member has a linked historical person whose name differs from the member's display name, the historical name is shown on the member profile.
- **Account deletion reversion:** When a member's PII is purged, `members.historical_person_id` and `members.legacy_member_id` are both cleared, and the corresponding `legacy_members.claimed_by_member_id` is cleared too. Person links that were pointing to `/members/:slug` revert to `/history/:personId`. This is reflected in DD §2.4 rule 5 and the M_Delete_Account user story.

---

## 6. Auto-link: matching legacy_members, historical_persons, and members

Auto-link has two goals under the three-table design (DD §2.4):

1. **Provenance link** — associate each `historical_persons` row with its corresponding `legacy_members` row when the mirror named the legacy account, by setting `historical_persons.legacy_member_id`. This is a data-pipeline step owned by the historical-pipeline track.
2. **Claim link** — at registration or cutover, associate a current `members` row with a `legacy_members` row (setting `members.legacy_member_id` + `legacy_members.claimed_by_member_id`) and, if the claimed legacy account has a provenance link to an HP, additionally set `members.historical_person_id`.

Both uses email as the primary identity anchor. Email lives on `legacy_members.legacy_email` and on the registering member's login email; `historical_persons` does not carry email.

### Tier system

| Tier | Condition | Action |
|---|---|---|
| Tier 1 | Email match + exact name match | Auto-link, no review |
| Tier 2 | Email match + known variant name match | Auto-link, audit-logged |
| Tier 3 | Email match + name mismatch | Admin review (migration-time only) |

**Email match required:** Email is the mandatory identity anchor for all tiers. No auto-link occurs without an email match.

**Multi-HP ambiguity:** when the email anchor matches a single `legacy_members` row but that row's `legacy_member_id` resolves to more than one candidate `historical_persons` row via the variants table, the classifier returns `low` confidence with reason `multiple_name_candidates` regardless of how strong the email anchor is. These cases route to Tier 3 admin review even when the email is exact. Multi-HP ambiguity is a pipeline-quality signal (the variants table or the back-link is over-broad) more than a per-member classification problem; resolution typically requires fixing the underlying data, not the per-member tier.

### Known name variants

Known name variants are stored in a **DB table** (not CSV), seeded from mined data (~290 pairs). Variant categories:

- Accent variations (~26 pairs)
- Prefix variations (~88 pairs)
- Typo corrections (~139 pairs)
- Diminutives (~40 pairs)

The Jody/Jolene Welch class (same person, completely different first name) is only catchable by admin review at migration time, or by user confirmation at registration time.

### Batch auto-link at cutover

At cutover, a batch auto-link pass runs across all `legacy_members` rows:
- Tier 1 and Tier 2: auto-linked immediately to matching `historical_persons` (via shared `legacy_member_id`) and to any pre-cutover registered members (via email match), audit-logged.
- Tier 3: flagged for admin review. These are legacy accounts in the import data whose `legacy_email` matches a registered member's login email but whose name does not. Because the underlying real-world person may not have registered yet, admins resolve these cases (see A_Review_Auto_Link_Matches in USER_STORIES).

### Registration-time auto-link

At first registration, when a member's email matches a `legacy_members.legacy_email` (email is the identity anchor; `historical_persons` does not carry email), the system prompts the user inline:
- **All tiers**: the user is always asked to confirm the link ("We found a legacy account matching your email, is this you?").
- **High confidence (Tier 1/2)**: default answer is yes (pre-checked, confirm to proceed).
- **Low confidence (Tier 3)**: default answer is no (user must actively opt in).
- On confirm, the registration flow writes `members.legacy_member_id` to the matched `legacy_members.legacy_member_id` and sets `legacy_members.claimed_by_member_id` + `claimed_at` atomically. If the claimed `legacy_members` row has a matching `historical_persons.legacy_member_id`, `members.historical_person_id` is also set in the same transaction.
- Decision is audit-logged. No admin queue is involved at registration time; the user is the authority on their own identity.

### Platform code gated on legacy data dump arrival

The following platform-code surfaces are designed against the dump's production-shaped fields. The application code is already in place; what remains gated is the data-side validation against the real dump payload (e.g. `legacy_email` coverage, `name_variants` seeding). Each is a cutover blocker; the gate clears when the code-side smoke runs cleanly against the loaded dump.

1. **Two-step emailed-token claim flow** (G22). `/history/claim` runs the spec'd flow described in §7: lookup form (POST issues a single-use `account_claim` token, non-revealing response) → emailed confirmation link → GET `/history/claim/confirm/:token` peek page → POST `/history/claim/confirm` consume-and-merge handler. Token storage uses `account_tokens.target_legacy_member_id` (SHA-256 hash only); rate-limited per requesting member at 5 attempts per hour. Data-side gate: the dump must populate `legacy_email` on enough rows that token delivery is the operative anchor.
2. **Three-key auto-link classification** (G23). `getAutoLinkClassificationForMember` already queries all three anchors (`legacy_email`, `legacy_user_id`, `legacy_member_id`) per the known-name-variants table above. Data-side gate: the dump payload must populate at least one anchor per identity and the `name_variants` seed (G11) must be in place to drive the Tier 1 / Tier 2 / Tier 3 distinction.
3. **Batch auto-link at cutover** (G24). `OperationsPlatformService.runBatchAutoLink` is the one-time SYS job per "Batch auto-link at cutover" above. It scans every unlinked Tier 0 verified-email member, runs the classifier, and queues high-confidence (Tier 1 / Tier 2) matches into `work_queue_items` (`task_type='auto_link_match'`, `queue_category='membership'`) for `A_Review_Auto_Link_Matches`. Wrapped by `OperationsPlatformService.recordJobRun` for `system_job_runs` lifecycle tracking. Idempotent: re-runs do not double-queue. Data-side gate: must run after the dump load and before §23 State 3 → State 4 transition.
4. **Direct HP claim refinements** (G25). `/history/:personId/claim` confirm page renders the first-name-warning inline; surname-mismatch returns a user-readable error; `claimHistoricalPerson` writes an `audit_entries` row with `first_name_variant` and `transitive_legacy_id` metadata. Data-side gate: full value depends on `name_variants` being seeded (G11) for the first-name-variant detection.

---

## 7. Self-serve legacy claim flow

The claim flow is account-bound and mailbox-verified.

### Prerequisites

- Member must have a live, authenticated modern account
- The `legacy_members` row must exist and be eligible for claim (unclaimed: `claimed_by_member_id IS NULL`)
- The `legacy_members` row must have a usable `legacy_email`

### Flow

1. Member logs into their modern account.
2. Member visits **Link Legacy Account** in profile settings.
3. Member enters one identifier: legacy email address, legacy username, or legacy member ID.
4. System classifies the identifier type and looks up the matching `legacy_members` row.
5. If exactly one eligible row is found, the system creates an `account_claim` token:
   - `member_id` = requesting active modern account
   - target = the matched `legacy_members.legacy_member_id`. Token schema: `account_tokens.target_legacy_member_id` FKs to `legacy_members(legacy_member_id)` ON DELETE NO ACTION.
   - Token is single-use, time-limited (default 24 hours, configurable)
6. System emails the one-time claim link to `legacy_email`.
7. Member opens the link while logged into the same modern account.
8. System validates:
   - Token exists, is unconsumed, is unexpired
   - `token_type = 'account_claim'`
   - Authenticated session matches token `member_id`
   - Target `legacy_members` row still exists and is still unclaimed
9. **Name reconciliation step:**
   - Last-name mismatch between active account and `legacy_members` row: **blocks** (member must update their name or contact admin)
   - First-name mismatch: **warns** but allows proceed
   - Definitions: "last name" is the final whitespace-separated token of `real_name` after NFKC normalization and suffix stripping (Jr, Sr, II, III, IV), unless the legacy-account export provides a structured surname field (in which case that field is authoritative). "First name" is the first token after the same normalization.
10. System presents final confirmation naming the active account that will receive the legacy identity.
11. If club-affiliation suggestions or leadership assignments exist for the claimed identity, member is prompted to review them (see section 9).
12. Member confirms.
13. Merge transaction runs atomically (see section 8).
14. The `legacy_members` row is MARKED CLAIMED — `claimed_by_member_id` set to the requesting member id, `claimed_at` set to now. The row is NOT deleted; it persists as the permanent archival record. Consumed `account_claim` tokens are marked consumed in the same transaction.

### Direct historical-person claim

The legacy-account flow above covers registrants who had an old-site user account (`legacy_members`). Two further situations need handling:

- The registrant was a competitor but never had an old-site user account. A `historical_persons` row exists with no `legacy_member_id` back-link. No email anchor is available.
- The registrant had both an old-site account and a competitive record, but the historical pipeline did not link them (`historical_persons.legacy_member_id IS NULL` or points at a different row). The legacy-account flow claims only the account; the competitive record stays orphaned.

A parallel direct-HP claim flow handles both cases. Entry point is the historical detail page: `GET /history/:personId`. When an authenticated viewer's `real_name` surname matches the HP's `person_name` surname and the HP is unclaimed, the page surfaces a "Claim this identity" CTA. The confirmation page (`GET /history/:personId/claim`) shows the record's country and honor status plus a first-name warning when the member's first name is a variant (Dave vs David, etc.). On `POST /history/:personId/claim/confirm`:

- Surname reconciliation runs again server-side (mismatch blocks even if the form was bypassed).
- If the HP carries a `legacy_member_id` back-link (scenario E) and that legacy row is unclaimed, the claim transitively marks the `legacy_members` row claimed and runs the legacy-field merge, so the member ends up linked to both records. If the legacy row is already claimed by someone else, the HP claim is rejected rather than leaving inconsistent state.
- `members.historical_person_id` is set. HP identity fields are carried forward per the merge rules in §8 ("historical_persons-sourced fields").

Anti-abuse: the same surname rule as §7 gates direct claims. The partial UNIQUE index on `members.historical_person_id` prevents double-claim. A member can claim at most one HP; attempting to claim a second returns a clean 422.

### Non-revealing messaging

User-visible messages must never reveal whether the submitted identifier:

- Matched no row
- Matched multiple rows
- Matched a blocked row
- Matched a row without self-serve eligibility

Recommended message: "If an eligible legacy record was found, a claim email will be sent."

The CSRF Origin-pin middleware (DD §3.3) returns 403 for any state-changing request that omits both `Origin` and `Referer` headers. This response is distinguishable from the non-revealing 200 response above and is an accepted DD §3.3 trade-off; the pin rejects at the perimeter before the claim flow's response logic runs.

### Rate limiting

Claim initiation and resend must be rate-limited per requesting account, per target `legacy_members` row, and per source IP/session. This prevents abuse of legacy mailboxes and limits side-channel enumeration.

### Self-serve ineligibility

A `legacy_members` row is ineligible for self-serve claim when:

- No usable `legacy_email` exists
- Duplicate `legacy_members` rows matched the identifier (test-load uniqueness failure on the partial UNIQUE indexes for `legacy_email` / `legacy_user_id`)
- Already claimed (`claimed_by_member_id IS NOT NULL`)
- `legacy_banned = 1` (if the test load validates this field as trustworthy)
- An admin has flagged the row as review-only

Ineligible cases are directed to manual admin recovery.

---

## 8. Merge rules

The active modern account always survives. The `legacy_members` row is MARKED CLAIMED (`claimed_by_member_id` + `claimed_at` set) and persists as the permanent archival record — it is NOT deleted. Merge copies editable fields from `legacy_members` to the claiming `members` row so the member has their own copy to edit; the `legacy_members` row itself is not mutated beyond the two claim-state columns.

| Field / category | Merge rule |
|---|---|
| `legacy_member_id` | Written to `members.legacy_member_id` (FK to `legacy_members.legacy_member_id`) |
| `legacy_user_id` | Copied to `members.legacy_user_id` as migration metadata; `legacy_members` retains its copy |
| `legacy_email` | Copied to `members.legacy_email` as legacy metadata; never a login credential; `legacy_members` retains its copy |
| Login and auth fields | Active account always wins; nothing copied from `legacy_members` (which has no credentials) |
| `display_name`, `real_name` | Active account always wins |
| `phone`, `whatsapp` | Active account always wins |
| `bio` | Import fills `members.bio` only if active `bio` is empty string |
| `birth_date`, `street_address`, `postal_code` | Import fills `members.*` only if active value is NULL |
| `city`, `region`, `country` | Import fills `members.*` only if active value is NULL or empty |
| `ifpa_join_date` | Copied to `members.ifpa_join_date` if present and active value absent |
| `first_competition_year` | COALESCE: member value wins; import value fills `members.first_competition_year` if member is NULL |
| `is_hof`, `is_bap` | OR semantics — `members.is_hof` / `members.is_bap` set to 1 if `legacy_members` has the flag |
| `historical_person_id` | Set to the HP's `person_id` whenever the claim resolves an HP: (a) legacy-account claim where `legacy_members.legacy_member_id` matches a `historical_persons.legacy_member_id` back-link, or (b) direct HP claim (scenarios D/E). Partial UNIQUE index enforces one live member per HP. |
| `historical_persons`-sourced fields | Whenever `members.historical_person_id` is being set, the same transaction also runs the HP merge: `country` fill-if-empty from `historical_persons.country`; `is_hof` / `is_bap` OR semantics from `hof_member` / `bap_member`; `hof_inducted_year` fill-if-empty from `hof_induction_year`; `first_competition_year` COALESCE from `first_year`. This ensures honors and country propagate onto the member row from whichever archival table carries the authoritative value. |
| `announce_opt_in` | Carry forward only if the validated export contains this field and its semantics are confirmed; unclaimed `legacy_members` rows are never treated as active mail recipients |
| Legacy admin metadata (`legacy_is_admin`) | Copied to `members.legacy_is_admin` as audit/history context only; never auto-promotes live admin role |
| Tier | Write a single `member_tier_grants` row with `reason_code = 'legacy.claim_tier_grant'` applying the blanket mapping defined in §3 "Tier handling at claim". The mapping uses legacy state fields on `legacy_members` (deferred schema extension, gated on test-load validation); honors-only fallback applies if the extension is absent. No conditional "exceeds current" logic. |
| Confirmed club affiliations | Write/update `member_club_affiliations` |
| Confirmed bootstrap leadership | May promote to `club_leaders` if safe; otherwise remains provisional |
| Discarded conflicting imported values | Preserved in audit metadata |

After merge, `legacy_email` may survive on the active account as legacy metadata but is never a login identity.

**Surname enforcement is asymmetric between claim paths** (per DD §3.9): the legacy-account claim path does not enforce surname match (mailbox control of `legacy_email` is the proof step), while the direct-HP claim path does enforce surname match server-side. A member with a name change between their legacy and current accounts can claim the legacy account, but a subsequent direct-HP claim against a historical person with the legacy surname will be blocked. Resolution: admin recovery via `manualLegacyClaimRecovery`.

**Concurrent HP claim races** are resolved by the partial UNIQUE index `ux_members_historical_person_id` plus service-layer error mapping. Two members claiming the same HP simultaneously both pass the in-controller "already claimed" check; the loser is rejected at the INSERT by the index. The service wraps the SQLite `SQLITE_CONSTRAINT_UNIQUE` exception in `ConflictError`; the controller renders the same user-readable "already claimed by another member" 422 response it renders on the synchronous check path. 
---

## 9. Club bootstrap and onboarding

### 9.1 Club classification rules

Every legacy club extracted from the mirror is classified into one of four categories: `pre_populate`, `onboarding_visible`, `dormant`, or `junk`. Classification determines whether the club exists in the live `clubs` table at go-live, appears as a suggestion during registration, is searchable but not suggested, or is excluded from public surfaces entirely.

Classification is deterministic and tunable. Each rule references a named parameter with a documented default. A preview report shows the operator which candidates fall into which category for any parameter set, so cutoffs can be sanity-checked before cutover.

#### Source signals

All signals come from data already produced by the mirror pipeline. No external lookups.

- **Hosting evidence** from the event archive: ever-hosted flag, hosted-event count, last hosted year. The canonical hosting link is the FK `events.host_club_id` to `clubs.id`. When the classifier runs before live `clubs` rows exist, it falls back to a normalized-name match between event host text and candidate names.
- **Page timestamps** from `div#MainModified` on each club page: created year, last-updated year.
- **Listed contact** from `div.clubsContacts`: the contact's mirror member id, captured from `members/profile/{id}`. The contact's last competitive year is resolved by joining the mirror id to `historical_persons.last_year` via the mirror-id to historical-person-id mapping.
- **Affiliated rostered members** from the showmembers page: count of unique member names, count matched to known historical persons, max last competitive year across matched members.
- **Description**: presence and content of `div#ClubsWelcome`.
- **External URL**: presence and verification status of the URL from `div.clubsURL`. URL verification is performed before publication per §9.3.

#### Classification parameters

All parameters are tunable; defaults are documented here.

| Parameter | Default | Drives |
|---|---|---|
| `hosting_recency_years` | 7 | Hosting-alone-sufficient signal |
| `page_edit_recency_years` | 5 | Page-maintenance corroborator at pre-populate |
| `contact_active_recency_years` | 5 | Listed-contact corroborator |
| `member_active_recency_years` | 5 | Affiliated-member signal |
| `new_club_grace_years` | 4 | New-club onboarding-visible carve-out |
| `edited_after_creation_min_year` | 5 | Page-maintenance recency window at onboarding-visible |
| `duplicate_similarity_threshold` | preview-tuned | Cluster detection for hard exclusions |

#### Hard exclusions: duplicates

Two candidates form a duplicate cluster when they share the same country and their normalized names are similar above `duplicate_similarity_threshold`. Normalization strips accents, lowercases, collapses whitespace, removes leading numeric prefixes, and strips trailing punctuation.

When a cluster is detected and source entries agree on substantive identity (city, region, name beyond trivial differences), the classifier auto-merges using these field rules:

- `name`, `city`, `region`, `country`, `contact_member_id`, `external_url`: from the cluster member with the strongest signal evidence (most hosting, largest roster, most recent edit); ties broken by latest update.
- `description`: longest non-empty across cluster.
- `created`: earliest across cluster.
- `last_updated`: latest across cluster.
- Roster and hosted-event credits: union across cluster.
- Source identities: the merged row carries the full list of source `legacy_club_key` values for audit.

When source entries disagree on city, region, or substantive name, the cluster does not auto-merge. The entire cluster routes to admin review for manual resolution. Admin can confirm-merge-anyway, pick a canonical entry, mark one as junk, split into separate clubs, or defer.

Auto-merge is reversible: admin can split a merged row using admin tools, restoring source entries as separate candidates. Both merge and split events are audit-logged.

Wizard resolution treats all source identities as resolving to the merged row: when a registrant cites a source legacy name in Stage 1B, the affiliation maps to the merged row.

#### Hard exclusions: junk

A candidate is marked `junk` when it matches any of the following. Junk candidates remain in the candidate set for audit but are invisible to all non-admin surfaces.

Pattern rules (tunable lists):

- **Exact-match blacklist**: name, after normalization, matches a seed list (`test`, `asdf`, `untitled`, `my club`, `delete me`, `tbd`, `xxx`, `placeholder`, `footbag club`, and similar).
- **Structural patterns**: name shorter than 3 characters, all-numeric, single repeated character, contains placeholder markers (TODO, FIXME, lorem ipsum), name equals the city or country alone.
- **Profanity list**: name contains a term from a tunable multi-language profanity list.

Signal-absence rule fires when all of the following hold simultaneously:

1. Description is empty.
2. Never hosted any event in the legacy archive.
3. No rostered member has a known competitive year.
4. External URL is empty or fails verification.
5. Contact-member-id is empty or cannot be matched to any record.
6. Created more than `new_club_grace_years` ago.
7. Never edited after creation. The legacy CMS records `created` and `last_updated` as separate timestamps; clause 7 fires when `last_updated` is within 24 hours of `created` (tunable tolerance).

Admin override lists:

- **Force-keep**: specific legacy keys immune to both junk rules, used to rescue real clubs that match a pattern or have no signals.
- **Force-junk**: specific legacy keys marked junk regardless of other classification, used for spam the rules missed.

#### Pre-populate rules

A candidate enters `pre_populate` if it survives the hard exclusions and meets any of:

- **PP-hosting**: hosted an officially recorded event in the last `hosting_recency_years` years.
- **PP-contact-corroborated**: listed contact is recognized in `historical_persons` AND last competed in the last `contact_active_recency_years` years AND any one of:
  - Club ever hosted an event.
  - Page edited in the last `page_edit_recency_years` years AND edit was after creation.

The substitute path (any recently active rostered player counts in place of an identified listed contact) is not permitted at the pre-populate tier. Recently active rostered members may corroborate at the onboarding-visible tier only.

Pre-populated candidates may also receive bootstrap leadership rows per §2 (bootstrap rule and leadership activation paths). Bootstrap leadership is independent of classification: clubs lacking a high-confidence leader candidate still pre-populate without a provisional leader.

#### Onboarding-visible rules

A candidate enters `onboarding_visible` if it survives the hard exclusions, fails the pre-populate rules, and meets any of:

- Page lists a contact but the contact is not recognized in `historical_persons`.
- Listed contact is recognized but last competed more than `contact_active_recency_years` ago.
- An affiliated rostered member (not the listed contact) last competed within `member_active_recency_years` years.
- Club ever hosted an event without meeting a pre-populate corroborator.
- Page edited within `edited_after_creation_min_year` years AND edit was after creation.
- Created within `new_club_grace_years` years (too new to judge by other signals).

#### Dormant rule

A candidate enters `dormant` if it survives the hard exclusions, fails all pre-populate and onboarding-visible rules, and has a non-empty description. These are real historical clubs without current activity signals.

#### Classification evidence persistence

Each candidate row carries, alongside `classification`:

- `rules_fired`: the named rules that contributed to the classification (for example `PP-hosting`, `PP-contact-corroborated`, `junk-pattern-blacklist`).
- `evidence_snapshot`: the underlying values at classification time (last hosted year, last edit year, listed contact's last competitive year, member counts, and similar).

Admin reviewing a candidate sees the bucket label and the rationale without re-running the classifier. Schema for these columns is specified in DATA_MODEL `legacy_club_candidates` and `database/schema.sql`.

#### Live content at GoLive (pre-populated clubs)

For each pre-populated candidate, the live `clubs` row carries:

- `name`, `city`, `country`: from the (possibly merged) candidate.
- `region`: from the candidate when present; may be NULL.
- `hashtag_tag_id`: standardized hashtag generated deterministically from `name`.
- `external_url`: published only if URL verification (see §9.3) passes. Failed verifications leave the column NULL; the original value remains on the candidate row for the wizard to surface to the listed contact.
- `description`: published as-is from the legacy data.
- `contact_email`, `whatsapp`: not pre-populated from legacy data.

Description and URL on the live page are subject to the validation loop described in §9.3. The listed contact and the eventual club leader can edit directly; non-contact members can flag inaccuracies and suggest replacements via wizard Stage 1B, Stage 2A, and the M_Join_Club flow, with edits applied only after approval by the listed contact, leader, or admin.

#### Promotion rules

Pre-populated candidates exist as live `clubs` rows at go-live. All other non-junk candidates remain in `legacy_club_candidates` until promoted, archived, or admin-resolved. Promotion paths:

- **Stage 1 confirmation**: when a registrant in Stage 1A or Stage 1B confirms a personal affiliation with an onboarding-visible or dormant candidate, the candidate is promoted to a live `clubs` row using the live-content rules above.
- **Stage 2B confirmation**: when a registrant in Stage 2B confirms an onboarding-visible candidate exists, the candidate is promoted to a live `clubs` row.
- **Stage 3A revival**: when a registrant in Stage 3A confirms a dormant candidate by name search, the candidate is promoted to a live `clubs` row.
- **Admin override**: an admin can promote any non-junk candidate manually via the cleanup queue.

The `legacy_club_candidates` table remains operational until every non-junk candidate has reached a terminal state per §9.4.

#### Pipeline ordering

The classifier depends on `historical_persons` being fully populated, including the club-only members extracted from the mirror (per §9.2). Without those rows, the listed-contact-active and member-active signals are artificially deflated for clubs whose people never competed.

Required order:

1. Extract club-only members into `historical_persons` (§9.2).
2. Classify clubs against the rules above.
3. Auto-merge duplicate clusters; route significant-difference clusters to admin.
4. Mark junk.
5. Persist classification evidence on each candidate.
6. Pre-populated candidates enter the live `clubs` table; non-junk non-pre-populate candidates remain in `legacy_club_candidates`.

### 9.2 Expanding historical_persons for club members

The historical_persons table contains ~4,861 persons drawn from event results. Approximately 1,600 additional people in the mirror appear only as club members (never competed in events). These must be extracted and added to historical_persons to support club affiliation linking at claim time.

### 9.3 Club onboarding flow during registration

Registration is the primary cleanup mechanism for legacy club data. Every registrant goes through a club flow after identity resolution (sections 6-7).

Semantic principle: match each question to the registrant's authority over each club, and match the question wording to the club's epistemic status. Three authority levels:

- **Personal (Stage 1)**: the registrant is named in the legacy data on a specific club (contact, leader, or rostered member).
- **Local (Stage 2)**: the registrant lives in the same country or region as a candidate; cannot speak to internal club affairs but can attest to whether the club is locally known.
- **None (Stage 3)**: no nearby candidates, or all skipped; the registrant initiates name search. If no match results, the wizard ends and the registrant is offered the standard `M_Create_Club` flow as a separate next step.

Junk is excluded from every surface. Pre-populated, onboarding-visible, and dormant candidates are surfaced through different stages with different question wording. Content validation for description and external URL is layered across the wizard and the normal `M_Join_Club` flow; mechanics are described in the content validation loop below.

#### Stage 1: Personal authority

Surface every club where the registrant appears in the legacy data as listed contact, leader / co-leader, or rostered member. All non-junk classifications are shown regardless of category. When the legacy data names a club whose `legacy_club_key` is one of the source identities of a merged candidate (per §9.1 duplicate handling), the wizard resolves to the merged row.

##### Stage 1A: Registrant is the listed contact

Show: "You were listed as the contact for [Club Name] in [City, Country]. What's going on with it now?"

Five paths:

1. **"Still active, I'm still involved."** Confirm existence; promote the candidate to a live `clubs` row if not already; promote the leadership claim per the §2 activation paths: if a bootstrap row exists, it becomes a live `club_leaders` row regardless of registrant tier; otherwise leadership is offered only when the registrant is membership Tier 1+ (Tier 0 listed contacts are added as members until they upgrade). Offer in-flight metadata updates: contact info, description, external URL, location. Edits apply directly.
2. **"Still active, but I've moved on."** Confirm existence; promote to live if not already; mark the listed-contact link as stale. If a successor leader later registers and confirms via Stage 1A path 1, the bootstrap path applies normally.
3. **"Not active anymore."** Confirm historical existence; optional: when it became inactive. Promote the candidate to a live `clubs` row if not already, then set `clubs.status = 'inactive'`. Archival (`status='archived'`) is admin-only.
4. **"I don't recognize this listing."** Logged to the admin cleanup queue (§9.4) as a strong junk signal. May mean either a mislinked roster or a fictitious page.
5. **"Deal with this later."** Save state; resume from the dashboard task widget.

##### Stage 1B: Registrant is affiliated but not the listed contact

Show: "You were listed as a member of [Club Name] in [City, Country]. Are you still involved?"

Five paths:

1. **"Still a member."** Confirm existence; promote candidate to live if not already; mark current affiliation. Leadership is offered only if no active leader exists AND the registrant is membership Tier 1+ (added as co-leader; does not supersede existing leaders). The wizard also surfaces the candidate's current description and external URL; the member can flag inaccuracies and suggest replacement text via the content validation loop below.
2. **"Was a member, no longer."** Confirm existence; mark former affiliation; club stays as-is. Content validation loop available.
3. **"The club isn't around anymore."** Logged to the admin cleanup queue (§9.4).
4. **"I never played at this club."** Logged to the admin cleanup queue (§9.4). Weaker signal than a contact rejection because members may have forgotten a club they briefly joined.
5. **"Defer."** Save and resume.

Authority asymmetry: only Stage 1A path 1 (listed contact, still involved) edits club metadata directly. Stage 1B paths 1 and 2 surface the candidate's current content and accept flags or suggested replacements; those edits apply only after approval by the listed contact, the eventual club leader, or admin (see content validation loop below).

#### Stage 2: Local authority (regional suggestions)

After Stage 1 completes, two sequenced sub-stages with an explicit framing transition. The shift in framing tells the registrant when they are moving from joining a known club to helping validate a candidate listing.

##### Location matching helper

Stage 2 surfacing and the §9.4 admin cleanup queue both depend on "same country", "same region", and "same city" predicates between a registrant's profile and a club's location. Both surfaces use the same normalization:

1. Trim leading and trailing whitespace.
2. Collapse internal whitespace to single spaces.
3. Apply Unicode NFKD normalization.
4. ASCII-fold (strip combining marks; for example "Medellín" becomes "Medellin").
5. Lowercase after the fold.
6. Match by exact string equality on the normalized strings.

Applied per column: `same_country(member, club)` compares normalized `members.country` and `clubs.country`; `same_region` compares `members.region` and `clubs.region`; `same_city` compares `members.city` and `clubs.city`. NULL on either side of a comparison yields no match for that column; the implementation falls back to the next-broader predicate (city → region → country) when finer match cannot be made.

##### Stage 2A: Pre-populated clubs nearby

Framing: "Here are clubs near you in [Region]." The club is already live; the registrant is being asked about affiliation, not existence.

Per-club question: "Are you part of [Club Name] in [City]?"

1. **"Yes, I'm a member."** Mark current affiliation. The wizard also surfaces the club's current description and external URL; the member can flag inaccuracies and suggest replacement text via the content validation loop below.
2. **"I'd like to join."** Render a link to the club's join page on the club detail surface; the wizard records no signal. Joining flows through the regular club-join path, not through the wizard.
3. **"No, and I'm not joining."** No signal needed.
4. **"I've never heard of this club."** Logged to the admin cleanup queue (§9.4); same-city registrants are weighted more during admin review.
5. **Skip.** No signal.

##### Stage 2B: Onboarding-visible clubs nearby

Framing transition: "Here are some additional listings we'd like your help confirming." The club is plausible but unverified; the registrant is being asked about both existence and affiliation.

Per-club question: "We have a listing for [Club Name] in [City], but we're not sure it's still active. Can you tell us anything about it?"

1. **"Yes, it is real and I am part of it."** Promote candidate to live; mark current affiliation. The wizard also surfaces the candidate's current description and external URL; the member can flag inaccuracies and suggest replacement text via the content validation loop below.
2. **"Yes, it is real but I am not part of it."** Promote candidate to live; no affiliation. (Existence confirmation is recorded as distinct from affiliation.) Content validation loop available.
3. **"I have never heard of this club."** Logged to the admin cleanup queue (§9.4).
4. **Skip.** No signal.

Stage 2B has no "I'd like to join" path: an onboarding-visible candidate is not a live `clubs` row yet, so there is nothing to join. A registrant who knows the club exists uses path 1 or 2; a registrant with no information skips.

Dormant and junk candidates are not shown in Stage 2.

#### Stage 3: Discovery and exit

##### Stage 3A: Search by name (dormant revival)

If no direct matches and no regional suggestions resolved the registrant's club, the wizard offers a name search across all non-junk candidates and live clubs. When a dormant candidate matches:

Show: "We have an old listing for [Name] in [Location]. Is it still around?"

1. **"Still active and I am part of it."** Revive: promote candidate to live; mark current affiliation.
2. **"It was real once, but not active anymore."** Promote the candidate to a live `clubs` row with `status='inactive'`. Archival (`status='archived'`) is admin-only.
3. **"Different club, same name."** Mark not-this-one and continue the search.

##### Wizard exit when no match found

If Stage 3A search yields no result the registrant can claim, the wizard concludes with: "We didn't find your club in our records. You can create one from your profile after onboarding." A direct link to the `M_Create_Club` flow is provided. `M_Create_Club` applies the duplicate-prevention rules described in §9.1 against live clubs and the candidate set: exact name plus same country blocks creation and surfaces the existing entry instead; similar matches warn but allow the creator to proceed. The wizard itself never creates a new `clubs` row.

#### Content validation loop

Description and external URL on every live `clubs` row may be edited or replaced through three layered mechanisms:

- **Authoritative editors.** The listed contact (in Stage 1A path 1) and any registered club leader edit description and external URL directly. No approval gate.
- **Suggesting members.** Non-contact members in Stage 1B paths 1 and 2, Stage 2A path 1, Stage 2B paths 1 and 2, and the normal `M_Join_Club` flow can flag the current description or external URL as inaccurate and propose replacement text. The suggestion enters a review queue tied to the club.
- **Approvers.** The listed contact, the club leader, or admin reviews suggested edits and approves or rejects. Approved edits replace the live content; rejected edits are dismissed with audit metadata. Both approval and rejection are audit-logged.
- **External URL verification.** Every URL bound for a live page (whether copied from legacy data at GoLive, edited directly by contact or leader, or approved from a suggestion) must pass URL verification before appearing publicly. Failed verifications leave the column NULL; the proposed URL returns to the suggester or editor for revision.

#### Signals collected from registration

Every wizard interaction produces structured audit-log evidence. Signals that change club state (promote to live, mark affiliation, mark inactive, flag for admin) carry their state change in the same transaction. Signals that don't change state (negative reports, suggested edits awaiting approval) are still recorded for admin review.

| Signal | Source | Effect |
|---|---|---|
| Contact confirms still involved | Stage 1A path 1 | Confirm existence; promote to live if needed; promote leadership; apply direct metadata edits. |
| Contact confirms but has moved on | Stage 1A path 2 | Confirm existence; promote to live if needed; mark listed-contact link stale. |
| Contact reports club inactive | Stage 1A path 3 | Promote to live if needed; set `status='inactive'`. |
| Contact does not recognize listing | Stage 1A path 4 | Logged to admin cleanup queue (§9.4) as strong junk signal. |
| Member confirms current affiliation | Stage 1B path 1 | Confirm existence; promote to live if needed; mark current affiliation. |
| Member reports club gone | Stage 1B path 3 | Logged to admin cleanup queue (§9.4). |
| Member rejects affiliation | Stage 1B path 4 | Logged to admin cleanup queue (§9.4). |
| Member affirms on pre-populated club | Stage 2A path 1 | Mark current affiliation on a live club. |
| Member "never heard of it" on pre-populated club | Stage 2A path 4 | Logged to admin cleanup queue (§9.4); same-city weighted more during admin review. |
| Member existence confirmation on onboarding-visible | Stage 2B paths 1, 2 | Promote onboarding-visible candidate to live. |
| Member "never heard of it" on onboarding-visible | Stage 2B path 3 | Logged to admin cleanup queue (§9.4). |
| Member revives dormant candidate | Stage 3A path 1 | Promote dormant candidate to live. |
| Member confirms dormant club historically real | Stage 3A path 2 | Promote dormant candidate to live with `status='inactive'`. |
| Direct content edit by contact or leader | Stage 1A path 1 or any post-promotion edit by a leader | Direct edit to live `clubs` row. |
| Content flag with suggested edit | Stage 1B paths 1-2, Stage 2A path 1, Stage 2B paths 1-2, `M_Join_Club` | Enters validation queue; applied after approval by contact, leader, or admin. |

#### Constraints

- At most one current club affiliation per member. Confirming a new one converts any existing current to former in the same transaction.
- Clubs may have multiple leaders.
- Leadership is only offered to membership Tier 1+.
- Onboarding-visible and dormant candidates are promoted to live `clubs` rows only via the promotion paths in §9.1 or via admin override.
- Junk candidates are never shown in any wizard surface.
- Dormant candidates are not surfaced as Stage 2 regional suggestions but are reachable through Stage 3A name search.
- The wizard never creates a new `clubs` row directly. New clubs go through `M_Create_Club`, which applies the §9.1 duplicate-prevention rules.
- Direct content edits (description, external URL) require listed-contact, club-leader, or admin authority. Other members propose edits through the content validation loop.

### 9.4 Long-term cleanup

The `legacy_club_candidates` table is not a permanent operational surface. Every non-junk candidate eventually reaches a terminal state: promoted to a live `clubs` row, demoted to dormant, archived, or merged with another club. Admin is the sole decision authority; members provide input through structured flags. There is no time-bounded saturation window; admin reviews the queue at their own pace, and the table remains operational until empty.

Admin's user-facing entry point is `A_Review_Club_Cleanup_Signals` in USER_STORIES.

#### Member flag mechanism

Members can flag any club at any time through three surfaces:

- **Onboarding wizard.** Stage 1A path 4, Stage 1B paths 3 and 4, Stage 2A path 4, and Stage 2B path 3 generate flags as part of completing the wizard (see §9.3 signals table).
- **Normal M_Join_Club flow.** When joining a club, the member sees the current description and external URL and can flag inaccuracies or propose replacement text per the §9.3 content validation loop.
- **Club detail page.** Any member viewing a club can flag the listing as outdated, inactive, duplicate, or wrong.

Every flag is recorded as a structured audit-log row carrying: the candidate or club id, the flagging member id, the flag category (junk, inactive, content-inaccurate, duplicate-of-X, never-heard-of-it, other), an optional note, the location predicates between the flagging member and the club (same-city, same-region, same-country per §9.3 Location matching helper), and a timestamp.

#### Admin cleanup queue

Admin reads from a queue view that aggregates:

- Wizard-generated flags grouped by candidate or live club.
- Member-flagged live clubs from the club detail page or `M_Join_Club` flow.
- Suggested content edits awaiting approval (per §9.3 content validation loop).
- Auto-merge holds (per §9.1 duplicate handling) where source entries disagreed on substantive identity.
- Junk-flagged candidates (per §9.1 junk rules) and any admin force-keep or force-junk requests.
- All non-junk candidates not yet promoted to live `clubs` rows, sortable by category, age, region, and flag count.

Admin sorts and filters this queue at their own pace. There is no automated demotion or time-based escalation.

Admin's available actions per item:

- Promote a candidate to a live `clubs` row.
- Demote a candidate to dormant.
- Mark a live `clubs` row `status='inactive'`.
- Archive a `clubs` row (`status='archived'`).
- Merge two `clubs` rows or two candidates.
- Split a previously auto-merged candidate.
- Approve or reject a suggested content edit.
- Add a candidate to force-keep or force-junk.
- Dismiss a flag with an optional note.

Every admin action is recorded in the audit log.

#### Per-category terminal states

- **Pre-populated**: continues as a live `clubs` row until an admin action moves it. Member flags accumulate in the queue; admin decides whether to demote, mark inactive, archive, or dismiss.
- **Onboarding-visible**: reaches a terminal state when promoted to live (via wizard confirmation per §9.3 or via admin promotion), demoted to dormant (admin only), or archived (admin only).
- **Dormant**: revived through Stage 3A name search (per §9.3) or via admin promotion. Admin may archive a dormant candidate at any time.
- **Junk**: invisible to non-admin surfaces; admin force-keep returns it to the classifier's normal evaluation.

#### Closure

When every non-junk candidate has reached a terminal state, the `legacy_club_candidates` table may be dropped. Until then, it remains operational and queryable by admin through the cleanup queue. There is no fixed deadline; the table's lifetime is bounded by admin's pace.

---

## 10. Onboarding wizard service

The onboarding wizard is the primary surface for cleaning up legacy identity data. A single backend service, `MemberOnboardingService`, owns the per-member task list and orchestrates the wizard flow. Registration is one entry point; the member dashboard is the other.

### Task catalog

Every member has an ordered task list. Each task is `pending`, `skipped`, `completed`, or `not_applicable`. Tasks at cutover:

| Task type | Source flow | Owning service for the underlying logic |
|---|---|---|
| `legacy_claim` | §6 auto-link or §7 self-serve claim | `IdentityAccessService` |
| `club_affiliations` | §9.3 three-stage club flow | clubs service |
| `first_competition_year` | §14.14 metadata | `MemberService` |
| `show_competitive_results` | §14.14 toggle | `MemberService` |

Task ordering is fixed: `legacy_claim`, then `club_affiliations`, then optional metadata. Adding a new task type at a later sprint is a service-internal change (register a handler in the catalog); the service interface does not change.

### Entry points

**Registration** (`/register/wizard/*`): after email verification, the member is routed through outstanding tasks in catalog order. Each task can be completed or skipped. Per-card actions persist as the registrant takes them; closing the browser leaves the task in its current state. Skipping advances to the next task; at the end of the catalog the wizard lands the member on the dashboard. The wizard and the dashboard are alternate UI surfaces over the same service state, so any `pending` or `skipped` task resurfaces in the dashboard task widget for later completion.

**Member dashboard** (task widget on the dashboard view): outstanding tasks render as a list with resume buttons. Completing a task removes it from the widget. The widget is the recovery path for any task skipped or deferred at registration.

### Applicability

The server determines each task's applicability at list construction:

- `legacy_claim`: applicable when the registrant's verified email plausibly matches a `legacy_members` row (auto-link Tier 1/2/3 classification) OR a manual identifier lookup is offered for members whose email did not auto-match.
- `club_affiliations`: applicable to every registrant. New members with no legacy or regional matches still see Stage 3 (start a club).
- `first_competition_year` and `show_competitive_results`: applicable to every registrant; defaults are server-side so completion is optional.

A task that is server-determined `not_applicable` is never shown to the member.

### Audit

Every wizard transition (`startTask`, `submitTaskResponse`, `skipTask`, `completeTask`) appends an `audit_entries` row. The `action_type` catalog lives in DATA_MODEL §4 audit_entries subsection; `club_affiliations` per-stage signal action_types map 1:1 onto the §9.3 "Signals collected from registration" table.

### Storage

`member_onboarding_tasks` (DATA_MODEL §4.27) carries one row per (member_id, task_type) with state and timestamps. The table is permanent operational state, not migration-only.

### Relationship to §9.3

The club onboarding flow described in §9.3 (Stages 1A, 1B, 2A, 2B, 3A, 3B) is the spec for the `club_affiliations` task handler. The wizard service is the orchestration shell; §9.3 describes one task's content. The legacy-account claim flow in §6 and §7, and the direct-HP claim flow in §7, together render as the `legacy_claim` task: one page mixing legacy_members + historical_persons candidates with a manual-id fallback, deep-linking HP cards to `/history/:personId/claim`.

The onboarding wizard subsumes the narrower per-claim club review: every registrant sees the §9.3 flow regardless of whether they claim a legacy account. New members without any legacy match still see Stage 2, Stage 3, and the optional metadata tasks.

---

## 11. Security model summary

- Legacy passwords are never imported, stored, or accepted
- `legacy_email` is migration metadata, not a login credential
- Mailbox control is the proof step for self-serve claim regardless of which identifier type was submitted
- Imported rows cannot log in, cannot be searched, cannot receive member broadcasts
- Claim tokens are account-bound: consuming a token while authenticated as a different account fails
- Rate limiting applies to claim initiation and resend, to password reset and password change, and to registration
- The non-revealing messaging rule applies everywhere in the claim flow
- Bootstrap leadership confers zero live permissions until confirmed on a real modern account
- Auto-link requires email match as identity anchor; no auto-link without email match
- Name validation is loosened for imports (two words + no digits only); surname constraint scoped to new registrations and edits

---

## 12. Admin flows

### Manual claim recovery (A_Manual_Legacy_Claim_Recovery)

When self-serve claim is unavailable, admins can:

- Locate imported rows by legacy identifier
- See why self-serve is unavailable
- Correct `legacy_email` to a reachable mailbox (enabling re-attempt of self-serve)
- Perform a controlled manual merge with a required reason and verification note

Manual recovery does not require second-admin approval. It does require full audit metadata.

Manual recovery never auto-promotes legacy `is_admin` metadata to a live admin role.

### Auto-link Tier 3 review (A_Review_Auto_Link_Matches)

Migration-time admin review of Tier 3 cases from the legacy data import (email match, name mismatch). These are existing IFPA members who have not yet registered, so the system cannot ask them directly.

Admins can:

- Review Tier 3 auto-link cases: each case shows the historical person name, the imported placeholder name, the matched email, and relevant context
- Confirm or reject the proposed link
- All actions are audit-logged

Note: At registration time, Tier 3 cases are handled by inline user prompt (no admin involvement).

### Initial-admin bootstrap (SA_Bootstrap_Initial_Admins)

At cutover, the platform has zero `is_admin=1` rows. The initial Application Administrator(s) are granted out-of-band by a System Administrator per DD §2.9. The grant path is reserved for inception and total-admin-loss recovery; all subsequent grants and revocations use `A_Manage_Admin_Role` (US §6.6).

The grants satisfy go-live gate GV2 ("At least one administrator account provisioned in production and login-tested", §21). They are performed after the production DB is live and seeded, and before any admin-only path is opened to volunteers. Operator-facing procedure for the current bootstrap mechanism is documented in DEV_ONBOARDING.

The bootstrap path is exempt from the Tier 2 / Tier 3 status gate that `A_Manage_Admin_Role` enforces, because tier data may not be populated on day one and the gate exists to govern admin-to-admin grants, not the SysAdmin's out-of-band first grant. The in-app gate remains in force for every grant after the first.

---

## 13. User stories summary

| ID | Actor | Summary |
|---|---|---|
| M_Claim_Legacy_Account | Logged-in member | Link a legacy footbag.org member record to current account via identifier lookup and mailbox verification |
| M_Complete_Onboarding_Wizard | Newly verified member | Move through the onboarding task list, including the §9.3 club affiliation flow |
| M_Edit_Profile | Member | Edit profile including first_competition_year and show_competitive_results |
| M_View_Profile | Member / public | View profile with competition history, historical name, caveat text |
| M_Delete_Account | Member | Delete account; person links revert from /members/ to /history/ |
| A_Manual_Legacy_Claim_Recovery | Admin | Help a member complete legacy claim when self-serve is unavailable |
| A_Review_Auto_Link_Matches | Admin | Review and resolve Tier 3 auto-link cases (email match, name mismatch) |
| A_Review_Club_Cleanup_Signals | Admin | Resolve accumulated wizard signals: demotion candidates, stale unconfirmed pre-populated clubs, unrevived dormant candidates; merge admin-spotted duplicates |

---

## Part B -- Contracts

## 14. Required schema changes

### 14.1 Credential-state invariant: two-way
Two-way CHECK on `members`: live account or purged row. Imported legacy accounts live in `legacy_members` (§2 Legacy member import), not as placeholder rows in `members`.

### 14.2 Location field nullability
`city` and `country` are nullable. `region` was already nullable.

### 14.3 Membership tier and Active Player are read-model-only
Current membership tier reads from `member_tier_current`. Active Player status reads from `member_active_player_current`. Combined gate: `member_membership_status_current`. No cached tier or status columns exist on `members`.

### 14.4 New migration fields on `members`
Added: `legacy_user_id`, `legacy_email`, `ifpa_join_date`, `birth_date`, `street_address`, `postal_code`, `legacy_is_admin`.

### 14.5 `legacy_banned`

The column is always present so the schema is predictable for staging CI and so the loader is uniform across builds:

```sql
legacy_banned INTEGER NOT NULL DEFAULT 0 CHECK (legacy_banned IN (0,1)),
```

Gate G3 (§24) decides loader behavior at test load: when the legacy-account export contains a trustworthy banned/inactive field, the loader populates the column from the export; otherwise the column stays at its `0` default and ineligibility flows through admin review (§7 self-serve ineligibility).

### 14.6 `legacy_member_id` uniqueness
Partial unique index `ux_members_legacy_id` on `members(legacy_member_id) WHERE legacy_member_id IS NOT NULL`.

### 14.7 Provisional uniqueness for `legacy_email` and `legacy_user_id`

Partial unique indexes:

```sql
CREATE UNIQUE INDEX ux_legacy_members_legacy_email
  ON legacy_members(legacy_email)
  WHERE legacy_email IS NOT NULL;

CREATE UNIQUE INDEX ux_legacy_members_legacy_user_id
  ON legacy_members(legacy_user_id)
  WHERE legacy_user_id IS NOT NULL;
```

If the test load disproves either uniqueness assumption (gates G1, G2 in §24), the partial unique index is replaced with a non-unique lookup index plus service-layer ambiguity handling in the claim flow.

### 14.8 `members_searchable` view
Includes `email_verified_at IS NOT NULL` filter.

### 14.9 `account_tokens`: `account_claim` type and target binding
`token_type` CHECK includes `'account_claim'`. `target_legacy_member_id` with `ON DELETE NO ACTION`.

### 14.10 `member_club_affiliations`
Permanent operational table with one-current-club invariant.

### 14.11 `legacy_club_candidates`
Migration-only staging table.

### 14.12 `legacy_person_club_affiliations`
Migration-only staging table with dual partial unique indexes.

### 14.13 `club_bootstrap_leaders`
Operational table with `imported_member_id ON DELETE SET NULL`.

### 14.13a `legacy_members.claim_status`

Optional convenience column for operational queries. `claim_status` is a derived enum (`'unclaimed' | 'claimed' | 'rejected_non_match' | 'admin_review'`) maintained alongside `claimed_by_member_id` and `claimed_at`. Audit-log entries remain the authoritative trail; the column simplifies queries that filter by post-claim outcome without joining `audit_entries`.

### 14.14 `first_competition_year` and `show_competitive_results`
On `members` table.

### 14.15 Known name variants table

New table `name_variants` stores name-equivalence pairs that support auto-link matching (§6) and ongoing claim/registration-time prompts. Seeded at State 1 from mirror-mined pairs (~290); remains live post-cutover so admins and members may record further equivalences as new name collisions surface.

Schema authority: `database/schema.sql`. Contract:

- Two normalized columns (`canonical_normalized`, `variant_normalized`), composite primary key.
- `source` TEXT with CHECK in (`mirror_mined`, `admin_added`, `member_submitted`).
- `created_at` TEXT default `datetime('now')`.
- CHECK self-pairs rejected; both values non-empty.
- Secondary index on `variant_normalized` to support bidirectional lookup.

Relation semantics: symmetric. Storing `('robert', 'bob')` is equivalent to storing `('bob', 'robert')`; lookups must check both columns. Do not insert both directions.

Normalization is application-side (NFKC + lowercase + whitespace-collapse + trim) before any insert or lookup; the table stores only normalized forms.

Not prefixed `legacy_*` because the table is a permanent name-matching utility, not a migration-only staging artifact. Compare with `legacy_club_candidates` (migration-scope, resolves into `clubs` at State 2). Name variants have no resolution step; the pairs themselves are the permanent artifact.

---

## 15. Data pipeline inventory

### Curated CSVs (human-curated, source of truth)

Location: `legacy_data/event_results/canonical_input/`

- `persons.csv`: historical persons with IFPA IDs, honors, stats
- `events.csv`, `events_normalized.csv`: historical events
- `event_results.csv`: result entries
- `event_result_participants.csv`: participant-to-result mappings
- `event_disciplines.csv`: discipline breakdowns

`persons.csv` is in git; future relocation to external storage is tracked in IMPLEMENTATION_PLAN.md.

### Extracted CSVs (from mirror, treated as source of truth)

Location: `legacy_data/seed/`

- `clubs.csv`: club identities extracted from mirror
- `club_members.csv`: club membership associations from mirror (~2,400 associations)

### Generated CSVs (pipeline output, regenerable)

Location: `legacy_data/event_results/seed/mvfp_full/`

- `seed_events.csv`, `seed_event_disciplines.csv`, `seed_event_results.csv`, `seed_event_result_participants.csv`, `seed_persons.csv`

### Pipeline scripts

**Event results pipeline** (`legacy_data/event_results/scripts/`):

- `06_build_mvfp_seed.py`: build MVFP subset seed
- `07_build_mvfp_seed_full.py`: build full seed from canonical inputs
- `08_load_mvfp_seed_full_to_sqlite.py`: load full seed into SQLite
- `09_patch_missing_person_ids.py`: patch missing person IDs in result participants
- `verify_mvfp_seed.py`: seed verification

**Club and member scripts** (`legacy_data/scripts/`):

- `extract_clubs.py`, `load_clubs_seed.py`: club extraction and loading
- `extract_club_members.py`, `load_club_members_seed.py`: club member extraction and loading
- `seed_members.py`: dev seed account creation
- `generate_world_map_svg.py`: SVG map generation

**Note:** Unchecked-in extraction code exists for the mirror member pipeline. Pipeline scripts are owned by the historical-pipeline track; coordinate before touching.

---

## 16. Migration vs operational table classification

| Table | Category | May be dropped |
|---|---|---|
| `legacy_club_candidates` | Migration-only staging | Yes, after all onboarding-visible and dormant clubs are either created or abandoned, and all bootstrap decisions are finalized |
| `legacy_person_club_affiliations` | Migration-only staging | Yes, after all affiliation suggestions are resolved |
| `club_bootstrap_leaders` | Operational, migration-origin | Yes, after all provisional rows reach a terminal state (`claimed`, `superseded`, or `rejected`) |
| `member_club_affiliations` | Permanent operational | Never |
| `name_variants` | Permanent operational | Never (name-matching utility; see §14.15) |

---

## 17. Audit requirements

No migration dashboard is required. The existing append-only audit history records all migration events.

Scope note: this section enumerates migration-specific events only. General auth audit events (e.g. `password_changed`, `login_rate_limit_exceeded`, `account_locked`) are out of scope here; they share the same append-only audit history but are defined in the security-model documentation.

Required event types:

- `legacy_claim_requested`
- `legacy_claim_email_sent`
- `legacy_claim_email_resent`
- `legacy_claim_completed`
- `legacy_claim_blocked`
- `legacy_claim_manual_recovery`
- `legacy_club_bootstrap_created`
- `legacy_club_bootstrap_promoted`
- `legacy_club_bootstrap_superseded`
- `auto_link_tier1_applied`
- `auto_link_tier2_applied`
- `auto_link_tier3_queued`

Required metadata per event where applicable:

- Active member ID
- Imported member ID
- `legacy_member_id`
- Masked `legacy_email`
- Submitted identifier type
- Merge field summary
- Tier-change summary
- Club IDs involved
- Provisional bootstrap outcome
- Admin reason / verification note
- Auto-link tier and match details (for auto-link events)

---

## 18. What we need from the legacy-site webmaster

The legacy-site webmaster (contact at `brat@footbag.org`, DD §5.5) is the current operator of the live legacy site. The coordination contract is scoped to:

1. **Test export**: a full export of live legacy member records, in the canonical export format (item 2 below), for validation purposes only (no production changes). A 10-row sample is delivered and validated before the full export runs, so format mismatches are caught early.

2. **Canonical export format**: CSV, UTF-8 encoded, LF line endings, RFC 4180 quoting, empty string for NULL, ISO 8601 dates (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ for timestamps), comma delimiter. The same format is used for the test export and the final production export.

3. **Field semantics confirmation**: for each export column, especially:
   - Legacy member ID (field name, format, uniqueness guarantee)
   - Legacy username (field name, uniqueness guarantee)
   - Legacy email (field name, uniqueness guarantee)
   - Account registration / signup date (distinct from `ifpa_join_date`; tracks tenure on the legacy site)
   - Last-activity timestamp (most-recent login or session activity, if available; used to size auto-link review queue and admin-recovery capacity)
   - Tier / membership fields (current tier, expiry dates, tier history if available)
   - Banned, inactive, is_admin flags (presence, reliability, semantics)

4. **Password-column exclusion**: confirm explicitly that the export contains no password columns (no `password_hash`, no salt, no iteration count, no recovery-question answers). Password material is never imported (DD §3.9). The exclusion is a hard contract, not an implicit assumption.

5. **Namespace agreement for `legacy_member_id`**: confirm that the integer IDs in the export are the same integers used in the legacy site's `members/profile/{id}` URLs (the mirror-derived namespace). If they diverge, resolve before any test import; otherwise every `historical_persons.legacy_member_id` → `legacy_members.legacy_member_id` back-link in the pipeline is invalidated. Coordination notes also tracked in `legacy_data/IMPLEMENTATION_PLAN.md` Still-to-do item 12.

6. **Namespace verification protocol**: a 10% spot-check sample of `legacy_member_id` values from the test export is cross-referenced against the mirror-derived baseline ID range. The webmaster's export ID range and the mirror's must overlap; new IDs that exist only in the export are expected (post-mirror accounts) but the overlap region must agree row-for-row.

7. **Banned-member product semantics**: confirm whether the `banned` flag is reliable and document the operational handling. Default product behavior (DD §3.9, GOVERNANCE §10): a banned member may submit the claim form, but the service layer blocks completion when `legacy_banned=1` and routes to admin recovery. The `legacy_banned` flag is not directly UI-visible to the claiming member; the admin queue carries the reason and outcome.

8. **Data-quality metric requests**: an estimate of the percentage of `legacy_email` addresses that are plausibly still deliverable (informs auto-link coverage projections), and the last-activity timestamp per row (informs admin-recovery capacity planning).

9. **Final production export**: after write freeze, identical format to the test export.

10. **Write-freeze coordination**: legacy site goes into maintenance / read-only mode before the final export.

11. **Legacy database retention**: keep the legacy database available for at least 30 days after cutover for manual recovery reference.

12. **DNS cutover coordination**: confirm timing and TTL reduction window.

The webmaster is not asked to produce club data; that comes from the mirror pipeline (§19).

---

## 19. What we need from the historical-pipeline maintainer

The historical-pipeline work:

1. **Club extraction into pipeline**: move mirror club extraction scripts into the historical pipeline; club identity normalization, affiliation inference, leadership inference. Classify clubs per the rules in section 9.1 (requires: `last_updated` and `created` from `clubs.csv`, most recent hosted event year from event HTML cross-reference, club contact member IDs matched to `historical_persons.last_year`, member counts, and description presence). Set `bootstrap_eligible` for pre-populated clubs with high-confidence leader candidates per section 2 bootstrap rule
2. **Mirror member extraction** into `historical_persons`: ~1,600 club-only members from the mirror who never appeared in event results
3. **Known name variants table**: seeded from mined data
4. **World records CSV**: for the records page
5. **Data review confirmation**: confirming legacy data is complete and member-list presentation is reviewed (unblocks members ungating)

---

## 20. Design decisions affected

The following design decisions require updating or creation before or after go-live. Do not update without explicit human approval per project rules.

| Decision | Change required |
|---|---|
| DD 3.8 (account security tokens) | `account_claim` token type with dual binding (`member_id` + `target_legacy_member_id`) and `ON DELETE NO ACTION` |
| DD 3.9 (security / privacy) | Add: legacy passwords never imported; `legacy_email` is migration metadata only; mailbox control is proof step |
| DD 6.5 (legacy data migration) | Full replacement per this document |
| DD (new) name model | Two-field name model, surname constraint, slug lifecycle, import exemption |
| DD (new) auto-link | Tiered auto-link system with email anchor, known variants table, batch vs registration-time split |
| DD (new) competition history | `first_competition_year` and `show_competitive_results` fields, opt-out semantics, caveat text |

---

## Part C -- Go-live

## 21. Go-live blocker index

All pass/fail go-live blockers in one view. Gate definitions and failure handling live in the referenced sections. Each entry shows the blocker ID, a one-line criterion, the section with full detail, and the operational-state transition it blocks.

This list is comprehensive for go-live cutover blockers. Broader product work that does not gate cutover lives in `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, and the active-slice trackers in `IMPLEMENTATION_PLAN.md` files.

### Data-quality, pipeline-output, and code-behavior gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| G1 | `legacy_email` unique where non-NULL | §24 | State 2 → State 3 |
| G2 | `legacy_user_id` unique where non-NULL | §24 | State 2 → State 3 |
| G3 | Trustworthy `banned` field in export | §24 | State 2 → State 3 |
| G4 | Profile/contact field shape and null quality | §24 | State 2 → State 3 |
| G5 | Legacy member ID quality | §24 | State 2 → State 3 |
| G6 | Tier-state mapping inputs | §24 | State 2 → State 3 |
| G7 | Mirror-derived club normalization quality | §24 | State 2 → State 3 |
| G8 | High-confidence bootstrap leader candidates | §24 | State 2 → State 3 |
| G9 | Bootstrapped clubs produce valid pages | §24 | State 2 → State 3 |
| G10 | Outbox → SES → inbox smoke passes end-to-end | §24 | State 3 → State 4 |
| G11 | `name_variants` seeded (~290 pairs) | §24 | State 1 → State 2 |
| G12 | ~1,600 club-only persons extracted into `historical_persons` | §24 | State 1 → State 2 |
| G13 | `club_bootstrap_leaders` populated | §24 | State 1 → State 2 |
| G14 | `persons.csv` count reconciled | §24 | State 1 → State 2 |
| G15 | World records platform export produced | §24 | State 1 → State 2 |
| G16 | `run_pipeline.sh full` produces full output | §24 | State 1 → State 2 |
| G17 | Claim flow anti-enumeration invariant holds | §24 | State 2 → State 3 |
| G18 | Rate limiting active on claim / registration / password-reset | §24 | State 2 → State 3 |
| G19 | Registration-time auto-link wired and exercised | §24 | State 2 → State 3 |
| G20 | Data review sign-off: legacy data complete, member-list presentation reviewed; recorded as an audit_entries row | §24 | State 1 → State 2 |
| G21 | `legacy_user_id` and `legacy_email` populated on canonical `persons.csv` where mirror provides them | §24 | State 1 → State 2 |
| G22 | Two-step emailed-token claim flow live; direct-lookup shortcut retired | §24 | State 2 → State 3 |
| G23 | Three-key auto-link classification wired (`legacy_email` + `legacy_user_id` + `legacy_member_id`); name_variants in play | §24 | State 2 → State 3 |
| G24 | Batch auto-link SYS job ready to run at cutover; results queue into `A_Review_Auto_Link_Matches` | §24 | State 3 → State 4 |
| G25 | Direct HP claim refinements live: first-name warning UX, surname-mismatch messaging, audit metadata | §24 | State 2 → State 3 |

### External dependencies

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| EX1 | `footbag.org` domain owned by IFPA, DNS pointing to new platform | §22 Phase 4 prereqs | State 3 → State 4 |
| EX2 | SES production access granted for AWS account | §22 Phase 4 prereqs | State 3 → State 4 |
| EX3 | `noreply@footbag.org` verified as SES sender identity with DKIM on DNS | §22 Phase 4 prereqs; §28.5 | State 3 → State 4 |
| EX4 | ACM certificate for `footbag.org` issued in `us-east-1` and attached to CloudFront | §28.9 | State 3 → State 4 |
| EX5 | Stripe production live API keys + webhook secret in Parameter Store; webhook endpoint configured; one end-to-end webhook delivery confirmed | §28.9 | State 3 → State 4 |
| EX6 | Cloudflare Email Routing rule for `noreply@footbag.org` active and tested end-to-end | §28.5 | State 3 → State 4 |
| EX7 | SES bounce/complaint SNS subscription tested with synthetic bounce; hard-bounce suppression confirmed in app | §28.5 | State 3 → State 4 |

### Legacy-site webmaster coordination

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| WM1 | Test export delivered and validated, including a 10-row sample in the canonical format | §18 items 1, 2 | State 1 → State 2 |
| WM2 | Legacy-export field semantics confirmed (IDs, username, email, registration date, last-activity, tiers, banned flags) | §18 item 3 | State 1 → State 2 |
| WM3 | Password-column exclusion confirmed (no `password_hash`, salt, or related material in export) | §18 item 4 | State 1 → State 2 |
| WM4 | Namespace agreement for `legacy_member_id` confirmed and verified by 10% spot-check | §18 items 5, 6 | State 1 → State 2 |
| WM5 | Banned-member product semantics confirmed; admin-recovery routing documented | §18 item 7 | State 1 → State 2 |
| WM6 | Data-quality metrics delivered (deliverability estimate, last-activity timestamps) | §18 item 8 | State 1 → State 2 |
| WM7 | Final production export delivered post-write-freeze, identical format to test export | §18 item 9 | State 3 → State 4 |
| WM8 | Write-freeze / maintenance mode coordinated on legacy site | §18 item 10 | State 3 → State 4 |
| WM9 | Legacy database retention committed (minimum 30 days post-cutover) | §18 item 11 | State 3 → State 4 |
| WM10 | DNS cutover timing and TTL reduction window coordinated | §18 item 12 | State 3 → State 4 |

### Operational readiness gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| OR1 | Data backup and disaster recovery | §28.1 | State 3 → State 4 |
| OR2 | Observability and monitoring readiness | §28.2 | State 3 → State 4 |
| OR3 | Edge and origin security | §28.3 | State 3 → State 4 |
| OR4 | IAM least-privilege scope-down | §28.4 | State 3 → State 4 |
| OR5 | Email deliverability operations | §28.5 | State 3 → State 4 |
| OR6 | Scheduled maintenance jobs | §28.6 | State 3 → State 4 |
| OR7 | Secrets rotation | §28.7 | State 3 → State 4 |
| OR8 | Production database restore drill completed against a copy of production data | §28.1 | State 3 → State 4 |
| OR9 | Post-launch admin curator authoring scheme designed and implemented | §28.14 | State 3 → State 4 |
| OR10 | Pre-flip DB snapshot captured, integrity-verified, restored against staging in dry-run | §28.1a | State 3 → State 4 |
| OR11 | Legacy archive subdomain reachable end-to-end (S3, CloudFront, signed-cookie key group, DNS, cookie-Domain widening) | §28.15 | State 3 → State 4 |

### Code governance gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| GV1 | GitHub `main` branch protection enforced (PR required, status checks must pass, linear history) | §28.10 | State 3 → State 4 |
| GV2 | At least one administrator account provisioned in production and login-tested | §28.10 | State 3 → State 4 |

### Compliance gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| LEG1 | Privacy policy, Terms of Service, and cookie banner (if applicable) reviewed and accessible from the production site footer | §28.11 | State 3 → State 4 |

### Pre-cutover revert and rotation checklist

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| PC1 | JWT TTL revert to DD §3.4 24h baseline | §28.8 | State 3 → State 4 |
| PC2 | SES sender cutover to `noreply@footbag.org` | §28.8 | State 3 → State 4 |
| PC3 | Lightsail SSH firewall rule restore | §28.8 | State 3 → State 4 |
| PC4 | SES sandbox-mode flip | §28.8 | State 3 → State 4 |
| PC5 | Production Terraform region fix (us-east-1) | §28.8 | State 3 → State 4 |
| PC6 | Preview fixture scrub | §28.8 | State 3 → State 4 |
| PC7 | Production-first-admin SSM-token route lands per DD §2.9 | DD §2.9, DEVOPS_GUIDE §17.8 | State 3 → State 4 |
| PC8 | Admin-seeding shortcuts removed from staging deploy path | §28.8 item 8 | State 3 → State 4 |

### Retirement gate

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| R1 | QC subsystem retired (routes, code, tables, tests) | §29 | State 3 → State 4 |

---

## 22. Phasing

### Phase 1: No external data

Name model, slug lifecycle, person links, historical name display, `first_competition_year`, `show_competitive_results`.

### Phase 2: Historical-data pipeline

- Club extraction integrated into historical pipeline
- Mirror member extraction into `historical_persons` (~1,600 club-only members)
- Known name variants table seeded from mined data
- World records CSV
- Data review confirmation

### Phase 3: Needs the legacy-account export

- Legacy member import script
- Email-verified claim flow
- Auto-link matching (batch at cutover)
- Name reconciliation in claim flow

### Phase 4: Go-live

External prerequisites that must land before Phase 4 starts:

- **`footbag.org` domain owned by IFPA** and pointing DNS to the new platform. Blocks both the DNS switch and cutover of `SES_FROM_IDENTITY` to `noreply@footbag.org`.
- **SES production access granted** for the AWS account. Sandbox caps are 200 sends/day and require per-recipient verification; the post-cutover notification batch is incompatible with sandbox. Production access is an AWS support ticket with a typical 24-48h approval window; start early (see State 3 readiness checklist).
- **`noreply@footbag.org` verified in SES** (sender identity) and runtime-role `ses:SendEmail` IAM policy pinned to that sender identity ARN (post-production-access, the recipient-identity permission check goes away, so the sender-only pin is sufficient and least-privilege).
- **JWT session TTL at the DD §3.4 baseline** (24h). Staging observability-tuned values must be reverted in code before the cutover deploy.
- **Email-delivery smoke passes end-to-end** on the final pre-cutover release: enqueue a test row via the outbox, worker drains, SES accepts, recipient inbox receives. See §24 gate G10.
- **Lightsail SSH firewall rule restored** via `terraform apply` from `terraform/staging/` (removes Console override of the port-22 rule and returns to `operator_cidrs`-constrained ingress). See §28.8.

Phase 4 activities:

- DNS switch
- Post-cutover notification batch (emails to all imported placeholders with reachable `legacy_email`). Batching respects SES send-rate quotas; each send appends an audit entry per §17; hard-bounce suppression (per §28.5) governs retry eligibility; batch success is a gating signal that the migration loop has closed.
- Admin review of Tier 3 auto-link cases from the legacy data (migration-time only)
- Registration-time auto-link with inline user prompt (all tiers)

---

## 23. Operational states

### State 0: Current state

- Legacy site live, accepting writes
- New platform deployed on staging
- Phase 1 code complete

### State 1: Historical-data pipeline complete

- `legacy_club_candidates` populated and classified per section 9.1 rules (pre-populate, onboarding-visible, dormant; junk excluded)
- `legacy_person_club_affiliations` populated
- Bootstrap eligibility decisions made for pre-populated clubs
- Review report reviewed; admin decisions logged for ambiguous cases
- Known name variants table seeded

### State 2: Phase 1 complete (test load)

- Legacy webmaster provides test export
- Imported member rows inserted into staging `members`
- Tier grants written for all imported rows
- `legacy_email` and `legacy_user_id` uniqueness verified
- Banned field evaluated
- Club bootstrap candidates resolved against imported placeholder rows
- `club_bootstrap_leaders` rows created in staging
- Batch auto-link pass run on staging
- Full claim flow rehearsed end-to-end on staging
- All validation gates (section 24) evaluated

### State 3: Phase 2 complete (go-live preparation)

- DNS TTL reduced (24 to 48 hours before go-live; see §28.12 for the full sequence)
- All migration scripts finalized
- Admin review of unresolved high-impact clubs complete
- Final cutover checklist confirmed
- Legacy webmaster briefed on final export and freeze timing
- SES production-access ticket filed and approved (24-48h lead time; see Phase 4 prerequisites)
- `noreply@footbag.org` sender identity verified in SES; `SES_FROM_IDENTITY` on the production host updated; runtime-role `OutboundEmail` IAM policy resource ARN set to the production sender identity
- Email-delivery smoke passes end-to-end (§24 gate G10)

### State 4: Phase 3 (production cutover)

1. Legacy webmaster places legacy site in write freeze / maintenance mode
2. Legacy webmaster produces final production export
3. New platform imports legacy member rows
4. New platform writes tier grants
5. New platform creates bootstrapped `clubs` rows for approved candidates
6. New platform creates `club_bootstrap_leaders` rows
7. New platform runs batch auto-link (Tier 1 and Tier 2)
8. New platform runs validation checks
9. DNS switch to new platform (see §28.12)
10. Admin verifies the new platform is operational (smoke checks, critical flows confirmed, including one real end-to-end outbox → SES send to a verified admin inbox)
11. Admin triggers post-cutover notification batch

### State 5: Post-cutover

- New platform live
- Legacy database retained by the legacy webmaster for reference and targeted recovery
- Members self-serve claim their legacy accounts over time
- Admins handle manual recovery cases and remaining Tier 3 cases from migration
- Leadership activations accumulate as members register and claim

### State 6: Migration complete

- All high-priority legacy accounts claimed or manually recovered
- All bootstrap clubs resolved or admin-reviewed
- All Tier 3 auto-link cases resolved (by admin review or member registration)
- Legacy database retired

---

## 24. Validation gates

The following must be confirmed at the test load before go-live. These are not open design questions; they are data-quality checkpoints.

| Gate | Description | Failure handling |
|---|---|---|
| G1 | `legacy_email` is unique where non-NULL | Replace provisional unique index with non-unique lookup + ambiguity handling |
| G2 | `legacy_user_id` is unique where non-NULL | Same as G1 |
| G3 | Live export contains a trustworthy `banned` field | If absent or unreliable, omit `legacy_banned` column; restrict claim for unverifiable rows via admin review instead |
| G4 | Shape and null quality of profile/contact fields | Adjust import logic and field mapping |
| G5 | Legacy member ID quality (format, completeness, uniqueness) | Resolve before final export |
| G6 | Tier-state mapping inputs (current tier, expiry, history) | Confirm Tier 2 annual expiry handling; may require simplified fallback |
| G7 | Mirror-derived club normalization quality | Increase manual review threshold |
| G8 | Sufficient high-confidence club-leader bootstrap candidates | Adjust bootstrap threshold or expand manual review scope |
| G9 | Bootstrapped clubs produce valid, non-broken club pages | Fix UI before go-live |
| G10 | Outbox → SES → recipient inbox path works end-to-end on the pre-cutover release (enqueue test row, worker drains within 60 seconds, SES returns MessageId, message arrives in recipient inbox) | Debug before cutover; common causes are IAM Resource scope, SES sandbox state, worker container env vars, worker event-loop bugs |
| G11 | `name_variants` seeded with ~290 mined pairs (§14.15) | Auto-link Tier 2 coverage drops; Tier 3 admin queue expands; document shortfall in State 1 review |
| G12 | ~1,600 club-only persons extracted into `historical_persons` per §9.2 | Classification signals (active-players, contact-competed) run with reduced coverage; onboarding-visible list may shrink |
| G13 | `club_bootstrap_leaders` populated for pre-populated clubs meeting the §2 bootstrap rule | Leadership activation defers to path 2 (first affiliated member accepts leadership) for affected clubs |
| G14 | Canonical `persons.csv` row count reconciled against `historical_persons` population; any accepted discrepancy documented and signed off | Block at test load until reconciled; unexplained delta risks missing or duplicated historical identities |
| G15 | World records export produced in platform format and loads into the records schema cleanly | Records page launches empty or incomplete; fix export before go-live or hide the records entry point |
| G16 | `run_pipeline.sh full` produces events, results, persons, clubs (classified), bootstrap leaders, club-only persons, variants, and records in one run | Document the multi-step manual sequence required and capture sign-off at State 1; single-command regeneration is the long-term target |
| G17 | Claim flow anti-enumeration invariant holds per §7 "Non-revealing messaging" (identical UX across matched-none, matched-multiple, matched-blocked, matched-ineligible, and matched-eligible) | Collapse divergent response shapes before go-live; side-channel enumeration otherwise possible |
| G18 | Rate limiting active on claim initiation, claim resend, registration, and password-reset per DD §3.8 | Block go-live until limiters engage; legacy mailbox abuse and enumeration otherwise unmitigated |
| G19 | Registration-time auto-link per §6 wired into `verifyEmailByToken`; Tier 1, Tier 2, and Tier 3 paths all exercised at test load | Registration remains a manual cleanup path for legacy-match cases; admin Tier 3 queue grows |
| G20 | Data review sign-off: confirmation that legacy data is complete and member-list presentation is reviewed (unblocks members ungating). Sign-off is recorded as a row in `audit_entries` by the historical-pipeline maintainer | Withhold members ungating until sign-off; historical-pipeline maintainer owns sign-off per §19 item 5 |
| G21 | `legacy_user_id` and `legacy_email` populated on canonical `persons.csv` where mirror provides them | Claim flow lookup falls back to `legacy_member_id` only; auto-link Tier 1/2 coverage drops because the email anchor is missing |
| G22 | Two-step emailed-token claim flow verified end-to-end at test load: `/history/claim` lookup form enqueues a token; token link routes to confirm-and-merge handler; SHA-256 token storage; rate-limited per requesting member, per target row, per session/IP per §6 | Block cutover if verification reveals direct-lookup leakage; mailbox proof must gate all claims |
| G23 | Three-key auto-link classification covers `legacy_email`, `legacy_user_id`, `legacy_member_id` anchors with the seeded `name_variants` table driving Tier 1 / Tier 2 differentiation per §6 | Auto-link coverage drops to the email-only mirror baseline; Tier 2 variant matches surface as Tier 3 admin-queue work |
| G24 | `OperationsPlatformService` batch auto-link SYS job ready to run once at cutover; high-confidence matches queue into `A_Review_Auto_Link_Matches`; one `system_job_runs` row recorded per run. **Requires G23 PASS** so the three-key classification and seeded variants table are in place; running G24 against an email-only classifier silently halves coverage | Block until G23 PASSes; batch auto-link defers to per-member registration-time auto-link only until then |
| G25 | `/history/:personId/claim` confirm page renders the first-name-variant warning inline; surname-mismatch messaging is user-readable; audit metadata captures the variant used for direct-HP claims per §7 | Direct HP claim remains usable but klunky; surname-block failures surface as raw `ValidationError` text rather than the spec'd confirm-page warning |

**Tuning authority for G8:** Bootstrap threshold adjustments at test load are a joint decision between the primary maintainer and the historical-pipeline maintainer. Raising the threshold (more conservative) is routine and requires no additional sign-off. Lowering the threshold below a minimum acceptable value (to be set during State 2 review if lowering is needed) requires IFPA board sign-off, because lowering materially expands who gains bootstrap leadership and the live club-management permissions that follow at first claim.

---

## 25. Data quality from persons.csv analysis

Current analysis of `legacy_data/event_results/canonical_input/persons.csv`:

- 4,861 total persons
- 1,743 with IFPA IDs (legacy member IDs)
- 290 mined name variant pairs:
  - ~26 accent variations
  - ~88 prefix variations
  - ~139 typo corrections
  - ~40 diminutives
- 103 garbled parse-artifact entries needing cleanup
- Jody/Jolene Welch class: same person, completely different first name; only catchable by admin review (Tier 3)

---

## 26. Rollback posture

**Pre-flip:** abort, fix, retry. No data has moved yet.

**Post-flip path A, non-catastrophic failures (most cases):** fix-forward. Production deploys a patch; no rollback. Covers UI bugs, slow queries, non-critical alarm noise, and anything that does not corrupt member identity, claim state, or audit integrity.

**Post-flip path B, catastrophic failures (rare, narrowly defined):** DNS revert plus DB restore from the pre-flip snapshot. Catastrophic is one of:

- schema corruption that prevents reads;
- identity-data corruption that misroutes claims or auto-link writes;
- write-amplification that produces malformed audit or queue entries at scale.

Decision authority is the primary maintainer.

The pre-flip snapshot is the load-bearing artifact for path B. It is taken after the final legacy data import completes in State 4 step 8 and before verification step 10. It lives in the cross-region disaster-recovery bucket with S3 Object Lock (DD §6.8). Creation, integrity verification, and a successful dry-run restore against staging are preconditions; see §28.1a.

**Rollback window:** 48 hours post-flip. After 48 hours the new platform is authoritative regardless of what surfaces; reversal requires explicit joint sign-off from the primary maintainer and the legacy webmaster, and is treated as a manual recovery exercise rather than a rollback.

**Legacy DB retention:** the legacy webmaster retains the legacy database for at least 30 days after cutover for reference and targeted manual recovery. This is sequential to and distinct from the 48-hour rollback window: retention enables one-off historical lookups by admin; rollback is the time-bounded path back to the legacy site as authority.

**Member writes lost on restore:** any claim, registration, or club-affiliation write that lands between snapshot capture and rollback is lost on restore. The 48-hour window plus the platform's traffic profile bound the affected count; affected members re-do the action after the platform stabilizes.

**No automated rollback** is provided after the DNS switch. Path B is operator-driven via the runbook in `docs/DEVOPS_GUIDE.md`.

---

## 27. Open issues deferred to test load

1. **`announce_opt_in`**: Not in the current schema. If the legacy-account export contains a meaningful communication-preference field, add the column to `members` and carry it forward at claim. Gated entirely on the test load.
2. **`legacy_banned`**: Column added only if the legacy-account export contains a trustworthy banned/inactive field. See section 14.5.

**Standing consistency note:** The product-facing term for `legacy_user_id` is "legacy username." This must be applied consistently in all UI copy, error messages, and documentation regardless of the column name.

---

## 28. Operational readiness for go-live

Non-data workstreams that must close before production cutover. Each subsection states the go-live gate (what must be true); operator procedures live in `docs/DEV_ONBOARDING.md` (Path G / Path I) and routine runbooks live in `docs/DEVOPS_GUIDE.md`. This section holds only what is required to green-light §23 State 3 / State 4.

### 28.1 Data backup and disaster recovery

Gate: host-side SQLite backup producer runs on a schedule, ships to S3, and emits `BackupAgeMinutes`; a full restore drill has been rehearsed end-to-end on staging; a production-data restore drill has been completed against a copy of production data with recovery time meeting the §10.1 RPO/RTO targets; the backup-age CloudWatch alarm (`enable_backup_alarm = true`) is enabled and has emitted a non-alarm state; the cross-region DR bucket has Object Lock configured per `docs/DEVOPS_GUIDE.md` §10.3 (Object Lock can only be enabled at bucket creation, so retrofitting requires bucket recreation). Recovery targets: 5–10 min RPO, ~5 min RTO per `docs/DEVOPS_GUIDE.md` §10.1. Procedure: `docs/DEV_ONBOARDING.md` §7.4 (setup); `docs/DEVOPS_GUIDE.md` §10 (runbook).

### 28.1a Pre-flip DB snapshot

Gate: a dedicated snapshot of the production SQLite DB is captured after the final legacy data import completes (State 4 step 8) and before verification (State 4 step 10). The snapshot is the load-bearing artifact for the rollback path B in §26. Requirements:

- Snapshot is written to the cross-region DR bucket (S3 Object Lock, `docs/DEVOPS_GUIDE.md` §10.3) under a path distinct from the routine backup stream, so the snapshot is not aged out by the routine retention policy.
- Integrity verification is automated: snapshot SHA-256 is recorded, a `PRAGMA integrity_check` run against a temporary copy returns `ok`, and the row counts for `members`, `legacy_members`, `historical_persons`, `clubs`, `audit_entries` are recorded in the cutover audit trail.
- A dry-run restore against staging has been completed end-to-end within the past 7 days, using the same restore procedure that will be invoked for path B. The dry-run runbook lives in `docs/DEVOPS_GUIDE.md` and includes the steps to re-point the app at the restored DB.
- The snapshot's Object Lock retention is set to at least 60 days so the rollback window plus retention plus operator review headroom is comfortably covered.

Procedure: `docs/DEVOPS_GUIDE.md` (snapshot creation + restore runbook).

### 28.2 Observability and monitoring readiness

Gate: CloudWatch agent installed on the runtime host; `enable_cwagent_alarms = true` applied and CPU / memory / disk alarms reachable via SNS with operator subscription confirmed; CloudFront 5xx alarm active; minimal operator dashboard documented. Procedure: `docs/DEV_ONBOARDING.md` §7.6 (install + enablement); `docs/DEVOPS_GUIDE.md` §12 (operating rules).

### 28.3 Edge and origin security

Gate: CloudFront enforces `X-Origin-Verify` on origin requests; Nginx rejects direct-to-origin traffic without the header; the S3 maintenance bucket with Origin Access Control is addressable via an ordered cache behavior at `/maintenance.html`. Direct origin bypass is no longer possible. Procedure: `docs/DEV_ONBOARDING.md` §7.2; `docs/DEVOPS_GUIDE.md` §7.2 / §7.3.

### 28.4 IAM least-privilege scope-down

Gate: `footbag-operator` removed from `AdministratorAccess` and moved to a least-privilege policy covering only services the project uses (Lightsail, CloudFront, S3, SSM, KMS, SNS, CloudWatch, self-IAM for rotation); the Lightsail host's `ec2-user` default account retired in favor of named operator accounts; source-profile IAM user's access keys on a documented 90-day rotation cadence; all runtime-role IAM policies (SSM read, S3 snapshots, SES send, KMS sign) declared in Terraform HCL so `terraform apply` is a safe operation that cannot silently drop a Console-added capability. Procedure: `docs/DEV_ONBOARDING.md` §7.3; `docs/DEVOPS_GUIDE.md` §5.7.

### 28.5 Email deliverability operations

Gate: SES is out of sandbox with production access granted; `noreply@footbag.org` verified as a canonical SES identity with DKIM on DNS; the Cloudflare Email Routing rule for `noreply@footbag.org` is active and tested end-to-end (Cloudflare receives the SES verification email and forwards it to the operator inbox); an SNS topic subscribes to SES bounce and complaint events; the bounce/complaint webhook end-to-end has been tested with a synthetic bounce against `bounce@simulator.amazonses.com` and the resulting suppression-row write confirmed in the app; the application processes those events into hard-bounce suppression and complaint tracking; email-delivery smoke (validation gate G10) has passed end-to-end on a pre-cutover release. Procedure: `docs/DEV_ONBOARDING.md` Path I (activation).

### 28.6 Scheduled maintenance jobs

Gate: login rate-limit cooldown is wired to the `login_cooldown_minutes` setting; daily `account_tokens` cleanup job runs on the host and removes expired entries; job execution is observable via standard application logs or CloudWatch. Procedure: in-code + `docs/DEVOPS_GUIDE.md`.

### 28.7 Secrets rotation

Gate: JWT signing-key rotation procedure with 24h overlap is documented and drilled against staging before production cutover (generate new key, stand it up alongside current key, flip the active signer, retire the old key after the overlap window); session JWT refresh re-issues the cookie when `exp` is within 6h per DD §3.4 so users are not silently logged out at the 24h TTL boundary; `SESSION_SECRET` rotation runbook exists. Source-profile access-key rotation is covered under §28.4. Procedure: `docs/DEVOPS_GUIDE.md` §5.

### 28.8 Pre-cutover revert and rotation checklist

Before Phase 4 cutover, the following staging-observability-only deviations must be reverted and rotations completed:

1. JWT TTL revert: `DEFAULT_TTL_SECONDS` in `src/services/jwtService.ts` and `SESSION_COOKIE_MAX_AGE_MS` in `src/middleware/auth.ts` restored to the DD §3.4 24h baseline. Session JWT refresh (§28.7) must land before this revert to avoid silent mid-session logouts at the 24h boundary.
2. SES sender cutover: re-run `docs/DEV_ONBOARDING.md` §8.8 against the canonical address; switch `SES_FROM_IDENTITY` in `/srv/footbag/env` and the `OutboundEmail` IAM policy `Resource` ARN from the staging sender to the canonical `noreply@footbag.org` identity; restart the app. Env + IAM only, no code. Blocked on IFPA domain acquisition.
3. Lightsail SSH firewall rule restore: `terraform apply` from `terraform/staging/` to remove the Path H §8.10 browser-SSH override (loosened beyond `operator_cidrs`) and return to the `operator_cidrs`-constrained ingress.
4. SES sandbox-mode flip: `SES_SANDBOX_MODE` in `/srv/footbag/env` cleared (removed or set to `0`) once SES production access has been granted for the account. Clears the staging-warning card rendered on email-gated pages (DD §5.6).
5. Production Terraform region fix: change `terraform/production/variables.tf:14` region default from `us-east-2` to `us-east-1` before any `terraform apply` from `terraform/production/`. Staging is `us-east-1` per §28.2 / `docs/DEVOPS_GUIDE.md` §3.3; applying as-is would create cross-region production resources.
6. Preview fixture scrub: `legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py` inserts a "Footbag Hacky" fixture (fake event, discipline, result, HP record with HoF flag, and result-entry participant) alongside the preview-user account. Acceptable in staging for UX preview; must not reach the production DB. Either condition the fixture block on an env flag (e.g. `FOOTBAG_SEED_PREVIEW_FIXTURE=1`) or delete the block in the production-cutover data pass.
7. Restore live `mailto:admin@footbag.org` in `/legal`: swap the `.contact-pending` span used in Privacy, Terms, and Copyright contact lines for a live `mailto:admin@footbag.org` once SES sender cutover (item 2) is complete and the canonical mailbox is active. Template-only change; no service or DB work.
8. Dev autologin revert + dev-admin shortcuts scrub:
    - **Dev autologin** (`FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID`) is a dev-only surface admitted by `authMiddleware()` only when `FOOTBAG_ENV=development`. The boot-time `env.ts` guard refuses the marker outside development. Revert: delete the dev branch in `src/middleware/auth.ts` and the env-config guard.
    - **Dev-admin shortcuts (register-allowlist + dev-admin seed).** Both `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` (registration-time allowlist via `src/dev-admin-shortcuts/runtime.ts`) and `--seed-dev-admins` (direct-insert via `src/dev-admin-shortcuts/seed.ts`) are migration-window-only on the staging path and must be removed at cutover. Replacement: production-first-admin via the SSM-token `/admin/bootstrap-claim` route (DD §2.9, DEVOPS_GUIDE §17.8); staging adopts the same SSM-token path post-cutover. At cutover, the deploy script stops writing `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` into the staging `/srv/footbag/env`, and `deploy_to_aws.sh --seed-dev-admins` is tightened to dev-only target. Both mechanisms remain in code for dev workstations, gated by `FOOTBAG_ENV=development`. Production-DB verification per DEVOPS_GUIDE §17.7 still applies: marker counts for `reason_code LIKE 'dev_admin_%'`, `action_type LIKE 'grant_admin_dev_%'`, `created_by LIKE 'dev-admin-shortcuts/%'`, and `action_type = 'dev_admin_invariant_repair'` must all be zero before the cutover deploy (cf. `scripts/audit-dev-admin-shortcuts.sh`). SSM-token route implementation is a prerequisite tracked in `IMPLEMENTATION_PLAN.md`.

Sign-off on this checklist is a prerequisite for §23 State 3 → State 4 transition.

### 28.9 Production-specific prerequisites

Gate: ACM certificate for `footbag.org` issued in `us-east-1` and attached to the production CloudFront distribution; production KMS asymmetric signing key, source-profile IAM user, and runtime role provisioned (production mirror of Path H §8.6–§8.9, per Path I §9.8); Stripe production live API keys and webhook secret stored in Parameter Store at `/footbag/production/stripe/*`; Stripe webhook endpoint URL registered in the Stripe Dashboard against the production domain; one end-to-end Stripe webhook delivery confirmed against the production endpoint before cutover. Procedure: `docs/DEV_ONBOARDING.md` Path I (§9.4 ACM via DNS delegation, §9.8 production KMS / runtime role, §9.13 Stripe production activation).

### 28.10 Code governance

Gate: GitHub `main` branch protection enforced (PR required, status checks must pass, linear history); the required-check job names match the names in `.github/workflows/ci.yml`; at least one administrator account provisioned in the production database and login-tested. Procedure: `docs/DEV_ONBOARDING.md` §7.3 (branch protection).

### 28.11 Compliance

Gate: privacy policy, Terms of Service, and cookie banner (if applicable) reviewed by the IFPA board and accessible from the production site footer. Prepared by IFPA, reviewed by the maintainer; not technical work.

### 28.12 DNS changeover sequence

The cutover from the legacy DNS host to the production CloudFront distribution requires coordinated TTL reduction, ACM validation, and the registrar update itself. The legacy webmaster owns the registrar update; the maintainer owns the production CloudFront target.

Pre-cutover (T-7d to T-24h):

1. Confirm the registrar of `footbag.org` and the current authoritative TTL on the apex and `www` records. Run `dig footbag.org NS` to confirm the authoritative nameservers; verify the legacy DNS host matches the registrar-delegated NS records (if the registrar delegates to a different DNS provider, ACM CNAME validation must be placed at the actual authoritative host, not the registrar's nameservers).
2. Schedule TTL reduction with the legacy webmaster: at T-48h, lower TTL to 300 seconds on apex `footbag.org` and `www.footbag.org` records. The reduction must propagate fully (current TTL window) before the cutover act, or clients continue resolving the old IP for the prior TTL window.
3. Issue ACM certificate for `footbag.org` and `www.footbag.org` in `us-east-1` via DNS validation (ACM-CloudFront colocation requirement). The legacy webmaster adds the validation CNAMEs at the authoritative DNS host identified in step 1. Wait for `Status: ISSUED` before scheduling cutover; validation propagation typically completes within 30 minutes once CNAMEs are live but may take several hours. If `Status: PENDING_VALIDATION` persists beyond 4 hours, the most common cause is the validation CNAME being placed at the wrong DNS host (registrar vs delegated provider); re-verify step 1.
4. Attach the ACM certificate to the production CloudFront distribution (`aws_cloudfront_distribution.main.aliases = ["footbag.org", "www.footbag.org"]`, `viewer_certificate.acm_certificate_arn = ...`). CloudFront propagation 5-15 minutes.
5. **MX record handoff plan**: confirm with the legacy webmaster whether inbound mail to `footbag.org` role addresses (`brat@`, `directors@`, etc.) routes via the legacy mail server or Cloudflare Email Routing (DD §5.5). The MX records are updated at the cutover act below; the plan documents which provider handles inbound after T0 and which addresses transition. If Cloudflare Email Routing is the target, the receiving rules must be configured and tested end-to-end before T0 (cross-references §28.5 EX6).
6. Maintainer and webmaster sync on a cutover-day window (low-traffic UTC slot, both reachable for ~4h).

Cutover act (T0):

1. Final write-freeze check: legacy site is in read-only mode and the final export has been imported into production.
2. Maintainer confirms production health: production smoke test green; `aws cloudfront get-distribution --id <prod-id>` shows `Status: Deployed`; `/health/ready` returns 200; manual login flow verified.
3. Webmaster updates `footbag.org` and `www.footbag.org` records to the production CloudFront distribution domain (CNAME for `www`; ALIAS-equivalent for the apex, depending on the legacy DNS host's apex support).
4. Webmaster updates MX records per the plan from pre-cutover step 5: either retain legacy MX (deferred mail-stack cutover) or switch to Cloudflare Email Routing now. Verify inbound delivery end-to-end before declaring T0 complete.
5. Maintainer monitors propagation with `dig +short footbag.org` from multiple resolvers (1.1.1.1, 8.8.8.8, local) at 30-second intervals until consistent (typically 5-15 minutes given the pre-shrunk TTL).
6. First-traffic verification: hit `https://footbag.org/health/ready` and a representative authenticated route; confirm 200 and expected content.
7. Webmaster keeps the legacy site online but read-only for the 48h rollback window (per §26).

Post-cutover (T+0 to T+48h):

- Maintainer monitors CloudFront error rate (CWAgent dashboard) and SES sender reputation for the post-cutover notification batch (§22 Phase 4).
- TTL stays at 300 seconds for 48h to enable fast rollback.
- At T+48h: if no rollback was triggered, raise TTL back to a steady-state value (3600 or higher); the webmaster proceeds with legacy-site retirement per §14 minimum-30-day retention.

Rollback (T+0 to T+48h, see §26):

- Webmaster reverts the apex and `www` records to the legacy site's IP.
- Propagation completes within 5 minutes given the lowered TTL.
- Beyond T+48h, fix-forward only; reversal requires joint sign-off (per §26).

Coordination contract (per §14, §18):

- Lead-time: webmaster needs at least 7 days advance notice to schedule the TTL pre-shrink and the cutover-day window.
- ACM validation CNAMEs are added by the webmaster (the records live at the legacy DNS host) but issued by the maintainer's AWS account.

Sign-off on this sequence is a prerequisite for §23 State 3 → State 4 transition.

Procedure: `docs/DEV_ONBOARDING.md` Path I (§9.4 ACM via DNS delegation); production cutover runbook in `docs/DEVOPS_GUIDE.md`.

### 28.12a Legacy URL forwarding for in-flight emails

Old footbag.org emails (account verification, forum-reply pointers, share-event links) reference legacy URL patterns like `/members/profile/{legacy_member_id}`, `/clubs/{slug}`, and various forum paths. After cutover, these emails continue circulating in inboxes for months or years.

Forwarding contract for the production app:

- Member profile patterns: `/members/profile/:legacyMemberId` resolves via 301 to the slug-based URL `/members/:slug` when the legacy ID maps to a non-deleted member (via `members.legacy_member_id`). Unmapped IDs return 404 with a friendly "this legacy account is no longer routable" page.
- Club patterns: legacy `/clubs/:slug` URLs resolve to the new club page if the slug survived normalization; otherwise to archive.footbag.org for the historical mirror or a 404 page when neither exists.
- Forum patterns: legacy forum thread URLs redirect to archive.footbag.org where the post is preserved as a static mirror.
- Unknown patterns: 404 with a generic legacy-URL message that directs the visitor to footbag.org.

The legacy site stays online but read-only for the 48h rollback window (§28.12 cutover act step 7); after T+48h the legacy host is decommissioned and `footbag.org/*` is served entirely by the new platform. Redirect-handler coverage in the production app must therefore cover every legacy URL pattern that meaningfully forwards to a new destination, validated at test load by replaying a stored sample of legacy URLs against the production app.

Procedure: redirect handlers live in the public router; the sample-replay validation step is part of the test-load checklist.

### 28.13 Curator content seeding

Gate: the system member account (FH; DD §2.8) is seeded into the production DB and its curator content (avatar in `/curated/avatars/`, landing-page demo loops in `/curated/landing/`, event-pinned photos in `/curated/events/`, tutorials and records in `/curated/freestyle_tricks/`, etc.) is loaded into the production media bucket before public DNS cutover. Landing pages and curator-tagged surfaces must resolve to the production media bucket, not 404. The deploy orchestrator runs `scripts/seed_fh_curator.py` against the prod DB and `aws s3 sync` against the prod media bucket; verify via post-deploy smoke check. Curator content extends by adding file-paired sidecars under `/curated/{category}/`; no manifest edits are needed.

Constraint to resolve before go-live: the curator seeder (`src/services/curatorSeedService.ts`) calls `curatorMediaService.uploadVideo` directly, running ffmpeg in-process on the seeder host with the full source buffer in RAM. This bypasses the async media-job lifecycle (DD §6.8) that backs the admin curator video upload form. Acceptable today because seeding runs operator-side with adequate memory and no HTTP-timeout window. The production seed manifest may include larger source files than dev, and the same OOM hazard the admin path was redesigned to avoid applies on a memory-constrained host. Required: route the seeder through the same `media_jobs` lifecycle, posting source bytes to S3 via presigned PUT and dispatching transcode to the worker container. Must land before State 3 → State 4.

### 28.14 Post-launch admin curator authoring

Pre-launch, admin curator UIs at `/admin/curator/upload`, `/admin/curator/galleries`, and `/admin/curator/media/:id/edit` write to the `/curated/` filesystem (URL-reference sidecars at `/curated/{category}/*.meta.json` and gallery sidecars at `/curated/galleries/<slug>.json`, per DD §1.13) plus DB. Pre-launch loop: admin works on localhost, commits `/curated/` changes to git, deploys; the seeder re-runs from the committed sidecars on each `bash deploy_to_aws.sh`. This loop ends at go-live: admins must work against prod, but the prod container has no git path back to the repo, so any sidecar edit on the running app diverges from the in-git source of truth.

Required: design and implement a post-launch admin-curated content authoring scheme. Candidate directions: (a) make the DB the source of truth for FH-owned authoring and run periodic exports to git as backup, (b) add an admin "publish to git" surface that commits and PRs from the running app via a service account, (c) split runtime mutations from build-time authoring entirely (lock the running app to read-only on `/curated/` and require admins to author via a separate workflow). Design decision required; chosen direction is reflected in DD §1.13 and SERVICE_CATALOG `CuratorMediaService`. Must land before State 3 → State 4.

### 28.15 Legacy archive subdomain readiness

Per DD §6.4, archive.footbag.org serves the static legacy HTML mirror under member-only access enforced by CloudFront signed cookies. The archive launches at cutover.

Gate, all of the following are provisioned and verified end-to-end:

- **Archive S3 bucket** (Terraform `aws_s3_bucket.archive` or equivalent) is private behind Origin Access Control. Bucket policy permits only the archive CloudFront distribution to read. Versioning and Object Lock per the standard private-bucket pattern.
- **CloudFront key group** (`aws_cloudfront_public_key` + `aws_cloudfront_key_group`) is provisioned in Terraform. The trusted-signer keypair private half is stored in AWS Secrets Manager (or SSM SecureString) scoped to the main app's runtime IAM role; the public half is registered in the key group.
- **Archive CloudFront distribution** is provisioned with: the archive S3 bucket as origin via OAC; the cache behavior naming the key group in `trusted_key_groups`; 1-year edge TTL per DD §6.2 immutable-archive guidance; ACM cert for `archive.footbag.org` attached; custom 403 error response redirecting to `https://footbag.org/login?return=archive.footbag.org`.
- **DNS record** for `archive.footbag.org` (Route 53 ALIAS or CNAME) pointing at the archive distribution.
- **Cookie-Domain widening** deployed: both `footbag_session` and the new CloudFront signed cookie use `Domain=.footbag.org` so the archive subdomain receives them. The widening lands AFTER the CSRF Origin-pin middleware (DD §3.3) is in production and BEFORE archive.footbag.org receives its first authenticated request.
- **Archive HTML mirror content** uploaded to the bucket. All video content is mp4, all images are jpg, no JavaScript present (DD §6.4 contract).
- **End-to-end auth flow tested**: unauthenticated request to `https://archive.footbag.org/some-path` returns CloudFront's signed-cookie-missing 403 with the redirect to the main-site login; an authenticated member's request returns 200 from S3 origin.

Procedure: Terraform provisioning and end-to-end test runbook live in `docs/DEVOPS_GUIDE.md`.

---

## 29. QC subsystem retirement (go-live gate)

The internal QC subsystem (`/internal/net/*`, `/internal/persons/*`, and supporting code, tables, and tests) is a hard go-live gate: no production deployment may carry QC code, routes, or tables. Deletion is not a post-launch tidy-up. Scope at retirement time: every `/internal/*` route, its controller and service code, its Handlebars views, its schema tables, its `db.ts` prepared-statement groups, and its tests.

Sign-off on QC retirement is a prerequisite for §23 State 3 → State 4 transition.
