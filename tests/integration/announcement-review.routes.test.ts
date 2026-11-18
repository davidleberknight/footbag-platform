/**
 * An administrator's decision on a member's held community announcement, from
 * its work-queue item page.
 *
 * Contract verified:
 *   - the item page shows the announcement as the member wrote it, names its
 *     author, and offers exactly the two declared decisions
 *   - approving sends it to the announce list under the member's name: one
 *     message per subscriber from the list address, an announce archive row
 *     naming the member as sender, the announcement approved with that archive,
 *     the item resolved, an audit row naming the approving administrator with no
 *     member text, and the member emailed
 *   - an administrator cannot approve their own announcement, and an author no
 *     longer at Tier 2 or 3 cannot be sent for; both leave it waiting
 *   - the daily limit is counted at approval from what was sent in the last 24
 *     hours; over it the approval is refused unless the override is ticked,
 *     which the audit row records; a sent-back announcement never counts
 *   - a list nobody can receive refuses the approval and leaves it waiting
 *   - sending back requires a note of at most 500 characters, closes the item,
 *     and emails the member the note but never their body
 *   - the same decision submitted twice acts once and spends no rate-limit slot;
 *     a decision someone else already made is reported, not repeated
 *   - only an administrator reaches the decisions, and the shared resolve rate
 *     limit answers 429 with Retry-After
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { flashValueOf } from '../fixtures/flashCookie';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMemberTierGrant,
  insertMailingListSubscription,
  insertMemberAnnouncement,
  insertWorkQueueItem,
  insertEmailArchive,
  insertSystemConfig,
  createTestSessionJwt,
} from '../fixtures/factories';
import { isoDaysFromNow } from '../fixtures/clock';

const { dbPath } = setTestEnv('4471');

const ADMIN       = 'ar_admin_001';
const OTHER_ADMIN = 'ar_admin_002';
// A fresh organizer-tier author per case, so one case's sends never count
// against another's daily limit and its mail is read on its own.
let AUTHOR = '';
let AUTHOR_SLUG = '';
let authorSeq = 0;
const LAPSED      = 'ar_lapsed_001';
const SUB_ONE     = 'ar_sub_001';
const SUB_TWO     = 'ar_sub_002';
const AUTHOR_NAME = 'Annie Author';

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

function cookieFor(memberId: string, admin = true): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, ...(admin ? { role: 'admin' as const } : {}) })}`;
}

let seq = 0;
/** A held announcement and its open review item. */
function seedHeld(memberId = AUTHOR, words?: { subject?: string; body_text?: string }): { annId: string; itemId: string } {
  seq += 1;
  const annId = insertMemberAnnouncement(db, {
    member_id: memberId,
    subject: words?.subject ?? `Club meetup ${seq}`,
    body_text: words?.body_text ?? `Meet at the park, gate ${seq}.\n\nBring a bag.`,
  });
  const itemId = insertWorkQueueItem(db, {
    task_type: 'announcement_review', entity_type: 'member_announcement', entity_id: annId,
    created_by: memberId,
  });
  return { annId, itemId };
}

function approve(itemId: string, body: string, as = ADMIN) {
  return request(createApp()).post(`/admin/work-queue/${itemId}/announcement/approve`)
    .set('Cookie', cookieFor(as)).type('form').send(body);
}
function sendBack(itemId: string, comment: string, as = ADMIN) {
  return request(createApp()).post(`/admin/work-queue/${itemId}/announcement/send-back`)
    .set('Cookie', cookieFor(as)).type('form').send({ comment });
}
/** The approve form as the item page renders it: hidden "0", then the box when ticked. */
const UNTICKED = 'allow_extra=0';
const TICKED = 'allow_extra=0&allow_extra=1';

