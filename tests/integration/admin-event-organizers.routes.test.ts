/**
 * The administrator surface for deciding who runs an event.
 *
 * The contract: an event with nobody live running it is listed, including one
 * whose only organizer has deleted their account or died, because an organizer
 * row outlives the member and the row alone does not mean the event is covered;
 * every organizer has the same standing, so assigning someone to such an event
 * works however many departed organizers' rows it still holds, and closes the
 * work-queue item that asked for one; removing the last live one queues the
 * event again rather than leaving it silently unrunnable; and every change takes
 * a reason that is kept on the record.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { expectCsrfReject } from '../fixtures/expectCsrfReject';
import { flashCookieOf } from '../fixtures/flashCookie';
import {
  insertMember,
  insertEvent,
  insertEventOrganizer,
  insertWorkQueueItem,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4187');

let createApp: Awaited<ReturnType<typeof importApp>>;
let adminId: string;

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

function adminCookie(): string {
  return cookieFor(adminId);
}

function makeMember(slug: string, opts: { deletedAt?: string; isDeceased?: boolean } = {}): string {
  return withDb((db) => {
    const id = insertMember(db, {
      slug,
      display_name: slug,
      login_email:  `${slug}@example.com`,
      deleted_at:   opts.deletedAt ?? null,
      is_deceased:  opts.isDeceased ? 1 : 0,
      deceased_at:  opts.isDeceased ? new Date().toISOString() : null,
    });
    completeOnboarding(db, id);
    return id;
  });
}

function organizersOf(eventId: string): { member_id: string; role: string }[] {
  return withDb((db) => db.prepare(
    'SELECT member_id, role FROM event_organizers WHERE event_id = ? ORDER BY member_id',
  ).all(eventId) as { member_id: string; role: string }[]);
}

function openQueueItems(eventId: string): { status: string }[] {
  return withDb((db) => db.prepare(
    "SELECT status FROM work_queue_items WHERE task_type = 'needs_organizer' AND entity_id = ? AND status = 'open'",
  ).all(eventId) as { status: string }[]);
}

async function assign(eventId: string, memberKey: string, reason: string) {
  return request(createApp())
    .post(`/admin/events/${eventId}/organizers/assign`)
    .set('Cookie', adminCookie())
    .type('form')
    .send({ member_key: memberKey, reason });
}

/** Follow a post-redirect-get the way a browser does, carrying the flash back. */
async function landedOn(res: { headers: Record<string, string>; get(h: string): string[] | string | undefined }) {
  return request(createApp())
    .get(res.headers.location)
    .set('Cookie', [adminCookie(), flashCookieOf(res)].filter(Boolean).join('; '));
}

function auditCount(eventId: string, actionType: string): number {
  return withDb((db) => (db.prepare(
    'SELECT COUNT(*) AS c FROM audit_entries WHERE entity_id = ? AND action_type = ?',
  ).get(eventId, actionType) as { c: number }).c);
}

async function remove(eventId: string, memberId: string, reason: string) {
  return request(createApp())
    .post(`/admin/events/${eventId}/organizers/remove`)
    .set('Cookie', adminCookie())
    .type('form')
    .send({ member_id: memberId, reason });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  adminId = insertMember(db, {
    slug: 'org_admin', display_name: 'org_admin',
    login_email: 'org-admin@example.com', is_admin: 1,
  });
  completeOnboarding(db, adminId);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the queue of events with nobody running them', () => {
  it('lists an event that has no organizer rows at all', async () => {
    const eventId = withDb((db) => insertEvent(db, { title: 'Orphan Open', start_date: '2099-04-04' }));
    const res = await request(createApp()).get('/admin/events/organizers').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Orphan Open');
    expect(res.text).toContain(eventId);
  });

  it('lists an event whose only organizer has deleted their account', async () => {
    const gone = makeMember('org_gone', { deletedAt: new Date().toISOString() });
    withDb((db) => {
      const e = insertEvent(db, { title: 'Abandoned Classic', start_date: '2099-05-05' });
      insertEventOrganizer(db, e, gone);
    });
    const res = await request(createApp()).get('/admin/events/organizers').set('Cookie', adminCookie());
    expect(res.text).toContain('Abandoned Classic');
  });

  it('lists an event whose only organizer has died', async () => {
    const died = makeMember('org_died', { isDeceased: true });
    withDb((db) => {
      const e = insertEvent(db, { title: 'Memorial Jam', start_date: '2099-05-06' });
      insertEventOrganizer(db, e, died);
    });
    const res = await request(createApp()).get('/admin/events/organizers').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Memorial Jam');
  });

  it('does not list an event that has a live organizer', async () => {
    const live = makeMember('org_live');
    withDb((db) => {
      const e = insertEvent(db, { title: 'Well Run Invitational', start_date: '2099-06-06' });
      insertEventOrganizer(db, e, live);
    });
    const res = await request(createApp()).get('/admin/events/organizers').set('Cookie', adminCookie());
    expect(res.text).not.toContain('Well Run Invitational');
  });
});

