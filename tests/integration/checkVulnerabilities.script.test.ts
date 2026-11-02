/**
 * The on-request vulnerability report: which pinned versions carry a published
 * flaw, most urgent first.
 *
 * The contract. Every finding from the pinned scanner, OSV, the Node.js core
 * list and, when asked, one host's package advisories lands in one table,
 * ranked by: listed as known exploited, then exposure (public, then
 * origin-only, then internal), then exploit likelihood, then severity. A feed
 * that cannot be read is a warning naming what went unchecked, and the run
 * still reports everything it did check; a failed scan, or a download that is
 * not the pinned file, is an error. A pinned tool no advisory database covers
 * is listed by name. "Nothing found" is claimed only for what was scanned. A
 * run without --target opens no connection to any host.
 *
 * The script runs for real against stand-ins for curl, docker and ssh that
 * answer with the samples in tests/fixtures/vulnerabilityFeedSamples.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { hostIdentityAnswer } from '../fixtures/hostIdentityStub';
import {
  DNF_UPDATEINFO_LIST_SAMPLE, OSV_GHSA_32GQ, OSV_GO_2024_3344, epssResponse, kevCatalog, kevEntry, nodeEntry,
  trivyReport, type TrivyVuln,
} from '../fixtures/vulnerabilityFeedSamples';

const SCRIPT = join(process.cwd(), 'scripts/check-vulnerabilities.sh');
const LIST = readFileSync(join(process.cwd(), 'ops/tool-versions.env'), 'utf-8');
const pin = (k: string): string => new RegExp(`^${k}=(.*)$`, 'm').exec(LIST)![1];
const NODE = readFileSync(join(process.cwd(), '.nvmrc'), 'utf-8').trim().replace(/^v/, '');
const [MAJ, MIN, PAT] = NODE.split('.').map(Number);

/** The pins the report fetches and unpacks for the scanner. */
const DOWNLOADS = ['COMPOSE', 'TERRAFORM', 'GITLEAKS', 'AGE', 'AWS_CLI', 'PYTHON'];

let dir: string;
let fix: string;
let dl: string;
let state: string;
let bin: string;
let hostBin: string;
let tmp: string;

function exe(path: string, lines: string[]): void {
  writeFileSync(path, ['#!/usr/bin/env bash', ...lines, ''].join('\n'));
  chmodSync(path, 0o755);
}
const json = (name: string, value: unknown): void => writeFileSync(join(fix, name), JSON.stringify(value));
const flag = (name: string): void => writeFileSync(join(state, name), '');
const v = (id: string, pkg: string, severity = 'HIGH'): TrivyVuln => ({ id, pkg, installed: '1.0.0-r0', fixed: '1.0.1-r0', severity });

/**
 * The default world: a known-exploited flaw in the public nginx image, a
 * known-exploited flaw in a development-only dependency, two unlisted flaws in
 * the web image with different exploit likelihoods, one in a library the
 * Compose binary carries, the real age advisory pair, and a Node.js list with
 * one entry the pinned Node is affected by and others it is not.
 */