function annRow(id: string) {
  return db.prepare('SELECT status, email_archive_id, decided_by_member_id, admin_comment FROM member_announcements WHERE id = ?')
    .get(id) as { status: string; email_archive_id: string | null; decided_by_member_id: string | null; admin_comment: string | null };
}
function itemRow(id: string) {
  return db.prepare('SELECT status, decision_label FROM work_queue_items WHERE id = ?').get(id) as { status: string; decision_label: string | null };
}
function listMail(subjectLike: string) {
  return db.prepare(
    "SELECT recipient_member_id, from_identity, stream FROM outbox_emails WHERE mailing_list_id = 'announce' AND subject = ?",
  ).all(subjectLike) as Array<{ recipient_member_id: string; from_identity: string; stream: string }>;
}
function memberMail(template: string) {
  return db.prepare(
    'SELECT subject, body_text FROM outbox_emails WHERE recipient_member_id = ? AND template_key = ? ORDER BY created_at, id',
  ).all(AUTHOR, template) as Array<{ subject: string; body_text: string | null }>;
}
function auditsFor(annId: string, actionType: string) {
  return db.prepare(
    'SELECT actor_type, actor_member_id, reason_text, metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = ?',
  ).all(annId, actionType) as Array<{ actor_type: string; actor_member_id: string; reason_text: string | null; metadata_json: string }>;
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN, slug: 'ar_admin', login_email: 'ar-admin@example.com', is_admin: 1 });
  insertMember(db, { id: OTHER_ADMIN, slug: 'ar_admin_two', login_email: 'ar-admin2@example.com', is_admin: 1 });
  insertMember(db, { id: LAPSED, slug: 'ar_lapsed', login_email: 'ar-lapsed@example.com' });
  insertMemberTierGrant(db, { member_id: LAPSED, new_tier_status: 'tier1', new_underlying_tier_status: 'tier1', reason_code: 'purchase.tier1' });
  insertMember(db, { id: SUB_ONE, slug: 'ar_sub_one', login_email: 'ar-one@example.com' });
  insertMember(db, { id: SUB_TWO, slug: 'ar_sub_two', login_email: 'ar-two@example.com' });
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

beforeEach(() => {
  db.prepare('DELETE FROM mailing_list_subscriptions').run();
  insertMailingListSubscription(db, { member_id: SUB_ONE, list_slug: 'announce', status: 'subscribed' });
  insertMailingListSubscription(db, { member_id: SUB_TWO, list_slug: 'announce', status: 'subscribed' });
  authorSeq += 1;
  AUTHOR = `ar_author_${authorSeq}`;
  AUTHOR_SLUG = `ar_author_${authorSeq}`;
  insertMember(db, {
    id: AUTHOR, slug: AUTHOR_SLUG, login_email: `ar-author-${authorSeq}@example.com`,
    display_name: AUTHOR_NAME, real_name: AUTHOR_NAME,
  });
  insertMemberTierGrant(db, { member_id: AUTHOR, new_tier_status: 'tier2', new_underlying_tier_status: 'tier2', reason_code: 'purchase.tier2' });
});

describe('the held announcement on its item page', () => {
  // Defect caught: the administrator decides without seeing the words, or
  // without knowing whose they are, or has no control to decide with.
  it('shows the subject, each paragraph and the author, with the two decisions', async () => {
    const { itemId } = seedHeld(AUTHOR, { subject: 'Spring jam at the park', body_text: 'First paragraph here.\n\nSecond paragraph here.' });
    const res = await request(createApp()).get(`/admin/work-queue/${itemId}`).set('Cookie', cookieFor(ADMIN));
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h3>Spring jam at the park</h3>');
    expect(res.text).toContain('<p>First paragraph here.</p>');
    expect(res.text).toContain('<p>Second paragraph here.</p>');
    expect(res.text).toContain(`href="/members/${AUTHOR_SLUG}"`);
    expect(res.text).toContain(`action="/admin/work-queue/${itemId}/announcement/approve"`);
    expect(res.text).toContain(`action="/admin/work-queue/${itemId}/announcement/send-back"`);
    expect(res.text).toMatch(/<input type="hidden" name="allow_extra" value="0" \/>\s*<label><input type="checkbox"[^>]*name="allow_extra" value="1"/);
    expect(res.text).not.toContain(`/admin/work-queue/${itemId}/park`);
  });

  it('refuses the decisions to a non-administrator', async () => {
    const { itemId, annId } = seedHeld();
    const res = await request(createApp()).post(`/admin/work-queue/${itemId}/announcement/approve`)
      .set('Cookie', cookieFor(AUTHOR, false)).type('form').send(UNTICKED);
    expect(res.status).toBe(403);
    expect(annRow(annId).status).toBe('pending');
  });
});

