/**
 * Correcting an event's registrations at the event: the organizers' Add
 * Entrant and Edit Entry, and an administrator's same corrections on any
 * event.
 *
 * The contract: the participant list groups the confirmed entries by
 * division with a count and an Edit Entry link per entry. Corrections are
 * open from the start of registration until results are uploaded, whatever
 * the deadline or the online-registration switch says. Add Entrant registers
 * a member chosen from the member search, confirmed at once and never sent to
 * checkout; Edit Entry changes divisions, doubles partners and whether the
 * fee was paid at the event. A partner an entry stops naming keeps their own
 * entry naming nobody, flagged on the list and refused by the results upload
 * until corrected. Each save writes one audit row and one email to the
 * member, and the same form submitted twice changes nothing more. Only the
 * event's organizers reach the organizer pages; an administrator previews and
 * gives a reason before anything is written.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { flashCookieOf, flashValueOf } from '../fixtures/flashCookie';
import { isoDaysFromNow } from '../fixtures/clock';
import { spendMemberSearchAllowance, retryAfterIsAWait } from '../fixtures/memberSearchLimit';
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
  insertResultsUpload,
  insertResultEntry,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4997');

let createApp: Awaited<ReturnType<typeof importApp>>;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function cookieFor(memberId: string, admin = false): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, ...(admin ? { role: 'admin' as const } : {}) })}`;
}

function makeMember(id: string, name: string): string {
  return withDb((db) => {
    createMemberAtTier(db, {
      id, slug: id.replace(/-/g, '_'), tier: 'tier1',
      memberOverrides: { display_name: name, login_email: `${id}@example.com` },
    });
    completeOnboarding(db, id);
    return id;
  });
}

const day = (iso: string): string => iso.slice(0, 10);

interface SeededEvent { id: string; base: string; record: string; singles: string; doubles: string }

function seedEvent(o: {
  startInDays?: number; deadlineInDays?: number | null; paused?: boolean; fee?: boolean;
} = {}): SeededEvent {
  return withDb((db) => {
    const start = day(isoDaysFromNow(o.startInDays ?? 30));
    const id = insertEvent(db, {
      title: `Corrections Test ${Math.random().toString(36).slice(2, 8)}`,
      status: 'reg_open',
      start_date: start,
      end_date: start,
      registration_deadline: o.deadlineInDays === undefined || o.deadlineInDays === null ? null : day(isoDaysFromNow(o.deadlineInDays)),
      registration_status: o.paused ? 'closed' : 'open',
      ...(o.fee ? { competitor_fee_cents: 2500, payment_enabled: 1, sanction_status: 'approved' } : {}),
    });
    insertEventOrganizer(db, id, olive);
    const singles = insertDiscipline(db, id, { name: 'Open Singles Footbag Net', discipline_category: 'net', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', sort_order: 1 });
    const doubles = insertDiscipline(db, id, { name: 'Open Doubles Footbag Net', discipline_category: 'net', team_type: 'doubles', gender_eligibility: 'open', division_class: 'open', sort_order: 2 });
    const tag = (db.prepare('SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?').get(id) as { tag_normalized: string }).tag_normalized;
    return { id, base: `/events/${tag.slice(1)}`, record: `/admin/events/${id}`, singles, doubles };
  });
}

function enter(ev: SeededEvent, memberId: string, division: string, partner: string | null = null): string {
  return withDb((db) => {
    const reg = insertRegistration(db, ev.id, memberId, { status: 'confirmed' });
    insertRegistrationDisciplineSelection(db, reg, division, { partner_member_id: partner });
    return reg;
  });
}

function post(memberId: string, path: string, body: Record<string, string | string[]> = {}, admin = false) {
  return request(createApp()).post(path).set('Cookie', cookieFor(memberId, admin)).type('form').send(body);
}

function get(memberId: string, path: string, admin = false) {
  return request(createApp()).get(path).set('Cookie', cookieFor(memberId, admin));
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

function audits(eventId: string, action: string): number {
  return count('SELECT COUNT(*) c FROM audit_entries WHERE entity_id = ? AND action_type = ?', eventId, action);
}

// The notices one event's acts sent a member: each is keyed on the act's audit
// row, so a member entered in several events is counted per event.
function mailTo(template: string, memberId: string, eventId: string): number {
  return count(
    `SELECT COUNT(*) c FROM outbox_emails o
      WHERE o.template_key = ? AND o.recipient_member_id = ?
        AND EXISTS (SELECT 1 FROM audit_entries a WHERE a.entity_id = ? AND o.idempotency_key = o.template_key || ':' || a.id || ':' || o.recipient_member_id)`,
    template, memberId, eventId,
  );
}

// The one notice an event's act sent a member, by the same act-keyed match.
function mailBody(template: string, memberId: string, eventId: string): string {
  return one<{ body_text: string }>(
    `SELECT o.body_text FROM outbox_emails o
      WHERE o.template_key = ? AND o.recipient_member_id = ?
        AND EXISTS (SELECT 1 FROM audit_entries a WHERE a.entity_id = ? AND o.idempotency_key = o.template_key || ':' || a.id || ':' || o.recipient_member_id)`,
    template, memberId, eventId,
  ).body_text;
}

function registrationOf(eventId: string, memberId: string) {
  return one<{ id: string; status: string; payment_id: string | null; created_by: string; paid_at_event_at: string | null; paid_at_event_marked_by_member_id: string | null } | undefined>(
    'SELECT id, status, payment_id, created_by, paid_at_event_at, paid_at_event_marked_by_member_id FROM registrations WHERE event_id = ? AND member_id = ?',
    eventId, memberId,
  );
}

function entriesOf(registrationId: string): Array<{ discipline_id: string; partner_member_id: string | null }> {
  return withDb((db) => db.prepare(
    'SELECT discipline_id, partner_member_id FROM registration_discipline_selections WHERE registration_id = ? ORDER BY discipline_id',
  ).all(registrationId) as Array<{ discipline_id: string; partner_member_id: string | null }>);
}

// The rows a correction may write, counted together so a repeat that writes
// any of them shows.
function writes(eventId: string): string {
  return JSON.stringify([
    count('SELECT COUNT(*) c FROM registrations WHERE event_id = ?', eventId),
    count('SELECT COUNT(*) c FROM registration_discipline_selections s JOIN registrations r ON r.id = s.registration_id WHERE r.event_id = ?', eventId),
    count('SELECT COUNT(*) c FROM audit_entries WHERE entity_id = ?', eventId),
    count("SELECT COUNT(*) c FROM outbox_emails WHERE template_key LIKE 'event_registration_%'"),
    count('SELECT COUNT(*) c FROM payments'),
  ]);
}

let olive = '';
let otto = '';
let ada = '';
let bo = '';
let cy = '';
let dee = '';
let adam = '';

beforeAll(async () => {
  createTestDb(dbPath);
  olive = makeMember('corr-olive', 'Olive Organizer');
  otto = makeMember('corr-otto', 'Otto Organizer');
  ada = makeMember('corr-ada', 'Ada Walkup');
  bo = makeMember('corr-bo', 'Bo Partner');
  cy = makeMember('corr-cy', 'Cy Swap');
  dee = makeMember('corr-dee', 'Dee Outsider');
  adam = withDb((db) => insertMember(db, {
    id: 'corr-adam', slug: 'corr_adam', display_name: 'Adam Admin', login_email: 'corr-adam@example.com', is_admin: 1,
  }));
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the participant list, grouped by division', () => {
  it('groups confirmed entries by division with a count, flags a partnerless doubles entry, and links each entry to its edit page', async () => {
    // Defect caught: the organizer cannot see who is entered in each division
    // or how many, a doubles entry with no partner looks complete until the
    // results upload fails, or an entry has no way to its edit page.
    const ev = seedEvent();
    const adaReg = enter(ev, ada, ev.singles);
    const boReg = enter(ev, bo, ev.singles);
    const cyReg = enter(ev, cy, ev.doubles);
    withDb((db) => insertRegistration(db, ev.id, dee, { status: 'pending' }));
    const res = await get(olive, `${ev.base}/participants`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Open Singles Footbag Net: 2 Confirmed');
    expect(res.text).toContain('Open Doubles Footbag Net: 1 Confirmed');
    for (const reg of [adaReg, boReg, cyReg]) {
      expect(res.text, reg).toContain(`href="${ev.base}/participants/${reg}/edit"`);
    }
    const doublesRow = res.text.slice(res.text.indexOf(`data-registration-id="${cyReg}"`));
    expect(doublesRow.slice(0, doublesRow.indexOf('</tr>'))).toContain('data-no-partner');
    const singlesRow = res.text.slice(res.text.indexOf(`data-registration-id="${adaReg}"`));
    expect(singlesRow.slice(0, singlesRow.indexOf('</tr>'))).not.toContain('data-no-partner');
    expect(res.text).toContain(`href="${ev.base}/participants/add"`);
  });
});

describe('Add Entrant', () => {
  it('registers a walk-up after the deadline and while online registration is paused, confirmed with no checkout', async () => {
    // Defect caught: the deadline or the pause that stops members registering
    // themselves also stops the organizer adding a walk-up at the table, or the
    // walk-up is left pending or sent to a checkout.
    const ev = seedEvent({ deadlineInDays: -1, paused: true });
    const form = await get(olive, `${ev.base}/participants/add`);
    expect(form.status).toBe(200);
    expect(form.text).toContain(`action="${ev.base}/participants/add"`);
    expect(form.text).toContain('name="pick_q"');
    const res = await post(olive, `${ev.base}/participants/add`, { member_id: ada, division: ev.singles });
    expect(res.status).toBe(303);
    const reg = registrationOf(ev.id, ada)!;
    expect(reg).toMatchObject({ status: 'confirmed', payment_id: null, created_by: olive });
    expect(res.headers.location).toBe(`${ev.base}/participants?entry=${reg.id}`);
    expect(entriesOf(reg.id)).toEqual([{ discipline_id: ev.singles, partner_member_id: null }]);
    expect(count('SELECT COUNT(*) c FROM payments WHERE member_id = ?', ada)).toBe(0);
    const audit = one<{ actor_member_id: string; actor_type: string; metadata_json: string }>(
      "SELECT actor_member_id, actor_type, metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'event.registration_added'", ev.id,
    );
    expect(audit).toMatchObject({ actor_member_id: olive, actor_type: 'member' });
    expect(JSON.parse(audit.metadata_json)).toMatchObject({ registration_id: reg.id, member_id: ada, after: { division_ids: [ev.singles] } });
    expect(mailTo('event_registration_added', ada, ev.id)).toBe(1);
    // The list it lands on shows the entry, with an Edit Entry link beside the notice.
    const landed = await landedOn(olive, res);
    expect(landed.text).toContain(`data-registration-id="${reg.id}"`);
    expect(landed.text.match(new RegExp(`href="${ev.base}/participants/${reg.id}/edit"`, 'g'))?.length).toBe(2);
  });

  it('draws the form again on a picker step and writes nothing, offering the member to choose', async () => {
    // Defect caught: a member search or a Choose saves a half-made entry, or
    // the search never offers the member the organizer is looking for.
    const ev = seedEvent();
    const before = writes(ev.id);
    const searched = await post(olive, `${ev.base}/participants/add`, { pick: 'search:entrant', pick_q: 'Ada Walk', member_id: '' });
    expect(searched.status).toBe(200);
    expect(searched.text).toContain(`value="choose:entrant:${ada}"`);
    const chosen = await post(olive, `${ev.base}/participants/add`, { pick: `choose:entrant:${ada}`, member_id: '' });
    expect(chosen.status).toBe(200);
    expect(chosen.text).toContain(`name="member_id" value="${ada}"`);
    // A partner chosen on Add Entrant can be changed; Remove belongs to Edit Entry.
    const partnered = await post(olive, `${ev.base}/participants/add`, {
      member_id: ada, partner_division: ev.doubles, partner: '', pick: `choose:partner-${ev.doubles}:${bo}`,
    });
    expect(partnered.text).toContain(`name="partner" value="${bo}"`);
    expect(partnered.text).not.toContain(`value="remove:partner-${ev.doubles}"`);
    expect(writes(ev.id)).toBe(before);
    // The form as rendered, with a division ticked, then saves.
    const saved = await post(olive, `${ev.base}/participants/add`, { member_id: ada, division: ev.singles });
    expect(saved.status).toBe(303);
    expect(registrationOf(ev.id, ada)?.status).toBe('confirmed');
  });

  it('reports the first outcome on a repeat, and another organizer\'s identical add as already held, writing nothing more', async () => {
    // Defect caught: a double click registers twice, emails twice or audits
    // twice, or a co-organizer's identical add is told it caused the change.
    const ev = seedEvent();
    withDb((db) => insertEventOrganizer(db, ev.id, otto));
    const body = { member_id: ada, division: ev.singles };
    const first = await post(olive, `${ev.base}/participants/add`, body);
    const after = writes(ev.id);
    const again = await post(olive, `${ev.base}/participants/add`, body);
    expect(again.status).toBe(303);
    expect(again.headers.location).toBe(first.headers.location);
    expect(flashValueOf(again)).toBe(flashValueOf(first));
    expect(writes(ev.id)).toBe(after);
    const other = await post(otto, `${ev.base}/participants/add`, body);
    expect(other.status).toBe(303);
    expect(flashValueOf(other)).toContain(':i:');
    expect(writes(ev.id)).toBe(after);
  });

  it('refuses a member already registered with different entries, pointing at their entry', async () => {
    // Defect caught: a member is registered twice, or their entry silently
    // replaced, instead of the organizer being sent to edit it.
    const ev = seedEvent();
    const reg = enter(ev, ada, ev.singles);
    const before = writes(ev.id);
    const res = await post(olive, `${ev.base}/participants/add`, { member_id: ada, division: ev.doubles });
    expect(res.status).toBe(422);
    expect(res.text).toContain(`href="${ev.base}/participants/${reg}/edit"`);
    expect(writes(ev.id)).toBe(before);
  });

  it('is refused once results are uploaded, and the list stops offering it', async () => {
    // Defect caught: an entry is added or changed after results were recorded
    // against the registrations, so the two no longer agree.
    const ev = seedEvent();
    const reg = enter(ev, bo, ev.singles);
    withDb((db) => insertResultEntry(db, ev.id, insertResultsUpload(db, ev.id, olive), ev.singles));
    const before = writes(ev.id);
    const res = await post(olive, `${ev.base}/participants/add`, { member_id: ada, division: ev.singles });
    expect(res.status).toBe(303);
    expect(flashValueOf(res)).toContain(':n:');
    expect((await get(olive, `${ev.base}/participants/add`)).status).toBe(303);
    expect((await get(olive, `${ev.base}/participants/${reg}/edit`)).status).toBe(303);
    const edit = await post(olive, `${ev.base}/participants/${reg}/edit`, { division: ev.doubles });
    expect(edit.status).toBe(303);
    expect(flashValueOf(edit)).toContain(':n:');
    expect(entriesOf(reg)).toEqual([{ discipline_id: ev.singles, partner_member_id: null }]);
    expect(writes(ev.id)).toBe(before);
    const list = await get(olive, `${ev.base}/participants`);
    expect(list.text).not.toContain(`href="${ev.base}/participants/add"`);
    expect(list.text).not.toContain(`/participants/${reg}/edit`);
  });

  it('answers not-found to a member who does not organize the event', async () => {
    // Defect caught: any signed-in member can add entrants to, or read the
    // entries of, an event they do not run.
    const ev = seedEvent();
    const reg = enter(ev, bo, ev.singles);
    expect((await get(dee, `${ev.base}/participants/add`)).status).toBe(404);
    expect((await post(dee, `${ev.base}/participants/add`, { member_id: ada, division: ev.singles })).status).toBe(404);
    expect((await get(dee, `${ev.base}/participants/${reg}/edit`)).status).toBe(404);
    expect((await post(dee, `${ev.base}/participants/${reg}/edit`, { division: ev.doubles })).status).toBe(404);
    expect(registrationOf(ev.id, ada)).toBeUndefined();
    expect(entriesOf(reg)).toEqual([{ discipline_id: ev.singles, partner_member_id: null }]);
  });
});

describe('Paid at the event', () => {
  it('records a fee collected at the table with no payment and no checkout, and shows it on the list', async () => {
    // Defect caught: an organizer-added entrant on a paid event is sent to
    // online checkout or charged, or the cash they paid is not recorded.
    const ev = seedEvent({ fee: true });
    const form = await get(olive, `${ev.base}/participants/add`);
    expect(form.text).toContain('name="paid_at_event"');
    const res = await post(olive, `${ev.base}/participants/add`, { member_id: ada, division: ev.singles, paid_at_event: ['0', '1'] });
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain(`${ev.base}/participants`);
    const reg = registrationOf(ev.id, ada)!;
    expect(reg).toMatchObject({ status: 'confirmed', payment_id: null, paid_at_event_marked_by_member_id: olive });
    expect(reg.paid_at_event_at).not.toBeNull();
    expect(count('SELECT COUNT(*) c FROM payments WHERE member_id = ?', ada)).toBe(0);
    const list = await get(olive, `${ev.base}/participants`);
    const row = list.text.slice(list.text.indexOf(`data-registration-id="${reg.id}"`));
    expect(row.slice(0, row.indexOf('</tr>'))).toContain('Paid at the event');
  });

  it('shows an entrant added unpaid on a paid event as not paid, everywhere organizers read payment', async () => {
    // Defect caught: an organizer sees "No fee" for a walk-up who owes the
    // entry fee and has not paid it, on the list, the export or the sheet.
    const ev = seedEvent({ fee: true });
    await post(olive, `${ev.base}/participants/add`, { member_id: ada, division: ev.singles, paid_at_event: '0' });
    const reg = registrationOf(ev.id, ada)!;
    const list = await get(olive, `${ev.base}/participants`);
    const row = list.text.slice(list.text.indexOf(`data-registration-id="${reg.id}"`));
    expect(row.slice(0, row.indexOf('</tr>'))).toContain('Not paid');
    expect(row.slice(0, row.indexOf('</tr>'))).not.toContain('No fee');
    const csv = await get(olive, `${ev.base}/participants.csv`);
    const line = csv.text.split('\n').find((l) => l.includes('Ada Walkup')) ?? '';
    expect(line).toContain('Not paid');
    // The same entrant on a free event owes nothing.
    const free = seedEvent();
    const freeReg = enter(free, ada, free.singles);
    const freeList = await get(olive, `${free.base}/participants`);
    const freeRow = freeList.text.slice(freeList.text.indexOf(`data-registration-id="${freeReg}"`));
    expect(freeRow.slice(0, freeRow.indexOf('</tr>'))).toContain('No fee');
  });

  it('is not offered on a free event, and a posted mark is ignored there', async () => {
    // Defect caught: a free event's form asks about a fee nobody owes, or a
    // crafted post records a fee on an event that charges none.
    const ev = seedEvent();
    expect((await get(olive, `${ev.base}/participants/add`)).text).not.toContain('name="paid_at_event"');
    await post(olive, `${ev.base}/participants/add`, { member_id: ada, division: ev.singles, paid_at_event: '1' });
    expect(registrationOf(ev.id, ada)?.paid_at_event_at).toBeNull();
  });

  it('keeps a mark already recorded when a free event\'s entry is edited without the box', async () => {
    // Defect caught: editing an entry on a form that offers no Paid at the
    // event box silently erases a mark recorded on the registration.
    const ev = seedEvent();
    const reg = withDb((db) => {
      const id = insertRegistration(db, ev.id, ada, { status: 'confirmed', paid_at_event_at: isoDaysFromNow(-1), paid_at_event_marked_by_member_id: olive });
      insertRegistrationDisciplineSelection(db, id, ev.singles);
      return id;
    });
    expect((await post(olive, `${ev.base}/participants/${reg}/edit`, { division: ev.doubles })).status).toBe(303);
    expect(entriesOf(reg)).toEqual([{ discipline_id: ev.doubles, partner_member_id: null }]);
    expect(registrationOf(ev.id, ada)?.paid_at_event_at).not.toBeNull();
  });

  it('records the mark on an existing entry when that is the only change', async () => {
    // Defect caught: ticking Paid at the event on an entry whose divisions
    // stay the same is read as nothing to change and is never saved.
    const ev = seedEvent({ fee: true });
    const reg = enter(ev, ada, ev.singles);
    const res = await post(olive, `${ev.base}/participants/${reg}/edit`, { division: ev.singles, paid_at_event: ['0', '1'] });
    expect(res.status).toBe(303);
    expect(registrationOf(ev.id, ada)).toMatchObject({ paid_at_event_marked_by_member_id: olive, payment_id: null });
    expect(audits(ev.id, 'event.registration_corrected')).toBe(1);
  });

  it('clears a stale mark when a member whose registration was canceled is added again unpaid', async () => {
    // Defect caught: a member re-added on their old canceled row shows as
    // paid at the event from a mark that belonged to the canceled registration.
    const ev = seedEvent({ fee: true });
    const old = withDb((db) => insertRegistration(db, ev.id, ada, {
      status: 'canceled', cancel_reason: 'Withdrawn by the member', canceled_at: isoDaysFromNow(-2),
      paid_at_event_at: isoDaysFromNow(-3), paid_at_event_marked_by_member_id: olive,
    }));
    const res = await post(olive, `${ev.base}/participants/add`, { member_id: ada, division: ev.singles, paid_at_event: '0' });
    expect(res.status).toBe(303);
    expect(registrationOf(ev.id, ada)).toMatchObject({ id: old, status: 'confirmed', paid_at_event_at: null });
  });
});

describe('Edit Entry', () => {
  it('moves a competitor between divisions, writing one audit row and one email', async () => {
    // Defect caught: a division move is not saved, is saved without a trail,
    // or the member is never told.
    const ev = seedEvent();
    const reg = enter(ev, ada, ev.singles);
    const form = await get(olive, `${ev.base}/participants/${reg}/edit`);
    expect(form.status).toBe(200);
    expect(form.text).toContain(`action="${ev.base}/participants/${reg}/edit"`);
    const res = await post(olive, `${ev.base}/participants/${reg}/edit`, {
      division: ev.doubles, partner_division: ev.doubles, partner: cy,
    });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`${ev.base}/participants?entry=${reg}`);
    expect(entriesOf(reg)).toEqual([{ discipline_id: ev.doubles, partner_member_id: cy }]);
    expect(audits(ev.id, 'event.registration_corrected')).toBe(1);
    const meta = JSON.parse(one<{ metadata_json: string }>(
      "SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'event.registration_corrected'", ev.id,
    ).metadata_json);
    expect(meta).toMatchObject({
      registration_id: reg, member_id: ada,
      before: { division_ids: [ev.singles] }, after: { division_ids: [ev.doubles], partners: { [ev.doubles]: cy } },
    });
    expect(mailTo('event_registration_corrected', ada, ev.id)).toBe(1);
  });

  it('swaps a doubles partner, leaving the old partner\'s own entry with no partner and flagged', async () => {
    // Defect caught: after a partner swap the old partner's entry still names
    // the entrant, so two entries claim one player and the list shows nothing wrong.
    const ev = seedEvent();
    const adaReg = enter(ev, ada, ev.doubles, bo);
    const boReg = enter(ev, bo, ev.doubles, ada);
    const res = await post(olive, `${ev.base}/participants/${adaReg}/edit`, {
      division: ev.doubles, partner_division: ev.doubles, partner: cy,
    });
    expect(res.status).toBe(303);
    expect(entriesOf(adaReg)).toEqual([{ discipline_id: ev.doubles, partner_member_id: cy }]);
    expect(entriesOf(boReg)).toEqual([{ discipline_id: ev.doubles, partner_member_id: null }]);
    const list = await get(olive, `${ev.base}/participants`);
    const row = list.text.slice(list.text.indexOf(`data-registration-id="${boReg}"`));
    expect(row.slice(0, row.indexOf('</tr>'))).toContain('data-no-partner');
    expect(audits(ev.id, 'event.registration_corrected')).toBe(1);
    expect(mailTo('event_registration_corrected', ada, ev.id)).toBe(1);
    // The old partner's registration changed too, so they are told, once,
    // naming the division whose entry now has no partner.
    expect(mailTo('event_registration_corrected', bo, ev.id)).toBe(1);
    expect(mailTo('event_registration_corrected', cy, ev.id)).toBe(0);
    expect(mailBody('event_registration_corrected', bo, ev.id)).toContain('Open Doubles Footbag Net');
  });

  // Defect caught: a refused entrant or partner search on the organizer's
  // forms answered as a success, so a client hammering the picker is never
  // told to stop or how long to wait.
  it('answers a refused search on Add Entrant and Edit Entry at 429 with a wait, the form re-rendered with the notice', async () => {
    const ev = seedEvent();
    const reg = enter(ev, ada, ev.doubles, null);
    await spendMemberSearchAllowance(olive);
    const added = await post(olive, `${ev.base}/participants/add`, { pick: 'search:entrant', pick_q: 'Ada Walk', member_id: '' });
    const edited = await post(olive, `${ev.base}/participants/${reg}/edit`, {
      division: ev.doubles, partner_division: ev.doubles, partner: '', pick: `search:partner-${ev.doubles}`, pick_q: 'Bo',
    });
    for (const [name, res, intent] of [['add', added, 'search:entrant'], ['edit', edited, `search:partner-${ev.doubles}`]] as const) {
      expect(res.status, name).toBe(429);
      expect(retryAfterIsAWait(res.headers['retry-after']), `${name}: ${String(res.headers['retry-after'])}`).toBe(true);
      expect(res.text, name).toContain(`value="${intent}"`);
      expect(res.text, name).toContain('form-error-banner');
    }
  });

  it('removes a partner with the picker\'s Remove, leaving the entry partnerless', async () => {
    // Defect caught: once chosen, a doubles partner can never be cleared, or
    // Remove saves the entry before the organizer submits it.
    const ev = seedEvent();
    const reg = enter(ev, ada, ev.doubles, bo);
    const form = await get(olive, `${ev.base}/participants/${reg}/edit`);
    expect(form.text).toContain(`value="remove:partner-${ev.doubles}"`);
    const before = writes(ev.id);
    const removed = await post(olive, `${ev.base}/participants/${reg}/edit`, {
      division: ev.doubles, partner_division: ev.doubles, partner: bo, pick: `remove:partner-${ev.doubles}`,
    });
    expect(removed.status).toBe(200);
    expect(removed.text).not.toContain(`name="partner" value="${bo}"`);
    expect(writes(ev.id)).toBe(before);
    const saved = await post(olive, `${ev.base}/participants/${reg}/edit`, {
      division: ev.doubles, partner_division: ev.doubles, partner: '',
    });
    expect(saved.status).toBe(303);
    expect(entriesOf(reg)).toEqual([{ discipline_id: ev.doubles, partner_member_id: null }]);
  });

  it('reaches only a confirmed competitor entry', async () => {
    // Defect caught: a canceled registration, one waiting at checkout, or an
    // attendee's registration is reshaped through Edit Entry, bypassing the
    // payment and registration rules that govern them.
    const ev = seedEvent();
    const rows = withDb((db) => [
      insertRegistration(db, ev.id, ada, { status: 'canceled', cancel_reason: 'Withdrawn by the member', canceled_at: isoDaysFromNow(-1) }),
      insertRegistration(db, ev.id, bo, { status: 'pending' }),
      insertRegistration(db, ev.id, cy, { status: 'confirmed', registration_type: 'attendee_supporter' }),
    ]);
    for (const reg of rows) {
      expect((await get(olive, `${ev.base}/participants/${reg}/edit`)).status, reg).toBe(404);
      expect((await post(olive, `${ev.base}/participants/${reg}/edit`, { division: ev.singles })).status, reg).toBe(404);
      expect(entriesOf(reg), reg).toEqual([]);
    }
  });

  it('keeps the entrant\'s Amateur choice in a division they stay in', async () => {
    // Defect caught: an organizer's correction quietly turns an Amateur entry
    // into a prize-money entry.
    const ev = seedEvent();
    const prize = withDb((db) => insertDiscipline(db, ev.id, {
      name: 'Open Singles Routines', discipline_category: 'freestyle', team_type: 'singles',
      gender_eligibility: 'open', division_class: 'open', offers_prize_money: 1, sort_order: 3,
    }));
    const reg = withDb((db) => {
      const id = insertRegistration(db, ev.id, ada, { status: 'confirmed' });
      insertRegistrationDisciplineSelection(db, id, prize, { enters_as_amateur: 1 });
      return id;
    });
    expect((await post(olive, `${ev.base}/participants/${reg}/edit`, { division: [prize, ev.singles] })).status).toBe(303);
    expect(count('SELECT COUNT(*) c FROM registration_discipline_selections WHERE registration_id = ? AND discipline_id = ? AND enters_as_amateur = 1', reg, prize)).toBe(1);
  });

  it('refuses the entrant as their own partner', async () => {
    // Defect caught: a crafted post names the entrant as their own doubles
    // partner, an entry the member search never offers.
    const ev = seedEvent();
    const reg = enter(ev, ada, ev.singles);
    const before = writes(ev.id);
    const res = await post(olive, `${ev.base}/participants/${reg}/edit`, { division: ev.doubles, partner_division: ev.doubles, partner: ada });
    expect(res.status).toBe(422);
    expect(writes(ev.id)).toBe(before);
  });

  it('changes nothing more on a repeat submit, reporting the first outcome', async () => {
    // Defect caught: a double click on Save Entry emails the member twice or
    // writes a second audit row.
    const ev = seedEvent();
    const reg = enter(ev, ada, ev.singles);
    const body = { division: [ev.singles, ev.doubles], partner_division: ev.doubles, partner: bo };
    const first = await post(olive, `${ev.base}/participants/${reg}/edit`, body);
    const after = writes(ev.id);
    const again = await post(olive, `${ev.base}/participants/${reg}/edit`, body);
    expect(again.status).toBe(303);
    expect(flashValueOf(again)).toBe(flashValueOf(first));
    expect(writes(ev.id)).toBe(after);
  });

  it('offers removing the entry through the registration\'s cancellation, with its reason and email', async () => {
    // Defect caught: an entry is removed with no reason and no notice, outside
    // the cancellation the organizer's other removals go through.
    const ev = seedEvent();
    const reg = enter(ev, ada, ev.singles);
    const form = await get(olive, `${ev.base}/participants/${reg}/edit`);
    const action = `${ev.base}/registrations/${reg}/cancel`;
    expect(form.text).toContain(`action="${action}"`);
    const res = await post(olive, action, { reason: 'Did not turn up', confirmed: '1' });
    expect(res.status).toBe(303);
    expect(one<{ status: string; cancel_reason: string }>('SELECT status, cancel_reason FROM registrations WHERE id = ?', reg))
      .toEqual({ status: 'canceled', cancel_reason: 'Did not turn up' });
    expect(mailTo('event_registration_canceled', ada, ev.id)).toBe(1);
  });
});

describe('results upload against the corrected registrations', () => {
  it('refuses a doubles row for an entry with no partner, and accepts it once the entry names the partner', async () => {
    // Defect caught: results are published for a doubles entry the
    // registrations say has no partner, or the correction made at the event
    // does not let the same file through.
    const ev = seedEvent({ startInDays: -2 });
    const adaReg = enter(ev, ada, ev.doubles);
    enter(ev, bo, ev.doubles, ada);
    const csv = 'division,category,place,player,partner,score\nOpen Doubles Footbag Net,,1,Ada Walkup,Bo Partner,\n';
    const commit = () => request(createApp()).post(`${ev.base}/results`).set('Cookie', cookieFor(olive))
      .field('results_text', csv).field('filename', 'results.csv').field('step', 'commit');
    const refused = await commit();
    expect(refused.status).toBe(422);
    expect(count('SELECT COUNT(*) c FROM event_result_entries WHERE event_id = ?', ev.id)).toBe(0);
    const fixed = await post(olive, `${ev.base}/participants/${adaReg}/edit`, {
      division: ev.doubles, partner_division: ev.doubles, partner: bo,
    });
    expect(fixed.status).toBe(303);
    const accepted = await commit();
    expect(accepted.status).toBe(303);
    expect(count('SELECT COUNT(*) c FROM event_result_entries WHERE event_id = ?', ev.id)).toBe(1);
  });
});

describe('an administrator\'s Add Entrant and Edit Entry', () => {
  // Defect caught: a refused entrant search on the administrator's form
  // answered as a success, unlike the same refusal on the organizer's form.
  it('answers a refused entrant search at 429 with a wait, the form re-rendered with the notice', async () => {
    const ev = seedEvent({ deadlineInDays: -1 });
    await spendMemberSearchAllowance(adam);
    const res = await post(adam, `${ev.record}/registrations/add`, { pick: 'search:entrant', pick_q: 'Ada Walk', member_id: '', reason: '' }, true);
    expect(res.status).toBe(429);
    expect(retryAfterIsAWait(res.headers['retry-after']), String(res.headers['retry-after'])).toBe(true);
    expect(res.text).toContain('value="search:entrant"');
    expect(res.text).toContain('form-error-banner');
  });

  it('adds a member after the deadline only on confirm, with the reason, the admin and the values in the audit row', async () => {
    // Defect caught: the preview writes, the write skips the reason, or the
    // trail does not say which administrator added whom to what.
    const ev = seedEvent({ deadlineInDays: -1 });
    const record = await get(adam, ev.record, true);
    expect(record.text).toContain(`href="${ev.record}/registrations/add"`);
    const form = await get(adam, `${ev.record}/registrations/add`, true);
    expect(form.status).toBe(200);
    const before = writes(ev.id);
    const preview = await post(adam, `${ev.record}/registrations/add`, { member_id: ada, division: ev.singles, reason: 'Organizer is away' }, true);
    expect(preview.status).toBe(200);
    expect(preview.text).toContain(`action="${ev.record}/registrations/add/confirm"`);
    expect(preview.text).toContain(`name="member_id" value="${ada}"`);
    expect(writes(ev.id)).toBe(before);
    const done = await post(adam, `${ev.record}/registrations/add/confirm`, {
      member_id: ada, division: ev.singles, paid_at_event: '0', reason: 'Organizer is away',
    }, true);
    expect(done.status).toBe(303);
    expect(registrationOf(ev.id, ada)?.status).toBe('confirmed');
    const audit = one<{ actor_member_id: string; actor_type: string; reason_text: string; metadata_json: string }>(
      "SELECT actor_member_id, actor_type, reason_text, metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'event.registration_added'", ev.id,
    );
    expect(audit).toMatchObject({ actor_member_id: adam, actor_type: 'admin', reason_text: 'Organizer is away' });
    expect(JSON.parse(audit.metadata_json)).toMatchObject({ before: null, after: { division_ids: [ev.singles] } });
    expect(mailTo('event_registration_added', ada, ev.id)).toBe(1);
    expect(mailBody('event_registration_added', ada, ev.id)).toContain('Organizer is away');
  });

  it('changes an entry with its before and after values, refusing it without a reason', async () => {
    // Defect caught: an administrator's correction lands with no reason, or
    // its trail cannot say what the entry was before.
    const ev = seedEvent();
    const reg = enter(ev, bo, ev.singles);
    expect((await get(adam, ev.record, true)).text).toContain(`href="${ev.record}/registrations/${reg}/edit"`);
    const body = { division: ev.doubles, partner_division: ev.doubles, partner: cy };
    const before = writes(ev.id);
    const noReason = await post(adam, `${ev.record}/registrations/${reg}/edit`, { ...body, reason: '' }, true);
    expect(noReason.status).toBe(422);
    expect(writes(ev.id)).toBe(before);
    const done = await post(adam, `${ev.record}/registrations/${reg}/edit/confirm`, { ...body, paid_at_event: '0', reason: 'Wrong division' }, true);
    expect(done.status).toBe(303);
    expect(entriesOf(reg)).toEqual([{ discipline_id: ev.doubles, partner_member_id: cy }]);
    const audit = one<{ actor_member_id: string; reason_text: string; metadata_json: string }>(
      "SELECT actor_member_id, reason_text, metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'event.registration_corrected'", ev.id,
    );
    expect(audit).toMatchObject({ actor_member_id: adam, reason_text: 'Wrong division' });
    expect(JSON.parse(audit.metadata_json)).toMatchObject({
      before: { division_ids: [ev.singles] }, after: { division_ids: [ev.doubles], partners: { [ev.doubles]: cy } },
    });
    expect(mailTo('event_registration_corrected', bo, ev.id)).toBe(1);
    expect(mailBody('event_registration_corrected', bo, ev.id)).toContain('Wrong division');
  });

  it('gives a member who is not an administrator the admin area\'s refusal', async () => {
    // Defect caught: the admin door to any event's registrations opens for a
    // member who is not an administrator.
    const ev = seedEvent();
    const reg = enter(ev, bo, ev.singles);
    expect((await get(olive, `${ev.record}/registrations/add`)).status).toBe(403);
    expect((await post(olive, `${ev.record}/registrations/add/confirm`, { member_id: ada, division: ev.singles, reason: 'x' })).status).toBe(403);
    expect((await post(olive, `${ev.record}/registrations/${reg}/edit/confirm`, { division: ev.doubles, reason: 'x' })).status).toBe(403);
    expect(registrationOf(ev.id, ada)).toBeUndefined();
    expect(entriesOf(reg)).toEqual([{ discipline_id: ev.singles, partner_member_id: null }]);
  });
});
