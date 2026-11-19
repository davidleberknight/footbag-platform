/**
 * The mail a media report and a takedown send to the members they concern.
 *
 * A member who reports an item gets one receipt saying the report arrived; a
 * repeat report from the same member is not a second report and sends nothing
 * more, and an administrator reporting an item from the takedown queue is
 * starting to decide it, so gets no receipt. An uploader whose item is removed
 * is told which item it was, by its kind, its caption and the day it was
 * uploaded, whether the removal decided a report or not.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp, seedEmailTemplates } from '../fixtures/testDb';
import {
  insertMember,
  completeOnboarding,
  insertMemberTierGrant,
  insertMediaItem,
  insertMediaFlag,
  insertVideoMediaItem,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4991');

let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID = 'mm_admin';
const UPLOADER_ID = 'mm_uploader';
const REPORTER_ID = 'mm_reporter';

const ITEM_REPORTED = 'media_mm_reported';
const ITEM_ADMIN_FLAGGED = 'media_mm_admin_flagged';
const ITEM_REMOVED_REPORTED = 'media_mm_removed_reported';
const ITEM_REMOVED_UNREPORTED = 'media_mm_removed_unreported';
const ITEM_NO_CAPTION = 'media_mm_no_caption';
const ITEM_VIDEO = 'media_mm_video';
const CAPTION_VIDEO = 'Zqx linked tournament clip';
const UPLOADED_VIDEO = '2026-02-02T12:00:00.000Z';

const CAPTION_REPORTED = 'Zqx sunset footbag circle';
const CAPTION_UNREPORTED = 'Zqx hallway freestyle session';

// Seeded upload instants, and the calendar day each must be named by.
const UPLOADED_REPORTED = '2026-03-03T10:00:00.000Z';
const UPLOADED_UNREPORTED = '2025-12-25T23:30:00.000Z';
const UPLOADED_NO_CAPTION = '2026-07-14T08:00:00.000Z';

const cookieFor = (memberId: string, role: 'member' | 'admin') =>
  `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;

function outbox(template: string, memberId: string): Array<{ body_text: string }> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return db.prepare(
      'SELECT body_text FROM outbox_emails WHERE template_key = ? AND recipient_member_id = ?',
    ).all(template, memberId) as Array<{ body_text: string }>;
  } finally {
    db.close();
  }
}

function removeAsAdmin(mediaId: string) {
  return request(createApp())
    .post(`/admin/media-flags/${mediaId}/delete`)
    .set('Cookie', cookieFor(ADMIN_ID, 'admin'))
    .type('form')
    .send({ reason: 'Breaks the rule on posting only what you have the right to post.' });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedEmailTemplates(db);
  insertMember(db, { id: ADMIN_ID, slug: 'mm_admin', display_name: 'MM Admin', login_email: 'mm-admin@example.com', is_admin: 1 });
  insertMember(db, { id: UPLOADER_ID, slug: 'mm_uploader', display_name: 'MM Uploader', login_email: 'mm-uploader@example.com' });
  insertMember(db, { id: REPORTER_ID, slug: 'mm_reporter', display_name: 'MM Reporter', login_email: 'mm-reporter@example.com' });
  for (const id of [ADMIN_ID, UPLOADER_ID, REPORTER_ID]) completeOnboarding(db, id);
  insertMemberTierGrant(db, { member_id: REPORTER_ID, new_tier_status: 'tier1' });
  insertMemberTierGrant(db, { member_id: ADMIN_ID, new_tier_status: 'tier1' });

  insertMediaItem(db, { id: ITEM_REPORTED, uploader_member_id: UPLOADER_ID, caption: 'To be reported', tags: ['#by_mm_uploader'] });
  insertMediaItem(db, { id: ITEM_ADMIN_FLAGGED, uploader_member_id: UPLOADER_ID, caption: 'Admin flags this', tags: ['#by_mm_uploader'] });
  insertMediaItem(db, {
    id: ITEM_REMOVED_REPORTED, uploader_member_id: UPLOADER_ID, caption: CAPTION_REPORTED,
    uploaded_at: UPLOADED_REPORTED, tags: ['#by_mm_uploader'],
  });
  insertMediaFlag(db, { media_id: ITEM_REMOVED_REPORTED, reporter_member_id: REPORTER_ID, reason_code: 'infringes_rights' });
  insertMediaItem(db, {
    id: ITEM_REMOVED_UNREPORTED, uploader_member_id: UPLOADER_ID, caption: CAPTION_UNREPORTED,
    uploaded_at: UPLOADED_UNREPORTED, tags: ['#by_mm_uploader'],
  });
  insertMediaItem(db, {
    id: ITEM_NO_CAPTION, uploader_member_id: UPLOADER_ID, caption: null,
    uploaded_at: UPLOADED_NO_CAPTION, tags: ['#by_mm_uploader'],
  });
  insertVideoMediaItem(db, {
    id: ITEM_VIDEO, uploader_member_id: UPLOADER_ID, video_platform: 'youtube',
    video_id: 'zqxVideo001', video_url: 'https://www.youtube.com/watch?v=zqxVideo001',
    caption: CAPTION_VIDEO, uploaded_at: UPLOADED_VIDEO, tags: ['#by_mm_uploader'],
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('a member who reports media is sent a receipt', () => {
  it('queues one receipt to the reporter, and none for a repeat of the same report', async () => {
    const report = () => request(createApp())
      .post(`/media/item/${ITEM_REPORTED}/flag`)
      .set('Cookie', cookieFor(REPORTER_ID, 'member'))
      .type('form')
      .send({ reason_code: 'spam' });

    expect((await report()).status).toBe(303);
    expect(outbox('media_report_received_reporter', REPORTER_ID)).toHaveLength(1);

    expect((await report()).status).toBe(303);
    expect(outbox('media_report_received_reporter', REPORTER_ID)).toHaveLength(1);
  });

  it('sends no receipt to an administrator reporting from the takedown queue', async () => {
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_ADMIN_FLAGGED}/flag`)
      .set('Cookie', cookieFor(ADMIN_ID, 'admin'))
      .type('form')
      .send({ reason_code: 'spam' });
    expect(res.status).toBe(303);
    expect(outbox('media_report_received_reporter', ADMIN_ID)).toHaveLength(0);
  });
});

describe('an uploader told of a removal is told which item it was', () => {
  it('names the kind, caption and upload day when the removal decided a report', async () => {
    expect((await removeAsAdmin(ITEM_REMOVED_REPORTED)).status).toBe(303);
    const mail = outbox('media_moderation_decision', UPLOADER_ID);
    expect(mail).toHaveLength(1);
    expect(mail[0]!.body_text).toContain(`your photo captioned "${CAPTION_REPORTED}", uploaded on 3 March 2026`);
  });

  it('names the item the same way when no report was in front of the administrator', async () => {
    expect((await removeAsAdmin(ITEM_REMOVED_UNREPORTED)).status).toBe(303);
    const bodies = outbox('media_removed_member', UPLOADER_ID).map((m) => m.body_text);
    expect(bodies.filter((b) => b.includes(`your photo captioned "${CAPTION_UNREPORTED}", uploaded on 25 December 2025`))).toHaveLength(1);
  });

  it('calls a removed video a video, not a photo', async () => {
    expect((await removeAsAdmin(ITEM_VIDEO)).status).toBe(303);
    const bodies = outbox('media_removed_member', UPLOADER_ID).map((m) => m.body_text);
    expect(bodies.filter((b) => b.includes(`your video captioned "${CAPTION_VIDEO}", uploaded on 2 February 2026`))).toHaveLength(1);
  });

  it('says an item had no caption rather than quoting an empty one', async () => {
    expect((await removeAsAdmin(ITEM_NO_CAPTION)).status).toBe(303);
    const bodies = outbox('media_removed_member', UPLOADER_ID).map((m) => m.body_text);
    expect(bodies.filter((b) => b.includes('your photo with no caption, uploaded on 14 July 2026'))).toHaveLength(1);
    expect(bodies.some((b) => b.includes('captioned ""'))).toBe(false);
  });
});
