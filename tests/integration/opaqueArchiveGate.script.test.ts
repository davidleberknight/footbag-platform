/**
 * The gate that keeps opaque containers out of the repository.
 *
 * Every secret control this project has reads text: the gitleaks history scan, the
 * conventions greps, code review, reading a diff. An archive defeats all of them at
 * once, because none of them decompress anything. A saved Terraform plan is a zip,
 * and one committed under a filename the ignore rules did not match carried three
 * live secrets in public history for seven weeks while CI stayed green. Filename
 * globs and per-directory allowlists both failed to catch it; a rule about what a
 * file *is* rather than what it is called or where it sits does not have that hole.
 *
 * Every case runs the real gate inside a throwaway repository, so a refused archive
 * can be asserted without a refused archive ever existing here. The last case runs
 * it against this repository, which keeps the fixtures honest about the real scan.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const GATE = join(process.cwd(), 'scripts/ci/check_no_opaque_archives.sh');

interface RunResult { exitCode: number; stdout: string; stderr: string }

/**
 * Stands up a throwaway repository holding the given files, tracks them, and runs
 * the gate inside it. The gate reads `git ls-files`, so the fixture has to be a
 * repository with the files actually staged rather than a bare directory.
 */
function inFixtureRepo(files: Record<string, Buffer | string>): RunResult {
  const root = mkdtempSync(join(tmpdir(), 'footbag-test-archive-gate-'));
  try {
    spawnSync('git', ['init', '-q', root], { encoding: 'utf8', ...SPAWN_GUARD });
    for (const [name, body] of Object.entries(files)) {
      const full = join(root, name);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, body);
    }
    spawnSync('git', ['-C', root, 'add', '-A'], { encoding: 'utf8', ...SPAWN_GUARD });
    const res = spawnSync('bash', [GATE], { cwd: root, encoding: 'utf8', ...SPAWN_GUARD });
    return { exitCode: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The first bytes of a zip. Enough to be recognised as one, which is the point. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

describe('the opaque-container gate', () => {
  it('accepts an ordinary text tree', () => {
    const res = inFixtureRepo({ 'src/app.ts': 'export const x = 1;\n', 'src/notes.txt': 'plain\n' });
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('refuses a zip whatever it is called', () => {
    // The incident in one case: the extension was not one the ignore rules
    // matched, and the content was never readable by any scanner here.
    const res = inFixtureRepo({ 'terraform/staging/tf.plan': ZIP_MAGIC });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('zip archive');
    expect(res.stderr).toContain('tf.plan');
  });

  it('refuses a zip hiding outside terraform/, where the directory allowlist cannot see', () => {
    const res = inFixtureRepo({ 'docs/attachments/notes.bin': ZIP_MAGIC });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('notes.bin');
  });

  it('refuses a gzip', () => {
    const res = inFixtureRepo({ 'data/dump': gzipSync(Buffer.from('anything at all')) });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('gzip');
  });

  it('refuses uncompressed Terraform state, which no archive check would catch', () => {
    const res = inFixtureRepo({
      'infra/saved.json':
        '{\n  "version": 4,\n  "terraform_version": "1.14.7",\n'
        + '  "lineage": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",\n  "resources": []\n}\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('Terraform state');
  });

  it('does not mistake ordinary JSON for state', () => {
    // The two keys together are what a state always carries. One of them alone,
    // in a package manifest or a fixture, is not a state file.
    const res = inFixtureRepo({
      'package.json': '{ "name": "x", "lineage": "not-a-state", "version": "1.0.0" }\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('passes against this repository', () => {
    const res = spawnSync('bash', [GATE], {
      cwd: process.cwd(), encoding: 'utf8', ...SPAWN_GUARD,
    });
    expect(res.status, res.stderr ?? '').toBe(0);
    expect(res.stdout).toContain('[opaque-archives] pass');
  });
});
