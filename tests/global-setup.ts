/**
 * Vitest globalSetup / globalTeardown.
 *
 * Collects abandoned `footbag-test-*` and `footbag-e2e-*` artifacts from
 * `os.tmpdir()` at session boundaries. Per-test `afterAll(() =>
 * cleanupTestDb(dbPath))` (from tests/fixtures/testDb.ts) and the
 * Playwright start-stack teardown handle the happy paths; this hook is
 * the safety net for worker timeouts / OOM / SIGKILL / WAL-checkpoint
 * races that leave per-test cleanup unrun.
 *
 * It only ever deletes artifacts that have not been touched for a long
 * while, and that age guard is load-bearing rather than tidy-mindedness.
 * More than one test session can be alive at once: a developer runs a single
 * file while the full suite is going, or two suites overlap. Deleting by
 * prefix alone then destroys the other session's databases out from under it,
 * and the failure surfaces far from its cause as "no such table" or "unable to
 * open database file" in whichever suites happened to be mid-flight. Skipping
 * anything recent makes that impossible by construction: an artifact young
 * enough to belong to a live run is never a candidate.
 *
 * The threshold has to exceed the longest plausible single run, including on a
 * slow machine where the full suite takes the better part of an hour, since a
 * long-running session keeps files it created at the start. Collection is
 * therefore deferred, never skipped: whatever this run leaks is swept by a
 * later one. `scripts/clean_up_rubbish.sh` remains the immediate, deliberate
 * operator sweep for anyone who wants the directory empty now.
 */
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PREFIXES = ['footbag-test-', 'footbag-e2e-'];

export const MIN_AGE_MS = 2 * 60 * 60 * 1000;

export function sweepFootbagTransientArtifacts(): void {
  const dir = tmpdir();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  const cutoff = Date.now() - MIN_AGE_MS;
  for (const name of entries) {
    if (!PREFIXES.some((p) => name.startsWith(p))) continue;
    const full = join(dir, name);
    try {
      // A stat failure means the entry vanished under us or is unreadable;
      // either way it is not ours to delete.
      if (statSync(full).mtimeMs > cutoff) continue;
      unlinkSync(full);
    } catch {
      // Race with another process or stale-handle quirk; nothing to do.
    }
  }
}

export const setup = sweepFootbagTransientArtifacts;
export const teardown = sweepFootbagTransientArtifacts;
