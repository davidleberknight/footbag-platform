/**
 * scripts/test-targets.sh — the mechanical target set for verifying a change.
 *
 * The helper turns a list of changed paths into the vitest files that exercise
 * them and the extra checks their kind needs. Each case runs it against real
 * repository paths and pins one mapping row: a row that silently returns
 * nothing sends a change to verification with no test run, and a row that
 * over-reaches turns the per-change loop back into the full suite.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { listFiles, scanSource } from '../fixtures/sourceTree';
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

const e2eCheck = (checks: string[]) => checks.find((c) => c.startsWith('npm run test:e2e -- ')) ?? '';

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
    const notNaming = r.tests.filter((f) => !readFileSync(join(process.cwd(), f), 'utf8').includes('aws-profile.sh'));
    expect(notNaming, 'companion tests of the sourcing scripts listed').toEqual([]);
  });

  it('reaches a library through a repository-root script that sources it', () => {
    // run_all_tests.sh sources the verdict banner from outside scripts/, and
    // its mode tests are what prove the banner still reads right there.
    const r = run(['scripts/lib/verdict-banner.sh']);
    expect(r.tests).toContain('tests/integration/runnerModes.script.test.ts');
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
    for (const f of CANARY) expect(r.tests, f).toContain(f);
    // Every other selection names the module by its path; a grep on the bare
    // name `db` would pull in most of the suite.
    const unrelated = r.tests
      .filter((f) => !CANARY.includes(f))
      .filter((f) => !readFileSync(join(process.cwd(), f), 'utf8').includes('src/db/db.ts'));
    expect(unrelated).toEqual([]);
    expect(r.notes).toContain('src/db/db.ts is high fan-out; the full gate is needed at session end');
  });

  it('reaches the suites guarding a high-fan-out file by its path', () => {
    // The schema's own parity checks name it by path and by no other word.
    const r = run(['database/schema.sql']);
    expect(r.tests).toContain('tests/integration/schemaMigrations.parity.test.ts');
    expect(r.tests).toContain('tests/integration/schemaBaseline.script.test.ts');
  });

  it('treats a document inside a high-fan-out directory as a document', () => {
    const r = run(['database/README.md']);
    expect(r.tests).toEqual([]);
    expect(r.checks).toEqual([]);
    expect(r.notes).toEqual(['database/README.md: verify by re-reading']);
  });

  it('maps a page template to the suite named for it and the template conformance checks', () => {
    const r = run(['src/views/freestyle/add-analysis.hbs']);
    expect(r.tests).toContain('tests/integration/freestyle.add-analysis.routes.test.ts');
    expect(r.tests).toContain('tests/unit/template-no-nested-forms.test.ts');
  });

  it('maps the stylesheet to the suites naming it as well as the template checks', () => {
    const r = run(['src/public/css/style.css']);
    expect(r.tests).toContain('tests/integration/asset-caching.routes.test.ts');
    expect(r.tests).toContain('tests/unit/template-class-vocabulary.test.ts');
  });

  it('maps a browser script to the suite naming it rather than reporting it untested', () => {
    const r = run(['src/public/js/video-facade.js']);
    expect(r.tests).toContain('tests/unit/videoFacade.test.ts');
    expect(r.notes).toEqual([]);
  });
});

/** Suites that request `path` as a quoted string, optionally with a query. */
function suitesRequesting(path: string, prefixOnly = false): string[] {
  const escaped = path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const pattern = new RegExp(prefixOnly ? `['"\`]${escaped}[^'"\`]` : `['"\`]${escaped}['"\`?]`);
  return scanSource(path, { roots: ['tests/unit', 'tests/integration'], exts: ['.ts'] })
    .filter((f) => f.endsWith('.test.ts'))
    .filter((f) => pattern.test(readFileSync(join(process.cwd(), f), 'utf8')));
}

