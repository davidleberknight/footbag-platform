/**
 * The local runner's final report carries every failure, every skip with its
 * reason, and every warning a gate printed, on every kind of run.
 *
 * A full run lasts an hour and its output is read from the end. What is not in
 * the report at the end is, in practice, not reported: a failure's actual error
 * sat above a sixty-line tail, a skip said only SKIP, a warning a passing gate
 * printed scrolled past unseen, a failed run exited before listing what it had
 * not checked, and a Ctrl-C printed nothing while the exit trap deleted every
 * log.
 *
 * The report functions are extracted from run_all_tests.sh and driven through
 * run_gate with stub gates, so the code under test is the shipped code and the
 * assertions are about what a reader would actually see. Only the ordering of
 * the script's top-level ending, which cannot be extracted as a function, is
 * asserted by reading the script.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNNER = join(REPO_ROOT, 'run_all_tests.sh');
const RUNNER_TEXT = readFileSync(RUNNER, 'utf8');
const dirs: string[] = [];

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** The named top-level functions and variables, exactly as the runner defines them. */
function extract(): string {
  const fn = (name: string) =>
    spawnSync('sed', ['-n', `/^${name}() {/,/^}/p`, RUNNER], { encoding: 'utf8', ...SPAWN_GUARD }).stdout;
  const line = (prefix: string) => RUNNER_TEXT.split('\n').find((l) => l.startsWith(prefix)) ?? '';
  return [
    line('FAILURE_GRAMMAR='),
    line('NOTICE_GRAMMAR='),
    line('ROOM_CARRIES_UNDER_FULL='),
    line('PUSH_GATE_EQUIVALENTS='),
    ...['summarize', 'recap_gate_log', 'dump_failures', 'notices_from', 'print_notices', 'skip_reason',
      'on_interrupt', 'run_gate', 'note_gate', 'room_carries', 'checkout_gate', 'import_clean_room_results',
      'print_not_checked'].map(fn),
    line('trap on_interrupt'),
  ].join('\n');
}

/**
 * Runs `body` after the extracted functions, with the runner's globals in place
 * and a gate log directory of its own.
 */
