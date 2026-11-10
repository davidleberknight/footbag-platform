/**
 * scripts/terraform-apply-all.sh -- every tree an environment stands on, applied
 * in dependency order by one command.
 *
 * A real run applies live trees, which no test can do. What is pinned here is
 * the sequencing the script owns: the account trees come before the
 * environment, a tree that does not finish stops the run before any later tree
 * is planned, a clean tree costs no prompt, and nothing but one environment can
 * be named. Terraform is a stub that answers each tree's plan from the tree
 * named in its -chdir and logs every call.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/terraform-apply-all.sh');

type Tree = 'shared' | 'identity' | 'staging' | 'production';
interface TreePlan {
  /** Addresses this tree's plan updates; empty means nothing pending. */
  pending?: string[];
  /** Make this tree's plan fail. */
  planFails?: boolean;
  /** A warning line this tree's plan prints while still succeeding. */
  planWarns?: string;
}

let dir: string;
let callLog: string;

beforeEach(() => {
  dir = createScratchDir('tfapplyall');
  callLog = join(dir, 'terraform.log');
});

afterEach(() => {
  removeScratch(dir);
});

function terraformStub(plans: Partial<Record<Tree, TreePlan>>): string {
  const arms = (Object.keys(plans) as Tree[]).map((tree) => {
    const plan = plans[tree]!;
    const json = JSON.stringify({
      variables: {},
      resource_changes: (plan.pending ?? []).map((address) => ({
        address,
        type: address.split('.')[0],
        change: { actions: ['update'], before: null, after: null, after_unknown: {} },
      })),
    });
    return [
      `  */terraform/${tree})`,
      ...(plan.planWarns ? [`    if [ "$verb" = plan ]; then echo ${JSON.stringify(plan.planWarns)}; fi`] : []),
      `    if [ "$verb" = plan ] && ${plan.planFails ? 'true' : 'false'}; then echo "Error: plan failed for ${tree}" >&2; exit 1; fi`,
      `    if [ "$verb" = show ]; then cat <<'PLANJSON'`,
      json,
      'PLANJSON',
      '      exit 0; fi ;;',
    ].join('\n');
  });
  const path = join(dir, 'terraform');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `echo "terraform $*" >> "${callLog}"`,
      'chdir=""; verb=""',
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    -chdir=*) chdir="${arg#-chdir=}" ;;',
      '    init|plan|show|apply) [ -z "$verb" ] && verb="$arg" ;;',
      '  esac',
      'done',
      'case "$chdir" in',
      ...arms,
      'esac',
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    -out=*) printf "saved-plan-body" > "${arg#-out=}" ;;',
      '  esac',
      'done',
      'exit 0',
    ].join('\n') + '\n',
  );
  chmodSync(path, 0o755);
  return path;
}

function run(args: string[], plans: Partial<Record<Tree, TreePlan>> = {}) {
  const tf = terraformStub(plans);
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...awsIdentityStubEnv(dir), TERRAFORM_APPLY_BIN: tf },
    ...SPAWN_GUARD,
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** The trees planned, in the order they were planned. */
function plannedTrees(): string[] {
  if (!existsSync(callLog)) return [];
  return readFileSync(callLog, 'utf-8')
    .split('\n')
    .filter((l) => / plan /.test(l))
    .map((l) => l.match(/-chdir=\S*\/terraform\/(\w+)/)?.[1] ?? '?');
}

const clean = { shared: {}, identity: {}, staging: {}, production: {} };

describe('terraform-apply-all.sh: what it may be pointed at', () => {
  it('refuses to run without a target, rather than choosing an environment', () => {
    const r = run([]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/--target is required/);
    expect(plannedTrees()).toEqual([]);
  });

  it('refuses an account tree as the target, so one is never applied on its own here', () => {
    for (const target of ['shared', 'identity']) {
      const r = run(['--target', target]);
      expect(r.exitCode, target).toBe(2);
      expect(r.stderr, target).toMatch(/--target must be staging or production/);
    }
    expect(plannedTrees()).toEqual([]);
  });

  it('states the order on a dry run and plans nothing', () => {
    const r = run(['--target', 'production', '--dry-run'], clean);
    expect(r.exitCode, r.stderr).toBe(0);
    const steps = r.stdout.match(/--target (\w+) --init --skip-empty-plan/g) ?? [];
    expect(steps.map((s) => s.split(' ')[1])).toEqual(['shared', 'identity', 'production']);
    expect(plannedTrees()).toEqual([]);
  });
});

