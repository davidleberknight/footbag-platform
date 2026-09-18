/**
 * The two human-operator permission sets, and the properties of them whose
 * failure mode is silence.
 *
 * Nobody has assumed either role yet, so every defect here surfaces for the
 * first time as an AccessDenied partway through an apply that has already
 * changed part of the estate, in the words of whichever tool hit it first. A
 * terraform plan that dies on a refresh reads as a broken credential; a rotation
 * call refused on a key created seconds earlier reads as an eventual-consistency
 * fault. Neither points at the policy, which is why these are asserted from the
 * source rather than discovered.
 *
 * The statements are read out of the HCL as text. That is deliberate: this file
 * is the project's own, its shape is chosen here rather than by any external
 * tool, and rendering the policy for real would need an initialized tree and a
 * credential, which the suite is built to have neither of.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SSO_TF = resolve(__dirname, '../../terraform/identity/sso.tf');
const source = readFileSync(SSO_TF, 'utf-8');

/**
 * One statement's text, from its Sid to the brace that closes it. Reading a
 * statement whole rather than grepping the file keeps an assertion about one
 * statement from being satisfied by a grant that lives in another.
 */
function statement(sid: string): string {
  // terraform fmt aligns `=` within a block, so the run of spaces after `Sid`
  // varies with the longest key in that statement. Matching on the value is what
  // survives a statement gaining or losing a key.
  const at = source.search(new RegExp(`Sid\\s+= "${sid}"`));
  expect(at, `no statement carries the Sid ${sid}`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(at);
  const end = rest.search(/\n {6}\}/);
  expect(end, `the ${sid} statement is never closed`).toBeGreaterThan(0);
  return rest.slice(0, end);
}

/** The statement names one permission set's inline policy actually lists. */
function carries(role: 'super_admin' | 'dev_tester'): string[] {
  const head = source.indexOf(
    `resource "aws_ssoadmin_permission_set_inline_policy" "${role}"`,
  );
  expect(head, `no inline policy for ${role}`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(head);
  const end = rest.search(/\n\}/);
  const block = rest.slice(0, end);
  return [...block.matchAll(new RegExp(`local\\.role_statements\\.${role}\\.(\\w+)`, 'g'))].map(
    (m) => m[1],
  );
}

/** One role's entry in the scope map, which is the whole of what it may reach. */
function scope(role: 'super_admin' | 'dev_tester'): string {
  const at = source.search(new RegExp(`^ {4}${role} = \\{`, 'm'));
  expect(at, `no scope entry for ${role}`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(at);
  const end = rest.search(/\n {4}\}/);
  expect(end, `the ${role} scope is never closed`).toBeGreaterThan(0);
  return rest.slice(0, end);
}

describe('the operator policies grant what a terraform plan actually calls', () => {
  it('carries CloudWatch tag access, which every wildcarded service beside it gets free', () => {
    // CloudWatch is the one service in its statement enumerated action by action,
    // so anything absent is ungranted. Both environments set default_tags on
    // every provider block, which puts tags on every alarm in both trees, and
    // reading an alarm back reads its tags: without these the plan fails on the
    // refresh rather than on the change.
    const s = statement('ProjectScopedServices');
    expect(s).toContain('cloudwatch:ListTagsForResource');
    expect(s).toContain('cloudwatch:TagResource');
    expect(s).toContain('cloudwatch:UntagResource');
  });

  it('lets a key be rotated in the window before it has an alias to be matched by', () => {
    // The kms grant is conditioned on an alias the key does not carry until its
    // own alias resource is created, so the calls terraform makes in between are
    // denied. Rotation is the one that always happens: every key in both trees
    // enables it, and the call lands on a key that is still anonymous.
    const s = statement('CallsThatCarryNoResource');
    expect(s).toContain('kms:EnableKeyRotation');
    expect(s).toContain('kms:GetKeyRotationStatus');
    expect(s).toContain('kms:DescribeKey');
  });

  it('keeps seizing and destroying a key behind the alias condition', () => {
    // The counterweight to the case above. Widening the unconditioned list far
    // enough to cover a key's whole lifecycle would let an operator take over or
    // schedule the deletion of any key in the account, including one this project
    // never named, which is a larger grant than the window is worth.
    const s = statement('CallsThatCarryNoResource');
    expect(s).not.toContain('kms:PutKeyPolicy');
    expect(s).not.toContain('kms:ScheduleKeyDeletion');
  });
});

