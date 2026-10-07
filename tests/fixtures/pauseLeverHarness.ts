/**
 * Drives one of the runtime pause levers (payments, outbound mail, bulk send)
 * end to end without a host.
 *
 * Each lever reaches a deployed host over ssh and pipes one stream into
 * `sudo -k -S -p "" bash`: the sudo password, the values the root-side body
 * needs, then the body. The stand-in client here, put in through the shared
 * library's named seam, records that stream, drops its first line exactly as
 * sudo would, and runs the rest in bash against a temporary database built from
 * the real schema. So the switch the lever reports is read back from a real
 * write, and the cases can see what crossed the wire.
 *
 * The same stand-in answers the two other things the library asks a client:
 * the alias resolution (`-G`), with the account that selects the credential
 * file, and the host's identity, from the shared host-identity answer. It sits
 * at the front of PATH as well, visibly, because the alias resolution runs the
 * client by name.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { SPAWN_GUARD } from './spawnGuard';
import { hostIdentityAnswer } from './hostIdentityStub';
import { requireToolInCI } from './toolAvailability';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA = path.join(REPO_ROOT, 'database', 'schema.sql');

/** The password line the operator's credential file supplies. */
export const STUB_SUDO_PASSWORD = 'stub-sudo-password';

export interface LeverRun {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Every line the lever piped into the remote session, or null if none was opened. */
  stream: string[] | null;
}

export interface LeverHarness {
  /**
   * Runs the script with `--db-file <case database>` appended, unless
   * `bareArgs` is set, for a case about how the script parses its own flags.
   */
  run(args: string[], opts?: { recordedEnv?: string; stdin?: string; bareArgs?: boolean }): LeverRun;
  /** The value the application reads for the lever's switch, from the case's database. */
  effective(): string;
  /** The case's host database, for a suite that seeds state the script then reads. */
  hostDbPath(): string;
  /** A fresh database for the next case. */
  reset(): void;
  dispose(): void;
}

/** Build the template database once; each case copies it. */
function buildTemplate(file: string) {
  const db = new BetterSqlite3(file);
  // Throwaway fixture: no durability needed, and per-statement flushes over the
  // whole schema cost seconds.
  db.pragma('synchronous = OFF');
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  db.close();
}

