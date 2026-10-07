/**
 * The source-tree reader every source scan and folder listing in the suite
 * relies on. Each case builds its own scratch checkout, so the verdict never
 * depends on what this machine has beside the source.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { listFiles, scanSource } from '../fixtures/sourceTree';

const NEEDLE = 'planted-needle-value';

describe('sourceTree', () => {
  let root: string;
  let elsewhere: string;

  beforeAll(() => {
    root = createScratchDir('source-tree');
    elsewhere = createScratchDir('source-tree-elsewhere');
    const put = (rel: string, body: string | Buffer) => {
      const abs = join(root, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, body);
    };
    put('src/deep/hit.ts', `export const x = '${NEEDLE}';\n`);
    put('src/clean.ts', 'export const y = 1;\n');
    put('src/notes.md', NEEDLE);
    put('src/blob.json', Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(NEEDLE)]));
    put('src/node_modules/pkg/index.js', NEEDLE);
    put('src/deep/.venv/lib/site.py.js', NEEDLE);
    put('outside/leak.ts', NEEDLE);
    put('root-file.sh', `echo ${NEEDLE}\n`);
    put('data/b.json', '{}');
    put('data/a.json', '{}');
    put('data/readme.txt', '');
    mkdirSync(join(root, 'data/sub.json'));
    writeFileSync(join(elsewhere, 'linked.ts'), NEEDLE);
    symlinkSync(elsewhere, join(root, 'src/linked'));
  });

  afterAll(() => {
    removeScratch(root);
    removeScratch(elsewhere);
  });

  const scan = (opts: Partial<Parameters<typeof scanSource>[1]> = {}) =>
    scanSource(NEEDLE, { roots: ['src'], exts: ['.ts', '.js', '.json', '.sh'], root, ...opts });

  // Defect caught: a planted secret in a named folder goes unreported, and the
  // leak scan built on this helper passes with the literal checked in.
  it('finds a text hit in a named root and reports it repository-relative', () => {
    expect(scan()).toEqual(['src/deep/hit.ts']);
  });

  // Defect caught: the scan wanders beyond the folders it names, which is how a
  // machine-only tree made one checkout red and another green.
  it('ignores a matching file outside the named roots', () => {
    expect(scan()).not.toContain('outside/leak.ts');
  });

  // Defect caught: a dependency, virtual environment, symlinked tree or binary
  // file is read, so the verdict and the run time depend on what is installed.
  it('never enters a skipped directory, a symbolic link, or a binary file', () => {
    const hits = scan();
    expect(hits.filter((h) => /node_modules|\.venv|linked|blob/.test(h))).toEqual([]);
  });

  // Defect caught: a file of an unnamed kind is read, widening the scan silently.
  it('reads only the named extensions', () => {
    expect(scan()).not.toContain('src/notes.md');
  });

  // Defect caught: files at a folder's top level are missed, or a shallow folder
  // is walked into its subfolders.
  it('reads a shallow folder\'s own files without descending', () => {
    expect(scan({ roots: ['data'], shallow: ['.'] })).toEqual(['root-file.sh']);
  });

  // Defect caught: a scan given nothing to read, or the whole checkout, passes
  // having checked nothing or crawls every machine-only tree.
  it('refuses no roots, a missing root, and the whole checkout as a root', () => {
    expect(() => scan({ roots: [] })).toThrow(/at least one root/);
    expect(() => scan({ roots: ['missing'] })).toThrow();
    expect(() => scan({ roots: ['.'] })).toThrow(/whole checkout/);
  });

  // Defect caught: a listing returns folders, unsorted names, or nothing for a
  // missing folder, so an "every file is valid" loop checks nothing.
  it('lists a folder\'s regular files sorted and filtered, and throws when it is missing', () => {
    expect(listFiles('data', undefined, root)).toEqual(['a.json', 'b.json', 'readme.txt']);
    expect(listFiles('data', /\.json$/, root)).toEqual(['a.json', 'b.json']);
    expect(() => listFiles('missing', undefined, root)).toThrow();
  });
});
