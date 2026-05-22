/**
 * Vitest globalSetup / globalTeardown.
 *
 * Sweeps stray `footbag-test-*` and `footbag-e2e-*` artifacts from
 * `os.tmpdir()` at session boundaries. Per-test `afterAll(() =>
 * cleanupTestDb(dbPath))` (from tests/fixtures/testDb.ts) and the
 * Playwright start-stack teardown handle the happy paths; this hook is
 * the safety net for worker timeouts / OOM / SIGKILL / WAL-checkpoint
 * races that leave per-test cleanup unrun.
 *
 * Runs in the main process, NOT inside any worker — so it never races a
 * live test's DB file. Vitest invokes `setup()` once before any worker
 * spawns and `teardown()` once after all workers complete.
 */
import { readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PREFIXES = ['footbag-test-', 'footbag-e2e-'];

function sweepFootbagTransientArtifacts(): void {
  const dir = tmpdir();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!PREFIXES.some((p) => name.startsWith(p))) continue;
    try {
      unlinkSync(join(dir, name));
    } catch {
      // Race with another process or stale-handle quirk; nothing to do.
    }
  }
}

export const setup = sweepFootbagTransientArtifacts;
export const teardown = sweepFootbagTransientArtifacts;