export function pauseLeverHarness(scratch: string, script: string, configKey: string): LeverHarness {
  const template = path.join(scratch, 'template.db');
  buildTemplate(template);
  const dbFile = path.join(scratch, 'footbag.db');
  const home = path.join(scratch, 'home');
  const bin = path.join(scratch, 'bin');
  const pin = path.join(scratch, 'known_hosts');
  const streamFile = path.join(scratch, 'stream.txt');
  fs.mkdirSync(path.join(home, 'AWS'), { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(pin, '[203.0.113.10]:22 ssh-ed25519 AAAA\n');
  // The credential files the shared rule selects for the shared account. The
  // password itself arrives on stdin; these only have to exist with a safe mode.
  for (const f of ['AWS_OPERATOR.txt', 'AWS_OPERATOR_PRODUCTION.txt']) {
    fs.writeFileSync(path.join(home, 'AWS', f), `${STUB_SUDO_PASSWORD}\n`, { mode: 0o600 });
  }

  function writeClient(recordedEnv?: string) {
    fs.writeFileSync(
      path.join(bin, 'ssh'),
      [
        '#!/usr/bin/env bash',
        hostIdentityAnswer(recordedEnv),
        'for a in "$@"; do',
        '  if [[ "$a" == "-G" ]]; then',
        '    echo "hostname 203.0.113.10"',
        '    echo "user footbag"',
        '    exit 0',
        '  fi',
        'done',
        `cat > ${JSON.stringify(streamFile)}`,
        // sudo -S consumes exactly the first line; bash runs everything after it.
        `tail -n +2 ${JSON.stringify(streamFile)} | bash`,
      ].join('\n'),
      { mode: 0o755 },
    );
  }

  const harness: LeverHarness = {
    run(args, opts = {}) {
      writeClient(opts.recordedEnv);
      fs.rmSync(streamFile, { force: true });
      const argv = opts.bareArgs ? [script, ...args] : [script, ...args, '--db-file', dbFile];
      const res = spawnSync('bash', argv, {
        cwd: REPO_ROOT,
        input: opts.stdin ?? `${STUB_SUDO_PASSWORD}\n`,
        encoding: 'utf-8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          FOOTBAG_HOST_SSH_BIN: path.join(bin, 'ssh'),
          FOOTBAG_KNOWN_HOSTS: pin,
          HOME: home,
        },
        ...SPAWN_GUARD,
      });
      const stream = fs.existsSync(streamFile) ? fs.readFileSync(streamFile, 'utf8').split('\n') : null;
      return { status: res.status, stdout: res.stdout, stderr: res.stderr, stream };
    },
    effective() {
      const db = new BetterSqlite3(dbFile, { readonly: true });
      try {
        return (db.prepare('SELECT value_json FROM system_config_current WHERE config_key = ?')
          .get(configKey) as { value_json: string }).value_json;
      } finally {
        db.close();
      }
    },
    hostDbPath() {
      return dbFile;
    },
    reset() {
      fs.copyFileSync(template, dbFile);
    },
    dispose() {
      fs.rmSync(scratch, { recursive: true, force: true });
    },
  };
  harness.reset();
  return harness;
}

export interface PauseLeverSpec {
  /** Repository-relative path of the lever. */
  script: string;
  /** The runtime switch it writes. */
  configKey: string;
  /** The line the lever prints when the switch reads paused, for staging. */
  pausedLine: string;
  /** The line it prints when the switch reads clear, for staging. */
  clearLine: string;
  /** Wording the clear state must never use, because it would describe the opposite. */
  clearMustNotSay?: RegExp[];
  /** Label for the scratch directory. */
  label: string;
}

/**
 * The case set every lever answers to. Each lever is its own copy of the same
 * shape, so each is driven separately: a guard deleted from one copy is not
 * caught by another copy's suite.
 */
export function describePauseLever(spec: PauseLeverSpec, makeScratch: (label: string) => string) {
  // The root-side body runs the sqlite3 CLI, as it does on a host.
  const sqlite = requireToolInCI('sqlite3', '-version');
  describe.skipIf(!sqlite)(`${spec.script}, driven through a stand-in host`, () => {
    let h: LeverHarness;
    beforeAll(() => {
      h = pauseLeverHarness(makeScratch(spec.label), spec.script, spec.configKey);
    });
    beforeEach(() => h.reset());
    afterAll(() => h.dispose());

    it('refuses to pause or resume without a reason, before reaching the host', () => {
      // The reason is the only record of why the switch moved; an incident is
      // exactly when nobody remembers.
      for (const action of ['--pause', '--resume']) {
        const res = h.run(['--target', 'staging', action, '--yes']);
        expect(res.status, action).toBe(1);
        expect(res.stderr, action).toContain('--reason is required');
        expect(res.stream, `${action}: nothing may cross the wire`).toBeNull();
      }
      expect(h.effective()).toBe('0');
    });

    it('refuses a target it does not know', () => {
      const res = h.run(['--target', 'prod', '--pause', '--reason', 'r', '--yes']);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("--target must be production or staging (got 'prod')");
      expect(res.stream).toBeNull();
    });

    it('names the problem when --target is given no value', () => {
      // A run that exits with no message leaves the operator guessing whether the
      // switch moved.
      const res = h.run(['--pause', '--reason', 'r', '--yes', '--target'], { bareArgs: true });
      expect(res.status).toBe(2);
      expect(res.stderr).toContain('--target requires an environment name');
      expect(res.stream).toBeNull();
    });

    it('refuses a host that records another environment, and writes nothing', () => {
      // The alias resolved, but the host on the other end says it is production.
      // Flipping a switch there in the belief it was staging is the failure.
      const res = h.run(['--target', 'staging', '--pause', '--reason', 'r', '--yes'], { recordedEnv: 'production' });
      expect(res.status).not.toBe(0);
      expect(res.stream).toBeNull();
      expect(h.effective()).toBe('0');
    });

    it('with no terminal and no --yes, is not confirmed and sends nothing', () => {
      const res = h.run(['--target', 'staging', '--pause', '--reason', 'incident']);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('no terminal to confirm on');
      expect(res.stderr).toContain('not confirmed; nothing was changed');
      expect(res.stream).toBeNull();
      expect(h.effective()).toBe('0');
    });

    it('pauses with --yes: the switch the application reads moves, and the lever reports it', () => {
      // Two lines of stdin: only the first is the password, and nothing after it
      // may be forwarded into a root shell on the host.
      const res = h.run(['--target', 'staging', '--pause', '--reason', 'wrong list', '--yes'], {
        stdin: `${STUB_SUDO_PASSWORD}\necho second-line-of-the-credential-file\n`,
      });
      expect(res.status, res.stderr).toBe(0);
      expect(h.effective()).toBe('1');
      expect(res.stdout).toContain(spec.pausedLine);
      expect(res.stream![0]).toBe(STUB_SUDO_PASSWORD);
      expect(res.stream!.join('\n')).not.toContain('second-line-of-the-credential-file');
      expect(res.stream!.slice(1).join('\n')).not.toContain(STUB_SUDO_PASSWORD);
      expect(res.stderr).toContain('NOTE: using a stand-in for the ssh client');
    });

    it('resumes with --yes, and reports the switch clear', () => {
      expect(h.run(['--target', 'staging', '--pause', '--reason', 'stop', '--yes']).status).toBe(0);
      const res = h.run(['--target', 'staging', '--resume', '--reason', 'fixed', '--yes']);
      expect(res.status, res.stderr).toBe(0);
      expect(h.effective()).toBe('0');
      expect(res.stdout).toContain(spec.clearLine);
    });

    it('reports each state from the host on --status, and writes nothing', () => {
      // The report is read back from the database, not echoed from the request.
      const clear = h.run(['--target', 'staging', '--status']);
      expect(clear.status, clear.stderr).toBe(0);
      expect(clear.stdout).toContain(spec.clearLine);
      for (const wrong of spec.clearMustNotSay ?? []) expect(clear.stdout).not.toMatch(wrong);

      expect(h.run(['--target', 'staging', '--pause', '--reason', 'stop', '--yes']).status).toBe(0);
      const paused = h.run(['--target', 'staging', '--status']);
      expect(paused.status, paused.stderr).toBe(0);
      expect(paused.stdout).toContain(spec.pausedLine);
      expect(paused.stdout).not.toContain(spec.clearLine);
      expect(h.effective()).toBe('1');
    });
  });
}
