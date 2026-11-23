/**
 * Integration tests for scripts/archive-source-switch.sh.
 *
 * The switch moves the Legacy Archive's source of truth from the crawl to the
 * archive bucket, after which the publisher refuses. What is pinned here is what
 * keeps that one-way move safe: it never switches an environment whose source it
 * could not read, it never switches production before every later edit is
 * guaranteed a cold copy and the archive as it stood has been copied there, and
 * its verdict comes from reading the parameter back rather than from the write's
 * exit status.
 *
 * Hermetic: a stand-in AWS CLI keeping the parameter in a scratch file and
 * answering the replication configuration from one, a stand-in Terraform, and a
 * stand-in backfill that logs its arguments, each through the script's announced
 * seams. A typed APPLY is driven through `script`, which gives the run a
 * terminal. The AWS error lines follow the CLI's "An error occurred (<Code>)
 * when calling the <Op> operation" shape, which the script reads only for the
 * error code in parentheses.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { createScratchDir } from '../fixtures/scratchDir';
import { requireToolInCI } from '../fixtures/toolAvailability';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'archive-source-switch.sh');
const HAS_SCRIPT = requireToolInCI('script', '--version');

const ARCHIVE = 'footbag-production-archive-stub';
const COLD = 'arn:aws:s3:::footbag-production-legacy-mirror-backup';

let root: string;
let caseCount = 0;

beforeAll(() => {
  root = createScratchDir('archive-source-switch');
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const awsFailure = (code: string, op: string) => `An error occurred (${code}) when calling the ${op} operation: stub`;

/** The rule the cold copy needs, as get-bucket-replication returns it. */
const coldRule = (over: Record<string, unknown> = {}) => ({
  ID: 'replicate-writes-to-cold-copy',
  Priority: 2,
  Status: 'Enabled',
  Filter: { Prefix: '' },
  DeleteMarkerReplication: { Status: 'Disabled' },
  Destination: { Bucket: COLD, StorageClass: 'DEEP_ARCHIVE' },
  ...over,
});
/** The existing rule to the second-region replica, which is not the cold copy. */
const drRule = {
  ID: 'replicate-all-to-archive-dr',
  Priority: 1,
  Status: 'Enabled',
  Filter: { Prefix: '' },
  DeleteMarkerReplication: { Status: 'Enabled' },
  Destination: { Bucket: 'arn:aws:s3:::footbag-production-archive-dr', StorageClass: 'ONEZONE_IA' },
};
const replication = (rules: unknown[]) =>
  JSON.stringify({ ReplicationConfiguration: { Role: 'arn:aws:iam::000000000000:role/stub', Rules: rules } });

interface CaseOpts {
  /** The parameter's value; a `fail:` prefix makes the read fail with that message. */
  param?: string;
  /** The replication configuration JSON; a `fail:` prefix makes the read fail. */
  replication?: string;
  /** The write succeeds but changes nothing. */
  putIsNoop?: boolean;
  /** The backfill's exit status. */
  backfillStatus?: number;
  /** The identity the run resolves to. */
  arn?: string;
}