describe('approving', () => {
  // Defect caught: approval sends nothing, sends under the administrator's
  // name, leaves the item open, puts the member's words in the ledger, or
  // never tells the member.
  it('sends it to the list under the member\'s name and records every side of it', async () => {
    const { itemId, annId } = seedHeld(AUTHOR, { subject: 'Approved and out' });
    const res = await approve(itemId, UNTICKED);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/work-queue');

    const mail = listMail('Approved and out');
    expect(mail.map((m) => m.recipient_member_id).sort()).toEqual([SUB_ONE, SUB_TWO]);
    expect(mail.every((m) => m.from_identity === 'announce@footbag.org' && m.stream === 'bulk')).toBe(true);

    const ann = annRow(annId);
    expect(ann.status).toBe('approved');
    expect(ann.decided_by_member_id).toBe(ADMIN);
    const archive = db.prepare('SELECT archive_type, sender_member_id, recipient_count FROM email_archives WHERE id = ?')
      .get(ann.email_archive_id) as { archive_type: string; sender_member_id: string; recipient_count: number };
    expect(archive).toEqual({ archive_type: 'announce', sender_member_id: AUTHOR, recipient_count: 2 });

    expect(itemRow(itemId)).toEqual({ status: 'resolved', decision_label: 'approved' });

    const audit = auditsFor(annId, 'announce.approved');
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor_type).toBe('admin');
    expect(audit[0]!.actor_member_id).toBe(ADMIN);
    expect(JSON.parse(audit[0]!.metadata_json)).toMatchObject({ archiveId: ann.email_archive_id, limitOverridden: false });
    expect(JSON.stringify(audit)).not.toContain('Approved and out');
    // The list send's own record names the administrator who acted.
    const sent = db.prepare(
      "SELECT actor_type, actor_member_id FROM audit_entries WHERE action_type = 'mailing_list.broadcast_sent' AND metadata_json LIKE ?",
    ).all(`%${ann.email_archive_id}%`) as Array<{ actor_type: string; actor_member_id: string }>;
    expect(sent).toEqual([{ actor_type: 'admin', actor_member_id: ADMIN }]);

    const notice = memberMail('announce_approved');
    expect(notice.length).toBeGreaterThanOrEqual(1);
    expect(notice.at(-1)!.body_text).toContain('Approved and out');
  });

  // Defect caught: a double click mails the list twice or files a second
  // approval.
  it('sends once when approved twice, reporting the first approval', async () => {
    const { itemId, annId } = seedHeld(AUTHOR, { subject: 'Twice clicked' });
    expect((await approve(itemId, UNTICKED)).status).toBe(303);
    const again = await approve(itemId, UNTICKED);
    expect(again.status).toBe(303);
    expect(again.headers.location).toBe('/admin/work-queue');
    // The administrator's own repeat reports the first approval's success.
    expect(flashValueOf(again)).toMatch(/^work_queue_resolved:/);
    expect(listMail('Twice clicked')).toHaveLength(2);
    expect(auditsFor(annId, 'announce.approved')).toHaveLength(1);
  });

  // Defect caught: a second administrator's click on an already decided
  // announcement sends it or overwrites the decision.
  it('reports a decision another administrator already made without acting', async () => {
    const { itemId, annId } = seedHeld(AUTHOR, { subject: 'Decided elsewhere' });
    expect((await sendBack(itemId, 'Needs a date.', OTHER_ADMIN)).status).toBe(303);
    const res = await approve(itemId, UNTICKED);
    expect(res.status).toBe(303);
    // Reported as already settled, informationally, never as this
    // administrator's own success.
    expect(flashValueOf(res)).toMatch(/^work_queue_outcome:/);
    expect(listMail('Decided elsewhere')).toHaveLength(0);
    expect(annRow(annId).status).toBe('returned');
  });

  // Defect caught: an administrator approves their own announcement with
  // nobody else in the loop.
  it('refuses an administrator approving their own announcement and leaves it waiting', async () => {
    const { itemId, annId } = seedHeld(ADMIN, { subject: 'My own words' });
    const res = await approve(itemId, UNTICKED);
    expect(res.status).toBe(422);
    expect(res.text).toContain('class="form-error-banner"');
    expect(annRow(annId).status).toBe('pending');
    expect(itemRow(itemId).status).toBe('open');
    expect(listMail('My own words')).toHaveLength(0);
    // Another administrator can.
    expect((await approve(itemId, UNTICKED, OTHER_ADMIN)).status).toBe(303);
    expect(annRow(annId).status).toBe('approved');
  });

  // Defect caught: an author who lost organizer tier after submitting is
  // still sent for.
  it('refuses an author no longer at Tier 2 or 3', async () => {
    const { itemId, annId } = seedHeld(LAPSED, { subject: 'Lapsed author' });
    const res = await approve(itemId, UNTICKED);
    expect(res.status).toBe(422);
    expect(annRow(annId).status).toBe('pending');
    expect(listMail('Lapsed author')).toHaveLength(0);
  });

  // Defect caught: approving to a list nobody receives records a send that
  // never happened and closes the member's announcement.
  it('refuses when nobody can receive it, and leaves it waiting', async () => {
    db.prepare('DELETE FROM mailing_list_subscriptions').run();
    const { itemId, annId } = seedHeld(AUTHOR, { subject: 'Into the void' });
    const res = await approve(itemId, UNTICKED);
    expect(res.status).toBe(422);
    expect(annRow(annId).status).toBe('pending');
    expect(itemRow(itemId).status).toBe('open');
    expect(db.prepare("SELECT COUNT(*) AS c FROM email_archives WHERE subject = 'Into the void'").get()).toEqual({ c: 0 });
  });
});

