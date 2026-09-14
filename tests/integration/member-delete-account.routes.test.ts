/**
 * Member self-service account deletion.
 *
 * The contract: a member may delete their own account and nobody else's; the
 * account enters a grace-period deleted state rather than vanishing; their
 * uploaded media and galleries are removed permanently at the moment of the
 * request; upcoming event registrations are withdrawn; mail still queued to them
 * is stopped; an event left with no organizer is raised for an administrator;
 * an honoree's record goes on publishing; and an administrator is refused until
 * the role has been taken off their account.
 *
 * Every database read here opens its own short-lived connection. A handle held
 * open for the length of the file sits against the same file the running app
 * writes through, and the request blocks rather than failing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { expectCsrfReject } from '../fixtures/expectCsrfReject';
import {
  insertMember,
  insertMediaItem,
  insertMemberGallery,
  insertOutboxEmail,
  insertEvent,
  insertRegistration,
  insertEventOrganizer,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4184');

let createApp: Awaited<ReturnType<typeof importApp>>;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function makeMember(opts: { slug: string; isAdmin?: 0 | 1; isHof?: 0 | 1 }): string {
  return withDb((db) => {
    const id = insertMember(db, {
      slug:         opts.slug,
      display_name: opts.slug,
      login_email:  `${opts.slug}@example.com`,
      is_admin:     opts.isAdmin ?? 0,
      is_hof:       opts.isHof ?? 0,
    });
    completeOnboarding(db, id);
    return id;
  });
}

function deletedAtOf(memberId: string): string | null {
  return withDb((db) => (db.prepare('SELECT deleted_at FROM members WHERE id = ?')
    .get(memberId) as { deleted_at: string | null }).deleted_at);
}

async function deleteAccount(slug: string, memberId: string) {
  return request(createApp())
    .post(`/members/${slug}/delete`)
    .set('Cookie', cookieFor(memberId))
    .type('form')
    .send({ confirmed: '1' });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the confirmation screen', () => {
  it('is shown to the account holder', async () => {
    const slug = 'del_owner_sees';
    const id = makeMember({ slug });
    const res = await request(createApp()).get(`/members/${slug}/delete`).set('Cookie', cookieFor(id));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Yes, Delete My Account');
    expect(res.text).toContain('Deleting your account is permanent');
    // The site offers no restore, so no surface may imply one.
    expect(res.text).not.toMatch(/restore/i);
  });

  it('answers not-found for a member asking about someone else, rather than forbidden', async () => {
    makeMember({ slug: 'del_other_owner' });
    const nosy = makeMember({ slug: 'del_other_nosy' });
    const res = await request(createApp())
      .get('/members/del_other_owner/delete')
      .set('Cookie', cookieFor(nosy));
    expect(res.status).toBe(404);
  });

  it('offers the keep-or-end choice only when a recurring gift is running', async () => {
    const slug = 'del_no_gift';
    const id = makeMember({ slug });
    const res = await request(createApp()).get(`/members/${slug}/delete`).set('Cookie', cookieFor(id));
    expect(res.text).not.toContain('recurringDonation');
  });

  it('refuses an administrator and names what has to happen first', async () => {
    const slug = 'del_admin_blocked';
    const id = makeMember({ slug, isAdmin: 1 });
    const res = await request(createApp()).get(`/members/${slug}/delete`).set('Cookie', cookieFor(id));
    expect(res.status).toBe(200);
    expect(res.text).toContain('cannot be deleted yet');
    expect(res.text).not.toContain('Yes, Delete My Account');
  });
});

describe('the deletion itself', () => {
  it('takes the account, its media, its galleries, its queued mail and its upcoming registrations', async () => {
    const slug = 'del_full_sweep';
    const id = makeMember({ slug });
    const seeded = withDb((db) => {
      const mediaId   = insertMediaItem(db, { uploader_member_id: id, s3_key_thumb: 'thumb/a.jpg', s3_key_display: 'disp/a.jpg' });
      const galleryId = insertMemberGallery(db, { owner_member_id: id });
      const outboxId  = insertOutboxEmail(db, { recipient_member_id: id, recipient_email: 'queued@example.com', status: 'pending' });
      const eventId   = insertEvent(db, { start_date: '2099-01-01' });
      insertRegistration(db, eventId, id, { status: 'confirmed' });
      return { mediaId, galleryId, outboxId, eventId };
    });

    const res = await deleteAccount(slug, id);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Your account is deleted');
    expect(res.text).toContain('cannot be undone');
    expect(res.text).not.toMatch(/restore/i);

    withDb((db) => {
      const member = db.prepare(
        'SELECT deleted_at, deletion_requested_at, deletion_grace_expires_at FROM members WHERE id = ?',
      ).get(id) as { deleted_at: string | null; deletion_requested_at: string | null; deletion_grace_expires_at: string | null };
      expect(member.deleted_at).not.toBeNull();
      expect(member.deletion_requested_at).not.toBeNull();
      expect(member.deletion_grace_expires_at).not.toBeNull();

      expect(db.prepare('SELECT 1 FROM media_items WHERE id = ?').get(seeded.mediaId)).toBeUndefined();
      expect(db.prepare('SELECT 1 FROM member_galleries WHERE id = ?').get(seeded.galleryId)).toBeUndefined();

      const queued = db.prepare('SELECT status, last_error, body_text FROM outbox_emails WHERE id = ?')
        .get(seeded.outboxId) as { status: string; last_error: string | null; body_text: string | null };
      expect(queued.status).toBe('dead_letter');
      expect(queued.last_error).toBe('recipient_soft_deleted');
      expect(queued.body_text).toBeNull();

      const reg = db.prepare('SELECT status FROM registrations WHERE member_id = ? AND event_id = ?')
        .get(id, seeded.eventId) as { status: string };
      expect(reg.status).toBe('canceled');

      expect(db.prepare(
        "SELECT 1 FROM audit_entries WHERE action_type = 'auth.account_deleted' AND entity_id = ?",
      ).get(id)).toBeTruthy();
    });
  });

  it('sends the member the one message telling them the window exists', async () => {
    const slug = 'del_sends_notice';
    const id = makeMember({ slug });
    await deleteAccount(slug, id);

    const sent = withDb((db) => db.prepare(
      "SELECT status FROM outbox_emails WHERE recipient_member_id = ? AND template_key = 'account_deletion_requested'",
    ).get(id) as { status: string } | undefined);
    expect(sent).toBeTruthy();
    expect(sent!.status).toBe('pending');
  });

  it('leaves the member unable to reach anything but the sign-in page afterwards', async () => {
    const slug = 'del_locked_out';
    const id = makeMember({ slug });
    const cookie = cookieFor(id);
    await deleteAccount(slug, id);

    const profile = await request(createApp()).get(`/members/${slug}`).set('Cookie', cookie);
    expect(profile.status).not.toBe(200);
    const edit = await request(createApp()).get(`/members/${slug}/edit`).set('Cookie', cookie);
    expect(edit.status).not.toBe(200);
  });

  it('raises one administrator card for an event whose last organizer has gone', async () => {
    const slug = 'del_last_organizer';
    const id = makeMember({ slug });
    const eventId = withDb((db) => {
      const e = insertEvent(db, { start_date: '2099-02-02' });
      insertEventOrganizer(db, e, id);
      return e;
    });

    await deleteAccount(slug, id);

    const items = withDb((db) => db.prepare(
      "SELECT queue_category, status FROM work_queue_items WHERE task_type = 'needs_organizer' AND entity_id = ?",
    ).all(eventId) as { queue_category: string; status: string }[]);
    expect(items).toHaveLength(1);
    expect(items[0].queue_category).toBe('events');
    expect(items[0].status).toBe('open');
  });

  it('leaves an event alone while another live organizer remains', async () => {
    const leaving = makeMember({ slug: 'del_co_organizer_a' });
    const staying = makeMember({ slug: 'del_co_organizer_b' });
    const eventId = withDb((db) => {
      const e = insertEvent(db, { start_date: '2099-03-03' });
      insertEventOrganizer(db, e, leaving);
      insertEventOrganizer(db, e, staying, { role: 'co-organizer' });
      return e;
    });

    await deleteAccount('del_co_organizer_a', leaving);

    const items = withDb((db) => db.prepare(
      "SELECT id FROM work_queue_items WHERE task_type = 'needs_organizer' AND entity_id = ?",
    ).all(eventId));
    expect(items).toHaveLength(0);
  });

  it('keeps an honoree publishing after their account goes', async () => {
    const slug = 'del_honoree';
    const id = makeMember({ slug, isHof: 1 });
    await deleteAccount(slug, id);

    withDb((db) => {
      expect(db.prepare('SELECT id FROM members_of_record WHERE id = ?').get(id)).toBeTruthy();
      expect(db.prepare('SELECT id FROM members_active WHERE id = ?').get(id)).toBeUndefined();
    });
  });

  it('refuses an administrator at the write, not only on the screen', async () => {
    const slug = 'del_admin_post';
    const id = makeMember({ slug, isAdmin: 1 });
    const res = await deleteAccount(slug, id);

    expect(res.status).toBe(422);
    expect(res.text).toContain('administrator role');
    expect(deletedAtOf(id)).toBeNull();
  });

  it('shows the confirmation instead of deleting when the request does not carry the confirmation', async () => {
    const slug = 'del_unconfirmed';
    const id = makeMember({ slug });
    const res = await request(createApp()).post(`/members/${slug}/delete`)
      .set('Cookie', cookieFor(id)).type('form').send({});

    expect(res.status).toBe(200);
    expect(res.text).toContain('Yes, Delete My Account');
    expect(deletedAtOf(id)).toBeNull();
  });

  it('cannot be driven from another member session', async () => {
    const owner = makeMember({ slug: 'del_xowner' });
    const nosy  = makeMember({ slug: 'del_xnosy' });
    const res = await deleteAccount('del_xowner', nosy);

    expect(res.status).toBe(404);
    expect(deletedAtOf(owner)).toBeNull();
  });
});

describe('cross-origin protection', () => {
  it('refuses a deletion posted from another origin', async () => {
    const slug = 'del_csrf';
    const id = makeMember({ slug });
    await expectCsrfReject(createApp(), 'post', `/members/${slug}/delete`, {
      cookie: cookieFor(id),
      body:   { confirmed: '1' },
    });
    expect(deletedAtOf(id)).toBeNull();
  });
});
