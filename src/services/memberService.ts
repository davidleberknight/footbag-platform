/**
 * MemberService -- member-account page shaping and lifecycle.
 *
 * Owns:
 *   - Page shaping for /members/* surfaces (public welcome with tier explainer;
 *     own-profile as authenticated personal home; limited HoF/BAP public profile;
 *     profile edit including inline avatar upload)
 *   - Member-account lifecycle: soft-delete, deceased handling, GDPR export
 *   - Member search (`searchMembers`)
 *   - Row-level PII clearing logic (`purgeAccountPII`)
 *
 * Does not own:
 *   - Login / registration credential verification (IdentityAccessService)
 *   - Legacy-claim flow (IdentityAccessService)
 *   - Tier grants or ledger calculation (MembershipTieringService)
 *   - Purge eligibility orchestration (OperationsPlatformService decides which
 *     members qualify and calls into purgeAccountPII)
 *
 * Required patterns:
 *   - Member search uses the `members_searchable` view; never add WHERE clauses
 *     on top of `members_active` or the bare `members` table for search.
 *   - `searchMembers` is authenticated Tier 0+ only; never callable from public
 *     routes. Minimum 2-character query; substring match on display name; 20-result
 *     cap with `hasMore` flag; no browse-all pagination.
 *   - Account deletion requires S3 photo deletion to succeed BEFORE `deleted_at`
 *     is set; gallery HD lives in the same atomic operation.
 *   - PII purge runs in one transaction; callable only by OperationsPlatformService.
 *   - Deceased and soft-deleted are distinct lifecycle paths with distinct grace
 *     configs (`deceased_cleanup_grace_days` for markDeceased;
 *     `member_cleanup_grace_days` for deleteAccount).
 *   - Own-profile routes are owner-only; non-owner public viewing is limited to
 *     the explicit HoF/BAP exception. No contact-field leakage on public profiles.
 *   - Max 3 external URLs per member; one avatar per member (partial UNIQUE
 *     index `ux_media_avatar_per_member`).
 *   - Avatar upload validates JPEG/PNG only with 5 MB size limit, processes to
 *     thumb and display sizes, and atomically replaces any existing avatar.
 *
 * Persistence:
 *   members, members_active, members_all, members_searchable, member_links,
 *   media_items, member_galleries, account_tokens, audit_entries, outbox_emails,
 *   work_queue_items.
 *
 * Side effects:
 *   - audit_entries append
 *   - outbox_emails enqueue (export-link, deceased notifications)
 *   - work_queue_items insert (sole-leader or organizer flags on deceased) with
 *     admin-alerts mailing-list notification
 *
 * Service shape: singleton object. Avatar upload is delegated to the factory
 * `createAvatarService(deps)` in `avatarService.ts` (uses MediaStorageAdapter).
 */
import { account, publicPlayers, memberClubAffiliations, clubLeaders, clubs as clubsDb, MemberProfileRow, MemberResultRow, MemberSearchRow, HistoricalPersonSearchRow, IdentityLinksRow } from '../db/db';
import { identityAccessService } from './identityAccessService';
import { memberOnboardingService, type DashboardTaskWidget } from './memberOnboardingService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { appendAuditEntry } from './auditService';
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

// Records a forensic audit row for a member self-service profile/PII mutation.
// Metadata carries the touched field names only (never the new values), so the
// trail stays free of the PII it exists to make traceable.
function auditProfileUpdate(memberId: string, fields: readonly string[]): void {
  appendAuditEntry({
    actionType: 'member.profile_updated',
    category: 'profile_change',
    actorType: 'member',
    actorMemberId: memberId,
    entityType: 'member',
    entityId: memberId,
    metadata: { fields: [...fields] },
  });
}

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
  showUpgradeForm: boolean;
  purchaseTierHref: string | null;
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
    href: string | null;
  };
  cta: {
    href: string;
    label: string;
  } | null;
}

export interface MemberWelcomeTier {
  label: string;
  price: string;
  benefits: ReadonlyArray<string>;
}

