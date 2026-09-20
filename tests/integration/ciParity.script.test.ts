/**
 * The gate that binds the continuous-integration workflow to the local runners.
 *
 * The promise it exists to keep is that a local full run fails whenever a push
 * would. That promise is carried in three places that drift independently: the
 * workflow's job list, the table mapping each job to a local gate, and the
 * runner's own list of gates whose absence makes a run refuse to call itself
 * green. Nothing held the third to the second, and the second could be satisfied
 * by a constant.
 *
 * Every case here stands up a throwaway repository holding real copies of the
 * four files the gate reads, plants one drift, and asserts the gate refuses it.
 * The point of the fixtures is that a refusal is demonstrated rather than
 * assumed: the mapping for the two database jobs pointed at a literal that
 * resolved whatever the clean room contained, so the clean room could have
 * stopped running the loader and this gate would have reported a pass. It did
 * exactly that when the case below was first written against the older checker.
 *
 * The gate's own run against this repository, in the convention gate and so in
 * the pre-PR script and the push gate, is what keeps these fixtures honest.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO = process.cwd();
const GATE_PATH = 'scripts/ci/check_ci_parity.sh';

/** The files the gate reads, copied from this repository into every fixture. */
const INPUTS = [
  '.github/workflows/ci.yml',
  'run_all_tests.sh',
  'package.json',
  'scripts/ci/run_clean_room.sh',
  GATE_PATH,
] as const;

type Mutation = Partial<Record<(typeof INPUTS)[number], (body: string) => string>>;

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Copies the real inputs into a throwaway repository, applies the given edits,
 * and runs the gate there. The gate resolves its root with git, so the fixture
 * has to be a repository rather than a bare directory.
 */
