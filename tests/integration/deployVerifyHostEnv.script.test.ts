/**
 * A deploy verifies the host's env file before it reports itself done.
 *
 * Contract: after its smoke checks, each deploy leaf runs the host env verifier
 * against the environment it deployed, handing it the sudo password on stdin
 * and never in an argument, and reports "Deploy complete." only when the
 * verifier passes. A failing verifier fails the deploy.
 *
 * The verify stretch of each leaf is lifted from the file by its own first and
 * last lines, so the code driven is the shipped code, and run against a stub
 * verifier that records its arguments and stdin. Nothing reaches a host or AWS.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = process.cwd();
const scratch = createScratchDir('deploy-verify-host-env');
afterAll(() => removeScratch(scratch));
let seq = 0;

const LEAVES = ['scripts/deploy-code.sh', 'scripts/deploy-rebuild.sh'];
const FIRST = 'VERIFY_HOST_ENV_CMD="${DEPLOY_VERIFY_HOST_ENV_CMD:-$REPO_ROOT/scripts/verify-host-env.sh}"';
const LAST = 'echo "Deploy complete."';

function sectionOf(leaf: string): { lines: string[]; start: number; end: number } {
  const lines = readFileSync(join(REPO_ROOT, leaf), 'utf8').split('\n');
  const start = lines.indexOf(FIRST);
  expect(start, `${leaf} runs the host env verifier`).toBeGreaterThan(-1);
  const end = lines.findIndex((l, i) => i > start && l === LAST);
  expect(end, `${leaf} reports completion after verifying`).toBeGreaterThan(start);
  return { lines, start, end };
}

/** Runs one leaf's verify stretch against a stub verifier exiting with `verdict`. */
function driveVerify(leaf: string, verdict: number, seam = false) {
  const world = join(scratch, `world-${++seq}`);
  mkdirSync(join(world, 'scripts'), { recursive: true });
  const log = join(world, 'verifier.log');
  const verifier = join(world, 'scripts', 'verify-host-env.sh');
  writeFileSync(
    verifier,
    [
      '#!/usr/bin/env bash',
      `printf 'args=%s\\n' "$*" >> ${JSON.stringify(log)}`,
      `IFS= read -r line; printf 'stdin=%s\\n' "$line" >> ${JSON.stringify(log)}`,
      `exit ${verdict}`,
    ].join('\n') + '\n',
  );
  const { lines, start, end } = sectionOf(leaf);
  const driver = join(world, 'driver.sh');
  writeFileSync(
    driver,
    [
      'set -euo pipefail',
      `REPO_ROOT=${JSON.stringify(world)}`,
      'REMOTE=footbag-production; FOOTBAG_ENV=production; SUDO_PASS=fixture-password',
      ...lines.slice(start, end + 1),
    ].join('\n') + '\n',
  );
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.DEPLOY_VERIFY_HOST_ENV_CMD;
  if (seam) env.DEPLOY_VERIFY_HOST_ENV_CMD = verifier;
  const res = spawnSync('bash', [driver], { cwd: world, encoding: 'utf8', env, ...SPAWN_GUARD });
  return {
    status: res.status,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    calls: existsSync(log) ? readFileSync(log, 'utf8') : '',
  };
}

describe.each(LEAVES)('%s verifies the host env file before reporting done', (leaf) => {
  // Defect caught: a deploy that synced the wrong value, or left a stale one,
  // reports success, and the drift waits for someone to remember the verifier.
  it('runs the verifier for the deployed environment, password on stdin, and completes when it passes', () => {
    const res = driveVerify(leaf, 0);
    expect(res.status, res.stderr).toBe(0);
    expect(res.calls).toContain('args=--target production\n');
    expect(res.calls).toContain('stdin=fixture-password\n');
    expect(res.stdout).toContain('Deploy complete.');
    expect(res.stderr).not.toContain('SYNTHETIC');
  });

  it('fails the deploy, without reporting it complete, when the verifier fails', () => {
    const res = driveVerify(leaf, 1);
    expect(res.status).toBe(1);
    expect(res.stdout).not.toContain('Deploy complete.');
    expect(res.stderr).toMatch(/env file failed verification after the deploy/);
  });

  it('says on stderr when the verifier is replaced through its seam', () => {
    const res = driveVerify(leaf, 0, true);
    expect(res.status).toBe(0);
    expect(res.stderr).toMatch(/SYNTHETIC: host env verifier replaced by DEPLOY_VERIFY_HOST_ENV_CMD=/);
  });

  // Defect caught: a verify step placed before the smoke checks, or an early
  // exit between them, lets the deploy report done on a site that never
  // answered, or skip verification on the path that smoke-checks.
  it('runs after the last smoke check, with no exit 0 between it and completion', () => {
    const { lines, start, end } = sectionOf(leaf);
    const lastSmoke = lines.map((l, i) => (l.includes('scripts/smoke-security.sh') ? i : -1)).filter((i) => i >= 0).pop();
    expect(lastSmoke, `${leaf} runs the security smoke`).toBeDefined();
    expect(start).toBeGreaterThan(lastSmoke!);
    const earlyExit = lines.slice(lastSmoke!, start).filter((l) => /^\s*exit 0\b/.test(l));
    expect(earlyExit).toEqual([]);
    expect(lines.slice(start, end).some((l) => /^\s*exit 0\b/.test(l))).toBe(false);
  });
});
