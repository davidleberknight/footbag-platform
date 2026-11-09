/**
 * The alarm banner on every admin page: while any platform alarm is
 * unacknowledged, every admin page names how many and links to the page that
 * answers them; while the worker that reads alarms has stopped running its
 * jobs, every admin page says alarms cannot arrive. Admins only, admin pages
 * only, and never at the cost of the page itself.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertSystemAlarmEvent, insertSystemJobRun, createTestSessionJwt } from '../fixtures/factories';
import { isoDaysFromNow } from '../fixtures/clock';

const { dbPath } = setTestEnv('4112');
// The feed-stalled line is shown only where the alarm feed is configured; the
// queue URL is read once at config load, so it is set before the app imports.
process.env.ALARM_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/000/footbag-test-alarm-feed';

const ADMIN_ID = 'ab_admin_100';
const MEMBER_ID = 'ab_member_100';

let createApp: Awaited<ReturnType<typeof importApp>>;
let highFrequencyJob: string;

const adminCookie = () => `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
const memberCookie = () => `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function banner(html: string): string | null {
  const m = /<div class="flash-banner flash-action" role="alert" id="admin-alarm-banner">([\s\S]*?)<\/div>/.exec(html);
  return m ? m[1] : null;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'ab_admin_hundred', login_email: 'ab-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'ab_member_hundred', login_email: 'ab-member@example.com' });
  db.close();
  highFrequencyJob = (await import('../../src/services/jobRegistry')).listHighFrequencyJobNames()[0];
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => {
    db.prepare('DELETE FROM system_alarm_events').run();
    db.prepare('DELETE FROM system_job_runs').run();
  });
});

describe('admin alarm banner', () => {
  it('names the unacknowledged alarms on every admin page and links to the page that answers them', async () => {
    // Defect caught: an alarm raised while the administrator works elsewhere in
    // the console goes unseen until they happen to open the alarms page.
    withDb((db) => {
      insertSystemAlarmEvent(db, { alarm_type: 'footbag-test-one' });
      insertSystemAlarmEvent(db, { alarm_type: 'footbag-test-two' });
      insertSystemAlarmEvent(db, { alarm_type: 'footbag-test-done', status: 'acknowledged', acknowledged_by_member_id: ADMIN_ID, acknowledged_at: isoDaysFromNow(0) });
    });
    for (const path of ['/admin', '/admin/system-health', '/admin/members']) {
      const res = await request(createApp()).get(path).set('Cookie', adminCookie());
      expect(res.status, path).toBe(200);
      const b = banner(res.text);
      expect(b, path).not.toBeNull();
      expect(b).toContain('2 platform alarms need attention.');
      expect(b).toMatch(/<a href="\/admin\/alarms">/);
      expect(b).not.toContain('background worker');
    }
  });

  it('uses the singular for one alarm', async () => {
    withDb((db) => { insertSystemAlarmEvent(db); });
    const res = await request(createApp()).get('/admin').set('Cookie', adminCookie());
    expect(banner(res.text)).toContain('1 platform alarm needs attention.');
  });

  it('shows nothing when every alarm is answered and the worker is running', async () => {
    // Defect caught: a banner that never goes away, which teaches administrators
    // to ignore it.
    withDb((db) => {
      insertSystemAlarmEvent(db, { status: 'acknowledged', acknowledged_by_member_id: ADMIN_ID, acknowledged_at: isoDaysFromNow(0) });
      insertSystemJobRun(db, { job_name: highFrequencyJob, started_at: new Date().toISOString() });
    });
    const res = await request(createApp()).get('/admin').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(banner(res.text)).toBeNull();
  });

  it('says alarms cannot arrive when the worker has stopped running its jobs', async () => {
    // Defect caught: the worker that reads alarms dies, its own crash alarm can
    // never reach the console, and the console shows a clean bill of health.
    withDb((db) => {
      insertSystemJobRun(db, { job_name: highFrequencyJob, started_at: isoDaysFromNow(-2) });
    });
    const res = await request(createApp()).get('/admin/system-health').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    const b = banner(res.text);
    expect(b).toContain('Alarms are not reaching this page: the background worker has stopped running its jobs. Alarm emails still arrive.');
    expect(b).not.toContain('need');
  });

  it('is shown to administrators on admin pages only', async () => {
    // Defect caught: alarm counts leaking to members, or the banner cluttering
    // the public site for an administrator browsing it.
    withDb((db) => { insertSystemAlarmEvent(db); });
    const member = await request(createApp()).get('/members/ab_member_hundred').set('Cookie', memberCookie());
    expect(banner(member.text)).toBeNull();
    const publicPage = await request(createApp()).get('/events').set('Cookie', adminCookie());
    expect(publicPage.status).toBe(200);
    expect(banner(publicPage.text)).toBeNull();
  });

  it('lets the page continue without the banner when its read fails', async () => {
    // Defect caught: the banner's own read taking down every admin page, during
    // exactly the incident an administrator opened the console for.
    const { systemHealthService } = await import('../../src/services/systemHealthService');
    const { adminAlarmBanner } = await import('../../src/middleware/adminAlarmBanner');
    const spy = vi.spyOn(systemHealthService, 'getAdminAlarmBanner').mockImplementation(() => {
      throw new Error('database is locked');
    });
    try {
      const res = { locals: { isAdmin: true } as Record<string, unknown> };
      const next = vi.fn();
      adminAlarmBanner({ path: '/admin' } as never, res as never, next);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(res.locals.adminAlarmBanner).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});
