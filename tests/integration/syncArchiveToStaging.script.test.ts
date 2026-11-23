/**
 * Integration tests for scripts/sync-archive-to-staging.sh.
 *
 * The script replaces staging's Legacy Archive bucket with production's, inside
 * AWS, and its own comparison of the two buckets afterwards decides whether
 * staging's edge cache is invalidated. So the suite drives whole runs against
 * stand-ins: a stand-in AWS CLI that keeps each bucket's listing in a file and
 * whose sync rewrites staging's listing the way a server-side sync with
 * --delete and a _gate/ exclusion would, a stand-in Terraform, and a stand-in
 * edge proof. Nothing real is reached or mutated.
 *
 * The listings are in the plain `aws s3 ls --recursive` line shape (date, time,
 * size, key), modelled on the example output in the AWS CLI reference for
 * `s3 ls`, not captured from a live run. The happy path shows such a listing
 * parses: staging's stale key is named in the preview and production's keys
 * compare equal afterwards, which a parser matching nothing could not produce.
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
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'sync-archive-to-staging.sh');
const HAS_SCRIPT = requireToolInCI('script', '--version');

const PROD = 'footbag-production-archive';
const STAGING = 'footbag-staging-archive';
const STAGING_DIST = 'ESTAGINGARCHIVE';

/** `aws s3 ls --recursive` line shape: date, time, size, key. */
const ls = (key: string, size = 123) => `2026-01-01 00:00:00 ${String(size).padStart(10)} ${key}`;
const PROD_GATES = [ls('_gate/denied.html', 900), ls('_gate/not-found.html', 800)];
/** Staging's gate pages carry staging's platform URL, so their sizes differ from production's. */
const GATES = [ls('_gate/denied.html', 910), ls('_gate/not-found.html', 810)];
const PROD_LISTING = [...PROD_GATES, ls('index.html', 500), ls('members/page.html', 700)];
/** Staging before the run: an older page size, a key production no longer holds, its own gate pages. */
const STAGING_LISTING = [...GATES, ls('index.html', 400), ls('retired.html', 50)];

let root: string;
let caseCount = 0;

beforeAll(() => {
  root = createScratchDir('sync-archive-to-staging');
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeExec(file: string, body: string) {
  fs.writeFileSync(file, body, { mode: 0o755 });
}

interface RunOpts {
  /** The ARN the identity proof resolves to. */
  arn?: string;
  /** Run at a terminal through `script`, typing this. */
  typed?: string;
  /** Leave the signing key out. */
  noSigningKey?: boolean;
  /** Keys that `s3api head-object` reports missing, as bucket/key. */
  missing?: string[];
  /** The stand-in sync copies and deletes nothing, as a sync that silently failed would. */
  syncChangesNothing?: boolean;
  /** The stand-in sync completes the copy, then reports a failed copy and exits 1. */
  syncFails?: boolean;
  /** Terraform names this bucket for staging. */
  stagingBucket?: string;
  /** The stand-in edge proof exits with this status. */
  edgeStatus?: number;
  env?: Record<string, string>;
}

function run(args: string[], opts: RunOpts = {}) {
  const dir = path.join(root, `case-${++caseCount}`);
  const home = path.join(dir, 'home');
  fs.mkdirSync(path.join(home, 'AWS'), { recursive: true });
  const key = path.join(home, 'AWS', 'archive-signing-key-staging.pem');
  if (!opts.noSigningKey) fs.writeFileSync(key, 'not a key; the edge proof is a stand-in\n', { mode: 0o600 });

  const calls = path.join(dir, 'aws-calls.log');
  const edgeCalls = path.join(dir, 'edge-calls.log');
  const stagingBucket = opts.stagingBucket ?? STAGING;
  fs.writeFileSync(path.join(dir, `ls-${PROD}`), PROD_LISTING.map((l) => `${l}\n`).join(''));
  if (stagingBucket !== PROD) {
    fs.writeFileSync(path.join(dir, `ls-${stagingBucket}`), STAGING_LISTING.map((l) => `${l}\n`).join(''));
  }
  fs.writeFileSync(path.join(dir, 'missing'), (opts.missing ?? []).map((m) => `${m}\n`).join(''));

  const aws = path.join(dir, 'aws');
  writeExec(aws, [
    '#!/usr/bin/env bash',
    'printf "%s\\n" "$*" >> "$STUB_AWS_CALLS"',
    `D=${JSON.stringify(dir)}`,
    'case "$1 $2" in',
    '  "s3api head-object") grep -Fxq "$4/$6" "$D/missing" && { echo "An error occurred (404) when calling the HeadObject operation: Not Found" >&2; exit 254; }; exit 0 ;;',
    '  "s3 ls") b="${3#s3://}"; cat "$D/ls-${b%/}" ;;',
    '  "s3 sync")',
    '    src="${3#s3://}"; src="${src%/}"; dst="${4#s3://}"; dst="${dst%/}"',
    '    if [[ " $* " == *" --dryrun "* ]]; then echo "(dryrun) copy: s3://$src/members/page.html to s3://$dst/members/page.html"; exit 0; fi',
    opts.syncChangesNothing
      ? '    exit 0 ;;'
      : '    { grep " _gate/" "$D/ls-$dst"; grep -v " _gate/" "$D/ls-$src"; } > "$D/ls-$dst.new"; mv "$D/ls-$dst.new" "$D/ls-$dst"; echo "copy: s3://$src/index.html to s3://$dst/index.html";'
        + (opts.syncFails
          ? ' echo "copy failed: s3://$src/members/page.html to s3://$dst/members/page.html An error occurred (AccessDenied) when calling the CopyObject operation: stub"; exit 1 ;;'
          : ' exit 0 ;;'),
    '  "cloudfront create-invalidation") echo I-STUBINVALIDATION ;;',
    '  *) echo "unexpected aws invocation: $*" >&2; exit 64 ;;',
    'esac',
  ].join('\n'));

  const terraform = path.join(dir, 'terraform');
  writeExec(terraform, [
    '#!/usr/bin/env bash',
    'case "$1:${*: -1}" in',
    `  *terraform/production:archive_bucket_name) echo ${PROD} ;;`,
    `  *terraform/staging:archive_bucket_name) echo ${stagingBucket} ;;`,
    `  *terraform/staging:archive_distribution_id) echo ${STAGING_DIST} ;;`,
    '  *) echo "no such output" >&2; exit 1 ;;',
    'esac',
  ].join('\n'));

  const edge = path.join(dir, 'verify-edge');
  writeExec(edge, `#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$STUB_EDGE_CALLS"\nexit ${opts.edgeStatus ?? 0}\n`);

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...awsIdentityStubEnv(dir, opts.arn ? { arn: opts.arn } : {}),
    HOME: home,
    FOOTBAG_AWS_BIN: aws,
    FOOTBAG_TERRAFORM_BIN: terraform,
    SYNC_ARCHIVE_EDGE_VERIFIER: edge,
    STUB_AWS_CALLS: calls,
    STUB_EDGE_CALLS: edgeCalls,
    FOOTBAG_CR_REPORT_TO: '',
    ...opts.env,
  };

  let status: number | null;
  let out: string;
  if (opts.typed !== undefined) {
    const inner = ['bash', JSON.stringify(SCRIPT), ...args.map((a) => JSON.stringify(a)), '</dev/null'].join(' ');
    const r = spawnSync('script', ['-qec', `${inner}; echo "EXIT=$?"`, '/dev/null'], {
      encoding: 'utf-8', input: opts.typed, env, ...SPAWN_GUARD,
    });
    out = r.stdout ?? '';
    const m = out.match(/EXIT=(\d+)/);
    status = m ? Number(m[1]) : -1;
  } else {
    const r = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf-8', input: '', env, ...SPAWN_GUARD });
    status = r.status;
    out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  }
  const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : []);
  return {
    status,
    out,
    awsCalls: read(calls),
    edgeCalls: read(edgeCalls),
    stagingListing: read(path.join(dir, `ls-${stagingBucket}`)),
    key,
  };
}

