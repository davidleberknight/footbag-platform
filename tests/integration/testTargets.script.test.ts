/**
 * scripts/test-targets.sh — the mechanical target set for verifying a change.
 *
 * The helper turns a list of changed paths into the vitest files that exercise
 * them and the extra checks their kind needs. Each case runs it against real
 * repository paths and pins one mapping row: a row that silently returns
 * nothing sends a change to verification with no test run, and a row that
 * over-reaches turns the per-change loop back into the full suite.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { listFiles } from '../fixtures/sourceTree';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/test-targets.sh');

function run(args: string[], script = SCRIPT, cwd = process.cwd()) {
  const res = spawnSync('bash', [script, ...args], { cwd, encoding: 'utf8', ...SPAWN_GUARD });
  const stdout = res.stdout ?? '';
  const lines = stdout.split('\n');
  const vitestLine = lines.find((l) => l.startsWith('VITEST: ')) ?? '';
  return {
    status: res.status,
    stdout,
    stderr: res.stderr ?? '',
    tests: vitestLine ? vitestLine.replace('VITEST: npx vitest run --reporter=dot ', '').split(' ') : [],
    checks: lines.filter((l) => l.startsWith('CHECK: ')).map((l) => l.slice(7)),
    notes: lines.filter((l) => l.startsWith('NOTE: ')).map((l) => l.slice(6)),
  };
}

const CANARY = [
  'tests/integration/authorization-matrix.test.ts',
  'tests/integration/csrf.sweep.test.ts',
  'tests/integration/route-wiring.crawl.test.ts',
];

describe('test-targets.sh — argument guards', () => {
  it('refuses an unknown option rather than treating it as a path', () => {
    const r = run(['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown option '--nope'");
  });

  it('prints its usage, which says it runs no test', () => {
    const r = run(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Runs no test and changes nothing');
  });
});

describe('test-targets.sh — operator scripts', () => {
  it('maps a kebab script to its camelCase companion test and the conventions gate', () => {
    const r = run(['scripts/activate-payments.sh']);
    expect(r.tests).toContain('tests/integration/activatePayments.script.test.ts');
    expect(r.checks).toEqual(['bash scripts/ci/assert_conventions.sh']);
  });

  it('finds a companion test that keeps the kebab form', () => {
    const r = run(['scripts/deploy-cutover-guard.sh']);
    expect(r.tests).toContain('tests/integration/deploy-cutover-guard.script.test.ts');
  });

  it('reaches a shared library through the scripts that source it', () => {
    // No test names initial-admins.sh; deploy-rebuild.sh sources it, and only
    // its companion test proves the library still works there.
    const r = run(['scripts/lib/initial-admins.sh']);
    expect(r.tests).toContain('tests/integration/deployRebuildReleaseDir.script.test.ts');
  });

  it('defers a library most scripts source to the full gate instead of listing them all', () => {
    const r = run(['scripts/lib/aws-profile.sh']);
    expect(r.notes.join('\n')).toMatch(/aws-profile\.sh is sourced by \d+ scripts \(high fan-out\)/);
    expect(r.tests.length).toBeLessThanOrEqual(25);
  });
});

describe('test-targets.sh — application source', () => {
  it('maps a service no test names to the route suite of its domain', () => {
    const r = run(['src/services/hofService.ts']);
    expect(r.tests).toContain('tests/integration/hof-bap-index.routes.test.ts');
    expect(r.checks).toEqual(['npm run build', 'npm run typecheck:tests']);
  });

  it('maps a controller to its domain route suites without a longer sibling domain', () => {
    const r = run(['src/controllers/adminClubController.ts']);
    expect(r.tests).toContain('tests/integration/admin-clubs.routes.test.ts');
    expect(r.tests.filter((t) => t.includes('admin-club-cleanup'))).toEqual([]);
  });

  it('gives a high-fan-out module its canary sweeps and the full-gate note, not grep hits', () => {
    const r = run(['src/db/db.ts']);
    expect([...r.tests].sort()).toEqual(CANARY);
    expect(r.notes).toContain('src/db/db.ts is high fan-out; the full gate is needed at session end');
  });

  it('maps a page template to the suite named for it and the template conformance checks', () => {
    const r = run(['src/views/freestyle/add-analysis.hbs']);
    expect(r.tests).toContain('tests/integration/freestyle.add-analysis.routes.test.ts');
    expect(r.tests).toContain('tests/unit/template-no-nested-forms.test.ts');
    expect(r.tests.length).toBeLessThanOrEqual(25);
  });
});

describe('test-targets.sh — non-test checks and limits', () => {
  it('gives a harness change the harness checks and no vitest run', () => {
    const r = run(['.claude/rules/testing.md']);
    expect(r.tests).toEqual([]);
    expect(r.checks).toEqual([
      'bash scripts/ci/assert_claude_harness.sh',
      'bash scripts/ci/test_hooks.sh',
    ]);
  });

  it('verifies a document by re-reading it', () => {
    const r = run(['docs/TESTING.md']);
    expect(r.tests).toEqual([]);
    expect(r.notes).toEqual(['docs/TESTING.md: verify by re-reading']);
  });

  it('never targets the browser or staging smoke tiers', () => {
    const r = run(['tests/smoke/captcha.smoke.test.ts']);
    expect(r.tests).toEqual([]);
    expect(r.notes).toEqual(['tests/smoke/captcha.smoke.test.ts is checked only by the full gate']);
  });

  it('says so when it finds no tests rather than printing an empty pass', () => {
    const r = run(['nowhere/unmapped.txt']);
    expect(r.status).toBe(0);
    expect(r.tests).toEqual([]);
    expect(r.notes).toEqual(['no tests found for nowhere/unmapped.txt; name its suites by hand']);
  });

  it('flags a set over the budget instead of quietly running it', () => {
    const files = listFiles('tests/unit', /\.test\.ts$/).slice(0, 26).map((f) => `tests/unit/${f}`);
    expect(files).toHaveLength(26);
    const r = run(files);
    expect(r.tests).toHaveLength(26);
    expect(r.notes.join('\n')).toContain('over budget (26 files, budget 25)');
  });
});

describe('test-targets.sh — reading the working tree', () => {
  const repo = createScratchDir('test-targets-repo');
  afterAll(() => removeScratch(repo));

  it('maps modified and untracked files when given no paths', () => {
    mkdirSync(join(repo, 'scripts'), { recursive: true });
    mkdirSync(join(repo, 'tests/integration'), { recursive: true });
    copyFileSync(SCRIPT, join(repo, 'scripts/test-targets.sh'));
    writeFileSync(join(repo, 'scripts/foo-bar.sh'), 'echo one\n');
    writeFileSync(join(repo, 'tests/integration/fooBar.script.test.ts'), '// companion\n');
    const git = (...a: string[]) =>
      spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], {
        cwd: repo,
        encoding: 'utf8',
        ...SPAWN_GUARD,
      });
    expect(git('init', '-q').status).toBe(0);
    expect(git('add', '.').status).toBe(0);
    expect(git('commit', '-qm', 'base').status).toBe(0);

    appendFileSync(join(repo, 'scripts/foo-bar.sh'), 'echo two\n');
    writeFileSync(join(repo, 'scripts/brand-new.sh'), 'echo new\n');

    const r = run([], join(repo, 'scripts/test-targets.sh'), repo);
    expect(r.status).toBe(0);
    expect(r.tests).toEqual(['tests/integration/fooBar.script.test.ts']);
    expect(r.notes).toContain('no tests found for scripts/brand-new.sh; name its suites by hand');
  });
});
