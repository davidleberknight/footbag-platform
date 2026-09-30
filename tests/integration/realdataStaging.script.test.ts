/**
 * The workstation half of the staging real-data leg: one ssh session to the
 * staging host that brings back counts, PASS/FAIL gate lines and one opaque
 * legacy id, and nothing else.
 *
 * Driven through its named seam with a stub standing in for ssh. The stub
 * answers the alias resolution the shared library does first, records the argv
 * and the whole stdin stream it was handed, and replies with whatever the case
 * puts in its reply file. Nothing here opens a connection.
 *
 * The cases pin the refusals (credential file absent or readable by others, no
 * alias), the shape of the wire (password on line one, then the mode, then the
 * root-side body, and the password never in any argv), and the filter that is
 * the governance point of the script: a line the host sends that is not a gate
 * line or a known key never reaches the caller, and a target id that is not
 * the shape of a legacy member id is refused.
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
const SCRIPT = 'scripts/realdata-staging.sh';
const PASSWORD = 'correct-horse-staging';

let tmp: string;
let binDir: string;
let sshStub: string;
let pinFile: string;
let home: string;
let credFile: string;
let replyFile: string;
let argvLog: string;
let stdinLog: string;

function writeSshStub(): void {
  fs.writeFileSync(
    sshStub,
    [
      '#!/usr/bin/env bash',
      'for a in "$@"; do',
      '  if [[ "$a" == "-G" ]]; then',
      // An unconfigured alias: ssh -G echoes the alias back as the hostname and
      // still prints a user line, the local account's.
      '    if [[ -n "${FAKE_NO_ALIAS:-}" ]]; then echo "hostname footbag-staging"; echo "user footbag"; exit 0; fi',
      '    echo "hostname 203.0.113.10"',
      '    echo "user footbag"',
      '    exit 0',
      '  fi',
      'done',
      `printf '%s\\n' "$*" >> "${argvLog}"`,
      `cat > "${stdinLog}"`,
      `cat "${replyFile}"`,
      'exit "${FAKE_SSH_EXIT:-0}"',
    ].join('\n'),
    { mode: 0o755 },
  );
}

function run(args: string[], reply: string, env: Record<string, string> = {}) {
  fs.writeFileSync(replyFile, reply);
  fs.rmSync(argvLog, { force: true });
  fs.rmSync(stdinLog, { force: true });
  return spawnSync('bash', [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      FOOTBAG_REALDATA_SSH: sshStub,
      FOOTBAG_KNOWN_HOSTS: pinFile,
      HOME: home,
      ...env,
    },
    ...SPAWN_GUARD,
  });
}

/**
 * Real gate lines, produced by running the two check scripts against fixture
 * databases rather than written by hand, so the shape filter is tested against
 * what the scripts print. Three populations reach different branches: a clean
 * export, a mirror-only seed (failing the fields only the export carries), and
 * an export with an address shared across accounts and a surviving system
 * fixture.
 */
const realGateLines: Record<string, string[]> = {};

function gateLinesFor(label: string, seed: (db: ReturnType<typeof createTestDb>) => void): string[] {
  const dbFile = path.join(tmp, `${label}.db`);
  const db = createTestDb(dbFile);
  seed(db);
  db.close();
  const out = ['scripts/validate-legacy-import-gates.sh', 'scripts/validate-realdata-ri.sh']
    .map((script) => spawnSync('bash', [script], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: { ...process.env, FOOTBAG_DB_PATH: dbFile },
      ...SPAWN_GUARD,
    }).stdout ?? '')
    .join('\n');
  return out.split('\n').filter((l) => l.startsWith('GATE: '));
}

const PROBE_REPLY = [
  'RDI_MEMBERS=25000',
  'RDI_AUTHORITATIVE=24000',
  'RDI_CLAIMABLE=40',
  'RDI_TARGET_ID=100042',
].join('\n') + '\n';

