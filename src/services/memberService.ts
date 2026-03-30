import { account, slugRedirects, MemberProfileRow, MemberResultRow } from '../db/db';
import { generateUniqueSlug, slugify } from './identityAccessService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { runSqliteRead } from './sqliteRetry';
import { getPhotoStorage } from '../adapters/photoStorageInstance';
import { PageViewModel } from '../types/page';
import { groupPlayerResults, buildPlayerSummaryFacts } from './playerShaping';
import type { PlayerEventGroup, PlayerHeroData } from '../types/playerProfile';

const MAX_DISPLAY_NAME = 64;
const MAX_BIO = 1000;
const VALID_EMAIL_VISIBILITY = new Set(['private', 'members', 'public']);

export interface OwnProfileContent {
  displayName: string;
  bio: string;
  city: string | null;
  region: string | null;
  country: string | null;
  phone: string | null;
  emailVisibility: string;
  isAdmin: boolean;
  isHof: boolean;
  isBap: boolean;
  hasLegacyLink: boolean;
  historicalPersonName: string | null;
  firstCompetitionYear: number | null;
  showCompetitiveResults: boolean;
  heroData: PlayerHeroData;
  profileBase?: string;
  avatarThumbUrl: string | null;
  eventGroups?: PlayerEventGroup[];
}

export interface ProfileEditContent extends OwnProfileContent {
  memberKey: string;
  error?: string;
}

export interface PublicProfileContent {
  displayName: string;
  city: string | null;
  country: string | null;
  bio: string;
  avatarThumbUrl: string | null;
  hofMember: boolean;
  bapMember: boolean;
  historicalPersonName: string | null;
  firstCompetitionYear: number | null;
  showCompetitiveResults: boolean;
  heroData: PlayerHeroData;
  eventGroups: PlayerEventGroup[];
}

export interface ProfileEditInput {
  displayName: string;
  bio: string;
  city: string;
  region: string;
  country: string;
  phone: string;
  emailVisibility: string;
  firstCompetitionYear: string;
  showCompetitiveResults: string | string[];
}

