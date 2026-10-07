/**
 * Every legacy import gate can fail.
 *
 * The pre-cutover checklist stops on a gate that prints FAIL, so a gate whose
 * probe can never find what it looks for is a cutover that proceeds on bad
 * data with a clean report. Each row below starts from a loaded population on
 * which every gate passes, plants exactly the defect one gate exists for, and
 * asserts that gate alone turns red and the script exits non-zero. The gate
 * labels are read from the script itself, so a gate added there without a row
 * here fails the completeness check.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { REPO_ROOT } from '../fixtures/sourceTree';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertLegacyMember, type LegacyMemberOverrides } from '../fixtures/factories';

const { dbPath } = setTestEnv('4447');

const SCRIPT = 'scripts/validate-legacy-import-gates.sh';

interface GateRun {
  status: number;
  lines: Map<string, string>;
}

function runGates(): GateRun {
  let stdout = '';
  let status = 0;
  try {
    stdout = execFileSync('bash', [SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, FOOTBAG_DB_PATH: dbPath },
      encoding: 'utf8',
      stdio: 'pipe',
      ...SPAWN_GUARD,
    });
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    stdout = e.stdout ?? '';
    status = e.status ?? -1;
  }
  const lines = new Map<string, string>();
  for (const line of stdout.split('\n')) {
    const m = /^GATE: (G\d+) (PASS|FAIL): /.exec(line);
    if (m) lines.set(m[1], m[2]);
  }
  return { status, lines };
}

/**
 * A loaded population every gate passes on: export provenance, a legal name
 * and a country on every row, distinct addresses and user ids, one honoree and
 * one paid Tier 2 flag. Twenty rows, so one row is five per cent of the whole.
 */
const POPULATION = 20;

function baseline(i: number): LegacyMemberOverrides {
  return {
    legacy_member_id: `93${String(i).padStart(4, '0')}`,
    legacy_user_id: `user${i}`,
    legacy_email: `legacy${i}@example.test`,
    real_name: `Real Person ${i}`,
    display_name: `Person ${i}`,
    country: 'US',
    import_source: 'legacy_site_data',
    is_hof: i === 0 ? 1 : 0,
    legacy_ever_paid_tier2: i === 1 ? 1 : 0,
  };
}

/** Replace the legacy population with the baseline, each row passed through `plant`. */
function load(plant: (row: LegacyMemberOverrides, i: number) => LegacyMemberOverrides): void {
  const db = new BetterSqlite3(dbPath);
  try {
    db.prepare('DELETE FROM legacy_members').run();
    for (let i = 0; i < POPULATION; i += 1) insertLegacyMember(db, plant(baseline(i), i));
  } finally {
    db.close();
  }
}

interface RedCase {
  gate: string;
  /** The defect planted, in one phrase. */
  defect: string;
  plant: (row: LegacyMemberOverrides, i: number) => LegacyMemberOverrides;
}

const RED_CASES: RedCase[] = [
  {
    gate: 'G1',
    defect: 'two accounts share one address, in different columns and different case',
    plant: (r, i) => (i === 5 ? { ...r, legacy_email2: 'LEGACY4@example.test' } : r),
  },
  {
    gate: 'G1',
    defect: 'two accounts share one address through the third email column',
    plant: (r, i) => (i === 5 ? { ...r, legacy_email3: 'legacy4@example.test' } : r),
  },
  {
    gate: 'G1',
    defect: 'a test persona shares its address with a real member, so the persona could reach that account',
    plant: (r, i) => (i === 5 ? { ...r, import_source: 'test', legacy_email: 'legacy4@example.test' } : r),
  },
  {
    gate: 'G3',
    defect: 'one row carries no import provenance',
    plant: (r, i) => (i === 7 ? { ...r, import_source: '' } : r),
  },
  {
    gate: 'G4',
    defect: 'two rows in twenty carry no legal name, below the ninety-five per cent floor',
    plant: (r, i) => (i === 3 || i === 4 ? { ...r, real_name: null } : r),
  },
  {
    gate: 'G4',
    defect: 'eleven rows in twenty carry no country, below the fifty per cent floor',
    plant: (r, i) => (i < 11 ? { ...r, country: null } : r),
  },
  {
    gate: 'G5',
    defect: 'one row carries an empty legacy member id',
    plant: (r, i) => (i === 9 ? { ...r, legacy_member_id: '' } : r),
  },
  {
    gate: 'G6',
    defect: 'no row carries an honor flag, so the tier fallback would grant nothing',
    plant: (r) => ({ ...r, is_hof: 0, is_bap: 0 }),
  },
  {
    gate: 'G6',
    defect: 'honor flags are present but no paid-tier flag is, the shape of a stale extract',
    plant: (r) => ({ ...r, legacy_ever_paid_tier2: 0, legacy_ever_paid_tier1_lifetime: 0 }),
  },
];

