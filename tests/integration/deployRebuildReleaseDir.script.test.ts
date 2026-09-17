/**
 * The rebuild deploy's release directory: resolved by the caller, required by the
 * root half, and never a literal on either side.
 *
 * The code deploy learned this first. Its two halves once disagreed — the caller
 * uploaded to the connecting account's home while root promoted a path naming the
 * shared account — so a deploy from a named account shipped whatever that shared
 * account last held and reported success. The fix was to resolve the directory once
 * and send it, and the root half refuses to run without it.
 *
 * The rebuild path did not follow. It carried the literal on both sides and defended
 * it by refusing any connecting account but the shared one, which stopped the
 * destructive success at the price of locking a named operator out of the rebuild
 * entirely. This is the same contract, now asserted for that path too, because the
 * rebuild is the one that replaces the live database: promoting a tree nobody named
 * costs the data as well as the code.
 *
 * The root half cannot be run whole from a test — it is root-only and host-only — so
 * the preamble is sliced and run under bash, which is the shape the migration suite
 * uses. The slice covers both guard handshakes and the release-directory contract,
 * and stops before anything that would touch a host.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = process.cwd();
const REMOTE_HALF = join(REPO_ROOT, 'scripts/internal/deploy-rebuild-remote.sh');

/** The guard handshakes the caller sets before streaming the body. */
const GUARDS_PASSED = { CUTOVER_GUARD_RAN: '1', PROD_LIVE_GUARD_RAN: '1' };

let scratch: string;

/**
 * Everything down to the line that derives the database path from the release
 * directory. Slicing on that line rather than a fixed count keeps the boundary
 * meaningful if the preamble grows: what is under test is the contract above it.
 */
function preamble(): string {
  const lines = readFileSync(REMOTE_HALF, 'utf8').split('\n');
  const end = lines.findIndex((l) => l.startsWith('NEW_DB='));
  expect(end, 'the NEW_DB assignment anchors the slice').toBeGreaterThan(0);
  return lines.slice(0, end + 1).join('\n');
}

function runPreamble(env: NodeJS.ProcessEnv) {
  const path = join(scratch, 'preamble.sh');
  writeFileSync(path, preamble(), 'utf8');
  const res = spawnSync('bash', [path], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stderr: res.stderr ?? '' };
}

beforeEach(() => {
  scratch = createScratchDir('rebuild-release-dir');
});

afterEach(() => {
  removeScratch(scratch);
});

describe('the rebuild root half requires the directory it is told to promote', () => {
  it('refuses when the caller sent no release directory', () => {
    // A default here cannot tell a caller that never sent the value from one that
    // sent an empty one, so it would answer a sender bug by promoting a directory
    // nobody named, over the live install and its database.
    const r = runPreamble({ ...GUARDS_PASSED });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/RELEASE_DIR must be sent by the calling deploy script/);
  });

  it('refuses an empty release directory as well as an absent one', () => {
    const r = runPreamble({ ...GUARDS_PASSED, RELEASE_DIR: '' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/RELEASE_DIR must be sent by the calling deploy script/);
  });

  it('proceeds when the caller sent one', () => {
    const r = runPreamble({ ...GUARDS_PASSED, RELEASE_DIR: '/home/someone/footbag-release' });
    expect(r.status, r.stderr).toBe(0);
  });

  it('still refuses a direct invocation, whatever the release directory says', () => {
    // The slice is only faithful if the guards it contains still bite; without
    // this, a slice that had silently lost them would pass the cases above.
    const r = runPreamble({ RELEASE_DIR: '/home/someone/footbag-release' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/direct invocation is refused/);
  });
});

describe('no script names one account home for the release tree (static-text)', () => {
  it('scripts/deploy-rebuild.sh resolves the connecting account home and forwards it', () => {
    const content = readFileSync(join(REPO_ROOT, 'scripts/deploy-rebuild.sh'), 'utf8');
    expect(content).toMatch(/REMOTE_HOME="\$\(ssh /);
    expect(content).toMatch(/printf %s "\$HOME"/);
    expect(content).toMatch(/REMOTE_RELEASE_DIR="\$\{REMOTE_HOME\}\/footbag-release"/);
    expect(content).toMatch(/printf 'RELEASE_DIR=%q\\n'/);
  });

  it('scripts/internal/deploy-rebuild-remote.sh takes the sent value rather than assuming', () => {
    const content = readFileSync(REMOTE_HALF, 'utf8');
    expect(content).toMatch(/: "\$\{RELEASE_DIR:\?/);
    expect(content).not.toMatch(/^RELEASE_DIR=\/home/m);
  });

  it('the snapshot and persona halves read the live install, not a staging tree', () => {
    // A staging tree is the wrong source twice over: it sits in whichever account
    // last deployed, and the next deploy deletes and rebuilds it.
    const snapshot = readFileSync(
      join(REPO_ROOT, 'scripts/internal/take-pre-cutover-snapshot-remote.sh'),
      'utf8',
    );
    expect(snapshot).toMatch(/SNAPSHOT="\$\{LIVE_DIR\}\/scripts\/take-pre-cutover-snapshot\.sh"/);

    const personas = readFileSync(join(REPO_ROOT, 'scripts/verify-test-personas.sh'), 'utf8');
    expect(personas).toMatch(/-f \/srv\/footbag\/docker\/docker-compose\.yml/);
    expect(personas).toMatch(/-f \/srv\/footbag\/docker\/docker-compose\.prod\.yml/);
  });
});
