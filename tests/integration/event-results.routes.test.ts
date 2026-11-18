/**
 * An event's results and attendance, from its organizers' side and an
 * administrator's.
 *
 * The contract: only a current organizer uploads results, and only from the
 * event's last day. The file is read into a preview that writes nothing; the
 * commit writes the results, completes the event, and marks every placing
 * member with a confirmed registration attended, granting a Tier 0 member
 * Active Player status and telling them so. A name with no registration is
 * recorded by name only once the organizer accepts it. A division that
 * already has results takes no more rows. The attendance screen marks the
 * rest, once each. An administrator marks or unmarks attendance with a
 * reason, and unmarking leaves the Active Player grant. A sanctioned event
 * whose results are overdue shows the "sanctioning requirements not met"
 * badge, and its organizers have a dashboard item until what is owed is done.
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
  insertMember,
  insertEvent,
  insertEventOrganizer,
  insertDiscipline,
  insertRegistration,
  insertRegistrationDisciplineSelection,
  insertResultsUpload,
  insertResultEntry,
  insertResultParticipant,
  insertMemberAnnouncement,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4983');

let createApp: Awaited<ReturnType<typeof importApp>>;
let eventServiceModule: typeof import('../../src/services/eventService');

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function makeMember(id: string, name: string, tier: 'tier0' | 'tier1' | 'tier2' = 'tier1', hp?: string): string {
  return withDb((db) => {
    createMemberAtTier(db, {
      id, slug: id.replace(/-/g, '_'), tier,
      memberOverrides: { display_name: name, login_email: `${id}@example.com`, ...(hp ? { historical_person_id: hp } : {}) },
    });
    completeOnboarding(db, id);
    return id;
  });
}

const day = (iso: string): string => iso.slice(0, 10);

interface SeededEvent { id: string; base: string; singles: string; doubles: string }

function seedEvent(o: { endDaysAgo?: number; sanctioned?: boolean; organizers?: string[] } = {}): SeededEvent {
  return withDb((db) => {
    const end = day(isoDaysFromNow(-(o.endDaysAgo ?? 2)));
    const id = insertEvent(db, {
      title: `Results Test ${Math.random().toString(36).slice(2, 8)}`,
      status: 'reg_open',
      start_date: end,
      end_date: end,
      ...(o.sanctioned ? { sanction_status: 'approved' } : {}),
    });
    for (const m of o.organizers ?? [olive]) insertEventOrganizer(db, id, m);
    const singles = insertDiscipline(db, id, { name: 'Open Singles Footbag Net', discipline_category: 'net', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', offers_prize_money: 1, sort_order: 1 });
    const doubles = insertDiscipline(db, id, { name: 'Open Doubles Footbag Net', discipline_category: 'net', team_type: 'doubles', gender_eligibility: 'open', division_class: 'open', sort_order: 2 });
    const tag = (db.prepare('SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?').get(id) as { tag_normalized: string }).tag_normalized;
    return { id, base: `/events/${tag.slice(1)}`, singles, doubles };
  });
}

function register(ev: SeededEvent, memberId: string, o: { status?: 'confirmed' | 'pending'; amateur?: 0 | 1 } = {}): string {
  return withDb((db) => {
    const reg = insertRegistration(db, ev.id, memberId, { status: o.status ?? 'confirmed' });
    insertRegistrationDisciplineSelection(db, reg, ev.singles, { enters_as_amateur: o.amateur ?? 0 });
    return reg;
  });
}

const HEADER = 'division,category,place,player,partner,score\n';

function upload(memberId: string, ev: SeededEvent, csv: string) {
  return request(createApp()).post(`${ev.base}/results/preview`).set('Cookie', cookieFor(memberId))
    .attach('results_file', Buffer.from(csv), 'results.csv');
}

function commitStep(memberId: string, ev: SeededEvent, csv: string, step: 'commit' | 'check', extra: Record<string, string> = {}) {
  let r = request(createApp()).post(`${ev.base}/results`).set('Cookie', cookieFor(memberId))
    .field('results_text', csv).field('filename', 'results.csv').field('step', step);
  for (const [k, v] of Object.entries(extra)) r = r.field(k, v);
  return r;
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

function one<T>(sql: string, ...params: unknown[]): T {
  return withDb((db) => db.prepare(sql).get(...params) as T);
}

function count(sql: string, ...params: unknown[]): number {
  return one<{ c: number }>(sql, ...params).c;
}

function grants(memberId: string): number {
  return count("SELECT COUNT(*) c FROM active_player_grants WHERE member_id = ? AND reason_code = 'official_event_attendance'", memberId);
}

function mailTo(template: string, memberId: string): number {
  return count('SELECT COUNT(*) c FROM outbox_emails WHERE template_key = ? AND recipient_member_id = ?', template, memberId);
}

let olive: string;   // organizes every event
let tia: string;     // Tier 0, no Active Player: attendance grants it
let ben: string;     // Tier 1: attendance records, grants nothing
let cara: string;    // Tier 0, registered but not placing
let eve: string;     // organizes nothing
let admin: string;
let hpMember: string;

beforeAll(async () => {
  createTestDb(dbPath).close();
  olive = makeMember('er-olive', 'Olive Organizer', 'tier2');
  tia = makeMember('er-tia', 'Tia Tamm', 'tier0');
  ben = makeMember('er-ben', 'Ben Ito');
  cara = makeMember('er-cara', 'Cara Diaz', 'tier0');
  eve = makeMember('er-eve', 'Eve Elsewhere');
  admin = withDb((db) => insertMember(db, { id: 'er-admin', slug: 'er_admin', display_name: 'Admin Ann', login_email: 'er-admin@example.com', is_admin: 1 }));
  hpMember = makeMember('er-hp', 'Hal Past', 'tier1', 'hp-er-hal');
  createApp = await importApp();
  eventServiceModule = await import('../../src/services/eventService');
});

afterAll(() => cleanupTestDb(dbPath));

describe('who can upload, and when', () => {
  // Defect caught: a member who does not organize the event reaches its upload
  // page, or results are taken while the event has not yet reached its last day.
  it('is not found for a non-organizer and refused before the last day', async () => {
    const ev = seedEvent();
    expect((await get(eve, `${ev.base}/results`)).status).toBe(404);
    expect((await upload(eve, ev, `${HEADER}Open Singles Footbag Net,,1,Ben Ito,,\n`)).status).toBe(404);

    const future = withDb((db) => {
      const start = day(isoDaysFromNow(10));
      const id = insertEvent(db, { title: 'Future Results Test', status: 'reg_open', start_date: start, end_date: start });
      insertEventOrganizer(db, id, olive);
      const tag = (db.prepare('SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?').get(id) as { tag_normalized: string }).tag_normalized;
      return { id, base: `/events/${tag.slice(1)}` };
    });
    const page = await get(olive, `${future.base}/results`);
    expect(page.status).toBe(200);
    expect(page.text).not.toContain('name="results_file"');
    const refused = await request(createApp()).post(`${future.base}/results/preview`).set('Cookie', cookieFor(olive))
      .attach('results_file', Buffer.from(`${HEADER}x,,1,y,,\n`), 'r.csv');
    expect(refused.status).toBe(422);
    expect(count('SELECT COUNT(*) c FROM event_result_entries WHERE event_id = ?', future.id)).toBe(0);
  });
});

describe('preview, then commit', () => {
  // Defect caught: previewing writes results or completes the event before the
  // organizer has checked them.
  it('previews without writing anything, and offers the tie and the unmatched name to settle', async () => {
    const ev = seedEvent();
    register(ev, ben);
    const csv = `${HEADER}Open Singles Footbag Net,,1,Ben Ito,,\nOpen Singles Footbag Net,,1,Nora Nonmember,,\n`;
    const res = await upload(olive, ev, csv);
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="tie:0"');
    expect(res.text).toContain('name="accept_unmatched"');
    expect(res.text).not.toContain('name="step" value="commit"');
    expect(count('SELECT COUNT(*) c FROM event_result_entries WHERE event_id = ?', ev.id)).toBe(0);
    // The advertised doubles division has no rows; an unsanctioned event is
    // not told sanctioning owes it, while a sanctioned one is.
    expect(res.text).toContain('No results for: Open Doubles Footbag Net.');
    expect(res.text).not.toContain('A sanctioned event owes');
    const sanctioned = seedEvent({ sanctioned: true });
    expect((await upload(olive, sanctioned, csv)).text).toContain('A sanctioned event owes');
    expect(one<{ status: string }>('SELECT status FROM events WHERE id = ?', ev.id).status).toBe('reg_open');
  });

  // Defect caught: a commit that writes results but leaves the event open, does
  // not link placing members, never marks them attended, grants a Tier 1
  // member Active Player status, or records an unmatched name against a member.
  it('writes the results, completes the event, marks placing registrants attended and grants a Tier 0 one', async () => {
    const ev = seedEvent();
    const tiaReg = register(ev, tia, { amateur: 1 });
    const benReg = register(ev, ben);
    const caraReg = register(ev, cara);
    const csv = `${HEADER}Open Singles Footbag Net,,1,tia tamm,,21-9\nOpen Singles Footbag Net,,2,Ben Ito,,\nOpen Singles Footbag Net,,3,Nora Nonmember,,\n`
      + 'Open Doubles Footbag Net,,1,Ben Ito,Pat Partner,\n';

    const res = await commitStep(olive, ev, csv, 'commit', { accept_unmatched: '1' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`${ev.base}/attendance`);

    expect(one<{ status: string }>('SELECT status FROM events WHERE id = ?', ev.id).status).toBe('completed');
    const rows = withDb((db) => db.prepare(`
      SELECT ed.name AS division, ere.placement, ere.score_text, erp.participant_order, erp.member_id, erp.display_name
      FROM event_result_entries ere JOIN event_disciplines ed ON ed.id = ere.discipline_id
      JOIN event_result_entry_participants erp ON erp.result_entry_id = ere.id
      WHERE ere.event_id = ? ORDER BY ed.sort_order, ere.placement, erp.participant_order
    `).all(ev.id)); // ordering-is-the-contract: placings read back in division and place order
    expect(rows).toEqual([
      { division: 'Open Singles Footbag Net', placement: 1, score_text: '21-9', participant_order: 1, member_id: tia, display_name: 'Tia Tamm' },
      { division: 'Open Singles Footbag Net', placement: 2, score_text: null, participant_order: 1, member_id: ben, display_name: 'Ben Ito' },
      { division: 'Open Singles Footbag Net', placement: 3, score_text: null, participant_order: 1, member_id: null, display_name: 'Nora Nonmember' },
      { division: 'Open Doubles Footbag Net', placement: 1, score_text: null, participant_order: 1, member_id: ben, display_name: 'Ben Ito' },
      { division: 'Open Doubles Footbag Net', placement: 1, score_text: null, participant_order: 2, member_id: null, display_name: 'Pat Partner' },
    ]);

    const attended = (reg: string) => one<{ attended_at: string | null }>('SELECT attended_at FROM registrations WHERE id = ?', reg).attended_at;
    expect(attended(tiaReg)).not.toBeNull();
    expect(attended(benReg)).not.toBeNull();
    expect(attended(caraReg)).toBeNull();
    expect(grants(tia)).toBe(1);
    expect(grants(ben)).toBe(0);
    expect(mailTo('event_attendance_active_player', tia)).toBe(1);
    expect(mailTo('event_attendance_active_player', ben)).toBe(0);

    const audit = JSON.parse(one<{ metadata_json: string }>(
      "SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'event.results_uploaded'", ev.id).metadata_json);
    expect(audit).toMatchObject({ rows: 4, unmatched: 2, attended: 2, before_status: 'reg_open', after_status: 'completed' });
    expect(count("SELECT COUNT(*) c FROM audit_entries WHERE entity_id = ? AND action_type = 'event.attendance_marked'", ev.id)).toBe(2);

    // The public page shows the results, with the Amateur mark on the entrant who chose it.
    const page = await get(null, ev.base);
    expect(page.status).toBe(200);
    expect(page.text).toContain('data-sortable');
    expect(page.text.match(/<span class="badge">Amateur<\/span>/g)?.length).toBe(1);

    // Defect caught: the same commit submitted twice writes the results twice.
    const again = await commitStep(olive, ev, csv, 'commit', { accept_unmatched: '1' });
    expect(again.status).toBe(303);
    expect(count('SELECT COUNT(*) c FROM event_result_entries WHERE event_id = ?', ev.id)).toBe(4);
    expect(grants(tia)).toBe(1);
    expect(mailTo('event_attendance_active_player', tia)).toBe(1);
    expect(count("SELECT COUNT(*) c FROM audit_entries WHERE entity_id = ? AND action_type = 'event.results_uploaded'", ev.id)).toBe(1);

    // Defect caught: a completed event can still be canceled once its results are published.
    const cancel = await post(olive, `${ev.base}/cancel`, { confirmed: '1', reason: 'Oops' });
    expect(cancel.status).not.toBe(200);
    expect(one<{ status: string }>('SELECT status FROM events WHERE id = ?', ev.id).status).toBe('completed');
  });

  // Defect caught: a deleted account's registration is matched, so a result
  // is linked to a member who is gone and they are marked attended.
  it('does not match a name to a registration whose member deleted their account', async () => {
    const ev = seedEvent();
    const gone = withDb((db) => {
      const id = insertMember(db, {
        id: 'er-gone', slug: 'er_gone', display_name: 'Gwen Gone', login_email: 'er-gone@example.com',
        deleted_at: isoDaysFromNow(-1),
      });
      return id;
    });
    const goneReg = register(ev, gone);
    const res = await commitStep(olive, ev, `${HEADER}Open Singles Footbag Net,,1,Gwen Gone,,\n`, 'commit', { accept_unmatched: '1' });
    expect(res.status).toBe(303);
    expect(one<{ member_id: string | null }>(
      'SELECT erp.member_id FROM event_result_entry_participants erp JOIN event_result_entries ere ON ere.id = erp.result_entry_id WHERE ere.event_id = ?',
      ev.id).member_id).toBeNull();
    expect(one<{ attended_at: string | null }>('SELECT attended_at FROM registrations WHERE id = ?', goneReg).attended_at).toBeNull();
  });

  // Defect caught: an unmatched name is committed without the organizer
  // accepting it, or a refused commit loses the preview the organizer needs.
  it('refuses a commit with an unaccepted unmatched name, showing the preview again', async () => {
    const ev = seedEvent();
    const csv = `${HEADER}Open Singles Footbag Net,,1,Nora Nonmember,,\n`;
    const res = await commitStep(olive, ev, csv, 'commit');
    expect(res.status).toBe(422);
    expect(res.text).toContain('name="accept_unmatched"');
    expect(count('SELECT COUNT(*) c FROM event_result_entries WHERE event_id = ?', ev.id)).toBe(0);
    // Resubmitting the rendered form with the box ticked succeeds.
    const ok = await commitStep(olive, ev, csv, 'commit', { accept_unmatched: '1' });
    expect(ok.status).toBe(303);
    expect(count('SELECT COUNT(*) c FROM event_result_entries WHERE event_id = ?', ev.id)).toBe(1);
  });

  // Defect caught: a second upload adds a second set of placings to a division
  // that already has them, or a division that ran unadvertised is lost.
  it('takes a later upload only for divisions with no results, and adds a confirmed unadvertised division', async () => {
    const ev = seedEvent();
    expect((await commitStep(olive, ev, `${HEADER}Open Singles Footbag Net,,1,Nora Nonmember,,\n`, 'commit', { accept_unmatched: '1' })).status).toBe(303);

    const repeatDivision = await commitStep(olive, ev, `${HEADER}Open Singles Footbag Net,,1,Other Person,,\n`, 'commit', { accept_unmatched: '1' });
    expect(repeatDivision.status).toBe(422);
    expect(count('SELECT COUNT(*) c FROM event_result_entries WHERE event_id = ?', ev.id)).toBe(1);

    const csv = `${HEADER}Shred 30,x-square,1,Nora Nonmember,,\n`;
    const unconfirmed = await commitStep(olive, ev, csv, 'commit', { accept_unmatched: '1' });
    expect(unconfirmed.status).toBe(422);
    expect(unconfirmed.text).toContain('name="contested:0"');
    const confirmed = await commitStep(olive, ev, csv, 'commit', { accept_unmatched: '1', 'contested:0': 'shred 30' });
    expect(confirmed.status).toBe(303);
    expect(one<{ discipline_category: string; team_type: string }>(
      "SELECT discipline_category, team_type FROM event_disciplines WHERE event_id = ? AND name = 'Shred 30'", ev.id))
      .toEqual({ discipline_category: 'x_square', team_type: 'singles' });
  });
});

describe('attendance', () => {
  // Defect caught: a registrant who did not place can never be marked
  // attended, a mark grants twice, or someone else's mark is reported as this
  // organizer's own repeat.
  it('marks the ticked registrants attended once, granting a Tier 0 member and only them', async () => {
    const ev = seedEvent();
    const caraReg = register(ev, cara);
    const benReg = register(ev, ben);
    register(ev, tia, { status: 'pending' });

    const page = await get(olive, `${ev.base}/attendance`);
    expect(page.status).toBe(200);
    expect(page.text).toContain(`value="${caraReg}"`);
    expect(page.text).not.toContain('Tia Tamm');

    const res = await post(olive, `${ev.base}/attendance`, { registration: [caraReg] });
    expect(res.status).toBe(303);
    expect(one<{ attended_marked_by_member_id: string }>('SELECT attended_marked_by_member_id FROM registrations WHERE id = ?', caraReg).attended_marked_by_member_id).toBe(olive);
    expect(one<{ attended_at: string | null }>('SELECT attended_at FROM registrations WHERE id = ?', benReg).attended_at).toBeNull();
    expect(grants(cara)).toBe(1);
    expect(mailTo('event_attendance_active_player', cara)).toBe(1);

    const again = await post(olive, `${ev.base}/attendance`, { registration: [caraReg] });
    expect(again.status).toBe(303);
    expect(grants(cara)).toBe(1);
    expect(count("SELECT COUNT(*) c FROM audit_entries WHERE entity_id = ? AND action_type = 'event.attendance_marked'", ev.id)).toBe(1);

    expect((await post(eve, `${ev.base}/attendance`, { registration: [benReg] })).status).toBe(404);
    expect(one<{ attended_at: string | null }>('SELECT attended_at FROM registrations WHERE id = ?', benReg).attended_at).toBeNull();
  });

  // Defect caught: an administrator's unmarking silently takes back the Active
  // Player grant, or writes with no reason, or leaves no trail.
  it('lets an administrator unmark with a reason, keeping the grant, after a preview', async () => {
    const ev = seedEvent();
    const reg = register(ev, cara);
    await post(olive, `${ev.base}/attendance`, { registration: [reg] });
    const grantsBefore = grants(cara);
    const path = `/admin/events/${ev.id}/registrations/${reg}/attendance`;

    const preview = await post(admin, path, { attended: 'no', reason: 'Was not there' });
    expect(preview.status).toBe(200);
    expect(one<{ attended_at: string | null }>('SELECT attended_at FROM registrations WHERE id = ?', reg).attended_at).not.toBeNull();

    const noReason = await post(admin, `${path}/confirm`, { attended: 'no', reason: '' });
    expect(noReason.status).not.toBe(303);

    const done = await post(admin, `${path}/confirm`, { attended: 'no', reason: 'Was not there' });
    expect(done.status).toBe(303);
    expect(one<{ attended_at: string | null }>('SELECT attended_at FROM registrations WHERE id = ?', reg).attended_at).toBeNull();
    expect(grants(cara)).toBe(grantsBefore);
    const audit = one<{ reason_text: string; actor_member_id: string }>(
      "SELECT reason_text, actor_member_id FROM audit_entries WHERE entity_id = ? AND action_type = 'event.attendance_corrected'", ev.id);
    expect(audit).toEqual({ reason_text: 'Was not there', actor_member_id: admin });
    expect(mailTo('event_record_corrected', olive)).toBeGreaterThan(0);

    expect((await post(eve, path, { attended: 'yes', reason: 'x' })).status).toBe(403);
  });
});

describe('the twenty-day rule', () => {
  // Defect caught: an overdue sanctioned event's organizers are not shown the
  // badge where they act, the badge shows early or on an unsanctioned event,
  // it stays after results are in, or it reaches the public event page.
  it('shows the badge to the organizers of an overdue sanctioned event until results are committed, never publicly', async () => {
    const overdue = seedEvent({ sanctioned: true, endDaysAgo: 25 });
    const onTime = seedEvent({ sanctioned: true, endDaysAgo: 5 });
    const unsanctioned = seedEvent({ endDaysAgo: 25 });
    const badge = 'Sanctioning requirements not met';
    expect((await get(olive, `${overdue.base}/manage`)).text).toContain(badge);
    expect((await get(olive, `${overdue.base}/results`)).text).toContain(badge);
    expect((await get(olive, `${overdue.base}`)).text).not.toContain(badge);
    expect((await get(null, overdue.base)).text).not.toContain(badge);
    expect((await get(olive, `${onTime.base}/manage`)).text).not.toContain(badge);
    expect((await get(olive, `${unsanctioned.base}/manage`)).text).not.toContain(badge);

    await commitStep(olive, overdue, `${HEADER}Open Singles Footbag Net,,1,Nora Nonmember,,\n`, 'commit', { accept_unmatched: '1' });
    expect((await get(olive, `${overdue.base}/manage`)).text).not.toContain(badge);
  });

  // Defect caught: an organizer is never told results or the summary are owed,
  // a co-organizer is left out, or the item outlives what it asks for.
  it('gives every organizer a dashboard item until results and the summary are done', async () => {
    const coOrganizer = makeMember('er-co', 'Co Organizer');
    const ev = seedEvent({ sanctioned: true, endDaysAgo: 25, organizers: [olive, coOrganizer] });
    const items = (memberId: string, slug: string) =>
      eventServiceModule.eventActionSource.itemsFor({ memberId, slug }).filter((i) => i.options.some((o) => o.href?.startsWith(ev.base)) || i.headline.includes(one<{ title: string }>('SELECT title FROM events WHERE id = ?', ev.id).title));

    const [both] = items(olive, 'er_olive');
    expect(both.isUrgent).toBe(true);
    expect(both.options.map((o) => o.href)).toEqual([`${ev.base}/results`, '/members/er_olive/announce']);
    // A co-organizer below Tier 2 cannot send the summary, so is offered the upload only.
    expect(items(coOrganizer, 'er_co')[0].options.map((o) => o.href)).toEqual([`${ev.base}/results`]);
    expect(items(eve, 'er_eve')).toEqual([]);

    await commitStep(olive, ev, `${HEADER}Open Singles Footbag Net,,1,Nora Nonmember,,\n`, 'commit', { accept_unmatched: '1' });
    expect(items(olive, 'er_olive')[0].options.map((o) => o.href)).toEqual(['/members/er_olive/announce']);

    withDb((db) => insertMemberAnnouncement(db, { member_id: olive, status: 'approved', summary_event_id: ev.id }));
    expect(items(olive, 'er_olive')).toEqual([]);
  });
});

describe('the after-event summary on the announcement form', () => {
  // Defect caught: the summary choice is offered for an event the member does
  // not organize, or a crafted form marks someone else's event as summarized.
  it('offers only the member\'s own ended sanctioned events and refuses any other', async () => {
    const mine = seedEvent({ sanctioned: true, endDaysAgo: 3 });
    const notMine = seedEvent({ sanctioned: true, endDaysAgo: 3, organizers: [ben] });
    const page = await get(olive, '/members/er_olive/announce');
    expect(page.status).toBe(200);
    expect(page.text).toContain(`value="${mine.id}"`);
    expect(page.text).not.toContain(`value="${notMine.id}"`);

    const tokenOf = (html: string) => /name="sendToken" value="([^"]+)"/.exec(html)![1];
    const crafted = await post(olive, '/members/er_olive/announce', {
      subject: 'Summary', bodyText: 'It went well.', sendToken: tokenOf(page.text), agree: '1', summaryEventId: notMine.id,
    });
    expect(crafted.status).toBe(422);
    expect(count("SELECT COUNT(*) c FROM member_announcements WHERE member_id = ? AND status = 'pending'", olive)).toBe(0);

    const ok = await post(olive, '/members/er_olive/announce', {
      subject: 'Summary', bodyText: 'It went well.', sendToken: tokenOf(page.text), agree: '1', summaryEventId: mine.id,
    });
    expect(ok.status).toBe(303);
    expect(one<{ summary_event_id: string }>("SELECT summary_event_id FROM member_announcements WHERE member_id = ? AND status = 'pending'", olive).summary_event_id).toBe(mine.id);
  });
});

describe('results on the member profile', () => {
  // Defect caught: a member's first uploaded result hides every historical
  // result their claimed archive identity holds.
  it('shows an uploaded result beside the member\'s archived ones', async () => {
    const historic = withDb((db) => {
      const id = insertEvent(db, { title: 'Archive Open Test', status: 'completed', start_date: '1999-07-01', end_date: '1999-07-01' });
      const d = insertDiscipline(db, id, { name: 'Open Singles Net Archive', discipline_category: 'net', sort_order: 1 });
      const entry = insertResultEntry(db, id, insertResultsUpload(db, id, olive), d, { placement: 2 });
      insertResultParticipant(db, entry, 'Hal Past', { historical_person_id: 'hp-er-hal' });
      return id;
    });
    const ev = seedEvent();
    register(ev, hpMember);
    await commitStep(olive, ev, `${HEADER}Open Singles Footbag Net,,1,Hal Past,,\n`, 'commit');

    const profile = await get(hpMember, '/members/er_hp');
    expect(profile.status).toBe(200);
    const title = one<{ title: string }>('SELECT title FROM events WHERE id = ?', ev.id).title;
    expect(profile.text).toContain(title);
    expect(profile.text).toContain('Archive Open Test');
    expect(historic).toBeTruthy();
    // The uploaded result also carries the historical identity, and still shows once.
    expect(profile.text.split(title).length - 1).toBe(1);
  });
});

describe('the participant list', () => {
  // Defect caught: attendance can be marked before the event's last day, or
  // the list never offers it once the day has come.
  it('offers attendance marking from the last day and not before', async () => {
    const ended = seedEvent();
    const reg = register(ended, ben);
    const endedPage = await get(olive, `${ended.base}/participants`);
    expect(endedPage.text).toContain('id="attendance-form"');
    expect(endedPage.text).toContain(`value="${reg}" form="attendance-form"`);

    const future = withDb((db) => {
      const start = day(isoDaysFromNow(10));
      const id = insertEvent(db, { title: 'Future Participants Test', status: 'reg_open', start_date: start, end_date: start });
      insertEventOrganizer(db, id, olive);
      // A registrant, so the list renders its table and its controls.
      insertRegistration(db, id, ben, { status: 'confirmed' });
      const tag = (db.prepare('SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?').get(id) as { tag_normalized: string }).tag_normalized;
      return `/events/${tag.slice(1)}`;
    });
    const futurePage = await get(olive, `${future}/participants`);
    expect(futurePage.text).toContain('Ben Ito');
    expect(futurePage.text).not.toContain('id="attendance-form"');
    expect(futurePage.text).not.toContain('form="attendance-form"');
    const refused = await post(olive, `${future}/attendance`, { registration: ['x'] });
    expect(refused.status).toBe(303);
    expect((await landedOn(olive, refused)).text).toContain('form-error-banner');
  });
});
