/**
 * An event's organizers running it once registration opens: canceling the
 * event or one registration, closing registration for good, deleting an event
 * that never took a registration, and the participant list, its CSV export,
 * the registration summary, the check-in sheet and participant email.
 *
 * The contract: only a current organizer reaches any of it (anyone else gets
 * not-found). Canceling takes a reason, which the people it affects are sent;
 * the event's confirmed registrations stay as the record of who entered, its
 * pending ones end, and the event leaves the public pages. Closing moves the
 * event from open to closed and nobody registers after. An event is deleted
 * only if it never took a registration. The export, the sheet and the email
 * reach confirmed participants only; a participant's email shows only when
 * they made it visible to members; one participant email goes out per event in
 * any 24 hours, and the same form submitted twice sends once.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { flashCookieOf } from '../fixtures/flashCookie';
import { isoDaysFromNow } from '../fixtures/clock';
import {
  createMemberAtTier,
  completeOnboarding,
  createTestSessionJwt,
  insertEvent,
  insertEventOrganizer,
  insertDiscipline,
  insertRegistration,
  insertRegistrationDisciplineSelection,
  insertPayment,
  insertEmailArchive,
  insertWorkQueueItem,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4981');

let createApp: Awaited<ReturnType<typeof importApp>>;
let eventServiceModule: typeof import('../../src/services/eventService');

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function makeMember(id: string, o: { emailVisible?: boolean; deceased?: boolean; name?: string } = {}): string {
  return withDb((db) => {
    createMemberAtTier(db, {
      id, slug: id.replace(/-/g, '_'), tier: 'tier1',
      memberOverrides: {
        display_name: o.name ?? `Member ${id}`,
        login_email: `${id}@example.com`,
        email_visibility: o.emailVisible ? 'members' : 'private',
        ...(o.deceased ? { is_deceased: 1 } : {}),
      },
    });
    completeOnboarding(db, id);
    return id;
  });
}

const day = (iso: string): string => iso.slice(0, 10);

interface SeededEvent { id: string; key: string; base: string; singles: string; prize: string }

function seedEvent(o: {
  status?: 'draft' | 'pending_approval' | 'reg_open' | 'closed' | 'completed';
  organizers?: string[];
  competitor_fee_cents?: number;
  is_tshirt_size_collected?: 0 | 1;
  title?: string;
} = {}): SeededEvent {
  return withDb((db) => {
    const start = day(isoDaysFromNow(30));
    const id = insertEvent(db, {
      title: o.title ?? `Run Test ${Math.random().toString(36).slice(2, 8)}`,
      status: o.status ?? 'reg_open',
      start_date: start,
      end_date: start,
      is_tshirt_size_collected: o.is_tshirt_size_collected ?? 0,
      ...(o.competitor_fee_cents ? { competitor_fee_cents: o.competitor_fee_cents, payment_enabled: 1, sanction_status: 'approved' } : {}),
    });
    for (const m of o.organizers ?? [olive]) insertEventOrganizer(db, id, m);
    const singles = insertDiscipline(db, id, { name: 'Open Singles Footbag Net', discipline_category: 'net', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', sort_order: 1 });
    const prize = insertDiscipline(db, id, { name: 'Open Singles Routines', discipline_category: 'freestyle', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', offers_prize_money: 1, sort_order: 2 });
    const tag = (db.prepare('SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?').get(id) as { tag_normalized: string }).tag_normalized;
    return { id, key: tag.slice(1), base: `/events/${tag.slice(1)}`, singles, prize };
  });
}

function register(ev: SeededEvent, memberId: string, o: {
  status?: 'pending' | 'confirmed' | 'canceled'; division?: string; amateur?: 0 | 1; paid?: 'succeeded' | 'pending';
  partner?: string; tshirt?: string; registeredAt?: string;
} = {}): string {
  return withDb((db) => {
    const paymentId = o.paid
      ? insertPayment(db, { member_id: memberId, payment_type: 'event_registration', amount_cents: 2500, status: o.paid })
      : null;
    const reg = insertRegistration(db, ev.id, memberId, {
      status: o.status ?? 'confirmed', payment_id: paymentId, tshirt_size: o.tshirt ?? null,
      ...(o.registeredAt ? { registered_at: o.registeredAt } : {}),
    });
    insertRegistrationDisciplineSelection(db, reg, o.division ?? ev.singles, {
      enters_as_amateur: o.amateur ?? 0,
      partner_member_id: o.partner ?? null,
    });
    return reg;
  });
}

function post(memberId: string, path: string, body: Record<string, string> = {}) {
  return request(createApp()).post(path).set('Cookie', cookieFor(memberId)).type('form').send(body);
}

function get(memberId: string | null, path: string) {
  const r = request(createApp()).get(path);
  return memberId ? r.set('Cookie', cookieFor(memberId)) : r;
}

function landedOn(memberId: string, res: { headers: Record<string, string> }) {
  return request(createApp()).get(res.headers.location)
    .set('Cookie', [cookieFor(memberId), flashCookieOf(res as never)].filter(Boolean).join('; '));
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

function auditCount(eventId: string, action: string): number {
  return count('SELECT COUNT(*) c FROM audit_entries WHERE entity_id = ? AND action_type = ?', eventId, action);
}

let olive: string;   // organizes every event
let otto: string;    // organizes the events that name him too
let ada: string;
let max: string;
let wren: string;
let eve: string;     // never organizes anything
let gone: string;    // deceased

beforeAll(async () => {
  createTestDb(dbPath).close();
  olive = makeMember('om-olive');
  otto = makeMember('om-otto');
  ada = makeMember('om-ada', { emailVisible: true, name: 'Ada Ångström' });
  max = makeMember('om-max');
  wren = makeMember('om-wren', { name: '=HYPERLINK("x")' });
  eve = makeMember('om-eve');
  gone = makeMember('om-gone', { deceased: true });
  createApp = await importApp();
  eventServiceModule = await import('../../src/services/eventService');
});

afterAll(() => cleanupTestDb(dbPath));

describe('canceling an event', () => {
  // Defect caught: an event is canceled with no reason, or registrants are
  // never told, or the cancellation also wipes the confirmed registrations that
  // record who entered, or a pending checkout is left open on a dead event.
  it('asks for a reason, then cancels, ends pending registrations, and emails every registrant and organizer once', async () => {
    const ev = seedEvent({ organizers: [olive, otto] });
    const confirmedReg = register(ev, ada);
    const pendingReg = register(ev, max, { status: 'pending' });
    const canceledReg = register(ev, wren, { status: 'canceled' });

    const step = await post(olive, `${ev.base}/cancel`);
    expect(step.status).toBe(200);
    expect(step.text).toContain('name="reason"');
    expect(step.text).toContain('2 registered participants');

    const empty = await post(olive, `${ev.base}/cancel`, { confirmed: '1', reason: '   ' });
    expect(empty.status).toBe(422);
    expect(one<{ status: string }>('SELECT status FROM events WHERE id = ?', ev.id).status).toBe('reg_open');

    const done = await post(olive, `${ev.base}/cancel`, { confirmed: '1', reason: 'Venue flooded' });
    expect(done.status).toBe(303);
    const row = one<{ status: string; cancel_reason: string; canceled_by_member_id: string }>(
      'SELECT status, cancel_reason, canceled_by_member_id FROM events WHERE id = ?', ev.id);
    expect(row).toEqual({ status: 'canceled', cancel_reason: 'Venue flooded', canceled_by_member_id: olive });
    expect(one<{ status: string }>('SELECT status FROM registrations WHERE id = ?', confirmedReg).status).toBe('confirmed');
    expect(one<{ status: string; cancel_reason: string }>('SELECT status, cancel_reason FROM registrations WHERE id = ?', pendingReg))
      .toEqual({ status: 'canceled', cancel_reason: 'Event canceled' });
    expect(one<{ cancel_reason: string | null }>('SELECT cancel_reason FROM registrations WHERE id = ?', canceledReg).cancel_reason).toBeNull();

    for (const m of [ada, max, olive, otto]) expect(mailTo('event_canceled', m)).toBe(1);
    expect(mailTo('event_canceled', wren)).toBe(0);
    expect(auditCount(ev.id, 'event.canceled')).toBe(1);
    expect((await get(eve, ev.base)).status).toBe(404);

    // The same confirmation again is the first submit's success, with nothing new written.
    const again = await post(olive, `${ev.base}/cancel`, { confirmed: '1', reason: 'Venue flooded' });
    expect(again.status).toBe(303);
    expect((await landedOn(olive, again)).text).toContain('form-success-banner');
    expect(auditCount(ev.id, 'event.canceled')).toBe(1);
    expect(mailTo('event_canceled', ada)).toBe(1);

    // A different reason is not the same submit again: it changed nothing and says so.
    const changed = await post(olive, `${ev.base}/cancel`, { confirmed: '1', reason: 'Storm warning' });
    expect((await landedOn(olive, changed)).text).toContain('form-notice');
    expect(one<{ cancel_reason: string }>('SELECT cancel_reason FROM events WHERE id = ?', ev.id).cancel_reason).toBe('Venue flooded');
  });

  // Defect caught: an event canceled while awaiting its sanction decision
  // leaves the request sitting in the administrators' queue.
  it('closes the open sanction request of an event awaiting its decision', async () => {
    const ev = seedEvent({ status: 'pending_approval' });
    withDb((db) => insertWorkQueueItem(db, { id: 'wq-om-1', task_type: 'sanction_request', entity_type: 'event', entity_id: ev.id }));
    await post(olive, `${ev.base}/cancel`, { confirmed: '1', reason: 'Organizer moved abroad' });
    expect(one<{ status: string }>('SELECT status FROM work_queue_items WHERE id = ?', 'wq-om-1').status).toBe('dismissed');
  });

  // Defect caught: a completed event, which is a permanent record, is canceled
  // by an organizer; or a member who does not organize it can cancel it.
  it('refuses a completed event, and is not-found for a member who does not organize it', async () => {
    const done = seedEvent({ status: 'completed' });
    await post(olive, `${done.base}/cancel`, { confirmed: '1', reason: 'Oops' });
    expect(one<{ status: string }>('SELECT status FROM events WHERE id = ?', done.id).status).toBe('completed');

    const ev = seedEvent();
    expect((await post(eve, `${ev.base}/cancel`, { confirmed: '1', reason: 'Not mine' })).status).toBe(404);
    expect(one<{ status: string }>('SELECT status FROM events WHERE id = ?', ev.id).status).toBe('reg_open');
  });
});

describe('canceling one registration', () => {
  // Defect caught: an organizer cancels a registration without telling the
  // member why, or the actor and reason are lost from the record.
  it('cancels with the reason, records the organizer, and emails the member once', async () => {
    const ev = seedEvent({ organizers: [olive, otto] });
    const reg = register(ev, ada);
    const path = `${ev.base}/registrations/${reg}/cancel`;
    const step = await post(olive, path);
    expect(step.status).toBe(200);
    expect(step.text).toContain('name="reason"');

    const res = await post(olive, path, { confirmed: '1', reason: 'Not eligible for this division' });
    expect(res.status).toBe(303);
    expect(one<{ status: string; cancel_reason: string; updated_by: string }>(
      'SELECT status, cancel_reason, updated_by FROM registrations WHERE id = ?', reg))
      .toEqual({ status: 'canceled', cancel_reason: 'Not eligible for this division', updated_by: olive });
    expect(mailTo('event_registration_canceled', ada)).toBe(1);
    const audit = one<{ actor_member_id: string; metadata_json: string; reason_text: string }>(
      "SELECT actor_member_id, metadata_json, reason_text FROM audit_entries WHERE entity_id = ? AND action_type = 'event.registration_canceled'", ev.id);
    expect(audit.actor_member_id).toBe(olive);
    expect(JSON.parse(audit.metadata_json)).toMatchObject({ registration_id: reg, member_id: ada });
    expect(audit.reason_text).toBe('Not eligible for this division');

    // Olive's own repeat writes nothing; Otto's submit on the canceled row is not mistaken for his act.
    await post(olive, path, { confirmed: '1', reason: 'Not eligible for this division' });
    const otto2 = await post(otto, path, { confirmed: '1', reason: 'Not eligible for this division' });
    expect((await landedOn(otto, otto2)).text).toContain('form-notice');
    expect(auditCount(ev.id, 'event.registration_canceled')).toBe(1);
    expect(mailTo('event_registration_canceled', ada)).toBe(1);
  });

  // Defect caught: a registration id from another event is canceled through
  // this event's organizer page.
  it('is not-found for a registration of another event', async () => {
    const mine = seedEvent();
    const theirs = seedEvent({ organizers: [otto] });
    const reg = register(theirs, max);
    expect((await post(olive, `${mine.base}/registrations/${reg}/cancel`, { confirmed: '1', reason: 'x' })).status).toBe(404);
    expect(one<{ status: string }>('SELECT status FROM registrations WHERE id = ?', reg).status).toBe('confirmed');
  });
});

describe('closing registration', () => {
  // Defect caught: closing does not move the event to closed, so members keep
  // registering, or it happens without the confirm step.
  it('confirms, then moves the event to closed so nobody can register', async () => {
    const ev = seedEvent();
    expect((await post(olive, `${ev.base}/close-registration`)).status).toBe(200);
    expect(one<{ status: string }>('SELECT status FROM events WHERE id = ?', ev.id).status).toBe('reg_open');
    expect((await post(olive, `${ev.base}/close-registration`, { confirmed: '1' })).status).toBe(303);
    expect(one<{ status: string }>('SELECT status FROM events WHERE id = ?', ev.id).status).toBe('closed');
    expect(auditCount(ev.id, 'event.registration_closed')).toBe(1);
    const closed = one<{ metadata_json: string }>(
      "SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'event.registration_closed'", ev.id);
    expect(JSON.parse(closed.metadata_json)).toEqual({ before: 'reg_open', after: 'closed' });
    expect((await get(eve, `${ev.base}/register`)).status).toBe(303);
    expect(registrationCount(ev.id, eve)).toBe(0);
    await post(olive, `${ev.base}/close-registration`, { confirmed: '1' });
    expect(auditCount(ev.id, 'event.registration_closed')).toBe(1);
  });
});

function registrationCount(eventId: string, memberId: string): number {
  return count('SELECT COUNT(*) c FROM registrations WHERE event_id = ? AND member_id = ?', eventId, memberId);
}

describe('deleting an event', () => {
  // Defect caught: an event that took registrations is deleted and its
  // registrants' history goes with it.
  it('refuses an event that ever took a registration, even a canceled one', async () => {
    const ev = seedEvent();
    register(ev, ada, { status: 'canceled' });
    const page = await get(olive, `${ev.base}/manage`);
    expect(page.text).not.toContain(`action="${ev.base}/delete"`);
    expect(page.text).toContain(`action="${ev.base}/cancel"`);
    await post(olive, `${ev.base}/delete`, { confirmed: '1', reason: 'Duplicate' });
    expect(count('SELECT COUNT(*) c FROM events WHERE id = ?', ev.id)).toBe(1);
  });

  // Defect caught: an event awaiting its sanction decision is deleted out from
  // under the administrator reviewing it.
  it('refuses an event awaiting its sanction decision', async () => {
    const ev = seedEvent({ status: 'pending_approval' });
    await post(olive, `${ev.base}/delete`, { confirmed: '1', reason: 'Duplicate' });
    expect(count('SELECT COUNT(*) c FROM events WHERE id = ?', ev.id)).toBe(1);
  });

  // Defect caught: a duplicate that never took a registration cannot be
  // removed, or its divisions and organizer rows are left behind, or a second
  // submit of the confirmation lands on a not-found page.
  it('deletes a never-registered event with its divisions and organizers, keeps its hashtag, and answers a repeat', async () => {
    const ev = seedEvent({ organizers: [olive, otto] });
    expect((await get(olive, `${ev.base}/manage`)).text).toContain(`action="${ev.base}/delete"`);
    const empty = await post(olive, `${ev.base}/delete`, { confirmed: '1', reason: '' });
    expect(empty.status).toBe(422);

    const res = await post(olive, `${ev.base}/delete`, { confirmed: '1', reason: 'Created twice by mistake' });
    expect(res.status).toBe(303);
    expect(count('SELECT COUNT(*) c FROM events WHERE id = ?', ev.id)).toBe(0);
    expect(count('SELECT COUNT(*) c FROM event_disciplines WHERE event_id = ?', ev.id)).toBe(0);
    expect(count('SELECT COUNT(*) c FROM event_organizers WHERE event_id = ?', ev.id)).toBe(0);
    expect(count('SELECT COUNT(*) c FROM tags WHERE tag_normalized = ?', `#${ev.key}`)).toBe(1);
    expect(auditCount(ev.id, 'event.deleted')).toBe(1);

    const again = await post(olive, `${ev.base}/delete`, { confirmed: '1', reason: 'Created twice by mistake' });
    expect(again.status).toBe(303);
    expect(auditCount(ev.id, 'event.deleted')).toBe(1);
    expect((await post(otto, `${ev.base}/delete`, { confirmed: '1', reason: 'x' })).status).toBe(404);
  });
});

describe('the participant list and its exports', () => {
  // Defect caught: a canceled or deceased registrant is listed, a pending one
  // is hidden, an email is shown that its owner kept private, or the partner
  // and Amateur choice are lost.
  it('lists the standing registrations with the details each member chose to share', async () => {
    const ev = seedEvent({ competitor_fee_cents: 2500, is_tshirt_size_collected: 1 });
    register(ev, ada, { paid: 'succeeded', division: ev.prize, amateur: 1, tshirt: 'S' });
    register(ev, max, { status: 'pending', paid: 'pending', partner: eve });
    register(ev, wren, { status: 'canceled' });
    register(ev, gone);

    const res = await get(olive, `${ev.base}/participants`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Ada Ångström');
    expect(res.text).toContain('Member om-max');
    expect(res.text).toContain('om-ada@example.com');
    expect(res.text).not.toContain('om-max@example.com');
    expect(res.text).not.toContain('HYPERLINK');
    expect(res.text).not.toContain('Member om-gone');
    // The partner, who is not registered themselves, is named on the entry.
    expect(res.text).toContain('Member om-eve');
    expect(res.text).toContain(`action="${ev.base}/registrations/`);
    expect((await get(eve, `${ev.base}/participants`)).status).toBe(404);
  });

  // Defect caught: the CSV carries pending or canceled registrants, a
  // private email, or a member-chosen name that a spreadsheet runs as a
  // formula; or the file name does not follow the event.
  it('exports confirmed participants only, with formula-leading names neutralised', async () => {
    const ev = seedEvent({ title: 'Spring Jam 2027' });
    register(ev, ada);
    register(ev, wren);
    register(ev, max, { status: 'pending' });
    const res = await get(olive, `${ev.base}/participants.csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/filename="spring_jam_2027_participants_\d{8}\.csv"/);
    const lines = res.text.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(res.text).toContain('om-ada@example.com');
    expect(res.text).not.toContain('om-wren@example.com');
    expect(res.text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(res.text).not.toContain('Member om-max');
    expect((await get(eve, `${ev.base}/participants.csv`)).status).toBe(404);
  });

  // Defect caught: the summary counts canceled or pending registrations as
  // confirmed entries.
  it('summarises confirmed registrations by type and division', async () => {
    const ev = seedEvent();
    register(ev, ada);
    register(ev, wren, { division: ev.prize });
    register(ev, max, { status: 'canceled' });
    register(ev, gone, { status: 'pending' });
    register(ev, eve, { status: 'pending' });
    const svc = eventServiceModule.eventService;
    const page = svc.getRegistrationSummaryPage(ev.key, olive);
    expect(page.content.confirmedCount).toBe(2);
    expect(page.content.pendingCount).toBe(1);
    expect(page.content.byDivision).toEqual([
      { name: 'Open Singles Footbag Net', count: 1 },
      { name: 'Open Singles Routines', count: 1 },
    ]);
    expect(page.content.byType.find((t) => t.count === 2)?.label).toBe('Competitor');
    expect((await get(olive, `${ev.base}/summary`)).status).toBe(200);
  });

  // Defect caught: the check-in sheet lists people who are not coming, loses a
  // division's entries, or is not a real PDF download.
  it('builds the check-in sheet from confirmed participants and downloads it as a PDF', async () => {
    const ev = seedEvent({ title: 'Check In Cup' });
    register(ev, ada, { division: ev.prize, amateur: 1 });
    register(ev, wren);
    register(ev, max, { status: 'pending' });
    const sheet = eventServiceModule.eventService.getCheckInSheet(ev.key, olive, undefined);
    const table = sheet.document.blocks[0];
    expect(table.kind).toBe('table');
    if (table.kind !== 'table') return;
    const names = table.rows.filter((r) => r.kind === 'row').map((r) => (r.kind === 'row' ? r.cells[0] : null));
    // ordering-is-the-contract: the sheet is sorted by name for the desk.
    expect(names).toEqual(['=HYPERLINK("x")', 'Ada Ångström']);
    expect(table.columns.some((c) => c.kind === 'checkbox')).toBe(true);

    const byType = eventServiceModule.eventService.getCheckInSheet(ev.key, olive, 'type');
    const grouped = byType.document.blocks[0];
    expect(grouped.kind === 'table' && grouped.rows[0].kind).toBe('group');

    const res = await get(olive, `${ev.base}/check-in-sheet`).buffer(true)
      .parse((r, cb) => { const chunks: Buffer[] = []; r.on('data', (c: Buffer) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/filename="check_in_cup_checkin_\d{8}\.pdf"/);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await get(eve, `${ev.base}/check-in-sheet`)).status).toBe(404);
  });
});

describe('emailing participants', () => {
  // Defect caught: a preview sends mail, the send reaches pending or canceled
  // registrants, a resubmitted form mails everyone twice, or the daily limit
  // lets a second email through.
  it('previews without sending, sends once to confirmed participants, archives it, and holds the daily limit', async () => {
    const ev = seedEvent();
    register(ev, ada);
    register(ev, wren);
    register(ev, max, { status: 'pending' });
    const form = { subject: 'Schedule change', body_text: 'We start at 10.', send_token: 'tok-om-1' };

    const preview = await post(olive, `${ev.base}/email`, { ...form, step: 'preview' });
    expect(preview.status).toBe(200);
    expect(preview.text).toContain('name="step" value="send"');
    const page = eventServiceModule.eventService.getEmailParticipantsPage(ev.key, olive);
    expect(page.content.recipientCount).toBe(2);
    const keyLike = `event-email:${ev.id}:%`;
    expect(count('SELECT COUNT(*) c FROM outbox_emails WHERE idempotency_key LIKE ?', keyLike)).toBe(0);

    const sent = await post(olive, `${ev.base}/email`, { ...form, step: 'send' });
    expect(sent.status).toBe(303);
    const recipients = withDb((db) => db.prepare('SELECT recipient_member_id FROM outbox_emails WHERE idempotency_key LIKE ? ORDER BY recipient_member_id')
      .all(keyLike) as Array<{ recipient_member_id: string }>).map((r) => r.recipient_member_id);
    expect(recipients).toEqual([ada, wren].sort());
    expect(count("SELECT COUNT(*) c FROM email_archives WHERE archive_type = 'event_participants' AND event_id = ?", ev.id)).toBe(1);
    expect(auditCount(ev.id, 'event.participants_emailed')).toBe(1);

    const again = await post(olive, `${ev.base}/email`, { ...form, step: 'send' });
    expect(again.status).toBe(303);
    expect(count('SELECT COUNT(*) c FROM outbox_emails WHERE idempotency_key LIKE ?', keyLike)).toBe(2);

    const second = await post(olive, `${ev.base}/email`, { subject: 'Another', body_text: 'More news.', send_token: 'tok-om-2', step: 'send' });
    expect(second.status).toBe(422);
    expect(count("SELECT COUNT(*) c FROM email_archives WHERE event_id = ?", ev.id)).toBe(1);
    expect((await get(eve, `${ev.base}/email`)).status).toBe(404);
  });

  // Defect caught: the daily limit is counted across every event rather than
  // this one, or an email sent more than a day ago still blocks a new one.
  it('counts the limit per event over the last 24 hours', async () => {
    const ev = seedEvent();
    register(ev, ada);
    withDb((db) => insertEmailArchive(db, {
      archive_type: 'event_participants', event_id: ev.id, sent_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
    }));
    const other = seedEvent();
    withDb((db) => insertEmailArchive(db, { archive_type: 'event_participants', event_id: other.id }));
    const res = await post(olive, `${ev.base}/email`, { subject: 'Hi', body_text: 'Hello.', send_token: 'tok-om-3', step: 'send' });
    expect(res.status).toBe(303);
    expect(count("SELECT COUNT(*) c FROM email_archives WHERE event_id = ?", ev.id)).toBe(2);
  });
});
