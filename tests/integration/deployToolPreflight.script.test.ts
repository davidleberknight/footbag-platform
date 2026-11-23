/**
 * The deploy refuses to start unless every pinned workstation tool answers at
 * its pin.
 *
 * Contract: the release is built on the operator's machine, so a tool off its
 * pin (a Docker engine behind the pinned one, a sqlite3 the pin does not name)
 * builds a release the pins do not describe. The check runs before any step, asks
 * about the same tools the workstation setup script verifies, and on a refusal
 * names that script as the fix, so a clean setup run is always enough to pass it.
 * A machine at every pin goes on, with that listed as proven.
 *
 * The preflight is lifted from the shipped entry point by its own first and last
 * lines and run in a scratch tree whose tool report is a stand-in that records
 * what it was asked. Which version counts as the pin is the tool report's own
 * contract, pinned by its suite; this suite pins the wiring.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = process.cwd();
const scratch = createScratchDir('deploy-tool-preflight');
afterAll(() => removeScratch(scratch));
let seq = 0;

const FIRST = '# Every pinned workstation tool at its pin, before any step.';

/** The preflight, from its opening comment to the proven line that ends it. */
function preflight(): string {
  const lines = readFileSync(join(REPO_ROOT, 'deploy_to_aws.sh'), 'utf8').split('\n');
  const start = lines.indexOf(FIRST);
  expect(start, 'deploy_to_aws.sh carries the tool preflight').toBeGreaterThan(-1);
  const end = lines.findIndex((l, i) => i > start && l.startsWith('cr_proved "every pinned workstation tool'));
  expect(end, 'the preflight ends').toBeGreaterThan(start);
  return lines.slice(start, end + 1).join('\n');
}

/** The tools the setup script verifies, read from its own final report call. */
function setupTools(): string[] {
  const src = readFileSync(join(REPO_ROOT, 'scripts/setup-dev-workstation.sh'), 'utf8');
  const m = /^tool_report ([a-z0-9 ]+?)(?: \|\||$)/m.exec(src);
  expect(m, 'the setup script ends with a tool report').not.toBeNull();
  return m![1].trim().split(/\s+/);
}

function drive(verdict: 0 | 1) {
  const world = join(scratch, `world-${++seq}`);
  mkdirSync(join(world, 'scripts', 'lib'), { recursive: true });
  const asked = join(world, 'asked');
  writeFileSync(join(world, 'scripts', 'lib', 'tool-report.sh'), [
    '# shellcheck shell=bash',
    'tool_report() {',
    `  printf '%s' "$*" > ${JSON.stringify(asked)}`,
    `  echo "  [missing] stand-in tool problem"`,
    `  return ${verdict}`,
    '}',
  ].join('\n') + '\n');

  const driver = join(world, 'driver.sh');
  writeFileSync(driver, [
    'set -euo pipefail',
    `source ${JSON.stringify(join(REPO_ROOT, 'scripts/lib/closing-report.sh'))}`,
    `SCRIPT_DIR=${JSON.stringify(world)}`,
    preflight(),
    'echo REACHED-FIRST-STEP >&2',
  ].join('\n') + '\n');

  const res = spawnSync('bash', [driver], { cwd: world, encoding: 'utf8', ...SPAWN_GUARD });
  const err = res.stderr ?? '';
  const at = err.indexOf('==== Closing report');
  return {
    status: res.status,
    err,
    report: at < 0 ? '' : err.slice(at),
    asked: existsSync(asked) ? readFileSync(asked, 'utf8').trim().split(/\s+/) : [],
  };
}

describe('the deploy checks every pinned workstation tool before any step', () => {
  it('stops before the first step when a tool is off its pin, naming the setup script as the fix', () => {
    // Defect caught: a workstation behind the pinned Docker engine builds the
    // release anyway and fails part way through the image export, or the
    // refusal leaves the operator to work out how to fix it.
    const r = drive(1);
    expect(r.status).toBe(1);
    expect(r.err).not.toContain('REACHED-FIRST-STEP');
    expect(r.report).toContain('missing or off its pin');
    expect(r.report).toContain('bash scripts/setup-dev-workstation.sh');
    expect(r.err).toMatch(/^Recommendation: run bash scripts\/setup-dev-workstation\.sh/m);
  });

  it('goes on, listing the tools as proven, when every one answers at its pin', () => {
    const r = drive(0);
    expect(r.status, r.err).toBe(0);
    expect(r.err).toContain('REACHED-FIRST-STEP');
    expect(r.report).toMatch(/Proven:\n(?:  - .*\n)*  - every pinned workstation tool answers at its pin/);
  });

  it('asks about every tool the setup script verifies, so a clean setup run always passes the deploy', () => {
    // Defect caught: the deploy checks a tool the setup script never installs,
    // so an operator who ran it is still refused; or it skips one the setup
    // script pins, such as the Docker engine, and builds on the wrong one.
    const r = drive(0);
    expect([...r.asked].sort()).toEqual([...setupTools()].sort());
    expect(r.asked).toContain('docker');
  });
});
