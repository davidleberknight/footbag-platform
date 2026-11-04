/**
 * scripts/lib/closing-report.sh and scripts/lib/closing-report-remote.sh — the
 * one closing report every operator script ends with.
 *
 * The contract: every error and warning a run meets, whether the script found
 * it, a tool it ran printed it, or a remote half reported it, is listed in one
 * report at the end, and the exit status follows from that list. A problem shown
 * mid-stream and then followed by a success line is the failure this exists to
 * stop, so most cases here print a problem and then carry on to the end.
 *
 * Each case writes a small driver script that sources the library, runs it, and
 * reads the exit status and the report on stderr.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync, spawn } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const LIB = join(process.cwd(), 'scripts/lib/closing-report.sh');
const REMOTE_LIB = join(process.cwd(), 'scripts/lib/closing-report-remote.sh');

let scratch: string;

beforeEach(() => {
  scratch = createScratchDir('closing-report');
});

afterEach(() => {
  removeScratch(scratch);
});

interface RunResult { exitCode: number; stdout: string; stderr: string }

function driver(lines: string[], opts: { errexit?: boolean } = {}): string {
  const path = join(scratch, 'driver.sh');
  const head = opts.errexit === false ? 'set -uo pipefail' : 'set -euo pipefail';
  writeFileSync(path, ['#!/usr/bin/env bash', head, `source '${LIB}'`, ...lines, ''].join('\n'));
  return path;
}

function run(lines: string[], opts: { errexit?: boolean } = {}): RunResult {
  const res = spawnSync('bash', [driver(lines, opts)], { cwd: scratch, encoding: 'utf8', ...SPAWN_GUARD });
  return { exitCode: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** The report block: everything from the report heading to the end of stderr. */
function report(stderr: string): string {
  const at = stderr.lastIndexOf('Closing report');
  return at < 0 ? '' : stderr.slice(at);
}

describe('closing report: the verdict follows the problems', () => {
  it('fails a run that met an error and then carried on to the end', () => {
    // Defect caught: an operator reads a success line at the bottom of a run
    // that hit an error part way through.
    const res = run([
      'cr_error "the release file was unreadable"',
      'echo "all done"',
      'cr_finish',
    ]);
    expect(res.exitCode).toBe(1);
    expect(report(res.stderr)).toContain('the release file was unreadable');
  });

  it('passes a run that met only warnings, and still lists every one', () => {
    // Defect caught: a warning-only run either failing for nothing, or ending
    // with its warnings lost above the fold.
    const res = run([
      'cr_warn "first warning"',
      'cr_warn "second warning"',
      'cr_finish',
    ]);
    expect(res.exitCode).toBe(0);
    const r = report(res.stderr);
    expect(r).toContain('first warning');
    expect(r).toContain('second warning');
  });

  it('passes a clean run, with a report that lists nothing', () => {
    // Defect caught: a library that invents a problem on a clean run, which
    // would teach operators to ignore the report.
    const res = run(['cr_proved "the host runs the pinned release"', 'cr_finish']);
    expect(res.exitCode).toBe(0);
    expect(report(res.stderr)).toContain('the host runs the pinned release');
  });

  it('names what was proven and what was not in the closing lines', () => {
    // Defect caught: a closing line claiming an outcome nothing checked.
    const res = run([
      'cr_proved "containers healthy"',
      'cr_unproved "metrics publishing"',
      'cr_finish',
    ]);
    const r = report(res.stderr);
    const proven = r.indexOf('containers healthy');
    const unproven = r.indexOf('metrics publishing');
    expect(proven).toBeGreaterThan(-1);
    expect(unproven).toBeGreaterThan(-1);
    expect(r.slice(0, unproven)).toMatch(/not proven/i);
  });
});

