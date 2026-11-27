/**
 * Reading and moving the cutover marker from the operator's workstation.
 *
 * The marker's two records, the host env-file line and the database row, were
 * moved by typing the host-side script under sudo over ssh. The workstation
 * wrapper does it over the shared wire. What these pin: the root-side body runs
 * the host script with the workstation confirmation and reports both markers
 * read back; the wrapper refuses a missing or doubled action and an unknown
 * target, checks the host's identity before anything is read, asks nothing for a
 * status read, refuses a move nobody confirmed at a terminal, and fails when the
 * markers do not both read the requested direction afterwards.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import BetterSqlite3 from 'better-sqlite3';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { spawnAtTerminal } from '../fixtures/ptySession';
import { hostIdentityAnswer } from '../fixtures/hostIdentityStub';

const REMOTE_HALF = join(process.cwd(), 'scripts/internal/cutover-marker-remote.sh');
const MARKER_SCRIPT = join(process.cwd(), 'scripts/cutover-marker.sh');
const OPERATOR_SCRIPT = join(process.cwd(), 'scripts/cutover-marker-host.sh');

let workDir: string;
let envPath: string;
let dbPath: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-cutover-host-'));
  envPath = join(workDir, 'env');
  dbPath = join(workDir, 'footbag.db');
  writeFileSync(envPath, 'FOOTBAG_ENV=staging\n');
  const db = new BetterSqlite3(dbPath);
  db.exec(`
    CREATE TABLE system_config (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, config_key TEXT NOT NULL,
      value_json TEXT NOT NULL, effective_start_at TEXT NOT NULL, reason_text TEXT NOT NULL,
      changed_by_member_id TEXT, UNIQUE (config_key, effective_start_at)
    );
  `);
  db.close();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function runRemote(action: string, dryRun = 'no') {
  const res = spawnSync('bash', [REMOTE_HALF], {
    env: {
      ...process.env,
      MARKER_ACTION: action,
      MARKER_DRY_RUN: dryRun,
      MARKER_SCRIPT,
      ENV_PATH: envPath,
      DB_PATH: dbPath,
    },
    input: '',
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

describe('the root-side marker move', () => {
  it('moves both markers and reports them read back', () => {
    const res = runRemote('set-complete');
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('MARKER_ENV=complete');
    expect(res.stdout).toContain('MARKER_DB=complete');
    expect(readFileSync(envPath, 'utf8')).toContain('FOOTBAG_CUTOVER_COMPLETE=1');
  });

  it('reports the markers without moving them for a status read or a dry run', () => {
    for (const [action, dry] of [['status', 'no'], ['set-complete', 'yes']]) {
      const res = runRemote(action, dry);
      expect(res.status, `${action} ${dry}: ${res.stderr}`).toBe(0);
      expect(res.stdout).toContain('MARKER_ENV=reversed');
      expect(res.stdout).toContain('MARKER_DB=reversed');
    }
    expect(readFileSync(envPath, 'utf8')).not.toContain('FOOTBAG_CUTOVER_COMPLETE=1');
  });

  it('refuses an action it does not know', () => {
    const res = runRemote('set-sideways');
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('unknown MARKER_ACTION');
  });
});

describe('the operator-facing marker script', () => {
  /** A stand-in host: answers the alias lookup and identity question, records
   *  each other session's stdin, and replies with the markers a case chooses. */
  function standInHost(opts: { recorded?: string; reply?: string } = {}) {
    const stubDir = join(workDir, 'host-bin');
    mkdirSync(stubDir, { recursive: true });
    const sessions = join(workDir, 'sessions.log');
    writeFileSync(join(stubDir, 'ssh'), [
      '#!/usr/bin/env bash',
      hostIdentityAnswer(opts.recorded),
      'for a in "$@"; do',
      '  if [[ "$a" == "-G" ]]; then printf "hostname 203.0.113.40\\nuser footbag\\n"; exit 0; fi',
      'done',
      `cat >> "${sessions}"`,
      `printf '%b' ${JSON.stringify(opts.reply ?? 'MARKER_ENV=reversed\\nMARKER_DB=reversed\\n')}`,
      'exit 0',
    ].join('\n'));
    chmodSync(join(stubDir, 'ssh'), 0o755);
    const pin = join(workDir, 'pin');
    writeFileSync(pin, '[203.0.113.40]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE\n');
    return {
      env: { ...process.env, PATH: `${stubDir}:${process.env.PATH ?? ''}`, FOOTBAG_KNOWN_HOSTS: pin },
      sessions,
    };
  }

  function runOperator(args: string[], env: NodeJS.ProcessEnv = process.env) {
    const res = spawnSync('setsid', ['bash', OPERATOR_SCRIPT, ...args], {
      encoding: 'utf8',
      input: 'fixture-sudo-password\n',
      env,
      ...SPAWN_GUARD,
    });
    return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }

  function sent(sessions: string): string {
    return existsSync(sessions) ? readFileSync(sessions, 'utf8') : '';
  }

  it('refuses a missing target, a missing action or two actions before reaching any host', () => {
    const { env, sessions } = standInHost();
    for (const [args, message] of [
      [['--status'], '--target must be production or staging'],
      [['--target', 'prod', '--status'], '--target must be production or staging'],
      [['--target', 'staging'], 'one of --status, --check-guard or --set'],
      [['--target', 'staging', '--status', '--check-guard'], 'name one action'],
      [['--target', 'staging', '--check-guard', '--dry-run'], 'takes no --dry-run'],
      [['--target', 'staging', '--status', '--set', 'complete'], 'name one action'],
      [['--target', 'staging', '--set', 'sideways'], "--set takes 'complete' or 'reversed'"],
    ] as const) {
      const res = runOperator([...args], env);
      expect(res.status, args.join(' ')).not.toBe(0);
      expect(res.stderr, args.join(' ')).toContain(message);
    }
    expect(sent(sessions)).toBe('');
  });

  it('reads the status with no prompt, sending the status action', () => {
    const { env, sessions } = standInHost();
    const res = runOperator(['--target', 'staging', '--status'], env);
    expect(res.status, res.stderr).toBe(0);
    expect(sent(sessions)).toContain('MARKER_ACTION=status');
    expect(res.stdout).toContain('env file reversed, database reversed');
  });

  it('refuses a move nobody confirmed at a terminal, sending no move', () => {
    // Defect caught: the destructive-deploy protection moved by a script or an
    // agent session with no person at a terminal.
    const { env, sessions } = standInHost();
    const res = runOperator(['--target', 'production', '--set', 'reversed'], env);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('not confirmed');
    expect(sent(sessions)).not.toContain('MARKER_ACTION=set-');
  });

  it('sends a dry run without asking and moves nothing', () => {
    const { env, sessions } = standInHost();
    const res = runOperator(['--target', 'staging', '--set', 'complete', '--dry-run'], env);
    expect(res.status, res.stderr).toBe(0);
    expect(sent(sessions)).toContain('MARKER_DRY_RUN=yes');
  });

  it('refuses a host that records another environment before reading anything', () => {
    const { env, sessions } = standInHost({ recorded: 'production' });
    const res = runOperator(['--target', 'staging', '--status'], env);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/records FOOTBAG_ENV=production, but this run is --target staging/);
    expect(sent(sessions)).not.toContain('MARKER_ACTION');
  });

  /** A confirmed move: the password file is redirected inside a pseudo-terminal,
   *  which is where the typed APPLY is answered, as an operator would. */
  function runConfirmed(args: string[], env: NodeJS.ProcessEnv) {
    const pw = join(workDir, 'pw');
    writeFileSync(pw, 'fixture-sudo-password\n');
    const inner = ['bash', OPERATOR_SCRIPT, ...args, '<', pw].map((a) => (a === '<' ? a : JSON.stringify(a))).join(' ');
    const res = spawnAtTerminal(inner, { typed: 'APPLY\n', env });
    return { status: res.status ?? -1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
  }

  it('confirms a move at the terminal and passes when both markers read back as asked', () => {
    const { env, sessions } = standInHost({ reply: 'MARKER_ENV=complete\\nMARKER_DB=complete\\n' });
    const res = runConfirmed(['--target', 'staging', '--set', 'complete'], env);
    expect(res.status, res.out).toBe(0);
    expect(sent(sessions)).toContain('MARKER_ACTION=set-complete');
    expect(res.out).toContain('both cutover markers on staging read complete');
  });

  it('fails a move whose markers do not both read back as asked', () => {
    // Defect caught: a move reported done while the database marker stayed
    // behind, the half-recorded state the destructive deploy's guard refuses.
    const { env } = standInHost({ reply: 'MARKER_ENV=complete\\nMARKER_DB=reversed\\n' });
    const res = runConfirmed(['--target', 'staging', '--set', 'complete'], env);
    expect(res.status).toBe(1);
    expect(res.out).toContain("database 'reversed', not both 'complete'");
  });

  it('refuses a report missing either marker rather than assuming one', () => {
    const { env } = standInHost({ reply: 'MARKER_ENV=complete\\n' });
    const res = runOperator(['--target', 'staging', '--status'], env);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('did not report both markers');
  });

  /** A stand-in host that runs what it is sent: the password line is read off
   *  as sudo would, and the rest runs in bash against this case's env file and
   *  database, which the guard reads from ENV_PATH and DB_PATH. */
  function runningHost() {
    const stubDir = join(workDir, 'host-bin');
    mkdirSync(stubDir, { recursive: true });
    const streams = join(workDir, 'streams.log');
    writeFileSync(join(stubDir, 'ssh'), [
      '#!/usr/bin/env bash',
      hostIdentityAnswer(),
      'for a in "$@"; do',
      '  if [[ "$a" == "-G" ]]; then printf "hostname 203.0.113.40\\nuser footbag\\n"; exit 0; fi',
      'done',
      `stream="$(cat)"; printf '%s\\n' "$stream" >> "${streams}"`,
      `printf '%s\\n' "$stream" | { IFS= read -r _pw; ENV_PATH=${JSON.stringify(envPath)} DB_PATH=${JSON.stringify(dbPath)} bash; }`,
    ].join('\n'));
    chmodSync(join(stubDir, 'ssh'), 0o755);
    const pin = join(workDir, 'pin');
    writeFileSync(pin, '[203.0.113.40]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE\n');
    return {
      env: { ...process.env, PATH: `${stubDir}:${process.env.PATH ?? ''}`, FOOTBAG_KNOWN_HOSTS: pin },
      streams,
    };
  }
  const guard = (env: NodeJS.ProcessEnv) => runOperator(['--target', 'staging', '--check-guard'], env);

  // Defect caught: the P1-15 proof passing whether or not the marker is
  // written, because what it ran refused for another reason before reading it.
  // Here the deploy's own guard decides, on the markers the real marker script
  // wrote, and the answer flips with them.
  it('reports allow before the marker is set and refuse once both markers say complete', () => {
    const { env, streams } = runningHost();
    const before = guard(env);
    expect(before.status, before.stderr).toBe(0);
    expect(before.stdout).toContain('cutover guard on staging: allow');

    expect(runRemote('set-complete').status).toBe(0);
    const after = guard(env);
    expect(after.status, after.stderr).toBe(3);
    expect(after.stdout).toMatch(/cutover guard on staging: refuse \(.*post-cutover/);

    expect(runRemote('set-reversed').status).toBe(0);
    const reversed = guard(env);
    expect(reversed.status, reversed.stderr).toBe(0);
    expect(reversed.stdout).toContain('cutover guard on staging: allow');

    // The guard travels as the deploy's own file, and the password only as the
    // first line, never beside the values.
    const sentStream = readFileSync(streams, 'utf8');
    expect(sentStream).toContain('GUARD_SRC_B64=');
    expect(sentStream.split('\n').filter((l) => l === 'fixture-sudo-password')).toHaveLength(3);
    expect(sentStream).not.toMatch(/^(ENV_PATH|DB_PATH)=/m);
  });

  // Defect caught: a half-recorded marker read as protected or as clear, when
  // the deploy refuses it.
  it('reports refuse when the two markers disagree', () => {
    const { env } = runningHost();
    expect(runRemote('set-complete').status).toBe(0);
    writeFileSync(envPath, 'FOOTBAG_ENV=staging\n');
    const res = guard(env);
    expect(res.status, res.stderr).toBe(3);
    expect(res.stdout).toMatch(/refuse \(.*disagree/);
  });

  // Defect caught: a database the guard cannot read hidden, so the operator
  // believes the in-database marker was consulted.
  it('carries the guard\'s warning when it cannot read the database', () => {
    const { env } = runningHost();
    writeFileSync(dbPath, 'not a database\n');
    const res = guard(env);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stderr).toMatch(/Warnings \(1\):[\s\S]*unreadable/);
  });

  // Defect caught: a host that answered nothing read as either answer.
  it('fails when the host gives no answer from the guard', () => {
    const { env } = standInHost({ reply: 'nothing useful\\n' });
    const res = guard(env);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no answer from the cutover guard');
  });
});

