/**
 * The human-present guard never mistakes a capturing harness for an operator.
 *
 * `confirm_from_tty` is what stands between an unattended run and arming
 * production payments, pausing outbound mail, restoring a database, or writing a
 * deployed host's environment file. It asks "is a human here?" and everything
 * downstream trusts the answer.
 *
 * It answered that question by opening /dev/tty alone. A controlling terminal
 * outlives the redirection of a program's output, so a script spawned by a test
 * runner from a developer's shell still reaches their terminal through that
 * device even though its own stdout and stderr are pipes. The guard therefore
 * printed a prompt into the developer's session and blocked the suite waiting for
 * a keystroke, on scripts whose confirmation arms real money. Only a process with
 * no controlling terminal at all — CI — took the refusal path, which is why this
 * survived: the prompt branch was never exercised anywhere it could be seen.
 *
 * Two assertions, deliberately of different kinds. The behavioural one proves the
 * guard refuses and returns rather than waiting, and it is bounded so a
 * regression shows up as a failure rather than a hang. The textual one proves the
 * stream check is present, and it fails against the pre-fix helper in every
 * environment, including one with no controlling terminal where the behaviour is
 * identical before and after.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LIB = path.join(REPO_ROOT, 'scripts', 'lib', 'host-env-remote.sh');

function runConfirm(assumeYes: 'yes' | 'no'): { status: number | null; stderr: string } {
  // spawnSync always captures, so the child's stdout and stderr are pipes. When
  // the machine running the suite has a controlling terminal, this is exactly the
  // condition that used to produce a prompt.
  const res = spawnSync(
    'bash',
    // Assigned AFTER the source, which is the real calling convention: every
    // script sources this library first and parses its own --yes flag second.
    // The library assigns ASSUME_YES unconditionally, so a value set before the
    // source is deliberately overwritten -- that is what stops an exported one
    // deciding a confirmation.
    ['-c', `source "${LIB}"; ASSUME_YES=${assumeYes}; confirm_from_tty "apply? (yes/no): " yes`],
    { encoding: 'utf8', ...SPAWN_GUARD },
  );
  return { status: res.status, stderr: res.stderr ?? '' };
}

describe('confirm_from_tty: the human-present guard', () => {
  it('refuses instead of prompting when the streams are captured, and returns rather than waiting', () => {
    const res = runConfirm('no');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no terminal to confirm on');
  });

  it('still honours the explicit confirmation flag, so unattended callers have a sanctioned path', () => {
    const res = runConfirm('yes');
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('[--yes]');
  });

  it('decides on the standard streams and not on the terminal device alone', () => {
    const source = readFileSync(LIB, 'utf8');
    const guard = source.slice(source.indexOf('confirm_from_tty() {'));
    // Opening /dev/tty is necessary but not sufficient: it succeeds inside a
    // harness whose output is captured. The stream test is what makes the
    // refusal deterministic there.
    expect(guard).toMatch(/!\s*-t\s*1/);
    expect(guard).toMatch(/!\s*-t\s*2/);
  });

  it('does not test stdin, which under the credential-pipe pattern carries the secret', () => {
    const source = readFileSync(LIB, 'utf8');
    const guard = source.slice(source.indexOf('confirm_from_tty() {'), source.indexOf('confirm_from_tty() {') + 900);
    expect(guard).not.toMatch(/-t\s*0/);
  });

  it('does not let the launching environment decide a confirmation', () => {
    // An exported ASSUME_YES=yes once accepted the typed confirmation on a
    // production apply, on arming live payments, and on restoring a database,
    // with no terminal involved and nothing printed to say so. The name is
    // generic enough for an unrelated tool to set it.
    //
    // The fix is here rather than in each caller. Every script used to have to
    // remember to clear the variable before sourcing, which is a convention no
    // test can enforce from outside and every new script can forget. Assigning
    // unconditionally in the library removes the class: a caller cannot inherit
    // what the library always overwrites.
    const lib = readFileSync(LIB, 'utf8');
    expect(lib).toMatch(/^ASSUME_YES="no"$/m);
    expect(
      lib,
      'the library must not default this from the environment; assign it unconditionally',
    ).not.toMatch(/ASSUME_YES="\$\{ASSUME_YES/);
  });

  it('overrides an exported value even for a caller that never clears it', () => {
    // The behavioural half of the assertion above, driven the way a real
    // operator shell would: the variable is exported into the child process.
    const res = spawnSync(
      'bash',
      ['-c', `source "${LIB}"; printf '%s' "$ASSUME_YES"`],
      { encoding: 'utf8', env: { ...process.env, ASSUME_YES: 'yes' }, ...SPAWN_GUARD },
    );
    expect(res.stdout).toBe('no');
  });

  it('still lets a caller opt in after sourcing, which is how --yes works', () => {
    const res = spawnSync(
      'bash',
      ['-c', `source "${LIB}"; ASSUME_YES="yes"; printf '%s' "$ASSUME_YES"`],
      { encoding: 'utf8', env: { ...process.env, ASSUME_YES: 'no' }, ...SPAWN_GUARD },
    );
    expect(res.stdout).toBe('yes');
  });
});
