/**
 * The curation-cutover rehearsal, which proves two things about the real host:
 * that an audited in-app edit survives a code-only deploy, and that the
 * database-replacing deploy refuses a host carrying the cutover marker.
 *
 * These tests pin the refusals and the argument guards. The mutating path is
 * the operator's and is not exercised here: nothing below deploys, marks a
 * host, or opens a connection.
 *
 * Strategy, in two halves. The operator script is driven through its named
 * seams with a stub standing in for ssh, which answers the alias probe and
 * replays a canned host probe, so every precondition can be put into the state
 * that must refuse. The root-side body is run directly against fixture files,
 * the way the deploy guard's own tests run, so its probe output is checked
 * against a real database rather than a description of one.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import BetterSqlite3 from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = 'scripts/rehearse-curation-cutover.sh';
const REMOTE_HALF = 'scripts/internal/rehearse-curation-cutover-remote.sh';

let tmp: string;
let sshStub: string;
let pinFile: string;
let deployStub: string;
let credFile: string;
let probeCounter: string;
let actionLog: string;
let argvLog: string;

/**
 * One stub for every role the script needs from ssh.
 *
 * `-G` answers the alias resolution the shared library does before anything
 * else. Otherwise the stub reads the piped stream, records which action it
 * carried, and — for a probe — replays the next canned host report in sequence,
 * so a case can say what the host looked like before the deploy, after it, once
 * marked, and after the refused attempt. Marker moves answer success and report
 * nothing, exactly as the real body does.
 */
function writeSshStub(probes: string[]): void {
  const cases = probes
    .map((p, i) => `  ${i}) cat <<'PROBE${i}'\n${p}\nPROBE${i}\n  ;;`)
    .join('\n');
  fs.writeFileSync(
    sshStub,
    [
      '#!/usr/bin/env bash',
      'for a in "$@"; do',
      '  if [[ "$a" == "-G" ]]; then echo "hostname 203.0.113.10"; exit 0; fi',
      'done',
      'stream="$(cat)"',
      'action=probe',
      '[[ "$stream" == *"REHEARSAL_ACTION=marker-set"* ]] && action=marker-set',
      '[[ "$stream" == *"REHEARSAL_ACTION=marker-reverse"* ]] && action=marker-reverse',
      `echo "$action" >> "${actionLog}"`,
      'if [[ "$action" != "probe" ]]; then exit 0; fi',
      `n=$(cat "${probeCounter}" 2>/dev/null || echo 0)`,
      `echo $(( n + 1 )) > "${probeCounter}"`,
      'case "$n" in',
      cases,
      '  *) echo "PROBE SEQUENCE EXHAUSTED" >&2; exit 1 ;;',
      'esac',
    ].join('\n'),
    { mode: 0o755 },
  );
  fs.rmSync(probeCounter, { force: true });
  fs.rmSync(actionLog, { force: true });
}

/**
 * A deploy that records what it was invoked with. The destructive attempt's
 * exit status and output are what the cases vary, because the run is judged on
 * the refusal rather than on the invocation.
 */