describe('closing report: what the tools a script runs print', () => {
  it('harvests an error line from a command that still exits zero', () => {
    // Defect caught: a package manager printing a scriptlet error, exiting 0,
    // and the run reporting success with the error streamed past.
    const res = run([
      `cr_run "upgrade" -- bash -c 'echo "installing"; echo "Error: scriptlet failed for docker"; exit 0'`,
      'cr_finish',
    ]);
    expect(res.exitCode).toBe(1);
    expect(report(res.stderr)).toContain('scriptlet failed for docker');
    // The operator still sees the tool's own output as it runs.
    expect(res.stdout + res.stderr).toContain('installing');
  });

  it('harvests a warning line as a warning, leaving the run green', () => {
    // Defect caught: a tool's warning either failing the run or vanishing.
    const res = run([
      `cr_run "fetch" -- bash -c 'echo "WARNING: mirror slow"'`,
      'cr_finish',
    ]);
    expect(res.exitCode).toBe(0);
    expect(report(res.stderr)).toContain('mirror slow');
  });

  it('takes a caller grammar in place of the default one', () => {
    // Defect caught: a caller that knows its tool's error shape still getting
    // the default grammar, so a line only it recognises is dropped.
    const res = run([
      `cr_run --errors '^boom' --warnings '^meh' "tool" -- bash -c 'echo "boom here"; echo "meh there"; echo "ERROR: ignored by this grammar"'`,
      'cr_finish',
    ]);
    expect(res.exitCode).toBe(1);
    const r = report(res.stderr);
    expect(r).toContain('boom here');
    expect(r).toContain('meh there');
    expect(r).not.toContain('ignored by this grammar');
  });

  it('records a failed command as an error with its exit status and last line, and returns its status', () => {
    // Defect caught: a failed step reported with no message, or a caller unable
    // to branch on the failure because the wrapper swallowed it.
    const res = run([
      `cr_run "probe" -- bash -c 'echo "connection refused"; exit 7' || echo "caller saw $?"`,
      'cr_finish',
    ]);
    expect(res.exitCode).toBe(1);
    expect(res.stdout + res.stderr).toContain('caller saw 7');
    const r = report(res.stderr);
    expect(r).toContain('connection refused');
    expect(r).toMatch(/exit 7/);
  });

  it('runs a shell function, so a pipeline into ssh can be wrapped', () => {
    // Defect caught: the wire pattern's brace-group pipeline being impossible
    // to wrap, so remote output goes unharvested.
    const res = run([
      'send() { { printf "x\\n"; } | bash -c "cat >/dev/null; echo \\"Error: remote broke\\""; }',
      'cr_run "remote" -- send',
      'cr_finish',
    ]);
    expect(res.exitCode).toBe(1);
    expect(report(res.stderr)).toContain('remote broke');
  });

  it('reads a saved log the same way', () => {
    // Defect caught: output a script captured into a file (a status probe) never
    // being looked at for problems.
    const log = join(scratch, 'probe.log');
    writeFileSync(log, 'ok line\nWARNING: disk at 85%\n');
    const res = run([`cr_harvest "probe" '${log}'`, 'cr_finish']);
    expect(res.exitCode).toBe(0);
    expect(report(res.stderr)).toContain('disk at 85%');
  });
});

