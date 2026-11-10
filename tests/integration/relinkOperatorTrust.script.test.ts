/**
 * scripts/relink-operator-trust.sh -- reconnecting both runtime roles to a
 * re-created footbag-operator user.
 *
 * A re-created user is a different principal, so both runtime trusts go on
 * refusing it. AWS holds a deleted user's trust entry as its unique principal
 * ID, which the provider reads back, so a plain plan shows the trust updated in
 * place. What is pinned here is that the run acts only as that user, applies
 * only a tree whose live trust is broken and whose read-only plan shows that
 * in-place update and nothing destroyed, does staging before production,
 * judges each apply by reading the trust back rather than by the apply's exit
 * status, falls back to replacing the role only when the trust is still broken
 * and only behind its own typed confirmation, and ends on the account
 * baseline. The last block holds the script's list of trust-bearing roles to
 * the Terraform trees, so a new role trusting the user cannot be missed by it.
 *
 * Hermetic: the AWS CLI, terraform, the apply and the baseline check are
 * stand-ins named through the script's announced seams.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { createScratchDir } from '../fixtures/scratchDir';
import { hclBlocks } from '../fixtures/hclBlocks';
import { requireToolInCI } from '../fixtures/toolAvailability';

const SCRIPT = join(process.cwd(), 'scripts/relink-operator-trust.sh');
const HAS_SCRIPT = requireToolInCI('script', '--version');
const scratch = createScratchDir('relink-operator-trust');
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let dir: string;
let callLog: string;
let caseNo = 0;

type Trust = 'linked' | 'broken' | 'unreadable' | 'empty' | 'lookalike';
/** What the read-only plan of a tree shows for the role and the rest of the tree. */
type Plan = 'update' | 'noop' | 'replace' | 'destroys-other' | 'fails';

const LINKED_DOC = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{ Effect: 'Allow', Principal: { AWS: ['arn:aws:iam::000000000000:user/footbag-operator'] }, Action: 'sts:AssumeRole' }],
});
// How IAM shows a trusted user that no longer exists: by its old unique id.
const BROKEN_DOC = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{ Effect: 'Allow', Principal: { AWS: ['AIDAEXAMPLEOLDUSERID0'] }, Action: 'sts:AssumeRole' }],
});
// A trust naming other principals whose names merely contain the operator's.
const LOOKALIKE_DOC = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{
    Effect: 'Allow',
    Principal: { AWS: ['arn:aws:iam::000000000000:user/footbag-operator-old', 'arn:aws:iam::000000000000:role/footbag-operator'] },
    Action: 'sts:AssumeRole',
  }],
});

/** The `terraform show -json` shape for each plan kind, resource_changes only. */
function planJson(kind: Plan): string {
  const role = (actions: string[], after: string) => ({
    address: 'aws_iam_role.app_runtime',
    change: { actions, before: { assume_role_policy: BROKEN_DOC }, after: { assume_role_policy: after } },
  });
  const changes = {
    update: [role(['update'], LINKED_DOC)],
    noop: [role(['no-op'], BROKEN_DOC)],
    replace: [role(['delete', 'create'], LINKED_DOC)],
    'destroys-other': [role(['update'], LINKED_DOC), { address: 'aws_s3_bucket.media', change: { actions: ['delete'], before: {}, after: null } }],
    fails: [],
  }[kind];
  return JSON.stringify({ format_version: '1.2', resource_changes: changes });
}

/**
 * Each role's trust lives in a file the apply stand-in rewrites to linked:
 * a plain apply does so unless told it leaves the trust broken, and a
 * replacement does so unless told the same of it.
 */
