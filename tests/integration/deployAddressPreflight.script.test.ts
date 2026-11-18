/**
 * The deploy asks the live firewall whether this machine's address is on the
 * target's SSH allow-list before any step runs.
 *
 * Contract: a refusal stops the deploy at once, before the local rebuild, so an
 * operator on a new network learns the cause in seconds rather than after a long
 * build ends in a connection timeout. An admitted address lets the deploy go on
 * and is listed as proven. A check that could not tell lets the deploy go on and
 * is listed as not proven, because the firewall is the control and this is only
 * its diagnosis. The check is asked about the deploy's own target, and never
 * reads the credential the deploy carries on stdin.
 *
 * The preflight is lifted from the shipped entry point by its own first and last
 * lines and run in a scratch tree whose allow-list script is a stand-in that
 * records what it was asked. Nothing reaches AWS or a host.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = process.cwd();
const scratch = createScratchDir('deploy-address-preflight');
afterAll(() => removeScratch(scratch));
let seq = 0;

const FIRST = "# This machine's address against the target's SSH allow-list, before any step.";

/** The preflight, from its opening comment to the end of the case that acts on the verdict. */
function preflight(): string {
  const lines = readFileSync(join(REPO_ROOT, 'deploy_to_aws.sh'), 'utf8').split('\n');
  const start = lines.indexOf(FIRST);
  expect(start, 'deploy_to_aws.sh carries the allow-list preflight').toBeGreaterThan(-1);
  const caseAt = lines.findIndex((l, i) => i > start && l.startsWith('case "$_addr_rc" in'));
  const end = lines.findIndex((l, i) => i > caseAt && l === 'esac');
  expect(caseAt, 'the preflight acts on the check').toBeGreaterThan(start);
  expect(end, 'the preflight ends').toBeGreaterThan(caseAt);
  return lines.slice(start, end + 1).join('\n');
}

interface Drive {
  target: 'footbag-staging' | 'footbag-production';
  /** The stand-in check's exit: 0 admitted, 1 refused, 3 could not tell. */
  verdict: number;
  /** Run the stand-in through the named seam rather than at the script's own path. */
  viaSeam?: boolean;
}

function drive({ target, verdict, viaSeam = false }: Drive) {
  const world = join(scratch, `world-${++seq}`);
  mkdirSync(join(world, 'scripts'), { recursive: true });
  const asked = join(world, 'asked');
  const stdinSeen = join(world, 'stdin-seen');
  const check = join(world, viaSeam ? 'seam-check.sh' : 'scripts/authorize-operator-address.sh');
  // The stand-in prints a banner line, and the two lines a nested closing
  // report adds, which the preflight must not pass on.
  writeFileSync(check, [
    '#!/usr/bin/env bash',
    `printf '%s' "$*" > ${JSON.stringify(asked)}`,
    `cat > ${JSON.stringify(stdinSeen)}`,
    `echo "## STAND-IN BANNER ${verdict}" >&2`,
    'echo "---FOOTBAG-PROBLEM--- LISTED ERROR stand-in problem" >&2',
    'echo "==== authorize-operator-address.sh: 1 error(s), 0 warning(s), exit 1; listed in the closing report of the run that started it ====" >&2',
    `exit ${verdict}`,
  ].join('\n') + '\n', { mode: 0o755 });

  const driver = join(world, 'driver.sh');
  writeFileSync(driver, [
    'set -euo pipefail',
    `source ${JSON.stringify(join(REPO_ROOT, 'scripts/lib/closing-report.sh'))}`,
    `SCRIPT_DIR=${JSON.stringify(world)}`,
    `DEPLOY_TARGET=${target}`,
    preflight(),
    'echo REACHED-FIRST-STEP >&2',
  ].join('\n') + '\n');

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (viaSeam) env.FOOTBAG_ADDRESS_CHECK_CMD = check;
  else delete env.FOOTBAG_ADDRESS_CHECK_CMD;
  const res = spawnSync('bash', [driver], {
    cwd: world, encoding: 'utf8', env, input: 'fixture-credential\n', ...SPAWN_GUARD,
  });
  const err = res.stderr ?? '';
  const at = err.indexOf('==== Closing report');
  return {
    status: res.status,
    err,
    report: at < 0 ? '' : err.slice(at),
    asked: existsSync(asked) ? readFileSync(asked, 'utf8') : '',
    stdinSeen: existsSync(stdinSeen) ? readFileSync(stdinSeen, 'utf8') : null,
  };
}

describe('the deploy checks the SSH allow-list before any step', () => {
  it('stops before the first step when the address is refused, and says why in its report', () => {
    // Defect caught: the deploy runs the whole local rebuild and only then times out.
    const r = drive({ target: 'footbag-staging', verdict: 1 });
    expect(r.status).toBe(1);
    expect(r.err).not.toContain('REACHED-FIRST-STEP');
    expect(r.err).toContain('## STAND-IN BANNER 1');
    expect(r.report).toContain('not on the staging SSH allow-list');
  });

  it('goes on, listing the address as proven, when the firewall admits it', () => {
    const r = drive({ target: 'footbag-staging', verdict: 0 });
    expect(r.status).toBe(0);
    expect(r.err).toContain('REACHED-FIRST-STEP');
    expect(r.report).toMatch(/Proven:\n(?:  - .*\n)*  - this machine's address is on the staging SSH allow-list/);
  });

  it('goes on, listing the check as not proven, when it could not tell', () => {
    // Defect caught: a machine without AWS access is refused a deploy the
    // firewall would have admitted, or the unknown is reported as admitted.
    const r = drive({ target: 'footbag-staging', verdict: 3 });
    expect(r.status).toBe(0);
    expect(r.err).toContain('REACHED-FIRST-STEP');
    expect(r.report).toMatch(/Not proven:\n(?:  - .*\n)*  - whether this machine's address is on the staging SSH allow-list/);
    expect(r.report).not.toMatch(/Proven:\n(?:  - .*\n)*  - this machine's address is on/);
  });

  it('asks about the deploy\'s own target', () => {
    for (const [target, env] of [['footbag-staging', 'staging'], ['footbag-production', 'production']] as const) {
      const r = drive({ target, verdict: 0 });
      expect(r.asked, target).toBe(`--target ${env} --check`);
    }
  });

  it('never hands the check the credential the deploy carries on stdin', () => {
    const r = drive({ target: 'footbag-staging', verdict: 0 });
    expect(r.stdinSeen).toBe('');
  });

  it('drops the nested report\'s marked line and tally, which no report of this run lists', () => {
    const r = drive({ target: 'footbag-staging', verdict: 1 });
    expect(r.err).toContain('## STAND-IN BANNER 1');
    expect(r.err).not.toContain('---FOOTBAG-PROBLEM---');
    expect(r.err).not.toContain('listed in the closing report of the run that started it');
  });

  it('runs a stand-in named by the seam in place of the script, and says so', () => {
    const r = drive({ target: 'footbag-staging', verdict: 0, viaSeam: true });
    expect(r.asked).toBe('--target staging --check');
    expect(r.err).toMatch(/NOTE: the SSH allow-list check is a stand-in/);
  });
});
