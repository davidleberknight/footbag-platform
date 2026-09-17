/**
 * scripts/verify-account-baseline.sh — reading the account-level controls that
 * nothing else re-asserts.
 *
 * Four of these are console steps with no Terraform behind them, so nothing
 * detects one being turned off and nothing notices one that was never turned on;
 * the lockdown checklist is the only record they were meant to exist. The
 * quarterly access review has the mirror problem: it told an operator to read
 * each key's last-used date in a console, so the review happened only if
 * somebody remembered where to look.
 *
 * Everything here is a read, so the whole script is drivable. What is pinned is
 * that each control is genuinely checked rather than assumed, that a partially
 * configured control counts as a failure, and that the script exits non-zero on
 * a finding so it can gate rather than only report.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/verify-account-baseline.sh');

interface Estate {
  publicAccessBlock?: string | null;
  passwordPolicy?: { min: number; reuse: number } | null;
  analyzers?: string | null;
  alternateContact?: string | null;
  rootMfa?: string;
  rootKeys?: string;
  users?: string | null;
}

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-baseline-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** A healthy account, which each case then spoils in exactly one way. */
const HEALTHY: Required<Estate> = {
  publicAccessBlock: 'True\tTrue\tTrue\tTrue',
  passwordPolicy: { min: 14, reuse: 5 },
  analyzers: 'footbag-account-analyzer',
  alternateContact: 'ops@example.invalid',
  rootMfa: '1',
  rootKeys: '0',
  users: 'footbag-operator',
};

function awsStub(estate: Estate): string {
  const e = { ...HEALTHY, ...estate };
  const path = join(workDir, 'aws-stub.sh');
  const pwPolicy =
    e.passwordPolicy === null
      ? '    exit 1'
      : `    printf '%s' ${JSON.stringify(
          JSON.stringify({
            PasswordPolicy: {
              MinimumPasswordLength: e.passwordPolicy.min,
              PasswordReusePrevention: e.passwordPolicy.reuse,
            },
          }),
        )}`;
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'case "$2" in',
      '  get-caller-identity) echo 111122223333 ;;',
      `  get-public-access-block) ${
        e.publicAccessBlock === null ? 'exit 1' : `printf '%s\\n' ${JSON.stringify(e.publicAccessBlock)}`
      } ;;`,
      '  get-account-password-policy)',
      pwPolicy,
      '    ;;',
      `  list-analyzers) ${
        e.analyzers === null ? 'exit 1' : `printf '%s\\n' ${JSON.stringify(e.analyzers)}`
      } ;;`,
      `  get-alternate-contact) ${
        e.alternateContact === null ? 'exit 1' : `printf '%s\\n' ${JSON.stringify(e.alternateContact)}`
      } ;;`,
      '  get-account-summary)',
      `    printf '%s' ${JSON.stringify(
        JSON.stringify({
          SummaryMap: { AccountMFAEnabled: Number(e.rootMfa), AccountAccessKeysPresent: Number(e.rootKeys) },
        }),
      )}`,
      '    ;;',
      `  list-users) ${e.users === null ? 'exit 1' : `printf '%s\\n' ${JSON.stringify(e.users)}`} ;;`,
      "  list-access-keys) printf 'AKIAEXAMPLE\\tActive\\t2026-03-13T00:00:00Z\\n' ;;",
      '  get-access-key-last-used) printf \'2026-09-16T00:00:00Z\\n\' ;;',
      'esac',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

function run(estate: Estate = {}, args: string[] = []) {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      // The run settles and proves its identity before reading the account.
      ...awsIdentityStubEnv(workDir),
      ACCOUNT_BASELINE_AWS_BIN: awsStub(estate),
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

describe('verify-account-baseline.sh — a healthy account', () => {
  it('passes with no findings', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/No findings/);
  });

  it('reports every key with its age and last use, which is the review evidence', () => {
    const r = run();
    expect(r.stdout).toMatch(/AKIAEXAMPLE/);
    expect(r.stdout).toMatch(/age \d+d/);
    expect(r.stdout).toMatch(/last 2026-09-16/);
  });

  it('reports rather than judges whether a key should be rotated', () => {
    // The rotation rule is evidence-driven and the trigger is a human's call. A
    // script that failed on key age would be reintroducing the calendar rule
    // the project deliberately does not use.
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/rotation triggers/);
  });
});

