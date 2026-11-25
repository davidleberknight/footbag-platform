/**
 * AdminLegacyAccountService -- the administrator's searches over the old
 * footbag.org accounts: the accounts nobody has claimed, shaped for the record
 * picker on a link-help request's approval, and every account, claimed or not,
 * shaped for the administrator's member find, where a claimed account names and
 * links the member who holds it.
 *
 * Owns the searches and their row shaping. Writes nothing: linking an account to a
 * member happens on the link-help request that asked for it, where the
 * administrator chooses the account from this search rather than typing its id.
 *
 * Audience: admin only, behind the route gate. These rows carry a person's legal
 * name, date of birth and address fields, which is internal-and-admin-only
 * material; a picker row shows the name and where the account was, and no more,
 * so an administrator can tell two same-named accounts apart without the search
 * becoming a general dump of archived personal data.
 *
 * Persistence: legacy_members, and members for the holder's name (read only).
 *
 * Service shape: singleton object (no external adapters beyond db.ts).
 */
import { legacyMembers } from '../db/db';
import type { PickerRecord, RecordSearchOutcome } from './memberPicker';

const MIN_LOOKUP_QUERY = 2;

interface LegacyAccountRow {
  legacy_member_id: string;
  real_name: string | null;
  display_name: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

function shapeRecord(row: LegacyAccountRow): PickerRecord {
  const place = [row.city, row.region, row.country].filter(Boolean).join(', ');
  return {
    id:          row.legacy_member_id,
    displayName: row.display_name ?? row.real_name ?? row.legacy_member_id,
    location:    place === '' ? null : place,
  };
}

interface AdminLegacyAccountRow extends LegacyAccountRow {
  legacy_user_id: string | null;
  claimed_by_member_id: string | null;
  claimed_by_display_name: string | null;
  claimed_by_is_nameable: number;
}

/** One old account on the administrator's find. */
export interface AdminLegacyAccountView {
  name: string;
  /** The username, the old account id and where the account was. */
  facts: string[];
  /** The member who claimed it, or null while nobody has. */
  holderName: string | null;
  /** Their admin member record; null when unclaimed, or held by an account not yet nameable. */
  holderHref: string | null;
}

function accountName(row: LegacyAccountRow): string {
  return row.display_name ?? row.real_name ?? row.legacy_member_id;
}

function shapeAdminAccount(row: AdminLegacyAccountRow): AdminLegacyAccountView {
  const place = [row.city, row.region, row.country].filter(Boolean).join(', ');
  const nameable = row.claimed_by_member_id !== null && row.claimed_by_is_nameable === 1;
  return {
    name:  accountName(row),
    facts: [row.legacy_user_id, `Old account ${row.legacy_member_id}`, place]
      .filter((f): f is string => Boolean(f)),
    holderName: row.claimed_by_member_id === null
      ? null
      : nameable ? row.claimed_by_display_name : row.claimed_by_member_id,
    holderHref: nameable ? `/admin/members/${row.claimed_by_member_id}` : null,
  };
}

export const adminLegacyAccountService = {
  /**
   * The search, by exact account id or username, by part of a name, or by an
   * exact email address. An email is matched exactly rather than by fragment:
   * it is a credential-shaped value, and a substring search over it would turn
   * the search into a way to browse archived addresses.
   */
  lookupAccountsForPicker(rawQuery: string, limit: number): RecordSearchOutcome {
    const query = rawQuery.trim();
    if (query.length < MIN_LOOKUP_QUERY) {
      return { results: [], hasMore: false, tooShort: true, rateLimited: false, retryAfterSeconds: null };
    }
    const lowered = query.toLowerCase();
    const escaped = lowered.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    // One over the cap, so a full set of rows can be told apart from a set that
    // was truncated.
    const rows = legacyMembers.searchUnclaimedForAdmin.all(
      query, query, escaped, escaped, lowered, lowered, lowered, limit + 1,
    ) as LegacyAccountRow[];
    return {
      results: rows.slice(0, limit).map(shapeRecord),
      hasMore: rows.length > limit,
      tooShort: false,
      rateLimited: false,
      retryAfterSeconds: null,
    };
  },

  /**
   * The administrator's find over every old account, claimed or not, matched
   * as the picker's search is, and by each nickname form of the name
   * (`nameVariants`, the typed query first). A claimed account names the member
   * who holds it and links to their member record, the one admin home for it.
   */
  findAccountsForAdmin(rawQuery: string, nameVariants: string[], limit: number): {
    results: AdminLegacyAccountView[]; hasMore: boolean;
  } {
    const query = rawQuery.trim();
    const lowered = query.toLowerCase();
    const seen = new Map<string, AdminLegacyAccountRow>();
    for (const variant of nameVariants.length > 0 ? nameVariants : [lowered]) {
      const escaped = variant.replace(/[\\%_]/g, (ch) => `\\${ch}`);
      const rows = legacyMembers.searchAllForAdmin.all(
        query, query, escaped, escaped, lowered, lowered, lowered, limit + 1,
      ) as AdminLegacyAccountRow[];
      for (const row of rows) if (!seen.has(row.legacy_member_id)) seen.set(row.legacy_member_id, row);
    }
    const rows = [...seen.values()].sort((a, b) =>
      accountName(a).localeCompare(accountName(b), undefined, { sensitivity: 'base' })
      || a.legacy_member_id.localeCompare(b.legacy_member_id));
    return { results: rows.slice(0, limit).map(shapeAdminAccount), hasMore: rows.length > limit };
  },

  /** An account as the picker shows it once chosen, or null for an id no account has. */
  findAccountForPicker(legacyMemberId: string): PickerRecord | null {
    if (legacyMemberId === '') return null;
    const row = legacyMembers.findByLegacyMemberId.get(legacyMemberId) as LegacyAccountRow | undefined;
    return row ? shapeRecord(row) : null;
  },
};
