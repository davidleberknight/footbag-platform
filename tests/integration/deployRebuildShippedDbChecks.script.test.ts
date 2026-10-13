/**
 * A production database ship refuses a database failing any data-quality check,
 * before anything reaches the host; staging is held to none of it.
 *
 * Contract: scripts/deploy-rebuild.sh runs the shared data-quality library on
 * the database it is about to ship, on a production target only, after the last
 * step that writes that file and before its first connection to the host. A
 * failing check ends the deploy with nothing sent; a passing one lets it go on.
 * A staging deploy never runs the library, because staging seeds the test
 * personas the residue check refuses.
 *
 * The stretch of the leaf from the check to its first host connection is lifted
 * from the file by its own first and last lines, so the code driven is the
 * shipped code, and run with a stand-in library and an ssh on PATH that record
 * every call. Nothing reaches a host.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = process.cwd();
const LEAF = readFileSync(join(REPO_ROOT, 'scripts', 'deploy-rebuild.sh'), 'utf8').split('\n');
const FIRST = '# Production ships only a database that passes every data-quality check and';
const LAST = 'echo "==> Rsyncing source to host..."';
const scratch = createScratchDir('deploy-rebuild-shipped-db-checks');
afterAll(() => removeScratch(scratch));
let seq = 0;

function slice(): string {
  const start = LEAF.indexOf(FIRST);
  expect(start, 'deploy-rebuild.sh runs the data-quality checks').toBeGreaterThan(-1);
  const end = LEAF.findIndex((l, i) => i > start && l.startsWith(LAST));
  expect(end, 'deploy-rebuild.sh reaches the host after the checks').toBeGreaterThan(start);
  return LEAF.slice(start, end).join('\n');
}

function drive(remote: string, checksExit: number) {
  const world = join(scratch, `world-${++seq}`);
  const bin = join(world, 'bin');
  const log = join(world, 'calls.log');
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(world, 'scripts', 'lib'), { recursive: true });
  writeFileSync(join(bin, 'ssh'), [
    '#!/usr/bin/env bash',
    `echo "ssh $*" >> ${JSON.stringify(log)}`,
  ].join('\n') + '\n', { mode: 0o755 });
  writeFileSync(join(world, 'scripts', 'lib', 'shipped-db-checks.sh'),
    `shipped_db_checks() { echo "checks $1 $2" >> ${JSON.stringify(log)}; return ${checksExit}; }\n`);
  const driver = join(world, 'driver.sh');
  writeFileSync(driver, [
    'set -euo pipefail',
    `REPO_ROOT=${JSON.stringify(world)}; LOCAL_DB="$REPO_ROOT/database/footbag.db"`,
    `REMOTE=${remote}; SSH_OPTS=(); REMOTE_RELEASE_DIR=/home/footbag/footbag-release`,
    slice(),
    'echo REACHED-RSYNC',
  ].join('\n') + '\n');
  const res = spawnSync('bash', [driver], {
    cwd: world,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
    ...SPAWN_GUARD,
  });
  return {
    world,
    status: res.status,
    out: `${res.stdout ?? ''}${res.stderr ?? ''}`,
    calls: existsSync(log) ? readFileSync(log, 'utf8') : '',
  };
}

describe('a production database ship runs every data-quality check first', () => {
  // Defect caught: a later seed rewrites the file after it was judged, so the
  // database that ships is not the one the checks passed.
  it('judges the file after the last step that writes it', () => {
    const seed = LEAF.findIndex((l) => l.includes('seed_email_templates.py'));
    const curator = LEAF.findIndex((l) => l.includes('seed_fh_curator.py'));
    const checks = LEAF.indexOf(FIRST);
    expect(seed).toBeGreaterThan(-1);
    expect(curator).toBeGreaterThan(-1);
    expect(checks).toBeGreaterThan(seed);
    expect(checks).toBeGreaterThan(curator);
  });

  // Defect caught: a production database failing a check is sent to the host.
  it('refuses on production before any connection to the host', () => {
    const r = drive('footbag-production', 1);
    expect(r.status, r.out).toBe(1);
    expect(r.calls).toContain(`checks ${r.world} ${r.world}/database/footbag.db`);
    expect(r.calls).not.toContain('ssh');
    expect(r.out).not.toContain('REACHED-RSYNC');
  });

  it('goes on to the host on production when every check passes', () => {
    const r = drive('footbag-production', 0);
    expect(r.status, r.out).toBe(0);
    expect(r.calls).toMatch(/checks [^\n]*\nssh /);
    expect(r.out).toContain('REACHED-RSYNC');
  });

  // Defect caught: staging, which seeds test personas on purpose, is refused by
  // the production residue check and cannot be deployed.
  it('never runs the checks on staging', () => {
    const r = drive('footbag-staging', 1);
    expect(r.status, r.out).toBe(0);
    expect(r.calls).not.toContain('checks');
    expect(r.calls).toContain('ssh');
  });
});
