/**
 * scripts/setup-operator-workstation.sh — the one command a new operator runs.
 *
 * Its whole value is that it REPORTS rather than fails. Each step is either
 * `[ok]` or `[TODO]`, and a `[TODO]` names what to do; the operator fixes those
 * and runs it again. That is only true if no step can abort the run, which is
 * the property most easily lost: the script runs under `set -euo pipefail`, so
 * any check whose command exits non-zero outside a condition kills it halfway
 * down and the operator sees a partial list with no verdict.
 *
 * The case that proved it: `grep -c` PRINTS its count and THEN exits 1 when that
 * count is zero, so a `|| echo 0` fallback produced "0\n0" and the arithmetic
 * that read it died with a bash syntax error — on an EMPTY credential file,
 * which is exactly the state that check exists to catch.
 *
 * So what is pinned here is that a cold machine gets a full report and a verdict,
 * that each individual defect is reported rather than fatal, and that `--check`
 * changes nothing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/setup-operator-workstation.sh');

let fakeHome: string;

function run(args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      HOME: fakeHome,
      // Pointed into the throwaway home so no run can read or write the
      // operator's own pin.
      FOOTBAG_KNOWN_HOSTS: join(fakeHome, 'AWS', 'footbag_known_hosts'),
      ...extraEnv,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/**
 * A stand-in for `ssh -G`, which is how the script learns what an alias resolves
 * to. Real output cannot be arranged from a test: it depends on the developer's
 * own ~/.ssh/config, which is exactly the machine-specific input a test must not
 * take its verdict from.
 *
 * The lines are the ones OpenSSH actually prints, lowercase keyword then value,
 * captured from `ssh -G` on a configured host.
 */
function stubSshOnPath(lines: string[]): NodeJS.ProcessEnv {
  const binDir = join(fakeHome, 'stubbin');
  mkdirSync(binDir, { recursive: true });
  const sshStub = join(binDir, 'ssh');
  writeFileSync(
    sshStub,
    `#!/usr/bin/env bash\nprintf '%s\\n' ${lines.map((l) => JSON.stringify(l)).join(' ')}\nexit 0\n`,
    'utf-8',
  );
  chmodSync(sshStub, 0o755);
  return { PATH: `${binDir}:${process.env.PATH ?? ''}` };
}

const PINNED_ALIAS_LINES = [
  'user footbag',
  'hostname 203.0.113.10',
  'port 2222',
  'identitiesonly yes',
  'stricthostkeychecking yes',
];

/** Everything the run prints, since steps report to both streams. */
function output(r: { stdout: string; stderr: string }): string {
  return `${r.stdout}\n${r.stderr}`;
}

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), 'footbag-test-workstation-'));
});

afterEach(() => {
  rmSync(fakeHome, { recursive: true, force: true });
});

describe('setup-operator-workstation.sh — argument guards', () => {
  it('requires a target rather than defaulting to one', () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--target is required \('staging' or 'production'\)/);
    expect(r.stderr).toMatch(/deliberately no default/);
  });

  it('refuses a target that is neither environment', () => {
    const r = run(['--target', 'prod']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/must be 'staging' or 'production'/);
  });

  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run(['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });
});

