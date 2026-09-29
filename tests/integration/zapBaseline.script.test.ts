/**
 * scripts/pentest/zap-baseline.sh — the passive ZAP leg of the heavyweight pentest.
 *
 * The leg is report-only, so a machine without Docker still passes the pentest
 * gate. What keeps that honest is the line it prints: it says NOT RUN, which the
 * local runner's final report collects ahead of every other notice, so a pentest
 * that passed without its ZAP leg is named as such rather than reading as a full
 * scan.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'pentest', 'zap-baseline.sh');

const scratch = createScratchDir('zap-baseline');
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('zap-baseline.sh on a machine without Docker', () => {
  it('passes, and says NOT RUN so the run report names the missing leg', () => {
    // A PATH holding nothing, so no docker is found whatever this machine has.
    const emptyBin = path.join(scratch, 'empty-bin');
    mkdirSync(emptyBin, { recursive: true });
    const r = spawnSync('/bin/bash', [SCRIPT], {
      cwd: scratch,
      encoding: 'utf8',
      env: { ...process.env, PATH: emptyBin },
      ...SPAWN_GUARD,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[zap] NOT RUN: Docker not found');
  });
});
