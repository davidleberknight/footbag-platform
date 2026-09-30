/**
 * Which dataset the runner's real-data rows read, and that the local run never
 * reaches staging for it.
 *
 * The footbag.org member data is not to be copied onto a workstation, so most
 * machines carry no authoritative load. The local run then answers "none": the
 * real-claim crawl and the whole-population invariants report that they are not
 * required here and return the skip code, rather than falling back to staging.
 * Staging's copy is checked only by the opt-in --staging row, read-only, and only
 * when that row's preflight found the wiring it needs. The choice of "local" is
 * made on three counts: at least 200 legacy members, at least one row the
 * footbag.org export wrote, and at least one claimable Hall-of-Fame record.
 *
 * The functions are extracted out of run_all_tests.sh rather than reimplemented,
 * and run from a scratch root whose `scripts` links to the real tree and whose
 * `run_dev.sh` is a stub that records being started. ssh, curl, aws, terraform,
 * npm, docker and the port tools are stubs on PATH that record each call, so
 * "the local preflight never reaches a host" is asserted against what actually
 * ran; nothing here reaches a host, AWS, or a port on this machine.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { createTestDb } from '../fixtures/testDb';
import { insertHistoricalPerson, insertLegacyMember } from '../fixtures/factories';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RUNNER = path.join(REPO_ROOT, 'run_all_tests.sh');
const FUNCTIONS = [
  'realdata_source',
  'realdata_invariants_verdict',
  'reclaim_port',
  'staging_blocked',
  'full_preflight',
  'gate_persona_crawl',
  'gate_realdata_invariants',
  'gate_staging_realdata_invariants',
];

let tmp: string;
let root: string;
let binDir: string;
let logDir: string;
let home: string;
let pinFile: string;
let callLog: string;
let npmLog: string;
let runDevLog: string;
let invariantsReply: string;
let functionsText: string;
let authoritativeDb: string;
let mirrorDb: string;

function extract(name: string): string {
  const res = spawnSync('sed', ['-n', `/^${name}() {/,/^}/p`, RUNNER], { encoding: 'utf8', ...SPAWN_GUARD });
  const body = res.stdout ?? '';
  if (!body.includes(`${name}() {`)) throw new Error(`could not extract ${name} from run_all_tests.sh`);
  return body;
}

function writeExecutable(file: string, lines: string[]): void {
  fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o755 });
}

/** A stub that records its name and arguments, then runs `body`. */
function recordingStub(name: string, body: string[] = ['exit 0']): void {
  writeExecutable(path.join(binDir, name), [
    '#!/usr/bin/env bash',
    `printf '%s %s\\n' ${JSON.stringify(name)} "$*" >> ${JSON.stringify(callLog)}`,
    ...body,
  ]);
}

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Run `command` in a shell holding the extracted functions, as run_gate does. */
function runWith(
  command: string,
  dbPath: string,
  invariants = 'RDI_GATES_RC=0\nRDI_RI_RC=0\n',
  extraEnv: Record<string, string> = {},
): RunResult {
  fs.writeFileSync(invariantsReply, invariants);
  for (const f of [callLog, npmLog, runDevLog]) fs.rmSync(f, { force: true });
  const driver = path.join(tmp, 'driver.sh');
  fs.writeFileSync(
    driver,
    'set -euo pipefail\n'
      + `cd ${JSON.stringify(root)}\n`
      + functionsText
      + `LOG_DIR=${JSON.stringify(logDir)}\n`
      + 'REALDATA_SOURCE=""\n'
      + 'declare -A STAGING_BLOCKERS=()\n'
      + 'set +e\n'
      + `${command}\n`
      + 'exit $?\n',
  );
  const env: Record<string, string | undefined> = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    HOME: home,
    FOOTBAG_DB_PATH: dbPath,
    FOOTBAG_REALDATA_SSH: path.join(binDir, 'ssh'),
    FOOTBAG_KNOWN_HOSTS: pinFile,
    TF_OUTPUT_BIN: path.join(binDir, 'terraform'),
    AWS_IDENTITY_BIN: path.join(binDir, 'aws'),
    AWS_PROFILE: 'footbag-dev-tester-stub',
  };
  delete env.PERSONA_CRAWL_BASE_URL;
  delete env.PERSONA_CRAWL_LEGACY_ID;
  Object.assign(env, extraEnv);
  const res = spawnSync('bash', [driver], { encoding: 'utf8', env, ...SPAWN_GUARD });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const calls = (): string[] => (fs.existsSync(callLog) ? fs.readFileSync(callLog, 'utf8').trim().split('\n') : []);

