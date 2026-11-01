/**
 * The curated media build a rebuild deploy runs: the seeder writes into scratch,
 * and only a finished seed replaces the development stack's curated store.
 *
 * Before go-live the deploy builds its database in the developer's own database
 * file, so the curator rows it writes are the rows the local app serves, and the
 * local app reads their files from the curated store. The contract pinned here:
 * after a deploy's build the store exists and holds exactly what the seed wrote
 * (nothing missing for the local app, nothing stale for the deleting sync to
 * carry to the bucket), and a failed seed leaves the store as it was.
 *
 * The library is sourced under bash with the seeder replaced through its test
 * seam by a stub that writes files where the real seeder would.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const LIBRARY = join(process.cwd(), 'scripts/lib/curated-media-build.sh');

let scratch: string;
let root: string;
let tmp: string;
let store: string;

/** A stand-in seeder: writes one clip into --media-dir, then exits with `code`. */
function stubSeeder(code: number): string {
  const path = join(scratch, `seed-${code}.sh`);
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'while [[ $# -gt 0 ]]; do [[ "$1" == --media-dir ]] && dir="$2"; shift; done',
      'mkdir -p "$dir/member_fh/detached"',
      'printf "new clip bytes" > "$dir/member_fh/detached/media_new-video.mp4"',
      `exit ${code}`,
      '',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  return path;
}

function build(seedCmd: string) {
  const res = spawnSync(
    'bash',
    ['-c', `source "${LIBRARY}"; curated_media_build "$1" "$1/database/footbag.db"`, 'build', root],
    {
      encoding: 'utf-8',
      env: { ...process.env, TMPDIR: tmp, CURATED_MEDIA_SEED_CMD: seedCmd },
      ...SPAWN_GUARD,
    },
  );
  return { status: res.status, stderr: res.stderr ?? '' };
}

beforeEach(() => {
  scratch = createScratchDir('curated-media-build');
  root = join(scratch, 'repo');
  tmp = join(scratch, 'tmp');
  store = join(root, '.curated-build');
  mkdirSync(join(root, 'database'), { recursive: true });
  mkdirSync(tmp);
});

afterEach(() => {
  removeScratch(scratch);
});

describe('a finished seed refreshes the curated store and leaves it in place', () => {
  it('keeps the store holding the seeded files after the build returns', () => {
    // Defect: the deploy deletes the store on exit, so the local app is left with
    // curator rows for clips whose files are gone and shows them broken or not at all.
    const r = build(stubSeeder(0));
    expect(r.status, r.stderr).toBe(0);
    const clip = join(store, 'member_fh/detached/media_new-video.mp4');
    expect(existsSync(clip), 'the seeded clip is in the store after the build').toBe(true);
    expect(readFileSync(clip, 'utf8')).toBe('new clip bytes');
  });

  it('drops a file the seed did not write, so nothing stale reaches the bucket', () => {
    // Defect: a leftover file from an earlier seed stays in the store and the
    // deploy's deleting sync uploads it to the media bucket as if it were current.
    mkdirSync(join(store, 'member_fh/detached'), { recursive: true });
    writeFileSync(join(store, 'member_fh/detached/media_retired-video.mp4'), 'old');
    const r = build(stubSeeder(0));
    expect(r.status, r.stderr).toBe(0);
    expect(readdirSync(join(store, 'member_fh/detached'))).toEqual(['media_new-video.mp4']);
  });

  it('removes its scratch folder and says the seeder was replaced', () => {
    // Defect: every deploy leaves a full copy of the curated media in the temp
    // directory; or a stubbed run passes itself off as a real seed.
    const r = build(stubSeeder(0));
    expect(r.status, r.stderr).toBe(0);
    expect(readdirSync(tmp), 'no scratch build left behind').toEqual([]);
    expect(r.stderr).toMatch(/SYNTHETIC: curator seeder replaced by CURATED_MEDIA_SEED_CMD=/);
  });
});

describe('an interrupted seed', () => {
  it('removes its scratch folder and leaves the store as it was', () => {
    // Defect: an operator's Ctrl-C during the seed leaves a full curated build in the
    // temp directory, or replaces the store with a partial set.
    mkdirSync(join(store, 'member_fh/detached'), { recursive: true });
    writeFileSync(join(store, 'member_fh/detached/media_existing-video.mp4'), 'existing');
    const seeder = join(scratch, 'seed-interrupted.sh');
    writeFileSync(
      seeder,
      [
        '#!/usr/bin/env bash',
        'while [[ $# -gt 0 ]]; do [[ "$1" == --media-dir ]] && dir="$2"; shift; done',
        'printf "partial" > "$dir/media_partial-video.mp4"',
        'kill -s INT "$PPID"',
        'exit 0',
        '',
      ].join('\n'),
    );
    chmodSync(seeder, 0o755);
    const r = build(seeder);
    expect(r.status).not.toBe(0);
    expect(readdirSync(tmp), 'no scratch build left behind').toEqual([]);
    expect(readdirSync(join(store, 'member_fh/detached'))).toEqual(['media_existing-video.mp4']);
  });
});

describe('the rebuild deploy stops when the curated build fails', () => {
  it('exits non-zero and goes no further', () => {
    // Defect: the deploy carries on after a failed curator seed and ships a
    // database whose curator rows name files no build produced.
    const deploy = readFileSync(join(process.cwd(), 'scripts/deploy-rebuild.sh'), 'utf8').split('\n');
    const start = deploy.findIndex((l) => l.startsWith('if [[ "${CURATOR_SEED:-yes}" != "no" ]]; then'));
    const end = deploy.findIndex((l, i) => i > start && l === 'fi');
    expect(start, 'the curator seed branch anchors the slice').toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = deploy
      .slice(start, end + 1)
      .filter((l) => !l.includes('lib/seeder-env.sh') && !l.includes('seeder_env_ensure'))
      .join('\n')
      .replace('${REPO_ROOT}/scripts/lib/curated-media-build.sh', LIBRARY);
    const path = join(scratch, 'deploy-seed.sh');
    writeFileSync(path, ['set -euo pipefail', block, 'echo "DEPLOY CONTINUED"'].join('\n'));
    const res = spawnSync('bash', [path], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        TMPDIR: tmp,
        REPO_ROOT: root,
        LOCAL_DB: join(root, 'database/footbag.db'),
        CURATED_MEDIA_SEED_CMD: stubSeeder(3),
      },
      ...SPAWN_GUARD,
    });
    expect(res.status).not.toBe(0);
    expect(res.stdout).not.toContain('DEPLOY CONTINUED');
  });
});

describe('a failed seed leaves the curated store as it was', () => {
  it('returns non-zero, keeps the existing store intact and removes the scratch folder', () => {
    // Defect: a seed that dies part way replaces the store with a partial set, so
    // clips the database still names lose their files, and the deploy carries on.
    mkdirSync(join(store, 'member_fh/detached'), { recursive: true });
    writeFileSync(join(store, 'member_fh/detached/media_existing-video.mp4'), 'existing');
    const r = build(stubSeeder(3));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/curator seed failed/);
    expect(readdirSync(join(store, 'member_fh/detached'))).toEqual(['media_existing-video.mp4']);
    expect(readFileSync(join(store, 'member_fh/detached/media_existing-video.mp4'), 'utf8')).toBe('existing');
    expect(readdirSync(tmp), 'no scratch build left behind').toEqual([]);
  });
});
