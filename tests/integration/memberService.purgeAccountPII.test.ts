/**
 * Row-level PII purge contract: credentials, contact fields, location,
 * birth date, and legacy metadata clear to NULL; identity placeholders
 * anonymize (HoF/BAP rows keep display_name and bio); the legacy and
 * historical-person links sever and the claimed legacy_members row returns
 * to the claimable pool while its snapshot survives; every declared anchor
 * deletes; the purged row satisfies the members credential CHECK; the
 * freed login_email becomes reusable; one audit row records the clearing;
 * a re-run is an 'already_purged' no-op.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson } from '../fixtures/factories';

const { dbPath } = setTestEnv('3092');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let memberService: typeof import('../../src/services/memberService').memberService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let identityAccessService: typeof import('../../src/services/identityAccessService').identityAccessService;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  memberService = (await import('../../src/services/memberService')).memberService;
  identityAccessService = (await import('../../src/services/identityAccessService')).identityAccessService;
});

afterAll(() => cleanupTestDb(dbPath));

function db(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

function memberRow(id: string): Record<string, unknown> {
  const d = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return d.prepare('SELECT * FROM members WHERE id = ?').get(id) as Record<string, unknown>;
  } finally {
    d.close();
  }
}

function seedClaimedMember(id: string, opts: { isHof?: 0 | 1 } = {}): { legacyId: string } {
  const d = db();
  const legacyId = `LM-${id}`;
  insertLegacyMember(d, {
    legacy_member_id: legacyId,
    legacy_email: `${id}@legacy.example.com`,
    real_name: `Legacy ${id}`,
    display_name: `Legacy ${id}`,
  });
  insertHistoricalPerson(d, {
    person_id: `HP-${id}`, person_name: `Legacy ${id}`, legacy_member_id: legacyId,
  });
  insertMember(d, {
    id, slug: `slug_${id.replace(/-/g, '_')}`,
    login_email: `${id}@example.com`,
    real_name: `Legacy ${id}`, display_name: `Legacy ${id}`,
    is_hof: opts.isHof ?? 0,
  });
  d.prepare(`
    UPDATE members SET
      bio = 'a bio', city = 'Boulder', region = 'CO', country = 'US',
      birth_date = '1980-01-01', street_address = '1 Main St', postal_code = '80301',
      deleted_at = '2026-01-01T00:00:00.000Z', deleted_by = ?
    WHERE id = ?
  `).run(id, id);
  d.close();
  identityAccessService.claimLegacyAccount(id, legacyId);
  // Declared anchors that must vanish on purge.
  d.close;
  const d2 = db();
  d2.prepare(`
    INSERT INTO member_declared_anchors
      (id, created_at, created_by, updated_at, updated_by, member_id, anchor_type, anchor_value)
    VALUES
      (?, '2026-01-01T00:00:00.000Z', ?, '2026-01-01T00:00:00.000Z', ?, ?, 'former_surname', 'maidenname'),
      (?, '2026-01-01T00:00:00.000Z', ?, '2026-01-01T00:00:00.000Z', ?, ?, 'old_email', 'old@example.com')
  `).run(`anch-1-${id}`, id, id, id, `anch-2-${id}`, id, id, id);
  d2.close();
  return { legacyId };
}

describe('memberService.purgeAccountPII', () => {
  it('clears credentials, contact, location, legacy metadata; anonymizes identity; severs links; deletes anchors', () => {
    const { legacyId } = seedClaimedMember('purge-full');

    const result = memberService.purgeAccountPII('purge-full');
    expect(result.status).toBe('purged');
    if (result.status !== 'purged') return;
    expect(result.clearedLegacyMemberId).toBe(legacyId);
    expect(result.anchorsDeleted).toBe(2);
    expect(result.honorsPreserved).toBe(false);

    const m = memberRow('purge-full');
    for (const col of [
      'login_email', 'login_email_normalized', 'email_verified_at',
      'password_hash', 'password_changed_at',
      'city', 'region', 'country', 'birth_date',
      'street_address', 'postal_code',
      'legacy_user_id', 'legacy_email', 'legacy_member_id', 'historical_person_id',
      'stripe_customer_id',
    ]) {
      expect(m[col], col).toBeNull();
    }
    // bio is NOT NULL by schema; non-honor purge anonymizes it to empty.
    expect(m.bio).toBe('');
    expect(m.personal_data_purged_at).not.toBeNull();
    expect(m.real_name).toBe('Removed Member');
    expect(m.display_name).toBe('Removed Member');
    expect(String(m.slug)).toMatch(/^removed_/);

    // The legacy snapshot row survives, back in the claimable pool.
    const d = db();
    const lm = d.prepare('SELECT * FROM legacy_members WHERE legacy_member_id = ?').get(legacyId) as Record<string, unknown>;
    expect(lm).toBeDefined();
    expect(lm.claimed_by_member_id).toBeNull();
    expect(lm.claimed_at).toBeNull();
    const anchors = d.prepare('SELECT COUNT(*) AS n FROM member_declared_anchors WHERE member_id = ?').get('purge-full') as { n: number };
    expect(anchors.n).toBe(0);
    const audits = d.prepare(`
      SELECT metadata_json FROM audit_entries
      WHERE entity_id = 'purge-full' AND action_type = 'member.pii_purged'
    `).all() as Array<{ metadata_json: string }>;
    d.close();
    expect(audits).toHaveLength(1);
    const meta = JSON.parse(audits[0].metadata_json) as Record<string, unknown>;
    expect(meta.cleared_legacy_member_id).toBe(legacyId);
    expect(meta.anchors_deleted).toBe(2);
  });

  it('HoF rows keep display_name and bio; credentials still clear', () => {
    seedClaimedMember('purge-hof', { isHof: 1 });

    const result = memberService.purgeAccountPII('purge-hof');
    expect(result.status).toBe('purged');
    if (result.status !== 'purged') return;
    expect(result.honorsPreserved).toBe(true);

    const m = memberRow('purge-hof');
    expect(m.display_name).toBe('Legacy purge-hof');
    expect(m.bio).toBe('a bio');
    expect(m.is_hof).toBe(1);
    expect(m.login_email).toBeNull();
    expect(m.password_hash).toBeNull();
    expect(m.real_name).toBe('Removed Member');
    expect(m.street_address).toBeNull();
  });

  it('frees the login_email for reuse by a new account', () => {
    seedClaimedMember('purge-reuse');
    expect(memberService.purgeAccountPII('purge-reuse').status).toBe('purged');

    const d = db();
    expect(() =>
      insertMember(d, {
        id: 'purge-reuse-successor', slug: 'purge_reuse_successor',
        login_email: 'purge-reuse@example.com',
        real_name: 'Successor', display_name: 'Successor',
      }),
    ).not.toThrow();
    d.close();
  });

  it('redacts member contact-request free text in work_queue_items on purge', () => {
    seedClaimedMember('purge-contact');
    const d = db();
    d.prepare(`
      INSERT INTO work_queue_items
        (id, created_at, created_by, updated_at, updated_by, version,
         queue_category, task_type, entity_type, entity_id,
         status, priority, opened_at, reason_text, detail_text)
      VALUES (?, ?, ?, ?, ?, 1, 'membership', 'member_contact_request', 'member', ?, 'open', 5, ?, ?, ?)
    `).run(
      'wq-purge-contact', '2026-01-01T00:00:00.000Z', 'purge-contact',
      '2026-01-01T00:00:00.000Z', 'purge-contact', 'purge-contact',
      '2026-01-01T00:00:00.000Z', 'Other: my secret message', 'my secret message in full',
    );
    d.close();

    expect(memberService.purgeAccountPII('purge-contact').status).toBe('purged');

    const r = new BetterSqlite3(dbPath, { readonly: true });
    const row = r.prepare('SELECT reason_text, detail_text FROM work_queue_items WHERE id = ?')
      .get('wq-purge-contact') as { reason_text: string; detail_text: string | null };
    r.close();
    expect(row.detail_text).toBeNull();
    expect(row.reason_text).not.toContain('secret');
  });

  it('is idempotent and anti-revealing on unknown ids', () => {
    seedClaimedMember('purge-idem');
    expect(memberService.purgeAccountPII('purge-idem').status).toBe('purged');
    expect(memberService.purgeAccountPII('purge-idem').status).toBe('already_purged');
    expect(memberService.purgeAccountPII('no-such-member').status).toBe('not_found');

    const d = db();
    const audits = d.prepare(`
      SELECT COUNT(*) AS n FROM audit_entries
      WHERE entity_id = 'purge-idem' AND action_type = 'member.pii_purged'
    `).get() as { n: number };
    d.close();
    expect(audits.n).toBe(1);
  });
});