function makeCase(opts: CaseOpts) {
  const dir = path.join(root, `case-${++caseCount}`);
  fs.mkdirSync(dir);
  const calls = path.join(dir, 'aws-calls.log');
  const backfillCalls = path.join(dir, 'backfill-calls.log');
  const param = path.join(dir, 'param');
  fs.writeFileSync(param, opts.param ?? 'crawl');
  const repl = path.join(dir, 'replication');
  fs.writeFileSync(repl, opts.replication ?? replication([drRule, coldRule()]));

  const aws = path.join(dir, 'aws');
  fs.writeFileSync(aws, [
    '#!/usr/bin/env bash',
    `printf '%s\\n' "$*" >> ${JSON.stringify(calls)}`,
    `printf 'aws %s\\n' "$*" >> ${JSON.stringify(backfillCalls)}`,
    'answer() { local v; v="$(cat "$1")"; if [[ "$v" == fail:* ]]; then echo "${v#fail:}" >&2; exit 254; fi; printf "%s\\n" "$v"; }',
    'case "$1 $2" in',
    `  "ssm get-parameter") answer ${JSON.stringify(param)} ;;`,
    opts.putIsNoop
      ? '  "ssm put-parameter") ;;'
      : `  "ssm put-parameter") while [[ $# -gt 0 ]]; do [[ "$1" == --value ]] && printf '%s' "$2" > ${JSON.stringify(param)}; shift; done ;;`,
    `  "s3api get-bucket-replication") answer ${JSON.stringify(repl)} ;;`,
    '  *) echo "unexpected aws invocation: $*" >&2; exit 64 ;;',
    'esac',
  ].join('\n'), { mode: 0o755 });

  const terraform = path.join(dir, 'terraform');
  fs.writeFileSync(terraform, `#!/usr/bin/env bash\n[[ "\${*: -1}" == archive_bucket_name ]] && { echo ${ARCHIVE}; exit 0; }\nexit 1\n`, { mode: 0o755 });

  const backfill = path.join(dir, 'backfill');
  fs.writeFileSync(backfill, `#!/usr/bin/env bash\nprintf 'backfill %s\\n' "$*" >> ${JSON.stringify(backfillCalls)}\nexit ${opts.backfillStatus ?? 0}\n`, { mode: 0o755 });

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...awsIdentityStubEnv(dir, opts.arn ? { arn: opts.arn } : {}),
    FOOTBAG_AWS_BIN: aws,
    FOOTBAG_TERRAFORM_BIN: terraform,
    ARCHIVE_SOURCE_SWITCH_BACKFILL: backfill,
  };
  const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : []);
  return {
    env,
    awsCalls: () => read(calls),
    /** Backfill and AWS calls interleaved in the order they happened. */
    sequence: () => read(backfillCalls),
    param: () => fs.readFileSync(param, 'utf8'),
  };
}

/** A run with no terminal: anything that would prompt is refused. */
function run(args: string[], opts: CaseOpts = {}) {
  const c = makeCase(opts);
  const r = spawnSync('bash', [SCRIPT, ...args], { cwd: REPO_ROOT, env: c.env, input: '', encoding: 'utf-8', ...SPAWN_GUARD });
  return { ...c, status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** A run at a terminal, typing the answer to the prompt. */
function atTerminal(target: string, typed: string, opts: CaseOpts = {}) {
  const c = makeCase(opts);
  const inner = `bash ${JSON.stringify(SCRIPT)} --target ${target} </dev/null; echo "EXIT=$?"`;
  const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
    cwd: REPO_ROOT, env: c.env, input: `${typed}\n`, encoding: 'utf-8', ...SPAWN_GUARD,
  });
  const out = r.stdout ?? '';
  return { ...c, status: Number(out.match(/EXIT=(\d+)/)?.[1] ?? -1), out };
}

const wrote = (calls: string[]) => calls.some((c) => c.startsWith('ssm put-parameter'));

