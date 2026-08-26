/**
 * The public net pages must not read the net review queue.
 *
 * The queue is an internal curator table. Every public surface that once summarised it
 * now derives what it shows from canonical data instead, so the queue can be dropped
 * without taking a public page down with it.
 *
 * These tests build a normal net fixture, drop the table outright, and require both
 * public routes to render exactly as they would with the table present. A route that
 * still touched the queue would fail here with a missing-table error rather than
 * failing silently once the table is really gone.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertHistoricalPerson,
  insertEvent,
  insertTag,
  insertDiscipline,
  insertMember,
  insertResultsUpload,
  insertResultEntry,
  insertNetTeam,
  insertNetTeamMember,
  insertNetTeamAppearance,
  insertNetDisciplineGroup,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4131');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const PERSON_A = 'person-rqi-aa-test-1';
const PERSON_B = 'person-rqi-bb-test-1';
const TEAM_AB  = 'net-team-rqi-ab-0001';
const EVENT_ID = 'event-rqi-2019';

function setupDb(db: BetterSqlite3.Database): void {
  insertHistoricalPerson(db, { person_id: PERSON_A, person_name: 'Queue Alpha' });
  insertHistoricalPerson(db, { person_id: PERSON_B, person_name: 'Queue Beta' });

  const tag = insertTag(db, { tag_normalized: '#event_2019_queue_open' });
  const ev  = insertEvent(db, {
    id: EVENT_ID, title: 'Queue Open 2019', start_date: '2019-08-01',
    city: 'Seattle', country: 'US', hashtag_tag_id: tag,
  });

  // Ambiguous canonical-group match: this is what the surviving badge reads.
  const disc = insertDiscipline(db, ev, {
    id: 'disc-rqi-conflict', name: 'Footbag Net: Mixed',
    discipline_category: 'net', team_type: 'doubles',
  });
  insertNetDisciplineGroup(db, disc, {
    canonical_group: 'mixed_doubles', review_needed: 1, conflict_flag: 1,
  });

  const member = insertMember(db);
  const upload = insertResultsUpload(db, ev, member);
  const entry  = insertResultEntry(db, ev, upload, disc, { id: 'entry-rqi-ab', placement: 1 });

  insertNetTeam(db, {
    team_id: TEAM_AB, person_id_a: PERSON_A, person_id_b: PERSON_B,
    first_year: 2019, last_year: 2019, appearance_count: 1,
  });
  insertNetTeamMember(db, { team_id: TEAM_AB, person_id: PERSON_A, position: 'a' });
  insertNetTeamMember(db, { team_id: TEAM_AB, person_id: PERSON_B, position: 'b' });
  insertNetTeamAppearance(db, {
    team_id: TEAM_AB, event_id: ev, discipline_id: disc,
    result_entry_id: entry, placement: 1, event_year: 2019,
  });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  setupDb(db);
  // The table exists in schema.sql, so a route reading it would pass unnoticed.
  // Dropping it is what turns that read into a failure.
  db.prepare('DROP TABLE net_review_queue').run();
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('public net pages with the review queue dropped', () => {
  it('the fixture really has no review-queue table', () => {
    const probe = new BetterSqlite3(dbPath, { readonly: true });
    const row = probe
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'net_review_queue'`)
      .get();
    probe.close();
    expect(row).toBeUndefined();
  });

  it('GET /net renders', async () => {
    const app = createApp();
    const res = await request(app).get('/net');
    expect(res.status).toBe(200);
  });

  it('GET /net/events renders', async () => {
    const app = createApp();
    const res = await request(app).get('/net/events');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Queue Open 2019');
  });

  it('the discipline-review badge still shows, because it reads the grouping table', async () => {
    const app = createApp();
    const res = await request(app).get('/net/events');
    expect(res.text).toContain('Discipline review');
  });

  it('no page reports a missing table', async () => {
    const app = createApp();
    const home   = await request(app).get('/net');
    const events = await request(app).get('/net/events');
    expect(home.text).not.toContain('no such table');
    expect(events.text).not.toContain('no such table');
  });
});
