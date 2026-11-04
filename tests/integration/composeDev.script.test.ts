/**
 * scripts/compose-dev.sh — the local four-container stack in the foreground.
 *
 * The script runs compose as a background child so it can forward signals, and
 * waits for it in a loop. Its exit status has to be compose's own: a stack that
 * failed to build or start, ending the script with 0, reads as a clean session
 * to whoever started it and to any wrapper that branches on it. Teardown runs
 * either way.
 *
 * docker is a stand-in on PATH that records its arguments and exits as the case
 * says, so no case builds an image or starts a container.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/compose-dev.sh');

let scratch: string;

beforeEach(() => {
  scratch = createScratchDir('compose-dev');
  writeFileSync(
    join(scratch, 'docker'),
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> "${join(scratch, 'docker.log')}"`,
      'for a in "$@"; do',
      '  if [ "$a" = up ]; then exit "${COMPOSE_STUB_UP_EXIT:-0}"; fi',
      'done',
      'exit 0',
      '',
    ].join('\n'),
  );
  chmodSync(join(scratch, 'docker'), 0o755);
});

afterEach(() => {
  removeScratch(scratch);
});

function run(upExit: number) {
  const res = spawnSync('bash', [SCRIPT], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${scratch}:${process.env.PATH ?? ''}`,
      COMPOSE_STUB_UP_EXIT: String(upExit),
    },
    ...SPAWN_GUARD,
  });
  const log = existsSync(join(scratch, 'docker.log')) ? readFileSync(join(scratch, 'docker.log'), 'utf-8') : '';
  return { status: res.status, stderr: res.stderr ?? '', log };
}

describe('compose-dev.sh — the exit status is the stack\'s', () => {
  // Defect caught: a compose that failed to build or start was waited on with
  // its status discarded, so the script exited 0 over a stack that never ran.
  it('exits non-zero when compose fails, and still tears the stack down', () => {
    const r = run(3);
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/docker compose exited 3/);
    expect(r.log).toMatch(/\bdown\b/);
  });

  it('exits 0 when compose ends cleanly, and tears the stack down', () => {
    const r = run(0);
    expect(r.status, r.stderr).toBe(0);
    expect(r.log).toMatch(/\bup\b/);
    expect(r.log).toMatch(/\bdown\b/);
  });
});