function stubs(
  trust: { staging: Trust; production: Trust },
  opts: {
    plan?: Partial<Record<'staging' | 'production', Plan>>;
    applyFails?: string;
    plainLeavesBroken?: boolean;
    replaceLeavesBroken?: boolean;
    baselineFails?: boolean;
  } = {},
) {
  for (const tree of ['staging', 'production'] as const) {
    writeFileSync(join(dir, `trust-${tree}`), trust[tree]);
    writeFileSync(join(dir, `plan-${tree}.json`), planJson(opts.plan?.[tree] ?? 'update'));
    writeFileSync(join(dir, `plan-${tree}.kind`), opts.plan?.[tree] ?? 'update');
  }
  const aws = join(dir, 'aws');
  writeFileSync(
    aws,
    [
      '#!/usr/bin/env bash',
      `printf 'aws %s\\n' "$*" >> ${JSON.stringify(callLog)}`,
      'if [[ "$1 $2" == "iam get-role" ]]; then',
      '  tree="${4#footbag-}"; tree="${tree%-app-runtime}"',
      `  state="$(cat ${JSON.stringify(dir)}/trust-$tree)"`,
      '  case "$state" in',
      `    linked) printf '%s\\n' ${JSON.stringify(LINKED_DOC)} ;;`,
      `    broken) printf '%s\\n' ${JSON.stringify(BROKEN_DOC)} ;;`,
      `    lookalike) printf '%s\\n' ${JSON.stringify(LOOKALIKE_DOC)} ;;`,
      '    empty) : ;;',
      '    *) echo "An error occurred (AccessDenied) when calling the GetRole operation" >&2; exit 254 ;;',
      '  esac',
      '  exit 0',
      'fi',
      'echo "unexpected aws call: $*" >&2; exit 64',
    ].join('\n'),
  );
  const tf = join(dir, 'terraform');
  writeFileSync(
    tf,
    [
      '#!/usr/bin/env bash',
      `printf 'terraform %s\\n' "$*" >> ${JSON.stringify(callLog)}`,
      'tree="${1##*/}"; out=""',
      'for a in "$@"; do case "$a" in -out=*) out="${a#-out=}" ;; esac; done',
      `kind="$(cat ${JSON.stringify(dir)}/plan-$tree.kind)"`,
      'case "$2" in',
      '  plan) [[ "$kind" == fails ]] && { echo "Error: No valid credential sources found" >&2; exit 1; }',
      '        echo "plan-zip" > "$out"; exit 0 ;;',
      `  show) [[ -f "$4" ]] || { echo "Error: no plan file" >&2; exit 1; }; cat ${JSON.stringify(dir)}/plan-$tree.json; exit 0 ;;`,
      'esac',
      'echo "unexpected terraform call: $*" >&2; exit 64',
    ].join('\n'),
  );
  const apply = join(dir, 'apply');
  writeFileSync(
    apply,
    [
      '#!/usr/bin/env bash',
      `printf 'apply %s\\n' "$*" >> ${JSON.stringify(callLog)}`,
      `printf 'plans-left %s\\n' "$(find ${JSON.stringify(dir)} -name '*.tfplan' | wc -l)" >> ${JSON.stringify(callLog)}`,
      'tree="$2"',
      opts.applyFails ? `[[ "$tree" == ${JSON.stringify(opts.applyFails)} ]] && exit 1` : ':',
      'if [[ " $* " == *" --replace "* ]]; then',
      opts.replaceLeavesBroken ? '  :' : `  echo linked > ${JSON.stringify(dir)}/trust-$tree`,
      'else',
      opts.plainLeavesBroken ? '  :' : `  echo linked > ${JSON.stringify(dir)}/trust-$tree`,
      'fi',
      'exit 0',
    ].join('\n'),
  );
  const baseline = join(dir, 'baseline');
  writeFileSync(
    baseline,
    ['#!/usr/bin/env bash', `printf 'baseline %s\\n' "$*" >> ${JSON.stringify(callLog)}`, `exit ${opts.baselineFails ? 1 : 0}`].join('\n'),
  );
  for (const f of [aws, tf, apply, baseline]) chmodSync(f, 0o755);
  return { RELINK_TRUST_AWS_BIN: aws, RELINK_TRUST_TF_BIN: tf, RELINK_TRUST_APPLY_CMD: apply, RELINK_TRUST_BASELINE_CMD: baseline };
}

function env(seams: Record<string, string>, arn?: string) {
  return { ...process.env, ...awsIdentityStubEnv(dir, arn ? { arn } : {}), ...seams, TMPDIR: dir };
}

