/**
 * The admin dashboard: what an administrator is shown on arrival, and in what
 * order.
 *
 * The page ranks by what needs a decision rather than listing every admin
 * surface at equal weight. Action Required carries only queues that are both
 * non-empty and urgent, and the whole section is absent when nothing is, so
 * its presence is itself the answer to "is anything on fire". Routine Queues
 * always render, zeros included, so the queue inventory is learned once. Go To
 * is navigation only. A category nothing can enqueue into never appears at
 * all, because a permanent zero would read as work an administrator had
 * finished.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertWorkQueueItem,
  insertSystemAlarmEvent,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3098');

const ADMIN_ID = 'admin-dashboard-001';
const OTHER_ADMIN_ID = 'admin-dashboard-002';
const MEMBER_ID = 'member-dashboard-001';

let createApp: Awaited<ReturnType<typeof importApp>>;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let workQueueService: typeof import('../../src/services/workQueueService').workQueueService;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

/** Opens the test database for one seeding or cleanup step and closes it again. */
function withDb(fn: (db: BetterSqlite3.Database) => void): void {
  const db = new BetterSqlite3(dbPath);
  try {
    fn(db);
  } finally {
    db.close();
  }
}

async function getDashboard(): Promise<string> {
  const res = await request(createApp()).get('/admin').set('Cookie', adminCookie());
  expect(res.status).toBe(200);
  // Handlebars escapes `=` inside an attribute, which the browser decodes
  // straight back, so a query-string href arrives here as `category&#x3D;x`.
  // Decoding it keeps these assertions about the destination rather than about
  // the escaping.
  return res.text.replace(/&#x3D;/g, '=');
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: ADMIN_ID, slug: 'dashboard_admin', display_name: 'Dashboard Admin',
    login_email: 'dash-admin@example.com', is_admin: 1,
  });
  insertMember(db, {
    id: OTHER_ADMIN_ID, slug: 'dashboard_admin_two', display_name: 'Dashboard Admin Two',
    login_email: 'dash-admin-2@example.com', is_admin: 1,
  });
  insertMember(db, {
    id: MEMBER_ID, slug: 'dashboard_member', display_name: 'Dashboard Member',
    login_email: 'dash-member@example.com',
  });
  db.close();

  createApp = await importApp();
  workQueueService = (await import('../../src/services/workQueueService')).workQueueService;
});

afterEach(() => {
  withDb((db) => {
    db.prepare('DELETE FROM work_queue_items').run();
    db.prepare('DELETE FROM system_alarm_events').run();
  });
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /admin access', () => {
  it('redirects an unauthenticated visitor to login carrying the return path', async () => {
    const res = await request(createApp()).get('/admin');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?returnTo=%2Fadmin');
  });

  it('refuses an authenticated non-admin', async () => {
    const res = await request(createApp()).get('/admin').set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });
});

describe('the dashboard with nothing waiting', () => {
  it('omits the urgent section entirely', async () => {
    const text = await getDashboard();
    // Its absence is the signal. A section reading "nothing urgent" would take
    // the same glance to read as one listing real work.
    expect(text).not.toContain('Needs You Now');
  });

  it('still renders every live queue, at zero', async () => {
    const text = await getDashboard();
    expect(text).toContain('Work Waiting');
    expect(text).toContain('Membership');
    expect(text).toContain('Payments');
    expect(text).toContain('System');
    expect(text).toContain('Club Cleanup');
    expect(text).toContain('Reconciliation');
    expect(text).toContain('0 open');
  });

  it('sends an empty queue to its own category, not to the whole queue', async () => {
    const text = await getDashboard();
    // A row labelled with one category that lands on a page showing all of them
    // makes the reader find their category again by eye, which is exactly what
    // the row was for.
    for (const category of ['membership', 'payments', 'system']) {
      expect(text, `${category} at zero must still link to itself`)
        .toContain(`href="/admin/work-queue?category=${category}"`);
    }
  });

  it('reports the platform healthy in one word and lists no figures', async () => {
    const text = await getDashboard();
    expect(text).toContain('All Clear');
    // Enumerating the figures that are fine spends lines saying nothing
    // happened, and teaches the reader to skip the block that matters on the
    // day one of them is not a zero.
    expect(text).not.toContain('Dead-lettered mail');
    expect(text).not.toContain('Unacknowledged alarms');
    expect(text).not.toContain('Email sending');
  });

  it('never shows a category nothing can enqueue into', async () => {
    const text = await getDashboard();
    for (const dead of ['Elections', 'Club leadership']) {
      expect(text, `${dead} has no producer and must not render as a queue`).not.toContain(dead);
    }
  });
});

