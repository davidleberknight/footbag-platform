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
): PublicClubDetail {
  const summary = toPublicClubSummary(row, vitality);
  return {
    ...summary,
    leaders,
    description: row.description,
    countrySlug: slugifyCountry(row.country),
    members,
  };
}

// ── Clubs index ────────────────────────────────────────────────────────────────

export interface CountrySummary {
  country: string;
  countryCode: string;
  countrySlug: string;
  countryHref: string;
  total: number;
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

      const countries: CountrySummary[] = [...countryTotals.entries()].map(([country, total]) => ({
        country,
        countryCode: countryCode(country),
        countrySlug: slugifyCountry(country),
        countryHref: `/clubs/${slugifyCountry(country)}`,
        total,
      }));

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
            countries.map(({ countryCode: code, countrySlug: slug, country: name, total }) =>
              ({ code, slug, name, total }),
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

      // Bulk-fetch all bootstrap leaders once; group by club_id for O(1)
      // per-club lookup. Single round trip — no N+1.
      const leaderRows = clubs.listAllBootstrapLeaders.all() as BootstrapLeaderRowWithClubId[];
      const leadersByClubId = new Map<string, BootstrapLeaderRowWithClubId[]>();
      for (const lr of leaderRows) {
        if (!leadersByClubId.has(lr.club_id)) leadersByClubId.set(lr.club_id, []);
        leadersByClubId.get(lr.club_id)!.push(lr);
      }

      // Bulk-fetch member counts once; same per-club Map pattern.
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

      const members: ClubMemberSummary[] = isAuthenticated
        ? (clubs.listMembersByClubId.all(row.club_id) as PublicClubMemberRow[]).map((m) => ({
            personId: m.person_id,
            name: m.person_name,
          }))
        : [];
      // Leaders are public per V_Browse_Clubs / M_View_Club: provisional
      // leader names render to visitors and members alike. Contact-email
      // exposure is gated separately via ClubLeader.showContact.
      const leaderRows = clubs.listBootstrapLeadersByClubId.all(row.club_id) as BootstrapLeaderRow[];
      const leaders: ClubLeader[] = leaderRows.map(toClubLeader);

      // Vitality signals: counts mirror the auth-gated members list scope
      // so the snapshot agrees with the visible roster. Run the bulk
      // member-count query once, look up this one club_id from the result.
      const memberCountRows = clubs.listMemberCountsForAllClubs.all() as MemberCountRow[];
      const memberCount = memberCountRows.find((r) => r.club_id === row.club_id)?.member_count ?? 0;
      const vitality = computeVitality(row, leaderRows.length, memberCount);

      const club = toPublicClubDetail(row, vitality, members, leaders);

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
