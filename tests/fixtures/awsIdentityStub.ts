/**
 * An `aws` stub for suites that spawn an operator script.
 *
 * Every script that reaches AWS settles its identity through
 * `scripts/lib/aws-profile.sh` and proves it before doing any work, which asks
 * the CLI two questions: which profiles are configured on this machine, and
 * what the identity resolves to. The suite's own isolation points every
 * credential source at nothing, deliberately, so without an answer to those two
 * a spawned script refuses before it reaches the behaviour under test, and the
 * suite would be testing the refusal instead.
 *
 * Both answers are in the shape the callers contract for: one profile name per
 * line, and the bare ARN that `--query Arn --output text` returns.
 *
 * This grants no access. The ARN is a fixture, nothing stands behind it, and any
 * real AWS call the script goes on to make still fails, so the isolation this
 * sits beside is not weakened by it.
 */
import { writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

/** The identity the stub resolves to, recognisable in output as a fixture. */
export const STUB_OPERATOR_ARN = 'arn:aws:iam::000000000000:user/footbag-operator';

/**
 * The profile a super-admin workstation carries: the directly authenticated
 * IAM user's, which is the one the shared library supplies when a shell has no
 * identity of its own. A dev-and-tester's machine carries their own named
 * profile and the job-role profile instead, and a suite exercising that tier
 * names those itself rather than taking them from here, because the whole
 * point of the second tier is that the names differ per person.
 */
export const STUB_OPERATOR_PROFILES = ['footbag-operator'];

export interface AwsIdentityStubOptions {
  /** Profile names the stub reports as configured. */
  profile?: string | string[];
  /** ARN the identity resolves to. */
  arn?: string;
}

/**
 * Writes the stub into `dir` and returns the two seam variables to spread into
 * a spawn's `env`: the profile check and the identity proof each have their own,
 * and a suite that sets only one reaches the real CLI for the other.
 */
export function awsIdentityStubEnv(
  dir: string,
  { profile = STUB_OPERATOR_PROFILES, arn = STUB_OPERATOR_ARN }: AwsIdentityStubOptions = {},
): Record<string, string> {
  const names = Array.isArray(profile) ? profile : [profile];
  const path = join(dir, 'aws-identity-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'if [[ "$1" == "configure" && "$2" == "list-profiles" ]]; then',
      `  printf '%s\\n' ${names.map((n) => JSON.stringify(n)).join(' ')}`,
      '  exit 0',
      'fi',
      'if [[ "$1" == "sts" && "$2" == "get-caller-identity" ]]; then',
      `  printf '%s\\n' ${JSON.stringify(arn)}`,
      '  exit 0',
      'fi',
      'echo "unexpected aws invocation: $*" >&2',
      'exit 64',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return { AWS_PROFILE_BIN: path, AWS_IDENTITY_BIN: path };
}
