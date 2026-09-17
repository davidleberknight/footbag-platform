/**
 * scripts/lib/aws-profile.sh — the operator's AWS identity, supplied by the
 * tooling rather than by the operator.
 *
 * An operator workstation carries one named profile and no default section, so
 * a fresh terminal has no AWS identity at all and the first command needing one
 * fails with the SDK's words about locating credentials. Asking the operator to
 * export a variable in every new shell puts a step in a person's head that has
 * to be repeated in every terminal, and it is recorded in the operations
 * reference as a common cause of failure partway through a bring-up.
 *
 * What is pinned here:
 *
 *   - an identity the operator already chose is never overridden, whether that
 *     is a profile or a whole key pair in the environment;
 *   - half a key pair is not an identity and is cleared from the run: nothing
 *     can sign with it, and the SDK prefers it over the profile, so leaving it
 *     in place fails every AWS call in the run with words about the SDK rather
 *     than about the stale variable that caused it;
 *   - a shell with no identity gets the operator profile, exported for the run;
 *   - whichever identity the run ends up with is resolved against AWS once
 *     before any work is done, and what it resolved to is printed: a configured
 *     profile is not an authenticating one, and a credential that has been
 *     rotated away or has expired would otherwise be reported by whatever tool
 *     reached AWS first, in that tool's vocabulary;
 *   - a machine with no such profile is refused, and the refusal names the
 *     command that installs one rather than leaving the SDK to explain;
 *   - the run says which identity it is using, once, not once per read;
 *   - a stubbed AWS binary says so, because a stubbed run proves nothing about
 *     the workstation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const LIB = join(process.cwd(), 'scripts/lib/aws-profile.sh');

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-awsprofile-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** What the stub says when asked to resolve an identity. */
type StubIdentity = { arn?: string; refuses?: string };

const STUB_ARN = 'arn:aws:iam::000000000000:user/footbag-operator';

/**
 * An `aws` stub answering the two questions the library asks: which profiles
 * are configured, and what the identity resolves to. Both answers are in the
 * contracted shape the callers ask for -- one profile name per line, and the
 * bare ARN that `--query Arn --output text` returns -- so a fixture cannot
 * mislead a parser about a format AWS is free to change.
 *
 * A refusal is passed through rather than parsed: the library reports whatever
 * AWS said, so the words only have to be on stderr and the exit non-zero.
 */
