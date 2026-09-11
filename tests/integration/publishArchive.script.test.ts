/**
 * Integration tests for scripts/publish-archive.sh.
 *
 * The publisher is the single repeatable way the legacy mirror becomes the
 * members-only archive, and it had no companion suite of any kind. What is
 * pinned here is what can be pinned without driving a real publish: the
 * argument and source refusals, which happen before it reaches AWS, and the
 * shape of the post-publish verification that decides whether to invalidate.
 *
 * A full drive of the mutating path needs a fixture mirror tree, a stand-in
 * Terraform and a stand-in aws, and it does not exist yet; the refusals below
 * are the floor, not the whole contract.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = 'scripts/publish-archive.sh';

/**
 * A stand-in for the operator's archive signing key: a readable file, and nothing
 * more, because no refusal below reaches the point where the key is used.
 *
 * It has to exist because the key's readability is checked ahead of the source
 * checks, deliberately: an unreadable key discovered after the sync would fail a
 * publish whose bucket is already written. Left to the operator's own key, the
 * source refusals below would be reached on a maintainer's workstation and not on
 * a clean checkout, where the run would stop on the missing key instead.
 */
let keyDir: string;
let stubKey: string;

beforeAll(() => {
  keyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-publish-archive-'));
  stubKey = path.join(keyDir, 'archive-signing-key-staging.pem');
  fs.writeFileSync(stubKey, 'not a key; this run never reaches the proof\n', { mode: 0o600 });
});

afterAll(() => {
  fs.rmSync(keyDir, { recursive: true, force: true });
});

function run(args: string[]) {
  return spawnSync('bash', [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
}

describe('publish-archive.sh refuses before it can publish the wrong thing', () => {
  it('names no environment by default', () => {
    // Naming the environment is the publish, so there is nothing safe to assume.
    const res = run([]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("--env must be 'staging' or 'production'");
  });

  it('refuses an environment it does not know', () => {
    const res = run(['--env', 'prod']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("--env must be 'staging' or 'production'");
  });

  it('refuses an unreadable signing key before it syncs anything', () => {
    // The key signs the edge proof at the very end of the run. Discovered there,
    // an unreadable one would fail a publish whose bucket is already written and
    // whose cache is already cleared, so the check belongs ahead of the sync.
    const res = run(['--env', 'staging', '--signing-key', path.join(keyDir, 'absent.pem')]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('signing key not readable');
  });

  it('refuses a source that is not a mirror root', () => {
    // The sync ships the contents of the www subtree; pointed one level off, it
    // would ship the crawl manifests, and sitemap.txt carries the crawling
    // workstation's filesystem paths.
    const res = run([
      '--env', 'staging',
      '--signing-key', stubKey,
      '--mirror-root', '/nonexistent/tree',
    ]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('/nonexistent/tree/www.footbag.org is missing');
  });
});

describe('publish-archive.sh post-publish verification can actually fail', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, SCRIPT), 'utf8');
  const verification = source.slice(source.indexOf('Bucket after:'), source.indexOf('Invalidation'));

  it('reads the key column without piping a producer into an early-exiting grep', () => {
    // The manifest check piped awk into `grep -qx`. On a real listing the leaked
    // key sorts into the middle, so grep matched, exited, closed the pipe, and awk
    // died on SIGPIPE with most of the listing unwritten; under pipefail that
    // became the answer, and the check reported no leak in the one case it exists
    // for. Measured on a 40,001-line listing: missed on every run as written,
    // caught on every run as a here-string.
    expect(verification).not.toMatch(/\|\s*grep -q/);
    expect(verification).toMatch(/grep -qx "\$manifest" <<< "\$\(awk '\{print \$4\}' "\$AFTER_LISTING"\)"/);
  });

  it('refuses the invalidation when any verification finding stands', () => {
    // The invalidation is what makes the bucket's contents public, so a finding
    // has to stop the run rather than be printed on the way past it.
    expect(verification).toMatch(/fail=1/);
    expect(verification).toMatch(/NOT invalidating/);
    expect(verification).toMatch(/exit 1/);
  });
});
