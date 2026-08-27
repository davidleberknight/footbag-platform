/**
 * AdminLegacyAccountService -- the administrator's lookup over the old
 * footbag.org accounts nobody has claimed.
 *
 * Owns the search and its result shaping. Writes nothing: linking an account to
 * a member happens on the link-help request that asked for it, and this surface
 * exists so the administrator can find the account id that request needs.
 *
 * Why it is a surface of its own. The queue asks an administrator to type a
 * legacy account id, and until now the admin interface could not produce one:
 * the member lookup searches member accounts, the historical-record lookup
 * searches competition records, and the legacy account paths match an exact
 * email or id supplied by the member who owns it. An identifier the platform
 * demands and cannot show is a decision an administrator cannot make.
 *
 * Audience: admin only, behind the route gate. These rows carry a person's legal
 * name, date of birth and address fields, which is internal-and-admin-only
 * material; the result rows show what identifies a person and no more, so an
 * administrator can tell two same-named accounts apart without the surface
 * becoming a general dump of archived personal data.
 *
 * Persistence: legacy_members (read only).
 *
 * Service shape: singleton object (no external adapters beyond db.ts).
 */
import { legacyMembers } from '../db/db';
import type { PageViewModel } from '../types/page';

const LOOKUP_LIMIT = 25;
const MIN_LOOKUP_QUERY = 2;

interface LegacyAccountRow {
  legacy_member_id: string;
  legacy_user_id: string | null;
  real_name: string | null;
  display_name: string | null;
  birth_date: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  ifpa_join_date: string | null;
  first_competition_year: number | null;
  is_hof: number;
  is_bap: number;
}

export interface LegacyAccountResultView {
  legacyMemberId: string;
  /** The name the account went by, falling back to the legal name it holds. */
  displayName: string;
  /** What tells two same-named accounts apart, in the order an administrator
   *  reads them: the id they must type, then who and where. */
  facts: string[];
  /** Shown apart from the facts because it is the strongest single thing an
   *  administrator can check a claim against. */
  birthDate: string | null;
  badges: string[];
}

export interface AdminLegacyAccountsContent {
  query: string;
  hasQuery: boolean;
  results: LegacyAccountResultView[];
  hasResults: boolean;
  resultSummary: string;
  hasMore: boolean;
  errorMessage?: string;
}

function locationLabel(row: LegacyAccountRow): string | null {
  const parts = [row.city, row.region, row.country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function competedLabel(row: LegacyAccountRow): string | null {
  if (row.first_competition_year) return `First competed ${row.first_competition_year}`;
  if (row.ifpa_join_date) return `Joined the IFPA ${row.ifpa_join_date.slice(0, 4)}`;
  return null;
}

function shapeRow(row: LegacyAccountRow): LegacyAccountResultView {
  const badges: string[] = [];
  if (row.is_hof === 1) badges.push('Hall of Fame');
  if (row.is_bap === 1) badges.push('Big Add Posse');
  return {
    legacyMemberId: row.legacy_member_id,
    displayName:    row.display_name ?? row.real_name ?? row.legacy_member_id,
    facts: [
      row.legacy_member_id,
      // The legal name is worth showing beside a different display name, and is
      // noise when it is the same string.
      row.real_name && row.real_name !== row.display_name ? row.real_name : null,
      row.legacy_user_id,
      locationLabel(row),
      competedLabel(row),
    ].filter((f): f is string => Boolean(f)),
    birthDate: row.birth_date,
    badges,
  };
}

export const adminLegacyAccountService = {
  /**
   * The lookup, by exact account id or username, by part of a name, or by an
   * exact email address. An email is matched exactly rather than by fragment:
   * it is a credential-shaped value, and a substring search over it would turn
   * this page into a way to browse archived addresses.
   */
  getLegacyAccountsPage(rawQuery: string): PageViewModel<AdminLegacyAccountsContent> {
    const query = rawQuery.trim();
    const title = 'Legacy Accounts';
    let results: LegacyAccountResultView[] = [];
    let hasMore = false;
    let errorMessage: string | undefined;

    if (query !== '' && query.length < MIN_LOOKUP_QUERY) {
      errorMessage = `Enter at least ${MIN_LOOKUP_QUERY} characters, or an exact account id.`;
    } else if (query !== '') {
      const lowered = query.toLowerCase();
      const escaped = lowered.replace(/[\\%_]/g, (ch) => `\\${ch}`);
      // One over the cap, so a full page of results can be told apart from a set
      // that was truncated.
      const rows = legacyMembers.searchUnclaimedForAdmin.all(
        query, query, escaped, escaped, lowered, lowered, lowered, LOOKUP_LIMIT + 1,
      ) as LegacyAccountRow[];
      hasMore = rows.length > LOOKUP_LIMIT;
      results = rows.slice(0, LOOKUP_LIMIT).map(shapeRow);
    }

    const resultSummary = query === ''
      ? 'Search the old accounts nobody has claimed, by name, account id, username, or an exact email address.'
      : results.length === 0
        ? 'No unclaimed legacy account matches that search.'
        : hasMore
          ? `More than ${LOOKUP_LIMIT} accounts match. Narrow the search to see the rest.`
          : results.length === 1
            ? 'One account matches.'
            : `${results.length} accounts match.`;

    return {
      seo:  { title, noindex: true },
      page: { sectionKey: '', pageKey: 'admin_legacy_accounts', title },
      content: {
        query,
        hasQuery: query !== '',
        results,
        hasResults: results.length > 0,
        resultSummary,
        hasMore,
        errorMessage,
      },
    };
  },
};