describe('the root-side guard probe', () => {
  const PROBE_HALF = join(process.cwd(), 'scripts/internal/cutover-guard-probe-remote.sh');
  const REPORT_REMOTE = join(process.cwd(), 'scripts/lib/closing-report-remote.sh');
  const probe = (guardSource: string) => spawnSync('bash', ['-c', `source ${JSON.stringify(REPORT_REMOTE)}; source ${JSON.stringify(PROBE_HALF)}`], {
    env: { ...process.env, GUARD_SRC_B64: Buffer.from(guardSource).toString('base64') },
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });

  // Defect caught: a guard that stopped for some other reason read as a
  // refusal, so a broken guard looks like a working marker.
  it('reports an error, not refuse, when the guard ends without its answer', () => {
    for (const src of ['exit 1', 'exit 4', 'true', 'crr_error "stand-in reason"; exit 4']) {
      const res = probe(src);
      expect(res.status, src).toBe(1);
      expect(res.stdout, src).not.toMatch(/---FOOTBAG-GUARD--- /);
      expect(res.stderr, src).toMatch(/---FOOTBAG-PROBLEM--- ERROR .*without an answer/);
    }
  });

  it('reports refuse with the guard\'s reason, and allow only when the guard finished', () => {
    const refused = probe('crr_error "stand-in reason"; exit 1');
    expect(refused.status).toBe(0);
    expect(refused.stdout).toBe('---FOOTBAG-GUARD--- refuse\n---FOOTBAG-GUARD-WHY--- stand-in reason\n');
    const allowed = probe('CUTOVER_GUARD_RAN=1');
    expect(allowed.status).toBe(0);
    expect(allowed.stdout).toBe('---FOOTBAG-GUARD--- allow\n');
  });
});
