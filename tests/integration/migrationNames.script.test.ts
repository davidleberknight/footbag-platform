/**
 * The gate that keeps migration files in one numbered sequence.
 *
 * The migrating deploy applies a numbered migration only on top of every
 * lower-numbered one already in the database's ledger. That refusal is only as
 * good as the numbers: two files sharing a number, or a gap, would let two hosts
 * reach the same schema by different orders. So the directory is held to
 * NNNN_snake_case_description.sql, numbered 0001 upwards with no repeat and no gap.
 *
 * Every case runs the real gate inside a throwaway repository, so a refused
 * migration can be asserted without one ever existing in this tree. The last case
 * runs it against this repository.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const GATE = join(process.cwd(), 'scripts/ci/check_migration_names.sh');

function inFixtureRepo(names: string[]): { exitCode: number; stdout: string; stderr: string } {
  const root = mkdtempSync(join(tmpdir(), 'footbag-test-migration-names-'));
  try {
    spawnSync('git', ['init', '-q', root], { encoding: 'utf8', ...SPAWN_GUARD });
    mkdirSync(join(root, 'database', 'migrations'), { recursive: true });
    writeFileSync(join(root, 'database', 'migrations', 'README.md'), 'not a migration\n');
    for (const name of names) {
      writeFileSync(join(root, 'database', 'migrations', name), 'ALTER TABLE members ADD COLUMN x TEXT;\n');
    }
    const res = spawnSync('bash', [GATE], { cwd: root, encoding: 'utf8', ...SPAWN_GUARD });
    return { exitCode: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('the migration naming gate', () => {
  it('accepts a gapless sequence from 0001, and an empty directory', () => {
    const ok = inFixtureRepo(['0001_add_nickname.sql', '0002_add_country_index.sql']);
    expect(ok.exitCode, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('2 migration file(s)');
    expect(inFixtureRepo([]).exitCode).toBe(0);
  });

  // Defect caught: a file outside the convention is applied by name, out of the
  // chain the predecessor check relies on.
  it('refuses a file not named NNNN_snake_case_description.sql', () => {
    for (const bad of ['2030-01-01-add.sql', '1_add.sql', '0001-add.sql', '0001_Add.sql']) {
      const res = inFixtureRepo([bad]);
      expect(res.exitCode, bad).toBe(1);
      expect(res.stderr, bad).toContain(`${bad}: not named NNNN_snake_case_description.sql`);
    }
  });

  // Defect caught: two files share a number, so hosts can apply them in either order.
  it('refuses a number used twice', () => {
    const res = inFixtureRepo(['0001_add_a.sql', '0001_add_b.sql']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('0001: used by more than one file');
  });

  // Defect caught: a gap, so the predecessor check demands a file that will never exist.
  it('refuses a gap, and a sequence that does not start at 0001', () => {
    const gap = inFixtureRepo(['0001_add_a.sql', '0003_add_c.sql']);
    expect(gap.exitCode).toBe(1);
    expect(gap.stderr).toContain('0002: missing');
    const late = inFixtureRepo(['0002_add_b.sql']);
    expect(late.exitCode).toBe(1);
    expect(late.stderr).toContain('0001: missing');
  });

  it('passes against this repository', () => {
    const res = spawnSync('bash', [GATE], { encoding: 'utf8', ...SPAWN_GUARD });
    expect(res.status, res.stderr).toBe(0);
  });
});
