/**
 * The administrator's event record: finding any event, correcting what its
 * organizers cannot (any field, the sanction once it has opened, a division
 * with confirmed entries, the description), and canceling the event or one
 * registration with the organizer's own notices.
 *
 * The contract: only an administrator reaches it. Every correction takes a
 * reason, previews without writing, writes nothing when nothing changes,
 * records each changed value before and after against the administrator, and
 * emails the event's current organizers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { isoDaysFromNow } from '../fixtures/clock';
import {
  createMemberAtTier,
  completeOnboarding,
  createTestSessionJwt,
  insertMember,
  insertEvent,
  insertEventOrganizer,
  insertDiscipline,
  insertRegistration,
  insertRegistrationDisciplineSelection,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4982');

let createApp: Awaited<ReturnType<typeof importApp>>;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function cookieFor(memberId: string, admin = false): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, ...(admin ? { role: 'admin' as const } : {}) })}`;
}

function makeMember(id: string): string {
  return withDb((db) => {
    createMemberAtTier(db, {
      id, slug: id.replace(/-/g, '_'), tier: 'tier1',
      memberOverrides: { display_name: `Member ${id}`, login_email: `${id}@example.com` },
    });
    completeOnboarding(db, id);
    return id;
  });
}

function makeAdmin(id: string): string {
  return withDb((db) => {
    insertMember(db, { id, slug: id.replace(/-/g, '_'), display_name: `Admin ${id}`, login_email: `${id}@example.com`, is_admin: 1 });
    return id;
  });
}

interface SeededEvent { id: string; record: string; singles: string }

function seedEvent(o: { title?: string; description?: string; status?: 'reg_open' | 'draft' } = {}): SeededEvent {
  return withDb((db) => {
    const start = isoDaysFromNow(40).slice(0, 10);
    const id = insertEvent(db, {
      title: o.title ?? `Admin Test ${Math.random().toString(36).slice(2, 8)}`,
      description: o.description ?? 'A friendly jam.',
      status: o.status ?? 'reg_open',
      start_date: start,
      end_date: start,
      city: 'Boulder',
      country: 'United States',
    });
    insertEventOrganizer(db, id, olive);
    const singles = insertDiscipline(db, id, { name: 'Open Singles Footbag Net', discipline_category: 'net', game_id: 'game_footbag_net', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', sort_order: 1 });
    return { id, record: `/admin/events/${id}`, singles };
  });
}

function register(ev: SeededEvent, memberId: string): string {
  return withDb((db) => {
    const reg = insertRegistration(db, ev.id, memberId, { status: 'confirmed' });
    insertRegistrationDisciplineSelection(db, reg, ev.singles);
    return reg;
  });
}

function adminPost(path: string, body: Record<string, string>) {
  return request(createApp()).post(path).set('Cookie', cookieFor(adam, true)).type('form').send(body);
}

function one<T>(sql: string, ...params: unknown[]): T {
  return withDb((db) => db.prepare(sql).get(...params) as T);
}

function count(sql: string, ...params: unknown[]): number {
  return one<{ c: number }>(sql, ...params).c;
}

function mailTo(template: string, memberId: string): number {
  return count('SELECT COUNT(*) c FROM outbox_emails WHERE template_key = ? AND recipient_member_id = ?', template, memberId);
}

/** The details form as the record page posts it, from the event's current values. */
function detailsBody(o: Partial<Record<string, string>> = {}): Record<string, string> {
  const start = isoDaysFromNow(40).slice(0, 10);
  return {
    title: 'Placeholder', description: 'A friendly jam.', start_date: start, end_date: start,
    city: 'Boulder', region: '', country: 'United States', registration_deadline: '',
    tshirt_size_collected: '0', attendee_registration_open: '0', competitor_fee: '', spectator_fee: '',
    sanction_state: 'none', reason: 'Organizer asked by email',
    ...o,
  };
}

let olive: string;
let ada: string;
let adam: string;

