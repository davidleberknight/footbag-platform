/**
 * scripts/as-dev-tester.sh — running one command as the shared job role.
 *
 * A footbag-operator holder's workstation carries the footbag-operator profile
 * and the role-assuming profile at the same time, by design, and the shared
 * library fills an empty shell by trying the footbag-operator profile first. So
 * a command meant to exercise the job role, run without a deliberate switch,
 * authenticates as the IAM user footbag-operator, succeeds, and says nothing whatever about what the role is
 * permitted to do. That is the failure this wrapper exists to make impossible,
 * and it is the failure most of the cases below are about: the wrapped command
 * must not start unless the identity that resolved is a session of the role.
 *
 * Two further properties are pinned because breaking either is silent:
 *
 *   - standard input reaches the wrapped command untouched. Several commands
 *     worth wrapping are handed a host sudo password by redirect, and anything
 *     that consumed a line of it here would feed the password to whatever read
 *     next;
 *   - the assertion is about the role the identity resolves to, never about the
 *     name of the profile that was reached for. The two carry the same spelling
 *     by convention, so a check reading the wrong one passes every ordinary run
 *     and fails only where it matters.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, chmodSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { createScratchDir } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/as-dev-tester.sh');

const ROLE = 'FootbagDevTester';
const OPERATOR = 'david_leberknight';
const ROLE_SESSION_ARN = `arn:aws:sts::000000000000:assumed-role/${ROLE}/${OPERATOR}`;
const SUPER_ADMIN_ARN = 'arn:aws:iam::000000000000:user/footbag-operator';

let workDir: string;
let ranMarker: string;
let stdinCapture: string;

beforeEach(() => {
  workDir = createScratchDir('as-dev-tester');
  ranMarker = join(workDir, 'command-ran');
  stdinCapture = join(workDir, 'command-stdin');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * A stand-in for the command being wrapped. It records that it ran at all,
 * which is what the refusal cases assert the absence of, copies whatever
 * standard input it was given, and exits with a status of the caller's
 * choosing so the wrapper's own relaying of it can be checked.
 */
