/**
 * Integration tests for scripts/fetch-archive-copy.sh and the encrypted-disk
 * attestation it shares through scripts/lib/dev-copy-attestation.sh.
 *
 * A developer's copy of production's Legacy Archive may land only on a machine
 * whose disk they have attested is encrypted, only outside the checkout, and
 * only in place of the copy before it. The suite drives whole runs against a
 * stand-in AWS CLI whose listing comes from the case and whose download writes
 * those keys into the destination, so the script's own check of the copy
 * against the listing reads a real directory. Each case has its own home
 * directory, so the destination and the attestation record are the case's.
 *
 * The listing is in the plain `aws s3 ls --recursive` line shape (date, time,
 * size, key), modelled on the example output in the AWS CLI reference for
 * `s3 ls`, not captured from a live run. The whole-archive case shows it parses
 * to the keys it names, since the copy is checked against exactly those keys.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { hostname } from 'node:os';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { createScratchDir } from '../fixtures/scratchDir';
import { HAS_PTY_DRIVER, spawnAtTerminal } from '../fixtures/ptySession';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'fetch-archive-copy.sh');

const ROLE_ARN = 'arn:aws:sts::000000000000:assumed-role/FootbagDevTester/jane_doe';
const BUCKET = 'footbag-production-archive';

/** `aws s3 ls --recursive` line shape: date, time, size, key. */
const ls = (key: string) => `2026-01-01 00:00:00        123 ${key}`;
const KEYS = ['index.html', 'newsletters/', 'newsletters/1999.html', 'newsletters/2000.html', 'events/worlds.html'];
const FILE_KEYS = KEYS.filter((k) => !k.endsWith('/'));

/** This machine as the attestation names it: the machine id, else the host name. */
function thisMachine(): string {
  try {
    const id = fs.readFileSync('/etc/machine-id', 'utf8').replace(/\s/g, '');
    if (id) return id;
  } catch {
    // no machine id on this system
  }
  return hostname();
}

let root: string;
let caseCount = 0;

