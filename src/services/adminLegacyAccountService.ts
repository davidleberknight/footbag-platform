/**
 * AdminLegacyAccountService -- the administrator's search over the old
 * footbag.org accounts nobody has claimed, shaped for the record picker on a
 * link-help request's approval.
 *
 * Owns the search and its row shaping. Writes nothing: linking an account to a
 * member happens on the link-help request that asked for it, where the
 * administrator chooses the account from this search rather than typing its id.
 *
 * Audience: admin only, behind the route gate. These rows carry a person's legal
 * name, date of birth and address fields, which is internal-and-admin-only
 * material; a picker row shows the name and where the account was, and no more,
 * so an administrator can tell two same-named accounts apart without the search
 * becoming a general dump of archived personal data.
 *
 * Persistence: legacy_members (read only).
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
      return { results: [], hasMore: false, tooShort: true, rateLimited: false };
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
    };
  },

  /** An account as the picker shows it once chosen, or null for an id no account has. */
  findAccountForPicker(legacyMemberId: string): PickerRecord | null {
    if (legacyMemberId === '') return null;
    const row = legacyMembers.findByLegacyMemberId.get(legacyMemberId) as LegacyAccountRow | undefined;
    return row ? shapeRecord(row) : null;
  },
};
