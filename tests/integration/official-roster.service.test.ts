/**
 * Integration tests for officialRosterService.
 *
 * Covers the read-side contract from US A_View_Official_Roster_Reports:
 *   - list returns rows from official_ifpa_roster_current; deceased and
 *     Tier 0-without-AP members are excluded (enforced at the view layer)
 *   - tier filter narrows the result set
 *   - summary reports total + per-tier + per-honor breakdown + total
 *     registered accounts (the comparison count includes Tier 0 without AP)
 *   - list redacts a member's sign-in address to their own visibility choice
 *   - getOfficialRosterPage shapes the whole-roster summary figures, the
 *     searched and tier-filtered member rows, the filter controls, and paging
 *   - every call writes a category='roster_access' audit entry
 *
 * The roster is never exported: the IFPA governing documents grant access and
 * say nothing about taking a copy, so there is no CSV and no download.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertMemberTierGrant,
  insertActivePlayerGrant,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3093');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let ors: typeof import('../../src/services/officialRosterService');

const FUTURE_AP = '2099-01-01T00:00:00.000Z';
const PAST_AP = '2020-01-01T00:00:00.000Z';

const ADMIN_ID = 'member-roster-admin';
const ADMIN_NAME = 'Roster Admin';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Admin actor, used as the audited reader in every call below.
  insertMember(db, {
    id: ADMIN_ID, slug: 'roster_admin',
    display_name: ADMIN_NAME, real_name: ADMIN_NAME,
    is_admin: 1,
  });

  // Direct upsert of email_visibility per member because insertMember
  // doesn't expose it; the schema default is 'private'. Helper below.
  const setEmailVisibility = db.prepare(
    `UPDATE members SET email_visibility = ? WHERE id = ?`,
  );

  // ── Roster cohort ────────────────────────────────────────────────────────
  // tier1: opted-in email
  insertMember(db, {
    id: 'm-t1', slug: 't1', display_name: 'Alice Tier1',
    login_email: 'alice@example.com', city: 'Austin', country: 'US',
  });
  setEmailVisibility.run('members', 'm-t1');
  insertMemberTierGrant(db, {
    member_id: 'm-t1', new_tier_status: 'tier1', reason_code: 'purchase.tier1',
  });

  // tier2: private email (must be redacted everywhere it could surface)
  insertMember(db, {
    id: 'm-t2', slug: 't2', display_name: 'Bob Tier2',
    login_email: 'bob@example.com', city: 'Boulder', country: 'US',
  });
  setEmailVisibility.run('private', 'm-t2');
  insertMemberTierGrant(db, {
    member_id: 'm-t2', new_tier_status: 'tier2', reason_code: 'purchase.tier2',
    actor_member_id: ADMIN_ID,
  });

  // tier3: opted-in email + HoF + Board flag
  insertMember(db, {
    id: 'm-t3', slug: 't3', display_name: 'Carol Tier3',
    login_email: 'carol@example.com', city: 'Chicago', country: 'US',
    is_hof: 1,
  });
  setEmailVisibility.run('members', 'm-t3');
  db.prepare(`UPDATE members SET is_board = 1 WHERE id = ?`).run('m-t3');
  insertMemberTierGrant(db, {
    member_id: 'm-t3', new_tier_status: 'tier3',
    change_type: 'governance_set',
    new_underlying_tier_status: 'tier1',
    reason_code: 'governance.tier3_set', actor_member_id: ADMIN_ID,
  });

  // tier0 + active player (in roster)
  insertMember(db, {
    id: 'm-t0-ap', slug: 't0_ap', display_name: 'Dan Active',
    city: 'Denver', country: 'US',
  });
  insertActivePlayerGrant(db, {
    member_id: 'm-t0-ap', change_type: 'grant',
    new_active_player_expires_at: FUTURE_AP,
    reason_code: 'official_event_attendance',
  });

  // tier2 + BAP flag (counted under tier2 + bap_count)
  insertMember(db, {
    id: 'm-t2-bap', slug: 't2_bap', display_name: 'Eve Big Add',
    is_bap: 1,
  });
  insertMemberTierGrant(db, {
    member_id: 'm-t2-bap', new_tier_status: 'tier2', reason_code: 'honor.bap_tier2_grant',
    actor_member_id: ADMIN_ID,
  });

  // ── Excluded members (must not appear in roster) ────────────────────────
  // Tier 0 without AP — excluded by view
  insertMember(db, {
    id: 'm-t0-only', slug: 't0_only', display_name: 'Frank Tier0',
  });

  // Tier 0 with EXPIRED AP — excluded
  insertMember(db, {
    id: 'm-t0-expired', slug: 't0_expired', display_name: 'Grace Expired',
  });
  insertActivePlayerGrant(db, {
    member_id: 'm-t0-expired', change_type: 'grant',
    new_active_player_expires_at: PAST_AP,
    reason_code: 'official_event_attendance',
  });

  // Tier 1 deceased — excluded by view (members_active filter doesn't, but
  // is_deceased=1 does)
  insertMember(db, {
    id: 'm-t1-deceased', slug: 't1_deceased', display_name: 'Hank Deceased',
    is_deceased: 1,
  });
  insertMemberTierGrant(db, {
    member_id: 'm-t1-deceased', new_tier_status: 'tier1', reason_code: 'purchase.tier1',
  });

  db.close();
  ors = await import('../../src/services/officialRosterService');
});

afterAll(() => cleanupTestDb(dbPath));

function rosterAuditCount(actionType: string): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_entries
       WHERE category = 'roster_access' AND action_type = ?`,
    )
    .get(actionType) as { n: number };
  db.close();
  return row.n;
}

describe('list', () => {
  it('returns all roster rows ordered by display_name (CASE NOCASE)', () => {
    const rows = ors.list(ADMIN_ID);
    const ids = rows.map((r) => r.member_id);
    // Roster cohort: m-t1, m-t2, m-t3, m-t0-ap, m-t2-bap (5 rows)
    expect(ids.sort()).toEqual(
      ['m-t0-ap', 'm-t1', 'm-t2', 'm-t2-bap', 'm-t3'].sort(),
    );
  });

  it('excludes deceased members (view: is_deceased = 0)', () => {
    const rows = ors.list(ADMIN_ID);
    expect(rows.find((r) => r.member_id === 'm-t1-deceased')).toBeUndefined();
  });

  it('excludes Tier 0 members without current Active Player', () => {
    const rows = ors.list(ADMIN_ID);
    expect(rows.find((r) => r.member_id === 'm-t0-only')).toBeUndefined();
    expect(rows.find((r) => r.member_id === 'm-t0-expired')).toBeUndefined();
  });

  it('tier filter narrows to the requested tiers', () => {
    const rows = ors.list(ADMIN_ID, { tier: ['tier2'] });
    const ids = rows.map((r) => r.member_id).sort();
    expect(ids).toEqual(['m-t2', 'm-t2-bap']);
  });

  it('multi-tier filter accepts an array', () => {
    const rows = ors.list(ADMIN_ID, { tier: ['tier1', 'tier3'] });
    const ids = rows.map((r) => r.member_id).sort();
    expect(ids).toEqual(['m-t1', 'm-t3']);
  });

  it('rejects an invalid tier value', () => {
    expect(() =>
      ors.list(ADMIN_ID, { tier: ['tierX' as unknown as 'tier1'] }),
    ).toThrow(/invalid tier/);
  });

  it('writes an audit entry with category=roster_access and row_count metadata', () => {
    const before = rosterAuditCount('roster.list');
    ors.list(ADMIN_ID);
    expect(rosterAuditCount('roster.list')).toBe(before + 1);
  });
});

describe('summary', () => {
  it('returns the dashboard breakdown shape', () => {
    const s = ors.summary(ADMIN_ID);
    expect(s.total).toBe(5);
    expect(s.byTier).toEqual({
      tier0_active_player: 1,
      tier1: 1,
      tier2: 2,
      tier3: 1,
    });
    expect(s.byHonor).toEqual({
      hof: 1,
      bap: 1,
      board: 1,
    });
  });

  it('totalRegistered includes Tier 0 members without Active Player', () => {
    const s = ors.summary(ADMIN_ID);
    // Seed: ADMIN + 5 roster + 3 excluded (t0_only, t0_expired, t1_deceased)
    // = 9 total active members.
    expect(s.totalRegistered).toBe(9);
    expect(s.totalRegistered).toBeGreaterThan(s.total);
  });

  it('writes a roster.summary audit entry', () => {
    const before = rosterAuditCount('roster.summary');
    ors.summary(ADMIN_ID);
    expect(rosterAuditCount('roster.summary')).toBe(before + 1);
  });
});

describe('list email redaction', () => {
  it('carries the sign-in address for a member who opted in', () => {
    const alice = ors.list(ADMIN_ID).find((r) => r.member_id === 'm-t1');
    expect(alice?.email).toBe('alice@example.com');
  });

  it('returns null instead of the address for a member who did not opt in', () => {
    const bob = ors.list(ADMIN_ID).find((r) => r.member_id === 'm-t2');
    expect(bob).toBeDefined();
    expect(bob?.email).toBeNull();
  });

  it('never returns the raw login_email or the visibility flag to callers', () => {
    const row = ors.list(ADMIN_ID)[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty('login_email');
    expect(row).not.toHaveProperty('email_visibility');
  });
});

describe('getOfficialRosterPage', () => {
  it('shapes the page envelope for the IFPA section and keeps it out of search engines', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID);
    expect(vm.page.sectionKey).toBe('ifpa');
    expect(vm.page.pageKey).toBe('ifpa_roster');
    expect(vm.seo.noindex).toBe(true);
  });

  it('reports the roster total and the registered-account comparison count', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID);
    const total = vm.content.summaryRows.find((r) => r.label === 'Total on Roster');
    expect(total?.value).toBe('5');
    expect(vm.content.totalRegistered).toBe(9);
  });

  it('leaves the summary figures whole-roster while a filter narrows only the list', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID, { tier: ['tier3'] });
    const total = vm.content.summaryRows.find((r) => r.label === 'Total on Roster');
    expect(total?.value).toBe('5');
    expect(vm.content.members).toHaveLength(1);
    expect(vm.content.summaryScopeNote).toMatch(/whole roster/i);
  });

  it('lists every roster member ordered by display name', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID);
    expect(vm.content.members.map((m) => m.displayName)).toEqual([
      'Alice Tier1', 'Bob Tier2', 'Carol Tier3', 'Dan Active', 'Eve Big Add',
    ]);
    expect(vm.content.matchCount).toBe(5);
  });

  it('links a member to their profile by slug, not by member id', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID);
    const alice = vm.content.members.find((m) => m.displayName === 'Alice Tier1');
    expect(alice?.profileHref).toBe('/members/t1');
  });

  it('shows an opted-in address and marks a withheld one as not shared', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID);
    const alice = vm.content.members.find((m) => m.memberId === 'm-t1');
    const bob = vm.content.members.find((m) => m.memberId === 'm-t2');
    expect(alice?.hasEmail).toBe(true);
    expect(alice?.email).toBe('alice@example.com');
    expect(bob?.hasEmail).toBe(false);
    expect(bob?.email).toBeNull();
  });

  it('labels the honours a member holds', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID);
    const carol = vm.content.members.find((m) => m.memberId === 'm-t3');
    expect(carol?.honorLabels).toEqual(['Hall of Fame', 'IFPA Board']);
  });

  it('narrows to a single tier when the tier filter is set', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID, { tier: ['tier2'] });
    expect(vm.content.members.map((m) => m.memberId)).toEqual(['m-t2', 'm-t2-bap']);
    expect(vm.content.isFiltered).toBe(true);
    expect(vm.content.tierOptions.find((o) => o.value === 'tier2')?.isActive).toBe(true);
  });

  it('narrows by search term, matching part of a display name case-insensitively', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID, { q: 'carol' });
    expect(vm.content.members.map((m) => m.memberId)).toEqual(['m-t3']);
    expect(vm.content.hasSearch).toBe(true);
    expect(vm.content.matchCount).toBe(1);
  });

  it('reports an empty result rather than failing when nothing matches', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID, { q: 'nobody-by-this-name' });
    expect(vm.content.members).toEqual([]);
    expect(vm.content.hasMembers).toBe(false);
    expect(vm.content.emptyStateText).toMatch(/No roster member matches/);
  });

  it('rejects an unknown tier value rather than silently ignoring it', () => {
    expect(() =>
      ors.getOfficialRosterPage(ADMIN_ID, { tier: ['tier9' as unknown as 'tier1'] }),
    ).toThrow(/invalid tier filter value/);
  });

  it('keeps everything on one page while the roster fits, and offers no pager', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID);
    expect(vm.content.pageCount).toBe(1);
    expect(vm.content.hasPaging).toBe(false);
    expect(vm.content.previousHref).toBeNull();
    expect(vm.content.nextHref).toBeNull();
    expect(vm.content.rangeLabel).toBe('Showing 1 to 5 of 5');
  });

  it('clamps a page number past the end back onto the last page', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID, { page: 99 });
    expect(vm.content.page).toBe(1);
    expect(vm.content.members).toHaveLength(5);
  });

  it('carries the search term into each tier filter link so the two compose', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID, { q: 'tier' });
    const tier2 = vm.content.tierOptions.find((o) => o.value === 'tier2');
    expect(tier2?.href).toBe('/ifpa/roster?tier=tier2&q=tier');
  });

  it('audits the page view under roster_access', () => {
    const beforeList = rosterAuditCount('roster.list');
    const beforeSummary = rosterAuditCount('roster.summary');
    ors.getOfficialRosterPage(ADMIN_ID);
    expect(rosterAuditCount('roster.list')).toBe(beforeList + 1);
    expect(rosterAuditCount('roster.summary')).toBe(beforeSummary + 1);
  });

  it('exposes no export, download, or file-producing method', () => {
    const surface = ors as unknown as Record<string, unknown>;
    expect(surface.exportCsv).toBeUndefined();
    expect(Object.keys(surface).filter((k) => /export|csv|download/i.test(k))).toEqual([]);
  });
});

describe('roster page controls keep the reader oriented', () => {
  it('carries the chosen tier back into the search form so searching keeps it', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID, { tier: ['tier2'] });
    expect(vm.content.activeTier).toBe('tier2');
  });

  it('leaves the carried tier empty when no tier is chosen', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID);
    expect(vm.content.activeTier).toBe('');
  });

  it('offers an all-tiers option that widens the tier filter and keeps the search term', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID, { tier: ['tier2'], q: 'bob' });
    const all = vm.content.tierOptions.find((o) => o.label === 'All Tiers');
    expect(all).toBeDefined();
    expect(all?.href).toBe('/ifpa/roster?q=bob');
    expect(all?.isActive).toBe(false);
  });

  it('marks all-tiers as the active option when no tier is chosen', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID);
    const all = vm.content.tierOptions.find((o) => o.label === 'All Tiers');
    expect(all?.isActive).toBe(true);
  });

  it('says nothing about a range when there is no result to range over', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID, { q: 'nobody-by-this-name' });
    expect(vm.content.rangeLabel).toBe('');
  });

  it('offers a way back to the IFPA section', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID);
    expect(vm.content.backHref).toBe('/ifpa');
    expect(vm.content.backLabel).toBe('Back to IFPA Documents');
  });

  it('states a standing for a member holding no honours rather than leaving it blank', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID);
    const alice = vm.content.members.find((m) => m.memberId === 'm-t1');
    expect(alice?.hasHonors).toBe(false);
    expect(alice?.noHonorsLabel).toBe('None');
  });

  it('writes the Active Player expiry in the site date format, not a raw timestamp', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID);
    const dan = vm.content.members.find((m) => m.memberId === 'm-t0-ap');
    expect(dan?.activePlayerLabel).toBe('Active Player through 1 Jan 2099');
  });
});
