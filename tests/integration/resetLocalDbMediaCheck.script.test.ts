/**
 * The local database reset proves the curator media it seeded is servable.
 *
 * The curator seed writes rows and files in one run, but the page reads the row
 * and the browser fetches the file. A row whose file is missing renders a broken
 * card and fails nothing else, so the reset checks every stored-bytes reference
 * and every fixed page slot through the storage the app reads, and fails when
 * any is missing or the check cannot reach a verdict.
 *
 * The step is sliced out of the reset and run under bash with the checker
 * replaced through the reset's own test seam; the full reset rebuilds a whole
 * database and is the maintainer's gate.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const RESET = join(process.cwd(), 'scripts/reset-local-db.sh');

let scratch: string;

/** From the announcement of the step to the end of its exit handling. */
function step(): string {
  const lines = readFileSync(RESET, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.includes("Checking that every seeded media row's files are present"));
  expect(start, 'the step announcement anchors the start of the slice').toBeGreaterThan(0);
  const verdict = lines.findIndex((l, i) => i > start && l.includes('the media integrity check could not run'));
  expect(verdict, 'the could-not-run branch is inside the step').toBeGreaterThan(start);
  const end = lines.findIndex((l, i) => i > verdict && l === '  fi');
  expect(end, 'the end of the exit handling anchors the slice').toBeGreaterThan(start);
  return lines.slice(start, end + 1).join('\n');
}

function runStep(checkCode: number) {
  const checker = join(scratch, `check-${checkCode}.sh`);
  writeFileSync(checker, `#!/usr/bin/env bash\necho "checked $FOOTBAG_DB_PATH"\nexit ${checkCode}\n`);
  chmodSync(checker, 0o755);
  const db = join(scratch, 'footbag.db');
  const path = join(scratch, 'step.sh');
  // The reset reports through the closing-report library, which the slice needs too.
  const lib = join(process.cwd(), 'scripts/lib/closing-report.sh');
  writeFileSync(
    path,
    ['set -euo pipefail', `source '${lib}'`, `DB_FILE='${db}'`, step(), 'echo "STEP PASSED"'].join('\n'),
  );
  const res = spawnSync('bash', [path], {
    encoding: 'utf-8',
    env: { ...process.env, RESET_MEDIA_CHECK_CMD: checker },
    ...SPAWN_GUARD,
  });
  return { db, status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

beforeEach(() => {
  scratch = createScratchDir('reset-media-check');
});

afterEach(() => {
  removeScratch(scratch);
});

describe('the reset media check', () => {
  it('fails the reset when seeded rows name missing files', () => {
    // Defect: a reset finishes green while clips on the landing pages have no files,
    // and the developer finds out only by seeing broken or missing cards.
    const r = runStep(1);
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('STEP PASSED');
    expect(r.stderr).toMatch(/do(es)? not hold/);
  });

  it('passes, checking the database the reset built, when every file resolves', () => {
    // Defect: the check reads some other database than the one just rebuilt, or
    // refuses a reset whose media all resolves.
    const r = runStep(0);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`checked ${r.db}`);
    expect(r.stdout).toContain('STEP PASSED');
    expect(r.stderr).toMatch(/SYNTHETIC: media integrity check replaced by RESET_MEDIA_CHECK_CMD=/);
  });

  it('reports a check that never ran as unknown rather than as missing files', () => {
    // Defect: a checker crash is reported as missing media, sending the developer to
    // re-seed when the seed was never the problem.
    const r = runStep(2);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/could not run \(exit 2\)/);
    expect(r.stderr).not.toMatch(/does not hold/);
  });
});
