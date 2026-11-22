/**
 * Doubles partners agreeing with each other: each player holds their own
 * registration and names a partner, and an entry is a pair only when the
 * partner's confirmed entry in the same division names the entrant back.
 *
 * The contract: a doubles entry may name a partner or be ticked as looking for
 * one, never neither. A member named by a confirmed entry is emailed once, and
 * their register form says who named them and starts with that member chosen;
 * they may still choose someone else. The participant list flags an entry with
 * no partner, one the partner has not named back, and one whose partner named
 * someone else, and the results upload refuses every entry that is not a pair.
 * A member's own event page says when their partner has not named them back.
 * While registration is open a confirmed competitor chooses or changes their
 * own partner from the event page. A partner whose entry named a member who
 * withdraws or changes partner is left looking for a partner and is emailed.
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
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4987');

let createApp: Awaited<ReturnType<typeof importApp>>;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function makeMember(id: string, gender: 'male' | 'female'): string {
  return withDb((db) => {
    createMemberAtTier(db, {
      id, slug: id.replace(/-/g, '_'), tier: 'tier1',
      memberOverrides: { display_name: `Member ${id}`, login_email: `${id}@example.com`, gender },
    });
    completeOnboarding(db, id);
    return id;
  });
}

interface SeededEvent { id: string; key: string; singles: string; women: string }

function seedEvent(o: { registration_status?: 'open' | 'closed'; startInDays?: number } = {}): SeededEvent {
  return withDb((db) => {
    const start = isoDaysFromNow(o.startInDays ?? 30).slice(0, 10);
    const id = insertEvent(db, {
      title: `Pairing Test ${Math.random().toString(36).slice(2, 8)}`,
      status: 'reg_open',
      registration_status: o.registration_status ?? 'open',
      start_date: start,
      end_date: start,
      sanction_status: 'none',
    });
    insertEventOrganizer(db, id, olive);
    const singles = insertDiscipline(db, id, { name: 'Open Singles Footbag Net', discipline_category: 'net', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', sort_order: 1 });
    const women = insertDiscipline(db, id, { name: "Open Women's Doubles Footbag Net", discipline_category: 'net', team_type: 'doubles', gender_eligibility: 'women', division_class: 'open', sort_order: 2 });
    const tag = (db.prepare('SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?').get(id) as { tag_normalized: string }).tag_normalized;
    return { id, key: tag.slice(1), singles, women };
  });
}

function post(memberId: string, path: string, body: Record<string, string | string[]> = {}) {
  return request(createApp()).post(path).set('Cookie', cookieFor(memberId)).type('form').send(body);
}

function get(memberId: string, path: string) {
  return request(createApp()).get(path).set('Cookie', cookieFor(memberId));
}

function landedOn(memberId: string, res: { headers: Record<string, string> }) {
  return request(createApp()).get(res.headers.location)
    .set('Cookie', [cookieFor(memberId), flashCookieOf(res as never)].filter(Boolean).join('; '));
}

/** Register for the women's doubles division with a partner, or ticked as looking. */
function enterDoubles(ev: SeededEvent, memberId: string, partner: string | null) {
  return post(memberId, `/events/${ev.key}/register`, {
    registration_type: 'competitor',
    division: [ev.women],
    partner_division: [ev.women],
    partner: [partner ?? ''],
    looking: partner ? [] : [ev.women],
  });
}

function registrationOf(eventId: string, memberId: string): { id: string; status: string } {
  return withDb((db) => db.prepare('SELECT id, status FROM registrations WHERE event_id = ? AND member_id = ?')
    .get(eventId, memberId) as { id: string; status: string });
}

function partnerOf(ev: SeededEvent, memberId: string): string | null {
  return withDb((db) => (db.prepare(
    `SELECT rds.partner_member_id FROM registration_discipline_selections rds
       JOIN registrations r ON r.id = rds.registration_id
      WHERE r.event_id = ? AND r.member_id = ? AND rds.discipline_id = ?`,
  ).get(ev.id, memberId, ev.women) as { partner_member_id: string | null }).partner_member_id);
}

function mailCount(template: string, memberId: string, eventTitleOf?: SeededEvent): number {
  const title = eventTitleOf
    ? (withDb((db) => db.prepare('SELECT title FROM events WHERE id = ?').get(eventTitleOf.id)) as { title: string }).title
    : null;
  return (withDb((db) => db.prepare(
    `SELECT COUNT(*) c FROM outbox_emails WHERE template_key = ? AND recipient_member_id = ?${title ? ' AND subject LIKE ?' : ''}`,
  ).get(...[template, memberId, ...(title ? [`%${title}%`] : [])])) as { c: number }).c;
}

