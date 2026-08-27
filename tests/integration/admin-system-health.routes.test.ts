/**
 * Admin system-health page contract: the page reports outbound-email volume by
 * status over an administrator-configurable recent window, dead-lettered
 * messages over all time regardless of that window, bounce and complaint volume
 * as a share of what was sent, the state of the pause-sending switch, per-job
 * run health with the age of each job's last success, and the count of alarms
 * waiting for an administrator. It is admin-only and writes nothing.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertOutboxEmail,
  insertSystemConfig,
  insertSystemJobRun,
  insertSystemAlarmEvent,
  insertSesEvent,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4068');

const ADMIN_ID    = 'sh_admin_001';
const ADMIN_SLUG  = 'sh_admin_one';
const MEMBER_ID   = 'sh_member_001';
const MEMBER_SLUG = 'sh_member_one';

const HOUR_MS = 60 * 60 * 1000;
const HOURS_AGO = (h: number) => new Date(Date.now() - h * HOUR_MS).toISOString();

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

async function healthPage(): Promise<string> {
  const res = await request(createApp()).get('/admin/system-health').set('Cookie', adminCookie());
  expect(res.status).toBe(200);
  return res.text;
}

/** The count cell of the outbound-email table row for one status. The table
 *  renders a fixed row per status, so the assertion targets that row rather
 *  than searching the whole page for a bare number that could come from
 *  anywhere else on it. */
function outboxCountFor(html: string, statusLabel: string): number {
  const row = new RegExp(`<td>${statusLabel}</td>\\s*<td>(\\d+)</td>`);
  const match = row.exec(html);
  expect(match, `no outbound-email row for status ${statusLabel}`).not.toBeNull();
  return Number(match![1]);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID,  slug: ADMIN_SLUG,  display_name: 'SH Admin',  real_name: 'SH Admin',  login_email: 'sh-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'SH Member', real_name: 'SH Member', login_email: 'sh-member@example.com' });
  // The append-only guard on the tunables table is dropped on this throwaway
  // test database so each case can start from the seeded defaults. The page
  // under test only ever reads that table, so removing the guard changes
  // nothing about the behaviour these cases exercise.
  db.exec(`DROP TRIGGER IF EXISTS trg_system_config_no_update; DROP TRIGGER IF EXISTS trg_system_config_no_delete;`);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => {
    db.prepare('DELETE FROM outbox_emails').run();
    db.prepare('DELETE FROM ses_events').run();
    db.prepare('DELETE FROM system_job_runs').run();
    db.prepare('DELETE FROM system_alarm_events').run();
    db.prepare(`DELETE FROM system_config WHERE config_key IN ('system_health_window_hours','email_outbox_paused','bulk_send_paused')`).run();
  });
});

