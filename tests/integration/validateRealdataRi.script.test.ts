/**
 * scripts/validate-realdata-ri.sh: the club-state invariant.
 *
 * A US or Canadian club, or a club candidate, with no state is data the
 * pipeline dropped: the old site recorded one for every such club. Left blank,
 * the clubs page stops grouping that country by state, and a member confirming a
 * club the old site never made real is asked for a state the data already held.
 * The check runs on every shipped database and on staging's real data, so a
 * build that drops the state fails there instead of reaching members.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { createTestDb } from '../fixtures/testDb';
import { insertClub, insertLegacyClubCandidate } from '../fixtures/factories';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
let tmp: string;

beforeAll(() => {
  tmp = createScratchDir('validate-realdata-ri');
});

afterAll(() => removeScratch(tmp));

function runOn(label: string, seed: (db: ReturnType<typeof createTestDb>) => void) {
  const dbFile = path.join(tmp, `${label}.db`);
  const db = createTestDb(dbFile);
  seed(db);
  db.close();
  return spawnSync('bash', ['scripts/validate-realdata-ri.sh'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, FOOTBAG_DB_PATH: dbFile },
    ...SPAWN_GUARD,
  });
}

describe('RI4: every US and Canadian club and club candidate carries a state', () => {
  it('passes when every such row has a state, and ignores countries without states', () => {
    const res = runOn('stated', (db) => {
      insertClub(db, { name: 'Stated Club', city: 'Portland', region: 'Oregon', country: 'United States' });
      insertLegacyClubCandidate(db, {
        legacy_club_key: 'ri4_stated', display_name: 'Stated Candidate', city: 'Ottawa',
        region: 'Ontario', country: 'Canada', classification: 'dormant',
      });
      insertLegacyClubCandidate(db, {
        legacy_club_key: 'ri4_finland', display_name: 'Finnish Candidate', city: 'Helsinki',
        region: null, country: 'Finland', classification: 'dormant',
      });
    });
    expect(res.stdout).toMatch(/^GATE: RI4 PASS/m);
    expect(res.status, res.stdout + res.stderr).toBe(0);
  });

  it('fails, with the count, when a candidate or a club has none', () => {
    const res = runOn('stateless', (db) => {
      insertClub(db, { name: 'Blank Club', city: 'Austin', region: '  ', country: 'United States' });
      insertLegacyClubCandidate(db, {
        legacy_club_key: 'ri4_blank', display_name: 'Blank Candidate', city: 'Denver',
        region: null, country: 'United States', classification: 'dormant',
      });
    });
    expect(res.stdout).toMatch(/^GATE: RI4 FAIL: 2 US or Canadian/m);
    expect(res.status).toBe(1);
  });
});
