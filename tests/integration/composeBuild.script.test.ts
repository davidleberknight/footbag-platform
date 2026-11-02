/**
 * scripts/lib/compose-build.sh — building the deployed images for inspection
 * without a running stack's secrets.
 *
 * The compose file refuses to interpolate unless the two shared secrets are set,
 * and that refusal applies to a build as well as to bringing the stack up, so a
 * check that only inspects the images failed before it built anything. The
 * helper supplies a placeholder for the build command alone.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const LIB = join(process.cwd(), 'scripts/lib/compose-build.sh');

let scratch: string;
let docker: string;

beforeEach(() => {
  scratch = createScratchDir('compose-build');
  docker = join(scratch, 'docker');
  // Reports what the build saw, the way compose's interpolation would.
  writeFileSync(docker, [
    '#!/usr/bin/env bash',
    'echo "args=$*"',
    'echo "session=${SESSION_SECRET:-}"',
    'echo "internal=${INTERNAL_EVENT_SECRET:-}"',
  ].join('\n') + '\n');
  chmodSync(docker, 0o755);
});

afterEach(() => removeScratch(scratch));

function run(script: string, env: NodeJS.ProcessEnv = {}) {
  const clean = { ...process.env };
  delete clean.SESSION_SECRET;
  delete clean.INTERNAL_EVENT_SECRET;
  const res = spawnSync('bash', ['-c', `source '${LIB}'; ${script}`], {
    cwd: scratch, encoding: 'utf8', env: { ...clean, ...env }, ...SPAWN_GUARD,
  });
  return { status: res.status, out: res.stdout ?? '' };
}

describe('compose build helper', () => {
  it('gives the build both secrets when none is set, and sets neither in the caller', () => {
    // Defect caught: the image check failing with "required variable is missing
    // a value" before it built anything, or a placeholder leaking into the
    // caller's shell where a later command could take it for a real secret.
    const res = run(`compose_build_images '${docker}' web worker; echo "after=\${SESSION_SECRET:-unset}/\${INTERNAL_EVENT_SECRET:-unset}"`);
    expect(res.status).toBe(0);
    expect(res.out).toContain('args=compose -f docker/docker-compose.yml build web worker');
    expect(res.out).toMatch(/session=\S+/);
    expect(res.out).toMatch(/internal=\S+/);
    expect(res.out).toContain('after=unset/unset');
  });

  it('keeps a value the caller already set', () => {
    // Defect caught: an operator's own value silently replaced by the placeholder.
    const res = run(`compose_build_images '${docker}' web`, { INTERNAL_EVENT_SECRET: 'callers-own-value' });
    expect(res.out).toContain('internal=callers-own-value');
  });
});
