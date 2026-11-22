/**
 * The admin dashboard: what an administrator is shown on arrival, and in what
 * order.
 *
 * Work is shown as one card per work-queue kind. The Team Alert card appears
 * only while one is open, so its presence is itself the answer to "is anything
 * on fire". The Someone Is Waiting and Housekeeping cards always render, each
 * with its count line, its open items per area and one button to its own kind.
 * The Team Alert card and a System Health block needing attention are the only
 * coloured elements. Go To is navigation only.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertWorkQueueItem,
  insertWorkQueueTopicOwner,
  insertSystemAlarmEvent,
  createTestSessionJwt,
} from '../fixtures/factories';
import { WORK_QUEUE_KINDS } from '../../src/services/workQueueTaskTypes';
import { isoDaysAgo } from '../fixtures/clock';

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
  it('omits the Team Alert card entirely', async () => {
    const text = await getDashboard();
    // Its absence is the signal. A card reading "no alert" would take the same
    // glance to read as one announcing a real one.
    expect(text).not.toContain('notice-card--warn-strong');
    expect(text).not.toContain('href="/admin/work-queue?kind=team_alert"');
  });

  it('still renders the two routine kind cards, empty, each leading to its own kind', async () => {
    const text = await getDashboard();
    // A card labelled with one kind that lands on a page showing another makes
    // the reader find their kind again by eye, which is what the card was for.
    for (const k of WORK_QUEUE_KINDS.filter((x) => x.kind !== 'team_alert')) {
      expect(text, `${k.kind} at zero must still render`).toContain(`<h2>${k.label}</h2>`);
      expect(text, `${k.kind} at zero must still link to itself`)
        .toContain(`href="/admin/work-queue?kind=${k.kind}"`);
    }
    expect(text.match(/Nothing open\./g)?.length).toBe(2);
    // Housekeeping kept outside the work queue sits on the Housekeeping card.
    expect(text).toContain('href="/admin/club-cleanup"');
    expect(text).toContain('href="/admin/payments/reconciliation"');
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
});

describe('the dashboard with work waiting', () => {
  it('shows the Team Alert card while one is open, leading to the Team Alert queue', async () => {
    withDb((db) => {
      insertWorkQueueItem(db, { task_type: 'admin_loss_recruitment', entity_id: MEMBER_ID });
    });

    const text = await getDashboard();
    expect(text).toContain('notice-card--warn-strong');
    expect(text).toContain('href="/admin/work-queue?kind=team_alert"');
    // The health block is fine, so the alert card is the one coloured element.
    expect(text).not.toContain('badge-warn');
  });

  it('gives a kind its count line and one row per area, each leading to that area', async () => {
    withDb((db) => {
      insertWorkQueueItem(db, {
        task_type: 'member_contact_request', entity_id: MEMBER_ID, opened_at: isoDaysAgo(6),
      });
      insertWorkQueueItem(db, { task_type: 'content_report', entity_id: MEMBER_ID });
    });

    const text = await getDashboard();
    // Two open, the older six days old and unclaimed past the three-day stale
    // threshold, the newer still inside it.
    expect(text).toContain('2 open, oldest 6 days; 1 unclaimed past 3 days');
    expect(text).toContain('href="/admin/work-queue?kind=waiting&amp;topic=membership"');
    expect(text).toContain('href="/admin/work-queue?kind=waiting&amp;topic=moderation"');
    // An area with nothing open gets no row.
    expect(text).not.toContain('href="/admin/work-queue?kind=waiting&amp;topic=finance"');
  });

  it('does not count a claimed item as unclaimed past the threshold', async () => {
    let claimedId = '';
    withDb((db) => {
      claimedId = insertWorkQueueItem(db, {
        task_type: 'payout_failed', entity_type: 'stripe_payout', entity_id: 'po-1', opened_at: isoDaysAgo(5),
      });
      insertWorkQueueItem(db, {
        task_type: 'payout_failed', entity_type: 'stripe_payout', entity_id: 'po-2', opened_at: isoDaysAgo(4),
      });
    });
    workQueueService.claim({ queueItemId: claimedId, adminMemberId: OTHER_ADMIN_ID });

    const text = await getDashboard();
    expect(text).toContain('2 open, oldest 5 days; 1 unclaimed past 3 days');
  });

  it('reports an unacknowledged alarm in the System Health block, its one coloured badge', async () => {
    withDb((db) => {
      insertSystemAlarmEvent(db, { status: 'active' });
    });

    const text = await getDashboard();
    expect(text).toContain('Unacknowledged alarms');
    expect(text.match(/badge-warn/g)?.length).toBe(1);
    expect(text).not.toContain('Needs You Now');
  });

  it('ignores a resolved item and an acknowledged alarm', async () => {
    withDb((db) => {
      insertWorkQueueItem(db, {
        task_type: 'member_contact_request', entity_id: MEMBER_ID, status: 'resolved',
      });
      insertSystemAlarmEvent(db, { status: 'acknowledged' });
    });

    const text = await getDashboard();
    expect(text.match(/Nothing open\./g)?.length).toBe(2);
    expect(text).not.toContain('Unacknowledged alarms');
  });
});

describe('what this administrator is holding', () => {
  it('counts the viewer’s own live claims and says who holds the rest', async () => {
    let mine = '';
    let theirs = '';
    withDb((db) => {
      mine = insertWorkQueueItem(db, { entity_id: MEMBER_ID });
      theirs = insertWorkQueueItem(db, { entity_id: MEMBER_ID });
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
      old = insertWorkQueueItem(db, { entity_id: MEMBER_ID });
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
      '/admin/freestyle/records',
      '/admin/freestyle/consecutive-records',
      '/admin/news',
      '/admin/freestyle/sources',
      '/admin/freestyle/emerging-vocabulary',
      '/admin/freestyle/notation-backlog',
      '/admin/system-parameters',
      '/admin/media-flags',
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

describe('the areas this administrator owns', () => {
  afterEach(() => {
    withDb((db) => db.prepare('DELETE FROM work_queue_topic_owners').run());
  });

  function areaRow(text: string, topic: string): string | undefined {
    return new RegExp(`<a class="admin-queue-row" href="/admin/work-queue\\?topic=${topic}">([\\s\\S]*?)</a>`)
      .exec(text)?.[1];
  }

  // Defect caught: an administrator who owns nothing is shown an empty areas
  // tile, or an owner is not shown theirs.
  it('shows the areas tile only to an administrator who owns an area', async () => {
    withDb((db) => insertWorkQueueTopicOwner(db, { topic: 'membership', owner_member_id: OTHER_ADMIN_ID }));
    const tiles = (html: string) => html.split('<div class="admin-tile">').length - 1;
    const text = await getDashboard();
    expect(text).not.toContain('href="/admin/work-queue?topic=');

    withDb((db) => insertWorkQueueTopicOwner(db, { topic: 'finance', owner_member_id: ADMIN_ID }));
    const owner = await getDashboard();
    expect(areaRow(owner, 'finance')).toBeDefined();
    // Nothing in the area has waited, so the row carries no stale line.
    expect(areaRow(owner, 'finance')).not.toContain('admin-queue-row-meta');
    expect(areaRow(owner, 'membership')).toBeUndefined();
    // Owning an area adds exactly one tile; owning none leaves no empty one.
    expect(tiles(owner)).toBe(tiles(text) + 1);
  });

  // Defect caught: the owner's count includes parked items, or the stale line
  // counts a fresh item or one a colleague is actively handling, so the owner
  // chases work that is not neglected.
  it('counts the area’s working items and those unclaimed past the stale threshold', async () => {
    let claimedOld = '';
    withDb((db) => {
      insertWorkQueueTopicOwner(db, { topic: 'finance', owner_member_id: ADMIN_ID });
      insertWorkQueueItem(db, {
        task_type: 'reconciliation_discrepancy', entity_type: 'reconciliation_issue',
        entity_id: 'ri-old', opened_at: '2020-01-01T00:00:00.000Z',
      });
      insertWorkQueueItem(db, {
        task_type: 'payout_failed', entity_type: 'stripe_payout', entity_id: 'po-fresh',
      });
      claimedOld = insertWorkQueueItem(db, {
        task_type: 'payout_failed', entity_type: 'stripe_payout',
        entity_id: 'po-old-claimed', opened_at: '2020-01-01T00:00:00.000Z',
      });
      insertWorkQueueItem(db, {
        task_type: 'partial_refund_review', entity_type: 'payment', entity_id: 'pay-parked',
        opened_at: '2020-01-01T00:00:00.000Z', parked_at: '2020-01-02T00:00:00.000Z',
        parked_by_member_id: OTHER_ADMIN_ID, park_reason: 'Waiting on the bank.',
      });
      // Another area's old item must not reach the finance row.
      insertWorkQueueItem(db, {
        task_type: 'member_contact_request', entity_id: MEMBER_ID,
        opened_at: '2020-01-01T00:00:00.000Z',
      });
    });
    workQueueService.claim({ queueItemId: claimedOld, adminMemberId: OTHER_ADMIN_ID });

    const row = areaRow(await getDashboard(), 'finance');
    expect(row).toBeDefined();
    expect(row).toContain('3 open');
    expect(row).toContain('1 unclaimed for 3+ days');
  });
});
