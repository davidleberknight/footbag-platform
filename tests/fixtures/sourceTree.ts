/**
 * Reading the source tree from disk, for tests whose subject is the files in
 * this checkout.
 *
 * The suite runs before a commit, so the files on disk are the files about to
 * be committed: a test judges them, never the index or the history. Two shapes
 * are offered.
 *
 * `listFiles` lists one directory. Use it where a test walks a known folder of
 * data (gallery sidecars, site clips, Terraform trees).
 *
 * `scanSource` searches for a literal across the folders a test names. It
 * never walks the whole checkout minus an exclusion list: the machine-only
 * trees beside the source (a 70 GB site mirror, virtual environments,
 * pipeline output, the local media store) cannot all be named in advance, and
 * a scan that wanders into one is slow on one machine and red on another for
 * a reason that has nothing to do with the code. The skip list below only
 * covers tool-made directories that can sit inside a named source folder.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Tool-made directories that can appear inside a source folder; never entered. */
const SKIPPED_DIRS = new Set([
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  'dist',
  '.terraform',
  'coverage',
  'test-results',
  'playwright-report',
]);

/**
 * Sorted basenames of the regular files directly inside `relDir`, optionally
 * filtered by `match`. Throws when the directory is missing, because an empty
 * list would silently satisfy every "all of them are valid" assertion.
 */
export function listFiles(relDir: string, match?: RegExp, root: string = REPO_ROOT): string[] {
  const dir = path.join(root, relDir);
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && (!match || match.test(e.name)))
    .map((e) => e.name)
    .sort();
}

export interface ScanOptions {
  /** Folders walked recursively, relative to `root`. At least one is required. */
  roots: string[];
  /** Folders whose own files are read but whose subfolders are not ('.' for the repo root). */
  shallow?: string[];
  /** File extensions to read, with the dot. */
  exts: string[];
  /** The checkout to read; a test of this helper passes a scratch tree. */
  root?: string;
}

/** A file holding a NUL byte early on is binary and is not read, as `grep -I` does. */
function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8000).includes(0);
}

/**
 * Sorted repository-relative paths (forward slashes) of the files under the
 * named folders whose text contains `needle`. Symbolic links are never
 * followed, so a link to a large tree elsewhere is not read.
 */
export function scanSource(needle: string, opts: ScanOptions): string[] {
  const root = opts.root ?? REPO_ROOT;
  if (opts.roots.length === 0) {
    throw new Error('scanSource needs at least one root; a scan of nothing finds nothing');
  }
  if (!needle) throw new Error('scanSource needs a non-empty needle');
  const exts = new Set(opts.exts);
  const hits: string[] = [];

  const consider = (abs: string, name: string) => {
    if (!exts.has(path.extname(name))) return;
    const buf = readFileSync(abs);
    if (!isBinary(buf) && buf.includes(needle)) {
      hits.push(path.relative(root, abs).split(path.sep).join('/'));
    }
  };

  const resolveFolder = (rel: string): string => {
    const abs = path.resolve(root, rel);
    if (!statSync(abs).isDirectory()) throw new Error(`scanSource: ${rel} is not a directory`);
    return abs;
  };

  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIPPED_DIRS.has(e.name)) walk(abs);
      } else if (e.isFile()) {
        consider(abs, e.name);
      }
    }
  };

  for (const rel of opts.roots) {
    const abs = resolveFolder(rel);
    if (abs === root) {
      throw new Error('scanSource: a recursive root must be a named folder, not the whole checkout');
    }
    walk(abs);
  }
  for (const rel of opts.shallow ?? []) {
    const dir = resolveFolder(rel);
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile()) consider(path.join(dir, e.name), e.name);
    }
  }
  return hits.sort();
}
