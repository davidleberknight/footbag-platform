# Footbag Website Modernization Project -- Migration Plan

**Document Purpose:**

This document is the source of truth for go-live readiness: legacy data migration design (streams, claim flow, auto-link, merge rules, club bootstrap, name model, competition history), operational readiness gates (backup, observability, edge security, IAM, email ops, maintenance jobs, secrets rotation, pre-cutover reverts), and the phasing, operational states, and validation gates that govern both. For functional requirements, see `USER_STORIES.md`. For privacy and visibility policy, see `DATA_GOVERNANCE.md`.

---

## Table of contents

### Part A -- Design

1. [Executive summary](#1-executive-summary)
2. [Migration sources](#2-migration-sources)
3. [Tier handling at claim](#3-tier-handling-at-claim)
4. [Name model](#4-name-model)
5. [Competition history fields](#5-competition-history-fields)
6. [Identity and person links](#6-identity-and-person-links)
7. [Auto-link: matching legacy_members, historical_persons, and members](#7-auto-link-matching-legacy_members-historical_persons-and-members)
8. [Self-serve claim flow](#8-self-serve-claim-flow)
9. [Merge rules](#9-merge-rules)
10. [Club bootstrap and onboarding](#10-club-bootstrap-and-onboarding)
11. [Onboarding wizard service](#11-onboarding-wizard-service)
12. [Security model summary](#12-security-model-summary)
13. [Admin flows](#13-admin-flows)
14. [User stories summary](#14-user-stories-summary)

### Part B -- Contracts

15. [Required schema changes](#15-required-schema-changes)
16. [Data pipeline inventory](#16-data-pipeline-inventory)
17. [Migration vs operational table classification](#17-migration-vs-operational-table-classification)
18. [Audit requirements](#18-audit-requirements)
19. [What we need from the legacy-site webmaster](#19-what-we-need-from-the-legacy-site-webmaster)
20. [What we need from the historical-pipeline maintainer](#20-what-we-need-from-the-historical-pipeline-maintainer)
21. [Design decisions affected](#21-design-decisions-affected)

### Part C -- Go-live

22. [Go-live blocker index](#22-go-live-blocker-index)
23. [Phasing](#23-phasing)
24. [Operational states](#24-operational-states)
25. [Validation gates](#25-validation-gates)
26. [Data quality from persons.csv analysis](#26-data-quality-from-personcsv-analysis)
27. [Rollback posture](#27-rollback-posture)
28. [Open issues](#28-open-issues)
29. [Operational readiness for go-live](#29-operational-readiness-for-go-live)
30. [QC subsystem retirement (go-live gate)](#30-qc-subsystem-retirement-go-live-gate)

---

## How to read this

The plan is long; readers usually need a subset. Where to start, by role:

- **Cutover operators** (running the migration day): §22 (gate index), §24 (state transitions), §25 (validation gates), §27 (rollback), §29 (operational readiness).
- **Identity / claim review** (auto-link, evidence tiers, anti-enumeration): §6 (identity model), §7 (auto-link), §8 (self-serve claim), §9 (merge rules), §13 (admin flows).
- **Club bootstrap review** (classification rules, wizard stages, leadership activation): §2 (bootstrap rule), §10 (club bootstrap and onboarding).
- **Legacy-site webmaster coordination**: §19 (coordination contract). §28 carries the open items pending the webmaster's read of community dynamics.
- **AWS / DNS / email infrastructure**: §29 (operational readiness). §29.12 and §29.12a carry the DNS + MX disposition.
- **Schema changes**: §15 (schema delta against the current DB).
- **Open issues / decisions still in flight**: §28.

For functional requirements, see `USER_STORIES.md`. For privacy and visibility policy, see `DATA_GOVERNANCE.md`.

---

## Part A -- Design

## 1. Executive summary

This plan covers everything required to reach production go-live for the new footbag.org platform. Three workstreams run in parallel:

1. **Historical pipeline**: persons, events, results, honors (Hall of Fame, Big Add Posse — abbreviated BAP throughout), clubs, club affiliations, and club leadership. Person truth comes from human-curated CSV. Club data comes from mirror extraction scripts that are part of the same pipeline. The pipeline also creates historical person records for ~1,600 club-only members who never competed in events.
2. **Legacy member accounts**: login-bearing accounts from the current live legacy site. Require a one-time legacy-account export from the legacy-site webmaster and a secure voluntary claim flow.
3. **Operational readiness** (primary maintainer + AWS + GitHub): backup/restore, observability, edge security, IAM scope-down, email deliverability operations, scheduled maintenance jobs, secrets rotation, and the pre-cutover revert checklist. See §29.

The historical pipeline and the legacy-account import share `legacy_member_id` as the cross-source identity key; that key links `historical_persons` to `legacy_members` as provenance. Live `members` rows are linked later through registration plus mailbox-verified legacy claim, direct historical-person claim, or pre-cutover registered-member auto-link, with email as the primary anchor for tying a live account to a legacy account. Go-live completes when all data is reconciled, operational readiness gates are green, and the DNS switch has occurred.

Additionally, the platform introduces a tier mapping at claim time, a name model, competition history fields, and an auto-link system that connects historical persons to modern member accounts. These are described in detail in sections 3 through 7.

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
- Club classification per section 10.1 rules (pre-populate, onboarding-visible, dormant, or junk)
- Bootstrap eligibility decision for pre-populated clubs, based on leader candidate availability (section 2 bootstrap rule)
- Review report including:
  - Per-club classification with which rule(s) matched
  - Clubs with no credible leader candidate
  - Clubs with multiple competing leader candidates
  - People with multiple apparent current-club indications (store all affiliations with `resolution_status = 'pending'`; the member resolves at claim time by choosing up to two current clubs and marking the rest as former)
  - Unmapped club aliases or duplicate club identities
  - Recommended split per classification rules (section 10.1): pre-populate / onboarding-visible / dormant / junk

#### Bootstrap rule

A pre-populated club (under the `PP-hosting` and `PP-contact-corroborated` rules in §10.1) receives bootstrap leader candidate rows when one or more legacy members exhibit structural signals of leadership for that club. Clubs that fail the pre-populate rules are classified instead as onboarding-visible, dormant, or junk and do not receive bootstrap leader rows.

**Structural signals (drive classification):**

- `listed_contact` - the legacy club page names this person as contact
- `affiliation` - a row exists in `legacy_person_club_affiliations` linking this person to this club
- `hosting` - the club hosted IFPA-registered events during this person's active competitive years
- `roster` - the legacy member roster lists this person as a club member
- `mirror_text` - the club page narrative mentions this person by name or known alias

**Modifiers (context only, do not change classification):**

- `tier_signal` - paid Tier 1+ legacy status at cutover
- `recent_activity` - last competitive year overlaps the club's activity window
- `geographic_alignment` - legacy member city or country matches the club's city or country

Per-`(member, club)` classification follows combination gates over the structural signals:

| Classification | Rule |
|---|---|
| strong | `(listed_contact AND affiliation) OR (hosting AND roster) OR (listed_contact AND hosting)` |
| weak | exactly one structural signal present (including `mirror_text` alone) |
| none | zero structural signals present |

Modifiers display alongside signals in member-facing and admin surfaces but do not promote weak to strong or demote strong to weak. The `club_bootstrap_leaders.confidence_score` column persists as a sortable informational attribute and is not the classification gate. The gate rule set is rules-as-code; revisions follow observed false-positive data.

#### Leadership model

Bootstrap-eligible clubs are created with:

- A live `clubs` row
- One or more `club_bootstrap_leaders` candidate rows representing potential leaders, each carrying the structural-signal evidence and classification (strong, weak, none) per the bootstrap rule above

`club_bootstrap_leaders` rows are candidate leadership attributions, not active leadership. Promotion to active leadership writes a `club_leaders` row through one of the activation paths below.

**Leadership activation paths:**

1. **Bootstrap leader registers and claims**: the onboarding wizard presents classified `(member, club)` candidates. On user confirmation or correction, the bootstrap row promotes to a live `club_leaders` row in a silent audit-logged transaction, regardless of classification strength; the classification (strong, weak, none) is recorded in audit metadata for post-cutover analytics. Schema invariants enforce that at most one `role='leader'` row exists per club (`ux_one_leader_per_club`) and at most one `role='leader'` row exists per member across all clubs (`ux_one_club_leader_per_member`); the wizard transparently downgrades the new row to `role='co-leader'` when either invariant would be violated, recording the downgrade reason in audit metadata. The application-level cap of five total leadership rows per club is enforced: when the cap is reached the new claim still affiliates the member (`member_club_affiliations`) but does not insert a `club_leaders` row; an admin can later promote affiliated-only members via `A_Reassign_Club_Leader`. A member declining a candidate sets `club_bootstrap_leaders.status='rejected'`; the row remains eligible for the other activation paths. When the same member matches signals for multiple clubs, the wizard presents all candidates and the member selects which clubs they led. See `M_Complete_Onboarding_Wizard` for the full user-facing acceptance criteria.

2. **First affiliated member accepts leadership**: if no bootstrap leader has yet registered, the first member who registers and confirms affiliation with that club is offered leadership during onboarding (if membership Tier 1+). On acceptance, the member is added as a co-leader. Any existing bootstrap leader candidates remain provisional until those candidates register and claim. Clubs may have multiple leaders.

3. **Admin resolution**: admin can supersede bootstrap assignments and appoint any registered member as leader through the standard `club_leaders` workflow.

A club without any `club_bootstrap_leaders` row at import remains leaderless until a Tier 1+ affiliated member accepts leadership via path 2 or an admin appoints via path 3.

---

### Legacy member import

**What it covers:** All legacy registered member accounts from the live legacy site.

**Source:** One-time export from the legacy-site webmaster, used twice: first as a test load, then as the final production import after write freeze.

#### Imported-row model

Each imported legacy member is a **row in `legacy_members`** (see DATA_MODEL §4.14b and DD §2.4). `legacy_members` is a distinct entity from `members`: it does not grant authentication, does not appear on any current-member surface, and is never deleted. It persists as the permanent archival record of a legacy account even after a current member claims it (the imported profile snapshot is not mutated after import; claim sets `claimed_by_member_id` + `claimed_at`, and those claim-state columns are cleared again on PII purge or account-deletion reversion).

**Source-validity filter.** `legacy_members` is populated from `members WHERE MemberValid > 0`. Rows with `MemberValid = 0` are excluded as source-system garbage, along with other mechanically-obvious junk: rows with no usable identity at all (no name, no email, no handle), structurally malformed or truncated rows, exact duplicates, and clear test/placeholder rows. Exception: any otherwise-excluded row referenced by a retained published event result, an award or Hall-of-Fame/BAP honor, or a documented admin-recovery need is imported anyway and flagged as a validity-exception row. Exceptions are pulled back by linkage, never by guesswork. The junk heuristics only ever remove, and the linkage exception always wins over them, so no person tied to a result or honor is dropped. The import is counted and validated at test-load: rows examined, rows excluded per rule, rows imported, and exception rows pulled back are all reported, so no exclusion is silent.

**Mirror pre-seed before the export.** To satisfy the `historical_persons.legacy_member_id` → `legacy_members(legacy_member_id)` foreign key before the legacy-account export exists, the historical pipeline pre-seeds temporary `legacy_members` rows from the mirror (club rosters plus the `historical_persons` IDs that need an FK target), keyed on `legacy_member_id` with `import_source = 'mirror'` and other columns left NULL; the seed is insert-if-absent, so re-runs add no duplicates. The legacy-account export then supersedes these rows with its full profile fields and flips `import_source` from `'mirror'` to `'legacy_site_data'`. Both key on the same `legacy_member_id` namespace (§19 item 10), so the export updates the matching pre-seeded row in place rather than inserting a duplicate. "Not mutated after import" refers to this post-export state: the mirror pre-seed is temporary scaffolding the export replaces, not a snapshot mutated after the import completes; only the claim-state columns change later.

Fields present on imported rows:

| Field | Notes |
|---|---|
| `legacy_member_id` | Primary key; the old-site user-account id |
| `legacy_user_id` | Legacy username; migration metadata only |
| `legacy_email` | Migration metadata only; used to deliver the one-time claim link. Never a login credential |
| `real_name` | Best available name from export; required (use display_name as fallback). See section 4 for name model notes on imports |
| `display_name` | From export |
| `display_name_normalized` | Derived |
| `city`, `region`, `country` | From export; nullable |
| `bio` | From export if available |
| `birth_date` | From export if available |
| `street_address`, `postal_code` | From export if available |
| `ifpa_join_date` | From export if available |
| `first_competition_year` | Pre-populated from `historical_persons.first_year` via COALESCE at import if a match exists |
| `is_hof` | From export; carries to the claiming member at claim time per §9 OR-merge |
| `is_bap` | From export; carries to the claiming member at claim time per §9 OR-merge |
| `legacy_is_admin` | Old-site admin flag; retained for audit only, never grants live admin |
| `import_source` | `'mirror'` (temporary pre-seeded row) or `'legacy_site_data'` (export-loaded); flipped from `'mirror'` to `'legacy_site_data'` when the export supersedes the row, per "Mirror pre-seed before the export" above |
| `imported_at` | Timestamp of import |
| `legacy_banned` | Optional column; added only when the legacy-account export contains a trustworthy banned/inactive field. When present, populated from the export and used to gate self-serve claim; when absent, banned cases route through admin review. |

Fields explicitly absent from `legacy_members`:

- Login credentials of any kind (no login_email / password_hash / email_verified_at)
- Any live authentication state
- Any mailing list subscriptions
- Any club-governance permissions
- Any current-platform flags (is_admin, is_board, is_deceased, searchable, tier state, Stripe identity, avatar)

The three-table design (DD §2.4) means imported rows never occupy the `members` table; there is no pre-credential placeholder state on `members`. All the above "current-platform" fields belong to the claiming `members` row that is created at registration time and linked to `legacy_members` at claim time via `members.legacy_member_id`.

**Name model note for imports:** The surname constraint (display name must share surname with real_name) applies only to new registrations and profile edits. `legacy_members` rows are exempt because legacy data may contain names that do not conform to the new model. Use "legacy member" (or "imported legacy account") terminology consistently when referring to these rows; the older "imported placeholder" / "pre-credential placeholder" phrasing refers to the superseded two-table design and should not be used in new writing.

---

## 3. Tier handling at claim

Under the three-table design, `member_tier_grants` is a ledger keyed by `member_id`; so no ledger row exists for an unclaimed legacy account (there is no member yet). The mapping below is applied at **claim time**: when `M_Claim_Legacy_Account` (or the direct-historical-person claim, or admin manual recovery) completes for a given `legacy_members` row, the claim transaction writes one `member_tier_grants` row with `reason_code = 'legacy.claim_tier_grant'` using the legacy state captured on `legacy_members`. No `active_player_grants` row is written at migration; Active Player is earned post-cutover via the new sources (IFPA-website event attendance, vouching, or first IFPA club join).

The mapping is a single blanket policy approved by IFPA: any legacy state that was active or paid at cutover maps to its lifetime equivalent under the 2026 rules (annual to lifetime); Tier 3 (Director / board governance status) takes precedence over honors and paid history and folds them into the underlying tier it reverts to; honors override paid history; default is `tier0`.

Tier mapping rules (apply in precedence order; first match wins):

| Precedence | Legacy state at cutover | New `tier_status` | `underlying_tier_status` |
|---:|---|---|---|
| 1 | Was Tier 3 / board at cutover | `tier3` | derived (see below) |
| 2 | HoF or BAP (regardless of paid history) | `tier2` | n/a |
| 3 | Ever paid Tier 2 (annual or lifetime, any state) | `tier2` | n/a |
| 4 | Paid Tier 1 Lifetime (no Tier 2 history) | `tier1` | n/a |
| 5 | Tier 1 Annual currently active at cutover (last attendance or vouch ≤ 365 days before cutover) | `tier1` | n/a |
| 6 | All other legacy states (including expired Tier 1 Annual and members with no IFPA history) | `tier0` | n/a |

Tier 3 underlying derivation (precedence 1 only): reads `legacy_board_underlying_paid_tier` (the member's paid-tier state before the board promotion that elevated them to Tier 3 at cutover) together with the honors flags `is_hof` / `is_bap`, because `legacy_board_underlying_paid_tier` carries only `'none'` / `'tier1'` / `'tier2'` and cannot itself express honors. Evaluate in order; first match wins:

- `is_hof` or `is_bap` set → `underlying_tier_status = 'tier2'` (a HoF/BAP Director reverts to Tier 2 per the IFPA rules in `ifpa/`), regardless of `legacy_board_underlying_paid_tier`.
- Pre-board paid tier was Tier 2 (any kind) → `underlying_tier_status = 'tier2'`.
- Pre-board paid tier was Tier 1 (any kind), undefined, or Tier 0 → `underlying_tier_status = 'tier1'`. (A Tier 0 to Tier 3 upgrade earns `tier1` underlying per the IFPA rules in `ifpa/`.)

Required inputs on `legacy_members` (or a migration-only staging table joined to it):

| Field | Type | Purpose |
|---|---|---|
| `legacy_ever_paid_tier2` | INTEGER 0/1 | True if member ever paid any Tier 2 dues. Drives precedence 3. |
| `legacy_ever_paid_tier1_lifetime` | INTEGER 0/1 | True if member explicitly bought Tier 1 Lifetime. Drives precedence 4. |
| `legacy_tier1_annual_active_at_cutover` | INTEGER 0/1 | True if free-earned Tier 1 Annual was active at cutover. Drives precedence 5. |
| `legacy_was_board_at_cutover` | INTEGER 0/1 | True if Tier 3 / board at cutover. Drives precedence 1. |
| `legacy_board_underlying_paid_tier` | TEXT NULL | For board members only: `'none'`, `'tier1'`, or `'tier2'`. Drives underlying derivation. |

These fields are a deferred schema extension on `legacy_members` (or staging), gated on test-load validation of the legacy export per §15.16 and §25 gate G6. If the extension does not land, the mapping falls back to the **honors-only path** using `legacy_members.is_hof` and `legacy_members.is_bap` (which already exist): HoF/BAP grants `tier2`; everything else grants `tier0`. The honors-only fallback degrades gracefully and remains correct under the 2026 rules; the fallback decision, when chosen, is recorded in §28.

---

## 4. Name model

Two registration fields:

- **Full legal name** (`real_name`): required. Validation: two words minimum, no digits, no capitalization policing (caps normalized on save).
- **Display name** (`display_name`): optional, defaults to `real_name` if not provided.

**Surname constraint:** Display name must share a surname with real_name. Surname extraction uses suffix stripping (Jr, Sr, II, III, IV). This constraint applies to new registrations and profile edits only. Imported legacy account rows in `legacy_members` are exempt.

**Semantic asymmetry:** For new registrations, `real_name` is the legal name supplied by the member. For imported `legacy_members` rows, `real_name` is the best-available name from the legacy export, which may be a display name, a username, or something else entirely. The field name is the same but the quality and provenance differ.

**Slug lifecycle:** `display_name` and the derived slug are permanent post-registration.

---

## 5. Competition history fields

Two fields on `members`:

- `first_competition_year` (INTEGER, nullable): editable on profile edit. Pre-populated from `historical_persons.first_year` during claim (COALESCE; member value wins if already set). Shown as "Competing since {year}" on profile. Leave blank to hide (opt-out by clearing).
- `show_competitive_results` (INTEGER, default 1): toggle controlling whether results show on public profile. Collected in the `personal_details` onboarding task and editable via M_Edit_Profile. Own profile always shows results to the owner regardless of toggle state.

**Caveat text on results section:** "Published event results only. Historical records may be incomplete."

**Onboarding prompt:** During registration/onboarding, ask the member to confirm their first competition year. (Deferred to onboarding flow implementation.)

---

## 6. Identity and person links

- A single `personHref()` helper generates all person links. If the person has a linked member account (via `members.historical_person_id` FK per DD §2.4 rule 3), the link points to `/members/:slug`. Otherwise, it points to `/history/:personId`. This is implemented at the service contract level; slug resolution uses the FK directly per DD §2.4.
- When a member has a linked historical person whose name differs from the member's display name, the historical name is shown on the member profile.
- **Account deletion reversion:** When a member's PII is purged, `members.historical_person_id` and `members.legacy_member_id` are both cleared, and the corresponding `legacy_members.claimed_by_member_id` is cleared too. Person links that were pointing to `/members/:slug` revert to `/history/:personId`. This is reflected in DD §2.4 rule 5 and the M_Delete_Account user story.

---

## 7. Auto-link: matching legacy_members, historical_persons, and members

Auto-link has two goals under the three-table design (DD §2.4):

1. **Provenance link**: associate each `historical_persons` row with its corresponding `legacy_members` row when the mirror named the legacy account, by setting `historical_persons.legacy_member_id`. This is a data-pipeline step owned by the historical-pipeline track.
2. **Claim link**: stage a candidate association between a current `members` row and a `legacy_members` row (and, if back-linked, the corresponding `historical_persons` row). The candidate is presented to the member through the onboarding wizard for confirmation; no live tables are mutated until the member confirms. `M_Complete_Onboarding_Wizard` is the source of truth for the member-facing card interaction.

Auto-link sends no notification emails. The wizard's claim task is the only post-link member-facing surface.

### Identity anchors

Auto-link considers multiple anchors when looking for candidates:

- Modern login email (verified at registration) matching `legacy_members.legacy_email`.
- Member-declared old email (optional profile field; see §15) matching `legacy_members.legacy_email`.
- Member-declared former surname (optional profile field; see §15) matching the surname on `legacy_members.real_name`.
- Member's current real-name surname matching `legacy_members.real_name` surname, used alongside the above.

A member can declare more than one old email. All declared anchors participate in candidate matching across batch and registration-time passes.

### Evidence-strength tiers

Each confirmed claim transaction carries an evidence-strength tag in its audit row, in increasing strength:

- `declared_anchor_only` — member declared an old email or former surname; no mailbox proof exercised. Soft evidence.
- `currently_controls_modern_email_matching_legacy` — modern verified login email matches a legacy email.
- `mailbox_control_via_link_click` — member opted into a confirmation link delivered to their declared old email and clicked it, demonstrating current mailbox control. Hard evidence.
- `admin_vetted_evidence` — admin reviewed a member-initiated help request (§13) and approved the link based on out-of-band evidence.

The card surface is the same regardless of tier. The tag drives the admin oversight feed (§13) and any dispute-resolution path; the member's experience is uniform across tiers.

### Multi-record candidates

When a single legacy account back-links to more than one historical person via the variants table, the platform surfaces all candidates for the member to choose from. Gate G27 measures the ambiguity count against the test-load `legacy_members` set; if the count exceeds what the wizard's confirmation throughput can comfortably handle, the `name_variants` seed is pruned before batch auto-link runs at cutover.

### Anchor availability when uniqueness assumptions fail

The classifier presumes that `legacy_email` and `legacy_user_id` are each unique where non-NULL in the legacy export (gates G1 and G2 in §25). If a uniqueness check fails at test load, the affected anchor is treated as ambiguous:

- **When `legacy_email` is not unique.** Email lookups return multiple `legacy_members` rows for some live members. Affected matches surface no candidate (the platform cannot disambiguate); the member uses declared anchors or asks admin for help instead (§13). Unambiguous email matches in the rest of the export continue to classify normally.
- **When `legacy_user_id` is not unique.** The legacy-username anchor is used in the self-serve identifier-lookup affordance (§8) but does not contribute to auto-link confidence. Self-serve username lookups that return multiple rows display the non-revealing matched-multiple banner (§8) and never silently resolve. Auto-link is unaffected.
- **When both are non-unique.** Ambiguous slices have no auto-surfaced candidate; recovery is through member declaration or admin help.

The non-unique lookup index in §15.7 supports these fallback behaviors at the schema layer; the fallback decision is recorded in §28.

### Known name variants

Known name variants are stored in a **DB table** (not CSV), seeded from mined data (approximately 290 pairs at last mining pass; exact count tracked in the seed file). Variant categories (approximate counts):

- Accent variations (~26 pairs)
- Prefix variations (~88 pairs)
- Typo corrections (~139 pairs)
- Diminutives (~40 pairs)

Variants support first-name matching (e.g. Bob/Robert). Surname changes (e.g. marriage) are handled by the member-declared former surname field rather than by the variants table; the variants table holds equivalence between spellings of the same name, not transformations between different names.

### Batch auto-link at cutover

The batch pass runs across all `legacy_members` rows at cutover. For each candidate match against a live member:

- The batch writes a staged auto-link candidate. No `members`, `legacy_members`, or `member_tier_grants` rows are mutated.
- The candidate is presented at the member's next sign-in through the wizard's claim task.
- The batch is idempotent: rerun produces no duplicate candidates.

Pre-cutover live members and members who register after cutover are both covered: at any sign-in, the wizard surfaces any staged candidates plus the declared-anchor inputs and any newly-found candidates.

Honors-bearing matches (Hall of Fame, Big Add Posse) apply on member confirmation with the same UX as any other claim; the honors flag is invisible to the registrant. The admin honors oversight feed (`A_View_Honors_Oversight_Feed`) shows every honors-bearing direct historical-record claim post-facto for read-only audit visibility, with no gating. Legacy-account claims that happen to carry an `is_hof` or `is_bap` flag on `legacy_members` do not surface in the feed; the feed is scoped to direct HP claims only.

### Cross-source candidate detection

After the member confirms one identity source (legacy account or historical record), the platform searches the other source for a plausible candidate match using available anchors (surname agreement, country agreement, no other claimant). Detected candidates surface inline as a follow-on prompt in the wizard. `M_Complete_Onboarding_Wizard` specifies the card-level interaction.

### Registration-time and signup-time conflict prompt

When a new member registers and the platform detects their surname (current or declared former) matches the surname on an already-claimed record they're about to navigate to, the wizard surfaces an inline "we already have a claim under this name, is one of these you?" prompt. This catches same-name collisions and impersonation cases at the earliest point. `M_Complete_Onboarding_Wizard` specifies the card-level interaction.

### Post-cutover honors oversight digest

A daily admin digest summarizes the prior 24 hours of `member_tier_grants` rows with `reason_code='legacy.claim_tier_grant'` AND a Hall of Fame or Big Add Posse honor flag. The single reason code covers wizard-confirmed claims, declared-anchor confirmations, mailbox-link-click confirmations, and admin-approved help-request completions. The honor-flag predicate is the load-bearing filter; any future code path that grants an honor tier under a different reason code must be added to the digest filter alongside. The digest cadence runs from cutover through a configurable post-cutover monitoring window (default 56 days, extensible). The digest is delivered to the admin-alerts mailing list and contains row identifiers and decision-relevant attributes only; sensitive contact fields stay out of the digest payload per the logging hygiene rules in `DATA_GOVERNANCE.md`.

### Platform code gated on legacy data dump arrival

The following platform-code surfaces are designed against the dump's production-shaped fields. The application code is largely in place; what remains gated is the data-side validation against the real dump payload (e.g. `legacy_email` coverage, `name_variants` seeding). Each is a cutover blocker; the gate clears when the code-side smoke runs cleanly against the loaded dump.

1. **Optional mailbox-control link click.** Member declares an old email; platform offers a confirmation-link round-trip; clicking the link upgrades the audit tier from `declared_anchor_only` to `mailbox_control_via_link_click`. Token storage uses `account_tokens.target_legacy_member_id` (SHA-256 hash only); rate-limited per requesting member. Data-side gate: the dump must populate `legacy_email` on enough rows that the round-trip is reachable as an opt-in upgrade. Gate ID: G22.
2. **Multi-anchor candidate classification.** Auto-link queries the verified-modern-email anchor, the declared-old-email anchors, and the declared-former-surname anchor against the `legacy_members` set, and against `historical_persons` via the back-link. Data-side gate: the dump payload must populate at least one anchor per identity and the `name_variants` seed must be in place to drive same-name variant resolution. Gate IDs: G23 (anchor coverage) and G11 (variants seeded).
3. **Batch auto-link candidate staging at cutover.** A one-time system job stages candidates without mutating live tables, wrapped by the standard `system_job_runs` lifecycle for observability. Idempotent: rerun produces no duplicate staged candidates. Data-side gate: must run after the dump load and before §24 State 3 → State 4 transition. Gate ID: G24.
4. **Direct historical-record claim affordance.** The `/history/:personId/claim` confirm page handles the surname-match check (current or declared former) and the first-name-variant warning inline; on success it writes an `audit_entries` row carrying the evidence tier and any name variant used. Data-side gate: full value depends on `name_variants` being seeded. Gate IDs: G25 (affordance) and G11 (variants seeded).

---

## 8. Self-serve claim flow

The member's experience of claiming pre-existing identity (old website account, historical competition record, or both) is specified by `M_Claim_Legacy_Account`. This section covers the system-side contract: identity-reconciliation cases, anchors, direct historical-record claim mechanics, registration-time conflict prompt, dispute path, anti-enumeration posture, rate limiting, and claim ineligibility predicates.

### Identity-reconciliation cases

A registrant falls into one of five situations relative to the legacy data:

- **Case A: Fresh player.** No `legacy_members` row and no `historical_persons` row. No claim is available; the registrant proceeds as a new account.
- **Case B: Old account only.** A `legacy_members` row exists for the registrant; no historical record. The claim links the modern account to the legacy account and applies the tier mapping (§3).
- **Case C: Competitor only.** A `historical_persons` row exists; no `legacy_members` row. The claim links the modern account to the historical record via the direct-claim affordance at `/history/:personId/claim`.
- **Case D: Both, pipeline did not link them.** A `legacy_members` row and a `historical_persons` row both exist for the registrant, but the historical pipeline did not back-link them. The registrant claims each separately, or the cross-source candidate prompt (§7) detects the second after the first is confirmed.
- **Case E: Both, pipeline linked them.** A `legacy_members` row and a `historical_persons` row both exist, and the historical pipeline back-linked them via `historical_persons.legacy_member_id`. Claiming either transitively claims the other in the same transaction.

`M_Complete_Onboarding_Wizard` orchestrates the member's path through these cases. The wizard task is universal (every registrant sees it) regardless of which case applies.

### Anchors

Identifying a candidate uses any of:

- Verified modern login email matching `legacy_members.legacy_email`.
- Member-declared old email (optional profile field) matching `legacy_members.legacy_email`.
- Member-declared former surname or current real-name surname matching `legacy_members.real_name` surname.
- Surname match (current or declared former) against `historical_persons.person_name` for the direct historical-record affordance.

Email match is the strongest anchor. Surname (current or declared former) is the only available anchor for case B without modern-email match and case C.

### Direct historical-record claim

Entry point: `GET /history/:personId`. When the viewer's `real_name` surname OR any declared former surname matches the HP's `person_name` surname and the HP is unclaimed, the page surfaces a "Claim this identity" CTA. The confirmation page renders the record's country, honor status, and a first-name warning when the member's first name is a variant of the HP's. On `POST /history/:personId/claim/confirm`:

- Surname reconciliation runs server-side against current real-name surname and any declared former surnames.
- If the HP carries a `legacy_member_id` back-link (case E) and that legacy row is unclaimed, the claim transitively marks the `legacy_members` row claimed and runs the legacy-field merge.
- If the back-linked legacy row is already claimed by someone else, the HP claim is rejected rather than leaving inconsistent state.
- `members.historical_person_id` is set. Historical-person identity fields are carried forward per the merge rules in §9 (under "historical_persons-sourced fields").
- The audit row records the evidence tier defined under "Evidence-strength tiers" in §7.

Anti-abuse: the surname rule (current or declared former) gates direct claims. The partial UNIQUE index on `members.historical_person_id` prevents double-claim. A member can claim at most one HP. Honors-bearing direct claims (HoF, BAP) apply without admin pre-screening; the admin oversight feed (§13) surfaces them post-facto.

### Registration-time conflict prompt

When a new member is registering and the platform detects their surname (current or declared former) matches the surname of an already-claimed legacy account or historical record they're about to navigate to, the wizard surfaces an inline "we already have a claim under this name, is one of these you?" prompt with details of the existing claim. This catches same-name collisions and impersonation cases at the earliest point. The real member arriving after an impersonator was confirmed has an inline path to dispute through this affordance, instead of having to contact admin out-of-band. `M_Complete_Onboarding_Wizard` specifies the card-level interaction.

### Dispute path

A member who confirms a card later believed to be wrong, or a real member arriving after an impersonator was confirmed by mistake, has two affordances:

- Inline at the registration-time conflict prompt above, if surfaced at signup.
- Member-initiated admin help request (§13) if the dispute surfaces later or the platform did not detect the conflict.

Admin reviews disputes and can revert wrong claims via the admin recovery flow. After-the-fact disputes are general support, not a migration-specific surface.

### Anti-enumeration messaging

User-visible messages must never reveal whether the submitted identifier:

- Matched no row
- Matched multiple rows
- Matched an ineligible row (already claimed; admin-flagged)

`M_Complete_Onboarding_Wizard` spells out the user-facing copy. MP requires that the response shape is identical across the matched-none, matched-multiple, matched-ineligible, and matched-eligible cases.

The CSRF Origin-pin middleware (DD §3.3) returns 403 for any state-changing request that omits both `Origin` and `Referer` headers. That 403 is distinguishable from the non-revealing 200 response above; the side-channel is accepted because the pin rejects at the perimeter before the claim flow's response logic runs.

### Rate limiting

Identifier-lookup attempts, declared-anchor changes, and optional mailbox-link-click round-trips must be rate-limited per requesting member account, per target `legacy_members` row, and per source IP/session. This prevents abuse of legacy mailboxes and limits side-channel enumeration. Specific limit values are set in DD §3.8 and implemented against the `account_tokens` schema described in §15.9.

### Claim ineligibility

A `legacy_members` row is unclaimable when:

- Already claimed (`claimed_by_member_id IS NOT NULL`).
- Duplicate `legacy_members` rows matched the identifier (the `legacy_email` or `legacy_user_id` uniqueness assumption failed at test load; see §25 gates G1 and G2).
- The `legacy_banned` column did not land (gate G3 FAIL per §15.5) AND the row carries a banned/inactive indicator in the source export that the platform cannot trust to apply automatically.
- An admin has flagged the row as review-only.

The legacy banned flag is recorded as audit metadata only and does not gate the claim card. Any platform-level disciplinary state is handled by the new platform's discipline mechanisms, not by legacy ban state.

Ineligible cases are directed to the member-initiated admin help request (§13).

---

## 9. Merge rules

The active modern account always survives. The `legacy_members` row is MARKED CLAIMED (`claimed_by_member_id` + `claimed_at` set) and persists as the permanent archival record; it is NOT deleted. Merge copies editable fields from `legacy_members` to the claiming `members` row so the member has their own copy to edit; the `legacy_members` row itself is not mutated beyond the two claim-state columns.

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
| `is_hof`, `is_bap` | OR semantics; `members.is_hof` / `members.is_bap` set to 1 if `legacy_members` has the flag |
| `historical_person_id` | Set to the HP's `person_id` whenever the claim resolves an HP: (a) legacy-account claim where `legacy_members.legacy_member_id` matches a `historical_persons.legacy_member_id` back-link (case E per §8), or (b) direct HP claim (cases C or D per §8). Partial UNIQUE index enforces one live member per HP. |
| `historical_persons`-sourced fields | Whenever `members.historical_person_id` is being set, the same transaction also runs the HP merge: `country` fill-if-empty from `historical_persons.country`; `is_hof` / `is_bap` OR semantics from `hof_member` / `bap_member`; `hof_inducted_year` fill-if-empty from `hof_induction_year`; `first_competition_year` COALESCE from `first_year`. This ensures honors and country propagate onto the member row from whichever archival table carries the authoritative value. |
| `announce_opt_in` | Carry forward only if the validated export contains this field and its semantics are confirmed; unclaimed `legacy_members` rows are never treated as active mail recipients |
| Legacy admin metadata (`legacy_is_admin`) | Copied to `members.legacy_is_admin` as audit/history context only; never auto-promotes live admin role |
| Tier | Write a single `member_tier_grants` row with `reason_code = 'legacy.claim_tier_grant'` applying the blanket mapping defined in §3 "Tier handling at claim". The mapping uses legacy state fields on `legacy_members` (deferred schema extension per §15.16, gated on §25 G6); honors-only fallback applies if the extension is absent. No conditional "exceeds current" logic. |
| Confirmed club affiliations | Write/update `member_club_affiliations` |
| Confirmed bootstrap leadership | May promote to `club_leaders` if safe; otherwise remains provisional |
| Discarded conflicting imported values | Preserved in audit metadata |

After merge, `legacy_email` may survive on the active account as legacy metadata but is never a login identity.

**Surname matching across claim paths.** Both the wizard-confirmed candidate flow and the direct historical-record claim path match against the member's current real-name surname or any declared former surname. A member with a name change between their legacy identity and current account declares the former surname on their profile (or at signup) and the claim path then resolves normally. If the member has not declared a former surname and the surnames don't agree, the platform routes the case to the member-initiated admin help request (§13).

**Concurrent claim races on the same historical person** are resolved by the partial UNIQUE index `ux_members_historical_person_id` plus service-layer error mapping. Two members claiming the same historical person simultaneously both pass the in-controller "already claimed" check; the loser is rejected at the INSERT by the index. The claim transaction runs under SQLite IMMEDIATE isolation so the SELECT-then-INSERT logic and the dependent merge writes commit or roll back atomically; the unique index is the load-bearing defense against the race. The service wraps the SQLite `SQLITE_CONSTRAINT_UNIQUE` exception in `ConflictError`; the controller renders the same user-readable "already claimed by another member" 422 response it renders on the synchronous check path.

**Concurrent claim races on the same legacy account** are resolved by the partial UNIQUE indexes `ux_members_legacy_id` on `members(legacy_member_id)` and `ux_legacy_members_claimed_by` on `legacy_members(claimed_by_member_id)`. Two members confirming the same `legacy_members` row at roughly the same time both pass the in-controller "claimed_by_member_id IS NULL" check before either INSERT lands; the loser is rejected by one of the unique indexes. The service wraps `SQLITE_CONSTRAINT_UNIQUE` in `ConflictError`; the controller renders the same user-readable "this legacy account has been claimed by another member" 422 response that the synchronous check path renders. The `member_tier_grants` insert occurs inside the same merge transaction as the index-protected writes, so a unique-constraint rejection rolls back the entire transaction; no partial tier grant persists.

---

## 10. Club bootstrap and onboarding

Terminology used throughout this section:

- **Bootstrap row**: a row in `club_bootstrap_leaders` that records a `(member, club)` leadership candidate inferred from mirror data; not yet a live leader. Promoted to a `club_leaders` row at wizard confirmation per §2.
- **Promotion path**: the transition that turns a non-live candidate into a live row. For clubs, this turns an `onboarding_visible` or `dormant` candidate in `legacy_club_candidates` into a `clubs` row; for leadership, this turns a bootstrap row into a `club_leaders` row.
- **Junk candidate**: a `legacy_club_candidates` row whose classification rules out promotion to a live club regardless of registrant signal. Junk candidates are never shown in the wizard.
- **Pre-populated / onboarding-visible / dormant**: classification states for `legacy_club_candidates`; the four-way classification (the fourth being junk) is defined in §10.1.

### 10.1 Club classification rules

Every legacy club extracted from the mirror is classified into one of four categories: `pre_populate`, `onboarding_visible`, `dormant`, or `junk`. Classification determines whether the club exists in the live `clubs` table at go-live, appears as a suggestion during registration, is searchable but not suggested, or is excluded from public surfaces entirely.

Classification is deterministic and tunable. Each rule references a named parameter with a documented default. A preview report shows the operator which candidates fall into which category for any parameter set, so cutoffs can be sanity-checked before cutover.

#### Source signals

All signals come from data already produced by the mirror pipeline. No external lookups.

- **Hosting evidence** from the event archive: ever-hosted flag, hosted-event count, last hosted year. The canonical hosting link is the FK `events.host_club_id` to `clubs.id`. When the classifier runs before live `clubs` rows exist, it falls back to a normalized-name match between event host text and candidate names.
- **Page timestamps** from `div#MainModified` on each club page: created year, last-updated year.
- **Listed contact** from `div.clubsContacts`: the contact's mirror member id, captured from `members/profile/{id}`. The contact's last competitive year is resolved by joining the mirror id to `historical_persons.last_year` via the mirror-id to historical-person-id mapping.
- **Affiliated rostered members** from the showmembers page: count of unique member names, count matched to known historical persons, max last competitive year across matched members.
- **Description**: presence and content of `div#ClubsWelcome`.
- **External URL**: presence and verification status of the URL from `div.clubsURL`. URL verification is performed before publication per §10.3.

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
| `edit_recency_tolerance_hours` | 24 | Junk signal-absence clause: "never edited after creation" tolerance |

#### Duplicate clubs

The mirror lists some real clubs under more than one legacy key (for example a club re-created in a later year, or a near-empty re-listing). A curator records confirmed duplicate pairs in `legacy_data/overrides/club_duplicates.csv` (`keep_legacy_key`, `drop_legacy_key`, reason). The pipeline merges each confirmed pair deterministically into the `keep` candidate:

- `name`, `city`, `region`, `country`, `contact_member_id`, `external_url`: from the candidate with the strongest signal evidence (most hosting, largest roster, most recent edit); ties broken by latest update.
- `description`: longest non-empty across the pair.
- `created`: earliest. `last_updated`: latest.
- Roster, affiliations, and hosted-event credits: union across the pair, deduplicated by resolved person.
- Source identities: the merged candidate records every source `legacy_club_key` in `source_legacy_keys` for audit and reversibility.

Merging unions rosters rather than discarding a duplicate, so no affiliation is lost. The merge is curator-confirmed and deterministic at pipeline time; there is no automatic similarity clustering and no platform-side merge process. A curator who needs to undo a merge edits the override and re-runs the pipeline.

Wizard resolution treats all source identities as resolving to the merged candidate: when a registrant cites a source legacy name in Stage 1B, the affiliation maps to the merged row.

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
7. Never edited after creation. The legacy CMS records `created` and `last_updated` as separate timestamps; clause 7 fires when `last_updated` is within `edit_recency_tolerance_hours` (default 24) of `created`.

The signal-absence rule is the catch-all classifier for legitimate-looking clubs that nevertheless lack any signal a registrant could confirm. A club that fails pre_populate, fails onboarding_visible, and has no description (and therefore no dormant-candidate hook a Stage 3A search could surface) routes here. The force-keep override list (below) is the recovery path for any real club that was mis-caught.

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

Pre-populated candidates may also receive bootstrap leadership rows under the bootstrap rule in §2 (which also describes the leadership activation paths). Bootstrap leadership is independent of classification: clubs lacking a strong-classification leader candidate still pre-populate without a provisional leader.

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
- `external_url`: published only if URL verification (see §10.3) passes. Failed verifications leave the column NULL; the original value remains on the candidate row for the wizard to surface to the listed contact.
- `description`: published as-is from the legacy data.
- `contact_email`, `whatsapp`: not pre-populated from legacy data.

Description and URL on the live page are subject to the validation loop described in §10.3. The listed contact and the eventual club leader can edit directly; non-contact members can flag inaccuracies and suggest replacements via wizard Stage 1B, Stage 2A, and the M_Join_Club flow, with edits applied only after approval by the listed contact, leader, or admin.

#### Promotion rules

Pre-populated candidates exist as live `clubs` rows at go-live. All other non-junk candidates remain in `legacy_club_candidates` until promoted, archived, or admin-resolved. Promotion paths:

- **Stage 1 confirmation**: when a registrant in Stage 1A or Stage 1B confirms a personal affiliation with an onboarding-visible or dormant candidate, the candidate is promoted to a live `clubs` row using the live-content rules above.
- **Stage 2B confirmation**: when a registrant in Stage 2B confirms an onboarding-visible candidate exists, the candidate is promoted to a live `clubs` row.
- **Stage 3A revival**: when a registrant in Stage 3A confirms a dormant candidate by name search, the candidate is promoted to a live `clubs` row.
- **Admin override**: an admin can promote any non-junk candidate manually via the cleanup queue.

The promotion transaction is idempotent. If two registrants confirm the same `legacy_club_candidates` row in concurrent transactions, the first promotion inserts a `clubs` row keyed by the candidate's `legacy_club_key`; the second transaction's INSERT is rejected by the unique constraint on `clubs.legacy_club_key`, and the service catches the constraint exception and treats the candidate as already promoted, completing the second registrant's affiliation against the existing `clubs` row.

The `legacy_club_candidates` table remains operational until every non-junk candidate has reached a terminal state per §10.4.

#### Pipeline ordering

The classifier depends on `historical_persons` being fully populated, including the club-only members extracted from the mirror (per §10.2). Without those rows, the listed-contact-active and member-active signals are artificially deflated for clubs whose people never competed.

Required order:

1. Extract club-only members into `historical_persons` (§10.2).
2. Classify clubs against the rules above.
3. Auto-merge duplicate clusters; route significant-difference clusters to admin.
4. Mark junk.
5. Persist classification evidence on each candidate.
6. Pre-populated candidates enter the live `clubs` table; non-junk non-pre-populate candidates remain in `legacy_club_candidates`.

### 10.2 Expanding historical_persons for club members

The historical_persons table contains ~4,861 persons drawn from event results. Approximately 1,600 additional people in the mirror appear only as club members (never competed in events). These must be extracted and added to historical_persons to support club affiliation linking at claim time.

### 10.3 Club onboarding flow during registration

Registration is the primary cleanup mechanism for legacy club data. Every registrant goes through a club flow after identity resolution (sections 6-7). For an at-a-glance map of `(member relationship, registrant signal) → wizard stage and effect`, see the "Signals collected from registration" table near the end of this section.

Semantic principle: match each question to the registrant's authority over each club, and match the question wording to the club's epistemic status. Three authority levels:

- **Personal (Stage 1)**: the registrant is named in the legacy data on a specific club (contact, leader, or rostered member).
- **Local (Stage 2)**: the registrant lives in the same country or region as a candidate; cannot speak to internal club affairs but can attest to whether the club is locally known.
- **None (Stage 3)**: no nearby candidates, or all skipped; the registrant initiates name search. If no match results, the wizard ends and the registrant is offered the standard `M_Create_Club` flow as a separate next step.

Junk is excluded from every surface. Pre-populated, onboarding-visible, and dormant candidates are surfaced through different stages with different question wording. Content validation for description and external URL is layered across the wizard and the normal `M_Join_Club` flow; mechanics are described in the content validation loop below.

#### Stage 1: Personal authority

Surface every club where the registrant appears in the legacy data as listed contact, leader / co-leader, or rostered member. All non-junk classifications are shown regardless of category. When the legacy data names a club whose `legacy_club_key` is one of the source identities of a merged candidate (per §10.1 duplicate handling), the wizard resolves to the merged row.

##### Stage 1A: Registrant is the listed contact

Show: "You were listed as the contact for [Club Name] in [City, Country]. What's going on with it now?"

Five paths:

1. **"Still active, I'm still involved."** Confirm existence; promote the candidate to a live `clubs` row if not already; promote the bootstrap row to a live `club_leaders` row regardless of classification strength (the classification is recorded in audit metadata for post-cutover analytics) and regardless of registrant tier; absent any bootstrap candidate, leadership is offered only when the registrant is membership Tier 1+ (Tier 0 listed contacts are added as members until they upgrade). Offer in-flight metadata updates: contact info, description, external URL, location. Edits apply directly.
2. **"Still active, but I've moved on."** Confirm existence; promote to live if not already; mark the listed-contact link as stale. If a successor leader later registers and confirms via Stage 1A path 1, the bootstrap path applies normally.
3. **"Not active anymore."** Confirm historical existence; optional: when it became inactive. Promote the candidate to a live `clubs` row if not already, then set `clubs.status = 'inactive'`. Archival (`status='archived'`) is admin-only.
4. **"I don't recognize this listing."** Logged to the admin cleanup queue (§10.4) as a strong junk signal. May mean either a mislinked roster or a fictitious page.
5. **"Deal with this later."** Save state; resume from the dashboard task widget.

##### Stage 1B: Registrant is affiliated but not the listed contact

Show: "You were listed as a member of [Club Name] in [City, Country]. Are you still involved?"

Five paths:

1. **"Still a member."** Confirm existence; promote candidate to live if not already; mark current affiliation. Leadership is offered only if no active leader exists AND the registrant is membership Tier 1+ (added as co-leader; does not supersede existing leaders). The wizard also surfaces the candidate's current description and external URL; the member can flag inaccuracies and suggest replacement text via the content validation loop below.
2. **"Was a member, no longer."** Confirm existence; mark former affiliation; club stays as-is. Content validation loop available.
3. **"The club isn't around anymore."** Logged to the admin cleanup queue (§10.4).
4. **"I never played at this club."** Logged to the admin cleanup queue (§10.4). Weaker signal than a contact rejection because members may have forgotten a club they briefly joined.
5. **"Defer."** Save and resume.

Authority asymmetry: only Stage 1A path 1 (listed contact, still involved) edits club metadata directly. Stage 1B paths 1 and 2 surface the candidate's current content and accept flags or suggested replacements; those edits apply only after approval by the listed contact, the eventual club leader, or admin (see content validation loop below).

#### Stage 2: Local authority (regional suggestions)

After Stage 1 completes, two sequenced sub-stages with an explicit framing transition. The shift in framing tells the registrant when they are moving from joining a known club to helping validate a candidate listing.

##### Location matching helper

Stage 2 surfacing and the §10.4 admin cleanup queue both depend on "same country", "same region", and "same city" predicates between a registrant's profile and a club's location. Both surfaces use the same normalization:

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
4. **"I've never heard of this club."** Logged to the admin cleanup queue (§10.4); same-city registrants are weighted more during admin review.
5. **Skip.** No signal.

##### Stage 2B: Onboarding-visible clubs nearby

Framing transition: "Here are some additional listings we'd like your help confirming." The club is plausible but unverified; the registrant is being asked about both existence and affiliation.

Per-club question: "We have a listing for [Club Name] in [City], but we're not sure it's still active. Can you tell us anything about it?"

1. **"Yes, it is real and I am part of it."** Promote candidate to live; mark current affiliation. The wizard also surfaces the candidate's current description and external URL; the member can flag inaccuracies and suggest replacement text via the content validation loop below.
2. **"Yes, it is real but I am not part of it."** Promote candidate to live; no affiliation. (Existence confirmation is recorded as distinct from affiliation.) Content validation loop available.
3. **"I have never heard of this club."** Logged to the admin cleanup queue (§10.4).
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

If Stage 3A search yields no result the registrant can claim, the wizard concludes with: "We didn't find your club in our records. You can create one from your profile after onboarding." A direct link to the `M_Create_Club` flow is provided. `M_Create_Club` applies the duplicate-prevention rules described in §10.1 against live clubs and the candidate set: exact name plus same country blocks creation and surfaces the existing entry instead; similar matches warn but allow the creator to proceed. The wizard itself never creates a new `clubs` row.

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
| Contact does not recognize listing | Stage 1A path 4 | Logged to admin cleanup queue (§10.4) as strong junk signal. |
| Member confirms current affiliation | Stage 1B path 1 | Confirm existence; promote to live if needed; mark current affiliation. |
| Member reports club gone | Stage 1B path 3 | Logged to admin cleanup queue (§10.4). |
| Member rejects affiliation | Stage 1B path 4 | Logged to admin cleanup queue (§10.4). |
| Member affirms on pre-populated club | Stage 2A path 1 | Mark current affiliation on a live club. |
| Member "never heard of it" on pre-populated club | Stage 2A path 4 | Logged to admin cleanup queue (§10.4); same-city weighted more during admin review. |
| Member existence confirmation on onboarding-visible | Stage 2B paths 1, 2 | Promote onboarding-visible candidate to live. |
| Member "never heard of it" on onboarding-visible | Stage 2B path 3 | Logged to admin cleanup queue (§10.4). |
| Member revives dormant candidate | Stage 3A path 1 | Promote dormant candidate to live. |
| Member confirms dormant club historically real | Stage 3A path 2 | Promote dormant candidate to live with `status='inactive'`. |
| Direct content edit by contact or leader | Stage 1A path 1 or any post-promotion edit by a leader | Direct edit to live `clubs` row. |
| Content flag with suggested edit | Stage 1B paths 1-2, Stage 2A path 1, Stage 2B paths 1-2, `M_Join_Club` | Enters validation queue; applied after approval by contact, leader, or admin. |

#### Constraints

- At most two current club affiliations per member (primary and secondary), enforced at the service layer (count-before-insert). Wizard-path behavior: if the member already has two current affiliations, the new insert is skipped; the legacy affiliation row transitions but the member's current-affiliation set is unchanged. Transferring current-affiliation status requires `M_Join_Club` / `M_Leave_Club` or admin remediation.
- Clubs may have multiple leaders.
- Leadership tier gating follows `M_Complete_Onboarding_Wizard`: with a bootstrap row, leadership promotes regardless of tier; without a bootstrap row, leadership is offered only to Tier 1+.
- Onboarding-visible and dormant candidates are promoted to live `clubs` rows only via the promotion paths in §10.1 or via admin override.
- Junk candidates are never shown in any wizard surface.
- Dormant candidates are not surfaced as Stage 2 regional suggestions but are reachable through Stage 3A name search.
- The wizard never creates a new `clubs` row directly. New clubs go through `M_Create_Club`, which applies the §10.1 duplicate-prevention rules.
- Direct content edits (description, external URL) require listed-contact, club-leader, or admin authority. Other members propose edits through the content validation loop.

### 10.4 Long-term cleanup

The `legacy_club_candidates` table is not a permanent operational surface. Every non-junk candidate eventually reaches a terminal state: promoted to a live `clubs` row, demoted to dormant, archived, or merged with another club. Admin is the sole decision authority; members provide input through structured flags. There is no time-bounded saturation window; admin reviews the queue at their own pace, and the table remains operational until empty.

Admin's user-facing entry point is `A_Periodic_Club_Cleanup` in USER_STORIES.

#### Member flag mechanism

Members can flag any club at any time through three surfaces:

- **Onboarding wizard.** Stage 1A path 4, Stage 1B paths 3 and 4, Stage 2A path 4, and Stage 2B path 3 generate flags as part of completing the wizard (see §10.3 signals table).
- **Normal M_Join_Club flow.** When joining a club, the member sees the current description and external URL and can flag inaccuracies or propose replacement text per the §10.3 content validation loop.
- **Club detail page.** Any member viewing a club can flag the listing as outdated, inactive, duplicate, or wrong.

Every flag is recorded as a structured audit-log row carrying: the candidate or club id, the flagging member id, the flag category (junk, inactive, content-inaccurate, duplicate-of-X, never-heard-of-it, other), an optional note, the location predicates between the flagging member and the club (same-city, same-region, same-country per §10.3 Location matching helper), and a timestamp.

#### On-demand cleanup evaluation

There is no unattended background process. When an admin opens the `A_Periodic_Club_Cleanup` queue, the platform evaluates the viability and leadership-staleness predicates fresh (`crowdsource_club_viability` G1-G4, `leaderless_active_club`, `stale_provisional_leader`) and surfaces the clubs that need a human decision, each with a recommended one-click action (demote, archive, dismiss, defer). No transition fires automatically; demote and archive are admin actions, each writing one `audit_entries` row with `actor_type='admin'`.

Unconfirmed `legacy_person_club_affiliations` residue (`'pending'` rows) is retired by an explicit per-club admin de-list to `'former_only'`, also cascaded when a club is demoted or archived. Duplicate club candidates are merged before cutover by a curator-confirmed directive in the pipeline (per §10.1), not by a platform-side process.

#### Admin residue queue

When an admin opens the queue, it aggregates the items requiring human judgment:

- Wizard-generated flags grouped by candidate or live club.
- Member-flagged live clubs from the club detail page or `M_Join_Club` flow.
- Suggested content edits awaiting approval (per §10.3 content validation loop).
- Junk-flagged candidates (per §10.1 junk rules) and any admin force-keep or force-junk requests.
- Non-junk candidates not yet promoted to live `clubs` rows.
- `legacy_person_club_affiliations` rows still in `resolution_status='pending'` (unconfirmed legacy residue), grouped by live club with each club's pending count and oldest-row age.

The admin-home backlog badge surfaces the count of open queue items and the age of the oldest open item. Admin sorts and filters this queue at their own cadence. There is no automated demotion or time-based escalation. Recommended cadence is monthly during steady-state operation; weekly during periods of high member activity.

Admin's available actions per item:

- Promote a candidate to a live `clubs` row.
- Demote a candidate to dormant.
- Mark a live `clubs` row `status='inactive'`.
- Archive a `clubs` row (`status='archived'`).
- Merge two live `clubs` rows that turn out to be the same club.
- Approve or reject a suggested content edit.
- Add a candidate to force-keep or force-junk.
- Dismiss a flag with an optional reason, or defer with a bounded duration (30 / 90 / 180 days) after which the item re-surfaces.
- De-list a club's unconfirmed `legacy_person_club_affiliations` residue: one click transitions that club's `'pending'` rows to `'former_only'` in a single transaction (each row carries the actor and timestamp; one summary audit row records the action and count), guided by the oldest-row age shown in the queue. Safe to re-run; also cascaded by demote and archive.

Every admin action is recorded in the audit log. Concurrent admin coordination uses a lightweight claim marker per item (auto-releases on resolve or after a 30-minute stale-claim timeout).

#### Per-category terminal states

- **Pre-populated**: continues as a live `clubs` row until an admin action moves it. Member flags accumulate in the queue; admin decides whether to demote, mark inactive, archive, or dismiss.
- **Onboarding-visible**: reaches a terminal state when promoted to live (via wizard confirmation per §10.3 or via admin promotion), demoted to dormant (admin only), or archived (admin only).
- **Dormant**: revived through Stage 3A name search (per §10.3) or via admin promotion. Admin may archive a dormant candidate at any time.
- **Junk**: invisible to non-admin surfaces; admin force-keep returns it to the classifier's normal evaluation.

#### Labeled legacy affiliations on rosters

The platform's club-roster reads include `resolution_status='pending'` alongside `'confirmed_current'` and `'promoted'`, so loader-imported affiliations render on `/clubs/:key` from launch. Without this, every imported affiliation would be invisible until its member walked the onboarding wizard, and rosters would launch empty.

On the club detail page these are shown honestly: confirmed members appear under "Members", and `'pending'` rows appear under a separate, labeled "possible members from legacy records" section that states they have not yet confirmed in onboarding. A `'pending'` row is never presented as a current member. There is no read-filter revert; labeling, not hiding, is the long-term design.

The `'pending'` set drains through two paths: members confirm or decline their own rows during the onboarding wizard, and an admin retires a club's unconfirmed residue with a one-click de-list in the `A_Periodic_Club_Cleanup` queue (`'pending'` to `'former_only'`), also cascaded when a club is demoted or archived. The de-list is taken at the admin's discretion, guided by an advisory age signal, with no fixed deadline and no timed transition.

#### Closure

When every non-junk candidate has reached a terminal state, the `legacy_club_candidates` table may be dropped. Until then, it remains operational and queryable by admin through the cleanup queue. There is no fixed deadline; the table's lifetime is bounded by admin's pace.

---

## 11. Onboarding wizard service

The onboarding wizard is the primary surface for cleaning up legacy identity data. A single backend service, `MemberOnboardingService`, owns the per-member task list and orchestrates the wizard flow. `M_Complete_Onboarding_Wizard` is the source of truth for task states, entry-point semantics, applicability rules, skip/resume behavior, detour lifecycle, dashboard task-widget behavior, and audit emission. This section covers only the migration-specific design: task-to-source-flow routing and storage.

### Task catalog

Every member has an ordered task list. Tasks at cutover:

| Task type | Source flow | Owning service for the underlying logic |
|---|---|---|
| `personal_details` | Location, date of birth, first competition year, show competitive results | `MemberService` |
| `legacy_claim` | §7 auto-link or §8 self-serve claim | `IdentityAccessService` |
| `club_affiliations` | §10.3 three-stage club flow | clubs service |

Task ordering is fixed: `personal_details`, then `legacy_claim`, then `club_affiliations`. Adding a new task type later is a service-internal change (register a handler in the catalog); the service interface does not change.

### Storage

`member_onboarding_tasks` (DATA_MODEL §4.27) carries one row per (member_id, task_type) with state and timestamps. The table is permanent operational state, not migration-only.

### Relationship to §10.3

The club onboarding flow described in §10.3 (Stages 1A, 1B, 2A, 2B, 3A) is the spec for the `club_affiliations` task handler. The wizard service is the orchestration shell; §10.3 describes one task's content. The legacy-account claim flow in §7 and §8, and the direct-HP claim flow in §8, together render as the `legacy_claim` task: one page mixing legacy_members + historical_persons candidates with a manual-id fallback, deep-linking HP cards to `/history/:personId/claim`.

The onboarding wizard subsumes the narrower per-claim club review: every registrant sees the §10.3 flow regardless of whether they claim a legacy account.

---

## 12. Security model summary

- Legacy passwords are never imported, stored, or accepted
- `legacy_email` is migration metadata, not a login credential
- Auto-link sends no notification emails; the wizard's confirmation card is the only post-link member-facing surface (§7)
- Optional mailbox-control proof via a confirmation-link round-trip to the member's declared old email upgrades the audit evidence tier from `declared_anchor_only` to `mailbox_control_via_link_click`; it is an opt-in upgrade, not a required gate
- Member-declared anchors (former surname, declared old emails) are always private: visible only to the member and admin (§15)
- Imported rows cannot log in, cannot be searched, cannot receive member broadcasts
- Claim tokens (for the optional mailbox-link-click round-trip) are account-bound: consuming a token while authenticated as a different account fails
- Rate limiting applies to identifier lookups, declared-anchor changes, claim confirmations, and the optional mailbox-link-click round-trip, plus to password reset, password change, and registration
- The non-revealing messaging rule applies everywhere in the claim flow
- Bootstrap leadership confers zero live permissions until confirmed on a real modern account
- Name validation is loosened for imports (two words + no digits only); surname constraint scoped to new registrations and edits; declared former surnames extend the matching surface across all claim paths
- Cookie domain widening to `Domain=.footbag.org` (§29.15) sends the session token to every retained `*.footbag.org` hostname under the legacy host's parallel role (§29.12a). HTTPS is non-negotiable on retained subdomains for the parallel-role window; plain-HTTP exposure would leak the session token in cleartext on every request. The CSRF Origin-pin middleware (DD §3.3) is the cross-subdomain defense against a malicious form on a retained host

---

## 13. Admin flows

Migration-time admin involvement is reactive, not gating. Members confirm their own claims via the wizard; the platform applies effects only on member confirmation. Admin acts only when the member asks for help, when a dispute surfaces, or for read-only oversight of a narrow category of post-facto claims.

### Member-initiated admin link request (review)

The reactive recovery flow described in §15 is the only migration-time admin queue with active member-driven items. The member uses a self-serve affordance to request admin help when no candidate surfaces and the declared anchors cannot resolve their identity (legacy export quirks, lost identifiers, dead old mailbox, or unusual identity situations not captured by the structured anchors). The form collects free-text identity statement and any attachments / references the member can supply (board members or club leaders who can vouch, etc.). The request enters an admin queue.

Admins can:

- Read the request and its evidence
- Communicate with the member out-of-band if more is needed
- Approve and apply the link, with audit metadata recording the evidence tier as `admin_vetted_evidence`
- Reject with a reason

Admin link-approval does not auto-promote any legacy `is_admin` metadata to a live admin role.

The legacy banned flag is recorded as audit metadata only; it does not gate the link decision. Any disciplinary state is governed by the new platform's discipline mechanisms, not by legacy ban data.

### Honors-bearing direct claim oversight feed

Read-only feed listing every direct historical-record claim (per §8) that resolved an honors-bearing record (Hall of Fame, Big Add Posse) in the prior window. The feed is not a gating action; the claim has already applied. Admin uses the feed to spot suspect claims and, if community signal warrants, initiate a dispute revert via the standard admin recovery affordance. `A_View_Honors_Oversight_Feed` specifies the feed's surface and filters.

### Dispute revert

A real member arriving after an impersonator confirmed, or a member who confirmed a wrong card, can either use the registration-time conflict prompt (§8) inline at signup or invoke the member-initiated help request to ask admin to revert. Admin reverts by clearing the back-link columns and the tier grant; the audit row records the dispute event. After-the-fact disputes follow the same admin recovery pattern as link requests.

### Initial-admin bootstrap

At cutover, the platform has zero `is_admin=1` rows. The initial Application Administrator(s) are granted out-of-band by a System Administrator per DD §2.9. The grant path is reserved for inception and total-admin-loss recovery; all subsequent grants and revocations use the in-app admin-management story (US).

The grants satisfy go-live gate GV2 ("At least one administrator account provisioned in production and login-tested", §22). They are performed after the production DB is live and seeded, and before any admin-only path is opened to volunteers. Operator-facing procedure for the current bootstrap mechanism is documented in DEV_ONBOARDING.

The bootstrap path is exempt from the Tier 2 / Tier 3 status gate that the in-app admin-management story enforces. Rationale: at cutover the SysAdmin who performs the first grant may not yet have claimed their own legacy account, so their tier state is `tier0` even if they hold honors or paid tier in legacy (tier grants are written one row per member-confirmed claim, per State 4 step 4). The in-app gate exists to govern admin-to-admin grants where both parties have settled tier state; it does not apply to the SysAdmin's out-of-band first grant. The in-app gate remains in force for every grant after the first.

---

## 14. User stories summary

The stories below specify the user-facing behavior referenced throughout this document. Full story text lives in `docs/USER_STORIES.md`.

| Story | Actor | Summary |
|---|---|---|
| `M_Claim_Legacy_Account` | Logged-in member | Find and confirm pre-existing identity: card confirmations (wizard-staged candidates, cross-source candidate prompt, registration-time conflict prompt), declared-anchor entry (former surname, old emails), optional email round-trip click for hard evidence, direct historical-record claim affordance |
| `M_Complete_Onboarding_Wizard` | Newly verified member | Move through the universal wizard task list: legacy-claim task (always shown with declared-anchor prompt), club affiliation flow, optional metadata (first competition year, show competitive results) |
| `M_Edit_Profile` | Member | Edit profile including first competition year, show-competitive-results toggle, declared former surname, and declared old emails (declared anchors are visible only to the member and to admin) |
| `M_View_Profile` | Member or public viewer | View profile with competition history, historical name, caveat text; declared anchors are not surfaced publicly |
| `M_Delete_Account` | Member | Delete account; person links revert from `/members/` to `/history/`; declared anchors cleared on PII purge |
| `A_Review_Member_Link_Help_Requests` | Admin | Read member-initiated help requests with evidence; approve or reject the link with a reason |
| `A_View_Honors_Oversight_Feed` | Admin | Read-only feed of honors-bearing direct claims that confirmed in the prior window; no gating action |
| `A_Periodic_Club_Cleanup` | Admin | Ongoing queue: resolve wizard signals, member-flagged inaccuracies, suggested content edits, junk overrides, unpromoted candidates, and de-list unconfirmed legacy residue |

---

## Part B -- Contracts

## 15. Required schema changes

### 15.1 Credential-state invariant: two-way
Two-way CHECK on `members`: live account or purged row. Imported legacy accounts live in `legacy_members` (§2 Legacy member import), not as placeholder rows in `members`.

### 15.2 Location field nullability
`city` and `country` are nullable. `region` was already nullable.

### 15.3 Membership tier and Active Player are read-model-only
Current membership tier reads from `member_tier_current`. Active Player status reads from `member_active_player_current`. Combined gate: `member_membership_status_current`. No cached tier or status columns exist on `members`.

### 15.4 New migration fields on `members`
Added: `legacy_user_id`, `legacy_email`, `ifpa_join_date`, `birth_date`, `street_address`, `postal_code`, `legacy_is_admin`.

### 15.5 `legacy_banned`

Target / cutover-conditional field. Added to `legacy_members` (or a migration-only staging table joined to it) only when Gate G3 (§25) PASSes (i.e. when the legacy-account export contains a trustworthy banned/inactive field). Schema authority: `database/schema.sql`. Landing path: when G3 PASSes at test load, the column is added to `database/schema.sql` and applied to the staging DB in the same PR that includes the test-load loader change; production cutover (State 4) runs the migration against the production DB before the import step. When G3 FAILs, the column does not land; per §28 item 2 the questionable-row handling routes through admin review per §8 self-serve ineligibility instead.

```sql
legacy_banned INTEGER NOT NULL DEFAULT 0 CHECK (legacy_banned IN (0,1)),
```

Until G3 PASSes and the column lands, the claim flow treats banned/inactive handling as unresolved and routes questionable cases through admin review per §8 self-serve ineligibility rather than gating on the column value.

### 15.6 `legacy_member_id` uniqueness
Partial unique index `ux_members_legacy_id` on `members(legacy_member_id) WHERE legacy_member_id IS NOT NULL`.

### 15.7 Provisional uniqueness for `legacy_email` and `legacy_user_id`

Partial unique indexes:

```sql
CREATE UNIQUE INDEX ux_legacy_members_legacy_email
  ON legacy_members(legacy_email)
  WHERE legacy_email IS NOT NULL;

CREATE UNIQUE INDEX ux_legacy_members_legacy_user_id
  ON legacy_members(legacy_user_id)
  WHERE legacy_user_id IS NOT NULL;
```

If the test load disproves either uniqueness assumption (gates G1, G2 in §25), the partial unique index is replaced with a non-unique lookup index plus service-layer ambiguity handling in the claim flow.

### 15.8 `members_searchable` view
Includes `email_verified_at IS NOT NULL` filter.

### 15.9 `account_tokens`: `account_claim` type and target binding
`token_type` CHECK includes `'account_claim'`. `target_legacy_member_id` with `ON DELETE NO ACTION`.

Cleanup interaction: the §29.6 daily `account_tokens` cleanup job removes rows where `expires_at < now()` or where `consumed_at IS NOT NULL` and the consumption is older than the configured retention window. Because `legacy_members` rows are never deleted (they persist as permanent archival records, claimed or not), the `ON DELETE NO ACTION` FK on `target_legacy_member_id` is not load-bearing in production; it exists to prevent accidental cascade if a `legacy_members` row is ever administratively removed. The cleanup job operates on `account_tokens` only and does not need to inspect `legacy_members` state.

### 15.10 `member_club_affiliations`
Permanent operational table with one-current-club invariant.

### 15.11 `legacy_club_candidates`
Migration-only staging table.

### 15.12 `legacy_person_club_affiliations`
Migration-only staging table with dual partial unique indexes.

### 15.13 `club_bootstrap_leaders`
Operational table with `imported_member_id ON DELETE SET NULL` and a `status` lifecycle column (`provisional` → `promoted`, `rejected`, or `superseded`). Full schema in DATA_MODEL.

### 15.13a `legacy_members.claim_status`

Not present in the current schema. Optional post-MVP convenience unless a concrete query or admin workflow proves it is needed before cutover. Audit-log entries plus `claimed_by_member_id` / `claimed_at` remain authoritative.

### 15.14 `first_competition_year` and `show_competitive_results`
On `members` table.

### 15.15 Known name variants table

New table `name_variants` stores name-equivalence pairs that support auto-link matching (§7) and ongoing claim/registration-time prompts. Seeded at State 1 from mirror-mined pairs (~290); remains live post-cutover so admins and members may record further equivalences as new name collisions surface.

Schema authority: `database/schema.sql`. Contract:

- Two normalized columns (`canonical_normalized`, `variant_normalized`), composite primary key.
- `source` TEXT with CHECK in (`mirror_mined`, `admin_added`, `member_submitted`).
- `created_at` TEXT default `datetime('now')`.
- CHECK self-pairs rejected; both values non-empty.
- Secondary index on `variant_normalized` to support bidirectional lookup.

Relation semantics: symmetric. Storing `('robert', 'bob')` is equivalent to storing `('bob', 'robert')`; lookups must check both columns. Do not insert both directions.

Normalization is application-side (NFKC + lowercase + whitespace-collapse + trim) before any insert or lookup; the table stores only normalized forms.

Not prefixed `legacy_*` because the table is a permanent name-matching utility, not a migration-only staging artifact. Compare with `legacy_club_candidates` (migration-scope, resolves into `clubs` at State 2). Name variants have no resolution step; the pairs themselves are the permanent artifact.

### 15.16 Tier-mapping fields on `legacy_members`

Five fields capture legacy tier state for the §3 precedence rules:

- `legacy_ever_paid_tier2` INTEGER 0/1 — ever paid any Tier 2 dues; drives precedence 3.
- `legacy_ever_paid_tier1_lifetime` INTEGER 0/1 — explicitly bought Tier 1 Lifetime; drives precedence 4.
- `legacy_tier1_annual_active_at_cutover` INTEGER 0/1 — free-earned Tier 1 Annual active at cutover; drives precedence 5.
- `legacy_was_board_at_cutover` INTEGER 0/1 — Tier 3 / board at cutover; drives precedence 1.
- `legacy_board_underlying_paid_tier` TEXT NULL — board members only: `'none'`, `'tier1'`, `'tier2'`; drives underlying derivation.

Schema authority: `database/schema.sql`. The columns land on `legacy_members` before §25 gate G6 PASSes for State 2 → State 3.

Before G6 PASSes with the schema extension landed, each of the five fields is spot-checked at test load against a sample of known reference cases: HoF members with documented payment history, board members at cutover, and known lifetime-tier1 payers. If a field's values do not match the references (administrative corrections, refunded payments, test records, or other contamination), that field is excluded from the §3 mapping and the corresponding precedence row is dropped; G6 PASSes via partial fallback (the affected precedence row is removed, the others retain).

If test-load validation confirms the legacy export's tier fields are insufficient overall (multiple fields absent, semantically wrong, or quality too low to map deterministically), G6 PASSes via the honors-only fallback. The three paid-tier precedence rows from §3 (ever-paid-Tier-2, paid-Tier-1-Lifetime, and currently-active-Tier-1-Annual) are removed and the tier mapping reduces to "HoF or BAP grants `tier2`; everything else grants `tier0`." The fallback decision, when chosen (full or partial), is recorded in §28.

### 15.17 Declared former surname

Optional member-asserted profile field carrying a previous surname the member used (e.g. before marriage). Participates in claim matching across all claim paths alongside the current real-name surname. Self-asserted; no proof required.

Schema authority: `database/schema.sql`. Contract:

- New column `members.former_surnames` TEXT NULL holding a normalized list of zero or more former surnames (delimiter and normalization spelled out in `database/schema.sql`).
- Surfaces: optional input on the registration form, prompted within the wizard's universal claim task (reached afterward from the profile's legacy-claim link); see `M_Complete_Onboarding_Wizard`.
- Privacy: visible only to the member and to admin. Never surfaced on public profile, member search, or any cross-member listing.
- Cleared on PII purge alongside `members.legacy_member_id` and `members.historical_person_id`.

### 15.18 Declared old emails

Optional member-asserted profile field carrying zero or more email addresses the member previously controlled. Used as identity anchors against `legacy_members.legacy_email` during auto-link candidate matching (§7). The member can optionally elect a confirmation-link round-trip to one of these addresses to upgrade the audit evidence tier from `declared_anchor_only` to `mailbox_control_via_link_click`.

Schema authority: `database/schema.sql`. Contract:

- New table `member_declared_old_emails` keyed on `(member_id, normalized_email)` with `declared_at`, `verified_via_link_click_at` TEXT NULL, `verification_token_id` TEXT NULL.
- Surfaces: optional input on the registration form, prompted within the wizard's universal claim task (reached afterward from the profile's legacy-claim link).
- Privacy: visible only to the member and to admin. Never surfaced publicly.
- Cleared on PII purge.

### 15.19 Evidence-strength tag on claim transactions

Every confirmed claim transaction (auto-link card confirmation, cross-source candidate confirmation, mailbox-link-click round-trip, admin-help-request approval) carries an evidence-strength tag on its `audit_entries` row.

Tiers in increasing strength:

- `declared_anchor_only`
- `currently_controls_modern_email_matching_legacy`
- `mailbox_control_via_link_click`
- `admin_vetted_evidence`

Schema authority: `database/schema.sql`. The tag lives in `audit_entries.metadata_json` under a stable key (e.g. `evidence_strength`). The admin oversight feed (§13) filters by tier.

### 15.20 Staged auto-link candidates

Batch auto-link (§7) stages candidate matches without mutating live tables. Each staged candidate carries a member identifier, the target `legacy_members` and / or `historical_persons` rows, the matched anchor(s), and the proposed evidence tier. The wizard reads from this staging surface to surface cards at member sign-in.

Schema authority: `database/schema.sql`. Specific column shape and table name spelled out in the schema. The staging surface is migration-scope; rows resolve on member confirmation, decline, or expiration of the staging window.

### 15.21 Member-initiated admin link request

`work_queue_items` task_type `member_link_help_request` carries member-submitted help requests per §13. The request payload includes the member's identity statement, any attachments, and structured fields (claimed legacy username, claimed legacy email, references to community members who can vouch, etc.). The audit row written on admin approval carries `evidence_strength = 'admin_vetted_evidence'`.

Schema authority: `database/schema.sql`. The work_queue_items table already supports admin-queued tasks; the new task_type and its required payload fields are documented in the schema.

---

## 16. Data pipeline inventory

### Curated CSVs (human-curated, source of truth; committed to the repository)

Location: `legacy_data/event_results/canonical_input/`

- `persons.csv`: historical persons with IFPA IDs, honors, stats
- `events.csv`, `events_normalized.csv`: historical events
- `event_results.csv`: result entries
- `event_result_participants.csv`: participant-to-result mappings
- `event_disciplines.csv`: discipline breakdowns

### Extracted CSVs (from mirror, treated as source of truth; committed to the repository)

Location: `legacy_data/seed/`

- `clubs.csv`: club identities extracted from mirror
- `club_members.csv`: club membership associations from mirror (~2,400 associations)

### Generated CSVs (pipeline output, regenerable; not committed)

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

Pipeline scripts are owned by the historical-pipeline track; coordinate before touching.

### Accepted deviation: mirror member extraction code not yet committed

Production-shaping extraction code for the mirror member pipeline (the source of the ~1,600 club-only historical_persons rows per §10.2) lives outside the repository at present. The deviation is acknowledged here rather than hidden as a parenthetical. Unblock condition: the historical-pipeline maintainer commits the code into `legacy_data/scripts/` before §24 State 3 → State 4 transition; until then, the maintainer is the only person able to reproduce the extraction.

---

## 17. Migration vs operational table classification

| Table | Category | May be dropped |
|---|---|---|
| `members` | Permanent operational | Never |
| `legacy_members` | Permanent archival | Never. Persists as the permanent archival record of every legacy account, claimed or unclaimed. PII is purged only via member account deletion, which clears claim-state columns; the snapshot row itself remains. |
| `historical_persons` | Permanent operational | Never. Public historical-record source; populated from the human-curated CSV plus mirror-extracted club-only members. |
| `member_tier_grants` | Permanent operational | Never. Append-only ledger; the active-tier read model derives from this. |
| `member_declared_old_emails` | Permanent operational | Never (§15.18) |
| `legacy_club_candidates` | Migration-only staging | Yes, after all onboarding-visible and dormant clubs are either created or abandoned, and all bootstrap decisions are finalized |
| `legacy_person_club_affiliations` | Migration-only staging | Yes, after all affiliation suggestions are resolved |
| `club_bootstrap_leaders` | Operational, migration-origin | Yes, after all provisional rows reach a terminal state (`claimed`, `superseded`, or `rejected`) |
| `member_club_affiliations` | Permanent operational | Never |
| `name_variants` | Permanent operational | Never (name-matching utility; see §15.15) |
| Auto-link candidate staging | Migration-only staging | Yes, after all staged candidates resolve (member confirm, member decline, or expiration of the staging window). Specific table name spelled out in `database/schema.sql` (§15.20). |

---

## 18. Audit requirements

No migration dashboard is required. The existing append-only audit history records all migration events.

Scope note: this section enumerates migration-specific events only. General auth audit events (e.g. `password_changed`, `login_rate_limit_exceeded`, `account_locked`) are out of scope here; they share the same append-only audit history but are defined in the security-model documentation.

Required event types:

Auto-link and member-confirmed claim:

- `auto_link_candidate_staged` — batch or registration-time pass staged a candidate for a live member.
- `auto_link_candidate_confirmed` — member confirmed a staged candidate via the wizard.
- `auto_link_candidate_declined` — member declined a staged candidate.
- `auto_link_candidate_expired` — staged candidate aged out without member action.
- `cross_source_candidate_offered` — after a first-source confirm, the platform offered an inline second-source candidate.
- `cross_source_candidate_confirmed` — member confirmed the second-source candidate.
- `cross_source_candidate_declined` — member declined the second-source candidate.
- `registration_time_conflict_prompted` — surname collision detected at signup against an already-claimed record.
- `registration_time_conflict_disputed` — registrant invoked the dispute path from the conflict prompt.

Direct historical-record claim:

- `direct_hp_claim_completed` — member confirmed a direct historical-record claim, with or without transitive legacy-account claim.
- `direct_hp_claim_blocked` — surname rule rejected the claim server-side.

Optional mailbox-control round-trip:

- `mailbox_link_token_issued` — confirmation link generated and sent to a declared old email.
- `mailbox_link_token_consumed` — member clicked the link; evidence tier upgraded.
- `mailbox_link_token_expired` — token aged out without click.

Member-initiated admin link request:

- `admin_help_request_submitted` — member submitted a help request with evidence.
- `admin_help_request_approved` — admin approved the request and applied the link.
- `admin_help_request_rejected` — admin rejected with a reason.

Dispute and revert:

- `claim_dispute_opened` — dispute filed against a confirmed claim (inline conflict prompt or admin route).
- `claim_revert_applied` — admin reverted a previously-confirmed claim; back-link columns cleared, tier grant revoked.

Club bootstrap:

- `legacy_club_bootstrap_created`
- `legacy_club_bootstrap_promoted`
- `legacy_club_bootstrap_superseded`

Required metadata per event where applicable:

- Active member ID
- `legacy_member_id`
- Masked `legacy_email`
- Anchor(s) that matched (modern email, declared old email, declared former surname, current real-name surname)
- Evidence-strength tag per §15.19 (every confirmed-claim event)
- Merge field summary (for completed claims)
- Tier-change summary (for completed claims)
- Club IDs involved (for bootstrap events)
- Admin reason / verification note (for admin-help and dispute events)
- Original claim audit row identifier (for revert and dispute events)

---

## 19. What we need from the legacy-site webmaster

The legacy-site webmaster (contact at `brat@footbag.org`, DD §5.5) is the current operator of the live legacy site. This section is organized around the webmaster's concerns: architecture, data export, DNS and infrastructure, email, feature continuity, and community knowledge. It covers both deliverables the maintainer needs and open questions only the webmaster can answer.

MVP scoping and the open questions in this section require two partners: the legacy-site webmaster, who holds the legacy-system facts (DNS, mail, server config, data), and the IFPA secretary, who holds IFPA governance answers (membership policy, committees, records, rules currency). The written design in these canonical docs is the baseline for going forward; feedback, constructive criticism, and suggestions from the webmaster or IFPA are welcome at any time, but proposed changes are made as specific, concrete doc-revision requests, and the maintainer keeps the canonical docs.

The webmaster is not asked to produce club data; that comes from the mirror pipeline (§20). The long-term operator pattern for coordinating with any external DNS/mail upstream is documented in `docs/DEVOPS_GUIDE.md` §16.8; this section applies that pattern to the webmaster's specific contract.

### 19.1 Architecture decision

1. **Front-door architecture**: the webmaster and the maintainer must agree on who is the "front door" for `footbag.org` after cutover. See §28 "Architecture fork" for the full trade-off between Option A (legacy server as front door with reverse proxy to the new platform) and Option B (CloudFront as front door, legacy server for retained subdomains and email). This decision gates the DNS path, the cutover sequence, and the TLS/cookie obligations. The MP currently assumes Option B.

### 19.2 Legacy site and data export

2. **Legacy technology stack**: what language, framework, and database engine/version does the legacy site run? Informs how hard the export is to produce, whether the webmaster needs help writing the export query, and whether Option A reverse-proxy is straightforward with the existing stack.

3. **Member count and activity**: roughly how many member accounts exist on the legacy site? How many have logged in within the last 2 years? Sizes the auto-link candidate pool, the SES production-access volume estimate, and admin-recovery capacity planning.

4. **Legacy hosting**: where is the legacy server hosted? (Self-hosted, VPS, cloud provider, shared hosting.) What are the uptime expectations during a 12-month parallel window?

5. **Payment provider**: does the legacy site use Stripe for payments, or a different provider? If different, there may be active subscriptions or recurring donations that need transition planning.

6. **Test export**: a full export of live legacy member records, in the canonical export format (item 7 below), for validation purposes only (no production changes). The test export is the single highest-value early deliverable: it unblocks all data-quality validation, auto-link coverage projections, and tier-mapping decisions on the new-platform side. What is the webmaster's timeline for producing it?

7. **Canonical export format**: CSV, UTF-8 encoded, LF line endings, RFC 4180 quoting, empty string for NULL, ISO 8601 dates (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ for timestamps), comma delimiter. The same format is used for the test export and the final production export.

8. **Field semantics confirmation**: for each export column, especially:
   - Legacy member ID (field name, format, uniqueness guarantee)
   - Legacy username (field name, uniqueness guarantee)
   - Legacy email (field name, uniqueness guarantee)
   - Account registration / signup date (distinct from `ifpa_join_date`; tracks tenure on the legacy site)
   - Last-activity timestamp (most-recent login or session activity, if available; used to size the member-initiated admin help request queue (§13), the post-cutover honors oversight digest (§7), and admin-recovery capacity planning)
   - Tier / membership fields (current tier, expiry dates, tier history if available)
   - Account-status flags of any kind: `banned`, `inactive`, `is_admin`, `suspended`, `locked`, `deleted`, `expired`, `lapsed`, `no_contact`, privacy/visibility flags (e.g. `hidden`, `private_profile`), opt-out flags, and any other column on the legacy `members` table whose value gates eligibility for self-serve claim, opens admin-recovery paths, or affects what the member sees on the legacy site. Confirm presence, reliability, and semantics for each. If unsure whether a column counts, include it.

9. **Password-column exclusion**: confirm explicitly that the export contains no password columns (no `password_hash`, no salt, no iteration count, no recovery-question answers). Password material is never imported (DD §3.9). The exclusion is a hard contract, not an implicit assumption. In addition to the webmaster's confirmation, the operator independently schema-checks the received export before loading and aborts the load if any password-bearing column is present; attestation alone is insufficient, so the schema-check is mandatory.

10. **Namespace agreement for `legacy_member_id`**: confirm that the integer IDs in the export are the same integers used in the legacy site's `members/profile/{id}` URLs (the mirror-derived namespace). If they diverge, resolve before any test import; otherwise every `historical_persons.legacy_member_id` → `legacy_members.legacy_member_id` back-link in the pipeline is invalidated.

11. **Namespace verification protocol**: a 10% spot-check sample of `legacy_member_id` values from the test export is cross-referenced against the mirror-derived baseline ID range. The webmaster's export ID range and the mirror's must overlap; new IDs that exist only in the export are expected (post-mirror accounts) but the overlap region must agree row-for-row.

12. **Banned-member product semantics**: confirm whether the `banned` flag is reliable and document the operational handling. Default product behavior (§8 claim ineligibility, §13, §28 item 5): the legacy banned flag is recorded as audit metadata only and does not gate the self-serve claim card; disciplinary state is handled by the new platform's own discipline mechanisms, not by legacy ban state. The one admin-routed case is the Gate G3 FAIL path (§15.5): when the export carries no trustworthy banned field, rows with an untrusted banned/inactive indicator are routed to admin review because the platform cannot auto-apply a flag it cannot trust. The `legacy_banned` flag is not directly UI-visible to the claiming member. Whether to introduce gating for trustworthy bans is an open policy item pending webmaster and IFPA board input (§28 item 5); the audit-only default stands until then.

13. **Data-quality metric requests**: an estimate of the percentage of `legacy_email` addresses that are plausibly still deliverable (informs auto-link coverage projections), and the last-activity timestamp per row (informs admin-recovery capacity planning).

14. **Final production export**: after write freeze, identical format to the test export.

### 19.3 DNS and infrastructure

15. **Zone authority and apex capability**: identify the registrar and the authoritative-DNS provider for `footbag.org`. Confirm the provider supports ALIAS or ANAME at apex (Route 53, Cloudflare DNS, NS1, and a few others qualify); a plain CNAME at apex is illegal per RFC 1034. If the current provider does not support apex ALIAS and Option B is chosen, the zone migrates to a capable provider before T-0. **STATUS: OPEN. This is the most likely technical showstopper for CloudFront integration under Option B. The answer is knowable now (`dig footbag.org NS` + provider feature check). If the zone must migrate, the migration is a multi-day operation that changes who controls DNS for all of `*.footbag.org` and must be planned well ahead of cutover, not discovered at T-7d.**

16. **Legacy subdomain inventory**: enumerate every `*.footbag.org` subdomain that must continue resolving at the legacy host through cutover and beyond the §27 rollback window, distinct from `footbag.org` and `www.footbag.org` (which move to CloudFront at T-0 under Option B). `archive.footbag.org` is reserved for the new platform per §29.15. Full inventory needed, not just the subdomains the webmaster thinks of first. The inventory comes from the webmaster, not the repo: the GitHub mirror is incomplete and does not represent DNS or server config, so it cannot pre-populate this list. A known candidate to confirm and disposition is `lists.footbag.org` (frozen read-only listserv archive). Any private operator-only subdomain (for example a private proxy host) must be flagged private and not-for-publication: it must not appear in public docs or be exposed via zone transfer. Media reachable only by direct `video.`/`photo.` file paths is handled under §29.15 (archive completeness), not retained as a subdomain.

17. **Records-actor for cutover changes**: identify who applies the maintainer-supplied records to the zone at cutover. Three answers are acceptable: (a) the webmaster himself, (b) a named delegate, or (c) the registrar/DNS provider's self-serve portal with named credential owner. The maintainer supplies the values; the identified actor applies them. The records are: the apex and `www` swap to the production CloudFront distribution, the ACM validation CNAMEs (temporary, during issuance), the SES DKIM CNAMEs (permanent), the `archive.footbag.org` ALIAS pointing at the archive distribution, and the `footbag.org` MX repoint to Google Managed Services (applied in the discrete pre-T-0 mail-cutover step). MX disposition is settled under the "MX disposition" subsection of §29.12a (the `footbag.org` MX moves to Google Managed Services in a discrete pre-T-0 step; SES verification is at the DKIM-CNAME level and is independent of MX).

18. **DNS cutover coordination**: confirm the cutover sequence per §29.12, T-7d minimum lead time to the webmaster; TTL lowered to 300s at T-48h; TTL stays at 300s through the §27 48h rollback window (T-48h to T+48h).

19. **Secondary contact and unavailability protocol**: confirm a secondary contact (phone, alternate email, or named delegate) reachable on demand during the §27 48h rollback window. The secondary is empowered to apply pre-supplied DNS revert records or to coordinate with the registrar/portal credential owner identified in item 17 if the webmaster is unreachable during a rollback incident.

20. **TLS health on retained subdomains across the parallel-role window** (Option B only): every retained `*.footbag.org` subdomain (per item 16) must serve HTTPS for the duration of the parallel-role window because the new-platform session cookie widens to `Domain=.footbag.org` per §29.15 and is sent to every retained hostname. A lapsed TLS certificate on any retained subdomain leaks the session token in cleartext on every request to that hostname. Coordination: the webmaster commits to monitoring TLS expiry on the retained subdomains and renewing before lapse. The maintainer adds a periodic external probe (cron + curl) against each retained hostname's TLS expiry; alarms are wired to the maintainer's notification channel and to a secondary webmaster contact. The probe and alarms are spec'd in §29 as a new operational readiness gate.

### 19.4 Email

See §28 "Email transition" for the full consolidation of email open items, the proposed v1 architecture (managed inbound provider + SES outbound), and the maintainer's preference to resolve all email at v1. The coordination items specific to the webmaster:

21. **Email inventory**: what `@footbag.org` mailboxes and aliases exist today? Which are actively used vs. dead or spam-only?

22. **Mailing list inventory**: what mailing lists exist, who manages them, and what software runs them? (announce@, board@, committee lists, regional lists, others.) Are there complex features (moderation, archives, digests) or are they simple distribution lists? IFPA `@ifpa.footbag.org` list mail is dispositioned separately under §29.12a (IFPA list mail), not as part of the ordinary `@footbag.org` inventory.

23. **Mail server platform**: what is the current mail server platform (Postfix, Exchange, hosted provider, etc.)? Needed for migration planning.

24. **Mail server duration**: is the webmaster OK with handing off all email at cutover (v1), or does he want to keep running the mail server during the parallel window? The maintainer prefers v1 handoff if feasible.

25. **Mailbox type**: are any `@footbag.org` addresses real mailboxes that people log into (IMAP/POP), or are they all forwarding aliases? Determines whether a managed provider with mailbox hosting is needed or if simple forwarding/alias configuration suffices.

### 19.5 Feature continuity

26. **Group, committee, and mailing-list continuity**: inventory every group, committee, and mailing list active on the legacy site. For each, propose the cutover allocation: (a) stays on legacy parallel-role server (continues to receive mail through the legacy mail server, continues to be addressable through the webmaster's retained subdomains); (b) migrates to the new platform pre-cutover (requires a new-platform feature build, scoped separately from this MP); (c) is retired with consent. Default per item: stays on legacy parallel-role server unless the webmaster and maintainer agree the function must migrate or retire. No item goes dark at T-0 (per §29.12a constraint 5). IFPA `@ifpa.footbag.org` list functions and the legacy group-message archive are excluded from this generic allocation and are dispositioned under §29.12a (IFPA list mail / sealed legacy email archive); their disposition authority rests with IFPA governance.

27. **Tournament in a box**: see §28 "Tournament in a box" for the full set of open questions. The webmaster must define what the legacy tournament management feature does today before it can be placed in the phased feature scope.

28. **Forum retirement**: when is the webmaster comfortable retiring the legacy forums? The new platform will not replicate forum functionality; legacy forum content goes to a read-only archive at `archive.footbag.org`.

### 19.6 Cutover operations

29. **Write-freeze coordination**: the legacy member-account database (the data being exported) enters read-only / no-new-registrations mode before the final export. Retained `*.footbag.org` services not in v1 scope (per §28 "Phased feature scope") may continue to operate per item 16 and §29.12a. Open coordination items, derivative of the phased scope, to be settled before §23 Phase 4: (a) how many hours before the final export the freeze begins; (b) the user-facing notice the legacy site displays during the freeze.

30. **Legacy database retention**: keep the legacy database available for at least 30 days after T+48h (the end of the §27 rollback window) for manual recovery reference. Total minimum legacy-host DB availability is therefore T-0 through T+48h + 30 days.

31. **Parallel-role duration**: agree a hard end-date by which the legacy host's parallel role ends; default policy is not later than 12 months post-cutover, with longer durations requiring IFPA board sign-off. Items still required after the end-date must migrate to the new platform or be retired.

### 19.7 Community knowledge

32. **Impersonation risk magnitude**: how significant is the risk that a registrant picks a famous competitor's surname (or declares a former surname matching one) and confirms a card or a direct historical-record claim under a false identity? See §28 "For the legacy-site webmaster's community knowledge" for how this informs the platform's gate stance.

33. **Banned policy carryover**: what fraction of legacy bans represent ongoing community issues vs. stale historical bans that nobody would enforce now? See §28 "For the legacy-site webmaster's community knowledge" for how this informs the platform's banned-member handling.

### 19.8 Action sequencing

**Step 0 (gates everything else):** answer item 1 (architecture fork).

**Before a cutover date can be set (these can proceed in parallel):** answer item 15 (DNS registrar + apex capability, the most likely technical showstopper under Option B); answer items 2-5 (legacy tech stack, member count, hosting, payments); produce the test export (item 6); answer items 21-25 (email inventory, mailing list inventory, mail server platform, handoff preference, mailbox type); answer item 27 (tournament in a box scope); answer item 16 (subdomain inventory).

**After those answers, before cutover:** answer items 26, 28 (groups, committees, forums); answer items 17-19 (DNS actor, cutover coordination, secondary contact); answer items 32-33 (impersonation risk, banned policy); add DKIM CNAME records to the DNS zone (maintainer supplies values); agree on parallel-window end-date (item 31); agree on write-freeze timing and notice text (item 29); produce the final production export (item 14).

**During parallel window:** keep legacy server running (and mail server if email not handed off at v1); maintain TLS certs on all retained subdomains if Option B (item 20).

---

## 20. What we need from the historical-pipeline maintainer

The historical-pipeline work:

1. **Club extraction into pipeline**: move mirror club extraction scripts into the historical pipeline; club identity normalization, affiliation inference, leadership inference. Classify clubs per the rules in section 10.1 (requires: `last_updated` and `created` from `clubs.csv`, most recent hosted event year from event HTML cross-reference, club contact member IDs matched to `historical_persons.last_year`, member counts, and description presence). Set `bootstrap_eligible` for pre-populated clubs with strong-classification leader candidates per section 2 bootstrap rule
2. **Mirror member extraction** into `historical_persons`: ~1,600 club-only members from the mirror who never appeared in event results. Field mapping: mirror member ID → `historical_persons.legacy_member_id`; mirror display name → `historical_persons.person_name` (after NFKC normalization + suffix stripping per §4); mirror country → `historical_persons.country`; mirror first-seen year → `historical_persons.first_year` if present, else NULL; `import_source` set to `'mirror_member_extraction'`. Conflict policy: if a mirror member's `legacy_member_id` matches an existing `historical_persons` row (cross-source identity collision), the mirror row is dropped with a logged conflict entry; the existing row wins because event-result provenance is stronger than membership-only provenance.
3. **Known name variants table**: seeded from mined data per §15.15
4. **World records CSV**: for the records page; loadable per G15
5. **Data review confirmation**: confirming legacy data is complete and member-list presentation is reviewed (unblocks members ungating). Recorded as a row in `audit_entries` with `action_type='legacy_pipeline.data_review_signoff'` and the historical-pipeline maintainer's identity in `actor_member_id`; `metadata_json` carries reference identifiers and a free-text reasoning summary.

---

## 21. Design decisions affected

The following design decisions require updating or creation before or after go-live. Do not update without explicit human approval per project rules.

| Decision | Change required |
|---|---|
| DD 2.4 (three-table identity model) | Verify alignment of claim-state column names (`claimed_by_member_id`, `claimed_at`) and the invariants listed in DD §2.4 against the §2 / §15 schema specs in this document; reconcile any drift before cutover |
| DD 3.8 (account security tokens) | `account_claim` token type used only for the optional mailbox-control upgrade round-trip to a member-declared old email; account-bound (`member_id` + `target_legacy_member_id` reference) with `ON DELETE NO ACTION` |
| DD 3.9 (security / privacy) | Add: legacy passwords never imported; `legacy_email` is migration metadata only; auto-link sends no notification emails; mailbox-control proof is an opt-in upgrade rather than a required gate; declared anchors (former surname, declared old emails) are member-and-admin private; cookie-domain widening risk and HTTPS-on-retained-subdomain constraint per §29.12a / §29.15 |
| DD 6.5 (legacy data migration) | Full replacement per this document. Tier mapping lives at `MIGRATION_PLAN.md` §3 (Tier handling at claim) |
| DD (new) name model | Two-field name model, surname constraint, slug lifecycle, import exemption, declared former-surname extension (always private) |
| DD (new) auto-link | Stage-and-confirm model with no notification emails; member confirms via the wizard; evidence-strength tag on every confirmed claim; honors-bearing direct claims apply without admin pre-screening (oversight feed only) |
| DD (new) competition history | `first_competition_year` and `show_competitive_results` fields, opt-out semantics, caveat text |
| DD (new) declared identity anchors | Optional member-declared former surname (§15.17) and declared old emails (§15.18); member-and-admin private; participate in claim matching across all paths |

---

## Part C -- Go-live

## 22. Go-live blocker index

All pass/fail go-live blockers in one view. Gate definitions and failure handling live in the referenced sections. Each entry shows the blocker ID, a one-line criterion, the section with full detail, and the operational-state transition it blocks.

This list is comprehensive for go-live cutover blockers. Broader product work that does not gate cutover lives in `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, and the active-slice trackers in `IMPLEMENTATION_PLAN.md` files.

### Data-quality, pipeline-output, and code-behavior gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| G1 | `legacy_email` unique where non-NULL | §25 | State 2 → State 3 |
| G2 | `legacy_user_id` unique where non-NULL | §25 | State 2 → State 3 |
| G3 | Trustworthy `banned` field in export | §25 | State 2 → State 3 |
| G4 | Profile/contact field shape and null quality | §25 | State 2 → State 3 |
| G5 | Legacy member ID quality | §25 | State 2 → State 3 |
| G6 | Tier-state mapping inputs | §25 | State 2 → State 3 |
| G7 | Mirror-derived club normalization quality (requires G12 PASS first) | §25 | State 2 → State 3 |
| G8 | High-confidence bootstrap leader candidates | §25 | State 2 → State 3 |
| G9 | Bootstrapped clubs produce valid pages | §25 | State 2 → State 3 |
| G10 | Outbox → SES → inbox smoke passes end-to-end | §25 | State 3 → State 4 |
| G11 | `name_variants` seeded (~290 pairs) | §25 | State 1 → State 2 |
| G12 | ~1,600 club-only persons extracted into `historical_persons` | §25 | State 1 → State 2 |
| G13 | `club_bootstrap_leaders` populated | §25 | State 1 → State 2 |
| G14 | `persons.csv` count reconciled | §25 | State 1 → State 2 |
| G15 | World records platform export produced | §25 | State 1 → State 2 |
| G16 | `run_pipeline.sh full` produces full output | §25 | State 1 → State 2 |
| G17 | Claim flow anti-enumeration invariant holds | §25 | State 2 → State 3 |
| G18 | Rate limiting active on claim / registration / password-reset | §25 | State 2 → State 3 |
| G19 | Wizard claim task universal; all evidence tiers exercised at test load | §25 | State 2 → State 3 |
| G20 | Data review sign-off: legacy data complete, member-list presentation reviewed; recorded as an audit_entries row | §25 | State 1 → State 2 |
| G21 | `legacy_user_id` and `legacy_email` populated on canonical `persons.csv` where mirror provides them | §25 | State 1 → State 2 |
| G22 | Optional mailbox-control round-trip to declared old email verified end-to-end; evidence-tier upgrade audited | §25 | State 2 → State 3 |
| G23 | Multi-anchor candidate matching covers modern email + declared old emails + declared former surname + current real-name surname; `name_variants` in play | §25 | State 2 → State 3 |
| G24 | Batch auto-link candidate-staging SYS job ready to run at cutover (stages candidates only; no live-table mutation, no emails) | §25 | State 3 → State 4 |
| G25 | Direct historical-record claim affordance live: first-name warning UX, surname-mismatch messaging (current + declared former), audit metadata with evidence tier | §25 | State 2 → State 3 |
| G26 | Member-initiated admin help request wired (structured evidence intake, admin review surface, audit on approval) | §25 | State 2 → State 3 |
| G27 | Multi-record candidate ambiguity count measured against test load and within wizard confirmation throughput (or `name_variants` pruned) | §25 | State 2 → State 3 |

### External dependencies

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| EX1 | `footbag.org` domain owned by IFPA, DNS pointing to new platform | §23 Phase 4 prereqs | State 3 → State 4 |
| EX2 | SES production access granted for AWS account | §23 Phase 4 prereqs | State 3 → State 4 |
| EX3 | `footbag.org` verified as SES sender identity at the domain level via DKIM CNAMEs in the zone (per §29.12a MX disposition) | §29.5 | State 3 → State 4 |
| EX4 | ACM certificate for `footbag.org` issued in `us-east-1` and attached to CloudFront | §29.9 | State 3 → State 4 |
| EX5 | Stripe production live API keys + webhook secret in Parameter Store; webhook endpoint configured; one end-to-end webhook delivery confirmed | §29.9 | State 3 → State 4 |
| EX6 | SES bounce/complaint SNS subscription tested with synthetic bounce; hard-bounce suppression confirmed in app | §29.5 | State 3 → State 4 |
| EX7 | `footbag.org` MX repointed to Google Managed Services in the discrete pre-T-0 mail-cutover step; all active `@footbag.org` aliases provisioned on Google from the confirmed inventory; inbound delivery verified end-to-end before the web cutover | §28, §29.12a | State 3 → State 4 |

### Legacy-site webmaster coordination

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| WM1 | Test export delivered and validated in the canonical format | §19 items 6, 7 | State 1 → State 2 |
| WM2 | Legacy-export field semantics confirmed (IDs, username, email, registration date, last-activity, tiers, banned flags) | §19 item 8 | State 1 → State 2 |
| WM3 | Password-column exclusion confirmed (no `password_hash`, salt, or related material in export) | §19 item 9 | State 1 → State 2 |
| WM4 | Namespace agreement for `legacy_member_id` confirmed and verified by 10% spot-check | §19 items 10, 11 | State 1 → State 2 |
| WM5 | Banned-member product semantics confirmed; admin-recovery routing documented | §19 item 12 | State 1 → State 2 |
| WM6 | Data-quality metrics delivered (deliverability estimate, last-activity timestamps) | §19 item 13 | State 1 → State 2 |
| WM7 | Final production export delivered post-write-freeze, identical format to test export | §19 item 14 | State 3 → State 4 |
| WM8 | Write-freeze / maintenance mode coordinated on legacy site (dependent on §28 phased feature scope) | §19 item 29 | State 3 → State 4 |
| WM9 | Legacy database retention committed (minimum 30 days post-cutover) | §19 item 30 | State 3 → State 4 |
| WM10 | DNS cutover timing and TTL reduction window coordinated | §19 item 18 | State 3 → State 4 |
| WM11 | Legacy subdomain inventory enumerated and recorded; allocation between legacy host and new platform agreed (dependent on §28 phased feature scope) | §19 item 16 | State 3 → State 4 |
| WM12 | Hard end-date for the legacy host's parallel role agreed and recorded; default policy: not later than 12 months post-cutover; longer durations require IFPA board sign-off | §19 item 31 | State 3 → State 4 |
| WM13 | `footbag.org` zone registrar and authoritative-DNS provider identified; provider confirmed to support ALIAS or ANAME at apex, OR zone migration to a capable provider planned and started | §19 item 15 | State 2 → State 3 |
| WM14 | Records-actor confirmed for the maintainer-supplied records at cutover (apex/`www` swap, ACM validation CNAMEs, SES DKIM CNAMEs, `archive.footbag.org` ALIAS, and the `footbag.org` MX repoint to Google Managed Services applied in the discrete pre-T-0 mail-cutover step); registrar-portal credential owner identified if no named human actor exists | §19 item 17 | State 3 → State 4 |
| WM15 | Secondary webmaster contact (phone, alternate email, or named delegate) documented and tested-reachable; unavailability protocol agreed for the §27 48h rollback window | §19 item 19 | State 3 → State 4 |
| WM16 | Group, committee, and mailing-list continuity inventory complete with per-item allocation (legacy parallel role / migrate to new platform / retire); no item goes dark at T-0 (dependent on §28 phased feature scope) | §19 item 26 | State 3 → State 4 |
| WM17 | Webmaster commits to monitoring TLS expiry on every retained `*.footbag.org` subdomain across the parallel-role window; renewal before lapse (Option B only) | §19 item 20 | State 3 → State 4 |
| WM18 | Architecture fork decided (Option A or Option B per §28) | §19 item 1 | State 1 → State 2 |

### Operational readiness gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| OR1 | Data backup and disaster recovery | §29.1 | State 3 → State 4 |
| OR2 | Observability and monitoring readiness | §29.2 | State 3 → State 4 |
| OR3 | Edge and origin security | §29.3 | State 3 → State 4 |
| OR4 | IAM least-privilege scope-down | §29.4 | State 3 → State 4 |
| OR5 | Email deliverability operations | §29.5 | State 3 → State 4 |
| OR6 | Scheduled maintenance jobs | §29.6 | State 3 → State 4 |
| OR7 | Secrets rotation | §29.7 | State 3 → State 4 |
| OR8 | Production database restore drill completed against a copy of production data | §29.1 | State 3 → State 4 |
| OR9 | Post-launch admin curator authoring scheme designed and implemented | §29.14 | State 3 → State 4 |
| OR10 | Pre-flip DB snapshot captured, integrity-verified, restored against staging in dry-run | §29.1a | State 3 → State 4 |
| OR11 | Legacy archive subdomain reachable end-to-end (S3, CloudFront, signed-cookie key group, DNS, cookie-Domain widening) | §29.15 | State 3 → State 4 |
| OR12 | Retained-subdomain TLS health probe wired with alarms to maintainer and secondary webmaster contact; daily check; expiry-grace window configurable | §29.16 | State 3 → State 4 |
| OR13 | Curator content seeder (`src/services/curatorSeedService.ts`) routed through the async `media_jobs` lifecycle (presigned PUT to S3, transcode dispatched to worker container); OOM dry-run completed on the production-host memory profile against the full production seed manifest | §29.13 | State 3 → State 4 |
| OR14 | Pre-cutover audit confirms every retained `*.footbag.org` subdomain (per §19 item 16) serves a valid HTTPS certificate matching its hostname; baseline reading recorded before cookie-Domain widening lands | §29.15, §29.16 | State 3 → State 4 |
| RD1 | Legacy URL forwarding redirect handlers cover all in-flight email patterns (`/members/profile/:legacyMemberId`, `/clubs/:slug`, forum threads) per §29.12b; sample-replay validation against a stored set of legacy URLs passes at test load | §29.12b | State 3 → State 4 |

### Code governance gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| GV1 | GitHub `main` branch protection enforced (PR required, status checks must pass, linear history) | §29.10 | State 3 → State 4 |
| GV2 | At least one administrator account provisioned in production and login-tested | §29.10 | State 3 → State 4 |

### Compliance gates

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| LEG1 | Privacy policy, Terms of Service, and cookie banner (if applicable) reviewed and accessible from the production site footer | §29.11 | State 3 → State 4 |

### Pre-cutover revert and rotation checklist

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| PC1 | JWT session TTL reverted to the DD §3.4 baseline (24h); staging observability-tuned values removed from production source path before the cutover deploy | §23 Phase 4 prereqs; §29.8 | State 3 → State 4 |
| PC2 | SES sender cutover to `noreply@footbag.org` | §29.8 | State 3 → State 4 |
| PC3 | Lightsail SSH firewall rule restore | §29.8 | State 3 → State 4 |
| PC4 | SES sandbox-mode flip | §29.8 | State 3 → State 4 |
| PC5 | Production Terraform default region fix: us-east-2 → us-east-1 | §29.8 | State 3 → State 4 |
| PC6 | Preview fixture scrub | §29.8 | State 3 → State 4 |
| PC7 | Production-first-admin SSM-token route lands per DD §2.9 | DD §2.9, DEVOPS_GUIDE §17.8 | State 3 → State 4 |

### Retirement gate

| ID | Criterion | Section | Blocks |
|---|---|---|---|
| R1 | QC subsystem retired (routes, code, tables, tests) | §30 | State 3 → State 4 |

---

## 23. Phasing

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
- Wizard-confirmed claim flow with declared-anchor inputs and optional mailbox-link-click upgrade
- Batch auto-link candidate staging at cutover (no live-table mutation; no notification emails)

### Phase 4: Go-live

External prerequisites that must land before Phase 4 starts:

- **`footbag.org` domain owned by IFPA** and pointing DNS to the new platform. Blocks the DNS switch and the cutover of `SES_FROM_IDENTITY` to `noreply@footbag.org` (used by registration-verification, password-reset, optional mailbox-link-click round-trip, and other transactional mail; auto-link itself sends no email per §7).
- **SES production access granted** for the AWS account. Sandbox caps are 200 sends/day and require per-recipient verification; transactional mail (registration verification, password reset, optional mailbox-link-click) is incompatible with sandbox. Production access is an AWS support ticket with a typical 24-48h approval window; start early (see State 3 readiness checklist).
- **`footbag.org` verified in SES at the domain level** (sender identity for the entire domain via DKIM CNAMEs, per §29.12a MX disposition) and runtime-role `ses:SendEmail` IAM policy pinned to the `footbag.org` domain identity ARN (post-production-access, the recipient-identity permission check goes away, so the sender-only pin is sufficient and least-privilege). Outbound mail uses `noreply@footbag.org` as the FROM address; no separate verification of the `noreply@` mailbox is needed.
- **JWT session TTL at the DD §3.4 baseline** (24h). The TTL is a source-compiled constant, not a runtime config value; staging observability-tuned values are reverted by editing source and rebuilding before the cutover deploy. Allow source-change + deploy-cycle lead time when scheduling Phase 4.
- **Email-delivery smoke passes end-to-end** on the final pre-cutover release: enqueue a test row via the outbox, worker drains, SES accepts, recipient inbox receives. See §25 gate G10.
- **Lightsail SSH firewall rule restored** via `terraform apply` from `terraform/staging/` (removes Console override of the port-22 rule and returns to `operator_cidrs`-constrained ingress). See §29.8.

Phase 4 activities:

- DNS switch
- Members sign in to the new platform and see staged auto-link candidates surfaced via the wizard. Confirmation applies effects on a per-member basis. No batch outbound communication.
- Honors-bearing direct-claim oversight feed begins emitting daily entries; admin reviews post-facto.
- Member-initiated admin help requests accumulate in their queue; admin processes at their own cadence.

---

## 24. Operational states

### State 0: Current state

- Legacy site live, accepting writes
- New platform deployed on staging
- Phase 1 code complete

### State 1: Historical-data pipeline complete

- `legacy_club_candidates` populated and classified per section 10.1 rules (pre-populate, onboarding-visible, dormant; junk excluded)
- `legacy_person_club_affiliations` populated
- Bootstrap eligibility decisions made for pre-populated clubs
- Review report reviewed; admin decisions logged for ambiguous cases
- Known name variants table seeded

### State 2: Phase 1 complete (test load)

- Legacy webmaster provides test export
- Imported legacy account rows inserted into staging `legacy_members`; no imported legacy account row is inserted into `members`
- Tier-mapping dry-run report generated for all imported legacy accounts; `member_tier_grants` rows are written only when a member confirms a candidate through the wizard, the optional mailbox-link-click round-trip, the direct historical-record affordance, or an admin-approved help request
- `legacy_email` and `legacy_user_id` uniqueness verified
- Banned field evaluated (recorded as audit metadata per §13; no claim-time gating)
- Club bootstrap candidates resolved against imported `legacy_members` rows
- `club_bootstrap_leaders` rows created in staging
- Batch auto-link candidate-staging pass run on staging (stages candidates; no live-table mutation; no notification emails)
- Full claim flow rehearsed end-to-end on staging through the wizard, declared-anchor entry, optional mailbox-link-click round-trip, and direct historical-record affordance
- All validation gates (section 25) evaluated

### State 3: Phase 2 complete (go-live preparation)

- DNS TTL reduced (24 to 48 hours before go-live; see §29.12 for the full sequence)
- All migration scripts finalized
- Admin review of unresolved high-impact clubs complete
- Final cutover checklist confirmed
- Legacy webmaster briefed on final export and freeze timing
- SES production-access ticket filed and approved (24-48h lead time; see Phase 4 prerequisites)
- `footbag.org` SES domain identity verified (DKIM CNAMEs in the zone); `SES_FROM_IDENTITY` on the production host updated to `noreply@footbag.org`; runtime-role `OutboundEmail` IAM policy resource ARN set to the `footbag.org` domain identity
- Email-delivery smoke passes end-to-end (§25 gate G10)

### State 4: Phase 3 (production cutover)

1. Legacy webmaster places legacy site in write freeze / maintenance mode. **Timing constraint:** write-freeze must be instantaneous (site goes read-only at a coordinated moment), not gradual. Any member writes between "maintenance announced" and "maintenance enforced" appear in the final export but were not expected. The coordinated moment and the user-facing notice text are settled under §19 item 29.
2. Legacy webmaster produces final production export from the frozen database state
3. New platform imports legacy account rows into `legacy_members`
4. New platform runs the tier-mapping dry-run report: a preview of what `member_tier_grants` would be written if all unclaimed legacy accounts were claimed today. No `member_tier_grants` rows are written during cutover; the report is read-only. Actual tier grants are written later, one row per member-confirmed claim, when each member completes the wizard's claim task after step 12 opens sign-in.
5. New platform creates bootstrapped `clubs` rows for approved candidates
6. New platform creates `club_bootstrap_leaders` rows
7. New platform runs batch auto-link candidate staging (no live-table mutation; results surface to members at next sign-in via the wizard)
8. New platform runs validation checks
9. Pre-flip DB snapshot captured per §29.1a (load-bearing artifact for the rollback path B in §27; integrity verification automated)
10. DNS switch to new platform (see §29.12)
11. Admin verifies the new platform is operational (smoke checks, critical flows confirmed, including one real end-to-end outbox → SES send to a verified admin inbox for transactional mail). If any critical smoke check fails, the admin evaluates against the §27 path B catastrophic-failure list before proceeding to step 12; non-catastrophic failures continue to step 12 with a fix-forward plan logged, catastrophic failures trigger path B per §27 (DNS revert + restore from the step 9 snapshot) and do not proceed to step 12.
12. Admin opens the new platform for member sign-in; staged candidates surface to members through the wizard's claim task as members log in.

### State 5: Post-cutover

- New platform live
- Legacy database retained by the legacy-site webmaster for reference and targeted recovery
- Members confirm their wizard-staged candidates over time as they sign in
- Members declare additional anchors (former surname, old emails) in the legacy-claim task (reached from their profile) as needed; the platform re-runs candidate matching against the new anchors
- Admins process member-initiated help requests (§13) and review the honors-bearing direct-claim oversight feed (§13)
- Leadership activations accumulate as members register and claim

### State 6: Migration complete

- All high-priority legacy accounts confirmed by their members or resolved through admin help requests
- All bootstrap clubs resolved or admin-reviewed
- The staged auto-link candidates table has drained (member confirms, declines, or expirations) and may be dropped
- Legacy database retired

---

## 25. Validation gates

The following must be confirmed at the test load before go-live. These are not open design questions; they are data-quality checkpoints.

| Gate | Description | Failure handling |
|---|---|---|
| G1 | `legacy_email` is unique where non-NULL | Replace provisional unique index with non-unique lookup + ambiguity handling |
| G2 | `legacy_user_id` is unique where non-NULL | Same as G1 |
| G3 | Live export contains a trustworthy `banned` field. **PASS**: the field is present and its semantics are confirmed reliable. **FAIL fallback**: omit the `legacy_banned` column entirely; route claims on unverifiable rows through admin review per §8 claim ineligibility. | Fallback path applies as described in §15.5 |
| G4 | Shape and null quality of profile/contact fields | Adjust import logic and field mapping |
| G5 | Legacy member ID quality (format, completeness, uniqueness) | Resolve before final export |
| G6 | Tier-state mapping inputs sufficient AND the §15.16 schema extension on `legacy_members` (the five `legacy_*` tier-state fields) landed in `database/schema.sql` and applied to the staging DB at test load. **PASS**: inputs present and columns landed; full §3 precedence table applies. **FAIL fallback**: PASS via honors-only fallback (HoF/BAP → `tier2`; everything else → `tier0`); §3 precedence rows 3-5 are dropped; the fallback decision is recorded in §28. | Fallback path applies as described |
| G7 | Mirror-derived club normalization quality. **Requires G12 PASS** so the classifier's `listed_contact` and `member_active` signals (§10.1 "Required order" step 1) run against the fully-populated `historical_persons` set including club-only members; running G7 against a partial `historical_persons` set silently under-classifies clubs whose people never competed | Block until G12 PASSes; increase manual review threshold for any remaining quality gaps after both gates clear |
| G8 | Sufficient high-confidence club-leader bootstrap candidates | Adjust bootstrap threshold or expand manual review scope |
| G9 | Bootstrapped clubs produce valid, non-broken club pages | Fix UI before go-live |
| G10 | Outbox → SES → recipient inbox path works end-to-end on the pre-cutover release (enqueue test row, worker drains within 60 seconds, SES returns MessageId, message arrives in recipient inbox) | Debug before cutover; common causes are IAM Resource scope, SES sandbox state, worker container env vars, worker event-loop bugs |
| G11 | `name_variants` seeded with ~290 mined pairs (§15.15) | Auto-link medium-confidence coverage drops; low-confidence admin queue expands; document shortfall in State 1 review |
| G12 | ~1,600 club-only persons extracted into `historical_persons` per §10.2 | Classification signals (active-players, contact-competed) run with reduced coverage; onboarding-visible list may shrink |
| G13 | `club_bootstrap_leaders` populated for pre-populated clubs meeting the §2 bootstrap rule | Leadership activation defers to path 2 (first affiliated member accepts leadership) for affected clubs |
| G14 | Canonical `persons.csv` row count reconciled against `historical_persons` population; any accepted discrepancy documented and signed off | Block at test load until reconciled; unexplained delta risks missing or duplicated historical identities |
| G15 | World records export produced in platform format and loads into the records schema cleanly | Records page launches empty or incomplete; fix export before go-live or hide the records entry point |
| G16 | `run_pipeline.sh full` produces events, results, persons, clubs (classified), bootstrap leaders, club-only persons, variants, and records in one run | Document the multi-step manual sequence required and capture sign-off at State 1; single-command regeneration is the long-term target |
| G17 | Claim flow anti-enumeration invariant holds per §8 "Non-revealing messaging" (identical UX across matched-none, matched-multiple, matched-blocked, matched-ineligible, and matched-eligible) | Collapse divergent response shapes before go-live; side-channel enumeration otherwise possible |
| G18 | Rate limiting active on identifier lookup, declared-anchor changes, claim confirmations, optional mailbox-link-click round-trip, registration, and password-reset per DD §3.8 | Block go-live until limiters engage; declared-anchor enumeration and mailbox abuse otherwise unmitigated |
| G19 | Wizard claim task universally surfaces staged candidates and the declared-anchor prompt to every registrant per §7 and §14; all evidence tiers (`declared_anchor_only`, `currently_controls_modern_email_matching_legacy`, `mailbox_control_via_link_click`) exercised at test load | Members without a stage-1 anchor match never get prompted to declare; legitimate claims are missed |
| G20 | Data review sign-off. **PASS**: an `audit_entries` row is present with the sign-off `action_type` and the historical-pipeline maintainer as `actor_member_id`, confirming that legacy data is complete and member-list presentation has been reviewed; this row unblocks members ungating. **FAIL**: members ungating is withheld until the sign-off row exists. | Historical-pipeline maintainer owns sign-off per §20 item 5 |
| G21 | `legacy_user_id` and `legacy_email` populated on canonical `persons.csv` where mirror provides them | Claim-lookup falls back to `legacy_member_id` only; auto-link candidate coverage drops because the email anchor is missing |
| G22 | Optional mailbox-control round-trip verified end-to-end at test load: declared old email → confirmation link issued → click consumes token and upgrades the audit evidence tier to `mailbox_control_via_link_click`; rate-limited per requesting member, per target row, per session/IP per §8 | Members cannot upgrade declared-anchor claims to hard-evidence; admin help requests carry more weight by default |
| G23 | Multi-anchor candidate matching covers verified modern email, declared old emails, declared former surname, and current real-name surname per §7; seeded `name_variants` table drives first-name variant resolution | Candidate coverage drops to email-anchor-only and admin-help-request volume rises |
| G24 | `OperationsPlatformService` batch auto-link SYS job ready to run once at cutover; the job stages candidates (no live-table mutation, no notification emails); one `system_job_runs` row recorded per run; audit-emission coverage verified at test load (one `audit_entries` row per `auto_link_candidate_staged` event). Idempotent: rerun produces no duplicate candidates. | If audit-emission coverage is incomplete, fix the audit emission path before declaring G24 PASS; without the staging job, candidate matching runs only at member sign-in and pre-cutover live members get no proactive surfacing |
| G25 | `/history/:personId/claim` confirm page renders the first-name-variant warning inline; surname-mismatch messaging is user-readable; audit metadata captures the evidence tier per §15.19 and any first-name variant used for direct-HP claims per §8 | Direct HP claim usable but klunky; surname-block failures surface as raw `ValidationError` text rather than the spec'd confirm-page warning |
| G26 | Member-initiated admin help request (§13) wired with structured evidence intake, admin review surface, and audit emission carrying `admin_vetted_evidence` on approval | Members stuck without an auto-surfaced candidate have no path forward; admin-recovery is informal |
| G27 | Multi-record candidate ambiguity count from the seeded `name_variants` table against the test-load `legacy_members` set measured and reviewed jointly by the primary maintainer and historical-pipeline maintainer; if the count exceeds the member-confirmation throughput the platform can comfortably handle, the `name_variants` seed is pruned before batch candidate staging runs at cutover | If unmeasured, members are presented with too many candidates per card and confirmation fatigue produces wrong-account confirmations |

**Tuning authority for G8:** Bootstrap threshold adjustments at test load are a joint decision between the primary maintainer and the historical-pipeline maintainer. Raising the threshold (more conservative) is routine and requires no additional sign-off. Lowering the threshold below a minimum acceptable value (to be set during State 2 review if lowering is needed) requires IFPA board sign-off, because lowering materially expands who gains bootstrap leadership and the live club-management permissions that follow at first claim.

---

## 26. Data quality from persons.csv analysis

Current analysis of `legacy_data/event_results/canonical_input/persons.csv`:

- 4,861 total persons
- 1,743 with IFPA IDs (legacy member IDs)
- 290 mined name variant pairs:
  - ~26 accent variations
  - ~88 prefix variations
  - ~139 typo corrections
  - ~40 diminutives
- 103 garbled parse-artifact entries needing cleanup
- First-name-change cases: a member who legitimately changed their first name (rather than a variant or spelling difference). The variants table cannot catch these; they surface as candidates only when the member declares the change through the optional anchors (§15) or invokes the admin help request (§13).

---

## 27. Rollback posture

**Pre-flip:** abort, fix, retry. No data has moved yet.

**Post-flip path A, non-catastrophic failures (most cases):** fix-forward. Production deploys a patch; no rollback. Covers UI bugs, slow queries, non-critical alarm noise, and anything that does not corrupt member identity, claim state, or audit integrity.

**Post-flip path B, catastrophic failures (rare, narrowly defined):** DNS revert plus DB restore from the pre-flip snapshot. Catastrophic is one of:

- schema corruption that prevents reads;
- identity-data corruption that misroutes claims or auto-link writes;
- write-amplification that produces malformed audit or queue entries at scale;
- outbound communication that is incorrect or premature and cannot be recalled (e.g. a misfired Stripe webhook batch that grants or revokes tiers in error, or transactional mail sent under a regressed template that misidentifies recipients at scale). Note that path B does not actually un-send already-sent emails; it restores the DB state so corrective communication can be sent from a clean baseline.

Decision authority is the primary maintainer.

The pre-flip snapshot is the load-bearing artifact for path B. It is captured as State 4 step 9 (after validation in step 8, before DNS switch in step 10), so it includes the final import (step 3), the tier-mapping dry-run (step 4), the bootstrapped clubs and leaders (steps 5–6), and the staged auto-link candidates (step 7). Restore returns the database to this exact pre-DNS-switch state; staged candidates are present in the snapshot and surface to members when they sign in after the restore. It lives in the cross-region disaster-recovery bucket with S3 Object Lock (DD §6.8). Creation, integrity verification, and a successful dry-run restore against staging are preconditions; see §29.1a.

Path B does not recover from systemic bugs in the candidate-staging step itself, because those bugs' results are present in the snapshot. Staged-candidate defects are addressed by the per-member dispute path (§8) and admin revert (§13), and by the pre-cutover validation gates G23 and G24.

**Rollback window:** 48 hours post-flip. After 48 hours the new platform is authoritative regardless of what surfaces; reversal requires explicit joint sign-off from the primary maintainer and the legacy-site webmaster, and is treated as a manual recovery exercise rather than a rollback.

**Post-cutover monitoring posture (T+0 to T+48h).** The rollback window requires active monitoring, not passive waiting. No cutover-specific monitoring runbook exists yet; the following observables must be specified in `docs/DEVOPS_GUIDE.md` before cutover, with alert thresholds and escalation paths:

- HTTP 5xx error rate on the CloudFront distribution (baseline: 0; alarm: sustained >1% of requests over 5 minutes).
- Response latency at the origin (p95; alarm threshold TBD based on staging baseline).
- SES bounce rate and complaint rate (alarm: bounce >5% or complaint >0.1% of daily volume; SES auto-suspends sending at higher thresholds).
- Outbox queue depth: `outbox_emails` rows with `status='pending'` growing faster than the worker drains them (alarm: >50 pending rows sustained over 10 minutes).
- Login success rate: failed logins as a fraction of attempts (detects auth-chain defects; alarm threshold TBD).
- Claim-wizard conversion: candidates surfaced vs. claims initiated (no hard alarm; manual check at T+4h and T+24h to confirm the flow is working).
- Retained-subdomain TLS health: per gate OR12, daily probe on every retained `*.footbag.org` subdomain; first probe runs at T+1h, not T+24h.
- CloudFront cache-invalidation confirmation: verify `/*` invalidation completed within 60 seconds of T-0 (one-time check).

**Legacy DB retention:** the legacy-site webmaster retains the legacy database for at least 30 days after cutover for reference and targeted manual recovery. This is sequential to and distinct from the 48-hour rollback window: retention enables one-off historical lookups by admin; rollback is the time-bounded path back to the legacy site as authority.

**Member writes lost on restore:** any claim, registration, or club-affiliation write that lands between snapshot capture and rollback is lost on restore. The 48-hour window plus the platform's traffic profile bound the affected count; affected members re-do the action after the platform stabilizes.

**Post-flip path A-prime, bounded business-logic defects:** admin-level data correction plus affected-member notification, without full platform rollback. Covers defects that corrupt a bounded set of records but do not meet the path B catastrophic threshold: incorrect tier-mapping for a subset of members, auto-link candidate staging that surfaces wrong matches for a subset of legacy accounts, club-bootstrap that assigns wrong leaders. The defect is in the data, not the schema or identity layer, and the affected population is enumerable. Remediation: admin identifies affected rows via the oversight feed (§13) or targeted query; applies per-record correction via admin tools; dispatches notification email to affected members explaining the correction. Path A-prime does not require DNS revert, DB restore, or write-freeze. Decision authority is the primary maintainer; if the affected count exceeds 1% of migrated accounts or the defect cannot be corrected by record-specific admin actions, escalate to path B evaluation.

**No automated rollback** is provided after the DNS switch. Path B is operator-driven via the runbook in `docs/DEVOPS_GUIDE.md`.

---

## 28. Open issues

### Deferred to test load

Decisions gated on what the test-load data quality reveals.

1. **`announce_opt_in`**: Not in the current schema. If the legacy-account export contains a meaningful communication-preference field, add the column to `members` and carry it forward at claim. Gated entirely on the test load.
2. **`legacy_banned`**: Column added only if the legacy-account export contains a trustworthy banned/inactive field. See section 15.5. The banned flag is recorded as audit metadata only and does not gate claim cards (§13).
3. **Tier-mapping fields on `legacy_members` (§15.16)**: five `legacy_*` tier-state columns land if test-load validation confirms the legacy export's tier fields are sufficient. If insufficient, the honors-only fallback applies (§3 precedence rows 3–5 removed; tier mapping reduces to HoF/BAP → `tier2`, everything else → `tier0`). The fallback decision, when chosen, is recorded here with the test-load evidence that drove it.

### For the legacy-site webmaster's community knowledge

Decisions gated on the webmaster's read of community dynamics rather than on test-load data.

4. **Impersonation risk magnitude**: how significant is the risk that a registrant picks a famous competitor's surname (or declares a former surname matching one) and confirms a card or a direct historical-record claim under a false identity? The platform currently applies no platform gate for honors-bearing direct claims (§8): honors-bearing claims apply on member confirmation; admin sees them post-facto via the oversight feed (§13); the registration-time conflict prompt (§8) catches same-name collisions at signup. If the webmaster's read indicates impersonation is a meaningful concern, the platform may reinstate a gate (hold honors-bearing direct claims for admin verification) or move to a community-grace-window model (the claim is visible but flagable for N days before solidifying). Pending the webmaster's input, the no-gate stance stands.

5. **Banned policy carryover**: what fraction of legacy bans represent ongoing community issues vs. stale historical bans that nobody would enforce now? The current default treats the legacy banned flag as audit metadata only and does not gate the claim card (§13). If the webmaster and the IFPA board indicate many legacy bans are still meaningful, the platform may shift to one of: ban carries over silently (claim applies but new account starts in a restricted state); banned legacy accounts unclaimable self-serve (member contacts admin); claim held until board review. Pending input, the audit-metadata-only default stands.

### Architecture fork

**STATUS: OPEN. Must be decided before cutover planning can proceed. The MP currently assumes Option B throughout.**

Before cutover planning can proceed, the maintainer and the legacy-site webmaster must agree on who is the "front door" for `footbag.org` after cutover.

**Option A: the legacy server stays as the front door.** `footbag.org` DNS stays pointed at the legacy server. The legacy server reverse-proxies selected paths (e.g. `/members/`, `/events/`, `/clubs/`) to the new platform (CloudFront or the origin directly). The webmaster retains full control of DNS and routing. The new platform is an upstream origin, not the public entry point.

- Pro: the webmaster controls the rollout pace; he can route paths one at a time.
- Pro: no DNS provider migration needed; no apex ALIAS requirement.
- Con: the legacy server becomes a critical-path dependency for the new platform's availability.
- Con: adds latency (extra hop); TLS termination and certificate management stay on the legacy server.
- Con: CloudFront edge caching, WAF, and DDoS protection do not apply to traffic entering through the legacy server.
- Con: the new platform's session cookie and auth model must work correctly behind a reverse proxy (Origin header, X-Forwarded-For, secure cookie flags all need careful configuration).

**Option B: CloudFront becomes the front door.** `footbag.org` and `www.footbag.org` DNS point at the CloudFront distribution. The legacy server stays online for retained subdomains and inbound email. The new platform serves all traffic at the apex and www hostnames.

- Pro: the new platform controls its own availability, caching, and security posture.
- Pro: clean separation (new platform owns apex/www, the webmaster owns retained subdomains).
- Con: requires a DNS provider that supports ALIAS/ANAME at apex (§19 item 15).
- Con: the session cookie widens to `Domain=.footbag.org`, so every retained subdomain on the legacy server receives the session token on every request. Every retained subdomain must serve HTTPS for the entire parallel window, or the token leaks in cleartext. One lapsed TLS cert on any subdomain silently compromises every user session.

**CloudFront technical constraints (relevant to both options, critical for Option B):** for CloudFront to front any `footbag.org` hostname, three things must be true: (1) the hostname must be added to the CloudFront distribution as an alternate domain name; (2) a matching TLS certificate must exist in ACM us-east-1; (3) DNS must point the hostname at the distribution. For `www.footbag.org`, a standard CNAME works. For the apex `footbag.org`, a CNAME is illegal per RFC 1034; the DNS provider must support an ALIAS or ANAME record type (Route 53 alias, Cloudflare CNAME-flattening, NS1 ALIAS qualify; many traditional providers do not). If the current provider does not support this, the zone must migrate to one that does, which is a multi-day operation affecting all `*.footbag.org` records.

If Option A is chosen, the cutover sequence (§24), rollback posture (§27), session model (§29.15), and operational readiness gates (§29) need rewriting.

### Phased feature scope (v1 / v2 / v3)

**STATUS: PROPOSED. Pending the legacy-site webmaster's review. All currently-scoped features default to v1 (launch day) unless the webmaster objects or a hard external dependency forces deferral.**

Legacy services not in v1 scope remain on the legacy host through the parallel-role window per §29.12a. Items dependent on this decision:

- §19 item 29: which legacy surfaces enter the write-freeze.
- §19 item 16: which `*.footbag.org` subdomains stay alive at launch.
- §19 item 31: parallel-window duration (cannot be bounded until the scope of retained legacy services is known).
- §19 item 26: per-mailing-list allocation (legacy parallel, migrate, retire).

**v1 (launch day):** member accounts, registration, login, profiles, tier management; legacy account import and claim flow (auto-link, declared anchors, mailbox verification, admin help requests); club bootstrap and onboarding; events (create, register, pay, results, attendance, co-organizers, routine music); freestyle trick dictionary and curated media; media and galleries; payments (Stripe: dues, event fees, donations, recurring); admin tools (work queues, payment reconciliation, sanctions, member help); transactional email via SES; DNS cutover; archive subdomain for legacy forum content.

**Open questions (version placement depends on webmaster's answers):**
- Mailing list migration and MX record transition (v1 or v2, pending §28 "Email transition" answers). The maintainer prefers to resolve all email at v1 via a managed inbound provider (Google Workspace, Fastmail, or similar) plus the platform's existing mailing list infrastructure; feasibility depends on the webmaster's email inventory, mailbox type, and handoff preference.
- Group and committee features (v2 default, but depends on which are active per §19 item 26; some may not survive on legacy).
- Forum retirement timing (v3 default, but depends on webmaster comfort level per §19 item 28).

**v2 (post-launch, during parallel window):** Hall of Fame and BAP (nominations, voting, honors oversight); voting and elections; group and committee features that need to migrate off legacy (default placement, may shift per open questions above).

**v3 (parallel window end or beyond):** tournament in a box (if the webmaster wants it modernized rather than kept on legacy indefinitely; see "Tournament in a box" below); full legacy server retirement; forum retirement (archive only); remaining subdomain consolidation; features the webmaster identifies that do not fit v1 or v2.

### Tournament in a box

**STATUS: COMPLETELY UNSCOPED. The legacy site has a tournament management feature ("tournament in a box") used by tournament directors. The new platform has event creation, registration, payment, and results entry, but the full scope of the legacy feature is unknown. The webmaster must define what "tournament in a box" does today before it can be placed in the phased scope.**

Open questions for the webmaster:

1. What does "tournament in a box" do today? (Registration, brackets, scheduling, scoring, results publishing, sanctioning, IFPA ranking integration, streaming, other?)
2. How many organizers actively use it? How often?
3. Is the webmaster satisfied keeping tournament-in-a-box on the legacy server during the parallel window while the new-platform version is scoped? Or must it be in v1?
4. Does the new platform's existing event system (create event, register players, collect fees, enter results, mark attendance, co-organizers, routine music) cover part of what tournament-in-a-box does? Where does it fall short?

Default allocation: stays on legacy server through the parallel window (v3) unless the webmaster requires it earlier.

### Email transition

Email architecture is decided. This subsection consolidates it for the webmaster's read. The remaining open items are inventory and mailing-list mapping, not the architecture.

**Decided architecture:**
- **Outbound:** AWS SES sends all transactional and mailing-list email (built and working). SES deliverability rides on the DKIM/SPF/DMARC CNAMEs (per EX3), independent of inbound MX.
- **Inbound:** Google Managed Services handles all ordinary `@footbag.org` inbound. The `footbag.org` MX points to Google, not the legacy mail server. Mailboxes, aliases, and forwarding are configured on Google. No custom code; the platform receives no inbound mail.
- **Legacy `@footbag.org` mail server:** retired. Once Google inbound is live it serves no `@footbag.org` mail role.
- **`@ifpa.footbag.org`:** out of scope here. It is a distinct mail domain on llic.net, dispositioned separately under §29.12a (IFPA list mail). Moving `footbag.org` MX does not touch it.

**Mail cutover is decoupled from the web cutover.** The `@footbag.org` MX moves to Google as its own step, sequenced after DNS zone authority is in place (§19 item 15) and before the apex/`www` web cutover (T-0). Because MX is already on Google by T-0, the apex swap stays MX-neutral (§29.12, §29.12a). Outbound SES is unaffected. This retires the single largest standing risk in the parallel-window design: the legacy mail server as a single point of failure for all `@footbag.org` inbound.

**What the new platform already has (built and working):**
- Outbound transactional email via Amazon SES (verification, password reset, claim links, receipts, reminders).
- Mailing list infrastructure (DB tables, subscription management, bulk sends). Six lists seeded: newsletter, board-announcements, event-notifications, technical-updates, admin-alerts, announce.
- Terraform for SES domain identity, DKIM, SPF, DMARC. Production-ready.
- Bounce/complaint tracking schema (ready; webhook code go-live gate EX6).

**What the new platform does NOT have:**
- Inbound email handling. The platform does not receive email. No SES receiving rules, no inbound processing code.

**Remaining discovery (the legacy-site webmaster and the IFPA secretary supply the facts; this informs provisioning, not the architecture):**

1. Full inventory of `@footbag.org` mailboxes and aliases in use today, so every active address is provisioned on Google before legacy delivery is withdrawn.
2. Which are actively used vs. dead or spam-only.
3. Mailing lists, their owners, and software; whether they carry moderation, archives, or digests, or are simple distribution lists; and the mapping between legacy lists and the platform-managed lists.
4. Whether any `@footbag.org` addresses are real login mailboxes (IMAP/POP) vs. forwarding aliases, so Google is configured with mailboxes vs. forwards accordingly.

### Standing consistency notes

- The product-facing term for `legacy_user_id` is "legacy username." This must be applied consistently in all UI copy, error messages, and documentation regardless of the column name.

---

## 29. Operational readiness for go-live

Non-data workstreams that must close before production cutover. Each subsection states the go-live gate (what must be true); operator procedures live in `docs/DEV_ONBOARDING.md` (Path G / Path I) and routine runbooks live in `docs/DEVOPS_GUIDE.md`. This section holds only what is required to green-light §24 State 3 / State 4.

**Subsection numbering convention.** Numeric subsections (§29.1, §29.2, ..., §29.16) are the original ordered series. Letter-suffixed subsections (§29.1a, §29.12a, §29.12b) denote later additions inserted to keep related material adjacent rather than appended at the end; the gate index in §22 refers to the exact suffix where applicable.

**Jargon used in this section.** DNS terms: A / AAAA (address records), CNAME (alias by name), ALIAS / ANAME (CNAME-like records that work at the zone apex, where plain CNAME is disallowed by RFC 1034), MX (mail exchange; routes inbound mail for the domain), DKIM (DomainKeys Identified Mail; per-domain DNS-published signing keys for outbound email authentication). AWS terms: ACM (AWS Certificate Manager; issues TLS certs), OAC (Origin Access Control; the S3-CloudFront access pattern that allows only the distribution to read), SSM (Systems Manager Parameter Store; secrets and config storage), KMS (Key Management Service; signing keys), SES (Simple Email Service; outbound mail). Reliability metrics: RPO (recovery point objective; how much recent data a restore can lose), RTO (recovery time objective; how quickly a restore returns service). Operational terms: source-profile IAM user (the long-lived IAM credentials a CLI operator assumes a role from), OOM (out of memory).

### 29.1 Data backup and disaster recovery

Gate: host-side SQLite backup producer runs on a schedule, ships to S3, and emits `BackupAgeMinutes`; a full restore drill has been rehearsed end-to-end on staging; a production-data restore drill has been completed against a copy of production data with recovery time meeting the `docs/DEVOPS_GUIDE.md` §10.1 RPO/RTO targets; the backup-age CloudWatch alarm (`enable_backup_alarm = true`) is enabled and has emitted a non-alarm state; the cross-region DR bucket has Object Lock configured per `docs/DEVOPS_GUIDE.md` §10.3 (Object Lock can only be enabled at bucket creation, so retrofitting requires bucket recreation). Recovery targets: 5–10 min RPO, ~5 min RTO per `docs/DEVOPS_GUIDE.md` §10.1. Procedure: `docs/DEV_ONBOARDING.md` §7.4 (setup); `docs/DEVOPS_GUIDE.md` §10 (runbook).

### 29.1a Pre-flip DB snapshot

Gate: a dedicated snapshot of the production SQLite DB is captured as State 4 step 9 (after validation in step 8, before DNS switch in step 10). The snapshot contains the final import, the tier-mapping dry-run, the bootstrapped clubs and leaders, and the batch auto-link results. The snapshot is the load-bearing artifact for the rollback path B in §27. Requirements:

- Snapshot is written to the cross-region DR bucket (S3 Object Lock, `docs/DEVOPS_GUIDE.md` §10.3) under a path distinct from the routine backup stream, so the snapshot is not aged out by the routine retention policy.
- Integrity verification is automated: snapshot SHA-256 is recorded, a `PRAGMA integrity_check` run against a temporary copy returns `ok`, and the row counts for `members`, `legacy_members`, `historical_persons`, `clubs`, `audit_entries` are recorded in the cutover audit trail.
- A dry-run restore against staging has been completed end-to-end within the past 7 days, using the same restore procedure that will be invoked for path B. The dry-run runbook lives in `docs/DEVOPS_GUIDE.md` and includes the steps to re-point the app at the restored DB. **STATUS: the runbook must exist before the dry-run can be executed, and the dry-run must succeed before cutover. This is a serial dependency: write runbook, then dry-run, then cutover. Schedule the runbook authoring and dry-run at least 2-3 weeks before any target cutover date, not 7 days.**
- The snapshot's Object Lock retention is set to at least 60 days so the rollback window plus retention plus operator review headroom is comfortably covered.

Procedure: `docs/DEVOPS_GUIDE.md` (snapshot creation + restore runbook).

### 29.2 Observability and monitoring readiness

Gate: CloudWatch agent installed on the runtime host; `enable_cwagent_alarms = true` applied and CPU / memory / disk alarms reachable via SNS with operator subscription confirmed; CloudFront 5xx alarm active; minimal operator dashboard documented. Procedure: `docs/DEV_ONBOARDING.md` §7.6 (install + enablement); `docs/DEVOPS_GUIDE.md` §12 (operating rules).

### 29.3 Edge and origin security

Gate: CloudFront enforces `X-Origin-Verify` on origin requests; Nginx rejects direct-to-origin traffic without the header; the S3 maintenance bucket with Origin Access Control is addressable via an ordered cache behavior at `/maintenance.html`. Direct origin bypass is no longer possible. Procedure: `docs/DEV_ONBOARDING.md` §7.2; `docs/DEVOPS_GUIDE.md` §4.1 (edge and request flow), §3.6 (S3 bucket policy rules), and §5.9 (Origin-verify shared-secret rotation).

### 29.4 IAM least-privilege scope-down

Gate: `footbag-operator` removed from `AdministratorAccess` and moved to a least-privilege policy covering only services the project uses (Lightsail, CloudFront, S3, SSM, KMS, SNS, CloudWatch, self-IAM for rotation); the Lightsail host's `ec2-user` default account retired in favor of named operator accounts; source-profile IAM user's access keys on a documented 90-day rotation cadence; all runtime-role IAM policies (SSM read, S3 snapshots, SES send, KMS sign) declared in Terraform HCL so `terraform apply` is a safe operation that cannot silently drop a Console-added capability. Procedure: `docs/DEV_ONBOARDING.md` §7.3; `docs/DEVOPS_GUIDE.md` §5.7.

### 29.5 Email deliverability operations

Gate: SES is out of sandbox with production access granted; `footbag.org` verified as an SES sender identity at the domain level via DKIM CNAMEs in the zone (per §29.12a MX disposition); an SNS topic subscribes to SES bounce and complaint events; the bounce/complaint webhook end-to-end has been tested with a synthetic bounce against `bounce@simulator.amazonses.com` and the resulting suppression-row write confirmed in the app; the application processes those events into hard-bounce suppression and complaint tracking; email-delivery smoke (validation gate G10) has passed end-to-end on a pre-cutover release. Procedure: `docs/DEV_ONBOARDING.md` Path I (activation).

**STATUS: OPEN. The SES production-access ticket requires a stated daily send volume, but no estimate exists.** Sending surfaces at cutover include: transactional (verification, password reset, claim links on member sign-in), Active Player expiry reminders, admin contact-request resolution replies, and any cutover-day announcement to the announce list. If 200 members sign in on day one and each triggers 1-2 transactional emails, baseline is 200-400/day. A bulk "site is live" announcement to the full membership could add hundreds more. SES production default is 1 message/second (86,400/day); the outbox retry mechanism handles throttling, but queue depth and user-visible latency scale with the gap between send rate and burst volume. The production-access ticket should request at least 1,000 emails/day with a stated burst justification referencing the cutover scenario.

### 29.6 Scheduled maintenance jobs

Gate: login rate-limit cooldown is wired to the `login_cooldown_minutes` setting; daily `account_tokens` cleanup job runs on the host and removes expired entries; job execution is observable via standard application logs or CloudWatch. Procedure: in-code + `docs/DEVOPS_GUIDE.md`.

### 29.7 Secrets rotation

Gate: JWT signing-key rotation procedure with 24h overlap is documented and drilled against staging before production cutover (generate new key, stand it up alongside current key, flip the active signer, retire the old key after the overlap window); session JWT refresh re-issues the cookie when `exp` is within 6h per DD §3.4 so users are not silently logged out at the 24h TTL boundary; `SESSION_SECRET` rotation runbook exists. Source-profile access-key rotation is covered under §29.4. Procedure: `docs/DEVOPS_GUIDE.md` §5.

### 29.8 Pre-cutover revert and rotation checklist

Before Phase 4 cutover, the following staging-observability-only deviations must be reverted and rotations completed:

1. SES sender cutover: re-run `docs/DEV_ONBOARDING.md` §8.8 against the canonical domain; switch `SES_FROM_IDENTITY` in `/srv/footbag/env` to `noreply@footbag.org` (the FROM address) and switch the `OutboundEmail` IAM policy `Resource` ARN to the `footbag.org` SES domain identity ARN (per §29.12a MX disposition: domain-level verification, not email-address-level); restart the app. Env + IAM only, no code. Blocked on IFPA domain acquisition.
2. Lightsail SSH firewall rule restore: `terraform apply` from `terraform/staging/` to remove any browser-SSH firewall opening (port 22 loosened beyond `operator_cidrs` during staging bring-up) and return to the `operator_cidrs`-constrained ingress documented in DEV_ONBOARDING Path D §4.4.
3. SES adapter on production: `/srv/footbag/env` sets `SES_ADAPTER=live` for production once SES production access has been granted. Dev and staging run `SES_ADAPTER=stub` and surface captured mail via the in-page simulated-email card; live SES delivery is production-only (DD §5.6). The legacy `SES_SANDBOX_MODE` flag has been removed from the codebase; it is no longer read and must not be set in the env file.
4. Production Terraform region fix: change the region default in `terraform/production/variables.tf` from `us-east-2` to `us-east-1` before any `terraform apply` from `terraform/production/`. The project runs in `us-east-1` (DEVOPS_GUIDE §4.2 networking and TLS); applying as-is would create cross-region production resources. **Note: the wrong default implies no production Terraform has ever been applied.** All production infrastructure referenced by this plan (CloudFront distribution, ACM certs, Route 53 records, security groups, KMS keys) either does not exist yet or was created outside Terraform. A `terraform plan` against the production account should be run well before cutover to surface the full delta between desired state and actual state. Any manually created resources must be imported (`terraform import`) before `terraform apply` to avoid duplication or conflicts.
5. Preview fixture scrub: `legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py` inserts a "Footbag Hacky" fixture (fake event, discipline, result, HP record with HoF flag, and result-entry participant) alongside the preview-user account. Acceptable in staging for UX preview; must not reach the production DB. Either condition the fixture block on an env flag (e.g. `FOOTBAG_SEED_PREVIEW_FIXTURE=1`) or delete the block in the production-cutover data pass.
6. Restore live `mailto:admin@footbag.org` in `/legal`: swap the `.contact-pending` span used in Privacy, Terms, and Copyright contact lines for a live `mailto:admin@footbag.org` once SES sender cutover (item 1) is complete and the canonical mailbox is active. Template-only change; no service or DB work.
7. Dev-shortcut auth surface removal. Dev autologin has already been removed: `src/middleware/auth.ts` runs the cookie path unconditionally and the `FOOTBAG_DEV_AUTOLOGIN_*` env vars and their guards no longer exist. The test-data persona harness (the `devRouter` mount in `src/app.ts` for `GET /dev/switch` and `GET /dev/personas`, gated to development and staging, and the `src/testkit/` subtree of persona factory, catalog, and seed runner) is permanent test infrastructure: it is excluded from the production image at build time and never mounted in production, but it is not removed from source at cutover. The removable surface at cutover is `src/dev-bootstrap/` (the bootstrap conveniences), not the harness. **Scope**: this item covers dev-only auth/persona surfaces. Dev-admin seeding (the registration-time admin allowlist and the `--seed-dev-admins` direct-insert path) is a separate concern, deleted entirely under PC7; production first-admin uses the SSM-token `/admin/bootstrap-claim` route (DD §2.9; operator runbook in DEVOPS_GUIDE §17.8).
8. JWT session TTL revert: the source-compiled TTL constant in the JWT signing service is set to the DD §3.4 baseline (24h = 86400 seconds). Staging observability-tuned values are reverted by editing the constant and rebuilding before the cutover deploy. This is the PC1 gate.

Sign-off on this checklist is a prerequisite for §24 State 3 → State 4 transition.

### 29.9 Production-specific prerequisites

Gate: ACM certificate for `footbag.org` issued in `us-east-1` and attached to the production CloudFront distribution; **ACM certificate for `archive.footbag.org` issued in `us-east-1` and attached to the archive CloudFront distribution** (separate cert, separate distribution, same Terraform pattern as the main cert; requires its own DNS validation CNAME published by the records-actor per §19 item 17); production KMS asymmetric signing key, source-profile IAM user, and runtime role provisioned (production mirror of Path H §8.6–§8.9, per Path I §9.8); Stripe production live API keys and webhook secret stored in Parameter Store at `/footbag/production/stripe/*`; Stripe webhook endpoint URL registered in the Stripe Dashboard against the production domain; one end-to-end Stripe webhook delivery confirmed against the production endpoint before cutover, with the confirmation asserting that the `stripe-signature` header was validated by the app against the production webhook secret (e.g. by inspecting an audit row written by the signature-validation path on successful receipt) rather than only that the endpoint returned HTTP 200. Procedure: `docs/DEV_ONBOARDING.md` Path I (§9.4 ACM via DNS delegation, §9.8 production KMS / runtime role, §9.13 Stripe production activation).

### 29.10 Code governance

Gate: GitHub `main` branch protection enforced (PR required, status checks must pass, linear history); the required-check job names match the names in `.github/workflows/ci.yml`; at least one administrator account provisioned in the production database and login-tested. Procedure: `docs/DEV_ONBOARDING.md` §7.3 (branch protection).

### 29.11 Compliance

Gate: privacy policy, Terms of Service, and cookie banner (if applicable) reviewed by the IFPA board and accessible from the production site footer. Prepared by IFPA, reviewed by the maintainer; not technical work.

### 29.12 DNS changeover sequence

The cutover from the legacy DNS host to the production CloudFront distribution applies the generic DNS cutover procedure (`docs/DEVOPS_GUIDE.md` §16.7) and the ACM certificate issuance procedure (`docs/DEVOPS_GUIDE.md` §4.2.1) under the cutover-specific gates and coordination contract below. The legacy webmaster owns the registrar update; the maintainer owns the production CloudFront target. The legacy host's content does not fully retire at the §27 rollback boundary; it persists in a parallel role under separate hostnames, framed in §29.12a.

**Timing notation in this section.** `T-0` is the moment the apex DNS records swap to the new platform's CloudFront distribution. `T-Nd` and `T-Nh` mean N days or hours before that swap (e.g. `T-7d` is one week before the swap, `T-48h` is two days before). `T+Nh` means N hours after the swap. The `T+48h` window matches the §27 rollback window.

Cutover-specific preconditions (beyond the generic procedure):

- **Authoritative nameserver verification**: `dig footbag.org NS` confirms the legacy DNS host matches the registrar-delegated NS records. If the registrar delegates to a different DNS provider, ACM CNAME validation must be placed at the actual authoritative host, not the registrar's nameservers.
- **ACM colocation**: certificate must be issued in `us-east-1` regardless of where the rest of the platform runs (CloudFront-attached certs are us-east-1-only).
- **MX neutral at T-0**: per §29.12a MX disposition, the `footbag.org` MX moves to Google Managed Services in a discrete step before T-0. By T-0 the MX already points at Google and is not touched during the apex swap; only A/AAAA/ALIAS records for the apex and `www` change. SES outbound deliverability depends on the DKIM CNAMEs (per EX3), not on inbound MX.
- **Write-freeze**: legacy site is in read-only mode and the final export has been imported into production before the record swap (per §23 Phase 4 cutover gates).

Cutover-specific timing (overrides the generic procedure's defaults):

- T-7d minimum lead time. At T-7d the maintainer formally notifies the webmaster of the cutover window, hands over the records to be applied at cutover (apex / `www` swap, ACM validation CNAMEs, SES DKIM CNAMEs, `archive.footbag.org` ALIAS), and asks the records-actor named under §19 item 17 to confirm availability. The webmaster has 7 days to surface conflicts, schedule the actual TTL pre-shrink at T-48h, and align the secondary-contact coverage required under §19 item 19.
- T-48h TTL on the legacy zone set to 300 seconds (longer than the §16.7 default of 60s so the slower-propagating legacy DNS host has margin).
- T+48h rollback window: TTL stays at 300 seconds for the full 48h post-cutover; legacy site stays online read-only across this window (per §27). At T+48h, restore steady-state TTL to 3600 seconds (1 hour) for the apex and `www` records; this is the records-actor's action per §19 item 17. Note: after TTL restoration, any subsequent DNS change takes up to 1 hour to propagate (vs. 5 minutes during the rollback window). The fast-propagation safety net ends with the rollback window. Proceed with legacy-site retirement per §19 item 30 (30-day minimum retention).

Coordination contract (per §19):

- ACM validation CNAMEs are added by the webmaster (the records live at the legacy DNS host) but issued by the maintainer's AWS account.
- The `@footbag.org` MX move to Google is applied by the records-actor in the pre-T-0 mail-cutover step (§29.12a MX disposition), not at T-0; end-to-end verification of Google inbound delivery before the web cutover is joint.

Rollback (T+0 to T+48h, see §27): webmaster reverts the apex and `www` records to the legacy site's IP; propagation completes within 5 minutes given the lowered TTL. Beyond T+48h, fix-forward only; reversal requires joint sign-off (per §27).

Post-cutover DNS verification: as part of State 4 step 11 (admin verifies the new platform is operational), `dig +short` is run against every retained `*.footbag.org` subdomain enumerated under §19 item 16 and the resolved A/AAAA records are compared against the legacy host's known IP. Any retained subdomain resolving to the new platform's Lightsail IP is a misconfiguration and a §29.3 origin-verification bypass; correct the record before declaring step 11 complete.

Sign-off on this sequence is a prerequisite for §24 State 3 → State 4 transition.

Procedure: `docs/DEVOPS_GUIDE.md` §16.7 (generic DNS cutover) and `docs/DEVOPS_GUIDE.md` §4.2.1 (ACM cert issuance) for the step-by-step operator actions. `docs/DEV_ONBOARDING.md` Path I (§9.4) for first-time setup against an empty account.

### 29.12a Legacy host parallel role

The legacy host persists in a parallel role beyond the §27 rollback window, under separate hostnames, for a bounded period agreed with the legacy-site webmaster. The new platform absorbs the apex and `www`; the legacy host continues to serve the subdomains the webmaster elects to keep running on his existing server. Inventory, duration, and coordination details are settled via §19 items 15-18.

**Hard design constraints (locked):**

- CloudFront fronts `footbag.org` and `www.footbag.org` at T-0. This is the new platform's required ingress shape; the apex topology is not negotiable.
- Legacy retained content is served under separate hostnames (subdomain coexistence), **over HTTPS exclusively**. CloudFront is not configured to proxy paths to a legacy origin: that arrangement would conflict with the §29.3 origin-verification gate and would couple the legacy content inventory to the CloudFront configuration surface. Subdomains the webmaster retains keep their existing DNS records pointing at the legacy host's IP. HTTPS is non-negotiable: the new-platform session cookie (`footbag_session`) is widened to `Domain=.footbag.org` per §29.15 and is therefore sent to every retained `*.footbag.org` hostname. A subdomain served over plain HTTP would leak the session token in cleartext on every request. Each retained subdomain must present a valid TLS certificate for its hostname before cutover.
- The parallel window is bounded by a hard end-date agreed in §19 item 31. Indefinite persistence converts the migration into long-term federation and is out of scope.
- The legacy host is operated by the legacy-site webmaster through the parallel window: patches, uptime, server-side configuration, and TLS on the retained subdomains remain his responsibility. This operational responsibility is server-side; DNS authority for `footbag.org` is settled separately under §19 item 15. If the zone migrates to a maintainer-controlled provider (Route 53 or equivalent) to satisfy apex-ALIAS capability, subdomain records under that zone are still applied at the webmaster's instruction (the maintainer holds zone-write access; the webmaster sources the record values for his subdomains); alternatively, the webmaster's subdomain names may be delegated back to a webmaster-controlled DNS zone via NS records, restoring full DNS authority for those names to him. The delegation-vs-managed choice is documented as part of §19 item 15.
- Every existing group, committee, and mailing-list function on the legacy site continues to operate at and after cutover. Allocation is per-function and negotiated with the webmaster per §19 item 26: each function either stays on the legacy parallel-role server (default), migrates to the new platform pre-cutover (requires a new-platform feature build, scoped as a separate effort outside this MP unless the negotiation surfaces a function that can't stay on the legacy server), or is retired with consent. No function goes dark at T-0. IFPA `@ifpa.footbag.org` list functions are excluded from this generic allocation and are dispositioned under §29.12a (IFPA list mail), with disposition authority resting with IFPA governance.

**Legacy host failure during the parallel window.** The webmaster's operational responsibility (constraint 4) does not include an uptime SLA. If the legacy host becomes unreachable and cannot be restored within a pre-agreed window, the following escalation path applies (to be confirmed with the webmaster before cutover as part of §19 item 31):

- **0-4 hours:** webmaster attempts restore from backup; maintainer notified; retained subdomains and legacy-hosted mailing lists are unavailable.
- **4-24 hours:** if restore is not feasible, the webmaster and maintainer jointly decide: (a) accelerate the parallel-window end-date and retire retained subdomains, removing their DNS records; (b) emergency-migrate the highest-priority retained functions to the new platform (scoped as an incident sprint, not a planned feature build).
- **Inbound email impact:** `@footbag.org` inbound is handled by Google Managed Services, not the legacy host (per the MX disposition below), so a legacy host outage during the parallel window does not affect `@footbag.org` mail. During the discrete mail-cutover step itself, a transient lower-priority backup MX may be kept as a safety net until Google delivery is confirmed. `@ifpa.footbag.org` mail on llic.net (§29.12a IFPA list mail) is independent of this host.

**Variables settled with the legacy-site webmaster (§19 items 15-18):**

- Subdomain inventory (item 13): which `*.footbag.org` subdomains stay on the legacy host.
- Parallel-role duration (item 14): hard end-date for the parallel window.
- Zone authority and apex capability (item 15): registrar and authoritative-DNS provider identity; confirmation of ALIAS / ANAME support at apex, or commitment to migrate the zone before T-0.
- Records-actor (item 16): who applies the maintainer-supplied records at cutover.

**MX disposition for `@footbag.org`:** outbound SES sender identity is verified at the `footbag.org` domain level using the DKIM CNAMEs added under the records-actor item (§19 item 17); no inbound mailbox is required for SES verification. Inbound `@footbag.org` mail moves to Google Managed Services: the `footbag.org` MX is repointed to Google in a discrete step before the web cutover, decoupled from the apex/`www` swap (see §28 Email transition and §29.12). Once Google inbound is live, the legacy mail server retains no `@footbag.org` mail role; `brat@footbag.org`, `directors@`, `sanctioning@`, and other apex role addresses are provisioned on Google before legacy delivery is withdrawn so no mail is lost. `@ifpa.footbag.org` is a separate mail domain on llic.net and is unaffected (§29.12a IFPA list mail). Cloudflare Email Routing is not used.

**Mail-cutover step (discrete, pre-T-0).** The `@footbag.org` MX move to Google runs as its own step ahead of the web cutover, on its own timeline, gated by zone authority (§19 item 15) and the confirmed alias inventory (§19 item 21). Skeleton (detailed operator click-paths live in `docs/DEVOPS_GUIDE.md` once the step is executed):

1. Provision every active `@footbag.org` mailbox or alias on Google from the confirmed inventory; verify each receives test mail.
2. Pre-shrink the `footbag.org` MX TTL.
3. Repoint the `footbag.org` MX to Google (records-actor, §19 item 17); optionally keep the legacy mail server as a transient lower-priority backup MX until Google delivery is confirmed.
4. Verify inbound end-to-end to every provisioned address; confirm SPF lists both SES (outbound) and Google.
5. Once confirmed, withdraw legacy `@footbag.org` delivery and remove the backup MX. `@ifpa.footbag.org` on llic.net is untouched throughout.

Rollback: if Google inbound fails verification, revert the MX to the legacy mail server (authoritative until step 5); the web cutover is independent and unaffected. Gate: EX7.

**STATUS: OPEN. Three email concerns require resolution before cutover:**

1. **Inbound mailbox inventory.** No enumeration exists of which `@footbag.org` addresses are in use, what role each serves, or which are active. The inventory is a prerequisite for provisioning every active address on Google Managed Services before legacy delivery is withdrawn, for §19 item 26 allocation decisions, and for verifying inbound continuity across the mail cutover.
2. **Mailing-list transition ambiguity.** USER_STORIES defines platform-managed mailing lists (newsletter, board-announcements, event-notifications, announce@footbag.org, group auto-sync lists) sent via SES. §19 item 26 allocates each legacy list to stay/migrate/retire. But no mapping exists between the US-defined lists and the lists the legacy server currently operates. At T-0, which lists does the platform manage vs. which stay on the legacy server? The `announce@footbag.org` list appears in both contexts.
3. **Legacy mail server health.** Eliminated as a standing risk for `@footbag.org` once inbound moves to Google (§28): Google, not the legacy host, then handles all `@footbag.org` inbound, including replies to platform-sent transactional email and traffic to `admin@footbag.org` (the public contact surfaced on `/legal`). Residual mail-host health concern applies only to `@ifpa.footbag.org` on llic.net, dispositioned below.

**IFPA list mail (`@ifpa.footbag.org`) disposition.** `@ifpa.footbag.org` is a distinct mail domain from `@footbag.org`. It has its own MX, hosted at llic.net, which runs the IFPA groups and committees mailing-list server: a sendmail-tied posting and moderation service (the legacy `wrapper` component) that accepts inbound mail to IFPA group and committee aliases, parses MIME, enforces moderation, and retains message history. This service runs outside the new platform and is unaffected by the `@footbag.org` move to Google Managed Services; repointing `footbag.org` MX does not touch `ifpa.footbag.org` MX.

**STATUS: OPEN. Disposition is an MVP scoping and requirements-gathering item, not a v1 build.** The new platform does not receive inbound email (no SES receiving rules, no inbound processing code; see §28). The platform's native groups and committees are a forward-looking system (web-form composition plus SES distribution, addressed under `groups.footbag.org`) and are not a migration target for the legacy IFPA list server. Whether any legacy IFPA list function should migrate depends first on evidence that the lists are actively used, which does not currently exist.

Default until that evidence is gathered: `@ifpa.footbag.org` and its llic.net list host are retained untouched. No v1 work, no MX change, no platform feature, no data import. It is a separately-scoped retained mail service through the parallel window and beyond, on the same "no function goes dark at T-0" basis as other retained legacy services (constraint 5 above).

Usage discovery (the legacy-site webmaster supplies the facts; disposition of any IFPA-owned list function or data is an IFPA governance decision, not a webmaster or maintainer one):

1. Which `@ifpa.footbag.org` aliases received any non-spam mail in the last 12 months?
2. Who reads each such alias today, and does any committee still conduct business over it rather than over ordinary email or board tools?
3. For any alias still in real use, is running it on llic.net acceptable indefinitely, or is there a date by which the list host must retire?

The roughly 1.2GB `ifpa_group_messages` archive is dispositioned under the sealed legacy email archive below.

**Sealed legacy email archive disposition.** The legacy `ifpa_group_messages` archive (roughly 1.2GB uncompressed; private and public discussions intermixed; dirty with spam and moderation residue; includes privately cast committee votes) is sealed and retained privately. Under every v1 branch it is not imported into the platform, not processed, not spam-cleaned, and not exposed publicly. Privately cast votes within it are permanently non-publishable.

The seal is enforced technically. The archive is held as an encrypted container; its decryption key is held in an IFPA-governed, access-controlled secret store. The encrypted container and the key vault are kept in an IFPA-governed cloud store restricted to the IFPA board and platform admins. The credential that opens the key vault is held separately from that store, under IFPA governance, with an IFPA-named backup holder, so access to the store alone cannot unseal the archive and loss of a single credential does not destroy it. The legacy-site webmaster is operational custodian of the encrypted container and the authoritative source for facts about its contents; he is not its decision authority.

Any future disposition (preserve a subset as historical record, redact, publish any portion, or destroy it) is an IFPA governance decision under IFPA's records-retention policy, never operator or webmaster discretion. The migration's only standing commitment is the seal: keep it private, keep it intact, expose nothing, until IFPA governance directs otherwise. Neither the encrypted container nor the key is ever committed to the repository, placed in issues, logs, tests, or AI prompts. Concrete custody details (store, folder, vault entry, access list) live only in operator notes, never in a tracked doc.

This disposition is deferred and is not on the cutover critical path; it does not gate v1.

### 29.12b Legacy URL forwarding for in-flight emails

Old footbag.org emails (account verification, forum-reply pointers, share-event links) reference legacy URL patterns like `/members/profile/{legacy_member_id}`, `/clubs/{slug}`, and various forum paths. After cutover, these emails continue circulating in inboxes for months or years.

Forwarding contract for the production app:

- Member profile patterns: `/members/profile/:legacyMemberId` resolves in three branches: (a) if the legacy ID maps to a non-deleted live member via `members.legacy_member_id`, redirect 301 to the slug-based URL `/members/:slug`; (b) if the legacy ID matches an unclaimed `legacy_members.legacy_member_id`, render a soft-landing page that names the legacy account (display name only, no PII) and offers a CTA to claim it (if the visitor is authenticated) or to register first (if not); (c) if the legacy ID matches no row in either table, render the friendly "this legacy account is no longer routable" 404 page. The soft landing in branch (b) preserves the claim funnel for members who follow old links before completing claim.
- Club patterns: legacy `/clubs/:slug` URLs resolve to the new club page if the slug survived normalization; otherwise to archive.footbag.org for the historical mirror or a 404 page when neither exists.
- Forum patterns: legacy forum thread URLs redirect to archive.footbag.org where the post is preserved as a static mirror. **Volume note:** if the legacy forum has thousands of indexed thread URLs, all will 301-redirect through the production CloudFront distribution post-cutover. Search engine re-crawl of these redirects may generate a sustained burst of requests in the days after cutover. Verify the redirect handler does not trigger CloudFront request-rate alarms, and confirm `archive.footbag.org` can absorb the redirected traffic without creating redirect loops (relevant if archive is also behind CloudFront).
- Unknown patterns: 404 with a generic legacy-URL message that directs the visitor to footbag.org.

The legacy site stays online but read-only for the 48h rollback window (§29.12 T+0 to T+48h); after T+48h the legacy host's apex content-serving role ends and `footbag.org` apex and `www` are served entirely by the new platform. Retained `*.footbag.org` subdomains under the legacy host's parallel role per §29.12a continue to operate beyond T+48h until their bounded end-date per §19 item 31. Redirect-handler coverage in the production app must therefore cover every legacy URL pattern that meaningfully forwards to a new destination, validated at test load by replaying a stored sample of legacy URLs against the production app.

Procedure: redirect handlers live in the public router; the sample-replay validation step is part of the test-load checklist.

### 29.13 Curator content seeding

Gate: the system member account (Footbag Hacky per DD §2.8) is seeded into the production DB and its curator content (avatar in `/curated/avatars/`, landing-page demo loops in `/curated/landing/`, event-pinned photos in `/curated/events/`, tutorials and records in `/curated/freestyle_tricks/`, etc.) is loaded into the production media bucket before public DNS cutover. Landing pages and curator-tagged surfaces must resolve to the production media bucket, not 404. The deploy orchestrator runs `scripts/seed_fh_curator.py` against the prod DB and `aws s3 sync` against the prod media bucket; verify via post-deploy smoke check. Curator content extends by adding file-paired sidecars under `/curated/{category}/`; no manifest edits are needed.

Constraint to resolve before go-live: the curator seeder (`src/services/curatorSeedService.ts`) calls `curatorMediaService.uploadVideo` directly, running ffmpeg in-process on the seeder host with the full source buffer in RAM. This bypasses the async media-job lifecycle (DD §6.8) that backs the admin curator video upload form. Acceptable today because seeding runs operator-side with adequate memory and no HTTP-timeout window. The production seed manifest may include larger source files than dev, and the same OOM hazard the admin path was redesigned to avoid applies on a memory-constrained host. Required: route the seeder through the same `media_jobs` lifecycle, posting source bytes to S3 via presigned PUT and dispatching transcode to the worker container. Must land before State 3 → State 4.

### 29.14 Post-launch admin curator authoring

Pre-launch, admin curator UIs at `/admin/curator/upload`, `/admin/curator/galleries`, and `/admin/curator/media/:id/edit` write to the `/curated/` filesystem (URL-reference sidecars at `/curated/{category}/*.meta.json` and gallery sidecars at `/curated/galleries/<slug>.json`, per DD §1.13) plus DB. Pre-launch loop: admin works on localhost, commits `/curated/` changes to git, deploys; the seeder re-runs from the committed sidecars on each DB-bearing deploy (`bash deploy_to_aws.sh --from-csv`). This loop ends at go-live: admins must work against prod, but the prod container has no git path back to the repo, so any sidecar edit on the running app diverges from the in-git source of truth.

Required: design and implement a post-launch admin-curated content authoring scheme. Candidate directions: (a) make the DB the source of truth for system-member-owned authoring (Footbag Hacky) and run periodic exports to git as backup, (b) add an admin "publish to git" surface that commits and PRs from the running app via a service account, (c) split runtime mutations from build-time authoring entirely (lock the running app to read-only on `/curated/` and require admins to author via a separate workflow). Design decision required; chosen direction is reflected in DD §1.13 and SERVICE_CATALOG `CuratorMediaService`. Must land before State 3 → State 4.

### 29.15 Legacy archive subdomain readiness

Per DD §6.4, archive.footbag.org serves the static legacy HTML mirror under member-only access enforced by CloudFront signed cookies. The archive launches at cutover.

**Archive completeness and legacy media.** The archive mirror holds the legacy content the crawl could reach: media linked under `www.footbag.org` (the `gallery`, `video`, `photos`, and `qt-video` paths) is captured and re-encoded to mp4/jpg/gif. Legacy media lives only in this archive; it is never imported into the new platform's media system (DD §6.4). Media reachable on the legacy server only by a direct `video.`/`photo.` file path that was never linked under `www` was not crawled and is therefore not in the mirror; those direct-path links are already dead today, so no subdomain is retained for them. Recovering that un-crawled media would require the webmaster to supply the files plus a path mapping from the legacy server; that is an optional, non-blocking, post-v1 archive-enrichment handled through the §19 feedback workflow, not a cutover dependency.

Gate, all of the following are provisioned and verified end-to-end:

- **Archive S3 bucket** (Terraform `aws_s3_bucket.archive` or equivalent) is private behind Origin Access Control. Bucket policy permits only the archive CloudFront distribution to read. Versioning and Object Lock per the standard private-bucket pattern.
- **CloudFront key group** (`aws_cloudfront_public_key` + `aws_cloudfront_key_group`) is provisioned in Terraform. The trusted-signer keypair private half is stored in AWS Secrets Manager (or SSM SecureString) scoped to the main app's runtime IAM role; the public half is registered in the key group.
- **Archive CloudFront distribution** is provisioned with: the archive S3 bucket as origin via OAC; the cache behavior naming the key group in `trusted_key_groups`; 1-year edge TTL per DD §6.2 immutable-archive guidance; ACM cert for `archive.footbag.org` attached; custom 403 error response redirecting to `https://footbag.org/login?return=archive.footbag.org`.
- **DNS record** for `archive.footbag.org` (Route 53 ALIAS or CNAME) pointing at the archive distribution.
- **Cookie-Domain widening** deployed: both `footbag_session` and the new CloudFront signed cookie use `Domain=.footbag.org` so the archive subdomain receives them. The widening lands AFTER the CSRF Origin-pin middleware (DD §3.3) is in production and BEFORE archive.footbag.org receives its first authenticated request.

**Risk acknowledgment (cookie-Domain widening on retained subdomains):** widening to `Domain=.footbag.org` sends `footbag_session` to every `*.footbag.org` hostname, including subdomains the webmaster retains under §29.12a. Those subdomains receive valid session tokens for the maintainer's app on every request. The HTTPS hard constraint in §29.12a constraint 2, the pre-cutover HTTPS audit gate OR14, and the daily TLS probe gate OR12 together prevent cleartext exposure across the parallel window. The risk that retained-subdomain servers may log the session token is accepted: the legacy-site webmaster is a trusted operator per §19, and the parallel window is bounded per §19 item 31.
- **Archive HTML mirror content** uploaded to the bucket. All video content is mp4, all images are jpg, no JavaScript present (DD §6.4 contract).
- **End-to-end auth flow tested**: unauthenticated request to `https://archive.footbag.org/some-path` returns CloudFront's signed-cookie-missing 403 with the redirect to the main-site login; an authenticated member's request returns 200 from S3 origin.

Procedure: Terraform provisioning and end-to-end test runbook live in `docs/DEVOPS_GUIDE.md`.

### 29.16 TLS health monitoring on retained subdomains

Gate: a periodic external probe (cron + curl, or equivalent) checks the TLS certificate expiry of every retained `*.footbag.org` subdomain (per §19 item 16) on the legacy host. The probe runs at least daily. An alarm fires when any retained subdomain's certificate is within a configurable grace window of expiry (default 14 days; configured via the `TLS_EXPIRY_GRACE_DAYS` environment variable on the probe host, runbook in DEVOPS_GUIDE) or already expired; the alarm notifies the maintainer and the secondary webmaster contact (per §19 item 19).

Rationale: the new-platform session cookie widens to `Domain=.footbag.org` per §29.15. A retained subdomain serving plain HTTP, or with a lapsed certificate, leaks the session token in cleartext on every request. The HTTPS constraint in §29.12a is a one-time pre-cutover check; this gate is the ongoing assurance across the bounded parallel-role window (§19 item 31).

Procedure: probe runbook and alarm wiring documented in `docs/DEVOPS_GUIDE.md`; sunsets when the parallel-role window ends and the retained-subdomain inventory empties.

**STATUS: OPEN. The probe must be automated (cron, not manual), and the alarm must fire without operator action.** The parallel window may last up to 12 months (§19 item 31). Let's Encrypt certificates expire every 90 days; a retained subdomain's cert will lapse at least once during a 12-month window unless the webmaster renews. A manual daily check will not be sustained for 12 months. The probe must be a scheduled job (cron on the Lightsail host or a CloudWatch Synthetics canary) with automated alarm delivery to both the maintainer and the webmaster's secondary contact (§19 item 19).

---

## 30. QC subsystem retirement (go-live gate)

The internal QC subsystem (`/internal/net/*`, `/internal/persons/*`, and supporting code, tables, and tests) is a hard go-live gate: no production deployment may carry QC code, routes, or tables. Deletion is not a post-launch tidy-up. Scope at retirement time: every `/internal/*` route, its controller and service code, its Handlebars views, its schema tables, its `db.ts` prepared-statement groups, and its tests.

Sign-off on QC retirement is a prerequisite for §24 State 3 → State 4 transition.

**QC retirement inventory** (canonical list of paths and tables to delete; the retirement PR maintainer extends this list if files have been added since):

- Controllers: `src/internal-qc/controllers/netQcController.ts`, `src/internal-qc/controllers/personsQcController.ts`.
- Services: `src/internal-qc/services/netQcService.ts`, `src/internal-qc/services/personsQcChecks.ts`, `src/internal-qc/services/personsQcService.ts`.
- Views: every `.hbs` file under `src/views/internal-qc/`.
- `src/db/db.ts`: every prepared-statement group banner-marked `// ---- QC-only (delete with pipeline-qc subsystem) ----` (currently around lines 2122, 2249, 2333, 2801, 2988, 3183, 3276, 5698).
- Schema tables in `database/schema.sql`: `net_review_queue` (and any future QC-only tables added under the same banner).
- Tests: `tests/integration/persons.qc.routes.test.ts`, `tests/integration/clubs-qc-panel.routes.test.ts`, plus any tests that exercise the deleted routes.
- Route mounting in `src/app.ts` for the `/internal/*` router (and the router file itself if it serves only QC).

**Automated enforcement**: two layers, paired so a typo or rename can't silently slip through:

1. **Positive-assertion test** (preferred). A test asserts that named QC files (the controllers, services, views, and schema table definitions deleted at retirement) no longer exist in the source tree. The test is keyed to the retirement PR's file list; absence is the success signal. This catches the case where someone restores a deleted file but the grep pattern wasn't extended to cover its name.
2. **Pattern grep** (defense in depth). A CI check runs against every PR targeting `main` that greps the source tree for known QC entry points (`/internal/`, `internalRoutes`, `netQcController`, `personsQcController`, `internal_qc` schema table names) and fails the build if any are found. The grep pattern list is maintained alongside the QC retirement PR.

Both checks live in `.github/workflows/ci.yml`. Sign-off on QC retirement asserts both layers are in place.
