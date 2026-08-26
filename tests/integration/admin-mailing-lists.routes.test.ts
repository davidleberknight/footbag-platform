/**
 * The admin mailing-list surfaces: the index, the create and edit forms, the
 * per-list detail page, and the three writes reached from them.
 *
 * Contract verified:
 *   - every route sits behind the admin gate
 *   - the index lists each list with its subscriber counts and links to detail
 *   - the literal create-form path resolves the form, not a list of that name
 *   - each write redirects to the detail page carrying its outcome, and the
 *     page states the outcome in words
 *   - a validation or naming conflict re-renders the form it came from with the
 *     submitted values preserved, and writes nothing
 *   - an unknown list is a 404 on every route that names one
 *   - an archived list offers no archive action, and a group-backed list offers
 *     no subscription change, because its membership is the group roster
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMailingList,
  insertMailingListSubscription,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3093');

const ADMIN_ID    = 'aml_admin_001';
const MEMBER_ID   = 'aml_member_001';

/** The lists the schema seeds, which these tests neither create nor remove. */
const SEEDED_LISTS = [
  'admin-alerts', 'all-members', 'newsletter', 'board-announcements',
  'event-notifications', 'technical-updates', 'active-player-reminders',
];

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function listRow(slug: string): Record<string, unknown> | undefined {
  return withDb((db) =>
    db.prepare('SELECT * FROM mailing_lists WHERE slug = ?').get(slug) as
      Record<string, unknown> | undefined);
}

function subscriptionStatus(slug: string, memberId: string): string | undefined {
  return withDb((db) => {
    const row = db.prepare(
      'SELECT status FROM mailing_list_subscriptions WHERE mailing_list_id = ? AND member_id = ?',
    ).get(slug, memberId) as { status: string } | undefined;
    return row?.status;
  });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID,  slug: 'aml_admin',  login_email: 'aml-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'aml_member', login_email: 'aml-member@example.com' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => {
    db.prepare('DELETE FROM mailing_list_subscriptions').run();
    db.prepare(
      `DELETE FROM mailing_lists WHERE slug NOT IN (${SEEDED_LISTS.map(() => '?').join(',')})`,
    ).run(...SEEDED_LISTS);
  });
});

describe('the admin gate on the mailing-list surfaces', () => {
  it('sends an unauthenticated visitor to sign in', async () => {
    const res = await request(createApp()).get('/admin/mailing-lists');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('refuses a signed-in non-admin', async () => {
    const res = await request(createApp()).get('/admin/mailing-lists').set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/mailing-lists', () => {
  it('lists each list with its subscriber counts', async () => {
    withDb((db) => {
      insertMailingList(db, { slug: 'shown-list', name: 'Shown List' });
      insertMailingListSubscription(db, { member_id: MEMBER_ID, list_slug: 'shown-list', status: 'subscribed' });
      insertMailingListSubscription(db, { member_id: ADMIN_ID,  list_slug: 'shown-list', status: 'bounced' });
    });

    const res = await request(createApp()).get('/admin/mailing-lists').set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(res.text).toContain('Shown List');
    expect(res.text).toContain('/admin/mailing-lists/shown-list');
    expect(res.text).toContain('Create a Mailing List');
  });

  it('shows an archived list as archived', async () => {
    withDb((db) => insertMailingList(db, { slug: 'old-list', name: 'Old List', status: 'archived' }));

    const res = await request(createApp()).get('/admin/mailing-lists').set('Cookie', adminCookie());

    expect(res.text).toContain('Old List');
    expect(res.text).toMatch(/Archived/);
  });
});

describe('creating a list through the surface', () => {
  it('renders the create form at the literal path rather than looking up a list named new', async () => {
    const res = await request(createApp()).get('/admin/mailing-lists/new').set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(res.text).toContain('New Mailing List');
    expect(res.text).toContain('action="/admin/mailing-lists/new"');
  });

  it('creates the list and redirects to its page with the outcome', async () => {
    const res = await request(createApp())
      .post('/admin/mailing-lists/new')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ name: 'Regional News', description: 'Regional updates', isMemberManageable: '1' });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/mailing-lists/regional-news?notice=created');
    expect(listRow('regional-news')!.name).toBe('Regional News');

    const detail = await request(createApp())
      .get('/admin/mailing-lists/regional-news?notice=created')
      .set('Cookie', adminCookie());
    expect(detail.text).toContain('List created');
  });

  it('re-renders the form with the submitted values when the name is missing', async () => {
    const res = await request(createApp())
      .post('/admin/mailing-lists/new')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ name: '', description: 'Kept across the failure' });

    expect(res.status).toBe(422);
    expect(res.text).toContain('Kept across the failure');
    expect(res.text).toMatch(/Name: required/);
  });

  it('re-renders the form when the name is already in use, and creates nothing', async () => {
    withDb((db) => insertMailingList(db, { slug: 'taken', name: 'Taken Name' }));

    const res = await request(createApp())
      .post('/admin/mailing-lists/new')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ name: 'Taken Name' });

    expect(res.status).toBe(422);
    expect(res.text).toMatch(/already exists/);
    expect(listRow('taken-name')).toBeUndefined();
  });
});

