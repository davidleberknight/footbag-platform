/**
 * scripts/pentest/zap-baseline.sh — the passive ZAP leg of the heavyweight pentest.
 *
 * The leg is report-only, so a machine without Docker still passes the pentest
 * gate. What keeps that honest is the line it prints: it says NOT RUN, which the
 * local runner's final report collects ahead of every other notice, so a pentest
 * that passed without its ZAP leg is named as such rather than reading as a full
 * scan. A scan that never finishes is held to a time limit and stopped, because
 * the leg reports only and must not hold the whole run hostage: an unhealthy
 * container otherwise stalls the pentest gate, and the full run with it, forever.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'pentest', 'zap-baseline.sh');
const ACTIVE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'pentest', 'zap-active.sh');
const HARNESS = path.join(REPO_ROOT, 'scripts', 'pentest', 'run-heavy.sh');

describe('the pentest harness switch that leaves ZAP out', () => {
  const harness = (args: string[]) =>
    spawnSync('/bin/bash', [HARNESS, ...args], { encoding: 'utf8', env: process.env, ...SPAWN_GUARD });

  // Defect caught: the full run's --no-zap is rejected as unknown, failing the
  // pentest row, or is accepted alongside an active scan it silently cancels.
  it('accepts --no-zap, and refuses it together with a ZAP scan it contradicts', () => {
    const ok = harness(['--no-zap', '--help']);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('--no-zap');
    for (const scan of ['--zap-active', '--all']) {
      const clash = harness(['--no-zap', scan]);
      expect(clash.status, scan).toBe(2);
      expect(clash.stderr).toContain('contradict');
    }
  });
});

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

describe('zap-baseline.sh when the scan hangs', () => {
  // Defect caught: a ZAP container that never finishes (it once sat unhealthy for
  // forty minutes) blocks the pentest gate and the whole local run with it, and
  // the report then reads as a completed scan.
  it.each([
    ['the baseline scan', SCRIPT, 'baseline'],
    ['the opt-in active scan', ACTIVE_SCRIPT, 'active'],
  ])('stops %s at its time limit, passes, and says NOT RUN', (_label, script, key) => {
    const bin = path.join(scratch, `hanging-docker-${key}`);
    mkdirSync(bin, { recursive: true });
    const calls = path.join(scratch, `docker-calls-${key}.log`);
    // A docker whose `run` never returns on its own and ignores the polite stop
    // signal, as the real client does when the scan inside the container is its
    // first process: only a forced kill ends it.
    writeFileSync(
      path.join(bin, 'docker'),
      ['#!/bin/bash', `echo "$*" >> "${calls}"`, `[ "$1" = "run" ] && trap '' TERM && exec sleep 60`, 'exit 0'].join('\n') + '\n',
      { mode: 0o755 },
    );
    const r = spawnSync('/bin/bash', [script], {
      cwd: scratch,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, ZAP_TIMEOUT_SECONDS: '1', ZAP_KILL_AFTER_SECONDS: '1' },
      ...SPAWN_GUARD,
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/\[zap(-active)?\] NOT RUN/);
    const log = existsSync(calls) ? readFileSync(calls, 'utf8') : '';
    const name = /--name (\S+)/.exec(log)?.[1];
    expect(name, log).toBeDefined();
    expect(log).toMatch(new RegExp(`^stop .*${name}`, 'm'));
  });
});
