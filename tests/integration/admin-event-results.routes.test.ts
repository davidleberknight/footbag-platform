/**
 * Correcting an event's published results: the finder, the event's results,
 * a result's placement, score, division and competitor names, and a
 * division's sport family and aggregate-standing mark.
 *
 * Covers the previews that write nothing, the writes with their reason and
 * before-and-after audit row, the public event page showing the correction,
 * the refusals (no reason, a bad placement, a division of another team format
 * or another event, no sport family on a single contest, an event whose
 * results are not public), a submission that changes nothing, and a repeated
 * submit.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertHistoricalPerson, createTestSessionJwt, insertEvent, insertDiscipline,
  insertResultsUpload, insertResultEntry, insertResultParticipant,
} from '../fixtures/factories';
import { flashCookieOf } from '../fixtures/flashCookie';

const { dbPath } = setTestEnv('4737');

const ADMIN_ID = 'er_admin';
const OTHER_ADMIN_ID = 'er_admin_2';
const ENTRY_CORRECTED = 'event.result_corrected';
const DISCIPLINE_CORRECTED = 'event.discipline_corrected';

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role: 'admin' })}`;
}

function db<T>(fn: (conn: BetterSqlite3.Database) => T): T {
  const conn = new BetterSqlite3(dbPath);
  try {
    return fn(conn);
  } finally {
    conn.close();
  }
}

interface Seeded {
  eventId: string;
  eventKey: string;
  openId: string;
  womenId: string;
  doublesId: string;
  entryId: string;
  participantId: string;
  personId: string;
}

let counter = 0;

/** A published event: two singles divisions, one doubles division, one result in the first. */
function seedEvent(o: { status?: 'reg_open' | 'completed' | 'draft' | 'canceled'; title?: string } = {}): Seeded {
  counter += 1;
  return db((conn) => {
    const year = '2019';
    const eventId = insertEvent(conn, {
      title: o.title ?? `Results Open ${counter}`,
      start_date: `${year}-06-0${(counter % 8) + 1}`, end_date: `${year}-06-0${(counter % 8) + 1}`,
      status: o.status ?? 'completed',
    });
    const tag = conn.prepare(
      'SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?',
    ).get(eventId) as { tag_normalized: string };
    const openId = insertDiscipline(conn, eventId, { name: 'Open Singles', discipline_category: 'net', sort_order: 1 });
    const womenId = insertDiscipline(conn, eventId, { name: 'Women Singles', discipline_category: 'net', sort_order: 2 });
    const doublesId = insertDiscipline(conn, eventId, {
      name: 'Open Doubles', discipline_category: 'net', team_type: 'doubles', sort_order: 3,
    });
    const uploadId = insertResultsUpload(conn, eventId, ADMIN_ID);
    const entryId = insertResultEntry(conn, eventId, uploadId, openId, { placement: 3, score_text: '15-11' });
    const personId = insertHistoricalPerson(conn, { person_name: `Kim Mispeled ${counter}` });
    const participantId = insertResultParticipant(conn, entryId, `Kim Mispeled ${counter}`, {
      historical_person_id: personId,
    });
    return {
      eventId, eventKey: tag.tag_normalized.slice(1), openId, womenId, doublesId, entryId, participantId, personId,
    };
  });
}

function entryRow(entryId: string): { placement: number; score_text: string | null; discipline_id: string } {
  return db((conn) => conn.prepare(
    'SELECT placement, score_text, discipline_id FROM event_result_entries WHERE id = ?',
  ).get(entryId)) as { placement: number; score_text: string | null; discipline_id: string };
}

function participantRow(id: string): { display_name: string; historical_person_id: string | null; member_id: string | null } {
  return db((conn) => conn.prepare(
    'SELECT display_name, historical_person_id, member_id FROM event_result_entry_participants WHERE id = ?',
  ).get(id)) as { display_name: string; historical_person_id: string | null; member_id: string | null };
}

function disciplineRow(id: string): { discipline_category: string | null; is_aggregate_standing: number } {
  return db((conn) => conn.prepare(
    'SELECT discipline_category, is_aggregate_standing FROM event_disciplines WHERE id = ?',
  ).get(id)) as { discipline_category: string | null; is_aggregate_standing: number };
}

function audits(action: string, entityId: string): { actor_member_id: string; reason_text: string; metadata_json: string }[] {
  return db((conn) => conn.prepare(
    'SELECT actor_member_id, reason_text, metadata_json FROM audit_entries WHERE action_type = ? AND entity_id = ?',
  ).all(action, entityId)) as { actor_member_id: string; reason_text: string; metadata_json: string }[];
}

