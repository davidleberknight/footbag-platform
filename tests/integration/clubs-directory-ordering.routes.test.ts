/**
 * The club directory is a discovery surface, not just an archive. Within a
 * country, clubs with current activity (known leaders, then member activity)
 * sort ahead of dormant "Needs update" records and deactivated "Historical club"
 * records, so a visitor browsing "find a club near you" meets live clubs first
 * while archival records stay listed and searchable, just lower.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertClub,
  insertHistoricalPerson,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3105');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // A live club with member activity, named so it sorts LAST alphabetically.
  const liveId = insertClub(db, { name: 'Zeta Live Club', country: 'USA', publiclyVisible: true });
  const personId = insertHistoricalPerson(db, { person_id: 'dir-order-person', person_name: 'Dir Member' });
  const candidateId = insertLegacyClubCandidate(db, {
    legacy_club_key: 'legacy_dir_order',
    display_name: 'Zeta Live Club',
    mapped_club_id: liveId,
  });
  insertLegacyPersonClubAffiliation(db, {
    historical_person_id: personId,
    legacy_club_candidate_id: candidateId,
    resolution_status: 'confirmed_current',
    resolved_club_id: liveId,
  });

  // A dormant record (active row, no leaders, no members), named to sort FIRST
  // alphabetically. Discovery order must still place the live club above it.
  insertClub(db, { name: 'Alpha Dormant Club', country: 'USA', publiclyVisible: true });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /clubs/usa — discovery ordering', () => {
  it('places a live club above an alphabetically-earlier dormant record', async () => {
    const res = await request(await createApp()).get('/clubs/usa');
    expect(res.status).toBe(200);
    const live = res.text.indexOf('Zeta Live Club');
    const dormant = res.text.indexOf('Alpha Dormant Club');
    expect(live).toBeGreaterThan(-1);
    expect(dormant).toBeGreaterThan(-1);
    // Live-with-activity precedes the dormant record despite reverse alpha order,
    // and the dormant record is still present (searchable, not hidden).
    expect(live).toBeLessThan(dormant);
  });
});
