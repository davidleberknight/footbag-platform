/**
 * ClubService -- club lifecycle and roster.
 *
 * Owns:
 *   - Club lifecycle: create, edit, activate/deactivate, archive
 *   - Leader and co-leader management
 *   - Roster management
 *   - Operability enforcement
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
 *
 * Persistence:
 *   clubs, clubs_open, clubs_all, club_leaders, members, tags, news_items,
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
import { PublicClubRow, PublicClubMemberRow, MemberCountRow, clubs } from '../db/db';
import { NotFoundError, ValidationError } from './serviceErrors';
import { runSqliteRead } from './sqliteRetry';
import { PageViewModel } from '../types/page';
import { countryCode } from './countryUtils';

const PUBLIC_CLUB_KEY_PATTERN = /^club_[a-z0-9_]+$/;

function slugifyCountry(country: string): string {
  return country.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function slugifyRegion(region: string): string {
  return region.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
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
  tier: 'pre_populate' | 'onboarding_visible';
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
    tier: ClubClassificationRule['tier'];
    fired: number;
  }> = [
    { id: 'R1',  label: 'Recently hosted',             predicate: 'last_hosted_year >= 2020',                                humanClause: 'hosted an event in 2020 or later',                                    tier: 'pre_populate',       fired: row.r1  },
    { id: 'R2',  label: 'Recent edit + ever hosted',   predicate: 'last_updated_year >= 2020 AND ever_hosted',               humanClause: 'page was updated in 2020+ and the club has hosted at least one event', tier: 'pre_populate',       fired: row.r2  },
    { id: 'R3',  label: 'Recent edit + active contact',predicate: 'last_updated_year >= 2020 AND contact_competed_2020+',    humanClause: 'page was updated in 2020+ and the listed contact has been competing',  tier: 'pre_populate',       fired: row.r3  },
    { id: 'R4',  label: 'Active contact + ever hosted',predicate: 'contact_competed_2020+ AND ever_hosted',                  humanClause: 'the listed contact has been competing and the club has hosted before', tier: 'pre_populate',       fired: row.r4  },
    { id: 'R5',  label: 'Active contact',              predicate: 'contact_competed_2020+',                                  humanClause: 'the listed contact was competing in 2020 or later',                    tier: 'onboarding_visible', fired: row.r5  },
    { id: 'R6',  label: 'Ever hosted',                 predicate: 'ever_hosted',                                             humanClause: 'the club has hosted at least one event',                                tier: 'onboarding_visible', fired: row.r6  },
    { id: 'R7',  label: 'Edited after creation',       predicate: 'last_updated_year >= 2016 AND last_updated > created',    humanClause: 'the page was edited in 2016 or later, after it was first created',     tier: 'onboarding_visible', fired: row.r7  },
    { id: 'R8',  label: 'Any member active',           predicate: 'max_affiliated_member_last_year >= 2020',                 humanClause: 'at least one affiliated member was competing in 2020 or later',        tier: 'onboarding_visible', fired: row.r8  },
    { id: 'R9',  label: 'Recently created',            predicate: 'created_year >= 2022',                                    humanClause: 'the club page was created in 2022 or later',                            tier: 'onboarding_visible', fired: row.r9  },
    { id: 'R10', label: 'Substantial roster',          predicate: 'unique_member_names >= 10 OR linkable_member_count >= 3', humanClause: 'the roster has 10+ unique names or 3+ identified players',              tier: 'onboarding_visible', fired: row.r10 },
  ];
  const rules: ClubClassificationRule[] = ruleSpecs.map((s) => ({
    id: s.id, label: s.label, predicate: s.predicate, tier: s.tier, fired: s.fired === 1,
  }));

  const firedIds = rules.filter((r) => r.fired).map((r) => r.id);
  const firedPrePopulate = ruleSpecs.filter((s) => s.tier === 'pre_populate' && s.fired === 1);
  const firedOnboarding  = ruleSpecs.filter((s) => s.tier === 'onboarding_visible' && s.fired === 1);

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
// (see exploration query 2026-05-18). Six lit tiers + tier 0 (clubs row
// exists but no affiliations) give a smooth 6-step sequential green
// ramp; USA's 1153 sits alone in tier 6, Canada plus the three
// 100-200 cohorts populate tier 5, and the long tail spreads evenly
// across tiers 1-4.
//   0       no affiliations    → no fill class beyond .has-clubs
//   1-2     trace              → tier 1
//   3-9     small              → tier 2
//   10-29   medium-small       → tier 3
//   30-99   medium             → tier 4
//   100-299 large              → tier 5
//   300+    outlier            → tier 6
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
  resolveByKey(key: string, isAuthenticated: boolean): ClubRouteResult {
    if (key.startsWith('club_')) {
      return { template: 'clubs/detail', vm: this.getPublicClubPage(key, isAuthenticated) };
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
          mapDataJson: JSON.stringify(
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

  getPublicClubPage(clubKey: string, isAuthenticated: boolean): PageViewModel<{ club: PublicClubDetail }> {
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
      // Current: loader-imported affiliations land in 'pending' and stay there
      //   until the onboarding wizard ships, so including 'pending' is the
      //   only way to surface real affiliations on the club detail page today.
      // Target: drop 'pending' from the filter once the onboarding wizard
      //   confirms affiliations and migrates them to 'confirmed_current'.
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
      // A_Review_Club_Cleanup_Signals admin queue ships and absorbs this
      // surface entirely.
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
}

export const clubService = new ClubService();