beforeAll(() => {
  root = createScratchDir('fetch-archive-copy');
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeExec(file: string, body: string) {
  fs.writeFileSync(file, body, { mode: 0o755 });
}

interface Case {
  dir: string;
  home: string;
  copyRoot: string;
  attestation: string;
  calls: string;
}

/** A fresh home directory. The attestation is recorded for this machine unless told otherwise. */
function newCase(opts: { attested?: false | 'here' | 'elsewhere' | 'not-encrypted'; home?: string } = {}): Case {
  const dir = path.join(root, `case-${++caseCount}`);
  fs.mkdirSync(dir, { recursive: true });
  const home = opts.home ?? path.join(dir, 'home');
  fs.mkdirSync(home, { recursive: true });
  const attestation = path.join(home, '.config', 'footbag', 'dev-copy-attestation');
  const attested = opts.attested ?? 'here';
  if (attested) {
    fs.mkdirSync(path.dirname(attestation), { recursive: true, mode: 0o700 });
    const machine = attested === 'elsewhere' ? 'some-other-machine' : thisMachine();
    const encrypted = attested === 'not-encrypted' ? 'no' : 'yes';
    fs.writeFileSync(attestation, `disk_encrypted=${encrypted}\nmachine=${machine}\n`, { mode: 0o600 });
  }
  return {
    dir,
    home,
    copyRoot: path.join(home, '.local', 'share', 'footbag', 'archive-copy'),
    attestation,
    calls: path.join(dir, 'aws-calls.log'),
  };
}

interface RunOpts {
  arn?: string;
  /** Run at a pseudo-terminal, typing this. */
  typed?: string;
  /** The listing fails with this message. */
  listFails?: string;
  /** The stand-in download leaves this key out. */
  dropKey?: string;
  /** Run this copy of the script instead of the checkout's. */
  script?: string;
}

function run(c: Case, args: string[], opts: RunOpts = {}) {
  const listing = path.join(c.dir, 'listing.txt');
  fs.writeFileSync(listing, KEYS.map((k) => `${ls(k)}\n`).join(''));
  const aws = path.join(c.dir, 'aws');
  writeExec(aws, [
    '#!/usr/bin/env bash',
    'printf "%s\\n" "$*" >> "$STUB_AWS_CALLS"',
    `L=${JSON.stringify(listing)}`,
    'case "$1 $2" in',
    '  "s3 ls")',
    opts.listFails ? `    echo ${JSON.stringify(opts.listFails)} >&2; exit 1` : '',
    `    p="\${3#s3://${BUCKET}/}"`,
    '    out="$(grep -F " $p" "$L" | while IFS= read -r line; do k="${line##* }"; [[ "$k" == "$p"* ]] && printf "%s\\n" "$line"; done)"',
    // The CLI exits 1 on a listing that matches nothing.
    '    [[ -n "$out" ]] || exit 1; printf "%s\\n" "$out" ;;',
    '  "s3 sync")',
    '    dest="${4%/}"; p=""',
    '    args=("$@"); for ((i=0; i<${#args[@]}; i++)); do [[ "${args[i]}" == --include ]] && p="${args[i+1]%\\*}"; done',
    '    while IFS= read -r line; do k="${line##* }"; [[ "$k" == */ || "$k" != "$p"* ]] && continue;',
    `      [[ "$k" == ${JSON.stringify(opts.dropKey ?? '')} ]] && continue;`,
    '      mkdir -p "$dest/$(dirname "$k")"; echo "page $k" > "$dest/$k"; echo "download: s3://x/$k to $dest/$k"; done < "$L" ;;',
    '  *) echo "unexpected aws invocation: $*" >&2; exit 64 ;;',
    'esac',
  ].join('\n'));

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...awsIdentityStubEnv(c.dir, { arn: opts.arn ?? ROLE_ARN, profile: 'FootbagDevTester' }),
    HOME: c.home,
    AWS_PROFILE: 'FootbagDevTester',
    FOOTBAG_AWS_BIN: aws,
    STUB_AWS_CALLS: c.calls,
    FOOTBAG_CR_REPORT_TO: '',
  };
  const script = opts.script ?? SCRIPT;
  let status: number | null;
  let out: string;
  if (opts.typed !== undefined) {
    const inner = ['bash', JSON.stringify(script), ...args.map((a) => JSON.stringify(a)), '</dev/null'].join(' ');
    const r = spawnAtTerminal(`${inner}; echo "EXIT=$?"`, { typed: opts.typed, env });
    out = r.stdout ?? '';
    const m = out.match(/EXIT=(\d+)/);
    status = m ? Number(m[1]) : -1;
  } else {
    const r = spawnSync('bash', [script, ...args], { encoding: 'utf-8', input: '', env, ...SPAWN_GUARD });
    status = r.status;
    out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  }
  const awsCalls = fs.existsSync(c.calls) ? fs.readFileSync(c.calls, 'utf8').split('\n').filter(Boolean) : [];
  return { status, out, awsCalls };
}

/** Every file under the copy, relative to it, sorted. */
function copied(c: Case): string[] {
  if (!fs.existsSync(c.copyRoot)) return [];
  const found: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else found.push(path.relative(c.copyRoot, p));
    }
  };
  walk(c.copyRoot);
  return found.sort();
}