describe('archive-source-switch.sh: refused before anything changes', () => {
  it('names no environment by default, beside a staging dry run that goes through', () => {
    // Defect caught: a switch aimed by ambient state, or a script that refuses
    // everything and so proves nothing.
    const bare = run([]);
    expect(bare.status).toBe(2);
    expect(bare.out).toContain('--target is required');
    const dry = run(['--target', 'staging', '--dry-run']);
    expect(dry.status, dry.out).toBe(0);
    expect(dry.param()).toBe('crawl');
    expect(wrote(dry.awsCalls())).toBe(false);
  });

  it('refuses any identity but the directly authenticated footbag-operator user', () => {
    const res = run(['--target', 'staging', '--dry-run'], {
      arn: 'arn:aws:sts::000000000000:assumed-role/FootbagDevTester/someone',
    });
    expect(res.status).toBe(1);
    expect(res.out).toContain('assumed role');
    expect(res.awsCalls().filter((c) => c.startsWith('ssm '))).toEqual([]);
  });

  it('refuses a parameter that does not exist rather than reading it as the crawl', () => {
    // The archive stack declares the parameter, so its absence means the stack
    // is not what the switch expects; switching would vouch for nothing.
    const res = run(['--target', 'staging', '--dry-run'], { param: `fail:${awsFailure('ParameterNotFound', 'GetParameter')}` });
    expect(res.status).toBe(1);
    expect(res.out).toContain('/footbag/staging/archive-source does not exist');
    expect(wrote(res.awsCalls())).toBe(false);
  });

  it('refuses a failed read with the AWS message', () => {
    const res = run(['--target', 'staging', '--dry-run'], { param: `fail:${awsFailure('AccessDeniedException', 'GetParameter')}` });
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/could not read \/footbag\/staging\/archive-source: .*AccessDeniedException/);
    expect(wrote(res.awsCalls())).toBe(false);
  });

  it('refuses a value that is neither "crawl" nor "bucket"', () => {
    const res = run(['--target', 'staging', '--dry-run'], { param: 'Crawl' });
    expect(res.status).toBe(1);
    expect(res.out).toContain("reads 'Crawl', which is neither");
    expect(wrote(res.awsCalls())).toBe(false);
  });

  it('reports an environment already switched as done and changes nothing', () => {
    // Defect caught: a re-run that repeats the backfill or the write, or that
    // refuses the finished state instead of proving it.
    const res = run(['--target', 'production'], { param: 'bucket' });
    expect(res.status, res.out).toBe(0);
    expect(res.out).toContain('already the source of truth');
    expect(wrote(res.awsCalls())).toBe(false);
    expect(res.sequence().filter((l) => l.startsWith('backfill'))).toEqual([]);
  });

  it('refuses with no terminal to confirm on, and writes nothing', () => {
    const res = run(['--target', 'staging']);
    expect(res.status).toBe(1);
    expect(res.out).toContain('no terminal to confirm on');
    expect(res.param()).toBe('crawl');
    expect(wrote(res.awsCalls())).toBe(false);
  });
});

describe('archive-source-switch.sh: production waits for the cold-copy rule', () => {
  // Each case drops one property the rule must have. Without it, an edit made
  // after the switch could be lost for good: no copy at all, a copy a deletion
  // hides, a copy of only part of the bucket, or a copy in another bucket.
  const refused: Array<[string, string]> = [
    ['no replication configuration at all', `fail:${awsFailure('ReplicationConfigurationNotFoundError', 'GetBucketReplication')}`],
    ['only the rule to the second-region replica', replication([drRule])],
    ['a rule with the right settings aimed at another bucket', replication([drRule, coldRule({ Destination: { Bucket: 'arn:aws:s3:::someone-elses-bucket', StorageClass: 'DEEP_ARCHIVE' } })])],
    ['a cold-copy rule that carries delete markers', replication([drRule, coldRule({ DeleteMarkerReplication: { Status: 'Enabled' } })])],
    ['a cold-copy rule in another storage class', replication([drRule, coldRule({ Destination: { Bucket: COLD, StorageClass: 'GLACIER' } })])],
    ['a cold-copy rule that is disabled', replication([drRule, coldRule({ Status: 'Disabled' })])],
    ['a cold-copy rule over one prefix only', replication([drRule, coldRule({ Filter: { Prefix: 'events/' } })])],
  ];
  for (const [what, config] of refused) {
    it(`refuses ${what}, naming the Terraform gate`, () => {
      const res = run(['--target', 'production', '--dry-run'], { replication: config });
      expect(res.status).toBe(1);
      expect(res.out).toContain('apply terraform/production with the archive cold-copy replication rule');
      expect(res.sequence().filter((l) => l.startsWith('backfill'))).toEqual([]);
      expect(wrote(res.awsCalls())).toBe(false);
    });
  }

  it('refuses a failed read of the configuration with the AWS message', () => {
    const res = run(['--target', 'production', '--dry-run'], { replication: `fail:${awsFailure('AccessDenied', 'GetBucketReplication')}` });
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/could not read .*replication configuration: .*AccessDenied/);
  });

  it('lets a valid rule through to the backfill dry run, and writes nothing', () => {
    const res = run(['--target', 'production', '--dry-run']);
    expect(res.status, res.out).toBe(0);
    expect(res.awsCalls()).toContain(`s3api get-bucket-replication --bucket ${ARCHIVE} --region us-east-1 --output json`);
    expect(res.sequence().filter((l) => l.startsWith('backfill'))).toEqual([
      'backfill --target production --source archive-cold-copy --dry-run',
    ]);
    expect(res.param()).toBe('crawl');
    expect(wrote(res.awsCalls())).toBe(false);
  });
});