function commandStub(exitCode = 0): string {
  const path = join(workDir, 'wrapped-command.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `printf 'ran with: %s\\n' "$*" > ${JSON.stringify(ranMarker)}`,
      `cat > ${JSON.stringify(stdinCapture)} || true`,
      `exit ${exitCode}`,
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

interface RunOptions {
  /** What the identity resolves to. */
  arn?: string;
  /** Profiles the workstation reports as configured. */
  profiles?: string[];
  /** Overrides for the profile and role constants the shared library owns. */
  profileName?: string;
  roleName?: string;
  /** Fed to the wrapper's standard input. */
  input?: string;
  /** Extra environment, for the exported-key-material case. */
  env?: Record<string, string>;
  /** The --account given, or null for none. Defaults to the session's own name. */
  account?: string | null;
}

function run(args: string[], options: RunOptions = {}) {
  const {
    arn = ROLE_SESSION_ARN,
    profileName = ROLE,
    roleName = ROLE,
    profiles = [profileName, 'footbag-operator'],
    input = '',
    env = {},
    account = OPERATOR,
  } = options;
  const flags = account === null ? [] : ['--account', account];

  return spawnSync('bash', [SCRIPT, ...flags, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input,
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      ...awsIdentityStubEnv(workDir, { profile: profiles, arn }),
      FOOTBAG_DEV_TESTER_PROFILE: profileName,
      FOOTBAG_DEV_TESTER_ROLE: roleName,
      ...env,
    },
    ...SPAWN_GUARD,
  });
}

const didRun = () => existsSync(ranMarker);

describe('as-dev-tester refuses a command it cannot make sense of', () => {
  it('exits 2 with no command at all, saying it is a wrapper rather than a shell switch', () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('no command given');
    expect(r.stderr).toMatch(/lasts for the command it is given/);
  });

  it('exits 2 on a flag of its own that does not exist', () => {
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unknown argument: --target');
    expect(didRun()).toBe(false);
  });

  it('prints its usage and exits 0 on --help, without settling an identity', () => {
    const r = run(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('bash scripts/as-dev-tester.sh --account <name> <command> [args...]');
    // Nothing about an identity: the help text must not need a credential, or a
    // workstation that cannot authenticate cannot read it.
    expect(r.stderr).not.toContain('AWS identity');
  });

  it('refuses a command with no --account, since the default needs no wrapper', () => {
    const cmd = commandStub();
    const r = run([cmd], { account: null });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--account <name> is required');
    expect(didRun()).toBe(false);
  });

  it('refuses an account name the host could not have', () => {
    const r = run([commandStub()], { account: 'Not A Name' });
    expect(r.status).toBe(2);
    expect(didRun()).toBe(false);
  });

  it('runs a command whose own first argument is a hyphen, after --', () => {
    const cmd = commandStub();
    const r = run(['--', cmd, '--target', 'staging']);
    expect(r.status).toBe(0);
    expect(readFileSync(ranMarker, 'utf-8')).toContain('--target staging');
  });
});

describe('as-dev-tester runs the command only as the role', () => {
  it('runs it when the identity is a session of the role, and names the person', () => {
    const cmd = commandStub();
    const r = run([cmd, 'one', 'two']);
    expect(r.status).toBe(0);
    expect(didRun()).toBe(true);
    expect(readFileSync(ranMarker, 'utf-8')).toContain('ran with: one two');
    expect(r.stderr).toContain(`acting as ${ROLE}, session ${OPERATOR}`);
  });

  it('refuses, and does not start the command, when the session belongs to another account', () => {
    // The credentials on the workstation decide the session name, so a command
    // naming someone else would otherwise act as whoever those belong to.
    const cmd = commandStub();
    const r = run([cmd], { account: 'somebody_else' });
    expect(r.status).toBe(1);
    expect(didRun()).toBe(false);
    expect(r.stderr).toContain(`session here is ${OPERATOR}, not somebody_else`);
  });

  it('relays the command own exit status rather than reporting its own success', () => {
    const r = run([commandStub(7)]);
    expect(r.status).toBe(7);
  });

  it('refuses, and does not start the command, when the identity is the IAM user footbag-operator', () => {
    const cmd = commandStub();
    const r = run([cmd], { arn: SUPER_ADMIN_ARN });
    expect(r.status).toBe(1);
    expect(didRun()).toBe(false);
    expect(r.stderr).toContain(SUPER_ADMIN_ARN);
    expect(r.stderr).toMatch(/would otherwise look like success/);
  });

  it('refuses, and does not start the command, for a session of some other role', () => {
    const cmd = commandStub();
    const r = run([cmd], {
      arn: `arn:aws:sts::000000000000:assumed-role/FootbagSomethingElse/${OPERATOR}`,
    });
    expect(r.status).toBe(1);
    expect(didRun()).toBe(false);
    expect(r.stderr).toMatch(/is an assumed role, but not FootbagDevTester/);
  });

  it('refuses a role whose name merely begins with the one wanted', () => {
    // The trailing slash in the match is what separates these two, and without
    // it a longer-named role would be accepted as the role itself.
    const cmd = commandStub();
    const r = run([cmd], {
      arn: `arn:aws:sts::000000000000:assumed-role/${ROLE}Extra/${OPERATOR}`,
    });
    expect(r.status).toBe(1);
    expect(didRun()).toBe(false);
  });

  it('refuses a whole key pair in the environment, which would beat the profile', () => {
    // Exported keys are preferred over every profile, so a run that carried on
    // here would announce one identity and act as another.
    const cmd = commandStub();
    const r = run([cmd], {
      env: {
        AWS_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE99',
        AWS_SECRET_ACCESS_KEY: 'a-secret-that-goes-with-it',
      },
    });
    expect(r.status).toBe(1);
    expect(didRun()).toBe(false);
    expect(r.stderr).toContain('AWS_ACCESS_KEY_ID');
  });

  it('carries on past half a key pair, which cannot authenticate anything', () => {
    // Half a pair is not an identity the operator chose, it is a stale variable,
    // and the SDK would prefer it over the profile and then fail on it. The
    // shared library clears it from this run and says so, which is the opposite
    // case to the refusal above and easy to conflate with it.
    const cmd = commandStub();
    const r = run([cmd], { env: { AWS_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE99' } });
    expect(r.status).toBe(0);
    expect(didRun()).toBe(true);
    expect(r.stderr).toContain('half an AWS key pair');
  });
});

describe('as-dev-tester asserts the role, not the name of the profile it reached for', () => {
  it('accepts a session of the role even where the profile is spelled differently', () => {
    const cmd = commandStub();
    const r = run([cmd], { profileName: 'some-other-profile-name', roleName: ROLE });
    expect(r.status).toBe(0);
    expect(didRun()).toBe(true);
  });

  it('refuses where the profile carries the role name but the identity does not', () => {
    // The case a check reading the profile name would wave through: the profile
    // is spelled exactly like the role and resolves to something else entirely.
    const cmd = commandStub();
    const r = run([cmd], { profileName: ROLE, roleName: ROLE, arn: SUPER_ADMIN_ARN });
    expect(r.status).toBe(1);
    expect(didRun()).toBe(false);
  });
});

describe('as-dev-tester leaves standard input alone', () => {
  it('passes it to the wrapped command byte for byte', () => {
    // The property that matters: commands worth wrapping are handed a host sudo
    // password on this stream by redirect. A wrapper that read a line of it, to
    // prompt or to check anything, would hand the password to whatever read
    // next and echo it on a failed comparison.
    const secretish = 'first-line-of-the-credential-file\nsecond line\n';
    const cmd = commandStub();
    const r = run([cmd], { input: secretish });
    expect(r.status).toBe(0);
    expect(readFileSync(stdinCapture, 'utf-8')).toBe(secretish);
  });

  it('does not echo what it was given', () => {
    const marker = 'a-value-that-must-not-be-echoed';
    const r = run([commandStub()], { input: `${marker}\n` });
    expect(r.stdout).not.toContain(marker);
    expect(r.stderr).not.toContain(marker);
  });
});
