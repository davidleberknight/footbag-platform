/**
 * scripts/lib/aws-identity.sh and scripts/lib/secret-file.sh — the two shared
 * helpers that had no direct coverage.
 *
 * Both are small and both are load-bearing. `aws_identity_require_chain` is the
 * guard standing between an operator and deactivating a key that something
 * still depends on; `secret_file_destroy` is what stops a credential surviving
 * on disk after a run that did not finish. Neither had a suite of its own: they
 * were exercised only incidentally through the scripts that call them, which
 * means a change to either could go green while breaking the property the
 * caller relies on.
 *
 * What is pinned is the refusal in each case, because that is what these exist
 * for. A zero exit from the AWS CLI is not the identity being right, and an
 * unlink is not a secret being gone.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';

const IDENTITY_LIB = join(process.cwd(), 'scripts/lib/aws-identity.sh');
const SECRET_LIB = join(process.cwd(), 'scripts/lib/secret-file.sh');

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-identity-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * An aws stub answering get-caller-identity per profile. A profile absent from
 * the map fails, which is how "this profile does not resolve at all" is driven.
 */
function awsStub(arns: Record<string, string>): string {
  const path = join(workDir, 'aws-stub.sh');
  const cases = Object.entries(arns)
    .map(([profile, arn]) => `    ${profile}) printf '%s\\n' ${JSON.stringify(arn)};;`)
    .join('\n');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'profile=""',
      'prev=""',
      'for a in "$@"; do',
      '  if [ "$prev" = "--profile" ]; then profile="$a"; fi',
      '  prev="$a"',
      'done',
      'case "$profile" in',
      cases,
      '  *) echo "An error occurred: the config profile could not be found" >&2; exit 255;;',
      'esac',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

function runIdentity(body: string, arns: Record<string, string>) {
  const res = spawnSync(
    'bash',
    ['-c', `set -uo pipefail; source "${IDENTITY_LIB}"; AWS_IDENTITY_BIN="${awsStub(arns)}"; ${body}`],
    { encoding: 'utf-8', env: { ...process.env, ...NO_AWS_CREDENTIALS }, ...SPAWN_GUARD },
  );
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const OPERATOR = 'arn:aws:iam::111122223333:user/footbag-operator';
const STAGING_ROLE = 'arn:aws:sts::111122223333:assumed-role/footbag-staging-app-runtime/s';
const PRODUCTION_ROLE = 'arn:aws:sts::111122223333:assumed-role/footbag-production-app-runtime/p';

describe('aws_identity_require_user', () => {
  it('accepts the profile that resolves to the expected user', () => {
    const r = runIdentity('aws_identity_require_user p footbag-operator; echo "rc=$?"', {
      p: OPERATOR,
    });
    expect(r.stdout).toContain('rc=0');
    expect(r.stdout).toContain('user/footbag-operator');
  });

  it('refuses a profile that resolves to somebody else', () => {
    // A zero exit from the CLI with an unexpected ARN is the case this exists
    // to catch: the profile works, and it is not who the operator believes they
    // are holding. Acting on that identity's success proves nothing about the
    // one being changed.
    const r = runIdentity('aws_identity_require_user p footbag-operator; echo "rc=$?"', {
      p: 'arn:aws:iam::111122223333:user/somebody-else',
    });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toMatch(/is not user\/footbag-operator/);
    expect(r.stderr).toMatch(/proves nothing/);
  });

  it('refuses a profile that does not resolve at all, and shows what AWS said', () => {
    const r = runIdentity('aws_identity_require_user missing footbag-operator; echo "rc=$?"', {
      p: OPERATOR,
    });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toMatch(/could not resolve an identity at all/);
    expect(r.stderr).toMatch(/profile could not be found/);
  });

  it('does not match a user whose name merely ends with the expected one', () => {
    // `*:user/footbag-operator` must not be satisfied by `user/not-footbag-operator`.
    const r = runIdentity('aws_identity_require_user p footbag-operator; echo "rc=$?"', {
      p: 'arn:aws:iam::111122223333:user/not-footbag-operator',
    });
    expect(r.stdout).toContain('rc=1');
  });
});

/**
 * The same demand asked of the identity a run has already settled, rather than
 * of a profile name. Two callers need it: administering a human operator's
 * identity, and applying the tree that declares what a human operator may do.
 * Both are refused to every role, including the job role operators use for
 * everyday work, because a role is denied every write to its own definition —
 * so a run started that way fails partway through rather than at the door, and
 * leaves half a change behind.
 */
describe('aws_identity_require_direct_user', () => {
  it('accepts the directly authenticated user the caller named', () => {
    const r = runIdentity(
      `AWS_IDENTITY_ARN=${OPERATOR}; aws_identity_require_direct_user footbag-operator; echo "rc=$?"`,
      { p: OPERATOR },
    );
    expect(r.stdout, r.stderr).toContain('rc=0');
  });

  it('refuses an assumed role, and says why a role cannot do this at all', () => {
    const r = runIdentity(
      [
        'AWS_IDENTITY_ARN=arn:aws:sts::111122223333:assumed-role/FootbagDevTester/someone',
        'aws_identity_require_direct_user footbag-operator; echo "rc=$?"',
      ].join('; '),
      { p: OPERATOR },
    );
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toMatch(/is an assumed role/);
    expect(r.stderr).toMatch(/denied every write to its own definition/);
    expect(r.stderr).toMatch(/Nothing done/);
  });

  it('refuses a different directly authenticated user', () => {
    const r = runIdentity(
      [
        'AWS_IDENTITY_ARN=arn:aws:iam::111122223333:user/somebody-else',
        'aws_identity_require_direct_user footbag-operator; echo "rc=$?"',
      ].join('; '),
      { p: OPERATOR },
    );
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toMatch(/is not user\/footbag-operator/);
    expect(r.stderr).not.toMatch(/assumed role/);
  });

  it('does not match a user whose name merely ends with the expected one', () => {
    const r = runIdentity(
      [
        'AWS_IDENTITY_ARN=arn:aws:iam::111122223333:user/not-footbag-operator',
        'aws_identity_require_direct_user footbag-operator; echo "rc=$?"',
      ].join('; '),
      { p: OPERATOR },
    );
    expect(r.stdout).toContain('rc=1');
  });

  it('resolves the identity itself when the run has not settled one yet', () => {
    // The caller may reach the account through a profile the shared helper
    // settled, or through keys exported into the shell. Neither hands this a
    // profile name it can trust, so an unresolved run asks AWS rather than
    // refusing for want of an argument.
    const r = runIdentity(
      'AWS_PROFILE=p; aws_identity_require_direct_user footbag-operator; echo "rc=$?"',
      { p: OPERATOR },
    );
    expect(r.stdout, r.stderr).toContain('rc=0');
  });

  it('refuses when the identity cannot be resolved at all', () => {
    const r = runIdentity(
      'AWS_PROFILE=missing; aws_identity_require_direct_user footbag-operator; echo "rc=$?"',
      { p: OPERATOR },
    );
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toMatch(/did not authenticate against AWS/);
  });
});

describe('aws_identity_require_chain', () => {
  it('accepts when every named profile assumes a role', () => {
    const r = runIdentity('aws_identity_require_chain a b; echo "rc=$?"', {
      a: STAGING_ROLE,
      b: PRODUCTION_ROLE,
    });
    expect(r.stdout).toContain('rc=0');
  });

  it('refuses a chained profile that returns its own source identity', () => {
    // The failure this is really for: the profile resolves, so nothing errors,
    // but it came back as the user rather than an assumed role -- which means
    // the assume-role step did not happen and the role's permissions were never
    // in play.
    const r = runIdentity('aws_identity_require_chain a b; echo "rc=$?"', {
      a: STAGING_ROLE,
      b: OPERATOR,
    });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toMatch(/is not an assumed role/);
    expect(r.stderr).toMatch(/assume-role step did not happen/);
  });

  it('checks every profile rather than stopping at the first failure', () => {
    // An operator fixing one and rediscovering the next is a slower loop than
    // being shown both at once.
    const r = runIdentity('aws_identity_require_chain a b; echo "rc=$?"', {
      a: OPERATOR,
      b: OPERATOR,
    });
    expect(r.stderr.match(/FAIL/g)?.length).toBe(2);
  });

  it('says why both environments are checked, not just the one to hand', () => {
    const r = runIdentity('aws_identity_require_chain a b; echo "rc=$?"', {
      a: STAGING_ROLE,
      b: OPERATOR,
    });
    expect(r.stderr).toMatch(/the chain that matters at cutover/);
  });

  it('fails when a chained profile does not resolve at all', () => {
    const r = runIdentity('aws_identity_require_chain a missing; echo "rc=$?"', {
      a: STAGING_ROLE,
    });
    expect(r.stdout).toContain('rc=1');
  });
});

describe('aws_identity_resolve', () => {
  it('resolves a named profile and hands the ARN to its caller', () => {
    // It reports nothing itself: the caller is the one that knows how to say
    // which identity the run is using.
    const r = runIdentity('aws_identity_resolve p; echo "rc=$?"; echo "arn=$AWS_IDENTITY_ARN"', {
      p: OPERATOR,
    });
    expect(r.stdout).toContain('rc=0');
    expect(r.stdout).toContain(`arn=${OPERATOR}`);
  });

  it('asks about the ambient chain when given no profile', () => {
    const r = runIdentity('aws_identity_resolve; echo "rc=$?"; echo "arn=$AWS_IDENTITY_ARN"', {
      '""': OPERATOR,
    });
    expect(r.stdout).toContain('rc=0');
    expect(r.stdout).toContain(`arn=${OPERATOR}`);
  });

  it('accepts whatever principal answers, which the other two deliberately do not', () => {
    // This one runs before ordinary work, where the question is only whether
    // the credential still authenticates. The everyday profile answers as an
    // assumed role, not as a user, so a principal pinned here would refuse the
    // identity almost every run legitimately carries.
    const r = runIdentity('aws_identity_resolve p; echo "rc=$?"', {
      p: STAGING_ROLE,
    });
    expect(r.stdout).toContain('rc=0');
  });

  it('refuses when nothing resolves, naming the profile and what AWS said', () => {
    const r = runIdentity('aws_identity_resolve missing; echo "rc=$?"', { p: OPERATOR });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toMatch(/the profile 'missing' did not authenticate/);
    expect(r.stderr).toMatch(/profile could not be found/);
  });

  it('names the environment rather than a profile when it was asked about the chain', () => {
    const r = runIdentity('aws_identity_resolve; echo "rc=$?"', { p: OPERATOR });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toMatch(/credentials in your environment did not authenticate/);
  });

  it('leaves no stale ARN behind after a refusal', () => {
    const r = runIdentity(
      'aws_identity_resolve p; aws_identity_resolve missing || true; echo "arn=${AWS_IDENTITY_ARN:-none}"',
      { p: OPERATOR },
    );
    expect(r.stdout).toContain('arn=none');
  });
});

describe('secret_file_destroy', () => {
  function runSecret(body: string) {
    const res = spawnSync('bash', ['-c', `set -uo pipefail; source "${SECRET_LIB}"; ${body}`], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }

  it('removes the file', () => {
    const f = join(workDir, 'secret');
    writeFileSync(f, 'a-live-credential\n', 'utf-8');
    const r = runSecret(`secret_file_destroy "${f}"; echo "rc=$?"`);
    expect(r.stdout).toContain('rc=0');
    expect(existsSync(f)).toBe(false);
  });

  it('removes several in one call', () => {
    const a = join(workDir, 'a');
    const b = join(workDir, 'b');
    writeFileSync(a, 'x', 'utf-8');
    writeFileSync(b, 'y', 'utf-8');
    runSecret(`secret_file_destroy "${a}" "${b}"`);
    expect(existsSync(a)).toBe(false);
    expect(existsSync(b)).toBe(false);
  });

  it('succeeds on a path that no longer exists', () => {
    // The normal case after a successful rename. A cleanup trap must not have
    // to know how far the run got, or every caller grows a conditional.
    const r = runSecret(`secret_file_destroy "${join(workDir, 'never-existed')}"; echo "rc=$?"`);
    expect(r.stdout).toContain('rc=0');
  });

  it('succeeds on an empty path, so an unset variable is harmless', () => {
    // Callers pass "$SOME_VAR" from a trap that may fire before the variable
    // was ever set. An empty argument must be a no-op rather than an error, and
    // must certainly not be treated as a path.
    const r = runSecret('secret_file_destroy ""; echo "rc=$?"');
    expect(r.stdout).toContain('rc=0');
  });

  it('does not remove a directory handed to it by mistake', () => {
    // `shred -u` and `rm -f` both refuse a directory, and this asserts the
    // helper does not reach for anything recursive to compensate.
    const d = join(workDir, 'a-directory');
    mkdirSync(d);
    const r = runSecret(`secret_file_destroy "${d}"; echo "rc=$?"`);
    expect(r.stdout).toContain('rc=0');
    expect(existsSync(d), 'a directory must survive').toBe(true);
  });

  it('shreds before unlinking, rather than only unlinking', () => {
    // An unlink leaves the blocks readable until they are reused. shred is best
    // effort on a journalling filesystem and still strictly better, and the
    // fallback matters more than the guarantee: a system without shred must end
    // up with the file gone rather than the script dying under set -e holding a
    // live credential on disk.
    const lib = spawnSync('cat', [SECRET_LIB], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout ?? '';
    expect(lib).toMatch(/shred -u/);
    expect(lib).toMatch(/\|\|\s*rm -f/);
  });
});
