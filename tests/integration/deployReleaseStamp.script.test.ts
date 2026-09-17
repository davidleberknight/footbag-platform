/**
 * The release stamp: proof that the tree about to be promoted is this run's.
 *
 * Before it, the root half checked that five paths existed and nothing more, and
 * the code said so itself: the sender resolves the directory and the root half is
 * handed the resolved value, so the two agree by construction even when the value
 * is wrong, and agreement is not evidence. What existence cannot answer is a tree
 * that is real but belongs to an earlier run — an upload that died part way leaves
 * every one of those five paths in place, holding the previous release.
 *
 * So the sender writes an identifier only this run knows, after its upload
 * finishes, and the root half refuses to promote a tree carrying anything else.
 * The ordering is the mechanism: a transfer interrupted before the stamp leaves a
 * directory that cannot be promoted at all.
 *
 * This is not a lock and nothing here serialises two deploys. It answers "is this
 * tree mine", which one operator can get wrong on their own.
 *
 * Neither remote body can source a library — they arrive on the target shell's
 * stdin — so the block is duplicated in both and a case below holds the copies
 * identical.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = process.cwd();
const CODE_HALF = join(REPO_ROOT, 'scripts/internal/deploy-code-remote.sh');
const REBUILD_HALF = join(REPO_ROOT, 'scripts/internal/deploy-rebuild-remote.sh');
const CODE_SENDER = join(REPO_ROOT, 'scripts/deploy-code.sh');
const REBUILD_SENDER = join(REPO_ROOT, 'scripts/deploy-rebuild.sh');

let scratch: string;
let releaseDir: string;

/**
 * The stamp block alone, lifted from a remote half: from the line that requires the
 * variable to the `fi` that closes the refusal. Sliced on its own text rather than
 * by line number so it survives the file around it moving.
 */
function stampBlock(file: string): string {
  const lines = readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith(': "${RELEASE_STAMP'));
  expect(start, `${file} carries the stamp requirement`).toBeGreaterThan(0);
  const end = lines.indexOf('fi', lines.findIndex((l, i) => i > start && l.startsWith('if [[ "$found_stamp"')));
  expect(end, `${file}'s stamp block closes`).toBeGreaterThan(start);
  return ['set -euo pipefail', ...lines.slice(start, end + 1)].join('\n');
}

function runStampBlock(file: string, env: NodeJS.ProcessEnv) {
  const path = join(scratch, 'stamp.sh');
  writeFileSync(path, stampBlock(file), 'utf8');
  const res = spawnSync('bash', [path], {
    encoding: 'utf-8',
    env: { ...process.env, RELEASE_DIR: releaseDir, ...env },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stderr: res.stderr ?? '' };
}

function writeStamp(value: string): void {
  writeFileSync(join(releaseDir, '.release-stamp'), `${value}\n`, 'utf8');
}

beforeEach(() => {
  scratch = createScratchDir('release-stamp');
  releaseDir = join(scratch, 'footbag-release');
  mkdirSync(releaseDir, { recursive: true });
});

afterEach(() => {
  removeScratch(scratch);
});

describe('the root half refuses to promote a tree that is not this run\'s', () => {
  it('refuses a tree carrying no stamp, and names what it found', () => {
    // An absent file is the ordinary case, not an error, so the refusal has to
    // distinguish it from a mismatch: "none" and another run's identifier send a
    // reader to different places.
    const r = runStampBlock(CODE_HALF, { RELEASE_STAMP: 'run-a' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/does not carry this run's release stamp/);
    expect(r.stderr).toMatch(/found 'none'/);
  });

  it('refuses a tree carrying another run\'s stamp', () => {
    writeStamp('run-b');
    const r = runStampBlock(CODE_HALF, { RELEASE_STAMP: 'run-a' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Expected 'run-a', found 'run-b'/);
  });

  it('promotes a tree whose stamp is this run\'s', () => {
    writeStamp('run-a');
    const r = runStampBlock(CODE_HALF, { RELEASE_STAMP: 'run-a' });
    expect(r.status, r.stderr).toBe(0);
  });

  it('refuses when the sender forgot to send a stamp at all', () => {
    writeStamp('run-a');
    const r = runStampBlock(CODE_HALF, {});
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/RELEASE_STAMP must be sent by the calling deploy script/);
  });

  it('holds the same three outcomes on the rebuild half, which also replaces the database', () => {
    writeStamp('run-b');
    expect(runStampBlock(REBUILD_HALF, { RELEASE_STAMP: 'run-a' }).status).toBe(1);
    writeStamp('run-a');
    expect(runStampBlock(REBUILD_HALF, { RELEASE_STAMP: 'run-a' }).status).toBe(0);
    expect(runStampBlock(REBUILD_HALF, {}).status).not.toBe(0);
  });

  it('keeps the two copies of the block identical', () => {
    // Duplicated because neither remote body can source a library. A divergence
    // would leave one promotion path checked and the other not, which is exactly
    // the shape that let the release directory disagree with itself for so long.
    expect(stampBlock(REBUILD_HALF)).toBe(stampBlock(CODE_HALF));
  });
});

describe('the senders stamp after uploading, and exclude the stamp from promotion', () => {
  it.each([
    ['scripts/deploy-code.sh', CODE_SENDER],
    ['scripts/deploy-rebuild.sh', REBUILD_SENDER],
  ])('%s writes the stamp only after its upload rsync', (_name, file) => {
    // Ordering is the mechanism, not tidiness: stamped before the upload, an
    // interrupted transfer would leave a promotable tree holding the last release.
    const content = readFileSync(file, 'utf8');
    const upload = content.indexOf('"$REPO_ROOT/" "$REMOTE:$REMOTE_RELEASE_DIR/"');
    // The write itself, not any mention of the name: a comment above the upload
    // would satisfy a looser search and prove nothing about the ordering.
    const stamp = content.indexOf("'$REMOTE_RELEASE_DIR/.release-stamp'");
    expect(upload).toBeGreaterThan(0);
    expect(stamp).toBeGreaterThan(upload);
    expect(content).toMatch(/printf 'RELEASE_STAMP=%q\\n'/);
  });

  it.each([
    ['scripts/internal/deploy-code-remote.sh', CODE_HALF],
    ['scripts/internal/deploy-rebuild-remote.sh', REBUILD_HALF],
  ])('%s keeps the stamp out of the live install', (_name, file) => {
    expect(readFileSync(file, 'utf8')).toMatch(/--exclude=\/\.release-stamp/);
  });
});
