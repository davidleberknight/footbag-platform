/**
 * ClubService -- club lifecycle and roster.
 *
 * Owns:
 *   - Club lifecycle: create (with standard hashtag reservation), edit,
 *     activate/deactivate, archive
 *   - Candidate promotion: a legacy club candidate becomes a live clubs row
 *     (admin override or wizard confirmation; ClubCleanupService and
 *     MemberOnboardingService delegate here)
 *   - Co-leader management: a flat, equal set of co-leaders (creator is the
 *     first; self-volunteer and invite-accept add more; step-down and leave
 *     remove one's own)
 *   - Roster management (self-service join, leave, swap primary)
 *
 * Does not own:
 *   - Media (MediaGalleryService)
 *   - Payments (PaymentService)
 *
 * Required patterns:
 *   - SA only: no `deleted_at` on `clubs`; use `clubs_all` for archived queries.
 *   - Co-leaders are a flat equal set (`role='co-leader'`), max 5 per club; a
 *     member co-leads at most one club (`ux_one_club_leader_per_member`). A
 *     co-leader acts only on themselves (edit own contact, step down, leave);
 *     removing another co-leader is admin-only. Zero co-leaders is a tolerated
 *     leaderless state: the club persists, stays joinable, and stays listed.
 *   - Standard hashtag (`#club_{slug}`) persisted via `mediaTags.insertStandardTag` at
 *     creation; permanent (not HD).
 *   - Club display names are not required to be globally unique; the hashtag is the
 *     canonical identifier.
 *   - A club has no club-level contact field; it is reachable through its
 *     co-leaders' own contact. The creator's own contact serves the new club,
 *     so creation requires no contact field. Promoted candidates derive their
 *     hashtag from the pipeline-parity city-first cascade, with the club id
 *     derived deterministically from the legacy key so promotion is idempotent
 *     and concurrency-safe (PK collision resolves as already-promoted).
 *   - A successful leadership claim returns a club of any status to 'active'
 *     (revival); a new current affiliation revives an inactive club.
 *   - Co-leader contact exposure (`showContact` on `ClubLeader`) is role-based
 *     and member-scoped: current co-leaders' emails render to authenticated
 *     viewers only; provisional bootstrap entries never expose contact. On the
 *     club detail page, leader identities are member-visible too: the
 *     view-model carries an empty leaders list for anonymous viewers.
 *   - When showContact is false the contact email is absent from the rendered HTML in
 *     every form: no mailto anchor, no email class attribute, no copy-paste fallback.
 *     The template branches on showContact alone, never on status; tests assert the
 *     absence of contact artifacts in the HTML. Leaders with a non-renderable status are
 *     filtered out in the service before rendering, not in the template. Unauthenticated visitors see
 *     neither the leaders section nor the club member roster; a bounded login prompt
 *     renders in place of the roster.
 *   - showContact fails closed for unknown or newly-introduced leader statuses: a new status maps
 *     to false unless its mapping explicitly chooses true with documented justification.
 *   - Bootstrap leader rendering (`club_bootstrap_leaders`) is read-only at the
 *     rendering path: it surfaces identity (display name, role, status), not
 *     authority. Claiming a `club_bootstrap_leaders` row links member identity
 *     to the historical leadership entry; it does NOT confer operational
 *     control of the club, edit permissions, contact-channel exposure, member-
 *     roster visibility, or any governance affordance. Claim, reassignment, and
 *     contact-exposure transitions are owned by explicit governance flows that
 *     mutate `club_bootstrap_leaders` or `club_leaders` separately from the
 *     public-page read path.
 *   - Clubs outside the pre_populate bootstrap cohort carry no
 *     `club_bootstrap_leaders` rows; there the public page surfaces
 *     affiliation-inferred leaders (`legacy_person_club_affiliations` rows
 *     tagged leader / co-leader / contact) as provisional leaders, labeled and
 *     never contact-exposed, deduplicated by person id against bootstrap rows
 *     and dropped once a real member claims. This is the permanent leadership
 *     source for those clubs; the legacy dump and mirror are the only such data.
 *
 * Persistence:
 *   clubs, clubs_open, clubs_active, clubs_all, club_leaders, club_bootstrap_leaders,
 *   legacy_club_candidates, legacy_person_club_affiliations,
 *   member_club_affiliations, club_viability_signals (promotion stamps the
 *   new club id onto the candidate's wizard flags), members, tags,
 *   audit_entries, outbox_emails.
 *
 * Side effects:
 *   - audit_entries append
 *   - outbox_emails enqueue (join/leave notifications to the member and
 *     current club leaders; co-leader invitations to a nominated member;
 *     co-leader-volunteered notifications to existing leaders; best-effort
 *     after the affiliation commit)
 *
 * Service shape: singleton object (no external adapters).
 */
import {
  PublicClubRow,
  MemberCountRow,
  account,
  declaredAnchors,
  clubs,
  clubBootstrapLeaders,
  clubLeaders,
  clubViabilitySignals,
  legacyClubCandidates,
  legacyPersonClubAffiliations,
  mediaTags,
  countGalleryItemsByCriteria,
  memberClubAffiliations,
  clubContent,
  transaction,
  type ClubBootstrapLeaderRow,
  type LegacyClubCandidateRow,
  type LegacyPersonClubAffiliationRow,
} from '../db/db';
import { emailService } from './emailService';
import { logger } from '../config/logger';
import { ConflictError, NotFoundError, ValidationError } from './serviceErrors';
import { validateExternalUrl } from '../lib/externalUrlValidator';
import { appendAuditEntry } from './auditService';
import { applyClubJoinInTx as applyActivePlayerClubJoinInTx, getStatus as getActivePlayerStatus } from './activePlayerService';
import { getTierStatus } from './membershipTieringService';
import { runSqliteRead } from './sqliteRetry';
import { PageViewModel } from '../types/page';
import { countryCode } from './countryUtils';
import { slugifyForTag } from './slugify';
import { deriveClubTag, stableClubId } from './clubTag';
import { randomUUID } from 'crypto';

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string };
  return e?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