describe('the daily limit, counted at approval', () => {
  // Defect caught: a member gets several announcements out in one day, or the
  // override cannot be used, or is used without a trace.
  it('refuses one over the limit unless the override is ticked, which the audit row records', async () => {
    insertEmailArchive(db, { archive_type: 'announce', mailing_list_id: 'announce', sender_member_id: AUTHOR, sent_at: isoDaysFromNow(-0.5) });
    const { itemId, annId } = seedHeld(AUTHOR, { subject: 'Second today' });

    const refused = await approve(itemId, UNTICKED);
    expect(refused.status).toBe(422);
    expect(annRow(annId).status).toBe('pending');
    expect(listMail('Second today')).toHaveLength(0);

    const ticked = await approve(itemId, TICKED);
    expect(ticked.status).toBe(303);
    expect(annRow(annId).status).toBe('approved');
    expect(JSON.parse(auditsFor(annId, 'announce.approved')[0]!.metadata_json).limitOverridden).toBe(true);
  });

  // Defect caught: yesterday's send, or one that was sent back and never
  // went out, blocks today's.
  it('counts only what was sent in the last 24 hours', async () => {
    insertEmailArchive(db, { archive_type: 'announce', mailing_list_id: 'announce', sender_member_id: AUTHOR, sent_at: isoDaysFromNow(-1.1) });
    insertMemberAnnouncement(db, { member_id: AUTHOR, status: 'returned', admin_comment: 'No.' });
    const { itemId, annId } = seedHeld(AUTHOR, { subject: 'Only one today' });
    expect((await approve(itemId, UNTICKED)).status).toBe(303);
    expect(annRow(annId).status).toBe('approved');
    expect(JSON.parse(auditsFor(annId, 'announce.approved')[0]!.metadata_json).limitOverridden).toBe(false);
  });
});