function writeFixtures(): void {
  json('kev.json', kevCatalog([kevEntry('CVE-2099-0001', 'Yes', 'Known'), kevEntry('CVE-2099-0002', 'No', 'Unknown')]));
  json('epss.json', epssResponse({ 'CVE-2099-0001': 0.1, 'CVE-2099-0002': 0.2, 'CVE-2099-0003': 0.97, 'CVE-2099-0004': 0.5, 'CVE-2099-0005': 0.3 }));
  json('osv-GO-2024-3344.json', OSV_GO_2024_3344);
  json('osv-GHSA-32gq-x56h-299c.json', OSV_GHSA_32GQ);
  json('node.json', {
    1: nodeEntry('CVE-2099-0101', `${MAJ}.x || ${MAJ + 2}.x`, `^${MAJ}.${MIN}.${PAT + 1} || ^${MAJ + 2}.0.1`),
    2: nodeEntry('CVE-2099-0102', `${MAJ}.x`, `^${MAJ}.${MIN}.${PAT}`),
    3: nodeEntry('CVE-2099-0103', `>= ${MAJ}.0.0 <${MAJ}.${MIN}.${PAT}`, undefined),
    4: nodeEntry('CVE-2099-0104', `>= ${MAJ}.0.0 <= ${MAJ}.${MIN}.${PAT}`, undefined, 'medium'),
  });
  json('trivy-empty.json', trivyReport('empty', []));
  json('trivy-locks.json', trivyReport('/src', [{ target: 'package-lock.json', cls: 'lang-pkgs', type: 'npm', vulns: [] }]));
  json('trivy-locks-dev.json', trivyReport('/src', [{ target: 'package-lock.json', cls: 'lang-pkgs', type: 'npm', vulns: [v('CVE-2099-0002', 'dev-only-tool')] }]));
  json('trivy-docker-web.json', trivyReport('docker-web', [{ target: 'docker-web (alpine 3.24.0)', cls: 'os-pkgs', type: 'alpine', vulns: [v('CVE-2099-0003', 'libcrypto3', 'CRITICAL'), v('CVE-2099-0004', 'busybox')] }]));
  json('trivy-nginx.json', trivyReport('nginx', [{ target: 'nginx (alpine 3.24.0)', cls: 'os-pkgs', type: 'alpine', vulns: [v('CVE-2099-0001', 'libexpat', 'LOW')] }]));
  json('trivy-rootfs.json', trivyReport('/rootfs', [{ target: 'COMPOSE/docker-compose-linux-x86_64', cls: 'lang-pkgs', type: 'gobinary', vulns: [v('CVE-2099-0005', 'stdlib')] }]));
}

/**
 * A stand-in tool-version list: the real one, with each fetched download
 * pointed at a file this suite built and its digest, and age held at a release
 * the captured advisory affects.
 */
function writeDownloadsAndList(overrides: Record<string, string> = {}): string {
  let list = LIST;
  for (const prefix of DOWNLOADS) {
    const name = pin(`${prefix}_URL`).split('/').pop()!;
    const src = join(dir, 'dl-src', prefix);
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'tool'), `#!/bin/sh\necho ${prefix}\n`);
    const out = join(dl, name);
    if (name.endsWith('.tar.gz')) {
      spawnSync('tar', ['-czf', out, '-C', src, 'tool'], SPAWN_GUARD);
    } else if (name.endsWith('.zip')) {
      spawnSync('python3', ['-I', '-m', 'zipfile', '-c', out, join(src, 'tool')], SPAWN_GUARD);
    } else {
      writeFileSync(out, readFileSync(join(src, 'tool')));
    }
    const sha = createHash('sha256').update(readFileSync(out)).digest('hex');
    list = list.replace(new RegExp(`^${prefix}_URL=.*$`, 'm'), `${prefix}_URL=https://example.invalid/${name}`)
      .replace(new RegExp(`^${prefix}_SHA256=.*$`, 'm'), `${prefix}_SHA256=${sha}`);
  }
  list = list.replace(/^AGE_VERSION=.*$/m, 'AGE_VERSION=1.1.1');
  for (const [k, val] of Object.entries(overrides)) list = list.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${val}`);
  const path = join(dir, 'tool-versions.env');
  writeFileSync(path, list);
  return path;
}

/** curl: each public feed from its sample, every address it was asked for logged. */
function writeCurl(): void {
  const st = JSON.stringify(state);
  const fx = JSON.stringify(fix);
  exe(join(bin, 'curl'), [
    'url="${@: -1}"',
    `echo "$url" >> ${JSON.stringify(join(state, 'curl.log'))}`,
    'data=""; for a in "$@"; do [[ "$a" == @* ]] && data="${a#@}"; done',
    `down() { [[ -e ${st}/down-$1 ]] && { echo "curl: (6) Could not resolve host" >&2; exit 6; }; return 0; }`,
    'case "$url" in',
    `  *known_exploited_vulnerabilities.json) down kev; cat ${fx}/kev.json ;;`,
    `  *api.first.org*) down epss; cat ${fx}/epss.json ;;`,
    // The batch answer's shape is OSV's documented one: one result per query,
    // in query order, each listing the advisory ids that affect it.
    `  *v1/querybatch) down osv; jq '{results: [.queries[] | if .package.name == "filippo.io/age" then {vulns: [{id: "GO-2024-3344", modified: "2026-02-04T04:00:26Z"}, {id: "GHSA-32gq-x56h-299c", modified: "2026-09-10T03:50:21Z"}]} else {} end]}' "$data" ;;`,
    `  *api.osv.dev/v1/vulns/*) down osv; cat "${fix}/osv-\${url##*/}.json" ;;`,
    `  *security-wg*) down node; cat ${fx}/node.json ;;`,
    `  https://example.invalid/*) cat "${dl}/\${url##*/}" ;;`,
    '  *) echo "unexpected address $url" >&2; exit 22 ;;',
    'esac',
  ]);
}

