/**
 * A member registering themselves for an event, withdrawing, and what the event
 * page shows about who is registered; and the organizers' switch that stops or
 * resumes online registration.
 *
 * The contract: any signed-in member, of any tier, registers for an event that
 * is open for registration, on or before its cutoff (the registration deadline,
 * or the start date when none is set), and while its organizers have not
 * stopped online registration. A type that carries a fee is not offered until
 * payment is enabled (its checkout is the paid-registration suite's). A free
 * registration is confirmed at once and emailed. A competitor enters at least
 * one division; a doubles entry names one partner, a member or a typed name,
 * never themselves; gender eligibility is checked between member profiles, and
 * a typed partner is left to the organizer at check-in. A member withdraws up to the same cutoff, the
 * organizers are emailed, and the member can register again. Every visitor sees
 * how many are registered in each division; only a signed-in member sees who.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { flashCookieOf } from '../fixtures/flashCookie';
import { isoDaysFromNow, isoDaysAgo } from '../fixtures/clock';
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
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4963');

let createApp: Awaited<ReturnType<typeof importApp>>;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

type Gender = 'male' | 'female' | 'undisclosed' | null;

function makeMember(id: string, gender: Gender, tier: 'tier0' | 'tier1' = 'tier1'): string {
  return withDb((db) => {
    createMemberAtTier(db, {
      id, slug: id.replace(/-/g, '_'), tier,
      memberOverrides: { display_name: `Member ${id}`, login_email: `${id}@example.com`, gender },
    });
    completeOnboarding(db, id);
    return id;
  });
}

const day = (iso: string): string => iso.slice(0, 10);

interface SeededEvent {
  id: string;
  key: string;
  singles: string;
  mixed: string;
  womenDoubles: string;
  prize: string;
}

function seedEvent(o: {
  status?: 'draft' | 'reg_open' | 'closed';
  registration_status?: 'open' | 'closed';
  registration_deadline?: string | null;
  start_date?: string;
  is_attendee_registration_open?: 0 | 1;
  is_tshirt_size_collected?: 0 | 1;
  competitor_fee_cents?: number;
  payment_enabled?: 0 | 1;
  sanction_status?: 'none' | 'approved';
  organizers?: string[];
} = {}): SeededEvent {
  return withDb((db) => {
    const start = o.start_date ?? day(isoDaysFromNow(30));
    const id = insertEvent(db, {
      title: `Registration Test ${Math.random().toString(36).slice(2, 8)}`,
      status: o.status ?? 'reg_open',
      registration_status: o.registration_status ?? 'open',
      registration_deadline: o.registration_deadline ?? null,
      start_date: start,
      end_date: start,
      is_attendee_registration_open: o.is_attendee_registration_open ?? 0,
      is_tshirt_size_collected: o.is_tshirt_size_collected ?? 0,
      sanction_status: o.sanction_status ?? 'none',
      ...(o.competitor_fee_cents ? { competitor_fee_cents: o.competitor_fee_cents, payment_enabled: o.payment_enabled ?? 1 } : {}),
    });
    for (const m of o.organizers ?? [olive]) insertEventOrganizer(db, id, m);
    const singles = insertDiscipline(db, id, { name: 'Open Singles Footbag Net', discipline_category: 'net', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', sort_order: 1 });
    const mixed = insertDiscipline(db, id, { name: 'Open Mixed Doubles Footbag Net', discipline_category: 'net', team_type: 'doubles', gender_eligibility: 'mixed', division_class: 'open', sort_order: 2 });
    const womenDoubles = insertDiscipline(db, id, { name: "Open Women's Doubles Footbag Net", discipline_category: 'net', team_type: 'doubles', gender_eligibility: 'women', division_class: 'open', sort_order: 3 });
    const prize = insertDiscipline(db, id, { name: 'Open Singles Routines', discipline_category: 'freestyle', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', offers_prize_money: 1, sort_order: 4 });
    const tag = (db.prepare('SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?').get(id) as { tag_normalized: string }).tag_normalized;
    return { id, key: tag.slice(1), singles, mixed, womenDoubles, prize };
  });
}

function post(memberId: string, path: string, body: Record<string, string | string[]> = {}) {
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

interface RegRow { id: string; status: string; registration_type: string; tshirt_size: string | null; cancel_reason: string | null }
function registrationOf(eventId: string, memberId: string): RegRow | undefined {
  return withDb((db) => db.prepare(
    'SELECT id, status, registration_type, tshirt_size, cancel_reason FROM registrations WHERE event_id = ? AND member_id = ?',
  ).get(eventId, memberId) as RegRow | undefined);
}

function selectionsOf(registrationId: string): Array<{ discipline_id: string; partner_member_id: string | null; partner_display_name: string | null; enters_as_amateur: number }> {
  return withDb((db) => db.prepare(
    'SELECT discipline_id, partner_member_id, partner_display_name, enters_as_amateur FROM registration_discipline_selections WHERE registration_id = ? ORDER BY discipline_id',
  ).all(registrationId) as never);
}

function mailCount(template: string, memberId: string): number {
  return (withDb((db) => db.prepare('SELECT COUNT(*) c FROM outbox_emails WHERE template_key = ? AND recipient_member_id = ?').get(template, memberId)) as { c: number }).c;
}

function auditRows(eventId: string, actionType: string): Array<{ actor_member_id: string; metadata_json: string }> {
  return withDb((db) => db.prepare(
    'SELECT actor_member_id, metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = ? ORDER BY occurred_at, id',
  ).all(eventId, actionType) as Array<{ actor_member_id: string; metadata_json: string }>);
}

/** The registration form as a browser posts it, every doubles division's partner fields included. */
function registerBody(ev: SeededEvent, o: {
  type?: string; divisions?: string[]; amateur?: string[];
  mixedKey?: string; mixedName?: string; womenKey?: string; womenName?: string; tshirt?: string;
} = {}): Record<string, string | string[]> {
  return {
    registration_type: o.type ?? 'competitor',
    division: o.divisions ?? [],
    amateur: o.amateur ?? [],
    partner_division: [ev.mixed, ev.womenDoubles],
    partner_key: [o.mixedKey ?? '', o.womenKey ?? ''],
    partner_name: [o.mixedName ?? '', o.womenName ?? ''],
    tshirt_size: o.tshirt ?? '',
  };
}

