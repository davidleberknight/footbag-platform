/**
 * Which From addresses production's runtime role may send as, and the guard
 * that stops one going missing.
 *
 * The role's send permission is bounded by a condition built from a list of
 * permitted From addresses. That list REPLACES the default rather than
 * extending it: once it holds anything, those addresses are the only ones the
 * role may send as. So an address left out of it is not an apply error but an
 * authorisation denial at the outbox drain, minutes after the sender was told
 * the message went out, and reported against a recipient identity rather than
 * against the sender. Two addresses have to be in it -- the environment's own
 * sender, or all transactional mail is refused, and the community announce
 * list's own from address, or every community announcement is refused.
 *
 * The list itself lives in the values file, which is a gitignored symlink into
 * the maintainers' private checkout, so nothing here can read it and the guard
 * that can is a plan-time precondition. What this file asserts is that the
 * precondition is still in the tree and still names the address the database
 * actually seeds: the announce address is a literal in two places that no
 * mechanism keeps in step, and changing one without the other puts the
 * denial back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function repoFile(relative: string): string {
  return readFileSync(resolve(__dirname, '../..', relative), 'utf-8');
}

const PRODUCTION_IAM = repoFile('terraform/production/iam.tf');
const PRODUCTION_TFVARS_EXAMPLE = repoFile('terraform/production/terraform.tfvars.example');
const SCHEMA = repoFile('database/schema.sql');

/**
 * The runtime role's inline policy, read as one block, so an assertion about
 * its preconditions is about that resource rather than about anything else the
 * file happens to declare.
 */
function runtimePolicyResource(): string {
  const at = PRODUCTION_IAM.indexOf('resource "aws_iam_role_policy" "app_jwt_ses"');
  expect(at, 'the runtime role policy is not declared in this tree').toBeGreaterThanOrEqual(0);
  const rest = PRODUCTION_IAM.slice(at);
  const end = rest.indexOf('\n}\n');
  expect(end, 'the runtime role policy block is never closed').toBeGreaterThan(0);
  return rest.slice(0, end);
}

/**
 * The from address the community announce list is seeded with, taken from the
 * schema rather than written down here, so this file cannot drift from it in
 * the same way the Terraform can.
 */
function seededAnnounceFromIdentity(): string {
  const at = SCHEMA.indexOf("'announce', 'Community Announcements'");
  expect(at, 'the community announce list is not seeded in this schema').toBeGreaterThanOrEqual(0);
  const row = SCHEMA.slice(at, SCHEMA.indexOf(');', at));
  const address = /'([^']+@[^']+)'/.exec(row);
  expect(address, 'the seeded announce list carries no from address').not.toBeNull();
  return address![1]!;
}

describe('the announce list seed', () => {
  it('carries its own from address', () => {
    expect(seededAnnounceFromIdentity()).toBe('announce@footbag.org');
  });
});

describe("production's permitted-sender preconditions", () => {
  it('refuse a list that leaves out the sender identity', () => {
    expect(runtimePolicyResource()).toContain(
      'contains(local.ses_from_addresses, var.ses_sender_identity)',
    );
  });

  it('refuse a list that leaves out the address the announce list sends from', () => {
    expect(runtimePolicyResource()).toContain(
      `contains(local.ses_from_addresses, "${seededAnnounceFromIdentity()}")`,
    );
  });
});

describe('the production values example', () => {
  it('sets the permitted list rather than leaving it to the empty default', () => {
    expect(PRODUCTION_TFVARS_EXAMPLE).toMatch(/^ses_permitted_from_addresses\s*=\s*\[/m);
  });

  it('names the canonical sender and the announce address in it', () => {
    const at = PRODUCTION_TFVARS_EXAMPLE.indexOf('ses_permitted_from_addresses');
    const list = PRODUCTION_TFVARS_EXAMPLE.slice(at, PRODUCTION_TFVARS_EXAMPLE.indexOf(']', at));
    expect(list).toContain('"noreply@footbag.org"');
    expect(list).toContain(`"${seededAnnounceFromIdentity()}"`);
  });
});