beforeAll(() => {
  tmp = createScratchDir('realdata-staging');
  binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir);
  sshStub = path.join(binDir, 'ssh');
  pinFile = path.join(tmp, 'known_hosts');
  replyFile = path.join(tmp, 'reply');
  argvLog = path.join(tmp, 'argv.log');
  stdinLog = path.join(tmp, 'stdin.log');
  home = path.join(tmp, 'home');
  credFile = path.join(home, 'AWS', 'AWS_OPERATOR.txt');
  fs.mkdirSync(path.dirname(credFile), { recursive: true });
  fs.writeFileSync(pinFile, '[203.0.113.10]:22 ssh-ed25519 AAAA\n');
  fs.writeFileSync(credFile, `${PASSWORD}\n`, { mode: 0o600 });
  writeSshStub();

  realGateLines.authoritative = gateLinesFor('authoritative', (db) => {
    insertLegacyMember(db, {
      legacy_member_id: '960001', real_name: 'Exported Person', country: 'US', is_hof: 1,
      legacy_ever_paid_tier2: 1, import_source: 'legacy_site_data',
    });
    insertHistoricalPerson(db, { legacy_member_id: '960001', hof_member: 1 });
  });
  realGateLines.mirrorOnly = gateLinesFor('mirror', (db) => {
    insertLegacyMember(db, { legacy_member_id: '960101', real_name: null, display_name: 'Mirror One', import_source: 'mirror' });
  });
  realGateLines.dirtyExport = gateLinesFor('dirty', (db) => {
    insertLegacyMember(db, {
      legacy_member_id: '960201', legacy_email: 'one@example.com',
      is_bap: 1, legacy_ever_paid_tier1_lifetime: 1, import_source: 'legacy_site_data',
    });
    insertLegacyMember(db, {
      legacy_member_id: '960202', legacy_email2: 'one@example.com',
      import_source: 'legacy_site_data',
    });
    insertLegacyMember(db, { legacy_member_id: '960203', import_source: 'system_fixture' });
  });
});

afterAll(() => removeScratch(tmp));