function drive(body: string): { status: number | null; out: string; logDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-runner-report-'));
  dirs.push(dir);
  const logDir = join(dir, 'gate-logs');
  const driver = join(dir, 'driver.sh');
  writeFileSync(
    driver,
    [
      'set -euo pipefail',
      'GATE_NAMES=(); GATE_RESULTS=(); FAIL_LOGS=(); ANY_FAIL=0; FAIL_FAST=0; FULL=0; CURRENT_GATE=""',
      `GATE_LOG_DIR=${JSON.stringify(logDir)}; mkdir -p "$GATE_LOG_DIR"`,
      'PREFLIGHT_LOG="${GATE_LOG_DIR}/preflight.log"',
      // The tool report's own shape for a problem (scripts/lib/tool-report.sh), with
      // a reason that none of the other notice words would catch on its own.
      'echo "  [missing] gitleaks 8.20.0 is installed but the push gate runs 8.24.3, and docker is not running to supply it. Install gitleaks 8.24.3, or start docker." > "$PREFLIGHT_LOG"',
      'echo "WARNING: the legacy pipeline\'s Python environment is missing" >> "$PREFLIGHT_LOG"',
      extract(),
      body,
    ].join('\n'),
  );
  const res = spawnSync('bash', [driver], { encoding: 'utf8', ...SPAWN_GUARD });
  return { status: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}`, logDir };
}

/** A gate that names its failure first and then buries it, as coverage and pytest do. */
const BURYING_GATE = [
  'burying_gate() {',
  '  echo "FAIL tests/integration/seederEnv.script.test.ts > rebuilds an environment"',
  '  local i; for i in $(seq 1 120); do echo "  src/file$i.ts | 91.2 | 88.0 |"; done',
  '  return 1',
  '}',
].join('\n');
const SKIPPING_GATE = 'skipping_gate() { echo "working"; echo "  terraform CLI absent — skipping."; return 77; }';
const INCOMPLETE_ROOM = [
  'incomplete_room() {',
  '  echo "  legacy-pytest      NOT RUN (could not build the pinned Python environment)"',
  '  echo "  NOT PROVEN BY THIS RUN"',
  '  echo "    ffmpeg  6.1.1"',
  '  echo "=============================================="',
  '  return 77',
  '}',
].join('\n');
const WARNING_GATE = 'warning_gate() { echo "npm warn deprecated prebuild-install@7.1.3"; echo "WARNING: 2 opt-in gates not run"; return 0; }';

describe('the final report, driven through run_gate with stub gates', () => {
  it('shows a failed gate’s actual error, however far above the tail it was printed', () => {
    const r = drive(`${BURYING_GATE}\nrun_gate coverage burying_gate\nsummarize\ndump_failures`);
    const details = r.out.slice(r.out.indexOf('failure details'));
    expect(details).toContain('FAIL tests/integration/seederEnv.script.test.ts > rebuilds an environment');
    expect(details).toContain(`full output: ${join(r.logDir, 'coverage.log')}`);
  });

  it('keeps every gate’s full log where the report says it is', () => {
    const r = drive(`${BURYING_GATE}\nrun_gate coverage burying_gate\nsummarize\ndump_failures`);
    expect(existsSync(join(r.logDir, 'coverage.log'))).toBe(true);
    expect(r.out).toContain(`Every gate's full output: ${r.logDir}/`);
  });

  it('gives a skipped gate its reason in the summary row', () => {
    const r = drive(`${SKIPPING_GATE}\nrun_gate terraform skipping_gate\nsummarize`);
    const summary = r.out.slice(r.out.indexOf('run_all_tests.sh — summary'));
    expect(summary).toMatch(/terraform\s+SKIP \(terraform CLI absent — skipping\.\)/);
  });

  it('names each check a skipped clean room could not run', () => {
    const r = drive(`${INCOMPLETE_ROOM}\nrun_gate clean-room incomplete_room\nsummarize`);
    const summary = r.out.slice(r.out.indexOf('run_all_tests.sh — summary'));
    expect(summary).toContain('SKIP (legacy-pytest NOT RUN (could not build the pinned Python environment))');
  });

  it('collects warnings from the preflight and from gates that passed', () => {
    const r = drive(`${WARNING_GATE}\nrun_gate audit warning_gate\nprint_notices`);
    const notices = r.out.slice(r.out.indexOf(' notices ('));
    expect(notices).toContain('──── preflight ────');
    expect(notices).toContain('[missing] gitleaks 8.20.0 is installed but the push gate runs 8.24.3');
    expect(notices).toContain("legacy pipeline's Python environment is missing");
    expect(notices).toContain('──── audit ────');
    expect(notices).toContain('npm warn deprecated prebuild-install@7.1.3');
  });

  it('carries the clean room’s list of what it could not prove', () => {
    const r = drive(`${INCOMPLETE_ROOM}\nrun_gate clean-room incomplete_room\nprint_notices`);
    const notices = r.out.slice(r.out.indexOf(' notices ('));
    expect(notices).toContain('clean-room: not proven by that run');
    expect(notices).toContain('ffmpeg  6.1.1');
  });

  it('prints the report for the finished gates when the run is interrupted, naming the gate it landed in', () => {
    const interrupted = 'interrupted_gate() { echo "halfway"; kill -INT $$; sleep 0.3; return 0; }';
    const r = drive(
      `${BURYING_GATE}\n${interrupted}\nrun_gate coverage burying_gate\nrun_gate e2e interrupted_gate\necho "SHOULD NOT REACH"`,
    );
    expect(r.status).toBe(130);
    expect(r.out).toContain('INTERRUPTED during the e2e gate');
    expect(r.out).toContain('run_all_tests.sh — summary');
    expect(r.out.slice(r.out.indexOf('failure details'))).toContain('FAIL tests/integration/seederEnv');
    expect(r.out).not.toContain('SHOULD NOT REACH');
  });
});