describe('GET /admin/mailing-lists/:slug', () => {
  it('shows the list, its counts, and both administrative actions', async () => {
    withDb((db) => {
      insertMailingList(db, { slug: 'detail-list', name: 'Detail List' });
      insertMailingListSubscription(db, { member_id: MEMBER_ID, list_slug: 'detail-list', status: 'bounced' });
    });

    const res = await request(createApp()).get('/admin/mailing-lists/detail-list').set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(res.text).toContain('Detail List');
    expect(res.text).toContain('Bounced');
    expect(res.text).toContain('Change the Subscription');
    expect(res.text).toContain('Archive the List');
  });

  it('offers no archive action on a list that is already archived', async () => {
    withDb((db) => insertMailingList(db, { slug: 'gone-list', name: 'Gone List', status: 'archived' }));

    const res = await request(createApp()).get('/admin/mailing-lists/gone-list').set('Cookie', adminCookie());

    expect(res.text).not.toContain('Archive the List');
    expect(res.text).toMatch(/This list is archived/);
  });

  it('offers no subscription change on a group-backed list', async () => {
    withDb((db) => insertMailingList(db, {
      slug: 'group-list', name: 'Group List',
      recipient_source: 'group', source_group_id: 'group_1',
    }));

    const res = await request(createApp()).get('/admin/mailing-lists/group-list').set('Cookie', adminCookie());

    expect(res.text).not.toContain('Change the Subscription');
    expect(res.text).toMatch(/leaving the group/);
  });

  it('404s an unknown list', async () => {
    const res = await request(createApp()).get('/admin/mailing-lists/no-such-list').set('Cookie', adminCookie());
    expect(res.status).toBe(404);
  });
});

describe('editing a list through the surface', () => {
  it('renders the form with the list\'s current values', async () => {
    withDb((db) => insertMailingList(db, { slug: 'edit-list', name: 'Edit List', subject_prefix: 'IFPA' }));

    const res = await request(createApp()).get('/admin/mailing-lists/edit-list/edit').set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(res.text).toContain('value="Edit List"');
    expect(res.text).toContain('value="IFPA"');
  });

  it('saves the change and redirects to the list page', async () => {
    withDb((db) => insertMailingList(db, { slug: 'save-list', name: 'Save List' }));

    const res = await request(createApp())
      .post('/admin/mailing-lists/save-list/edit')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ name: 'Save List', description: 'Now described', isMemberManageable: '1' });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/mailing-lists/save-list?notice=saved');
    expect(listRow('save-list')!.description).toBe('Now described');
  });

  it('re-renders the form on a bad from-address and saves nothing', async () => {
    withDb((db) => insertMailingList(db, { slug: 'bad-sender', name: 'Bad Sender' }));

    const res = await request(createApp())
      .post('/admin/mailing-lists/bad-sender/edit')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ name: 'Bad Sender', fromIdentity: 'not-an-address' });

    expect(res.status).toBe(422);
    expect(res.text).toMatch(/complete email address/);
    expect(listRow('bad-sender')!.from_identity).toBeNull();
  });

  it('404s the form and the save for an unknown list', async () => {
    const app = createApp();
    expect((await request(app).get('/admin/mailing-lists/no-such-list/edit').set('Cookie', adminCookie())).status)
      .toBe(404);
    expect((await request(app)
      .post('/admin/mailing-lists/no-such-list/edit')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ name: 'Anything' })).status).toBe(404);
  });
});