describe('terraform-apply-all.sh: the sweep', () => {
  it('plans shared, then identity, then the environment, and passes over clean trees without a prompt', () => {
    // Staging's runtime trust names the role identity declares, and every tree
    // keeps its state in the bucket shared owns: out of order, an apply fails or
    // writes a trust AWS refuses.
    const r = run(['--target', 'staging'], clean);
    expect(r.exitCode, r.stdout + r.stderr).toBe(0);
    expect(plannedTrees()).toEqual(['shared', 'identity', 'staging']);
    expect(readFileSync(callLog, 'utf-8').match(/ init/g)).toHaveLength(3);
    for (const tree of ['shared', 'identity', 'staging']) {
      expect(r.stdout).toContain(`Nothing pending in terraform/${tree}. Nothing to apply.`);
      expect(r.stdout).toContain(`${tree}: finished`);
    }
    expect(r.stderr).not.toMatch(/no terminal to confirm on/);
  });

  it('stops at the tree that does not finish, and plans no tree after it', () => {
    const r = run(['--target', 'production'], {
      ...clean,
      identity: { pending: ['aws_iam_policy.dev_tester_staging'] },
    });
    expect(r.exitCode).not.toBe(0);
    // Identity had changes and no terminal to confirm them on, so production,
    // which comes after it, is never touched.
    expect(plannedTrees()).toEqual(['shared', 'identity']);
    expect(r.stderr).toMatch(/terraform\/identity did not finish/);
    expect(r.stderr).toMatch(/Done before it: shared: finished/);
    expect(r.stderr).toMatch(/Not applied: identity production\./);
    expect(readFileSync(callLog, 'utf-8')).not.toMatch(/ apply \//);
  });

  it('names the bootstrap check when the shared tree itself cannot be planned', () => {
    // On a new account the state bucket does not exist yet, and the first
    // shared apply is the bootstrap script's, not this sweep's.
    const r = run(['--target', 'production'], { ...clean, shared: { planFails: true } });
    expect(r.exitCode).not.toBe(0);
    expect(plannedTrees()).toEqual(['shared']);
    expect(r.stderr).toMatch(/bootstrap-shared-state\.sh --check/);
  });

  it('reaches the typed confirmation from a real terminal, rather than refusing it as absent', () => {
    // The wrapper asks only when its output is a terminal. Run behind a pipe it
    // refuses every confirmation as "no terminal", so an operator at a real
    // shell could never apply anything through this command. A pseudo-terminal
    // is the gate the operator passes; the answer given is not APPLY, so nothing
    // is applied.
    const tf = terraformStub({
      ...clean,
      production: { pending: ['aws_iam_role_policy.app_jwt_ses'] },
    });
    const r = spawnSync('script', ['-qec', `bash ${JSON.stringify(SCRIPT)} --target production`, '/dev/null'], {
      env: { ...process.env, ...awsIdentityStubEnv(dir), TERRAFORM_APPLY_BIN: tf },
      input: 'no\n',
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    const out = r.stdout ?? '';
    expect(out).toContain("Type 'APPLY' to apply the plan shown above");
    expect(out).not.toMatch(/no terminal to confirm on/);
    expect(out).toMatch(/terraform\/production did not finish/);
    expect(readFileSync(callLog, 'utf-8')).not.toMatch(/ apply \//);
  });

  /** The closing report's list of errors or warnings, so a case asserts what it lists. */
  const reportList = (stderr: string, heading: 'Errors' | 'Warnings'): string => {
    const at = stderr.search(new RegExp(`^${heading} \\(\\d+\\):$`, 'm'));
    if (at === -1) return '';
    const rest = stderr.slice(at);
    const end = rest.slice(1).search(/^(Errors|Warnings|Proven:|Not proven:|No errors)/m);
    return end === -1 ? rest : rest.slice(0, end + 1);
  };

  // Defect caught: each tree's apply ends with a report of its own, so the
  // outermost run closes on its own summary and a tree's error or warning sits
  // in the middle of the output where nobody reads it.
  it('ends with one closing report that lists the error of the tree that stopped it', () => {
    const r = run(['--target', 'production'], { ...clean, production: { planFails: true } });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.match(/^==== Closing report: /gm)).toHaveLength(1);
    expect(r.stderr).toMatch(/^==== Closing report: terraform-apply-all\.sh ====$/m);
    const errors = reportList(r.stderr, 'Errors');
    expect(errors).toMatch(/terraform-apply\.sh: terraform plan: Error: plan failed for production/);
    // And which tree stopped the sweep, in the sweep's own words.
    expect(errors).toMatch(/^ {2}- terraform\/production did not finish \(exit 1\)/m);
  });

  it('lists a warning a clean tree printed, and still finishes every tree', () => {
    const r = run(['--target', 'staging'], {
      ...clean,
      identity: { planWarns: 'Warning: Deprecated attribute in identity' },
    });
    expect(r.exitCode, r.stderr).toBe(0);
    expect(plannedTrees()).toEqual(['shared', 'identity', 'staging']);
    expect(reportList(r.stderr, 'Warnings')).toMatch(/terraform-apply\.sh: terraform plan: Warning: Deprecated attribute in identity/);
  });

  it('does not name the bootstrap check when a later tree fails', () => {
    const r = run(['--target', 'production'], { ...clean, production: { planFails: true } });
    expect(r.exitCode).not.toBe(0);
    expect(plannedTrees()).toEqual(['shared', 'identity', 'production']);
    expect(r.stderr).toMatch(/terraform\/production did not finish/);
    expect(r.stderr).not.toMatch(/bootstrap-shared-state/);
  });
});

describe('terraform-apply-all.sh --check: nothing pending, proved without applying', () => {
  /** A terraform that answers -detailed-exitcode per tree: 0 empty, 2 changes, 1 failure. */
  function checkStub(codes: Partial<Record<Tree, 0 | 1 | 2>>): string {
    const path = join(dir, 'terraform-check');
    writeFileSync(path, [
      '#!/usr/bin/env bash',
      `echo "terraform $*" >> "${callLog}"`,
      'chdir=""; for arg in "$@"; do case "$arg" in -chdir=*) chdir="${arg#-chdir=}" ;; esac; done',
      'case "$chdir" in',
      ...(Object.keys(codes) as Tree[]).map((t) =>
        `  */terraform/${t}) [ ${codes[t]} = 1 ] && echo "Error: no credentials for ${t}" >&2; exit ${codes[t]} ;;`),
      'esac',
      'exit 0',
    ].join('\n') + '\n');
    chmodSync(path, 0o755);
    return path;
  }
  function check(codes: Partial<Record<Tree, 0 | 1 | 2>>, target: 'staging' | 'production' = 'production') {
    const r = spawnSync('bash', [SCRIPT, '--target', target, '--check'], {
      encoding: 'utf-8',
      env: { ...process.env, ...awsIdentityStubEnv(dir), TERRAFORM_APPLY_BIN: checkStub(codes) },
      ...SPAWN_GUARD,
    });
    const calls = existsSync(callLog) ? readFileSync(callLog, 'utf-8') : '';
    return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '', calls };
  }

  // Defect caught: a check that applies, or takes the state lock an apply in
  // another terminal needs, when its whole job is to look.
  it('plans all three trees read-only and never applies', () => {
    const r = check({ shared: 0, identity: 0, production: 0 });
    expect(r.exitCode, r.stderr).toBe(0);
    const plans = r.calls.split('\n').filter((l) => / plan /.test(l));
    expect(plans.map((l) => l.match(/terraform\/(\w+)/)?.[1])).toEqual(['shared', 'identity', 'production']);
    for (const l of plans) expect(l).toMatch(/-detailed-exitcode .*-lock=false/);
    expect(r.calls).not.toMatch(/ apply /);
  });

  // Defect caught: an account tree left with changes pending reads as clean,
  // because only the environment tree was asked.
  it('exits 3 naming every tree with changes pending', () => {
    const r = check({ shared: 0, identity: 2, staging: 2 }, 'staging');
    expect(r.exitCode, r.stderr).toBe(3);
    expect(r.stderr).toMatch(/nothing pending: identity staging still plan changes/);
  });

  // Defect caught: a plan that could not run (no credentials, say) read as
  // nothing pending, or as pending, either of which sends the operator the
  // wrong way.
  it('exits 1 on a failed plan, carrying terraform\'s error, even beside a pending tree', () => {
    const r = check({ shared: 2, identity: 1, production: 0 });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/terraform\/identity: the plan failed \(exit 1\): Error: no credentials for identity/);
  });

  it('refuses --check together with --dry-run before planning anything', () => {
    const r = spawnSync('bash', [SCRIPT, '--target', 'staging', '--check', '--dry-run'], {
      encoding: 'utf-8', env: { ...process.env, TERRAFORM_APPLY_BIN: checkStub({}) }, ...SPAWN_GUARD,
    });
    expect(r.status).toBe(2);
    expect(existsSync(callLog)).toBe(false);
  });
});