describe('assigning an organizer', () => {
  it('makes the first assignee the organizer, closes the queue item, and records why', async () => {
    const member = makeMember('org_first');
    const eventId = withDb((db) => insertEvent(db, { title: 'Needs Someone', start_date: '2099-07-07' }));
    withDb((db) => insertWorkQueueItem(db, {
      task_type: 'needs_organizer', queue_category: 'events',
      entity_type: 'event', entity_id: eventId, status: 'open',
    }));

    const res = await assign(eventId, 'org_first', 'Volunteered at the club meeting.');
    expect(res.status).toBe(303);

    expect(organizersOf(eventId)).toEqual([{ member_id: member, role: 'organizer' }]);
    expect(openQueueItems(eventId)).toHaveLength(0);

    const audit = withDb((db) => db.prepare(
      "SELECT reason_text FROM audit_entries WHERE action_type = 'event.organizer_assigned' AND entity_id = ?",
    ).get(eventId) as { reason_text: string } | undefined);
    expect(audit?.reason_text).toBe('Volunteered at the club meeting.');
  });

  it('gives a later assignee the same standing as the first', async () => {
    makeMember('org_second_a');
    makeMember('org_second_b');
    const eventId = withDb((db) => insertEvent(db, { title: 'Two Runners', start_date: '2099-08-08' }));

    await assign(eventId, 'org_second_a', 'First organizer.');
    const res = await assign(eventId, 'org_second_b', 'Second pair of hands.');
    expect(res.status).toBe(303);

    expect(organizersOf(eventId).map((r) => r.role)).toEqual(['organizer', 'organizer']);
  });

  // Defect caught: an admin gives an event a sixth current organizer, past
  // the five the event story allows; or an organizer who has died still
  // counts against the five, so a real fifth is refused.
  it('refuses a sixth current organizer, counting only organizers who can still act', async () => {
    const dead = makeMember('org_cap_dead', { isDeceased: true });
    const live = ['org_cap_1', 'org_cap_2', 'org_cap_3', 'org_cap_4'].map((slug) => makeMember(slug));
    const eventId = withDb((db) => {
      const e = insertEvent(db, { title: 'Full Crew', start_date: '2099-09-09' });
      insertEventOrganizer(db, e, dead);
      for (const id of live) insertEventOrganizer(db, e, id);
      return e;
    });
    makeMember('org_cap_5');
    makeMember('org_cap_6');

    const fifth = await assign(eventId, 'org_cap_5', 'Fifth pair of hands.');
    expect(fifth.status).toBe(303);
    const before = organizersOf(eventId);
    expect(before).toHaveLength(6);

    const sixth = await assign(eventId, 'org_cap_6', 'One more.');
    expect(sixth.status).toBe(422);
    expect(sixth.text).toContain('This event already has 5 organizers, the most an event can have.');
    expect(organizersOf(eventId)).toEqual(before);
  });

  it('assigns someone to an event whose only organizer deleted their account, keeping the departed row', async () => {
    const gone = makeMember('org_gone_assign', { deletedAt: new Date().toISOString() });
    const member = makeMember('org_replacement');
    const eventId = withDb((db) => {
      const e = insertEvent(db, { title: 'Orphaned By Deletion', start_date: '2099-08-09' });
      insertEventOrganizer(db, e, gone);
      insertWorkQueueItem(db, {
        task_type: 'needs_organizer', queue_category: 'events',
        entity_type: 'event', entity_id: e, status: 'open',
      });
      return e;
    });

    const res = await assign(eventId, 'org_replacement', 'Taking over the event.');
    expect(res.status).toBe(303);

    const rows = organizersOf(eventId);
    expect(rows.map((r) => r.member_id).sort()).toEqual([gone, member].sort());
    expect(openQueueItems(eventId)).toHaveLength(0);
  });

  it('assigns someone to an event whose only organizer died, and closes its queue item', async () => {
    const died = makeMember('org_died_assign', { isDeceased: true });
    const member = makeMember('org_successor');
    const eventId = withDb((db) => {
      const e = insertEvent(db, { title: 'Orphaned By Death', start_date: '2099-08-10' });
      insertEventOrganizer(db, e, died);
      insertWorkQueueItem(db, {
        task_type: 'needs_organizer', queue_category: 'events',
        entity_type: 'event', entity_id: e, status: 'open',
      });
      return e;
    });

    const res = await assign(eventId, 'org_successor', 'Carrying it on.');
    expect(res.status).toBe(303);
    expect(organizersOf(eventId).map((r) => r.member_id).sort()).toEqual([died, member].sort());
    expect(openQueueItems(eventId)).toHaveLength(0);
  });

  it('does not show an organizer who has died among the people running the event', async () => {
    const died = makeMember('org_died_hidden', { isDeceased: true });
    const live = makeMember('org_alive_shown');
    const eventId = withDb((db) => {
      const e = insertEvent(db, { title: 'Shared Running', start_date: '2099-08-11' });
      insertEventOrganizer(db, e, died);
      insertEventOrganizer(db, e, live);
      return e;
    });

    const res = await request(createApp()).get(`/admin/events/${eventId}/organizers`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain(`value="${live}"`);
    expect(res.text).not.toContain(`value="${died}"`);
  });

  it('refuses a change with no reason, and writes nothing', async () => {
    makeMember('org_noreason');
    const eventId = withDb((db) => insertEvent(db, { title: 'No Reason Given', start_date: '2099-09-09' }));

    const res = await assign(eventId, 'org_noreason', '');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Give a reason');
    expect(organizersOf(eventId)).toHaveLength(0);
  });

  // Defect caught: markup, a control character or a run of spaces typed into
  // the reason reaches the audit trail as typed, or a reason that is only
  // markup passes the required check and records an assignment with no reason.
  it('records a cleaned reason, and refuses one that is only markup', async () => {
    const member = makeMember('org_dirty_reason');
    const eventId = withDb((db) => insertEvent(db, { title: 'Dirty Reason Open', start_date: '2099-09-10' }));

    const refused = await assign(eventId, 'org_dirty_reason', '<script></script><b></b>');
    expect(refused.status).toBe(422);
    expect(organizersOf(eventId)).toHaveLength(0);

    const res = await assign(eventId, 'org_dirty_reason', '<b>Volunteered</b> at\u0085 the   club\tmeeting.');
    expect(res.status).toBe(303);
    expect(organizersOf(eventId)).toEqual([{ member_id: member, role: 'organizer' }]);
    const audit = withDb((db) => db.prepare(
      "SELECT reason_text FROM audit_entries WHERE action_type = 'event.organizer_assigned' AND entity_id = ?",
    ).all(eventId) as { reason_text: string }[]);
    expect(audit).toEqual([{ reason_text: 'Volunteered at the club meeting.' }]);
  });

  it('refuses a member nobody can find', async () => {
    const eventId = withDb((db) => insertEvent(db, { title: 'Ghost Assignment', start_date: '2099-10-10' }));
    const res = await assign(eventId, 'no_such_member', 'Trying an unknown slug.');
    expect(res.status).toBe(404);
    expect(organizersOf(eventId)).toHaveLength(0);
  });

  it('an assignment says the organizer was added, and the same admin submitting it again gets the same answer with nothing written', async () => {
    // Defect caught: the page gives no word that the assign happened, or a
    // double submit is drawn as a red refusal of the admin's own act.
    makeMember('org_dupe');
    const eventId = withDb((db) => insertEvent(db, { title: 'Duplicate Assignment', start_date: '2099-11-11' }));
    const first = await assign(eventId, 'org_dupe', 'First assignment.');
    expect(first.status).toBe(303);
    const shown = await landedOn(first);
    expect(shown.text).toContain('<div class="form-success-banner" role="status">Organizer added.</div>');

    const res = await assign(eventId, 'org_dupe', 'Second assignment.');
    expect(res.status).toBe(303);
    expect((await landedOn(res)).text)
      .toContain('<div class="form-success-banner" role="status">Organizer added.</div>');
    expect(organizersOf(eventId)).toHaveLength(1);
    expect(auditCount(eventId, 'event.organizer_assigned')).toBe(1);
  });

  it('a repeat is recognised even after the same admin assigned someone else to the same event', async () => {
    // Defect caught: the repeat check read the event's latest act whoever it
    // named, so assigning a second organizer made a re-post for the first read
    // as somebody else's act.
    makeMember('org_pair_a');
    makeMember('org_pair_b');
    const eventId = withDb((db) => insertEvent(db, { title: 'Two Organizers', start_date: '2099-11-13' }));
    expect((await assign(eventId, 'org_pair_a', 'First organizer.')).status).toBe(303);
    const bId = withDb((db) => (db.prepare("SELECT id FROM members WHERE slug = 'org_pair_b'").get() as { id: string }).id);
    expect((await assign(eventId, 'org_pair_b', 'Second organizer.')).status).toBe(303);
    // The event's latest act is now a removal, of the other organizer.
    expect((await remove(eventId, bId, 'Second organizer stood down.')).status).toBe(303);

    const again = await assign(eventId, 'org_pair_a', 'First organizer again.');
    expect((await landedOn(again)).text)
      .toContain('<div class="form-success-banner" role="status">Organizer added.</div>');
    expect(auditCount(eventId, 'event.organizer_assigned')).toBe(2);
  });

  it('someone already organizing from another act reads as informational, not as a refusal', async () => {
    // Defect caught: a state that already held, painted red as if this
    // admin's request had been refused.
    const member = makeMember('org_already');
    const eventId = withDb((db) => {
      const e = insertEvent(db, { title: 'Already Covered', start_date: '2099-11-12' });
      insertEventOrganizer(db, e, member);
      return e;
    });
    const res = await assign(eventId, 'org_already', 'Covering the gap.');
    expect(res.status).toBe(303);
    const shown = await landedOn(res);
    expect(shown.text).toContain('<p class="form-notice" role="status">That member already organizes this event.</p>');
    expect(auditCount(eventId, 'event.organizer_assigned')).toBe(0);
  });
});

describe('removing an organizer', () => {
  it('queues the event again when the last one goes', async () => {
    const member = makeMember('org_last');
    const eventId = withDb((db) => insertEvent(db, { title: 'Losing Its Organizer', start_date: '2099-12-12' }));
    await assign(eventId, 'org_last', 'Assigned first.');
    expect(openQueueItems(eventId)).toHaveLength(0);

    const res = await remove(eventId, member, 'Stepped down.');
    expect(res.status).toBe(303);
    expect(organizersOf(eventId)).toHaveLength(0);
    expect(openQueueItems(eventId)).toHaveLength(1);

    const audit = withDb((db) => db.prepare(
      "SELECT reason_text FROM audit_entries WHERE action_type = 'event.organizer_removed' AND entity_id = ?",
    ).get(eventId) as { reason_text: string } | undefined);
    expect(audit?.reason_text).toBe('Stepped down.');
  });

  it('does not queue the event while somebody else is still running it', async () => {
    const leaving = makeMember('org_leaving');
    makeMember('org_staying');
    const eventId = withDb((db) => insertEvent(db, { title: 'Still Covered', start_date: '2100-01-01' }));
    await assign(eventId, 'org_leaving', 'First organizer.');
    await assign(eventId, 'org_staying', 'Second organizer.');

    await remove(eventId, leaving, 'Handing over.');
    expect(organizersOf(eventId)).toHaveLength(1);
    expect(openQueueItems(eventId)).toHaveLength(0);
  });

  it('queues the event again when the last live one goes and only an organizer who died remains', async () => {
    const died = makeMember('org_died_remaining', { isDeceased: true });
    const leaving = makeMember('org_last_living');
    const eventId = withDb((db) => {
      const e = insertEvent(db, { title: 'Last Living Organizer', start_date: '2100-01-02' });
      insertEventOrganizer(db, e, died);
      insertEventOrganizer(db, e, leaving);
      return e;
    });

    const res = await remove(eventId, leaving, 'Stepped down.');
    expect(res.status).toBe(303);
    expect(openQueueItems(eventId)).toHaveLength(1);
  });

  it('removing someone who does not organize the event changes nothing and says so', async () => {
    // Defect caught: a removal with nothing to remove drawn as an error page
    // rather than as a state that already held.
    const stranger = makeMember('org_stranger');
    const eventId = withDb((db) => insertEvent(db, { title: 'Not Theirs', start_date: '2100-02-02' }));
    const res = await remove(eventId, stranger, 'Trying anyway.');
    expect(res.status).toBe(303);
    const shown = await landedOn(res);
    expect(shown.text).toContain('<p class="form-notice" role="status">That member does not organize this event.</p>');
    expect(auditCount(eventId, 'event.organizer_removed')).toBe(0);
  });

  it('a removal says so, and the same admin submitting it again gets the same answer with nothing written', async () => {
    // Defect caught: a double-submitted removal answered as if the member had
    // never organized the event.
    const member = makeMember('org_twice_removed');
    makeMember('org_keeps_running');
    const eventId = withDb((db) => insertEvent(db, { title: 'Removed Twice', start_date: '2100-02-03' }));
    await assign(eventId, 'org_twice_removed', 'First organizer.');
    await assign(eventId, 'org_keeps_running', 'Second organizer.');
    const first = await remove(eventId, member, 'Stepped down.');
    expect((await landedOn(first)).text)
      .toContain('<div class="form-success-banner" role="status">Organizer removed.</div>');
    const again = await remove(eventId, member, 'Stepped down.');
    expect(again.status).toBe(303);
    expect((await landedOn(again)).text)
      .toContain('<div class="form-success-banner" role="status">Organizer removed.</div>');
    expect(auditCount(eventId, 'event.organizer_removed')).toBe(1);
  });
});

describe('cross-origin protection', () => {
  it('refuses an assignment posted from another origin', async () => {
    const eventId = withDb((db) => insertEvent(db, { title: 'Csrf Assign', start_date: '2100-03-03' }));
    await expectCsrfReject(createApp(), 'post', `/admin/events/${eventId}/organizers/assign`, {
      cookie: adminCookie(),
      body:   { member_key: 'org_live', reason: 'Should never land.' },
    });
    expect(organizersOf(eventId)).toHaveLength(0);
  });

  it('refuses a removal posted from another origin', async () => {
    const member = makeMember('org_csrf_remove');
    const eventId = withDb((db) => insertEvent(db, { title: 'Csrf Remove', start_date: '2100-04-04' }));
    await assign(eventId, 'org_csrf_remove', 'Assigned first.');
    await expectCsrfReject(createApp(), 'post', `/admin/events/${eventId}/organizers/remove`, {
      cookie: adminCookie(),
      body:   { member_id: member, reason: 'Should never land.' },
    });
    expect(organizersOf(eventId)).toHaveLength(1);
  });
});