describe('the operator policies deny without blinding the checks that watch them', () => {
  it('leaves the generated role readable while denying every write to it', () => {
    // The generated role's name suffix cannot be predicted, so both runtime trust
    // policies name it literally and a standing gate reads it back to prove they
    // still match. Denying iam:* outright takes that read away, and a recreated
    // permission set then goes unnoticed: the trust reads correctly, the plan
    // shows no diff, and the failure arrives later as an AssumeRole that refuses.
    const s = statement('NeverTouchTheGeneratedSsoRoles');
    expect(s).toContain('Effect    = "Deny"');
    expect(s).toContain('NotAction = ["iam:Get*", "iam:List*", "iam:Simulate*"]');
    expect(s).not.toMatch(/Action\s+=\s+"iam:\*"/);
  });

  it('denies the same way over the directly authenticated identity', () => {
    // The two denials are one rule about two resources, so they are asserted
    // together: if one is ever narrowed to an enumerated action list, the other
    // is the record of why that shape was wrong.
    const s = statement('NeverTouchTheSuperAdminIdentity');
    expect(s).toContain('NotAction = ["iam:Get*", "iam:List*", "iam:Simulate*"]');
  });
});

describe('the dev-and-tester role is the super-admin role minus what its job does not need', () => {
  it('shares every statement it carries with the wider role, and carries fewer', () => {
    // This is the property the whole shape exists for: the narrower policy is
    // assembled from the same statement definitions rather than written beside
    // the wider one, so a grant added to a statement reaches both and cannot be
    // added to one alone. A statement the narrower role carried and the wider one
    // did not would mean the two had started to diverge.
    const wide = carries('super_admin');
    const narrow = carries('dev_tester');
    expect(wide.length).toBeGreaterThan(0);
    expect(narrow.length).toBeGreaterThan(0);
    const extra = narrow.filter((s) => !wide.includes(s) && s !== 'never_reach_a_host_shell');
    expect(extra, 'the narrower role carries a statement the wider one does not').toEqual([]);
    expect(narrow.length).toBeLessThan(wide.length);
  });

  it('does not carry the roster, the account controls or the hosted zone', () => {
    // Hiring and firing, the account's own posture, and DNS all belong to the job
    // that carries the whole estate. Staging attaches no custom domain at all, so
    // nothing in its tree touches the zone.
    const narrow = carries('dev_tester');
    expect(narrow).not.toContain('onboard_an_operator');
    expect(narrow).not.toContain('account_baseline_controls');
    expect(narrow).not.toContain('the_one_hosted_zone');
  });

  it('is denied the one call that opens a shell on a host', () => {
    // Lightsail supports no resource-level permission, so the production host
    // cannot be put out of this role's reach by scoping. This call mints the
    // short-lived certificate that lands on the default login account, which has
    // passwordless sudo, so denying it is what keeps a non-super-admin off the
    // production host. The wider role keeps it: that job includes the way back in.
    expect(carries('dev_tester')).toContain('never_reach_a_host_shell');
    expect(carries('super_admin')).not.toContain('never_reach_a_host_shell');
    const s = statement('NeverMintHostAccessDetails');
    expect(s).toContain('Effect   = "Deny"');
    expect(s).toContain('lightsail:GetInstanceAccessDetails');
  });

  it('reaches only staging-named resources, and only the staging runtime role', () => {
    // Everything that can be narrowed by name is, which is why the denial above
    // is needed for the one service where it cannot be.
    const narrow = scope('dev_tester');
    expect(narrow).toContain('arn:aws:s3:::footbag-staging-*');
    expect(narrow).toContain('parameter/footbag/staging/*');
    expect(narrow).toContain('alias/footbag-staging-*');
    expect(narrow).toContain('role/footbag-staging-*');
    expect(narrow).toContain('footbag-staging-app-runtime');
    expect(narrow).not.toContain('footbag-production-app-runtime');
    // The estate-wide globs belong to the wider role only. A bare `footbag-*`
    // here would quietly restore production reach through every scoped statement
    // at once, and nothing else in this file would look different.
    expect(narrow).not.toContain('arn:aws:s3:::footbag-*');
    expect(narrow).not.toContain('parameter/footbag/*');
    expect(narrow).not.toContain('alias/footbag-*"');
  });

  it('reaches the terraform state bucket only under the staging key', () => {
    // The state bucket belongs to no environment, so it is the one resource the
    // name pattern cannot narrow. Listing is allowed because the S3 backend lists
    // before it reads; the objects are scoped to the staging prefix.
    const narrow = scope('dev_tester');
    expect(narrow).toContain('arn:aws:s3:::footbag-terraform-state-*/staging/*');
    expect(narrow).not.toContain('arn:aws:s3:::footbag-terraform-state-*/*"');
  });
});
