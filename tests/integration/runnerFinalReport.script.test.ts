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
    `source ${JSON.stringify(join(REPO_ROOT, 'scripts', 'lib', 'verdict-banner.sh'))}`,
    line('FAILURE_GRAMMAR='),
    line('NOTICE_GRAMMAR='),
    line('ROOM_CARRIES_UNDER_FULL='),
    line('PUSH_GATE_EQUIVALENTS='),
    line('REALDATA_ROWS='),
    line('ROOM_PYTHON_ROWS='),
    'LOCAL_VERDICT=""; BANNER_DONE=0',
    ...['mode_label', 'gate_counts', 'failed_names', 'tree_line', 'end_run', 'on_unexpected_exit', 'need_cmd',
      'summarize', 'recap_gate_log', 'dump_failures', 'notices_from', 'print_notices', 'skip_reason',
      'on_interrupt', 'run_gate', 'note_gate', 'room_carries', 'checkout_gate', 'import_clean_room_results',
      'print_not_checked', 'uncovered_skips', 'final_verdict'].map(fn),
    ...RUNNER_TEXT.split('\n').filter((l) => l.startsWith("trap 'on_interrupt ")),
  ].join('\n');
}

/**
 * Runs `body` after the extracted functions, with the runner's globals in place
 * and a gate log directory of its own.
 */