/** What the clean room writes with --results: a pass, a failed coverage run, and a gate it could not run. */
const ROOM_RESULTS = [
  'build\tPASS\t',
  'coverage\tFAIL\texit 1',
  'legacy-pytest\tNOTRUN\tcould not build the pinned Python environment',
].join('\n');

/** Writes ROOM_RESULTS where run_gate looks for them, then a clean room that failed. */
const FAILED_ROOM = [
  'CLEAN_ROOM_RESULTS="${GATE_LOG_DIR}/clean-room-results.tsv"',
  // %b, because the JSON string carries its tabs and newlines as escapes.
  `printf '%b\\n' ${JSON.stringify(ROOM_RESULTS)} > "$CLEAN_ROOM_RESULTS"`,
  'failed_room() { echo "CLEAN ROOM FAILED"; return 1; }',
].join('\n');

const summaryOf = (out: string) => out.slice(out.indexOf('run_all_tests.sh — summary'));

describe('each test runs once under --full', () => {
  it('leaves a gate the clean room carries to the room under --full, adding no checkout row', () => {
    const r = drive('FULL=1\nran_it() { echo "CHECKOUT-RAN-BUILD"; }\ncheckout_gate build ran_it\nsummarize');
    expect(r.out).not.toContain('CHECKOUT-RAN-BUILD');
    expect(r.out).toContain('[build] left to the clean room');
    expect(summaryOf(r.out)).not.toMatch(/^\s+build\s/m);
  });

  it('still runs that gate in the checkout in every other mode', () => {
    const r = drive('FULL=0\nran_it() { echo "CHECKOUT-RAN-BUILD"; }\ncheckout_gate build ran_it\nsummarize');
    expect(r.out).toContain('CHECKOUT-RAN-BUILD');
    expect(summaryOf(r.out)).toMatch(/^\s+build\s+PASS$/m);
  });

  it('runs a gate the room does not carry in the checkout even under --full', () => {
    const r = drive('FULL=1\nran_it() { echo "CHECKOUT-RAN-AUDIT"; }\ncheckout_gate audit ran_it\nsummarize');
    expect(r.out).toContain('CHECKOUT-RAN-AUDIT');
  });

  it('gives each gate the clean room ran its own summary row', () => {
    const r = drive(`FULL=1\n${FAILED_ROOM}\nrun_gate clean-room failed_room\nsummarize`);
    const summary = summaryOf(r.out);
    expect(summary).toMatch(/clean-room\s+FAIL \(exit 1\)/);
    expect(summary).toMatch(/build\s+PASS \(clean room\)/);
    expect(summary).toMatch(/coverage\s+FAIL \(clean room, exit 1\)/);
    expect(summary).toMatch(/legacy-pytest\s+NOT RUN \(clean room: could not build the pinned Python environment\)/);
  });

  it('reports the unit and integration tiers with the coverage run that executed them', () => {
    const r = drive(`FULL=1\n${FAILED_ROOM}\nrun_gate clean-room failed_room\nsummarize`);
    const summary = summaryOf(r.out);
    expect(summary).toMatch(/unit\s+FAIL \(clean room, in the coverage run\)/);
    expect(summary).toMatch(/integration\s+FAIL \(clean room, in the coverage run\)/);
  });

  it('adds no failure of its own for a room row: the room row carries the failure and its recap', () => {
    const r = drive(`FULL=1\n${FAILED_ROOM}\nrun_gate clean-room failed_room\nsummarize\ndump_failures`);
    expect(r.out).toContain('FAILED gates (1): clean-room');
  });

  it('still names each room gate when the room fails a fail-fast run', () => {
    const r = drive(
      `FULL=1\nFAIL_FAST=1\nassert_real_data_untouched() { :; }\n${FAILED_ROOM}\nrun_gate clean-room failed_room\necho "SHOULD NOT REACH"`,
    );
    expect(r.status).toBe(1);
    expect(summaryOf(r.out)).toMatch(/coverage\s+FAIL \(clean room, exit 1\)/);
    expect(r.out).not.toContain('SHOULD NOT REACH');
  });

  it('keeps the rows of the gates the room finished when the run is interrupted inside it', () => {
    const r = drive(
      `FULL=1\n${FAILED_ROOM}\ninterrupted_room() { kill -INT $$; sleep 0.3; return 0; }\nrun_gate clean-room interrupted_room\necho "SHOULD NOT REACH"`,
    );
    expect(r.status).toBe(130);
    expect(r.out).toContain('INTERRUPTED during the clean-room gate');
    expect(summaryOf(r.out)).toMatch(/build\s+PASS \(clean room\)/);
  });

  it('adds no rows when the room wrote no results', () => {
    const r = drive(
      'FULL=1\nCLEAN_ROOM_RESULTS="${GATE_LOG_DIR}/absent.tsv"\nroom() { return 1; }\nrun_gate clean-room room\nsummarize',
    );
    expect(r.status, r.out).toBe(0);
    expect(summaryOf(r.out)).toMatch(/clean-room\s+FAIL \(exit 1\)/);
    expect(summaryOf(r.out)).not.toContain('(clean room');
  });
});

