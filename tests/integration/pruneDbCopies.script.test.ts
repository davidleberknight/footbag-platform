/**
 * Deleting the database copies a migrating deploy or an in-place restore set
 * aside, once they are more than seven days old.
 *
 * Each copy is a full copy of the member database. Kept forever they fill the
 * host's disk with member data nobody will reach for again; deleted too early
 * they remove the way back from a migration or a restore that went wrong.
 *
 * The contract these assert: only the two copy kinds are touched, and only when
 * the timestamp in their name is strictly more than seven days before now; the
 * name is the clock, never the file's modification time, because both copies
 * are taken with a copy that keeps the original's modification time; every other
 * file, including a copy whose name carries no readable timestamp, is kept; and
 * a run on the fixed test clock says so.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const LIB = join(process.cwd(), 'scripts/internal/prune-db-copies.sh');

/** The fixed "now" every case runs against, through the helper's clock seam. */
const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const NOW_EPOCH = NOW / 1000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The copy-aside timestamp form, YYYYMMDDTHHMMSSZ, for an age before NOW. */
function stampAged(ms: number): string {
  return new Date(NOW - ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

let dbDir: string;

beforeEach(() => {
  dbDir = createScratchDir('prune-db-copies');
});

afterEach(() => {
  rmSync(dbDir, { recursive: true, force: true });
});

function seed(name: string): string {
  const path = join(dbDir, name);
  writeFileSync(path, name);
  return path;
}

function prune(dir = dbDir): { status: number; stdout: string; stderr: string } {
  const res = spawnSync('bash', ['-c', 'source "$1"; prune_db_copies "$2"', '_', LIB, dir], {
    env: { ...process.env, PRUNE_NOW_EPOCH: String(NOW_EPOCH) },
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

describe('pruning set-aside database copies', () => {
  // Defects caught: an off-by-one on the seven-day line in either direction,
  // deleting a copy an operator could still need or keeping one past its week.
  it('deletes a copy just over seven days old and keeps one just under or exactly at it', () => {
    const justOver = seed(`footbag.db.pre-restore.${stampAged(7 * DAY + HOUR)}`);
    const justUnder = seed(`footbag.db.pre-restore.${stampAged(7 * DAY - HOUR)}`);
    const exactly = seed(`footbag.db.pre-restore.${stampAged(7 * DAY)}`);

    const res = prune();

    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(justOver)).toBe(false);
    expect(existsSync(justUnder)).toBe(true);
    expect(existsSync(exactly)).toBe(true);
    expect(res.stdout).toContain(`deleted footbag.db.pre-restore.${stampAged(7 * DAY + HOUR)}`);
    expect(res.stdout).toContain(`kept footbag.db.pre-restore.${stampAged(7 * DAY - HOUR)}`);
  });

  // Defect caught: one of the two copy kinds never pruned, so the migrating
  // deploy's copies (or the restore's) accumulate without bound.
  it('prunes the migrating deploy\'s copies as well as the restore\'s', () => {
    const migration = seed(`footbag.db.pre-migration.${stampAged(8 * DAY)}`);
    const restore = seed(`footbag.db.pre-restore.${stampAged(8 * DAY)}`);

    expect(prune().status).toBe(0);
    expect(existsSync(migration)).toBe(false);
    expect(existsSync(restore)).toBe(false);
  });

  // Defect caught: a pattern wide enough to reach the live database, its
  // write-ahead log, or a copy someone named by hand.
  it('leaves the live database, its sidecars and every other file alone', () => {
    const others = [
      seed('footbag.db'),
      seed('footbag.db-wal'),
      seed('footbag.db-shm'),
      seed('footbag.db.bak'),
      seed('.last-backup-epoch'),
      seed(`footbag.db.pre-restore.${stampAged(30 * DAY)}.bak`),
      // Old, readable timestamps on names that are not one of the two copy
      // kinds: only a pattern that is too wide reaches these.
      seed(`footbag.db.${stampAged(30 * DAY)}`),
      seed(`footbag.db.pre-other.${stampAged(30 * DAY)}`),
    ];

    expect(prune().status).toBe(0);
    for (const path of others) expect(existsSync(path), path).toBe(true);
  });

  // Defect caught: a copy whose age cannot be read treated as old and deleted,
  // when it may be the only way back.
  it('keeps a copy whose name carries no readable timestamp, and says so', () => {
    const garbled = seed('footbag.db.pre-restore.yesterday');
    const impossible = seed('footbag.db.pre-migration.20261399T250000Z');

    const res = prune();

    expect(res.status).toBe(0);
    expect(existsSync(garbled)).toBe(true);
    expect(existsSync(impossible)).toBe(true);
    expect(res.stderr).toContain('kept footbag.db.pre-restore.yesterday');
    expect(res.stderr).toContain('kept footbag.db.pre-migration.20261399T250000Z');
  });

  // Defect caught: ageing by modification time. The copies are taken with
  // `cp -a`, which keeps the original's time, so a copy made today of a database
  // last written a month ago would be deleted the day it was made, and a week-old
  // copy of a busy database would never be deleted at all.
  it('ages a copy by the timestamp in its name, never by its modification time', () => {
    const oldByName = seed(`footbag.db.pre-restore.${stampAged(8 * DAY)}`);
    utimesSync(oldByName, NOW_EPOCH, NOW_EPOCH);
    const newByName = seed(`footbag.db.pre-migration.${stampAged(DAY)}`);
    const monthAgo = NOW_EPOCH - 30 * 86_400;
    utimesSync(newByName, monthAgo, monthAgo);

    expect(prune().status).toBe(0);
    expect(existsSync(oldByName)).toBe(false);
    expect(existsSync(newByName)).toBe(true);
  });

  it('says on stderr when it runs on the fixed test clock', () => {
    expect(prune().stderr).toContain('TEST SEAM');
  });

  it('fails without touching anything when the directory does not exist', () => {
    const res = prune(join(dbDir, 'absent'));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no database directory');
  });
});