function inFixtureRepo(mutate: Mutation = {}): RunResult {
  const root = mkdtempSync(join(tmpdir(), 'footbag-test-ci-parity-'));
  try {
    spawnSync('git', ['init', '-q', root], { encoding: 'utf8', ...SPAWN_GUARD });
    for (const rel of INPUTS) {
      const body = readFileSync(join(REPO, rel), 'utf8');
      const full = join(root, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, mutate[rel] ? mutate[rel]!(body) : body);
    }
    const res = spawnSync('bash', [join(root, GATE_PATH)], {
      cwd: root,
      encoding: 'utf8',
      ...SPAWN_GUARD,
    });
    return { exitCode: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Asserts the edit actually landed, so a fixture cannot pass by changing nothing. */
function replaceOnce(needle: string, replacement: string) {
  return (body: string): string => {
    expect(body, `fixture anchor not found: ${needle}`).toContain(needle);
    return body.replace(needle, replacement);
  };
}

describe('the parity gate against this repository', () => {
  it('passes, and reports a scope covering both jobs and invoked commands', () => {
    const res = inFixtureRepo();
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stdout).toMatch(/\[ci-parity\] pass \(\d+ workflow jobs and \d+ invoked commands/);

    const jobs = Number(/pass \((\d+) workflow jobs/.exec(res.stdout)?.[1] ?? '0');
    const commands = Number(/and (\d+) invoked commands/.exec(res.stdout)?.[1] ?? '0');
    expect(jobs).toBeGreaterThan(10);
    expect(commands).toBeGreaterThan(10);
  });
});

describe('a job the local runners do not cover', () => {
  it('refuses a workflow job that no table maps', () => {
    const res = inFixtureRepo({
      '.github/workflows/ci.yml': (body) =>
        `${body}\n  brand-new-job:\n    name: Brand new\n    runs-on: ubuntu-latest\n    steps:\n      - name: Do it\n        run: npm run lint\n`,
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("workflow job 'brand-new-job' has no local gate");
  });

  it('refuses a mapping naming a job the workflow no longer has', () => {
    const res = inFixtureRepo({
      '.github/workflows/ci.yml': replaceOnce('\n  lint:\n', '\n  lint-renamed:\n'),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('is mapped here but is no longer a job');
  });

  it('refuses a claimed local gate that no runner registers', () => {
    // The case the older checker could not fail: the two database jobs were
    // mapped onto a constant, so the clean room could stop running the loader
    // and the mapping still resolved.
    const res = inFixtureRepo({
      'scripts/ci/run_clean_room.sh': replaceOnce(
        'gate db-load-smoke ',
        'gate removed-db-load-smoke ',
      ),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("claims local gate 'db-load-smoke', which no runner registers");
  });
});

describe("the runner's own list of gates that stand for a push-gate job", () => {
  // run_all_tests.sh refuses to report green when one of these did not run.
  // A name missing from it is a gate whose absence goes unnoticed; a name too
  // many holds the run to something the push gate never does.
  it('refuses a gate that stands for a push-gate job but is absent from the list', () => {
    const res = inFixtureRepo({
      'run_all_tests.sh': replaceOnce(' generated-content secret-scan', ' secret-scan'),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("gate 'generated-content' stands for a push-gate job");
  });

  it('refuses a listed gate that stands for no workflow job', () => {
    const res = inFixtureRepo({
      'run_all_tests.sh': replaceOnce(
        'PUSH_GATE_EQUIVALENTS="build ',
        'PUSH_GATE_EQUIVALENTS="ghost-gate build ',
      ),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("lists 'ghost-gate', which stands for no");
  });

  it('refuses a runner that declares no such list at all', () => {
    const res = inFixtureRepo({
      'run_all_tests.sh': replaceOnce('PUSH_GATE_EQUIVALENTS="', 'RENAMED_EQUIVALENTS="'),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('declares no PUSH_GATE_EQUIVALENTS');
  });
});

describe('step-level coverage, not merely job-level', () => {
  it('refuses a new run: step added to an already-mapped job', () => {
    // The job keeps its mapping and every job-level assertion stays green, so
    // this is the drift the job table cannot see.
    const res = inFixtureRepo({
      '.github/workflows/ci.yml': replaceOnce(
        '      - name: Run convention gate\n        run: bash scripts/ci/assert_conventions.sh\n',
        '      - name: Run convention gate\n        run: bash scripts/ci/assert_conventions.sh\n\n      - name: Run the new thing\n        run: bash scripts/ci/assert_new_thing.sh\n',
      ),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("the workflow runs 'scripts/ci/assert_new_thing.sh'");
  });

  it('refuses an npm script the workflow runs and no local runner does', () => {
    const res = inFixtureRepo({
      '.github/workflows/ci.yml': replaceOnce(
        '        run: npm run test:unit',
        '        run: npm run test:invented',
      ),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("the workflow runs 'npm run test:invented'");
  });

  it('is not satisfied by a comment naming a script the workflow never runs', () => {
    // Comments are stripped before anything is looked for, so a workflow cannot
    // claim a step it does not take, and a comment mentioning a script is not
    // read as an invocation of it.
    const res = inFixtureRepo({
      '.github/workflows/ci.yml': replaceOnce(
        '      - name: Run convention gate',
        '      # mentions scripts/ci/assert_never_run.sh and runs it not at all\n      - name: Run convention gate',
      ),
    });
    expect(res.exitCode, res.stderr).toBe(0);
  });
});

describe('the parity gate fails closed', () => {
  it('refuses to report a pass when it parsed no jobs at all', () => {
    const res = inFixtureRepo({
      '.github/workflows/ci.yml': () => 'name: nothing\non:\n  push:\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('parsed no jobs');
  });

  it('refuses to report a pass when it parsed no invoked commands at all', () => {
    const res = inFixtureRepo({
      // Every invoked repository script and npm script rewritten away, including
      // the ones inside a block scalar, which no `run:` line carries.
      '.github/workflows/ci.yml': (body) =>
        body
          .replace(/scripts\/[A-Za-z0-9_/.-]+\.(sh|py)/g, 'nothing-to-run')
          .replace(/npm run [a-z0-9:-]+/g, 'true'),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('parsed no invoked commands');
  });
});
