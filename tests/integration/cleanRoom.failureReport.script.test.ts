/**
 * run_clean_room.sh — what a failed gate leaves the reader to work with.
 *
 * The clean room runs eleven gates in sequence and keeps going after one fails,
 * which is what makes a single run worth having: a maintainer learns everything
 * the runner would object to, not just the first thing. The cost is that the
 * failing gate's output is buried by the time the run ends — the loader gate and
 * the two Python suites run long after the vitest tiers and emit thousands of
 * lines between them — and the summary names which gate failed without saying
 * why.
 *
 * That cost is not only a scroll-back inconvenience. `run_all_tests.sh` re-shows
 * `tail -n 60` of a failed gate's captured output, and when the failed gate is
 * the clean room, those last sixty lines were always the last gate to run rather
 * than the one that failed. A full-run report named `clean-room FAIL (exit 1)`
 * and then printed a passing Python suite underneath it, which is a report that
 * cannot be acted on at all.
 *
 * So the contract asserted here: a failed gate's output is re-shown at the end
 * of the run, after the summary, naming the gate. Passing gates are not
 * re-shown, and a green run carries no recap section.
 *
 * The gates are stubbed rather than run. What is under test is the reporting,
 * and the eleven real gates take the better part of an hour.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'ci', 'run_clean_room.sh');

/** A line only the stubbed integration gate emits, so finding it proves where it came from. */
const GATE_SAID = 'STUB-INTEGRATION-GATE-OUTPUT-MARKER';

const scratch = createScratchDir('clean-room-failure-report');

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/**
 * A PATH directory holding just enough of git, npm and python3 for the script to
 * reach its gates. `git` answers without touching the repository: the worktree
 * it is asked to add is a `mkdir`, so a test run can neither write to the real
 * checkout nor leave a worktree registration behind.
 */
function stubBin(label: string, npmBody: string): string {
  const dir = path.join(scratch, label, 'bin');
  mkdirSync(dir, { recursive: true });

  writeFileSync(
    path.join(dir, 'git'),
    `#!/bin/bash
case "$1" in
  rev-parse) echo "$PWD/.git" ;;
  worktree)
    if [ "$2" = add ]; then
      for a in "$@"; do
        case "$a" in /tmp/footbag-clean-room.*) mkdir -p "$a" ;; esac
      done
    fi
    ;;
  diff|ls-files) : ;;      # no working-tree changes, no untracked files to carry
esac
exit 0
`,
    { mode: 0o755 },
  );

  writeFileSync(path.join(dir, 'npm'), `#!/bin/bash\n${npmBody}\n`, { mode: 0o755 });

  // Refusing to build a virtual environment is a state the script already
  // handles: whatever needs that environment records NOT RUN rather than
  // failing. The later Python gates are out of reach under --quick, but the
  // integration tier is not, and one of its suites drives the legacy extractors
  // through an interpreter carrying the pipeline's dependencies, so a quick run
  // with this stub ends INCOMPLETE rather than green.
  writeFileSync(path.join(dir, 'python3'), '#!/bin/bash\nexit 1\n', { mode: 0o755 });

  return dir;
}