describe('the legacy-mirror gate, run only by name', () => {
  const gates = () => ['run_legacy_pytest', 'gate_legacy_mirror'].map((name) =>
    spawnSync('sed', ['-n', `/^${name}() {/,/^}/p`, RUNNER], { encoding: 'utf8', ...SPAWN_GUARD }).stdout,
  ).join('\n');

  /** A pipeline interpreter standing in for pytest, printing what pytest -rs prints for a skip. */
  const FAKE_PYTEST = [
    'LOG_DIR="$(dirname "$GATE_LOG_DIR")/scratch"; mkdir -p "$LOG_DIR"',
    'fake_py="${LOG_DIR}/python"',
    `printf '%s\\n' '#!/bin/bash' 'echo "ARGS: $*"' 'echo "PYCACHE: [$PYTHONPYCACHEPREFIX]"' 'echo "SKIPPED [1] legacy_data/tests/x.py:9: the delivered export is absent here"' 'echo "3 passed, 1 skipped"' > "$fake_py"`,
    'chmod +x "$fake_py"',
    'pipeline_python() { echo "$fake_py"; }',
  ].join('\n');

  it('runs the legacy-mirror suite, and only it, without writing bytecode or a pytest cache into the tree', () => {
    const r = drive(`${FAKE_PYTEST}\n${gates()}\nrun_gate legacy-mirror gate_legacy_mirror`);
    expect(r.out).toContain('ARGS: -m pytest legacy_data/legacy_mirror/tests/ -q -p no:cacheprovider');
    const pycache = /PYCACHE: \[([^\]]*)\]/.exec(r.out)?.[1] ?? '';
    expect(pycache, 'bytecode must be redirected somewhere').not.toBe('');
    expect(pycache.startsWith(REPO_ROOT), `bytecode redirected into the tree: ${pycache}`).toBe(false);
  });
});

describe('what --full turns on, read from the script', () => {
  const fullBlock = RUNNER_TEXT.slice(RUNNER_TEXT.indexOf('if (( FULL == 1 )); then\n  QUICK=0'));
  const fullImplies = fullBlock.slice(0, fullBlock.indexOf('\nfi\n'));

  it('needs nothing but the checkout: no suite that reads machine-local data or a running dev stack', () => {
    for (const machineLocal of ['WITH_PERSONA_CRAWL', 'WITH_REALDATA_INVARIANTS', 'WITH_LEGACY_MIRROR', 'WITH_MUTATION']) {
      expect(fullImplies, machineLocal).not.toContain(machineLocal);
    }
    expect(RUNNER_TEXT).not.toContain('gate_member_data_audits');
  });

  it('names each of those in every run, with its switch', () => {
    for (const optIn of ['"persona-crawl:--with-persona-crawl"', '"realdata-invariants:--with-realdata-invariants"']) {
      expect(RUNNER_TEXT).toContain(optIn);
    }
  });
});

