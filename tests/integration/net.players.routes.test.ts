/**
 * Integration tests for public net player routes.
 *
 * Covers:
 *   GET /net/players/:personId              — player overview with partner list
 *   GET /net/players/:personId/partners/:teamId — player × partner detail
 *
 * Verifies:
 *   - 200 for valid routes, 404 for unknown personId or teamId
 *   - 404 when personId does not belong to teamId (mismatched pair)
 *   - Evidence disclaimer always present
 *   - Partners ordered by appearance_count DESC
 *   - Partner detail: year grouping, placement labels, event links
 *   - No rankings, win/loss, or head-to-head stats appear
 *   - statistics firewall: inferred_partial appearances do NOT appear
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
  insertDiscipline,
  insertMember,
  insertResultsUpload,
  insertResultEntry,
  insertNetTeam,
  insertNetTeamMember,
  insertNetTeamAppearance,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3096');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

// Person IDs — using 'aa'/'bb'/'cc' so sorted order is deterministic
const PLAYER_ALICE  = 'person-plr-aa-test-1';  // the player we browse as
const PLAYER_BOB    = 'person-plr-bb-test-1';  // partner 1 (2 appearances)
const PLAYER_CAROL  = 'person-plr-cc-test-1';  // partner 2 (1 appearance)
const PLAYER_DAVE   = 'person-plr-dd-test-1';  // unrelated player (no shared team with Alice)

// Team IDs
const TEAM_AB = 'net-team-plr-ab-0001';  // Alice + Bob — 2 appearances
const TEAM_AC = 'net-team-plr-ac-0001';  // Alice + Carol — 1 appearance

function setupDb(db: BetterSqlite3.Database): void {
  insertHistoricalPerson(db, { person_id: PLAYER_ALICE, person_name: 'Alice Player' });
  insertHistoricalPerson(db, { person_id: PLAYER_BOB,   person_name: 'Bob Player' });
  insertHistoricalPerson(db, { person_id: PLAYER_CAROL, person_name: 'Carol Player' });
  insertHistoricalPerson(db, { person_id: PLAYER_DAVE,  person_name: 'Dave Player' });

  // Events
  const ev2010 = insertEvent(db, { id: 'event-plr-2010', title: 'Player Open 2010', start_date: '2010-07-01', city: 'Chicago', country: 'US' });
  const ev2015 = insertEvent(db, { id: 'event-plr-2015', title: 'Player Open 2015', start_date: '2015-07-01', city: 'Denver',  country: 'US' });
  const ev2012 = insertEvent(db, { id: 'event-plr-2012', title: 'Player Cup 2012',  start_date: '2012-06-01', city: 'Berlin',  country: 'DE' });

  // Disciplines
  const disc2010 = insertDiscipline(db, ev2010, { id: 'disc-plr-2010', name: 'Open Doubles Net', discipline_category: 'net', team_type: 'doubles' });
  const disc2015 = insertDiscipline(db, ev2015, { id: 'disc-plr-2015', name: 'Open Doubles Net', discipline_category: 'net', team_type: 'doubles' });
  const disc2012 = insertDiscipline(db, ev2012, { id: 'disc-plr-2012', name: 'Open Doubles Net', discipline_category: 'net', team_type: 'doubles' });

  // FK chain: member → upload → result entries
  const member   = insertMember(db);
  const upload10 = insertResultsUpload(db, ev2010, member);
  const upload15 = insertResultsUpload(db, ev2015, member);
  const upload12 = insertResultsUpload(db, ev2012, member);

  const entry_ab_2010  = insertResultEntry(db, ev2010, upload10, disc2010, { id: 'entry-plr-ab-10', placement: 1 });
  const entry_ab_2015  = insertResultEntry(db, ev2015, upload15, disc2015, { id: 'entry-plr-ab-15', placement: 2 });
  const entry_ac_2012  = insertResultEntry(db, ev2012, upload12, disc2012, { id: 'entry-plr-ac-12', placement: 3 });
  // inferred_partial — must be invisible
  const entry_ab_infer = insertResultEntry(db, ev2012, upload12, disc2012, { id: 'entry-plr-ab-inf', placement: 1 });

  // Team AB: Alice + Bob — 2 canonical_only appearances + 1 inferred_partial (hidden)
  insertNetTeam(db, {
    team_id:          TEAM_AB,
    person_id_a:      PLAYER_ALICE,
    person_id_b:      PLAYER_BOB,
    first_year:       2010,
    last_year:        2015,
    appearance_count: 2,
  });
  insertNetTeamMember(db, { team_id: TEAM_AB, person_id: PLAYER_ALICE, position: 'a' });
  insertNetTeamMember(db, { team_id: TEAM_AB, person_id: PLAYER_BOB,   position: 'b' });

  insertNetTeamAppearance(db, { team_id: TEAM_AB, event_id: ev2010, discipline_id: disc2010, result_entry_id: entry_ab_2010, placement: 1, event_year: 2010 });
  insertNetTeamAppearance(db, { team_id: TEAM_AB, event_id: ev2015, discipline_id: disc2015, result_entry_id: entry_ab_2015, placement: 2, event_year: 2015 });
  // inferred_partial: must NOT appear
  insertNetTeamAppearance(db, { team_id: TEAM_AB, event_id: ev2012, discipline_id: disc2012, result_entry_id: entry_ab_infer, placement: 1, event_year: 2012, evidence_class: 'inferred_partial' });

  // Team AC: Alice + Carol — 1 canonical_only appearance
  insertNetTeam(db, {
    team_id:          TEAM_AC,
    person_id_a:      PLAYER_ALICE,
    person_id_b:      PLAYER_CAROL,
    first_year:       2012,
    last_year:        2012,
    appearance_count: 1,
  });
  insertNetTeamMember(db, { team_id: TEAM_AC, person_id: PLAYER_ALICE, position: 'a' });
  insertNetTeamMember(db, { team_id: TEAM_AC, person_id: PLAYER_CAROL, position: 'b' });

  insertNetTeamAppearance(db, { team_id: TEAM_AC, event_id: ev2012, discipline_id: disc2012, result_entry_id: entry_ac_2012, placement: 3, event_year: 2012 });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  setupDb(db);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ---------------------------------------------------------------------------

describe('GET /net/players/:personId', () => {
  it('returns 200 for a player with net appearances', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for an unknown personId', async () => {
    const app = createApp();
    const res = await request(app).get('/net/players/not-a-real-person-id');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a person who has no net appearances', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_DAVE}`);
    expect(res.status).toBe(404);
  });

  it('shows the player name', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}`);
    expect(res.text).toContain('Alice Player');
  });

  it('shows both partner names', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}`);
    expect(res.text).toContain('Bob Player');
    expect(res.text).toContain('Carol Player');
  });

  it('orders partners by appearance_count descending (Bob before Carol)', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}`);
    const posBob   = res.text.indexOf('Bob Player');
    const posCarol = res.text.indexOf('Carol Player');
    expect(posBob).toBeGreaterThan(-1);
    expect(posCarol).toBeGreaterThan(-1);
    expect(posBob).toBeLessThan(posCarol);
  });

  it('includes the evidence disclaimer', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}`);
    expect(res.text).toContain('may not reflect official partnerships');
  });

  it('links to player-partner detail pages', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}`);
    expect(res.text).toContain(`/net/players/${PLAYER_ALICE}/partners/${TEAM_AB}`);
  });

  it('does not count inferred_partial appearances', async () => {
    // Alice has 2 canonical_only with Bob + 1 canonical_only with Carol = 3 total.
    // The inferred_partial with Bob would make it 4. Verify the count stays at 3.
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}`);
    expect(res.text).toContain('3 net appearances');
    expect(res.text).not.toContain('4 net appearances');
  });

  it('does not show rankings, win/loss, or head-to-head stats', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}`);
    const lower = res.text.toLowerCase();
    expect(lower).not.toContain('win/loss');
    expect(lower).not.toContain('ranking');
    expect(lower).not.toContain('head-to-head');
    expect(lower).not.toContain('rating');
  });
});

// ---------------------------------------------------------------------------

describe('GET /net/players/:personId/partners/:teamId', () => {
  it('returns 200 for a valid player-team pair', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}/partners/${TEAM_AB}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for an unknown personId', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/not-a-person/partners/${TEAM_AB}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown teamId', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}/partners/not-a-team`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when personId is not a member of teamId', async () => {
    // Dave has no teams; TEAM_AB exists but Dave is not in it
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_DAVE}/partners/${TEAM_AB}`);
    expect(res.status).toBe(404);
  });

  it('shows both player and partner names', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}/partners/${TEAM_AB}`);
    expect(res.text).toContain('Alice Player');
    expect(res.text).toContain('Bob Player');
  });

  it('includes the evidence disclaimer', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}/partners/${TEAM_AB}`);
    expect(res.text).toContain('may not reflect official partnerships');
  });

  it('shows canonical_only appearances', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}/partners/${TEAM_AB}`);
    expect(res.text).toContain('Player Open 2010');
    expect(res.text).toContain('Player Open 2015');
  });

  it('does NOT show inferred_partial appearances', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}/partners/${TEAM_AB}`);
    // inferred_partial appearance is at Player Cup 2012 — must not appear
    expect(res.text).not.toContain('Player Cup 2012');
  });

  it('groups appearances by year with most recent first', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}/partners/${TEAM_AB}`);
    const pos2015 = res.text.indexOf('year-heading">2015');
    const pos2010 = res.text.indexOf('year-heading">2010');
    expect(pos2015).toBeGreaterThan(-1);
    expect(pos2010).toBeGreaterThan(-1);
    expect(pos2015).toBeLessThan(pos2010);
  });

  it('shows placement label', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}/partners/${TEAM_AB}`);
    expect(res.text).toContain('1st');
  });

  it('links to event pages', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}/partners/${TEAM_AB}`);
    expect(res.text).toContain('/events/event-plr-2010');
  });

  it('links to canonical team page', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}/partners/${TEAM_AB}`);
    expect(res.text).toContain(`/net/teams/${TEAM_AB}`);
  });

  it('links back to both player net pages', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}/partners/${TEAM_AB}`);
    expect(res.text).toContain(`/net/players/${PLAYER_ALICE}`);
    expect(res.text).toContain(`/net/players/${PLAYER_BOB}`);
  });

  it('also works from the partner perspective', async () => {
    // Bob can access the same team from his own player page
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_BOB}/partners/${TEAM_AB}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Bob Player');
    expect(res.text).toContain('Alice Player');
  });

  it('does not show rankings, win/loss, or head-to-head stats', async () => {
    const app = createApp();
    const res = await request(app).get(`/net/players/${PLAYER_ALICE}/partners/${TEAM_AB}`);
    const lower = res.text.toLowerCase();
    expect(lower).not.toContain('win/loss');
    expect(lower).not.toContain('ranking');
    expect(lower).not.toContain('head-to-head');
  });
});