beforeAll(async () => {
  createTestDb(dbPath).close();
  olive = makeMember('ar-olive');
  ada = makeMember('ar-ada');
  adam = makeAdmin('ar-adam');
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('reaching the record', () => {
  // Defect caught: a member who is not an administrator opens another
  // organizer's event record, or the lookup misses an event by its title.
  it('is for administrators only, and the lookup finds an event by part of its title', async () => {
    const ev = seedEvent({ title: 'Lookup Target Open' });
    const asMember = await request(createApp()).get(ev.record).set('Cookie', cookieFor(olive));
    expect(asMember.status).toBe(403);
    const found = await request(createApp()).get('/admin/events?q=Target%20Op').set('Cookie', cookieFor(adam, true));
    expect(found.status).toBe(200);
    expect(found.text).toContain(`href="${ev.record}"`);
    expect((await request(createApp()).get('/admin/events/no-such-event').set('Cookie', cookieFor(adam, true))).status).toBe(404);
  });
});

describe('correcting the event', () => {
  // Defect caught: the preview writes, the confirm loses the before value or
  // the reason, the organizers are not told, or a no-op confirm records a
  // correction that did not happen.
  it('previews without writing, then records each changed value and emails the organizers', async () => {
    const ev = seedEvent({ title: 'Misspeled Cup' });
    const preview = await adminPost(`${ev.record}/details`, detailsBody({ title: 'Misspelled Cup' }));
    expect(preview.status).toBe(200);
    expect(preview.text).toContain('Misspeled Cup');
    expect(one<{ title: string }>('SELECT title FROM events WHERE id = ?', ev.id).title).toBe('Misspeled Cup');

    const done = await adminPost(`${ev.record}/details/confirm`, detailsBody({ title: 'Misspelled Cup' }));
    expect(done.status).toBe(303);
    expect(one<{ title: string }>('SELECT title FROM events WHERE id = ?', ev.id).title).toBe('Misspelled Cup');
    const audit = one<{ actor_type: string; actor_member_id: string; reason_text: string; metadata_json: string }>(
      "SELECT actor_type, actor_member_id, reason_text, metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'event.corrected'", ev.id);
    expect(audit.actor_type).toBe('admin');
    expect(audit.actor_member_id).toBe(adam);
    expect(audit.reason_text).toBe('Organizer asked by email');
    expect(JSON.parse(audit.metadata_json).changes).toEqual({ title: { before: 'Misspeled Cup', after: 'Misspelled Cup' } });
    expect(mailTo('event_record_corrected', olive)).toBe(1);

    await adminPost(`${ev.record}/details/confirm`, detailsBody({ title: 'Misspelled Cup' }));
    expect(count("SELECT COUNT(*) c FROM audit_entries WHERE entity_id = ? AND action_type = 'event.corrected'", ev.id)).toBe(1);
    expect(mailTo('event_record_corrected', olive)).toBe(1);
  });

  // Defect caught: a correction is written with no reason.
  it('refuses a correction with no reason', async () => {
    const ev = seedEvent({ title: 'No Reason Jam' });
    const res = await adminPost(`${ev.record}/details/confirm`, detailsBody({ title: 'Renamed Jam', reason: '' }));
    expect(res.status).toBe(422);
    expect(one<{ title: string }>('SELECT title FROM events WHERE id = ?', ev.id).title).toBe('No Reason Jam');
  });

  // Defect caught: granting sanction to an open free event leaves its fee
  // unpayable, or the grant is not recorded as the sanction's change.
  it('grants sanction to an open free event and enables payment for its fee', async () => {
    const ev = seedEvent({ title: 'Grant Me Open' });
    await adminPost(`${ev.record}/details/confirm`, detailsBody({
      title: 'Grant Me Open', sanction_state: 'approved', competitor_fee: '25', reason: 'Board granted by vote',
    }));
    expect(one<{ sanction_status: string; payment_enabled: number; competitor_fee_cents: number }>(
      'SELECT sanction_status, payment_enabled, competitor_fee_cents FROM events WHERE id = ?', ev.id))
      .toEqual({ sanction_status: 'approved', payment_enabled: 1, competitor_fee_cents: 2500 });
  });

  // Defect caught: the description clear leaves text on the event page, or
  // the organizers are not told it went.
  it('clears the description with a reason and tells the organizers', async () => {
    const ev = seedEvent({ description: 'Harmful words here' });
    expect((await adminPost(`${ev.record}/description/clear`, { reason: 'Abusive content' })).status).toBe(200);
    expect(one<{ description: string }>('SELECT description FROM events WHERE id = ?', ev.id).description).toBe('Harmful words here');
    await adminPost(`${ev.record}/description/clear/confirm`, { reason: 'Abusive content' });
    expect(one<{ description: string }>('SELECT description FROM events WHERE id = ?', ev.id).description).toBe('');
    const audit = one<{ metadata_json: string }>(
      "SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'event.description_cleared'", ev.id);
    expect(JSON.parse(audit.metadata_json).changes.description).toEqual({ before: 'Harmful words here', after: '' });
    expect(mailTo('event_record_corrected', olive)).toBeGreaterThanOrEqual(1);
  });
});

describe('correcting divisions an organizer can no longer change', () => {
  // Defect caught: a division with a confirmed entry stays wrong forever, or
  // its correction drops the entries it holds.
  it('corrects the parts of a division with a confirmed entry and keeps the entry', async () => {
    const ev = seedEvent();
    const reg = register(ev, ada);
    expect((await request(createApp()).get(`${ev.record}/divisions/${ev.singles}`).set('Cookie', cookieFor(adam, true))).status).toBe(200);
    await adminPost(`${ev.record}/divisions/${ev.singles}/confirm`, {
      team_type: 'singles', gender: 'open', division_class: 'intermediate', offers_prize_money: '0', reason: 'Wrong class at creation',
    });
    expect(one<{ division_class: string; name: string }>('SELECT division_class, name FROM event_disciplines WHERE id = ?', ev.singles))
      .toEqual({ division_class: 'intermediate', name: 'Intermediate Singles Footbag Net' });
    expect(count('SELECT COUNT(*) c FROM registration_discipline_selections WHERE registration_id = ?', reg)).toBe(1);
  });

  // Defect caught: removing a division with confirmed entries leaves orphaned
  // entries, or the audit row does not name what was removed.
  it('removes a division with its entries and names each one in the audit row', async () => {
    const ev = seedEvent();
    const reg = register(ev, ada);
    await adminPost(`${ev.record}/divisions/${ev.singles}/remove/confirm`, { reason: 'Division canceled by the organizer' });
    expect(count('SELECT COUNT(*) c FROM event_disciplines WHERE id = ?', ev.singles)).toBe(0);
    expect(count('SELECT COUNT(*) c FROM registration_discipline_selections WHERE registration_id = ?', reg)).toBe(0);
    const audit = one<{ metadata_json: string }>(
      "SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'event.division_corrected'", ev.id);
    expect(JSON.parse(audit.metadata_json).entries).toEqual([{ registration_id: reg, member_id: ada, status: 'confirmed' }]);
  });
});

describe('canceling as an administrator', () => {
  // Defect caught: an administrator cancels with no reason, or the
  // cancellation is recorded as the organizer's own, or registrants are not told.
  it('cancels the event with the reason, as the administrator, telling registrants and organizers', async () => {
    const ev = seedEvent();
    register(ev, ada);
    const noReason = await adminPost(`${ev.record}/cancel`, { reason: '' });
    expect(noReason.status).toBe(422);
    const step = await adminPost(`${ev.record}/cancel`, { reason: 'No organizer left to run it' });
    expect(step.status).toBe(200);
    expect(one<{ status: string }>('SELECT status FROM events WHERE id = ?', ev.id).status).toBe('reg_open');
    await adminPost(`${ev.record}/cancel`, { reason: 'No organizer left to run it', confirmed: '1' });
    expect(one<{ status: string; canceled_by_member_id: string }>('SELECT status, canceled_by_member_id FROM events WHERE id = ?', ev.id))
      .toEqual({ status: 'canceled', canceled_by_member_id: adam });
    expect(one<{ actor_type: string }>("SELECT actor_type FROM audit_entries WHERE entity_id = ? AND action_type = 'event.canceled'", ev.id).actor_type).toBe('admin');
    expect(mailTo('event_canceled', ada)).toBe(1);
    expect(mailTo('event_canceled', olive)).toBeGreaterThanOrEqual(1);
  });

  // Defect caught: an administrator's cancellation of a registration is not
  // recorded against them, or the member is not told.
  it('cancels one registration with the reason and emails the member', async () => {
    const ev = seedEvent();
    const reg = register(ev, ada);
    await adminPost(`${ev.record}/registrations/${reg}/cancel`, { reason: 'Duplicate registration', confirmed: '1' });
    expect(one<{ status: string; updated_by: string; cancel_reason: string }>(
      'SELECT status, updated_by, cancel_reason FROM registrations WHERE id = ?', reg))
      .toEqual({ status: 'canceled', updated_by: adam, cancel_reason: 'Duplicate registration' });
    expect(mailTo('event_registration_canceled', ada)).toBe(1);
  });
});
