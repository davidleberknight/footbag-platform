/**
 * scripts/lib/operator-identity-agreement.sh — one run, one person.
 *
 * A run reaching both a deployed host and AWS chooses its host account and its
 * AWS principal by mechanisms that know nothing about each other: the host
 * account comes from the `User` line of the SSH alias, and the AWS principal is
 * what STS returns for the profile's credential, which the shared library
 * settles and proves. Both halves can succeed while naming
 * different people, and the two trails then record one act under two names,
 * which nobody notices on the day.
 *
 * The properties pinned here are the ones that make this a guard rather than a
 * decoration:
 *
 *   - it fires whichever half settles second, because a check living in one
 *     half is one the other order silently skips;
 *   - it fires only where the AWS half is acting as a person, so work done as
 *     the directly authenticated IAM user footbag-operator and a runtime role's generated
 *     session are not held to any host account;
 *   - the shared host account is not exempt, because acting on AWS as a named
 *     person while acting on the host as the shared account is precisely the
 *     split this exists to stop;
 *   - neither half can be satisfied by a value exported into the shell.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, chmodSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { createScratchDir } from '../fixtures/scratchDir';

const LIB_DIR = join(process.cwd(), 'scripts/lib');
const AGREEMENT_LIB = join(LIB_DIR, 'operator-identity-agreement.sh');
const PROFILE_LIB = join(LIB_DIR, 'aws-profile.sh');
const CREDENTIAL_LIB = join(LIB_DIR, 'operator-credential.sh');

const ACCOUNT = '111122223333';
const PERSON = 'david_leberknight';
const JOB_ROLE_SESSION = `arn:aws:sts::${ACCOUNT}:assumed-role/FootbagDevTester/${PERSON}`;
const SUPER_ADMIN = `arn:aws:iam::${ACCOUNT}:user/footbag-operator`;
const RUNTIME_ROLE = `arn:aws:sts::${ACCOUNT}:assumed-role/footbag-staging-app-runtime/botocore-session-1`;

let workDir: string;

beforeEach(() => {
  workDir = createScratchDir('identity-agreement');
  // operator_credential_select builds a path under the home directory, and the
  // shared isolation points that at nothing on purpose.
  mkdirSync(join(workDir, 'AWS'), { recursive: true });
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * An `ssh` answering only the configuration query, with the account of this
 * suite's choosing. The shared machine isolation puts a refusing stub on PATH
 * so that no test reads this machine's SSH configuration; a suite that needs an
 * alias to resolve supplies its own ahead of it, which is what this is.
 */
