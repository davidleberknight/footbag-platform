/**
 * The files git is tracking under a pathspec.
 *
 * For any assertion whose subject is what this repository ships, rather than
 * what happens to be sitting on this disk. The two are not the same question
 * and a directory listing only ever answers the second one. A re-encode left in
 * place, a download, an editor swap file, a scratch tree someone is
 * experimenting in, a sidecar another suite wrote while this one was reading:
 * every one of those lands in a listing, none of them is part of the
 * repository, and an assertion that counts or compares a set is then deciding
 * its verdict on the state of somebody's working directory.
 *
 * That failure is one-directional and quiet in the direction that matters. The
 * test stays green wherever the tree happens to be clean, which is the machine
 * of whoever wrote it, and goes red somewhere else for a reason that has
 * nothing to do with the code.
 *
 * This is the same reasoning, and the same tool, as the committed-source scans
 * in personaFactory.test.ts and personaSeed.passwordLeak.test.ts, which reach
 * for `git grep` over a recursive grep and say so in the same words.
 *
 * Use a directory listing where the claim really is about the filesystem: what
 * a script just wrote into a temp directory, what an extractor produced. Use
 * this where the claim is about the repository.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { SPAWN_GUARD } from './spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Repository-relative paths of the tracked files matching `pathspec`.
 *
 * Throws rather than returning nothing when git cannot answer: an empty set
 * would silently satisfy every "all of them are valid" assertion in the tree,
 * which is the shape of a check that has stopped checking.
 */
export function committedFiles(pathspec: string): string[] {
  const result = spawnSync('git', ['ls-files', '-z', '--', pathspec], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    ...SPAWN_GUARD,
  });
  if (result.status !== 0) {
    throw new Error(
      `git ls-files failed for '${pathspec}', so the committed file set is unknown: ` +
        `${result.stderr || result.error?.message || 'no output'}`,
    );
  }
  // NUL-separated: a path containing a newline would otherwise split into two
  // entries, and the caller would be handed filenames that do not exist.
  return result.stdout.split('\0').filter(Boolean);
}

/** Basenames of the tracked files matching `pathspec`. */
export function committedBasenames(pathspec: string): string[] {
  return committedFiles(pathspec).map((rel) => path.basename(rel));
}
