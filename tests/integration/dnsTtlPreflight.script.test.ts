/**
 * Contract tests for scripts/dns-ttl-preflight.sh: the T-48h gate that the apex
 * and www serve the low TTL before the operator flips them to the distribution.
 *
 * The gate asks for an observation from the zone's own nameservers, and the
 * script's whole job is to make that observation and fail when it is not what
 * the gate requires. Three properties carry the risk and are pinned here. It
 * must never write, because Terraform owns the TTL in both the legacy-mirror
 * state and the alias state and a second writer for one value is the collision
 * the records-actor posture exists to prevent. It must report an alias as an
 * alias, since an alias has no TTL of its own and a name that has already
 * flipped is exactly what an operator might point this at. And it must refuse a
 * name carrying more than one record set rather than reading the first and
 * calling the name verified.
 *
 * Hermetic: fake `dig` and `aws` executables on PATH serve the zone from
 * fixture files, and the fake `aws` logs its own argv so the no-write property
 * can be asserted rather than assumed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'dns-ttl-preflight.sh');

const NS = 'ns-1.awsdns-00.org,ns-2.awsdns-00.co.uk';

let dir: string;
let fakeBin: string;
let rrsDir: string;
let digDir: string;
let awsLog: string;

function writeFakes(): void {
  fakeBin = path.join(dir, 'bin');
  fs.mkdirSync(fakeBin, { recursive: true });

  // Answers the one read the script makes, keyed by the Name and Type it filters
  // on, and records every invocation so a write can be detected.
  fs.writeFileSync(
    path.join(fakeBin, 'aws'),
    [
      '#!/usr/bin/env bash',
      'printf \'%s\\n\' "$*" >> "$FAKE_AWS_LOG"',
      'if [[ "${FAKE_AWS_FAIL:-}" == "1" ]]; then exit 1; fi',
      'q=""',
      'while [[ $# -gt 0 ]]; do',
      '  case "$1" in --query) q="$2"; shift 2 ;; *) shift ;; esac',
      'done',
      'name=$(printf \'%s\' "$q" | sed -E "s/.*Name==.([^\']*)..*Type.*/\\1/")',
      'rtype=$(printf \'%s\' "$q" | sed -E "s/.*Type==.([^\']*).\\]/\\1/")',
      'f="${FAKE_RRS_DIR}/${name}${rtype}.json"',
      'if [[ -f "$f" ]]; then cat "$f"; else printf \'[]\\n\'; fi',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  fs.writeFileSync(
    path.join(fakeBin, 'dig'),
    [
      '#!/usr/bin/env bash',
      'ns=""; rec=""; rtype=""',
      'for a in "$@"; do',
      '  case "$a" in',
      '    @*) ns="${a#@}" ;;',
      '    +*) ;;',
      '    A|AAAA) rtype="$a" ;;',
      '    *) rec="$a" ;;',
      '  esac',
      'done',
      'if [[ "${FAKE_DIG_SILENT_NS:-}" == "$ns" ]]; then exit 0; fi',
      'f="${FAKE_DIG_DIR}/${rec}${rtype}.txt"',
      'if [[ -f "$f" ]]; then cat "$f"; fi',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
}

function simpleSet(ttl: number): string {
  return JSON.stringify([{ Name: 'x', Type: 'A', TTL: ttl, ResourceRecords: [{ Value: '1.2.3.4' }] }]);
}

function aliasSet(): string {
  return JSON.stringify([
    { Name: 'x', Type: 'A', AliasTarget: { DNSName: 'd111111abcdef8.cloudfront.net.' } },
  ]);
}

/** The zone as the fakes will serve it: which names hold what, and what dig returns. */
function seedZone(opts: {
  apex?: 'simple' | 'alias' | 'multiple';
  www?: 'simple' | 'alias' | 'multiple';
  apexTtl?: number;
  wwwTtl?: number;
}): void {
  const shape = (kind: 'simple' | 'alias' | 'multiple', ttl: number): string => {
    if (kind === 'alias') return aliasSet();
    if (kind === 'multiple') return JSON.stringify([...JSON.parse(simpleSet(ttl)), ...JSON.parse(simpleSet(ttl))]);
    return simpleSet(ttl);
  };

  fs.writeFileSync(path.join(rrsDir, 'footbag.org.A.json'), shape(opts.apex ?? 'simple', opts.apexTtl ?? 60));
  fs.writeFileSync(path.join(rrsDir, 'www.footbag.org.A.json'), shape(opts.www ?? 'simple', opts.wwwTtl ?? 60));

  // dig prints the served TTL in the second field of the answer line.
  fs.writeFileSync(
    path.join(digDir, 'footbag.org.A.txt'),
    `footbag.org.\t\t${opts.apexTtl ?? 60}\tIN\tA\t74.50.54.203\n`,
  );
  fs.writeFileSync(
    path.join(digDir, 'www.footbag.org.A.txt'),
    `www.footbag.org.\t\t${opts.wwwTtl ?? 60}\tIN\tA\t74.50.54.203\n`,
  );
}

function run(
  args: string[] = ['--phase', 'handover'],
  overrides: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      FOOTBAG_LEGACY_HOSTED_ZONE_ID: 'Z0EXAMPLE',
      FOOTBAG_DNS_AUTHORITATIVE_NS: NS,
      FAKE_RRS_DIR: rrsDir,
      FAKE_DIG_DIR: digDir,
      FAKE_AWS_LOG: awsLog,
      ...overrides,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-dnsttl-'));
  rrsDir = path.join(dir, 'rrs');
  digDir = path.join(dir, 'dig');
  awsLog = path.join(dir, 'aws.log');
  fs.mkdirSync(rrsDir);
  fs.mkdirSync(digDir);
  fs.writeFileSync(awsLog, '');
  writeFakes();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('dns-ttl-preflight: it observes and never writes', () => {
  it('passes when every authoritative nameserver serves the required TTL', () => {
    seedZone({});
    const res = run();
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('GATE: DNS-TTL PASS');
  });

  it('records the observed value for every name and every nameserver, so the cutover log carries it', () => {
    seedZone({});
    const res = run();
    expect(res.stdout).toContain('observed: footbag.org. A ttl=60 from ns-1.awsdns-00.org');
    expect(res.stdout).toContain('observed: footbag.org. A ttl=60 from ns-2.awsdns-00.co.uk');
    expect(res.stdout).toContain('observed: www.footbag.org. A ttl=60 from ns-1.awsdns-00.org');
  });

  it('never issues a record change: Terraform owns the TTL and a second writer collides with it', () => {
    seedZone({});
    run();
    const calls = fs.readFileSync(awsLog, 'utf8');
    expect(calls).toContain('list-resource-record-sets');
    expect(calls).not.toContain('change-resource-record-sets');
    expect(calls).not.toContain('UPSERT');
  });
});

describe('dns-ttl-preflight: it fails when the gate is not met', () => {
  it('fails and names both values when a record serves a TTL other than the required one', () => {
    seedZone({ wwwTtl: 3600 });
    const res = run();
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('GATE: DNS-TTL FAIL');
    expect(res.stdout).toContain('www.footbag.org. A served ttl 3600');
    expect(res.stdout).toContain('gate requires 60');
  });

  it('fails when an authoritative nameserver returns no answer at all', () => {
    seedZone({});
    const res = run(['--phase', 'handover'], { FAKE_DIG_SILENT_NS: 'ns-2.awsdns-00.co.uk' });
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('returned no answer from ns-2.awsdns-00.co.uk');
  });

  it('fails when the zone cannot be read rather than passing on an empty result', () => {
    seedZone({});
    const res = run(['--phase', 'handover'], { FAKE_AWS_FAIL: '1' });
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('cannot read');
  });

  it('fails when no A or AAAA record exists for the names at all', () => {
    const res = run();
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('no A or AAAA record was observed');
  });
});

describe('dns-ttl-preflight: record shapes it has to survive', () => {
  it('reports an alias as an alias and does not crash on a record set carrying no TTL', () => {
    seedZone({ www: 'alias' });
    const res = run();
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('www.footbag.org. A is an ALIAS');
    expect(res.stdout).toContain('inherited from its target');
    expect(res.stderr).not.toContain('KeyError');
  });

  it('refuses a name carrying more than one record set instead of reading the first', () => {
    seedZone({ apex: 'multiple' });
    const res = run();
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('has 2 record sets');
  });

  it('treats an absent AAAA as the expected state, since the legacy zone carries no IPv6', () => {
    seedZone({});
    const res = run();
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain('AAAA');
  });
});

describe('dns-ttl-preflight: preconditions', () => {
  it('refuses without a phase, and the refusal no longer describes a flip on a zone we do not hold', () => {
    const res = run([]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('--phase handover is required');
    expect(res.stderr).not.toContain('webmaster');
  });

  it('refuses without a hosted zone id', () => {
    seedZone({});
    const res = run(['--phase', 'handover'], { FOOTBAG_LEGACY_HOSTED_ZONE_ID: '' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('FOOTBAG_LEGACY_HOSTED_ZONE_ID must be set');
  });

  it('refuses a TTL that is not a whole number of seconds rather than emitting it into a comparison', () => {
    seedZone({});
    const res = run(['--phase', 'handover'], { FOOTBAG_DNS_TTL_SECONDS: 'sixty' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('whole number of seconds');
  });

  it('mock mode says plainly that it proved nothing about the zone', () => {
    const res = run(['--phase', 'handover', '--mock']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('GATE: DNS-TTL PASS');
    expect(res.stdout).toContain('proves nothing about the zone');
  });
});
