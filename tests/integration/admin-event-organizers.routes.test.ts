/**
 * The administrator surface for deciding who runs an event.
 *
 * The contract: an event with nobody live running it is listed, including one
 * whose only organizer has deleted their account, because an organizer row
 * outlives the account and the row alone does not mean the event is covered;
 * assigning the first person closes the work-queue item that asked for one and
 * makes them the organizer, while anyone added afterwards co-organizes; removing
 * the last one queues the event again rather than leaving it silently unrunnable;
 * and every change takes a reason that is kept on the record.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { expectCsrfReject } from '../fixtures/expectCsrfReject';
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

function makeMember(slug: string, opts: { deletedAt?: string } = {}): string {
  return withDb((db) => {
    const id = insertMember(db, {
      slug,
      display_name: slug,
      login_email:  `${slug}@example.com`,
      deleted_at:   opts.deletedAt ?? null,
    });
    completeOnboarding(db, id);
    return id;
  });
}

function organizersOf(eventId: string): { member_id: string; role: string }[] {
  return withDb((db) => db.prepare(
    'SELECT member_id, role FROM event_organizers WHERE event_id = ? ORDER BY role',
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

  it('makes a later assignee a co-organizer', async () => {
    makeMember('org_second_a');
    makeMember('org_second_b');
    const eventId = withDb((db) => insertEvent(db, { title: 'Two Runners', start_date: '2099-08-08' }));

    await assign(eventId, 'org_second_a', 'First organizer.');
    await assign(eventId, 'org_second_b', 'Second pair of hands.');

    expect(organizersOf(eventId).map((r) => r.role).sort()).toEqual(['co-organizer', 'organizer']);
  });

  it('refuses a change with no reason, and writes nothing', async () => {
    makeMember('org_noreason');
    const eventId = withDb((db) => insertEvent(db, { title: 'No Reason Given', start_date: '2099-09-09' }));

    const res = await assign(eventId, 'org_noreason', '');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Give a reason');
    expect(organizersOf(eventId)).toHaveLength(0);
  });

  it('refuses a member nobody can find', async () => {
    const eventId = withDb((db) => insertEvent(db, { title: 'Ghost Assignment', start_date: '2099-10-10' }));
    const res = await assign(eventId, 'no_such_member', 'Trying an unknown slug.');
    expect(res.status).toBe(404);
    expect(organizersOf(eventId)).toHaveLength(0);
  });

  it('refuses someone who already organizes the event', async () => {
    makeMember('org_dupe');
    const eventId = withDb((db) => insertEvent(db, { title: 'Duplicate Assignment', start_date: '2099-11-11' }));
    await assign(eventId, 'org_dupe', 'First assignment.');

    const res = await assign(eventId, 'org_dupe', 'Second assignment.');
    expect(res.status).toBe(422);
    expect(res.text).toContain('already organizes');
    expect(organizersOf(eventId)).toHaveLength(1);
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

  it('refuses to remove someone who does not organize the event', async () => {
    const stranger = makeMember('org_stranger');
    const eventId = withDb((db) => insertEvent(db, { title: 'Not Theirs', start_date: '2100-02-02' }));
    const res = await remove(eventId, stranger, 'Trying anyway.');
    expect(res.status).toBe(404);
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
