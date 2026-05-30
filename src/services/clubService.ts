/**
 * ClubService -- club lifecycle and roster.
 *
 * Owns:
 *   - Club lifecycle: create (with standard hashtag reservation), edit,
 *     activate/deactivate, archive
 *   - Leader and co-leader management (including step-down)
 *   - Roster management (self-service join, leave, swap primary)
 *   - Operability enforcement (work queue items for missing contact)
 *
 * Does not own:
 *   - Media (MediaGalleryService)
 *   - Payments (PaymentService when implemented)
 *
 * Required patterns:
 *   - SA only: no `deleted_at` on `clubs`; use `clubs_all` for archived queries.
 *   - One `role='leader'` per club; a member can be leader of at most one club; max
 *     5 leaders per club; anti-self-removal (sole leader cannot remove themselves).
 *   - Standard hashtag reserved via `HashtagDiscoveryService.reserveStandardTag()` at
 *     creation; permanent (not HD).
 *   - Club display names are not required to be globally unique; the hashtag is the
 *     canonical identifier.
 *   - Club with zero leaders inserts a "Needs Leader" `work_queue_items` row; club
 *     with no contact email inserts a "Needs Contact" row.
 *   - News items emitted via `NewsService.emitNewsItem` only.
 *   - Leader contact exposure (`showContact` on `ClubLeader`) is a default-deny
 *     predicate: emits true only when status admits exposure AND the member has
 *     given explicit consent for this leader row AND a public contact source is
 *     present. Any missing input maps to false.
 *   - Bootstrap leader rendering (`club_bootstrap_leaders`) is read-only at the
 *     rendering path: it surfaces identity (display name, role, status), not
 *     authority. Claiming a `club_bootstrap_leaders` row links member identity
 *     to the historical leadership entry; it does NOT confer operational
 *     control of the club, edit permissions, contact-channel exposure, member-
 *     roster visibility, or any governance affordance. Claim, reassignment, and
 *     contact-exposure transitions are owned by explicit governance flows that
 *     mutate `club_bootstrap_leaders` or `club_leaders` separately from the
 *     public-page read path.
 *
 * Persistence:
 *   clubs, clubs_open, clubs_all, club_leaders, club_bootstrap_leaders,
 *   legacy_club_candidates, legacy_person_club_affiliations,
 *   member_club_affiliations, members, tags, news_items,
 *   audit_entries, outbox_emails, work_queue_items.
 *
 * Side effects:
 *   - audit_entries append
 *   - outbox_emails enqueue (join/leave/co-leader/archive emails)
 *   - news_items emission via NewsService (`club_created`, `club_archived`)
 *   - work_queue_items insert with admin-alerts mailing-list notification
 *
 * Service shape: singleton object (no external adapters).
 */
import {
  PublicClubRow,
  PublicClubMemberRow,
  MemberCountRow,
  clubs,
  clubBootstrapLeaders,
  clubLeaders,
  legacyClubCandidates,
  legacyPersonClubAffiliations,
  mediaTags,
  countGalleryItemsByCriteria,
  memberClubAffiliations,
  workQueue,
  transaction,
  type ClubBootstrapLeaderRow,
  type LegacyClubCandidateRow,
  type LegacyPersonClubAffiliationRow,
} from '../db/db';
import { ConflictError, NotFoundError, ValidationError } from './serviceErrors';
import { appendAuditEntry } from './auditService';
import { applyClubJoin as applyActivePlayerClubJoin } from './activePlayerService';
import { runSqliteRead } from './sqliteRetry';
import { PageViewModel } from '../types/page';
import { countryCode } from './countryUtils';
import { slugifyForTag } from './slugify';
import { randomUUID } from 'crypto';

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string };
  return e?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

const PUBLIC_CLUB_KEY_PATTERN = /^club_[a-z0-9_]+$/;

