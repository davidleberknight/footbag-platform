/**
 * Three runners whose failure output cannot be exercised from a test, held to
 * their reporting contract by reading the scripts.
 *
 * Every other gate in this family is asserted by running it. These three cannot
 * be: the heavy pentest runner needs a booted application and a live target
 * before its first probe, the generated-content gate re-runs the freestyle
 * loaders against a built database, and the persona-crawl gate inside the local
 * runner boots the whole dev stack and then waits two minutes for it to fail. An
 * execution test for any of them costs more than the code it guards and is a
 * flake risk besides, so what is asserted here is the shape of the reporting,
 * which is what regressed in each case: a failure was detected and the reason for
 * it was thrown away.
 *
 * A text scan is a weaker assertion than a run, and it is honest about which one
 * it is. It catches the regression that actually happened — the output going back
 * to /dev/null, the tail being dropped, the guard moving back in front of the
 * report — and it does not prove the output is well formed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

describe('the local runner reports before it aborts on the real-data fingerprint', () => {
  const runner = read('run_all_tests.sh');

  // The fingerprint guard exits 2 the moment it trips, and what usually trips it
  // is an unrelated writer working alongside the run — a legacy mirror crawl
  // rewriting files for hours — rather than anything a gate did. Ahead of the
  // report it discarded the gate table and the tail of every failed gate.
  it.each([
    ['the end of a full run', runner.lastIndexOf('assert_real_data_untouched')],
    ['the fail-fast exit', runner.indexOf('assert_real_data_untouched\n      exit 1')],
  ])('summarizes and dumps failures before the guard runs, at %s', (_where, guardAt) => {
    expect(guardAt).toBeGreaterThan(-1);
    const before = runner.slice(0, guardAt);
    expect(before.lastIndexOf('summarize')).toBeGreaterThan(-1);
    expect(before.lastIndexOf('dump_failures')).toBeGreaterThan(-1);
  });
});

describe('the persona-crawl gate prints the dev stack log it holds', () => {
  const runner = read('run_all_tests.sh');

  it('tails the stack log instead of naming a path its own trap deletes', () => {
    const messageAt = runner.indexOf('dev stack did not become ready');
    expect(messageAt).toBeGreaterThan(-1);
    const failureBranch = runner.slice(messageAt, messageAt + 800);
    expect(failureBranch).toContain('tail -n 60 "${LOG_DIR}/persona-stack.log"');
    // The path alone was the whole message before, and LOG_DIR is removed on the
    // EXIT trap, so the reader was sent to a file that no longer existed.
    expect(failureBranch).toContain('(the stack produced no output at all)');
  });
});

describe('the heavy pentest runner names the probes that found something', () => {
  const runHeavy = read('scripts/pentest/run-heavy.sh');

  it('captures each probe output and re-shows the failing ones in its verdict', () => {
    expect(runHeavy).toContain('tee "${OUT_DIR}/${name}.probe.log"');
    expect(runHeavy).toContain('FAILED_PROBES+=("$name")');
    expect(runHeavy).toContain('Probes reporting findings: ${FAILED_PROBES[*]}');
    expect(runHeavy).toContain('tail -n 40 "${OUT_DIR}/${probe_name}.probe.log"');
  });

  it('keeps pipefail, without which a teed probe failure would be invisible', () => {
    // The probe now runs through a pipe. A pipeline reports its last command's
    // status, so without pipefail the verdict would read tee's success and every
    // finding would pass silently.
    expect(runHeavy).toMatch(/^set -euo pipefail$/m);
  });
});

describe('the generated-content gate prints what changed', () => {
  const gate = read('scripts/ci/assert_generated_content_current.sh');

  it('prints the diff itself, not only a summary of file names and line counts', () => {
    const failureBranch = gate.slice(gate.indexOf('a committed generated module is stale'));
    expect(failureBranch).toContain('git --no-pager diff --stat');
    // Inside the clean room the regenerated modules live in a worktree that is
    // deleted on the way out, so a diff not printed here cannot be recovered.
    expect(failureBranch).toContain('stale_diff="$(git --no-pager diff -- "${MODULES[@]}")"');
    expect(failureBranch).toContain('diff truncated at 20000 characters');
  });
});