/** docker: builds succeed, each scan answers with its target's report. */
function writeDocker(): void {
  const st = JSON.stringify(state);
  exe(join(bin, 'docker'), [
    `echo "$*" >> ${JSON.stringify(join(state, 'docker.log'))}`,
    'case "$*" in',
    `  *compose*build*) [[ -e ${st}/build-fails ]] && { echo "stand-in build failure"; exit 17; }; exit 0 ;;`,
    'esac',
    'prev=""',
    'for a in "$@"; do',
    `  if [[ "$prev" == -v && "$a" == *:/rootfs:ro ]]; then (cd "\${a%%:/rootfs:ro}" && find . -type f | sort) > ${st}/rootfs-files; fi`,
    '  prev="$a"',
    'done',
    'case "$*" in',
    '  *" fs "*--include-dev-deps*) name=locks-dev ;;',
    '  *" fs "*) name=locks ;;',
    '  *" rootfs "*) name=rootfs ;;',
    '  *" image "*) ref="${@: -1}"; case "$ref" in nginx:*) name=nginx ;; amazonlinux:*) name=amazonlinux ;; *) name="$ref" ;; esac ;;',
    '  *) echo "unexpected docker call: $*" >&2; exit 64 ;;',
    'esac',
    `[[ -e ${st}/trivy-fails-$name ]] && { echo "stand-in scanner failure for $name" >&2; exit 1; }`,
    `f=${JSON.stringify(fix)}/trivy-$name.json; [[ -e "$f" ]] || f=${JSON.stringify(fix)}/trivy-empty.json`,
    'cat "$f"',
  ]);
}

/**
 * ssh: answers the identity question and the alias lookup, and runs the
 * privileged stream locally with the host's dnf and rpm first on the path,
 * logging each session.
 */
function writeSsh(): void {
  exe(join(bin, 'ssh'), [
    `echo "ssh $*" >> ${JSON.stringify(join(state, 'ssh.log'))}`,
    hostIdentityAnswer(),
    'for a in "$@"; do',
    '  if [[ "$a" == "-G" ]]; then printf "hostname 203.0.113.30\\nuser footbag\\n"; exit 0; fi',
    'done',
    'IFS= read -r _password',
    `PATH=${JSON.stringify(hostBin)}:"$PATH" bash -s`,
  ]);
  exe(join(hostBin, 'dnf'), [
    `cat <<'OUT'`,
    ...DNF_UPDATEINFO_LIST_SAMPLE,
    'OUT',
    `[[ -e ${JSON.stringify(join(state, 'dnf-extra'))} ]] && echo "A line in a shape nobody has seen"`,
    `[[ -e ${JSON.stringify(join(state, 'dnf-fails'))} ]] && { echo "stand-in dnf failure" >&2; exit 1; }`,
    'exit 0',
  ]);
  exe(join(hostBin, 'rpm'), [
    "printf '%s\\n' '---FOOTBAG-INSTALLED--- glibc 2.34-52.amzn2023.0.8' '---FOOTBAG-INSTALLED--- curl-minimal 8.5.0-1.amzn2023.0.2'",
  ]);
}