describe('verify-account-baseline.sh — each control is genuinely checked', () => {
  it('fails when the account public-access block is absent', () => {
    const r = run({ publicAccessBlock: null });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/public access block is not configured/);
  });

  it('fails when the public-access block is only partly on', () => {
    // Three of four is not a backstop. A bucket created later inherits
    // whatever this says, which is the case the control exists for.
    const r = run({ publicAccessBlock: 'True\tTrue\tFalse\tTrue' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/settings switched off/);
  });

  it('fails when there is no password policy at all', () => {
    const r = run({ passwordPolicy: null });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no IAM account password policy/);
  });

  it('fails a password policy that is set but too weak', () => {
    const r = run({ passwordPolicy: { min: 8, reuse: 0 } });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/minimum length is 8/);
    expect(r.stderr).toMatch(/does not prevent password reuse/);
  });

  it('fails when no Access Analyzer is active', () => {
    const r = run({ analyzers: '' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no active IAM Access Analyzer/);
  });

  it('filters on analyzer type, not just on status', () => {
    // The console offers two kinds and only one answers this question. An
    // unused-access analyzer reports unused roles and permissions, which is
    // useful and is not external access; passing on it would report the
    // control as in place while the mistake it exists to catch went unwatched.
    const script = readFileSync(join(process.cwd(), 'scripts/verify-account-baseline.sh'), 'utf-8');
    expect(script).toMatch(/type==`ACCOUNT`/);
    expect(script).toMatch(/type==`ORGANIZATION`/);
    expect(script).not.toMatch(/analyzers\[\?status==`ACTIVE`\]\.name/);
  });

  it('fails each unset alternate contact separately', () => {
    // Unset means a notice of that kind reaches only the root mailbox, and
    // nobody is told if it goes unread.
    const r = run({ alternateContact: 'None' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/alternate contact BILLING is unset/);
    expect(r.stderr).toMatch(/alternate contact OPERATIONS is unset/);
    expect(r.stderr).toMatch(/alternate contact SECURITY is unset/);
  });

  it('fails when root has no MFA', () => {
    const r = run({ rootMfa: '0' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/root has NO MFA/);
  });

  it('fails when root holds an access key', () => {
    // A root access key bypasses every guard rail in the account.
    const r = run({ rootKeys: '1' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/root holds 1 access key/);
  });
});

describe('verify-account-baseline.sh — how it behaves', () => {
  it('refuses when no identity resolves, rather than reporting everything absent', () => {
    // Otherwise a dead credential produces a full sheet of failures and sends
    // the operator to fix controls that are perfectly fine.
    const stub = join(workDir, 'dead.sh');
    writeFileSync(stub, '#!/usr/bin/env bash\nexit 1\n', 'utf-8');
    chmodSync(stub, 0o755);
    const res = spawnSync('bash', [SCRIPT], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        ...awsIdentityStubEnv(workDir),
        ACCOUNT_BASELINE_AWS_BIN: stub,
      },
      ...SPAWN_GUARD,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/could not resolve an identity/);
  });

  it('names where three of the four controls actually belong', () => {
    const r = run({ rootMfa: '0' });
    expect(r.stderr).toMatch(/shared Terraform tree/);
    expect(r.stderr).toMatch(/alternate contacts are the genuine exception/);
  });

  it('prints only failures under --quiet', () => {
    const r = run({ rootMfa: '0' }, ['--quiet']);
    expect(r.stdout).not.toMatch(/PASS/);
    expect(r.stderr).toMatch(/FAIL/);
  });

  it('announces the stub, because stubbed evidence is worth nothing', () => {
    expect(run().stderr).toMatch(/SYNTHETIC:.*proves nothing about the account/);
  });

  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run({}, ['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });
});