describe('GET /admin/system-health', () => {
  it('unauthenticated visitors are sent to log in', async () => {
    const res = await request(createApp()).get('/admin/system-health');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('a signed-in member who is not an administrator is refused', async () => {
    const res = await request(createApp()).get('/admin/system-health').set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('renders with nothing recorded, reporting empty states rather than failing', async () => {
    const html = await healthPage();
    expect(html).toContain('System Health');
    expect(outboxCountFor(html, 'Pending')).toBe(0);
    expect(html).toContain('there is no share to report against');
    // The delivery figures stay on the page with a dash in place of the share,
    // rather than the section disappearing: feedback can arrive in a window that
    // sent nothing, and that is exactly when an admin needs to see it.
    expect(html).toContain('Hard bounces');
    expect(html).toContain('--');
    expect(html).toContain('No scheduled job has run yet.');
    expect(html).toContain('No alarm is waiting for an administrator.');
  });

  // Sent volume is a windowed figure; a backlog is not. A message still waiting
  // from before the window is the very thing this page exists to surface, so
  // windowing it would report an idle queue during the outage it should be
  // shouting about.
  it('counts what was sent within the window, and everything still waiting whatever its age', async () => {
    withDb((db) => {
      insertOutboxEmail(db, { status: 'pending', created_at: HOURS_AGO(1) });
      insertOutboxEmail(db, { status: 'pending', created_at: HOURS_AGO(2) });
      insertOutboxEmail(db, { status: 'sent',    created_at: HOURS_AGO(3), sent_at: HOURS_AGO(3) });
      // Sent before the window opened: out of the volume figure.
      insertOutboxEmail(db, { status: 'sent',    created_at: HOURS_AGO(40), sent_at: HOURS_AGO(40) });
      // Still waiting since before the window: counted, because it is stuck.
      insertOutboxEmail(db, { status: 'pending', created_at: HOURS_AGO(40) });
    });
    const html = await healthPage();
    expect(outboxCountFor(html, 'Pending')).toBe(3);
    expect(outboxCountFor(html, 'Sent')).toBe(1);
  });

  it('honours a widened window from the administrator-configurable setting', async () => {
    withDb((db) => {
      // Inside the widened window but outside the default one.
      insertOutboxEmail(db, { status: 'sent', created_at: HOURS_AGO(40), sent_at: HOURS_AGO(40) });
      // Outside the widened window too, so widening must not sweep it in.
      insertOutboxEmail(db, { status: 'sent', created_at: HOURS_AGO(100), sent_at: HOURS_AGO(100) });
      insertSystemConfig(db, { config_key: 'system_health_window_hours', value_json: '72' });
    });
    const html = await healthPage();
    expect(html).toContain('the last 72 hours');
    expect(outboxCountFor(html, 'Sent')).toBe(1);
  });

  // A configured value large enough to overflow the window arithmetic produced
  // an unusable start time and threw the page, so an administrator could lock
  // themselves out of the surface they most need during an incident.
  it('survives an absurd configured window rather than failing to render', async () => {
    withDb((db) => {
      insertSystemConfig(db, { config_key: 'system_health_window_hours', value_json: '999999999999' });
    });
    const res = await request(createApp()).get('/admin/system-health').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('the last 8760 hours');
  });

  it('counts dead-lettered messages over all time, so one older than the window still shows', async () => {
    withDb((db) => insertOutboxEmail(db, { status: 'dead_letter', created_at: HOURS_AGO(500) }));
    const html = await healthPage();
    expect(html).toContain('Dead-lettered all time');
    // The count is a link only when there is something to look at, so the
    // assertion targets that anchor with its number rather than the bare
    // number, which the per-status table also renders. The template escapes the
    // equals sign in the query string, which browsers decode back.
    expect(html).toContain('<a href="/admin/email-log?status&#x3D;dead_letter" class="fw-600">1</a>');
  });

  it('reports whether sending is paused, and says so prominently when it is', async () => {
    const draining = await healthPage();
    expect(draining).toContain('Draining');

    withDb((db) => insertSystemConfig(db, { config_key: 'email_outbox_paused', value_json: '1' }));
    const paused = await healthPage();
    expect(paused).toContain('Paused');
    expect(paused).toContain('Sending is paused.');
  });

  it('expresses bounces and complaints as a share of what was sent in the window', async () => {
    withDb((db) => {
      for (let i = 0; i < 10; i += 1) {
        insertOutboxEmail(db, { status: 'sent', created_at: HOURS_AGO(2), sent_at: HOURS_AGO(2) });
      }
      // Created before the window but sent inside it: the denominator counts
      // when a message went out, which is the population the feedback is about.
      insertOutboxEmail(db, { status: 'pending', created_at: HOURS_AGO(40) });
      insertSesEvent(db, { event_type: 'bounce',    created_at: HOURS_AGO(2) });
      insertSesEvent(db, { event_type: 'complaint', created_at: HOURS_AGO(2) });
      insertSesEvent(db, { event_type: 'complaint', created_at: HOURS_AGO(2) });
      // Outside the window: counted in neither numerator.
      insertSesEvent(db, { event_type: 'bounce', created_at: HOURS_AGO(40) });
    });
    const html = await healthPage();
    expect(html).toContain('10.0%');
    expect(html).toContain('20.0%');
  });

  // The provider reports one notification per event, not one per address, and a
  // single notification can name several. Counting notifications reports fewer
  // bounces than actually happened, which is the wrong direction for a figure an
  // operator watches to keep the sending reputation intact.
  it('counts every recipient a bounce notification named, not the notification', async () => {
    withDb((db) => {
      for (let i = 0; i < 10; i += 1) {
        insertOutboxEmail(db, { status: 'sent', created_at: HOURS_AGO(2), sent_at: HOURS_AGO(2) });
      }
      insertSesEvent(db, { event_type: 'bounce', created_at: HOURS_AGO(2), recipient_count: 3 });
    });
    const html = await healthPage();
    expect(html).toContain('30.0%');
  });

  it('shows each job with its last outcome, the age of its last success, and its failures in the window', async () => {
    withDb((db) => {
      insertSystemJobRun(db, { job_name: 'SYS_Alpha', status: 'succeeded', started_at: HOURS_AGO(3) });
      insertSystemJobRun(db, { job_name: 'SYS_Alpha', status: 'failed',    started_at: HOURS_AGO(1), last_error: 'alpha blew up' });
      insertSystemJobRun(db, { job_name: 'SYS_Beta',  status: 'failed',    started_at: HOURS_AGO(2), last_error: 'beta blew up' });
    });
    const html = await healthPage();
    expect(html).toContain('SYS_Alpha');
    expect(html).toContain('SYS_Beta');
    expect(html).toContain('3 hours ago');
    // Beta has never succeeded, which the page calls out rather than leaving blank.
    expect(html).toContain('Never');
    expect(html).toContain('alpha blew up');
  });

  // A run the reaper marked aborted is badged as a failure in the run history.
  // The per-job summary above it must agree: two tables on one page reporting
  // opposite things about the same run leaves an operator with no way to tell
  // which is right.
  it('counts a reaped run among a job\'s failures, matching how the run history badges it', async () => {
    withDb((db) => {
      insertSystemJobRun(db, {
        job_name: 'SYS_Reaped', status: 'aborted', started_at: HOURS_AGO(1),
        last_error: 'stale_running_reaped',
      });
    });
    const html = await healthPage();
    const summaryRow = html.split('SYS_Reaped')[1] ?? '';
    expect(summaryRow).toContain('<span class="fw-600">1</span>');
    expect(html).toContain('stale_running_reaped');
  });

  it("reports a job's last success from before the window rather than treating it as absent", async () => {
    withDb((db) => insertSystemJobRun(db, {
      job_name: 'SYS_Stale', status: 'succeeded', started_at: HOURS_AGO(100),
    }));
    const html = await healthPage();
    expect(html).toContain('SYS_Stale');
    expect(html).toContain('4 days ago');
    expect(html).not.toContain('Never');
  });

  it('counts alarms nobody has picked up, and excludes acknowledged and cleared ones', async () => {
    withDb((db) => {
      insertSystemAlarmEvent(db, { alarm_type: 'footbag-a', status: 'active' });
      insertSystemAlarmEvent(db, { alarm_type: 'footbag-b', status: 'acknowledged' });
      insertSystemAlarmEvent(db, { alarm_type: 'footbag-c', status: 'cleared', cleared_at: HOURS_AGO(1) });
    });
    const html = await healthPage();
    expect(html).toContain('1 alarm nobody has picked up yet');
    expect(html).toContain('href="/admin/alarms"');
  });
});

describe('the admin dashboard surfaces the same health signals', () => {
  it('flags the system-health card when something needs attention and links to both pages', async () => {
    withDb((db) => {
      insertOutboxEmail(db, { status: 'dead_letter', created_at: HOURS_AGO(1) });
      insertSystemAlarmEvent(db, { alarm_type: 'footbag-x', status: 'active' });
    });
    const res = await request(createApp()).get('/admin').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/admin/system-health"');
    expect(res.text).toContain('href="/admin/alarms"');
    expect(res.text).toContain('Needs attention');
    expect(res.text).toContain('One message was dead-lettered.');
    // An unacknowledged alarm reaches the administrator as its own row with a
    // count and a link to the surface that acknowledges it, not as a second
    // sentence under system health that leads somewhere unable to act on it.
    expect(res.text).toContain('1 active');
    expect(res.text).not.toContain('One alarm is waiting for an administrator.');
  });

  // The scheduled jobs are half of what the health page reports. A dashboard
  // that stays quiet while a job is failing, has never once succeeded, or was
  // killed mid-run hides exactly the quiet failure it exists to surface.
  it('flags a failing job, one that has never succeeded, and one killed mid-run', async () => {
    withDb((db) => {
      insertSystemJobRun(db, { job_name: 'SYS_Failing', status: 'succeeded', started_at: HOURS_AGO(5) });
      insertSystemJobRun(db, { job_name: 'SYS_Failing', status: 'failed',    started_at: HOURS_AGO(1) });
      insertSystemJobRun(db, { job_name: 'SYS_NeverOk', status: 'failed',    started_at: HOURS_AGO(2) });
      insertSystemJobRun(db, { job_name: 'SYS_Stuck',   status: 'running',   started_at: HOURS_AGO(3) });
    });
    const res = await request(createApp()).get('/admin').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Needs attention');
    expect(res.text).toContain('scheduled jobs failed recently');
    expect(res.text).toContain('scheduled jobs have never succeeded');
    expect(res.text).toContain('One scheduled job is still marked as running.');
  });

  // A queue with items in it is ordinary operation, so a plain backlog stays
  // unflagged. Mail that has been waiting longer than the health window is a
  // queue that has stopped moving.
  it('flags mail that has been waiting longer than the window, but not an ordinary backlog', async () => {
    withDb((db) => {
      insertOutboxEmail(db, { status: 'pending', created_at: HOURS_AGO(1) });
    });
    const fresh = await request(createApp()).get('/admin').set('Cookie', adminCookie());
    expect(fresh.text).not.toContain('Mail has been waiting to go out longer than the health window.');

    withDb((db) => {
      insertOutboxEmail(db, { status: 'pending', created_at: HOURS_AGO(40) });
    });
    const stale = await request(createApp()).get('/admin').set('Cookie', adminCookie());
    expect(stale.text).toContain('Mail has been waiting to go out longer than the health window.');
  });

  it('leaves the card unflagged when every alarm has been taken or has cleared', async () => {
    withDb((db) => {
      insertSystemAlarmEvent(db, { alarm_type: 'footbag-y', status: 'acknowledged' });
      insertSystemAlarmEvent(db, { alarm_type: 'footbag-z', status: 'cleared', cleared_at: HOURS_AGO(1) });
    });
    const res = await request(createApp()).get('/admin').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/admin/system-health"');
    expect(res.text).not.toContain('Needs attention');
  });
});

// Feedback arrives after the mail that caused it, sometimes long after. A window
// that sent nothing can still receive bounces for earlier sends, and that is
// precisely the incident an operator needs to see. The figures stay on the page
// with a dash where the share would go, rather than the section disappearing.
describe('feedback arriving in a window that sent nothing', () => {
  it('still shows the bounce and complaint counts, with a dash for the share', async () => {
    withDb((db) => {
      insertSesEvent(db, { event_type: 'bounce', created_at: HOURS_AGO(1), recipient_count: 4 });
      insertSesEvent(db, { event_type: 'complaint', created_at: HOURS_AGO(1), recipient_count: 2 });
    });
    const html = await healthPage();
    expect(html).toContain('Hard bounces');
    expect(html).toContain('there is no share to report against');
    expect(html).toMatch(/Hard bounces[\s\S]*?4[\s\S]*?--/);
    expect(html).toMatch(/Complaints[\s\S]*?2[\s\S]*?--/);
  });
});

// An operator running a staged bulk send reads this page to answer two
// questions: is the run moving, and if it is not, why not. The release rate and
// the per-stream backlog answer the first; the halt notice answers the second.
describe('release rate and the bulk stream', () => {
  it('states the pass size, the bulk share of it, and the interval', async () => {
    const html = await healthPage();
    expect(html).toContain('Release rate:');
    expect(html).toContain('Up to 10 messages every 30 seconds, of which at most 5 may be bulk.');
  });

  it('reports what is waiting on each stream separately', async () => {
    withDb((db) => {
      insertOutboxEmail(db, { status: 'pending', stream: 'transactional' });
      insertOutboxEmail(db, { status: 'pending', stream: 'bulk' });
      insertOutboxEmail(db, { status: 'pending', stream: 'bulk' });
    });
    const html = await healthPage();
    expect(html).toMatch(/transactional:\s*<span class="fw-600">1<\/span>/);
    expect(html).toMatch(/bulk:\s*<span class="fw-600">2<\/span>/);
  });

  it('shows the bulk stream draining while the feedback is clean', async () => {
    const html = await healthPage();
    expect(html).toMatch(/bulk stream:\s*<span class="fw-600">Draining<\/span>/);
    expect(html).not.toContain('Bulk sending is stopped');
  });

  it('explains the stop, and which rate caused it, when bulk is halted', async () => {
    withDb((db) => {
      for (let i = 0; i < 100; i += 1) {
        insertOutboxEmail(db, {
          status: 'sent', sent_at: HOURS_AGO(1), recipient_email: `sent-${i}@example.test`,
        });
      }
      insertSesEvent(db, { event_type: 'complaint', created_at: HOURS_AGO(1) });
    });
    const html = await healthPage();
    expect(html).toMatch(/bulk stream:\s*<span class="fw-600">Stopped on feedback<\/span>/);
    expect(html).toContain('Bulk sending is stopped: the complaint rate over the last 24 hours');
    expect(html).toContain('at or above the 0.25% limit');
    expect(html).toContain('Transactional mail is unaffected and still going out.');
  });

  it('says an operator stopped the bulk stream, and that it will not clear itself', async () => {
    withDb((db) => {
      insertSystemConfig(db, {
        config_key: 'bulk_send_paused',
        value_json: '1',
        effective_start_at: HOURS_AGO(1),
      });
    });
    const html = await healthPage();
    expect(html).toMatch(/bulk stream:\s*<span class="fw-600">Stopped by operator<\/span>/);
    expect(html).toContain('Bulk sending is stopped by an operator.');
    expect(html).toContain('This does not clear itself.');
  });

  it('attributes the stop to the operator rather than to feedback when both would apply', async () => {
    // An operator who stopped a send while the rates were also bad needs to be
    // told which fact they are looking at: clearing the rates will not restart
    // it, because a person stopped it.
    withDb((db) => {
      for (let i = 0; i < 100; i += 1) {
        insertOutboxEmail(db, {
          status: 'sent', sent_at: HOURS_AGO(1), recipient_email: `sent-${i}@example.test`,
        });
      }
      insertSesEvent(db, { event_type: 'complaint', created_at: HOURS_AGO(1) });
      insertSystemConfig(db, {
        config_key: 'bulk_send_paused',
        value_json: '1',
        effective_start_at: HOURS_AGO(1),
      });
    });
    const html = await healthPage();
    expect(html).toMatch(/bulk stream:\s*<span class="fw-600">Stopped by operator<\/span>/);
    expect(html).not.toContain('Bulk sending is stopped: the complaint rate');
  });

  it('states a rate that agrees with the limit it is being compared against', async () => {
    // One complaint in 401 sent is exactly 25 ten-thousandths, so it halts at
    // the limit. Rendering the observed rate to one decimal of percent while
    // rendering the limit to two produced "is 0.2% ... at or above the 0.25%
    // limit", which is arithmetic nonsense to the operator reading it during
    // the low-volume early send this feature exists to protect.
    withDb((db) => {
      for (let i = 0; i < 401; i += 1) {
        insertOutboxEmail(db, {
          status: 'sent', sent_at: HOURS_AGO(1), recipient_email: `sent-${i}@example.test`,
        });
      }
      insertSesEvent(db, { event_type: 'complaint', created_at: HOURS_AGO(1) });
    });
    const html = await healthPage();
    expect(html).toContain('Bulk sending is stopped: the complaint rate');
    expect(html).toContain('is 0.25% of what was sent, at or above the 0.25% limit');
    expect(html).not.toContain('is 0.2% of what was sent');
  });

  it('names the bounce rate when that is what crossed the line', async () => {
    withDb((db) => {
      for (let i = 0; i < 100; i += 1) {
        insertOutboxEmail(db, {
          status: 'sent', sent_at: HOURS_AGO(1), recipient_email: `sent-${i}@example.test`,
        });
      }
      insertSesEvent(db, { event_type: 'bounce', created_at: HOURS_AGO(1), recipient_count: 6 });
    });
    const html = await healthPage();
    expect(html).toContain('Bulk sending is stopped: the bounce rate over the last 24 hours');
    expect(html).toContain('at or above the 5% limit');
  });
});
