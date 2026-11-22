/**
 * The community announcement an organizer-tier member submits for review.
 *
 * Contract verified:
 *   - the surface is organizer-tier and owner-only: a signed-out visitor, a
 *     Tier 1 member, and a member reaching for someone else's path are all
 *     refused, the last as a 404 so the path cannot be used to discover slugs
 *   - submitting holds the announcement and raises one review item for the
 *     moderation area; nothing reaches the list or the archive
 *   - the form requires the Community Standards agreement tick; without it the
 *     submit is refused with the subject and body kept, and the corrected form
 *     goes through
 *   - a member may have one announcement awaiting review; a second is refused
 *     with the text kept
 *   - the form asks where the announcement is published (the announce list,
 *     the news feed, or both), refuses neither, keeps the choice across a
 *     refusal and on a sent-back one, and holds a subject for the feed to a
 *     news title's length
 *   - the same rendered form submitted twice holds one announcement
 *   - one sent back opens in the form with its text and the administrator's note
 *   - the shortcut appears on an organizer's profile and not on a Tier 1 one
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { flashCookieOf, flashValueOf } from '../fixtures/flashCookie';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMailingListSubscription,
  insertMemberAnnouncement,
  insertMemberTierGrant,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3096');

const ORGANIZER   = 'an_org_001';
const ORG_SLUG    = 'an_organizer';
const PLAIN       = 'an_plain_001';
const PLAIN_SLUG  = 'an_plain';
const SUB_ONE     = 'an_sub_001';

const ANNOUNCE = `/members/${ORG_SLUG}/announce`;

let createApp: Awaited<ReturnType<typeof importApp>>;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let WORK_QUEUE_TASK_TYPES: typeof import('../../src/services/workQueueTaskTypes').WORK_QUEUE_TASK_TYPES;

function organizerCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ORGANIZER })}`;
}
function plainCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: PLAIN })}`;
}

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

interface HeldRow { id: string; subject: string; body_text: string; status: string }

function heldRows(): HeldRow[] {
  return withDb((db) => db.prepare(
    'SELECT id, subject, body_text, status FROM member_announcements WHERE member_id = ? ORDER BY created_at, id',
  ).all(ORGANIZER) as HeldRow[]);
}

function reviewItems(): Array<{ entity_type: string; entity_id: string; reason_text: string | null; detail_text: string | null }> {
  return withDb((db) => db.prepare(
    `SELECT entity_type, entity_id, reason_text, detail_text FROM work_queue_items
      WHERE task_type = 'announcement_review' AND status = 'open'`,
  ).all() as Array<{ entity_type: string; entity_id: string; reason_text: string | null; detail_text: string | null }>);
}

function listMailCount(): number {
  return withDb((db) => (db.prepare(
    "SELECT COUNT(*) AS c FROM outbox_emails WHERE mailing_list_id = 'announce'",
  ).get() as { c: number }).c);
}

function archiveCount(): number {
  return withDb((db) => (db.prepare('SELECT COUNT(*) AS c FROM email_archives').get() as { c: number }).c);
}

/** The send token the rendered form carries. */
function tokenFrom(html: string): string {
  const m = html.match(/name="sendToken" value="([^"]+)"/);
  if (!m) throw new Error('announce form carried no send token');
  return m[1]!;
}

async function formToken(): Promise<string> {
  const form = await request(createApp()).get(ANNOUNCE).set('Cookie', organizerCookie());
  return tokenFrom(form.text);
}

/** The body a browser posts for the form as rendered, each box ticked or not:
 *  the hidden "0" always, then the box's "1" when ticked. The places default
 *  to the announce list alone. */
function formBody(
  fields: { subject: string; bodyText: string; sendToken: string },
  ticked: boolean,
  places: { list?: boolean; feed?: boolean } = { list: true },
): string {
  const p = new URLSearchParams({ sendToken: fields.sendToken, subject: fields.subject, bodyText: fields.bodyText });
  p.append('agree', '0');
  if (ticked) p.append('agree', '1');
  p.append('publishList', '0');
  if (places.list) p.append('publishList', '1');
  p.append('publishFeed', '0');
  if (places.feed) p.append('publishFeed', '1');
  return p.toString();
}

function heldPlaces(): string[] {
  return withDb((db) => (db.prepare(
    'SELECT publish_to FROM member_announcements WHERE member_id = ? ORDER BY created_at, id',
  ).all(ORGANIZER) as Array<{ publish_to: string }>).map((r) => r.publish_to));
}

