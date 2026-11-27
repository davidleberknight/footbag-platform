/**
 * scripts/lib/backup-key.sh: when a database backup was taken, read from its
 * key, and the line a restore shows before it replaces anything.
 *
 * The contract: a key in the backup's own form gives its UTC time and its age
 * at the moment asked; a key in any other form says its time is unknown rather
 * than inventing one; and the database restore shows the line, on every path,
 * before its typed confirmation.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const LIB = join(process.cwd(), 'scripts/lib/backup-key.sh');

function ageLine(key: string, now: number): string {
  const r = spawnSync('bash', ['-c', `source ${JSON.stringify(LIB)}\nbackup_key_age_line "$1" "$2"`, '_', key, String(now)], {
    encoding: 'utf8', ...SPAWN_GUARD,
  });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
}

describe('backup_key_age_line', () => {
  // Defect caught: an operator about to restore shown no age, or a wrong one,
  // so a day-old snapshot replaces the live database unnoticed.
  it('gives the time a backup was taken and how long ago, from the key', () => {
    // 2026-11-27T10:00:00Z, and 26 hours 5 minutes later.
    const taken = Date.UTC(2026, 10, 27, 10, 0, 0) / 1000;
    expect(ageLine('routine/footbag-20261127T100000Z.db.gz', taken + 26 * 3600 + 5 * 60))
      .toBe('2026-11-27T10:00:00Z, 26h 05m ago');
  });

  // Defect caught: a key in another form read as a time it does not carry.
  it('says the time is unknown for a key that carries none', () => {
    expect(ageLine('routine/manual-copy.db.gz', 0)).toBe('unknown (the key carries no timestamp)');
  });
});

describe('scripts/restore-db.sh', () => {
  // Defect caught: a named --snapshot restored behind the confirmation with
  // nothing saying how old it is.
  it('shows the snapshot\'s age before its typed confirmation', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/restore-db.sh'), 'utf8');
    const shown = source.indexOf('echo "  taken:           $(backup_key_age_line "$SNAPSHOT_KEY"');
    expect(shown).toBeGreaterThan(-1);
    expect(shown).toBeLessThan(source.indexOf('confirm_from_tty "Type \'${CONFIRM_WORD}\' to continue: "'));
  });
});