describe('setup-operator-workstation.sh — it reports rather than aborting', () => {
  it('reaches a verdict on a cold machine, rather than stopping at the first gap', () => {
    // The whole contract. A machine with nothing set up must still get every
    // section and a closing count, because a partial list with no verdict is
    // indistinguishable from a crash and tells the operator nothing about what
    // else is waiting for them.
    const r = run(['--target', 'staging', '--check']);
    expect(r.status).toBe(1);
    const all = output(r);
    expect(all).toMatch(/Tools the deploy needs/);
    expect(all).toMatch(/AWS profiles/);
    expect(all).toMatch(/SSH alias footbag-staging/);
    expect(all).toMatch(/Operator credential file/);
    expect(all).toMatch(/Pinned host-key file/);
    expect(all).toMatch(/thing\(s\) still to do/);
  });

  it('reports an empty credential file instead of dying on it', () => {
    // The regression this file exists for. `grep -c` on an empty file prints 0
    // and exits 1, so the obvious fallback yielded two lines and the arithmetic
    // reading it was a syntax error, which under `set -e` ends the run.
    mkdirSync(join(fakeHome, 'AWS'), { recursive: true });
    const cred = join(fakeHome, 'AWS', 'AWS_OPERATOR.txt');
    writeFileSync(cred, '', 'utf-8');
    chmodSync(cred, 0o600);

    const r = run(['--target', 'staging', '--check']);
    const all = output(r);
    expect(all).toMatch(/holds 0 non-empty lines/);
    expect(all).not.toMatch(/syntax error/);
    // Still reaches the end, which is what proves it reported rather than died.
    expect(all).toMatch(/thing\(s\) still to do/);
  });

  it('reports a credential file with the wrong mode, and says to rotate as well as fix it', () => {
    // A file that was readable must be assumed to have been read, so the mode is
    // not the whole remedy.
    mkdirSync(join(fakeHome, 'AWS'), { recursive: true });
    const cred = join(fakeHome, 'AWS', 'AWS_OPERATOR.txt');
    writeFileSync(cred, 'a-password\n', 'utf-8');
    chmodSync(cred, 0o644);

    const r = run(['--target', 'staging', '--check']);
    const all = output(r);
    expect(all).toMatch(/has mode 644/);
    expect(all).toMatch(/rotate the password/);
    expect(all).toMatch(/thing\(s\) still to do/);
  });

  it('reports a multi-line credential file, which fails on the host as a wrong password', () => {
    mkdirSync(join(fakeHome, 'AWS'), { recursive: true });
    const cred = join(fakeHome, 'AWS', 'AWS_OPERATOR.txt');
    writeFileSync(cred, 'a-password\nsomething-else\n', 'utf-8');
    chmodSync(cred, 0o600);

    const r = run(['--target', 'staging', '--check']);
    expect(output(r)).toMatch(/holds 2 non-empty lines/);
  });

  it('accepts a well-formed credential file', () => {
    mkdirSync(join(fakeHome, 'AWS'), { recursive: true });
    const cred = join(fakeHome, 'AWS', 'AWS_OPERATOR.txt');
    writeFileSync(cred, 'a-password\n', 'utf-8');
    chmodSync(cred, 0o600);

    const r = run(['--target', 'staging', '--check']);
    expect(output(r)).toMatch(/AWS_OPERATOR\.txt present, one line, mode 600/);
  });

  it('names the production credential file when the target is production', () => {
    // Different hosts, different passwords, so a run for one environment must
    // not report the other environment's file as though it were this one's.
    const r = run(['--target', 'production', '--check']);
    expect(output(r)).toMatch(/AWS_OPERATOR_PRODUCTION\.txt/);
  });
});

// The alias's own host-key settings are deliberately not checked, and there is no
// test for them, because there is nothing to check: the pin is carried by the
// scripts, which pass it on their own command line where it outranks any
// configuration file. An operator's alias does not need to carry it, because no
// operator types a command against these hosts. Every connection on this path is
// made by a script, including the login and sudo proof below.
//
// An earlier version of this file asserted that the alias carried the pin, which
// pushed the fix into the operator's own ~/.ssh/config. That was the wrong end of
// the problem: a runbook handing somebody a raw ssh is the defect, and the answer
// is to remove the raw ssh.
describe('the alias itself must be pinned, not only the deploy scripts', () => {
  it('inspects no host-key setting on the alias, and touches no ssh config', () => {
    // The absence is the contract. Nothing here reads UserKnownHostsFile or
    // StrictHostKeyChecking off the alias, and nothing writes to ~/.ssh/config,
    // because the pin travels with the scripts rather than with the operator's
    // configuration.
    const src = readFileSync(SCRIPT, 'utf-8');
    expect(src).not.toMatch(/userknownhostsfile/i);
    expect(src).not.toMatch(/stricthostkeychecking/i);
    // Naming the file in a message is fine; writing to it is not. What this
    // forbids is a redirection into it, which is how the removed code worked.
    expect(src).not.toMatch(/>>?\s*"?\$?\{?[^"\s]*\.ssh\/config/);
  });

  it('proves the login and the sudo password over a pinned connection instead', () => {
    // What replaced it. The files being present is not the same as the
    // credentials working: a wrong password in a well-formed file passes every
    // other check here and is discovered mid-deploy, after it has been piped to
    // the host. This is also what retired the two hand-typed ssh commands the
    // card used to carry.
    const src = readFileSync(SCRIPT, 'utf-8');
    expect(src).toMatch(/require_pinned_known_hosts/);
    expect(src).toMatch(/FOOTBAG_SSH_PIN_OPTS/);
    expect(src).toMatch(/sudo -k -S -p "" true/);
  });

  it('reports rather than aborts when the credential or the pin is missing', () => {
    // A cold machine must still reach a verdict: this step needs two files that
    // earlier steps are still asking for, so it cannot be a hard failure.
    const env = stubSshOnPath(PINNED_ALIAS_LINES);
    const r = run(['--target', 'staging', '--check'], env);
    const all = output(r);
    expect(all).toMatch(/Login and sudo on footbag-staging/);
    expect(all).toMatch(/cannot prove login and sudo yet/);
    expect(all).toMatch(/thing\(s\) still to do/);
  });
});

describe('setup-operator-workstation.sh — the read-only report', () => {
  it('creates nothing in --check mode, not even the operator folder', () => {
    run(['--target', 'staging', '--check']);
    expect(existsSync(join(fakeHome, 'AWS', 'AWS_OPERATOR.txt'))).toBe(false);
    expect(existsSync(join(fakeHome, 'AWS', 'footbag_known_hosts'))).toBe(false);
  });
});
