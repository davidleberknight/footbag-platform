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
import {
  insertMember, insertLegacyMember, insertHistoricalPerson, insertOutboxEmail,
} from '../fixtures/factories';

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
    expect(m.real_name).toBe('Deleted Member');
    expect(m.display_name).toBe('Deleted Member');
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
    expect(m.real_name).toBe('Deleted Member');
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

  it('scrubs the free text of every work-queue row about the member, whatever the task type', async () => {
    seedClaimedMember('purge-queue');

    const { workQueueService } = await import('../../src/services/workQueueService');
    workQueueService.enqueue({
      actorId:       'purge-queue',
      queueCategory: 'membership',
      taskType:      'claim_dob_mismatch_review',
      entityType:    'member',
      entityId:      'purge-queue',
      priority:      5,
      reasonText:    'Legacy account LM-x was claimed with a conflicting date of birth.',
      detailText:    'member date 1980-01-01 vs legacy date 1962-01-28',
    });
    identityAccessService.submitLinkHelpRequest('purge-queue', {
      statement: 'I believe record HP-x is mine.',
    });

    expect(memberService.purgeAccountPII('purge-queue').status).toBe('purged');

    const d = db();
    const rows = d.prepare(
      "SELECT task_type, reason_text, detail_text FROM work_queue_items WHERE entity_id = 'purge-queue'",
    ).all() as Array<{ task_type: string; reason_text: string | null; detail_text: string | null }>;
    d.close();
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.reason_text, row.task_type).toBe('(removed on account erasure)');
      expect(row.detail_text, row.task_type).toBeNull();
    }
  });

  it('scrubs every outbound message addressed to the member, keeping only the member link', () => {
    seedClaimedMember('purge-outbox');
    const other = 'purge-outbox-bystander';
    const d = db();
    insertMember(d, { id: other, slug: 'purge_outbox_other', login_email: `${other}@example.com` });
    insertOutboxEmail(d, {
      id: 'ob-erased', recipient_member_id: 'purge-outbox',
      recipient_email: 'purge-outbox@example.com',
      // A real subject that names the member, which is why the subject cannot
      // simply be preserved.
      subject: 'Legacy purge-outbox joined Boulder Footbag',
      body_text: 'Visit https://example.com/password/reset/live-token to continue.',
    });
    insertOutboxEmail(d, {
      id: 'ob-untouched', recipient_member_id: other,
      recipient_email: `${other}@example.com`,
      subject: 'Someone else mail', body_text: 'not theirs',
    });
    d.close();

    expect(memberService.purgeAccountPII('purge-outbox').status).toBe('purged');

    const r = db();
    const erased = r.prepare('SELECT * FROM outbox_emails WHERE id = ?').get('ob-erased') as Record<string, unknown>;
    const kept   = r.prepare('SELECT * FROM outbox_emails WHERE id = ?').get('ob-untouched') as Record<string, unknown>;
    r.close();

    expect(erased.recipient_email).toBeNull();
    expect(erased.body_text).toBeNull();
    expect(erased.subject).toBe('(subject removed on erasure)');
    // The member link is what keeps the row's addressing CHECK satisfied, and
    // what any later re-run of the erasure finds it by.
    expect(erased.recipient_member_id).toBe('purge-outbox');

    // Another member's message is untouched.
    expect(kept.recipient_email).toBe(`${other}@example.com`);
    expect(kept.body_text).toBe('not theirs');
  });

  // Leaving a scrubbed row waiting to go out hands the sender a message with no
  // address, which fails every attempt until it dead-letters and lights the
  // operator's attention badge over an erasure that worked as intended.
  it('settles a message still waiting to go out, so it cannot churn into the dead-letter queue', () => {
    seedClaimedMember('purge-pending');
    const d = db();
    insertOutboxEmail(d, {
      id: 'ob-pending', recipient_member_id: 'purge-pending',
      recipient_email: 'purge-pending@example.com',
      subject: 'Still queued', body_text: 'not sent yet', status: 'pending',
    });
    insertOutboxEmail(d, {
      id: 'ob-already-sent', recipient_member_id: 'purge-pending',
      recipient_email: 'purge-pending@example.com',
      subject: 'Already gone', body_text: 'delivered', status: 'sent',
    });
    d.close();

    expect(memberService.purgeAccountPII('purge-pending').status).toBe('purged');

    const r = db();
    const pending = r.prepare('SELECT status, last_error FROM outbox_emails WHERE id = ?')
      .get('ob-pending') as Record<string, unknown>;
    const sent = r.prepare('SELECT status FROM outbox_emails WHERE id = ?')
      .get('ob-already-sent') as Record<string, unknown>;
    r.close();

    expect(pending.status).toBe('failed');
    expect(pending.last_error).toBe('recipient erased before delivery');
    // A message that already went out keeps its history; only its content goes.
    expect(sent.status).toBe('sent');
  });

});