// Candidate promotion can collide on the clubs TEXT primary key (extended
// code PRIMARYKEY) or on the tag uniqueness index (extended code UNIQUE);
// both mean another writer got there first.
function isConstraintViolation(err: unknown): boolean {
  const e = err as { code?: string };
  return e?.code === 'SQLITE_CONSTRAINT_UNIQUE' || e?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY';
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

export interface ClubNearMatch {
  name: string;
  location: string;
  /** Live clubs link to their page; legacy candidates have no page yet. */
  clubHref: string | null;
}

type CreateClubResult =
  | { branch: 'created'; clubId: string; clubKey: string }
  | { branch: 'already_leader'; existingClubName: string }
  | { branch: 'affiliation_cap' }
  | { branch: 'exact_name_exists'; existingClubName: string; existingClubKey: string }
  | { branch: 'near_matches_found'; nearMatches: ClubNearMatch[] }
  | { branch: 'tag_conflict'; tagNormalized: string };

type VolunteerResult =
  | { branch: 'volunteered'; clubLeaderId: string }
  | { branch: 'club_not_found' }
  | { branch: 'not_member' }
  | { branch: 'not_eligible' }
  | { branch: 'already_coleader' }
  | { branch: 'coleads_other_club' }
  | { branch: 'cap_reached' };

/**
 * Conservative name normalization for the near-match warning: lowercase,
 * punctuation stripped, whitespace collapsed. Catches spelling variants like
 * "Hacky-Crew" vs "hacky crew" without a similarity engine; genuinely
 * different names never match, so the warning stays low-noise.
 */
function normalizeClubNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCandidateLocation(parts: Array<string | null>): string {
  return parts.filter((p): p is string => p !== null && p.trim() !== '').join(', ');
}

function findNearMatchClubs(name: string, country: string): ClubNearMatch[] {
  const wanted = normalizeClubNameForMatch(name);
  if (wanted === '') return [];

  const out: ClubNearMatch[] = [];

  const liveClubs = clubs.listNamesByCountryForDuplicateCheck.all(country) as Array<{
    name: string; city: string | null; club_key: string;
  }>;
  for (const c of liveClubs) {
    // Raw NOCASE-equal names are already hard-blocked upstream; this
    // catches only the normalized variants.
    if (c.name.toLowerCase() === name.toLowerCase()) continue;
    if (normalizeClubNameForMatch(c.name) === wanted) {
      out.push({
        name: c.name,
        location: formatCandidateLocation([c.city, country]),
        clubHref: `/clubs/${encodeURIComponent(c.club_key)}`,
      });
    }
  }

  const candidates = legacyClubCandidates.listDuplicateCheckCandidatesByCountry.all(country) as Array<{
    display_name: string; city: string | null; region: string | null; country: string | null;
  }>;
  for (const cand of candidates) {
    if (normalizeClubNameForMatch(cand.display_name) === wanted) {
      out.push({
        name: cand.display_name,
        location: formatCandidateLocation([cand.city, cand.region, cand.country]),
        clubHref: null,
      });
    }
  }

  return out;
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
  knownLeadersNoun: string;        // pre-pluralized 'leader' / 'leaders'
  memberNoun: string;              // pre-pluralized 'member' / 'members'
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

// One roster entry on the club detail page. The single members list carries
// confirmed and pending affiliations together; rendering consumes pre-shaped
// fields only. href points at the live member profile when the person has
// claimed a search-visible account, otherwise at the historical-person page,
// and is null when neither exists. statusNote labels pending rows as
// unconfirmed; null for confirmed members.
export interface ClubMemberSummary {
  name: string;
  href: string | null;
  statusNote: string | null;
  /** 'Male' / 'Female' when the claimed member opted gender into public
   *  visibility, else null. The club detail roster is member-visible. */
  genderLabel: string | null;
  /** Membership-tier badge ('Tier 1' / 'Tier 2' / 'Tier 3 Director') for a
   *  claimed member; null for Tier 0 and for unclaimed historical rows. */
  tierBadge: string | null;
  /** True when the claimed member currently holds Active Player status. */
  isActivePlayer: boolean;
  isHof: boolean;
  isBap: boolean;
  isBoard: boolean;
  /** City and country of the claimed member, joined for display; null when
   *  neither is on file or the row is an unclaimed historical person. */
  location: string | null;
}

// Concise tier badges for the club roster; Tier 0 carries no badge.
const ROSTER_TIER_BADGE: Record<string, string> = {
  tier1: 'Tier 1',
  tier2: 'Tier 2',
  tier3: 'Tier 3 Director',
};

export type ClubLeaderStatus = 'provisional' | 'claimed' | 'verified';

// View-model for a club leader on /clubs/:key. Future-proofed for the claim
// flow: once claim plumbing lands, the service mapping (not the contract)
// is what evolves. status drives both badge text and the showContact gate;
// rendering only consumes pre-shaped fields.
export interface ClubLeader {
  personId?: string;            // historical_persons.person_id; enables /history/<id> link
  claimedMemberId?: string;     // members.id once the claim flow links a member; absent until then
  displayName: string;          // canonical person_name from historical_persons
  role: 'leader' | 'co-leader';
  roleLabel: string;            // pre-shaped display text for the role enum
  status: ClubLeaderStatus;
  badgeLabel?: string;          // pre-shaped display text (e.g. 'Provisional leader')
  badgeNote?: string;           // pre-shaped explanatory text under the badge
  showContact: boolean;         // member-visible-by-role gate: true only for current leaders shown to an authenticated viewer
  contactEmail?: string;        // present only when showContact === true
}

export interface PublicClubDetail extends PublicClubSummary {
  description: string;
  // True when a legacy free-text description carries embedded personal data
  // (member lists, names, or contact handles) and has been withheld from the
  // anonymous public shell, shown to logged-in members only. The template then
  // renders an archival note in place of the description.
  descriptionGated: boolean;
  countrySlug: string;
  members: ClubMemberSummary[]; // full roster: confirmed members plus 'pending' legacy affiliations labeled unconfirmed
  leaders: ClubLeader[];
  viewerIsMember: boolean;
  viewerCanJoin: boolean;
  /** Co-leaders edit club content directly; there is no suggestion loop. */
  viewerIsLeader: boolean;
  // No live co-leader: drives the "could use a co-leader" nudge above the
  // standing volunteer affordance. Computed from live co-leaders only.
  isLeaderless: boolean;
  // Standing volunteer-to-co-lead affordance: true only for an authenticated
  // viewer who passes the full volunteerToCoLeadClub eligibility gate.
  viewerCanVolunteer: boolean;
  volunteerHref: string | null;
  // Invite-a-member-to-co-lead control: shown to a viewer who already co-leads
  // this club. The invite is an email pointing at the volunteer affordance.
  inviteHref: string | null;
  contentEditHref: string | null;
  joinHref: string | null;
  viewGalleryHref: string | null;
  // An inactive club is hidden from the directory but still reachable by direct
  // link; the detail page shows a warning so it does not look like an active one.
  isInactive: boolean;
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
    knownLeadersNoun: knownLeadersCount === 1 ? 'leader' : 'leaders',
    memberNoun: memberCount === 1 ? 'member' : 'members',
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

// Legacy club descriptions are free-text imports that sometimes embed member
// lists, personal names, or contact handles. Governance keeps club rosters and
// contact data member-only and off public surfaces, so a description carrying
// that class of data is withheld from the anonymous shell and shown to logged-in
// members only. This flags the descriptions that carry it. It deliberately errs
// toward flagging: a false positive only member-gates a benign blurb, while a
// miss would leak personal data, so the signals are inclusive.
const DESC_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const DESC_IM_HANDLE = /\b(?:aim|msn|icq|skype|snap(?:chat)?|insta(?:gram)?|ig|kik|whatsapp)\b\s*:?\s*\S/i;
const DESC_ROSTER_LABEL = /\b(?:members?|roster|players?|line-?up|crew|local)\s*:/i;
const DESC_CONTACT_NAME = /\bcontact\s+[A-Z][a-z]+/;
const DESC_NAME_PAIR = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;

function descriptionMentionsIndividuals(text: string): boolean {
  if (!text) return false;
  if (
    DESC_EMAIL.test(text) ||
    DESC_IM_HANDLE.test(text) ||
    DESC_ROSTER_LABEL.test(text) ||
    DESC_CONTACT_NAME.test(text)
  ) {
    return true;
  }
  // A phone-like run: nine or more digits once separators are stripped, inside a
  // plausible phone shape, so a year or a short count does not trip it.
  const phone = text.match(/\+?\d[\d\-().\s]{7,}\d/);
  if (phone && phone[0].replace(/\D/g, '').length >= 9) return true;
  // Three or more consecutive First-Last capitalized pairs read as a name roster
  // even without a label (e.g. "Mike Stoler Greg Grandy Sam Gregory").
  const namePairs = text.match(DESC_NAME_PAIR);
  if (namePairs && namePairs.length >= 3) return true;
  return false;
}

// Directory discovery ordering: a visitor browsing "find a club near you" should
// meet live clubs first, with dormant and archival records sinking so the archive
// never dominates discovery. Live clubs (known leadership) lead, member-activity
// clubs follow, then active-but-empty "Needs update" rows, then deactivated
// "Historical club" rows. Records stay listed and searchable, just lower. Equal
// rank falls back to alphabetical.
function clubDiscoveryRank(s: PublicClubSummary): number {
  switch (s.vitality.statusLabel) {
    case 'Historical club': return 3;
    case 'Needs update':    return 2;
    case 'Member activity': return 1;
    default:                return 0;
  }
}

function byClubDiscovery(a: PublicClubSummary, b: PublicClubSummary): number {
  return (
    clubDiscoveryRank(a) - clubDiscoveryRank(b) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
}

function toPublicClubDetail(
  row: PublicClubRow,
  vitality: ClubVitalitySignals,
  members: ClubMemberSummary[],
  leaders: ClubLeader[],
): PublicClubDetail {
  const summary = toPublicClubSummary(row, vitality);
  const detail: PublicClubDetail = {
    ...summary,
    leaders,
    description: row.description,
    descriptionGated: false,
    countrySlug: slugifyCountry(row.country),
    members,
    viewerIsMember: false,
    viewerCanJoin: false,
    viewerIsLeader: false,
    isLeaderless: false,
    viewerCanVolunteer: false,
    volunteerHref: null,
    inviteHref: null,
    contentEditHref: null,
    joinHref: null,
    viewGalleryHref: null,
    isInactive: row.status === 'inactive',
  };
  return detail;
}

// AffiliationRow (shape returned by db.ts listMembersByClubId). The club detail
// path splits historical affiliations into leader / contact / member buckets
// from this row: leader / co-leader / contact rows surface as provisional
// leaders for clubs outside the bootstrap cohort (affiliationRowToClubLeader),
// and every row feeds the member roster (toClubMemberSummary).
interface AffiliationRow {
  person_id: string | null;
  person_name: string;
  inferred_role: 'member' | 'contact' | 'leader' | 'co-leader';
  resolution_status: 'confirmed_current' | 'promoted' | 'pending';
  member_slug: string | null; // claimed, search-visible member account; NULL otherwise
  member_gender: string | null;
  member_show_gender: number | null;
  member_city: string | null;
  member_country: string | null;
  member_is_hof: number | null;
  member_is_bap: number | null;
  member_is_board: number | null;
  member_tier_status: string | null;
  member_is_active_player: number | null;
}

// Shapes one roster entry for the club detail members list. Confirmed members
// who have claimed a search-visible account link to their live member profile;
// everyone else links to the historical-person page when one exists. Pending
// rows carry a status note so they are never presented as confirmed current
// membership.
function toClubMemberSummary(row: AffiliationRow): ClubMemberSummary {
  const isUnconfirmed = row.resolution_status === 'pending';
  let href: string | null = null;
  if (!isUnconfirmed && row.member_slug) {
    href = `/members/${row.member_slug}`;
  } else if (row.person_id) {
    href = `/history/${row.person_id}`;
  }
  // The roster renders only for authenticated viewers (gated by the caller), so
  // an opted-in member's gender is shown here; 'undisclosed' publishes nothing.
  const genderLabel =
    row.member_show_gender === 1 && (row.member_gender === 'male' || row.member_gender === 'female')
      ? (row.member_gender === 'male' ? 'Male' : 'Female')
      : null;
  const tierBadge = row.member_tier_status ? (ROSTER_TIER_BADGE[row.member_tier_status] ?? null) : null;
  const locationParts = [row.member_city, row.member_country].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== '',
  );
  return {
    name: row.person_name,
    href,
    statusNote: isUnconfirmed ? '(historical member, unconfirmed current)' : null,
    genderLabel,
    tierBadge,
    isActivePlayer: row.member_is_active_player === 1,
    isHof: row.member_is_hof === 1,
    isBap: row.member_is_bap === 1,
    isBoard: row.member_is_board === 1,
    location: locationParts.length > 0 ? locationParts.join(', ') : null,
  };
}

// Surfaces an affiliation-inferred leader as a provisional club leader for a
// club outside the pre_populate bootstrap cohort. Those clubs carry no
// club_bootstrap_leaders rows, and the legacy dump and mirror are their only
// leadership source, so their historically-listed leader / co-leader / contact
// people show here, labeled and clearly unverified, until a real member claims
// leadership. The contact gate stays closed and status is always 'provisional'
// because the affiliation was inferred from mirror data, not claimed by a real
// member; a claim supersedes it (person-id dedup at the call site drops the ghost).
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
// per-country distribution of legacy_person_club_affiliations rows.
// Six lit bins + bin 0 (clubs row exists but no affiliations) give a
// smooth 6-step sequential green
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

/**
 * Join/leave notification fan-out: one email to the member, one to each
 * current club leader (skipping the member when they are themselves a
 * leader). Best-effort by contract: the affiliation change is already
 * committed, so a notification failure must never surface as a failed
 * join/leave; it logs and moves on. Idempotency keys ride the affiliation
 * row id plus its post-write version: rejoining reuses the same row (the
 * affiliation table holds one row per member-club pair for life), so the
 * version is what separates a fresh join/leave event from a double-submit
 * of the same one.
 */
function enqueueClubMembershipEmails(opts: {
  kind: 'join' | 'leave';
  memberId: string;
  clubId: string;
  clubName: string;
  notificationKey: string;
}): void {
  try {
    const member = account.findContactInfoById.get(opts.memberId) as
      | { id: string; display_name: string; login_email: string | null }
      | undefined;
    const leaders = clubLeaders.listCurrentLeadersForClubPage.all(opts.clubId) as Array<{
      member_id: string; display_name: string; login_email: string | null;
    }>;

    if (member?.login_email) {
      emailService.send({
        template: 'club_membership_member',
        params: {
          kind: opts.kind,
          memberName: member.display_name,
          clubName: opts.clubName,
        },
        recipientEmail: member.login_email,
        recipientMemberId: member.id,
        idempotencyKey: `club-${opts.kind}:${opts.notificationKey}:member`,
      });
    }

    for (const leader of leaders) {
      if (!leader.login_email || leader.member_id === opts.memberId) continue;
      emailService.send({
        template: 'club_membership_leader',
        params: {
          kind: opts.kind,
          leaderName: leader.display_name,
          memberName: member?.display_name ?? 'A member',
          clubName: opts.clubName,
        },
        recipientEmail: leader.login_email,
        recipientMemberId: leader.member_id,
        idempotencyKey: `club-${opts.kind}:${opts.notificationKey}:leader:${leader.member_id}`,
      });
    }
  } catch (err) {
    logger.warn('club membership notification enqueue failed', {
      kind: opts.kind,
      clubId: opts.clubId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Notify a club's existing co-leaders that a member self-added to the
// leadership team. Best-effort after the volunteer write commits.
function enqueueVolunteerLeadershipEmails(opts: {
  memberId: string;
  clubId: string;
  clubName: string;
  clubLeaderId: string;
}): void {
  try {
    const member = account.findContactInfoById.get(opts.memberId) as
      | { id: string; display_name: string; login_email: string | null }
      | undefined;
    const leaders = clubLeaders.listCurrentLeadersForClubPage.all(opts.clubId) as Array<{
      member_id: string; display_name: string; login_email: string | null;
    }>;
    const joinerName = member?.display_name ?? 'A member';

    for (const leader of leaders) {
      if (!leader.login_email || leader.member_id === opts.memberId) continue;
      emailService.send({
        template: 'club_volunteer_leadership',
        params: {
          leaderName: leader.display_name,
          joinerName,
          clubName: opts.clubName,
        },
        recipientEmail: leader.login_email,
        recipientMemberId: leader.member_id,
        idempotencyKey: `club-coleader-volunteered:${opts.clubLeaderId}:leader:${leader.member_id}`,
      });
    }
  } catch (err) {
    logger.warn('club co-leader volunteer notification enqueue failed', {
      clubId: opts.clubId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export class ClubService {
  /** Resolve GET /clubs/:key to the correct page (club detail or country). */
  resolveByKey(key: string, isAuthenticated: boolean, viewerMemberId?: string | null): ClubRouteResult {
    if (key.startsWith('club_')) {
      return { template: 'clubs/detail', vm: this.getPublicClubPage(key, isAuthenticated, viewerMemberId) };
    }
    return { template: 'clubs/country', vm: this.getPublicCountryPage(key, isAuthenticated) };
  }

  /**
   * Legacy-URL forwarding: an old /clubs/<key> link whose club did not survive
   * normalization is a known legacy candidate with no mapped club. Returns the
   * legacy club key for the archive-mirror redirect, or null when there is no
   * such unmapped candidate.
   */
  findUnmappedLegacyClubKey(key: string): string | null {
    const candidate = declaredAnchors.findLegacyClubCandidateByKey.get(key) as
      | { legacy_club_key: string; mapped_club_id: string | null }
      | undefined;
    return candidate && !candidate.mapped_club_id ? candidate.legacy_club_key : null;
  }

  getPublicClubsIndexPage(): PageViewModel<ClubsIndexContent> {
    return runSqliteRead('clubService.getPublicClubsIndexPage', () => {
      const rows = clubs.listActive.all() as PublicClubRow[];

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

  /**
   * Browse href for a member's free-text country: the country page when any
   * active club resolves to it, otherwise the all-clubs index. A free-text
   * country that matches no country page must never become a 404 link.
   */
  countryBrowseHref(country: string | null): string {
    if (!country || !country.trim()) return '/clubs';
    return runSqliteRead('clubService.countryBrowseHref', () => {
      const slug = slugifyCountry(country);
      const rows = clubs.listActive.all() as PublicClubRow[];
      return rows.some((row) => slugifyCountry(row.country) === slug) ? `/clubs/${slug}` : '/clubs';
    });
  }

  getPublicCountryPage(countrySlug: string, isAuthenticated: boolean): PageViewModel<CountryPageContent> {
    return runSqliteRead('clubService.getPublicCountryPage', () => {
      const rows = clubs.listActive.all() as PublicClubRow[];

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
        // Leader identities are member-visible here as on the detail page:
        // anonymous viewers get the count chips but never leader names.
        return toPublicClubSummary(
          row,
          vitality,
          isAuthenticated ? leaders : [],
          isAuthenticated ? leadersOverflow : 0,
        );
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
            clubs: regionMap.get(region)!.sort(byClubDiscovery),
          }));
      } else {
        regions = [{
          region: null,
          regionSlug: null,
          clubs: matchedRows.map(buildSummary).sort(byClubDiscovery),
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

      // The roster carries both confirmed members and 'pending' legacy
      // affiliations. Pending rows are surfaced honestly with a per-entry
      // unconfirmed status note (see member shaping below), never presented
      // as confirmed current membership.
      const affiliationRows = clubs.listMembersByClubId.all(row.club_id) as AffiliationRow[];

      // Leader identities on the detail page are member-visible: names render
      // to authenticated viewers only (gated below, where the view-model is
      // composed). Contact email is member-visible by role: current
      // (claimed/assigned) leaders expose it to authenticated viewers;
      // provisional entries never expose contact.
      const liveLeaderRows = clubLeaders.listCurrentLeadersForClubPage.all(row.club_id) as Array<{
        member_id: string;
        role: 'leader' | 'co-leader';
        display_name: string;
        login_email: string | null;
      }>;
      const liveLeaders: ClubLeader[] = liveLeaderRows.map((l) => {
        const leader: ClubLeader = {
          displayName: l.display_name,
          role:        l.role,
          roleLabel:   l.role === 'leader' ? 'Leader' : 'Co-leader',
          status:      'claimed',
          claimedMemberId: l.member_id,
          showContact: isAuthenticated && !!l.login_email,
        };
        if (isAuthenticated && l.login_email) leader.contactEmail = l.login_email;
        return leader;
      });
      // Bootstrap rows render only while unclaimed: a claimed row's person is
      // already on the live list above under their member identity. The full
      // row set still feeds the person-id dedup below so a claimed person's
      // affiliation-inferred ghost does not reappear as provisional.
      const allBootstrapRows = clubs.listBootstrapLeadersByClubId.all(row.club_id) as BootstrapLeaderRow[];
      const bootstrapLeaders: ClubLeader[] = allBootstrapRows
        .filter((r) => r.status === 'provisional')
        .map(toClubLeader);

      // Clubs without bootstrap leader rows (everything outside the pre_populate
      // cohort) surface their affiliation-inferred leaders instead: rows tagged
      // role='leader' / 'co-leader' / 'contact' render as provisional leaders,
      // deduplicated against bootstrap rows by person_id so a claimed person's
      // ghost never reappears.
      const bootstrapPersonIds = new Set(
        allBootstrapRows.map((r) => r.person_id).filter((id): id is string => !!id),
      );
      const affiliationLeaders: ClubLeader[] = affiliationRows
        .filter((r) => r.inferred_role === 'leader' || r.inferred_role === 'co-leader' || r.inferred_role === 'contact')
        .filter((r) => !r.person_id || !bootstrapPersonIds.has(r.person_id))
        .map(affiliationRowToClubLeader);
      const leaders: ClubLeader[] = [...liveLeaders, ...bootstrapLeaders, ...affiliationLeaders];

      // A lone "(Co-leader)" reads as a contradiction when no leader is shown
      // beside it; present the single known leader entry as Leader. The stored
      // role is unchanged; only the display label adjusts.
      if (leaders.length === 1 && leaders[0].role === 'co-leader') {
        leaders[0].roleLabel = 'Leader';
      }

      // Members-only roster (DATA_GOVERNANCE §7): the list renders only for
      // authenticated viewers. One alphabetical list carries confirmed members
      // ('confirmed_current' / 'promoted') and 'pending' rows together; pending
      // entries carry a status note so they are never presented as confirmed.
      const memberRows = affiliationRows.filter((r) => r.inferred_role === 'member');
      const members: ClubMemberSummary[] = isAuthenticated
        ? memberRows.map(toClubMemberSummary)
        : [];

      // Vitality signals: counts mirror the auth-gated members list scope
      // so the snapshot agrees with the visible roster. Run the bulk
      // member-count query once, look up this one club_id from the result.
      const memberCountRows = clubs.listMemberCountsForAllClubs.all() as MemberCountRow[];
      const memberCount = memberCountRows.find((r) => r.club_id === row.club_id)?.member_count ?? 0;
      const vitality = computeVitality(row, leaders.length, memberCount);

      // Leader identities are member-visible like the roster: the anonymous
      // public never receives leader names. Gated here at the data level so
      // no template branch can leak them. Vitality above still counts the
      // full leader set; its chips render only in the curator panel.
      const club = toPublicClubDetail(row, vitality, members, isAuthenticated ? leaders : []);

      // A legacy free-text description that embeds member lists or contact data
      // is roster/contact-class data: member-only, never on the anonymous shell.
      // Withhold it here at the data level (no template branch can leak it) and
      // let the view render an archival note; logged-in members see the full text.
      if (!isAuthenticated && descriptionMentionsIndividuals(club.description)) {
        club.description = '';
        club.descriptionGated = true;
      }

      // Leaderless = no live co-leader. Bootstrap/affiliation provisional
      // entries are historical display, not operational leadership, so they do
      // not count here.
      club.isLeaderless = liveLeaders.length === 0;

      const tagRow = mediaTags.findTagByNormalized.get(row.tag_normalized) as { id: string } | undefined;
      if (tagRow) {
        const mediaCount = countGalleryItemsByCriteria([tagRow.id]);
        if (mediaCount > 0) {
          // `context=` locks the club hashtag as the gallery's context so a
          // visitor stays inside the club's media while refining within it.
          club.viewGalleryHref = `/media/browse?context=${encodeURIComponent(club.clubKey)}`;
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

        // Co-leaders edit club content directly and can invite a member to
        // co-lead; other eligible members reach leadership via the volunteer
        // affordance below.
        const viewerLeadership = clubLeaders.memberInClubLeadership.get(row.club_id, viewerMemberId) as
          | { id: string } | undefined;
        club.viewerIsLeader = viewerLeadership != null;
        if (club.viewerIsLeader) {
          club.contentEditHref = `/clubs/${encodeURIComponent(clubKey)}/content/edit`;
          club.inviteHref = `/clubs/${encodeURIComponent(clubKey)}/invite`;
        }

        // Standing volunteer affordance: shown only to a current member who
        // passes the full volunteerToCoLeadClub gate (Tier 1 benefits, not
        // already co-leading another club, club under the 5-co-leader cap, and
        // not already a co-leader here).
        if (club.viewerIsMember && !club.viewerIsLeader && liveLeaders.length < 5) {
          const tier = getTierStatus(viewerMemberId);
          const ap = getActivePlayerStatus(viewerMemberId);
          const hasTier1Benefits = (tier != null && tier.tier_status !== 'tier0') || ap.is_active_player === 1;
          const coLeadsElsewhere = !!(clubLeaders.memberCoLeadsAnyClub.get(viewerMemberId) as { x: number } | undefined);
          if (hasTier1Benefits && !coLeadsElsewhere) {
            club.viewerCanVolunteer = true;
            club.volunteerHref = `/clubs/${encodeURIComponent(clubKey)}/volunteer`;
          }
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
   * Promote a bootstrap leader candidate to a live co-leader and stamp the
   * member's affiliation. Called by the wizard's 'club_affiliations'
   * confirm/correct branches. This bootstrap claim is tier-exempt: a legacy
   * leader reclaims their own club regardless of tier.
   *
   * Behavior:
   *   - Marks `club_bootstrap_leaders.status='claimed'` + stamps claimed_member_id.
   *   - Inserts `member_club_affiliations` (source='legacy_claim', is_current=1).
   *     Idempotent: existing affiliation is left in place.
   *   - Inserts a flat `club_leaders` co-leader row. A member co-leads at most
   *     one club (`ux_one_club_leader_per_member`), so a member who already
   *     co-leads another club is affiliated here but not made a co-leader;
   *     branch reports `affiliated_only`. An admin can resolve the contention
   *     via `A_Reassign_Club_Leader`.
   *   - Application cap: max 5 co-leaders per club. At the cap the affiliation
   *     still lands and the club_leaders insert is skipped; branch reports
   *     `affiliated_only`.
   *   - Idempotency: if this member already co-leads the club, the existing row
   *     is preserved; branch reports `idempotent`.
   *
   * All writes happen in a single transaction so a partial failure rolls back.
   */
  claimLeadership(
    bootstrapLeaderId: string,
    actorMemberId: string,
  ): {
    branch: 'promoted_co_leader' | 'affiliated_only' | 'idempotent';
    clubId: string;
    clubLeaderId: string | null;
    affiliationId: string | null;
    actualRole: 'co-leader' | null;
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
    const now = new Date().toISOString();

    let branch:        'promoted_co_leader' | 'affiliated_only' | 'idempotent' = 'idempotent';
    let actualRole:    'co-leader' | null = null;
    let clubLeaderId:  string | null = null;
    let affiliationId: string | null = null;

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

        // Idempotency: member already co-leads this club? Preserve existing row.
        const existing = clubLeaders.memberInClubLeadership.get(clubId, actorMemberId) as
          | { id: string; role: 'co-leader' }
          | undefined;
        if (existing) {
          branch = 'idempotent';
          actualRole = existing.role;
          clubLeaderId = existing.id;
        } else {
          // App-level 5-co-leader cap. Best-effort under better-sqlite3's
          // serialized writes; not schema-enforced. Two concurrent claims
          // could theoretically push count to 6, but BetterSqlite3 serializes
          // write transactions per process, so the race window only opens
          // across multiple processes/replicas.
          const cap = (clubLeaders.countByClubId.get(clubId) as { c: number }).c;
          if (cap >= 5) {
            branch = 'affiliated_only';
            actualRole = null;
          } else {
            clubLeaderId = `cl_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
            try {
              clubLeaders.insertClubLeader.run(
                clubLeaderId, now, 'onboarding_service', now, 'onboarding_service',
                clubId, actorMemberId, 'co-leader', now,
              );
              actualRole = 'co-leader';
              branch = 'promoted_co_leader';
            } catch (err) {
              // A member co-leads at most one club (ux_one_club_leader_per_member).
              // A member already co-leading another club cannot co-lead this one;
              // they still become a club affiliate below.
              if (!isUniqueViolation(err)) throw err;
              clubLeaderId = null;
              actualRole = null;
              branch = 'affiliated_only';
            }
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

        // Revival: a successful leadership claim makes it a live club no
        // matter how it was retired. Inactive and archived clubs return to
        // 'active' in the same transaction, so the new leader's club is
        // immediately visible in listings.
        const club = clubs.findById.get(clubId) as
          | { club_id: string; status: string }
          | undefined;
        if (club && club.status !== 'active') {
          clubs.updateStatus.run('active', now, 'onboarding_service', clubId);
          appendAuditEntry({
            actionType:    'club.revived_by_leadership_claim',
            category:      'club_lifecycle',
            actorType:     'member',
            actorMemberId,
            entityType:    'club',
            entityId:      clubId,
            metadata:      { prior_status: club.status, bootstrap_leader_id: bootstrapLeaderId },
          });
        }

        if (affiliationId) {
          // The one-time club-join Active Player grant co-commits with the
          // bootstrap leadership claim in this same transaction.
          applyActivePlayerClubJoinInTx(actorMemberId, actorMemberId, affiliationId);
        }
      });
    } catch (err) {
      if (err instanceof ConflictError) throw err;
      throw err;
    }

    return {
      branch, clubId, clubLeaderId, affiliationId, actualRole,
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
   *     Exception: at the two-current-club cap this is a no-op cap hit
   *     (see Multi-club safety below).
   *   - 'decline' (pending row): transition to 'rejected'. No affiliation
   *     row written.
   *   - non-pending row: idempotent no-op; returns the existing
   *     resolved_club_id if any.
   *
   * Scope restriction: confirmation requires the parent
   * legacy_club_candidates row to carry mapped_club_id (the wizard promotes
   * an unmapped candidate via promoteCandidate BEFORE invoking the confirm
   * transition); a confirm that reaches this method against a still-unmapped
   * candidate raises NotFoundError as an anti-enumeration safeguard.
   * Decline needs no live club row and works on unmapped candidates.
   *
   * Multi-club safety: a member may hold at most two current club
   * affiliations (primary + secondary). The first current club is
   * primary (is_primary=1); the second is secondary (is_primary=0).
   * If the member already has two is_current=1 rows, the confirm is a
   * cap hit: the legacy affiliation row is left pending (NOT transitioned
   * to 'confirmed_current'), no affiliation is inserted, and the method
   * returns branch 'cap_hit'. The row stays actionable so the member can
   * mark a current club as former and retry. The cap is enforced at the
   * service layer (count-before-write), matching the 5-leader cap pattern
   * in claimLeadership. The UNIQUE(member_id, club_id) index catches
   * idempotent re-inserts of the same member-club pair.
   */
  confirmAffiliation(
    affiliationRowId: string,
    actorMemberId: string,
    userDecision: 'confirm' | 'correct' | 'decline',
  ): {
    branch: 'confirmed' | 'declined' | 'idempotent' | 'cap_hit';
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
    if (userDecision === 'decline') {
      // Decline rejects the suggestion only; it needs no live club row, so
      // unmapped candidates decline without promotion.
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

    // Anti-enumeration safeguard: a confirm against a candidate without
    // mapped_club_id (not yet promoted to a real clubs row) must not reach
    // this method; the wizard promotes first. Surface as NotFoundError with
    // identical shape to the "row missing" case.
    if (!candidate.mapped_club_id) {
      throw new NotFoundError(`Legacy affiliation row not confirmable: ${affiliationRowId}`);
    }
    const resolvedClubId = candidate.mapped_club_id;

    // 'confirm' or 'correct': transition status + stamp resolved_club_id +
    // insert member_club_affiliations atomically. The two-current-club cap is
    // checked before the transition so a capped confirm leaves the row pending
    // and actionable rather than silently consuming it.
    let newAffiliationId: string | null = null;
    let capHit = false;
    const now = new Date().toISOString();
    try {
      transaction(() => {
        // Two-current-club cap (max 2 is_current=1 rows per member). At the
        // cap, leave the legacy row pending (no transition, no insert) and
        // surface a cap-hit branch so the member can free a slot and retry.
        const currentCount = (memberClubAffiliations.countCurrentByMemberId.get(actorMemberId) as { c: number }).c;
        if (currentCount >= 2) {
          capHit = true;
          return;
        }

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
        // First current club is primary; second is secondary.
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

        // Revival: a confirmed current affiliation returns an inactive club
        // to 'active' (demote is reversible by interest). Archived clubs
        // revive only via a leadership claim.
        if (newAffiliationId) {
          const club = clubs.findById.get(resolvedClubId) as
            | { club_id: string; status: string }
            | undefined;
          if (club && club.status === 'inactive') {
            clubs.updateStatus.run('active', now, 'onboarding_service', resolvedClubId);
            appendAuditEntry({
              actionType:    'club.revived_by_affiliation',
              category:      'club_lifecycle',
              actorType:     'member',
              actorMemberId,
              entityType:    'club',
              entityId:      resolvedClubId,
              metadata:      { prior_status: 'inactive', affiliation_id: newAffiliationId },
            });
          }
        }

        if (newAffiliationId) {
          // The one-time club-join Active Player grant co-commits with the
          // affiliation in this same transaction (atomic; no post-commit gap).
          applyActivePlayerClubJoinInTx(actorMemberId, actorMemberId, newAffiliationId);
        }
      });
    } catch (err) {
      if (err instanceof ConflictError) throw err;
      throw err;
    }

    if (capHit) {
      return {
        branch:           'cap_hit',
        affiliationRowId,
        resolvedClubId,
        newAffiliationId: null,
      };
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

  // ── Candidate promotion ─────────────────────────────────────────────────────

  /**
   * Promote a legacy club candidate to a live `clubs` row.
   *
   * Idempotent by construction: the club id derives deterministically from
   * the candidate's legacy key, the candidate's `mapped_club_id` records the
   * promotion, and a concurrent promotion of the same candidate loses on the
   * clubs primary key and resolves as `already_promoted` against the winner's
   * row. Junk candidates are never promotable. The candidate's external URL
   * is published only when it passes validation (run before the transaction;
   * a failing or absent URL leaves the column NULL and the original value
   * stays on the candidate row). Imported 'pending' affiliations on the
   * candidate carry forward to 'promoted' with the new club id stamped, and
   * the candidate's wizard activity flags get the new club id stamped so
   * those votes feed the viability gates instead of the candidate-flag
   * cleanup group.
   */
  async promoteCandidate(
    candidateId: string,
    actorId: string,
    opts: {
      actorType: 'member' | 'admin';
      reasonText?: string | null;
      trigger?: 'stage1' | 'admin_queue';
      /**
       * Set when promotion is triggered by a member confirming their own
       * affiliation card: that row stays 'pending' through the bulk
       * 'promoted' carry-forward so the confirm transition that follows
       * records the member's answer.
       */
      excludeAffiliationId?: string;
    },
  ): Promise<{ branch: 'promoted' | 'already_promoted'; clubId: string }> {
    const candidate = legacyClubCandidates.findById.get(candidateId) as
      | LegacyClubCandidateRow | undefined;
    if (!candidate) {
      throw new NotFoundError('Candidate not found.');
    }
    if (candidate.classification === 'junk') {
      throw new ValidationError('Junk candidates cannot be promoted.');
    }
    if (candidate.mapped_club_id) {
      return { branch: 'already_promoted', clubId: candidate.mapped_club_id };
    }

    const clubId = stableClubId(candidate.legacy_club_key);

    // External I/O stays outside the transaction: validate the candidate's
    // URL (DNS, Safe Browsing, reachability) before any write begins.
    let externalUrl: string | null = null;
    if (candidate.external_url) {
      const validated = await validateExternalUrl(candidate.external_url);
      if (validated.valid && validated.normalizedUrl) {
        externalUrl = validated.normalizedUrl;
      }
    }

    const tagNormalized = deriveClubTag(
      candidate.display_name,
      candidate.country ?? '',
      candidate.city ?? '',
      (tag) => mediaTags.findTagByNormalized.get(tag) !== undefined,
    );

    const now = new Date().toISOString();
    const tagId = `tag_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    try {
      transaction(() => {
        mediaTags.insertStandardTag.run(
          tagId, now, 'club_service', now, 'club_service',
          tagNormalized, tagNormalized, 'club',
        );
        clubs.insertClub.run(
          clubId, now, 'club_service', now, 'club_service',
          candidate.display_name, candidate.description ?? '',
          candidate.city ?? '', candidate.region, candidate.country ?? '',
          tagId,
        );
        if (externalUrl) {
          clubContent.updateClubExternalUrl.run(externalUrl, now, now, 'club_service', clubId);
        }
        legacyClubCandidates.setMappedClubId.run(clubId, now, 'club_service', candidateId);
        if (opts.excludeAffiliationId) {
          legacyPersonClubAffiliations.setAllPromotedByCandidateExcept.run(
            clubId, 'club_service', candidateId, opts.excludeAffiliationId,
          );
        } else {
          legacyPersonClubAffiliations.setAllPromotedByCandidate.run(clubId, 'club_service', candidateId);
        }
        // Carry-forward: wizard activity answers left while the candidate
        // had no live clubs row get the new club id stamped, so those votes
        // start feeding the viability gates and stop surfacing on the
        // cleanup queue's candidate-flag group.
        const flagsStamped = clubViabilitySignals.stampClubIdForCandidateFlags
          .run(clubId, candidateId).changes;
        appendAuditEntry({
          actionType: opts.actorType === 'admin'
            ? 'admin.club_cleanup.promote'
            : 'club.promoted_from_candidate',
          category: opts.actorType === 'admin' ? 'admin' : 'club_lifecycle',
          actorType: opts.actorType,
          actorMemberId: actorId,
          entityType: 'club',
          entityId: clubId,
          reasonText: opts.reasonText ?? null,
          metadata: {
            candidate_id: candidateId,
            legacy_club_key: candidate.legacy_club_key,
            tag_normalized: tagNormalized,
            classification: candidate.classification,
            trigger: opts.trigger ?? null,
            viability_flags_stamped: flagsStamped,
          },
        });
      });
    } catch (err) {
      if (isConstraintViolation(err)) {
        // The deterministic id makes a concurrent promotion of the same
        // candidate collide here; the winner's row is the promotion.
        const reread = legacyClubCandidates.findById.get(candidateId) as
          | LegacyClubCandidateRow | undefined;
        if (reread?.mapped_club_id) {
          return { branch: 'already_promoted', clubId: reread.mapped_club_id };
        }
        // The clubs row exists but the candidate was never stamped (a prior
        // out-of-band creation for the same legacy key). Converge by
        // stamping instead of failing.
        const existing = clubs.findById.get(clubId) as { club_id: string } | undefined;
        if (existing) {
          legacyClubCandidates.setMappedClubId.run(clubId, now, 'club_service', candidateId);
          // Converging on an out-of-band clubs row still carries the
          // candidate's wizard flags forward to that club.
          clubViabilitySignals.stampClubIdForCandidateFlags.run(clubId, candidateId);
          return { branch: 'already_promoted', clubId };
        }
      }
      throw err;
    }

    return { branch: 'promoted', clubId };
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
      slug: string;
      /** Set when the creator saw the near-match warning and chose to proceed. */
      confirmNearMatches?: boolean;
    },
  ): CreateClubResult {
    const name = input.name.trim();
    const description = input.description.trim();
    const city = input.city.trim();
    const region = input.region.trim() || null;
    const country = input.country.trim();

    const fieldErrors: Record<string, string> = {};
    if (!name) fieldErrors.name = 'Club name is required.';
    else if (name.length > 150) fieldErrors.name = 'Club name must be 150 characters or fewer.';
    if (!city) fieldErrors.city = 'City is required.';
    if (!country) fieldErrors.country = 'Country is required.';

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

    // A member co-leads at most one club; the creator becomes the new club's
    // first co-leader, so a member who already co-leads elsewhere cannot create.
    const clubNameRow = clubLeaders.leaderClubNameForMember.get(actorMemberId) as { club_name: string } | undefined;
    if (clubNameRow) {
      return { branch: 'already_leader', existingClubName: clubNameRow.club_name };
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

    // Near-match warning: same-country live clubs whose normalized name
    // collides (case/punctuation/spacing variants beyond the NOCASE exact
    // block above) plus unmapped non-junk legacy candidates. The creator
    // may proceed after seeing the list; the acknowledgment is recorded in
    // the club.created audit metadata.
    const nearMatches = findNearMatchClubs(name, country);
    if (nearMatches.length > 0 && !input.confirmNearMatches) {
      return { branch: 'near_matches_found', nearMatches };
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
          tagId,
        );
        clubLeaders.insertClubLeader.run(
          clubLeaderId, now, 'club_service', now, 'club_service',
          clubId, actorMemberId, 'co-leader', now,
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
          metadata: {
            club_name: name,
            tag_normalized: tagNormalized,
            city,
            country,
            // Flags a creation the member confirmed as distinct despite
            // listed near-matches, so an admin can audit the collision.
            near_matches_acknowledged: nearMatches.length > 0
              ? nearMatches.map((m) => m.name)
              : null,
          },
        });
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
        // Rejoin after a leave: UNIQUE(member_id, club_id) keeps one row per
        // pair for life, so the violation here means a deactivated row exists
        // (a CURRENT row was already handled by the already_member branch).
        // Reactivate it; reporting this as cap_reached would wrongly tell a
        // zero-club member they are in two clubs.
        const revived = memberClubAffiliations.reactivate.run(
          isPrimary, now, 'club_service', actorMemberId, clubId,
        );
        if (revived.changes === 1) {
          const row = memberClubAffiliations.findCurrentByMemberAndClub.get(actorMemberId, clubId) as
            | { id: string } | undefined;
          affiliationId = row?.id ?? null;
        } else {
          affiliationId = null;
        }
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

        // Revival: a new current member returns an inactive club to
        // 'active' (demote is reversible by interest). Archived clubs are
        // not joinable at all (guarded above), so revival-by-join applies
        // to inactive only; archived clubs revive only via a leadership
        // claim.
        if (club.status === 'inactive') {
          clubs.updateStatus.run('active', now, 'club_service', clubId);
          appendAuditEntry({
            actionType:    'club.revived_by_affiliation',
            category:      'club_lifecycle',
            actorType:     'member',
            actorMemberId,
            entityType:    'club',
            entityId:      clubId,
            metadata:      { prior_status: 'inactive', affiliation_id: affiliationId },
          });
        }
      }

      if (affiliationId) {
        // The one-time club-join Active Player grant co-commits with the
        // self-join affiliation in this same transaction.
        applyActivePlayerClubJoinInTx(actorMemberId, actorMemberId, affiliationId);
      }
    });

    if (!affiliationId && !existing) {
      return { branch: 'cap_reached', affiliationId: null };
    }

    if (affiliationId) {
      const current = memberClubAffiliations.findCurrentByMemberAndClub.get(actorMemberId, clubId) as
        | { id: string; version: number } | undefined;
      enqueueClubMembershipEmails({
        kind: 'join',
        memberId: actorMemberId,
        clubId,
        clubName: club.name,
        notificationKey: `${affiliationId}:v${current?.version ?? 1}`,
      });
    }

    return {
      branch: isPrimary ? 'joined_primary' : 'joined_secondary',
      affiliationId,
    };
  }

  leaveClub(
    actorMemberId: string,
    clubId: string,
    opts: { confirmed?: boolean } = {},
  ):
    | { branch: 'left'; remainingClubName: string | null }
    | { branch: 'not_member' }
    | { branch: 'needs_coleader_confirmation'; clubName: string } {
    const existing = memberClubAffiliations.findCurrentByMemberAndClub.get(actorMemberId, clubId) as
      | { id: string; is_primary: number; version: number } | undefined;
    if (!existing) {
      return { branch: 'not_member' };
    }

    // A co-leader who leaves also vacates leadership; the last co-leader out
    // leaves the club leaderless, a tolerated state (no sole-leader block).
    const leadership = clubLeaders.memberInClubLeadership.get(clubId, actorMemberId) as
      | { id: string; role: 'co-leader' } | undefined;

    // The only co-leader is warned before leaving: once they go the club has no
    // member-visible contact until someone steps up. Leaving is allowed (a
    // leaderless club is tolerated), but the member confirms first.
    if (leadership && !opts.confirmed) {
      const coLeaderCount = (clubLeaders.countByClubId.get(clubId) as { c: number }).c;
      if (coLeaderCount === 1) {
        const soleClubRow = clubs.findById.get(clubId) as { club_id: string; name: string } | undefined;
        return { branch: 'needs_coleader_confirmation', clubName: soleClubRow?.name ?? 'your club' };
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

    // Leaders are re-read AFTER the transaction, so a leaving co-leader is
    // already off the leadership list and receives only the member email.
    const clubRow = clubs.findById.get(clubId) as { club_id: string; name: string } | undefined;
    enqueueClubMembershipEmails({
      kind: 'leave',
      memberId: actorMemberId,
      clubId,
      clubName: clubRow?.name ?? 'your club',
      notificationKey: `${existing.id}:v${existing.version + 1}`,
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

  /**
   * Content-validation loop: a club leader or co-leader (an authoritative
   * editor) edits description and external URL directly, no approval gate.
   * External URLs pass URL verification before touching the live row; a
   * failed verification changes nothing and surfaces the validator's error.
   */
  async editClubContent(
    actorMemberId: string,
    clubId: string,
    input: { description?: string; externalUrl?: string },
  ): Promise<void> {
    const club = clubContent.findClubContentForEdit.get(clubId) as
      | { id: string; description: string | null; external_url: string | null }
      | undefined;
    if (!club) throw new NotFoundError('Club not found.');
    const leadership = clubLeaders.memberInClubLeadership.get(clubId, actorMemberId) as
      | { id: string }
      | undefined;
    if (!leadership) {
      throw new ValidationError("Only the club's leaders can edit club content directly.");
    }

    const changes: Record<string, { before: unknown; after: unknown }> = {};
    let normalizedUrl: string | null | undefined;
    if (input.externalUrl !== undefined) {
      const trimmed = input.externalUrl.trim();
      if (trimmed === '') {
        normalizedUrl = null;
      } else {
        const validated = await validateExternalUrl(trimmed);
        if (!validated.valid) {
          throw new ValidationError(validated.error ?? 'That URL did not pass verification.');
        }
        normalizedUrl = validated.normalizedUrl;
      }
      changes.external_url = { before: club.external_url, after: normalizedUrl };
    }
    const description = input.description?.trim();
    if (description !== undefined) {
      changes.description = { before: club.description, after: description };
    }
    if (Object.keys(changes).length === 0) {
      throw new ValidationError('Nothing to update.');
    }

    const now = new Date().toISOString();
    transaction(() => {
      if (description !== undefined) {
        clubContent.updateClubDescription.run(description, now, actorMemberId, clubId);
      }
      if (normalizedUrl !== undefined) {
        clubContent.updateClubExternalUrl.run(
          normalizedUrl, normalizedUrl ? now : null, now, actorMemberId, clubId,
        );
      }
      appendAuditEntry({
        actionType:    'club.content_edited',
        category:      'club',
        actorType:     'member',
        actorMemberId,
        entityType:    'club',
        entityId:      clubId,
        reasonText:    null,
        metadata:      { changes },
      });
    });
  }

  /**
   * A current member with Tier 1 benefits self-adds as a co-leader. Immediate,
   * no approval step. This single write backs the standing club-page volunteer
   * affordance.
   *
   * Eligibility (all required): the actor is a current confirmed member of the
   * club; has Tier 1 benefits (Tier 1+ OR Active Player); does not already
   * co-lead another club (a member co-leads at most one); the club is under the
   * 5-co-leader cap; and the actor does not already co-lead this club.
   *
   * On a self-add to a club that already has co-leaders, the existing
   * co-leaders are notified. A member stepping up is a positive viability
   * signal: an inactive club returns to 'active' in the same transaction. The
   * add is audit-logged.
   */
  volunteerToCoLeadClub(
    actorMemberId: string,
    clubId: string,
  ): VolunteerResult {
    const club = clubs.findById.get(clubId) as
      | { club_id: string; name: string; status: string } | undefined;
    if (!club || club.status === 'archived') {
      return { branch: 'club_not_found' };
    }

    const affiliation = memberClubAffiliations.findCurrentByMemberAndClub.get(actorMemberId, clubId) as
      | { id: string } | undefined;
    if (!affiliation) {
      return { branch: 'not_member' };
    }

    const here = clubLeaders.memberInClubLeadership.get(clubId, actorMemberId) as
      | { id: string } | undefined;
    if (here) {
      return { branch: 'already_coleader' };
    }

    // Tier 1 benefits = Tier 1+ OR an active Active-Player period.
    const tier = getTierStatus(actorMemberId);
    const ap = getActivePlayerStatus(actorMemberId);
    const hasTier1Benefits = (tier != null && tier.tier_status !== 'tier0') || ap.is_active_player === 1;
    if (!hasTier1Benefits) {
      return { branch: 'not_eligible' };
    }

    const coLeadsElsewhere = clubLeaders.memberCoLeadsAnyClub.get(actorMemberId) as
      | { x: number } | undefined;
    if (coLeadsElsewhere) {
      return { branch: 'coleads_other_club' };
    }

    const existingCount = (clubLeaders.countByClubId.get(clubId) as { c: number }).c;
    if (existingCount >= 5) {
      return { branch: 'cap_reached' };
    }

    const now = new Date().toISOString();
    const clubLeaderId = `cl_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    try {
      transaction(() => {
        clubLeaders.insertClubLeader.run(
          clubLeaderId, now, 'club_service', now, 'club_service',
          clubId, actorMemberId, 'co-leader', now,
        );
        appendAuditEntry({
          actionType: 'club.coleader_volunteered',
          category:   'club_leadership',
          actorType:  'member',
          actorMemberId,
          entityType: 'club_leader',
          entityId:   clubLeaderId,
          metadata:   { club_id: clubId, club_name: club.name },
        });
        // A member stepping up to co-lead is a positive viability signal; an
        // inactive club returns to 'active' in the same transaction.
        if (club.status === 'inactive') {
          clubs.updateStatus.run('active', now, 'club_service', clubId);
          appendAuditEntry({
            actionType: 'club.revived_by_leadership_claim',
            category:   'club_lifecycle',
            actorType:  'member',
            actorMemberId,
            entityType: 'club',
            entityId:   clubId,
            metadata:   { prior_status: 'inactive', club_leader_id: clubLeaderId },
          });
        }
      });
    } catch (err) {
      // A member co-leads at most one club (ux_one_club_leader_per_member); a
      // co-lead grabbed elsewhere between the pre-check and the insert lands here.
      if (isUniqueViolation(err)) {
        return { branch: 'coleads_other_club' };
      }
      throw err;
    }

    // Existing co-leaders are notified only when the club already had some.
    if (existingCount > 0) {
      enqueueVolunteerLeadershipEmails({
        memberId: actorMemberId,
        clubId,
        clubName: club.name,
        clubLeaderId,
      });
    }

    return { branch: 'volunteered', clubLeaderId };
  }

  /**
   * A co-leader invites a member to co-lead. The invite is an email, not a
   * stored handshake: no pending row is written. The member accepts by logging
   * in and using the standing volunteer affordance (volunteerToCoLeadClub),
   * which is itself the consent and the one-club-cap enforcement point. The
   * email carries no link (anti-phishing); it gives precise log-in-and-navigate
   * instructions. The send is audit-logged.
   */
  inviteToCoLeadClub(
    actorMemberId: string,
    clubId: string,
    inviteeKey: string,
  ): { branch: 'sent' | 'not_leader' | 'member_not_found' | 'not_member' | 'already_coleader' | 'no_email' } {
    const leadership = clubLeaders.memberInClubLeadership.get(clubId, actorMemberId) as
      | { id: string } | undefined;
    if (!leadership) {
      return { branch: 'not_leader' };
    }

    const key = inviteeKey.trim();
    const invitee = clubLeaders.findMemberByKeyForAdmin.get(key, key) as
      | { id: string; display_name: string; slug: string } | undefined;
    if (!invitee) {
      return { branch: 'member_not_found' };
    }

    // The invitee must already be a current member of the club; a non-member
    // joins first. Mirrors the membership gate on the volunteer path.
    const inviteeAffiliation = memberClubAffiliations.findCurrentByMemberAndClub.get(invitee.id, clubId) as
      | { id: string } | undefined;
    if (!inviteeAffiliation) {
      return { branch: 'not_member' };
    }

    const already = clubLeaders.memberInClubLeadership.get(clubId, invitee.id) as
      | { id: string } | undefined;
    if (already) {
      return { branch: 'already_coleader' };
    }

    const club = clubs.findById.get(clubId) as { club_id: string; name: string } | undefined;
    if (!club) {
      return { branch: 'not_leader' };
    }

    const contact = account.findContactInfoById.get(invitee.id) as
      | { login_email: string | null } | undefined;
    if (!contact?.login_email) {
      return { branch: 'no_email' };
    }

    try {
      emailService.send({
        template: 'club_coleader_invite',
        params: {
          inviteeName: invitee.display_name,
          clubName: club.name,
        },
        recipientEmail: contact.login_email,
        recipientMemberId: invitee.id,
        idempotencyKey: `club-coleader-invite:${clubId}:${invitee.id}`,
      });
    } catch (err) {
      logger.warn('club co-leader invite enqueue failed', {
        clubId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    appendAuditEntry({
      actionType: 'club.coleader_invited',
      category:   'club_leadership',
      actorType:  'member',
      actorMemberId,
      entityType: 'member',
      entityId:   invitee.id,
      metadata:   { club_id: clubId, club_name: club.name, invitee_member_id: invitee.id },
    });

    return { branch: 'sent' };
  }

  /**
   * A co-leader steps down: their own `club_leaders` row is removed while their
   * club affiliation is preserved (they remain a member). A co-leader acts only
   * on themselves; the last co-leader stepping down leaves the club leaderless,
   * a tolerated state. Removing another co-leader is admin-only.
   */
  stepDownFromLeader(
    actorMemberId: string,
    clubId: string,
  ): {
    branch: 'stepped_down' | 'not_leader';
  } {
    const leadership = clubLeaders.memberInClubLeadership.get(clubId, actorMemberId) as
      | { id: string; role: 'co-leader' } | undefined;
    if (!leadership) {
      return { branch: 'not_leader' };
    }

    transaction(() => {
      clubLeaders.removeByMemberAndClub.run(actorMemberId, clubId);

      appendAuditEntry({
        actionType: 'club.coleader_stepped_down',
        category: 'club_leadership',
        actorType: 'member',
        actorMemberId,
        entityType: 'club_leader',
        entityId: leadership.id,
        metadata: { club_id: clubId },
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

  reactivateClub(
    actorMemberId: string,
    clubId: string,
  ): {
    branch: 'reactivated' | 'already_active' | 'not_leader';
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
    if (club.status === 'active') {
      return { branch: 'already_active' };
    }

    const now = new Date().toISOString();
    transaction(() => {
      clubs.updateStatus.run('active', now, 'club_service', clubId);

      appendAuditEntry({
        actionType: 'club.reactivated',
        category: 'club_lifecycle',
        actorType: 'member',
        actorMemberId,
        entityType: 'club',
        entityId: clubId,
        metadata: { club_name: club.name, old_status: club.status },
      });
    });

    return { branch: 'reactivated' };
  }

  updateClubHashtag(
    clubId: string,
    newSlug: string,
    actorMemberId: string,
  ):
    | { branch: 'updated'; newClubKey: string }
    | { branch: 'not_leader' }
    | { branch: 'tag_conflict' }
    | { branch: 'invalid_format' } {
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

    // The hashtag IS the public URL key, so the old /clubs/:key slug is dead
    // after this write; callers must redirect to the new key.
    return { branch: 'updated', newClubKey: `club_${normalized}` };
  }
}

export const clubService = new ClubService();
