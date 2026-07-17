/**
 * The public club directory must never surface a test-factory club, even one
 * created at runtime by the persona seed. The authoritative fixture identity is
 * the reserved 'club-test-' internal id, so a fixture is excluded from the public
 * listings whatever tag it carries: the earlier defect was a persona club that
 * kept the 'club-test-' id but took an ordinary public tag, which slipped past a
 * tag-only exclusion. The reserved '#club_test_' tag is excluded too, as a second
 * independent marker. Only a club with a real (non-fixture) id and an ordinary
 * public tag is a legitimate public club and stays visible; its detail page stays
 * reachable by direct link regardless. Deploy-time QC (a separate Python check)
 * rejects every fixture signal so none can reach a deployable build.
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
      standard_type: 'club', tag_normalized: '#club_portland_footbag', tag_display: '#Club_Portland_Footbag',
    }),
    name: 'Portland Footbag', city: 'Portland', region: 'Oregon', country: 'USA', status: 'active',
  });

  // A default factory fixture: 'club-test-' id + reserved '#club_test_' tag +
  // 'Testville' city. Excluded by both markers.
  insertClub(db, { name: 'Default Fixture Club', country: 'USA', status: 'active' });

  // A club carrying only the reserved tag (real id): the tag marker alone excludes.
  insertClub(db, {
    id: 'club-tagonly-real-id',
    hashtag_tag_id: insertTag(db, {
      standard_type: 'club', tag_normalized: '#club_test_tagonly', tag_display: '#Club_Test_TagOnly',
    }),
    name: 'Tag Only Fixture Club', city: 'Realville', country: 'USA', status: 'active',
  });

  // THE REGRESSION: the persona-seed shape. A 'club-test-' id (default) with an
  // ordinary public tag (publiclyVisible). It must be excluded by the id marker,
  // even though its tag is not reserved.
  insertClub(db, { name: 'Persona Style Leak Club', country: 'USA', status: 'active', publiclyVisible: true });

  // A genuinely public club: a real (non-fixture) id and an ordinary public tag.
  // This is what a directory-visible club must look like.
  insertClub(db, { id: 'club-genuine-real', name: 'Genuine Public Club', city: 'Salem', country: 'USA', status: 'active', publiclyVisible: true });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('public club directory excludes test fixtures', () => {
  it('the USA country page shows only real clubs, hiding every fixture marker', async () => {
    const res = await request(createApp()).get('/clubs/usa');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Portland Footbag');           // legitimate club
    expect(res.text).toContain('Genuine Public Club');        // real id + ordinary tag
    expect(res.text).not.toContain('Default Fixture Club');   // id + tag fixture
    expect(res.text).not.toContain('Tag Only Fixture Club');  // reserved tag alone
    expect(res.text).not.toContain('Persona Style Leak Club');// 'club-test-' id with ordinary tag (the regression)
    expect(res.text).not.toContain('#club_test_');
    expect(res.text).not.toContain('Testville');
  });

  it('the country-page total equals its visible rows: the three fixtures never inflate it', async () => {
    // Five USA clubs are seeded; three are fixtures. The country heading total
    // must count only the two visible clubs, from the same filtered universe as
    // the rows, so no fixture leaks into the displayed count even by one.
    const res = await request(createApp()).get('/clubs/usa');
    expect(res.status).toBe(200);
    expect(res.text).toContain('2 clubs');
  });

  it('the club index total counts only real clubs, ignoring every fixture marker', async () => {
    // Portland + Genuine Public are the only real clubs; the default-fixture,
    // reserved-tag-only, and persona-leak clubs must not reach the total.
    const res = await request(createApp()).get('/clubs');
    expect(res.status).toBe(200);
    expect(res.text).toContain('2 clubs'); // Portland + Genuine Public
    expect(res.text).not.toContain('#club_test_');
  });
});
