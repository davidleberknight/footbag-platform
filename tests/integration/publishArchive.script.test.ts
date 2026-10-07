/**
 * Integration tests for scripts/publish-archive.sh.
 *
 * The publisher is the single repeatable way the legacy mirror becomes the
 * members-only archive. Its post-publish checks decide whether the CDN is
 * invalidated, which is what makes the bucket's contents public, so the suite
 * drives the whole run against stand-ins rather than reading the script: a
 * fixture mirror in a scratch directory, a stand-in AWS CLI that logs every call
 * and answers listings from a file the case writes, a stand-in Terraform, and
 * stand-ins for the mirror verifier and the edge proof. Nothing real is reached
 * or mutated.
 *
 * The stand-in listing is in the plain `aws s3 ls --recursive` line shape (date,
 * time, size, key), modelled on the example output in the AWS CLI reference for
 * `s3 ls`, not captured from a live run. The script reads the key as the fourth
 * whitespace field; the happy-path case shows a listing in that shape parses to
 * the keys it names, so a parser that matched nothing would fail there.
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
const SCRIPT = 'scripts/publish-archive.sh';
const VERIFY_MIRROR = path.join(REPO_ROOT, 'legacy_data', 'legacy_mirror', 'verify_mirror.sh');

/** A session with no controlling terminal, as a scheduled job or agent has. */
const SETSID = requireToolInCI('setsid', '--version');

const MANIFESTS = ['sitemap.txt', 'redirect_map.json', 'skipped_videos.json', 'skipped_videos_summary.txt'];

let root: string;
let mirror: string;
let stubKey: string;
let caseCount = 0;

function writeExec(file: string, body: string) {
  fs.writeFileSync(file, body, { mode: 0o755 });
}

beforeAll(() => {
  root = createScratchDir('publish-archive');
  // The signing key's readability is checked before anything else; no case
  // here reaches the real edge proof, so any readable file stands in.
  stubKey = path.join(root, 'archive-signing-key-staging.pem');
  fs.writeFileSync(stubKey, 'not a key; the edge proof is a stand-in here\n', { mode: 0o600 });

  // A complete mirror root: the www subtree plus the four crawl manifests.
  mirror = path.join(root, 'mirror');
  const www = path.join(mirror, 'www.footbag.org');
  fs.mkdirSync(www, { recursive: true });
  for (const m of MANIFESTS) fs.writeFileSync(path.join(mirror, m), 'manifest\n');
  fs.writeFileSync(path.join(www, 'index.html'), '<html><head><meta charset="utf-8"></head><body>archive</body></html>\n');
  fs.writeFileSync(path.join(www, 'photo.jpg'), 'jpeg bytes');
  fs.writeFileSync(path.join(www, 'photo.jpg.sanitized'), '');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

interface RunOpts {
  /** Lines the stand-in returns for every `s3 ls`. */
  listing?: string[];
  /** Extra environment for the run. */
  env?: Record<string, string>;
  /** Run with no controlling terminal. */
  noTerminal?: boolean;
  /** Replace the stand-in mirror verifier. */
  treeVerifier?: string;
}

/**
 * One isolated case directory: its own stand-ins and call log, so cases cannot
 * read each other's calls.
 */
function runPublish(args: string[], opts: RunOpts = {}) {
  const dir = path.join(root, `case-${++caseCount}`);
  fs.mkdirSync(dir);
  const calls = path.join(dir, 'aws-calls.log');
  const edgeCalls = path.join(dir, 'edge-calls.log');
  const listing = path.join(dir, 'listing.txt');
  fs.writeFileSync(listing, (opts.listing ?? []).map((l) => `${l}\n`).join(''));

  const aws = path.join(dir, 'aws');
  writeExec(aws, [
    '#!/usr/bin/env bash',
    'printf "%s\\n" "$*" >> "$STUB_AWS_CALLS"',
    'case "$1 $2" in',
    '  "s3 ls") cat "$STUB_LISTING" ;;',
    '  "s3 sync"|"s3 rm"|"s3api head-object") ;;',
    '  "cloudfront create-invalidation") echo I-STUBINVALIDATION ;;',
    '  *) echo "unexpected aws invocation: $*" >&2; exit 64 ;;',
    'esac',
  ].join('\n'));

  const terraform = path.join(dir, 'terraform');
  writeExec(terraform, [
    '#!/usr/bin/env bash',
    'case "${*: -1}" in',
    '  archive_bucket_name) echo footbag-archive-stub ;;',
    '  archive_distribution_id) echo EDISTRIBUTIONSTUB ;;',
    '  *) exit 1 ;;',
    'esac',
  ].join('\n'));

  // The real verifier's output shape for a passed check: two-space indent,
  // status word, check name.
  const tree = path.join(dir, 'verify-tree');
  writeExec(tree, '#!/usr/bin/env bash\necho "  PASS  no excluded surface survived"\n');

  const edge = path.join(dir, 'verify-edge');
  writeExec(edge, '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$STUB_EDGE_CALLS"\n');

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...awsIdentityStubEnv(dir),
    FOOTBAG_AWS_BIN: aws,
    FOOTBAG_TERRAFORM_BIN: terraform,
    PUBLISH_ARCHIVE_TREE_VERIFIER: opts.treeVerifier ?? tree,
    PUBLISH_ARCHIVE_EDGE_VERIFIER: edge,
    STUB_AWS_CALLS: calls,
    STUB_EDGE_CALLS: edgeCalls,
    STUB_LISTING: listing,
    ...opts.env,
  };
  const argv = [SCRIPT, '--signing-key', stubKey, '--mirror-root', mirror, ...args];
  const [command, full] = opts.noTerminal ? ['setsid', ['--wait', 'bash', ...argv]] : ['bash', argv];
  const res = spawnSync(command, full, { cwd: REPO_ROOT, env, encoding: 'utf-8', ...SPAWN_GUARD });
  const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : []);
  return { ...res, awsCalls: read(calls), edgeCalls: read(edgeCalls) };
}

