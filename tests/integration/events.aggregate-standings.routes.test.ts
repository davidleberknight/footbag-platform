/**
 * Aggregate standings: an overall or club standing ranks competitors over several
 * of an event's contests rather than in one contest. It is kept apart from the
 * disciplines. A cross-discipline standing carries no discipline; a standing over one
 * discipline keeps its discipline. On the event page aggregates follow every contested
 * division. A player's history page lists the standing among the player's
 * results and publishes no career totals or partnership ranking built from it.
 * The freestyle partnerships page counts contested freestyle doubles only.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertTag,
  insertEvent,
  insertDiscipline,
  insertResultsUpload,
  insertResultEntry,
  insertResultParticipant,
  insertHistoricalPerson,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3483');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let db: ReturnType<typeof createTestDb>;

const EVENT_KEY = 'event_1995_aggregate_standings_test';
const PLAYER = 'hp-aggregate-player';
const CONTEST_PARTNER = 'hp-aggregate-contest-partner';
const AGGREGATE_PARTNER = 'hp-aggregate-standing-partner';

beforeAll(async () => {
  db = createTestDb(dbPath);
  const uploaderId = insertMember(db, { id: 'agg-uploader', slug: 'agg_uploader' });
  // An honoured person's history page is public, so it renders to an anonymous visitor.
  insertHistoricalPerson(db, { person_id: PLAYER, person_name: 'Allan Aggregate', hof_member: 1 });
  insertHistoricalPerson(db, { person_id: CONTEST_PARTNER, person_name: 'Connie Contest' });
  insertHistoricalPerson(db, { person_id: AGGREGATE_PARTNER, person_name: 'Ollie Overall' });

  // Two events, so a doubles pair can meet the partnerships page's two-appearance floor.
  for (const year of [1995, 1996]) {
    const key = year === 1995 ? EVENT_KEY : 'event_1996_aggregate_standings_test';
    const eventId = insertEvent(db, {
      hashtag_tag_id: insertTag(db, { tag_normalized: `#${key}` }),
      title: `${year} Aggregate Standings Test`,
      status: 'completed',
      start_date: `${year}-08-01`,
      end_date: `${year}-08-03`,
      registration_status: 'closed',
    });
    const upload = insertResultsUpload(db, eventId, uploaderId);

    // Sort orders put every aggregate first, so only the aggregate rule can move it last.
    const clubs = insertDiscipline(db, eventId, {
      name: 'Overall Club Standings', discipline_category: null, is_aggregate_standing: 1, sort_order: 0,
    });
    const overall = insertDiscipline(db, eventId, {
      name: 'Open Overall', discipline_category: null, is_aggregate_standing: 1, sort_order: 0,
    });
    const freestyleOverall = insertDiscipline(db, eventId, {
      name: 'Doubles Freestyle Overall', discipline_category: 'freestyle', team_type: 'doubles',
      is_aggregate_standing: 1, sort_order: 0,
    });
    const net = insertDiscipline(db, eventId, { name: 'Open Singles Net', discipline_category: 'net', sort_order: 5 });
    const unrecognised = insertDiscipline(db, eventId, { name: 'Hacky Relay', discipline_category: 'other', sort_order: 6 });
    const routines = insertDiscipline(db, eventId, {
      name: 'Open Doubles Routines', discipline_category: 'freestyle', team_type: 'doubles', sort_order: 7,
    });

    insertResultParticipant(db, insertResultEntry(db, eventId, upload, clubs, { placement: 1 }), 'Wash Park');
    insertResultParticipant(db, insertResultEntry(db, eventId, upload, overall, { placement: 1 }), 'Allan Aggregate',
      { historical_person_id: PLAYER });
    const fo = insertResultEntry(db, eventId, upload, freestyleOverall, { placement: 1 });
    insertResultParticipant(db, fo, 'Allan Aggregate', { historical_person_id: PLAYER, participant_order: 1 });
    insertResultParticipant(db, fo, 'Ollie Overall', { historical_person_id: AGGREGATE_PARTNER, participant_order: 2 });
    insertResultParticipant(db, insertResultEntry(db, eventId, upload, unrecognised, { placement: 1 }), 'Relay Runner');
    if (year === 1995) {
      insertResultParticipant(db, insertResultEntry(db, eventId, upload, net, { placement: 1 }), 'Allan Aggregate',
        { historical_person_id: PLAYER });
    }
    const rt = insertResultEntry(db, eventId, upload, routines, { placement: 2 });
    insertResultParticipant(db, rt, 'Allan Aggregate', { historical_person_id: PLAYER, participant_order: 1 });
    insertResultParticipant(db, rt, 'Connie Contest', { historical_person_id: CONTEST_PARTNER, participant_order: 2 });
  }
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('`discipline_category` and the aggregate mark', () => {
  it('refuses a contested `event_disciplines` row with no discipline, and allows a cross-discipline standing without one', () => {
    // Defect caught: a contest stored with no discipline, which every per-discipline count
    // and grouping would silently drop.
    const eventId = insertEvent(db, { hashtag_tag_id: insertTag(db) });
    expect(() => insertDiscipline(db, eventId, { name: 'Mystery Contest', discipline_category: null }))
      .toThrow(/CHECK constraint failed/);
    expect(() => insertDiscipline(db, eventId, {
      name: 'Overall', discipline_category: null, is_aggregate_standing: 1,
    })).not.toThrow();
  });
});

describe('event page', () => {
  it('lists every aggregate standing after every contested division', async () => {
    // Defect caught: an overall or club standing listed among, or ahead of, the
    // contests it ranks over.
    const res = await request(createApp()).get(`/events/${EVENT_KEY}`);
    expect(res.status).toBe(200);
    const order = ['Open Overall', 'Overall Club Standings', 'Doubles Freestyle Overall',
      'Open Singles Net', 'Open Doubles Routines', 'Hacky Relay']
      .map((name) => [name, res.text.indexOf(name)] as const);
    for (const [name, at] of order) expect(at, `${name} rendered`).toBeGreaterThan(-1);
    const lastContest = Math.max(...order.slice(3).map(([, at]) => at));
    const firstAggregate = Math.min(...order.slice(0, 3).map(([, at]) => at));
    expect(firstAggregate).toBeGreaterThan(lastContest);
  });
});

describe('player history page', () => {
  it('lists the standing among the results and publishes no career totals or partnership ranking', async () => {
    // Defect caught: a historical-person page publishing derived statistics (wins
    // and podiums per discipline, ranked partners) with no caveat, or dropping the
    // standing from the official results list. A member views the page, the
    // viewer who once saw the aggregates.
    const res = await request(createApp())
      .get(`/history/${PLAYER}`)
      .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: 'agg-uploader' })}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Ollie Overall');
    expect(res.text).toContain('Connie Contest');
    expect(res.text).not.toContain('Career Summary');
    expect(res.text).not.toContain('Top Partnerships');
  });

  it('lists every result in one labelled table, each event spanning its own rows', async () => {
    // Defect caught: a prolific player's page drawn as one table per event, a
    // header row repeated for every event; or an event cell spanning the wrong
    // number of rows, which shifts later results under the wrong event.
    const res = await request(createApp()).get(`/history/${PLAYER}`);
    expect(res.status).toBe(200);
    expect(res.text.match(/<table\b/g)).toHaveLength(1);
    expect(res.text).toMatch(/class="records-table-wrap" tabindex="0" role="region" aria-label="Competitive Results"/);
    const span = (key: string) =>
      new RegExp(`<td rowspan="(\\d+)"><a href="/events/${key}">`).exec(res.text)?.[1];
    // 1995: overall, freestyle overall, net, routines. 1996: no net.
    expect(span(EVENT_KEY)).toBe('4');
    expect(span('event_1996_aggregate_standings_test')).toBe('3');
    expect(res.text).toContain('<th>Details</th>');
  });
});

describe('freestyle partnerships page', () => {
  it('counts contested freestyle doubles and never an aggregate standing', async () => {
    // Defect caught: a pair ranked as freestyle partners because they shared an
    // overall standing rather than a contest.
    const res = await request(createApp()).get('/freestyle/partnerships');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Connie Contest');
    expect(res.text).not.toContain('Ollie Overall');
  });
});