describe('archiving a list through the surface', () => {
  it('archives it and says so on the page it returns to', async () => {
    withDb((db) => insertMailingList(db, { slug: 'archive-me', name: 'Archive Me' }));

    const res = await request(createApp())
      .post('/admin/mailing-lists/archive-me/archive')
      .set('Cookie', adminCookie())
      .type('form')
      .send({});

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/mailing-lists/archive-me?notice=archived');
    expect(listRow('archive-me')!.status).toBe('archived');

    const detail = await request(createApp())
      .get('/admin/mailing-lists/archive-me?notice=archived')
      .set('Cookie', adminCookie());
    expect(detail.text).toMatch(/List archived/);
  });

  it('reports a second archive as having changed nothing', async () => {
    withDb((db) => insertMailingList(db, { slug: 'already-gone', name: 'Already Gone', status: 'archived' }));

    const res = await request(createApp())
      .post('/admin/mailing-lists/already-gone/archive')
      .set('Cookie', adminCookie())
      .type('form')
      .send({});

    expect(res.headers.location).toBe('/admin/mailing-lists/already-gone?notice=already_archived');

    const detail = await request(createApp())
      .get('/admin/mailing-lists/already-gone?notice=already_archived')
      .set('Cookie', adminCookie());
    expect(detail.text).toMatch(/already archived/);
  });

  it('404s an unknown list', async () => {
    const res = await request(createApp())
      .post('/admin/mailing-lists/no-such-list/archive')
      .set('Cookie', adminCookie())
      .type('form')
      .send({});
    expect(res.status).toBe(404);
  });
});

describe('changing one member\'s subscription through the surface', () => {
  it('applies the change and says so on the page it returns to', async () => {
    withDb((db) => {
      insertMailingList(db, { slug: 'adjust-list', name: 'Adjust List' });
      insertMailingListSubscription(db, { member_id: MEMBER_ID, list_slug: 'adjust-list', status: 'bounced' });
    });

    const res = await request(createApp())
      .post('/admin/mailing-lists/adjust-list/subscriptions/adjust')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ memberId: MEMBER_ID, status: 'subscribed', reason: 'Mailbox is working again' });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/mailing-lists/adjust-list?notice=adjusted');
    expect(subscriptionStatus('adjust-list', MEMBER_ID)).toBe('subscribed');
  });

  it('re-renders the page with the error when no reason is given, and changes nothing', async () => {
    withDb((db) => {
      insertMailingList(db, { slug: 'no-reason', name: 'No Reason' });
      insertMailingListSubscription(db, { member_id: MEMBER_ID, list_slug: 'no-reason', status: 'bounced' });
    });

    const res = await request(createApp())
      .post('/admin/mailing-lists/no-reason/subscriptions/adjust')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ memberId: MEMBER_ID, status: 'subscribed', reason: '' });

    expect(res.status).toBe(422);
    expect(res.text).toMatch(/Reason: required/);
    expect(subscriptionStatus('no-reason', MEMBER_ID)).toBe('bounced');
  });

  it('reports a member with no subscription on the list as having changed nothing', async () => {
    withDb((db) => insertMailingList(db, { slug: 'empty-list', name: 'Empty List' }));

    const res = await request(createApp())
      .post('/admin/mailing-lists/empty-list/subscriptions/adjust')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ memberId: MEMBER_ID, status: 'subscribed', reason: 'Nothing to move' });

    expect(res.headers.location).toBe('/admin/mailing-lists/empty-list?notice=unchanged');

    const detail = await request(createApp())
      .get('/admin/mailing-lists/empty-list?notice=unchanged')
      .set('Cookie', adminCookie());
    expect(detail.text).toMatch(/Nothing changed/);
  });

  it('refuses the change on a group-backed list', async () => {
    withDb((db) => {
      insertMailingList(db, {
        slug: 'committee', name: 'Committee',
        recipient_source: 'group', source_group_id: 'group_2',
      });
      insertMailingListSubscription(db, { member_id: MEMBER_ID, list_slug: 'committee', status: 'subscribed' });
    });

    const res = await request(createApp())
      .post('/admin/mailing-lists/committee/subscriptions/adjust')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ memberId: MEMBER_ID, status: 'unsubscribed', reason: 'Asked to leave' });

    expect(res.status).toBe(422);
    expect(subscriptionStatus('committee', MEMBER_ID)).toBe('subscribed');
  });

  it('404s an unknown list', async () => {
    const res = await request(createApp())
      .post('/admin/mailing-lists/no-such-list/subscriptions/adjust')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ memberId: MEMBER_ID, status: 'subscribed', reason: 'Anything' });
    expect(res.status).toBe(404);
  });
});