describe('every test that did not run is named, on every exit that reports', () => {
  const failing = 'failing_gate() { echo "broke"; return 1; }';

  it('names what the run did not check when --fail-fast stops it', () => {
    const r = drive(`FULL=1\nFAIL_FAST=1\nassert_real_data_untouched() { :; }\n${failing}\nrun_gate audit failing_gate`);
    expect(r.status).toBe(1);
    const notChecked = r.out.slice(r.out.indexOf('WHAT THIS RUN DID NOT CHECK'));
    expect(notChecked).toContain('legacy-mirror (not run; --with-legacy-mirror runs it)');
    expect(notChecked).toContain('build (not reached: the run stopped before the clean room');
  });

  it('names what the run did not check when it is interrupted', () => {
    const r = drive('FULL=1\nstopped() { kill -INT $$; sleep 0.3; return 0; }\nrun_gate audit stopped');
    expect(r.status).toBe(130);
    expect(r.out).toContain('WHAT THIS RUN DID NOT CHECK');
  });

  it('names the pentest legs no flag of this runner runs, with the command that does', () => {
    const r = drive('FULL=1\nprint_not_checked');
    expect(r.out).toContain('pentest active ZAP scan and dependency scan (not run; npm run test:pentest:heavy -- --all runs them)');
  });

  it('gives a skipped clean room the gates it could not run, not its earlier prose, and never cuts the list', () => {
    const room = [
      'room_77() {',
      '  echo "  The Python gates will report NOT RUN rather than answer with a different"',
      '  echo "  db-load-smoke      NOT RUN (sqlite3 is not installed)"',
      '  echo "  freestyle-db-integrity NOT RUN (sqlite3 is not installed)"',
      `  echo "  legacy-pytest      NOT RUN (${'x'.repeat(200)})"`,
      '  return 77',
      '}',
    ].join('\n');
    const r = drive(`${room}\nrun_gate clean-room room_77\nsummarize`);
    const row = summaryOf(r.out).split('\n').find((l) => /^\s+clean-room\s/.test(l)) ?? '';
    expect(row).not.toContain('rather than answer');
    expect(row).toContain('db-load-smoke NOT RUN (sqlite3 is not installed)');
    expect(row).toContain(`legacy-pytest NOT RUN (${'x'.repeat(200)})`);
  });

  it('puts a check that did not run ahead of other notices, so the cap cannot hide it', () => {
    const noisy = [
      'noisy_gate() {',
      '  local i; for i in $(seq 1 20); do echo "WARNING: noise $i"; done',
      '  echo "  [zap] NOT RUN: Docker not found, so the ZAP baseline leg was skipped"',
      '  return 0',
      '}',
    ].join('\n');
    const r = drive(`${noisy}\nrun_gate pentest noisy_gate\nprint_notices`);
    expect(r.out.slice(r.out.indexOf('──── pentest ────'))).toContain('[zap] NOT RUN: Docker not found');
  });

  it('carries a suite that passed with skipped tests into the notices', () => {
    const skips = 'skips_gate() { echo "SKIPPED [1] legacy_data/tests/x.py:9: export absent"; echo "1520 passed, 9 skipped in 60s"; return 0; }';
    const r = drive(`${skips}\nrun_gate legacy-mirror skips_gate\nprint_notices`);
    const notices = r.out.slice(r.out.indexOf(' notices ('));
    expect(notices).toContain('1520 passed, 9 skipped');
    expect(notices).toContain('SKIPPED [1] legacy_data/tests/x.py:9: export absent');
  });

  it('never reports a passing test as a notice, whatever its title says', () => {
    const passing = 'passing_gate() { echo "   ✓ says a runtime profile is absent rather than that it cannot be assumed  1488ms"; return 0; }';
    const r = drive(`${passing}\nrun_gate clean-room passing_gate\nprint_notices`);
    expect(r.out.slice(r.out.indexOf(' notices ('))).not.toContain('says a runtime profile is absent');
  });

  it('ends a skipped audit with a line that says why, since the row takes its reason from the last line', () => {
    const audit = RUNNER_TEXT.slice(RUNNER_TEXT.indexOf('gate_audit() {'));
    const skipBranch = audit.slice(0, audit.indexOf('return 77'));
    const lastEcho = skipBranch.trim().split('\n').filter((l) => l.includes('echo')).pop() ?? '';
    expect(lastEcho).toContain('audit SKIPPED: npm registry audit endpoint unreachable');
  });
});

