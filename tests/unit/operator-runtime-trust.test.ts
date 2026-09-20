/**
 * Which human principals each environment's runtime role trusts, and the
 * boundary between the two that nothing else in the estate would report.
 *
 * Staging's runtime role trusts the shared job role, because the reads a
 * deploy makes are that job. Production's does not, and that asymmetry is the
 * whole of what stops somebody whose work is staging from reaching the thing
 * the public is served.
 *
 * It is asserted from the configuration here as well as from the account,
 * because the two failures are different and only one of them has a live
 * check. The standing account gate compares what AWS actually holds, which
 * catches a principal added by hand; this catches a principal added to the
 * Terraform, which is the version that would then be applied deliberately and
 * survive every subsequent apply. A production tree that merely REGAINED the
 * variable would show up here and nowhere else, because a variable nothing
 * sets produces no diff and no error.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function tree(env: 'staging' | 'production', file: string): string {
  return readFileSync(resolve(__dirname, `../../terraform/${env}/${file}`), 'utf-8');
}

const STAGING_IAM = tree('staging', 'iam.tf');
const STAGING_VARS = tree('staging', 'variables.tf');
const PRODUCTION_IAM = tree('production', 'iam.tf');
const PRODUCTION_VARS = tree('production', 'variables.tf');

/**
 * The first assume-role trust document in a tree, which is the app runtime
 * role's. Read whole rather than grepped, so a principal found in it is a
 * principal that role actually trusts rather than one mentioned anywhere in
 * the file.
 */
function firstTrustDocument(source: string): string {
  const at = source.indexOf('assume_role_policy = jsonencode({');
  expect(at, 'no assume_role_policy in this tree').toBeGreaterThanOrEqual(0);
  const rest = source.slice(at);
  const end = rest.indexOf('\n  })');
  expect(end, 'the trust document is never closed').toBeGreaterThan(0);
  return rest.slice(0, end);
}

describe('staging trusts the shared job role', () => {
  it('declares the variable, validated against the one role name it may hold', () => {
    // A free-form string here would accept a role ARN from anywhere, including
    // a role in another account, and the trust would read as correct.
    expect(STAGING_VARS).toMatch(/variable "dev_tester_role_arn"/);
    expect(STAGING_VARS).toContain('^arn:aws:iam::[0-9]{12}:role/FootbagDevTester$');
  });

  it('names it in the runtime role trust', () => {
    expect(firstTrustDocument(STAGING_IAM)).toContain('var.dev_tester_role_arn');
  });

  it('keeps the directly authenticated identity there beside it', () => {
    // The two are not alternatives. The job role is how everyday work is
    // attributed to a person; the directly authenticated user is the way back
    // in when the role is what has broken, and removing it cannot be undone by
    // recreating the user, because a recreated user is a different principal.
    expect(firstTrustDocument(STAGING_IAM)).toContain(':user/footbag-operator');
  });

  it('declares no reserved-SSO principal anywhere', () => {
    expect(STAGING_IAM).not.toMatch(/AWSReservedSSO/);
    expect(STAGING_VARS).not.toMatch(/AWSReservedSSO/);
    expect(STAGING_VARS).not.toMatch(/sso_role_arn/);
  });
});

describe('production trusts no human job role at all', () => {
  it('declares no variable that could name one', () => {
    // Asserted on the variable rather than only on the trust document, because
    // a variable is how the principal would arrive. One declared and unset
    // produces no plan diff and no error, so it would sit there until somebody
    // set it, and nothing would have reported its return.
    expect(PRODUCTION_VARS).not.toMatch(/variable "dev_tester_role_arn"/);
    expect(PRODUCTION_VARS).not.toMatch(/variable "super_admin_sso_role_arn"/);
    expect(PRODUCTION_VARS).not.toMatch(/variable "dev_tester_sso_role_arn"/);
  });

  it('names no job role in the runtime trust', () => {
    const trust = firstTrustDocument(PRODUCTION_IAM);
    expect(trust).not.toContain('dev_tester_role_arn');
    expect(trust).not.toContain('FootbagDevTester');
  });

  it('names no FootbagDevTester ARN anywhere in the tree', () => {
    // Belt and braces, and the braces matter: the trust document above is the
    // app runtime role's, and this tree declares other roles. A grant reaching
    // any of them from a role bounded to staging is the same failure.
    expect(PRODUCTION_IAM).not.toMatch(/FootbagDevTester/);
  });

  it('keeps the directly authenticated identity, which is the only human path', () => {
    // With no job role trusted here, this is how a person reaches production
    // at all. Its absence would not fail a plan; it would fail the next
    // production deploy, at the moment that is least welcome.
    expect(firstTrustDocument(PRODUCTION_IAM)).toContain(':user/footbag-operator');
  });

  it('declares no reserved-SSO principal anywhere', () => {
    expect(PRODUCTION_IAM).not.toMatch(/AWSReservedSSO/);
    expect(PRODUCTION_VARS).not.toMatch(/AWSReservedSSO/);
  });
});
