/**
 * scripts/pentest/deps-scan.sh: the report-only dependency leg of the heavy
 * pentest.
 *
 * The leg never fails the harness, so what keeps it honest is its closing
 * report: findings are listed as warnings, and an audit that could not run is
 * listed with the tool's own message rather than read as a clean audit. The
 * audit is replaced by a stand-in npm at the front of PATH, so nothing reaches
 * the advisory database.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'pentest', 'deps-scan.sh');

const scratch = createScratchDir('deps-scan');
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The warnings section of a closing report, so a case can assert what it lists. */
function warningsListed(stderr: string): string {
  const at = stderr.search(/^Warnings \(\d+\):$/m);
  return at === -1 ? '' : stderr.slice(at);
}

/**
 * Runs the leg with an npm stand-in whose `audit --json` prints the given
 * stdout and stderr and exits with the given status.
 */
function runWithAudit(key: string, json: string, stderr: string, status: number) {
  const bin = path.join(scratch, `bin-${key}`);
  const out = path.join(scratch, `out-${key}`);
  mkdirSync(bin, { recursive: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(bin, 'audit.json'), json);
  writeFileSync(
    path.join(bin, 'npm'),
    [
      '#!/bin/bash',
      `if [[ " $* " == *" --json "* ]]; then cat "${path.join(bin, 'audit.json')}"; echo "${stderr}" >&2; exit ${status}; fi`,
      `exit ${status === 0 ? 0 : 1}`,
    ].join('\n') + '\n',
    { mode: 0o755 },
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
    PENTEST_OUT_DIR: out,
  };
  delete env.SNYK_TOKEN;
  return spawnSync('/bin/bash', [SCRIPT], { cwd: scratch, encoding: 'utf8', env, ...SPAWN_GUARD });
}

describe('deps-scan.sh reading the audit it ran', () => {
  // Defect caught: an audit that could not reach the advisory database is
  // swallowed, and the leg passes as though it found nothing.
  it('lists an audit that did not complete as NOT RUN with the npm message, and still passes', () => {
    const r = runWithAudit('broken', '{"error":{"code":"ENOTFOUND"}}', 'npm error network-down-marker', 1);
    expect(r.status, r.stderr).toBe(0);
    expect(warningsListed(r.stderr)).toMatch(/NOT RUN: npm audit .*network-down-marker/);
  });

  // Defect caught: findings land only in a report file nobody is pointed at,
  // or they fail a leg that only reports.
  it('lists findings as a warning with their count, and still passes', () => {
    const json = JSON.stringify({ metadata: { vulnerabilities: { low: 1, high: 2, total: 3 } } });
    const r = runWithAudit('findings', json, '', 1);
    expect(r.status, r.stderr).toBe(0);
    expect(warningsListed(r.stderr)).toMatch(/npm audit found 3 /);
  });

  // The same reading lets a clean audit through with nothing listed, apart from
  // the Snyk supplement this run leaves out.
  it('lists no audit warning for a clean audit', () => {
    const json = JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } });
    const r = runWithAudit('clean', json, '', 0);
    expect(r.status, r.stderr).toBe(0);
    expect(warningsListed(r.stderr)).toBe('');
  });
});