function run(args: string[], seams: Record<string, string>, arn?: string) {
  const r = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf-8', input: '', env: env(seams, arn), ...SPAWN_GUARD });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** A run at a terminal, typing the answer to the prompt; both streams arrive as one. */
function atTerminal(args: string[], seams: Record<string, string>, typed: string) {
  const inner = `bash ${[SCRIPT, ...args].map((a) => JSON.stringify(a)).join(' ')} </dev/null; echo "EXIT=$?"`;
  const r = spawnSync('script', ['-qec', inner, '/dev/null'], { encoding: 'utf-8', input: `${typed}\n`, env: env(seams), ...SPAWN_GUARD });
  const out = r.stdout ?? '';
  return { status: Number(out.match(/EXIT=(\d+)/)?.[1] ?? -1), out };
}

const calls = () => (existsSync(callLog) ? readFileSync(callLog, 'utf-8') : '');
const applies = () => calls().split('\n').filter((l) => l.startsWith('apply '));

beforeEach(() => {
  caseNo += 1;
  dir = join(scratch, `case-${caseNo}`);
  callLog = join(dir, 'calls.log');
  mkdirSync(dir, { recursive: true });
});

describe('relink-operator-trust.sh: who may run it', () => {
  it('refuses an assumed role before reading or changing anything, beside the operator going through', () => {
    // Defect caught: a job-role session reaching the apply, which it is
    // denied partway through, leaving a trust half-changed.
    const seams = stubs({ staging: 'broken', production: 'linked' });
    const r = run(['--yes'], seams, 'arn:aws:sts::000000000000:assumed-role/FootbagDevTester/someone');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/assumed role/);
    expect(calls()).toBe('');
    expect(run(['--yes'], seams).status).toBe(0);
  });
});

