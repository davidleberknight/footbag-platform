/**
 * The takedown queue: GET /admin/media-flags, POST /admin/media-flags/:mediaId/delete,
 * POST /admin/media-flags/:mediaId/no-action, POST /admin/media-flags/:mediaId/flag,
 * POST /admin/media-flags/flags/:flagId/clear.
 *
 * An admin-only surface listing every media item members have reported, with
 * each report's reason, the reporter, and how many reports that member has filed
 * lately, which is the flagging pattern an administrator judges a report by.
 * Two decisions close an item: Remove hides it and takes its stored files with
 * it, and No Action closes the reports leaving the item exactly as it was. Both
 * require a reason, append one audit row, close the work-queue card raised when
 * the item was first reported, and email the uploader what was decided. An
 * administrator can also raise a report themselves or clear one.
 *
 * This suite pins the admin gate, the rendered queue, both decisions and
 * everything each writes, the queue card closing with the item, the uploader
 * mail, the concurrent-decision no-op, the reason requirement, and overposting
 * safety on the decision forms.
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
  insertWorkQueueItem,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4182');

let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-0000000af001';
const UPLOADER_ID = 'bbbbbbbb-0000-0000-0000-0000000af002';
const REPORTER_ID = 'cccccccc-0000-0000-0000-0000000af003';
const MEMBER_ID = 'dddddddd-0000-0000-0000-0000000af004';

// One item per decision, so no test depends on another having run first.
const ITEM_DELETE = 'media_af_delete';
const ITEM_NO_ACTION = 'media_af_keep';
const ITEM_CLEAR = 'media_af_clear';
const ITEM_RACE = 'media_af_race';
const ITEM_ADMIN_FLAG = 'media_af_adminflag';
const ITEM_PATTERN = 'media_af_pattern';
const ITEM_FILES_OWED = 'media_af_files_owed';
const ITEM_AVATAR = 'media_af_avatar';
const ITEM_ADMIN_OWN = 'media_af_adminown';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
}
const admin = () => cookieFor(ADMIN_ID, 'admin');
const member = () => cookieFor(MEMBER_ID, 'member');

function readDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath, { readonly: true });
}

function mediaRow(mediaId: string): { moderation_status: string; moderation_reason: string | null; version: number } {
  const db = readDb();
  const row = db
    .prepare('SELECT moderation_status, moderation_reason, version FROM media_items WHERE id = ?')
    .get(mediaId) as { moderation_status: string; moderation_reason: string | null; version: number };
  db.close();
  return row;
}

function flagsFor(mediaId: string): { id: string; status: string; resolution_label: string | null; resolution_reason: string | null; resolved_by_admin_member_id: string | null }[] {
  const db = readDb();
  const rows = db
    .prepare('SELECT id, status, resolution_label, resolution_reason, resolved_by_admin_member_id FROM media_flags WHERE media_id = ? ORDER BY id')
    .all(mediaId) as { id: string; status: string; resolution_label: string | null; resolution_reason: string | null; resolved_by_admin_member_id: string | null }[];
  db.close();
  return rows;
}

function queueFor(mediaId: string): { id: string; status: string; decision_label: string | null; task_type: string }[] {
  const db = readDb();
  const rows = db
    .prepare("SELECT id, status, decision_label, task_type FROM work_queue_items WHERE entity_type = 'media_item' AND entity_id = ? ORDER BY id")
    .all(mediaId) as { id: string; status: string; decision_label: string | null; task_type: string }[];
  db.close();
  return rows;
}

function auditFor(mediaId: string): { action_type: string; actor_type: string; actor_member_id: string | null; reason_text: string | null }[] {
  const db = readDb();
  const rows = db
    .prepare("SELECT action_type, actor_type, actor_member_id, reason_text FROM audit_entries WHERE entity_type = 'media_item' AND entity_id = ? ORDER BY id")
    .all(mediaId) as { action_type: string; actor_type: string; actor_member_id: string | null; reason_text: string | null }[];
  db.close();
  return rows;
}

function outboxTo(email: string): { template_key: string; subject: string; body_text: string }[] {
  const db = readDb();
  const rows = db
    .prepare('SELECT template_key, subject, body_text FROM outbox_emails WHERE recipient_email = ? ORDER BY id')
    .all(email) as { template_key: string; subject: string; body_text: string }[];
  db.close();
  return rows;
}

const UPLOADER_EMAIL = 'af-uploader@example.com';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedEmailTemplates(db);

  insertMember(db, { id: ADMIN_ID, slug: 'af_admin', display_name: 'AF Admin', login_email: 'af-admin@example.com', is_admin: 1 });
  insertMember(db, { id: UPLOADER_ID, slug: 'af_uploader', display_name: 'AF Uploader', login_email: UPLOADER_EMAIL });
  insertMember(db, { id: REPORTER_ID, slug: 'af_reporter', display_name: 'AF Reporter', login_email: 'af-reporter@example.com' });
  insertMember(db, { id: MEMBER_ID, slug: 'af_member', display_name: 'AF Member', login_email: 'af-member@example.com' });
  for (const id of [ADMIN_ID, UPLOADER_ID, REPORTER_ID, MEMBER_ID]) completeOnboarding(db, id);
  insertMemberTierGrant(db, { member_id: REPORTER_ID, new_tier_status: 'tier1' });

  for (const id of [ITEM_DELETE, ITEM_NO_ACTION, ITEM_CLEAR, ITEM_RACE, ITEM_PATTERN]) {
    insertMediaItem(db, { id, uploader_member_id: UPLOADER_ID, caption: `Caption ${id}`, tags: ['#by_af_uploader'] });
    insertMediaFlag(db, {
      media_id: id,
      reporter_member_id: REPORTER_ID,
      reason_code: 'illegal_or_harassing',
      reason_text: `Report on ${id}`,
      // Inside the trailing window the pattern line counts, which is where a
      // real open report sits.
      reported_at: new Date().toISOString(),
    });
    insertWorkQueueItem(db, {
      id:             `wq_af_${id}`,
      queue_category: 'media',
      task_type:      'media_flag_review',
      entity_type:    'media_item',
      entity_id:      id,
      status:         'open',
      priority:       0,
      reason_text:    'A member reported this media item for review.',
    });
  }
  // No report of its own: it exists for the administrator-raised report.
  insertMediaItem(db, { id: ITEM_ADMIN_FLAG, uploader_member_id: UPLOADER_ID, caption: 'Admin raised', tags: ['#by_af_uploader'] });

  // Uploaded by the administrator themselves, and reported by somebody else.
  // Deciding it would make them both the subject and the judge.
  insertMediaItem(db, {
    id: ITEM_ADMIN_OWN, uploader_member_id: ADMIN_ID, caption: 'The admin\'s own upload',
    tags: ['#by_af_admin'],
  });
  insertMediaFlag(db, {
    media_id: ITEM_ADMIN_OWN,
    reporter_member_id: REPORTER_ID,
    reason_code: 'illegal_or_harassing',
    reason_text: 'Reported against the administrator.',
    reported_at: new Date().toISOString(),
  });
  insertWorkQueueItem(db, {
    id:             `wq_af_${ITEM_ADMIN_OWN}`,
    queue_category: 'media',
    task_type:      'media_flag_review',
    entity_type:    'media_item',
    entity_id:      ITEM_ADMIN_OWN,
    status:         'open',
    priority:       0,
    reason_text:    'A member reported this media item for review.',
  });

  // A profile picture, which reaches this queue only when an administrator
  // raises the report: no public surface offers one for reporting.
  insertMediaItem(db, {
    id: ITEM_AVATAR,
    uploader_member_id: MEMBER_ID,
    is_avatar: 1,
    caption: null,
    tags: ['#by_af_member'],
  });

  // A takedown whose stored files outlived it: hidden, no open reports left,
  // and one open card saying the bytes are still there.
  insertMediaItem(db, {
    id: ITEM_FILES_OWED,
    uploader_member_id: UPLOADER_ID,
    caption: 'Files still stored',
    tags: ['#by_af_uploader'],
  });
  db.prepare("UPDATE media_items SET moderation_status = 'removed_by_admin', moderation_reason = ? WHERE id = ?")
    .run('Removed after review.', ITEM_FILES_OWED);
  insertWorkQueueItem(db, {
    id:             `wq_af_${ITEM_FILES_OWED}`,
    queue_category: 'media',
    task_type:      'media_takedown_storage_removal',
    entity_type:    'media_item',
    entity_id:      ITEM_FILES_OWED,
    status:         'open',
    priority:       0,
    reason_text:    'This item is hidden, but its stored files were not removed and are still served to anyone holding their address.',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('an administrator is not the judge of their own upload', () => {
  it('refuses Remove on an item the deciding administrator uploaded', async () => {
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_ADMIN_OWN}/delete`)
      .set('Cookie', admin())
      .type('form')
      .send({ reason: 'Deciding my own case.' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('your own upload');
    expect(mediaRow(ITEM_ADMIN_OWN).moderation_status).toBe('active');
    expect(flagsFor(ITEM_ADMIN_OWN).map((f) => f.status)).toEqual(['open']);
  });

  it('refuses No Action on the same item, so neither direction is self-served', async () => {
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_ADMIN_OWN}/no-action`)
      .set('Cookie', admin())
      .type('form')
      .send({ reason: 'Clearing my own case.' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('your own upload');
    expect(flagsFor(ITEM_ADMIN_OWN).map((f) => f.status)).toEqual(['open']);
  });
});

describe('the admin gate', () => {
  it('redirects an unauthenticated visitor from the queue', async () => {
    const res = await request(createApp()).get('/admin/media-flags');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('/login');
  });

  it('403s a signed-in non-admin on the queue', async () => {
    const res = await request(createApp()).get('/admin/media-flags').set('Cookie', member());
    expect(res.status).toBe(403);
  });

  it('403s a signed-in non-admin on a decision, and decides nothing', async () => {
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_NO_ACTION}/no-action`)
      .set('Cookie', member())
      .type('form')
      .send({ reason: 'Let me through.' });
    expect(res.status).toBe(403);
    expect(flagsFor(ITEM_NO_ACTION)[0].status).toBe('open');
  });

  it('serves an administrator', async () => {
    const res = await request(createApp()).get('/admin/media-flags').set('Cookie', admin());
    expect(res.status).toBe(200);
  });
});

describe('GET /admin/media-flags — the queue', () => {
  it('shows each reported item with its reason, reporter and uploader', async () => {
    const res = await request(createApp()).get('/admin/media-flags').set('Cookie', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain(`Caption ${ITEM_PATTERN}`);
    expect(res.text).toContain('Illegal, harassing, or defamatory');
    expect(res.text).toContain('AF Reporter');
    expect(res.text).toContain('AF Uploader');
    expect(res.text).toContain(`Report on ${ITEM_PATTERN}`);
    expect(res.text).toContain(`/admin/media-flags/${ITEM_PATTERN}/delete`);
    expect(res.text).toContain(`/admin/media-flags/${ITEM_PATTERN}/no-action`);
  });

  it('names a reporter who has filed more than one report lately', async () => {
    // The fixture reporter filed one per item, so the pattern line is the
    // count across all of them rather than anything about this single report.
    const res = await request(createApp()).get('/admin/media-flags').set('Cookie', admin());
    expect(res.text).toContain('reports from this member in the last 30 days');
  });

  it('carries no address, and nothing IP-derived, about anyone', async () => {
    const res = await request(createApp()).get('/admin/media-flags').set('Cookie', admin());
    expect(res.text).not.toContain('af-reporter@example.com');
    expect(res.text).not.toContain(UPLOADER_EMAIL);
    expect(res.text.toLowerCase()).not.toContain('ip address');
  });
});

describe('POST /admin/media-flags/:mediaId/delete', () => {
  it('hides the item, closes its reports and card, audits it, and tells the uploader', async () => {
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_DELETE}/delete`)
      .set('Cookie', admin())
      .type('form')
      .send({ reason: 'Copyright complaint upheld.' });

    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe('/admin/media-flags');

    const row = mediaRow(ITEM_DELETE);
    expect(row.moderation_status).toBe('removed_by_admin');
    expect(row.moderation_reason).toBe('Copyright complaint upheld.');
    expect(row.version).toBe(2);

    const flags = flagsFor(ITEM_DELETE);
    expect(flags[0].status).toBe('resolved');
    expect(flags[0].resolution_label).toBe('deleted');
    expect(flags[0].resolved_by_admin_member_id).toBe(ADMIN_ID);

    const queue = queueFor(ITEM_DELETE);
    expect(queue[0].status).toBe('resolved');
    expect(queue[0].decision_label).toBe('deleted');

    const audit = auditFor(ITEM_DELETE);
    expect(audit.map((a) => a.action_type)).toContain('media.deleted');
    expect(audit[audit.length - 1].actor_type).toBe('admin');
    expect(audit[audit.length - 1].actor_member_id).toBe(ADMIN_ID);

    const mail = outboxTo(UPLOADER_EMAIL).filter((m) => m.template_key === 'media_moderation_decision');
    expect(mail).toHaveLength(1);
    expect(mail[0].body_text).toContain('Removed');
    expect(mail[0].body_text).toContain('Copyright complaint upheld.');
    // The uploader learns the decision, never who reported them.
    expect(mail[0].body_text).not.toContain('AF Reporter');
  });

  it('takes the item off the public surface', async () => {
    const res = await request(createApp()).get(`/media/item/${ITEM_DELETE}`);
    expect(res.status).toBe(404);
  });

  it('drops the decided item from the queue', async () => {
    const res = await request(createApp()).get('/admin/media-flags').set('Cookie', admin());
    expect(res.text).not.toContain(`/admin/media-flags/${ITEM_DELETE}/delete`);
  });

  it('refuses a decision with no reason and changes nothing', async () => {
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_RACE}/delete`)
      .set('Cookie', admin())
      .type('form')
      .send({ reason: '   ' });

    expect(res.status).toBe(422);
    expect(mediaRow(ITEM_RACE).moderation_status).toBe('active');
    expect(flagsFor(ITEM_RACE)[0].status).toBe('open');
    // The re-render is the only thing the administrator sees, so it has to
    // read as a refusal. Carried without a tone it rendered in the neutral
    // treatment, indistinguishable from a note about the page itself.
    expect(res.text).toContain('class="form-error-banner" role="alert"');
    expect(res.text).not.toContain('form-success-banner');
  });

  it('refuses a decision on an item that no longer exists, in the refusal treatment', async () => {
    const res = await request(createApp())
      .post('/admin/media-flags/no_such_media_item/delete')
      .set('Cookie', admin())
      .type('form')
      .send({ reason: 'Not acceptable under the standards.' });

    expect(res.status).toBe(404);
    expect(res.text).toContain(
      '<div class="form-error-banner" role="alert">That media item no longer exists.</div>',
    );
    expect(res.text).not.toContain('form-success-banner');
  });

  it('persists only the decision fields when the body carries extras', async () => {
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_RACE}/delete`)
      .set('Cookie', admin())
      .type('form')
      .send({
        reason: 'Removed on review.',
        moderation_status: 'active',
        uploader_member_id: ADMIN_ID,
        is_avatar: '1',
        id: 'media_crafted',
      });

    expect(res.status).toBe(303);
    const db = readDb();
    const crafted = db.prepare('SELECT id FROM media_items WHERE id = ?').get('media_crafted');
    const row = db
      .prepare('SELECT moderation_status, uploader_member_id, is_avatar FROM media_items WHERE id = ?')
      .get(ITEM_RACE) as { moderation_status: string; uploader_member_id: string; is_avatar: number };
    db.close();

    expect(crafted).toBeUndefined();
    expect(row.moderation_status).toBe('removed_by_admin');
    expect(row.uploader_member_id).toBe(UPLOADER_ID);
    expect(row.is_avatar).toBe(0);
  });

  it('tells a second administrator the item was already hidden and writes no second decision', async () => {
    const auditBefore = auditFor(ITEM_RACE).length;
    const mailBefore = outboxTo(UPLOADER_EMAIL).length;

    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_RACE}/delete`)
      .set('Cookie', admin())
      .type('form')
      .send({ reason: 'Removing it again.' });

    expect(res.status).toBe(303);
    expect(auditFor(ITEM_RACE)).toHaveLength(auditBefore);
    expect(outboxTo(UPLOADER_EMAIL)).toHaveLength(mailBefore);
    expect(mediaRow(ITEM_RACE).moderation_reason).toBe('Removed on review.');

    // The decision itself was a success, so it reads as one; what must not
    // happen is every outcome on this page sharing a single treatment, which
    // is what it did before the message vocabulary landed.
    const flash = ((res.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0])
      .join('; ');
    const page = await request(createApp())
      .get('/admin/media-flags')
      .set('Cookie', [admin(), flash].filter(Boolean).join('; '));
    expect(page.text).toContain('<div class="form-success-banner" role="status">That item was already hidden.');
  });
});

describe('two administrators deciding the same item at once', () => {
  it('decides it once, whichever request gets there first', async () => {
    const app = createApp();
    const [a, b] = await Promise.all([
      request(app).post(`/admin/media-flags/${ITEM_PATTERN}/delete`)
        .set('Cookie', admin()).type('form').send({ reason: 'First administrator.' }),
      request(app).post(`/admin/media-flags/${ITEM_PATTERN}/delete`)
        .set('Cookie', admin()).type('form').send({ reason: 'Second administrator.' }),
    ]);

    expect(a.status).toBe(303);
    expect(b.status).toBe(303);

    // Whether the loser found the item already hidden or lost the guarded
    // write by a hair, the item is decided once: one ledger row, one reason
    // recorded, one message to the uploader.
    const deletions = auditFor(ITEM_PATTERN).filter((r) => r.action_type === 'media.deleted');
    expect(deletions).toHaveLength(1);

    const reasons = ['First administrator.', 'Second administrator.'];
    expect(reasons).toContain(mediaRow(ITEM_PATTERN).moderation_reason);
    expect(mediaRow(ITEM_PATTERN).moderation_status).toBe('removed_by_admin');

    const mail = outboxTo(UPLOADER_EMAIL).filter((m) => reasons.some((r) => m.body_text.includes(r)));
    expect(mail).toHaveLength(1);
    expect(flagsFor(ITEM_PATTERN).every((f) => f.status === 'resolved')).toBe(true);
  });
});

describe('POST /admin/media-flags/:mediaId/no-action', () => {
  it('closes the reports and the card, leaves the item visible, and tells the uploader', async () => {
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_NO_ACTION}/no-action`)
      .set('Cookie', admin())
      .type('form')
      .send({ reason: 'Nothing here breaks the rules.' });

    expect(res.status).toBe(303);

    const row = mediaRow(ITEM_NO_ACTION);
    expect(row.moderation_status).toBe('active');
    expect(row.moderation_reason).toBeNull();

    const flags = flagsFor(ITEM_NO_ACTION);
    expect(flags[0].status).toBe('resolved');
    expect(flags[0].resolution_label).toBe('no_action');
    expect(flags[0].resolution_reason).toBe('Nothing here breaks the rules.');

    expect(queueFor(ITEM_NO_ACTION)[0].status).toBe('resolved');
    expect(auditFor(ITEM_NO_ACTION).map((a) => a.action_type)).toContain('media.flag_resolved');

    const mail = outboxTo(UPLOADER_EMAIL).filter((m) => m.body_text.includes('No action taken'));
    expect(mail).toHaveLength(1);

    const publicPage = await request(createApp()).get(`/media/item/${ITEM_NO_ACTION}`);
    expect(publicPage.status).toBe(200);
  });

  it('tells a second administrator there was nothing left to settle', async () => {
    const auditBefore = auditFor(ITEM_NO_ACTION).length;
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_NO_ACTION}/no-action`)
      .set('Cookie', admin())
      .type('form')
      .send({ reason: 'Closing it again.' });

    expect(res.status).toBe(303);
    expect(auditFor(ITEM_NO_ACTION)).toHaveLength(auditBefore);
  });
});

describe('items whose stored files outlived the takedown', () => {
  it('lists each one with a retry control, and says why it matters', async () => {
    const res = await request(createApp()).get('/admin/media-flags').set('Cookie', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Files Still to Remove');
    expect(res.text).toContain('Files still stored');
    expect(res.text).toContain('still served to anyone');
    expect(res.text).toContain(`/admin/media-flags/${ITEM_FILES_OWED}/retry-removal`);
    expect(res.text).toContain('Retry File Removal');
  });

  it('removes the files on a retry and takes the item off the list', async () => {
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_FILES_OWED}/retry-removal`)
      .set('Cookie', admin())
      .type('form')
      .send({});

    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe('/admin/media-flags');

    const queue = queueFor(ITEM_FILES_OWED);
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe('resolved');
    expect(queue[0].decision_label).toBe('removed');

    const page = await request(createApp()).get('/admin/media-flags').set('Cookie', admin());
    expect(page.text).not.toContain(`/admin/media-flags/${ITEM_FILES_OWED}/retry-removal`);
  });

  it('tells an administrator retrying a visible item there is nothing owed', async () => {
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_ADMIN_FLAG}/retry-removal`)
      .set('Cookie', admin())
      .type('form')
      .send({});
    expect(res.status).toBe(303);
    expect(queueFor(ITEM_ADMIN_FLAG).every((q) => q.task_type !== 'media_takedown_storage_removal')).toBe(true);
  });

  it('403s a signed-in non-admin on the retry', async () => {
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_FILES_OWED}/retry-removal`)
      .set('Cookie', member())
      .type('form')
      .send({});
    expect(res.status).toBe(403);
  });
});

describe('POST /admin/media-flags/flags/:flagId/clear', () => {
  it('clears one report, closes the card with the last of them, and audits it', async () => {
    const flagId = flagsFor(ITEM_CLEAR)[0].id;
    const res = await request(createApp())
      .post(`/admin/media-flags/flags/${flagId}/clear`)
      .set('Cookie', admin())
      .type('form')
      .send({ reason: 'Duplicate of another report.' });

    expect(res.status).toBe(303);
    const flags = flagsFor(ITEM_CLEAR);
    expect(flags[0].status).toBe('resolved');
    expect(flags[0].resolution_label).toBe('cleared');

    expect(queueFor(ITEM_CLEAR)[0].status).toBe('resolved');
    expect(auditFor(ITEM_CLEAR).map((a) => a.action_type)).toContain('media.flag_cleared');

    // Clearing a report is not a decision about the item.
    expect(mediaRow(ITEM_CLEAR).moderation_status).toBe('active');
    const mail = outboxTo(UPLOADER_EMAIL).filter((m) => m.body_text.includes('Duplicate of another report'));
    expect(mail).toHaveLength(0);
  });

  it('404s a report that does not exist', async () => {
    const res = await request(createApp())
      .post('/admin/media-flags/flags/mediaflag_missing/clear')
      .set('Cookie', admin())
      .type('form')
      .send({ reason: 'Nothing to clear.' });
    expect(res.status).toBe(404);
  });
});

describe('POST /admin/media-flags/:mediaId/flag', () => {
  it('lets an administrator raise a report, recorded as theirs', async () => {
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_ADMIN_FLAG}/flag`)
      .set('Cookie', admin())
      .type('form')
      .send({ reason_code: 'spam', reason_text: 'Bulk promotional upload.' });

    expect(res.status).toBe(303);
    const flags = flagsFor(ITEM_ADMIN_FLAG);
    expect(flags).toHaveLength(1);
    expect(flags[0].status).toBe('open');

    const audit = auditFor(ITEM_ADMIN_FLAG);
    expect(audit.map((a) => a.action_type)).toContain('media.flagged');
    expect(audit[0].actor_type).toBe('admin');
    expect(audit[0].actor_member_id).toBe(ADMIN_ID);

    // The card it raises is the same one a member's report raises.
    const queue = queueFor(ITEM_ADMIN_FLAG);
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe('open');
  });

  it('refuses a report with no reason chosen', async () => {
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_PATTERN}/flag`)
      .set('Cookie', admin())
      .type('form')
      .send({ reason_text: 'No code given.' });
    expect(res.status).toBe(422);
  });
});

/**
 * A profile picture is decidable here like any other item, with one difference
 * that matters: the profile renders it through the member's own avatar pointer
 * rather than through a read that filters on moderation status, so hiding the
 * row is not enough to take it off the profile.
 */
