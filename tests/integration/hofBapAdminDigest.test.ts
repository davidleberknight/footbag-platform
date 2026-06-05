/**
 * Integration tests for SYS_HoF_BAP_Admin_Digest.
 *
 * Coverage:
 *   - window_disabled when system_config has no cutover anchor (default).
 *   - outside_window when "now" exceeds cutover + window_days.
 *   - outside_window when "now" precedes cutover.
 *   - no_matches inside the window when no member_tier_grants rows fit
 *     the (reason_code='legacy.claim_tier_grant' AND HoF or BAP) filter.
 *   - enqueued inside the window with one or more matching rows:
 *     enqueueMailingListEmail produces N outbox rows for N admin subscribers,
 *     subject carries claim_count, body lists each row's identifiers but
 *     contains no member contact fields.
 *   - idempotency: re-running on the same UTC day enqueues zero new rows
 *     and reports duplicates equal to subscriber count.
 *   - rows OUTSIDE the prior-24h lookback are not included.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3096');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/hofBapAdminDigestService');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  const mod = await import('../../src/services/hofBapAdminDigestService');
  svc = mod;
});

afterAll(() => cleanupTestDb(dbPath));

function db(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

let _cfgSeq = 0;
function nextCfgEffective(): string {
  _cfgSeq += 1;
  const t = new Date(Date.UTC(2025, 0, 1) + _cfgSeq * 1000).toISOString();
  return t;
}

function insertConfig(key: string, value: string): void {
  const d = db();
  const effective = nextCfgEffective();
  d.prepare(`
    INSERT INTO system_config (
      id, created_at,
      config_key, value_json, effective_start_at, reason_text
    ) VALUES (?, ?, ?, ?, ?, 'test')
  `).run(
    `cfg-${key}-${_cfgSeq}`,
    effective,
    key,
    value,
    effective,
  );
  d.close();
}

function setCutoverAtIso(iso: string | null): void {
  // null/empty disables the job by clearing the anchor on the read side.
  insertConfig('hof_bap_digest_cutover_at_iso', iso ?? '');
}

function setWindowDays(days: number): void {
  insertConfig('hof_bap_digest_window_days', String(days));
}

function seedAdminSubscriber(memberId: string): void {
  const d = db();
  insertMember(d, {
    id:          memberId,
    slug:        `slug_${memberId}`,
    login_email: `${memberId}@example.com`,
  });
  d.prepare(`
    INSERT INTO mailing_list_subscriptions (
      id, created_at, created_by, updated_at, updated_by, version,
      mailing_list_id, member_id, status, status_updated_at
    ) VALUES (?, ?, 'system', ?, 'system', 1, 'admin-alerts', ?, 'subscribed', ?)
  `).run(
    `mls-digest-${memberId}`,
    '2025-01-01T00:00:00.000Z',
    '2025-01-01T00:00:00.000Z',
    memberId,
    '2025-01-01T00:00:00.000Z',
  );
  d.close();
}

function insertHonorMember(memberId: string, isHof: 0 | 1, isBap: 0 | 1, legacyMemberId: string | null): void {
  const d = db();
  insertMember(d, {
    id:           memberId,
    slug:         `slug_${memberId}`,
    login_email:  `${memberId}@example.com`,
    display_name: `Member ${memberId}`,
    is_hof:       isHof,
    is_bap:       isBap,
  });
  if (legacyMemberId !== null) {
    // Create stub legacy_members row and link the member to it.
    d.prepare(`
      INSERT OR IGNORE INTO legacy_members (
        legacy_member_id, real_name, display_name, display_name_normalized,
        is_hof, is_bap, legacy_is_admin, imported_at, version
      ) VALUES (?, 'X', 'X', 'x', 0, 0, 0, ?, 1)
    `).run(legacyMemberId, '2000-01-01T00:00:00.000Z');
    d.prepare(`UPDATE members SET legacy_member_id = ? WHERE id = ?`).run(legacyMemberId, memberId);
  }
  d.close();
}

function insertTierGrant(opts: {
  id: string;
  memberId: string;
  reasonCode: string;
  createdAtIso: string;
}): void {
  const d = db();
  d.prepare(`
    INSERT INTO member_tier_grants (
      id, created_at, created_by,
      member_id, actor_member_id,
      change_type,
      old_tier_status, new_tier_status,
      old_underlying_tier_status, new_underlying_tier_status,
      reason_code, reason_text,
      related_payment_id
    ) VALUES (?, ?, 'system', ?, NULL, 'grant',
      'tier0', 'tier2',
      NULL, NULL,
      ?, NULL, NULL)
  `).run(opts.id, opts.createdAtIso, opts.memberId, opts.reasonCode);
  d.close();
}

function listOutboxFor(subject: string): Array<Record<string, unknown>> {
  const d = new BetterSqlite3(dbPath, { readonly: true });
  const rows = d.prepare(
    `SELECT id, recipient_email, subject, body_text, idempotency_key
       FROM outbox_emails
      WHERE subject = ?
      ORDER BY id`,
  ).all(subject) as Array<Record<string, unknown>>;
  d.close();
  return rows;
}

let _testSeq = 0;
function freshIds(): { admin: string; honor: string; legacy: string; tg: string } {
  _testSeq += 1;
  const s = String(_testSeq).padStart(3, '0');
  return {
    admin:  `digest-admin-${s}`,
    honor:  `digest-hof-${s}`,
    legacy: `digestlm-${s}`,
    tg:     `tg-digest-${s}`,
  };
}

function clearTestState(): void {
  const d = db();
  // member_tier_grants + members + legacy_members tolerate accumulation
  // because each test uses unique ids. The digest query joins members on
  // tier_grant.member_id, and each test seeds a fresh member that ties
  // its grant back; orphan grants from prior tests are filtered out by
  // the join when their member is filtered by the test's other criteria.
  d.prepare(`DELETE FROM outbox_emails`).run();
  d.prepare(`DELETE FROM mailing_list_subscriptions`).run();
  d.close();
}

beforeEach(() => {
  clearTestState();
});

describe('SYS_HoF_BAP_Admin_Digest', () => {
  it('window_disabled when cutover anchor is unset (default value)', () => {
    // No insertConfig call: system_config_current returns no row for the
    // cutover key, so the service reads it as null and disables the job.
    const result = svc.runDailyPass({ now: new Date('2026-06-01T00:00:00.000Z') });
    expect(result.status).toBe('window_disabled');
    expect(result.claim_count).toBe(0);
    expect(result.enqueued).toBe(0);
  });

  it('window_disabled when cutover anchor is unparseable', () => {
    setCutoverAtIso('not-an-iso-date');
    const result = svc.runDailyPass({ now: new Date('2026-06-01T00:00:00.000Z') });
    expect(result.status).toBe('window_disabled');
  });

  it('outside_window when "now" precedes cutover', () => {
    setCutoverAtIso('2026-07-01T00:00:00.000Z');
    setWindowDays(56);
    const result = svc.runDailyPass({ now: new Date('2026-06-01T00:00:00.000Z') });
    expect(result.status).toBe('outside_window');
  });

  it('outside_window when "now" exceeds cutover + window_days', () => {
    setCutoverAtIso('2026-01-01T00:00:00.000Z');
    setWindowDays(7);
    const result = svc.runDailyPass({ now: new Date('2026-06-01T00:00:00.000Z') });
    expect(result.status).toBe('outside_window');
  });

  it('no_matches when inside window but no qualifying tier-grant rows exist', () => {
    setCutoverAtIso('2026-05-01T00:00:00.000Z');
    setWindowDays(56);
    const ids = freshIds();
    seedAdminSubscriber(ids.admin);
    const result = svc.runDailyPass({ now: new Date('2026-05-15T00:00:00.000Z') });
    expect(result.status).toBe('no_matches');
    expect(result.claim_count).toBe(0);
    expect(result.enqueued).toBe(0);
    expect(result.monitoring_window_remaining_days).toBeGreaterThan(0);
  });

  it('enqueues one outbox row per admin subscriber when a matching row is inside the lookback', () => {
    setCutoverAtIso('2026-05-01T00:00:00.000Z');
    setWindowDays(56);
    const ids = freshIds();
    const ids2 = freshIds();
    seedAdminSubscriber(ids.admin);
    seedAdminSubscriber(ids2.admin);

    insertHonorMember(ids.honor, 1, 0, ids.legacy);
    insertTierGrant({
      id:           ids.tg,
      memberId:     ids.honor,
      reasonCode:   'legacy.claim_tier_grant',
      createdAtIso: '2026-05-14T18:00:00.000Z',
    });

    const result = svc.runDailyPass({ now: new Date('2026-05-15T00:00:00.000Z') });
    expect(result.status).toBe('enqueued');
    expect(result.claim_count).toBe(1);
    expect(result.enqueued).toBe(2);
    expect(result.duplicates).toBe(0);

    const subject = 'IFPA admin digest: 1 HoF/BAP claim(s) in last 24h';
    const outboxRows = listOutboxFor(subject);
    expect(outboxRows).toHaveLength(2);
    const bodies = outboxRows.map((r) => String(r.body_text));
    for (const body of bodies) {
      expect(body).toContain(`tier_grant=${ids.tg}`);
      expect(body).toContain(`member=${ids.honor}`);
      expect(body).toContain(`legacy=${ids.legacy}`);
      expect(body).toContain('flags=HoF');
      // Anti-PII: body must not include login_email of the linked member,
      // nor any member name; identifiers are enough for admin lookup.
      expect(body).not.toContain(`${ids.honor}@example.com`);
      expect(body).not.toContain('name="');
      expect(body).not.toContain(`Member ${ids.honor}`);
    }
  });

  it('does not include rows older than the prior-24h lookback', () => {
    setCutoverAtIso('2026-05-01T00:00:00.000Z');
    setWindowDays(56);
    const ids = freshIds();
    seedAdminSubscriber(ids.admin);

    insertHonorMember(ids.honor, 0, 1, ids.legacy);
    insertTierGrant({
      id:           ids.tg,
      memberId:     ids.honor,
      reasonCode:   'legacy.claim_tier_grant',
      createdAtIso: '2026-05-10T00:00:00.000Z', // > 24h before this test's "now"
    });

    // Pick a "now" far enough from prior tests' grant timestamps that no
    // prior grants land inside this 24h lookback either.
    const result = svc.runDailyPass({ now: new Date('2026-05-20T00:00:00.000Z') });
    expect(result.status).toBe('no_matches');
  });

  it('idempotent: a same-day rerun re-enqueues all rows as duplicates', () => {
    setCutoverAtIso('2026-05-01T00:00:00.000Z');
    setWindowDays(56);
    const ids = freshIds();
    seedAdminSubscriber(ids.admin);
    insertHonorMember(ids.honor, 1, 0, ids.legacy);
    insertTierGrant({
      id:           ids.tg,
      memberId:     ids.honor,
      reasonCode:   'legacy.claim_tier_grant',
      createdAtIso: '2026-05-24T22:00:00.000Z',
    });

    const first = svc.runDailyPass({ now: new Date('2026-05-25T00:00:00.000Z') });
    expect(first.status).toBe('enqueued');
    expect(first.enqueued).toBe(1);
    expect(first.duplicates).toBe(0);

    const second = svc.runDailyPass({ now: new Date('2026-05-25T01:00:00.000Z') });
    expect(second.status).toBe('enqueued');
    expect(second.enqueued).toBe(0);
    expect(second.duplicates).toBe(1);
  });

  it('non-legacy.claim_tier_grant rows are ignored', () => {
    setCutoverAtIso('2026-05-01T00:00:00.000Z');
    setWindowDays(56);
    const ids = freshIds();
    seedAdminSubscriber(ids.admin);
    insertHonorMember(ids.honor, 1, 0, ids.legacy);
    insertTierGrant({
      id:           ids.tg,
      memberId:     ids.honor,
      reasonCode:   'admin.manual_grant',
      createdAtIso: '2026-05-29T18:00:00.000Z',
    });

    const result = svc.runDailyPass({ now: new Date('2026-05-30T00:00:00.000Z') });
    expect(result.status).toBe('no_matches');
  });

  it('covers honors-bearing claims from EVERY claim path (digest keys on the shared reason code)', async () => {
    // Real claim flows write the grants here, so this pins the scope
    // contract: a direct historical-record claim and a legacy-account claim
    // both surface through the digest's read query, not just one path. The
    // window bounds are derived from the written rows themselves so the
    // assertion is independent of the wall clock.
    const { identityAccessService } = await import('../../src/services/identityAccessService');
    const { hofBapDigest } = await import('../../src/db/db');

    const d = db();
    // Path 1: direct historical-record claim of an HoF person.
    d.prepare(`
      INSERT INTO historical_persons (person_id, person_name, hof_member)
      VALUES ('hp-digest-path1', 'Digest Hofster', 1)
    `).run();
    insertMember(d, {
      id: 'mem-digest-path1', slug: 'mem_digest_path1',
      login_email: 'digest-path1@example.com',
      real_name: 'Danielle Hofster', display_name: 'Danielle Hofster',
    });
    // Path 2: legacy-account claim of an HoF-flagged legacy row.
    d.prepare(`
      INSERT INTO legacy_members (
        legacy_member_id, real_name, display_name, display_name_normalized,
        is_hof, is_bap, legacy_is_admin, imported_at, version
      ) VALUES ('legmem-digest-path2', 'Bapster Legacy', 'Bapster Legacy', 'bapster legacy', 1, 0, 0, '2000-01-01T00:00:00.000Z', 1)
    `).run();
    insertMember(d, {
      id: 'mem-digest-path2', slug: 'mem_digest_path2',
      login_email: 'digest-path2@example.com',
      real_name: 'Bapster Legacy', display_name: 'Bapster Legacy',
    });
    d.close();

    identityAccessService.claimHistoricalPerson('mem-digest-path1', 'hp-digest-path1');
    identityAccessService.claimLegacyAccount('mem-digest-path2', 'legmem-digest-path2');

    // Both paths must have written the shared digest reason code.
    const check = db();
    const grants = check.prepare(`
      SELECT member_id, reason_code, created_at FROM member_tier_grants
      WHERE member_id IN ('mem-digest-path1', 'mem-digest-path2')
        AND reason_code = 'legacy.claim_tier_grant'
      ORDER BY created_at ASC
    `).all() as Array<{ member_id: string; created_at: string }>;
    check.close();
    expect(grants.map((g) => g.member_id).sort()).toEqual(['mem-digest-path1', 'mem-digest-path2']);

    // The digest read query must return both, using bounds derived from the
    // rows themselves (half-open upper bound, hence the +1ms).
    const lower = grants[0].created_at;
    const upper = new Date(new Date(grants[1].created_at).getTime() + 1).toISOString();
    const digestRows = hofBapDigest.listRecentHonorsClaims.all(lower, upper) as Array<{ member_id: string }>;
    const digestMembers = digestRows.map((r) => r.member_id).sort();
    expect(digestMembers).toEqual(['mem-digest-path1', 'mem-digest-path2']);
  });
});