function seedPopulation(dbFile: string, withExportRow: boolean): void {
  const db = createTestDb(dbFile);
  // 200 is the runner's floor for "a real load": fixtures carry a handful of
  // rows, the real dump tens of thousands, so the fixture sits exactly on it.
  for (let i = 0; i < 200; i += 1) {
    const exported = withExportRow && i === 199;
    insertLegacyMember(db, {
      legacy_member_id: String(940000 + i),
      import_source: exported ? 'legacy_site_data' : 'mirror',
    });
  }
  insertHistoricalPerson(db, { legacy_member_id: '940007', hof_member: 1 });
  db.close();
}

beforeAll(() => {
  tmp = createScratchDir('realdata-source');
  root = path.join(tmp, 'root');
  binDir = path.join(tmp, 'bin');
  logDir = path.join(tmp, 'log');
  home = path.join(tmp, 'home');
  for (const d of [root, binDir, logDir, path.join(home, 'AWS')]) fs.mkdirSync(d, { recursive: true });
  fs.symlinkSync(path.join(REPO_ROOT, 'scripts'), path.join(root, 'scripts'));
  pinFile = path.join(tmp, 'known_hosts');
  fs.writeFileSync(pinFile, '[203.0.113.10]:22 ssh-ed25519 AAAA\n');
  fs.writeFileSync(path.join(home, 'AWS', 'AWS_OPERATOR.txt'), 'stub-password\n', { mode: 0o600 });
  callLog = path.join(tmp, 'calls.log');
  npmLog = path.join(tmp, 'npm.log');
  runDevLog = path.join(tmp, 'run-dev.log');
  invariantsReply = path.join(tmp, 'invariants-reply');

  writeExecutable(path.join(root, 'run_dev.sh'), ['#!/usr/bin/env bash', `echo started >> "${runDevLog}"`]);
  recordingStub('ssh', [
    'for a in "$@"; do',
    '  if [[ "$a" == "-G" ]]; then echo "hostname 203.0.113.10"; echo "user footbag"; exit 0; fi',
    'done',
    'stream="$(cat)"',
    'if [[ "$stream" == *"RDI_MODE=probe"* ]]; then',
    '  printf "RDI_MEMBERS=25000\\nRDI_AUTHORITATIVE=24000\\nRDI_CLAIMABLE=40\\nRDI_TARGET_ID=100042\\n"',
    'else',
    `  cat "${invariantsReply}"`,
    'fi',
  ]);
  writeExecutable(path.join(binDir, 'npm'), [
    '#!/usr/bin/env bash',
    `printf '%s|%s|%s\\n' "$*" "\${PERSONA_CRAWL_BASE_URL:-}" "\${PERSONA_CRAWL_LEGACY_ID:-}" >> "${npmLog}"`,
  ]);
  // Every tool the local preflight looks for is present, and each one that could
  // reach beyond this machine records being called. curl fails, so no readiness
  // poll ever finds a server, whatever is listening on this machine's ports.
  recordingStub('curl', ['exit 7']);
  recordingStub('terraform', ['echo d111111abcdef8.cloudfront.net']);
  recordingStub('aws', ['echo "arn:aws:sts::000000000000:assumed-role/FootbagDevTester/stub"']);
  recordingStub('docker');
  recordingStub('gitleaks');
  // The port tools answer that nothing holds a port, so reclaim_port never
  // signals a process on the machine running this suite.
  recordingStub('lsof');
  recordingStub('fuser');

  functionsText = FUNCTIONS.map(extract).join('\n');

  // One row the export wrote is all that separates the authoritative load from
  // the mirror-only one of the same size.
  authoritativeDb = path.join(tmp, 'authoritative.db');
  seedPopulation(authoritativeDb, true);
  mirrorDb = path.join(tmp, 'mirror.db');
  seedPopulation(mirrorDb, false);
});

afterAll(() => removeScratch(tmp));

