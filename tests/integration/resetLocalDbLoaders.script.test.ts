/**
 * The local database reset lists what its Python loaders printed.
 *
 * A loader that skips a row or warns about its input says so on its own output,
 * which scrolls past during a reset hundreds of lines long. The reset runs every
 * loader through one helper that shows that output and then reads it, so each
 * warning, skipped row and error line lands in the closing report, and a loader
 * that fails stops the reset.
 *
 * The helper is sliced out of the reset and run under bash with a stand-in
 * interpreter; the full reset rebuilds a whole database and is the maintainer's
 * gate. A scan of the reset itself holds the other half: no loader is called
 * around the helper.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const RESET = join(process.cwd(), 'scripts/reset-local-db.sh');
const LIB = join(process.cwd(), 'scripts/lib/closing-report.sh');

let scratch: string;

beforeEach(() => {
  scratch = createScratchDir('reset-loaders');
});

afterEach(() => {
  removeScratch(scratch);
});

/** From the loader grammar to the end of the helper that applies it. */
function helper(): string {
  const lines = readFileSync(RESET, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith('LOADER_WARNINGS='));
  expect(start, 'the loader grammar anchors the slice').toBeGreaterThan(0);
  const end = lines.findIndex((l, i) => i > start && l === '}');
  expect(end, 'the end of the helper anchors the slice').toBeGreaterThan(start);
  return lines.slice(start, end + 1).join('\n');
}

/** Runs one loader through the helper; the stand-in prints `out` and exits `code`. */
function runLoader(out: string, code = 0) {
  const python = join(scratch, 'python');
  writeFileSync(python, `#!/usr/bin/env bash\nprintf '%s\\n' ${JSON.stringify(out)} >&2\nexit ${code}\n`);
  chmodSync(python, 0o755);
  const harness = join(scratch, 'harness.sh');
  writeFileSync(
    harness,
    [
      'set -euo pipefail',
      `source '${LIB}'`,
      `PYTHON='${python}'`,
      helper(),
      'load legacy_data/scripts/load_given_name_variants_to_sqlite.py --db x.db',
      'echo "AFTER LOADER"',
      'cr_finish',
    ].join('\n'),
  );
  const res = spawnSync('bash', [harness], { encoding: 'utf-8', ...SPAWN_GUARD });
  const stderr = res.stderr ?? '';
  return {
    status: res.status,
    stdout: res.stdout ?? '',
    report: stderr.slice(Math.max(0, stderr.indexOf('==== Closing report'))),
  };
}

describe('the reset\'s loader helper', () => {
  // Defect caught: a loader's skipped row scrolled past and the reset ended
  // clean, so rows went missing from the local database with nothing listed.
  it('lists a skipped row as a warning and carries on', () => {
    const r = runLoader('  SKIP: invalid pair (a,b)');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('AFTER LOADER');
    expect(r.report).toMatch(/Warnings \(1\):\n {2}- load_given_name_variants_to_sqlite\.py: {3}SKIP: invalid pair \(a,b\)/);
  });

  // Defect caught: a loader that printed an error and still exited 0 left the
  // reset reporting success over a load it refused part of.
  it('lists an error line as an error even when the loader exits 0', () => {
    const r = runLoader('  ERROR: person p1 refused');
    expect(r.status).not.toBe(0);
    expect(r.report).toMatch(/- load_given_name_variants_to_sqlite\.py: {3}ERROR: person p1 refused/);
  });

  it('stops the reset when a loader fails', () => {
    const r = runLoader('loader blew up', 3);
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('AFTER LOADER');
    expect(r.report).toMatch(/load_given_name_variants_to_sqlite\.py: exit 3: loader blew up/);
  });

  it('lists nothing for a loader that reports nothing wrong', () => {
    const r = runLoader('  loaded 12 rows');
    expect(r.status).toBe(0);
    expect(r.report).toContain('No errors or warnings.');
  });
});

describe('every loader the reset runs goes through the helper', () => {
  // Defect caught: a loader added as a bare interpreter call has its warnings
  // and skipped rows dropped again, with nothing failing to say so.
  it('calls no Python loader around the helper', () => {
    const bare = readFileSync(RESET, 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('#'))
      .filter((l) => /^\s*"\$\{PYTHON\}"/.test(l));
    expect(bare).toEqual([]);
    expect(readFileSync(RESET, 'utf8')).toMatch(/^\s*load legacy_data\//m);
  });
});
