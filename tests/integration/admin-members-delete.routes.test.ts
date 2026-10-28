/**
 * An administrator deleting a registration that broke the rules, from the
 * administrator member record.
 *
 * The contract: the deletion is previewed, takes a mandatory reason, and runs
 * the same deletion a member's own request runs (media gone at once, upcoming
 * registrations withdrawn, queued mail stopped, the account unable to sign in),
 * except that a recurring gift always ends, the audit row names the
 * administrator and their reason, and the member is sent the administrator's
 * notice carrying that reason instead of the self-service confirmation. An
 * administrator's account, the platform's own account and an account already
 * deleted are refused, and the record offers no control for them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMediaItem,
  insertEvent,
  insertRegistration,
  insertRecurringDonationSubscription,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';
import { flashValueOf } from '../fixtures/flashCookie';

const { dbPath } = setTestEnv('4741');
process.env.PAYMENT_ADAPTER = 'stub';

const ADMIN_ID = 'amd_admin';
const OTHER_ADMIN_ID = 'amd_admin_2';
// The schema allows one system account, so the suite seeds it once.
const SYSTEM_ID = 'amd_system';
const REASON = 'Registered as "Mickey Mouse", not a real full name';

let createApp: Awaited<ReturnType<typeof importApp>>;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function adminCookie(adminId = ADMIN_ID): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: adminId, role: 'admin' })}`;
}

let n = 0;
function seedMember(o: { isAdmin?: 0 | 1; isDeceased?: 0 | 1 } = {}): string {
  n += 1;
  return withDb((db) => {
    const id = insertMember(db, {
      id: `amd-mem-${n}`, slug: `amd_mem_${n}`, display_name: `Bogus ${n}`,
      login_email: `amd-mem-${n}@example.com`, is_admin: o.isAdmin ?? 0, is_deceased: o.isDeceased ?? 0,
    });
    completeOnboarding(db, id);
    return id;
  });
}

function preview(memberId: string, reason = REASON) {
  return request(createApp()).post(`/admin/members/${memberId}/delete`)
    .set('Cookie', adminCookie()).type('form').send({ reason });
}

function confirm(memberId: string, reason = REASON, adminId = ADMIN_ID) {
  return request(createApp()).post(`/admin/members/${memberId}/delete/confirm`)
    .set('Cookie', adminCookie(adminId)).type('form').send({ reason });
}

function outcomeOf(res: Parameters<typeof flashValueOf>[0]): string | undefined {
  return flashValueOf(res)?.split(':').pop();
}

function memberRow(id: string): { deleted_at: string | null; deleted_by: string | null; updated_by: string } {
  return withDb((db) => db.prepare('SELECT deleted_at, deleted_by, updated_by FROM members WHERE id = ?')
    .get(id) as { deleted_at: string | null; deleted_by: string | null; updated_by: string });
}

function deletionAudits(id: string): Array<{ actor_type: string; actor_member_id: string; reason_text: string | null }> {
  return withDb((db) => db.prepare(
    "SELECT actor_type, actor_member_id, reason_text FROM audit_entries WHERE action_type = 'auth.account_deleted' AND entity_id = ?",
  ).all(id) as Array<{ actor_type: string; actor_member_id: string; reason_text: string | null }>);
}

function mailTo(id: string): Array<{ template_key: string; body_text: string }> {
  return withDb((db) => db.prepare(
    'SELECT template_key, body_text FROM outbox_emails WHERE recipient_member_id = ?',
  ).all(id) as Array<{ template_key: string; body_text: string }>);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'amd_admin', login_email: 'amd-admin@example.com', is_admin: 1 });
  insertMember(db, { id: OTHER_ADMIN_ID, slug: 'amd_admin_2', login_email: 'amd-admin-2@example.com', is_admin: 1 });
  insertMember(db, { id: SYSTEM_ID, slug: 'amd_system', login_email: 'amd-system@example.com', is_system: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the record and the preview', () => {
  // Defect caught: the control is missing from an ordinary member's record, or
  // offered on an account the deletion would refuse.
  it('offers the control on an ordinary member and not on an administrator or the system account', async () => {
    const plain = seedMember();
    const admin = seedMember({ isAdmin: 1 });
    const system = SYSTEM_ID;
    const get = (id: string) => request(createApp()).get(`/admin/members/${id}`).set('Cookie', adminCookie());

    expect((await get(plain)).text).toContain(`action="/admin/members/${plain}/delete"`);
    expect((await get(admin)).text).not.toContain(`action="/admin/members/${admin}/delete"`);
    expect((await get(system)).text).not.toContain(`action="/admin/members/${system}/delete"`);
  });

  // Defect caught: the preview deletes, or confirms with no reason to carry.
  it('previews with the reason carried to the confirm form, and writes nothing', async () => {
    const id = seedMember();
    const res = await preview(id);
    expect(res.status).toBe(200);
    expect(res.text).toContain(`action="/admin/members/${id}/delete/confirm"`);
    expect(res.text).toContain('name="reason"');
    expect(memberRow(id).deleted_at).toBeNull();
  });

  // Defect caught: a deletion with no reason leaves the member's email and the
  // audit row with nothing to say why.
  it('refuses a blank reason at preview and at confirm, and writes nothing', async () => {
    const id = seedMember();
    expect((await preview(id, '   ')).status).toBe(422);
    expect((await confirm(id, '')).status).toBe(422);
    expect(memberRow(id).deleted_at).toBeNull();
    expect(deletionAudits(id)).toHaveLength(0);
  });
});

describe('the deletion', () => {
  // Defect caught: the account is deleted under the member's name, with the
  // self-service email thanking them for a request they never made.
  it('deletes the account and its media, records the administrator and reason, and sends the administrator notice', async () => {
    const id = seedMember();
    const seeded = withDb((db) => {
      const mediaId = insertMediaItem(db, { uploader_member_id: id, s3_key_thumb: 'thumb/amd.jpg', s3_key_display: 'disp/amd.jpg' });
      const eventId = insertEvent(db, { start_date: '2099-03-03' });
      insertRegistration(db, eventId, id, { status: 'confirmed' });
      return { mediaId, eventId };
    });

    const res = await confirm(id);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/admin/members/${id}`);
    expect(outcomeOf(res)).toBe('account_deleted');

    const row = memberRow(id);
    expect(row.deleted_at).not.toBeNull();
    expect(row.deleted_by).toBe(ADMIN_ID);
    expect(row.updated_by).toBe(ADMIN_ID);

    withDb((db) => {
      expect(db.prepare('SELECT 1 FROM media_items WHERE id = ?').get(seeded.mediaId)).toBeUndefined();
      const reg = db.prepare('SELECT status FROM registrations WHERE member_id = ? AND event_id = ?')
        .get(id, seeded.eventId) as { status: string };
      expect(reg.status).toBe('canceled');
    });

    expect(deletionAudits(id)).toEqual([{ actor_type: 'admin', actor_member_id: ADMIN_ID, reason_text: REASON }]);

    const mail = mailTo(id);
    expect(mail.map((m) => m.template_key)).toEqual(['account_deleted_by_admin']);
    expect(mail[0].body_text).toContain(REASON);
  });

  // Defect caught: deleting the account of a member marked deceased emails
  // their family a notice addressed to the dead member.
  it('deletes a deceased member\'s account without emailing them', async () => {
    const id = seedMember({ isDeceased: 1 });

    const res = await confirm(id);
    expect(outcomeOf(res)).toBe('account_deleted');
    expect(memberRow(id).deleted_at).not.toBeNull();
    expect(mailTo(id)).toHaveLength(0);
  });

  // Defect caught: a bogus account's recurring gift keeps charging after the
  // account is gone, or its cancellation reads in the ledger as the member's.
  it('ends a recurring gift, recorded as the administrator\'s act', async () => {
    const id = seedMember();
    const subId = withDb((db) => insertRecurringDonationSubscription(db, { member_id: id, status: 'active' }));

    await confirm(id);
    withDb((db) => {
      const sub = db.prepare('SELECT is_cancel_at_period_end FROM recurring_donation_subscriptions WHERE id = ?')
        .get(subId) as { is_cancel_at_period_end: number };
      expect(sub.is_cancel_at_period_end).toBe(1);
      const audit = db.prepare(
        "SELECT actor_type, actor_member_id FROM audit_entries WHERE action_type = 'payment.recurring_cancel_requested' AND entity_id = ?",
      ).get(subId) as { actor_type: string; actor_member_id: string };
      expect(audit).toEqual({ actor_type: 'admin', actor_member_id: ADMIN_ID });
    });
  });

  // Defect caught: a double submit reports nothing happened, or writes a second
  // audit row and a second email.
  it('reports the first outcome to the same administrator submitting again, with nothing more written or sent', async () => {
    const id = seedMember();
    expect(outcomeOf(await confirm(id))).toBe('account_deleted');
    expect(outcomeOf(await confirm(id))).toBe('account_deleted');
    expect(deletionAudits(id)).toHaveLength(1);
    expect(mailTo(id)).toHaveLength(1);
  });

  // Defect caught: a deletion another administrator made is reported as this
  // one's success, claiming a change nobody here made.
  it('reports an account another administrator deleted as already deleted', async () => {
    const id = seedMember();
    await confirm(id, REASON, OTHER_ADMIN_ID);
    const res = await confirm(id);
    expect(res.status).toBe(303);
    expect(outcomeOf(res)).toBe('account_already_deleted');
    expect(deletionAudits(id)).toHaveLength(1);
  });

  // Defect caught: an account whose personal data was already erased is
  // offered for deletion, or deleted, a second erasure of nothing.
  it('neither offers nor performs deletion on an erased account', async () => {
    const id = withDb((db) => insertMember(db, {
      id: 'amd-purged', slug: 'amd_purged', personal_data_purged_at: '2026-01-01T00:00:00.000Z',
    }));
    const record = await request(createApp()).get(`/admin/members/${id}`).set('Cookie', adminCookie());
    expect(record.status).toBe(200);
    expect(record.text).not.toContain(`action="/admin/members/${id}/delete"`);
    expect((await confirm(id)).status).toBe(422);
    expect(deletionAudits(id)).toHaveLength(0);
  });

  // Defect caught: the member's own deletion lands while the administrator's
  // is removing media, and the administrator's then stops the member's own
  // confirmation email as if it were stale queued mail.
  it('leaves a deletion the member made meanwhile, and its email, exactly as they landed', async () => {
    const id = seedMember();
    const slug = withDb((db) => (db.prepare('SELECT slug FROM members WHERE id = ?').get(id) as { slug: string }).slug);
    withDb((db) => insertMediaItem(db, { uploader_member_id: id, s3_key_thumb: 'thumb/race.jpg' }));

    const storageMod = await import('../../src/adapters/mediaStorageAdapter');
    const realStorage = storageMod.getMediaStorageAdapter();
    let raced = false;
    storageMod.setMediaStorageAdapterForTests({
      ...realStorage,
      // The administrator's request reaches storage first; the member's own
      // deletion runs to completion inside that await.
      delete: async (key: string) => {
        if (!raced) {
          raced = true;
          await request(createApp()).post(`/members/${slug}/delete`)
            .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: id })}`)
            .type('form').send({ confirmed: '1' });
        }
        await realStorage.delete(key);
      },
    });
    try {
      const res = await confirm(id);
      expect(outcomeOf(res)).toBe('account_already_deleted');
    } finally {
      storageMod.resetMediaStorageAdapterForTests();
    }

    expect(deletionAudits(id)).toEqual([{ actor_type: 'member', actor_member_id: id, reason_text: null }]);
    const mail = withDb((db) => db.prepare(
      'SELECT template_key, status FROM outbox_emails WHERE recipient_member_id = ?',
    ).all(id) as Array<{ template_key: string; status: string }>);
    expect(mail).toEqual([{ template_key: 'account_deletion_requested', status: 'pending' }]);
  });

  // Defect caught: a crafted request deletes an administrator, leaving the
  // role on a row no screen offers, or deletes the account curated media is
  // attributed to.
  it('refuses an administrator and the system account, and writes nothing', async () => {
    for (const id of [seedMember({ isAdmin: 1 }), SYSTEM_ID]) {
      const res = await confirm(id);
      expect(res.status, id).toBe(422);
      expect(memberRow(id).deleted_at, id).toBeNull();
      expect(deletionAudits(id), id).toHaveLength(0);
    }
  });
});
