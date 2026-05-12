import { account, publicPlayers, MemberProfileRow, MemberResultRow, MemberSearchRow, HistoricalPersonSearchRow, IdentityLinksRow } from '../db/db';
import { NotFoundError, ValidationError } from './serviceErrors';
import { runSqliteRead } from './sqliteRetry';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { PageViewModel } from '../types/page';
import { groupPlayerResults } from './playerShaping';
import type { PlayerEventGroup, PlayerHeroData } from '../types/playerProfile';
import { getTierStatus, type MemberTier, type UnderlyingTier } from './membershipTieringService';
import { getStatus as getActivePlayerStatus } from './activePlayerService';
import { formatDateDisplay } from './dateFormat';

const MAX_BIO = 1000;
const SEARCH_LIMIT = 20;

export interface MemberSearchEntry {
  displayName: string;
  country: string | null;
  href: string;
  isHof: boolean;
  isBap: boolean;
  isBoard: boolean;
  isHistorical: boolean;
}

export interface MemberSearchResult {
  query: string;
  results: MemberSearchEntry[];
  hasMore: boolean;
  tooShort: boolean;
}

export interface ActivePlayerView {
  isCurrent: boolean;
  expiresAtDisplay: string | null;
}

export interface TierStatusView {
  tierBadgeText: string;
  benefitsBlurb: string;
  /** Tier 0 only; null for Tier 1+ since AP is irrelevant there. */
  activePlayer: ActivePlayerView | null;
  /** Tier 3 only; null otherwise. */
  underlyingTierBadgeText: string | null;
  showTier1Upgrade: boolean;
  showTier2Upgrade: boolean;
}

export interface QuickAction {
  label: string;
  href: string;
}

export interface ComingSoonFeature {
  label: string;
  description: string;
}

export interface IdentityLinkView {
  legacyAccount: {
    linked: boolean;
    sinceDisplay: string | null;
  };
  historicalPerson: {
    linked: boolean;
    summary: string | null;
  };
  cta: {
    href: string;
    label: string;
  } | null;
}

export interface MemberWelcomeTier {
  label: string;
  blurb: string;
}

export interface MemberWelcomeContent {
  /** Sign Up + Log In cards render only for unauthenticated visitors. */
  showJoinCtas: boolean;
  /** Tier 0 → 3 in canonical order, with display labels and benefit blurbs. */
  tiers: ReadonlyArray<MemberWelcomeTier>;
}
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
  hasHistoricalLink: boolean;
  historicalPersonName: string | null;
  historicalPersonHref: string | null;
  firstCompetitionYear: number | null;
  showCompetitiveResults: boolean;
  heroData?: PlayerHeroData;
  profileBase?: string;
  avatarThumbUrl: string | null;
  eventGroups?: PlayerEventGroup[];
  /** Personal-home dashboard composition. Profile absorbs the dashboard. */
  membership?: TierStatusView;
  identity?: IdentityLinkView;
  quickActions?: QuickAction[];
  search?: SearchBlockView;
  comingSoon?: ComingSoonFeature[];
  memberSlug?: string;
}

/** Wraps MemberSearchResult with the form action so the partial can render
 *  the search form unconditionally (form always present, results conditional). */
export interface SearchBlockView {
  formAction: string;
  query: string;
  results: ReadonlyArray<MemberSearchEntry>;
  hasMore: boolean;
  tooShort: boolean;
  /** True when a search was performed (query was non-empty). */
  hasQuery: boolean;
}