function plantPreviousCopy(c: Case) {
  fs.mkdirSync(path.join(c.copyRoot, 'old'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(c.copyRoot, 'old', 'stale.html'), 'a capture from an earlier fetch\n');
}

const mode = (p: string) => (fs.statSync(p).mode & 0o777).toString(8);

describe('fetch-archive-copy.sh: arguments', () => {
  it.each([['/abs/'], ['../escape'], ['news*'], ['a b']])('refuses the prefix %j before reaching AWS', (prefix) => {
    // Defect caught: a prefix that is a sync pattern fetches more than asked,
    // and one with .. or a leading slash writes outside the copy's root.
    const c = newCase();
    const res = run(c, ['--prefix', prefix]);
    expect(res.status).toBe(2);
    expect(res.out).toContain('--prefix must be');
    expect(res.awsCalls).toEqual([]);
  });
});

describe('fetch-archive-copy.sh: identity', () => {
  it('refuses the directly authenticated operator, since a developer copy is fetched as the role', () => {
    // Defect caught: a copy fetched outside the role is fetched under no
    // person's name in the trail.
    const c = newCase();
    const res = run(c, [], { arn: 'arn:aws:iam::000000000000:user/footbag-operator' });
    expect(res.status).toBe(1);
    expect(res.out).toContain('not a session of FootbagDevTester');
    expect(res.awsCalls).toEqual([]);
    expect(fs.existsSync(c.copyRoot)).toBe(false);
  });
});

describe('fetch-archive-copy.sh: a fetch as the role', () => {
  it('fetches the whole archive into a mode-700 directory outside the checkout, holding exactly the listed keys', () => {
    const c = newCase();
    const res = run(c, []);
    expect(res.status, res.out).toBe(0);
    expect(res.out).toContain('NOTE: using a stand-in for the AWS CLI');
    expect(copied(c)).toEqual([...FILE_KEYS].sort());
    expect(mode(c.copyRoot)).toBe('700');
    expect(mode(path.dirname(c.copyRoot))).toBe('700');
    expect(res.awsCalls.filter((a) => a.startsWith('s3 sync'))).toEqual([
      `s3 sync s3://${BUCKET}/ ${c.copyRoot}/ --no-progress`,
    ]);
  });

  it('deletes the previous copy before a new fetch and proves it gone, even when only a prefix is fetched', () => {
    // Defect caught: an older capture left beside the new one, so a machine
    // holds every capture it was ever handed.
    const c = newCase();
    plantPreviousCopy(c);
    const res = run(c, ['--prefix', 'newsletters/']);
    expect(res.status, res.out).toBe(0);
    expect(res.out).toContain('Previous copy deleted: 1 file(s)');
    expect(copied(c)).toEqual(['newsletters/1999.html', 'newsletters/2000.html']);
  });

  it('leaves the previous copy and fetches nothing when the prefix matches no key', () => {
    const c = newCase();
    plantPreviousCopy(c);
    const res = run(c, ['--prefix', 'no-such-prefix/']);
    expect(res.status).toBe(1);
    expect(res.out).toContain("no key in s3://footbag-production-archive begins with 'no-such-prefix/'");
    expect(copied(c)).toEqual(['old/stale.html']);
    expect(res.awsCalls.filter((a) => a.startsWith('s3 sync'))).toEqual([]);
  });

  it('leaves the previous copy when the listing fails, naming the CLI message', () => {
    // Defect caught: a refused listing read as an empty archive, or worse as a
    // reason to clear the old copy and download nothing.
    const c = newCase();
    plantPreviousCopy(c);
    const res = run(c, [], { listFails: 'An error occurred (AccessDenied) when calling the ListObjectsV2 operation: stub' });
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/could not list .*AccessDenied/);
    expect(copied(c)).toEqual(['old/stale.html']);
  });

  it('fails the run when the copy on disk does not hold every listed key', () => {
    const c = newCase();
    const res = run(c, [], { dropKey: 'events/worlds.html' });
    expect(res.status).toBe(1);
    expect(res.out).toContain('does not hold exactly the listed keys');
  });

  it('refuses a destination inside the repository checkout', () => {
    // A copy of the script in a scratch layout whose own checkout holds the
    // home directory, so the copy's fixed path lands inside that checkout.
    const layout = path.join(root, `layout-${++caseCount}`);
    fs.mkdirSync(path.join(layout, 'scripts'), { recursive: true });
    fs.copyFileSync(SCRIPT, path.join(layout, 'scripts', 'fetch-archive-copy.sh'));
    fs.cpSync(path.join(REPO_ROOT, 'scripts', 'lib'), path.join(layout, 'scripts', 'lib'), { recursive: true });
    const c = newCase({ home: path.join(layout, 'home') });
    const res = run(c, [], { script: path.join(layout, 'scripts', 'fetch-archive-copy.sh') });
    expect(res.status).toBe(1);
    expect(res.out).toContain('inside the repository checkout');
    expect(res.awsCalls).toEqual([]);
    expect(fs.existsSync(c.copyRoot)).toBe(false);
    // Defect caught: a refused run still creating the copy's folders inside the
    // checkout, where a later careless add could commit whatever lands there.
    expect(fs.existsSync(path.dirname(c.copyRoot)), 'the copy parent was created').toBe(false);
  });
});

