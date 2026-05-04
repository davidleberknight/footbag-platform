/**
 * Integration tests for officialRosterService.
 *
 * Covers the read-side contract from US A_View_Official_Roster_Reports:
 *   - list returns rows from official_ifpa_roster_current; deceased and
 *     Tier 0-without-AP members are excluded (enforced at the view layer)
 *   - tier filter narrows the result set
 *   - summary reports total + per-tier + per-honor breakdown + total
 *     registered accounts (the comparison count includes Tier 0 without AP)
 *   - exportCsv produces the prescribed header comment line, column header,
 *     YYYYMMDD filename, and applies the email opt-in redaction
 *   - every call writes a category='roster_access' audit entry
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

  // Admin actor (also has display name used in the CSV header comment).
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
  setEmailVisibility.run('public', 'm-t1');
  insertMemberTierGrant(db, {
    member_id: 'm-t1', new_tier_status: 'tier1', reason_code: 'purchase.tier1',
  });

  // tier2: private email (must be redacted in CSV)
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

describe('exportCsv', () => {
  it('filename is official_roster_YYYYMMDD.csv based on UTC now', () => {
    const { filename } = ors.exportCsv(ADMIN_ID);
    expect(filename).toMatch(/^official_roster_\d{8}\.csv$/);
  });

  it('first line is the prescribed header comment with admin display name', () => {
    const { csv } = ors.exportCsv(ADMIN_ID);
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toMatch(
      /^# Official IFPA Roster - Tier 1, Tier 2, Tier 3, and Tier 0 Active Player members - Generated \d{4}-\d{2}-\d{2} by Roster Admin$/,
    );
  });

  it('second line is the column header row', () => {
    const { csv } = ors.exportCsv(ADMIN_ID);
    const lines = csv.split('\n');
    expect(lines[1]).toBe(
      'member_id,display_name,tier_status,underlying_tier_status,' +
      'is_active_player,active_player_expires_at,' +
      'is_hof,is_bap,is_board,' +
      'email,city,region,country',
    );
  });

  it('emits one data row per roster member', () => {
    const { csv } = ors.exportCsv(ADMIN_ID);
    const lines = csv.trim().split('\n');
    // header comment + column header + 5 data rows
    expect(lines).toHaveLength(2 + 5);
  });

  it('excludes Tier 0 without AP and deceased members from the CSV', () => {
    const { csv } = ors.exportCsv(ADMIN_ID);
    expect(csv).not.toMatch(/m-t0-only/);
    expect(csv).not.toMatch(/m-t0-expired/);
    expect(csv).not.toMatch(/m-t1-deceased/);
  });

  it('redacts email for members with email_visibility=private (Bob Tier2)', () => {
    const { csv } = ors.exportCsv(ADMIN_ID);
    const bobLine = csv.split('\n').find((l) => l.startsWith('m-t2,'));
    expect(bobLine).toBeDefined();
    // Email column is the 10th comma-separated value (index 9).
    const cells = bobLine!.split(',');
    expect(cells[9]).toBe('');
    // bob's email is NOT present anywhere
    expect(csv).not.toMatch(/bob@example\.com/);
  });

  it('includes email for members with non-private visibility (Alice + Carol)', () => {
    const { csv } = ors.exportCsv(ADMIN_ID);
    expect(csv).toMatch(/alice@example\.com/);
    expect(csv).toMatch(/carol@example\.com/);
  });

  it('writes a roster.export audit entry with row_count and filename', () => {
    const before = rosterAuditCount('roster.export');
    ors.exportCsv(ADMIN_ID);
    expect(rosterAuditCount('roster.export')).toBe(before + 1);

    const dbh = new BetterSqlite3(dbPath, { readonly: true });
    const row = dbh
      .prepare(
        `SELECT metadata_json FROM audit_entries
         WHERE category = 'roster_access' AND action_type = 'roster.export'
         ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get() as { metadata_json: string };
    dbh.close();
    const meta = JSON.parse(row.metadata_json);
    expect(meta.row_count).toBe(5);
    expect(meta.filename).toMatch(/^official_roster_\d{8}\.csv$/);
  });

  it('rejects an unknown actorId', () => {
    expect(() => ors.exportCsv('does-not-exist')).toThrow(/not found/);
  });

  it('CSV-escapes display names containing commas and quotes', () => {
    // Add a member whose display_name needs escaping.
    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id: 'm-comma', slug: 'comma_quote',
      display_name: 'Sneaky, "Display"',
      login_email: 'sneaky@example.com',
    });
    db.prepare(`UPDATE members SET email_visibility = 'public' WHERE id = ?`)
      .run('m-comma');
    insertMemberTierGrant(db, {
      member_id: 'm-comma', new_tier_status: 'tier1',
      reason_code: 'purchase.tier1',
    });
    db.close();

    const { csv } = ors.exportCsv(ADMIN_ID);
    // Display name appears wrapped in quotes with internal quotes doubled.
    expect(csv).toMatch(/"Sneaky, ""Display"""/);
  });
});
