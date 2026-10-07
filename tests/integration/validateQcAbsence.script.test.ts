/**
 * scripts/validate-qc-absence.sh, the gate that the retired internal QC
 * subsystem has not come back into the production image.
 *
 * The gate inspects a built image through docker. A stand-in `docker` on PATH,
 * visibly in this file, answers `image inspect` from whether a fixture image
 * directory exists, and runs each `docker run ... sh -c <command>` as that same
 * shell command inside the fixture directory, so the gate's own tests and greps
 * are what decide each case rather than a canned answer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'validate-qc-absence.sh');

let root: string;
let bin: string;
let n = 0;

beforeAll(() => {
  root = createScratchDir('validate-qc-absence');
  bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, 'docker'),
    [
      '#!/usr/bin/env bash',
      'if [[ "$1 $2" == "image inspect" ]]; then [[ -d "$FAKE_IMAGE_DIR" ]]; exit; fi',
      'if [[ "$1" == "run" ]]; then',
      '  cmd="${@: -1}"',
      '  cd "$FAKE_IMAGE_DIR" && exec sh -c "$cmd"',
      'fi',
      'echo "unexpected docker invocation: $*" >&2; exit 64',
    ].join('\n'),
    { mode: 0o755 },
  );
});
afterAll(() => removeScratch(root));

/** A fixture image: a dist tree holding the given files. */
function image(files: Record<string, string>): string {
  const dir = path.join(root, `image-${++n}`);
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'server.js'), 'module.exports = {};\n');
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  return dir;
}

function gate(imageDir: string, args: string[] = []) {
  return spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, FAKE_IMAGE_DIR: imageDir },
    ...SPAWN_GUARD,
  });
}

describe('validate-qc-absence.sh', () => {
  it('passes an image carrying none of the retired subsystem', () => {
    const res = gate(image({}));
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('GATE: QC-ABSENCE PASS');
  });

  it('reports mock mode as skipped, never as a pass', () => {
    // A checklist that reads green while the gate inspected nothing is worse
    // than no checklist.
    const res = gate(path.join(root, 'no-image'), ['--mock']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('QC-ABSENCE SKIPPED');
    expect(res.stdout).not.toContain('PASS');
  });

  it('fails when the image to inspect is not there, rather than passing an absent image', () => {
    const res = gate(path.join(root, 'no-image'));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('not found locally');
  });

  it('fails an image holding the retired QC subtree', () => {
    const res = gate(image({ 'dist/internal-qc/index.js': '' }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('dist/internal-qc present');
  });

  it('fails an image holding the retired internal router', () => {
    const res = gate(image({ 'dist/routes/internalRoutes.js': '' }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('dist/routes/internalRoutes.js present');
  });

  it('fails an image whose compiled code names a retired QC table anywhere', () => {
    // QC code that came back under a new directory still names its tables.
    const res = gate(image({ 'dist/services/review.js': "db.prepare('SELECT * FROM net_review_queue')\n" }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('still name a retired QC table');
    expect(res.stderr).toContain('dist/services/review.js');
  });
});