describe('sending back', () => {
  // Defect caught: the member is never told why, gets their own body echoed
  // into a mailbox, or the item stays open.
  it('closes the item and emails the member the note, never the body', async () => {
    const { itemId, annId } = seedHeld(AUTHOR, { subject: 'Sent back one', body_text: 'Body words that stay private.' });
    const before = memberMail('announce_returned').length;
    const res = await sendBack(itemId, 'Please add the start time.');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/work-queue');

    expect(annRow(annId)).toMatchObject({ status: 'returned', admin_comment: 'Please add the start time.', decided_by_member_id: ADMIN });
    expect(itemRow(itemId)).toEqual({ status: 'resolved', decision_label: 'returned' });
    expect(listMail('Sent back one')).toHaveLength(0);

    const mail = memberMail('announce_returned');
    expect(mail).toHaveLength(before + 1);
    expect(mail.at(-1)!.body_text).toContain('Please add the start time.');
    expect(mail.at(-1)!.body_text).toContain('Sent back one');
    expect(mail.at(-1)!.body_text).not.toContain('Body words that stay private.');

    const audit = auditsFor(annId, 'announce.returned');
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor_member_id).toBe(ADMIN);
    expect(JSON.stringify(audit)).not.toContain('Please add the start time.');
  });

  // Defect caught: an empty or overlong note reaches the member, or the
  // refusal closes the item anyway.
  it('requires a note of at most 500 characters', async () => {
    const { itemId, annId } = seedHeld();
    expect((await sendBack(itemId, '   ')).status).toBe(422);
    expect((await sendBack(itemId, 'x'.repeat(501))).status).toBe(422);
    expect(annRow(annId).status).toBe('pending');
    expect(itemRow(itemId).status).toBe('open');
    expect((await sendBack(itemId, 'x'.repeat(500))).status).toBe(303);
    expect(annRow(annId).status).toBe('returned');
  });

  // Defect caught: a second send-back with a different note is taken for a
  // repeat of the first and reported as done, while the member only ever saw
  // the first note.
  it('does not take a changed note for a repeat of the first send-back', async () => {
    const { itemId, annId } = seedHeld();
    const first = await sendBack(itemId, 'Note A.');
    expect(flashValueOf(first)).toMatch(/^work_queue_resolved:/);
    const before = memberMail('announce_returned').length;
    const changed = await sendBack(itemId, 'Note B.');
    expect(changed.status).toBe(303);
    expect(flashValueOf(changed)).toMatch(/^work_queue_outcome:/);
    expect(memberMail('announce_returned')).toHaveLength(before);
    expect(annRow(annId).admin_comment).toBe('Note A.');
  });

  // Defect caught: a double click emails the member twice.
  it('emails once when the same send-back is submitted twice', async () => {
    const { itemId, annId } = seedHeld();
    const before = memberMail('announce_returned').length;
    expect((await sendBack(itemId, 'Twice.')).status).toBe(303);
    const again = await sendBack(itemId, 'Twice.');
    expect(again.status).toBe(303);
    expect(flashValueOf(again)).toMatch(/^work_queue_resolved:/);
    expect(memberMail('announce_returned')).toHaveLength(before + 1);
    expect(auditsFor(annId, 'announce.returned')).toHaveLength(1);
  });
});

describe('the shared resolve rate limit', () => {
  // Defect caught: a repeat spends a slot, so the administrator is throttled
  // for clicking twice; or the limit is not enforced on these decisions.
  it('spends no slot on a repeat and answers 429 with Retry-After past the limit', async () => {
    const rl = await import('../../src/services/rateLimitService');
    rl.resetRateLimitForTests();
    insertSystemConfig(db, { config_key: 'work_queue_resolve_rate_limit_per_hour', value_json: '1' });
    try {
      const a = seedHeld(AUTHOR, { subject: 'Within the limit' });
      expect((await approve(a.itemId, UNTICKED)).status).toBe(303);
      expect((await approve(a.itemId, UNTICKED)).status).toBe(303);

      const b = seedHeld(AUTHOR, { subject: 'Past the limit' });
      const blocked = await sendBack(b.itemId, 'Too many.');
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
      expect(annRow(b.annId).status).toBe('pending');
    } finally {
      insertSystemConfig(db, { config_key: 'work_queue_resolve_rate_limit_per_hour', value_json: '120' });
      rl.resetRateLimitForTests();
    }
  });
});
