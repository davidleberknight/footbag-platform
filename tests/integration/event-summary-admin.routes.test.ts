/**
 * The registration summary, the participant export's payment column, the
 * organizer history a sanction review shows, and the mail an administrator's
 * division removal sends.
 *
 * The contract: an event's registration summary is open to its organizers and
 * to administrators, and to no other member. It counts confirmed
 * registrations per competition category, each registration once per category,
 * as well as per division; it lists every day from registration opening to
 * today, a day without a registration as zero; and for an event that charges
 * it always lists paid, pending and failed payments, zero or not. A free
 * event's export carries no payment column. A sanction review names each
 * organizer's other events. When an administrator removes a division, every
 * member who entered it is emailed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { isoDaysFromNow, isoDaysAgo } from '../fixtures/clock';
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
  insertPayment,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4998');

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

const get = (memberId: string, path: string, admin = false) =>
  request(createApp()).get(path).set('Cookie', cookieFor(memberId, admin));

interface Seeded { id: string; key: string; net1: string; net2: string; freestyle: string }

function seedEvent(o: { fee?: boolean; openedDaysAgo?: number; title?: string } = {}): Seeded {
  return withDb((db) => {
    const start = isoDaysFromNow(40).slice(0, 10);
    const id = insertEvent(db, {
      title: o.title ?? `Summary Test ${Math.random().toString(36).slice(2, 8)}`,
      status: 'reg_open', start_date: start, end_date: start,
      reg_opened_at: o.openedDaysAgo === undefined ? null : isoDaysAgo(o.openedDaysAgo),
      ...(o.fee ? { competitor_fee_cents: 2500, payment_enabled: 1, sanction_status: 'approved' as const } : {}),
    });
    insertEventOrganizer(db, id, olive);
    const net1 = insertDiscipline(db, id, { name: 'Open Singles Net', discipline_category: 'net', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', sort_order: 1 });
    const net2 = insertDiscipline(db, id, { name: 'Intermediate Singles Net', discipline_category: 'net', team_type: 'singles', gender_eligibility: 'open', division_class: 'intermediate', sort_order: 2 });
    const freestyle = insertDiscipline(db, id, { name: 'Open Routines', discipline_category: 'freestyle', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', sort_order: 3 });
    const tag = (db.prepare('SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?').get(id) as { tag_normalized: string }).tag_normalized;
    return { id, key: tag.slice(1), net1, net2, freestyle };
  });
}

function rowsOf(html: string, sectionId: string): string[][] {
  const start = html.indexOf(`id="${sectionId}"`);
  expect(start, `${sectionId} is on the page`).toBeGreaterThan(-1);
  const body = html.slice(start, html.indexOf('</table>', start));
  return [...body.matchAll(/<tr><td>(.*?)<\/td><td>(.*?)<\/td>(?:<td>(.*?)<\/td>)?<\/tr>/g)].map((m) => m.slice(1).filter((c) => c !== undefined));
}

let olive: string;
let otto: string;
let adam: string;
let paid: Seeded;
let free: Seeded;

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
  olive = makeMember('sum-olive');
  otto = makeMember('sum-otto');
  adam = withDb((db) => insertMember(db, { id: 'sum-adam', slug: 'sum_adam', display_name: 'Admin Adam', login_email: 'sum-adam@example.com', is_admin: 1 }));

  paid = seedEvent({ fee: true, openedDaysAgo: 3 });
  free = seedEvent({ title: 'Free Summary Jam' });
  withDb((db) => {
    // One competitor entering both net divisions and routines, paid; one
    // entering routines only, payment pending.
    const a = makeMemberIn(db, 'sum-ann');
    const b = makeMemberIn(db, 'sum-bo');
    const payA = insertPayment(db, { member_id: a, payment_type: 'event_registration', amount_cents: 2500, currency: 'USD', status: 'succeeded' });
    const payB = insertPayment(db, { member_id: b, payment_type: 'event_registration', amount_cents: 2500, currency: 'USD', status: 'pending' });
    const regA = insertRegistration(db, paid.id, a, { payment_id: payA });
    const regB = insertRegistration(db, paid.id, b, { payment_id: payB });
    // A competitor who paid and then withdrew: their payment is not part of
    // how registration stands.
    const c = makeMemberIn(db, 'sum-cy');
    const payC = insertPayment(db, { member_id: c, payment_type: 'event_registration', amount_cents: 2500, currency: 'USD', status: 'succeeded' });
    insertRegistration(db, paid.id, c, { payment_id: payC, status: 'canceled', canceled_at: new Date().toISOString(), cancel_reason: 'withdrew' });
    for (const d of [paid.net1, paid.net2, paid.freestyle]) insertRegistrationDisciplineSelection(db, regA, d);
    insertRegistrationDisciplineSelection(db, regB, paid.freestyle);
    const regF = insertRegistration(db, free.id, a);
    insertRegistrationDisciplineSelection(db, regF, free.net1);
  });
});

function makeMemberIn(db: BetterSqlite3.Database, id: string): string {
  createMemberAtTier(db, {
    id, slug: id.replace(/-/g, '_'), tier: 'tier1',
    memberOverrides: { display_name: `Member ${id}`, login_email: `${id}@example.com` },
  });
  completeOnboarding(db, id);
  return id;
}

afterAll(() => cleanupTestDb(dbPath));

describe('who opens the registration summary', () => {
  // Defect caught: an administrator cannot see an event's registration
  // summary, or a member who does not organize the event can.
  it('opens to an administrator and refuses a member who is not an organizer', async () => {
    expect((await get(adam, `/admin/events/${paid.id}/summary`, true)).status).toBe(200);
    expect((await get(olive, `/events/${paid.key}/summary`)).status).toBe(200);
    expect((await get(otto, `/events/${paid.key}/summary`)).status).toBe(404);
  });
});

describe('what the summary counts', () => {
  // Defect caught: a competitor entering two divisions of one category is
  // counted twice in that category, or a category is missing.
  it('counts each registration once per competition category', async () => {
    const html = (await get(adam, `/admin/events/${paid.id}/summary`, true)).text;
    expect(Object.fromEntries(rowsOf(html, 'summary-by-category'))).toEqual({ Net: '1', Freestyle: '2' });
  });

  // Defect caught: a day nobody registered drops out of the timeline, so the
  // organizer cannot see a quiet spell.
  it('lists every day from registration opening to today, quiet days as zero', async () => {
    const rows = rowsOf((await get(olive, `/events/${paid.key}/summary`)).text, 'summary-by-day');
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r[1])).toEqual(['0', '0', '0', '2']);
  });

  // Defect caught: a status with no payments vanishes, so "no failures" and
  // "failures not reported" look the same; a canceled registration's payment
  // is counted as paid; or a free event shows payments.
  it('always lists paid, pending and failed for a charging event, and nothing for a free one', async () => {
    const rows = rowsOf((await get(olive, `/events/${paid.key}/summary`)).text, 'summary-payments');
    expect(rows.map((r) => r[1])).toEqual(['1', '1', '0']);
    expect((await get(olive, `/events/${free.key}/summary`)).text).not.toContain('id="summary-payments"');
  });
});

describe('the participant export', () => {
  // Defect caught: a free event's export carries a payment column of "No fee"
  // on every row, or a paid event's loses it.
  it('carries a payment column only when the event charges', async () => {
    const header = async (key: string) => (await get(olive, `/events/${key}/participants.csv`)).text.split('\n')[0];
    expect(await header(paid.key)).toContain('Payment');
    expect(await header(free.key)).not.toContain('Payment');
  });
});

describe("a sanction review's organizer history", () => {
  // Defect caught: the administrator deciding a sanction request cannot see
  // what else the organizer has run.
  it("names each organizer's other events, and not the event under review", async () => {
    const { eventService } = await import('../../src/services/eventService');
    const evidence = eventService.getSanctionReviewEvidence(paid.id)!;
    const titles = evidence.organizers.find((o) => o.name === 'Member sum-olive')!.history.map((h) => h.title);
    expect(titles).toContain('Free Summary Jam');
    const ownTitle = withDb((db) => (db.prepare('SELECT title FROM events WHERE id = ?').get(paid.id) as { title: string }).title);
    expect(titles).not.toContain(ownTitle);
  });
});

describe("an administrator's division removal", () => {
  // Defect caught: a member's entry disappears with no word to them.
  it('emails each member who entered the division', async () => {
    const ev = seedEvent();
    const member = withDb((db) => {
      const m = makeMemberIn(db, 'sum-rem');
      const reg = insertRegistration(db, ev.id, m);
      insertRegistrationDisciplineSelection(db, reg, ev.net2);
      insertRegistrationDisciplineSelection(db, reg, ev.freestyle);
      return m;
    });
    const mails = () => withDb((db) => (db.prepare(
      `SELECT COUNT(*) AS n FROM outbox_emails WHERE template_key = 'event_registration_corrected' AND recipient_member_id = ?`,
    ).get(member) as { n: number }).n);
    expect(mails()).toBe(0);
    const res = await request(createApp())
      .post(`/admin/events/${ev.id}/divisions/${ev.net2}/remove/confirm`)
      .set('Cookie', cookieFor(adam, true)).type('form')
      .send({ reason: 'Not enough players for this division' });
    expect(res.status).toBe(303);
    expect(mails()).toBe(1);
  });
});