describe('realdata-staging.sh refusals before any connection', () => {
  // Defect caught: a run proceeds with no credential, or silently reaches for
  // another account's file, and the host sees an empty sudo password.
  it('refuses a missing credential file by name and opens no session', () => {
    fs.renameSync(credFile, `${credFile}.aside`);
    try {
      const res = run(['probe'], PROBE_REPLY);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('AWS_OPERATOR.txt is missing or unreadable');
      expect(fs.existsSync(argvLog), 'ssh was reached').toBe(false);
    } finally {
      fs.renameSync(`${credFile}.aside`, credFile);
    }
  });

  // Defect caught: a sudo password other accounts could read is used as though
  // it were still secret.
  it('refuses a credential file readable by others', () => {
    fs.chmodSync(credFile, 0o644);
    try {
      const res = run(['probe'], PROBE_REPLY);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('is mode 644');
      expect(fs.existsSync(argvLog), 'ssh was reached').toBe(false);
    } finally {
      fs.chmodSync(credFile, 0o600);
    }
  });

  // Defect caught: a workstation without the staging alias gets a raw ssh
  // resolution error part-way through a test run instead of a plain refusal.
  it('refuses when the staging alias is not configured', () => {
    const res = run(['probe'], PROBE_REPLY, { FAKE_NO_ALIAS: '1' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("SSH alias 'footbag-staging' is not configured");
    expect(fs.existsSync(argvLog), 'ssh was reached').toBe(false);
  });

  // Defect caught: a typo'd subcommand silently runs one of the real ones.
  it('refuses an unknown subcommand', () => {
    const res = run(['dump'], PROBE_REPLY);
    expect(res.status).toBe(2);
    expect(fs.existsSync(argvLog), 'ssh was reached').toBe(false);
  });
});

describe('realdata-staging.sh wire', () => {
  // Defect caught: the password reaches a process table any user can read, or
  // sudo consumes something other than the password, or the host runs a body
  // other than the root-side half.
  it('sends the password on line one, then the mode, then the root-side body, never in argv', () => {
    const res = run(['probe'], PROBE_REPLY);
    expect(res.status, res.stderr).toBe(0);
    const stream = fs.readFileSync(stdinLog, 'utf-8').split('\n');
    expect(stream[0]).toBe(PASSWORD);
    expect(stream[1]).toBe('RDI_MODE=probe');
    const body = fs.readFileSync(path.join(REPO_ROOT, 'scripts/internal/realdata-invariants-remote.sh'), 'utf-8');
    expect(stream.join('\n')).toContain(body.trim());
    const argv = fs.readFileSync(argvLog, 'utf-8');
    expect(argv).toContain('footbag-staging');
    expect(argv).not.toContain(PASSWORD);
    // The runner collects WARNING lines into its end-of-run notices; a stubbed
    // run that said anything else would end looking like a real one.
    expect(res.stderr).toMatch(/^WARNING: TEST SEAM/m);
  });

  // Defect caught: the check scripts run on the host are not the ones this
  // checkout carries.
  it('streams both check scripts for invariants', () => {
    run(['invariants'], 'RDI_GATES_RC=0\nRDI_RI_RC=0\n');
    const stream = fs.readFileSync(stdinLog, 'utf-8');
    const gates = fs.readFileSync(path.join(REPO_ROOT, 'scripts/validate-legacy-import-gates.sh')).toString('base64');
    const ri = fs.readFileSync(path.join(REPO_ROOT, 'scripts/validate-realdata-ri.sh')).toString('base64');
    expect(stream).toContain(`GATES_B64=${gates}`);
    expect(stream).toContain(`RI_B64=${ri}`);
  });
});

describe('realdata-staging.sh output filter', () => {
  // Defect caught: something the host printed besides counts and gate lines,
  // such as a member's name in a diagnostic, reaches the test log.
  it('keeps gate lines and known keys, and drops everything else', () => {
    const reply = [
      'GATE: G1 PASS: no email shared across accounts',
      'Jane Realname was here',
      'GATE: Jane Realname was here',
      'GATE: G7 PASS: not a gate the scripts print',
      'GATE: RI1 MAYBE: not a verdict the scripts print',
      'GATE: G2 PASS',
      'RDI_MEMBERS=25000',
      'RDI_MEMBERS=not-a-count',
      'RDI_SECRET=1',
      'RDI_TARGET_ID=100042',
    ].join('\n') + '\n';
    const res = run(['probe'], reply);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout.split('\n').filter(Boolean)).toEqual([
      'GATE: G1 PASS: no email shared across accounts',
      'RDI_MEMBERS=25000',
      'RDI_TARGET_ID=100042',
    ]);
    expect(res.stdout + res.stderr).not.toContain('Realname');
  });

  // Defect caught: the one non-count value is used to carry more than a
  // legacy member id off the host.
  it('refuses a target id that is not the shape of a legacy member id', () => {
    const res = run(['probe'], 'RDI_TARGET_ID=Jane Realname\n');
    expect(res.status).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).not.toContain('Realname');
  });

  // Defect caught: a mirror-only staging load is reported as an ordinary
  // failure, so the runner cannot say there is no authoritative load.
  it('exits 78 when the gates report a mirror-only load, 1 on a failure, 0 on a pass', () => {
    const lines = realGateLines.authoritative.join('\n');
    expect(run(['invariants'], `${lines}\nRDI_GATES_RC=78\nRDI_RI_RC=0\n`).status).toBe(78);
    expect(run(['invariants'], `${lines}\nRDI_GATES_RC=0\nRDI_RI_RC=1\n`).status).toBe(1);
    expect(run(['invariants'], `${lines}\nRDI_GATES_RC=0\nRDI_RI_RC=0\n`).status).toBe(0);
    expect(run(['invariants'], 'GATE: G1 PASS: x\n').status, 'no result keys at all').toBe(1);
  });

  // Defect caught: a host body that ran no checks, or lost some, reports clean
  // exit codes and the gate passes having proved nothing.
  it('refuses clean exit codes when any gate reported no line, naming the missing ones', () => {
    const none = run(['invariants'], 'RDI_GATES_RC=0\nRDI_RI_RC=0\n');
    expect(none.status).toBe(1);
    expect(none.stderr).toContain('no result for: G1 G2 G3 G4 G5 G6 RI1 RI2 RI3');

    const withoutRi3 = realGateLines.authoritative.filter((l) => !l.startsWith('GATE: RI3 ')).join('\n');
    const partial = run(['invariants'], `${withoutRi3}\nRDI_GATES_RC=0\nRDI_RI_RC=0\n`);
    expect(partial.status).toBe(1);
    expect(partial.stderr).toContain('no result for: RI3');
  });

  // Defect caught: the shape filter is tighter than what the check scripts
  // really print, so a genuine run drops its own results and always fails.
  it('keeps every line the two check scripts actually print', () => {
    for (const [label, lines] of Object.entries(realGateLines)) {
      expect(lines.length, `${label}: gate lines produced`).toBe(9);
      const res = run(['invariants'], `${lines.join('\n')}\nRDI_GATES_RC=1\nRDI_RI_RC=0\n`);
      const kept = res.stdout.split('\n').filter((l) => l.startsWith('GATE: '));
      expect(kept, label).toEqual(lines);
    }
  });

  // Defect caught: a failed session reads as an empty but successful probe.
  it('fails when the ssh session fails', () => {
    const res = run(['probe'], PROBE_REPLY, { FAKE_SSH_EXIT: '255' });
    expect(res.status).toBe(1);
    expect(res.stdout).toBe('');
  });
});
