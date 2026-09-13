/**
 * Member reporting of media: POST /media/item/:mediaId/flag, and the reporting
 * control the item page renders.
 *
 * Reporting is a Tier 1 benefit. A report names one reason from the closed set
 * and may carry the reporter's own words; it raises one work-queue card for the
 * item, and it never changes what anyone can see, because only an
 * administrator's decision moves an item. A second report from the same member
 * on the same item is not a second count. The reporter's words stay on the
 * report: they never reach the append-only audit ledger or the queue row.
 *
 * This suite pins the benefit gate, the one-report-per-reporter rule, the
 * single queue card per item, the audit row and what it may carry, the
 * unchanged visibility, the validation floors, the rate limit, and overposting
 * safety on the report form.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  completeOnboarding,
  insertMemberTierGrant,
  insertMediaItem,
  insertSystemConfig,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4181');

let createApp: Awaited<ReturnType<typeof importApp>>;

const UPLOADER_ID = 'aaaaaaaa-0000-0000-0000-0000000mf001';
const REPORTER_ID = 'bbbbbbbb-0000-0000-0000-0000000mf002';
const REPORTER2_ID = 'cccccccc-0000-0000-0000-0000000mf003';
const TIER0_ID = 'dddddddd-0000-0000-0000-0000000mf004';

const ITEM_ID = 'media_mf_main';
const OWN_ITEM_ID = 'media_mf_own';
const SPARE_ITEMS = ['media_mf_r1', 'media_mf_r2', 'media_mf_r3'];

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

interface FlagRow {
  id: string;
  media_id: string;
  reporter_member_id: string;
  reason_code: string;
  reason_text: string | null;
  status: string;
}

function readDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath, { readonly: true });
}

function flagsFor(mediaId: string): FlagRow[] {
  const db = readDb();
  const rows = db
    .prepare('SELECT id, media_id, reporter_member_id, reason_code, reason_text, status FROM media_flags WHERE media_id = ? ORDER BY id')
    .all(mediaId) as FlagRow[];
  db.close();
  return rows;
}

function queueRowsFor(mediaId: string): { id: string; queue_category: string; task_type: string; status: string; reason_text: string | null; detail_text: string | null }[] {
  const db = readDb();
  const rows = db
    .prepare("SELECT id, queue_category, task_type, status, reason_text, detail_text FROM work_queue_items WHERE entity_type = 'media_item' AND entity_id = ? ORDER BY id")
    .all(mediaId) as { id: string; queue_category: string; task_type: string; status: string; reason_text: string | null; detail_text: string | null }[];
  db.close();
  return rows;
}

function auditRowsFor(mediaId: string): { action_type: string; actor_type: string; actor_member_id: string | null; reason_text: string | null; metadata_json: string }[] {
  const db = readDb();
  const rows = db
    .prepare("SELECT action_type, actor_type, actor_member_id, reason_text, metadata_json FROM audit_entries WHERE entity_type = 'media_item' AND entity_id = ? ORDER BY id")
    .all(mediaId) as { action_type: string; actor_type: string; actor_member_id: string | null; reason_text: string | null; metadata_json: string }[];
  db.close();
  return rows;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, { id: UPLOADER_ID, slug: 'mf_uploader', display_name: 'MF Uploader', login_email: 'mf-uploader@example.com' });
  insertMember(db, { id: REPORTER_ID, slug: 'mf_reporter', display_name: 'MF Reporter', login_email: 'mf-reporter@example.com' });
  insertMember(db, { id: REPORTER2_ID, slug: 'mf_reporter_two', display_name: 'MF Reporter Two', login_email: 'mf-reporter2@example.com' });
  insertMember(db, { id: TIER0_ID, slug: 'mf_tier0', display_name: 'MF Tier Zero', login_email: 'mf-tier0@example.com' });
  for (const id of [UPLOADER_ID, REPORTER_ID, REPORTER2_ID, TIER0_ID]) completeOnboarding(db, id);

  insertMemberTierGrant(db, { member_id: UPLOADER_ID, new_tier_status: 'tier1' });
  insertMemberTierGrant(db, { member_id: REPORTER_ID, new_tier_status: 'tier1' });
  insertMemberTierGrant(db, { member_id: REPORTER2_ID, new_tier_status: 'tier1' });

  insertMediaItem(db, { id: ITEM_ID, uploader_member_id: UPLOADER_ID, caption: 'A shred line', tags: ['#by_mf_uploader'] });
  insertMediaItem(db, { id: OWN_ITEM_ID, uploader_member_id: REPORTER_ID, caption: 'My own photo', tags: ['#by_mf_reporter'] });
  for (const id of SPARE_ITEMS) {
    insertMediaItem(db, { id, uploader_member_id: UPLOADER_ID, caption: `Spare ${id}`, tags: ['#by_mf_uploader'] });
  }

  // A low ceiling so the rate-limit case costs three requests rather than
  // eleven. The key and the window are the production ones.
  insertSystemConfig(db, { config_key: 'media_flag_rate_limit_per_hour', value_json: '2' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('POST /media/item/:mediaId/flag — the benefit gate', () => {
  it('redirects an unauthenticated visitor to log in and records nothing', async () => {
    const res = await request(createApp())
      .post(`/media/item/${ITEM_ID}/flag`)
      .type('form')
      .send({ reason_code: 'spam' });
    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('/login');
    expect(flagsFor(ITEM_ID)).toHaveLength(0);
  });

  it('403s a member without Tier 1 benefits and records nothing', async () => {
    const res = await request(createApp())
      .post(`/media/item/${ITEM_ID}/flag`)
      .set('Cookie', cookieFor(TIER0_ID))
      .type('form')
      .send({ reason_code: 'spam' });
    expect(res.status).toBe(403);
    expect(flagsFor(ITEM_ID)).toHaveLength(0);
  });
});

describe('POST /media/item/:mediaId/flag — recording a report', () => {
  it('records the report, raises one queue card, audits it, and changes nothing about visibility', async () => {
    const before = await request(createApp()).get(`/media/item/${ITEM_ID}`);
    expect(before.status).toBe(200);

    const res = await request(createApp())
      .post(`/media/item/${ITEM_ID}/flag`)
      .set('Cookie', cookieFor(REPORTER_ID))
      .type('form')
      .send({ reason_code: 'infringes_rights', reason_text: 'That is my photograph.' });

    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(`/media/item/${ITEM_ID}`);

    const flags = flagsFor(ITEM_ID);
    expect(flags).toHaveLength(1);
    expect(flags[0].reporter_member_id).toBe(REPORTER_ID);
    expect(flags[0].reason_code).toBe('infringes_rights');
    expect(flags[0].reason_text).toBe('That is my photograph.');
    expect(flags[0].status).toBe('open');

    const queue = queueRowsFor(ITEM_ID);
    expect(queue).toHaveLength(1);
    expect(queue[0].queue_category).toBe('media');
    expect(queue[0].task_type).toBe('media_flag_review');
    expect(queue[0].status).toBe('open');

    // The queue row is a pointer, never a copy of what the member wrote.
    expect(queue[0].detail_text).toBeNull();
    expect(queue[0].reason_text).not.toContain('my photograph');

    const audit = auditRowsFor(ITEM_ID);
    expect(audit).toHaveLength(1);
    expect(audit[0].action_type).toBe('media.flagged');
    expect(audit[0].actor_type).toBe('member');
    expect(audit[0].actor_member_id).toBe(REPORTER_ID);
    expect(JSON.parse(audit[0].metadata_json).reasonCode).toBe('infringes_rights');
    // The ledger is permanent and erasure cannot reach it, so the reporter's
    // own words must never land in it.
    expect(audit[0].reason_text).not.toContain('my photograph');
    expect(audit[0].metadata_json).not.toContain('my photograph');

    // No shadow banning: the item reads exactly as it did before the report.
    const after = await request(createApp()).get(`/media/item/${ITEM_ID}`);
    expect(after.status).toBe(200);
    expect(after.text).toContain('A shred line');
  });

  it('does not count a repeat report from the same member, and raises no second card', async () => {
    const res = await request(createApp())
      .post(`/media/item/${ITEM_ID}/flag`)
      .set('Cookie', cookieFor(REPORTER_ID))
      .type('form')
      .send({ reason_code: 'spam', reason_text: 'Still wrong.' });

    expect(res.status).toBe(303);
    const flags = flagsFor(ITEM_ID);
    expect(flags).toHaveLength(1);
    expect(flags[0].reason_code).toBe('infringes_rights');
    expect(queueRowsFor(ITEM_ID)).toHaveLength(1);
    expect(auditRowsFor(ITEM_ID)).toHaveLength(1);
  });

  it('records a second member’s report on the same item without a second card', async () => {
    const res = await request(createApp())
      .post(`/media/item/${ITEM_ID}/flag`)
      .set('Cookie', cookieFor(REPORTER2_ID))
      .type('form')
      .send({ reason_code: 'illegal_or_harassing' });

    expect(res.status).toBe(303);
    expect(flagsFor(ITEM_ID)).toHaveLength(2);
    expect(queueRowsFor(ITEM_ID)).toHaveLength(1);
    expect(auditRowsFor(ITEM_ID)).toHaveLength(2);
  });

  it('404s an unknown media id and records nothing', async () => {
    const res = await request(createApp())
      .post('/media/item/media_does_not_exist/flag')
      .set('Cookie', cookieFor(REPORTER_ID))
      .type('form')
      .send({ reason_code: 'spam' });
    expect(res.status).toBe(404);
    expect(flagsFor('media_does_not_exist')).toHaveLength(0);
  });
});

describe('POST /media/item/:mediaId/flag — what the form will not accept', () => {
  it('records nothing when no reason is chosen', async () => {
    const res = await request(createApp())
      .post(`/media/item/${SPARE_ITEMS[0]}/flag`)
      .set('Cookie', cookieFor(REPORTER_ID))
      .type('form')
      .send({ reason_text: 'No reason picked.' });
    expect(res.status).toBe(303);
    expect(flagsFor(SPARE_ITEMS[0])).toHaveLength(0);
  });

  it('records nothing for an unrecognized reason code', async () => {
    const res = await request(createApp())
      .post(`/media/item/${SPARE_ITEMS[0]}/flag`)
      .set('Cookie', cookieFor(REPORTER_ID))
      .type('form')
      .send({ reason_code: 'because_i_say_so' });
    expect(res.status).toBe(303);
    expect(flagsFor(SPARE_ITEMS[0])).toHaveLength(0);
  });

  it('records nothing when "Something else" carries no description', async () => {
    const res = await request(createApp())
      .post(`/media/item/${SPARE_ITEMS[0]}/flag`)
      .set('Cookie', cookieFor(REPORTER_ID))
      .type('form')
      .send({ reason_code: 'other', reason_text: '   ' });
    expect(res.status).toBe(303);
    expect(flagsFor(SPARE_ITEMS[0])).toHaveLength(0);
  });

  it('records nothing when the description runs past its cap', async () => {
    const res = await request(createApp())
      .post(`/media/item/${SPARE_ITEMS[0]}/flag`)
      .set('Cookie', cookieFor(REPORTER_ID))
      .type('form')
      .send({ reason_code: 'spam', reason_text: 'x'.repeat(501) });
    expect(res.status).toBe(303);
    expect(flagsFor(SPARE_ITEMS[0])).toHaveLength(0);
  });

  it('persists only the report fields when the body carries extras', async () => {
    const res = await request(createApp())
      .post(`/media/item/${SPARE_ITEMS[0]}/flag`)
      .set('Cookie', cookieFor(REPORTER_ID))
      .type('form')
      .send({
        reason_code: 'spam',
        reason_text: 'Promotional repost.',
        status: 'resolved',
        resolution_label: 'deleted',
        resolved_by_admin_member_id: REPORTER_ID,
        reporter_member_id: UPLOADER_ID,
        media_id: ITEM_ID,
        id: 'mediaflag_crafted',
      });

    expect(res.status).toBe(303);
    const flags = flagsFor(SPARE_ITEMS[0]);
    expect(flags).toHaveLength(1);
    expect(flags[0].id).not.toBe('mediaflag_crafted');
    expect(flags[0].status).toBe('open');
    expect(flags[0].reporter_member_id).toBe(REPORTER_ID);

    const db = readDb();
    const hidden = db
      .prepare('SELECT moderation_status FROM media_items WHERE id = ?')
      .get(SPARE_ITEMS[0]) as { moderation_status: string };
    db.close();
    expect(hidden.moderation_status).toBe('active');
  });
});

describe('POST /media/item/:mediaId/flag — the rate limit', () => {
  it('refuses a member past the hourly ceiling with 429 and Retry-After', async () => {
    // The ceiling is two an hour in this fixture, and the buckets are cleared
    // between tests, so the ceiling is reached inside this one. The middle
    // request is a repeat on an item this member already reported: it records
    // nothing and still spends an attempt, which is what stops a repeat from
    // being a free way to keep posting.
    const first = await request(createApp())
      .post(`/media/item/${SPARE_ITEMS[1]}/flag`)
      .set('Cookie', cookieFor(REPORTER2_ID))
      .type('form')
      .send({ reason_code: 'spam' });
    expect(first.status).toBe(303);

    const repeat = await request(createApp())
      .post(`/media/item/${ITEM_ID}/flag`)
      .set('Cookie', cookieFor(REPORTER2_ID))
      .type('form')
      .send({ reason_code: 'spam' });
    expect(repeat.status).toBe(303);

    const overLimit = await request(createApp())
      .post(`/media/item/${SPARE_ITEMS[2]}/flag`)
      .set('Cookie', cookieFor(REPORTER2_ID))
      .type('form')
      .send({ reason_code: 'spam' });

    expect(overLimit.status).toBe(429);
    expect(overLimit.headers['retry-after']).toBeDefined();
    expect(flagsFor(SPARE_ITEMS[2])).toHaveLength(0);
  });
});

describe('the reporting control on the item page', () => {
  it('offers the control to an eligible member', async () => {
    const res = await request(createApp())
      .get(`/media/item/${SPARE_ITEMS[1]}`)
      .set('Cookie', cookieFor(REPORTER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain(`/media/item/${SPARE_ITEMS[1]}/flag`);
    expect(res.text).toContain('Report This Item');
  });

  it('shows a member who already reported an item that they did, and no second form', async () => {
    const res = await request(createApp())
      .get(`/media/item/${ITEM_ID}`)
      .set('Cookie', cookieFor(REPORTER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('You reported this item');
    expect(res.text).not.toContain('Report This Item');
  });

  it('offers nothing on the viewer’s own item', async () => {
    const res = await request(createApp())
      .get(`/media/item/${OWN_ITEM_ID}`)
      .set('Cookie', cookieFor(REPORTER_ID));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Report This Item');
  });

  it('offers nothing to a member without Tier 1 benefits', async () => {
    const res = await request(createApp())
      .get(`/media/item/${ITEM_ID}`)
      .set('Cookie', cookieFor(TIER0_ID));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Report This Item');
  });

  it('offers nothing to a visitor who is not signed in', async () => {
    const res = await request(createApp()).get(`/media/item/${ITEM_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Report This Item');
  });
});
