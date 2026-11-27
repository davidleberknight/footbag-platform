/**
 * The site's service unit handing the database files back to the app account
 * before every start.
 *
 * The app runs as uid 1000. A root process that opens the database while the
 * stack is down (the final backup, a restore, a migration) can leave the
 * write-ahead log and shared-memory files owned by root, and the app then
 * cannot reopen its database. The contract these assert, through the command
 * line the unit itself carries: the database and whichever side files exist
 * go to uid 1000, the markers beside them are left as they are, and a chown
 * that fails stops the start.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const UNIT = readFileSync(join(process.cwd(), 'ops/systemd/footbag.service'), 'utf8');

/** The unit's ownership line, unescaped the way systemd unescapes it. */
function ownershipScript(): string {
  const line = UNIT.split('\n').find((l) => l.startsWith('ExecStartPre=') && l.includes('chown 1000:1000'));
  expect(line, 'the service unit hands the database files back before a start').toBeDefined();
  const quoted = line!.match(/bash -c '(.*)'$/);
  expect(quoted, 'the ownership line is one quoted bash program').not.toBeNull();
  return quoted![1].replace(/\$\$/g, '$');
}

let dir: string;
let dbDir: string;
let calls: string;

beforeEach(() => {
  dir = createScratchDir('footbag-service-db-ownership');
  dbDir = join(dir, 'db');
  mkdirSync(dbDir);
  mkdirSync(join(dir, 'bin'));
  calls = join(dir, 'chown.log');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(chownExit = 0) {
  const stub = join(dir, 'bin', 'chown');
  writeFileSync(stub, `#!/usr/bin/env bash\necho "$*" >> ${JSON.stringify(calls)}\nexit ${chownExit}\n`);
  chmodSync(stub, 0o755);
  return spawnSync('bash', ['-c', ownershipScript()], {
    env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`, FOOTBAG_DB_DIR: dbDir },
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
}

describe('footbag.service before a start', () => {
  // Defect caught: root-owned side files left by a root opener stop the app
  // reopening its database; or the markers beside it handed to the app account,
  // which could then write the declared-restore marker itself.
  it('hands the database and the side files that exist to uid 1000, and nothing else', () => {
    for (const f of ['footbag.db', 'footbag.db-wal', '.erasure-replay-pending', '.declared-restore']) writeFileSync(join(dbDir, f), '');
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    const owned = readFileSync(calls, 'utf8').trim().split('\n');
    expect(owned).toEqual([`1000:1000 ${join(dbDir, 'footbag.db')}`, `1000:1000 ${join(dbDir, 'footbag.db-wal')}`]);
  });

  // Defect caught: an empty host, before its first database, refused a start.
  it('starts with nothing to hand back when there is no database yet', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(calls)).toBe(false);
  });

  // Defect caught: an app started on a database it cannot write, because the
  // ownership change failed and the start went ahead anyway.
  it('stops the start when the ownership change fails', () => {
    writeFileSync(join(dbDir, 'footbag.db'), '');
    const r = run(1);
    expect(r.status).not.toBe(0);
  });
});