function writeDeployStub(): void {
  fs.writeFileSync(
    deployStub,
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> "${argvLog}"`,
      'for a in "$@"; do',
      '  if [[ "$a" == "-r" ]]; then',
      '    printf "%s\\n" "${REBUILD_OUTPUT:-ERROR: refusing: the cutover marker is set}"',
      '    exit "${REBUILD_EXIT:-1}"',
      '  fi',
      'done',
      'exit 0',
    ].join('\n'),
    { mode: 0o755 },
  );
  fs.rmSync(argvLog, { force: true });
}

function readLines(file: string): string[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
}

/** A host in the state a rehearsal needs: everything present, nothing marked. */
function healthyProbe(overrides: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    REHEARSAL_ENV_PATH: '/srv/footbag/env',
    REHEARSAL_DB_PATH: '/srv/footbag/db/footbag.db',
    REHEARSAL_SQLITE3: 'present',
    REHEARSAL_PTY_TOOL: 'present',
    REHEARSAL_MARKER_SCRIPT: 'present',
    REHEARSAL_ENV_MARKER: 'absent',
    REHEARSAL_DB_INODE: '4242',
    REHEARSAL_DB_STATE: 'readable',
    REHEARSAL_DB_MARKER: 'absent',
    REHEARSAL_TRICK_FOUND: '1',
    REHEARSAL_PROSE_SHA: 'abc123def456',
    REHEARSAL_TRICK_AUDIT_COUNT: '3',
    REHEARSAL_AUDIT_TOTAL: '900',
  };
  return Object.entries({ ...base, ...overrides })
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

function run(
  args: string[],
  opts: { probe?: string; probes?: string[]; stdin?: string; env?: Record<string, string> } = {},
) {
  if (opts.probes) writeSshStub(opts.probes);
  else if (opts.probe !== undefined) writeSshStub([opts.probe]);
  writeDeployStub();
  return spawnSync('bash', [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    input: opts.stdin ?? 'hunter2\n',
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${tmp}:${process.env.PATH ?? ''}`,
      FOOTBAG_REHEARSAL_SSH: sshStub,
      FOOTBAG_REHEARSAL_DEPLOY_CMD: `bash ${deployStub}`,
      FOOTBAG_KNOWN_HOSTS: pinFile,
      AWS_OPERATOR_FILE: credFile,
      ...opts.env,
    },
    ...SPAWN_GUARD,
  });
}

/**
 * A whole run. The script asks nothing: it refuses every target but staging,
 * where none of its acts is consequential, so both legs are reachable directly.
 *
 * The four probes are the run's own sequence: before, after the code-only
 * deploy, once marked, and after the refused attempt.
 */
function runFull(
  probes: [string, string, string, string],
  env: Record<string, string> = {},
) {
  return run(['--target', 'staging', '--trick', 'clipper'], { probes, env });
}

