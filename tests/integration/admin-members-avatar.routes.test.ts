/**
 * Administrator removal of a member's profile picture, from the member record.
 *
 * This surface is the second door onto the one takedown: an administrator
 * standing on a member's record has no report in front of them, and that is the
 * only difference from deciding a reported item on the queue. So the suite pins
 * that both doors end in the same state, that the picture leaves the profile
 * rather than merely leaving the queue, that the reason is mandatory and
 * recorded, and that the mail does not claim a report nobody filed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp, seedEmailTemplates } from '../fixtures/testDb';
import { insertMember, completeOnboarding, insertMediaItem, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3437');

const ADMIN_ID = 'av_admin';
const WITH_PICTURE_ID = 'av_pictured';
const NO_PICTURE_ID = 'av_bare';
const SECOND_ID = 'av_second';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: WITH_PICTURE_ID, role: 'member' })}`;
}

function db<T>(fn: (conn: BetterSqlite3.Database) => T): T {
  const conn = new BetterSqlite3(dbPath);
  try {
    return fn(conn);
  } finally {
    conn.close();
  }
}

function seedAvatar(memberId: string, mediaId: string): void {
  db((conn) => {
    insertMediaItem(conn, {
      id: mediaId,
      uploader_member_id: memberId,
      is_avatar: 1,
      s3_key_thumb: `avatars/${memberId}/thumb.jpg`,
      s3_key_display: `avatars/${memberId}/display.jpg`,
      caption: null,
    });
  });
}

function mediaStatus(mediaId: string): string | undefined {
  const row = db((conn) =>
    conn.prepare('SELECT moderation_status FROM media_items WHERE id = ?').get(mediaId)) as
    { moderation_status: string } | undefined;
  return row?.moderation_status;
}

function avatarPointer(memberId: string): string | null {
  const row = db((conn) =>
    conn.prepare('SELECT avatar_media_id FROM members WHERE id = ?').get(memberId)) as
    { avatar_media_id: string | null };
  return row.avatar_media_id;
}

async function removePicture(memberId: string, reason: string): Promise<request.Response> {
  return request(createApp())
    .post(`/admin/members/${memberId}/avatar/remove/confirm`)
    .set('Cookie', adminCookie())
    .type('form')
    .send({ reason });
}

beforeAll(async () => {
  const conn = createTestDb(dbPath);
  seedEmailTemplates(conn);
  insertMember(conn, {
    id: ADMIN_ID, slug: 'av-admin', display_name: 'Ada Admin', real_name: 'Ada Admin',
    login_email: 'av-admin@example.com', is_admin: 1,
  });
  for (const [id, slug, name] of [
    [WITH_PICTURE_ID, 'av-pictured', 'Pia Pictured'],
    [NO_PICTURE_ID, 'av-bare', 'Bo Bare'],
    [SECOND_ID, 'av-second', 'Sam Second'],
  ] as const) {
    insertMember(conn, {
      id, slug, display_name: name, real_name: name, login_email: `${id}@example.com`,
    });
  }
  for (const id of [ADMIN_ID, WITH_PICTURE_ID, NO_PICTURE_ID, SECOND_ID]) completeOnboarding(conn, id);
  seedAvatar(WITH_PICTURE_ID, 'av_media_1');
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the member record offers the control only when a picture is on the profile', () => {
  it('offers it for a member who has one', async () => {
    const res = await request(createApp())
      .get(`/admin/members/${WITH_PICTURE_ID}`)
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Remove the Profile Picture');
    expect(res.text).toContain(`/admin/members/${WITH_PICTURE_ID}/avatar/remove`);
  });

  it('omits it for a member who has none', async () => {
    const res = await request(createApp())
      .get(`/admin/members/${NO_PICTURE_ID}`)
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Remove the Profile Picture');
  });
});

describe('the preview writes nothing', () => {
  it('renders the confirmation carrying the reason, leaving the picture in place', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${WITH_PICTURE_ID}/avatar/remove`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'Impersonates another player.' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Impersonates another player.');
    expect(res.text).toContain('Yes, Remove the Picture');
    expect(mediaStatus('av_media_1')).toBe('active');
    expect(avatarPointer(WITH_PICTURE_ID)).toBe('av_media_1');
  });

  // The warning tone is reserved for corrections that repeating cannot undo, so
  // that it still carries weight where it appears. A reversible correction
  // showing the same band would train an administrator to read past it.
  it('cautions before a removal, and does not caution before a reversible tier change', async () => {
    const removal = await request(createApp())
      .post(`/admin/members/${WITH_PICTURE_ID}/avatar/remove`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'Impersonates another player.' });
    expect(removal.text).toContain('notice-warn');
    expect(removal.text).toContain('This cannot be undone.');

    const tier = await request(createApp())
      .post(`/admin/members/${WITH_PICTURE_ID}/tier`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ tier: 'tier1', reason: 'Ordinary correction.' });
    expect(tier.status).toBe(200);
    expect(tier.text).not.toContain('notice-warn');
  });
});

describe('a removal without a reason is refused and writes nothing', () => {
  it('re-renders the record at 422 and leaves the picture', async () => {
    const res = await removePicture(WITH_PICTURE_ID, '   ');
    expect(res.status).toBe(422);
    expect(mediaStatus('av_media_1')).toBe('active');
    expect(avatarPointer(WITH_PICTURE_ID)).toBe('av_media_1');
  });

  it('refuses a reason past the cap, one character over, and accepts one at it', async () => {
    seedAvatar(SECOND_ID, 'av_media_cap');

    const overLong = await removePicture(SECOND_ID, 'x'.repeat(501));
    expect(overLong.status).toBe(422);
    expect(mediaStatus('av_media_cap')).toBe('active');

    const atCap = await removePicture(SECOND_ID, 'x'.repeat(500));
    expect(atCap.status).toBe(303);
    expect(mediaStatus('av_media_cap')).toBe('removed_by_admin');
  });
});

describe('the takedown refuses to run when it has nothing to take down', () => {
  it('answers 422 for a member with no picture, and writes no audit row', async () => {
    const before = db((conn) =>
      conn.prepare("SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = 'media.deleted'")
        .get()) as { n: number };

    const res = await removePicture(NO_PICTURE_ID, 'Nothing to remove.');
    expect(res.status).toBe(422);

    const after = db((conn) =>
      conn.prepare("SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = 'media.deleted'")
        .get()) as { n: number };
    expect(after.n).toBe(before.n);
  });
});

describe('the removal takes the picture off the profile and records why', () => {
  it('hides the row, clears the pointer, audits the reason, and mails the member', async () => {
    const res = await removePicture(WITH_PICTURE_ID, 'Impersonates another player.');
    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(`/admin/members/${WITH_PICTURE_ID}`);

    // The row survives because it carries the reason and the decision; what
    // detaches it from the profile is the pointer.
    expect(mediaStatus('av_media_1')).toBe('removed_by_admin');
    expect(avatarPointer(WITH_PICTURE_ID)).toBeNull();

    const audit = db((conn) =>
      conn.prepare(`
        SELECT actor_type, actor_member_id, entity_type, reason_text, metadata_json
        FROM audit_entries
        WHERE action_type = 'media.deleted' AND entity_id = ?
      `).get('av_media_1')) as {
        actor_type: string; actor_member_id: string; entity_type: string;
        reason_text: string; metadata_json: string;
      };
    expect(audit.actor_type).toBe('admin');
    expect(audit.actor_member_id).toBe(ADMIN_ID);
    expect(audit.entity_type).toBe('media_item');
    expect(audit.reason_text).toBe('Impersonates another player.');
    expect(JSON.parse(audit.metadata_json)).toMatchObject({
      isAvatar: true,
      flagsResolved: 0,
      uploaderMemberId: WITH_PICTURE_ID,
    });

    const mail = db((conn) =>
      conn.prepare(`
        SELECT recipient_member_id, template_key, body_text FROM outbox_emails
        WHERE idempotency_key = ?
      `).get('media-moderation:av_media_1:deleted')) as
      { recipient_member_id: string; template_key: string; body_text: string } | undefined;
    expect(mail?.recipient_member_id).toBe(WITH_PICTURE_ID);
    // Nobody reported it, so the mail must not say anybody did.
    expect(mail?.template_key).toBe('avatar_removed_member');
    expect(mail?.body_text).not.toContain('reported');
  });

  it('leaves the member and their other records alone', async () => {
    const member = db((conn) =>
      conn.prepare('SELECT display_name, slug, deleted_at FROM members WHERE id = ?')
        .get(WITH_PICTURE_ID)) as
      { display_name: string; slug: string; deleted_at: string | null };
    expect(member.display_name).toBe('Pia Pictured');
    expect(member.slug).toBe('av-pictured');
    expect(member.deleted_at).toBeNull();
  });

  it('stops offering the control once the picture is gone, and refuses a second removal', async () => {
    const page = await request(createApp())
      .get(`/admin/members/${WITH_PICTURE_ID}`)
      .set('Cookie', adminCookie());
    expect(page.text).not.toContain('Remove the Profile Picture');

    const res = await removePicture(WITH_PICTURE_ID, 'Trying again.');
    expect(res.status).toBe(422);
  });
});

describe('the route is administrator-only', () => {
  it('refuses an authenticated non-administrator, the member themselves included', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${NO_PICTURE_ID}/avatar/remove/confirm`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ reason: 'Removing a picture through the back door.' });
    expect(res.status).toBe(403);
  });
});

describe('a crafted submission cannot reach past the reason field', () => {
  it('ignores extra fields naming privileged columns', async () => {
    seedAvatar(NO_PICTURE_ID, 'av_media_craft');

    const res = await request(createApp())
      .post(`/admin/members/${NO_PICTURE_ID}/avatar/remove/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        reason: 'Ordinary removal.',
        is_admin: 1,
        tier_status: 'tier3',
        slug: 'taken-over',
        deleted_at: '2020-01-01T00:00:00.000Z',
      });
    expect(res.status).toBe(303);

    const member = db((conn) =>
      conn.prepare('SELECT is_admin, slug, deleted_at FROM members WHERE id = ?')
        .get(NO_PICTURE_ID)) as
      { is_admin: number; slug: string; deleted_at: string | null };
    expect(member.is_admin).toBe(0);
    expect(member.slug).toBe('av-bare');
    expect(member.deleted_at).toBeNull();
  });
});
