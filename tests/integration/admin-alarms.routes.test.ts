/**
 * Admin platform-alarms page contract: the page lists recorded alarms newest
 * first with their severity, state and the reason the monitoring service gave,
 * and offers an acknowledge control on the ones nobody has taken. Acknowledging
 * records who did it, when, and their optional note, and appends one audit
 * entry. Acknowledgment is one-shot, so a resubmitted form cannot overwrite the
 * first administrator's name or note. Admin-only.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertSystemAlarmEvent,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4069');

const ADMIN_ID     = 'al_admin_100';
const ADMIN_SLUG   = 'al_admin_hundred';
const ADMIN2_ID    = 'al_admin_200';
const ADMIN2_SLUG  = 'al_admin_twohundred';
const MEMBER_ID    = 'al_member_100';
const MEMBER_SLUG  = 'al_member_hundred';

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookieFor(memberId: string, role: 'admin' | 'member' = 'admin'): string {
  return `__Host-footbag_session=${createTestSessionJwt(role === 'admin' ? { memberId, role: 'admin' } : { memberId })}`;
}

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

interface AlarmRow {
  status: string;
  acknowledged_by_member_id: string | null;
  acknowledged_at: string | null;
  acknowledgment_note: string | null;
}

function alarmRow(id: string): AlarmRow {
  return withDb((db) => db.prepare(`
    SELECT status, acknowledged_by_member_id, acknowledged_at, acknowledgment_note
    FROM system_alarm_events WHERE id = ?
  `).get(id) as AlarmRow);
}

function acknowledgeAudits(): Array<{ actor_member_id: string | null; reason_text: string | null; entity_id: string }> {
  return withDb((db) => db.prepare(`
    SELECT actor_member_id, reason_text, entity_id
    FROM audit_entries WHERE action_type = 'alarm.acknowledged'
  `).all() as Array<{ actor_member_id: string | null; reason_text: string | null; entity_id: string }>);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID,   slug: ADMIN_SLUG,   display_name: 'Alarm Admin',  real_name: 'Alarm Admin',  login_email: 'alarm-admin@example.com',  is_admin: 1 });
  insertMember(db, { id: ADMIN2_ID,  slug: ADMIN2_SLUG,  display_name: 'Second Admin', real_name: 'Second Admin', login_email: 'alarm-admin2@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID,  slug: MEMBER_SLUG,  display_name: 'Alarm Member', real_name: 'Alarm Member', login_email: 'alarm-member@example.com' });
  db.exec(`DROP TRIGGER IF EXISTS trg_audit_no_update; DROP TRIGGER IF EXISTS trg_audit_no_delete;`);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => {
    db.prepare('DELETE FROM system_alarm_events').run();
    db.prepare('DELETE FROM audit_entries').run();
  });
});

describe('GET /admin/alarms', () => {
  it('unauthenticated visitors are sent to log in', async () => {
    const res = await request(createApp()).get('/admin/alarms');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('a signed-in member who is not an administrator is refused', async () => {
    const res = await request(createApp()).get('/admin/alarms').set('Cookie', cookieFor(MEMBER_ID, 'member'));
    expect(res.status).toBe(403);
  });

  it('says so plainly when nothing has been reported', async () => {
    const res = await request(createApp()).get('/admin/alarms').set('Cookie', cookieFor(ADMIN_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('No alarms have been recorded.');
  });

  it('lists an alarm with its severity, state and the reason given, and offers the acknowledge control', async () => {
    const id = withDb((db) => insertSystemAlarmEvent(db, {
      alarm_type: 'footbag-prod-outbox-backlog',
      severity: 'critical',
      status: 'active',
      details_json: JSON.stringify({ reason: 'Threshold crossed: OutboxDepth > 100' }),
    }));
    const res = await request(createApp()).get('/admin/alarms').set('Cookie', cookieFor(ADMIN_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Footbag prod outbox backlog');
    expect(res.text).toContain('Critical');
    expect(res.text).toContain('Active');
    expect(res.text).toContain('Threshold crossed: OutboxDepth &gt; 100');
    expect(res.text).toContain(`action="/admin/alarms/${id}/acknowledge"`);
  });

  it('offers no acknowledge control on an alarm that has already been taken or has cleared', async () => {
    const acked = withDb((db) => insertSystemAlarmEvent(db, {
      alarm_type: 'footbag-acked', status: 'acknowledged',
      acknowledged_by_member_id: ADMIN_ID,
      acknowledged_at: '2026-01-02T03:04:05.000Z',
      acknowledgment_note: 'Raised with the mail provider.',
    }));
    const cleared = withDb((db) => insertSystemAlarmEvent(db, {
      alarm_type: 'footbag-cleared', status: 'cleared', cleared_at: '2026-01-02T04:00:00.000Z',
    }));
    const res = await request(createApp()).get('/admin/alarms').set('Cookie', cookieFor(ADMIN_ID));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(`action="/admin/alarms/${acked}/acknowledge"`);
    expect(res.text).not.toContain(`action="/admin/alarms/${cleared}/acknowledge"`);
    expect(res.text).toContain('Acknowledged by Alarm Admin');
    expect(res.text).toContain('Raised with the mail provider.');
  });
});

// Acknowledging is reachable only from a rendered row, so an active alarm that
// falls off the end of the list is counted by the dashboard badge and cannot be
// acted on at all.
describe('reaching alarms past the first page', () => {
  it('offers a way forward and the older active alarm can still be acknowledged there', async () => {
    const oldest = withDb((db) => insertSystemAlarmEvent(db, {
      alarm_type: 'footbag-oldest', status: 'active',
      raised_at: '2026-01-01T00:00:00.000Z',
    }));
    withDb((db) => {
      for (let i = 0; i < 100; i += 1) {
        insertSystemAlarmEvent(db, {
          alarm_type: `footbag-filler-${i}`, status: 'cleared',
          raised_at: `2026-02-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
          cleared_at: '2026-03-01T00:00:00.000Z',
        });
      }
    });

    const first = await request(createApp()).get('/admin/alarms').set('Cookie', cookieFor(ADMIN_ID));
    expect(first.status).toBe(200);
    expect(first.text).not.toContain(`action="/admin/alarms/${oldest}/acknowledge"`);
    expect(first.text).toContain('>Next</a>');

    const second = await request(createApp()).get('/admin/alarms?page=2').set('Cookie', cookieFor(ADMIN_ID));
    expect(second.status).toBe(200);
    expect(second.text).toContain(`action="/admin/alarms/${oldest}/acknowledge"`);
  });
});

describe('POST /admin/alarms/:id/acknowledge', () => {
  it('records who acknowledged it, when, and the note, and appends one audit entry', async () => {
    const id = withDb((db) => insertSystemAlarmEvent(db, { alarm_type: 'footbag-ack-me', status: 'active' }));

    const res = await request(createApp())
      .post(`/admin/alarms/${id}/acknowledge`)
      .set('Cookie', cookieFor(ADMIN_ID))
      .type('form')
      .send({ note: 'Restarted the worker.' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/alarms');

    const row = alarmRow(id);
    expect(row.status).toBe('acknowledged');
    expect(row.acknowledged_by_member_id).toBe(ADMIN_ID);
    expect(row.acknowledged_at).not.toBeNull();
    expect(row.acknowledgment_note).toBe('Restarted the worker.');

    const audits = acknowledgeAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0].actor_member_id).toBe(ADMIN_ID);
    expect(audits[0].entity_id).toBe(id);
    expect(audits[0].reason_text).toBe('Restarted the worker.');
  });

  it('accepts an acknowledgment with no note', async () => {
    const id = withDb((db) => insertSystemAlarmEvent(db, { alarm_type: 'footbag-no-note', status: 'active' }));
    const res = await request(createApp())
      .post(`/admin/alarms/${id}/acknowledge`)
      .set('Cookie', cookieFor(ADMIN_ID))
      .type('form')
      .send({ note: '   ' });
    expect(res.status).toBe(303);
    const row = alarmRow(id);
    expect(row.status).toBe('acknowledged');
    expect(row.acknowledgment_note).toBeNull();
  });

  it("a second acknowledgment leaves the first administrator's name and note in place", async () => {
    const id = withDb((db) => insertSystemAlarmEvent(db, { alarm_type: 'footbag-once', status: 'active' }));
    await request(createApp())
      .post(`/admin/alarms/${id}/acknowledge`)
      .set('Cookie', cookieFor(ADMIN_ID))
      .type('form')
      .send({ note: 'First response.' });

    const res = await request(createApp())
      .post(`/admin/alarms/${id}/acknowledge`)
      .set('Cookie', cookieFor(ADMIN2_ID))
      .type('form')
      .send({ note: 'Second response.' });
    expect(res.status).toBe(303);

    const row = alarmRow(id);
    expect(row.acknowledged_by_member_id).toBe(ADMIN_ID);
    expect(row.acknowledgment_note).toBe('First response.');
    expect(acknowledgeAudits()).toHaveLength(1);
  });

  // The banner is the only thing the second administrator sees. Telling them the
  // alarm is theirs when the first administrator's name and note are what stand
  // sends them away believing an incident is handled by them.
  it('tells the second administrator plainly that nothing was changed', async () => {
    const id = withDb((db) => insertSystemAlarmEvent(db, { alarm_type: 'footbag-banner', status: 'active' }));
    await request(createApp())
      .post(`/admin/alarms/${id}/acknowledge`)
      .set('Cookie', cookieFor(ADMIN_ID))
      .type('form')
      .send({ note: 'First response.' });

    const second = await request(createApp())
      .post(`/admin/alarms/${id}/acknowledge`)
      .set('Cookie', cookieFor(ADMIN2_ID))
      .type('form')
      .send({ note: 'Second response.' });
    const flashCookie = ((second.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0])
      .join('; ');
    const page = await request(createApp())
      .get('/admin/alarms')
      .set('Cookie', [cookieFor(ADMIN2_ID), flashCookie].filter(Boolean).join('; '));

    expect(page.text).toContain('That alarm was already handled. Nothing was changed.');
    expect(page.text).not.toContain('Alarm acknowledged.');
  });

  it('an unknown alarm id is not found, and writes nothing', async () => {
    const res = await request(createApp())
      .post('/admin/alarms/alarm_does_not_exist/acknowledge')
      .set('Cookie', cookieFor(ADMIN_ID))
      .type('form')
      .send({ note: 'anything' });
    expect(res.status).toBe(404);
    expect(acknowledgeAudits()).toHaveLength(0);
  });

  it('a signed-in member who is not an administrator cannot acknowledge', async () => {
    const id = withDb((db) => insertSystemAlarmEvent(db, { alarm_type: 'footbag-guarded', status: 'active' }));
    const res = await request(createApp())
      .post(`/admin/alarms/${id}/acknowledge`)
      .set('Cookie', cookieFor(MEMBER_ID, 'member'))
      .type('form')
      .send({ note: 'let me in' });
    expect(res.status).toBe(403);
    expect(alarmRow(id).status).toBe('active');
    expect(acknowledgeAudits()).toHaveLength(0);
  });

  it('an oversized note is stored truncated rather than rejected, so the acknowledgment still lands', async () => {
    const id = withDb((db) => insertSystemAlarmEvent(db, { alarm_type: 'footbag-longnote', status: 'active' }));
    const res = await request(createApp())
      .post(`/admin/alarms/${id}/acknowledge`)
      .set('Cookie', cookieFor(ADMIN_ID))
      .type('form')
      .send({ note: 'x'.repeat(2000) });
    expect(res.status).toBe(303);
    const row = alarmRow(id);
    expect(row.status).toBe('acknowledged');
    expect(row.acknowledgment_note).toHaveLength(500);
  });
});