function normalizeText(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

function resolveHistoricalName(row: MemberProfileRow): string | null {
  return row.historical_person_name &&
    row.historical_person_name.toLowerCase() !== row.display_name.toLowerCase()
    ? row.historical_person_name
    : null;
}

function buildMemberHeroData(row: MemberProfileRow, eventGroups: PlayerEventGroup[]): PlayerHeroData {
  const placementCount = eventGroups.reduce((sum, g) => sum + g.results.length, 0);
  return {
    displayName:          row.display_name,
    honorificNickname:    row.historical_bap_nickname ?? undefined,
    isHof:                Boolean(row.is_hof),
    isBap:                Boolean(row.is_bap),
    hofInductionYear:     row.historical_hof_induction_year ?? undefined,
    bapInductionYear:     row.historical_bap_induction_year ?? undefined,
    historicalPersonName: resolveHistoricalName(row),
    city:                 row.city,
    region:               row.region,
    country:              row.country,
    summaryFacts:         buildPlayerSummaryFacts({
      eventCount:     eventGroups.length,
      placementCount,
      isHof:          Boolean(row.is_hof),
      isBap:          Boolean(row.is_bap),
      hofYear:        row.historical_hof_induction_year,
      bapYear:        row.historical_bap_induction_year,
    }),
    isHistoricalOnly: false,
  };
}

function rowToContent(row: MemberProfileRow): OwnProfileContent {
  const storage = getPhotoStorage();
  return {
    displayName:     row.display_name,
    bio:             row.bio,
    city:            row.city,
    region:          row.region,
    country:         row.country,
    phone:           row.phone,
    emailVisibility: row.email_visibility,
    isAdmin:         Boolean(row.is_admin),
    isHof:           Boolean(row.is_hof),
    isBap:           Boolean(row.is_bap),
    hasLegacyLink:   row.legacy_member_id !== null,
    firstCompetitionYear: row.first_competition_year ?? row.historical_first_year ?? null,
    showCompetitiveResults: row.show_competitive_results !== 0,
    historicalPersonName: resolveHistoricalName(row),
    heroData:        { displayName: '', isHof: false, isBap: false, summaryFacts: [], isHistoricalOnly: false },
    avatarThumbUrl:  row.avatar_thumb_key ? storage.constructURL(row.avatar_thumb_key) : null,
  };
}

function fetchEventGroups(row: MemberProfileRow): PlayerEventGroup[] {
  // Try direct member_id link first, then legacy_member_id chain.
  let resultRows = runSqliteRead('listResultsByMemberId', () =>
    account.listResultsByMemberId.all(row.id),
  ) as MemberResultRow[];

  if (resultRows.length === 0 && row.legacy_member_id) {
    resultRows = runSqliteRead('listResultsByLegacyMemberId', () =>
      account.listResultsByLegacyMemberId.all(row.legacy_member_id),
    ) as MemberResultRow[];
  }

  return groupPlayerResults(resultRows, { selfMemberId: row.id });
}

function fetchMemberBySlug(slug: string): MemberProfileRow {
  const row = runSqliteRead('getOwnProfile', () =>
    account.findMemberBySlug.get(slug),
  ) as MemberProfileRow | undefined;
  if (!row) throw new NotFoundError(`Member not found: ${slug}`);
  return row;
}

export const memberService = {
  getOwnProfile(slug: string): PageViewModel<OwnProfileContent> {
    const row = fetchMemberBySlug(slug);
    const eventGroups = fetchEventGroups(row);
    const heroData = buildMemberHeroData(row, eventGroups);
    return {
      seo:  { title: 'My Profile' },
      page: { sectionKey: 'members', pageKey: 'member_profile', title: 'My Profile' },
      navigation: {
        contextLinks: [{ label: 'Edit Profile', href: `/members/${slug}/edit`, variant: 'outline' }],
      },
      content: { ...rowToContent(row), heroData, profileBase: `/members/${slug}`, eventGroups },
    };
  },

  /**
   * Public read-only profile for HoF/BAP members. No PII, no edit links.
   * Returns null if the member is not HoF/BAP (caller should 404 or require auth).
   */
  getPublicProfile(slug: string): PageViewModel<PublicProfileContent> | null {
    const row = fetchMemberBySlug(slug);
    const isHof = Boolean(row.is_hof);
    const isBap = Boolean(row.is_bap);
    if (!isHof && !isBap) return null;

    const storage = getPhotoStorage();
    const eventGroups = row.show_competitive_results !== 0 ? fetchEventGroups(row) : [];
    const heroData = buildMemberHeroData(row, eventGroups);

    return {
      seo:  { title: row.display_name },
      page: { sectionKey: 'members', pageKey: 'member_public_profile', title: row.display_name },
      navigation: { contextLinks: [] },
      content: {
        displayName:    row.display_name,
        city:           row.city,
        country:        row.country,
        bio:            row.bio,
        avatarThumbUrl: row.avatar_thumb_key ? storage.constructURL(row.avatar_thumb_key) : null,
        hofMember:      isHof,
        bapMember:      isBap,
        historicalPersonName: resolveHistoricalName(row),
        firstCompetitionYear: row.first_competition_year ?? row.historical_first_year ?? null,
        showCompetitiveResults: row.show_competitive_results !== 0,
        heroData,
        eventGroups,
      },
    };
  },

  getProfileEditPage(slug: string, error?: string): PageViewModel<ProfileEditContent> {
    const row = fetchMemberBySlug(slug);
    return {
      seo:  { title: 'Edit Profile' },
      page: { sectionKey: 'members', pageKey: 'member_profile_edit', title: 'Edit Profile' },
      navigation: {
        contextLinks: [{ label: 'Back to Profile', href: `/members/${slug}` }],
      },
      content: { ...rowToContent(row), memberKey: slug, error },
    };
  },

  updateOwnProfile(slug: string, input: ProfileEditInput): { newSlug: string } {
    const row = fetchMemberBySlug(slug);
    const displayName = normalizeText(input.displayName);
    const bio         = normalizeText(input.bio);
    const city        = normalizeText(input.city) || null;
    const region      = normalizeText(input.region) || null;
    const country     = normalizeText(input.country) || null;
    const phone       = normalizeText(input.phone) || null;
    const emailVis    = VALID_EMAIL_VISIBILITY.has(input.emailVisibility)
      ? input.emailVisibility
      : 'private';
    const rawYear = normalizeText(input.firstCompetitionYear);
    const firstCompYear = rawYear ? parseInt(rawYear, 10) : null;
    const validYear = firstCompYear && firstCompYear >= 1972 && firstCompYear <= new Date().getFullYear()
      ? firstCompYear : null;
    const rawShow = Array.isArray(input.showCompetitiveResults)
      ? input.showCompetitiveResults[input.showCompetitiveResults.length - 1]
      : input.showCompetitiveResults;
    const showResults = rawShow === '0' ? 0 : 1;

    if (!displayName) {
      throw new ValidationError('Display name is required.');
    }
    if (displayName.length > MAX_DISPLAY_NAME) {
      throw new ValidationError(`Display name must be ${MAX_DISPLAY_NAME} characters or fewer.`);
    }
    if (bio.length > MAX_BIO) {
      throw new ValidationError(`Bio must be ${MAX_BIO} characters or fewer.`);
    }

    const now = new Date().toISOString();
    account.updateMemberProfile.run(
      displayName,
      displayName.toLowerCase(),
      bio,
      city,
      region,
      country,
      phone,
      emailVis,
      validYear,
      showResults,
      now,
      row.id,
    );

    // Regenerate slug if display name changed and would produce a different slug.
    let newSlug = slug;
    const candidateBase = slugify(displayName);
    const currentBase = row.slug ? slugify(row.display_name) : null;
    if (candidateBase && currentBase && candidateBase !== currentBase) {
      newSlug = generateUniqueSlug(displayName);
      // Delete any redirect that would collide with the new slug.
      slugRedirects.deleteBySlug.run(newSlug);
      // Store the old slug as a redirect.
      if (row.slug) {
        slugRedirects.insert.run(row.slug, row.id, now);
      }
      // Update the member's slug.
      account.updateMemberSlug.run(newSlug, now, row.id);
    }

    return { newSlug };
  },
};
