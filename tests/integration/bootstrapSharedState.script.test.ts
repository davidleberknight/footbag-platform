/**
 * scripts/bootstrap-shared-state.sh — the shared tree's state bucket, for a new account.
 *
 * The shared Terraform tree creates the bucket its own state lives in, so a new
 * account starts by applying on local state and then moving the state into the
 * bucket. The script reaches AWS, so every case runs it with terraform and the
 * AWS CLI replaced by stand-ins that record what they were asked and simulate the
 * bucket and the state object with marker files. What is pinned is the decision
 * surface:
 *
 *   - an account already bootstrapped is reported and left alone;
 *   - a bucket holding no state, with no local bootstrap state, is refused rather
 *     than re-created;
 *   - --check reports and changes nothing;
 *   - nothing is applied without a confirmation;
 *   - a fresh account gets both steps, in order, and the local state is removed
 *     only after the bucket is proven to hold it;
 *   - a run that stopped after creating the bucket resumes at the migration.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/bootstrap-shared-state.sh');
const OPERATOR_ARN = 'arn:aws:iam::000000000000:user/footbag-operator';

let root: string;
let stubs: string;
let world: string;
let workRoot: string;
let callLog: string;

function stub(name: string, body: string) {
  const path = join(stubs, name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
}

/** The account's state, as marker files the stand-ins read and write. */
function bucketExists() { writeFileSync(join(world, 'bucket'), ''); }
function stateInBucket() { writeFileSync(join(world, 'object'), ''); }
function keepLocalState() {
  mkdirSync(join(workRoot, 'shared'), { recursive: true });
  writeFileSync(join(workRoot, 'shared', 'terraform.tfstate'), '{"version":4}');
}

