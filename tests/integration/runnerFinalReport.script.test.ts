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
    ...['summarize', 'recap_gate_log', 'dump_failures', 'notices_from', 'print_notices', 'skip_reason',
      'on_interrupt', 'run_gate'].map(fn),
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
      'GATE_NAMES=(); GATE_RESULTS=(); FAIL_LOGS=(); ANY_FAIL=0; FAIL_FAST=0; CURRENT_GATE=""',
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

describe('the ending of the run, read from the script', () => {
  // Top-level code, so it cannot be extracted and driven; what regressed was its
  // order, and the order is what is asserted.
  const at = (text: string) => {
    const i = RUNNER_TEXT.lastIndexOf(text);
    expect(i, `run_all_tests.sh must contain ${JSON.stringify(text)}`).toBeGreaterThan(-1);
    return i;
  };

  it('prints the whole report before any verdict can end the run', () => {
    const notChecked = at('echo " WHAT THIS RUN DID NOT CHECK"');
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
    const failFast = RUNNER_TEXT.indexOf('print_notices\n      assert_real_data_untouched\n      exit 1');
    expect(failFast).toBeGreaterThan(-1);
  });
});