describe('fetch-archive-copy.sh: the encrypted-disk attestation', () => {
  it('refuses with no attestation and no terminal, and deletes nothing', () => {
    const c = newCase({ attested: false });
    plantPreviousCopy(c);
    const res = run(c, []);
    expect(res.status).toBe(1);
    expect(res.out).toContain('no terminal to confirm on');
    expect(res.out).toContain('no encrypted-disk attestation for this machine');
    expect(copied(c)).toEqual(['old/stale.html']);
    expect(res.awsCalls).toEqual([]);
  });

  it('does not accept an attestation recorded on another machine', () => {
    // Defect caught: a home directory carried to a new laptop vouching for a
    // disk nobody has looked at.
    const c = newCase({ attested: 'elsewhere' });
    const res = run(c, []);
    expect(res.status).toBe(1);
    expect(res.out).toContain('no encrypted-disk attestation for this machine');
    expect(res.awsCalls).toEqual([]);
  });

  it('does not accept a record for this machine that says its disk is not encrypted', () => {
    // Defect caught: a record read for its presence rather than its answer, so a
    // machine whose disk is recorded as unencrypted is handed real people's
    // details, and its previous copy is deleted on the way.
    const c = newCase({ attested: 'not-encrypted' });
    plantPreviousCopy(c);
    const res = run(c, []);
    expect(res.status).toBe(1);
    expect(res.out).toContain('no encrypted-disk attestation for this machine');
    expect(copied(c)).toEqual(['old/stale.html']);
    expect(res.awsCalls).toEqual([]);
  });

  it('does not accept a record that is a link to a file written elsewhere', () => {
    // Defect caught: a link planted in the home directory, pointing at a file
    // somebody else wrote (a shared or synced folder), standing in for the
    // developer's own statement about this machine's disk.
    const c = newCase({ attested: false });
    const elsewhere = path.join(c.dir, 'someone-elses-record');
    fs.writeFileSync(elsewhere, `disk_encrypted=yes\nmachine=${thisMachine()}\n`, { mode: 0o600 });
    fs.mkdirSync(path.dirname(c.attestation), { recursive: true, mode: 0o700 });
    fs.symlinkSync(elsewhere, c.attestation);
    plantPreviousCopy(c);
    const res = run(c, []);
    expect(res.status).toBe(1);
    expect(res.out).toContain('no encrypted-disk attestation for this machine');
    expect(copied(c)).toEqual(['old/stale.html']);
    expect(res.awsCalls).toEqual([]);
  });

  it.skipIf(!HAS_PTY_DRIVER)('records a typed yes once, mode 600, and a later fetch with no terminal uses it', () => {
    const c = newCase({ attested: false });
    const first = run(c, [], { typed: 'yes\n' });
    expect(first.status, first.out).toBe(0);
    expect(mode(c.attestation)).toBe('600');
    expect(mode(path.dirname(c.attestation))).toBe('700');
    expect(fs.readFileSync(c.attestation, 'utf8')).toContain(`machine=${thisMachine()}\n`);
    const second = run(c, []);
    expect(second.status, second.out).toBe(0);
    expect(copied(c)).toEqual([...FILE_KEYS].sort());
  });

  it.skipIf(!HAS_PTY_DRIVER)('records nothing and fetches nothing when the answer is not yes', () => {
    const c = newCase({ attested: false });
    const res = run(c, [], { typed: 'no\n' });
    expect(res.status).toBe(1);
    expect(fs.existsSync(c.attestation)).toBe(false);
    expect(res.awsCalls).toEqual([]);
  });
});