function run(args: string[]) {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      PATH: `${stubs}:${process.env.PATH ?? ''}`,
      AWS_PROFILE_BIN: join(stubs, 'aws'),
      AWS_IDENTITY_BIN: join(stubs, 'aws'),
      BOOTSTRAP_STATE_AWS_BIN: join(stubs, 'aws'),
      BOOTSTRAP_STATE_TF_BIN: join(stubs, 'terraform'),
      BOOTSTRAP_STATE_WORK_ROOT: workRoot,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function calls(): string {
  return existsSync(callLog) ? readFileSync(callLog, 'utf-8') : '';
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'footbag-test-bootstrap-state-'));
  stubs = join(root, 'stubs');
  world = join(root, 'world');
  workRoot = join(root, 'work');
  callLog = join(root, 'calls.log');
  mkdirSync(stubs, { recursive: true });
  mkdirSync(world, { recursive: true });
  // The AWS CLI: the operator identity, and the bucket and state object as markers.
  // An absent one answers as the CLI does for a HEAD request, which carries no
  // error body, so the status code is all it can say: "(404) ... Not Found", and
  // "(403) ... Forbidden" where the identity may not look (the forbidden marker).
  const head = (op: string, marker: string) =>
    `[[ -e ${world}/forbidden ]] && { echo "An error occurred (403) when calling the ${op} operation: Forbidden" >&2; exit 254; }; ` +
    `[[ -e ${world}/${marker} ]] && exit 0; echo "An error occurred (404) when calling the ${op} operation: Not Found" >&2; exit 254`;
  stub(
    'aws',
    [
      'if [[ "$1" == "configure" && "$2" == "list-profiles" ]]; then echo footbag-operator; exit 0; fi',
      `if [[ "$1" == "sts" ]]; then echo ${OPERATOR_ARN}; exit 0; fi`,
      `if [[ "$1 $2" == "s3api head-bucket" ]]; then ${head('HeadBucket', 'bucket')}; fi`,
      `if [[ "$1 $2" == "s3api head-object" ]]; then ${head('HeadObject', 'object')}; fi`,
      'exit 0',
    ].join('\n'),
  );
  // terraform: records each call; an apply creates the bucket, a migration the object.
  stub(
    'terraform',
    [
      `echo "$*" >> ${callLog}`,
      'dir=""; for a in "$@"; do case "$a" in -chdir=*) dir="${a#-chdir=}" ;; esac; done',
      `if [[ " $* " == *" apply "* ]]; then touch ${world}/bucket; echo '{"version":4}' > "$dir/terraform.tfstate"; fi`,
      `if [[ " $* " == *" -migrate-state "* ]]; then touch ${world}/object; fi`,
      'exit 0',
    ].join('\n'),
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('bootstrap-shared-state.sh — where the account stands', () => {
  it('reports an account already bootstrapped and changes nothing', () => {
    bucketExists();
    stateInBucket();
    const r = run([]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('Already bootstrapped: the state object is in the bucket.');
    expect(calls()).toBe('');
  });

  it('refuses a bucket that holds no state when no local bootstrap state is kept', () => {
    bucketExists();
    const r = run(['--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--restore-state');
    expect(calls()).toBe('');
  });

  it('reports what a fresh account needs under --check and changes nothing', () => {
    const r = run(['--check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('No bucket yet: apply the shared tree on local state, then migrate');
    expect(calls()).toBe('');
    expect(existsSync(join(workRoot, 'shared'))).toBe(false);
  });

  it('refuses, rather than creating anything, when the identity may not look in the bucket', () => {
    // A 403 is not an absent bucket; read as one, the run would plan to create it.
    writeFileSync(join(world, 'forbidden'), '');
    const r = run(['--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('could not tell whether');
    expect(r.stderr).toContain('(403)');
    expect(r.stdout).not.toContain('No bucket yet');
    expect(calls()).toBe('');
  });

  it('says a stubbed run proves nothing', () => {
    const r = run(['--check']);
    expect(r.stderr).toContain('SYNTHETIC: BOOTSTRAP_STATE_TF_BIN is set');
  });

  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run(['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });
});

describe('bootstrap-shared-state.sh — the two steps', () => {
  it('applies nothing without a confirmation, and keeps no plan behind', () => {
    const r = run([]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Not confirmed; nothing has been applied.');
    expect(calls()).not.toContain(' apply ');
    expect(existsSync(join(workRoot, 'shared', 'bootstrap.plan'))).toBe(false);
  });

  it('applies on local state, migrates, proves the object, then removes the local copy', () => {
    const r = run(['--yes']);
    expect(r.status, r.stderr).toBe(0);
    const lines = calls().trim().split('\n');
    expect(lines[0]).toMatch(/ init -input=false$/);
    expect(lines[1]).toMatch(/ plan -input=false -out=/);
    expect(lines[2]).toMatch(/ apply -input=false /);
    expect(lines[3]).toMatch(/ init -input=false -migrate-state -force-copy$/);
    expect(r.stdout).toContain('Bootstrapped: the shared state is in s3://');
    expect(existsSync(join(workRoot, 'shared'))).toBe(false);
  });

  it('stages the tree without its backend for the local apply', () => {
    stub(
      'terraform',
      [
        'dir=""; for a in "$@"; do case "$a" in -chdir=*) dir="${a#-chdir=}" ;; esac; done',
        `if [[ " $* " == *" plan "* ]]; then ls "$dir" > ${join(root, 'staged.txt')}; fi`,
        'exit 0',
      ].join('\n'),
    );
    run([]);
    const staged = readFileSync(join(root, 'staged.txt'), 'utf-8');
    expect(staged).toContain('s3.tf');
    expect(staged).not.toContain('backend.tf');
  });

  it('resumes at the migration when the bucket exists and the local state is kept', () => {
    bucketExists();
    keepLocalState();
    const r = run(['--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('resuming at the migration');
    expect(calls()).not.toContain(' apply ');
    expect(calls()).toContain('-migrate-state');
  });

  it('keeps the local state when the bucket does not prove it holds the object', () => {
    bucketExists();
    keepLocalState();
    stub('terraform', 'exit 0');
    const r = run(['--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('the state object is not in the bucket');
    expect(existsSync(join(workRoot, 'shared', 'terraform.tfstate'))).toBe(true);
  });
});

describe('bootstrap-shared-state.sh — restoring lost state from a bucket version', () => {
  // The state bucket is versioned, so lost or wrong state is recovered by making
  // an earlier version current again, not by importing every resource by hand.
  // These pin which version is chosen, that it is verified before it is made
  // current, that nothing changes without a confirmation, and that the outcome
  // is proved by reading the bucket back and planning the tree.

  const STATE = (serial: number) =>
    JSON.stringify({ version: 4, serial, lineage: 'lineage-1', resources: [{ type: 'aws_s3_bucket' }] });

  /** Versions as [id, LastModified, body]; the stand-in serves and copies them. */
  function versioned(
    versions: Array<[string, string, string]>,
    opts: { planExit?: number; badReadBack?: boolean } = {},
  ) {
    bucketExists();
    const rows = versions.map(([id, date]) => `${id}\t${date}`).join('\n');
    writeFileSync(join(world, 'versions'), rows ? `${rows}\n` : '');
    for (const [id, , body] of versions) writeFileSync(join(world, `v_${id}`), body);
    stub(
      'aws',
      [
        `echo "aws $*" >> ${callLog}`,
        'if [[ "$1" == "configure" && "$2" == "list-profiles" ]]; then echo footbag-operator; exit 0; fi',
        `if [[ "$1" == "sts" ]]; then echo ${OPERATOR_ARN}; exit 0; fi`,
        'vid=""; src=""; prev=""; last=""',
        'for a in "$@"; do case "$prev" in --version-id) vid="$a" ;; --copy-source) src="$a" ;; esac; prev="$a"; last="$a"; done',
        'case "$1 $2" in',
        '  "s3api head-bucket") exit 0 ;;',
        `  "s3api head-object") [[ -e ${world}/object ]] && exit 0; echo "An error occurred (404) when calling the HeadObject operation: Not Found" >&2; exit 254 ;;`,
        `  "s3api list-object-versions") cat ${world}/versions; exit 0 ;;`,
        '  "s3api get-object")',
        `    if [[ -n "$vid" ]]; then cp ${world}/v_"$vid" "$last"; else ${opts.badReadBack ? 'echo tampered > "$last"' : `cp ${world}/current "$last"`}; fi; exit 0 ;;`,
        `  "s3api copy-object") cp ${world}/v_"\${src##*versionId=}" ${world}/current; touch ${world}/object; exit 0 ;;`,
        'esac',
        'exit 0',
      ].join('\n'),
    );
    stub(
      'terraform',
      [`echo "$*" >> ${callLog}`, `if [[ " $* " == *" plan "* ]]; then exit ${opts.planExit ?? 0}; fi`, 'exit 0'].join('\n'),
    );
  }

  it('makes the newest earlier version current, then proves it by reading it back and planning clean', () => {
    // The state object was deleted: the versions remain, and the newest wins.
    versioned([
      ['v-old', '2026-09-01T00:00:00+00:00', STATE(7)],
      ['v-new', '2026-10-01T00:00:00+00:00', STATE(9)],
    ]);
    const r = run(['--restore-state', '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('serial:    9');
    expect(calls()).toContain('versionId=v-new');
    expect(calls()).toMatch(/plan -input=false -detailed-exitcode/);
    expect(r.stdout).toContain('plans with no changes');
  });

  it('changes nothing without a confirmation', () => {
    versioned([['v-1', '2026-10-01T00:00:00+00:00', STATE(1)]]);
    const r = run(['--restore-state']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('nothing was restored');
    expect(calls()).not.toContain('copy-object');
  });

  it('refuses a version that is not Terraform state, before copying anything', () => {
    // Defect caught: restoring a truncated or foreign object as the shared
    // state would leave every later plan of the tree reading garbage.
    // Not JSON, and JSON missing the version, lineage or resources a plan reads.
    for (const body of [
      'not json at all',
      JSON.stringify({ lineage: 'lineage-1', resources: [] }),
      JSON.stringify({ version: 4, resources: [] }),
      JSON.stringify({ version: 4, lineage: 'lineage-1' }),
    ]) {
      versioned([['v-bad', '2026-10-01T00:00:00+00:00', body]]);
      const r = run(['--restore-state', '--yes']);
      expect(r.status, body).toBe(1);
      expect(r.stderr, body).toContain('not readable Terraform state');
    }
    expect(calls()).not.toContain('copy-object');
  });

  it('refuses when there is no earlier version to restore from', () => {
    versioned([]);
    const r = run(['--restore-state', '--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no earlier version');
    expect(calls()).not.toContain('copy-object');
  });

  it('refuses to guess a rollback while a current state object exists', () => {
    // With a current object, the newest version is the one already in place;
    // restoring "the newest" would change nothing and report a recovery.
    versioned([['v-1', '2026-10-01T00:00:00+00:00', STATE(1)]]);
    stateInBucket();
    const r = run(['--restore-state', '--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--version-id');
    expect(calls()).not.toContain('copy-object');
  });

  it('restores the named version when a current object exists and one is named', () => {
    versioned([
      ['v-good', '2026-09-01T00:00:00+00:00', STATE(4)],
      ['v-wrong', '2026-10-01T00:00:00+00:00', STATE(5)],
    ]);
    stateInBucket();
    const r = run(['--restore-state', '--version-id', 'v-good', '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(calls()).toContain('versionId=v-good');
  });

  it('refuses a version id the key does not have', () => {
    versioned([['v-1', '2026-10-01T00:00:00+00:00', STATE(1)]]);
    const r = run(['--restore-state', '--version-id', 'v-elsewhere', '--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('is not a version of');
    expect(calls()).not.toContain('copy-object');
  });

  it('fails when the bucket does not read back the version that was verified', () => {
    versioned([['v-1', '2026-10-01T00:00:00+00:00', STATE(1)]], { badReadBack: true });
    const r = run(['--restore-state', '--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not the version restored');
  });

  it('fails, saying what to do, when the tree plans changes against the restored state', () => {
    // A version older than the last apply is a valid restore and a stale one;
    // reporting it as a clean recovery would hide the drift until the next apply.
    versioned([['v-1', '2026-10-01T00:00:00+00:00', STATE(1)]], { planExit: 2 });
    const r = run(['--restore-state', '--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('plans changes against it');
  });
});