let olive: string;   // organizes every event
let oscar: string;   // a second organizer
let tim: string;     // tier 0, male
let ada: string;     // female
let max: string;     // male
let wren: string;    // female
let una: string;     // gender undisclosed
let nobody: string;  // never registers

beforeAll(async () => {
  createTestDb(dbPath).close();
  olive = makeMember('rg-olive', 'female');
  oscar = makeMember('rg-oscar', 'male');
  tim = makeMember('rg-tim', 'male', 'tier0');
  ada = makeMember('rg-ada', 'female');
  max = makeMember('rg-max', 'male');
  wren = makeMember('rg-wren', 'female');
  una = makeMember('rg-una', 'undisclosed');
  nobody = makeMember('rg-nobody', null);
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('registering for a free event', () => {
  // Defect caught: a Tier 0 member is shut out of registration, a free entry is
  // left pending, the Amateur choice or t-shirt size is dropped, or no
  // confirmation reaches the member.
  it('confirms a Tier 0 competitor at once, stores each entry, and emails the details', async () => {
    const ev = seedEvent({ is_tshirt_size_collected: 1 });
    const form = await get(tim, `/events/${ev.key}/register`);
    expect(form.status).toBe(200);
    expect(form.text).toContain(`name="division" value="${ev.singles}"`);
    expect(form.text).toContain('name="tshirt_size"');

    const res = await post(tim, `/events/${ev.key}/register`, registerBody(ev, {
      divisions: [ev.singles, ev.prize], amateur: [ev.prize, ev.singles], tshirt: 'M',
    }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/events/${ev.key}`);

    const reg = registrationOf(ev.id, tim)!;
    expect(reg).toMatchObject({ status: 'confirmed', registration_type: 'competitor', tshirt_size: 'M' });
    const sel = selectionsOf(reg.id);
    expect(sel.map((s) => s.discipline_id).sort()).toEqual([ev.singles, ev.prize].sort());
    // Amateur is kept only on the division that offers prize money.
    expect(sel.find((s) => s.discipline_id === ev.prize)!.enters_as_amateur).toBe(1);
    expect(sel.find((s) => s.discipline_id === ev.singles)!.enters_as_amateur).toBe(0);

    expect(mailCount('event_registration_confirmed', tim)).toBe(1);
    const body = (withDb((db) => db.prepare("SELECT body_text FROM outbox_emails WHERE template_key = 'event_registration_confirmed' AND recipient_member_id = ?").get(tim)) as { body_text: string }).body_text;
    expect(body).toContain('Open Singles Footbag Net');
    expect(body).toContain('Open Singles Routines');

    const page = await landedOn(tim, res);
    expect(page.text).toContain('form-success-banner');
    expect(page.text).toContain(`action="/events/${ev.key}/withdraw"`);
    expect(page.text).not.toContain(`href="/events/${ev.key}/register"`);
  });

  // Defect caught: a second submit of the same registration creates a second
  // confirmation email, or is refused as if it were a conflict.
  it('treats the same registration submitted twice as the first submit', async () => {
    const ev = seedEvent();
    const body = registerBody(ev, { divisions: [ev.singles] });
    expect((await post(ada, `/events/${ev.key}/register`, body)).status).toBe(303);
    const again = await post(ada, `/events/${ev.key}/register`, body);
    expect(again.status).toBe(303);
    expect((await landedOn(ada, again)).text).toContain('form-success-banner');
    expect(mailCount('event_registration_confirmed', ada)).toBeGreaterThanOrEqual(1);
    const regs = withDb((db) => db.prepare('SELECT COUNT(*) c FROM registrations WHERE event_id = ?').get(ev.id)) as { c: number };
    expect(regs.c).toBe(1);
    const mails = withDb((db) => db.prepare("SELECT COUNT(*) c FROM outbox_emails WHERE template_key = 'event_registration_confirmed' AND idempotency_key LIKE ?").get(`event-registration:${registrationOf(ev.id, ada)!.id}:%`)) as { c: number };
    expect(mails.c).toBe(1);
  });

  // Defect caught: a competitor is registered with no division, which the data
  // model forbids for a confirmed competitor.
  it('refuses a competitor who enters no division, and offers the form again', async () => {
    const ev = seedEvent();
    const res = await post(max, `/events/${ev.key}/register`, registerBody(ev));
    expect(res.status).toBe(422);
    expect(res.text).toContain('form-error-banner');
    expect(res.text).toContain(`name="division" value="${ev.singles}"`);
    expect(registrationOf(ev.id, max)).toBeUndefined();
  });

  // Defect caught: the attendee type is offered or accepted when the organizers
  // have not turned it on, or refused when they have.
  it('offers Attendee or Supporter only when the organizers accept it', async () => {
    const off = seedEvent();
    const offForm = await get(max, `/events/${off.key}/register`);
    expect(offForm.text).not.toContain('value="attendee_supporter"');
    const forced = await post(max, `/events/${off.key}/register`, registerBody(off, { type: 'attendee_supporter' }));
    expect(forced.status).toBe(422);
    expect(registrationOf(off.id, max)).toBeUndefined();

    const on = seedEvent({ is_attendee_registration_open: 1 });
    const onForm = await get(max, `/events/${on.key}/register`);
    expect(onForm.text).toContain('value="attendee_supporter"');
    const res = await post(max, `/events/${on.key}/register`, registerBody(on, { type: 'attendee_supporter', divisions: [on.singles] }));
    expect(res.status).toBe(303);
    const reg = registrationOf(on.id, max)!;
    expect(reg).toMatchObject({ status: 'confirmed', registration_type: 'attendee_supporter' });
    expect(selectionsOf(reg.id)).toEqual([]);
  });

  // Defect caught: a member registers for nothing on an event whose only type
  // carries a fee before payment is enabled, bypassing the payment it needs.
  it('offers no registration while every type carries a fee and payment is not enabled', async () => {
    const ev = seedEvent({ sanction_status: 'approved', competitor_fee_cents: 5000, payment_enabled: 0 });
    const page = await get(max, `/events/${ev.key}`);
    expect(page.status).toBe(200);
    expect(page.text).not.toContain(`/events/${ev.key}/register`);
    const form = await get(max, `/events/${ev.key}/register`);
    expect(form.status).toBe(303);
    const res = await post(max, `/events/${ev.key}/register`, registerBody(ev, { divisions: [ev.singles] }));
    expect(res.status).toBe(303);
    expect((await landedOn(max, res)).text).toContain('form-error-banner');
    expect(registrationOf(ev.id, max)).toBeUndefined();
  });

  // Defect caught: registration stays open after the organizers stop it, after
  // the deadline, or after the start day when no deadline is set; or closes a
  // day early on the deadline itself.
  it('is open through the cutoff day and closed after it, or when stopped', async () => {
    const cases: Array<[string, Parameters<typeof seedEvent>[0], boolean]> = [
      ['stopped by the organizers', { registration_status: 'closed' }, false],
      ['deadline passed', { registration_deadline: day(isoDaysAgo(1)) }, false],
      ['deadline is today', { registration_deadline: day(isoDaysFromNow(0)) }, true],
      ['no deadline, start day passed', { start_date: day(isoDaysAgo(1)) }, false],
    ];
    for (const [label, opts, open] of cases) {
      const ev = seedEvent(opts);
      const page = await get(wren, `/events/${ev.key}`);
      expect(page.text.includes(`/events/${ev.key}/register`), label).toBe(open);
      const res = await post(wren, `/events/${ev.key}/register`, registerBody(ev, { divisions: [ev.singles] }));
      expect(res.status, label).toBe(303);
      expect(registrationOf(ev.id, wren)?.status ?? 'none', label).toBe(open ? 'confirmed' : 'none');
    }
  });

  // Defect caught: a draft event, which is not public, takes registrations or
  // reveals itself.
  it('answers a draft event as not found', async () => {
    const ev = seedEvent({ status: 'draft' });
    expect((await get(max, `/events/${ev.key}/register`)).status).toBe(404);
    expect((await post(max, `/events/${ev.key}/register`, registerBody(ev, { divisions: [ev.singles] }))).status).toBe(404);
    expect(registrationOf(ev.id, max)).toBeUndefined();
  });

  // Defect caught: a visitor who is not signed in reaches the registration form.
  it('sends a signed-out visitor to log in', async () => {
    const ev = seedEvent();
    const res = await get(null, `/events/${ev.key}/register`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });
});

describe('doubles partners and gender eligibility', () => {
  async function attempt(memberId: string, ev: SeededEvent, o: Parameters<typeof registerBody>[1]) {
    const res = await post(memberId, `/events/${ev.key}/register`, registerBody(ev, o));
    return { status: res.status, reg: registrationOf(ev.id, memberId) };
  }

  // Defect caught: a doubles entry is accepted with no partner, with two
  // partners at once, with the registrant as their own partner, or with a
  // partner who is not a member.
  it('requires exactly one partner who is someone else', async () => {
    const ev = seedEvent();
    for (const [label, o] of [
      ['no partner', { divisions: [ev.mixed] }],
      ['both a member and a name', { divisions: [ev.mixed], mixedKey: max, mixedName: 'Pat Partner' }],
      // A women's pair, so only the self check can refuse it.
      ['themselves', { divisions: [ev.womenDoubles], womenKey: ada }],
      ['an unknown member', { divisions: [ev.mixed], mixedKey: 'no-such-member' }],
    ] as Array<[string, Parameters<typeof registerBody>[1]]>) {
      const r = await attempt(ada, ev, o);
      expect(r.status, label).toBe(422);
      expect(r.reg, label).toBeUndefined();
    }
  });

  // Defect caught: a mixed division takes two partners of one gender, or a
  // women's division takes a man, so the draw is not the one advertised.
  it('checks gender between member profiles', async () => {
    const ev = seedEvent();
    expect((await attempt(ada, ev, { divisions: [ev.mixed], mixedKey: wren })).status).toBe(422);
    expect((await attempt(ada, ev, { divisions: [ev.womenDoubles], womenKey: max })).status).toBe(422);
    expect((await attempt(max, ev, { divisions: [ev.womenDoubles], womenKey: ada })).status).toBe(422);
    expect(registrationOf(ev.id, ada)).toBeUndefined();

    // A partner given by profile URL resolves as by id.
    const ok = await attempt(ada, ev, { divisions: [ev.mixed, ev.womenDoubles], mixedKey: `https://example.org/members/${max.replace(/-/g, '_')}`, womenKey: wren });
    expect(ok.status).toBe(303);
    const sel = selectionsOf(ok.reg!.id);
    expect(sel.find((s) => s.discipline_id === ev.mixed)!.partner_member_id).toBe(max);
    expect(sel.find((s) => s.discipline_id === ev.womenDoubles)!.partner_member_id).toBe(wren);
  });

  // Defect caught: a typed partner, whose eligibility the organizer checks at
  // check-in, is refused, or lets a registrant who has not declared a gender
  // into a gendered draw.
  it('accepts a typed partner in a gated division on the registrant own gender', async () => {
    const ev = seedEvent();
    expect((await attempt(una, ev, { divisions: [ev.mixed], mixedName: 'Pat Partner' })).status).toBe(422);
    const ok = await attempt(max, ev, { divisions: [ev.mixed], mixedName: 'Pat Partner' });
    expect(ok.status).toBe(303);
    expect(selectionsOf(ok.reg!.id)).toEqual([
      { discipline_id: ev.mixed, partner_member_id: null, partner_display_name: 'Pat Partner', enters_as_amateur: 0 },
    ]);
  });

  // Defect caught: a member who has not declared a gender enters a gendered
  // draw, or is shut out of the open divisions too.
  it('keeps an undisclosed member to the open divisions, and warns them on the form', async () => {
    const ev = seedEvent();
    const form = await get(una, `/events/${ev.key}/register`);
    expect(form.text).toContain(`href="/members/${una.replace(/-/g, '_')}"`);
    expect((await attempt(una, ev, { divisions: [ev.mixed], mixedKey: max })).status).toBe(422);
    expect((await attempt(nobody, ev, { divisions: [ev.mixed], mixedKey: max })).status).toBe(422);
    const ok = await attempt(una, ev, { divisions: [ev.singles] });
    expect(ok.status).toBe(303);
    expect(ok.reg!.status).toBe('confirmed');
  });
});

describe('withdrawing', () => {
  // Defect caught: withdrawal happens without the confirm step, leaves the
  // registration counted, goes unrecorded, or the organizers are not told.
  it('confirms, cancels the registration, records it and emails every organizer', async () => {
    const ev = seedEvent({ organizers: [olive, oscar] });
    await post(ada, `/events/${ev.key}/register`, registerBody(ev, { divisions: [ev.mixed], mixedKey: max }));
    const reg = registrationOf(ev.id, ada)!;

    const confirm = await post(ada, `/events/${ev.key}/withdraw`);
    expect(confirm.status).toBe(200);
    expect(confirm.text).toContain('name="confirmed" value="1"');
    expect(registrationOf(ev.id, ada)!.status).toBe('confirmed');

    const res = await post(ada, `/events/${ev.key}/withdraw`, { confirmed: '1' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/events/${ev.key}`);
    expect(registrationOf(ev.id, ada)!.status).toBe('canceled');
    // The canceled row keeps its entry and partner for the organizers.
    expect(selectionsOf(reg.id).map((s) => s.partner_member_id)).toEqual([max]);
    const audits = auditRows(ev.id, 'event.registration_withdrawn');
    expect(audits).toHaveLength(1);
    expect(audits[0].actor_member_id).toBe(ada);
    expect(JSON.parse(audits[0].metadata_json)).toEqual({ registration_id: reg.id });
    expect(mailCount('event_registration_withdrawn', olive)).toBe(1);
    expect(mailCount('event_registration_withdrawn', oscar)).toBe(1);

    // Submitted twice: the first outcome, nothing written again.
    const again = await post(ada, `/events/${ev.key}/withdraw`, { confirmed: '1' });
    expect(again.status).toBe(303);
    expect((await landedOn(ada, again)).text).toContain('form-success-banner');
    expect(auditRows(ev.id, 'event.registration_withdrawn')).toHaveLength(1);
    expect(mailCount('event_registration_withdrawn', olive)).toBe(1);
  });

  // Defect caught: a member who withdrew cannot come back, or comes back with
  // a second row, the old entries, or no new confirmation.
  it('lets a withdrawn member register again on the same row', async () => {
    const ev = seedEvent();
    await post(max, `/events/${ev.key}/register`, registerBody(ev, { divisions: [ev.singles] }));
    const first = registrationOf(ev.id, max)!;
    await post(max, `/events/${ev.key}/withdraw`, { confirmed: '1' });
    const res = await post(max, `/events/${ev.key}/register`, registerBody(ev, { divisions: [ev.prize] }));
    expect(res.status).toBe(303);
    const again = registrationOf(ev.id, max)!;
    expect(again).toMatchObject({ id: first.id, status: 'confirmed', cancel_reason: null });
    expect(selectionsOf(again.id).map((s) => s.discipline_id)).toEqual([ev.prize]);
    const mails = withDb((db) => db.prepare("SELECT COUNT(*) c FROM outbox_emails WHERE template_key = 'event_registration_confirmed' AND idempotency_key LIKE ?").get(`event-registration:${first.id}:%`)) as { c: number };
    expect(mails.c).toBe(2);
  });

  // Defect caught: a member withdraws after the deadline, when only an
  // organizer may cancel.
  it('refuses a withdrawal after the cutoff', async () => {
    const ev = seedEvent({ registration_deadline: day(isoDaysAgo(1)) });
    withDb((db) => insertRegistration(db, ev.id, wren));
    const page = await get(wren, `/events/${ev.key}`);
    expect(page.text).not.toContain(`action="/events/${ev.key}/withdraw"`);
    const res = await post(wren, `/events/${ev.key}/withdraw`, { confirmed: '1' });
    expect(res.status).toBe(303);
    expect((await landedOn(wren, res)).text).toContain('form-error-banner');
    expect(registrationOf(ev.id, wren)!.status).toBe('confirmed');
  });

  // Defect caught: the withdrawal screen for a paid registration does not say
  // that refunds are arranged outside the platform.
  it('tells a paid registrant that refunds happen outside the platform', async () => {
    const ev = seedEvent();
    const paid = seedEvent({ sanction_status: 'approved', competitor_fee_cents: 5000 });
    withDb((db) => {
      insertRegistration(db, ev.id, oscar);
      const paymentId = insertPayment(db, { member_id: oscar, payment_type: 'event_registration', amount_cents: 5000, status: 'succeeded' });
      insertRegistration(db, paid.id, oscar, { payment_id: paymentId });
    });
    const free = await post(oscar, `/events/${ev.key}/withdraw`);
    const withFee = await post(oscar, `/events/${paid.key}/withdraw`);
    expect(free.text).not.toContain('Treasurer');
    expect(withFee.text).toContain('Treasurer');
  });
});

describe('who is registered, on the event page', () => {
  // Defect caught: a signed-out visitor sees registrants' names, a member sees
  // a pending or withdrawn registrant, or the per-division counts include them.
  it('lists confirmed registrants to members only, and counts them for everyone', async () => {
    const ev = seedEvent();
    withDb((db) => {
      const a = insertRegistration(db, ev.id, ada);
      insertRegistrationDisciplineSelection(db, a, ev.singles);
      const m = insertRegistration(db, ev.id, max);
      insertRegistrationDisciplineSelection(db, m, ev.singles);
      insertRegistrationDisciplineSelection(db, m, ev.prize);
      const p = insertRegistration(db, ev.id, wren, { status: 'pending' });
      insertRegistrationDisciplineSelection(db, p, ev.singles);
      const c = insertRegistration(db, ev.id, una, { status: 'canceled', cancel_reason: 'Withdrawn by the member', canceled_at: isoDaysAgo(1) });
      insertRegistrationDisciplineSelection(db, c, ev.singles);
    });

    const visitor = await get(null, `/events/${ev.key}`);
    expect(visitor.status).toBe(200);
    expect(visitor.text).toContain('2 registered');   // singles: ada and max
    expect(visitor.text).toContain('1 registered');   // prize: max
    expect(visitor.text).not.toContain(`Member ${ada}`);

    const member = await get(nobody, `/events/${ev.key}`);
    expect(member.text).toContain(`Member ${ada}`);
    expect(member.text).toContain(`Member ${max}`);
    expect(member.text).not.toContain(`Member ${wren}`);
    expect(member.text).not.toContain(`Member ${una}`);
    expect(member.text).not.toContain(`${ada}@example.com`);
  });
});

describe('the organizers stopping and resuming online registration', () => {
  // Defect caught: the switch changes the event's status, goes unrecorded,
  // records a repeat, or is open to a member who does not run the event.
  it('flips registration without touching status, records it once, and only for an organizer', async () => {
    const ev = seedEvent();
    const statusOf = () => withDb((db) => db.prepare('SELECT status, registration_status FROM events WHERE id = ?').get(ev.id));

    expect((await post(ada, `/events/${ev.key}/registration-status`, { set_to: 'closed' })).status).toBe(404);
    expect(statusOf()).toEqual({ status: 'reg_open', registration_status: 'open' });

    const manage = await get(olive, `/events/${ev.key}/manage`);
    expect(manage.text).toContain(`action="/events/${ev.key}/registration-status"`);

    const res = await post(olive, `/events/${ev.key}/registration-status`, { set_to: 'closed' });
    expect(res.status).toBe(303);
    expect(statusOf()).toEqual({ status: 'reg_open', registration_status: 'closed' });
    const audits = auditRows(ev.id, 'event.registration_status_changed');
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0].metadata_json)).toEqual({ before: 'open', after: 'closed' });

    await post(olive, `/events/${ev.key}/registration-status`, { set_to: 'closed' });
    expect(auditRows(ev.id, 'event.registration_status_changed')).toHaveLength(1);

    await post(olive, `/events/${ev.key}/registration-status`, { set_to: 'open' });
    expect(statusOf()).toEqual({ status: 'reg_open', registration_status: 'open' });
    expect(auditRows(ev.id, 'event.registration_status_changed')).toHaveLength(2);
  });

  // Defect caught: the organizers' Attendee/Supporter setting is not saved, so
  // the type can never be offered.
  it('saves the Attendee/Supporter setting from the details form', async () => {
    const ev = seedEvent();
    const res = await post(olive, `/events/${ev.key}/edit`, {
      title: 'Attendee Setting', description: '', start_date: day(isoDaysFromNow(30)), end_date: day(isoDaysFromNow(30)),
      city: 'Testville', region: '', country: 'United States', registration_deadline: '',
      tshirt_size_collected: '0', attendee_registration_open: ['0', '1'], competitor_fee: '', spectator_fee: '',
    });
    expect(res.status).toBe(303);
    expect(withDb((db) => db.prepare('SELECT is_attendee_registration_open v FROM events WHERE id = ?').get(ev.id))).toEqual({ v: 1 });
  });
});

describe('removing a division that has unconfirmed entries', () => {
  // Defect caught: a pending or withdrawn entry blocks the removal the story
  // allows until an entry is confirmed.
  it('removes the division and the entries no confirmed registration holds', async () => {
    const ev = seedEvent();
    withDb((db) => {
      const p = insertRegistration(db, ev.id, ada, { status: 'pending' });
      insertRegistrationDisciplineSelection(db, p, ev.prize);
      const c = insertRegistration(db, ev.id, max, { status: 'canceled', cancel_reason: 'Withdrawn by the member', canceled_at: isoDaysAgo(1) });
      insertRegistrationDisciplineSelection(db, c, ev.prize);
    });
    const res = await post(olive, `/events/${ev.key}/divisions/${ev.prize}/remove`, { confirmed: '1' });
    expect(res.status).toBe(303);
    const left = withDb((db) => ({
      division: db.prepare('SELECT COUNT(*) c FROM event_disciplines WHERE id = ?').get(ev.prize),
      entries: db.prepare('SELECT COUNT(*) c FROM registration_discipline_selections WHERE discipline_id = ?').get(ev.prize),
    }));
    expect(left).toEqual({ division: { c: 0 }, entries: { c: 0 } });
  });
});
