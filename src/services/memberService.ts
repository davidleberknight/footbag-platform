import { account, MemberProfileRow, MemberResultRow } from '../db/db';
import { NotFoundError, ValidationError } from './serviceErrors';
import { runSqliteRead } from './sqliteRetry';
import { getPhotoStorage } from '../adapters/photoStorageInstance';
import { PageViewModel } from '../types/page';
import { groupPlayerResults } from './playerShaping';
import type { PlayerEventGroup, PlayerHeroData } from '../types/playerProfile';

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
  heroData?: PlayerHeroData;
  profileBase?: string;
  avatarThumbUrl: string | null;
  eventGroups?: PlayerEventGroup[];
}

export interface ProfileEditContent extends OwnProfileContent {
  memberKey: string;
  loginEmail: string;
  profileUrl: string;
  error?: string;
  avatarError?: string;
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

function buildMemberHeroData(row: MemberProfileRow): PlayerHeroData {
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
    const heroData = buildMemberHeroData(row);
    return {
      seo:  { title: row.display_name, fullTitle: `IFPA Member ${row.display_name}` },
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
    const heroData = buildMemberHeroData(row);

    return {
      seo:  { title: row.display_name, fullTitle: `IFPA Member ${row.display_name}` },
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

  getProfileEditPage(slug: string, error?: string, avatarError?: string): PageViewModel<ProfileEditContent> {
    const row = fetchMemberBySlug(slug);
    return {
      seo:  { title: 'Edit Profile' },
      page: { sectionKey: 'members', pageKey: 'member_profile_edit', title: 'Edit Profile' },
      navigation: {
        contextLinks: [{ label: 'Back to Profile', href: `/members/${slug}` }],
      },
      content: {
        ...rowToContent(row),
        memberKey: slug,
        loginEmail: row.login_email,
        profileUrl: `/members/${slug}`,
        error,
        avatarError,
      },
    };
  },

  updateOwnProfile(slug: string, input: ProfileEditInput): void {
    const row = fetchMemberBySlug(slug);
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

    if (bio.length > MAX_BIO) {
      throw new ValidationError(`Bio must be ${MAX_BIO} characters or fewer.`);
    }

    const now = new Date().toISOString();
    account.updateMemberProfile.run(
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
  },
};
