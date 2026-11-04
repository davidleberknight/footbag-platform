/**
 * scripts/internal/dnf-check-update-remote.sh -- the host-side count of the
 * packages `dnf check-update` lists for a release.
 *
 * The contract pinned: a saved listing parses to the number of update rows in
 * it, the "Obsoleting Packages" section left out; and a run reports exit 0 as no
 * updates, exit 100 as the rows it counted, and as a marked error either a failed
 * run or exit 100 with no row it can count, never a count of 0.
 *
 * The listings are the samples beside tests/fixtures/dnfSamples.ts. The helper
 * runs here as the hosts run it, behind the remote reporting library, with a
 * stand-in dnf first on the path.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { readDnfSample } from '../fixtures/dnfSamples';

const PARSER = join(process.cwd(), 'scripts/internal/dnf-check-update-remote.sh');
const REPORT_LIB = join(process.cwd(), 'scripts/lib/closing-report-remote.sh');

let dir: string;
beforeEach(() => { dir = createScratchDir('dnf-check-update'); });
afterEach(() => removeScratch(dir));

/** Runs a bash body with the reporting library and the parser sourced. */
function run(body: string, path = process.env.PATH ?? '') {
  const script = [`source ${JSON.stringify(REPORT_LIB)}`, `source ${JSON.stringify(PARSER)}`, body, 'crr_finish'].join('\n');
  const r = spawnSync('bash', ['-c', `set -uo pipefail\n${script}`], {
    encoding: 'utf-8', env: { ...process.env, PATH: path }, ...SPAWN_GUARD,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** A stand-in dnf answering check-update with the given output and exit. */
function dnfAnswering(out: string, rc: number): string {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const listing = join(dir, 'listing');
  writeFileSync(listing, out);
  writeFileSync(join(bin, 'dnf'), [
    '#!/usr/bin/env bash',
    `[[ "$1" == check-update ]] || exit 64`,
    `cat ${JSON.stringify(listing)}`,
    `exit ${rc}`,
  ].join('\n') + '\n');
  chmodSync(join(bin, 'dnf'), 0o755);
  return `${bin}:${process.env.PATH ?? ''}`;
}

const COUNT = 'if dnf_check_update 2023.12.20261021 "stand-in context"; then echo "count=${DNF_UPDATE_COUNT}"; else echo "failed count=${DNF_UPDATE_COUNT}"; fi';

describe('dnf_check_update_rows', () => {
  it('counts every update row of a listing', () => {
    // Defect caught: a parser that matches none of the rows dnf prints, so a host
    // behind on every package reads as having nothing to install.
    const s = readDnfSample('dnf-check-update.sample.txt');
    writeFileSync(join(dir, 'l'), s.body);
    const r = run(`dnf_check_update_rows ${JSON.stringify(join(dir, 'l'))}`);
    expect(s.expectedRows).toBeGreaterThan(0);
    expect(r.stdout.trim()).toBe(String(s.expectedRows));
  });

  it('leaves out the rows of the Obsoleting Packages section', () => {
    // Defect caught: the packages a release obsoletes, and the installed ones
    // they replace, are counted as updates, so the confirmation overstates what
    // the step changes and a finished step reads as packages left to install.
    const s = readDnfSample('dnf-check-update-obsoleting.sample.txt');
    writeFileSync(join(dir, 'l'), s.body);
    expect(s.body).toMatch(/^Obsoleting/m);
    const r = run(`dnf_check_update_rows ${JSON.stringify(join(dir, 'l'))}`);
    expect(r.stdout.trim()).toBe(String(s.expectedRows));
  });
});

describe('dnf_check_update', () => {
  it('reports the rows it counted on exit 100', () => {
    const s = readDnfSample('dnf-check-update.sample.txt');
    const r = run(COUNT, dnfAnswering(s.body, 100));
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe(`count=${s.expectedRows}`);
  });

  it('reports no updates on exit 0', () => {
    const r = run(COUNT, dnfAnswering('', 0));
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('count=0');
  });

  it('marks an error, and gives no count, on exit 100 with no row it can count', () => {
    // Defect caught: dnf says updates exist in a layout the parser no longer
    // reads, and the step is judged complete, or the operator confirms "0
    // packages", over updates that exist.
    const r = run(COUNT, dnfAnswering('Some layout this parser has never seen\n', 100));
    expect(r.status).toBe(1);
    expect(r.stdout.trim()).toBe('failed count=');
    expect(r.stderr).toMatch(/^---FOOTBAG-PROBLEM--- ERROR .*listed none this parser can count; stand-in context$/m);
  });

  it('marks an error with dnf\'s last line when the run fails', () => {
    // Defect caught: a repository error read as "nothing to do".
    const r = run(COUNT, dnfAnswering('Error: stand-in repository unreachable\n', 1));
    expect(r.status).toBe(1);
    expect(r.stdout.trim()).toBe('failed count=');
    expect(r.stderr).toMatch(/^---FOOTBAG-PROBLEM--- ERROR .*\(exit 1\): Error: stand-in repository unreachable; stand-in context$/m);
  });
});