export interface ProfileEditContent extends OwnProfileContent {
  memberKey: string;
  loginEmail: string;
  profileUrl: string;
  legacyClaimCtaHref:  string | null;
  legacyClaimCtaLabel: string | null;
  error?: string;
  avatarError?: string;
  avatarSuccess?: string;
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

/**
 * Build an avatar URL with a cache-bust version tied to the media item id.
 * The media_id is a fresh UUID on every upload (see avatarService.uploadAvatar),
 * so downstream caches (browser, CloudFront) invalidate immediately after upload
 * while keeping the URL stable between uploads.
 */
function buildAvatarUrl(thumbKey: string | null, mediaId: string | null): string | null {
  if (!thumbKey) return null;
  const base = getMediaStorageAdapter().constructURL(thumbKey);
  return mediaId ? `${base}?v=${encodeURIComponent(mediaId)}` : base;
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
    hasLegacyLink:      row.legacy_member_id !== null,
    hasHistoricalLink:  row.historical_person_id !== null,
    historicalPersonName: row.historical_person_name ?? null,
    historicalPersonHref: row.historical_person_id
      ? `/history/${encodeURIComponent(row.historical_person_id)}`
      : null,
    firstCompetitionYear: row.first_competition_year ?? row.historical_first_year ?? null,
    showCompetitiveResults: row.show_competitive_results !== 0,
    avatarThumbUrl:  buildAvatarUrl(row.avatar_thumb_key, row.avatar_media_id),
  };
}

function fetchEventGroups(row: MemberProfileRow): PlayerEventGroup[] {
  // Try direct member_id link first, then legacy_member_id chain.
  let resultRows = runSqliteRead('listResultsByMemberId', () =>
    account.listResultsByMemberId.all(row.id),
  ) as MemberResultRow[];

  let selfPersonId: string | null = null;
  if (resultRows.length === 0 && row.legacy_member_id) {
    resultRows = runSqliteRead('listResultsByLegacyMemberId', () =>
      account.listResultsByLegacyMemberId.all(row.legacy_member_id),
    ) as MemberResultRow[];
    // Look up the linked historical person by legacy_member_id for self-filtering.
    const linked = runSqliteRead('findLinkedPersonByLegacyId', () =>
      publicPlayers.findLinkedPersonByLegacyId.get(row.legacy_member_id),
    ) as { person_id: string } | undefined;
    selfPersonId = linked?.person_id ?? null;
  }

  return groupPlayerResults(resultRows, { selfMemberId: row.id, selfPersonId });
}

function fetchMemberBySlug(slug: string): MemberProfileRow {
  const row = runSqliteRead('getOwnProfile', () =>
    account.findMemberBySlug.get(slug),
  ) as MemberProfileRow | undefined;
  if (!row) throw new NotFoundError(`Member not found: ${slug}`);
  return row;
}