function slugifyCountry(country: string): string {
  return country.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function slugifyRegion(region: string): string {
  return region.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// Serialize a value for embedding in a <script type="application/json"> island.
// JSON.stringify leaves '<', '>', and '&' raw, so a DB-sourced string such as a
// club country containing "</script>" would terminate the island and inject
// markup. Escaping them to their \uXXXX form keeps the payload inside the island
// while remaining valid JSON (JSON.parse restores the original characters). The
// strict CSP already blocks script execution; output encoding must not depend on
// it.
function toJsonIsland(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function normalizePublicClubKeyToStoredTag(clubKey: string): string {
  if (!PUBLIC_CLUB_KEY_PATTERN.test(clubKey)) {
    throw new ValidationError('clubKey must match pattern club_{slug}.', {
      field: 'clubKey',
      value: clubKey,
    });
  }
  return `#${clubKey}`;
}

// ── Create-club result ───────────────────────────────────────────────────────

type CreateClubResult =
  | { branch: 'created'; clubId: string; clubKey: string }
  | { branch: 'already_leader'; existingClubName: string }
  | { branch: 'affiliation_cap' }
  | { branch: 'exact_name_exists'; existingClubName: string; existingClubKey: string }
  | { branch: 'tag_conflict'; tagNormalized: string };

// ── Shared view-model types ────────────────────────────────────────────────────

export interface PublicClubSummary {
  clubId: string;
  clubKey: string;
  clubHref: string;
  name: string;
  city: string;
  region: string | null;
  country: string;
  externalUrl: string | null;
  standardTagNormalized: string;
  standardTagDisplay: string;
  leaders: ClubLeaderSummary[];   // ≤ LEADER_SUMMARY_CAP; empty when no provisional/claimed leaders exist
  leadersOverflow: number;        // count beyond the cap; 0 when total ≤ cap
  vitality: ClubVitalitySignals;  // pre-shaped display signals for the metadata row
}

// Cap on visible leader names per club card on /clubs/:country. Names beyond
// this cap collapse into the leadersOverflow count. Detail page (/clubs/:key)
// uses ClubLeader and is uncapped.
export const LEADER_SUMMARY_CAP = 2;

// Conservative status labels for /clubs/:country chip rows and /clubs/:key
// snapshot. Service-shaped; templates render the strings as-is. Avoids
// "active" wording (which would imply real-time activity tracking the
// platform does not yet do) and avoids governance-flavored words.
export type ClubStatusLabel =
  | 'Known leaders'      // active club with at least one provisional/claimed leader
  | 'Member activity'    // active club with no leaders but historical members
  | 'Historical club'    // clubs.status='inactive' (deactivated; preserved publicly)
  | 'Needs update';      // active club with no leaders, no members

export interface ClubVitalitySignals {
  // Raw counts (also surfaced for tests + future use).
  knownLeadersCount: number;
  memberCount: number;
  hasExternalLink: boolean;

  // Pre-shaped display strings so templates remain logic-light.
  statusLabel: ClubStatusLabel;
  statusLabelKebab: string;        // CSS hook, e.g. 'historical-club'
  knownLeadersText: string;        // '3' or 'None known yet'
  memberCountText: string;         // '12' or 'Unknown'

  // Country-page metadata-row chips, in display order. Composition rules:
  // - always include a leaders chip ("X leaders" or "No known leaders yet")
  // - include a members chip only when memberCount > 0
  // - append the statusLabel chip only when it adds info beyond the counts
  //   (i.e. only for 'Historical club' and 'Needs update')
  metaChips: string[];
}

// Lightweight projection of ClubLeader for country-page card rendering.
// status is carried for forward-compat (future badge variants on cards) but
// the v1 country-page template renders names only.
export interface ClubLeaderSummary {
  displayName: string;
  status: ClubLeaderStatus;
}

export interface ClubMemberSummary {
  personId: string | null;
  name: string;
}

export type ClubLeaderStatus = 'provisional' | 'claimed' | 'verified';

// View-model for a club leader on /clubs/:key. Future-proofed for the claim
// flow: once claim plumbing lands, the service mapping (not the contract)
// is what evolves. status drives both badge text and the showContact gate;
// rendering only consumes pre-shaped fields.
export interface ClubLeader {
  personId?: string;            // historical_persons.person_id; enables /history/<id> link
  claimedMemberId?: string;     // members.id once claim flow lands; absent in Phase 1
  displayName: string;          // canonical person_name from historical_persons
  role: 'leader' | 'co-leader';
  roleLabel: string;            // pre-shaped display text for the role enum
  status: ClubLeaderStatus;
  badgeLabel?: string;          // pre-shaped display text (e.g. 'Provisional leader')
  badgeNote?: string;           // pre-shaped explanatory text under the badge
  showContact: boolean;         // privacy gate: false for provisional, regardless of source data
  contactEmail?: string;        // present only when showContact === true
}

export interface PublicClubDetail extends PublicClubSummary {
  description: string;
  countrySlug: string;
  members: ClubMemberSummary[];
  leaders: ClubLeader[];
  viewerIsMember: boolean;
  viewerCanJoin: boolean;
  joinHref: string | null;
  viewGalleryHref: string | null;
  // TEMP-DEVIATION: club-classification QC panel.
  // Current: populated unconditionally on every club detail page; surfaces the
  //   classifier's category, confidence, R1-R10 rule firings, rule inputs,
  //   combination-gate signals (structural + context modifier), pipeline-
  //   context summary, and decision path for human QC review.
  // Target: remove this field entirely (and the templates that render it) once
  //   the admin queue migration replaces the QC workflow and no environment
  //   relies on inline QC output.
  qcPanel?: ClubClassificationEvidence;
}

// TEMP-DEVIATION: ClubClassificationRule + ClubClassificationEvidence types.
// Current: back the QC panel only; rule firings + inputs + combination-gate
//   signals + pipeline context are pre-shaped at the service layer so
//   templates render flat.
// Target: delete these types when qcPanel is removed (see field comment above).
export interface ClubClassificationRule {
  id: 'R1'|'R2'|'R3'|'R4'|'R5'|'R6'|'R7'|'R8'|'R9'|'R10';
  label: string;
  predicate: string;
  fired: boolean;
  stage: 'pre_populate' | 'onboarding_visible';
}

export interface ClubClassificationInputRow {
  label: string;        // human-readable: "Member most recently active"
  value: string;        // pre-shaped: "2021" or "never" or "yes"
}

// Combination-gate signals surfaced alongside the R1-R10 rule table.
// `isPresent` is null when the legacy_data pipeline has not yet emitted the
// signal for the parent bootstrap row; the QC panel renders such cells as
// "(pipeline not yet emitting)" so curators see the gap without confusion.
export type ClubClassificationSignalKind = 'structural' | 'modifier';

export interface ClubClassificationSignal {
  key: 'listed_contact' | 'affiliation' | 'hosting' | 'roster' | 'mirror_text'
     | 'tier_signal' | 'recent_activity' | 'geographic_alignment';
  kind: ClubClassificationSignalKind;
  label: string;
  isPresent: boolean | null;
  evidenceText?: string;
}

export interface ClubClassificationGateOutput {
  classification: 'strong' | 'weak' | 'none' | null; // null when no signals emitted
  matchedGateLabel?: string;
  rationaleText?: string;
}

export interface ClubPipelineContext {
  affiliationsTotal: number;
  affiliationsPendingCount: number;
  liveClubRowSource: 'phase_h' | 'phase_g_legacy' | 'manual' | 'unknown';
  mappedClubIdStamped: boolean;
  mappedClubIdStampRule: 'broad' | 'narrow_bootstrap_eligible_only' | 'unknown';
  fallbackQueryApplied: boolean;
}

export interface ClubClassificationEvidence {
  category: 'pre_populate' | 'onboarding_visible' | 'dormant' | 'junk';
  categoryLabel: string;
  confidenceScore: number | null;
  bootstrapEligible: boolean;
  rules: ClubClassificationRule[];
  decisionPath: string;                 // technical: "onboarding_visible (matched R8, R10)"
  summaryTagline: string;               // short narrative for at-a-glance card
  narrativeWhy: string;                 // long narrative for diagnostic
  lastMemberActivityYear: number | null; // for at-a-glance stats line
  contactSignalSubstituteApplied: boolean;
  inputs: ClubClassificationInputRow[]; // ordered, human-labeled pairs
  // Combination-gate display: present once the legacy_data pipeline emits
  // per-signal evidence into `club_bootstrap_leader_signals`. Absent until
  // then; the panel template hides these sections when undefined so existing
  // rows continue to render unchanged.
  signals?: ClubClassificationSignal[];
  gateOutput?: ClubClassificationGateOutput;
  pipelineContext?: ClubPipelineContext;
}

// Single shaping site for the vitality signals. Pure function over the
// pre-fetched counts so both country-page (bulk) and detail-page (single)
// paths reach the same display strings via identical logic.
function computeVitality(
  row: PublicClubRow,
  knownLeadersCount: number,
  memberCount: number,
): ClubVitalitySignals {
  const hasExternalLink =
    row.external_url !== null && row.external_url.trim() !== '';

  let statusLabel: ClubStatusLabel;
  if (row.status === 'inactive') {
    statusLabel = 'Historical club';
  } else if (knownLeadersCount > 0) {
    statusLabel = 'Known leaders';
  } else if (memberCount > 0) {
    statusLabel = 'Member activity';
  } else {
    statusLabel = 'Needs update';
  }

  const knownLeadersText =
    knownLeadersCount > 0 ? String(knownLeadersCount) : 'None known yet';
  const memberCountText =
    memberCount > 0 ? String(memberCount) : 'Unknown';

  const chips: string[] = [];
  chips.push(
    knownLeadersCount > 0
      ? `${knownLeadersCount} leader${knownLeadersCount === 1 ? '' : 's'}`
      : 'No known leaders yet',
  );
  if (memberCount > 0) {
    chips.push(`${memberCount} member${memberCount === 1 ? '' : 's'}`);
  }
  // Append statusLabel only when it adds info beyond the count chips.
  // 'Known leaders' / 'Member activity' are already implicit in the counts.
  if (statusLabel === 'Historical club' || statusLabel === 'Needs update') {
    chips.push(statusLabel);
  }

  return {
    knownLeadersCount,
    memberCount,
    hasExternalLink,
    statusLabel,
    statusLabelKebab: statusLabel.toLowerCase().replace(/\s+/g, '-'),
    knownLeadersText,
    memberCountText,
    metaChips: chips,
  };
}

function toPublicClubSummary(
  row: PublicClubRow,
  vitality: ClubVitalitySignals,
  leaders: ClubLeaderSummary[] = [],
  leadersOverflow: number = 0,
): PublicClubSummary {
  const clubKey = row.tag_normalized.startsWith('#')
    ? row.tag_normalized.slice(1)
    : row.tag_normalized;
  return {
    clubId: row.club_id,
    clubKey,
    clubHref: `/clubs/${clubKey}`,
    name: row.name,
    city: row.city,
    region: row.region,
    country: row.country,
    externalUrl: row.external_url,
    standardTagNormalized: row.tag_normalized,
    standardTagDisplay: row.tag_display,
    leaders,
    leadersOverflow,
    vitality,
  };
}

// Flat row from clubs.listBootstrapLeadersByClubId. The query LEFT JOINs both
// historical_persons (for canonical name + person_id) and legacy_members (for
// the two fallback name columns: real_name first, display_name second). All
// four name-source fields are nullable. Single shaping sites below
// (toClubLeader / toClubLeaderSummary) decide displayName + linkability.
interface BootstrapLeaderRow {
  person_id: string | null;
  hp_person_name: string | null;
  lm_real_name: string | null;
  lm_display_name: string | null;
  role: 'leader' | 'co-leader';
  status: 'provisional' | 'claimed';
  imported_member_id: string | null;
  claimed_member_id: string | null;
}

// Flat row from clubs.listAllBootstrapLeaders — adds club_id for grouping.
interface BootstrapLeaderRowWithClubId extends BootstrapLeaderRow {
  club_id: string;
}

// Fallback chain for displayName. Empty strings are treated the same as NULL
// (the legacy_members import has populated either real_name or display_name
// for any given row, but not always both, and unset columns are stored as
// empty strings, not NULL). Literal string of last resort keeps the contract
// total so templates never branch on identity completeness.
function pickDisplayName(row: BootstrapLeaderRow): string {
  const candidates = [row.hp_person_name, row.lm_real_name, row.lm_display_name];
  for (const c of candidates) {
    if (c && c.trim() !== '') return c;
  }
  return '(unknown leader)';
}

// Single mapping site for DB row -> country-page summary projection.
function toClubLeaderSummary(row: BootstrapLeaderRowWithClubId): ClubLeaderSummary {
  return {
    displayName: pickDisplayName(row),
    status: row.status,
  };
}

// Single mapping site for DB status -> view-model. Decouples the enum from
// rendered text so the template branches on field presence, not status
// values. New statuses (e.g. 'verified') only require a new branch here.
//
// Identity completeness is a service concern, not a template concern: the
// template branches on personId presence (linkable to /history/<id>) but
// never infers identity completeness from any other field.
function toClubLeader(row: BootstrapLeaderRow): ClubLeader {
  // Privacy gate: provisional leaders never expose contact email regardless
  // of source-data presence. Future statuses may opt in via this same gate.
  const showContact = false;

  let badgeLabel: string | undefined;
  let badgeNote: string | undefined;
  if (row.status === 'provisional') {
    badgeLabel = 'Provisional leader';
    badgeNote  = 'imported from historical records';
  }

  const leader: ClubLeader = {
    displayName: pickDisplayName(row),
    role:        row.role,
    roleLabel:   row.role === 'leader' ? 'Leader' : 'Co-leader',
    status:      row.status,
    showContact,
  };
  if (row.person_id)        leader.personId        = row.person_id;
  if (row.claimed_member_id) leader.claimedMemberId = row.claimed_member_id;
  if (badgeLabel) leader.badgeLabel = badgeLabel;
  if (badgeNote)  leader.badgeNote  = badgeNote;
  return leader;
}

function toPublicClubDetail(
  row: PublicClubRow,
  vitality: ClubVitalitySignals,
  members: ClubMemberSummary[],
  leaders: ClubLeader[],
  qcPanel?: ClubClassificationEvidence,
): PublicClubDetail {
  const summary = toPublicClubSummary(row, vitality);
  const detail: PublicClubDetail = {
    ...summary,
    leaders,
    description: row.description,
    countrySlug: slugifyCountry(row.country),
    members,
    viewerIsMember: false,
    viewerCanJoin: false,
    joinHref: null,
    viewGalleryHref: null,
  };
  if (qcPanel) detail.qcPanel = qcPanel;
  return detail;
}

// TEMP-DEVIATION: AffiliationRow (shape returned by db.ts listMembersByClubId).
// Current: the club detail path splits historical affiliations into leader /
//   contact / member buckets using this row, and the QC panel reads its
//   member list from the same source.
// Target: replace with the permanent roster model once bootstrap leader rows
//   cover the full club set (both pre_populate and onboarding_visible cohorts
//   loaded) and the QC panel is removed.
interface AffiliationRow {
  person_id: string | null;
  person_name: string;
  inferred_role: 'member' | 'contact' | 'leader' | 'co-leader';
}

// TEMP-DEVIATION: affiliationRowToClubLeader fallback for clubs outside the
// pre_populate bootstrap cohort.
// Current: clubs without club_bootstrap_leaders rows surface
//   affiliation-inferred leaders (role='leader'/'co-leader'/'contact') as
//   provisional leaders. Contact gate stays closed; status is always
//   'provisional' because the affiliation was inferred from mirror data,
//   not claimed by a real member.
// Target: delete this fallback once bootstrap leader rows cover the full
//   club set (pre_populate plus onboarding_visible cohorts loaded).
function affiliationRowToClubLeader(row: AffiliationRow): ClubLeader {
  const isCoLeader = row.inferred_role === 'co-leader';
  const isContact  = row.inferred_role === 'contact';
  const leader: ClubLeader = {
    displayName: row.person_name,
    role:        isCoLeader ? 'co-leader' : 'leader',
    roleLabel:   isContact ? 'Contact' : (isCoLeader ? 'Co-leader' : 'Leader'),
    status:      'provisional',
    badgeLabel:  'Provisional leader',
    badgeNote:   'imported from historical records',
    showContact: false,
  };
  if (row.person_id) leader.personId = row.person_id;
  return leader;
}

// TEMP-DEVIATION: ClassificationEvidenceRow (db.ts getClassificationEvidenceByClubId shape).
// Current: carries classifier output for the QC panel only; not part of the
//   permanent club data model.
// Target: delete this type and its backing db.ts statement when the QC panel
//   is removed (see qcPanel field comment above).
interface ClassificationEvidenceRow {
  classification: 'pre_populate' | 'onboarding_visible' | 'dormant' | 'junk';
  confidence_score: number | null;
  bootstrap_eligible: number;
  r1: number; r2: number; r3: number; r4: number; r5: number;
  r6: number; r7: number; r8: number; r9: number; r10: number;
  contact_signal_substitute_applied: number;
  last_hosted_year: number | null;
  max_affiliated_member_last_year: number | null;
  contact_member_last_year: number | null;
  created_year: number | null;
  last_updated_year: number | null;
  unique_member_names: number | null;
  linkable_member_count: number | null;
  ever_hosted: number;
}

// TEMP-DEVIATION: toClassificationEvidence shapes the QC panel view-model.
// Current: rule labels (R1..R10) match the legacy classifier script that
//   populates legacy_club_candidates, so the QC panel reflects the same rule
//   names operators see when running the classifier offline.
// Target: delete this function when the QC panel is removed.
function toClassificationEvidence(row: ClassificationEvidenceRow): ClubClassificationEvidence {
  // Rule spec: label is a short identifier (table column); humanClause is the
  // sentence fragment used in narrative prose ("a member was competing in 2020+").
  const ruleSpecs: Array<{
    id: ClubClassificationRule['id'];
    label: string;
    predicate: string;
    humanClause: string;
    stage: ClubClassificationRule['stage'];
    fired: number;
  }> = [
    { id: 'R1',  label: 'Recently hosted',             predicate: 'last_hosted_year >= 2020',                                humanClause: 'hosted an event in 2020 or later',                                    stage: 'pre_populate',       fired: row.r1  },
    { id: 'R2',  label: 'Recent edit + ever hosted',   predicate: 'last_updated_year >= 2020 AND ever_hosted',               humanClause: 'page was updated in 2020+ and the club has hosted at least one event', stage: 'pre_populate',       fired: row.r2  },
    { id: 'R3',  label: 'Recent edit + active contact',predicate: 'last_updated_year >= 2020 AND contact_competed_2020+',    humanClause: 'page was updated in 2020+ and the listed contact has been competing',  stage: 'pre_populate',       fired: row.r3  },
    { id: 'R4',  label: 'Active contact + ever hosted',predicate: 'contact_competed_2020+ AND ever_hosted',                  humanClause: 'the listed contact has been competing and the club has hosted before', stage: 'pre_populate',       fired: row.r4  },
    { id: 'R5',  label: 'Active contact',              predicate: 'contact_competed_2020+',                                  humanClause: 'the listed contact was competing in 2020 or later',                    stage: 'onboarding_visible', fired: row.r5  },
    { id: 'R6',  label: 'Ever hosted',                 predicate: 'ever_hosted',                                             humanClause: 'the club has hosted at least one event',                                stage: 'onboarding_visible', fired: row.r6  },
    { id: 'R7',  label: 'Edited after creation',       predicate: 'last_updated_year >= 2016 AND last_updated > created',    humanClause: 'the page was edited in 2016 or later, after it was first created',     stage: 'onboarding_visible', fired: row.r7  },
    { id: 'R8',  label: 'Any member active',           predicate: 'max_affiliated_member_last_year >= 2020',                 humanClause: 'at least one affiliated member was competing in 2020 or later',        stage: 'onboarding_visible', fired: row.r8  },
    { id: 'R9',  label: 'Recently created',            predicate: 'created_year >= 2022',                                    humanClause: 'the club page was created in 2022 or later',                            stage: 'onboarding_visible', fired: row.r9  },
    { id: 'R10', label: 'Substantial roster',          predicate: 'unique_member_names >= 10 OR linkable_member_count >= 3', humanClause: 'the roster has 10+ unique names or 3+ identified players',              stage: 'onboarding_visible', fired: row.r10 },
  ];
  const rules: ClubClassificationRule[] = ruleSpecs.map((s) => ({
    id: s.id, label: s.label, predicate: s.predicate, stage: s.stage, fired: s.fired === 1,
  }));

  const firedIds = rules.filter((r) => r.fired).map((r) => r.id);
  const firedPrePopulate = ruleSpecs.filter((s) => s.stage === 'pre_populate' && s.fired === 1);
  const firedOnboarding  = ruleSpecs.filter((s) => s.stage === 'onboarding_visible' && s.fired === 1);

  let decisionPath: string;
  switch (row.classification) {
    case 'pre_populate':
      decisionPath = `pre_populate (matched ${firedIds.filter((id) => ['R1','R2','R3','R4'].includes(id)).join(', ') || 'none?'})`;
      break;
    case 'onboarding_visible':
      decisionPath = `onboarding_visible (matched ${firedIds.filter((id) => ['R5','R6','R7','R8','R9','R10'].includes(id)).join(', ') || 'none?'})`;
      break;
    case 'dormant':
      decisionPath = 'dormant (no rules fired, has description)';
      break;
    case 'junk':
      decisionPath = 'junk (no rules fired, no description)';
      break;
  }

  const categoryLabels: Record<ClassificationEvidenceRow['classification'], string> = {
    pre_populate:       'Pre-populate',
    onboarding_visible: 'Onboarding-visible',
    dormant:            'Dormant',
    junk:               'Junk',
  };

  // Pre-shape the narrative explaining why this category landed.
  // narrativeWhy = the long form (diagnostic); summaryTagline = the short
  // form (at-a-glance card).
  const joinClauses = (specs: typeof firedPrePopulate): string =>
    specs.map((s) => `${s.humanClause} (${s.id})`).join('; ');

  let narrativeWhy: string;
  let summaryTagline: string;
  switch (row.classification) {
    case 'pre_populate':
      narrativeWhy = `Pre-populate because ${joinClauses(firedPrePopulate)}.`;
      summaryTagline = 'Strong signals of recent activity; cut over to a live club at launch.';
      break;
    case 'onboarding_visible': {
      const why  = `Onboarding-visible because ${joinClauses(firedOnboarding)}.`;
      const not  = firedPrePopulate.length === 0
        ? ' Not Pre-populate because none of the recent-hosting or active-contact signals (R1–R4) fired.'
        : '';
      narrativeWhy = why + not;
      summaryTagline = 'Surfaced for member onboarding because activity signals are weaker than pre-populate but still present.';
      break;
    }
    case 'dormant':
      narrativeWhy = 'Dormant: no activity rule fired; description is present so the club is searchable in the onboarding wizard but not surfaced by default.';
      summaryTagline = 'No recent activity signals. Reachable by name search only.';
      break;
    case 'junk':
      narrativeWhy = 'Junk: no activity rule fired and no description present. Invisible to all non-admin surfaces.';
      summaryTagline = 'No activity signals and no description. Suppressed.';
      break;
  }

  // Pre-shape rule inputs with human-readable labels. Ordered as a reader
  // would scan: activity signals first, then page-edit history, then roster.
  const yearOrDash = (v: number | null): string => v == null ? '—' : String(v);
  const numOrDash  = (v: number | null): string => v == null ? '—' : String(v);
  const inputs: ClubClassificationInputRow[] = [
    { label: 'Last hosted an event',              value: row.last_hosted_year == null ? 'never' : String(row.last_hosted_year) },
    { label: 'Has ever hosted',                   value: row.ever_hosted === 1 ? 'yes' : 'no' },
    { label: 'Member most recently active',       value: yearOrDash(row.max_affiliated_member_last_year) },
    { label: 'Listed contact last competed',      value: yearOrDash(row.contact_member_last_year) },
    { label: 'Page created',                      value: yearOrDash(row.created_year) },
    { label: 'Page last updated',                 value: yearOrDash(row.last_updated_year) },
    { label: 'Unique member names',               value: numOrDash(row.unique_member_names) },
    { label: 'Members identified as known players', value: numOrDash(row.linkable_member_count) },
  ];

  return {
    category:          row.classification,
    categoryLabel:     categoryLabels[row.classification],
    confidenceScore:   row.confidence_score,
    bootstrapEligible: row.bootstrap_eligible === 1,
    rules,
    decisionPath,
    summaryTagline,
    narrativeWhy,
    lastMemberActivityYear: row.max_affiliated_member_last_year,
    contactSignalSubstituteApplied: row.contact_signal_substitute_applied === 1,
    inputs,
  };
}

// ── Clubs index ────────────────────────────────────────────────────────────────

export interface CountrySummary {
  country: string;
  countryCode: string;
  countrySlug: string;
  countryHref: string;
  total: number;
  memberCount: number;
  memberBin: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

// Bin boundaries for the /clubs world-map choropleth. Driven by the
// per-country distribution of legacy_person_club_affiliations rows
// (see exploration query 2026-05-18). Six lit bins + bin 0 (clubs row
// exists but no affiliations) give a smooth 6-step sequential green
// ramp; USA's 1153 sits alone in bin 6, Canada plus the three
// 100-200 cohorts populate bin 5, and the long tail spreads evenly
// across bins 1-4.
//   0       no affiliations    → no fill class beyond .has-clubs
//   1-2     trace              → bin 1
//   3-9     small              → bin 2
//   10-29   medium-small       → bin 3
//   30-99   medium             → bin 4
//   100-299 large              → bin 5
//   300+    outlier            → bin 6
export function memberCountBin(n: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  if (n <= 0)   return 0;
  if (n < 3)    return 1;
  if (n < 10)   return 2;
  if (n < 30)   return 3;
  if (n < 100)  return 4;
  if (n < 300)  return 5;
  return 6;
}

export interface ClubsIndexContent {
  countries: CountrySummary[];
  totalClubs: number;
  totalCountries: number;
  mapDataJson: string;
}

// ── Country page ───────────────────────────────────────────────────────────────

export interface RegionGroup {
  region: string | null;
  regionSlug: string | null;
  clubs: PublicClubSummary[];
}

export interface CountryPageContent {
  country: string;
  countrySlug: string;
  total: number;
  hasMultipleRegions: boolean;
  regions: RegionGroup[];
}

// ── Service ────────────────────────────────────────────────────────────────────

export type ClubRouteResult =
  | { template: 'clubs/detail'; vm: PageViewModel<{ club: PublicClubDetail }> }
  | { template: 'clubs/country'; vm: PageViewModel<CountryPageContent> };

export class ClubService {
  /** Resolve GET /clubs/:key to the correct page (club detail or country). */
  resolveByKey(key: string, isAuthenticated: boolean, viewerMemberId?: string | null): ClubRouteResult {
    if (key.startsWith('club_')) {
      return { template: 'clubs/detail', vm: this.getPublicClubPage(key, isAuthenticated, viewerMemberId) };
    }
    return { template: 'clubs/country', vm: this.getPublicCountryPage(key) };
  }

  getPublicClubsIndexPage(): PageViewModel<ClubsIndexContent> {
    return runSqliteRead('clubService.getPublicClubsIndexPage', () => {
      const rows = clubs.listOpen.all() as PublicClubRow[];

      const countryTotals = new Map<string, number>();
      for (const row of rows) {
        countryTotals.set(row.country, (countryTotals.get(row.country) ?? 0) + 1);
      }

      const affiliationRows = clubs.listAffiliationCountsByCountry.all() as Array<{
        country: string;
        member_count: number;
      }>;
      const memberCounts = new Map<string, number>();
      for (const r of affiliationRows) {
        memberCounts.set(r.country, r.member_count);
      }

      const countries: CountrySummary[] = [...countryTotals.entries()].map(([country, total]) => {
        const memberCount = memberCounts.get(country) ?? 0;
        return {
          country,
          countryCode: countryCode(country),
          countrySlug: slugifyCountry(country),
          countryHref: `/clubs/${slugifyCountry(country)}`,
          total,
          memberCount,
          memberBin: memberCountBin(memberCount),
        };
      });

      return {
        seo: { title: 'Clubs' },
        page: {
          sectionKey: 'clubs',
          pageKey: 'clubs_index',
          title: 'Clubs',
          intro: 'Find a footbag club near you, or around the world.',
        },
        content: {
          countries,
          totalClubs: rows.length,
          totalCountries: countries.length,
          mapDataJson: toJsonIsland(
            countries.map(({ countryCode: code, countrySlug: slug, country: name, total, memberCount, memberBin }) =>
              ({ code, slug, name, total, memberCount, memberBin }),
            ),
          ),
        },
      };
    });
  }

  getPublicCountryPage(countrySlug: string): PageViewModel<CountryPageContent> {
    return runSqliteRead('clubService.getPublicCountryPage', () => {
      const rows = clubs.listOpen.all() as PublicClubRow[];

      const matchedRows = rows.filter(
        (row) => slugifyCountry(row.country) === countrySlug,
      );

      if (matchedRows.length === 0) {
        throw new NotFoundError('No clubs found for country.', {
          field: 'countrySlug',
          value: countrySlug,
        });
      }

      const country = matchedRows[0].country;

      // Group by club_id for O(1) per-club lookup (single round trip, no N+1).
      const leaderRows = clubs.listAllBootstrapLeaders.all() as BootstrapLeaderRowWithClubId[];
      const leadersByClubId = new Map<string, BootstrapLeaderRowWithClubId[]>();
      for (const lr of leaderRows) {
        if (!leadersByClubId.has(lr.club_id)) leadersByClubId.set(lr.club_id, []);
        leadersByClubId.get(lr.club_id)!.push(lr);
      }

      const memberCountRows = clubs.listMemberCountsForAllClubs.all() as MemberCountRow[];
      const memberCountByClubId = new Map<string, number>();
      for (const mr of memberCountRows) {
        memberCountByClubId.set(mr.club_id, mr.member_count);
      }

      const summarizeLeaders = (clubId: string): { leaders: ClubLeaderSummary[]; leadersOverflow: number; total: number } => {
        const all = leadersByClubId.get(clubId) ?? [];
        const visible = all.slice(0, LEADER_SUMMARY_CAP).map(toClubLeaderSummary);
        const overflow = Math.max(0, all.length - LEADER_SUMMARY_CAP);
        return { leaders: visible, leadersOverflow: overflow, total: all.length };
      };
      const buildSummary = (row: PublicClubRow): PublicClubSummary => {
        const { leaders, leadersOverflow, total: knownLeadersCount } = summarizeLeaders(row.club_id);
        const memberCount = memberCountByClubId.get(row.club_id) ?? 0;
        const vitality = computeVitality(row, knownLeadersCount, memberCount);
        return toPublicClubSummary(row, vitality, leaders, leadersOverflow);
      };

      // Only group by region when ALL clubs have a named region and 2+ distinct
      // named regions exist. If any club lacks a region, use a single flat group.
      const allHaveRegion = matchedRows.every((r) => r.region);
      const distinctNamedRegions = new Set(matchedRows.map((r) => r.region).filter(Boolean));
      const useRegions = allHaveRegion && distinctNamedRegions.size > 1;

      let regions: RegionGroup[];
      if (useRegions) {
        const regionMap = new Map<string, PublicClubSummary[]>();
        for (const row of matchedRows) {
          const key = row.region!;
          if (!regionMap.has(key)) regionMap.set(key, []);
          regionMap.get(key)!.push(buildSummary(row));
        }
        regions = [...regionMap.keys()]
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
          .map((region) => ({
            region,
            regionSlug: slugifyRegion(region),
            clubs: regionMap.get(region)!,
          }));
      } else {
        regions = [{
          region: null,
          regionSlug: null,
          clubs: matchedRows.map(buildSummary),
        }];
      }

      return {
        seo: { title: `${country} Clubs` },
        page: {
          sectionKey: 'clubs',
          pageKey: 'clubs_country',
          title: `Clubs in ${country}`,
        },
        navigation: {
          breadcrumbs: [
            { label: 'Clubs', href: '/clubs' },
            { label: country },
          ],
        },
        content: {
          country,
          countrySlug,
          total: matchedRows.length,
          hasMultipleRegions: useRegions,
          regions,
        },
      };
    });
  }

  getPublicClubPage(clubKey: string, isAuthenticated: boolean, viewerMemberId?: string | null): PageViewModel<{ club: PublicClubDetail }> {
    const tagNormalized = normalizePublicClubKeyToStoredTag(clubKey);

    return runSqliteRead('clubService.getPublicClubPage', () => {
      const row = clubs.getByTagNormalized.get(tagNormalized) as PublicClubRow | undefined;

      if (!row) {
        throw new NotFoundError('Club not found.', {
          field: 'clubKey',
          value: clubKey,
        });
      }

      // TEMP-DEVIATION: listMembersByClubId includes resolution_status='pending'.
      // Current: confirmAffiliation transitions rows for onboarding members,
      //   but non-onboarding members' rows stay 'pending' indefinitely;
      //   including 'pending' is the only way to surface those legacy
      //   affiliations on the club detail page.
      // Target: drop 'pending' from the filter once an admin bulk-promote
      //   tool transitions the remaining 'pending' rows to a terminal
      //   resolution.
      const affiliationRows = clubs.listMembersByClubId.all(row.club_id) as AffiliationRow[];

      // Leaders are public per V_Browse_Clubs / M_View_Club: provisional
      // leader names render to visitors and members alike. Contact-email
      // exposure is gated separately via ClubLeader.showContact.
      const bootstrapRows = clubs.listBootstrapLeadersByClubId.all(row.club_id) as BootstrapLeaderRow[];
      const bootstrapLeaders: ClubLeader[] = bootstrapRows.map(toClubLeader);

      // TEMP-DEVIATION: fallback path for clubs without bootstrap leader rows
      // (everything outside the pre_populate cohort). Surface affiliations
      // tagged role='leader' / 'co-leader' / 'contact' as provisional leaders,
      // deduplicated against bootstrap rows by person_id.
      const bootstrapPersonIds = new Set(
        bootstrapRows.map((r) => r.person_id).filter((id): id is string => !!id),
      );
      const affiliationLeaders: ClubLeader[] = affiliationRows
        .filter((r) => r.inferred_role === 'leader' || r.inferred_role === 'co-leader' || r.inferred_role === 'contact')
        .filter((r) => !r.person_id || !bootstrapPersonIds.has(r.person_id))
        .map(affiliationRowToClubLeader);
      const leaders: ClubLeader[] = [...bootstrapLeaders, ...affiliationLeaders];

      const members: ClubMemberSummary[] = isAuthenticated
        ? affiliationRows
            .filter((r) => r.inferred_role === 'member')
            .map((m) => ({ personId: m.person_id, name: m.person_name }))
        : [];

      // Vitality signals: counts mirror the auth-gated members list scope
      // so the snapshot agrees with the visible roster. Run the bulk
      // member-count query once, look up this one club_id from the result.
      const memberCountRows = clubs.listMemberCountsForAllClubs.all() as MemberCountRow[];
      const memberCount = memberCountRows.find((r) => r.club_id === row.club_id)?.member_count ?? 0;
      const vitality = computeVitality(row, leaders.length, memberCount);

      // TEMP-DEVIATION: classification evidence panel. Optional row; absent
      // when the candidate is not in legacy_club_candidates (e.g., dev fresh
      // clone with no enrichment CSVs loaded). Service tolerates absence.
      // Also tolerates SCHEMA DRIFT — dev DBs that predate the r1-r10 +
      // rule-input columns surface as "no such column" from better-sqlite3
      // at prepare time; treat that as absent rather than 500. Removed when
      // A_Periodic_Club_Cleanup admin queue ships and absorbs this surface
      // entirely.
      let qcPanel: ClubClassificationEvidence | undefined;
      let evidenceRowPresent = false;
      let fallbackQueryApplied = false;
      try {
        const evidenceRow = clubs.getClassificationEvidenceByClubId.get(row.club_id) as
          | ClassificationEvidenceRow
          | undefined;
        evidenceRowPresent = evidenceRow !== undefined;
        qcPanel = evidenceRow ? toClassificationEvidence(evidenceRow) : undefined;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('no such column') && !msg.includes('no such table')) throw err;
        qcPanel = undefined;
        fallbackQueryApplied = true;
      }
      if (qcPanel) {
        // Augment the classifier-as-built evidence with combination-gate +
        // pipeline-context surfaces. Per-signal data (structural + modifier)
        // remains absent until the legacy_data pipeline emits rows into
        // `club_bootstrap_leader_signals`; the panel template hides those
        // sections when the fields are undefined.
        qcPanel.pipelineContext = {
          affiliationsTotal:        affiliationRows.length,
          affiliationsPendingCount: 0, // resolution_status not yet surfaced from db.ts
          liveClubRowSource:        'unknown',
          mappedClubIdStamped:      evidenceRowPresent,
          mappedClubIdStampRule:    'unknown',
          fallbackQueryApplied,
        };
      }

      const club = toPublicClubDetail(row, vitality, members, leaders, qcPanel);

      const tagRow = mediaTags.findTagByNormalized.get(row.tag_normalized) as { id: string } | undefined;
      if (tagRow) {
        const mediaCount = countGalleryItemsByCriteria([tagRow.id]);
        if (mediaCount > 0) {
          club.viewGalleryHref = `/media/browse?tag=${encodeURIComponent(club.clubKey)}`;
        }
      }

      if (viewerMemberId) {
        const viewerAff = memberClubAffiliations.findCurrentByMemberAndClub.get(viewerMemberId, row.club_id) as
          | { id: string; is_primary: number } | undefined;
        club.viewerIsMember = viewerAff != null;
        if (!viewerAff) {
          const viewerCount = (memberClubAffiliations.countCurrentByMemberId.get(viewerMemberId) as { c: number }).c;
          club.viewerCanJoin = viewerCount < 2;
        }
        if (club.viewerCanJoin) {
          club.joinHref = `/clubs/${encodeURIComponent(clubKey)}/join`;
        }
      }

      return {
        seo: { title: club.standardTagDisplay },
        page: {
          sectionKey: 'clubs',
          pageKey: 'clubs_detail',
          title: club.name,
        },
        navigation: {
          breadcrumbs: [
            { label: 'Clubs', href: '/clubs' },
            { label: club.country, href: `/clubs/${club.countrySlug}` },
            { label: club.name },
          ],
          contextLinks: [
            { label: `All clubs in ${club.country}`, href: `/clubs/${club.countrySlug}` },
          ],
        },
        content: { club },
      };
    });
  }

  /**
   * Promote a bootstrap leader candidate to live leadership and stamp the
   * member's affiliation. Called by the wizard's 'club_affiliations'
   * confirm/correct branches.
   *
   * Behavior:
   *   - Marks `club_bootstrap_leaders.status='claimed'` + stamps claimed_member_id.
   *   - Inserts `member_club_affiliations` (source='legacy_claim', is_current=1).
   *     Idempotent: existing affiliation is left in place.
   *   - Inserts `club_leaders` row with the bootstrap row's role. Role downgrade
   *     to 'co-leader' if the club already has a `role='leader'` row OR if this
   *     member is already `role='leader'` of another club (schema partial-unique
   *     `ux_one_leader_per_club` and `ux_one_club_leader_per_member`).
   *   - Application cap: max 5 total leadership rows (leader + co-leaders) per
   *     club. When the cap is reached, the affiliation still lands; the
   *     club_leaders insert is skipped. Branch reports `affiliated_only` so the
   *     caller can surface "you're a club member; an admin can grant leadership
   *     later" in the wizard UX. Admins have full control via existing A_*
   *     user stories to retroactively add the member as a leader.
   *   - Idempotency: if this member is already in the club's leadership
   *     (any role), the existing row is preserved; branch reports `idempotent`.
   *
   * All writes happen in a single transaction so a partial failure rolls back.
   */
  claimLeadership(
    bootstrapLeaderId: string,
    actorMemberId: string,
  ): {
    branch: 'promoted_leader' | 'promoted_co_leader' | 'affiliated_only' | 'idempotent';
    clubId: string;
    clubLeaderId: string | null;
    affiliationId: string | null;
    actualRole: 'leader' | 'co-leader' | null;
    attemptedRole: 'leader' | 'co-leader';
    downgradeReason: 'leader_slot_taken' | 'member_already_leader' | 'both' | null;
  } {
    const leader = clubBootstrapLeaders.findById.get(bootstrapLeaderId) as
      | ClubBootstrapLeaderRow
      | undefined;
    if (!leader) {
      throw new NotFoundError(`Bootstrap leader candidate not found: ${bootstrapLeaderId}`);
    }
    if (leader.status !== 'provisional') {
      throw new ConflictError(
        `Bootstrap leader candidate is not provisional (current status: ${leader.status})`,
      );
    }

    const clubId = leader.club_id;
    const attemptedRole: 'leader' | 'co-leader' = leader.role;
    const now = new Date().toISOString();

    let branch:        'promoted_leader' | 'promoted_co_leader' | 'affiliated_only' | 'idempotent' = 'idempotent';
    let actualRole:    'leader' | 'co-leader' | null = null;
    let clubLeaderId:  string | null = null;
    let affiliationId: string | null = null;
    let downgradeReason: 'leader_slot_taken' | 'member_already_leader' | 'both' | null = null;

    try {
      transaction(() => {
        const updated = clubBootstrapLeaders.setStatusClaimed.run(
          actorMemberId,
          'onboarding_service',
          bootstrapLeaderId,
        );
        if (updated.changes === 0) {
          throw new ConflictError(
            `Bootstrap leader candidate status changed concurrently: ${bootstrapLeaderId}`,
          );
        }

        // Idempotency: member already in this club's leadership? Preserve existing row.
        const existing = clubLeaders.memberInClubLeadership.get(clubId, actorMemberId) as
          | { id: string; role: 'leader' | 'co-leader' }
          | undefined;
        if (existing) {
          branch = 'idempotent';
          actualRole = existing.role;
          clubLeaderId = existing.id;
        } else {
          // App-level 5-leader cap. Best-effort under better-sqlite3's
          // serialized writes; not schema-enforced. Two concurrent claims
          // could theoretically push count to 6, but BetterSqlite3 serializes
          // write transactions per process, so the race window only opens
          // across multiple processes/replicas.
          const cap = (clubLeaders.countByClubId.get(clubId) as { c: number }).c;
          if (cap >= 5) {
            branch = 'affiliated_only';
            actualRole = null;
          } else {
            // Pre-check downgrade (visible writes by this transaction): if the
            // leader slot is already taken OR this member is already lead of
            // another club, target co-leader from the start. Record which
            // condition fired so audit metadata can distinguish "club already
            // has a leader" from "you already lead elsewhere".
            let targetRole: 'leader' | 'co-leader' = attemptedRole;
            if (targetRole === 'leader') {
              const slotTaken = clubLeaders.hasLeader.get(clubId) as { x: number } | undefined;
              const memberLeads = clubLeaders.memberIsLeaderSomewhere.get(actorMemberId) as
                | { x: number } | undefined;
              if (slotTaken && memberLeads) {
                targetRole = 'co-leader';
                downgradeReason = 'both';
              } else if (slotTaken) {
                targetRole = 'co-leader';
                downgradeReason = 'leader_slot_taken';
              } else if (memberLeads) {
                targetRole = 'co-leader';
                downgradeReason = 'member_already_leader';
              }
            }
            clubLeaderId = `cl_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
            try {
              clubLeaders.insertClubLeader.run(
                clubLeaderId, now, 'onboarding_service', now, 'onboarding_service',
                clubId, actorMemberId, targetRole, now,
              );
            } catch (err) {
              // Race-safe retry: if the leader slot was grabbed concurrently
              // (ux_one_leader_per_club) OR this member became a leader of
              // another club concurrently (ux_one_club_leader_per_member),
              // downgrade to co-leader and re-insert. Only retry once and
              // only when the original attempt was for 'leader'. The
              // downgradeReason for race-retry is recorded as
              // 'leader_slot_taken' since per-club slot races dominate;
              // per-member races require a member to be claiming two clubs
              // in the same instant, which is structurally rare.
              if (!isUniqueViolation(err) || targetRole !== 'leader') throw err;
              targetRole = 'co-leader';
              downgradeReason ??= 'leader_slot_taken';
              clubLeaderId = `cl_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
              clubLeaders.insertClubLeader.run(
                clubLeaderId, now, 'onboarding_service', now, 'onboarding_service',
                clubId, actorMemberId, targetRole, now,
              );
            }
            actualRole = targetRole;
            branch = targetRole === 'leader' ? 'promoted_leader' : 'promoted_co_leader';
          }
        }

        // Affiliation insert is independent of leadership outcome: members who
        // don't get a leadership row still become club members.
        // Two-current-club cap (max 2 is_current=1 rows per member).
        // First current club is primary; second is secondary.
        const currentCount = (memberClubAffiliations.countCurrentByMemberId.get(actorMemberId) as { c: number }).c;
        if (currentCount >= 2) {
          affiliationId = null;
        } else {
          const isPrimary = currentCount === 0 ? 1 : 0;
          affiliationId = `mca_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
          try {
            memberClubAffiliations.insertAffiliation.run(
              affiliationId, now, 'onboarding_service', now, 'onboarding_service',
              actorMemberId, clubId, isPrimary, 'legacy_claim',
            );
          } catch (err) {
            if (!isUniqueViolation(err)) throw err;
            affiliationId = null;
          }
        }
      });
    } catch (err) {
      if (err instanceof ConflictError) throw err;
      throw err;
    }

    return {
      branch, clubId, clubLeaderId, affiliationId, actualRole,
      attemptedRole, downgradeReason,
    };
  }

  /**
   * Confirm or decline a legacy affiliation suggestion from the onboarding
   * wizard's club_affiliations task.
   *
   * Behavior:
   *   - 'confirm' / 'correct' (pending row): atomic transition to
   *     'confirmed_current' with resolved_club_id stamped (schema CHECK
   *     enforces both fields move together), plus an insert into
   *     member_club_affiliations (source='legacy_claim', is_current=1).
   *   - 'decline' (pending row): transition to 'rejected'. No affiliation
   *     row written.
   *   - non-pending row: idempotent no-op; returns the existing
   *     resolved_club_id if any.
   *
   * Scope restriction: only candidates whose parent legacy_club_candidates
   * row has mapped_club_id IS NOT NULL are confirmable. The wizard does NOT
   * create clubs (M_Complete_Onboarding_Wizard). 'onboarding_visible'
   * candidates without a mapped_club_id are filtered out at the wizard
   * card-listing layer; if one reaches this method directly, it raises
   * NotFoundError as an anti-enumeration safeguard.
   *
   * Multi-club safety: a member may hold at most two current club
   * affiliations (primary + secondary). The first current club is
   * primary (is_primary=1); the second is secondary (is_primary=0).
   * If the member already has two is_current=1 rows, the new
   * affiliation insert is skipped (cap hit); the legacy affiliation
   * row still transitions to 'confirmed_current'. The cap is enforced
   * at the service layer (count-before-insert), matching the 5-leader
   * cap pattern in claimLeadership. The UNIQUE(member_id, club_id)
   * index catches idempotent re-inserts of the same member-club pair.
   */
  confirmAffiliation(
    affiliationRowId: string,
    actorMemberId: string,
    userDecision: 'confirm' | 'correct' | 'decline',
  ): {
    branch: 'confirmed' | 'declined' | 'idempotent';
    affiliationRowId: string;
    resolvedClubId: string | null;
    newAffiliationId: string | null;
  } {
    const affiliation = legacyPersonClubAffiliations.findById.get(affiliationRowId) as
      | LegacyPersonClubAffiliationRow
      | undefined;
    if (!affiliation) {
      throw new NotFoundError(`Legacy affiliation row not found: ${affiliationRowId}`);
    }

    // Idempotency: a row already resolved produces a no-op result.
    if (affiliation.resolution_status !== 'pending') {
      return {
        branch:           'idempotent',
        affiliationRowId,
        resolvedClubId:   affiliation.resolved_club_id,
        newAffiliationId: null,
      };
    }

    const candidate = legacyClubCandidates.findById.get(affiliation.legacy_club_candidate_id) as
      | LegacyClubCandidateRow
      | undefined;
    if (!candidate) {
      throw new NotFoundError(
        `Legacy club candidate not found for affiliation: ${affiliationRowId}`,
      );
    }
    // Anti-enumeration safeguard: a candidate without mapped_club_id (i.e.,
    // not yet promoted to a real clubs row by the loader) must not reach
    // this method via the wizard. Surface as NotFoundError with identical
    // shape to the "row missing" case.
    if (!candidate.mapped_club_id) {
      throw new NotFoundError(`Legacy affiliation row not confirmable: ${affiliationRowId}`);
    }
    const resolvedClubId = candidate.mapped_club_id;

    if (userDecision === 'decline') {
      const updated = legacyPersonClubAffiliations.setResolutionStatusRejected.run(
        'onboarding_service',
        affiliationRowId,
      );
      if (updated.changes === 0) {
        // Concurrent transition raced ahead. Re-read and surface as idempotent.
        const after = legacyPersonClubAffiliations.findById.get(affiliationRowId) as
          | LegacyPersonClubAffiliationRow
          | undefined;
        return {
          branch:           'idempotent',
          affiliationRowId,
          resolvedClubId:   after?.resolved_club_id ?? null,
          newAffiliationId: null,
        };
      }
      return {
        branch:           'declined',
        affiliationRowId,
        resolvedClubId:   null,
        newAffiliationId: null,
      };
    }

    // 'confirm' or 'correct': transition status + stamp resolved_club_id +
    // insert member_club_affiliations atomically.
    let newAffiliationId: string | null = null;
    const now = new Date().toISOString();
    try {
      transaction(() => {
        const updated = legacyPersonClubAffiliations.setResolutionStatusConfirmed.run(
          resolvedClubId,
          'onboarding_service',
          affiliationRowId,
        );
        if (updated.changes === 0) {
          throw new ConflictError(
            `Legacy affiliation status changed concurrently: ${affiliationRowId}`,
          );
        }
        // Two-current-club cap (max 2 is_current=1 rows per member).
        // First current club is primary; second is secondary.
        const currentCount = (memberClubAffiliations.countCurrentByMemberId.get(actorMemberId) as { c: number }).c;
        if (currentCount >= 2) {
          newAffiliationId = null;
        } else {
          const isPrimary = currentCount === 0 ? 1 : 0;
          newAffiliationId = `mca_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
          try {
            memberClubAffiliations.insertAffiliation.run(
              newAffiliationId, now, 'onboarding_service', now, 'onboarding_service',
              actorMemberId, resolvedClubId, isPrimary, 'legacy_claim',
            );
          } catch (err) {
            if (!isUniqueViolation(err)) throw err;
            // UNIQUE(member_id, club_id): already affiliated at this club.
            newAffiliationId = null;
          }
        }
      });
    } catch (err) {
      if (err instanceof ConflictError) throw err;
      throw err;
    }

    return {
      branch:           'confirmed',
      affiliationRowId,
      resolvedClubId,
      newAffiliationId,
    };
  }

  resolveClubIdByKey(clubKey: string): string {
    const tagNormalized = normalizePublicClubKeyToStoredTag(clubKey);
    const row = clubs.getByTagNormalized.get(tagNormalized) as PublicClubRow | undefined;
    if (!row) {
      throw new NotFoundError('Club not found.');
    }
    return row.club_id;
  }

  // ── Club creation ───────────────────────────────────────────────────────────

  createClub(
    actorMemberId: string,
    input: {
      name: string;
      description: string;
      city: string;
      region: string;
      country: string;
      contactEmail: string;
      whatsapp: string;
      slug: string;
    },
  ): CreateClubResult {
    const name = input.name.trim();
    const description = input.description.trim();
    const city = input.city.trim();
    const region = input.region.trim() || null;
    const country = input.country.trim();
    const contactEmail = input.contactEmail.trim() || null;
    const whatsapp = input.whatsapp.trim() || null;

    const fieldErrors: Record<string, string> = {};
    if (!name) fieldErrors.name = 'Club name is required.';
    else if (name.length > 150) fieldErrors.name = 'Club name must be 150 characters or fewer.';
    if (!city) fieldErrors.city = 'City is required.';
    if (!country) fieldErrors.country = 'Country is required.';
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      fieldErrors.contactEmail = 'Enter a valid email address.';
    }

    let slug = input.slug.trim().toLowerCase();
    if (!slug) {
      slug = slugifyForTag(city);
    }
    if (!slug) {
      fieldErrors.slug = 'Could not derive a slug from the city name. Enter one manually.';
    } else if (slug.length < 2) {
      fieldErrors.slug = 'Slug must be at least 2 characters.';
    } else if (!/^[a-z0-9][a-z0-9_]*[a-z0-9]$/.test(slug)) {
      fieldErrors.slug = 'Slug must start and end with a letter or digit.';
    } else if (/__/.test(slug)) {
      fieldErrors.slug = 'Slug must not contain consecutive underscores.';
    } else if (!/^[a-z0-9_]+$/.test(slug)) {
      fieldErrors.slug = 'Slug may only contain lowercase letters, digits, and underscores.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Please fix the errors below.', { fieldErrors });
    }

    const tagNormalized = `#club_${slug}`;
    if (tagNormalized.length > 100) {
      throw new ValidationError('Please fix the errors below.', {
        fieldErrors: { slug: 'Slug is too long. The full hashtag must be 100 characters or fewer.' },
      });
    }

    const leaderRow = clubLeaders.memberIsLeaderSomewhere.get(actorMemberId) as { x: number } | undefined;
    if (leaderRow) {
      const clubNameRow = clubLeaders.leaderClubNameForMember.get(actorMemberId) as { club_name: string } | undefined;
      return { branch: 'already_leader', existingClubName: clubNameRow?.club_name ?? 'another club' };
    }

    const currentCount = (memberClubAffiliations.countCurrentByMemberId.get(actorMemberId) as { c: number }).c;
    if (currentCount >= 2) {
      return { branch: 'affiliation_cap' };
    }

    const dupRow = clubs.findByNameAndCountry.get(name, country) as
      | { club_id: string; name: string; country: string; club_key: string } | undefined;
    if (dupRow) {
      return { branch: 'exact_name_exists', existingClubName: dupRow.name, existingClubKey: dupRow.club_key };
    }

    const existingTag = mediaTags.findTagByNormalized.get(tagNormalized) as { id: string } | undefined;
    if (existingTag) {
      return { branch: 'tag_conflict', tagNormalized };
    }

    const now = new Date().toISOString();
    const tagId = `tag_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const clubId = `club_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const clubLeaderId = `cl_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const affiliationId = `mca_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const isPrimary = currentCount === 0 ? 1 : 0;

    try {
      transaction(() => {
        mediaTags.insertStandardTag.run(
          tagId, now, 'club_service', now, 'club_service',
          tagNormalized, tagNormalized, 'club',
        );
        clubs.insertClub.run(
          clubId, now, 'club_service', now, 'club_service',
          name, description, city, region, country,
          contactEmail, whatsapp, tagId,
        );
        clubLeaders.insertClubLeader.run(
          clubLeaderId, now, 'club_service', now, 'club_service',
          clubId, actorMemberId, 'leader', now,
        );
        memberClubAffiliations.insertAffiliation.run(
          affiliationId, now, 'club_service', now, 'club_service',
          actorMemberId, clubId, isPrimary, 'member_self_service',
        );
        appendAuditEntry({
          actionType: 'club.created',
          category: 'club_lifecycle',
          actorType: 'member',
          actorMemberId,
          entityType: 'club',
          entityId: clubId,
          metadata: { club_name: name, tag_normalized: tagNormalized, city, country },
        });

        if (!contactEmail && !whatsapp) {
          const wqId = `wq_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
          workQueue.insertItem.run(
            wqId, now, 'club_service', now, 'club_service',
            'club_leadership', 'club_needs_contact',
            'club', clubId,
            5, now,
            'Club created without any contact method.',
          );
        }
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const recheck = mediaTags.findTagByNormalized.get(tagNormalized) as { id: string } | undefined;
        if (recheck) {
          return { branch: 'tag_conflict', tagNormalized };
        }
      }
      throw err;
    }

    try {
      applyActivePlayerClubJoin(actorMemberId, actorMemberId, affiliationId);
    } catch {
      // AP grant is best-effort; creation succeeds regardless.
    }

    const clubKey = `club_${slug}`;
    return { branch: 'created', clubId, clubKey };
  }

  // ── Self-service club management ────────────────────────────────────────────

  joinClub(
    actorMemberId: string,
    clubId: string,
  ): {
    branch: 'joined_primary' | 'joined_secondary' | 'already_member' | 'cap_reached' | 'club_not_found';
    affiliationId: string | null;
  } {
    const club = clubs.findById.get(clubId) as { club_id: string; name: string; status: string } | undefined;
    if (!club || club.status === 'archived') {
      return { branch: 'club_not_found', affiliationId: null };
    }

    const existing = memberClubAffiliations.findCurrentByMemberAndClub.get(actorMemberId, clubId) as
      | { id: string; is_primary: number } | undefined;
    if (existing) {
      return { branch: 'already_member', affiliationId: null };
    }

    const now = new Date().toISOString();
    let affiliationId: string | null = null;
    let isPrimary = 0;

    transaction(() => {
      const currentCount = (memberClubAffiliations.countCurrentByMemberId.get(actorMemberId) as { c: number }).c;
      if (currentCount >= 2) {
        return;
      }
      isPrimary = currentCount === 0 ? 1 : 0;
      affiliationId = `mca_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
      try {
        memberClubAffiliations.insertAffiliation.run(
          affiliationId, now, 'club_service', now, 'club_service',
          actorMemberId, clubId, isPrimary, 'member_self_service',
        );
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        affiliationId = null;
      }

      if (affiliationId) {
        appendAuditEntry({
          actionType: 'club.member_joined',
          category: 'club_membership',
          actorType: 'member',
          actorMemberId,
          entityType: 'member_club_affiliation',
          entityId: affiliationId,
          metadata: { club_id: clubId, club_name: club.name, is_primary: isPrimary },
        });
      }
    });

    if (!affiliationId && !existing) {
      return { branch: 'cap_reached', affiliationId: null };
    }

    if (affiliationId) {
      try {
        applyActivePlayerClubJoin(actorMemberId, actorMemberId, affiliationId);
      } catch {
        // AP grant is best-effort; join succeeds regardless.
      }
    }

    return {
      branch: isPrimary ? 'joined_primary' : 'joined_secondary',
      affiliationId,
    };
  }

  leaveClub(
    actorMemberId: string,
    clubId: string,
  ): {
    branch: 'left' | 'sole_leader_blocked' | 'not_member';
    remainingClubName: string | null;
  } {
    const existing = memberClubAffiliations.findCurrentByMemberAndClub.get(actorMemberId, clubId) as
      | { id: string; is_primary: number } | undefined;
    if (!existing) {
      return { branch: 'not_member', remainingClubName: null };
    }

    const leadership = clubLeaders.memberInClubLeadership.get(clubId, actorMemberId) as
      | { id: string; role: 'leader' | 'co-leader' } | undefined;
    if (leadership && leadership.role === 'leader') {
      const otherLeaders = (clubLeaders.countOtherLeadersByClub.get(clubId, actorMemberId) as { c: number }).c;
      if (otherLeaders === 0) {
        return { branch: 'sole_leader_blocked', remainingClubName: null };
      }
    }

    const now = new Date().toISOString();
    let remainingClubName: string | null = null;

    transaction(() => {
      memberClubAffiliations.deactivate.run(now, 'club_service', actorMemberId, clubId);

      if (leadership) {
        clubLeaders.removeByMemberAndClub.run(actorMemberId, clubId);
      }

      appendAuditEntry({
        actionType: 'club.member_left',
        category: 'club_membership',
        actorType: 'member',
        actorMemberId,
        entityType: 'member_club_affiliation',
        entityId: existing.id,
        metadata: {
          club_id: clubId,
          was_primary: existing.is_primary,
          had_leadership: leadership?.role ?? null,
        },
      });
    });

    // Check if the member has a remaining club (for the "designate as primary" prompt).
    const remaining = memberClubAffiliations.listCurrentWithClubName.all(actorMemberId) as
      Array<{ club_name: string }>;
    if (remaining.length === 1) {
      remainingClubName = remaining[0].club_name;
    }

    return { branch: 'left', remainingClubName };
  }

  swapPrimaryAffiliation(
    actorMemberId: string,
  ): {
    branch: 'swapped' | 'not_enough_clubs';
  } {
    const current = memberClubAffiliations.listCurrentWithClubName.all(actorMemberId) as
      Array<{ id: string; club_id: string; club_name: string; is_primary: number }>;
    if (current.length < 2) {
      return { branch: 'not_enough_clubs' };
    }

    const now = new Date().toISOString();
    transaction(() => {
      memberClubAffiliations.swapPrimary.run(now, 'club_service', actorMemberId);

      appendAuditEntry({
        actionType: 'club.primary_swapped',
        category: 'club_membership',
        actorType: 'member',
        actorMemberId,
        entityType: 'member',
        entityId: actorMemberId,
        metadata: {
          old_primary_club_id: current.find((c) => c.is_primary)?.club_id ?? null,
          new_primary_club_id: current.find((c) => !c.is_primary)?.club_id ?? null,
        },
      });
    });

    return { branch: 'swapped' };
  }

  stepDownFromLeader(
    actorMemberId: string,
    clubId: string,
  ): {
    branch: 'stepped_down' | 'sole_leader_blocked' | 'not_leader';
  } {
    const leadership = clubLeaders.memberInClubLeadership.get(clubId, actorMemberId) as
      | { id: string; role: 'leader' | 'co-leader' } | undefined;
    if (!leadership) {
      return { branch: 'not_leader' };
    }
    if (leadership.role !== 'leader') {
      return { branch: 'not_leader' };
    }

    const otherLeaders = (clubLeaders.countOtherLeadersByClub.get(clubId, actorMemberId) as { c: number }).c;
    if (otherLeaders === 0) {
      return { branch: 'sole_leader_blocked' };
    }

    const now = new Date().toISOString();
    transaction(() => {
      clubLeaders.updateRole.run('co-leader', now, 'club_service', actorMemberId, clubId);

      appendAuditEntry({
        actionType: 'club.leader_stepped_down',
        category: 'club_leadership',
        actorType: 'member',
        actorMemberId,
        entityType: 'club_leader',
        entityId: leadership.id,
        metadata: { club_id: clubId, old_role: 'leader', new_role: 'co-leader' },
      });
    });

    return { branch: 'stepped_down' };
  }

  markClubInactive(
    actorMemberId: string,
    clubId: string,
  ): {
    branch: 'marked_inactive' | 'already_inactive' | 'not_leader';
  } {
    const leadership = clubLeaders.memberInClubLeadership.get(clubId, actorMemberId) as
      | { id: string; role: 'leader' | 'co-leader' } | undefined;
    if (!leadership) {
      return { branch: 'not_leader' };
    }

    const club = clubs.findById.get(clubId) as { club_id: string; name: string; status: string } | undefined;
    if (!club) {
      return { branch: 'not_leader' };
    }
    if (club.status === 'inactive') {
      return { branch: 'already_inactive' };
    }

    const now = new Date().toISOString();
    transaction(() => {
      clubs.updateStatus.run('inactive', now, 'club_service', clubId);

      appendAuditEntry({
        actionType: 'club.marked_inactive',
        category: 'club_lifecycle',
        actorType: 'member',
        actorMemberId,
        entityType: 'club',
        entityId: clubId,
        metadata: { club_name: club.name, old_status: club.status },
      });
    });

    return { branch: 'marked_inactive' };
  }

  updateClubHashtag(
    clubId: string,
    newSlug: string,
    actorMemberId: string,
  ): { branch: 'updated' | 'not_leader' | 'tag_conflict' | 'invalid_format' } {
    const leadership = clubLeaders.memberInClubLeadership.get(clubId, actorMemberId) as
      | { id: string; role: 'leader' | 'co-leader' } | undefined;
    if (!leadership) {
      return { branch: 'not_leader' };
    }

    const normalized = slugifyForTag(newSlug);
    if (!normalized || normalized.length < 2) {
      return { branch: 'invalid_format' };
    }

    const tagNormalized = `#club_${normalized}`;
    const tagDisplay = `#club_${normalized}`;

    const existing = mediaTags.findTagByNormalized.get(tagNormalized) as { id: string } | undefined;
    const club = clubs.findByIdWithHashtag.get(clubId) as
      | { club_id: string; name: string; hashtag_tag_id: string; tag_normalized: string }
      | undefined;
    if (!club) return { branch: 'not_leader' };

    if (existing && existing.id !== club.hashtag_tag_id) {
      return { branch: 'tag_conflict' };
    }

    const now = new Date().toISOString();
    transaction(() => {
      mediaTags.updateTagDisplay.run(tagNormalized, tagDisplay, club.hashtag_tag_id);

      appendAuditEntry({
        actionType: 'club.hashtag_updated',
        category: 'club_lifecycle',
        actorType: 'member',
        actorMemberId,
        entityType: 'club',
        entityId: clubId,
        metadata: { old_tag: club.tag_normalized, new_tag: tagNormalized },
      });
    });

    return { branch: 'updated' };
  }
}

export const clubService = new ClubService();