describe('closing report: expected failures', () => {
  it('turns a tolerated failure into a warning carrying the tool\'s own message', () => {
    // Defect caught: an expected failure swallowed with || true, so when it
    // fails for a different reason nobody learns why.
    const res = run([
      `cr_tolerate "optional probe" -- bash -c 'echo "no such unit: footbag-x" >&2; exit 4'`,
      'echo "carried on"',
      'cr_finish',
    ]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('carried on');
    expect(report(res.stderr)).toContain('no such unit: footbag-x');
  });

  it('records nothing for a tolerated step that succeeds', () => {
    // Defect caught: a warning for a step that did what it should.
    const res = run([`cr_tolerate "optional probe" -- true`, 'cr_finish']);
    expect(res.exitCode).toBe(0);
    expect(report(res.stderr)).not.toContain('optional probe');
  });
});

describe('closing report: a command whose output can carry a secret', () => {
  // The forms under test. A privileged ssh session's stream carries the sudo
  // password and the values its half needs, so none of what it prints may be
  // written down whole; only the lines its half marked are.
  const RUN = 'cr_run_marked';
  const TOLERATE = 'cr_tolerate_marked';

  /**
   * Driver lines that record every file under the library's temp directory
   * holding the secret: just before the library removes anything (an `rm` the
   * library calls finds this function first), and once more after the wrapped
   * call returns. Written to `found`, which a clean run leaves empty.
   */
  function watchTemp(found: string): string[] {
    return [
      `: > '${found}'`,
      `scan() { grep -rl -e 'SECRET-' "$(_cr_tmp)" >> '${found}' || [[ $? == 1 ]]; }`,
      'rm() { scan; command rm "$@"; }',
    ];
  }

  const BODY = 'echo "SECRET-OUT sudo-pass"; echo "SECRET-ERR one-time-pass" >&2; ' +
    'echo "---FOOTBAG-PROBLEM--- WARN pending reboot" >&2; echo "---FOOTBAG-PROBLEM--- ERROR unit failed" >&2';
  const SESSION = `bash -c '${BODY}'`;

  it('writes no line it did not mark to disk, on stdout or stderr, while still showing every line', () => {
    // Defect caught: the sudo password or a minted credential a session echoes
    // sitting in a log file under the temp area for the length of the run.
    const found = join(scratch, 'found');
    const res = run([...watchTemp(found), `${RUN} "install on host" -- ${SESSION} || true`, 'scan', 'cr_finish']);
    expect(readFileSync(found, 'utf8')).toBe('');
    // The operator still sees both lines as they are printed.
    expect(res.stdout).toContain('SECRET-OUT');
    expect(res.stderr).toContain('SECRET-ERR');
  });

  it('writes nothing unmarked to disk when a grammar is given, and harvests the lines it matches', () => {
    // Defect caught: a host half that reports in the ERROR: form having its
    // whole stream kept so the grammar can be applied afterwards.
    const found = join(scratch, 'found');
    const res = run([
      ...watchTemp(found),
      `${RUN} --errors '^ERROR:' --warnings '^WARN:' "host half" -- bash -c 'echo "SECRET-OUT x"; echo "WARN: disk low"; echo "SECRET-ERR y" >&2; echo "ERROR: env file missing" >&2' || true`,
      'scan',
      'cr_finish',
    ]);
    expect(readFileSync(found, 'utf8')).toBe('');
    expect(res.exitCode).toBe(1);
    const r = report(res.stderr);
    expect(r).toMatch(/Errors[^]*host half: ERROR: env file missing[^]*Warnings/);
    expect(r).toMatch(/Warnings[^]*host half: WARN: disk low/);
  });

  it('lists every marked line in the report and fails the run on a marked error', () => {
    // Defect caught: a half's marked error streamed past and the run ending on
    // a success line because the session itself exited zero.
    const res = run([`${RUN} "install on host" -- ${SESSION}`, 'cr_finish']);
    expect(res.exitCode).toBe(1);
    const r = report(res.stderr);
    expect(r).toMatch(/Errors \(1\)[^]*install on host: unit failed[^]*Warnings \(1\)[^]*install on host: pending reboot/);
  });

  it('passes stdout through alone, so a caller can redirect it and parse what the half printed', () => {
    // Defect caught: stderr or the marked lines mixed into a KEY=VALUE contract
    // the caller reads from stdout, or the contract swallowed.
    const out = join(scratch, 'out');
    const res = run([`${RUN} "pause" -- bash -c 'echo SWITCH_PAUSED=1; echo "noise" >&2; echo "---FOOTBAG-PROBLEM--- WARN slow" >&2' > '${out}'`, 'cr_finish']);
    expect(res.exitCode).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe('SWITCH_PAUSED=1\n');
    expect(res.stderr).toContain('noise');
    expect(report(res.stderr)).toContain('pause: slow');
  });

  it('returns the command\'s status and records a non-zero exit as an error naming it', () => {
    // Defect caught: a failed session reading as a clean one, or a caller that
    // branches on the status never seeing it.
    const res = run([`${RUN} "chain proof" -- bash -c 'exit 3' || echo "returned $?"`, 'cr_finish']);
    expect(res.stdout).toContain('returned 3');
    expect(res.exitCode).toBe(1);
    expect(report(res.stderr)).toMatch(/Errors[^]*chain proof: exit 3/);
  });

  it('returns zero and records nothing for a clean session', () => {
    // Defect caught: a clean session reported as a problem, which teaches the
    // operator to ignore the report.
    const res = run([`${RUN} "reachable" -- bash -c 'echo ok' && echo "returned $?"`, 'cr_finish']);
    expect(res.stdout).toContain('returned 0');
    expect(res.exitCode).toBe(0);
    expect(report(res.stderr)).not.toMatch(/Errors \(|Warnings \(/);
  });

  it('tolerates a failed session: its marked error and its exit are warnings, and it returns zero', () => {
    // Defect caught: a best-effort host step (a disk reclaim) failing the
    // deploy, or its failure vanishing from the report.
    const found = join(scratch, 'found');
    const res = run([...watchTemp(found), `${TOLERATE} "disk reclaim" -- bash -c '${BODY}; exit 2' && echo "returned $?"`, 'scan', 'cr_finish']);
    expect(readFileSync(found, 'utf8')).toBe('');
    expect(res.stdout).toContain('returned 0');
    expect(res.exitCode).toBe(0);
    const r = report(res.stderr);
    expect(r).not.toMatch(/Errors \(/);
    expect(r).toMatch(/Warnings \(3\)[^]*disk reclaim: pending reboot[^]*disk reclaim: unit failed[^]*disk reclaim: exit 2/);
  });

  it('lists a tolerated child script\'s errors as warnings', () => {
    // Defect caught: a child script's error failing a run that called it as a
    // best-effort step.
    const leaf = join(scratch, 'leaf.sh');
    writeFileSync(leaf, ['#!/usr/bin/env bash', 'set -euo pipefail', `source '${LIB}'`, 'cr_error "advisory host check failed"', 'cr_finish', ''].join('\n'));
    const res = run([`${TOLERATE} "advisory" -- bash '${leaf}'`, 'cr_finish']);
    expect(res.exitCode).toBe(0);
    expect(report(res.stderr)).toMatch(/Warnings[^]*leaf\.sh: advisory host check failed/);
  });

  it('keeps only the marked stdout lines a caller parses, passing every line through', () => {
    // Defect caught: a parse of the half's KEY lines that needs the whole
    // session written to a file first.
    const kept = join(scratch, 'kept');
    const res = run([
      `: > '${kept}'`,
      `printf '%s\\n' 'SECRET-OUT x' '---FOOTBAG-PREVIEW--- 12' '---FOOTBAG-LISTED---' '---FOOTBAG-PREVIEWX' | cr_keep_marked '${kept}'`,
      'cr_finish',
    ]);
    expect(res.exitCode).toBe(0);
    expect(readFileSync(kept, 'utf8')).toBe('---FOOTBAG-PREVIEW--- 12\n---FOOTBAG-LISTED---\n');
    expect(res.stdout).toBe('SECRET-OUT x\n---FOOTBAG-PREVIEW--- 12\n---FOOTBAG-LISTED---\n---FOOTBAG-PREVIEWX\n');
  });
});

describe('closing report: a run that stops early', () => {
  it('still prints the report, with the stop listed, and keeps the exit status', () => {
    // Defect caught: an early `exit` dropping the rows and problems the run had
    // already counted.
    const res = run([
      'cr_warn "counted before the stop"',
      'exit 3',
      'cr_finish',
    ]);
    expect(res.exitCode).toBe(3);
    const r = report(res.stderr);
    expect(r).toContain('counted before the stop');
    expect(r).toMatch(/exit 3/);
  });

  it('reports a set -e stop the same way', () => {
    // Defect caught: errexit ending the script with no report at all.
    const res = run(['cr_warn "before"', 'false', 'cr_finish']);
    expect(res.exitCode).toBe(1);
    expect(report(res.stderr)).toContain('before');
  });

  it('cr_die records the message and fails the run', () => {
    // Defect caught: a refusal that prints its reason and is then missing from
    // the report the operator reads.
    const res = run(['cr_die "staging is not at the pin"', 'echo "unreachable"']);
    expect(res.exitCode).toBe(1);
    expect(res.stdout).not.toContain('unreachable');
    expect(report(res.stderr)).toContain('staging is not at the pin');
  });
});

describe('closing report: cleanup', () => {
  it('runs every registered cleanup on a normal end, newest first', () => {
    // Defect caught: a temp file or held lock left behind by a successful run.
    const order = join(scratch, 'order');
    const res = run([
      `cr_cleanup bash -c 'echo first >> "${order}"'`,
      `cr_cleanup bash -c 'echo second >> "${order}"'`,
      'cr_finish',
    ]);
    expect(res.exitCode).toBe(0);
    expect(readFileSync(order, 'utf8')).toBe('second\nfirst\n');
  });

  it('runs cleanup on an early stop and lists a failing cleanup as a warning', () => {
    // Defect caught: a cleanup that failed silently, leaving state nobody knows
    // about.
    const marker = join(scratch, 'cleaned');
    const res = run([
      `cr_cleanup touch '${marker}'`,
      `cr_cleanup bash -c 'echo "could not release the lock" >&2; exit 1'`,
      'exit 2',
    ]);
    expect(res.exitCode).toBe(2);
    expect(existsSync(marker)).toBe(true);
    expect(report(res.stderr)).toContain('could not release the lock');
  });

  it('leaves no temp directory behind after commands it ran and harvested', () => {
    // Defect caught: every wrapped command leaving a directory in the temp area
    // that no exit ever removes, on every operator run.
    const tmp = join(scratch, 'tmp');
    mkdirSync(tmp);
    const path = driver([`cr_run "a" -- true`, `cr_tolerate "b" -- false`, `cr_run "c" -- true`, 'cr_finish']);
    const res = spawnSync('bash', [path], { cwd: scratch, encoding: 'utf8', env: { ...process.env, TMPDIR: tmp }, ...SPAWN_GUARD });
    expect(res.status).toBe(0);
    expect(readdirSync(tmp)).toEqual([]);
  });

  it('lists a problem a cleanup records, and fails the run on an error it records', () => {
    // Defect caught: a cleanup that knows the host was left stopped on purpose
    // having no way to say so in the report the operator reads.
    const res = run([
      'left_stopped() { cr_error "footbag.service is still stopped, deliberately"; }',
      'cr_cleanup left_stopped',
      'cr_finish',
    ]);
    expect(res.exitCode).toBe(1);
    expect(report(res.stderr)).toContain('footbag.service is still stopped, deliberately');
  });

  it('runs cleanup and reports on an interrupt, exiting 143 on TERM', async () => {
    // Defect caught: an operator's Ctrl-C or a killed session leaving the host
    // half-changed with no report of what the run had done.
    const marker = join(scratch, 'cleaned');
    const ready = join(scratch, 'ready');
    const path = driver([
      `cr_cleanup touch '${marker}'`,
      'cr_warn "met before the signal"',
      // The wait stands for a long remote step: a process that never ends on its
      // own, holding no output pipe, which the run's own cleanup ends.
      'tail -f /dev/null >/dev/null 2>&1 & pid=$!',
      'cr_cleanup kill "$pid"',
      `touch '${ready}'`,
      'wait "$pid"',
      'cr_finish',
    ]);
    const child = spawn('bash', [path], { cwd: scratch });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += String(d); });
    await new Promise<void>((resolve) => {
      const poll = setInterval(() => {
        if (existsSync(ready)) { clearInterval(poll); resolve(); }
      }, 20);
    });
    child.kill('SIGTERM');
    const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
    expect(code).toBe(143);
    expect(existsSync(marker)).toBe(true);
    expect(report(stderr)).toContain('met before the signal');
  });
});

describe('closing report: a script that runs another script', () => {
  /** A child script on the library, written beside the driver. */
  function child(name: string, lines: string[]): string {
    const path = join(scratch, name);
    writeFileSync(path, ['#!/usr/bin/env bash', 'set -euo pipefail', `source '${LIB}'`, ...lines, ''].join('\n'));
    return path;
  }

  it('lists a child\'s warning in the outermost report when the child is run directly', () => {
    // Defect caught: a deploy that runs a leaf script on the terminal, the leaf
    // warns, and the deploy's own report at the bottom says nothing about it.
    const leaf = child('leaf.sh', ['cr_warn "disk reclaim skipped"', 'cr_proved "release pinned"', 'cr_finish']);
    const res = run([`bash '${leaf}'`, 'cr_finish']);
    expect(res.exitCode).toBe(0);
    const r = report(res.stderr);
    expect(r).toContain('leaf.sh: disk reclaim skipped');
    expect(r).toContain('leaf.sh: release pinned');
    // Only the outermost run prints a full report.
    expect(res.stderr.split('Closing report').length - 1).toBe(1);
  });

  it('keeps a child\'s exit status, so the caller can still branch on it', () => {
    // Defect caught: a nested run reporting to its caller and exiting 0 over an
    // error, so the caller carries on past a failed step.
    const leaf = child('leaf.sh', ['cr_error "migration refused"', 'cr_finish']);
    const res = run([`bash '${leaf}' || echo "caller saw $?"`, 'cr_finish']);
    expect(res.stdout).toContain('caller saw 1');
    expect(res.exitCode).toBe(1);
    expect(report(res.stderr)).toContain('leaf.sh: migration refused');
  });

  it('lists a child\'s error once when the caller also wraps it in cr_run', () => {
    // Defect caught: the child's own error line matched again by the caller's
    // grammar, listing one problem twice.
    const leaf = child('leaf.sh', ['cr_error "schema gate refused"', 'cr_finish']);
    const res = run([`cr_run "leaf" -- bash '${leaf}' || true`, 'cr_finish']);
    expect(res.exitCode).toBe(1);
    expect(report(res.stderr).split('schema gate refused').length - 1).toBe(1);
  });

  it('reaches the outermost report from a grandchild', () => {
    // Defect caught: a problem two levels down stopping at the middle script,
    // which prints no full report of its own.
    const grand = child('grand.sh', ['cr_warn "zone mirror lagging"', 'cr_finish']);
    const middle = child('middle.sh', [`bash '${grand}'`, 'cr_finish']);
    const res = run([`bash '${middle}'`, 'cr_finish']);
    expect(report(res.stderr)).toContain('grand.sh: zone mirror lagging');
  });

  it('lists a tolerated child\'s errors as warnings', () => {
    // Defect caught: an advisory check run with cr_tolerate failing the whole
    // run through its own errors, or having them vanish.
    const leaf = child('leaf.sh', ['cr_error "advisory host check failed"', 'cr_finish']);
    const res = run([`cr_tolerate "advisory" -- bash '${leaf}'`, 'cr_finish']);
    expect(res.exitCode).toBe(0);
    expect(report(res.stderr)).toMatch(/Warnings[^]*leaf\.sh: advisory host check failed/);
  });

  it('prints a full report when the report variable names no file a parent run made', () => {
    // Defect caught: a value left exported in an operator's shell silencing every
    // run's report and sending its problems to a file nobody reads.
    const leaf = child('leaf.sh', ['cr_error "the gate refused"', 'cr_finish']);
    const stray = join(scratch, 'nobody-made-this');
    const res = spawnSync('bash', [leaf], { cwd: scratch, encoding: 'utf8', env: { ...process.env, FOOTBAG_CR_REPORT_TO: stray }, ...SPAWN_GUARD });
    expect(res.status).toBe(1);
    expect(report(res.stderr ?? '')).toContain('the gate refused');
    expect(existsSync(stray)).toBe(false);
  });

  it('prints a full report from a script run alone', () => {
    // Defect caught: a stale report variable inherited from nowhere making a
    // standalone run think it is nested and print no report.
    const leaf = child('leaf.sh', ['cr_warn "alone"', 'cr_finish']);
    const res = spawnSync('bash', [leaf], { cwd: scratch, encoding: 'utf8', ...SPAWN_GUARD });
    expect(report(res.stderr ?? '')).toContain('alone');
  });
});

describe('closing report: a deliberate non-zero end', () => {
  it('ends on the chosen status and verdict, listing no error, when nothing went wrong', () => {
    // Defect caught: a "pending" exit a caller branches on reading as FAILED
    // with an invented "stopped before the end" error, so the operator chases a
    // failure that is not there.
    const res = run(['cr_warn "waiting for the first sign-in"', 'cr_finish_with 3 PENDING']);
    expect(res.exitCode).toBe(3);
    const r = report(res.stderr);
    expect(r).toMatch(/VERDICT: PENDING/);
    expect(r).not.toMatch(/Errors \(/);
    expect(r).toContain('waiting for the first sign-in');
  });

  it('still reads FAILED when an error was recorded', () => {
    // Defect caught: a pending end hiding an error the run met.
    const res = run(['cr_error "the role could not be read"', 'cr_finish_with 3 PENDING']);
    expect(res.exitCode).toBe(3);
    expect(report(res.stderr)).toMatch(/VERDICT: FAILED/);
  });
});

describe('closing report: no temp directory', () => {
  it('refuses to start with the reason when no temp directory can be made', () => {
    // Defect caught: a run killed at its first line with no message at all,
    // because the library could not make its working directory.
    const path = driver(['cr_finish']);
    const res = spawnSync('bash', [path], { cwd: scratch, encoding: 'utf8', env: { ...process.env, TMPDIR: join(scratch, 'missing') }, ...SPAWN_GUARD });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/cannot start: no temp (directory|file) could be made \(TMPDIR=.*missing\)/);
  });
});

describe('closing report: the exit status a cleanup sees', () => {
  it('is zero on a finished run and the stop status on an early exit', () => {
    // Defect caught: an undo meant only for an interrupted run firing on every
    // run, because the cleanup cannot tell how the run ended.
    const seen = join(scratch, 'seen');
    const finished = run([`note() { cr_exit_status > '${seen}'; }`, 'cr_cleanup note', 'cr_finish']);
    expect(finished.exitCode).toBe(0);
    expect(readFileSync(seen, 'utf8')).toBe('0');
    const stopped = run([`note() { cr_exit_status > '${seen}'; }`, 'cr_cleanup note', 'exit 5']);
    expect(stopped.exitCode).toBe(5);
    expect(readFileSync(seen, 'utf8')).toBe('5');
  });

  it('is 143 when the run is terminated', async () => {
    // Defect caught: an interrupt-only undo that never fires because the
    // cleanup reads the status before the signal sets it.
    const seen = join(scratch, 'seen');
    const ready = join(scratch, 'ready');
    const path = driver([
      `note() { cr_exit_status > '${seen}'; }`,
      'cr_cleanup note',
      'tail -f /dev/null >/dev/null 2>&1 & pid=$!',
      'cr_cleanup kill "$pid"',
      `touch '${ready}'`,
      'wait "$pid"',
      'cr_finish',
    ]);
    const proc = spawn('bash', [path], { cwd: scratch });
    await new Promise<void>((resolve) => {
      const poll = setInterval(() => {
        if (existsSync(ready)) { clearInterval(poll); resolve(); }
      }, 20);
    });
    proc.kill('SIGTERM');
    const code = await new Promise<number | null>((resolve) => proc.on('close', resolve));
    expect(code).toBe(143);
    expect(readFileSync(seen, 'utf8')).toBe('143');
  });
});

describe('closing report: a remote half', () => {
  function remote(lines: string[]): RunResult {
    const path = join(scratch, 'remote.sh');
    writeFileSync(path, ['set -uo pipefail', ...lines, ''].join('\n'));
    // The wire pattern ships the library ahead of the body on one stream.
    const body = readFileSync(REMOTE_LIB, 'utf8') + '\n' + readFileSync(path, 'utf8');
    const res = spawnSync('bash', [], { input: body, cwd: scratch, encoding: 'utf8', ...SPAWN_GUARD });
    return { exitCode: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }

  it('marks its problems for the caller and exits non-zero on an error', () => {
    // Defect caught: a host-side error the caller never lists.
    const res = remote(['crr_warn "pending reboot"', 'crr_error "dnf left a transaction open"', 'crr_finish']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/---FOOTBAG-PROBLEM--- WARN pending reboot/);
    expect(res.stderr).toMatch(/---FOOTBAG-PROBLEM--- ERROR dnf left a transaction open/);
  });

  it('counts an error reported from inside a command substitution', () => {
    // Defect caught: a half whose probe reports from a $(...) subshell, so the
    // count is lost and it exits 0 over an error it printed.
    const res = remote(['probe() { crr_error "probe failed"; echo value; }', 'v="$(probe)"', 'crr_finish']);
    expect(res.exitCode).toBe(1);
  });

  it('leaves no error tally behind on the host when it stops before crr_finish', () => {
    // Defect caught: every remote half that fails under errexit or is killed
    // leaving a temp file in the host's temp area, run after run.
    const tmp = join(scratch, 'host-tmp');
    mkdirSync(tmp);
    const path = join(scratch, 'remote.sh');
    writeFileSync(path, ['set -euo pipefail', 'crr_error "first problem"', 'false', 'crr_finish', ''].join('\n'));
    const body = readFileSync(REMOTE_LIB, 'utf8') + '\n' + readFileSync(path, 'utf8');
    const res = spawnSync('bash', [], { input: body, cwd: scratch, encoding: 'utf8', env: { ...process.env, TMPDIR: tmp }, ...SPAWN_GUARD });
    expect(res.status).toBe(1);
    expect(readdirSync(tmp)).toEqual([]);
  });

  it('exits zero when it met only warnings', () => {
    // Defect caught: a remote warning failing the caller's run.
    const res = remote(['crr_warn "pending reboot"', 'crr_finish']);
    expect(res.exitCode).toBe(0);
  });

  it('harvests a tool it runs by the grammar it names', () => {
    // Defect caught: dnf's scriptlet warnings streamed past on the host and
    // never reaching the caller's report.
    const res = remote([
      `crr_run --errors '^Error' --warnings '^warning:' "dnf" -- bash -c 'echo "warning: scriptlet noisy"; echo "Error: rpmdb broken"'`,
      'crr_finish',
    ]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/---FOOTBAG-PROBLEM--- WARN dnf: warning: scriptlet noisy/);
    expect(res.stderr).toMatch(/---FOOTBAG-PROBLEM--- ERROR dnf: Error: rpmdb broken/);
  });

  it('is listed in the caller\'s report, each problem once, by what it marked', () => {
    // Defect caught: a caller that trusts the remote printed its own report and
    // ends on its own success line; or one that double-counts the marked line
    // through its grammar.
    const half = join(scratch, 'half.sh');
    writeFileSync(half, ['set -uo pipefail', 'crr_error "service failed to start"', 'crr_warn "Error-shaped words in a warning"', 'crr_finish', ''].join('\n'));
    const res = run([
      `send() { cat '${REMOTE_LIB}' '${half}' | bash; }`,
      'cr_run --sentinels-only "remote half" -- send || true',
      'cr_finish',
    ]);
    expect(res.exitCode).toBe(1);
    const r = report(res.stderr);
    expect(r).toContain('service failed to start');
    expect(r).toContain('Error-shaped words in a warning');
    expect(r.split('service failed to start').length - 1).toBe(1);
  });

  it('feeds the caller\'s default grammar no second copy of a marked line', () => {
    // Defect caught: a warning a remote half marked being promoted to an error
    // because its text happens to match the caller's error grammar.
    const half = join(scratch, 'half.sh');
    writeFileSync(half, ['set -uo pipefail', 'crr_warn "ERROR-looking text that is a warning"', 'crr_finish', ''].join('\n'));
    const res = run([
      `send() { cat '${REMOTE_LIB}' '${half}' | bash; }`,
      'cr_run "remote half" -- send',
      'cr_finish',
    ]);
    expect(res.exitCode).toBe(0);
    expect(report(res.stderr)).toContain('ERROR-looking text that is a warning');
  });
});
