/**
 * The rebuild deploy's media integrity gate runs on every rebuild, whether or not
 * the deploy synced media to the bucket.
 *
 * Curator rows ship with the database on every rebuild, and their files reach the
 * bucket only through the media sync. A rebuild without the sync is therefore the
 * one that can ship a row whose file is not in the bucket, and the live site
 * serves a broken image or video with nothing in the deploy saying so.
 *
 * The gate is sliced out of the deploy script and run under bash with the
 * Terraform read, the AWS identity step and the checker itself replaced: the
 * checker through the script's own test seam, the two library functions by
 * definitions placed ahead of the slice.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const DEPLOY = join(process.cwd(), 'scripts/deploy-rebuild.sh');

let scratch: string;

/** From the checker seam to the host env verification that follows the gate. */
function gate(): string {
  const lines = readFileSync(DEPLOY, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith('MEDIA_CHECK_CMD='));
  const end = lines.findIndex((l) => l.startsWith("# The host's whole env file"));
  expect(start, 'the checker seam anchors the start of the slice').toBeGreaterThan(0);
  expect(end, 'the host env verification anchors the end of the slice').toBeGreaterThan(start);
  return lines.slice(start, end).join('\n');
}

function checker(code: number): string {
  const path = join(scratch, `check-${code}.sh`);
  writeFileSync(path, `#!/usr/bin/env bash\necho "checked $MEDIA_STORAGE_S3_BUCKET"\nexit ${code}\n`);
  chmodSync(path, 0o755);
  return path;
}

function runGate(checkCode: number, syncMedia: 'yes' | 'no') {
  const script = [
    'set -euo pipefail',
    'tf_output_read() { TF_OUTPUT_VALUE=footbag-test-media; }',
    'tf_output_explain() { :; }',
    'aws_profile_ensure() { :; }',
    gate(),
    'echo "GATE PASSED"',
  ].join('\n');
  const path = join(scratch, 'gate.sh');
  writeFileSync(path, script);
  const res = spawnSync('bash', [path], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      REPO_ROOT: process.cwd(),
      FOOTBAG_ENV: 'staging',
      LOCAL_DB: join(scratch, 'footbag.db'),
      AWS_REGION: 'us-east-1',
      SYNC_MEDIA: syncMedia,
      DEPLOY_MEDIA_CHECK_CMD: checker(checkCode),
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

beforeEach(() => {
  scratch = createScratchDir('deploy-media-check');
});

afterEach(() => {
  removeScratch(scratch);
});

describe('the rebuild media gate', () => {
  it('runs the check when the deploy did not sync media, and fails on missing files', () => {
    // Defect: a rebuild without the media sync ships a new clip's row, the gate is
    // skipped, and the live site shows a broken video with the deploy reporting success.
    const r = runGate(1, 'no');
    expect(r.stdout).toContain('checked footbag-test-media');
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('GATE PASSED');
    expect(r.stderr).toMatch(/did not sync media/);
  });

  it('passes when every referenced file is in the bucket', () => {
    // Defect: the gate refuses a deploy whose media all resolves, so no rebuild without
    // the sync can ever finish.
    const r = runGate(0, 'no');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('GATE PASSED');
    expect(r.stderr).toMatch(/SYNTHETIC: media integrity check replaced by DEPLOY_MEDIA_CHECK_CMD=/);
  });

  it('points at the sync itself when a syncing deploy still has missing files', () => {
    // Defect: the operator is told to re-run with the sync they already ran, rather
    // than to read why the sync did not deliver.
    const r = runGate(1, 'yes');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/This deploy synced media/);
  });

  it('reports a check that never ran as unknown rather than as missing files', () => {
    // Defect: a checker crash is reported as broken media, with a remedy that cannot fix it.
    const r = runGate(2, 'no');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/could not run \(exit 2\)/);
    expect(r.stderr).not.toMatch(/did not sync media/);
  });
});