/** `aws s3 ls --recursive` line shape: date, time, size, key. */
const ls = (key: string) => `2026-01-01 00:00:00        123 ${key}`;
const HEALTHY = [ls('_gate/denied.html'), ls('_gate/not-found.html'), ls('index.html'), ls('photo.jpg')];

function invalidated(calls: string[]) {
  return calls.some((c) => c.startsWith('cloudfront create-invalidation'));
}

describe('publish-archive.sh refuses before it can publish the wrong thing', () => {
  function bare(args: string[]) {
    return spawnSync('bash', [SCRIPT, ...args], { cwd: REPO_ROOT, encoding: 'utf-8', ...SPAWN_GUARD });
  }

  it('names no environment by default', () => {
    // Naming the environment is the publish, so there is nothing safe to assume.
    const res = bare([]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("--target must be 'staging' or 'production'");
  });

  it('refuses an environment it does not know', () => {
    const res = bare(['--target', 'prod']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("--target must be 'staging' or 'production'");
  });

  it('refuses an unreadable signing key before it syncs anything', () => {
    // The key signs the edge proof at the very end of the run. Discovered there,
    // an unreadable one would fail a publish whose bucket is already written and
    // whose cache is already cleared, so the check belongs ahead of the sync.
    const res = runPublish(['--target', 'staging', '--signing-key', path.join(root, 'absent.pem')]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('signing key not readable');
    expect(res.awsCalls).toEqual([]);
  });

  it('refuses a source that is not a mirror root', () => {
    // The sync ships the contents of the www subtree; pointed one level off, it
    // would ship the crawl manifests, and sitemap.txt carries the crawling
    // workstation's filesystem paths.
    const res = runPublish(['--target', 'staging', '--mirror-root', path.join(root, 'nonexistent')]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('www.footbag.org is missing');
    expect(res.awsCalls).toEqual([]);
  });
});

describe('publish-archive.sh: a staging publish, driven end to end', () => {
  it('syncs, verifies the bucket, invalidates once and runs the edge proof', () => {
    const res = runPublish(['--target', 'staging'], { listing: HEALTHY });
    expect(res.status, res.stderr).toBe(0);
    // A run through stand-ins says so, or its output could be taken for proof.
    for (const seam of ['the AWS CLI', 'Terraform', 'the mirror verifier', 'the edge proof']) {
      expect(res.stderr, seam).toContain(`NOTE: using a stand-in for ${seam}`);
    }
    // A size-only comparison never uploads an edit that keeps a file's length, so
    // the archive would keep serving the old page with nothing reported.
    const sync = res.awsCalls.filter((c) => c.startsWith('s3 sync'));
    expect(sync).toHaveLength(1);
    expect(sync[0]).not.toContain('--size-only');
    expect(sync[0]).toContain('--delete');
    expect(sync[0]).toContain('s3://footbag-archive-stub/');
    // The listing parsed to its keys: nothing in a healthy bucket was taken
    // for stale.
    expect(res.awsCalls.filter((c) => c.startsWith('s3 rm'))).toEqual([]);
    expect(res.awsCalls.filter((c) => c.startsWith('cloudfront create-invalidation'))).toEqual([
      'cloudfront create-invalidation --distribution-id EDISTRIBUTIONSTUB --paths /* --query Invalidation.Id --output text',
    ]);
    expect(res.edgeCalls).toEqual([`--target staging --signing-key ${stubKey}`]);
  });

  it('withholds the invalidation when a crawl manifest is still in the bucket after the publish', () => {
    // sitemap.txt carries the crawling workstation's filesystem paths. The stand-in
    // bucket keeps it although the run asked to remove it, which is the outcome
    // the check exists to catch: a removal that was invoked is not one that took.
    // The listing is at the real archive's scale (tens of thousands of keys) with
    // the leak in the middle, the shape that once made a piped `grep -q` close
    // early and the check report nothing.
    const filler = Array.from({ length: 40_000 }, (_, i) => ls(`_gate/filler-${String(i).padStart(5, '0')}.html`));
    const listing = [...HEALTHY, ...filler.slice(0, 20_000), ls('sitemap.txt'), ...filler.slice(20_000)];
    const res = runPublish(['--target', 'staging'], { listing });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('crawl manifest published to the bucket root: sitemap.txt');
    expect(res.stderr).toContain('NOT invalidating');
    expect(invalidated(res.awsCalls)).toBe(false);
    expect(res.edgeCalls).toEqual([]);
  });

  it('withholds the invalidation when a sidecar key is still in the bucket after the publish', () => {
    const res = runPublish(['--target', 'staging'], { listing: [...HEALTHY, ls('photo.jpg.sanitized')] });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('.sanitized sidecar keys present in the bucket');
    expect(invalidated(res.awsCalls)).toBe(false);
    expect(res.edgeCalls).toEqual([]);
  });

  it('refuses before reaching the bucket when the mirror verifier runs without the committee exclusion list', () => {
    // The real verifier, copied into a layout whose private checkout is absent,
    // with a stand-in interpreter. Without that list its excluded-surface check
    // used to read ok while checking less, and the publish went ahead.
    const layout = path.join(root, 'verifier-layout');
    const mirrorDir = path.join(layout, 'legacy_data', 'legacy_mirror');
    fs.mkdirSync(path.join(layout, 'legacy_data', 'footbag_venv', 'bin'), { recursive: true });
    fs.mkdirSync(mirrorDir, { recursive: true });
    fs.copyFileSync(VERIFY_MIRROR, path.join(mirrorDir, 'verify_mirror.sh'));
    fs.writeFileSync(path.join(mirrorDir, 'member_area_exclusions.txt'), '');
    fs.writeFileSync(path.join(mirrorDir, 'superseded_feature_exclusions.txt'), '');
    writeExec(path.join(layout, 'legacy_data', 'footbag_venv', 'bin', 'python'), '#!/usr/bin/env bash\necho "  PASS  no excluded surface survived"\n');

    const res = runPublish(['--target', 'staging'], {
      listing: HEALTHY,
      treeVerifier: path.join(mirrorDir, 'verify_mirror.sh'),
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('CRAWL_EXCLUSIONS.txt');
    expect(res.stderr).toContain('the capture did not pass verification');
    expect(res.awsCalls).toEqual([]);
  });
});

describe('publish-archive.sh: production is confirmed by a person at a terminal', () => {
  it.skipIf(!SETSID)('refuses production with no terminal and calls no AWS, even with the accept flag exported', () => {
    // Replacing what the public archive serves is a production deploy. An exported
    // accept flag is ambient state from whichever shell launched the run, and must
    // not stand in for a typed APPLY.
    const res = runPublish(['--target', 'production'], {
      listing: HEALTHY,
      noTerminal: true,
      env: { ASSUME_YES: 'yes' },
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no terminal to confirm on');
    expect(res.stderr).toContain('nothing was uploaded, deleted, or invalidated');
    expect(res.awsCalls).toEqual([]);
    expect(res.edgeCalls).toEqual([]);
  });

  it.skipIf(!SETSID)('rehearses production with --dry-run without asking, and changes nothing', () => {
    const res = runPublish(['--target', 'production', '--dry-run'], { listing: HEALTHY, noTerminal: true });
    expect(res.status, res.stderr).toBe(0);
    expect(res.stderr).not.toContain('no terminal to confirm on');
    const sync = res.awsCalls.filter((c) => c.startsWith('s3 sync'));
    expect(sync).toHaveLength(1);
    expect(sync[0]).toContain('--dryrun');
    expect(res.awsCalls.filter((c) => c.startsWith('s3 rm'))).toEqual([]);
    expect(invalidated(res.awsCalls)).toBe(false);
  });
});
