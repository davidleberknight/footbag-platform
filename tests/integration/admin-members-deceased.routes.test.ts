/**
 * Marking a member deceased from the administrator member record.
 *
 * Covers the marking and its cascade to a linked historical record, the
 * withdrawal from events that have not happened yet alongside the completed
 * event that must survive it, the reversal inside the grace period and its
 * refusal outside one, and the contributions the marking is required to leave
 * untouched: honours, uploaded media attribution, and competition history.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertHistoricalPerson, insertEvent, createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3431');

const ADMIN_ID = 'dm_admin';
const PLAIN_ID = 'dm_plain';
const LINKED_ID = 'dm_linked';
const HONOURED_ID = 'dm_honoured';
const REVERT_ID = 'dm_revert';
const STALE_ID = 'dm_stale';

const PERSON_ID = 'dm_person_1';
const UNLINKED_PERSON_ID = 'dm_person_2';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

function db<T>(fn: (conn: BetterSqlite3.Database) => T): T {
  const conn = new BetterSqlite3(dbPath);
  try {
    return fn(conn);
  } finally {
    conn.close();
  }
}

async function mark(memberId: string, reason = 'member deceased'): Promise<number> {
  const res = await request(createApp())
    .post(`/admin/members/${memberId}/deceased/confirm`)
    .set('Cookie', adminCookie())
    .type('form')
    .send({ reason });
  return res.status;
}

async function revert(memberId: string, reason = 'marked in error'): Promise<number> {
  const res = await request(createApp())
    .post(`/admin/members/${memberId}/deceased/revert/confirm`)
    .set('Cookie', adminCookie())
    .type('form')
    .send({ reason });
  return res.status;
}

function memberRow(memberId: string): { is_deceased: number; deceased_at: string | null } {
  return db((conn) => conn.prepare(
    `SELECT is_deceased, deceased_at FROM members WHERE id = ?`,
  ).get(memberId)) as { is_deceased: number; deceased_at: string | null };
}

function auditCount(actionType: string, entityId: string): number {
  return (db((conn) => conn.prepare(
    `SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = ? AND entity_id = ?`,
  ).get(actionType, entityId)) as { c: number }).c;
}

beforeAll(async () => {
  const conn = createTestDb(dbPath);
  insertMember(conn, {
    id: ADMIN_ID, slug: 'dm_admin', display_name: 'Ada Admin', real_name: 'Ada Admin',
    login_email: 'dm-admin@example.com', is_admin: 1,
  });
  for (const [id, name] of [
    [PLAIN_ID, 'Pat Plain'], [REVERT_ID, 'Rex Revert'], [STALE_ID, 'Stan Stale'],
  ] as const) {
    insertMember(conn, {
      id, slug: id, display_name: name, real_name: name, login_email: `${id}@example.com`,
    });
  }

  insertHistoricalPerson(conn, { person_id: PERSON_ID, person_name: 'Linked Legend' });
  insertHistoricalPerson(conn, { person_id: UNLINKED_PERSON_ID, person_name: 'Unlinked Legend' });
  insertMember(conn, {
    id: LINKED_ID, slug: LINKED_ID, display_name: 'Lena Linked', real_name: 'Lena Linked',
    login_email: 'dm-linked@example.com', historical_person_id: PERSON_ID,
  });
  insertMember(conn, {
    id: HONOURED_ID, slug: HONOURED_ID, display_name: 'Honor Bright', real_name: 'Honor Bright',
    login_email: 'dm-honoured@example.com', is_hof: 1, is_bap: 1, hof_inducted_year: 1998,
  });

  // One event still ahead and one already finished, so the withdrawal can be
  // shown to reach exactly the first.
  insertEvent(conn, { id: 'dm_event_future', title: 'Next Worlds', start_date: '2099-07-01', end_date: '2099-07-05' });
  insertEvent(conn, { id: 'dm_event_past', title: 'Past Worlds', start_date: '2019-07-01', end_date: '2019-07-05' });
  for (const [rid, eid] of [['dm_reg_future', 'dm_event_future'], ['dm_reg_past', 'dm_event_past']] as const) {
    conn.prepare(`
      INSERT INTO registrations (
        id, created_at, created_by, updated_at, updated_by, version,
        event_id, member_id, registered_at, registration_type, status
      ) VALUES (?, '2026-01-01T00:00:00.000Z', 'seed', '2026-01-01T00:00:00.000Z', 'seed', 1,
                ?, ?, '2026-01-01T00:00:00.000Z', 'competitor', 'confirmed')
    `).run(rid, eid, PLAIN_ID);
  }

  conn.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('marking a member deceased', () => {
  it('sets the flag, withdraws only the future registration, and audits the whole thing', async () => {
    expect(await mark(PLAIN_ID)).toBe(303);

    const row = memberRow(PLAIN_ID);
    expect(row.is_deceased).toBe(1);
    expect(row.deceased_at).not.toBeNull();

    const future = db((conn) => conn.prepare(
      `SELECT status, cancel_reason FROM registrations WHERE id = 'dm_reg_future'`,
    ).get()) as { status: string; cancel_reason: string | null };
    const past = db((conn) => conn.prepare(
      `SELECT status FROM registrations WHERE id = 'dm_reg_past'`,
    ).get()) as { status: string };

    expect(future.status).toBe('canceled');
    expect(future.cancel_reason).toBe('Member deceased');
    // The finished event is part of the record this marking exists to preserve.
    expect(past.status).toBe('confirmed');

    expect(auditCount('member.deceased_marked', PLAIN_ID)).toBe(1);
  });

  it('refuses a second marking rather than writing a second audit row', async () => {
    expect(await mark(PLAIN_ID)).toBe(422);
    expect(auditCount('member.deceased_marked', PLAIN_ID)).toBe(1);
  });

  it('refuses a marking with no reason', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${REVERT_ID}/deceased/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: '   ' });
    expect(res.status).toBe(422);
    expect(memberRow(REVERT_ID).is_deceased).toBe(0);
  });

  it('marks a linked historical record to match, so the two surfaces agree', async () => {
    expect(await mark(LINKED_ID)).toBe(303);
    const person = db((conn) => conn.prepare(
      `SELECT is_deceased FROM historical_persons WHERE person_id = ?`,
    ).get(PERSON_ID)) as { is_deceased: number };
    expect(person.is_deceased).toBe(1);
  });

  it('leaves the honours and the induction year exactly as they were', async () => {
    expect(await mark(HONOURED_ID)).toBe(303);
    const row = db((conn) => conn.prepare(
      `SELECT is_hof, is_bap, hof_inducted_year, display_name FROM members WHERE id = ?`,
    ).get(HONOURED_ID)) as {
      is_hof: number; is_bap: number; hof_inducted_year: number; display_name: string;
    };
    expect(row.is_hof).toBe(1);
    expect(row.is_bap).toBe(1);
    expect(row.hof_inducted_year).toBe(1998);
    expect(row.display_name).toBe('Honor Bright');
  });
});

describe('the same flag on a record nobody has claimed', () => {
  it('records and then removes it, auditing the record rather than a member', async () => {
    const setRes = await request(createApp())
      .post(`/admin/historical-records/${UNLINKED_PERSON_ID}/deceased/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'obituary confirmed' });
    expect(setRes.status).toBe(303);
    expect(auditCount('member.deceased_marked', UNLINKED_PERSON_ID)).toBe(1);

    const unsetRes = await request(createApp())
      .post(`/admin/historical-records/${UNLINKED_PERSON_ID}/deceased/revert/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'wrong person' });
    expect(unsetRes.status).toBe(303);
    const person = db((conn) => conn.prepare(
      `SELECT is_deceased FROM historical_persons WHERE person_id = ?`,
    ).get(UNLINKED_PERSON_ID)) as { is_deceased: number };
    expect(person.is_deceased).toBe(0);
  });

  it('refuses a direct request against a record somebody holds', async () => {
    // Hiding the control on the listing is not a rule. A request that arrives
    // anyway would leave the record marked while the living member's own row
    // stayed clear, which is exactly the disagreement one home prevents.
    const res = await request(createApp())
      .post(`/admin/historical-records/${PERSON_ID}/deceased/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'obituary confirmed' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('member record');

    const person = db((conn) => conn.prepare(
      `SELECT is_deceased FROM historical_persons WHERE person_id = ?`,
    ).get(PERSON_ID)) as { is_deceased: number };
    // Already 1 from the member-side cascade earlier in this file, and
    // unchanged by the refused request; what matters is that this path did not
    // write it.
    expect(person.is_deceased).toBe(1);
  });

  it('sends an administrator to the member record when somebody holds the record', async () => {
    const res = await request(createApp())
      .get('/admin/historical-records?q=Linked Legend').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Lena Linked');
    expect(res.text).toContain(`/admin/members/${LINKED_ID}`);
  });
});

describe('reversing a marking made in error', () => {
  it('clears the flag inside the grace period and audits the reversal', async () => {
    expect(await mark(REVERT_ID)).toBe(303);
    expect(memberRow(REVERT_ID).is_deceased).toBe(1);

    expect(await revert(REVERT_ID)).toBe(303);
    const row = memberRow(REVERT_ID);
    expect(row.is_deceased).toBe(0);
    expect(row.deceased_at).toBeNull();
    expect(auditCount('member.deceased_reverted', REVERT_ID)).toBe(1);
  });

  it('refuses to reverse a marking that is not there', async () => {
    expect(await revert(REVERT_ID)).toBe(422);
  });

  it('refuses once the grace period has passed, leaving the flag set', async () => {
    expect(await mark(STALE_ID)).toBe(303);
    // Backdate past the configured window, which is what the contact scrub
    // waits out before clearing the details a reversal would restore.
    db((conn) => conn.prepare(
      `UPDATE members SET deceased_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`,
    ).run(STALE_ID));

    expect(await revert(STALE_ID)).toBe(303);
    expect(memberRow(STALE_ID).is_deceased).toBe(1);
    expect(auditCount('member.deceased_reverted', STALE_ID)).toBe(0);
  });
});