function sshStub(user: string): string {
  const bin = join(workDir, 'bin');
  mkdirSync(bin, { recursive: true });
  const path = join(bin, 'ssh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'if [[ "$1" == "-G" ]]; then',
      `  printf 'user %s\\nhostname 203.0.113.10\\n' ${JSON.stringify(user)}`,
      '  exit 0',
      'fi',
      'echo "ssh: this suite stubs only the configuration query" >&2',
      'exit 1',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return bin;
}

function awsStub(arn: string): string {
  const path = join(workDir, 'aws-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'if [[ "$1" == "configure" && "$2" == "list-profiles" ]]; then',
      // Both, because an onboarded workstation carries both and a run that
      // switches identity needs the second one to exist.
      "  printf '%s\\n' footbag-operator FootbagDevTester",
      '  exit 0',
      'fi',
      'if [[ "$1" == "sts" && "$2" == "get-caller-identity" ]]; then',
      // Answered per profile, the way the real CLI does. A stub returning one
      // ARN whatever it is asked cannot tell two identities apart, which is
      // exactly what a run that switches identity needs it to do.
      '  profile=""; prev=""',
      '  for a in "$@"; do',
      '    if [[ "$prev" == "--profile" ]]; then profile="$a"; fi',
      '    prev="$a"',
      '  done',
      '  case "$profile" in',
      `    footbag-operator) printf '%s\\n' ${JSON.stringify(SUPER_ADMIN)} ;;`,
      `    *) printf '%s\\n' ${JSON.stringify(arn)} ;;`,
      '  esac',
      '  exit 0',
      'fi',
      'exit 64',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

interface RunOptions {
  /** Sourced libraries, in the order a caller would source them. */
  sources?: string[];
  /** The account the SSH alias connects as. */
  hostUser?: string;
  /** What the AWS identity resolves to. */
  arn?: string;
  /** Extra environment, for the inherited-value cases. */
  env?: Record<string, string>;
}

function run(body: string, options: RunOptions = {}) {
  const {
    sources = [AGREEMENT_LIB],
    hostUser = PERSON,
    arn = JOB_ROLE_SESSION,
    env = {},
  } = options;
  const stub = awsStub(arn);
  const sourceLines = sources.map((s) => `source ${JSON.stringify(s)};`).join(' ');
  const res = spawnSync('bash', ['-c', `set -uo pipefail; ${sourceLines} ${body}`], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      PATH: `${sshStub(hostUser)}:${process.env.PATH ?? ''}`,
      HOME: workDir,
      AWS_PROFILE_BIN: stub,
      AWS_IDENTITY_BIN: stub,
      ...env,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** Both libraries, which is what a run reaching a host and AWS has sourced. */
const BOTH = [PROFILE_LIB, CREDENTIAL_LIB];

describe('the agreement check compares only when it has both halves', () => {
  it('says nothing and passes when only the AWS half is known', () => {
    const r = run(
      `FOOTBAG_ACTING_AS_PERSON=${PERSON}; operator_identity_agreement_record; echo "rc=$?"`,
    );
    expect(r.stdout).toContain('rc=0');
    expect(r.stderr).toBe('');
  });

  it('says nothing and passes when only the host half is known', () => {
    const r = run(
      `FOOTBAG_ACTING_ON_HOST_AS=${PERSON}; operator_identity_agreement_record; echo "rc=$?"`,
    );
    expect(r.stdout).toContain('rc=0');
    expect(r.stderr).toBe('');
  });

  it('agrees, out loud, when both name the same person', () => {
    const r = run(
      `FOOTBAG_ACTING_AS_PERSON=${PERSON}; FOOTBAG_ACTING_ON_HOST_AS=${PERSON};` +
        ' operator_identity_agreement_record; echo "rc=$?"',
    );
    expect(r.stdout).toContain('rc=0');
    expect(r.stderr).toContain(`identities agree: ${PERSON}`);
  });

  it('says what it found on a disagreement, naming both sides and their sources', () => {
    const r = run(
      `FOOTBAG_ACTING_AS_PERSON=${PERSON}; FOOTBAG_ACTING_ON_HOST_AS=footbag;` +
        ' operator_identity_agreement_record; echo "rc=$?"',
    );
    // Recording never fails: a report has to be able to describe a workstation
    // whose halves disagree rather than die on it.
    expect(r.stdout).toContain('rc=0');
    expect(r.stderr).toMatch(/two different people/);
    expect(r.stderr).toContain(`On AWS it is acting as:   ${PERSON}`);
    expect(r.stderr).toContain('On the host it would be:  footbag');
    expect(r.stderr).toMatch(/trust policy binds/);
    expect(r.stderr).toMatch(/'User' line of the SSH alias/);
  });

  it('refuses the same disagreement where a run is about to act', () => {
    const r = run(
      `FOOTBAG_ACTING_AS_PERSON=${PERSON}; FOOTBAG_ACTING_ON_HOST_AS=footbag;` +
        ' operator_identity_agreement_require; echo "rc=$?"',
    );
    expect(r.stdout).toContain('rc=1');
  });

  it('lets a run act where the two agree, and where only one half is known', () => {
    const agreed = run(
      `FOOTBAG_ACTING_AS_PERSON=${PERSON}; FOOTBAG_ACTING_ON_HOST_AS=${PERSON};` +
        ' operator_identity_agreement_require; echo "rc=$?"',
    );
    const oneSided = run(
      `FOOTBAG_ACTING_AS_PERSON=${PERSON}; operator_identity_agreement_require; echo "rc=$?"`,
    );
    expect(agreed.stdout).toContain('rc=0');
    expect(oneSided.stdout).toContain('rc=0');
  });

  it('reaches one verdict per run rather than one per call', () => {
    const r = run(
      `FOOTBAG_ACTING_AS_PERSON=${PERSON}; FOOTBAG_ACTING_ON_HOST_AS=${PERSON};` +
        ' operator_identity_agreement_record; operator_identity_agreement_record;' +
        ' operator_identity_agreement_record',
    );
    expect(r.stderr.match(/identities agree/g)).toHaveLength(1);
  });

  it('cannot be satisfied by values exported into the shell', () => {
    // A guard an exported variable can answer is not a guard. Both names are
    // assigned unconditionally when the library is sourced.
    const r = run('operator_identity_agreement_record; echo "rc=$?"', {
      env: { FOOTBAG_ACTING_AS_PERSON: 'somebody', FOOTBAG_ACTING_ON_HOST_AS: 'somebody' },
    });
    expect(r.stdout).toContain('rc=0');
    expect(r.stderr).toBe('');
  });
});

describe('the agreement check fires whichever half settles second', () => {
  const HOST_THEN_AWS =
    'operator_credential_select footbag-staging staging >/dev/null;' +
    ' aws_profile_ensure >/dev/null; operator_identity_agreement_require; echo "rc=$?"';
  const AWS_THEN_HOST =
    'aws_profile_ensure >/dev/null;' +
    ' operator_credential_select footbag-staging staging >/dev/null;' +
    ' operator_identity_agreement_require; echo "rc=$?"';

  it('fires when the AWS identity settles after the host account', () => {
    const r = run(HOST_THEN_AWS, { sources: BOTH, hostUser: 'footbag' });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toMatch(/two different people/);
  });

  it('fires when the host account settles after the AWS identity', () => {
    const r = run(AWS_THEN_HOST, { sources: BOTH, hostUser: 'footbag' });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toMatch(/two different people/);
  });

  it('passes in both orders when the two names agree', () => {
    const first = run(HOST_THEN_AWS, { sources: BOTH });
    const second = run(AWS_THEN_HOST, { sources: BOTH });
    expect(first.stdout).toContain('rc=0');
    expect(second.stdout).toContain('rc=0');
    expect(first.stderr).toContain(`identities agree: ${PERSON}`);
    expect(second.stderr).toContain(`identities agree: ${PERSON}`);
  });

  it('lets a lookup succeed where a run about to act would be refused', () => {
    // The workstation report is the caller this protects: it exists to be run
    // on a machine whose setup is half finished, and it must describe that
    // rather than die on it.
    const r = run(
      'operator_credential_select footbag-staging staging >/dev/null;' +
        ' aws_profile_ensure >/dev/null; echo "rc=$?"',
      { sources: BOTH, hostUser: 'footbag' },
    );
    expect(r.stdout).toContain('rc=0');
    expect(r.stderr).toMatch(/two different people/);
  });

  it('refuses through the credential path a run actually acts on', () => {
    // require_operator_credential is what a host-touching run calls before it
    // opens the credential, so the refusal has to land there and not only in
    // the bare comparison.
    writeFileSync(join(workDir, 'AWS', 'HOST_OPERATOR.txt'), 'a-password\n', 'utf-8');
    chmodSync(join(workDir, 'AWS', 'HOST_OPERATOR.txt'), 0o600);
    const r = run(
      'aws_profile_ensure >/dev/null;' +
        ' require_operator_credential footbag-staging staging; echo "rc=$?"',
      { sources: BOTH, hostUser: 'somebody_else' },
    );
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toMatch(/two different people/);
  });
});

describe('the agreement check forgets a verdict about an identity a run has left', () => {
  // Switching from the job role to footbag-operator, with the alias on the
  // shared account. The first pairing genuinely disagrees; the second is the
  // ordinary, legitimate one. A run that kept the first verdict, or the first
  // person, would refuse work it has no business refusing.
  const SWITCH =
    'operator_credential_select footbag-staging staging >/dev/null;' +
    ' aws_profile_use FootbagDevTester "first" >/dev/null 2>&1;' +
    ' aws_profile_use footbag-operator "second" >/dev/null 2>&1;';

  it('clears the person it recorded for the identity it has left', () => {
    const r = run(`${SWITCH} echo "person=${'${FOOTBAG_ACTING_AS_PERSON:-none}'}"`, {
      sources: BOTH,
      hostUser: 'footbag',
      arn: JOB_ROLE_SESSION,
    });
    expect(r.stdout).toContain('person=none');
  });

  it('does not carry the first identity verdict into the second', () => {
    const r = run(`${SWITCH} operator_identity_agreement_require; echo "rc=$?"`, {
      sources: BOTH,
      hostUser: 'footbag',
      arn: JOB_ROLE_SESSION,
    });
    expect(r.stdout).toContain('rc=0');
  });
});

describe('the deploy settles both halves before it ships', () => {
  const DEPLOY = join(process.cwd(), 'scripts/deploy-code.sh');

  /** The identity lines the deploy runs, taken from the file rather than retyped. */
  function deployIdentityBlock(): string {
    return readFileSync(DEPLOY, 'utf-8')
      .split('\n')
      .filter((l) =>
        /^(operator_credential_select |aws_profile_ensure |operator_identity_agreement_require)/.test(
          l,
        ),
      )
      .join('\n');
  }

  it('refuses a failing credential lookup rather than carrying on without the host half', () => {
    // Tolerating it leaves that half empty, after which the comparison passes
    // on nothing at all while an error nobody honoured has already been printed.
    const block = deployIdentityBlock();
    expect(block).toMatch(/operator_credential_select[^\n]*\|\| exit 1/);
    expect(block).not.toMatch(/\|\|\s*true/);
  });

  const runDeployBlock = (options: RunOptions = {}) =>
    run(`REMOTE=footbag-staging; FOOTBAG_ENV=staging\n${deployIdentityBlock()}`, {
      sources: BOTH,
      ...options,
    });

  it('ships when both halves name the same person', () => {
    const r = runDeployBlock({ hostUser: PERSON, arn: JOB_ROLE_SESSION });
    expect(r.status, r.stderr).toBe(0);
  });

  it('refuses before shipping when the two disagree', () => {
    const r = runDeployBlock({ hostUser: 'footbag', arn: JOB_ROLE_SESSION });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/two different people/);
  });

  it('ships for footbag-operator, which is not a person on the AWS side', () => {
    // The everyday case today, and the one a literal reading of the rule would
    // have refused.
    const r = runDeployBlock({ hostUser: 'footbag', arn: SUPER_ADMIN });
    expect(r.status, r.stderr).toBe(0);
  });
});

describe('the agreement check holds only a person to a host account', () => {
  it('leaves footbag-operator alone, which has no session name at all', () => {
    // The identity that provisions and revokes named accounts in the first
    // place. Refusing it would refuse the ordinary path.
    const r = run(
      'aws_profile_ensure >/dev/null;' +
        ' operator_credential_select footbag-staging staging >/dev/null;' +
        ' operator_identity_agreement_require; echo "rc=$?"',
      { sources: BOTH, arn: SUPER_ADMIN, hostUser: PERSON },
    );
    expect(r.stdout).toContain('rc=0');
    expect(r.stderr).not.toMatch(/two different people/);
  });

  it('leaves a runtime role alone, whose session name describes a workload', () => {
    const r = run(
      'aws_profile_ensure >/dev/null;' +
        ' operator_credential_select footbag-staging staging >/dev/null;' +
        ' operator_identity_agreement_require; echo "rc=$?"',
      { sources: BOTH, arn: RUNTIME_ROLE, hostUser: PERSON },
    );
    expect(r.stdout).toContain('rc=0');
    expect(r.stderr).not.toMatch(/two different people/);
  });

  it('does not exempt the shared host account', () => {
    // Acting on AWS as a named person while acting on the host as the shared
    // account is the split this exists to stop, not an allowance.
    const r = run(
      'aws_profile_ensure >/dev/null;' +
        ' operator_credential_select footbag-staging staging >/dev/null;' +
        ' operator_identity_agreement_require; echo "rc=$?"',
      { sources: BOTH, hostUser: 'footbag' },
    );
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('On the host it would be:  footbag');
  });
});