describe('realdata_source', () => {
  // Defect caught: a machine holding the authoritative load skips its checks,
  // or the run does not say which dataset it proved.
  it('chooses local for an authoritative load and says so', () => {
    const res = runWith('realdata_source; echo "SOURCE=$REALDATA_SOURCE"', authoritativeDb);
    expect(res.stdout).toContain('SOURCE=local');
    expect(res.stdout).toContain('real-data source: local');
  });

  // Defect caught: a machine without the load sends the real-data rows to
  // staging, contacting a deployed host from a local run.
  it('answers none, never staging, for a mirror-only load and for no database', () => {
    const mirror = runWith('realdata_source; echo "SOURCE=$REALDATA_SOURCE"', mirrorDb);
    expect(mirror.stdout).toContain('SOURCE=none');
    const none = runWith('realdata_source; echo "SOURCE=$REALDATA_SOURCE"', path.join(tmp, 'absent.db'));
    expect(none.stdout).toContain('SOURCE=none');
    expect(none.stdout + none.stderr).not.toMatch(/SOURCE=staging|source: staging/);
    expect(calls(), 'nothing beyond this machine was called').toEqual([]);
  });
});

describe('the real-data rows without a local load', () => {
  // Defect caught: without the operator dataset the rows reach staging, or fail
  // a run whose local gates all passed.
  it('return the skip code, saying they are not required, and reach nothing', () => {
    for (const gate of ['gate_persona_crawl', 'gate_realdata_invariants']) {
      const res = runWith(gate, mirrorDb);
      expect(res.status, `${gate}: ${res.stderr}`).toBe(77);
      expect(res.stdout + res.stderr, gate).toContain('not required');
      expect(calls(), gate).toEqual([]);
      expect(fs.existsSync(npmLog), `${gate} ran the crawl`).toBe(false);
      expect(fs.existsSync(runDevLog), `${gate} started ./run_dev.sh`).toBe(false);
    }
  });
});

describe('the --full preflight', () => {
  // Defect caught: the local gate's preflight asks AWS who the caller is, opens
  // an ssh session to the staging host, or curls the staging site.
  it('calls no ssh, no curl, no aws and no terraform, and needs no dev-tester role', () => {
    const res = runWith('realdata_source >/dev/null; full_preflight', mirrorDb);
    expect(res.status, res.stderr).toBe(0);
    const reached = calls().filter((c) => /^(ssh|curl|aws|terraform) /.test(c));
    expect(reached, reached.join('\n')).toEqual([]);
  });

  // Defect caught: the preflight refuses the whole run over a tool whose own gate
  // already copes without it (the secret scan falls back to the pinned container
  // or warns, the terraform gate and the pentest's ZAP leg skip, the audit warns
  // on an unreachable registry), so a machine that could run every real check is
  // turned away before anything runs.
  it('refuses only for a tool a gate cannot work without, and names it', () => {
    const onlyDir = path.join(tmp, 'only-hard-needs');
    fs.mkdirSync(onlyDir, { recursive: true });
    const drive = (withSqlite: boolean, withCurl = true): RunResult => {
      fs.rmSync(path.join(onlyDir, 'sqlite3'), { force: true });
      fs.rmSync(path.join(onlyDir, 'curl'), { force: true });
      if (withSqlite) writeExecutable(path.join(onlyDir, 'sqlite3'), ['#!/bin/sh', 'exit 0']);
      if (withCurl) writeExecutable(path.join(onlyDir, 'curl'), ['#!/bin/sh', 'exit 7']);
      const driver = path.join(tmp, 'preflight-driver.sh');
      fs.writeFileSync(driver, `${extract('full_preflight')}\nREALDATA_SOURCE=none\nfull_preflight\n`);
      // PATH holds only curl and (optionally) sqlite3: no gitleaks, terraform,
      // docker or npm, so none of them can satisfy a lookup.
      const res = spawnSync('/bin/bash', [driver], {
        encoding: 'utf8', env: { ...process.env, PATH: onlyDir, HOME: home }, ...SPAWN_GUARD,
      });
      return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
    };
    const ok = drive(true);
    expect(ok.status, ok.stderr).toBe(0);
    const missing = drive(false);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('sqlite3 is not installed');
    const noCurl = drive(true, false);
    expect(noCurl.status).toBe(1);
    expect(noCurl.stderr).toContain('curl is not installed');
  });
});