const MARKED = healthyProbe({ REHEARSAL_ENV_MARKER: '1', REHEARSAL_DB_MARKER: '1' });

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-rehearse-cutover-'));
  sshStub = path.join(tmp, 'ssh');
  pinFile = path.join(tmp, 'known_hosts');
  deployStub = path.join(tmp, 'deploy-stub.sh');
  probeCounter = path.join(tmp, 'probe-counter');
  actionLog = path.join(tmp, 'actions.log');
  argvLog = path.join(tmp, 'deploy-argv.log');
  credFile = path.join(tmp, 'operator-credential');
  fs.writeFileSync(pinFile, '[203.0.113.10]:22 ssh-ed25519 AAAA\n');
  fs.writeFileSync(credFile, 'hunter2\n', { mode: 0o600 });
  writeSshStub([healthyProbe()]);
  writeDeployStub();
});

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('rehearse-curation-cutover.sh argument guards', () => {
  it('refuses to run without a target, rather than defaulting to one', () => {
    const res = run(['--trick', 'clipper', '--dry-run']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('--target is required and has no default');
  });

  it('refuses production outright, because both of its acts are cutover acts there', () => {
    const res = run(['--target', 'production', '--trick', 'clipper', '--dry-run']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('refused on production');
  });

  it('refuses a trick argument that could carry a quote into the SQL literal', () => {
    const res = run(['--target', 'staging', '--trick', "clipper'; DROP TABLE x--", '--dry-run']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('must be a trick slug');
  });

  it('refuses an unknown argument rather than ignoring it', () => {
    const res = run(['--target', 'staging', '--trick', 'clipper', '--wipe-everything']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("unknown argument '--wipe-everything'");
  });
});

describe('rehearse-curation-cutover.sh dry run', () => {
  it('reaches no host and no deploy, and names the phrase a real run will ask for', () => {
    const res = run(['--target', 'staging', '--trick', 'clipper', '--dry-run']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Reverse the marker, on a trap');
    expect(res.stdout).toContain('Reverse the marker, on a trap');
    expect(readLines(argvLog)).toEqual([]);
  });
});

describe('rehearse-curation-cutover.sh preconditions', () => {
  beforeEach(() => writeSshStub([healthyProbe()]));

  it('says on stderr when a test seam is in use, because a seamed run proves nothing', () => {
    const res = run(['--target', 'staging', '--trick', 'clipper']);
    expect(res.stderr).toContain('a test seam is in use');
  });

  it('refuses a host without sqlite3, which silently halves the marker protection', () => {
    const res = run(['--target', 'staging', '--trick', 'clipper'], {
      probe: healthyProbe({ REHEARSAL_SQLITE3: 'absent' }),
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('sqlite3 is absent');
    expect(res.stderr).toContain('one-marker protection');
    expect(readLines(argvLog)).toEqual([]);
  });

  it('refuses a host with no marker writer, and names the deploy that ships it', () => {
    const res = run(['--target', 'staging', '--trick', 'clipper'], {
      probe: healthyProbe({ REHEARSAL_MARKER_SCRIPT: 'absent' }),
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('marker writer is absent');
    expect(res.stderr).toContain('deploy rsync');
  });

  it('refuses a host with no pty tool rather than weakening the typed confirmation', () => {
    const res = run(['--target', 'staging', '--trick', 'clipper'], {
      probe: healthyProbe({ REHEARSAL_PTY_TOOL: 'absent' }),
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("util-linux 'script' is absent");
  });

  it('refuses a host already carrying the marker, so a run never reverses one it did not set', () => {
    const res = run(['--target', 'staging', '--trick', 'clipper'], {
      probe: healthyProbe({ REHEARSAL_ENV_MARKER: '1', REHEARSAL_DB_MARKER: '1' }),
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('already carries a cutover marker');
    expect(readLines(argvLog)).toEqual([]);
  });

  it('refuses when only one half of the marker is set, which is the disagreeing state', () => {
    const res = run(['--target', 'staging', '--trick', 'clipper'], {
      probe: healthyProbe({ REHEARSAL_DB_MARKER: '1' }),
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('already carries a cutover marker');
  });

  it('refuses a trick that carries no audited edit, since that is what leg one preserves', () => {
    const res = run(['--target', 'staging', '--trick', 'clipper'], {
      probe: healthyProbe({ REHEARSAL_TRICK_AUDIT_COUNT: '0' }),
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('carries no audited edit');
    expect(res.stderr).toContain('/admin/freestyle/tricks/clipper/edit');
  });

  it('refuses a trick that does not exist on the host', () => {
    const res = run(['--target', 'staging', '--trick', 'nosuchtrick'], {
      probe: healthyProbe({ REHEARSAL_TRICK_FOUND: '0' }),
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("no trick 'nosuchtrick' exists");
  });

  it('refuses an unreadable database rather than asserting against nothing', () => {
    const res = run(['--target', 'staging', '--trick', 'clipper'], {
      probe: healthyProbe({ REHEARSAL_DB_STATE: 'unreadable' }),
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('missing or unreadable');
  });

  it('refuses when the operator credential file is not readable', () => {
    const res = run(['--target', 'staging', '--trick', 'clipper'], {
      env: { AWS_OPERATOR_FILE: path.join(tmp, 'no-such-credential-file') },
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('credential source unavailable');
  });

  it('refuses a credential file that anyone but its owner can read', () => {
    const loose = path.join(tmp, 'loose-credential');
    fs.writeFileSync(loose, 'hunter2\n', { mode: 0o644 });
    const res = run(['--target', 'staging', '--trick', 'clipper'], {
      env: { AWS_OPERATOR_FILE: loose },
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('expected 600');
  });

  it('refuses a credential file whose first line is empty', () => {
    const empty = path.join(tmp, 'empty-credential');
    fs.writeFileSync(empty, '\n', { mode: 0o600 });
    const res = run(['--target', 'staging', '--trick', 'clipper'], {
      env: { AWS_OPERATOR_FILE: empty },
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('first line is empty');
  });
});

describe('rehearse-curation-cutover.sh leg one: the code-only deploy', () => {
  it('opts the code-only deploy out of the persona refresh, which would mutate what it asserts', () => {
    const res = runFull([healthyProbe(), healthyProbe(), MARKED, healthyProbe()]);
    expect(res.status).toBe(0);
    const invocations = readLines(argvLog);
    expect(invocations[0]).toBe('-k --no-refresh-personas');
  });

  it('tolerates the audit total rising, which background writes do on their own', () => {
    const res = runFull([
      healthyProbe(),
      healthyProbe({ REHEARSAL_AUDIT_TOTAL: '903' }),
      MARKED,
      healthyProbe({ REHEARSAL_AUDIT_TOTAL: '905' }),
    ]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('background writes');
  });

  it('fails when the audit total goes backwards, which is what a replaced database shows', () => {
    const res = runFull([
      healthyProbe(),
      healthyProbe({ REHEARSAL_AUDIT_TOTAL: '12' }),
      MARKED,
      healthyProbe(),
    ]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('went backwards');
  });

  it("fails when the trick's prose changed across the deploy", () => {
    const res = runFull([
      healthyProbe(),
      healthyProbe({ REHEARSAL_PROSE_SHA: 'ffffffffffff' }),
      MARKED,
      healthyProbe(),
    ]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("the trick's editorial prose changed");
  });

  it('fails when the database file identity changed, which is a replacement', () => {
    const res = runFull([
      healthyProbe(),
      healthyProbe({ REHEARSAL_DB_INODE: '9999' }),
      MARKED,
      healthyProbe(),
    ]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('the database file identity changed');
  });

  it('never reaches the marker when leg one fails', () => {
    runFull([healthyProbe(), healthyProbe({ REHEARSAL_DB_INODE: '9999' }), MARKED, healthyProbe()]);
    expect(readLines(actionLog)).not.toContain('marker-set');
  });
});

describe('rehearse-curation-cutover.sh leg two: the refused deploy', () => {
  it('records the marker, attempts the replacing deploy, and reverses on the way out', () => {
    const res = runFull([healthyProbe(), healthyProbe(), MARKED, healthyProbe()]);
    expect(res.status).toBe(0);
    const actions = readLines(actionLog);
    expect(actions).toContain('marker-set');
    expect(actions[actions.length - 1]).toBe('marker-reverse');
    expect(readLines(argvLog)[1]).toBe('-r');
    expect(res.stdout).toContain('rehearsal evidence');
  });

  it('fails loudly when the replacing deploy is NOT refused', () => {
    const res = runFull([healthyProbe(), healthyProbe(), MARKED, healthyProbe()], {
      REBUILD_EXIT: '0',
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('was NOT refused');
  });

  it('fails when the deploy was refused for some reason other than the marker', () => {
    const res = runFull([healthyProbe(), healthyProbe(), MARKED, healthyProbe()], {
      REBUILD_OUTPUT: 'ERROR: docker is not running',
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('does not name the cutover');
  });

  it('reverses the marker even when leg two fails, so the host is never left marked', () => {
    runFull([healthyProbe(), healthyProbe(), MARKED, healthyProbe()], { REBUILD_EXIT: '0' });
    const actions = readLines(actionLog);
    expect(actions[actions.length - 1]).toBe('marker-reverse');
  });

  it('refuses to continue when the marker did not land in both halves', () => {
    const res = runFull([healthyProbe(), healthyProbe(), healthyProbe(), healthyProbe()]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('did not land in both halves');
    expect(readLines(argvLog)).toEqual(['-k --no-refresh-personas']);
  });
});

describe('the root-side probe body', () => {
  let envPath: string;
  let dbPath: string;

  function runRemote(env: Record<string, string>) {
    return spawnSync('bash', [REMOTE_HALF], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: { ...process.env, ENV_PATH: envPath, ...env },
      ...SPAWN_GUARD,
    });
  }

  beforeAll(() => {
    envPath = path.join(tmp, 'env');
    dbPath = path.join(tmp, 'footbag.db');
    fs.writeFileSync(envPath, `FOOTBAG_DB_PATH=${dbPath}\n`);

    const db = new BetterSqlite3(dbPath);
    db.exec(`
      CREATE TABLE freestyle_tricks (
        slug TEXT PRIMARY KEY, description TEXT, short_description TEXT,
        execution_summary TEXT, learning_notes TEXT, prerequisite_notes TEXT,
        pronunciation TEXT, operational_notation_source TEXT
      );
      CREATE TABLE audit_entries (
        id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL
      );
      CREATE VIEW system_config_current AS SELECT 'x' AS config_key, '0' AS value_json WHERE 0;
      INSERT INTO freestyle_tricks (slug, description, short_description)
        VALUES ('clipper', 'a kick', 'the kick');
      INSERT INTO audit_entries VALUES ('a1', 'freestyle_trick', 'clipper');
      INSERT INTO audit_entries VALUES ('a2', 'freestyle_trick', 'other');
    `);
    db.close();
  });

  it('refuses an action it does not recognise', () => {
    const res = runRemote({ REHEARSAL_ACTION: 'rm-rf' });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('REHEARSAL_ACTION must be');
  });

  it('resolves the database out of the host env file rather than assuming the default', () => {
    const res = runRemote({ REHEARSAL_ACTION: 'probe', REHEARSAL_TRICK_SLUG: 'clipper' });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain(`REHEARSAL_DB_PATH=${dbPath}`);
  });

  it('counts the audit entries for the named trick, not every trick', () => {
    const res = runRemote({ REHEARSAL_ACTION: 'probe', REHEARSAL_TRICK_SLUG: 'clipper' });
    expect(res.stdout).toContain('REHEARSAL_TRICK_AUDIT_COUNT=1');
    expect(res.stdout).toContain('REHEARSAL_AUDIT_TOTAL=2');
  });

  it('reports the marker absent on a pre-cutover host', () => {
    const res = runRemote({ REHEARSAL_ACTION: 'probe', REHEARSAL_TRICK_SLUG: 'clipper' });
    expect(res.stdout).toContain('REHEARSAL_ENV_MARKER=absent');
    expect(res.stdout).toContain('REHEARSAL_DB_MARKER=absent');
  });

  it('hashes the seven editorial fields as one value that moving text between them changes', () => {
    const first = runRemote({ REHEARSAL_ACTION: 'probe', REHEARSAL_TRICK_SLUG: 'clipper' });
    const sha = /REHEARSAL_PROSE_SHA=([0-9a-f]{64})/.exec(first.stdout)?.[1];
    expect(sha).toBeDefined();

    // Same characters, different fields: the separators are what make this a
    // different hash rather than the same one.
    const db = new BetterSqlite3(dbPath);
    db.prepare(
      "UPDATE freestyle_tricks SET description = 'a kickthe kick', short_description = '' WHERE slug = 'clipper'",
    ).run();
    db.close();

    const second = runRemote({ REHEARSAL_ACTION: 'probe', REHEARSAL_TRICK_SLUG: 'clipper' });
    const sha2 = /REHEARSAL_PROSE_SHA=([0-9a-f]{64})/.exec(second.stdout)?.[1];
    expect(sha2).toBeDefined();
    expect(sha2).not.toBe(sha);
  });

  it('reports a missing trick as absent rather than failing the probe', () => {
    const res = runRemote({ REHEARSAL_ACTION: 'probe', REHEARSAL_TRICK_SLUG: 'nosuchtrick' });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('REHEARSAL_TRICK_FOUND=0');
  });
});
