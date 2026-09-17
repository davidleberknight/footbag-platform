/**
 * The harness self-check runs the hook fixture suite, and has to say what it said.
 *
 * `scripts/ci/test_hooks.sh` pipes synthetic tool events through each guard hook
 * and asserts the permission decision, printing nothing on success and one
 * self-contained line per failing fixture: which hook, which command, the decision
 * it wanted against the one it got. The harness gate ran it with both streams sent
 * to /dev/null and reported "hook fixture suite failed; run it directly for
 * detail", which discarded the diagnosis it was holding and asked the reader to
 * reproduce it by hand. On the local runner the harness gate is the only thing
 * that runs those fixtures, so there was no other copy of that output anywhere.
 *
 * The gate resolves its own root from its own location, so a fixture tree here is
 * a directory holding the real script at the same relative path next to a stub
 * suite. Every other check in the gate fails against such a tree, which is
 * expected and irrelevant: what is asserted is what reaches the reader about the
 * hook suite.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GATE_REL = path.join('scripts', 'ci', 'assert_claude_harness.sh');

/** A line only the stubbed fixture suite emits. */
const SUITE_SAID = 'STUB-HOOK-FIXTURE-FAILURE-MARKER';

const scratch = createScratchDir('harness-gate-hook-suite');

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function runGateWithStubSuite(label: string, suiteBody: string): string {
  const root = path.join(scratch, label);
  mkdirSync(path.join(root, 'scripts', 'ci'), { recursive: true });
  copyFileSync(path.join(REPO_ROOT, GATE_REL), path.join(root, GATE_REL));
  writeFileSync(path.join(root, 'scripts', 'ci', 'test_hooks.sh'), `#!/bin/bash\n${suiteBody}\n`, {
    mode: 0o755,
  });

  const r = spawnSync('bash', [path.join(root, GATE_REL)], {
    cwd: root,
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
}

describe('the harness gate: what a failing hook fixture suite tells the reader', () => {
  it('re-shows the suite output rather than discarding it', () => {
    const out = runGateWithStubSuite('failing', `echo "${SUITE_SAID}"\nexit 1`);

    expect(out).toContain('hook fixture suite');
    expect(
      out,
      'the suite named the failing fixture and the gate has to pass that on',
    ).toContain(SUITE_SAID);
  });

  it('carries output the suite wrote to stderr as well as stdout', () => {
    const out = runGateWithStubSuite('failing-stderr', `echo "${SUITE_SAID}" >&2\nexit 1`);
    expect(out).toContain(SUITE_SAID);
  });

  it('stays quiet about a suite that passed', () => {
    const out = runGateWithStubSuite('passing', `echo "${SUITE_SAID}"\nexit 0`);
    expect(out).toContain('hook fixture suite passes');
    expect(out, 'a green suite has nothing to report').not.toContain(SUITE_SAID);
  });
});