const syncs = (calls: string[]) => calls.filter((c) => c.startsWith('s3 sync'));
const invalidations = (calls: string[]) => calls.filter((c) => c.startsWith('cloudfront create-invalidation'));

describe('sync-archive-to-staging.sh refuses before it copies anything', () => {
  it('refuses an argument it does not know, such as a target it never takes', () => {
    // Defect caught: a --target flag accepted and ignored would let an operator
    // believe they had chosen the direction, which is fixed.
    const res = run(['--target', 'production']);
    expect(res.status).toBe(2);
    expect(res.out).toContain('unknown argument: --target');
    expect(res.awsCalls).toEqual([]);
  });

  it('refuses an unreadable staging signing key before any call to AWS', () => {
    // Defect caught: the edge proof runs after staging has already been
    // replaced, so a missing key found there fails a run whose damage is done.
    const res = run([], { noSigningKey: true });
    expect(res.status).toBe(1);
    expect(res.out).toContain('signing key is not readable');
    expect(res.awsCalls).toEqual([]);
  });

  it('refuses a dev-and-tester role session, which reads production but writes no bucket', () => {
    // Defect caught: a role session would pass the production reads, then fail
    // part way through the copy with staging half replaced.
    const res = run(['--dry-run'], { arn: 'arn:aws:sts::000000000000:assumed-role/FootbagDevTester/jane_doe' });
    expect(res.status).toBe(1);
    expect(res.out).toContain('which is an assumed role');
    expect(res.awsCalls).toEqual([]);
  });

  it('refuses when production has no landing page, so an empty production cannot empty staging', () => {
    const res = run(['--dry-run'], { missing: [`${PROD}/index.html`] });
    expect(res.status).toBe(1);
    expect(res.out).toContain("production's archive has no landing page");
    expect(syncs(res.awsCalls)).toEqual([]);
  });

  it('refuses when both trees name the same bucket, where --delete would act on the source', () => {
    const res = run(['--dry-run'], { stagingBucket: PROD });
    expect(res.status).toBe(1);
    expect(res.out).toContain('name the same archive bucket');
    expect(syncs(res.awsCalls)).toEqual([]);
  });

  it('refuses with no terminal to type APPLY on, even with the accept flag exported', () => {
    // Defect caught: ambient state from the launching shell standing in for the
    // operator's typed confirmation of a destructive replace.
    const res = run([], { env: { ASSUME_YES: 'yes' } });
    expect(res.status).toBe(1);
    expect(res.out).toContain('no terminal to confirm on');
    expect(res.out).toContain('nothing was copied, deleted, or invalidated');
    expect(syncs(res.awsCalls)).toEqual([]);
    expect(invalidations(res.awsCalls)).toEqual([]);
  });
});

