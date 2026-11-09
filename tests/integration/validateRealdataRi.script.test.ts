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
import { insertClub, insertFreestyleTrick, insertLegacyClubCandidate } from '../fixtures/factories';

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

describe('RI5: every active trick\'s ADD matches its scoring brackets', () => {
  const trick = (slug: string, adds: string | null, notation: string | null, is_active: 0 | 1 = 1) =>
    ({ slug, canonical_name: slug.replace(/_/g, ' '), adds: adds as string, operational_notation: notation, is_active });

  // Defect caught: the check rejects a correct dictionary, including the rows it
  // cannot judge (an ADD that is not a number, a notation with no scoring flags).
  it('passes correct rows and does not judge rows it cannot check', () => {
    const res = runOn('notation_ok', (db) => {
      insertFreestyleTrick(db, trick('ok_two', '2', 'CLIP > OP IN [DEX] > OP CLIP [XBD] [KICK]'));
      insertFreestyleTrick(db, trick('ok_seven', '7', '[BOD] [DEX] [XBD] [DEL] [UNS] [PDX] [XDEX]'));
      insertFreestyleTrick(db, trick('ok_lower', '1', 'toe [del]'));
      insertFreestyleTrick(db, trick('ok_modifier', 'modifier', 'CLIP [DEX]'));
      insertFreestyleTrick(db, trick('ok_blank', '3', null));
      insertFreestyleTrick(db, trick('ok_no_flags', '3', 'toe > clip'));
    });
    expect(res.stdout).toMatch(/^GATE: RI5 PASS/m);
    expect(res.status, res.stdout + res.stderr).toBe(0);
  });

  // Defect caught: a curated ADD that disagrees with its own notation ships to
  // the dictionary, where every page shows the wrong difficulty.
  it('fails, with the count, when the ADD differs from the scoring brackets', () => {
    const res = runOn('notation_add', (db) => {
      insertFreestyleTrick(db, trick('bad_add', '5', 'CLIP > OP IN [DEX] > OP CLIP [DEL]'));
    });
    expect(res.stdout).toMatch(/^GATE: RI5 FAIL: 1 active trick/m);
    expect(res.status).toBe(1);
  });

  // Defect caught: a mistyped flag that no scorer counts, which the ADD check
  // alone would miss when the remaining flags happen to add up.
  it('fails on a bracket outside the notation vocabulary', () => {
    const res = runOn('notation_token', (db) => {
      insertFreestyleTrick(db, trick('bad_token', '1', 'CLIP [DEX] [DIX]'));
    });
    expect(res.stdout).toMatch(/^GATE: RI5 FAIL: 1 active trick/m);
    expect(res.status).toBe(1);
  });

  // Defect caught: a held row, not shown to anyone, fails the whole build.
  it('does not judge an inactive trick', () => {
    const res = runOn('notation_inactive', (db) => {
      insertFreestyleTrick(db, trick('live_one', '1', 'toe [DEL]'));
      insertFreestyleTrick(db, trick('held_bad', '9', 'toe [DEL]', 0));
    });
    expect(res.stdout).toMatch(/^GATE: RI5 PASS/m);
    expect(res.status, res.stdout + res.stderr).toBe(0);
  });

  // Defect caught: an empty dictionary reported as a clean one.
  it('says it skipped when there are no active tricks', () => {
    const res = runOn('notation_empty', () => undefined);
    expect(res.stdout).toMatch(/^GATE: RI5 SKIP/m);
    expect(res.status, res.stdout + res.stderr).toBe(0);
  });
});
