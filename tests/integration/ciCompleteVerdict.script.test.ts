/**
 * The required check's verdict: every job it waits for has to pass.
 *
 * `ci-complete` (shown on a pull request as "Type-check and test") is the job
 * branch protection requires. Its `needs:` list only sequences jobs — it makes
 * nothing required — so the job decides the verdict itself.
 *
 * It used to decide from a second hand-written list naming each job again, and
 * the two lists drifted twice. The first time, three jobs sat in `needs` and
 * nowhere else, so they ran, could go red, and left the tick green; a comment was
 * added asking the next person not to repeat it. The second time it was
 * `freestyle-db-integrity` and `legacy-pytest`, underneath that comment. Both
 * exist because their coverage was once silently absent, which is the worst
 * possible pair to have running non-blocking.
 *
 * So the verdict is now derived from `needs` itself, and this suite is what holds
 * that: it reads the real workflow, runs the real step body, and asserts that
 * every job in the list blocks. A job added to `needs` and forgotten is a failing
 * test rather than a green tick.
 *
 * The single exception is a job whose own `if:` restricts it to pull requests:
 * on a push it reports `skipped` through no fault of the code, and requiring
 * success would fail every push. That exception is asserted to be exactly what it
 * claims — the job really is pull-request-only — rather than trusted.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

type Step = { name?: string; env?: Record<string, string>; run?: string };
type Job = { needs?: string[]; if?: string; steps?: Step[] };

const workflow = parseYaml(
  readFileSync(path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8'),
) as { jobs: Record<string, Job> };

const ciComplete = workflow.jobs['ci-complete'];
const verdictStep = (ciComplete.steps ?? []).find((s) => s.name === 'Check results') as Step;

const NEEDED_JOBS = ciComplete.needs ?? [];
const PR_ONLY_JOBS = String(verdictStep.env?.PR_ONLY_JOBS ?? '')
  .split(',')
  .filter((s) => s.length > 0);
const BLOCKING_JOBS = NEEDED_JOBS.filter((j) => !PR_ONLY_JOBS.includes(j));

/** Every job succeeds, except the pull-request-only ones, which a push skips. */
function allGreenOnPush(): Record<string, string> {
  return Object.fromEntries(
    NEEDED_JOBS.map((j) => [j, PR_ONLY_JOBS.includes(j) ? 'skipped' : 'success']),
  );
}

/**
 * Run the step exactly as the runner would: the same shell body, the results fed
 * in through the same environment variable GitHub fills from `toJSON(needs)`.
 */
function runVerdict(
  results: Record<string, string>,
  event: string,
): { status: number | null; out: string } {
  const needsJson = JSON.stringify(
    Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { result: v }])),
  );
  const r = spawnSync('bash', ['-e', '-c', verdictStep.run ?? ''], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      NEEDS_JSON: needsJson,
      EVENT_NAME: event,
      PR_ONLY_JOBS: PR_ONLY_JOBS.join(','),
    },
    ...SPAWN_GUARD,
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

describe('ci-complete: the shape that makes the verdict testable at all', () => {
  it('waits on a non-empty job list and decides from a step with no workflow expressions in its body', () => {
    expect(NEEDED_JOBS.length).toBeGreaterThan(10);
    expect(verdictStep, 'the "Check results" step must exist').toBeTruthy();
    // Every value the step reads comes through `env:`. A `${{ }}` interpolated
    // into the body would be unrunnable here, and would be the return of the
    // hand-written per-job list this suite exists to prevent.
    expect(verdictStep.run).not.toContain('${{');
  });

  it('names as pull-request-only exactly those jobs that really are', () => {
    for (const job of PR_ONLY_JOBS) {
      expect(workflow.jobs[job], `${job} is named pull-request-only but is not a job`).toBeTruthy();
      expect(
        String(workflow.jobs[job].if ?? ''),
        `${job} is excused as pull-request-only, so its own if: must restrict it to pull requests`,
      ).toContain("github.event_name == 'pull_request'");
    }
  });
});

describe('ci-complete: every job in needs blocks', () => {
  it('passes when every job succeeded', () => {
    const { status, out } = runVerdict(allGreenOnPush(), 'push');
    expect(status, out).toBe(0);
    expect(out).toContain('every job succeeded');
  });

  it('prints the result of every job on a green run, not only on failure', () => {
    const { out } = runVerdict(allGreenOnPush(), 'push');
    for (const job of NEEDED_JOBS) expect(out).toContain(`${job}:`);
  });

  // The invariant, one case per job: this is what "in needs means blocking"
  // means, and it is why forgetting a job cannot be silent any more.
  it.each(BLOCKING_JOBS)('fails when %s failed and everything else passed', (job) => {
    const results = { ...allGreenOnPush(), [job]: 'failure' };
    const { status, out } = runVerdict(results, 'push');
    expect(status, out).toBe(1);
    expect(out).toContain(`${job}: failure`);
  });

  it.each(BLOCKING_JOBS)('fails when %s was skipped, which is not a pass', (job) => {
    const results = { ...allGreenOnPush(), [job]: 'skipped' };
    const { status, out } = runVerdict(results, 'push');
    expect(status, out).toBe(1);
    expect(out).toContain(`${job}: skipped`);
  });

  it('fails when a job was cancelled, which vouches for nothing', () => {
    const results = { ...allGreenOnPush(), [BLOCKING_JOBS[0]]: 'cancelled' };
    const { status, out } = runVerdict(results, 'push');
    expect(status, out).toBe(1);
    expect(out).toContain(`${BLOCKING_JOBS[0]}: cancelled`);
  });

  it('names only the jobs that failed, not the whole list', () => {
    const results = { ...allGreenOnPush(), [BLOCKING_JOBS[0]]: 'failure' };
    const { out } = runVerdict(results, 'push');
    const verdict = out.slice(out.indexOf('FAILED'));
    expect(verdict).toContain(BLOCKING_JOBS[0]);
    expect(verdict).not.toContain(BLOCKING_JOBS[1]);
  });
});

describe('ci-complete: the pull-request-only exception is narrow', () => {
  it.each(PR_ONLY_JOBS)('tolerates %s being skipped on a push, because its own if: skipped it', (job) => {
    const { status, out } = runVerdict({ ...allGreenOnPush(), [job]: 'skipped' }, 'push');
    expect(status, out).toBe(0);
  });

  it.each(PR_ONLY_JOBS)('requires %s to succeed on a pull request', (job) => {
    const results = Object.fromEntries(NEEDED_JOBS.map((j) => [j, 'success']));
    results[job] = 'skipped';
    const { status, out } = runVerdict(results, 'pull_request');
    expect(status, out).toBe(1);
    expect(out).toContain(`${job}: skipped`);
  });

  it.each(PR_ONLY_JOBS)('fails when %s actually failed, on either event', (job) => {
    for (const event of ['push', 'pull_request']) {
      const { status, out } = runVerdict({ ...allGreenOnPush(), [job]: 'failure' }, event);
      expect(status, `${event}: ${out}`).toBe(1);
      expect(out).toContain(`${job}: failure`);
    }
  });
});
