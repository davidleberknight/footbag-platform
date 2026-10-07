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
      [['--target', 'staging'], 'one of --status or --set'],
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
    const res = spawnSync('script', ['-qec', inner, '/dev/null'], {
      encoding: 'utf8', input: 'APPLY\n', env, ...SPAWN_GUARD,
    });
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
});