/** The participant-list row of one entrant in the doubles group. */
async function participantRow(ev: SeededEvent, memberId: string): Promise<string> {
  const page = await get(olive, `/events/${ev.key}/participants`);
  expect(page.status).toBe(200);
  const reg = registrationOf(ev.id, memberId).id;
  const start = page.text.indexOf(`<tr data-registration-id="${reg}"`);
  expect(start, `participant row for ${memberId}`).toBeGreaterThanOrEqual(0);
  return page.text.slice(start, page.text.indexOf('</tr>', start));
}

const partnersOn = (html: string) => [...html.matchAll(/name="partner" value="([^"]*)"/g)].map((m) => m[1]);

let olive: string;  // organizes every event
let ada: string;
let wren: string;
let fay: string;
let gwen: string;

beforeAll(async () => {
  createTestDb(dbPath).close();
  olive = makeMember('pr-olive', 'female');
  ada = makeMember('pr-ada', 'female');
  wren = makeMember('pr-wren', 'female');
  fay = makeMember('pr-fay', 'female');
  gwen = makeMember('pr-gwen', 'female');
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('how the organizers see each doubles entry', () => {
  // Defect caught: two partners who named each other are flagged as if
  // something were wrong, so the organizer chases a pair that is fine.
  it('shows a pair that named each other with no flag', async () => {
    const ev = seedEvent();
    expect((await enterDoubles(ev, ada, wren)).status).toBe(303);
    expect((await enterDoubles(ev, wren, ada)).status).toBe(303);
    for (const m of [ada, wren]) {
      const row = await participantRow(ev, m);
      expect(row, m).not.toContain('data-pairing-flag');
      expect(row, m).not.toContain('data-no-partner');
    }
    // The organizer is told what makes a pair under the doubles division only,
    // so a flag is never left unexplained and singles carry no doubles advice.
    await post(fay, `/events/${ev.key}/register`, { registration_type: 'competitor', division: [ev.singles] });
    const page = (await get(olive, `/events/${ev.key}/participants`)).text;
    expect(page.match(/data-doubles-pairing-help/g)?.length).toBe(1);
    const help = page.indexOf('data-doubles-pairing-help');
    const doublesHeading = page.lastIndexOf('<h3>', help);
    expect(page.slice(doublesHeading, help)).toContain('Doubles');
  });

  // Defect caught: an entry naming a partner who never registered, or who
  // named someone else, reads to the organizer as a complete pair.
  it('flags an entry whose partner never entered, and one whose partner named someone else', async () => {
    const ev = seedEvent();
    await enterDoubles(ev, ada, wren);
    expect(await participantRow(ev, ada)).toContain('data-pairing-flag="unconfirmed"');
    await enterDoubles(ev, wren, fay);
    // Wren named Fay, who has not entered: Ada's partner named someone else,
    // and Wren's partner has not named her back.
    expect(await participantRow(ev, ada)).toContain('data-pairing-flag="named_other"');
    expect(await participantRow(ev, wren)).toContain('data-pairing-flag="unconfirmed"');
  });

  // Defect caught: three entries each naming the next pass as pairs because
  // every one names somebody who entered.
  it('flags every entry of a three-way circle', async () => {
    const ev = seedEvent();
    await enterDoubles(ev, ada, wren);
    await enterDoubles(ev, wren, fay);
    await enterDoubles(ev, fay, ada);
    for (const m of [ada, wren, fay]) expect(await participantRow(ev, m), m).toContain('data-pairing-flag="named_other"');
  });
});

describe('entering looking for a partner', () => {
  // Defect caught: a doubles entry is taken with neither a partner nor the
  // looking tick, or the tick is refused, so a player without a partner
  // cannot enter at all.
  it('takes the tick in place of a partner, and refuses neither, offering the tick again', async () => {
    const ev = seedEvent();
    const neither = await post(ada, `/events/${ev.key}/register`, {
      registration_type: 'competitor', division: [ev.women], partner_division: [ev.women], partner: [''],
    });
    expect(neither.status).toBe(422);
    expect(neither.text).toContain(`name="looking" value="${ev.women}"`);
    expect(withDb((db) => db.prepare('SELECT COUNT(*) c FROM registrations WHERE event_id = ?').get(ev.id))).toEqual({ c: 0 });

    const ticked = await enterDoubles(ev, ada, null);
    expect(ticked.status).toBe(303);
    expect(partnerOf(ev, ada)).toBeNull();
    expect(await participantRow(ev, ada)).toContain('data-no-partner');
  });

  // Defect caught: the form shows a chosen partner with the looking tick still
  // ticked, so it says both at once; or the ticks of different divisions share
  // one name, so a screen-reader user cannot tell which division each is for.
  it('clears the looking tick once a partner is chosen, and names each tick by its division', async () => {
    const ev = seedEvent();
    const body = {
      registration_type: 'competitor', division: [ev.women], partner_division: [ev.women], partner: [''], looking: [ev.women],
    };
    const ticked = await post(ada, `/events/${ev.key}/register`, { ...body, pick: `open:partner-${ev.women}`, pick_q: '' });
    expect(ticked.text).toMatch(new RegExp(`name="looking" value="${ev.women}"[^>]*checked`));
    const chosen = await post(ada, `/events/${ev.key}/register`, { ...body, pick: `choose:partner-${ev.women}:${wren}`, pick_q: '' });
    expect(partnersOn(chosen.text)).toEqual([wren]);
    expect(chosen.text).not.toMatch(new RegExp(`name="looking" value="${ev.women}"[^>]*checked`));
    const division = (withDb((db) => db.prepare('SELECT name FROM event_disciplines WHERE id = ?').get(ev.women)) as { name: string }).name;
    const tick = new RegExp(`name="looking" value="${ev.women}" aria-label="[^"]*${division.replace(/'/g, '&#x27;')}"`);
    expect(chosen.text).toMatch(tick);
  });

  // Defect caught: a member looking for a partner is invisible to the
  // members who could partner them, or the list names the viewer to themselves.
  it('lists who is looking on the event page and the register form', async () => {
    const ev = seedEvent();
    await enterDoubles(ev, ada, null);
    const page = await get(wren, `/events/${ev.key}`);
    expect(page.text).toContain('data-looking-for-partner');
    const form = await get(wren, `/events/${ev.key}/register`);
    const list = form.text.slice(form.text.indexOf('data-looking-list'));
    expect(list.slice(0, list.indexOf('</p>'))).toContain('Member pr-ada');
    const own = await get(ada, `/events/${ev.key}/register`);
    expect(own.status).toBe(303); // already registered: no form, so never listed to herself
  });
});

describe('being named as a partner', () => {
  // Defect caught: the named partner is never told, is told again on every
  // re-registration, or a partner who already named the entrant is mailed.
  it('emails the named partner once, and not when they already named the entrant', async () => {
    const ev = seedEvent();
    await enterDoubles(ev, ada, wren);
    expect(mailCount('event_partner_named', wren, ev)).toBe(1);
    await post(ada, `/events/${ev.key}/withdraw`, { confirmed: '1' });
    await enterDoubles(ev, ada, wren);
    expect(mailCount('event_partner_named', wren, ev)).toBe(1);
    await enterDoubles(ev, wren, ada);
    expect(mailCount('event_partner_named', ada, ev)).toBe(0);
  });

  // Defect caught: the named member's form neither says who named them nor
  // starts with that member chosen, or the form as rendered does not register.
  it('starts the named member\'s form with the entrant chosen, and registers the pair as rendered', async () => {
    const ev = seedEvent();
    await enterDoubles(ev, ada, wren);
    const form = await get(wren, `/events/${ev.key}/register`);
    expect(form.status).toBe(200);
    expect(form.text).toContain('data-named-by');
    expect(partnersOn(form.text)).toEqual([ada]);
    const res = await post(wren, `/events/${ev.key}/register`, {
      registration_type: 'competitor', division: [ev.women], partner_division: [ev.women], partner: partnersOn(form.text),
    });
    expect(res.status).toBe(303);
    expect(await participantRow(ev, ada)).not.toContain('data-pairing-flag');
  });

  // Defect caught: the named member is blocked from choosing someone else,
  // which would let anyone lock a player out of their own choice.
  it('lets the named member choose someone else, leaving both entries flagged', async () => {
    const ev = seedEvent();
    await enterDoubles(ev, ada, wren);
    expect((await enterDoubles(ev, wren, fay)).status).toBe(303);
    expect(partnerOf(ev, wren)).toBe(fay);
    expect(await participantRow(ev, ada)).toContain('data-pairing-flag');
  });

  // Defect caught: the entrant's own event page shows an unmatched entry as
  // if the pair were agreed, and goes on saying so once it is.
  it('tells the entrant on their event page until the partner names them back', async () => {
    const ev = seedEvent();
    await enterDoubles(ev, ada, wren);
    expect((await get(ada, `/events/${ev.key}`)).text).toContain('data-pairing-note');
    await enterDoubles(ev, wren, ada);
    expect((await get(ada, `/events/${ev.key}`)).text).not.toContain('data-pairing-note');
  });
});

describe('a partner left behind', () => {
  // Defect caught: a withdrawing member's partner keeps an entry naming
  // someone no longer entered and is never told, or a member who named the
  // withdrawer one-sidedly has their own choice wiped.
  it('clears and emails a partner whose entry named the withdrawing member, and only them', async () => {
    const ev = seedEvent();
    await enterDoubles(ev, ada, wren);
    await enterDoubles(ev, wren, ada);
    await enterDoubles(ev, fay, ada);  // Fay named Ada, who never named her
    const res = await post(ada, `/events/${ev.key}/withdraw`, { confirmed: '1' });
    expect(res.status).toBe(303);
    expect(partnerOf(ev, wren)).toBeNull();
    expect(mailCount('event_partner_left', wren, ev)).toBe(1);
    expect(partnerOf(ev, fay)).toBe(ada);
    expect(mailCount('event_partner_left', fay, ev)).toBe(0);
  });

  // Defect caught: a member's withdrawal wipes the choice of a partner whose
  // own entry named somebody else, and mails them about a pairing they never made.
  it('leaves a partner who named someone else untouched', async () => {
    const ev = seedEvent();
    await enterDoubles(ev, ada, wren);
    await enterDoubles(ev, wren, fay);
    expect((await post(ada, `/events/${ev.key}/withdraw`, { confirmed: '1' })).status).toBe(303);
    expect(partnerOf(ev, wren)).toBe(fay);
    expect(mailCount('event_partner_left', wren, ev)).toBe(0);
  });

  // Defect caught: a partner who already withdrew has their canceled entry
  // rewritten and is emailed about an event they left.
  it('leaves a partner who already withdrew untouched', async () => {
    const ev = seedEvent();
    withDb((db) => {
      const w = insertRegistration(db, ev.id, wren, { status: 'canceled', cancel_reason: 'Withdrawn by the member' });
      insertRegistrationDisciplineSelection(db, w, ev.women, { partner_member_id: ada });
    });
    await enterDoubles(ev, ada, wren);
    expect((await post(ada, `/events/${ev.key}/withdraw`, { confirmed: '1' })).status).toBe(303);
    expect(partnerOf(ev, wren)).toBe(ada);
    expect(mailCount('event_partner_left', wren, ev)).toBe(0);
  });
});

describe('choosing a partner from the event page', () => {
  const pathOf = (ev: SeededEvent) => `/events/${ev.key}/registration/partner`;

  // Defect caught: a member registered as looking can only pair up by
  // withdrawing, or the save does not tell the new partner.
  it('saves a partner chosen in place and tells them', async () => {
    const ev = seedEvent();
    await enterDoubles(ev, ada, null);
    const eventPage = await get(ada, `/events/${ev.key}`);
    expect(eventPage.text).toContain(`href="${pathOf(ev)}"`);
    const form = await get(ada, pathOf(ev));
    expect(form.status).toBe(200);
    expect(form.text).toContain(`action="${pathOf(ev)}"`);
    const res = await post(ada, pathOf(ev), { partner_division: [ev.women], partner: [wren] });
    expect(res.status).toBe(303);
    expect((await landedOn(ada, res)).text).toContain('form-success-banner');
    expect(partnerOf(ev, ada)).toBe(wren);
    expect(registrationOf(ev.id, ada).status).toBe('confirmed');
    expect(mailCount('event_partner_named', wren, ev)).toBe(1);
  });

  // Defect caught: changing partner leaves the old partner's entry naming the
  // member, or tells nobody.
  it('releases and tells the old partner on a change, and tells the new one', async () => {
    const ev = seedEvent();
    await enterDoubles(ev, ada, wren);
    await enterDoubles(ev, wren, ada);
    const res = await post(ada, pathOf(ev), { partner_division: [ev.women], partner: [gwen] });
    expect(res.status).toBe(303);
    expect(partnerOf(ev, ada)).toBe(gwen);
    expect(partnerOf(ev, wren)).toBeNull();
    expect(mailCount('event_partner_left', wren, ev)).toBe(1);
    expect(mailCount('event_partner_named', gwen, ev)).toBe(1);
  });

  // Defect caught: a second submit of the same choice mails again or reports
  // a change, or the page stays open once registration stops.
  it('takes a repeat as the first save, and closes when registration stops', async () => {
    const ev = seedEvent();
    await enterDoubles(ev, ada, null);
    const body = { partner_division: [ev.women], partner: [fay] };
    expect((await post(ada, pathOf(ev), body)).status).toBe(303);
    const outbox = () => (withDb((db) => db.prepare('SELECT COUNT(*) c FROM outbox_emails').get()) as { c: number }).c;
    const before = outbox();
    const again = await post(ada, pathOf(ev), body);
    expect(again.status).toBe(303);
    expect((await landedOn(ada, again)).text).toContain('form-success-banner');
    expect(outbox()).toBe(before);

    withDb((db) => db.prepare("UPDATE events SET registration_status = 'closed' WHERE id = ?").run(ev.id));
    expect((await get(ada, pathOf(ev))).status).toBe(303);
    expect((await get(ada, `/events/${ev.key}`)).text).not.toContain(`href="${pathOf(ev)}"`);
    const late = await post(ada, pathOf(ev), { partner_division: [ev.women], partner: [gwen] });
    // The form is gone once registration stops, so the refusal lands on the event page.
    expect(late.status).toBe(303);
    expect((await landedOn(ada, late)).text).toContain('form-error-banner');
    expect(partnerOf(ev, ada)).toBe(fay);
  });

  // Defect caught: the page opens for a member with no confirmed doubles
  // entry, letting them write a partner onto nothing.
  it('is not found for a member without a confirmed doubles entry', async () => {
    const ev = seedEvent();
    expect((await get(ada, pathOf(ev))).status).toBe(404);
    await post(ada, `/events/${ev.key}/register`, { registration_type: 'competitor', division: [ev.singles] });
    expect((await get(ada, pathOf(ev))).status).toBe(404);
    expect((await post(ada, pathOf(ev), { partner_division: [ev.women], partner: [wren] })).status).toBe(404);
    // A doubles entry still waiting for payment is not yet one the member can change.
    withDb((db) => {
      const p = insertRegistration(db, ev.id, gwen, { status: 'pending' });
      insertRegistrationDisciplineSelection(db, p, ev.women);
    });
    expect((await get(gwen, pathOf(ev))).status).toBe(404);
  });
});

describe('results upload', () => {
  // Defect caught: results are published for a doubles pair whose partner's
  // own registration named someone else, so the result credits an entry the
  // registrations never agreed.
  it('refuses a row for an entry whose partner named someone else, and accepts the pair once they agree', async () => {
    const ev = seedEvent({ startInDays: -2 });
    const [adaReg, wrenReg] = withDb((db) => {
      const a = insertRegistration(db, ev.id, ada, { status: 'confirmed' });
      insertRegistrationDisciplineSelection(db, a, ev.women, { partner_member_id: wren });
      const w = insertRegistration(db, ev.id, wren, { status: 'confirmed' });
      const sel = insertRegistrationDisciplineSelection(db, w, ev.women, { partner_member_id: fay });
      return [a, sel];
    });
    expect(adaReg).toBeTruthy();
    const csv = "division,category,place,player,partner,score\nOpen Women's Doubles Footbag Net,,1,Member pr-ada,Member pr-wren,\n";
    const commit = () => request(createApp()).post(`/events/${ev.key}/results`).set('Cookie', cookieFor(olive))
      .field('results_text', csv).field('filename', 'results.csv').field('step', 'commit');
    const entries = () => (withDb((db) => db.prepare('SELECT COUNT(*) c FROM event_result_entries WHERE event_id = ?').get(ev.id)) as { c: number }).c;
    expect((await commit()).status).toBe(422);
    expect(entries()).toBe(0);
    withDb((db) => db.prepare('UPDATE registration_discipline_selections SET partner_member_id = ? WHERE id = ?').run(ada, wrenReg));
    expect((await commit()).status).toBe(303);
    expect(entries()).toBe(1);
  });
});
