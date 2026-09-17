/**
 * scripts/host-shell.sh — taking an interactive shell on a deployed host.
 *
 * The shell was the last connection on the operator path with no scripted form.
 * The runbook gave a hand-typed recipe as the standard pattern, carrying a key
 * path, a port and an account but nothing that verified which host had answered,
 * while every other connection in this tree passes the pin on its own command
 * line. That matters most for the shell, because it is the session in which
 * somebody then types their sudo password by hand.
 *
 * What is pinned here is the refusal surface and the shape of the connection,
 * which is all a test can reach: a real session needs the host and a terminal.
 * The alias case is the one to read first. It supplies no ssh of its own, so the
 * shared machine-isolation declaration answers the lookup the way a clean runner
 * does, and the script refuses. Every other case puts its own ssh in front of
 * that one, which is the declaration's deliberate opt-out.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, chmodSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/host-shell.sh');

let scratch: string;
let fakeHome: string;
let binDir: string;

/**
 * An `ssh` that answers the alias lookup, on PATH ahead of the stub the shared
 * declaration installs. Without it the alias does not resolve and the script
 * stops at that guard, which is the runner's condition and its own case below.
 */
function stubSshOnPath(user = 'footbag'): void {
  writeFileSync(
    join(binDir, 'ssh'),
    [
      '#!/usr/bin/env bash',
      'for arg in "$@"; do',
      '  if [[ "$arg" == "-G" ]]; then',
      `    printf 'hostname 203.0.113.10\\nuser ${user}\\nport 2222\\n'`,
      '    exit 0',
      '  fi',
      'done',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(join(binDir, 'ssh'), 0o755);
}

/**
 * The seam the script names for its own connection. It records the argv it was
 * called with, so a case can assert what the connection would have carried
 * without opening one.
 */
function sshSeam(): string {
  const recorder = join(scratch, 'ssh-seam.sh');
  const log = join(scratch, 'ssh-argv.txt');
  writeFileSync(
    recorder,
    [
      '#!/usr/bin/env bash',
      'for arg in "$@"; do',
      '  if [[ "$arg" == "-G" ]]; then',
      "    printf 'user footbag\\n'",
      '    exit 0',
      '  fi',
      'done',
      `printf '%s\\n' "$@" > ${log}`,
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(recorder, 0o755);
  return recorder;
}

function seamArgv(): string[] {
  return readFileSync(join(scratch, 'ssh-argv.txt'), 'utf-8').trim().split('\n');
}

function writePin(mode = 0o600): void {
  mkdirSync(join(fakeHome, 'AWS'), { recursive: true });
  const pin = join(fakeHome, 'AWS', 'footbag_known_hosts');
  writeFileSync(pin, '203.0.113.10 ssh-ed25519 AAAATESTKEY\n', 'utf-8');
  chmodSync(pin, mode);
}

function run(args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      HOME: fakeHome,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      FOOTBAG_KNOWN_HOSTS: join(fakeHome, 'AWS', 'footbag_known_hosts'),
      ...extraEnv,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

beforeEach(() => {
  scratch = createScratchDir('host-shell');
  fakeHome = join(scratch, 'home');
  binDir = join(scratch, 'bin');
  mkdirSync(fakeHome, { recursive: true });
  mkdirSync(binDir, { recursive: true });
});

afterEach(() => {
  removeScratch(scratch);
});

describe('host-shell.sh — argument guards', () => {
  it('requires a target rather than defaulting to one', () => {
    stubSshOnPath();
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--target is required/);
  });

  it('refuses a target that is neither environment', () => {
    stubSshOnPath();
    const r = run(['--target', 'prod']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/prod/);
  });

  it('refuses an unknown flag', () => {
    stubSshOnPath();
    const r = run(['--target', 'staging', '--force']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown flag '--force'/);
  });

  it('answers --help with exit 0 and the diagnostics wrapper', () => {
    const r = run(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--target <env>');
    expect(r.stdout).toContain('scripts/host-diagnostics.sh');
  });

  it('refuses a command, and names what to run instead', () => {
    // A one-shot connection allocates no terminal, so sudo on the far end fails
    // on it. Accepting a command would rebuild the hand-typed one-off this
    // script exists to remove.
    stubSshOnPath();
    writePin();
    const r = run(['--target', 'staging', 'uptime']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/takes no command/);
    expect(r.stderr).toMatch(/no terminal, so sudo fails/);
    expect(r.stderr).toContain('scripts/host-diagnostics.sh --target staging uptime');
  });
});

describe('host-shell.sh — preconditions', () => {
  it('refuses an alias this workstation does not define', () => {
    // No ssh of its own: the shared declaration answers the lookup the way a
    // machine with no stanza for the name answers, which is the runner's
    // condition and the one this guard exists for.
    writePin();
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/SSH alias 'footbag-staging' is not configured/);
  });

  it('refuses without the pinned host-key file, naming the script that builds it', () => {
    stubSshOnPath();
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/pinned host-key file not found/);
    expect(r.stderr).toContain('scripts/install-known-hosts.sh');
    // Stopped AT this guard. Asserting the message and the status alone is not
    // enough, because the terminal refusal below also exits 1 and leaves the
    // message on stderr: a run that ignored this refusal and carried on would
    // satisfy both. Reaching the connection at all is what must not happen.
    expect(r.stderr).not.toMatch(/Connecting to/);
  });

  it('refuses a pin other accounts can rewrite', () => {
    // An attacker who can edit the pin can install the key of the host they
    // want the session to reach, which is the substitution the pin prevents.
    stubSshOnPath();
    writePin(0o666);
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/expected it to be non-writable by others/);
    expect(r.stderr).not.toMatch(/Connecting to/);
  });

  it('refuses when no terminal is attached', () => {
    // A spawned run has no terminal, which is exactly the condition a scheduled
    // job or an agent session presents. The seam is deliberately not set here,
    // because a run that reaches no host has no access left to protect.
    stubSshOnPath();
    writePin();
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no terminal attached/);
  });
});

describe('host-shell.sh — the connection it would open', () => {
  it('carries the pin, the alias and no remote command', () => {
    stubSshOnPath();
    writePin();
    const r = run(['--target', 'production'], { FOOTBAG_HOST_SHELL_SSH: sshSeam() });
    expect(r.status).toBe(0);

    const argv = seamArgv();
    expect(argv).toContain('StrictHostKeyChecking=yes');
    expect(argv).toContain(`UserKnownHostsFile=${join(fakeHome, 'AWS', 'footbag_known_hosts')}`);
    // Last argument and nothing after it: a trailing command is the shape that
    // would silently turn this into a one-shot.
    expect(argv[argv.length - 1]).toBe('footbag-production');
  });

  it('says on stderr that the run is stubbed, and which account it would be', () => {
    stubSshOnPath();
    writePin();
    const r = run(['--target', 'staging'], { FOOTBAG_HOST_SHELL_SSH: sshSeam() });
    expect(r.stderr).toMatch(/ssh is stubbed via FOOTBAG_HOST_SHELL_SSH/);
    expect(r.stderr).toMatch(/Connecting to footbag-staging as footbag, host key pinned/);
  });
});