function drive(body: string): { status: number | null; out: string; stdout: string; logDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-runner-report-'));
  dirs.push(dir);
  const logDir = join(dir, 'gate-logs');
  const driver = join(dir, 'driver.sh');
  writeFileSync(
    driver,
    [
      'set -euo pipefail',
      'GATE_NAMES=(); GATE_RESULTS=(); FAIL_LOGS=(); ANY_FAIL=0; LOCAL_ANY_FAIL=0; STAGING_ANY_FAIL=0',
      'FAIL_FAST=0; FULL=0; STAGING=0; CURRENT_GATE=""; REALDATA_SOURCE=""',
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
  return { status: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}`, stdout: res.stdout ?? '', logDir };
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

const BAR = '#'.repeat(64);

/**
 * The verdict banner a run ended with: its word, the exit code it printed, its
 * lines, and whether it is the very last output.
 */
function bannerOf(out: string): { word: string; code: number; text: string; last: boolean } {
  const end = out.lastIndexOf(BAR);
  const start = out.lastIndexOf(BAR, end - 1);
  const text = start >= 0 && end > start ? out.slice(start, end + BAR.length) : '';
  const m = /## VERDICT: (.+?)\s{3}\(exit (\d+)\)/.exec(text);
  return {
    word: m?.[1] ?? '',
    code: m ? Number(m[2]) : -1,
    text,
    last: end >= 0 && out.slice(end + BAR.length).trim() === '',
  };
}

/**
 * Asserts the run ended with a banner carrying `word`, printed last on stdout (the
 * stream the report is on; this harness reads stderr separately, so its lines
 * cannot be placed in time against stdout's), naming the real exit code.
 */
function expectBanner(r: { status: number | null; out: string; stdout: string }, word: string): string {
  const b = bannerOf(r.stdout);
  expect(b.word, r.out).toBe(word);
  expect(b.last, `the verdict banner is not the last output:\n${r.out}`).toBe(true);
  expect(b.code, 'the banner names a different exit code from the one the run returned').toBe(r.status);
  return b.text;
}

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

  // Defect caught: a run that takes an hour gives no way to tell which gate the
  // hour went to.
  // No real time passes: the row's shape is the contract, and a wall-clock
  // sleep made the verdict depend on the machine's load.
  it('gives every gate that ran its elapsed seconds in the summary row', () => {
    const r = drive('quick_gate() { return 0; }\nrun_gate e2e quick_gate\nsummarize');
    expect(summaryOf(r.out)).toMatch(/^\s+e2e\s+PASS \[\d+s\]$/m);
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

  // Deterministic by construction: no real signal and no sleep. A signal sent
  // from inside the gate pipeline to the runner's own shell made the verdict
  // depend on scheduling under load. The runner's part is naming the gate while
  // it runs and the handler's output, so each is driven directly; delivering the
  // signal is bash's, and the trap line itself is held below.
  it('prints the report for the finished gates when the run is interrupted, naming the gate it landed in', () => {
    const seen = 'seen_gate() { echo "current gate: ${CURRENT_GATE}"; return 0; }';
    const r = drive(
      `${BURYING_GATE}\n${seen}\nrun_gate coverage burying_gate\nrun_gate e2e seen_gate\nCURRENT_GATE=e2e\non_interrupt\necho "SHOULD NOT REACH"`,
    );
    expect(r.status).toBe(130);
    // run_gate names the gate for the whole time it runs, which is what lets an
    // interrupt landing in it be reported against it.
    expect(r.out).toContain('current gate: e2e');
    expect(r.out).toContain('INTERRUPTED during the e2e gate');
    expect(r.out).toContain('run_all_tests.sh — summary');
    expect(r.out.slice(r.out.indexOf('failure details'))).toContain('FAIL tests/integration/seederEnv');
    expect(r.out).not.toContain('SHOULD NOT REACH');
    // Defect caught: an interrupted run ends on its report with no verdict, or a
    // verdict naming a different exit code from the one it returns.
    const banner = expectBanner(r, 'INTERRUPTED');
    expect(banner).toContain('during the e2e gate');
    expect(banner).toContain('Failed: coverage');
  });

  // Defect caught: the handler exists but is never installed, so an interrupted
  // run ends with no report at all, or a TERM is reported with INT's exit code.
  it('installs the interrupt handler for INT, TERM and HUP, each with its own exit code', () => {
    expect(RUNNER_TEXT).toMatch(/^trap 'on_interrupt 130' INT$/m);
    expect(RUNNER_TEXT).toMatch(/^trap 'on_interrupt 143' TERM$/m);
    expect(RUNNER_TEXT).toMatch(/^trap 'on_interrupt 129' HUP$/m);
  });

  // Defect caught: an interrupt lands in a gate, and the output that gate had
  // printed is never shown, because the gate never got a row.
  it('shows what the interrupted gate had printed, beside the verdict', () => {
    const r = drive(
      'mkdir -p "$GATE_LOG_DIR"; echo "FAIL half-way through a spec" > "$GATE_LOG_DIR/e2e.log"\nCURRENT_GATE=e2e\non_interrupt 143',
    );
    expect(r.status).toBe(143);
    expectBanner(r, 'INTERRUPTED');
    const tail = r.stdout.slice(r.stdout.indexOf('──── e2e (interrupted) ────'));
    expect(tail, r.out).toContain('FAIL half-way through a spec');
  });

  // Defect caught: a command that fails under set -e before any gate, or a
  // signal before the gate-time handler, ends the run with no verdict at all.
  it('prints an ABORTED verdict for a run that stopped on an unexpected error', () => {
    const r = drive('trap on_unexpected_exit EXIT\nLOG_DIR=""\nfalse\necho "SHOULD NOT REACH"');
    expect(r.status).toBe(1);
    expect(r.out).not.toContain('SHOULD NOT REACH');
    expect(expectBanner(r, 'ABORTED')).toContain('unexpected error');
  });

  // Defect caught: the backstop prints a second verdict after a run that ended
  // through its own banner.
  it('prints no second verdict when the run ended through its own banner', () => {
    const r = drive('trap on_unexpected_exit EXIT\nLOG_DIR=""\nFULL=1\nend_run GREEN 0 "fine"');
    expect(r.status).toBe(0);
    expect(r.stdout.split('## VERDICT:').length - 1).toBe(1);
  });

  // Defect caught: a failing preflight, the refusal this runner exists to make on
  // a machine missing a tool, aborts under pipefail before its status is read,
  // so the refusal and its verdict never print.
  it('never pipes the preflight, so its refusal reaches the verdict', () => {
    expect(RUNNER_TEXT).not.toMatch(/full_preflight[^\n]*\|\s*tee/);
    expect(RUNNER_TEXT).toContain('full_preflight > "${GATE_LOG_DIR}/full-preflight.log" 2>&1 || preflight_rc=$?');
  });

  // Defect caught: a failing assertion from a common tool matches none of the
  // patterns, so the report at the end shows only an unrelated tail.
  it('selects the failure lines eslint, Playwright, pytest, npm and bash print', () => {
    const lines = [
      "  12:5  error  'x' is defined but never used  no-unused-vars",
      '✖ 3 problems (3 errors, 0 warnings)',
      '  ✘  1 [chromium] › tests/e2e/a.spec.ts:3:1 › loads',
      'E   assert 1 == 2',
      'npm error code 1',
      'scripts/x.sh: line 4: foo: command not found',
      'VIOLATION: a rule was broken',
    ];
    const gate = `noisy() { ${lines.map((l) => `echo ${JSON.stringify(l)}`).join('; ')}; local i; for i in $(seq 1 40); do echo "ok $i"; done; return 1; }`;
    const r = drive(`${gate}\nrun_gate lint noisy\ndump_failures`);
    const hits = r.out.slice(r.out.indexOf('lines naming a failure'), r.out.indexOf('last 20 lines'));
    for (const l of lines) expect(hits, l).toContain(l.trim());
  });

  // Defect caught: a Ctrl-C or a CI cancel landing while the runner sets up a
  // gate's two-process pipeline leaves the runner spinning forever in its signal
  // handler, the report never printed and the gate never reaped. The window is a
  // race no test can hit on demand, so the shape that removes it is held: the
  // shell that holds the trap waits on one child, the pipeline's own subshell.
  it('runs each gate pipeline inside a single subshell', () => {
    const runGate = RUNNER_TEXT.slice(RUNNER_TEXT.indexOf('run_gate() {'), RUNNER_TEXT.indexOf('\n}\n', RUNNER_TEXT.indexOf('run_gate() {')));
    expect(runGate).toContain('( "$@" 2>&1 | tee "$log"; exit "${PIPESTATUS[0]}" )');
    expect(runGate).not.toMatch(/^\s*"\$@" 2>&1 \| tee "\$log"$/m);
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

describe('each test runs once in the bare run', () => {
  it('leaves a gate the clean room carries to the room in the bare run, adding no checkout row', () => {
    const r = drive('FULL=1\nran_it() { echo "CHECKOUT-RAN-BUILD"; }\ncheckout_gate build ran_it\nsummarize');
    expect(r.out).not.toContain('CHECKOUT-RAN-BUILD');
    expect(r.out).toContain('[build] left to the clean room');
    expect(summaryOf(r.out)).not.toMatch(/^\s+build\s/m);
  });

  it('still runs that gate in the checkout in every other mode', () => {
    const r = drive('FULL=0\nran_it() { echo "CHECKOUT-RAN-BUILD"; }\ncheckout_gate build ran_it\nsummarize');
    expect(r.out).toContain('CHECKOUT-RAN-BUILD');
    expect(summaryOf(r.out)).toMatch(/^\s+build\s+PASS \[\d+s\]$/m);
  });

  it('runs a gate the room does not carry in the checkout even in the bare run', () => {
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
    // Defect caught: a fail-fast stop ends without a verdict.
    expect(expectBanner(r, 'FAILED')).toContain('--fail-fast stopped the run at its first failing gate, clean-room');
  });

  it('keeps the rows of the gates the room finished when the run is interrupted inside it', () => {
    const r = drive(
      // The interrupt is the handler called with the room named as the gate it
      // landed in: no real signal, no sleep, so no scheduling decides the verdict.
      `FULL=1\n${FAILED_ROOM}\nCURRENT_GATE=clean-room\non_interrupt\necho "SHOULD NOT REACH"`,
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

/** The block that says what the bare run implies, which the conventions gate also reads. */
const FULL_BLOCK_AT = RUNNER_TEXT.indexOf('if (( FULL == 1 )); then\n  PENTEST=1');

describe('what the bare run turns on, read from the script', () => {
  const fullBlock = RUNNER_TEXT.slice(FULL_BLOCK_AT);
  it('has a block saying what the bare run implies', () => expect(FULL_BLOCK_AT).toBeGreaterThan(-1));
  const fullImplies = fullBlock.slice(0, fullBlock.indexOf('\nfi\n'));

  // Defect caught: the thorough local run leaves out the local real-data checks,
  // turns on a staging leg, or starts pulling in the retired legacy-mirror suite.
  it('turns on the local real-data checks, never a staging leg or the retired suite', () => {
    for (const implied of ['WITH_PERSONA_CRAWL=1', 'WITH_REALDATA_INVARIANTS=1']) {
      expect(fullImplies, implied).toContain(implied);
    }
    for (const never of ['WITH_LEGACY_MIRROR', 'WITH_SMOKE', 'STAGING']) {
      expect(fullImplies, never).not.toContain(never);
    }
    expect(RUNNER_TEXT).not.toContain('gate_member_data_audits');
  });

  // Defect caught: the password-hash tests run a second time in one bare run. The
  // unit tier already runs the production hash profile, and the login-timing
  // suite forces it, so a separate pass over them repeats tests already run.
  it('runs the password-hash tests once in a bare run, in the tiers, never as a gate of their own', () => {
    expect(RUNNER_TEXT).not.toMatch(/test:strong-hash|FOOTBAG_CHEAP_PASSWORD_HASH=0/);
    const unit = readFileSync(join(REPO_ROOT, 'tests', 'unit', 'passwordHash.test.ts'), 'utf8');
    expect(unit, 'the unit suite no longer runs the production hash profile').toContain("FOOTBAG_CHEAP_PASSWORD_HASH = '0'");
  });

  // Defect caught: the bare run quietly drops the secret scan when given the
  // --quick-only switch, and still reports on what ran as the whole gate.
  it('refuses a switch that would narrow it', () => {
    const noScan = spawnSync('bash', [RUNNER, '--skip-secret-scan'], { cwd: REPO_ROOT, encoding: 'utf8', ...SPAWN_GUARD });
    expect(noScan.status).toBe(1);
    expect(noScan.stderr).toContain('--skip-secret-scan is a --quick switch: the bare run is the whole gate');
  });

  // Defect caught: a machine without the tools runs forty minutes of gates
  // before the first one that needs them fails, or skips them and reports; or
  // the local run demands an AWS identity, which only the staging legs need; or
  // the staging legs accept only one of the two identities that may run them.
  it('checks what it needs before the first gate, needs no AWS identity, and refuses rather than skipping', () => {
    const preflightCall = RUNNER_TEXT.indexOf('full_preflight > ');
    const firstGate = RUNNER_TEXT.indexOf('\nrun_sequence\n');
    expect(preflightCall).toBeGreaterThan(-1);
    expect(firstGate).toBeGreaterThan(-1);
    expect(preflightCall).toBeLessThan(firstGate);
    const preflight = RUNNER_TEXT.slice(RUNNER_TEXT.indexOf('full_preflight() {'), RUNNER_TEXT.indexOf('\n}\n', RUNNER_TEXT.indexOf('full_preflight() {')));
    expect(preflight).not.toContain('FootbagDevTester');
    expect(preflight).not.toContain('aws_profile_ensure');
    expect(preflight).not.toContain('return 77');
    const stagingPreflight = RUNNER_TEXT.slice(RUNNER_TEXT.indexOf('staging_preflight() {'));
    expect(stagingPreflight).toContain(':assumed-role/FootbagDevTester/');
    expect(stagingPreflight).toContain(':user/footbag-operator');
  });

  it('names each opt-in gate in every run that did not schedule it, with its switch', () => {
    for (const optIn of ['"persona-crawl:--with-persona-crawl"', '"realdata-invariants:--with-realdata-invariants"']) {
      expect(RUNNER_TEXT).toContain(optIn);
    }
  });
});

/**
 * The end of a run, driven: stub gates fill the table, and the two guards that
 * read the real tree are replaced by ones that pass unless a case trips them, so
 * the verdict is what is judged.
 */
function finish(
  rows: string,
  opts: { full?: boolean; staging?: boolean; source?: string; dirty?: boolean; realDataChanged?: boolean; treeChanged?: boolean } = {},
) {
  const setup = [
    `FULL=${opts.full === false ? 0 : 1}; STAGING=${opts.staging ? 1 : 0}; REALDATA_SOURCE=${JSON.stringify(opts.source ?? 'local')}`,
    `SOURCE_TREE_BEFORE=tree-fingerprint; SOURCE_TREE_LIST_BEFORE=${opts.dirty ? '" M src/app.ts"' : '""'}`,
    opts.realDataChanged
      ? 'assert_real_data_untouched() { echo "FATAL: \'legacy_data/\' (real-data tree) changed during this run." >&2; return 1; }'
      : 'assert_real_data_untouched() { :; }',
    opts.treeChanged
      ? 'assert_source_tree_unchanged() { echo " VERDICT VOID: the tree changed while this run was in flight" >&2; return 1; }'
      : 'assert_source_tree_unchanged() { :; }',
    'pass() { echo ok; }; fail() { echo "broke"; return 1; }; skip() { echo "not required: no local load"; return 77; }',
  ].join('\n');
  return drive(`${setup}\n${rows}\nprint_not_checked >/dev/null\nfinal_verdict\necho "SHOULD NOT REACH"`);
}

const LOCAL_GREEN = [
  'run_gate build pass', 'run_gate lint pass', 'run_gate audit pass', 'run_gate conventions pass', 'run_gate harness pass',
  'run_gate generated-content pass', 'run_gate secret-scan pass', 'run_gate unit pass', 'run_gate integration pass',
  'run_gate e2e pass', 'run_gate terraform pass', 'run_gate security-probes pass', 'run_gate clean-room pass',
].join('\n');
const STAGING_GREEN = ['staging-aws-smoke', 'staging-realdata-invariants', 'staging-route-smoke', 'staging-browser']
  .map((g) => `run_gate ${g} pass`).join('\n');

describe('the verdict, printed last on every way a run ends', () => {
  // Defect caught: a full run that passed ends without a verdict, or with one
  // naming an exit code other than the one it returns.
  it('ends a passing bare run GREEN, with the banner last and its real exit code', () => {
    const r = finish(LOCAL_GREEN, { source: 'none' });
    expect(r.status, r.out).toBe(0);
    const banner = expectBanner(r, 'GREEN');
    expect(banner).toContain('Mode: full');
    expect(banner).toMatch(/Gates: 13 passed, 0 failed, 0 skipped, 0 not run/);
    expect(r.out).not.toContain('SHOULD NOT REACH');
  });

  // Defect caught: a pass on a tree with uncommitted changes reads as a pass for
  // the commit, which is all continuous integration and production ever see.
  it('says when the tree under test carried uncommitted changes', () => {
    expect(expectBanner(finish(LOCAL_GREEN, { source: 'none', dirty: true }), 'GREEN'))
      .toMatch(/Tree: \S+ plus 1 uncommitted path\(s\); CI tests the commit only/);
    expect(expectBanner(finish(LOCAL_GREEN, { source: 'none' }), 'GREEN')).toContain('nothing uncommitted');
  });

  // Defect caught: a staging failure is reported as a green run, or it hides
  // what the local rows proved.
  it('fails a run whose staging rows failed, still saying the local rows passed', () => {
    const rows = `${STAGING_GREEN.replace('run_gate staging-browser pass', 'run_gate staging-browser fail')}\n${LOCAL_GREEN}`;
    const r = finish(rows, { staging: true });
    expect(r.status, r.out).toBe(1);
    const banner = expectBanner(r, 'FAILED');
    expect(banner).toContain('Local rows: GREEN.  Staging rows: FAILED.');
    expect(banner).toContain('Failed: staging-browser');
  });

  // Defect caught: a staging row's skip holds the run back, although what
  // staging does never bears on the local tree.
  it('ends green when only a staging row skipped, whichever row it was', () => {
    for (const row of ['staging-aws-smoke', 'staging-realdata-invariants', 'staging-route-smoke', 'staging-browser']) {
      const r = finish(
        `${STAGING_GREEN.replace(`run_gate ${row} pass`, `run_gate ${row} skip`)}\n${LOCAL_GREEN}`,
        { staging: true },
      );
      expect(r.status, `${row}: ${r.out}`).toBe(0);
      expectBanner(r, 'GREEN');
    }
  });

  // Defect caught: a machine without the operator dataset can never end green,
  // although the real-data rows are not required there.
  it('does not let a not-required real-data row hold the verdict back', () => {
    const r = finish(
      `${LOCAL_GREEN}\nrun_gate persona-crawl skip\nrun_gate realdata-invariants skip`,
      { source: 'none' },
    );
    expect(r.status, r.out).toBe(0);
    expectBanner(r, 'GREEN');
  });

  // Defect caught: a machine without an optional tool (no gitleaks and no running
  // Docker, no terraform) ends INCOMPLETE although every check that ran passed;
  // continuous integration runs those checks on every push and a production
  // deploy requires it green for the commit, so the skip loses nothing and must
  // be named, not treated as a failure.
  it('ends green when only a check continuous integration runs skipped, and names it', () => {
    const rows = LOCAL_GREEN
      .replace('run_gate secret-scan pass', 'run_gate secret-scan skip')
      .replace('run_gate terraform pass', 'run_gate terraform skip');
    const r = finish(rows, { source: 'none' });
    expect(r.status, r.out).toBe(0);
    expectBanner(r, 'GREEN');
    const warning = r.out.slice(r.out.indexOf('WARNING: this machine lacks a tool the project uses'));
    expect(warning, r.out).toMatch(/^WARNING/);
    expect(warning).toContain('secret-scan');
    expect(warning).toContain('terraform');
  });

  // Defect caught: a check that did not happen, and that continuous integration
  // does not run either, is treated as one that passed.
  it('ends INCOMPLETE, naming the gate, when a gate skipped that continuous integration does not run', () => {
    const other = finish(`${LOCAL_GREEN}\nrun_gate pentest skip`, { source: 'none' });
    expect(other.status, other.out).toBe(3);
    expect(expectBanner(other, 'INCOMPLETE')).toContain('continuous integration does not run them: pentest');
  });

  // Defect caught: the clean room could not build its Python environment, so the
  // data-load Python gates ran nowhere (continuous integration does not run
  // them), and the run still ends GREEN.
  it('ends INCOMPLETE when the clean room could not run the data-load Python gates', () => {
    const room = [
      'CLEAN_ROOM_RESULTS="${GATE_LOG_DIR}/clean-room-results.tsv"',
      `printf '%b\\n' ${JSON.stringify('build\tPASS\t\ncoverage\tPASS\t\nlegacy-pytest\tNOTRUN\tcould not build the pinned Python environment')} > "$CLEAN_ROOM_RESULTS"`,
      'room_77() { echo "  legacy-pytest      NOT RUN (could not build the pinned Python environment)"; return 77; }',
    ].join('\n');
    const rows = `${room}\n${LOCAL_GREEN.replace('run_gate clean-room pass', 'run_gate clean-room room_77')}`;
    const r = finish(rows, { source: 'none' });
    expect(r.status, r.out).toBe(3);
    expect(expectBanner(r, 'INCOMPLETE')).toContain('legacy-pytest');
  });

  // Defect caught: a machine whose load lacks what a real-data row needs (a
  // mirror-only load, say) ends INCOMPLETE, although those rows never hold a run back.
  it('never lets a real-data row hold the run back, even on a machine holding a load', () => {
    const r = finish(`${LOCAL_GREEN}\nrun_gate persona-crawl skip\nrun_gate realdata-invariants skip`, { source: 'local' });
    expect(r.status, r.out).toBe(0);
    expectBanner(r, 'GREEN');
  });

  // Defect caught: a run that was asked to leave the Python gates out ends
  // GREEN, although the loader gate and the legacy-data suites never ran.
  it('ends INCOMPLETE when --skip-py left the Python gates out', () => {
    const rows = `SKIP_PY=1\n${LOCAL_GREEN.replace('run_gate clean-room pass', 'run_gate clean-room skip')}`;
    const r = finish(rows, { source: 'none' });
    expect(r.status, r.out).toBe(3);
    expect(expectBanner(r, 'INCOMPLETE')).toContain('--skip-py');
  });

  // Defect caught: a run whose real-data tree changed ends with the alarm buried
  // above the report, or loses the gate counts the reader needs to judge it.
  it('ends FATAL when a real-data tree changed, still carrying the gate counts', () => {
    const r = finish(LOCAL_GREEN, { source: 'none', realDataChanged: true });
    expect(r.status, r.out).toBe(2);
    const banner = expectBanner(r, 'FATAL');
    expect(banner).toMatch(/Gates: 13 passed/);
    expect(r.out).not.toContain('SHOULD NOT REACH');
  });

  // Defect caught: a run whose tree changed mid-flight reports a verdict about no
  // single commit as though it were one.
  it('ends VOID when the tree changed during the run, ahead of any local result', () => {
    const r = finish(LOCAL_GREEN.replace('run_gate e2e pass', 'run_gate e2e fail'), { source: 'none', treeChanged: true });
    expect(r.status, r.out).toBe(4);
    expectBanner(r, 'VOID');
  });

  // Defect caught: a missing tool refuses the run with an error line and no
  // verdict, so a reader skimming the end sees nothing at all.
  it('ends REFUSED when a required command is missing, before any gate', () => {
    const r = drive('need_cmd footbag-no-such-command "install it"\necho "SHOULD NOT REACH"');
    expect(r.status, r.out).toBe(1);
    expect(expectBanner(r, 'REFUSED')).toContain('required command not found: footbag-no-such-command');
    expect(r.out).not.toContain('SHOULD NOT REACH');
  });

  // Defect caught: a full run that left the ZAP scan out reads as though it ran
  // it, and the reader pushes to production without it.
  it('names the ZAP scan and its switch among what a run without --zap did not check', () => {
    const rows = `FULL=1; STAGING=0; ${LOCAL_GREEN.replace(/run_gate (\S+) pass/g, 'run_gate $1 true')}`;
    const without = drive(`ZAP=0; ${rows}\nprint_not_checked`);
    expect(without.out).toContain('the ZAP scan (not run; --zap runs it, before a production deploy)');
    const withZap = drive(`ZAP=1; ${rows}\nprint_not_checked`);
    expect(withZap.out).not.toContain('the ZAP scan (not run');
  });

  // Defect caught: a run without the dependency audit reads as though it ran it.
  it('names the dependency audit and its switch among what a run without --audit did not check', () => {
    const rows = `FULL=1; STAGING=0; ${LOCAL_GREEN.replace('run_gate audit pass', '').replace(/run_gate (\S+) pass/g, 'run_gate $1 true')}`;
    const without = drive(`AUDIT=0; ${rows}\nprint_not_checked`);
    expect(without.out).toContain('the dependency audit (not run; --audit runs it, before a production deploy)');
    const withAudit = drive(`AUDIT=1; ${rows}\nrun_gate audit true\nprint_not_checked`);
    expect(withAudit.out).not.toContain('the dependency audit (not run');
  });

  // Defect caught: the banner of a run whose clean room failed names only the
  // room, so the reader cannot tell which of its gates broke.
  it('names the gates that failed inside a failed clean room', () => {
    const r = finish(`${FAILED_ROOM}\nrun_gate clean-room failed_room`, { source: 'none' });
    expect(r.status).toBe(1);
    const banner = expectBanner(r, 'FAILED');
    expect(banner).toContain('Failed: clean-room (coverage)');
    expect(banner).toMatch(/inside the clean room: 1 passed, 3 failed, 1 not run/);
  });

  // Defect caught: a failed gate's error lines sit a screen or more above the
  // verdict, under the notices and the list of what the run did not check.
  it('prints the failure details after the notices and the not-checked list, just above the verdict', () => {
    // The runner's own top-level ending, run as written.
    const ending = RUNNER_TEXT.slice(RUNNER_TEXT.lastIndexOf('\nsummarize\n'));
    const r = drive(
      `${BURYING_GATE}\nFULL=1; REALDATA_SOURCE=none; SOURCE_TREE_LIST_BEFORE=""\nassert_real_data_untouched() { :; }; assert_source_tree_unchanged() { :; }\n${WARNING_GATE}\nrun_gate audit warning_gate\nrun_gate coverage burying_gate\n${ending}`,
    );
    const out = r.stdout;
    const details = out.lastIndexOf('failure details');
    expect(details, out).toBeGreaterThan(out.lastIndexOf('WHAT THIS RUN DID NOT CHECK'));
    expect(details).toBeGreaterThan(out.lastIndexOf(' notices ('));
    expect(out.indexOf('FAIL tests/integration/seederEnv', details)).toBeGreaterThan(details);
    expectBanner(r, 'FAILED');
  });

  it('ends FAILED, naming the gate, when a local gate failed', () => {
    const r = finish(`${LOCAL_GREEN.replace('run_gate e2e pass', 'run_gate e2e fail')}`);
    expect(r.status).toBe(1);
    const banner = expectBanner(r, 'FAILED');
    expect(banner).toContain('Failed: e2e');
    expect(banner).toContain('Local rows: FAILED');
  });

  // Defect caught: the fast loop exits non-zero for the gates it never meant to
  // run, so the pre-commit script it now stands behind fails every time.
  it('ends a --quick run that passed with success, naming what only the bare run runs', () => {
    const quick = ['build', 'lint', 'conventions', 'harness', 'generated-content', 'secret-scan', 'unit', 'integration']
      .map((g) => `run_gate ${g} pass`).join('\n');
    const r = finish(quick, { full: false });
    expect(r.status, r.out).toBe(0);
    expect(expectBanner(r, 'QUICK PASS')).toContain('which the bare run runs');
  });

  // Defect caught: a new way out of the run is added that skips the banner, and
  // a reader skimming the end of an hour of output finds no verdict.
  it('leaves the verdict, interrupt and fail-fast paths no exit but through the banner', () => {
    const body = (name: string) => {
      const start = RUNNER_TEXT.indexOf(`\n${name}() {`);
      return RUNNER_TEXT.slice(start, RUNNER_TEXT.indexOf('\n}\n', start));
    };
    for (const name of ['final_verdict', 'on_interrupt', 'run_gate', 'need_cmd']) {
      expect(body(name), `${name} has an exit that skips the verdict banner`).not.toMatch(/^\s*exit\b/m);
      expect(body(name), name).toContain('end_run ');
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
    // The handler called directly, with the gate named: no real signal, no sleep.
    const r = drive('FULL=1\nCURRENT_GATE=audit\non_interrupt');
    expect(r.status).toBe(130);
    expect(r.out).toContain('WHAT THIS RUN DID NOT CHECK');
  });

  // Defect caught: the report warns that the accessibility scan did not run on
  // a run whose e2e gate ran every @a11y spec.
  it('does not list the a11y scan as not run when the e2e gate ran', () => {
    const r = drive('ok() { return 0; }\nrun_gate e2e ok\nprint_not_checked');
    expect(r.out.slice(r.out.indexOf('WHAT THIS RUN DID NOT CHECK'))).not.toContain('a11y (not run');
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

  // Defect caught: an upstream advisory, or an unreachable registry, turns a run red
  // (or drops the bare run's receipt through a SKIP row) on a commit that changed nothing.
  it('passes the audit gate on an advisory or an unreachable registry, and surfaces a warning', () => {
    const auditFn = spawnSync('sed', ['-n', '/^gate_audit() {/,/^}/p', RUNNER], { encoding: 'utf8', ...SPAWN_GUARD }).stdout;
    const cases = [
      { out: 'found 1 moderate severity vulnerability', warn: 'reports advisories' },
      { out: 'request to https://registry.npmjs.org/-/npm/v1/security/audits/quick failed, reason: ETIMEDOUT', warn: 'endpoint was unreachable' },
    ];
    for (const c of cases) {
      const r = drive(`${auditFn}\nnpm() { echo ${JSON.stringify(c.out)}; return 1; }\nrun_gate audit gate_audit\nsummarize\nprint_notices`);
      expect(r.out, c.out).toContain('→ [audit] PASS');
      expect(r.out.slice(r.out.indexOf('──── audit ────')), c.out).toContain(c.warn);
    }
  });
});

describe('the switches that decide what runs, read from the script', () => {
  const fullBlock = RUNNER_TEXT.slice(FULL_BLOCK_AT);
  const fullImplies = fullBlock.slice(0, fullBlock.indexOf('\nfi\n'));

  it('never lets the bare run imply the legacy-mirror suite, and lists it with its switch when it did not run', () => {
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
    expect(RUNNER_TEXT).toContain('(not reached: the run stopped before the clean room, which runs it in the bare run)');
  });

  it('hands the clean room a results file, and leaves the tiers it runs to it', () => {
    expect(RUNNER_TEXT).toContain('run_gate clean-room bash scripts/ci/run_clean_room.sh --results "$CLEAN_ROOM_RESULTS"');
    for (const g of ['build', 'lint', 'conventions', 'generated-content', 'unit', 'integration']) {
      expect(RUNNER_TEXT, g).toMatch(new RegExp(`^\\s*checkout_gate ${g} `, 'm'));
    }
  });
});

describe('the verdict voided by a tree that changed mid-run', () => {
  /**
   * The runner's own start-of-run snapshot lines and its check, driven in a
   * throwaway repository whose file was already modified when the run started.
   */
  function voidAfterSecondEdit(): { status: number | null; out: string } {
    const repo = mkdtempSync(join(tmpdir(), 'footbag-test-runner-void-'));
    const driverDir = mkdtempSync(join(tmpdir(), 'footbag-test-runner-void-driver-'));
    dirs.push(repo, driverDir);
    const git = (...args: string[]) =>
      spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', ...SPAWN_GUARD });
    git('init', '-q');
    git('config', 'user.email', 'runner@example.invalid');
    git('config', 'user.name', 'runner');
    writeFileSync(join(repo, 'edited.md'), 'committed\n');
    writeFileSync(join(repo, 'untouched.md'), 'committed\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    writeFileSync(join(repo, 'edited.md'), 'modified before the run\n');
    const snapshot = RUNNER_TEXT.split('\n').filter((l) => /^SOURCE_TREE_[A-Z_]*BEFORE=/.test(l));
    const fn = (name: string) =>
      spawnSync('sed', ['-n', `/^${name}() {/,/^}/p`, RUNNER], { encoding: 'utf8', ...SPAWN_GUARD }).stdout;
    const driver = join(driverDir, 'driver.sh');
    writeFileSync(driver, [
      `cd ${JSON.stringify(repo)}`,
      `source ${JSON.stringify(join(REPO_ROOT, 'scripts', 'lib', 'source-tree-state.sh'))}`,
      fn('changed_file_hashes'),
      fn('assert_source_tree_unchanged'),
      ...snapshot,
      'echo "modified again during the run" > edited.md',
      'assert_source_tree_unchanged',
    ].join('\n'));
    const res = spawnSync('bash', [driver], { encoding: 'utf8', ...SPAWN_GUARD });
    return { status: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
  }

  // Defect caught: a file already modified when the run started and edited again
  // during it voids the run, but the report's list of what differs is empty,
  // because the file's status line reads the same before and after, so the
  // reader cannot tell which edit to hold still.
  it('names a file that was already modified and changed again, and no file that did not change', () => {
    const r = voidAfterSecondEdit();
    expect(r.status).toBe(1);
    expect(r.out).toContain('VERDICT VOID');
    const listed = r.out.slice(r.out.indexOf('What differs'));
    expect(listed, r.out).toContain('edited.md');
    expect(listed).not.toContain('untouched.md');
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
    // Every exit that ends a normal run lives in final_verdict, so the report
    // has to be printed in full before it is called.
    expect(at('\nsummarize\nprint_notices\nprint_not_checked\ndump_failures\nfinal_verdict\n')).toBeGreaterThan(-1);
    const verdict = RUNNER_TEXT.slice(at('final_verdict() {'));
    const body = verdict.slice(0, verdict.indexOf('\n}\n'));
    const guard = body.indexOf('assert_real_data_untouched');
    const oneTree = body.indexOf('assert_source_tree_unchanged');
    expect(guard).toBeGreaterThan(-1);
    expect(oneTree).toBeGreaterThan(guard);
    expect(body.indexOf('one or more local gates failed')).toBeGreaterThan(oneTree);
  });

  it('prints the notices on the fail-fast exit too, before its verdict', () => {
    const failFast = RUNNER_TEXT.indexOf('print_notices\n      print_not_checked\n      dump_failures\n      LOCAL_VERDICT="stopped"\n      if ! assert_real_data_untouched; then');
    expect(failFast).toBeGreaterThan(-1);
  });
});