function submit(body: string) {
  return request(createApp()).post(ANNOUNCE).set('Cookie', organizerCookie()).type('form').send(body);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ORGANIZER, slug: ORG_SLUG,   login_email: 'an-org@example.com' });
  insertMember(db, { id: PLAIN,     slug: PLAIN_SLUG, login_email: 'an-plain@example.com' });
  // Tier is held in the append-only grant ledger the tier predicates read, not
  // on the member row.
  insertMemberTierGrant(db, {
    member_id: ORGANIZER, new_tier_status: 'tier2',
    new_underlying_tier_status: 'tier2', reason_code: 'purchase.tier2',
  });
  insertMemberTierGrant(db, {
    member_id: PLAIN, new_tier_status: 'tier1',
    new_underlying_tier_status: 'tier1', reason_code: 'purchase.tier1',
  });
  insertMember(db, { id: SUB_ONE, slug: 'an_sub_one', login_email: 'an-one@example.com' });
  insertMailingListSubscription(db, { member_id: SUB_ONE, list_slug: 'announce', status: 'subscribed' });
  db.close();
  createApp = await importApp();
  WORK_QUEUE_TASK_TYPES = (await import('../../src/services/workQueueTaskTypes')).WORK_QUEUE_TASK_TYPES;
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => {
    db.prepare("DELETE FROM work_queue_items WHERE task_type = 'announcement_review'").run();
    db.prepare('DELETE FROM member_announcements').run();
    db.prepare('DELETE FROM outbox_emails').run();
  });
});