export interface MemberWelcomeContent {
  /** Sign Up + Log In cards render only for unauthenticated visitors. */
  showJoinCtas: boolean;
  /** Tier 0 → 3 in canonical order, with display labels, prices, and benefits. */
  tiers: ReadonlyArray<MemberWelcomeTier>;
}
const VALID_EMAIL_VISIBILITY = new Set(['private', 'members', 'public']);

export interface MyClubsClubView {
  clubName: string;
  clubHref: string;
  isPrimary: boolean;
  designationLabel: string;
  isLeader: boolean;
  leaderRole: string | null;
  leaveHref: string;
  canMarkInactive: boolean;
  canStepDown: boolean;
}

export interface NearbyClubSuggestion {
  clubName: string;
  city: string | null;
  clubHref: string;
}

export interface MyClubsView {
  clubs: MyClubsClubView[];
  canAddClub: boolean;
  canCreateClub: boolean;
  canSwapPrimary: boolean;
  browseClubsHref: string;
  createClubHref: string | null;
  swapPrimaryHref: string | null;
  nearbySuggestions: NearbyClubSuggestion[];
}

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
  showFirstCompetitionYear: boolean;
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
  /** Pending first-login confirmation card from a silent medium-confidence
   * auto-link claim. Null when no card is pending or when the member has
   * dismissed it. The three action endpoints (confirm / dismiss / report
   * incorrect) live under /members/me/auto-link. */
  pendingAutoLinkCard?: PendingAutoLinkCardContent | null;
  /** List of legacy accounts the member has claimed. Used by the profile
   * settings affordance so a member can revert a prior silent auto-link
   * from outside the first-login card surface. */
  claimedLegacyIdentities?: ClaimedLegacyIdentityView[];
  /** Onboarding-task widget for the personal dashboard. Null when the
   * member has no onboarding-task rows yet (pre-task-list bootstrap state).
   * Per M_Complete_Onboarding_Wizard the widget surfaces pending, paused
   * (detoured), and completed tasks with pre-shaped CTA labels. */
  dashboardTasks?: DashboardTaskWidget | null;
  myClubs?: MyClubsView;
}

export interface PendingAutoLinkCardContent {
  personId:               string;
  personName:             string;
  matchedVariantNormalized: string | null;
  legacyMemberId:         string;
  legacyDisplayName:      string;
  claimAuditId:           string;
  country:                string | null;
  isHof:                  boolean;
  isBap:                  boolean;
  firstYear:              number | null;
  /** Endpoint URLs pre-shaped for the template; templates never construct URLs. */
  confirmHref:            string;
  dismissHref:            string;
  reportIncorrectHref:    string;
}

export interface ClaimedLegacyIdentityView {
  legacyMemberId:      string;
  displayName:         string;
  claimedAtDisplay:    string | null;
  reportIncorrectHref: string;
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
  showFirstCompetitionYear: string | string[];
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
    firstCompetitionYear: row.first_competition_year ?? row.historical_first_year ?? null,
    showFirstCompetitionYear: row.show_first_competition_year !== 0,
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
    showFirstCompetitionYear: row.show_first_competition_year !== 0,
    avatarThumbUrl:  buildAvatarUrl(row.avatar_thumb_key, row.avatar_media_id),
  };
}

