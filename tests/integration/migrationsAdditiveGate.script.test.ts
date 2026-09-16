/**
 * The gate that keeps a migration additive.
 *
 * A migrating deploy promotes the new code and images before it runs the migration,
 * and restoring the pre-migration database on failure does not put the old code back.
 * The host comes up running the new release against the old schema, and expand and
 * contract is what makes that survivable: add in one release, read in the next, remove
 * in a third once nothing reads it. The same shape is what lets a restore to a snapshot
 * taken before the migration still serve traffic.
 *
 * Every case runs the real gate inside a throwaway repository rather than against this
 * one, so a refused migration can be asserted without a refused migration ever existing
 * here. The last case runs it against this repository, which is what keeps the fixtures
 * honest about the real parse.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const GATE = join(process.cwd(), 'scripts/ci/check_migrations_additive.sh');

interface RunResult { exitCode: number; stdout: string; stderr: string }

/**
 * Stands up a throwaway repository holding only the migrations the gate reads,
 * runs the gate inside it, and tears it down. The gate resolves its own root
 * through git, so the fixture has to be a repository rather than a bare
 * directory.
 */
function inFixtureRepo(migrations: Record<string, string>): RunResult {
  const root = mkdtempSync(join(tmpdir(), 'footbag-test-migrations-gate-'));
  try {
    spawnSync('git', ['init', '-q', root], { encoding: 'utf8', ...SPAWN_GUARD });
    mkdirSync(join(root, 'database', 'migrations'), { recursive: true });
    for (const [name, body] of Object.entries(migrations)) {
      writeFileSync(join(root, 'database', 'migrations', name), body);
    }
    const res = spawnSync('bash', [GATE], {
      cwd: root, encoding: 'utf8', ...SPAWN_GUARD,
    });
    return { exitCode: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('the additive-migration gate', () => {
  it('accepts a migration that only adds', () => {
    const res = inFixtureRepo({
      '2030-01-01-add.sql': 'ALTER TABLE members ADD COLUMN nickname TEXT;\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('refuses a dropped column', () => {
    const res = inFixtureRepo({
      '2030-01-01-drop.sql': 'ALTER TABLE members DROP COLUMN nickname;\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('must be additive');
    expect(res.stderr).toContain('2030-01-01-drop.sql');
  });

  it('refuses a dropped table', () => {
    const res = inFixtureRepo({ '2030-01-01-drop-table.sql': 'DROP TABLE members;\n' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('must be additive');
  });

  it('refuses a rename, which breaks the old release as surely as a drop', () => {
    const res = inFixtureRepo({
      '2030-01-01-rename.sql': 'ALTER TABLE members RENAME COLUMN nickname TO handle;\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('must be additive');
  });

  it('accepts a contraction that declares itself', () => {
    // The third release of expand and contract is legitimate work, and the gate
    // cannot judge whether anything still reads the column. Declaring it is the
    // acknowledgement.
    const res = inFixtureRepo({
      '2030-01-01-drop.sql':
        '-- CONTRACTION: nothing has read nickname since the handle column shipped.\n'
        + 'ALTER TABLE members DROP COLUMN nickname;\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('refuses a delete, whose damage no schema read afterwards would show', () => {
    // A drop is visible in the schema forever. A delete leaves a schema that looks
    // exactly as it should, and no later release puts the rows back.
    const res = inFixtureRepo({
      '2030-01-01-purge.sql': "DELETE FROM members WHERE joined_at < '2020-01-01';\n",
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('must be additive');
    expect(res.stderr).toContain('DATA CHANGE');
  });

  it('accepts a delete that declares what it removes', () => {
    const res = inFixtureRepo({
      '2030-01-01-purge.sql':
        '-- DATA CHANGE: removes the abandoned draft rows; a restore to any earlier\n'
        + '-- snapshot serves them again harmlessly, because nothing reads a draft.\n'
        + "DELETE FROM drafts WHERE state = 'abandoned';\n",
    });
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('refuses an undeclared backfill, which is the shape a deploy is expected to carry', () => {
    // The deploy path names an additive backfill against live data as an intended
    // use, so this is not forbidden work; it is work that says what it writes.
    const res = inFixtureRepo({
      '2030-01-01-backfill.sql': "UPDATE members SET handle = nickname WHERE handle IS NULL;\n",
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('DATA CHANGE');
  });

  it('accepts a backfill that declares itself', () => {
    const res = inFixtureRepo({
      '2030-01-01-backfill.sql':
        '-- DATA CHANGE: fills the handle column added in the previous release;\n'
        + '-- it writes only rows where the column is still empty.\n'
        + 'UPDATE members SET handle = nickname WHERE handle IS NULL;\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('refuses a direct edit of the schema table, which contains neither keyword', () => {
    // Removing a table's definition this way leaves no DROP and no RENAME anywhere
    // in the file.
    const res = inFixtureRepo({
      '2030-01-01-rewrite.sql':
        'PRAGMA writable_schema = ON;\n'
        + "DELETE FROM sqlite_master WHERE name = 'members';\n",
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('CONTRACTION');
  });

  it('does not let one declaration cover the statement written underneath it', () => {
    // The marker used to be read per file, so the first acknowledged statement
    // bought immunity for everything after it, including work added later by
    // somebody who read the header as already settled.
    const res = inFixtureRepo({
      '2030-01-01-two.sql':
        '-- DATA CHANGE: clears the abandoned drafts, which nothing reads.\n'
        + "DELETE FROM drafts WHERE state = 'abandoned';\n"
        + '\n'
        + 'DELETE FROM members WHERE tier IS NULL;\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('members');
    expect(res.stderr).not.toContain('drafts');
  });

  it('does not trip on a comment that merely mentions dropping', () => {
    // A header explaining what a migration deliberately does not do must not be
    // read as the thing it says it is avoiding.
    const res = inFixtureRepo({
      '2030-01-01-add.sql':
        '-- Adds the column. A later migration will DROP COLUMN nickname once\n'
        + '-- nothing reads it; this one does not.\n'
        + 'ALTER TABLE members ADD COLUMN handle TEXT;\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('passes when there are no migrations at all', () => {
    const res = inFixtureRepo({});
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('passes against this repository', () => {
    const res = spawnSync('bash', [GATE], {
      cwd: process.cwd(), encoding: 'utf8', ...SPAWN_GUARD,
    });
    expect(res.status, res.stderr ?? '').toBe(0);
  });
});