function awsStub(profiles: string[], identity: StubIdentity = {}): string {
  const path = join(workDir, 'aws-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'if [[ -n "${AWS_STUB_LOG:-}" ]]; then printf \'%s\\n\' "$*" >> "$AWS_STUB_LOG"; fi',
      'if [[ "$1" == "configure" && "$2" == "list-profiles" ]]; then',
      ...profiles.map((p) => `  printf '%s\\n' ${JSON.stringify(p)}`),
      '  exit 0',
      'fi',
      'if [[ "$1" == "sts" && "$2" == "get-caller-identity" ]]; then',
      ...(identity.refuses
        ? [`  printf '%s\\n' ${JSON.stringify(identity.refuses)} >&2`, '  exit 255']
        : [`  printf '%s\\n' ${JSON.stringify(identity.arn ?? STUB_ARN)}`, '  exit 0']),
      'fi',
      'echo "unexpected aws invocation: $*" >&2',
      'exit 64',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

/**
 * Both seams pointed at one stub. The library asks the profile question through
 * `AWS_PROFILE_BIN` and the identity question through `AWS_IDENTITY_BIN`, so a
 * case that stubbed one of them would reach the real AWS CLI for the other.
 */
function stubEnv(profiles: string[], identity: StubIdentity = {}): Record<string, string> {
  const bin = awsStub(profiles, identity);
  return { AWS_PROFILE_BIN: bin, AWS_IDENTITY_BIN: bin };
}

/**
 * Sources the library in a shell carrying exactly the environment given, runs
 * the body, and returns what it printed. The ambient environment is deliberately
 * NOT spread in: this library's whole subject is what it does when the shell
 * carries no AWS identity, and the suite's own isolation sets one.
 */
function withLib(body: string, env: Record<string, string>) {
  const script = join(workDir, 'driver.sh');
  writeFileSync(
    script,
    ['#!/usr/bin/env bash', 'set -uo pipefail', `source "${LIB}"`, body, ''].join('\n'),
    'utf-8',
  );
  const res = spawnSync('bash', [script], {
    encoding: 'utf-8',
    env: { PATH: process.env.PATH ?? '', HOME: workDir, ...env },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

describe('aws_profile_ensure leaves a chosen identity alone', () => {
  it('does not override a profile the operator exported', () => {
    const r = withLib('aws_profile_ensure; echo "profile=$AWS_PROFILE"', {
      AWS_PROFILE: 'somebody-elses-profile',
      ...stubEnv(['footbag-operator']),
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('profile=somebody-elses-profile');
    expect(r.stderr).toMatch(/taken from your environment/);
  });

  it('does not supply a profile when the shell carries a whole key pair', () => {
    const r = withLib(
      'aws_profile_ensure; echo "profile=${AWS_PROFILE:-none}"; echo "key=${AWS_ACCESS_KEY_ID:-none}"',
      {
        AWS_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE12',
        AWS_SECRET_ACCESS_KEY: 'examplesecretexamplesecretexamplesecret1',
        ...stubEnv(['footbag-operator']),
      },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('profile=none');
    expect(r.stdout).toContain('key=AKIAEXAMPLEEXAMPLE12');
    expect(r.stderr).not.toMatch(/half an AWS key pair/);
  });

  it('leaves the session token of a whole key pair alone', () => {
    const r = withLib('aws_profile_ensure; echo "token=${AWS_SESSION_TOKEN:-none}"', {
      AWS_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE12',
      AWS_SECRET_ACCESS_KEY: 'examplesecretexamplesecretexamplesecret1',
      AWS_SESSION_TOKEN: 'example-session-token',
      ...stubEnv(['footbag-operator']),
    });
    expect(r.stdout).toContain('token=example-session-token');
  });
});

describe('aws_profile_ensure treats half a key pair as no identity', () => {
  it('clears an access key id with no secret and supplies the profile instead', () => {
    const r = withLib(
      'aws_profile_ensure; echo "profile=${AWS_PROFILE:-none}"; echo "key=${AWS_ACCESS_KEY_ID:-none}"',
      {
        AWS_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE12',
        ...stubEnv(['footbag-operator']),
      },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('key=none');
    expect(r.stdout).toContain('profile=footbag-operator');
    expect(r.stderr).toMatch(/half an AWS key pair: AWS_SECRET_ACCESS_KEY was not/);
  });

  it('clears a secret with no access key id the same way', () => {
    const r = withLib(
      'aws_profile_ensure; echo "profile=${AWS_PROFILE:-none}"; echo "secret=${AWS_SECRET_ACCESS_KEY:-none}"',
      {
        AWS_SECRET_ACCESS_KEY: 'examplesecretexamplesecretexamplesecret1',
        ...stubEnv(['footbag-operator']),
      },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('secret=none');
    expect(r.stdout).toContain('profile=footbag-operator');
    expect(r.stderr).toMatch(/half an AWS key pair: AWS_ACCESS_KEY_ID was not/);
  });

  it('clears the session token with the half pair it belonged to', () => {
    const r = withLib('aws_profile_ensure; echo "token=${AWS_SESSION_TOKEN:-none}"', {
      AWS_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE12',
      AWS_SESSION_TOKEN: 'example-session-token',
      ...stubEnv(['footbag-operator']),
    });
    expect(r.stdout).toContain('token=none');
  });

  it('clears it for the child processes that do the AWS work', () => {
    const r = withLib(
      'aws_profile_ensure; bash -c \'echo "child_key=${AWS_ACCESS_KEY_ID:-none} child_profile=${AWS_PROFILE:-none}"\'',
      {
        AWS_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE12',
        ...stubEnv(['footbag-operator']),
      },
    );
    expect(r.stdout).toContain('child_key=none child_profile=footbag-operator');
  });

  it('still refuses when the half pair is cleared and no operator profile exists', () => {
    const r = withLib('aws_profile_ensure; echo "rc=$?"', {
      AWS_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE12',
      ...stubEnv(['some-unrelated-profile']),
    });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('bash scripts/install-operator-key.sh');
  });
});

describe('aws_profile_ensure fills a vacuum', () => {
  it('exports the operator profile when the shell has no AWS identity', () => {
    const r = withLib('aws_profile_ensure; echo "profile=$AWS_PROFILE"', {
      ...stubEnv(['footbag-operator', 'some-other-profile']),
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('profile=footbag-operator');
    expect(r.stderr).toMatch(/supplied by this script/);
  });

  it('exports it so a child process inherits it', () => {
    const r = withLib('aws_profile_ensure; bash -c \'echo "child=$AWS_PROFILE"\'', {
      ...stubEnv(['footbag-operator']),
    });
    expect(r.stdout).toContain('child=footbag-operator');
  });

  it('matches the profile name exactly, not as a substring', () => {
    const r = withLib('aws_profile_ensure || echo "refused"', {
      ...stubEnv(['footbag-operator-old', 'not-footbag-operator']),
    });
    expect(r.stdout).toContain('refused');
  });
});

describe('aws_profile_ensure proves the identity it settles on', () => {
  it('says which identity the profile it supplied resolved to', () => {
    const r = withLib('aws_profile_ensure', {
      ...stubEnv(['footbag-operator'], { arn: 'arn:aws:iam::000000000000:user/somebody' }),
    });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/supplied by this script/);
    expect(r.stderr).toContain('arn:aws:iam::000000000000:user/somebody');
  });

  it('proves an identity the shell supplied too, rather than trusting it', () => {
    const r = withLib('aws_profile_ensure', {
      AWS_PROFILE: 'somebody-elses-profile',
      ...stubEnv(['footbag-operator'], { arn: 'arn:aws:iam::000000000000:user/somebody' }),
    });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/taken from your environment/);
    expect(r.stderr).toContain('arn:aws:iam::000000000000:user/somebody');
  });

  it('refuses when the profile exists but no longer authenticates', () => {
    const r = withLib('aws_profile_ensure; echo "rc=$?"', {
      ...stubEnv(['footbag-operator'], {
        refuses:
          'An error occurred (InvalidClientTokenId) when calling the ' +
          'GetCallerIdentity operation: The security token included in the ' +
          'request is invalid.',
      }),
    });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('did not authenticate against AWS');
    expect(r.stderr).toContain('InvalidClientTokenId');
    expect(r.stderr).toContain('bash scripts/install-operator-key.sh');
  });

  it('does not leave a profile exported that failed to authenticate', () => {
    const r = withLib('aws_profile_ensure || true; echo "profile=${AWS_PROFILE:-none}"', {
      ...stubEnv(['footbag-operator'], { refuses: 'could not be found' }),
    });
    expect(r.stdout).toContain('profile=none');
  });

  it('asks AWS once however many times the run asks for an identity', () => {
    const log = join(workDir, 'aws-calls.log');
    const r = withLib('aws_profile_ensure; aws_profile_ensure; aws_profile_ensure', {
      AWS_STUB_LOG: log,
      ...stubEnv(['footbag-operator']),
    });
    expect(r.status).toBe(0);
    const resolves = readFileSync(log, 'utf-8')
      .split('\n')
      .filter((line) => line.startsWith('sts get-caller-identity'));
    expect(resolves).toHaveLength(1);
  });
});

describe('aws_profile_ensure refuses rather than guessing', () => {
  it('names the installer when no operator profile exists on the machine', () => {
    const r = withLib('aws_profile_ensure; echo "rc=$?"', {
      ...stubEnv(['some-unrelated-profile']),
    });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toMatch(/no AWS profile named 'footbag-operator'/);
    expect(r.stderr).toContain('bash scripts/install-operator-key.sh');
  });

  it('refuses when the AWS binary cannot be run at all', () => {
    const r = withLib('aws_profile_ensure; echo "rc=$?"', {
      AWS_PROFILE_BIN: join(workDir, 'no-such-binary'),
    });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toMatch(/no AWS profile named/);
  });
});

describe('what the run says about itself', () => {
  it('announces the identity once, however many times it is asked', () => {
    const r = withLib('aws_profile_ensure; aws_profile_ensure; aws_profile_ensure', {
      ...stubEnv(['footbag-operator']),
    });
    const announcements = (r.stderr.match(/AWS identity:/g) ?? []).length;
    expect(announcements).toBe(1);
  });

  it('says on stderr when the AWS binary is stubbed', () => {
    const r = withLib('aws_profile_ensure', {
      ...stubEnv(['footbag-operator']),
    });
    expect(r.stderr).toMatch(/the AWS binary is stubbed for this run/);
  });
});

describe('the terraform reader settles the identity before reading', () => {
  it('refuses the read, with a reason, when no identity can be had', () => {
    const script = join(workDir, 'tfdriver.sh');
    writeFileSync(
      script,
      [
        '#!/usr/bin/env bash',
        'set -uo pipefail',
        `source "${join(process.cwd(), 'scripts/lib/terraform-output.sh')}"`,
        'tf_output_read /nowhere lightsail_static_ip; echo "rc=$?"',
        'echo "err=${TF_OUTPUT_ERROR}"',
        '',
      ].join('\n'),
      'utf-8',
    );
    const res = spawnSync('bash', [script], {
      encoding: 'utf-8',
      env: {
        PATH: process.env.PATH ?? '',
        HOME: workDir,
        ...stubEnv(['some-unrelated-profile']),
        TMPDIR: workDir,
      },
      ...SPAWN_GUARD,
    });
    expect(res.stdout).toContain('rc=1');
    expect(res.stdout).toContain('err=no AWS identity is available for this read');
    expect(res.stderr).toContain('bash scripts/install-operator-key.sh');
  });
});
