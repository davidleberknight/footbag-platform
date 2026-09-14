/**
 * The one place a test builds a temporary path.
 *
 * Every test write goes to the OS temp directory under the `footbag-test-`
 * prefix, because that prefix is what `tests/global-setup.ts` sweeps at session
 * boundaries. Per-test cleanup handles the happy path; the sweep is the safety
 * net for a worker timeout, an out-of-memory kill or a WAL race that leaves the
 * cleanup unrun. A suite that picks its own prefix is invisible to that sweep,
 * so whatever it leaks accumulates until someone looks at the filesystem, which
 * is how 417 abandoned directories and a private key came to be sitting there.
 *
 * Naming the prefix in one place is what keeps the sweep and the suites from
 * disagreeing. Callers pass a label describing what the scratch is for; it ends
 * up in the directory name, so a leak that does happen says which suite made it.
 *
 * The unique suffix is the same shape `setTestEnv` uses, process id plus
 * randomness, because vitest runs files in parallel workers and millisecond
 * clock granularity alone collides.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PREFIX = 'footbag-test-';

function uniqueName(label: string): string {
  const clean = label.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+$/, '');
  const uniq = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  return `${PREFIX}${clean}-${uniq}`;
}

/**
 * Create a scratch directory and return its path. The caller removes it in
 * `afterAll`; the session sweep reclaims it if that never runs.
 */
export function createScratchDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `${uniqueName(label)}-`));
}

/**
 * A scratch path that does not exist yet, for a caller that needs to create the
 * file or directory itself (a target a script under test will write, a database
 * path handed to an opener). Nothing is created here.
 */
export function scratchPath(label: string, extension = ''): string {
  return join(tmpdir(), `${uniqueName(label)}${extension}`);
}

/**
 * Create a scratch directory at a path the caller controls the whole name of,
 * for the case where a test needs the directory to exist before it is handed
 * over. Returns the path.
 */
export function createScratchDirAt(label: string): string {
  const dir = join(tmpdir(), uniqueName(label));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Remove a scratch path. Tolerates absence, because a test that already cleaned
 * up, or one whose subject removed the directory itself, is not a failure.
 */
export function removeScratch(path: string): void {
  rmSync(path, { recursive: true, force: true });
}
