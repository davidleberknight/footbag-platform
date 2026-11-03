/**
 * The curated sidecar prefix fold: every URL-reference sidecar under the
 * curated tree is named `<prefix>_<8 hex>.meta.json`, with the prefix folded by
 * the site's one slug rule. The script lists the renames and changes nothing
 * unless told to apply them; applying proves the curated seed loads the same
 * items, with the same hashtags, after the renames as before; and it refuses a
 * rename onto a name already taken or a prefix the fold cannot settle, renaming
 * nothing. Each case runs against a scratch copy of a small curated tree.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts', 'rename-curated-sidecar-prefixes.sh');

let curated: string;

function sidecar(dir: string, name: string, videoId: string): void {
  mkdirSync(join(curated, dir), { recursive: true });
  writeFileSync(join(curated, dir, name), `${JSON.stringify({
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    videoPlatform: 'youtube',
    title: `Clip ${videoId}`,
    tags: ['#freestyle', `#clip_${videoId.toLowerCase()}`],
  }, null, 2)}\n`);
}

function run(...args: string[]) {
  return spawnSync('bash', [SCRIPT, '--curated-dir', curated, ...args], { encoding: 'utf8', ...SPAWN_GUARD });
}

function files(dir: string): string[] {
  return readdirSync(join(curated, dir)).sort();
}

beforeEach(() => {
  curated = createScratchDir('rename-curated-sidecars');
  sidecar('freestyle_tutorials', 'pixie-set-list_124750f2.meta.json', 'PIXIEAAAAAA');
  sidecar('freestyle_tutorials', 'already_folded_aaaaaaaa.meta.json', 'FOLDEDAAAAA');
  sidecar('individual_shred', 'ahren-gehrman_cf3ceb47.meta.json', 'AHRENAAAAAA');
});

afterEach(() => {
  removeScratch(curated);
});

describe('rename-curated-sidecar-prefixes.sh', () => {
  // Defect caught: a run without --apply renames files the maintainer has not
  // reviewed, or lists nothing so the review sees no renames.
  it('lists each hyphenated prefix\'s rename and changes nothing without --apply', () => {
    const res = run();
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('pixie_set_list_124750f2.meta.json');
    expect(res.stdout).toContain('ahren_gehrman_cf3ceb47.meta.json');
    expect(res.stdout).not.toContain('already_folded_aaaaaaaa.meta.json  ->');
    expect(files('freestyle_tutorials')).toContain('pixie-set-list_124750f2.meta.json');
  });

  // Defect caught: applying leaves a hyphenated prefix, drops the URL hash, or
  // reports success without proving the seed still loads every item.
  it('renames to the folded prefix with --apply and proves the seed loads the same items', () => {
    const res = run('--apply');
    expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
    expect(files('freestyle_tutorials')).toEqual(['already_folded_aaaaaaaa.meta.json', 'pixie_set_list_124750f2.meta.json']);
    expect(files('individual_shred')).toEqual(['ahren_gehrman_cf3ceb47.meta.json']);
    expect(res.stderr).toContain('all 3 curated video items load after renaming');
    const again = run();
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toContain('nothing to rename');
  });

  // Defect caught: a rename overwrites a sidecar that already holds the folded
  // name, losing that item, or renames the rest of the tree before refusing.
  it('refuses a rename onto a name that already exists, renaming nothing', () => {
    sidecar('freestyle_tutorials', 'pixie_set_list_124750f2.meta.json', 'TAKENAAAAAA');
    const res = run('--apply');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('already exists');
    expect(files('individual_shred')).toEqual(['ahren-gehrman_cf3ceb47.meta.json']);
  });

  // Defect caught: a prefix holding a capital or another character is guessed
  // at, so the file lands under a name nobody chose.
  it('refuses a prefix the fold cannot settle, renaming nothing', () => {
    sidecar('individual_shred', 'Odd.Name_bbbbbbbb.meta.json', 'ODDAAAAAAAA');
    const res = run('--apply');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('Odd.Name_bbbbbbbb.meta.json');
    expect(files('individual_shred')).toContain('ahren-gehrman_cf3ceb47.meta.json');
  });
});
