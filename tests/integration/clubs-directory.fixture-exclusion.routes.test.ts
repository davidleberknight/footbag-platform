/**
 * The public club directory must never surface test-factory clubs, which the
 * production leak proved can be created at runtime. Every factory club is
 * unmistakably test-created (the 'club-test-' internal id, and by default the
 * reserved '#club_test_' public tag); the public read excludes the reserved tag
 * namespace, so both a default fixture and any club that carries only that tag
 * are hidden, while a legitimate club and an explicit publicly-visible opt-out
 * factory club stay visible. Deploy-time QC (a separate Python test) rejects the
 * id prefix as the strongest signal so an opted-out public club can never reach
 * a deployable build either.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertClub, insertTag } from '../fixtures/factories';

const { dbPath } = setTestEnv('3215');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // A legitimate USA club: real id, real public tag. Must stay visible.
  insertClub(db, {
    id: 'club-portland-real',
    hashtag_tag_id: insertTag(db, {
      standard_type: 'club',
      tag_normalized: '#club_portland_footbag',
      tag_display: '#Club_Portland_Footbag',
    }),
    name: 'Portland Footbag',
    city: 'Portland',
    region: 'Oregon',
    country: 'USA',
    status: 'active',
  });

  // A default factory fixture: 'club-test-' id + reserved '#club_test_' tag +
  // 'Testville' city. Must never reach the public directory.
  insertClub(db, { name: 'Default Fixture Club', country: 'USA', status: 'active' });

  // A club carrying only the reserved tag (real id, non-Testville city): the tag
  // marker alone must still exclude it from the public read.
  insertClub(db, {
    id: 'club-tagonly-real-id',
    hashtag_tag_id: insertTag(db, {
      standard_type: 'club',
      tag_normalized: '#club_test_tagonly',
      tag_display: '#Club_Test_TagOnly',
    }),
    name: 'Tag Only Fixture Club',
    city: 'Realville',
    country: 'USA',
    status: 'active',
  });

  // The explicit opt-out: an ordinary publicly-visible factory club. It keeps the
  // 'club-test-' id but takes an ordinary public tag, so it exercises normal
  // public-directory behavior. A real city is set so the only Testville club left
  // is the excluded default fixture.
  insertClub(db, { name: 'Opt Out Public Club', city: 'Beaverton', country: 'USA', status: 'active', publiclyVisible: true });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('public club directory excludes test fixtures', () => {
  it('the USA country page shows legitimate and opt-out-public clubs, hides fixtures', async () => {
    const res = await request(createApp()).get('/clubs/usa');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Portland Footbag');          // legitimate club unaffected
    expect(res.text).toContain('Opt Out Public Club');       // explicit public opt-out works
    expect(res.text).not.toContain('Default Fixture Club');  // default fixture excluded
    expect(res.text).not.toContain('Tag Only Fixture Club'); // reserved tag alone excludes
    expect(res.text).not.toContain('#club_test_');
    expect(res.text).not.toContain('Testville');
  });

  it('the club index total counts only visible clubs', async () => {
    const res = await request(createApp()).get('/clubs');
    expect(res.status).toBe(200);
    // Portland + Opt Out Public are visible; the two fixtures are excluded.
    expect(res.text).toContain('2 clubs');
    expect(res.text).not.toContain('#club_test_');
  });
});