describe('the dashboard with work waiting', () => {
  it('lifts an urgent category into the urgent tier and does not repeat it below', async () => {
    withDb((db) => {
      insertWorkQueueItem(db, { queue_category: 'membership', entity_id: MEMBER_ID, priority: 5 });
      insertWorkQueueItem(db, { queue_category: 'membership', entity_id: MEMBER_ID, priority: 0 });
    });

    const text = await getDashboard();
    expect(text).toContain('Needs You Now');
    expect(text).toContain('2 open');
    // One row per queue, wherever it sits: a queue shown twice makes the
    // administrator check whether they are two different numbers.
    expect(text.match(/Membership/g)?.length).toBe(1);
  });

  it('leaves a non-urgent category in the waiting tier', async () => {
    withDb((db) => {
      insertWorkQueueItem(db, { queue_category: 'payments', entity_id: MEMBER_ID, priority: 0 });
    });

    const text = await getDashboard();
    expect(text).not.toContain('Needs You Now');
    expect(text).toContain('1 open');
  });

  it('gives unacknowledged alarms their own urgent row', async () => {
    withDb((db) => {
      insertSystemAlarmEvent(db, { status: 'active' });
    });

    const text = await getDashboard();
    expect(text).toContain('Needs You Now');
    expect(text).toContain('Platform Alarms');
    expect(text).toContain('1 active');
  });

  it('does not also report an alarm as a system-health condition', async () => {
    withDb((db) => {
      insertSystemAlarmEvent(db, { status: 'active' });
    });

    const text = await getDashboard();
    // The alarm row links to the surface that acknowledges alarms. A second
    // row saying the same thing would lead somewhere that cannot act on it.
    // "Needs attention" is the system-health row's own count label, so its
    // absence is that row's absence.
    expect(text).not.toContain('Needs attention');
    expect(text).not.toContain('waiting for an administrator');
  });

  it('ignores a resolved item and an acknowledged alarm', async () => {
    withDb((db) => {
      insertWorkQueueItem(db, {
        queue_category: 'membership', entity_id: MEMBER_ID, priority: 9, status: 'resolved',
      });
      insertSystemAlarmEvent(db, { status: 'acknowledged' });
    });

    const text = await getDashboard();
    expect(text).not.toContain('Needs You Now');
    expect(text).not.toContain('1 active');
  });
});

describe('what this administrator is holding', () => {
  it('counts the viewer’s own live claims and says who holds the rest', async () => {
    let mine = '';
    let theirs = '';
    withDb((db) => {
      mine = insertWorkQueueItem(db, { queue_category: 'membership', entity_id: MEMBER_ID });
      theirs = insertWorkQueueItem(db, { queue_category: 'payments', entity_id: MEMBER_ID });
    });
    // Claimed through the real path, so the page is reading the state the claim
    // action actually writes rather than a shape invented by the test.
    workQueueService.claim({ queueItemId: mine, adminMemberId: ADMIN_ID });
    workQueueService.claim({ queueItemId: theirs, adminMemberId: OTHER_ADMIN_ID });

    const text = await getDashboard();
    expect(text).toContain('Claimed by You');
    expect(text).toContain('1 item');
    // The second figure is the point of the first: an administrator looking at
    // an empty queue wants to know whether there is no work or whether someone
    // already took it.
    expect(text).toContain('1 item is held by another administrator.');
  });

  it('stops counting a claim once it has gone stale', async () => {
    let old = '';
    withDb((db) => {
      old = insertWorkQueueItem(db, { queue_category: 'membership', entity_id: MEMBER_ID });
    });
    workQueueService.claim({ queueItemId: old, adminMemberId: ADMIN_ID });
    // A claim is a coordination signal with a shelf life, not a lock. One left
    // behind must stop counting as held, or an administrator who walked away
    // would appear to be handling an item forever. No action can produce a
    // claim already in the past, so the timestamp is aged here.
    withDb((db) => {
      db.prepare('UPDATE work_queue_items SET claimed_at = ? WHERE id = ?')
        .run('2020-01-01T00:00:00.000Z', old);
    });

    const text = await getDashboard();
    expect(text).toContain('0 items');
    expect(text).toContain('No other administrator is holding an item.');
  });
});

describe('the Go To tier', () => {
  it('reaches the admin surfaces that were linked from nowhere', async () => {
    const text = await getDashboard();
    for (const href of [
      '/admin/clubs/leadership',
      '/admin/freestyle/records',
      '/admin/freestyle/consecutive-records',
      '/admin/freestyle/sources',
      '/admin/freestyle/emerging-vocabulary',
      '/admin/freestyle/tips',
    ]) {
      expect(text, `${href} is reachable only by typing it`).toContain(`href="${href}"`);
    }
  });

  it('keeps the surfaces the previous dashboard already reached', async () => {
    const text = await getDashboard();
    for (const href of [
      '/admin/members',
      '/ifpa/roster',
      '/admin/historical-records',
      '/admin/curator/media',
      '/admin/curator/galleries',
      '/admin/mailing-lists',
      '/admin/broadcasts',
      '/admin/email-templates',
      '/admin/email-log',
      '/admin/payments',
      '/admin/admin-roles',
      '/admin/honor-grants',
      '/admin/system-health',
      '/admin/audit-log',
    ]) {
      expect(text, `${href} was reachable before the rebuild`).toContain(`href="${href}"`);
    }
  });
});