describe('relink-operator-trust.sh: which trees are applied', () => {
  it('applies nothing when both trusts already name the operator, and still checks the baseline', () => {
    // Defect caught: a re-run that plans and applies trees that were never broken.
    const r = run(['--yes'], stubs({ staging: 'linked', production: 'linked' }));
    expect(r.status, r.stderr).toBe(0);
    expect(applies()).toEqual([]);
    expect(calls()).not.toMatch(/^terraform /m);
    expect(calls()).toMatch(/^baseline/m);
  });

  it('plans the broken tree read-only, applies it plainly with no replacement, then reads the trust back', () => {
    // Defect caught: the role destroyed and re-created, an outage on the host,
    // when a plain apply already re-saves the trust; a healthy tree applied;
    // or the plan's in-place update never checked before the apply.
    const r = run(['--yes'], stubs({ staging: 'linked', production: 'broken' }));
    expect(r.status, r.stderr).toBe(0);
    expect(applies()).toEqual(['apply --target production']);
    const log = calls();
    expect(log).toMatch(/^terraform -chdir=\S+\/terraform\/production plan -lock=false -input=false -out=/m);
    expect(log).not.toMatch(/terraform\/staging plan/);
    expect(log.indexOf('terraform/production plan')).toBeLessThan(log.indexOf('apply --target production'));
    expect(log.lastIndexOf('footbag-production-app-runtime')).toBeGreaterThan(log.indexOf('apply --target production'));
    expect(log.indexOf('baseline')).toBeGreaterThan(log.indexOf('apply --target production'));
    expect(r.stderr).toContain("footbag-production-app-runtime's trust was updated in place");
  });

  it('shreds the saved plan once read, before any apply, since it holds a copy of state', () => {
    // Defect caught: a full copy of state left on disk while the applies run,
    // and on past the run if the cleanup is interrupted.
    const r = run(['--yes'], stubs({ staging: 'broken', production: 'linked' }));
    expect(r.status, r.stderr).toBe(0);
    expect(calls()).toMatch(/^plans-left 0$/m);
    expect(readdirSync(dir).filter((n) => n.startsWith('footbag-relink-trust.'))).toEqual([]);
  });

  it('does staging before production when both are broken, planning both before applying either', () => {
    // Defect caught: an apply that goes wrong doing so first on the
    // environment the public is served from, or production applied before
    // its own plan was checked.
    const r = run(['--yes'], stubs({ staging: 'broken', production: 'broken' }));
    expect(r.status, r.stderr).toBe(0);
    expect(applies()).toEqual(['apply --target staging', 'apply --target production']);
    const log = calls();
    expect(log.indexOf('terraform/production plan')).toBeLessThan(log.indexOf('apply --target staging'));
  });

  it('refuses when a trust cannot be read, changing nothing', () => {
    // Defect caught: an unreadable trust taken as broken, applying on a guess,
    // or as fine, reporting a repair that never happened.
    const r = run(['--yes'], stubs({ staging: 'unreadable', production: 'broken' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/AccessDenied/);
    expect(applies()).toEqual([]);
  });

  it('refuses an empty trust document as unreadable, changing nothing', () => {
    // Defect caught: a read that succeeded with nothing in it taken as a broken
    // trust, applying on no evidence.
    const r = run(['--yes'], stubs({ staging: 'empty', production: 'broken' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read the trust policy of footbag-staging-app-runtime/);
    expect(applies()).toEqual([]);
  });

  it('does not take a principal whose name only contains the operator\'s for the operator', () => {
    // Defect caught: a trust naming footbag-operator-old, or a role of the same
    // name, read as linked, so the broken role is never re-saved.
    const r = run(['--yes'], stubs({ staging: 'lookalike', production: 'linked' }));
    expect(r.status, r.stderr).toBe(0);
    expect(applies()).toEqual(['apply --target staging']);
  });

  it('a dry run checks the plan and says what it would apply, and applies nothing', () => {
    // Defect caught: a rehearsal that changes a trust, or one that names the
    // outage-causing replacement as the step it would take.
    const r = run(['--dry-run'], stubs({ staging: 'linked', production: 'broken' }));
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^Would run: bash scripts\/terraform-apply\.sh --target production$/m);
    expect(r.stdout).not.toMatch(/^Would run: .*--replace/m);
    expect(calls()).toMatch(/terraform\/production plan/);
    expect(applies()).toEqual([]);
  });

  it('asks before applying, and refuses with no terminal and no --yes', () => {
    // Defect caught: a trust changed on nobody's word.
    const r = run([], stubs({ staging: 'broken', production: 'linked' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no terminal to confirm on/);
    expect(applies()).toEqual([]);
  });
});

describe('relink-operator-trust.sh: the read-only plan decides whether a plain apply is safe', () => {
  it('refuses a plan that shows no in-place update of the trust, applying nothing', () => {
    // Defect caught: a plain apply run that cannot re-save the trust, reported
    // after it as a broken trust with the cause unnamed.
    const r = run(['--yes'], stubs({ staging: 'broken', production: 'linked' }, { plan: { staging: 'noop' } }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("the staging plan shows no in-place update of aws_iam_role.app_runtime's assume_role_policy");
    expect(applies()).toEqual([]);
  });

  it('refuses a plan that replaces the role or deletes anything, naming it, applying nothing', () => {
    // Defect caught: an outage or a lost resource carried in by the plain
    // apply this run calls safe.
    for (const kind of ['replace', 'destroys-other'] as const) {
      writeFileSync(callLog, '');
      const r = run(['--yes'], stubs({ staging: 'linked', production: 'broken' }, { plan: { production: kind } }));
      expect(r.status, kind).toBe(1);
      expect(r.stderr, kind).toMatch(/the production plan deletes or replaces /);
      expect(r.stderr, kind).toContain(kind === 'replace' ? 'aws_iam_role.app_runtime' : 'aws_s3_bucket.media');
      expect(applies(), kind).toEqual([]);
    }
  });

  it('refuses when the read-only plan fails, with terraform\'s message, applying nothing', () => {
    // Defect caught: a failed plan read as no change, or its reason dropped.
    const r = run(['--yes'], stubs({ staging: 'broken', production: 'linked' }, { plan: { staging: 'fails' } }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('No valid credential sources found');
    expect(applies()).toEqual([]);
  });
});

describe('relink-operator-trust.sh: the replacement fallback', () => {
  it('is not answered by --yes: with no terminal it stops, having replaced nothing', () => {
    // Defect caught: the outage-causing replacement run on a flag passed in
    // advance for the harmless in-place apply.
    const r = run(['--yes'], stubs({ staging: 'broken', production: 'linked' }, { plainLeavesBroken: true }));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('This is an OUTAGE');
    expect(r.stderr).toMatch(/replacement of footbag-staging-app-runtime was not confirmed/);
    expect(applies()).toEqual(['apply --target staging']);
    expect(calls()).not.toMatch(/^baseline/m);
  });

  it.skipIf(!HAS_SCRIPT)('replaces the role when the trust is still broken after the plain apply and APPLY is typed', () => {
    // Defect caught: a trust the plain apply could not re-save left broken
    // with no way forward, or the replacement judged by its exit status.
    const r = atTerminal(['--yes'], stubs({ staging: 'broken', production: 'linked' }, { plainLeavesBroken: true }), 'APPLY');
    expect(r.status, r.out).toBe(0);
    expect(applies()).toEqual(['apply --target staging', 'apply --target staging --replace aws_iam_role.app_runtime']);
    expect(r.out).toContain('footbag-staging-app-runtime was replaced and its trust now names footbag-operator');
  });

  it.skipIf(!HAS_SCRIPT)('fails when the replacement reports success but the trust still does not name the operator', () => {
    // Defect caught: success judged by the apply's exit status, which a plan
    // that did not touch the trust also returns.
    const seams = stubs({ staging: 'broken', production: 'linked' }, { plainLeavesBroken: true, replaceLeavesBroken: true });
    const r = atTerminal(['--yes'], seams, 'APPLY');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/replacement finished, but footbag-staging-app-runtime still does not name footbag-operator/);
    expect(calls()).not.toMatch(/^baseline/m);
  });
});

describe('relink-operator-trust.sh: the verdict', () => {
  it('stops at a failed staging apply, leaving production untouched', () => {
    // Defect caught: carrying a failure on to the production role.
    const r = run(['--yes'], stubs({ staging: 'broken', production: 'broken' }, { applyFails: 'staging' }));
    expect(r.status).toBe(1);
    // Named as the apply failing, not as a trust found broken afterwards, so
    // the operator re-runs the apply rather than hunting for a plan problem.
    expect(r.stderr).toMatch(/the staging apply did not complete/);
    expect(applies()).toEqual(['apply --target staging']);
  });

  it('fails when the account baseline reports a finding', () => {
    // Defect caught: a repaired trust reported as a healthy account while the
    // baseline that checks both trusts, and the rest, still fails.
    const r = run(['--yes'], stubs({ staging: 'broken', production: 'linked' }, { baselineFails: true }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/account baseline reports a finding/);
  });
});

describe('relink-operator-trust.sh: the roles it covers are the ones the trees declare', () => {
  it('names every role whose trust names footbag-operator, in every tree, and the apply wrapper may replace it', () => {
    // Defect caught: a role added to any tree that trusts the user, which this
    // script would then never re-save, so it stays broken after a re-creation;
    // or an address the apply wrapper refuses to replace in the fallback.
    const source = readFileSync(SCRIPT, 'utf-8');
    const address = source.match(/^TRUST_ADDRESS="([^"]+)"$/m)?.[1];
    const trees = source.match(/^TREES=\(([^)]*)\)$/m)?.[1].trim().split(/\s+/);
    expect(address).toBeDefined();
    const declared: string[] = [];
    for (const tree of ['staging', 'production', 'identity', 'shared']) {
      const tdir = resolve(process.cwd(), 'terraform', tree);
      for (const f of readdirSync(tdir).filter((n) => n.endsWith('.tf'))) {
        for (const b of hclBlocks(readFileSync(join(tdir, f), 'utf-8'), 'resource')) {
          if (b.type === 'aws_iam_role' && /assume_role_policy[\s\S]*user\/footbag-operator/.test(b.body)) {
            declared.push(`${tree} aws_iam_role.${b.name}`);
          }
        }
      }
    }
    expect(declared.sort()).toEqual((trees ?? []).map((t) => `${t} ${address}`).sort());
    const apply = readFileSync(resolve(process.cwd(), 'scripts/terraform-apply.sh'), 'utf-8');
    expect(apply.match(/^REPLACEABLE_ADDRESSES=\(([^)]*)\)$/m)?.[1]).toContain(`"${address}"`);
  });
});