function fetchEventGroups(row: MemberProfileRow): PlayerEventGroup[] {
  let resultRows = runSqliteRead('listResultsByMemberId', () =>
    account.listResultsByMemberId.all(row.id),
  ) as MemberResultRow[];

  let selfPersonId: string | null = null;
  if (resultRows.length === 0 && row.legacy_member_id) {
    resultRows = runSqliteRead('listResultsByLegacyMemberId', () =>
      account.listResultsByLegacyMemberId.all(row.legacy_member_id),
    ) as MemberResultRow[];
    // Resolve the linked historical person so groupPlayerResults can suppress
    // this member from appearing as their own partner in results rows.
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

function buildPendingAutoLinkCardContent(memberId: string): PendingAutoLinkCardContent | null {
  const card = identityAccessService.getPendingAutoLinkCard(memberId);
  if (!card) return null;
  const c = card as unknown as Record<string, unknown>;
  return {
    personId:                 card.personId,
    personName:               card.personName,
    matchedVariantNormalized: card.matchedVariantNormalized,
    legacyMemberId:           card.legacyMemberId,
    legacyDisplayName:        card.legacyDisplayName,
    claimAuditId:             card.claimAuditId,
    country:                  typeof c.country === 'string' ? c.country : null,
    isHof:                    Boolean(c.isHof),
    isBap:                    Boolean(c.isBap),
    firstYear:                typeof c.firstYear === 'number' ? c.firstYear : null,
    confirmHref:              '/members/me/auto-link/confirm',
    dismissHref:              '/members/me/auto-link/dismiss',
    reportIncorrectHref:      '/members/me/auto-link/report-incorrect',
  };
}

function buildClaimedLegacyIdentitiesView(memberId: string): ClaimedLegacyIdentityView[] {
  const rows = identityAccessService.listClaimedLegacyIdentities(memberId);
  return rows.map(r => ({
    legacyMemberId:      r.legacyMemberId,
    displayName:         r.displayName,
    claimedAtDisplay:    r.claimedAt ? formatDateDisplay(r.claimedAt) : null,
    reportIncorrectHref: '/members/me/auto-link/report-incorrect',
  }));
}

function buildDashboardTasksView(memberId: string): DashboardTaskWidget | null {
  const widget = memberOnboardingService.getDashboardTaskWidget(memberId);
  return widget.hasOutstanding ? widget : null;
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
        membership:   buildTierStatusView(row.id, slug),
        identity:     buildIdentityLinkView(row.id, slug),
        quickActions: buildQuickActions(slug),
        search,
        comingSoon:   COMING_SOON_FEATURES,
        myClubs:      buildMyClubsView(row.id),
        memberSlug:   slug,
        pendingAutoLinkCard:    buildPendingAutoLinkCardContent(row.id),
        claimedLegacyIdentities: buildClaimedLegacyIdentitiesView(row.id),
        dashboardTasks:         buildDashboardTasksView(row.id),
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
    const rawShowYear = Array.isArray(input.showFirstCompetitionYear)
      ? input.showFirstCompetitionYear[input.showFirstCompetitionYear.length - 1]
      : input.showFirstCompetitionYear;
    const showYear = rawShowYear === '0' ? 0 : 1;

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
      showYear,
      now,
      row.id,
    );
    memberOnboardingService.completeTaskIfOutstanding(row.id, 'personal_details');
    auditProfileUpdate(row.id, [
      'bio', 'city', 'region', 'country', 'phone', 'emailVisibility',
      'firstCompetitionYear', 'showCompetitiveResults', 'showFirstCompetitionYear',
    ]);
  },

  getCompetitionPrefill(memberId: string): {
    firstCompetitionYear: number | null;
    showCompetitiveResults: boolean;
  } {
    const row = account.findCompetitionFieldsByMemberId.get(memberId) as
      | { first_competition_year: number | null; show_competitive_results: number; historical_first_year: number | null }
      | undefined;
    if (!row) return { firstCompetitionYear: null, showCompetitiveResults: false };
    return {
      firstCompetitionYear: row.first_competition_year ?? row.historical_first_year ?? null,
      showCompetitiveResults: row.show_competitive_results !== 0,
    };
  },

  getPersonalDetailsPrefill(memberId: string): {
    city: string; region: string; country: string; birthDate: string;
    firstCompetitionYear: number | null; showFirstCompetitionYear: boolean;
    showCompetitiveResults: boolean;
  } {
    const row = runSqliteRead('findPersonalDetails', () =>
      account.findPersonalDetails.get(memberId),
    ) as {
      city: string | null; region: string | null; country: string | null; birth_date: string | null;
      first_competition_year: number | null; show_first_competition_year: number;
      show_competitive_results: number;
    } | undefined;
    return {
      city: row?.city ?? '',
      region: row?.region ?? '',
      country: row?.country ?? '',
      birthDate: row?.birth_date ?? '',
      firstCompetitionYear: row?.first_competition_year ?? null,
      showFirstCompetitionYear: (row?.show_first_competition_year ?? 0) !== 0,
      showCompetitiveResults: (row?.show_competitive_results ?? 1) !== 0,
    };
  },

  setPersonalDetails(memberId: string, input: {
    city?: unknown; region?: unknown; country?: unknown; birthDate?: unknown;
    yearValue?: unknown; showFirstCompetitionYear?: unknown;
  }): void {
    const city = normalizeText(input.city) || null;
    const region = normalizeText(input.region) || null;
    const country = normalizeText(input.country) || null;
    const rawDob = normalizeText(input.birthDate);

    if (!city) {
      throw new ValidationError('City is required.');
    }
    if (!country) {
      throw new ValidationError('Country is required.');
    }
    if (!rawDob) {
      throw new ValidationError('Date of birth is required.');
    }

    if (city && city.length > 64) {
      throw new ValidationError('City must be 64 characters or fewer.');
    }
    if (region && region.length > 64) {
      throw new ValidationError('Region must be 64 characters or fewer.');
    }
    if (country && country.length > 64) {
      throw new ValidationError('Country must be 64 characters or fewer.');
    }

    let birthDate: string | null = null;
    if (rawDob) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDob)) {
        throw new ValidationError('Date of birth must be in YYYY-MM-DD format.');
      }
      const parsed = new Date(rawDob + 'T00:00:00Z');
      if (isNaN(parsed.getTime())) {
        throw new ValidationError('Date of birth is not a valid date.');
      }
      if (parsed.getFullYear() < 1900) {
        throw new ValidationError('Date of birth must be after 1900.');
      }
      if (parsed > new Date()) {
        throw new ValidationError('Date of birth cannot be in the future.');
      }
      birthDate = rawDob;
    }

    let firstCompetitionYear: number | null = null;
    const rawYear = normalizeText(input.yearValue);
    if (rawYear !== '') {
      const parsedYear = parseInt(rawYear, 10);
      const thisYear = new Date().getFullYear();
      if (!Number.isFinite(parsedYear) || String(parsedYear) !== rawYear || parsedYear < 1972 || parsedYear > thisYear) {
        throw new ValidationError(`Year must be a whole number between 1972 and ${thisYear}.`);
      }
      firstCompetitionYear = parsedYear;
    }

    const showFirstCompetitionYear = firstCompetitionYear != null
      ? 1
      : (input.showFirstCompetitionYear === true ||
         input.showFirstCompetitionYear === 'on' ||
         input.showFirstCompetitionYear === '1' ||
         input.showFirstCompetitionYear === 'true'
           ? 1
           : 0);

    const now = new Date().toISOString();
    account.updateMemberPersonalDetails.run(
      city, region, country, birthDate,
      firstCompetitionYear, showFirstCompetitionYear,
      now, memberId,
    );
    auditProfileUpdate(memberId, [
      'city', 'region', 'country', 'birthDate',
      'firstCompetitionYear', 'showFirstCompetitionYear',
    ]);
  },

  setFirstCompetitionYear(memberId: string, rawYear: unknown): void {
    const raw = normalizeText(rawYear);
    const now = new Date().toISOString();
    if (raw === '') {
      account.updateMemberFirstCompetitionYear.run(null, now, memberId);
      auditProfileUpdate(memberId, ['firstCompetitionYear']);
      return;
    }
    const parsed = parseInt(raw, 10);
    const thisYear = new Date().getFullYear();
    if (!Number.isFinite(parsed) || String(parsed) !== raw || parsed < 1972 || parsed > thisYear) {
      throw new ValidationError(`Year must be a whole number between 1972 and ${thisYear}.`);
    }
    account.updateMemberFirstCompetitionYear.run(parsed, now, memberId);
    auditProfileUpdate(memberId, ['firstCompetitionYear']);
  },

  setShowCompetitiveResults(memberId: string, rawEnabled: unknown): void {
    const value =
      rawEnabled === true ||
      rawEnabled === 'on' ||
      rawEnabled === '1' ||
      rawEnabled === 'true'
        ? 1
        : 0;
    account.updateMemberShowCompetitiveResults.run(value, new Date().toISOString(), memberId);
    auditProfileUpdate(memberId, ['showCompetitiveResults']);
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
    const tiers: MemberWelcomeTier[] = welcomeTierContent();
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

function welcomeTierContent(): MemberWelcomeTier[] {
  return [
    {
      label: TIER_BADGE_TEXT.tier0,
      price: 'Free',
      benefits: [
        'Browse the platform and search the membership',
        'Earn Active Player status (730 days) through qualifying event attendance, vouching, or a one-time club-join grant',
        'Active Player status unlocks Tier 1 benefits while current, including Official IFPA Roster inclusion',
      ],
    },
    {
      label: TIER_BADGE_TEXT.tier1,
      price: '$10 USD',
      benefits: [
        'Lifetime IFPA membership, no annual renewals',
        'Listed on the Official IFPA Roster',
        'Upload photos and videos and manage your media galleries',
        'Create a club and become a Club Leader',
        'Create basic events and become an Event Organizer',
        'Vote in IFPA elections and serve on IFPA committees',
      ],
    },
    {
      label: TIER_BADGE_TEXT.tier2,
      price: '$50 USD',
      benefits: [
        'Includes all Tier 1 benefits',
        'Create sanctioned events and enable paid event registration',
        'Request IFPA sponsorship and send community announcements via announce@footbag.org',
        'Vouch for Tier 0 members to earn or extend Active Player status',
        'Access the Official IFPA Roster for organizer purposes',
        'Granted automatically by Hall of Fame or Big Add Posse induction',
      ],
    },
    {
      label: TIER_BADGE_TEXT.tier3,
      price: 'Assigned by IFPA',
      benefits: [
        'Director or board-level status assigned by IFPA governance, not purchasable',
        'Holds full IFPA governance authority',
        'Reverts to underlying membership tier (Tier 1 or Tier 2) when governance status ends',
      ],
    },
  ];
}

function tierBenefitsBlurb(tier: MemberTier, isAp: boolean): string {
  if (tier === 'tier0' && isAp) {
    return 'You enjoy Tier 1 benefits while Active Player status is current, including Official IFPA Roster inclusion.';
  }
  switch (tier) {
    case 'tier0':
      return 'You can browse the platform, search the membership, and earn Active Player status through qualifying event attendance, vouching, or a one-time club-join grant.';
    case 'tier1':
      return 'You support the IFPA, are listed on the Official IFPA Roster, vote in IFPA elections, and can create clubs and basic events.';
    case 'tier2':
      return 'You can create sanctioned events, request IFPA sponsorship, send community announcements, vouch for Tier 0 Active Player status, and access the Official IFPA Roster.';
    case 'tier3':
      return 'You hold full IFPA governance authority and revert to your underlying membership tier when governance status ends.';
  }
}

function formatExpiryDate(iso: string): string {
  return formatDateDisplay(iso);
}

function underlyingTierText(underlying: UnderlyingTier): string {
  return `Reverts to ${TIER_BADGE_TEXT[underlying]} when governance ends.`;
}

function buildTierStatusView(memberId: string, slug: string): TierStatusView {
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

  const showTier1Upgrade = tier.tier_status === 'tier0';
  const showTier2Upgrade = tier.tier_status === 'tier0' || tier.tier_status === 'tier1';
  const canUpgrade = showTier1Upgrade || showTier2Upgrade;

  return {
    tierBadgeText: TIER_BADGE_TEXT[tier.tier_status],
    benefitsBlurb: tierBenefitsBlurb(tier.tier_status, isAp),
    activePlayer,
    underlyingTierBadgeText,
    showTier1Upgrade,
    showTier2Upgrade,
    showUpgradeForm: canUpgrade,
    purchaseTierHref: canUpgrade ? `/members/${slug}/purchase-tier` : null,
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
  { label: 'My Events',           description: 'View your upcoming registrations and past event history.' },
  { label: 'Payments & Donations', description: 'View your payment history and donation receipts.' },
  { label: 'Voting & HoF',        description: 'Participate in active IFPA votes and Hall of Fame nominations.' },
  { label: 'Email Subscriptions', description: 'Manage your email notifications and preferences.' },
];

interface CurrentAffiliationRow {
  id: string;
  club_id: string;
  club_name: string;
  club_key: string;
  club_status: string;
  is_primary: number;
}

function buildMyClubsView(memberId: string): MyClubsView {
  const rows = memberClubAffiliations.listCurrentWithClubName.all(memberId) as CurrentAffiliationRow[];
  const tier = getTierStatus(memberId);
  const hasTier1Benefits = tier != null && tier.tier_status !== 'tier0';
  const isLeaderAnywhere = clubLeaders.memberIsLeaderSomewhere.get(memberId) as { x: number } | undefined;

  const clubViews: MyClubsClubView[] = rows.map((r) => {
    const leadership = clubLeaders.memberInClubLeadership.get(r.club_id, memberId) as
      | { id: string; role: 'leader' | 'co-leader' } | undefined;
    const otherLeaders = leadership
      ? (clubLeaders.countOtherLeadersByClub.get(r.club_id, memberId) as { c: number }).c
      : 0;

    return {
      clubName: r.club_name,
      clubHref: `/clubs/${encodeURIComponent(r.club_key)}`,
      isPrimary: r.is_primary === 1,
      designationLabel: r.is_primary === 1 ? 'Primary club' : 'Secondary club',
      isLeader: leadership != null,
      leaderRole: leadership ? (leadership.role === 'leader' ? 'Leader' : 'Co-leader') : null,
      leaveHref: `/clubs/${encodeURIComponent(r.club_key)}/leave`,
      canMarkInactive: leadership != null && r.club_status === 'active',
      canStepDown: leadership?.role === 'leader' && otherLeaders > 0,
    };
  });

  let nearbySuggestions: NearbyClubSuggestion[] = [];
  if (rows.length === 0) {
    const personalDetails = account.findPersonalDetails.get(memberId) as
      | { country: string | null }
      | undefined;
    const country = personalDetails?.country ?? null;
    if (country) {
      const nearby = clubsDb.listOpenByCountry.all(country) as
        Array<{ club_id: string; name: string; city: string | null; club_key: string }>;
      nearbySuggestions = nearby.map((r) => ({
        clubName: r.name,
        city: r.city,
        clubHref: `/clubs/${encodeURIComponent(r.club_key)}`,
      }));
    }
  }

  return {
    clubs: clubViews,
    canAddClub: rows.length < 2,
    canCreateClub: hasTier1Benefits && !isLeaderAnywhere,
    canSwapPrimary: rows.length === 2,
    browseClubsHref: '/clubs',
    createClubHref: hasTier1Benefits && !isLeaderAnywhere ? '/clubs/create' : null,
    swapPrimaryHref: rows.length === 2 ? '/clubs/swap-primary' : null,
    nearbySuggestions,
  };
}

function buildIdentityCta(
  legacyLinked: boolean,
  hpLinked: boolean,
  slug?: string,
): IdentityLinkView['cta'] {
  if (legacyLinked && hpLinked) return null;
  // CTA target is the onboarding wizard's legacy_claim task, which renders
  // the unified candidate list and manual-id input for whichever linkage is
  // missing. Slug is not part of the URL; the wizard scopes to req.user.
  const href = '/register/wizard/legacy_claim';
  const label = !legacyLinked && !hpLinked
    ? 'Link your legacy account, results, and clubs'
    : !legacyLinked
    ? 'Link your old footbag.org account'
    : 'Link your competition history';
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
      href: row?.historical_person_id
        ? `/history/${encodeURIComponent(row.historical_person_id)}`
        : null,
    },
    cta: buildIdentityCta(legacyLinked, hpLinked, slug),
  };
}