function post(path: string, body: Record<string, string>, actor = ADMIN_ID) {
  return request(createApp()).post(path).set('Cookie', cookieFor(actor)).type('form').send(body);
}

function get(path: string, actor = ADMIN_ID) {
  return request(createApp()).get(path).set('Cookie', cookieFor(actor));
}

async function landing(res: Awaited<ReturnType<typeof post>>, actor = ADMIN_ID): Promise<string> {
  const shown = await request(createApp())
    .get(res.headers.location as string)
    .set('Cookie', [cookieFor(actor), flashCookieOf(res)].filter(Boolean).join('; '));
  return shown.text;
}

function entryBody(s: Seeded, o: Record<string, string> = {}): Record<string, string> {
  return {
    placement: '3', score_text: '15-11', discipline_id: s.openId,
    [`name_${s.participantId}`]: participantRow(s.participantId).display_name,
    reason: 'results sheet', ...o,
  };
}

beforeAll(async () => {
  const conn = createTestDb(dbPath);
  insertMember(conn, {
    id: ADMIN_ID, slug: ADMIN_ID, display_name: 'Rana Admin', real_name: 'Rana Admin',
    login_email: 'er-admin@example.com', is_admin: 1,
  });
  insertMember(conn, {
    id: OTHER_ADMIN_ID, slug: OTHER_ADMIN_ID, display_name: 'Sol Admin', real_name: 'Sol Admin',
    login_email: 'er-admin-2@example.com', is_admin: 1,
  });
  conn.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('finding an event', () => {
  it('finds a published event by title or year and leaves out events whose results are not public', async () => {
    // Defect caught: the finder offers a draft event's results for correction,
    // or misses a published event an administrator searched for.
    const published = seedEvent({ title: 'Findable Cup' });
    const draft = seedEvent({ title: 'Findable Draft', status: 'draft' });

    const byTitle = await get('/admin/events/results?q=findable');
    expect(byTitle.status).toBe(200);
    expect(byTitle.text).toContain(`href="/admin/events/${published.eventId}/results"`);
    expect(byTitle.text).not.toContain(`/admin/events/${draft.eventId}/results`);

    const byYear = await get('/admin/events/results?q=2019');
    expect(byYear.text).toContain(`href="/admin/events/${published.eventId}/results"`);
  });

  it('opens with the instructions block', async () => {
    // Defect caught: the page loses the block that tells an administrator what
    // the screen does and which events it reaches.
    const res = await get('/admin/events/results');
    expect(res.text).toContain('<aside class="admin-instructions" aria-label="About this page">');
  });
});

describe('an event\'s results', () => {
  it('lists each result with a link to correct it and each division with its own', async () => {
    // Defect caught: a result or a division cannot be reached for correction.
    const s = seedEvent();
    const res = await get(`/admin/events/${s.eventId}/results`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(participantRow(s.participantId).display_name);
    expect(res.text).toContain(`href="/admin/events/${s.eventId}/results/entries/${s.entryId}"`);
    expect(res.text).toContain(`href="/admin/events/${s.eventId}/results/disciplines/${s.openId}"`);
    expect(res.text).toContain(`href="/events/${s.eventKey}"`);
  });

  it('404s an event whose results are not public, and an entry of another event', async () => {
    // Defect caught: a correction reaches results the publishing rules have
    // not let out, or edits a result through another event's address.
    const draft = seedEvent({ status: 'draft' });
    expect((await get(`/admin/events/${draft.eventId}/results`)).status).toBe(404);
    expect((await get(`/admin/events/${draft.eventId}/results/entries/${draft.entryId}`)).status).toBe(404);
    const res = await post(`/admin/events/${draft.eventId}/results/entries/${draft.entryId}/confirm`,
      entryBody(draft, { placement: '1' }));
    expect(res.status).toBe(404);
    expect(entryRow(draft.entryId).placement).toBe(3);

    const a = seedEvent();
    const b = seedEvent();
    expect((await get(`/admin/events/${a.eventId}/results/entries/${b.entryId}`)).status).toBe(404);
  });
});

describe('correcting a result', () => {
  it('opens a form holding the current values, offering only divisions of the same team format', async () => {
    // Defect caught: the form opens with wrong values, so correcting one field
    // overwrites the others, or offers a doubles division for a singles result.
    const s = seedEvent();
    const res = await get(`/admin/events/${s.eventId}/results/entries/${s.entryId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('value="3"');
    expect(res.text).toContain('value="15-11"');
    expect(res.text).toContain(`<option value="${s.openId}" selected>`);
    expect(res.text).toContain(`<option value="${s.womenId}" >`);
    expect(res.text).not.toContain(`value="${s.doublesId}"`);
  });

  it('previews each changed value and writes nothing', async () => {
    // Defect caught: the preview writes, or hides a change the admin confirms.
    const s = seedEvent();
    const before = participantRow(s.participantId).display_name;
    const res = await post(`/admin/events/${s.eventId}/results/entries/${s.entryId}`,
      entryBody(s, { placement: '2', [`name_${s.participantId}`]: 'Kim Misspelled' }));
    expect(res.status).toBe(200);
    expect(res.text).toContain('3 &rarr; 2');
    expect(res.text).toContain(`${before} &rarr; Kim Misspelled`);
    expect(res.text).not.toContain('15-11 &rarr;');
    expect(res.text).toContain(`action="/admin/events/${s.eventId}/results/entries/${s.entryId}/confirm"`);
    expect(entryRow(s.entryId).placement).toBe(3);
    expect(audits(ENTRY_CORRECTED, s.entryId)).toHaveLength(0);
  });

  it('writes placement, score, division and name with one audit row, leaving the person link alone', async () => {
    // Defect caught: the correction lands without a before-and-after trail,
    // re-points the competitor at another person, or lets an overposted field
    // through.
    const s = seedEvent();
    const before = participantRow(s.participantId).display_name;
    const res = await post(`/admin/events/${s.eventId}/results/entries/${s.entryId}/confirm`, entryBody(s, {
      placement: '2', score_text: '15-9', discipline_id: s.womenId,
      [`name_${s.participantId}`]: 'Kim Misspelled', member_id: ADMIN_ID, event_id: 'hijacked',
    }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/admin/events/${s.eventId}/results`);
    expect(await landing(res)).toContain(
      '<div class="form-success-banner" role="status">The result has been corrected, and the change is in the audit log.</div>',
    );

    expect(entryRow(s.entryId)).toEqual({ placement: 2, score_text: '15-9', discipline_id: s.womenId });
    expect(participantRow(s.participantId)).toEqual({
      display_name: 'Kim Misspelled', historical_person_id: s.personId, member_id: null,
    });
    const rows = audits(ENTRY_CORRECTED, s.entryId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor_member_id).toBe(ADMIN_ID);
    expect(rows[0]!.reason_text).toBe('results sheet');
    expect(JSON.parse(rows[0]!.metadata_json)).toEqual({
      event_id: s.eventId,
      fields: ['placement', 'score_text', 'discipline_id', `display_name:${s.participantId}`],
      before: { placement: 3, score_text: '15-11', discipline_id: s.openId, [`display_name:${s.participantId}`]: before },
      after:  { placement: 2, score_text: '15-9', discipline_id: s.womenId, [`display_name:${s.participantId}`]: 'Kim Misspelled' },
    });
  });

  it('shows the corrected result on the public event page straight away', async () => {
    // Defect caught: a correction lands only in the admin view, so visitors
    // keep seeing the misspelled name.
    const s = seedEvent();
    const before = participantRow(s.participantId).display_name;
    await post(`/admin/events/${s.eventId}/results/entries/${s.entryId}/confirm`,
      entryBody(s, { [`name_${s.participantId}`]: 'Kim Corrected' }));
    const page = await request(createApp()).get(`/events/${s.eventKey}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('Kim Corrected');
    expect(page.text).not.toContain(before);
  });

  it.each([
    ['no reason', { reason: '  ' }, 'Enter the reason for this correction.'],
    ['a placement that is not a whole number', { placement: 'first' }, 'Enter the placement as a whole number.'],
    ['a placement of zero', { placement: '0' }, 'The placement must be between 1 and 1000.'],
    ['a blank competitor name', { name_blank: '1' }, 'Enter every competitor&#x27;s name.'],
  ])('refuses %s, back on the form with what was typed', async (_label, override, message) => {
    // Defect caught: an invalid correction is written, or the admin loses what
    // they typed.
    const s = seedEvent();
    const body = entryBody(s, override as Record<string, string>);
    if ('name_blank' in override) body[`name_${s.participantId}`] = '';
    const res = await post(`/admin/events/${s.eventId}/results/entries/${s.entryId}/confirm`, body);
    expect(res.status).toBe(422);
    expect(res.text).toContain(message);
    expect(entryRow(s.entryId).placement).toBe(3);
    expect(audits(ENTRY_CORRECTED, s.entryId)).toHaveLength(0);
  });

  it('refuses a move to a division of another team format or of another event', async () => {
    // Defect caught: a singles result is filed under a doubles division, or
    // under a division of a different event.
    const s = seedEvent();
    const other = seedEvent();
    for (const target of [s.doublesId, other.womenId]) {
      const res = await post(`/admin/events/${s.eventId}/results/entries/${s.entryId}/confirm`,
        entryBody(s, { discipline_id: target }));
      expect(res.status, target).toBe(422);
      expect(res.text).toContain('Choose a division of this event with the same team format.');
    }
    expect(entryRow(s.entryId).discipline_id).toBe(s.openId);
  });

  it('writes nothing for an unchanged submission, and a repeat of the admin\'s own correction reports its success', async () => {
    // Defect caught: a no-op writes an audit row, a double submit writes two,
    // or another admin's change is reported as this admin's.
    const s = seedEvent();
    const unchanged = await post(`/admin/events/${s.eventId}/results/entries/${s.entryId}/confirm`, entryBody(s));
    expect(await landing(unchanged)).toContain(
      '<p class="form-notice" role="status">Those are the values the result already holds, so nothing changed.</p>',
    );
    expect(audits(ENTRY_CORRECTED, s.entryId)).toHaveLength(0);

    const body = entryBody(s, { placement: '1' });
    await post(`/admin/events/${s.eventId}/results/entries/${s.entryId}/confirm`, body);
    const repeat = await post(`/admin/events/${s.eventId}/results/entries/${s.entryId}/confirm`, body);
    expect(await landing(repeat)).toContain('The result has been corrected, and the change is in the audit log.');
    expect(audits(ENTRY_CORRECTED, s.entryId)).toHaveLength(1);

    const other = await post(`/admin/events/${s.eventId}/results/entries/${s.entryId}/confirm`, body, OTHER_ADMIN_ID);
    expect(await landing(other, OTHER_ADMIN_ID)).toContain('so nothing changed.');
  });
});

describe('correcting a division', () => {
  it('writes the sport family and the aggregate-standing mark with one audit row', async () => {
    // Defect caught: a mis-filed standing stays counted as a contest, or the
    // change has no trail.
    const s = seedEvent();
    const preview = await post(`/admin/events/${s.eventId}/results/disciplines/${s.openId}`, {
      sport_family: '', aggregate_standing: '1', reason: 'overall ranking',
    });
    expect(preview.status).toBe(200);
    expect(preview.text).toContain('Single contest &rarr; Aggregate standing');
    expect(disciplineRow(s.openId)).toEqual({ discipline_category: 'net', is_aggregate_standing: 0 });

    const res = await post(`/admin/events/${s.eventId}/results/disciplines/${s.openId}/confirm`, {
      sport_family: '', aggregate_standing: '1', reason: 'overall ranking',
    });
    expect(res.status).toBe(303);
    expect(disciplineRow(s.openId)).toEqual({ discipline_category: null, is_aggregate_standing: 1 });
    const rows = audits(DISCIPLINE_CORRECTED, s.openId);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.metadata_json)).toEqual({
      event_id: s.eventId,
      fields: ['discipline_category', 'is_aggregate_standing'],
      before: { discipline_category: 'net', is_aggregate_standing: 0 },
      after:  { discipline_category: null, is_aggregate_standing: 1 },
    });
  });

  it('refuses no sport family on a single contest, and a family not on the list', async () => {
    // Defect caught: the schema's rule is reached as a database error, or a
    // made-up sport family is stored.
    const s = seedEvent();
    const none = await post(`/admin/events/${s.eventId}/results/disciplines/${s.openId}/confirm`, {
      sport_family: '', aggregate_standing: '0', reason: 'x',
    });
    expect(none.status).toBe(422);
    expect(none.text).toContain('Only a standing across several sports may have no sport family.');
    const madeUp = await post(`/admin/events/${s.eventId}/results/disciplines/${s.openId}/confirm`, {
      sport_family: 'hacky', aggregate_standing: '0', reason: 'x',
    });
    expect(madeUp.status).toBe(422);
    expect(disciplineRow(s.openId)).toEqual({ discipline_category: 'net', is_aggregate_standing: 0 });
  });
});
