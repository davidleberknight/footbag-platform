/**
 * Contract tests for scripts/capture-legacy-zone.sh: the fresh capture of the
 * legacy zone that the zone-move gate compares the Route 53 mirror against.
 *
 * The risk is a capture that looks complete and is not, or a zone that changed
 * without anyone noticing. So the script must write nothing from a transfer
 * that was refused, unreachable or truncated; must never overwrite an existing
 * capture, because captures are evidence; must compare record values rather
 * than cache lifetimes, because the mirror lowers every lifetime on purpose;
 * and must fail, naming the records, when the zone has changed, while still
 * keeping the new capture as the reference.
 *
 * Hermetic: a stand-in dig, named through the script's test seam, serves the
 * transfer from a fixture. The transfer lines follow the master-file format dig
 * prints for AXFR with +noall +answer, and the two failure shapes were captured
 * from real runs: a server that answers and refuses prints "; Transfer failed."
 * and exits 0, and an unreachable server prints ";;" notices on stdout and
 * exits 9.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'capture-legacy-zone.sh');

const SOA = 'footbag.org.\t\t720\tIN\tSOA\tdns1.llic.net. hostmaster.llic.net. 2022012001 720 360 604800 120';
const BODY = [
  'footbag.org.\t\t720\tIN\tNS\tdns1.llic.net.',
  'footbag.org.\t\t86400\tIN\tMX\t10 rimu3.footbag.org.',
  'footbag.org.\t\t86400\tIN\tMX\t20 llic.net.',
  'footbag.org.\t\t720\tIN\tTXT\t"v=spf1 a mx ip4:74.50.54.203 ~all"',
  'rimu3.footbag.org.\t720\tIN\tA\t74.50.54.203',
];
const COMPLETE = [SOA, ...BODY, SOA].join('\n') + '\n';

let dir: string;
let fakeDig: string;
let against: string;
let out: string;

function seedTransfer(content: string, exitCode = 0): void {
  fs.writeFileSync(path.join(dir, 'axfr.txt'), content);
  fs.writeFileSync(path.join(dir, 'axfr.exit'), String(exitCode));
}

function run(args?: string[]): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync(
    'bash',
    [SCRIPT, ...(args ?? ['--nameserver', 'dns2.llic.net', '--against', against, '--out', out])],
    {
      encoding: 'utf8',
      env: { ...process.env, FOOTBAG_DIG_BIN: fakeDig, FAKE_DIG_DIR: dir },
      ...SPAWN_GUARD,
    },
  );
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

beforeEach(() => {
  dir = createScratchDir('capture-legacy-zone');
  fakeDig = path.join(dir, 'dig');
  fs.writeFileSync(
    fakeDig,
    [
      '#!/usr/bin/env bash',
      'printf \'%s\\n\' "$*" >> "$FAKE_DIG_DIR/dig.log"',
      'cat "$FAKE_DIG_DIR/axfr.txt"',
      'exit "$(cat "$FAKE_DIG_DIR/axfr.exit")"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  against = path.join(dir, 'committed.zone');
  fs.writeFileSync(against, COMPLETE);
  out = path.join(dir, 'fresh.zone');
});

afterEach(() => {
  removeScratch(dir);
});

describe('capture-legacy-zone: a complete transfer', () => {
  it('writes the capture and passes when the content matches the committed capture', () => {
    seedTransfer(COMPLETE);
    const res = run();
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('PASS: identical in content');
    expect(fs.readFileSync(out, 'utf8')).toBe(COMPLETE);
  });

  it('asks the named server for a zone transfer of footbag.org', () => {
    seedTransfer(COMPLETE);
    run();
    const argv = fs.readFileSync(path.join(dir, 'dig.log'), 'utf8');
    expect(argv).toContain('AXFR footbag.org @dns2.llic.net');
  });

  it('ignores cache lifetimes, which the mirror lowers on purpose, and compares values', () => {
    seedTransfer(COMPLETE.replace(/\t86400\t/g, '\t3600\t'));
    const res = run();
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('PASS');
  });

  it('reports both serials, and a serial change alone is not a content change', () => {
    seedTransfer(COMPLETE.replace(/2022012001/g, '2026092501'));
    const res = run();
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('SOA serial 2026092501 (committed capture: 2022012001)');
  });

  it('fails and names the records when the zone has changed, and still keeps the new capture', () => {
    const changed = [SOA, ...BODY.filter((l) => !l.includes('20 llic.net')), 'new.footbag.org.\t720\tIN\tA\t192.0.2.7', SOA].join('\n') + '\n';
    seedTransfer(changed);
    const res = run();
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('FAIL: the zone has changed');
    expect(res.stdout).toMatch(/- footbag\.org\. IN MX 20 llic\.net\./);
    expect(res.stdout).toMatch(/\+ new\.footbag\.org\. IN A 192\.0\.2\.7/);
    expect(fs.existsSync(out)).toBe(true);
  });
});

describe('capture-legacy-zone: a transfer that must not become evidence', () => {
  it('writes nothing when the server refuses the transfer, which dig reports with exit 0', () => {
    seedTransfer('; Transfer failed.\n', 0);
    const res = run();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('was not clean');
    expect(fs.existsSync(out)).toBe(false);
  });

  it('writes nothing when the server cannot be reached', () => {
    seedTransfer(';; communications error to 75.144.20.98#53: timed out\n;; no servers could be reached\n', 9);
    const res = run();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('dig exit 9');
    expect(fs.existsSync(out)).toBe(false);
  });

  it('writes nothing from a truncated transfer that does not close with the SOA', () => {
    seedTransfer([SOA, ...BODY].join('\n') + '\n');
    const res = run();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('incomplete');
    expect(fs.existsSync(out)).toBe(false);
  });
});

describe('capture-legacy-zone: preconditions', () => {
  it('refuses to overwrite an existing capture, and leaves it untouched', () => {
    seedTransfer(COMPLETE);
    fs.writeFileSync(out, 'earlier evidence\n');
    const res = run();
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('never replaced');
    expect(fs.readFileSync(out, 'utf8')).toBe('earlier evidence\n');
  });

  it('refuses without a nameserver, a committed capture, or an output path', () => {
    expect(run(['--against', against, '--out', out]).status).toBe(2);
    expect(run(['--nameserver', 'dns2.llic.net', '--out', out]).status).toBe(2);
    expect(run(['--nameserver', 'dns2.llic.net', '--against', against]).status).toBe(2);
  });

  it('refuses a committed capture it cannot read', () => {
    const res = run(['--nameserver', 'dns2.llic.net', '--against', path.join(dir, 'missing.zone'), '--out', out]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('cannot read the committed capture');
  });

  it('says on stderr that a stand-in dig proves nothing about the zone', () => {
    seedTransfer(COMPLETE);
    const res = run();
    expect(res.stderr).toContain('proves nothing about the zone');
  });
});