beforeEach(() => {
  dir = createScratchDir('check-vulns');
  fix = join(dir, 'fixtures');
  dl = join(dir, 'dl');
  state = join(dir, 'state');
  bin = join(dir, 'bin');
  hostBin = join(dir, 'host-bin');
  tmp = join(dir, 'tmp');
  for (const d of [fix, dl, state, bin, hostBin, tmp, join(dir, 'cache')]) mkdirSync(d, { recursive: true });
  writeFixtures();
  writeCurl();
  writeDocker();
  writeSsh();
  writeFileSync(join(dir, 'pin'), '[203.0.113.30]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE\n');
});

afterEach(() => removeScratch(dir));

function run(args: string[] = [], list = writeDownloadsAndList()) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    input: 'fixture-sudo-password\n',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      TMPDIR: tmp,
      XDG_CACHE_HOME: join(dir, 'cache'),
      FOOTBAG_TOOL_VERSIONS: list,
      FOOTBAG_KNOWN_HOSTS: join(dir, 'pin'),
      FOOTBAG_CHECK_VULNERABILITIES_CURL_BIN: join(bin, 'curl'),
      FOOTBAG_CHECK_VULNERABILITIES_DOCKER: join(bin, 'docker'),
    },
    ...SPAWN_GUARD,
  });
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  const at = stderr.lastIndexOf('Closing report');
  return { status: r.status, stdout, stderr, out: stdout + stderr, report: at < 0 ? '' : stderr.slice(at) };
}

/** The table's rows, each split into its columns. */
function rows(stdout: string): string[][] {
  const lines = stdout.split('\n');
  const head = lines.findIndex((l) => l.startsWith('PIN OR PACKAGE'));
  if (head < 0) return [];
  const body: string[][] = [];
  for (const l of lines.slice(head + 1)) {
    if (l.trim() === '') break;
    body.push(l.trim().split(/\s{2,}/));
  }
  return body;
}
const COL = { pkg: 0, version: 1, advisory: 2, fixed: 3, kev: 4, epss: 5, exposure: 6, severity: 7 };
const row = (stdout: string, advisory: string): string[] | undefined => rows(stdout).find((r) => r[COL.advisory] === advisory);
const read = (name: string): string => (existsSync(join(state, name)) ? readFileSync(join(state, name), 'utf-8') : '');