function runCleanRoom(binDir: string): { status: number | null; out: string } {
  const home = path.join(scratch, path.basename(path.dirname(binDir)), 'home');
  mkdirSync(home, { recursive: true });
  const r = spawnSync('bash', [SCRIPT, '--quick'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { PATH: `${binDir}:${process.env.PATH ?? ''}`, HOME: home, TERM: 'dumb' },
    ...SPAWN_GUARD,
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** npm that passes every gate. */
const NPM_ALL_PASS = 'exit 0';

/** npm that fails the integration gate, and only that one, with output of its own. */
const NPM_INTEGRATION_FAILS = `if [ "$1" = run ] && [ "$2" = test:integration ]; then
  echo "${GATE_SAID}"
  exit 1
fi
exit 0`;

/** A violation line, printed first and then buried, the way the convention gate buries its own. */
const EARLY_MARKER = 'STUB-VIOLATION-PRINTED-EARLY';

/** npm whose integration gate names its problem up front, then emits 200 lines of nothing. */
const NPM_FAILS_EARLY_THEN_BURIES = `if [ "$1" = run ] && [ "$2" = test:integration ]; then
  echo "FAIL: ${EARLY_MARKER}"
  i=1
  while [ $i -le 200 ]; do echo "check $i passed"; i=$((i + 1)); done
  exit 1
fi
exit 0`;

describe('run_clean_room.sh: a failed gate says why, at the end of the run', () => {
  it('re-shows the failed gate output after the summary, where the outer runner will find it', () => {
    const { status, out } = runCleanRoom(stubBin('fails', NPM_INTEGRATION_FAILS));

    expect(status, out).toBe(1);

    const summaryAt = out.indexOf('CLEAN ROOM SUMMARY');
    expect(summaryAt, 'the run must still print its summary').toBeGreaterThan(-1);

    // The gate's output streamed live long before the summary. What matters is
    // that it is ALSO present after it: that copy is the one `tail -n 60` of
    // this log reaches.
    const afterSummary = out.slice(summaryAt);
    expect(afterSummary).toContain('clean-room failure details');
    expect(afterSummary).toContain('clean-room:integration');
    expect(
      afterSummary,
      'the failing gate output must be re-shown after the summary, not only streamed live',
    ).toContain(GATE_SAID);
  });

  it('re-shows only the gates that failed', () => {
    const { out } = runCleanRoom(stubBin('fails-one', NPM_INTEGRATION_FAILS));

    const recapAt = out.indexOf('clean-room failure details');
    const recap = out.slice(recapAt);
    expect(recap).toContain('──── clean-room:integration ────');
    expect(recap, 'a passing gate has nothing to explain').not.toContain('──── clean-room:build ────');
    expect(recap).not.toContain('──── clean-room:unit ────');
  });

  it('prints no recap section when every gate passes', () => {
    const { status, out } = runCleanRoom(stubBin('passes', NPM_ALL_PASS));

    // Exit 77, not 0. The stubbed python3 refuses to build a virtual
    // environment, and one integration suite drives the legacy club extractors
    // through an interpreter that needs the pipeline's dependencies. That suite
    // is excluded and recorded NOT RUN, which ends the run INCOMPLETE. Nothing
    // failed: a room that could not build what a suite needs has not tested it,
    // and saying so is the difference between a short answer and a wrong one.
    expect(status, out).toBe(77);
    expect(out).toContain('CLEAN ROOM INCOMPLETE');
    expect(out).toContain('integration-club-chain');
    // The recap exists for failed gates. A gate that did not run has nothing to
    // re-show, so the run still carries no recap section.
    expect(out).toContain('CLEAN ROOM SUMMARY');
    expect(out).not.toContain('clean-room failure details');
  });

  it('reaches a violation the gate printed before burying it under its own output', () => {
    const { out } = runCleanRoom(stubBin('buried', NPM_FAILS_EARLY_THEN_BURIES));

    const recapAt = out.indexOf('clean-room failure details');
    expect(recapAt, 'a failed gate must still produce a recap').toBeGreaterThan(-1);

    // The shape the convention gate has in real life: it names each violation
    // the moment its check finds it, then runs sixty-four more checks that
    // print nothing but progress. A recap selected by position reaches the
    // progress and never the violation, which is how a full-run report came to
    // say a rule had been violated and then show a clean run underneath.
    expect(
      out.slice(recapAt),
      'the recap must select by what the line says, not by where it sat in the log',
    ).toContain(EARLY_MARKER);
  });

  it('names the file holding the whole log, since the recap is a selection', () => {
    const { out } = runCleanRoom(stubBin('names-log', NPM_INTEGRATION_FAILS));

    const recap = out.slice(out.indexOf('clean-room failure details'));
    // A recap chooses, and a choice can miss. The full output has to outlive
    // the worktree the trap removes, or a miss costs the reader another run.
    expect(recap).toContain('full output: ');
    expect(recap).toContain('integration.log');
  });
});
