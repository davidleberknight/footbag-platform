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
    line('REALDATA_ROWS='),
    ...['summarize', 'recap_gate_log', 'dump_failures', 'notices_from', 'print_notices', 'skip_reason',
      'on_interrupt', 'run_gate', 'note_gate', 'room_carries', 'checkout_gate', 'import_clean_room_results',
      'print_not_checked', 'receipt_voiding_skips', 'write_full_pass_receipt', 'write_staging_pass_receipt',
      'final_verdict'].map(fn),
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
  });

  // Defect caught: the handler exists but is never installed, so an interrupted
  // run ends with no report at all.
  it('installs the interrupt handler for both INT and TERM', () => {
    expect(RUNNER_TEXT).toMatch(/^trap on_interrupt INT TERM$/m);
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
    expect(summaryOf(r.out)).toMatch(/^\s+build\s+PASS \[\d+s\]$/m);
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

/** The block that says what --full implies, which the conventions gate also reads. */
const FULL_BLOCK_AT = RUNNER_TEXT.indexOf('if (( FULL == 1 )); then\n  PENTEST=1');

describe('what --full turns on, read from the script', () => {
  const fullBlock = RUNNER_TEXT.slice(FULL_BLOCK_AT);
  it('has a block saying what --full implies', () => expect(FULL_BLOCK_AT).toBeGreaterThan(-1));
  const fullImplies = fullBlock.slice(0, fullBlock.indexOf('\nfi\n'));

  // Defect caught: the thorough local run leaves out the local real-data checks
  // or the production-strength hash, turns on a staging leg, or starts pulling
  // in the retired legacy-mirror suite.
  it('turns on the local real-data checks and the strong hash, never a staging leg or the retired suite', () => {
    for (const implied of ['WITH_PERSONA_CRAWL=1', 'WITH_REALDATA_INVARIANTS=1', 'WITH_STRONG_HASH=1']) {
      expect(fullImplies, implied).toContain(implied);
    }
    for (const never of ['WITH_LEGACY_MIRROR', 'WITH_SMOKE', 'STAGING']) {
      expect(fullImplies, never).not.toContain(never);
    }
    expect(RUNNER_TEXT).not.toContain('gate_member_data_audits');
  });

  // Defect caught: --full quietly drops half of itself when combined with a
  // narrowing flag, and still reports on the half that ran.
  it('refuses to be combined with a flag that narrows it', () => {
    const quick = spawnSync('bash', [RUNNER, '--full', '--quick'], { cwd: REPO_ROOT, encoding: 'utf8', ...SPAWN_GUARD });
    expect(quick.status).toBe(1);
    expect(quick.stderr).toContain('--full cannot be combined with --quick or --skip-secret-scan');
    const noScan = spawnSync('bash', [RUNNER, '--full', '--skip-secret-scan'], { cwd: REPO_ROOT, encoding: 'utf8', ...SPAWN_GUARD });
    expect(noScan.status).toBe(1);
    expect(noScan.stderr).toContain('--full cannot be combined with --quick or --skip-secret-scan');
  });

  // Defect caught: a machine without the tools runs forty minutes of gates
  // before the first one that needs them fails, or skips them and reports; or
  // the local run demands the dev-tester role, which only the staging legs need.
  it('checks what it needs before the first gate, needs no dev-tester role, and refuses rather than skipping', () => {
    const preflightCall = RUNNER_TEXT.indexOf('full_preflight 2>&1');
    const firstGate = RUNNER_TEXT.indexOf('\nrun_sequence\n');
    expect(preflightCall).toBeGreaterThan(-1);
    expect(firstGate).toBeGreaterThan(-1);
    expect(preflightCall).toBeLessThan(firstGate);
    const preflight = RUNNER_TEXT.slice(RUNNER_TEXT.indexOf('full_preflight() {'), RUNNER_TEXT.indexOf('\n}\n', RUNNER_TEXT.indexOf('full_preflight() {')));
    expect(preflight).not.toContain('FootbagDevTester');
    expect(preflight).not.toContain('return 77');
    const stagingPreflight = RUNNER_TEXT.slice(RUNNER_TEXT.indexOf('staging_preflight() {'));
    expect(stagingPreflight).toContain(':assumed-role/FootbagDevTester/');
  });

  it('removes each receipt when a run that could write it starts, so an older pass cannot outlive a later failure', () => {
    expect(RUNNER_TEXT).toContain('if (( FULL == 1 )); then rm -f "$(full_pass_receipt_path)"; fi');
    expect(RUNNER_TEXT).toContain('if (( STAGING == 1 )); then rm -f "$(staging_pass_receipt_path)"; fi');
  });

  it('names each opt-in gate in every run that did not schedule it, with its switch', () => {
    for (const optIn of ['"persona-crawl:--with-persona-crawl"', '"realdata-invariants:--with-realdata-invariants"', '"strong-hash:--full"']) {
      expect(RUNNER_TEXT).toContain(optIn);
    }
  });
});

/**
 * The end of a run, driven: stub gates fill the table, both receipts are pointed
 * into the case's own directory, and the two guards that read the real tree are
 * replaced by ones that pass, so the verdict and the receipts are what is judged.
 */
function finish(
  rows: string,
  opts: { full?: boolean; staging?: boolean; source?: string; commit?: string; dirty?: boolean; noSha?: boolean } = {},
) {
  const setup = [
    `FULL=${opts.full === false ? 0 : 1}; STAGING=${opts.staging ? 1 : 0}; REALDATA_SOURCE=${JSON.stringify(opts.source ?? 'local')}`,
    `STAGING_DEPLOYED_COMMIT=${JSON.stringify(opts.commit ?? '')}; STAGING_DEPLOYED_DIRTY=0`,
    `SOURCE_TREE_BEFORE=tree-fingerprint; SOURCE_TREE_LIST_BEFORE=${opts.dirty ? '" M src/app.ts"' : '""'}`,
    // A machine without sha256sum: the function shadows the binary for this run.
    ...(opts.noSha ? ['sha256sum() { return 127; }'] : []),
    'full_pass_receipt_path() { printf "%s/full-receipt" "$(dirname "$GATE_LOG_DIR")"; }',
    'staging_pass_receipt_path() { printf "%s/staging-receipt" "$(dirname "$GATE_LOG_DIR")"; }',
    'assert_real_data_untouched() { :; }',
    'assert_source_tree_unchanged() { :; }',
    'pass() { echo ok; }; fail() { echo "broke"; return 1; }; skip() { echo "not required: no local load"; return 77; }',
  ].join('\n');
  const r = drive(`${setup}\n${rows}\nprint_not_checked >/dev/null\nfinal_verdict`);
  const base = dirname(r.logDir);
  const read = (name: string) => (existsSync(join(base, name)) ? readFileSync(join(base, name), 'utf8') : null);
  return { ...r, fullReceipt: read('full-receipt'), stagingReceipt: read('staging-receipt'), base };
}

const LOCAL_GREEN = [
  'run_gate build pass', 'run_gate lint pass', 'run_gate audit pass', 'run_gate conventions pass', 'run_gate harness pass',
  'run_gate generated-content pass', 'run_gate secret-scan pass', 'run_gate unit pass', 'run_gate integration pass',
  'run_gate e2e pass', 'run_gate terraform pass', 'run_gate security-probes pass', 'run_gate clean-room pass',
].join('\n');
const STAGING_GREEN = ['staging-aws-smoke', 'staging-realdata-invariants', 'staging-route-smoke', 'staging-browser']
  .map((g) => `run_gate ${g} pass`).join('\n');

describe('the verdict and the two pass receipts', () => {
  // Defect caught: a flaky or unreachable staging leg voids the proof that the
  // local tree passed, or a staging failure is reported as a green run.
  it('keeps the local receipt when only a staging row failed, and still exits non-zero', () => {
    const rows = `${STAGING_GREEN.replace('run_gate staging-browser pass', 'run_gate staging-browser fail')}\nwrite_staging_pass_receipt\n${LOCAL_GREEN}`;
    const r = finish(rows, { staging: true, commit: 'abc1234' });
    expect(r.status, r.out).toBe(1);
    expect(r.fullReceipt, r.out).toContain('verdict=GREEN');
    expect(r.stagingReceipt, 'a failed staging leg left a staging receipt').toBeNull();
    expect(r.out).toContain('staging');
  });

  // Defect caught: a green staging run leaves no record, or one the release
  // gate cannot tie to the commit staging runs, or one other accounts can write.
  it('writes an owner-only staging receipt keyed to the commit staging reports when every staging row passed', () => {
    const r = finish(`${STAGING_GREEN}\nwrite_staging_pass_receipt\n${LOCAL_GREEN}`, { staging: true, commit: 'abc1234' });
    expect(r.status, r.out).toBe(0);
    expect(r.stagingReceipt).toMatch(/^verdict=GREEN$/m);
    expect(r.stagingReceipt).toMatch(/^commit=abc1234$/m);
    expect(r.stagingReceipt).toMatch(/^runner=[0-9a-f]{64}$/m);
    const mode = spawnSync('stat', ['-c', '%a', join(r.base, 'staging-receipt')], { encoding: 'utf8', ...SPAWN_GUARD }).stdout.trim();
    expect(mode).toBe('600');
  });

  // Defect caught: a staging row that skipped, or never ran, is treated as a
  // pass, and a staging receipt vouches for checks that did not happen.
  it('writes no staging receipt when a staging row skipped or never ran', () => {
    const skipped = finish(
      `${STAGING_GREEN.replace('run_gate staging-route-smoke pass', 'run_gate staging-route-smoke skip')}\nwrite_staging_pass_receipt\n${LOCAL_GREEN}`,
      { staging: true, commit: 'abc1234' },
    );
    expect(skipped.stagingReceipt, skipped.out).toBeNull();
    const absent = finish(
      `${STAGING_GREEN.replace('run_gate staging-browser pass', '')}\nwrite_staging_pass_receipt\n${LOCAL_GREEN}`,
      { staging: true, commit: 'abc1234' },
    );
    expect(absent.stagingReceipt, absent.out).toBeNull();
    expect(absent.out).toContain('staging-browser did not pass (not run)');
  });

  // Defect caught: a staging row's skip withholds the local receipt, although the
  // staging receipt is what answers for staging.
  it('keeps the local receipt when only a staging row skipped', () => {
    const r = finish(
      `${STAGING_GREEN.replace('run_gate staging-browser pass', 'run_gate staging-browser skip')}\nwrite_staging_pass_receipt\n${LOCAL_GREEN}`,
      { staging: true, commit: 'abc1234' },
    );
    expect(r.fullReceipt, r.out).toContain('verdict=GREEN');
  });

  // Defect caught: the local receipt is written readable or writable by other
  // accounts, so another local user could plant one the release gate trusts.
  it('writes the local receipt owner-only, recording whether the tree was clean', () => {
    const clean = finish(LOCAL_GREEN, { source: 'none' });
    const mode = spawnSync('stat', ['-c', '%a', join(clean.base, 'full-receipt')], { encoding: 'utf8', ...SPAWN_GUARD }).stdout.trim();
    expect(mode).toBe('600');
    expect(clean.fullReceipt).toMatch(/^clean=yes$/m);
    // Defect caught: a pass on a dirty tree is recorded as clean, and the release
    // gate then accepts it for the committed tree.
    const dirty = finish(LOCAL_GREEN, { source: 'none', dirty: true });
    expect(dirty.fullReceipt, dirty.out).toMatch(/^clean=no$/m);
  });

  // Defect caught: with no way to identify the runner, a receipt is written with
  // an empty runner field, which the release gate cannot tie to a version.
  it('writes neither receipt when sha256sum is unavailable', () => {
    const r = finish(`${STAGING_GREEN}\nwrite_staging_pass_receipt\n${LOCAL_GREEN}`, { staging: true, commit: 'abc1234', noSha: true });
    expect(r.fullReceipt, r.out).toBeNull();
    expect(r.stagingReceipt).toBeNull();
    expect(r.out).toContain('No pass receipt: sha256sum is unavailable');
    expect(r.out).toContain('No staging pass receipt: sha256sum is unavailable');
  });

  // Defect caught: a staging receipt is written with no commit to key it to,
  // which the release gate would then match against nothing.
  it('writes no staging receipt when what staging runs could not be read', () => {
    const r = finish(`${STAGING_GREEN}\nwrite_staging_pass_receipt\n${LOCAL_GREEN}`, { staging: true, commit: '' });
    expect(r.stagingReceipt).toBeNull();
    expect(r.out).toContain('No staging pass receipt');
  });

  // Defect caught: a machine without the operator dataset can never produce the
  // local receipt, although those rows are not required there.
  it('does not let a not-required real-data row void the local receipt', () => {
    const r = finish(`${LOCAL_GREEN}\nrun_gate persona-crawl skip\nrun_gate realdata-invariants skip`, { source: 'none' });
    expect(r.status, r.out).toBe(0);
    expect(r.fullReceipt, r.out).toContain('verdict=GREEN');
  });

  // Defect caught: a machine without an optional tool (no gitleaks and no running
  // Docker, no terraform) ends INCOMPLETE and writes no receipt although every
  // check that ran passed; continuous integration runs those checks on every push
  // and the release gate requires it green for the commit, so the skip loses
  // nothing and must be named, not treated as a failure.
  it('ends green and keeps the receipt when only a check continuous integration runs skipped, and names it', () => {
    const rows = LOCAL_GREEN
      .replace('run_gate secret-scan pass', 'run_gate secret-scan skip')
      .replace('run_gate terraform pass', 'run_gate terraform skip');
    const r = finish(rows, { source: 'none' });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('GREEN');
    expect(r.fullReceipt, r.out).toContain('verdict=GREEN');
    const warning = r.out.slice(r.out.indexOf('WARNING: this machine lacks a tool the project uses'));
    expect(warning, r.out).toMatch(/^WARNING/);
    expect(warning).toContain('secret-scan');
    expect(warning).toContain('terraform');
  });

  // Defect caught: a check that did not happen is treated as one that passed,
  // and the receipt vouches for it.
  it('writes no local receipt when any other gate skipped, or when a real-data row skipped on a machine holding the load', () => {
    const other = finish(`${LOCAL_GREEN}\nrun_gate pentest skip`, { source: 'none' });
    expect(other.fullReceipt).toBeNull();
    expect(other.out).toContain('No pass receipt');
    const withLoad = finish(`${LOCAL_GREEN}\nrun_gate persona-crawl skip`, { source: 'local' });
    expect(withLoad.fullReceipt).toBeNull();
  });

  // Defect caught: a run that was asked to leave the Python gates out ends
  // GREEN and writes the receipt a production release accepts, although the
  // loader gate and the legacy-data suites never ran.
  it('ends INCOMPLETE with no local receipt when --skip-py left the Python gates out', () => {
    const rows = `SKIP_PY=1\n${LOCAL_GREEN.replace('run_gate clean-room pass', 'run_gate clean-room skip')}`;
    const r = finish(rows, { source: 'none' });
    expect(r.status, r.out).toBe(3);
    expect(r.out).toContain('INCOMPLETE');
    expect(r.out).toContain('--skip-py');
    expect(r.out).not.toContain('GREEN.');
    expect(r.fullReceipt, r.out).toBeNull();
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

  it('writes no local receipt, and exits non-zero, when a local gate failed', () => {
    const r = finish(`${LOCAL_GREEN.replace('run_gate e2e pass', 'run_gate e2e fail')}`);
    expect(r.status).toBe(1);
    expect(r.fullReceipt).toBeNull();
  });

  // Defect caught: the fast loop exits non-zero for the gates it never meant to
  // run, so the pre-commit script it now stands behind fails every time.
  it('ends a --quick run that passed with success, naming what only --full runs', () => {
    const quick = ['build', 'lint', 'conventions', 'harness', 'generated-content', 'secret-scan', 'unit', 'integration']
      .map((g) => `run_gate ${g} pass`).join('\n');
    const r = finish(quick, { full: false });
    expect(r.status, r.out).toBe(0);
    expect(r.fullReceipt).toBeNull();
    expect(r.out).toContain('--full runs');
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
  // (or drops the --full receipt through a SKIP row) on a commit that changed nothing.
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
    expect(at('\nsummarize\ndump_failures\nprint_notices\nprint_not_checked\nfinal_verdict\n')).toBeGreaterThan(-1);
    const verdict = RUNNER_TEXT.slice(at('final_verdict() {'));
    const body = verdict.slice(0, verdict.indexOf('\n}\n'));
    const guard = body.indexOf('assert_real_data_untouched');
    const oneTree = body.indexOf('assert_source_tree_unchanged');
    expect(guard).toBeGreaterThan(-1);
    expect(oneTree).toBeGreaterThan(guard);
    expect(body.indexOf('one or more gates FAILED')).toBeGreaterThan(oneTree);
  });

  it('prints the notices on the fail-fast exit too', () => {
    const failFast = RUNNER_TEXT.indexOf('print_notices\n      print_not_checked\n      assert_real_data_untouched\n      exit 1');
    expect(failFast).toBeGreaterThan(-1);
  });
});
