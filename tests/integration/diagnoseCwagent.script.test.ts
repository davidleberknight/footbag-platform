/**
 * scripts/diagnose-cwagent.sh — the read-only CloudWatch agent diagnostic.
 *
 * The workstation cannot tell two silences apart: an agent running with no
 * configuration and an agent running with one whose writes are refused look the
 * same from outside, so the diagnostic reaches the host to distinguish them.
 *
 * What is pinned here is the front half, which is all of it that runs on the
 * workstation: the argument guards, and the credential guard. The credential
 * guard is the part worth pinning, because this script's refusal used to name a
 * placeholder rather than a file. A named operator reading that placeholder
 * reaches for the shared account's file, the connection succeeds on their key,
 * and sudo then fails with a message that reads as a broken account rather than
 * as the wrong password. Which file a run needs is a property of the account the
 * alias connects as, so both branches are exercised with that account supplied
 * rather than read from whichever machine the suite happens to run on.
 *
 * The remote half is a root shell on a deployed host and is not reachable from
 * here; a suite that appeared to reach one would have proved nothing about one.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { connectingAs, SHARED_ACCOUNT, NAMED_ACCOUNT } from '../fixtures/sshConfigStub';

const SCRIPT = join(process.cwd(), 'scripts/diagnose-cwagent.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runScript(args: string[], extraEnv: NodeJS.ProcessEnv = {}): RunResult {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: '',
    env: { ...process.env, ...extraEnv },
    ...SPAWN_GUARD,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('diagnose-cwagent.sh — argument validation', () => {
  it('rejects an unknown argument rather than ignoring it', () => {
    const result = runScript(['--bogus']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/unknown argument/);
  });

  it('refuses a target that is neither environment', () => {
    const result = runScript(['--target', 'dev']);
    expect(result.exitCode).toBe(2);
  });

  it('refuses with no target at all rather than defaulting to one', () => {
    const result = runScript([]);
    expect(result.exitCode).toBe(2);
  });

  it('--help prints usage and exits 0', () => {
    const result = runScript(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/diagnose-cwagent\.sh --target/);
  });
});

describe('diagnose-cwagent.sh — the credential it names', () => {
  it('names the shared account file when the alias connects as the shared account', () => {
    const result = runScript(['--target', 'staging'], connectingAs(SHARED_ACCOUNT));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/~\/AWS\/AWS_OPERATOR\.txt/);
  });

  it('names the personal file when the alias connects as a named account', () => {
    // The pasteable line is the whole value of naming a file, and the shared
    // account's file pasted while connected as a person pipes one identity's
    // password into another's sudo.
    const result = runScript(['--target', 'staging'], connectingAs(NAMED_ACCOUNT));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/~\/AWS\/HOST_OPERATOR\.txt/);
    expect(result.stderr).not.toMatch(/~\/AWS\/AWS_OPERATOR\.txt/);
  });

  it('names the production file for a production run, since the hosts differ', () => {
    const result = runScript(['--target', 'production'], connectingAs(NAMED_ACCOUNT));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/~\/AWS\/HOST_OPERATOR_PRODUCTION\.txt/);
  });

  it('names the command to re-run, not only the file', () => {
    const result = runScript(['--target', 'staging'], connectingAs(SHARED_ACCOUNT));
    expect(result.stderr).toMatch(/diagnose-cwagent\.sh --target staging/);
    expect(result.stderr).not.toMatch(/<operator-credential-file>/);
  });

  it('refuses on an empty first line rather than piping it at the host as a password', () => {
    // A password that never arrived is not an empty password: sent on, it
    // reaches sudo as a failed attempt on a deployed host, and the diagnostic
    // reports an authentication problem it caused itself.
    const result = runScript(['--target', 'staging'], connectingAs(NAMED_ACCOUNT));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/expected the host sudo password/);
    expect(result.stdout).not.toMatch(/Diagnosing the CloudWatch agent/);
  });
});
