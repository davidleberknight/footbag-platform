/**
 * scripts/rotate-operator-key.sh — the refusals around replacing the human
 * operator's AWS access key.
 *
 * This is the credential an operator's workstation authenticates with and the
 * source identity every chained runtime profile assumes from, so a rotation
 * done wrong breaks both environments at once. The rule for it was written in
 * three documents and the procedure in none, which is how it came to be done by
 * hand at the least welcome moment.
 *
 * The mutating half belongs to an operator with a real account and a real
 * terminal, and is not exercised here. What is pinned is everything that
 * happens before a live key changes state:
 *
 *   - which credentials the run acts through is never defaulted;
 *   - a retirement is refused unless the profile in use resolves to the
 *     identity being rotated, so a key is never cut on the strength of some
 *     other identity's success;
 *   - a retirement is refused unless every chained runtime profile resolves to
 *     an assumed role, on both environments, because proving only staging
 *     leaves untested the chain that matters at cutover;
 *   - a chained profile that returns its own source identity counts as a
 *     failure, since that means the assume-role step did not happen;
 *   - deactivating and deleting each take a typed confirmation.
 *
 * The aws CLI is stubbed through the script's own seam, so nothing here reaches
 * an account.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';

const SCRIPT = join(process.cwd(), 'scripts/rotate-operator-key.sh');

let stubDir: string;

beforeEach(() => {
  stubDir = mkdtempSync(join(tmpdir(), 'footbag-test-rotatekey-'));
});

afterEach(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

/**
 * An aws stub answering the three shapes this script asks for: the caller
 * identity per profile, the key list as id/status rows, and the two mutations.
 * Identities are keyed on the profile name so a test can make one chained
 * profile misbehave while the others succeed.
 */
