/**
 * freestyle/run_freestyle.sh — the routine refresh of the freestyle tables.
 *
 * Every loader's own output stays on screen, and the closing report lists what
 * the run met: a loader's warning or skipped row, the advisory media-coverage
 * check's findings, and a failed hard gate. A problem a loader printed and the
 * rebuild then reported complete over is the defect this suite pins.
 *
 * The script runs from a scratch tree holding a copy of itself and the shared
 * libraries. The dev-database guard is a stand-in that passes, and PYTHON and
 * TSX are one stand-in that answers for each loader as the case says, so no
 * database is opened and no table is touched.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO = process.cwd();

let scratch: string;

beforeEach(() => {
  scratch = createScratchDir('run-freestyle');
  mkdirSync(join(scratch, 'freestyle'), { recursive: true });
  mkdirSync(join(scratch, 'scripts'), { recursive: true });
  copyFileSync(join(REPO, 'freestyle/run_freestyle.sh'), join(scratch, 'freestyle/run_freestyle.sh'));
  cpSync(join(REPO, 'scripts/lib'), join(scratch, 'scripts/lib'), { recursive: true });
  writeFileSync(join(scratch, 'freestyle/_assert_dev_db.sh'), 'exit 0\n');
  // The loader stand-in: each loader is named by its file, and the case says
  // what that one prints and how it exits.
  writeFileSync(
    join(scratch, 'python'),
    [
      '#!/usr/bin/env bash',
      'name="$(basename "$1")"',
      'echo "ran ${name}"',
      'case "$name" in',
      '  11_*) [ -n "${STUB_SKIP:-}" ] && echo "  SKIP: missing sort_order on row 7" >&2 ;;',
      '  21a_*) [ -n "${STUB_WARN:-}" ] && echo "WARNING: 2 alias rows did not resolve" ;;',
      '  22_*) [ -n "${STUB_22_FAILS:-}" ] && { echo "NAMING INVARIANT VIOLATIONS (hard gate):" >&2; exit 1; }',
      '        echo "  conflicts total           : ${STUB_22_REVIEW:-0}  (HIGH 0 / MED 0 / LOW 0 / WARN ${STUB_22_REVIEW:-0})" ;;',
      '  24_*) [ -n "${STUB_24_FAILS:-}" ] && { echo "orphan tags: 3"; exit 1; } ;;',
      '  25_*) [ -n "${STUB_25_FAILS:-}" ] && { echo "VIOLATIONS: 1" >&2; exit 1; } ;;',
      'esac',
      'exit 0',
      '',
    ].join('\n'),
  );
  chmodSync(join(scratch, 'python'), 0o755);
});

afterEach(() => {
  removeScratch(scratch);
});

function run(env: Record<string, string> = {}) {
  const res = spawnSync('bash', [join(scratch, 'freestyle/run_freestyle.sh')], {
    encoding: 'utf-8',
    env: { ...process.env, PYTHON: join(scratch, 'python'), TSX: join(scratch, 'python'), ...env },
    ...SPAWN_GUARD,
  });
  const stderr = res.stderr ?? '';
  const at = stderr.indexOf('==== Closing report');
  return { status: res.status, stdout: res.stdout ?? '', stderr, report: at < 0 ? '' : stderr.slice(at) };
}

describe('run_freestyle.sh — the closing report', () => {
  it('ends clean, with every loader run, when nothing reports a problem', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('ran 25_qc_media_tag_invariant.py');
    // The staged curator content runs between the rulings and the curator saves.
    const seeded = r.stdout.indexOf('ran 28a_seed_curator_content.ts');
    expect(seeded).toBeGreaterThan(r.stdout.indexOf('ran 28_load_ev_adjudications.py'));
    expect(r.stdout.indexOf('ran 29_apply_curator_saves.py')).toBeGreaterThan(seeded);
    expect(r.report).toContain('No errors or warnings.');
  });

  // Defect caught: a loader's skipped row was printed mid-stream and the rebuild
  // still finished with nothing listed, so rows went missing unreported.
  it('lists a loader\'s skipped row as a warning, and still succeeds', () => {
    const r = run({ STUB_SKIP: '1' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.report).toMatch(
      /Warnings \(1\):\n {2}- 11_load_consecutive_records_to_sqlite\.py: {3}SKIP: missing sort_order on row 7/,
    );
  });

  // Defect caught: a loader's warning line scrolled past above a success line.
  it('lists a loader\'s warning line, and still succeeds', () => {
    const r = run({ STUB_WARN: '1' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.report).toMatch(/- 21a_load_alias_additions\.py: WARNING: 2 alias rows did not resolve/);
  });

  it('lists the trick-dictionary review count only when there is something to review', () => {
    // Defect caught: the QC's summary line naming a zero WARN count listed as a
    // warning on every clean rebuild, teaching the reader to skip the list; or a
    // non-zero count of rows awaiting review never reaching it.
    const clean = run();
    expect(clean.status, clean.stderr).toBe(0);
    expect(clean.report).not.toMatch(/conflicts total/);
    const review = run({ STUB_22_REVIEW: '3' });
    expect(review.status, review.stderr).toBe(0);
    expect(review.report).toMatch(/22_qc_trick_dictionary\.py: +conflicts total .*WARN 3\)/);
  });

  // Defect caught: the advisory media-coverage check's failure was turned into
  // an echo, so its findings never reached the end of the run.
  it('lists a failed advisory media-coverage check as a warning with its last line, and still succeeds', () => {
    const r = run({ STUB_24_FAILS: '1' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.report).toMatch(/- 24_qc_freestyle_media_coverage\.py \(advisory\): exit 1: orphan tags: 3/);
    expect(r.stdout).toContain('ran 25_qc_media_tag_invariant.py');
  });

  it('fails the rebuild on the trick-dictionary hard gate, and lists it', () => {
    const r = run({ STUB_22_FAILS: '1' });
    expect(r.status).not.toBe(0);
    expect(r.report).toMatch(/- 22_qc_trick_dictionary\.py: exit 1/);
    expect(r.stdout).not.toContain('ran 24_qc_freestyle_media_coverage.py');
  });

  it('fails the rebuild on the media-tag invariant hard gate, and lists it', () => {
    const r = run({ STUB_25_FAILS: '1' });
    expect(r.status).not.toBe(0);
    expect(r.report).toMatch(/- 25_qc_media_tag_invariant\.py: exit 1/);
  });
});