describe('a profile picture in the takedown queue', () => {
  function avatarPointer(memberId: string): string | null {
    const db = readDb();
    const row = db.prepare('SELECT avatar_media_id FROM members WHERE id = ?')
      .get(memberId) as { avatar_media_id: string | null };
    db.close();
    return row.avatar_media_id;
  }

  it('is not reportable by a member, who has no surface offering one', async () => {
    const res = await request(createApp())
      .post(`/media/item/${ITEM_AVATAR}/flag`)
      .set('Cookie', cookieFor(REPORTER_ID, 'member'))
      .type('form')
      .send({ reason_code: 'illegal_or_harassing', reason_text: 'Crafted report.' });
    expect(res.status).toBe(404);
    expect(flagsFor(ITEM_AVATAR)).toHaveLength(0);
  });

  it('reaches the queue when an administrator raises the report', async () => {
    expect(avatarPointer(MEMBER_ID)).toBe(ITEM_AVATAR);

    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_AVATAR}/flag`)
      .set('Cookie', admin())
      .type('form')
      .send({ reason_code: 'illegal_or_harassing', reason_text: 'Impersonates another player.' });
    expect(res.status).toBe(303);

    expect(flagsFor(ITEM_AVATAR)).toHaveLength(1);
    expect(queueFor(ITEM_AVATAR).map((q) => q.status)).toEqual(['open']);
  });

  it('comes off the profile when the decision is Remove, not only out of the queue', async () => {
    const res = await request(createApp())
      .post(`/admin/media-flags/${ITEM_AVATAR}/delete`)
      .set('Cookie', admin())
      .type('form')
      .send({ reason: 'Impersonates another player.' });
    expect(res.status).toBe(303);

    expect(mediaRow(ITEM_AVATAR).moderation_status).toBe('removed_by_admin');
    // The assertion this whole case exists for: hiding the row alone would
    // leave the picture rendering on the member's profile.
    expect(avatarPointer(MEMBER_ID)).toBeNull();

    expect(flagsFor(ITEM_AVATAR).map((f) => f.status)).toEqual(['resolved']);
    // And out of the avatar slot, which only one row per member may hold. The
    // row survives with its reports; it is simply not their picture any more.
    const stillFlagged = readDb();
    const avatarFlag = stillFlagged
      .prepare('SELECT is_avatar FROM media_items WHERE id = ?')
      .get(ITEM_AVATAR) as { is_avatar: number };
    stillFlagged.close();
    expect(avatarFlag.is_avatar).toBe(0);
    expect(queueFor(ITEM_AVATAR).map((q) => q.status)).toEqual(['resolved']);
    expect(auditFor(ITEM_AVATAR).map((a) => a.action_type)).toContain('media.deleted');
  });

  /**
   * The member is told they may upload another, so this is the ordinary next
   * step rather than an edge case. It must not cost the decision its evidence:
   * media_flags cascades on the media row, so deleting the decided picture to
   * make room would take the reports that justified the decision with it.
   */
  it('lets the member upload a replacement without destroying the decision or its reports', async () => {
    const replacement = 'media_af_avatar_2';
    const writer = new BetterSqlite3(dbPath);
    try {
      insertMediaItem(writer, {
        id: replacement,
        uploader_member_id: MEMBER_ID,
        is_avatar: 1,
        caption: null,
        tags: ['#by_af_member'],
      });
    } finally {
      writer.close();
    }

    const conn = readDb();
    const decided = conn
      .prepare('SELECT id, is_avatar, moderation_status FROM media_items WHERE id = ?')
      .get(ITEM_AVATAR) as { id: string; is_avatar: number; moderation_status: string };
    const flags = conn
      .prepare('SELECT COUNT(*) AS n FROM media_flags WHERE media_id = ?')
      .get(ITEM_AVATAR) as { n: number };
    const pointer = conn
      .prepare('SELECT avatar_media_id FROM members WHERE id = ?')
      .get(MEMBER_ID) as { avatar_media_id: string | null };
    conn.close();

    // The decided row is still there, still hidden, still carrying its report.
    expect(decided.moderation_status).toBe('removed_by_admin');
    expect(decided.is_avatar).toBe(0);
    expect(flags.n).toBe(1);
    // And the new picture is the one the profile shows.
    expect(pointer.avatar_media_id).toBe(replacement);
  });
});