describe('the switches that decide what runs, read from the script', () => {
  const fullBlock = RUNNER_TEXT.slice(RUNNER_TEXT.indexOf('if (( FULL == 1 )); then\n  QUICK=0'));
  const fullImplies = fullBlock.slice(0, fullBlock.indexOf('\nfi\n'));

  it('never lets --full imply the legacy-mirror suite, and lists it with its switch when it did not run', () => {
    expect(fullImplies).toContain('PENTEST=1');
    expect(fullImplies).not.toContain('WITH_LEGACY_MIRROR');
    expect(RUNNER_TEXT).toContain('"legacy-mirror:--with-legacy-mirror"');
    expect(RUNNER_TEXT).toMatch(/--with-legacy-mirror\) WITH_LEGACY_MIRROR=1 ;;/);
  });

  it('never runs the @a11y specs a second time where the e2e gate already ran them', () => {
    const a11y = RUNNER_TEXT.slice(RUNNER_TEXT.indexOf('if (( A11Y == 1 )); then'));
    expect(a11y.slice(0, a11y.indexOf('\nfi\n'))).toMatch(
      /if \(\( QUICK == 0 \)\); then\n\s+note_gate a11y "COVERED \(the e2e gate ran the @a11y specs\)"\n\s+else\n\s+run_gate a11y/,
    );
  });

  it('records a secret scan left out by --skip-secret-scan as a skip of a push-gate job, so the run cannot end GREEN', () => {
    expect(RUNNER_TEXT).toMatch(/--skip-secret-scan\)\s+SKIP_SECRET_SCAN=1 ;;/);
    expect(RUNNER_TEXT).toContain('note_gate secret-scan "SKIP (left out by --skip-secret-scan; the push gate still runs it)"');
    expect(RUNNER_TEXT).toMatch(/^PUSH_GATE_EQUIVALENTS="[^"]*\bsecret-scan\b/m);
  });

  it('says a gate the room carries was not reached, rather than pointing at a room row that does not exist', () => {
    expect(RUNNER_TEXT).toContain('(not reached: the run stopped before the clean room, which runs it under --full)');
  });

  it('hands the clean room a results file, and leaves the tiers it runs to it', () => {
    expect(RUNNER_TEXT).toContain('run_gate clean-room bash scripts/ci/run_clean_room.sh --results "$CLEAN_ROOM_RESULTS"');
    for (const g of ['build', 'lint', 'conventions', 'generated-content', 'unit', 'integration']) {
      expect(RUNNER_TEXT, g).toMatch(new RegExp(`^checkout_gate ${g} `, 'm'));
    }
  });
});

describe('the ending of the run, read from the script', () => {
  // Top-level code, so it cannot be extracted and driven; what regressed was its
  // order, and the order is what is asserted.
  const at = (text: string) => {
    const i = RUNNER_TEXT.lastIndexOf(text);
    expect(i, `run_all_tests.sh must contain ${JSON.stringify(text)}`).toBeGreaterThan(-1);
    return i;
  };

  it('prints the whole report before any verdict can end the run', () => {
    const notChecked = at('\nprint_not_checked\n');
    for (const verdict of [
      'assert_real_data_untouched\n',
      'if ! assert_source_tree_unchanged; then',
      'one or more gates FAILED.',
      'run_all_tests.sh: INCOMPLETE.',
    ]) {
      expect(at(verdict), `${verdict.trim()} must come after the report`).toBeGreaterThan(notChecked);
    }
    expect(at('\nprint_notices\n')).toBeLessThan(notChecked);
    expect(at('\ndump_failures\n')).toBeLessThan(notChecked);
  });

  it('prints the notices on the fail-fast exit too', () => {
    const failFast = RUNNER_TEXT.indexOf('print_notices\n      print_not_checked\n      assert_real_data_untouched\n      exit 1');
    expect(failFast).toBeGreaterThan(-1);
  });
});