function awsStub(opts: {
  operatorArn?: string;
  chained?: Record<string, string>;
  keyRows?: string;
} = {}): string {
  const operatorArn = opts.operatorArn ?? 'arn:aws:iam::111122223333:user/footbag-operator';
  const chained = opts.chained ?? {
    'footbag-staging-runtime':
      'arn:aws:sts::111122223333:assumed-role/footbag-staging-app-runtime/s',
    'footbag-production-runtime':
      'arn:aws:sts::111122223333:assumed-role/footbag-production-app-runtime/p',
  };
  const keyRows = opts.keyRows ?? 'AKIAOLD\\tActive\\nAKIANEW\\tActive\\n';
  const path = join(stubDir, 'aws-stub.sh');
  const chainedCases = Object.entries(chained)
    .map(([profile, arn]) => `    ${profile}) echo "${arn}";;`)
    .join('\n');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> "${join(stubDir, 'calls.log')}"`,
      'profile=""',
      'prev=""',
      'for a in "$@"; do',
      '  if [ "$prev" = "--profile" ]; then profile="$a"; fi',
      '  prev="$a"',
      'done',
      'case "$2" in',
      '  get-caller-identity)',
      '    case "$profile" in',
      chainedCases,
      `      *) echo "${operatorArn}";;`,
      '    esac;;',
      `  list-access-keys) printf '%b' "${keyRows}";;`,
      '  update-access-key) exit 0;;',
      '  delete-access-key) exit 0;;',
      'esac',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

function run(args: string[], stubOpts: Parameters<typeof awsStub>[0] = {}) {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      ROTATE_KEY_AWS_BIN: awsStub(stubOpts),
    },
    ...SPAWN_GUARD,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function calls(): string[] {
  const log = join(stubDir, 'calls.log');
  if (!existsSync(log)) return [];
  return readFileSync(log, 'utf-8').trim().split('\n');
}

describe('rotate-operator-key.sh — invocation guards', () => {
  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run(['--profile', 'p', '--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });

  it('refuses without a profile, and says why there is no default', () => {
    const r = run(['--issue']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--profile is required, and there is no default/);
    expect(r.stderr).toMatch(/which account it reaches/);
  });

  it('refuses when no action was named', () => {
    const r = run(['--profile', 'p']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/one of --issue, --retire/);
  });

  it('refuses --retire with no key id', () => {
    const r = run(['--profile', 'p', '--retire']);
    expect(r.status).toBe(2);
  });

  it('prints its own header as help, and exits zero doing it', () => {
    const r = run(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('rotate-operator-key.sh');
    // The refusal list is part of the help, not buried in the body: an
    // operator reading --help should learn what the script will not do.
    expect(r.stdout).toContain('Delete and recreate the user');
  });

  it('says plainly when it is running against a stub', () => {
    const r = run(['--profile', 'p', '--retire', 'AKIAOLD']);
    expect(r.stderr).toContain('SYNTHETIC');
  });
});

describe('rotate-operator-key.sh — what a retirement must prove first', () => {
  it('refuses when the profile resolves to some other identity', () => {
    // Cutting a key because a different identity could authenticate proves
    // nothing about the key being cut.
    const r = run(['--profile', 'p', '--retire', 'AKIAOLD'], {
      operatorArn: 'arn:aws:iam::111122223333:user/somebody-else',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/is not user\/footbag-operator/);
    expect(calls().some((c) => c.includes('update-access-key'))).toBe(false);
  });

  it('refuses when a chained runtime profile cannot be assumed', () => {
    const r = run(['--profile', 'p', '--retire', 'AKIAOLD'], {
      chained: {
        'footbag-staging-runtime':
          'arn:aws:sts::111122223333:assumed-role/footbag-staging-app-runtime/s',
        'footbag-production-runtime': 'arn:aws:iam::111122223333:user/footbag-operator',
      },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/is not an assumed role/);
    expect(r.stderr).toMatch(/the chain that matters at cutover/);
    expect(calls().some((c) => c.includes('update-access-key'))).toBe(false);
  });

  it('checks both environments, not just the one nearest to hand', () => {
    run(['--profile', 'p', '--retire', 'AKIAOLD', '--yes']);
    const identityCalls = calls().filter((c) => c.includes('get-caller-identity'));
    expect(identityCalls.some((c) => c.includes('footbag-staging-runtime'))).toBe(true);
    expect(identityCalls.some((c) => c.includes('footbag-production-runtime'))).toBe(true);
  });

  it('will not deactivate without a confirmation it has no terminal to take', () => {
    const r = run(['--profile', 'p', '--retire', 'AKIAOLD']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no terminal to confirm on/);
    expect(calls().some((c) => c.includes('update-access-key'))).toBe(false);
  });

  it('deactivates once everything is proved and the confirmation is carried', () => {
    const r = run(['--profile', 'p', '--retire', 'AKIAOLD', '--yes']);
    expect(r.status).toBe(0);
    const update = calls().find((c) => c.includes('update-access-key'));
    expect(update).toContain('AKIAOLD');
    expect(update).toContain('Inactive');
  });
});

describe('rotate-operator-key.sh — deletion', () => {
  it('refuses to delete a key that is still active', () => {
    // The refusal belongs to the shared library; what is pinned here is that
    // this script routes through it rather than deleting on its own authority.
    const r = run(['--profile', 'p', '--delete', 'AKIAOLD', '--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/still active/);
    expect(calls().some((c) => c.includes('delete-access-key'))).toBe(false);
  });

  it('deletes one that has already been deactivated', () => {
    const r = run(['--profile', 'p', '--delete', 'AKIAOLD', '--yes'], {
      keyRows: 'AKIAOLD\\tInactive\\nAKIANEW\\tActive\\n',
    });
    expect(r.status).toBe(0);
    expect(calls().some((c) => c.includes('delete-access-key'))).toBe(true);
  });

  it('does not verify identities before a delete, because deactivation already did', () => {
    // The gate that matters is the library's refusal to delete an active key,
    // which cannot be reached without a deactivation having happened first.
    run(['--profile', 'p', '--delete', 'AKIAOLD', '--yes'], {
      keyRows: 'AKIAOLD\\tInactive\\nAKIANEW\\tActive\\n',
    });
    expect(calls().some((c) => c.includes('get-caller-identity'))).toBe(false);
  });
});

describe('rotate-operator-key.sh — what it will not offer', () => {
  it('carries no flag for deleting and recreating the user', () => {
    // AWS resolves a role's trust policy to the user's internal unique id, so a
    // user recreated under the same name refuses every AssumeRole while showing
    // no terraform diff. Both runtime roles name this user, so the blast radius
    // is every environment at once. The absence of the capability is the
    // safeguard; a flag guarded by a warning is not.
    const source = readFileSync(SCRIPT, 'utf-8');
    expect(source).not.toMatch(/delete-user/);
    expect(source).not.toMatch(/create-user/);
    expect(source).toMatch(/NEVER delete and recreate this user/);
  });
});