export const memberService = {
  getOwnProfile(
    slug: string,
    opts?: { query?: string },
  ): PageViewModel<OwnProfileContent> {
    const row = fetchMemberBySlug(slug);
    const eventGroups = fetchEventGroups(row);
    const heroData = buildMemberHeroData(row);
    const query = opts?.query;
    const searchResult =
      query !== undefined && query !== ''
        ? this.searchMembers(query)
        : null;
    const search: SearchBlockView = {
      formAction: `/members/${slug}`,
      query: searchResult?.query ?? '',
      results: searchResult?.results ?? [],
      hasMore: searchResult?.hasMore ?? false,
      tooShort: searchResult?.tooShort ?? false,
      hasQuery: searchResult !== null,
    };
    return {
      seo:  { title: row.display_name, fullTitle: `IFPA Member ${row.display_name}` },
      page: { sectionKey: 'members', pageKey: 'member_profile', title: 'My Profile' },
      navigation: {
        contextLinks: [{ label: 'Edit Profile', href: `/members/${slug}/edit`, variant: 'outline' }],
      },
      content: {
        ...rowToContent(row),
        heroData,
        profileBase: `/members/${slug}`,
        eventGroups,
        membership:   buildTierStatusView(row.id),
        identity:     buildIdentityLinkView(row.id, slug),
        quickActions: buildQuickActions(slug),
        search,
        comingSoon:   COMING_SOON_FEATURES,
        memberSlug:   slug,
      },
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
        avatarThumbUrl: buildAvatarUrl(row.avatar_thumb_key, row.avatar_media_id),
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

  getProfileEditPage(
    slug: string,
    error?: string,
    avatarError?: string,
    avatarSuccess?: string,
  ): PageViewModel<ProfileEditContent> {
    const row = fetchMemberBySlug(slug);
    const cta = buildIdentityCta(row.legacy_member_id !== null, row.historical_person_id !== null, slug);
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
        legacyClaimCtaHref:  cta?.href  ?? null,
        legacyClaimCtaLabel: cta?.label ?? null,
        error,
        avatarError,
        avatarSuccess,
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

  searchMembers(query: string): MemberSearchResult {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return { query: trimmed, results: [], hasMore: false, tooShort: trimmed.length > 0 };
    }
    const escaped = trimmed.toLowerCase()
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');

    // Search current members
    const memberRows = runSqliteRead('searchMembers', () =>
      account.searchMembers.all(escaped, SEARCH_LIMIT + 1),
    ) as MemberSearchRow[];

    // Search historical persons
    const historicalRows = runSqliteRead('searchHistoricalPersons', () =>
      publicPlayers.searchByName.all(escaped, SEARCH_LIMIT + 1),
    ) as HistoricalPersonSearchRow[];

    // Merge: members first, then historical persons (deduped by linked slug)
    const seen = new Set<string>();
    const merged: MemberSearchEntry[] = [];

    for (const r of memberRows) {
      if (merged.length >= SEARCH_LIMIT + 1) break;
      seen.add(r.slug);
      merged.push({
        displayName: r.display_name,
        country: r.country,
        href: `/members/${r.slug}`,
        isHof: Boolean(r.is_hof),
        isBap: Boolean(r.is_bap),
        isBoard: Boolean(r.is_board),
        isHistorical: false,
      });
    }

    for (const r of historicalRows) {
      if (merged.length >= SEARCH_LIMIT + 1) break;
      if (r.linked_member_slug && seen.has(r.linked_member_slug)) continue;
      if (r.linked_member_slug) seen.add(r.linked_member_slug);
      const isClaimed = Boolean(r.linked_member_slug);
      merged.push({
        displayName: r.person_name,
        country: r.country,
        href: isClaimed ? `/members/${r.linked_member_slug}` : `/history/${r.person_id}`,
        isHof: Boolean(r.hof_member),
        isBap: Boolean(r.bap_member),
        isBoard: false,
        isHistorical: !isClaimed,
      });
    }

    const hasMore = merged.length > SEARCH_LIMIT;
    const results = hasMore ? merged.slice(0, SEARCH_LIMIT) : merged;
    return { query: trimmed, results, hasMore, tooShort: false };
  },

  getMembersWelcomePage(
    opts: { isAuthenticated: boolean },
  ): PageViewModel<MemberWelcomeContent> {
    const tiers: MemberWelcomeTier[] = (['tier0', 'tier1', 'tier2', 'tier3'] as const).map(
      (t) => ({ label: TIER_BADGE_TEXT[t], blurb: tierBenefitsBlurb(t, false) }),
    );
    return {
      seo:  { title: 'Members' },
      page: { sectionKey: 'members', pageKey: 'member_welcome', title: 'Members' },
      navigation: { contextLinks: [] },
      content: {
        showJoinCtas: !opts.isAuthenticated,
        tiers,
      },
    };
  },

};

// ── Membership view-model helpers ───────────────────────────────────────────
//
// Implements `M_View_Tier_Status` shaping for the member dashboard. Pure
// composition over `getTierStatus` + `getActivePlayerStatus`; no new SQL.

const TIER_BADGE_TEXT: Record<MemberTier, string> = {
  tier0: 'Tier 0 Registered Member',
  tier1: 'Tier 1 IFPA Member',
  tier2: 'Tier 2 IFPA Organizer Member',
  tier3: 'Tier 3 IFPA Director',
};

function tierBenefitsBlurb(tier: MemberTier, isAp: boolean): string {
  if (tier === 'tier0' && isAp) {
    return 'You enjoy Tier 1 benefits while Active Player status is current, including Official IFPA Roster inclusion.';
  }
  switch (tier) {
    case 'tier0':
      return 'Registered Members can browse the platform and search the membership. Tier 1 members are listed on the Official IFPA Roster.';
    case 'tier1':
      return 'Tier 1 IFPA Members support the IFPA and are listed on the Official IFPA Roster.';
    case 'tier2':
      return 'Tier 2 IFPA Organizer Members can vouch for Active Player status and participate in IFPA governance.';
    case 'tier3':
      return 'IFPA Directors hold full IFPA governance authority.';
  }
}

function formatExpiryDate(iso: string): string {
  return formatDateDisplay(iso);
}

function underlyingTierText(underlying: UnderlyingTier): string {
  return `Reverts to ${TIER_BADGE_TEXT[underlying]} when governance ends.`;
}

function buildTierStatusView(memberId: string): TierStatusView {
  const tier = getTierStatus(memberId);
  const ap = getActivePlayerStatus(memberId);
  const isAp = ap.is_active_player === 1;

  let activePlayer: ActivePlayerView | null = null;
  if (tier.tier_status === 'tier0') {
    activePlayer = {
      isCurrent: isAp,
      expiresAtDisplay: ap.active_player_expires_at
        ? formatExpiryDate(ap.active_player_expires_at)
        : null,
    };
  }

  let underlyingTierBadgeText: string | null = null;
  if (tier.tier_status === 'tier3' && tier.underlying_tier_status) {
    underlyingTierBadgeText = underlyingTierText(tier.underlying_tier_status);
  }

  return {
    tierBadgeText: TIER_BADGE_TEXT[tier.tier_status],
    benefitsBlurb: tierBenefitsBlurb(tier.tier_status, isAp),
    activePlayer,
    underlyingTierBadgeText,
    showTier1Upgrade: tier.tier_status === 'tier0',
    showTier2Upgrade: tier.tier_status === 'tier0' || tier.tier_status === 'tier1',
  };
}

function buildQuickActions(slug: string): QuickAction[] {
  return [
    { label: 'My Profile',    href: `/members/${slug}/edit` },
    { label: 'My Galleries',  href: `/members/${slug}/galleries` },
    { label: 'Upload Media',  href: `/members/${slug}/media/upload` },
  ];
}

const COMING_SOON_FEATURES: ComingSoonFeature[] = [
  { label: 'My Club',             description: 'Confirm your old footbag.org club affiliations and leadership roles, then see your club roster and current standing.' },
  { label: 'My Events',           description: 'View your upcoming registrations and past event history.' },
  { label: 'Payments & Donations', description: 'View your payment history and donation receipts.' },
  { label: 'Voting & HoF',        description: 'Participate in active IFPA votes and Hall of Fame nominations.' },
  { label: 'Email Subscriptions', description: 'Manage your email notifications and preferences.' },
];

function buildIdentityCta(
  legacyLinked: boolean,
  hpLinked: boolean,
  slug?: string,
): IdentityLinkView['cta'] {
  if (legacyLinked && hpLinked) return null;
  // Both pre-existing CTA labels collapse onto a single wizard entry; the
  // wizard renders both linking sections so the user can address whichever
  // is missing without bouncing between separate forms.
  const href = slug ? `/members/${slug}/link-history` : '/history/claim';
  const label = !legacyLinked && !hpLinked
    ? 'Link your history'
    : !legacyLinked
    ? 'Link your past account'
    : 'Link your competition record';
  return { href, label };
}

function buildIdentityLinkView(memberId: string, slug: string): IdentityLinkView {
  const row = runSqliteRead('findIdentityLinks', () =>
    account.findIdentityLinks.get(memberId),
  ) as IdentityLinksRow | undefined;
  const claimedAt  = row?.legacy_claimed_at      ?? null;
  const personName = row?.historical_person_name ?? null;
  const legacyLinked = claimedAt !== null;
  const hpLinked     = personName !== null;
  return {
    legacyAccount: {
      linked: legacyLinked,
      sinceDisplay: claimedAt ? formatExpiryDate(claimedAt) : null,
    },
    historicalPerson: {
      linked: hpLinked,
      summary: personName,
    },
    cta: buildIdentityCta(legacyLinked, hpLinked, slug),
  };
}