describe('check-vulnerabilities.sh', () => {
  it('ranks known-exploited public findings first, then known-exploited internal ones, then by exposure and exploit likelihood', () => {
    const r = run();
    expect(r.status, r.out).toBe(0);
    // Defect caught: the operator reads a stubbed run as a statement about the
    // real feeds and images.
    expect(r.stderr).toMatch(/SYNTHETIC: FOOTBAG_CHECK_VULNERABILITIES_CURL_BIN/);
    expect(r.stderr).toMatch(/SYNTHETIC: FOOTBAG_CHECK_VULNERABILITIES_DOCKER/);
    expect(r.report).not.toMatch(/Warnings \(|Errors \(/);

    // Defect caught: the flaw an attacker is already using against the public
    // container sits below a merely likely one, and is patched last.
    const order = rows(r.stdout).map((x) => x[COL.advisory]);
    // ordering-is-the-contract: the table is the urgency order.
    const at = (id: string): number => order.indexOf(id);
    for (const id of ['CVE-2099-0001', 'CVE-2099-0002', 'CVE-2099-0003', 'CVE-2099-0004', 'CVE-2099-0005']) expect(at(id), id).toBeGreaterThanOrEqual(0);
    expect(at('CVE-2099-0001')).toBeLessThan(at('CVE-2099-0002'));
    expect(at('CVE-2099-0002')).toBeLessThan(at('CVE-2099-0003'));
    expect(at('CVE-2099-0003')).toBeLessThan(at('CVE-2099-0004'));
    expect(at('CVE-2099-0004')).toBeLessThan(at('CVE-2099-0005'));
    expect(at('CVE-2099-0005')).toBeLessThan(at('GO-2024-3344'));

    // Defect caught: the catalog's forensic-triage and ransomware flags never
    // reach the operator deciding what to do first.
    expect(row(r.stdout, 'CVE-2099-0001')![COL.kev]).toBe('YES (triage: Yes, ransomware: Known)');
    expect(row(r.stdout, 'CVE-2099-0001')![COL.exposure]).toBe('public');
    // Defect caught: a development-only dependency is reported as shipping in
    // the containers, or is dropped because the default scan leaves it out.
    expect(row(r.stdout, 'CVE-2099-0002')![COL.exposure]).toBe('internal');
    // Defect caught: a library inside a host-installed binary is ranked as a
    // workstation tool.
    expect(row(r.stdout, 'CVE-2099-0005')![COL.exposure]).toBe('origin-only');
    expect(row(r.stdout, 'CVE-2099-0003')![COL.epss]).toBe('0.97');

    // Defect caught: the run leaves its downloads and reports behind in the
    // temporary directory.
    expect(readdirSync(tmp)).toEqual([]);
  });

  it('still reports what it checked when a feed is unreachable, warning which question went unanswered', () => {
    // Defect caught: a feed outage silently reads as "not exploited", or ends
    // the run before the scans it does not need.
    flag('down-kev');
    const r = run();
    expect(r.status, r.out).toBe(0);
    expect(r.report).toMatch(/Warnings \(1\):[\s\S]*the CISA KEV catalog unreachable[\s\S]*not checked: whether any finding is known to be exploited/);
    expect(r.report).toMatch(/Not proven:[\s\S]*whether any finding is known to be exploited/);
    expect(row(r.stdout, 'CVE-2099-0001')![COL.kev]).toBe('?');
    expect(row(r.stdout, 'CVE-2099-0003')).toBeDefined();
  });

  it('fails, naming the scan, when a Trivy scan fails, and carries on with the others', () => {
    // Defect caught: the public container goes unscanned and the run still
    // exits zero, or stops there and never scans the rest.
    flag('trivy-fails-nginx');
    const r = run();
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/Errors \(1\):[\s\S]*trivy \(nginx\): exit 1/);
    expect(r.report).toMatch(/Not proven:[\s\S]*nginx: the scan failed/);
    expect(row(r.stdout, 'CVE-2099-0001')).toBeUndefined();
    expect(row(r.stdout, 'CVE-2099-0003')).toBeDefined();
    // Defect caught: "nothing found" is claimed for the image that was not scanned.
    expect(r.report).toMatch(/Proven:\n.*docker-web/);
    expect(r.report).not.toMatch(/Proven:\n.*the nginx image/);
  });

  it('lists a Node.js core advisory only when the pinned Node is in its vulnerable range and outside its patched one', () => {
    const r = run();
    expect(r.status, r.out).toBe(0);
    // Defect caught: the pinned Node carries a published flaw and the report
    // never says so, or names a fix in another release line.
    const hit = row(r.stdout, 'CVE-2099-0101');
    expect(hit, r.stdout).toBeDefined();
    expect(hit![COL.version]).toBe(NODE);
    expect(hit![COL.fixed]).toBe(`${MAJ}.${MIN}.${PAT + 1}`);
    // Defect caught: a release the patched range covers is reported as
    // vulnerable, so the operator bumps for nothing.
    expect(row(r.stdout, 'CVE-2099-0102')).toBeUndefined();
    // Defect caught: comparator ranges (">=", "<", "<=") are misread at their
    // boundary, so the pinned release is put on the wrong side.
    expect(row(r.stdout, 'CVE-2099-0103')).toBeUndefined();
    expect(row(r.stdout, 'CVE-2099-0104')![COL.fixed]).toBe('none listed');
  });

  it('names every pinned tool no advisory database covers, beside the ones it asked OSV about', () => {
    const r = run();
    expect(r.status, r.out).toBe(0);
    const coverage = r.stdout.slice(r.stdout.indexOf('Coverage of the pinned tools:'));
    const line = (key: string): string => coverage.split('\n').find((l) => l.trim().startsWith(`${key} `)) ?? '';
    // Defect caught: a tool nobody checks drops out of the report, and its
    // silence reads as "no advisory".
    for (const key of ['JQ_VERSION', 'SQLITE_VERSION', 'CWAGENT_VERSION']) {
      expect(line(key), key).toMatch(/not covered by an advisory database/);
      expect(r.report, key).toMatch(new RegExp(`Not proven:[\\s\\S]*the tools no advisory database covers:.*${key}`));
    }
    expect(line('AGE_VERSION')).toMatch(/OSV Go:filippo\.io\/age/);
    expect(line('AGE_VERSION')).not.toMatch(/not covered/);
    // Defect caught: one flaw published as a Go advisory and a GitHub advisory
    // is listed twice, or with no fixed version, or without the severity only
    // the GitHub one carries.
    const age = rows(r.stdout).filter((x) => x[COL.pkg] === 'AGE_VERSION');
    expect(age.map((x) => x[COL.advisory])).toEqual(['GO-2024-3344']);
    expect(age[0][COL.fixed]).toBe('1.2.1');
    expect(age[0][COL.severity]).toBe('MODERATE');
  });

  it('opens no connection to any host without --target, and reads the named host with it', () => {
    const plain = run();
    expect(plain.status, plain.out).toBe(0);
    // Defect caught: the default run reaches a host, asking for a credential
    // the operator never meant to give.
    expect(read('ssh.log')).toBe('');
    expect(plain.report).toMatch(/Not proven:[\s\S]*no --target given/);

    const r = run(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(read('ssh.log')).toMatch(/footbag-staging/);
    // Defect caught: the listing's lines parse to nothing, so a host behind on
    // every advisory reads as up to date. Every advisory line of Amazon's
    // sample becomes a row with its package and fixed build.
    const host = rows(r.stdout).filter((x) => x[COL.advisory].startsWith('ALAS'));
    const expected = DNF_UPDATEINFO_LIST_SAMPLE.filter((l) => l.startsWith('ALAS')).map((l) => {
      const [id, , nevra] = l.split(/\s+/);
      const m = /^(.+)-([^-]+-[^-]+)\.[^.]+$/.exec(nevra)!;
      return `${id} ${m[1]} ${m[2]}`;
    }).sort();
    expect(host.map((x) => `${x[COL.advisory]} ${x[COL.pkg]} ${x[COL.fixed]}`).sort()).toEqual(expected);
    const glibc = host.find((x) => x[COL.pkg] === 'glibc')!;
    expect(glibc[COL.version]).toBe('2.34-52.amzn2023.0.8');
    expect(glibc[COL.exposure]).toBe('origin-only');
    expect(r.report).not.toMatch(/cannot read/);

    // Defect caught: a line in a shape the parser does not know is dropped in
    // silence, so a changed listing format hides advisories.
    flag('dnf-extra');
    const odd = run(['--target', 'staging']);
    expect(odd.report).toMatch(/Warnings \(1\):[\s\S]*cannot read[\s\S]*A line in a shape nobody has seen/);

    // Defect caught: the host's listing fails and the report reads as a host
    // with nothing to patch.
    flag('dnf-fails');
    const failed = run(['--target', 'staging']);
    expect(failed.status).toBe(1);
    expect(failed.report).toMatch(/Errors \([1-9]\):[\s\S]*dnf updateinfo: exit 1/);
    expect(failed.report).toMatch(/Not proven:[\s\S]*footbag-staging's installed packages: the host's listing did not complete/);
    expect(rows(failed.stdout).filter((x) => x[COL.advisory].startsWith('ALAS'))).toEqual([]);
  });

  it('refuses a target that is not an environment, before reaching anything', () => {
    // Defect caught: a typo'd target reads some other host, or runs the whole
    // report and then fails.
    const r = run(['--target', 'prod']);
    expect(r.status).toBe(2);
    expect(read('ssh.log')).toBe('');
    expect(read('docker.log')).toBe('');
  });

  it('scans a download only once its digest matches the pin, and fails naming one that does not', () => {
    const good = run();
    expect(good.status, good.out).toBe(0);
    expect(read('rootfs-files')).toMatch(/\.\/COMPOSE\//);

    // Defect caught: a download that is not the pinned file is scanned and
    // reported clean, or the mismatch is a warning nobody acts on.
    const r = run([], writeDownloadsAndList({ COMPOSE_SHA256: 'd'.repeat(64) }));
    expect(r.status).toBe(1);
    expect(r.report).toMatch(/Errors \(1\):[\s\S]*COMPOSE: .*does not match COMPOSE_SHA256/);
    expect(read('rootfs-files')).not.toMatch(/\.\/COMPOSE\//);
    expect(read('rootfs-files')).toMatch(/\.\/AGE\//);
    // Defect caught: the bytes that failed the check stay in the download
    // cache, where a later run or a person could pick them up.
    expect(readdirSync(join(dir, 'cache', 'footbag', 'pinned-downloads')).filter((n) => !/^[0-9a-f]{64}$/.test(n))).toEqual([]);
    expect(readdirSync(join(dir, 'cache', 'footbag', 'pinned-downloads')).filter((n) => n.startsWith('d'.repeat(64)))).toEqual([]);
  });

  it('claims "nothing found" only for what it actually checked', () => {
    // Defect caught: an empty table over a run whose OSV feed was down is read
    // as "the tools are clean".
    for (const f of ['trivy-locks-dev', 'trivy-docker-web', 'trivy-nginx', 'trivy-rootfs']) json(`${f}.json`, trivyReport('empty', []));
    json('node.json', { 2: nodeEntry('CVE-2099-0102', `${MAJ}.x`, `^${MAJ}.${MIN}.${PAT}`) });
    flag('down-osv');
    const r = run();
    expect(r.status, r.out).toBe(0);
    expect(rows(r.stdout)).toEqual([]);
    expect(r.stdout).toMatch(/No published advisory affects what was checked/);
    const proven = /Proven:\n {2}- (.*)/.exec(r.report)?.[1] ?? '';
    expect(proven).toMatch(/^no published advisory affects what was checked:/);
    expect(proven).toMatch(/docker-web/);
    expect(proven).toMatch(new RegExp(`Node\\.js core ${NODE.replace(/\./g, '\\.')}`));
    expect(proven).not.toMatch(/OSV/);
    expect(r.report).toMatch(/Not proven:[\s\S]*the standalone tools' own advisories/);
  });

  // FIRST serves at most 100 CVEs per request: its response states "limit":
  // 100 (captured sample) and the endpoint documents a 100-item page.
  it('asks FIRST for at most 100 CVEs per request', () => {
    const many = (n: number): TrivyVuln[] => Array.from({ length: n }, (_, i) => v(`CVE-2099-${String(1000 + i)}`, `pkg${i}`));
    const epssCalls = (): string[][] => read('curl.log').split('\n').filter((l) => l.includes('api.first.org'))
      .map((l) => decodeURIComponent(l.replace(/.*cve=/, '')).split(','));

    // Defect caught: a request over the limit is cut short by the service, and
    // the findings past it read as having no exploit likelihood.
    const base = ['CVE-2099-0001', 'CVE-2099-0002', 'CVE-2099-0003', 'CVE-2099-0004', 'CVE-2099-0005', 'CVE-2099-0101', 'CVE-2099-0104'];
    json('trivy-docker-worker.json', trivyReport('docker-worker', [{ target: 'w', cls: 'os-pkgs', type: 'alpine', vulns: many(100 - base.length) }]));
    run();
    expect(epssCalls().map((c) => c.length)).toEqual([100]);

    writeFileSync(join(state, 'curl.log'), '');
    json('trivy-docker-worker.json', trivyReport('docker-worker', [{ target: 'w', cls: 'os-pkgs', type: 'alpine', vulns: many(101 - base.length) }]));
    const r = run();
    expect(r.status, r.out).toBe(0);
    expect(epssCalls().map((c) => c.length)).toEqual([100, 1]);
  });
});