describe('gate_persona_crawl against a local load', () => {
  // Defect caught: an address exported in the operator's shell sends the crawl,
  // which registers and claims an account, at a deployed site.
  it('refuses a base URL that is not loopback, before booting or crawling anything', () => {
    for (const url of ['https://staging.example.test', 'http://localhost.example.test:3000', 'http://127.0.0.1.example.test/']) {
      const res = runWith('gate_persona_crawl', authoritativeDb, undefined, { PERSONA_CRAWL_BASE_URL: url });
      expect(res.status, url).toBe(1);
      expect(res.stderr, url).toContain('loopback');
      expect(fs.existsSync(npmLog), `${url}: the crawl ran`).toBe(false);
      expect(fs.existsSync(runDevLog), `${url}: ./run_dev.sh was started`).toBe(false);
    }
  });

  // Defect caught: the probe reads a different database from the one the
  // booted stack serves, so it refuses a machine whose served database holds
  // the record, or approves one whose served database does not.
  it('probes the database FOOTBAG_DB_PATH names, and boots the stack at a loopback address', () => {
    for (const url of ['', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
      const res = runWith('gate_persona_crawl', authoritativeDb, undefined, url ? { PERSONA_CRAWL_BASE_URL: url } : {});
      expect(res.stderr, url).not.toContain('needs a loaded dev DB');
      expect(res.stderr, url).not.toContain('loopback');
      expect(fs.existsSync(runDevLog), `${url || 'default'}: ./run_dev.sh was not started`).toBe(true);
    }
  });
});

describe('gate_staging_realdata_invariants', () => {
  // One line per gate the host reports, in the shape the check scripts print;
  // the workstation half refuses a reply missing any of them.
  const gateLines = (g1Reason = 'no email shared across accounts'): string =>
    [`GATE: G1 PASS: ${g1Reason}`, ...['G2', 'G3', 'G4', 'G5', 'G6', 'RI1', 'RI2', 'RI3'].map((g) => `GATE: ${g} PASS: fine`)]
      .join('\n');

  // Defect caught: the staging invariants never reach the host, or a pass on
  // the host is reported as a failure.
  it('passes when the host reports both checks clean, whatever the local load', () => {
    const res = runWith('gate_staging_realdata_invariants', mirrorDb, `${gateLines()}\nRDI_GATES_RC=0\nRDI_RI_RC=0\n`);
    expect(res.status, res.stderr).toBe(0);
    expect(calls().some((c) => c.startsWith('ssh '))).toBe(true);
    expect(res.stdout).toContain('GATE: RI3 PASS: fine');
  });

  // Defect caught: a query that selected a contact field on the host lands
  // the address in a test log and the gate still passes.
  it('fails on an @ in the output and withholds that output', () => {
    const res = runWith('gate_staging_realdata_invariants', mirrorDb, `${gateLines('person@example.com')}\nRDI_GATES_RC=0\nRDI_RI_RC=0\n`);
    expect(res.status).toBe(1);
    expect(res.stdout + res.stderr).not.toContain('person@example.com');
    expect(res.stderr).toContain('possible PII leak');
  });

  // Defect caught: a mirror-only staging load passes, or fails without saying
  // that the authoritative load is what is missing.
  it('fails a mirror-only staging load, naming it', () => {
    const res = runWith('gate_staging_realdata_invariants', mirrorDb, `${gateLines()}\nRDI_GATES_RC=78\nRDI_RI_RC=0\n`);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('entirely mirror-derived');
  });

  // Defect caught: a row whose staging wiring the preflight found missing runs
  // anyway and dies mid-run on a raw ssh error, or is skipped silently.
  it('fails without running when the preflight found its wiring missing, naming the fix', () => {
    const res = runWith(
      'STAGING_BLOCKERS[staging-realdata-invariants]="  - the staging host could not be reached; run through scripts/as-dev-tester.sh"$\'\\n\'; gate_staging_realdata_invariants',
      mirrorDb,
    );
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('run through scripts/as-dev-tester.sh');
    expect(calls().some((c) => c.startsWith('ssh ')), 'the host was contacted').toBe(false);
  });
});
