/**
 * The public net pages must not read the retired QC tables.
 *
 * They were internal curator tables, and every public surface that once summarised
 * one now derives what it shows from canonical data instead. The tables are gone
 * from the schema, so a page that still read one would fail outright.
 *
 * These tests build a normal net fixture and require both public routes to render
 * against a schema that has never carried those tables, which is what every
 * environment now builds.
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
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('public net pages against a schema with no QC tables', () => {
  it('the schema carries none of the retired QC tables', () => {
    // Named individually rather than as a count, so dropping one and adding
    // another back under a new name cannot pass.
    const RETIRED = [
      'net_review_queue', 'net_candidate_match', 'net_curated_match',
      'net_raw_fragment', 'net_recovery_alias_candidate',
      'net_team_correction_candidate',
    ];
    const probe = new BetterSqlite3(dbPath, { readonly: true });
    const present = probe
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((r) => (r as { name: string }).name);
    probe.close();
    expect(RETIRED.filter((t) => present.includes(t))).toEqual([]);
    // The tables the net pages actually read must still be there, so an empty
    // schema cannot satisfy the check above.
    expect(present).toContain('net_discipline_group');
    expect(present).toContain('net_team_appearance');
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

  it('the grouping badge still shows, because it reads the grouping table', async () => {
    const app = createApp();
    const res = await request(app).get('/net/events');
    expect(res.text).toContain('Grouping unconfirmed');
  });

  it('no page reports a missing table', async () => {
    const app = createApp();
    const home   = await request(app).get('/net');
    const events = await request(app).get('/net/events');
    expect(home.text).not.toContain('no such table');
    expect(events.text).not.toContain('no such table');
  });
});
