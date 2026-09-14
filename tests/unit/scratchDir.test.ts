/**
 * The shared temp-path helper builds names the session sweep can find.
 *
 * The sweep in tests/global-setup.ts collects by prefix, so a suite that spells
 * its own name is invisible to it and whatever a crash strands there stays
 * forever. That is not hypothetical: 417 abandoned directories and a private
 * key accumulated once, and roughly four hundred entries a second time. This
 * helper exists so the prefix is decided in one place rather than in every
 * suite, and these cases pin the properties that make it worth using.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname } from 'node:path';

import {
  createScratchDir,
  createScratchDirAt,
  scratchPath,
  removeScratch,
} from '../fixtures/scratchDir';

const made: string[] = [];

afterEach(() => {
  for (const path of made.splice(0)) removeScratch(path);
});

function track(path: string): string {
  made.push(path);
  return path;
}

describe('the shared scratch-path helper', () => {
  it('builds every path under the prefix the session sweep collects', () => {
    // The single property the sweep depends on. If this drifts, nothing
    // reclaims what a killed worker leaves behind.
    const dir = track(createScratchDir('sweep-prefix'));
    const file = scratchPath('sweep-prefix', '.db');
    const at = track(createScratchDirAt('sweep-prefix'));
    for (const path of [dir, file, at]) {
      expect(basename(path).startsWith('footbag-test-')).toBe(true);
    }
  });

  it('puts them in the OS temp directory, never the project root', () => {
    // A project-root leak survives the machine's own cleanup and pollutes the
    // working tree; the testing rule bans it outright.
    const dir = track(createScratchDir('in-tmpdir'));
    expect(dirname(dir)).toBe(tmpdir());
  });

  it('keeps the caller label in the name, so a leak says which suite made it', () => {
    const dir = track(createScratchDir('who-made-me'));
    expect(basename(dir)).toContain('who-made-me');
  });

  it('does not collide across parallel workers', () => {
    // Vitest runs files in parallel and millisecond clock granularity alone is
    // not enough, which is why the name carries the process id and randomness.
    const names = new Set(
      Array.from({ length: 50 }, () => basename(scratchPath('collision'))),
    );
    expect(names.size).toBe(50);
  });

  it('creates the directory for the two creating forms, and not for the path form', () => {
    // `scratchPath` hands back a name for something the caller will create
    // itself, such as a database file an opener will make. Creating it here
    // would break that.
    expect(existsSync(track(createScratchDir('exists')))).toBe(true);
    expect(existsSync(track(createScratchDirAt('exists-at')))).toBe(true);
    expect(existsSync(scratchPath('not-created'))).toBe(false);
  });

  it('removes a directory and tolerates one that is already gone', () => {
    // A test whose subject removed the directory itself, or which already
    // cleaned up, is not a failure.
    const dir = createScratchDir('removable');
    writeFileSync(`${dir}/file.txt`, 'x');
    removeScratch(dir);
    expect(existsSync(dir)).toBe(false);
    expect(() => removeScratch(dir)).not.toThrow();
  });

  it('sanitises a label that would otherwise make an odd path', () => {
    const dir = track(createScratchDir('has spaces/and-slashes'));
    const name = basename(dir);
    expect(name).not.toContain(' ');
    expect(statSync(dir).isDirectory()).toBe(true);
  });
});
