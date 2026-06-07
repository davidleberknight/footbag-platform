/**
 * Deceased contact-scrub contract: credentials, contact channels, private
 * address lines, demographics, and the legacy contact email clear to NULL
 * while identity (real name, display name, bio, slug), locale, honors, and
 * the legacy and historical-person links stay, so the record keeps honoring
 * the member's contributions; the legacy claim is not released; declared
 * anchors delete; the scrubbed row satisfies the members credential CHECK;
 * one audit row and one erasure-ledger row record the scrub; re-runs are
 * no-ops; a later full purge upgrades the scrub to complete anonymization.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson } from '../fixtures/factories';

const { dbPath } = setTestEnv('3201');

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

function erasureKinds(id: string): string[] {
  const d = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return (d.prepare(`
      SELECT erasure_kind FROM erasure_log
      WHERE entity_type = 'member' AND entity_id = ?
      ORDER BY erasure_kind
    `).all(id) as Array<{ erasure_kind: string }>).map((r) => r.erasure_kind);
  } finally {
    d.close();
  }
}

function seedDeceasedClaimedMember(id: string): { legacyId: string } {
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
    is_deceased: 1,
  });
  d.prepare(`
    UPDATE members SET
      bio = 'a bio', city = 'Boulder', region = 'CO', country = 'US',
      birth_date = '1980-01-01', sex = 'male',
      street_address = '1 Main St', postal_code = '80301',
      phone = '+1 555 0100', whatsapp = '+1 555 0100',
      legacy_email = ?, ifpa_join_date = '1999-05-01',
      stripe_customer_id = ?, deceased_at = '2026-01-01T00:00:00.000Z'
    WHERE id = ?
  `).run(`${id}@legacy.example.com`, `cus_${id}`, id);
  d.close();
  identityAccessService.claimLegacyAccount(id, legacyId);
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

describe('memberService.scrubDeceasedMemberPII', () => {
  it('clears credentials, contact, private address, and demographics; preserves identity, locale, links, and the claim; deletes anchors', () => {
    const { legacyId } = seedDeceasedClaimedMember('scrub-full');

    const result = memberService.scrubDeceasedMemberPII('scrub-full');
    expect(result.status).toBe('scrubbed');
    if (result.status !== 'scrubbed') return;
    expect(result.anchorsDeleted).toBe(2);

    const m = memberRow('scrub-full');
    for (const col of [
      'login_email', 'login_email_normalized', 'email_verified_at',
      'password_hash', 'password_changed_at',
      'phone', 'whatsapp', 'sex', 'birth_date',
      'street_address', 'postal_code', 'legacy_email',
    ]) {
      expect(m[col], col).toBeNull();
    }
    expect(m.personal_data_purged_at).not.toBeNull();
    // Identity, locale, honors metadata, and links keep honoring the member.
    expect(m.real_name).toBe('Legacy scrub-full');
    expect(m.display_name).toBe('Legacy scrub-full');
    expect(m.bio).toBe('a bio');
    expect(m.slug).toBe('slug_scrub_full');
    expect(m.city).toBe('Boulder');
    expect(m.region).toBe('CO');
    expect(m.country).toBe('US');
    expect(m.ifpa_join_date).toBe('1999-05-01');
    expect(m.stripe_customer_id).toBe('cus_scrub-full');
    expect(m.legacy_member_id).toBe(legacyId);
    expect(m.historical_person_id).toBe(`HP-scrub-full`);

    const d = db();
    // The legacy claim stands: a deceased member's account is not released
    // back to the claimable pool.
    const lm = d.prepare('SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?').get(legacyId) as { claimed_by_member_id: string | null };
    expect(lm.claimed_by_member_id).toBe('scrub-full');
    const anchors = d.prepare('SELECT COUNT(*) AS n FROM member_declared_anchors WHERE member_id = ?').get('scrub-full') as { n: number };
    expect(anchors.n).toBe(0);
    const audits = d.prepare(`
      SELECT metadata_json FROM audit_entries
      WHERE entity_id = 'scrub-full' AND action_type = 'member.deceased_pii_scrubbed'
    `).all() as Array<{ metadata_json: string }>;
    d.close();
    expect(audits).toHaveLength(1);
    expect((JSON.parse(audits[0].metadata_json) as Record<string, unknown>).anchors_deleted).toBe(2);
    expect(erasureKinds('scrub-full')).toEqual(['deceased_contact_scrub']);
  });

  it('rejects living members and unknown ids', () => {
    const d = db();
    insertMember(d, { id: 'scrub-living', slug: 'scrub_living' });
    d.close();
    expect(memberService.scrubDeceasedMemberPII('scrub-living').status).toBe('not_deceased');
    expect(memberService.scrubDeceasedMemberPII('no-such-member').status).toBe('not_found');
  });

  it('is idempotent: a second scrub is a no-op', () => {
    seedDeceasedClaimedMember('scrub-idem');
    expect(memberService.scrubDeceasedMemberPII('scrub-idem').status).toBe('scrubbed');
    expect(memberService.scrubDeceasedMemberPII('scrub-idem').status).toBe('already_scrubbed');

    const d = db();
    const audits = d.prepare(`
      SELECT COUNT(*) AS n FROM audit_entries
      WHERE entity_id = 'scrub-idem' AND action_type = 'member.deceased_pii_scrubbed'
    `).get() as { n: number };
    d.close();
    expect(audits.n).toBe(1);
    expect(erasureKinds('scrub-idem')).toEqual(['deceased_contact_scrub']);
  });

  it('a later full purge upgrades a scrubbed row to complete anonymization', () => {
    const { legacyId } = seedDeceasedClaimedMember('scrub-upgrade');
    expect(memberService.scrubDeceasedMemberPII('scrub-upgrade').status).toBe('scrubbed');

    const purge = memberService.purgeAccountPII('scrub-upgrade');
    expect(purge.status).toBe('purged');
    if (purge.status !== 'purged') return;
    expect(purge.clearedLegacyMemberId).toBe(legacyId);

    const m = memberRow('scrub-upgrade');
    expect(m.display_name).toBe('Removed Member');
    expect(m.real_name).toBe('Removed Member');
    expect(m.city).toBeNull();
    expect(m.legacy_member_id).toBeNull();
    expect(m.historical_person_id).toBeNull();
    expect(String(m.slug)).toMatch(/^removed_/);

    const d = db();
    const lm = d.prepare('SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?').get(legacyId) as { claimed_by_member_id: string | null };
    d.close();
    expect(lm.claimed_by_member_id).toBeNull();
    expect(erasureKinds('scrub-upgrade')).toEqual(['account_pii_purge', 'deceased_contact_scrub']);

    // Both shapes applied: every further erasure call is a no-op.
    expect(memberService.purgeAccountPII('scrub-upgrade').status).toBe('already_purged');
    expect(memberService.scrubDeceasedMemberPII('scrub-upgrade').status).toBe('already_purged');
  });
});
