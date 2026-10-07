/**
 * Integration tests for legacy_data/legacy_mirror/verify_mirror.sh.
 *
 * The wrapper hands the mirror verifier the exclusion lists the crawl ran with.
 * A list it cannot find must refuse the run: the excluded-surface check runs
 * against whichever lists remain and reads ok, so a capture still holding the
 * missing list's surfaces would verify green and gate a publish open.
 *
 * The script is copied into a scratch layout that mirrors its place in the
 * repository (it resolves the lists and the interpreter from its own location),
 * with a stand-in interpreter that records the arguments it was given. Nothing
 * under legacy_data/ is read or written.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'legacy_data', 'legacy_mirror', 'verify_mirror.sh');

const LISTS = {
  committee: 'footbag_private_repo/private-custody/ifpa-group-files/CRAWL_EXCLUSIONS.txt',
  member: 'legacy_data/legacy_mirror/member_area_exclusions.txt',
  superseded: 'legacy_data/legacy_mirror/superseded_feature_exclusions.txt',
};

let root: string;
let caseCount = 0;

beforeAll(() => {
  root = createScratchDir('verify-mirror');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Build a layout holding every list except `omit`, run the copy, return what happened. */
function runWithout(omit: keyof typeof LISTS | null) {
  const layout = path.join(root, `case-${++caseCount}`);
  const mirrorDir = path.join(layout, 'legacy_data', 'legacy_mirror');
  const venvBin = path.join(layout, 'legacy_data', 'footbag_venv', 'bin');
  fs.mkdirSync(mirrorDir, { recursive: true });
  fs.mkdirSync(venvBin, { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(mirrorDir, 'verify_mirror.sh'));
  for (const [name, rel] of Object.entries(LISTS)) {
    if (name === omit) continue;
    fs.mkdirSync(path.dirname(path.join(layout, rel)), { recursive: true });
    fs.writeFileSync(path.join(layout, rel), 'excluded/path\n');
  }
  const argsLog = path.join(layout, 'python-args.log');
  fs.writeFileSync(
    path.join(venvBin, 'python'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > ${JSON.stringify(argsLog)}\n`,
    { mode: 0o755 },
  );
  const res = spawnSync('bash', [path.join(mirrorDir, 'verify_mirror.sh'), '--mirror', path.join(layout, 'capture')], {
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  const args = fs.existsSync(argsLog) ? fs.readFileSync(argsLog, 'utf8').split('\n').filter(Boolean) : null;
  return { ...res, layout, args };
}

describe('verify_mirror.sh: every exclusion list is required', () => {
  it('hands the verifier all three lists when they are present', () => {
    const res = runWithout(null);
    expect(res.status, res.stderr).toBe(0);
    const given = res.args!.filter((_, i, a) => a[i - 1] === '--exclusion-list');
    expect(given.sort()).toEqual(Object.values(LISTS).map((rel) => path.join(res.layout, rel)).sort());
  });

  it('refuses, and never starts the verifier, when any one list is missing', () => {
    // The committee list is the one that motivated this: it arrives only with
    // the private checkout, so a workstation without it verified green.
    for (const name of Object.keys(LISTS) as (keyof typeof LISTS)[]) {
      const res = runWithout(name);
      expect(res.status, `${name} missing`).toBe(1);
      expect(res.stderr, `${name} missing`).toContain(LISTS[name].split('/').pop()!);
      expect(res.stderr, `${name} missing`).toContain('Refusing to verify');
      expect(res.args, `${name} missing: the verifier must not run`).toBeNull();
    }
  });
});
