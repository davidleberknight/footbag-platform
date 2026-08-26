/**
 * scripts/lib/ssh-known-hosts.sh — the host-key pin every operator script
 * verifies a deployed host against before it opens a privileged connection.
 *
 * These scripts put the operator's sudo password on line one of the SSH
 * stream, so the pin is what stands between that credential and a substituted
 * host. The contract this suite holds is that the helper fails closed: a pin
 * that is missing, or that other accounts could rewrite, stops the caller
 * rather than downgrading it to trust-on-first-connect, and a pin the helper
 * does accept produces options that refuse an unknown host outright and read
 * no known-hosts file other than the pin itself.
 *
 * The suite supplies its own pin under a throwaway directory and never reads
 * the operator's, which is machine-local and absent everywhere else.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const LIB = join(process.cwd(), 'scripts/lib/ssh-known-hosts.sh');

const PIN_LINE = '[203.0.113.10]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITESTKEYFORPINSUITE\n';

let workDir: string;
let emptyHome: string;

interface RunResult {
  exitCode: number;
  optsLines: string[];
  stderr: string;
}

/**
 * Sources the helper, calls it, and reports both halves of its contract: the
 * return code, and the option array it populated. The options are printed one
 * per line so an assertion can compare the exact pair rather than a joined
 * string that would hide a missing or reordered element.
 */
function runPinCheck(env: Record<string, string>): RunResult {
  const snippet = [
    `source "${LIB}"`,
    'require_pinned_known_hosts',
    'rc=$?',
    'printf "%s\\n" "${FOOTBAG_SSH_PIN_OPTS[@]}"',
    'exit $rc',
  ].join('\n');

  const r = spawnSync('bash', ['-c', snippet], {
    encoding: 'utf-8',
    env: { ...process.env, HOME: emptyHome, FOOTBAG_KNOWN_HOSTS: '', ...env },
    ...SPAWN_GUARD,
  });

  return {
    exitCode: r.status ?? -1,
    optsLines: (r.stdout ?? '').split('\n').filter((l) => l.length > 0),
    stderr: r.stderr ?? '',
  };
}

/** Writes a pin at the given mode and returns its path. */
function writePin(name: string, mode: number): string {
  const p = join(workDir, name);
  writeFileSync(p, PIN_LINE, 'utf-8');
  chmodSync(p, mode);
  return p;
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-sshpin-'));
  // A home with no pin in it, so the default-location cases are exercised
  // against a known-empty directory rather than whatever the runner happens to
  // have.
  emptyHome = join(workDir, 'home');
  mkdirSync(emptyHome, { recursive: true });
});

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

describe('a missing pin stops the caller', () => {
  it('refuses, names the path it looked for, and populates no options', () => {
    const missing = join(workDir, 'absent-pin');
    const r = runPinCheck({ FOOTBAG_KNOWN_HOSTS: missing });

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain(missing);
    // An empty option array is the safe failure: a caller that forgets to check
    // the return code gets an SSH invocation with no verification options
    // rather than a silently permissive one.
    expect(r.optsLines).toEqual([]);
  });

  it('looks under the operator home directory when no override is set', () => {
    const r = runPinCheck({});

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain(join(emptyHome, 'AWS/footbag_known_hosts'));
  });

  it('tells the operator how to rebuild it from the authoritative source', () => {
    const r = runPinCheck({ FOOTBAG_KNOWN_HOSTS: join(workDir, 'absent-pin-2') });

    // A refusal an operator cannot act on invites deleting the check instead of
    // fixing the pin, which is the one outcome this guard cannot survive.
    expect(r.stderr).toMatch(/lightsail get-instance-access-details/);
    expect(r.stderr).toMatch(/FOOTBAG_KNOWN_HOSTS/);
  });
});

describe('a pin other accounts could rewrite is not a pin', () => {
  it('refuses a world-writable pin and reports the mode it found', () => {
    const pin = writePin('loose-pin', 0o666);
    const r = runPinCheck({ FOOTBAG_KNOWN_HOSTS: pin });

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('666');
    expect(r.optsLines).toEqual([]);
  });

  it('refuses a group-writable pin', () => {
    const pin = writePin('group-writable-pin', 0o660);
    const r = runPinCheck({ FOOTBAG_KNOWN_HOSTS: pin });

    expect(r.exitCode).not.toBe(0);
    expect(r.optsLines).toEqual([]);
  });

  it.each([0o600, 0o644, 0o400, 0o444])('accepts mode %s', (mode) => {
    const pin = writePin(`ok-pin-${mode.toString(8)}`, mode);
    const r = runPinCheck({ FOOTBAG_KNOWN_HOSTS: pin });

    expect(r.exitCode).toBe(0);
  });
});

describe('an accepted pin produces options that fail closed', () => {
  it('refuses an unknown host and reads the pin alone', () => {
    const pin = writePin('good-pin', 0o600);
    const r = runPinCheck({ FOOTBAG_KNOWN_HOSTS: pin });

    expect(r.exitCode).toBe(0);
    // StrictHostKeyChecking=yes refuses an unknown host instead of learning it,
    // and pointing UserKnownHostsFile at the pin alone stops the operator's own
    // trust-on-first-use history vouching for a host the pin does not carry.
    expect(r.optsLines).toEqual([
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      `UserKnownHostsFile=${pin}`,
    ]);
  });

  it('takes the override in preference to the operator home default', () => {
    const pin = writePin('override-pin', 0o600);
    const r = runPinCheck({ FOOTBAG_KNOWN_HOSTS: pin });

    expect(r.exitCode).toBe(0);
    expect(r.optsLines).toContain(`UserKnownHostsFile=${pin}`);
    expect(r.optsLines).not.toContain(
      `UserKnownHostsFile=${join(emptyHome, 'AWS/footbag_known_hosts')}`,
    );
  });
});