describe('sync-archive-to-staging.sh: a dry run changes nothing', () => {
  it('previews the staging keys production lacks, never a _gate/ key, and asks nothing', () => {
    // Defect caught: a preview that counted staging's own gate pages as stale
    // would tell the operator the run deletes them.
    const res = run(['--dry-run']);
    expect(res.status, res.out).toBe(0);
    expect(res.out).toContain('to be removed: 1');
    expect(res.out).toMatch(/^ {2}retired\.html$/m);
    expect(res.out).not.toMatch(/^ {2}_gate\//m);
    expect(res.out).not.toContain('Type APPLY');
    const sync = syncs(res.awsCalls);
    expect(sync).toHaveLength(1);
    expect(sync[0]).toContain('--dryrun');
    expect(invalidations(res.awsCalls)).toEqual([]);
    expect(res.edgeCalls).toEqual([]);
  });
});

describe.skipIf(!HAS_SCRIPT)('sync-archive-to-staging.sh: an applied run, driven end to end', () => {
  it('copies production over staging inside S3, proves they match, invalidates staging once and runs the edge proof', () => {
    const res = run([], { typed: 'APPLY\n' });
    expect(res.status, res.out).toBe(0);
    for (const seam of ['the AWS CLI', 'Terraform', 'the edge proof']) {
      expect(res.out, seam).toContain(`NOTE: using a stand-in for ${seam}`);
    }
    const sync = syncs(res.awsCalls);
    expect(sync).toHaveLength(1);
    // Source first and destination second, both s3:// so the copy is
    // server-side; the reverse order would overwrite production from staging.
    expect(sync[0].startsWith(`s3 sync s3://${PROD}/ s3://${STAGING}/ `)).toBe(true);
    // Without --delete staging would keep pages production retired; without the
    // exclusion it would take production's gate pages, which point members at
    // production's platform.
    expect(sync[0]).toContain('--delete');
    expect(sync[0]).toContain('--exclude _gate/*');
    expect(sync[0]).toContain('--copy-props metadata-directive');
    expect(invalidations(res.awsCalls)).toEqual([
      `cloudfront create-invalidation --distribution-id ${STAGING_DIST} --paths /* --query Invalidation.Id --output text`,
    ]);
    expect(res.edgeCalls).toEqual([`--target staging --signing-key ${res.key}`]);
    // Staging's own gate pages survived; production's never replaced them.
    expect(res.stagingListing.filter((l) => l.includes(' _gate/'))).toEqual(GATES);
  });

  it('runs nothing when the operator types anything but APPLY', () => {
    const res = run([], { typed: 'yes\n' });
    expect(res.status).toBe(1);
    expect(res.out).toContain('Not confirmed');
    expect(syncs(res.awsCalls)).toEqual([]);
  });

  it('withholds the invalidation when staging still differs from production after the sync', () => {
    // Defect caught: a sync that exited 0 taken as proof, so the edge goes on
    // to serve a capture production does not hold.
    const res = run([], { typed: 'APPLY\n', syncChangesNothing: true });
    expect(res.status).toBe(1);
    expect(res.out).toContain('does not match production');
    expect(res.out).toContain('NOT invalidating');
    expect(invalidations(res.awsCalls)).toEqual([]);
    expect(res.edgeCalls).toEqual([]);
  });

  it('withholds the invalidation when the sync exits non-zero, even though keys and sizes then match', () => {
    // Defect caught: the comparison reads keys and sizes only, so a copy the CLI
    // reported failed (a same-size page or its content type left stale) would
    // pass it, and staging's edge would be invalidated onto a capture the
    // operator was never told is incomplete.
    const res = run([], { typed: 'APPLY\n', syncFails: true });
    expect(res.status).toBe(1);
    expect(res.out).toContain('the sync exited 1');
    expect(res.out).toContain('AccessDenied');
    expect(invalidations(res.awsCalls)).toEqual([]);
    expect(res.edgeCalls).toEqual([]);
  });

  it("withholds the invalidation when one of staging's gate pages is gone after the sync", () => {
    const res = run([], { typed: 'APPLY\n', missing: [`${STAGING}/_gate/not-found.html`] });
    expect(res.status).toBe(1);
    expect(res.out).toContain('gate page is missing after the sync: _gate/not-found.html');
    expect(invalidations(res.awsCalls)).toEqual([]);
  });

  it('fails the run when the staging edge proof fails', () => {
    const res = run([], { typed: 'APPLY\n', edgeStatus: 1 });
    expect(res.status).toBe(1);
    expect(res.out).toContain('edge proof failed');
  });
});
