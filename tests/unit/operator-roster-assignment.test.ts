/**
 * The roster, and the one field in it that decides whether a person can reach
 * production.
 *
 * Which permission set somebody holds is the whole of the split between the two
 * human-operator jobs. Getting it wrong is silent in both directions: assigning
 * the wider set to a dev-and-tester grants production with no error anywhere,
 * and the only place it shows is in a trail nobody reads until something has
 * already been changed. Nothing downstream can catch it either, because an
 * assignment that succeeded looks exactly like an assignment that was meant.
 *
 * The roster is read out of the HCL as text, for the same reason the policies
 * are: rendering it for real needs an initialized tree, a credential and the
 * private values file, and the suite is built to have none of those.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TREE = resolve(__dirname, '../../terraform/operators');
const variables = readFileSync(resolve(TREE, 'variables.tf'), 'utf-8');
const roster = readFileSync(resolve(TREE, 'roster.tf'), 'utf-8');
const example = readFileSync(resolve(TREE, 'terraform.tfvars.example'), 'utf-8');

/** The body of one resource or variable block, from its header to the brace that closes it. */
function block(source: string, header: string): string {
  const at = source.indexOf(header);
  expect(at, `no block headed ${header}`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(at);
  const end = rest.search(/\n\}/);
  expect(end, `the ${header} block is never closed`).toBeGreaterThan(0);
  return rest.slice(0, end);
}

describe('a roster entry names the job it is for', () => {
  it('will not accept a person without a role', () => {
    // An optional role would have to default to something, and either default is
    // wrong: defaulting wide grants production to whoever was added in a hurry,
    // defaulting narrow leaves a super admin unable to do the job they were
    // added for and looks like a broken sign-in rather than a missing field.
    expect(block(variables, 'variable "operators"')).toContain('role        = string');
  });

  it('refuses a role no permission set answers to', () => {
    // A misspelling here would otherwise reach the assignment as a lookup on a
    // map of two, where it fails with a key error naming neither the person nor
    // the field. Refusing it in the variable names both.
    const declared = block(variables, 'variable "operators"');
    expect(declared).toContain('contains(["super_admin", "dev_tester"], o.role)');
  });
});

describe('the assignment follows the roster entry, not a single wired-in role', () => {
  it('reads both permission sets and picks between them per person', () => {
    expect(roster).toContain('super_admin = data.terraform_remote_state.identity');
    expect(roster).toContain('dev_tester  = data.terraform_remote_state.identity');
    const assignment = block(roster, 'resource "aws_ssoadmin_account_assignment" "operator"');
    expect(assignment).toContain('local.permission_set_arns[each.value.role]');
  });

  it('gives no operator a permission set the roster did not ask for', () => {
    // The failure this guards is one line long: an assignment that names a
    // permission set output directly hands every person on the roster the same
    // role, and a dev-and-tester listed as such still gets production.
    const assignment = block(roster, 'resource "aws_ssoadmin_account_assignment" "operator"');
    expect(assignment).not.toContain('super_admin_permission_set_arn');
    expect(assignment).not.toContain('dev_tester_permission_set_arn');
  });
});

describe('the reference values file shows what a real one must carry', () => {
  it('gives every entry a role, and shows both of them', () => {
    // The example is what a second operator copies when they add somebody. An
    // entry without a role there teaches the shape that the variable then
    // refuses, and an example showing only one role reads as though the field
    // were decoration.
    const entries = [...example.matchAll(/given_name\s+=/g)].length;
    const roles = [...example.matchAll(/^\s+role\s+= "/gm)].length;
    expect(entries).toBeGreaterThan(1);
    expect(roles).toBe(entries);
    expect(example).toContain('role        = "super_admin"');
    expect(example).toContain('role        = "dev_tester"');
  });
});
