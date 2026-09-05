/**
 * Break AWS credential resolution for every process a test spawns.
 *
 * Tests spawn real operator scripts, and several of those scripts write to live
 * AWS: a parameter, a marker, a credential. On continuous integration that is
 * harmless, because there are no credentials to find. On a maintainer's
 * workstation, which is where these suites are most often run, the ambient
 * profile is a real operator identity with write access to both environments, so
 * a test case that reaches the write succeeds against real infrastructure.
 *
 * That is not hypothetical. A case proving a file-mode check passes had to get
 * past every local refusal to be meaningful, so it reached the AWS call and
 * overwrote a live Google Safe Browsing key in staging's Parameter Store with
 * its own fixture value. The suite reported twenty passes. The damage surfaced
 * later, as a smoke test failing against Google with an unhelpful status code.
 *
 * Pointing every credential source at nothing means such a call cannot
 * authenticate. The local refusals are still exercised exactly as before, and
 * the case that gets past them fails at the AWS boundary instead of crossing it.
 * Spread this into the `env` of every spawn a test makes.
 *
 * `AWS_EC2_METADATA_DISABLED` matters as much as the rest: without it the SDK
 * falls through to the instance metadata endpoint, which on a developer machine
 * is a slow timeout rather than a refusal, and on any AWS-hosted runner is a
 * live credential source.
 */
export const NO_AWS_CREDENTIALS = {
  AWS_PROFILE: 'footbag-test-nonexistent-profile',
  AWS_CONFIG_FILE: '/dev/null',
  AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
  AWS_ACCESS_KEY_ID: '',
  AWS_SECRET_ACCESS_KEY: '',
  AWS_SESSION_TOKEN: '',
  AWS_EC2_METADATA_DISABLED: 'true',
  AWS_REGION: 'us-east-1',
} as const;