/**
 * Shapes the gates must let through, each one the edge of a rule a red case
 * sits just past, so a gate tightened by mistake fails here rather than stopping
 * a correct load on cutover day.
 */
const GREEN_CASES: Array<{ shape: string; plant: RedCase['plant'] }> = [
  {
    shape: 'one account repeats its own address in a second column',
    plant: (r, i) => (i === 5 ? { ...r, legacy_email2: r.legacy_email } : r),
  },
  {
    shape: 'two test personas share an address with each other only',
    plant: (r, i) => (i === 5 || i === 6 ? { ...r, import_source: 'test', legacy_email: 'twin@example.test' } : r),
  },
  {
    shape: 'exactly ninety-five per cent of rows carry a legal name',
    plant: (r, i) => (i === 3 ? { ...r, real_name: null } : r),
  },
  {
    shape: 'exactly half the rows carry a country',
    plant: (r, i) => (i < 10 ? { ...r, country: null } : r),
  },
  {
    shape: 'the only honor flag is a Big Add Posse one',
    plant: (r) => ({ ...r, is_hof: 0, is_bap: r.is_hof }),
  },
  {
    shape: 'the only paid-tier flag is a lifetime Tier 1 one',
    plant: (r) => ({ ...r, legacy_ever_paid_tier2: 0, legacy_ever_paid_tier1_lifetime: r.legacy_ever_paid_tier2 }),
  },
];

/**
 * Gates no loaded data can make fail, each with the reason and a check that
 * the reason still holds, so the exemption lapses the day the gate becomes
 * able to fire.
 */
const CANNOT_FAIL: Record<string, { why: string; stillTrue: () => void }> = {
  G2: {
    why: 'a duplicate legacy user id is refused by the unique index on the column before any probe could count it, so this gate can never print FAIL',
    stillTrue: () => {
      const db = new BetterSqlite3(dbPath);
      try {
        db.prepare('DELETE FROM legacy_members').run();
        insertLegacyMember(db, { ...baseline(0), legacy_user_id: 'dup' });
        expect(() => insertLegacyMember(db, { ...baseline(1), legacy_user_id: 'dup' }))
          .toThrow(/UNIQUE/);
      } finally {
        db.close();
      }
    },
  },
};

function gateLabelsInScript(): string[] {
  const src = readFileSync(path.join(REPO_ROOT, SCRIPT), 'utf8');
  return [...new Set([...src.matchAll(/^\s*emit_gate (G\d+) /gm)].map((m) => m[1]))].sort();
}

beforeAll(() => {
  createTestDb(dbPath).close();
});

afterAll(() => cleanupTestDb(dbPath));

describe('legacy import gates: each one can fail', () => {
  // Defect caught: the baseline itself trips a gate, so every red case below
  // would pass for a reason that has nothing to do with its planted defect.
  it('passes every gate on a clean loaded population', () => {
    load((r) => r);
    const run = runGates();
    expect(Object.fromEntries(run.lines)).toEqual(
      Object.fromEntries(gateLabelsInScript().map((g) => [g, 'PASS'])),
    );
    expect(run.status).toBe(0);
  });

  for (const c of RED_CASES) {
    // Defect caught: a gate whose probe cannot see the defect it exists for,
    // so the cutover proceeds on data the gate was written to stop.
    it(`${c.gate} fails when ${c.defect}`, () => {
      load(c.plant);
      const run = runGates();
      const failed = [...run.lines].filter(([, v]) => v === 'FAIL').map(([g]) => g);
      expect(failed).toEqual([c.gate]);
      expect(run.status, 'a failing gate must fail the run').not.toBe(0);
    });
  }

  for (const c of GREEN_CASES) {
    // Defect caught: a gate tightened past its rule, which refuses a correct
    // load at cutover with nothing wrong in the data.
    it(`passes every gate when ${c.shape}`, () => {
      load(c.plant);
      const run = runGates();
      const failed = [...run.lines].filter(([, v]) => v !== 'PASS').map(([g]) => g);
      expect(failed).toEqual([]);
      expect(run.status).toBe(0);
    });
  }

  for (const [gate, ex] of Object.entries(CANNOT_FAIL)) {
    // Defect caught: an exemption outliving its reason, which would leave a
    // gate that can now fire with no red case.
    it(`${gate} is exempt only while ${ex.why.split(',')[0]}`, () => {
      ex.stillTrue();
    });
  }

  // Defect caught: a gate added to the script with no red case, which is a
  // check nobody has ever seen fail.
  it('every gate the script prints has a red case or a reasoned exemption', () => {
    const labels = gateLabelsInScript();
    expect(labels.length, 'no gate labels read; the parser is broken').toBeGreaterThan(3);
    const covered = new Set([...RED_CASES.map((c) => c.gate), ...Object.keys(CANNOT_FAIL)]);
    expect(labels.filter((g) => !covered.has(g))).toEqual([]);
    expect([...covered].filter((g) => !labels.includes(g)).sort(), 'a row names a gate the script no longer prints').toEqual([]);
  });
});