describe('archive-source-switch.sh: the switch, driven at a terminal', () => {
  it.skipIf(!HAS_SCRIPT)('writes nothing unless APPLY is typed', () => {
    const res = atTerminal('staging', 'yes');
    expect(res.status).toBe(1);
    expect(res.param()).toBe('crawl');
    expect(wrote(res.awsCalls())).toBe(false);
  });

  it.skipIf(!HAS_SCRIPT)('switches staging with no backfill, and proves it by reading the value back', () => {
    const res = atTerminal('staging', 'APPLY');
    expect(res.status, res.out).toBe(0);
    expect(res.param()).toBe('bucket');
    expect(res.awsCalls().filter((c) => c.startsWith('ssm put-parameter'))).toEqual([
      'ssm put-parameter --name /footbag/staging/archive-source --value bucket --type String --tier Standard --overwrite --region us-east-1',
    ]);
    // The read-back follows the write.
    const ssm = res.awsCalls().filter((c) => c.startsWith('ssm '));
    expect(ssm.map((c) => c.split(' ')[1])).toEqual(['get-parameter', 'put-parameter', 'get-parameter']);
    expect(res.sequence().filter((l) => l.startsWith('backfill'))).toEqual([]);
    expect(res.out).toContain('a cold copy of the staging archive: staging has none');
  });

  it.skipIf(!HAS_SCRIPT)('backfills the production cold copy before it writes the switch', () => {
    // Defect caught: the switch taken before the archive as it stood reached the
    // cold copy, so the bucket becomes the only source with nothing to roll
    // back to for any object an edit later changes.
    const res = atTerminal('production', 'APPLY');
    expect(res.status, res.out).toBe(0);
    expect(res.param()).toBe('bucket');
    const order = res.sequence().filter((l) => l.startsWith('backfill') || l.startsWith('aws ssm put-parameter'));
    expect(order.map((l) => l.split(' ').slice(0, 3).join(' '))).toEqual([
      'backfill --target production',
      'aws ssm put-parameter',
    ]);
    expect(order[0]).toBe('backfill --target production --source archive-cold-copy');
  });

  it.skipIf(!HAS_SCRIPT)('leaves production on the crawl when the backfill fails', () => {
    const res = atTerminal('production', 'APPLY', { backfillStatus: 1 });
    expect(res.status).toBe(1);
    expect(res.out).toContain("still reads 'crawl'");
    expect(res.param()).toBe('crawl');
    expect(wrote(res.awsCalls())).toBe(false);
  });

  it.skipIf(!HAS_SCRIPT)('fails when the value read back is not "bucket", though the write reported success', () => {
    // Defect caught: a switch judged by the write's exit status, which leaves the
    // publish free to overwrite edits while the run reports done.
    const res = atTerminal('staging', 'APPLY', { putIsNoop: true });
    expect(res.status).toBe(1);
    expect(res.out).toContain("reads 'crawl' after the write, not 'bucket'");
  });
});