describe('test-targets.sh — a page template reaches the suites requesting its route', () => {
  // Route suites reach a page by its URL and rarely name its template, so a
  // selector matching file names alone left most of a page's suites out and
  // reported a change green while those suites were red.
  let concepts: ReturnType<typeof run>;
  beforeAll(() => {
    concepts = run(['src/views/freestyle/concepts.hbs']);
  });

  it('selects every suite that requests the route a changed page template renders', () => {
    const expected = suitesRequesting('/freestyle/concepts');
    expect(expected.length).toBeGreaterThan(25);
    const missing = expected.filter((f) => !concepts.tests.includes(f));
    expect(missing, 'suites requesting /freestyle/concepts left out').toEqual([]);
  });

  it('includes the suites that request the page by URL but never name its template', () => {
    for (const f of [
      'tests/integration/freestyle.routes.test.ts',
      'tests/integration/freestyle.glossary-connective-panels.routes.test.ts',
    ]) {
      expect(concepts.tests, f).toContain(f);
    }
  });

  it('includes a suite that reads the template file directly rather than requesting the page', () => {
    const expected = scanSource('concepts.hbs', { roots: ['tests/unit', 'tests/integration'], exts: ['.ts'] })
      .filter((f) => f.endsWith('.test.ts') && f !== 'tests/integration/testTargets.script.test.ts');
    expect(expected).toContain('tests/integration/concepts-difficulty-frontier.test.ts');
    const missing = expected.filter((f) => !concepts.tests.includes(f));
    expect(missing, 'suites naming concepts.hbs left out').toEqual([]);
  });

  it('prints the page suites as the set to run, with no advice to trim it', () => {
    expect(concepts.tests.length).toBeGreaterThan(25);
    expect(concepts.notes.filter((n) => /budget|re-target|trim/.test(n))).toEqual([]);
  });

  it('follows a parameterized route by its fixed prefix', () => {
    // /freestyle/sets/:slug renders the set detail page; its suites request
    // a concrete slug under /freestyle/sets/.
    const r = run(['src/views/freestyle/set-detail.hbs']);
    const expected = suitesRequesting('/freestyle/sets/', true);
    expect(expected.length).toBeGreaterThan(0);
    const missing = expected.filter((f) => !r.tests.includes(f));
    expect(missing, 'suites requesting a /freestyle/sets/ page left out').toEqual([]);
  });

  it('says so when a template cannot be traced to a route, rather than passing on file names quietly', () => {
    // The error page is rendered by the error handler, never by a route.
    const r = run(['src/views/errors/error.hbs']);
    expect(r.notes).toContain(
      'src/views/errors/error.hbs: no route found that renders it; suites chosen by file name only',
    );
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

  it('never targets the staging smoke tier', () => {
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

  it('prints every suite a large change reaches, with no advice to re-target', () => {
    // A selection cut down to a fixed size leaves suites out, and a change
    // verified on the remainder is reported green while the dropped ones fail.
    const files = listFiles('tests/unit', /\.test\.ts$/).slice(0, 40).map((f) => `tests/unit/${f}`);
    expect(files).toHaveLength(40);
    const r = run(files);
    expect([...r.tests].sort()).toEqual([...files].sort());
    expect(r.notes).toEqual([]);
  });
});

describe('test-targets.sh — browser specs and legacy pytest files', () => {
  // A change to a wizard template or a legacy module must reach the browser
  // spec or pytest file that drives it, not just a note deferring to the gate.

  it('runs a changed browser spec on its own', () => {
    const r = run(['tests/e2e/member-onboarding-legacy-claim.spec.ts']);
    expect(r.tests).toEqual([]);
    expect(e2eCheck(r.checks)).toBe('npm run test:e2e -- tests/e2e/member-onboarding-legacy-claim.spec.ts');
  });

  it('reaches the browser spec named for a wizard template', () => {
    const r = run(['src/views/register/wizard/legacy-claim.hbs']);
    expect(e2eCheck(r.checks)).toContain('tests/e2e/member-onboarding-legacy-claim.spec.ts');
  });

  it('never targets the deployed-site checks, which point at a live environment', () => {
    const r = run(['tests/e2e/deployed/deployed-browser.spec.ts']);
    expect(e2eCheck(r.checks)).toBe('');
    expect(r.notes).toEqual(['tests/e2e/deployed/deployed-browser.spec.ts is checked only by the full gate']);
  });

  it('reaches the pytest file naming a changed legacy module', () => {
    // The pipeline environment is machine-local: with it the file is a CHECK,
    // without it a NOTE naming the file. Either way it is not silently dropped.
    const r = run(['legacy_data/member_data_scripts/member_merge.py']);
    expect([...r.checks, ...r.notes].join('\n')).toContain('legacy_data/tests/test_member_merge.py');
  });

  it('reaches the pytest file naming a changed pipeline shell script', () => {
    const r = run(['legacy_data/member_data_scripts/run_legacy_members.sh']);
    expect([...r.checks, ...r.notes].join('\n')).toContain('legacy_data/tests/test_run_legacy_members_wiring.py');
  });

  it('gives a legacy test file the conventions gate, which refuses committed skips there', () => {
    const r = run(['legacy_data/tests/test_member_merge.py']);
    expect(r.checks).toContain('bash scripts/ci/assert_conventions.sh');
  });
});

describe('test-targets.sh — a schema change reaches the tests naming its tables', () => {
  const repo = createScratchDir('test-targets-schema');
  afterAll(() => removeScratch(repo));

  it('reaches every tier naming a dropped table, and nothing naming an untouched one', () => {
    for (const d of ['scripts', 'database', 'tests/e2e', 'tests/integration', 'legacy_data/tests']) {
      mkdirSync(join(repo, d), { recursive: true });
    }
    copyFileSync(SCRIPT, join(repo, 'scripts/test-targets.sh'));
    const schema = 'CREATE TABLE kept_table (\n  id TEXT\n);\nCREATE TABLE dropped_table (\n  id TEXT\n);\n';
    writeFileSync(join(repo, 'database/schema.sql'), schema);
    writeFileSync(join(repo, 'legacy_data/tests/test_dropped.py'), 'SQL = "SELECT 1 FROM dropped_table"\n');
    writeFileSync(join(repo, 'legacy_data/tests/test_kept.py'), 'SQL = "SELECT 1 FROM kept_table"\n');
    writeFileSync(join(repo, 'tests/e2e/dropped.spec.ts'), "const t = 'dropped_table';\n");
    writeFileSync(join(repo, 'tests/integration/dropped.test.ts'), "const t = 'dropped_table';\n");
    const git = (...a: string[]) =>
      spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], {
        cwd: repo,
        encoding: 'utf8',
        ...SPAWN_GUARD,
      });
    expect(git('init', '-q').status).toBe(0);
    expect(git('add', '.').status).toBe(0);
    expect(git('commit', '-qm', 'base').status).toBe(0);

    writeFileSync(join(repo, 'database/schema.sql'), 'CREATE TABLE kept_table (\n  id TEXT\n);\n');

    const r = run(['database/schema.sql'], join(repo, 'scripts/test-targets.sh'), repo);
    expect(r.status).toBe(0);
    expect(r.tests).toContain('tests/integration/dropped.test.ts');
    expect(e2eCheck(r.checks)).toBe('npm run test:e2e -- tests/e2e/dropped.spec.ts');
    // The scratch repository has no pipeline environment, so the pytest file
    // arrives in the note that says so.
    const pytestNote = r.notes.find((n) => n.startsWith('pytest files reached')) ?? '';
    expect(pytestNote).toContain('legacy_data/tests/test_dropped.py');
    expect(pytestNote).not.toContain('test_kept.py');
  });
});

describe('test-targets.sh — a test-data builder change reaches the suites calling it', () => {
  // A changed builder default reaches every suite building rows with it, in
  // files named for neither the builder file nor the suite's domain; only the
  // builder's name ties them together.
  const repo = createScratchDir('test-targets-builders');
  const builders = 'src/testkit/rowBuilders.ts';
  const base = [
    "import { x } from './x';",
    '',
    'function sharedDefault(): string {',
    "  return 'United States';",
    '}',
    '',
    'export function insertClub(o: { country?: string } = {}): string {',
    "  return o.country ?? 'USA';",
    '}',
    '',
    'export function insertEvent(): string {',
    '  return sharedDefault();',
    '}',
    '',
  ].join('\n');
  const git = (...a: string[]) =>
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], {
      cwd: repo,
      encoding: 'utf8',
      ...SPAWN_GUARD,
    });
  const targets = (content: string) => {
    writeFileSync(join(repo, builders), content);
    return run([builders], join(repo, 'scripts/test-targets.sh'), repo);
  };
  const fullGate = `${builders} is high fan-out; the full gate is needed at session end`;

  beforeAll(() => {
    for (const d of ['scripts', 'src/testkit', 'tests/integration']) mkdirSync(join(repo, d), { recursive: true });
    copyFileSync(SCRIPT, join(repo, 'scripts/test-targets.sh'));
    writeFileSync(join(repo, builders), base);
    writeFileSync(join(repo, 'tests/integration/admin-queue.routes.test.ts'), 'insertClub();\n');
    writeFileSync(join(repo, 'tests/integration/events.routes.test.ts'), 'insertEvent();\n');
    expect(git('init', '-q').status).toBe(0);
    expect(git('add', '.').status).toBe(0);
    expect(git('commit', '-qm', 'base').status).toBe(0);
  });
  afterAll(() => removeScratch(repo));

  it('selects the suites calling a changed builder, not those calling an untouched one, and needs no full gate', () => {
    const r = targets(base.replace("o.country ?? 'USA'", "o.country ?? 'United States'"));
    expect(r.status).toBe(0);
    expect(r.tests).toContain('tests/integration/admin-queue.routes.test.ts');
    expect(r.tests).not.toContain('tests/integration/events.routes.test.ts');
    expect(r.notes).not.toContain(fullGate);
  });

  // Each case below also changes a builder, so the suites calling it are
  // selected and only the unowned line decides that the full gate is needed.
  const builderChanged = base.replace("o.country ?? 'USA'", "o.country ?? 'United States'");

  it('defers to the full gate when the change also sits in a helper no exported builder owns', () => {
    // The helper feeds insertEvent here, but in general its callers cannot be
    // named from the diff, so the full gate is the only complete check.
    const r = targets(builderChanged.replace("  return 'United States';", "  return 'Canada';"));
    expect(r.tests).toContain('tests/integration/admin-queue.routes.test.ts');
    expect(r.notes).toContain(fullGate);
  });

  it('defers to the full gate when the change also touches an import, which belongs to no builder', () => {
    const r = targets(builderChanged.replace("import { x } from './x';", "import { y } from './y';"));
    expect(r.notes).toContain(fullGate);
  });

  it('reaches the suites still calling a builder the change removes', () => {
    const removed = base.replace(
      "export function insertEvent(): string {\n  return sharedDefault();\n}\n",
      '',
    );
    const r = targets(removed);
    expect(r.tests).toContain('tests/integration/events.routes.test.ts');
  });

  it('defers to the full gate when the file has no change to read', () => {
    const r = targets(base);
    expect(r.notes).toContain(fullGate);
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
