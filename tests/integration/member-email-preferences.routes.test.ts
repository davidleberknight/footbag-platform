/**
 * The member's own email-preferences screen: which mailings they are offered,
 * the state they hold on each, and the choices they make.
 *
 * Contract verified:
 *   - the screen is owner-only: another member's path is a 404, not a 403, so
 *     it cannot be used to discover which member slugs exist
 *   - only lists a member may manage are offered: an administrators-only list,
 *     an archived list, and a group-backed list are all absent
 *   - a list the member has never acted on reads as not receiving, which is what
 *     the send path also treats it as
 *   - a bounced or complained address reads as paused and can be turned back on;
 *     a list an administrator set aside is locked and offers no control
 *   - a choice that moves a row is audited once and a repeated choice is not
 *   - the write acts on the member named by the session, never on a member named
 *     by the request, and reaches no one else's subscription
 *   - the profile links to the screen
 *
 * The audit ledger is append-only and cannot be cleared between cases, so every
 * assertion about it is scoped to the list the case acted on.
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

const { dbPath } = setTestEnv('3095');

const MEMBER_ID   = 'ep_member_001';
const MEMBER_SLUG = 'ep_member';
const OTHER_ID    = 'ep_other_001';
const OTHER_SLUG  = 'ep_other';

const PREFS = `/members/${MEMBER_SLUG}/email-preferences`;

const SEEDED_LISTS = [
  'admin-alerts', 'all-members', 'newsletter', 'board-announcements',
  'event-notifications', 'technical-updates', 'active-player-reminders',
];

let createApp: Awaited<ReturnType<typeof importApp>>;

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

function statusOf(slug: string, memberId: string): string | undefined {
  return withDb((db) => {
    const row = db.prepare(
      'SELECT status FROM mailing_list_subscriptions WHERE mailing_list_id = ? AND member_id = ?',
    ).get(slug, memberId) as { status: string } | undefined;
    return row?.status;
  });
}

function auditCountFor(slug: string): number {
  return withDb((db) => (db.prepare(
    `SELECT COUNT(*) AS c FROM audit_entries
     WHERE entity_type = 'mailing_list' AND entity_id = ?
       AND action_type IN ('mailing_list.subscribed', 'mailing_list.unsubscribed')`,
  ).get(slug) as { c: number }).c);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, login_email: 'ep-member@example.com' });
  insertMember(db, { id: OTHER_ID,  slug: OTHER_SLUG,  login_email: 'ep-other@example.com' });
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

describe('who may reach the screen', () => {
  it('sends an unauthenticated visitor to sign in', async () => {
    const res = await request(createApp()).get(PREFS);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('404s a member reading another member\'s preferences', async () => {
    const res = await request(createApp())
      .get(`/members/${OTHER_SLUG}/email-preferences`).set('Cookie', memberCookie());
    expect(res.status).toBe(404);
  });

  it('404s a member posting to another member\'s preferences, and changes nothing', async () => {
    withDb((db) => insertMailingListSubscription(db, {
      member_id: OTHER_ID, list_slug: 'newsletter', status: 'subscribed',
    }));

    const res = await request(createApp())
      .post(`/members/${OTHER_SLUG}/email-preferences`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ slug: 'newsletter', subscribe: '0' });

    expect(res.status).toBe(404);
    expect(statusOf('newsletter', OTHER_ID)).toBe('subscribed');
  });
});

describe('what the screen offers', () => {
  it('lists the mailings a member may manage', async () => {
    const res = await request(createApp()).get(PREFS).set('Cookie', memberCookie());

    expect(res.status).toBe(200);
    expect(res.text).toContain('Newsletter');
    expect(res.text).toContain('Board Announcements');
    expect(res.text).toContain('Active Player Reminders');
  });

  it('leaves out a list only administrators are on', async () => {
    const res = await request(createApp()).get(PREFS).set('Cookie', memberCookie());
    expect(res.text).not.toContain('Admin Alerts');
  });

  it('leaves out an archived list', async () => {
    withDb((db) => insertMailingList(db, {
      slug: 'closed-list', name: 'Closed List', status: 'archived',
    }));

    const res = await request(createApp()).get(PREFS).set('Cookie', memberCookie());
    expect(res.text).not.toContain('Closed List');
  });

  it('leaves out a group-backed list, where leaving the group is the real action', async () => {
    withDb((db) => insertMailingList(db, {
      slug: 'committee-list', name: 'Committee List',
      recipient_source: 'group', source_group_id: 'group_1',
    }));

    const res = await request(createApp()).get(PREFS).set('Cookie', memberCookie());
    expect(res.text).not.toContain('Committee List');
  });

  it('reads a list the member has never acted on as not receiving', async () => {
    const res = await request(createApp()).get(PREFS).set('Cookie', memberCookie());
    expect(res.text).toMatch(/Not receiving/);
    expect(res.text).toContain('Turn This On');
  });

  it('reads a subscribed list as receiving, and offers to turn it off', async () => {
    withDb((db) => insertMailingListSubscription(db, {
      member_id: MEMBER_ID, list_slug: 'newsletter', status: 'subscribed',
    }));

    const res = await request(createApp()).get(PREFS).set('Cookie', memberCookie());
    expect(res.text).toMatch(/Receiving/);
    expect(res.text).toContain('Turn This Off');
  });

  it('reads a bounced address as paused and still offers to turn it back on', async () => {
    withDb((db) => insertMailingListSubscription(db, {
      member_id: MEMBER_ID, list_slug: 'newsletter', status: 'bounced',
    }));

    const res = await request(createApp()).get(PREFS).set('Cookie', memberCookie());
    expect(res.text).toMatch(/Paused, mail bounced/);
    expect(res.text).toContain('Turn This On');
  });

  it('shows a list an administrator set aside as locked, with no control', async () => {
    withDb((db) => {
      insertMailingList(db, { slug: 'held-list', name: 'Held List' });
      insertMailingListSubscription(db, {
        member_id: MEMBER_ID, list_slug: 'held-list', status: 'suppressed',
      });
    });

    const res = await request(createApp()).get(PREFS).set('Cookie', memberCookie());
    expect(res.text).toMatch(/Set aside by an administrator/);
    // The other cards keep their controls, so the absence is checked on this
    // card's own hidden field rather than on the page's controls at large.
    expect(res.text).not.toContain('value="held-list"');
  });
});

describe('changing a choice', () => {
  it('subscribes, says so, and records it once', async () => {
    const res = await request(createApp())
      .post(PREFS).set('Cookie', memberCookie()).type('form')
      .send({ slug: 'newsletter', subscribe: '1' });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`${PREFS}?notice=subscribed`);
    expect(statusOf('newsletter', MEMBER_ID)).toBe('subscribed');
    expect(auditCountFor('newsletter')).toBe(1);

    const page = await request(createApp()).get(res.headers.location).set('Cookie', memberCookie());
    expect(page.text).toMatch(/Turned on/);
  });

  it('withdraws, says so, and records it', async () => {
    withDb((db) => insertMailingListSubscription(db, {
      member_id: MEMBER_ID, list_slug: 'technical-updates', status: 'subscribed',
    }));

    const res = await request(createApp())
      .post(PREFS).set('Cookie', memberCookie()).type('form')
      .send({ slug: 'technical-updates', subscribe: '0' });

    expect(res.headers.location).toBe(`${PREFS}?notice=unsubscribed`);
    expect(statusOf('technical-updates', MEMBER_ID)).toBe('unsubscribed');
    expect(auditCountFor('technical-updates')).toBe(1);
  });

  it('records nothing when the choice was already set that way', async () => {
    withDb((db) => insertMailingListSubscription(db, {
      member_id: MEMBER_ID, list_slug: 'event-notifications', status: 'unsubscribed',
    }));

    const res = await request(createApp())
      .post(PREFS).set('Cookie', memberCookie()).type('form')
      .send({ slug: 'event-notifications', subscribe: '0' });

    expect(res.headers.location).toBe(`${PREFS}?notice=unchanged`);
    expect(auditCountFor('event-notifications')).toBe(0);
  });

  it('withdrawing from a list the member never joined changes nothing', async () => {
    const res = await request(createApp())
      .post(PREFS).set('Cookie', memberCookie()).type('form')
      .send({ slug: 'board-announcements', subscribe: '0' });

    expect(res.headers.location).toBe(`${PREFS}?notice=unchanged`);
    expect(statusOf('board-announcements', MEMBER_ID)).toBeUndefined();
    expect(auditCountFor('board-announcements')).toBe(0);
  });

  it('refuses to move a row an administrator set aside', async () => {
    withDb((db) => {
      insertMailingList(db, { slug: 'set-aside', name: 'Set Aside' });
      insertMailingListSubscription(db, {
        member_id: MEMBER_ID, list_slug: 'set-aside', status: 'suppressed',
      });
    });

    const res = await request(createApp())
      .post(PREFS).set('Cookie', memberCookie()).type('form')
      .send({ slug: 'set-aside', subscribe: '1' });

    expect(res.status).toBe(422);
    expect(res.text).toMatch(/set aside/);
    expect(statusOf('set-aside', MEMBER_ID)).toBe('suppressed');
    expect(auditCountFor('set-aside')).toBe(0);
  });

  it('refuses a list the screen does not offer, and writes nothing', async () => {
    const res = await request(createApp())
      .post(PREFS).set('Cookie', memberCookie()).type('form')
      .send({ slug: 'admin-alerts', subscribe: '1' });

    expect(res.status).toBe(422);
    expect(res.text).toMatch(/not one of the mailings you can choose/);
    expect(statusOf('admin-alerts', MEMBER_ID)).toBeUndefined();
  });

  it('refuses an archived list', async () => {
    withDb((db) => insertMailingList(db, {
      slug: 'shut-list', name: 'Shut List', status: 'archived',
    }));

    const res = await request(createApp())
      .post(PREFS).set('Cookie', memberCookie()).type('form')
      .send({ slug: 'shut-list', subscribe: '1' });

    expect(res.status).toBe(422);
    expect(statusOf('shut-list', MEMBER_ID)).toBeUndefined();
  });

  it('refuses a list that does not exist', async () => {
    const res = await request(createApp())
      .post(PREFS).set('Cookie', memberCookie()).type('form')
      .send({ slug: 'no-such-list', subscribe: '1' });
    expect(res.status).toBe(422);
  });

  it('refuses a submission naming no list at all, and stays on the screen', async () => {
    const res = await request(createApp())
      .post(PREFS).set('Cookie', memberCookie()).type('form')
      .send({ subscribe: '1' });

    expect(res.status).toBe(422);
    expect(res.text).toMatch(/not one of the mailings you can choose/);
    // Still the preferences screen, so the member can simply choose again.
    expect(res.text).toContain('Email Preferences');
  });

  it('acts on the signed-in member and reaches no one else\'s row', async () => {
    withDb((db) => {
      insertMailingListSubscription(db, { member_id: OTHER_ID, list_slug: 'newsletter', status: 'subscribed' });
    });

    await request(createApp())
      .post(PREFS).set('Cookie', memberCookie()).type('form')
      .send({ slug: 'newsletter', subscribe: '0' });

    expect(statusOf('newsletter', OTHER_ID)).toBe('subscribed');
  });
});

describe('reaching the screen', () => {
  it('is linked from the member\'s own profile', async () => {
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}`).set('Cookie', memberCookie());
    expect(res.text).toContain(`/members/${MEMBER_SLUG}/email-preferences`);
  });
});