describe('who may submit an announcement', () => {
  it('sends an unauthenticated visitor to sign in', async () => {
    const res = await request(createApp()).get(ANNOUNCE);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('refuses a Tier 1 member posting an announcement, and holds nothing', async () => {
    const res = await request(createApp())
      .post(`/members/${PLAIN_SLUG}/announce`).set('Cookie', plainCookie()).type('form')
      .send(formBody({ subject: 'Not mine to send', bodyText: 'Body', sendToken: 'tok-plain' }, true));
    expect(res.status).toBe(403);
    expect(withDb((db) => db.prepare('SELECT COUNT(*) AS c FROM member_announcements').get())).toEqual({ c: 0 });
  });

  it('404s an organizer reaching for another member\'s announce form', async () => {
    const res = await request(createApp())
      .get(`/members/${PLAIN_SLUG}/announce`).set('Cookie', organizerCookie());
    expect(res.status).toBe(404);
  });

  // Defect caught: a field repeated by a hand-made request goes in with
  // whichever value the code read, or the refused form loses the message.
  it('refuses a field posted twice at 422, keeps the message, and holds nothing', async () => {
    const res = await submit('subject=One&subject=Two&bodyText=Kept+typed+message&sendToken=tok-shape&agree=0&agree=1&publishList=0&publishList=1');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Kept typed message');
    expect(heldRows()).toHaveLength(0);
  });
});

describe('the announce form', () => {
  // Defect caught: the form has no agreement box, so no submit a member can
  // make from the page is ever accepted; or the box posts somewhere else.
  it('carries the agreement box linking the Community Standards, posting to the member\'s own path', async () => {
    const res = await request(createApp()).get(ANNOUNCE).set('Cookie', organizerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain(`action="${ANNOUNCE}"`);
    expect(res.text).toMatch(/<input type="checkbox" id="agree" name="agree" value="1"/);
    expect(res.text).toContain('href="/community-standards"');
    expect(res.text).toContain('data-volunteer-notice');
    // One subscriber is counted in the singular.
    expect(res.text).toContain('1 member currently receives these.');
    // The form asks where to publish, with neither place chosen for the member.
    expect(res.text).toMatch(/<input type="checkbox" id="publishList" name="publishList" value="1"\s*\/>/);
    expect(res.text).toMatch(/<input type="checkbox" id="publishFeed" name="publishFeed" value="1"\s*\/>/);
  });
});

describe('where an announcement is published', () => {
  // Defect caught: a submit choosing no place is held, and approving it would
  // publish nowhere; or the refusal drops the text, so the member retypes it.
  it('refuses a submit choosing neither place, keeping the text, and takes the corrected form', async () => {
    const fields = { subject: 'Jam on Sunday', bodyText: 'Kept across the refusal', sendToken: await formToken() };
    const refused = await submit(formBody(fields, true, {}));
    expect(refused.status).toBe(422);
    expect(refused.text).toContain('class="form-error-banner"');
    expect(refused.text).toContain('Kept across the refusal');
    expect(heldRows()).toHaveLength(0);

    const corrected = await submit(formBody({ ...fields, sendToken: tokenFrom(refused.text) }, true, { feed: true }));
    expect(corrected.status).toBe(303);
    expect(heldPlaces()).toEqual(['feed']);
  });

  // Defect caught: the member's choice is lost, so an approval publishes to
  // the wrong place.
  it('holds the places chosen: both boxes as both', async () => {
    const res = await submit(formBody(
      { subject: 'Both ways', bodyText: 'Body', sendToken: await formToken() }, true, { list: true, feed: true },
    ));
    expect(res.status).toBe(303);
    expect(heldPlaces()).toEqual(['both']);
  });

  // Defect caught: a refusal re-renders with the member's places unticked, so
  // resubmitting the page as rendered is refused again or goes somewhere else.
  it('keeps the ticked places across a refusal', async () => {
    const refused = await submit(formBody(
      { subject: '', bodyText: 'Body', sendToken: await formToken() }, true, { feed: true },
    ));
    expect(refused.status).toBe(422);
    expect(refused.text).toMatch(/name="publishFeed" value="1" checked/);
    expect(refused.text).not.toMatch(/name="publishList" value="1" checked/);
  });

  // Defect caught: a subject too long for a news title is held for the feed,
  // and its approval then fails on the post's own rules.
  it('refuses a subject longer than a news title when the feed is chosen, and holds it for the list alone', async () => {
    // A news title holds 200 characters; the email subject holds 300.
    const subject = 'x'.repeat(201);
    const refused = await submit(formBody({ subject, bodyText: 'Body', sendToken: await formToken() }, true, { feed: true }));
    expect(refused.status).toBe(422);
    expect(heldRows()).toHaveLength(0);

    const fits = await submit(formBody({ subject: 'x'.repeat(200), bodyText: 'Body', sendToken: await formToken() }, true, { feed: true }));
    expect(fits.status).toBe(303);
    withDb((db) => db.prepare('DELETE FROM member_announcements').run());

    const listOnly = await submit(formBody({ subject, bodyText: 'Body', sendToken: await formToken() }, true, { list: true }));
    expect(listOnly.status).toBe(303);
    expect(heldPlaces()).toEqual(['list']);
  });

  // Defect caught: the body loses its indentation, so a nested Markdown list
  // or an indented line in the email arrives flattened.
  it('keeps each line\'s leading spaces in the held body', async () => {
    const bodyText = 'Schedule:\n\n- Saturday\n  - Net at noon\n- Sunday';
    expect((await submit(formBody({ subject: 'Indented', bodyText, sendToken: await formToken() }, true, { feed: true }))).status).toBe(303);
    expect(heldRows()[0]!.body_text).toBe(bodyText);
  });

  // Defect caught: a resubmit of one form with its places changed is taken
  // for the first submit, so the change is silently dropped.
  it('does not take a resubmit with changed places for the first submit', async () => {
    const token = await formToken();
    const fields = { subject: 'Changed places', bodyText: 'Body', sendToken: token };
    expect((await submit(formBody(fields, true, { list: true }))).status).toBe(303);
    const changed = await submit(formBody(fields, true, { feed: true }));
    expect(changed.status).toBe(422);
    expect(heldPlaces()).toEqual(['list']);
    expect(reviewItems()).toHaveLength(1);
  });

  // Defect caught: a sent-back announcement reopens with no places ticked, so
  // the member has to remember and re-choose where it was going.
  it('reopens a sent-back announcement with its places ticked', async () => {
    withDb((db) => insertMemberAnnouncement(db, {
      member_id: ORGANIZER, subject: 'Returned', body_text: 'Body', status: 'returned',
      admin_comment: 'Shorten it.', publish_to: 'feed',
    }));
    const page = await request(createApp()).get(ANNOUNCE).set('Cookie', organizerCookie());
    expect(page.text).toMatch(/name="publishFeed" value="1" checked/);
    expect(page.text).not.toMatch(/name="publishList" value="1" checked/);
  });
});

describe('submitting an announcement', () => {
  // Defect caught: the announcement still goes straight to the list, or is
  // held with no review item, so nobody ever sees it.
  it('holds it for review with one review item and sends nothing', async () => {
    const res = await submit(formBody({ subject: 'Worlds is open', bodyText: 'Registration opens Monday.', sendToken: await formToken() }, true));

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(ANNOUNCE);
    expect(flashValueOf(res)).toBe('announce_result:submitted');

    const held = heldRows();
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ subject: 'Worlds is open', body_text: 'Registration opens Monday.', status: 'pending' });

    const items = reviewItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.entity_type).toBe('member_announcement');
    expect(items[0]!.entity_id).toBe(held[0]!.id);
    // The queue row carries none of the member's words.
    expect(items[0]!.reason_text).toBeNull();
    expect(items[0]!.detail_text).toBeNull();
    expect(WORK_QUEUE_TASK_TYPES.announcement_review!.kind).toBe('waiting');
    expect(WORK_QUEUE_TASK_TYPES.announcement_review!.routeTopic).toBe('moderation');

    expect(listMailCount()).toBe(0);
    expect(archiveCount()).toBe(0);

    // The member lands on the form told it was submitted.
    const page = await request(createApp()).get(ANNOUNCE)
      .set('Cookie', `${organizerCookie()}; ${flashCookieOf(res)}`);
    expect(page.text).toContain('class="form-success-banner"');
  });

  // Defect caught: the box is not enforced, or a refusal loses what the
  // member typed, or the corrected form is still refused.
  it('refuses a submit without the tick, keeping the text, and takes the corrected form', async () => {
    const token = await formToken();
    const fields = { subject: 'Club night', bodyText: 'Kept across the refusal', sendToken: token };

    const refused = await submit(formBody(fields, false));
    expect(refused.status).toBe(422);
    expect(refused.text).toContain('value="Club night"');
    expect(refused.text).toContain('Kept across the refusal');
    expect(refused.text).toContain('class="form-error-banner"');
    expect(refused.text).not.toMatch(/name="agree" value="1" checked/);
    expect(heldRows()).toHaveLength(0);

    // Resubmitted as rendered, with the box ticked.
    const corrected = await submit(formBody({ ...fields, sendToken: tokenFrom(refused.text) }, true));
    expect(corrected.status).toBe(303);
    expect(heldRows()).toHaveLength(1);
  });

  it('refuses a submit with no subject and keeps the text and the tick', async () => {
    const res = await submit(formBody({ subject: '', bodyText: 'Kept across the failure', sendToken: await formToken() }, true));
    expect(res.status).toBe(422);
    expect(res.text).toMatch(/Subject: required/);
    expect(res.text).toContain('Kept across the failure');
    expect(res.text).toMatch(/name="agree" value="1" checked/);
    expect(heldRows()).toHaveLength(0);
  });

  // Defect caught: a double click holds two copies and raises two review items.
  it('holds one announcement when the same form is submitted twice, reporting the first submit', async () => {
    const body = formBody({ subject: 'Once only', bodyText: 'Body', sendToken: await formToken() }, true);
    const first = await submit(body);
    const second = await submit(body);
    expect(first.status).toBe(303);
    expect(second.status).toBe(303);
    expect(flashValueOf(second)).toBe('announce_result:submitted');
    expect(heldRows()).toHaveLength(1);
    expect(reviewItems()).toHaveLength(1);
  });

  // Defect caught: a member queues several announcements before anyone has
  // looked at the first.
  it('refuses a second announcement while one awaits review, keeping the text', async () => {
    expect((await submit(formBody({ subject: 'First', bodyText: 'Body one', sendToken: await formToken() }, true))).status).toBe(303);

    const page = await request(createApp()).get(ANNOUNCE).set('Cookie', organizerCookie());
    expect(page.text).toContain('data-announce-pending');

    const second = await submit(formBody({ subject: 'Second', bodyText: 'Body kept', sendToken: tokenFrom(page.text) }, true));
    expect(second.status).toBe(422);
    expect(second.text).toContain('Body kept');
    expect(second.text).toContain('class="form-error-banner"');
    expect(heldRows()).toHaveLength(1);
    expect(reviewItems()).toHaveLength(1);
  });

  // Defect caught: a sent-back announcement leaves the member a blank form and
  // no idea why, or still counts as waiting so they cannot resubmit.
  it('opens a sent-back announcement in the form with the note, ready to resubmit', async () => {
    withDb((db) => insertMemberAnnouncement(db, {
      member_id: ORGANIZER, subject: 'Returned subject', body_text: 'Returned body text',
      status: 'returned', admin_comment: 'Please add the venue.',
    }));
    const page = await request(createApp()).get(ANNOUNCE).set('Cookie', organizerCookie());
    expect(page.text).toContain('value="Returned subject"');
    expect(page.text).toContain('Returned body text');
    expect(page.text).toContain('data-announce-returned');
    expect(page.text).toContain('Please add the venue.');
    // A note ending in its own full stop takes no second one after the quote.
    expect(page.text).not.toContain('venue.&quot;.');
    expect(page.text).not.toContain('venue.".');
    expect(page.text).not.toContain('data-announce-pending');

    const resubmit = await submit(formBody({ subject: 'Returned subject', bodyText: 'Returned body text, at the park.', sendToken: tokenFrom(page.text) }, true));
    expect(resubmit.status).toBe(303);
    expect(heldRows().map((r) => r.status)).toEqual(['returned', 'pending']);
  });
});

describe('reaching the form', () => {
  it('is offered on an organizer\'s own profile', async () => {
    const res = await request(createApp())
      .get(`/members/${ORG_SLUG}`).set('Cookie', organizerCookie());
    expect(res.text).toContain(ANNOUNCE);
  });

  it('is not offered on a Tier 1 member\'s profile', async () => {
    const res = await request(createApp())
      .get(`/members/${PLAIN_SLUG}`).set('Cookie', plainCookie());
    expect(res.text).not.toContain('/announce');
  });
});
